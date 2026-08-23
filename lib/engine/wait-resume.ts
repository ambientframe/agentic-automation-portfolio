import type { BusinessProfile } from '@/lib/model/profile';
import type { SystemDefinition } from '@/lib/model/system';
import type { CanonicalEvent, SideEffect, TimelineEntry } from '@/lib/model/runtime';
import type { WaitIncidentRecord, WaitIncidentStore } from '@/lib/persistence/wait-incident-store';
import type { ClaimAttempt, OperationClaimRecord, OperationClaimStore } from '@/lib/persistence/operation-claim-store';
import { applyEvent } from './reducer';
import { EventLedger, ExecutionLedger, SideEffectLedger } from './ledger';
import type { EngineInternals, EngineState, SystemHandlers } from './types';

/**
 * THE GENUINE RESUME BOUNDARY.
 *
 * `reduceScenario` (`lib/engine/run.ts`) always starts from `initialState` and folds a
 * whole, already-known event list in one call — correct for a scenario replay, wrong for
 * resuming a single incident that a wholly separate process parked earlier. `applyEvent`
 * (`lib/engine/reducer.ts`) already supports exactly what resume needs: an arbitrary
 * starting `EngineState` plus one new event. This file is the thin bridge between that
 * primitive and `WaitIncidentStore` — nothing here is new engine logic, and nothing in
 * `lib/engine/reducer.ts` or `lib/engine/run.ts` changed to support it.
 *
 * The one real clock read this codebase permits happens at the CALLER of `checkWaitIncident`
 * (a script or route handler), never here and never inside `applyEvent`. `nowIso` arrives
 * as an ordinary parameter, exactly like every other event's `occurredAt` — see
 * `lib/model/runtime.ts`'s own note on why that determinism guarantee matters.
 *
 * **Effect-execution safety across independent runtimes.** `applyEvent` is called here with
 * a brand-new `SideEffectLedger`/`ExecutionLedger` PER CALL (`EngineInternals` below) — that
 * ledger has zero memory of any other `checkWaitIncident` call, so it cannot by itself stop
 * two overlapping calls from both computing `EXECUTED` for the same notification. The
 * `OperationClaimStore` gate below is what actually prevents that: after `applyEvent`
 * computes its candidate result, every side effect it marked `EXECUTED` must win a durable,
 * exclusive claim on its own `idempotencyKey` before this function trusts that status enough
 * to return it — and before the incident record is resolved. A caller that loses the claim
 * (or finds it claimed-but-unconfirmed, the crash-window case) never sees a second genuine
 * `EXECUTED`; see `lib/persistence/operation-claim-store.ts` for why, and
 * `tests/lead-rescue-wait-resume-concurrency.test.ts` for the falsifying tests that drove
 * this design.
 */

export interface WaitResumeDeps {
  readonly system: SystemDefinition;
  readonly profile: BusinessProfile;
  readonly handlers: SystemHandlers;
  /**
   * The event type a re-check should raise, e.g. `'lead.wait.reevaluated'`. Not hardcoded
   * here: this module is generic over any system whose handler implements the same
   * "compare occurredAt against a fact recording when the wait began" shape.
   */
  readonly reevaluationEventType: string;
}

export interface ParkWaitingIncidentInput {
  readonly incidentId: string;
  readonly correlationId: string;
  /** Must already be in a genuinely waiting lifecycle state; this function does not check. */
  readonly engineState: EngineState;
}

/**
 * Persists the minimum snapshot a later, independent process needs to resume evaluation:
 * the entity's own `EngineState` at the moment it parked, copied defensively (never a
 * reference into caller-owned state) so a later mutation on the caller's side can never
 * silently corrupt the persisted record.
 */
export async function parkWaitingIncident(
  store: WaitIncidentStore,
  system: SystemDefinition,
  input: ParkWaitingIncidentInput,
): Promise<WaitIncidentRecord> {
  return store.park({
    incidentId: input.incidentId,
    systemId: system.id,
    correlationId: input.correlationId,
    engineState: {
      lifecycleState: input.engineState.lifecycleState,
      facts: { ...input.engineState.facts },
      suppressed: input.engineState.suppressed,
      awaitingHuman: input.engineState.awaitingHuman,
      missingInformation: [...input.engineState.missingInformation],
    },
  });
}

export type WaitCheckOutcome = 'NOT_FOUND' | 'STILL_WAITING' | 'ELAPSED' | 'STALE_REVISION' | 'UNCERTAIN';

export interface WaitCheckResult {
  readonly incidentId: string;
  readonly outcome: WaitCheckOutcome;
  /** Present for STILL_WAITING, ELAPSED and UNCERTAIN — the state and timeline the re-check produced. */
  readonly state?: EngineState;
  readonly entries?: readonly TimelineEntry[];
  /**
   * Present only for UNCERTAIN: the durable claim record(s) blocking automatic resolution —
   * an operator needs this to decide what actually happened before clearing it by hand.
   */
  readonly uncertainOperations?: readonly OperationClaimRecord[];
}

/**
 * Every side effect `applyEvent` marked EXECUTED, re-keyed by its own idempotencyKey. In
 * practice this is one entry for Lead Rescue's wait-elapsed notification, but nothing here
 * assumes exactly one — a future reuse of this same resume boundary (e.g. lr-t22) may
 * propose more than one.
 */
function executedSideEffects(entries: readonly TimelineEntry[]): SideEffect[] {
  return entries.flatMap((entry) => entry.sideEffects).filter((effect) => effect.status === 'EXECUTED');
}

/**
 * The identity a durable claim is keyed on. Deliberately NOT just `effect.idempotencyKey`:
 * that key is stable for the lifetime of one parked incident, but `WaitIncidentStore.park()`
 * allows a legitimate re-park of the same `incidentId` (e.g. a corrected engine state) —
 * see its own documentation. A re-park is a genuinely new wait cycle with its own
 * `revision`, and a notification that already fired and was confirmed for the FIRST cycle
 * must not permanently suppress a genuinely new one for the second. Folding in `revision`
 * (an existing identifier this store already carries specifically to distinguish re-parks,
 * never a clock read or a per-call value) keeps the claim identity stable across every
 * repeated or concurrent check of the SAME parked record, while still varying across
 * distinct wait cycles for the same incident — exactly the "stable business-operation
 * identity" the fix requires, without reaching for volatile timestamps or eventIds.
 */
function operationClaimId(effect: SideEffect, record: WaitIncidentRecord): string {
  return `${effect.idempotencyKey}@rev${record.revision}`;
}

/**
 * Rewrites one EXECUTED side effect's status within a (deep-enough-to-mutate-safely) copy of
 * `entries`, without touching any other effect. `applyEvent`'s own computation is trusted
 * for every field except `status`/`detail` — the claim below is strictly a downgrade path,
 * never an upgrade, so nothing here can make an effect look MORE executed than the pure core
 * actually computed.
 */
function downgradeEffect(
  entries: readonly TimelineEntry[],
  idempotencyKey: string,
  status: 'SUPPRESSED_DUPLICATE' | 'OUTCOME_UNKNOWN',
  detail: string,
): TimelineEntry[] {
  return entries.map((entry) => ({
    ...entry,
    sideEffects: entry.sideEffects.map((effect) =>
      effect.idempotencyKey === idempotencyKey && effect.status === 'EXECUTED' ? { ...effect, status, detail } : effect,
    ),
  }));
}

/**
 * Loads the persisted incident, applies exactly one re-evaluation event against it, and —
 * ONLY if the handler's own deterministic rule actually moved the lifecycle state, AND every
 * side effect it proposed to execute wins a durable, exclusive claim — resolves (removes)
 * the persisted record.
 *
 * Whether the wait has elapsed is decided in exactly one place: the handler registered for
 * `deps.reevaluationEventType` (for Lead Rescue, `handleWaitReevaluation` in
 * `lib/engine/handlers/lead-rescue.ts`, implementing lr-t14). This function never
 * re-derives that answer — it only asks "did the lifecycle state move?" to decide whether a
 * side effect needs a durable claim at all, which is what keeps the elapsed/not-elapsed
 * judgment itself single-sourced rather than duplicated between the handler and this
 * orchestration layer.
 *
 * `runtimeId` is opaque, caller-supplied identity for the claim record's `claimedBy` field —
 * purely for operator inspectability (which runtime/process holds a claim), never read to
 * make a safety decision.
 */
export async function checkWaitIncident(
  store: WaitIncidentStore,
  claimStore: OperationClaimStore,
  incidentId: string,
  nowIso: string,
  deps: WaitResumeDeps,
  runtimeId: string,
): Promise<WaitCheckResult> {
  const record = await store.load(incidentId);
  if (record === undefined) return { incidentId, outcome: 'NOT_FOUND' };

  const event: CanonicalEvent = {
    eventId: `${incidentId}:wait-check:${nowIso}`,
    correlationId: record.correlationId,
    entityId: incidentId,
    type: deps.reevaluationEventType,
    source: 'wait-scheduler',
    sourceEventId: `wait-check:${incidentId}:${nowIso}`,
    occurredAt: nowIso,
    receivedAt: nowIso,
    schemaVersion: 'wait-resume-1',
    actor: 'SYSTEM',
    executionMode: 'SIMULATED',
    payload: {},
  };

  const internals: EngineInternals = {
    effects: new SideEffectLedger(),
    events: new EventLedger(),
    executions: new ExecutionLedger(),
  };

  const result = applyEvent(record.engineState, event, {
    system: deps.system,
    profile: deps.profile,
    handlers: deps.handlers,
    judgments: new Map(),
    internals,
  });

  if (result.state.lifecycleState === record.engineState.lifecycleState) {
    return { incidentId, outcome: 'STILL_WAITING', state: result.state, entries: result.entries };
  }

  // The lifecycle moved and may have proposed side effects the reducer's own (fresh,
  // per-call) ledger marked EXECUTED. Before any of that is trusted, each one must win a
  // durable, exclusive claim on its own idempotencyKey — see the module docstring.
  let entries = result.entries;
  let blocking: OperationClaimRecord | undefined;

  for (const effect of executedSideEffects(result.entries)) {
    const operationId = operationClaimId(effect, record);
    const attempt: ClaimAttempt = await claimStore.claim(operationId, runtimeId, nowIso);

    if (attempt.decision === 'CLAIMED') {
      await claimStore.confirm(operationId, nowIso);
      continue;
    }

    if (attempt.decision === 'ALREADY_CONFIRMED') {
      entries = downgradeEffect(
        entries,
        effect.idempotencyKey,
        'SUPPRESSED_DUPLICATE',
        `Idempotency key "${effect.idempotencyKey}" was already durably confirmed executed by a prior claim (claimed by ${attempt.record.claimedBy} at ${attempt.record.claimedAt}). No second execution occurred.`,
      );
      continue;
    }

    // UNCERTAIN: a claim exists but was never confirmed — a concurrent claimant still
    // mid-flight, or a crash between claiming and confirming. Either way this call must not
    // execute, must not resolve the incident, and must say so plainly.
    entries = downgradeEffect(
      entries,
      effect.idempotencyKey,
      'OUTCOME_UNKNOWN',
      `Idempotency key "${effect.idempotencyKey}" was claimed by ${attempt.record.claimedBy} at ${attempt.record.claimedAt} but never durably confirmed. Whether it executed is genuinely unknown from here; refusing to retry automatically.`,
    );
    blocking = attempt.record;
  }

  if (blocking !== undefined) {
    return { incidentId, outcome: 'UNCERTAIN', state: result.state, entries, uncertainOperations: [blocking] };
  }

  const resolution = await store.resolve(incidentId, record.revision);
  if (resolution === 'STALE_REVISION') return { incidentId, outcome: 'STALE_REVISION', state: result.state, entries };
  if (resolution === 'NOT_FOUND') return { incidentId, outcome: 'NOT_FOUND' };

  return { incidentId, outcome: 'ELAPSED', state: result.state, entries };
}

/** Convenience over `checkWaitIncident` for a full sweep. Sequential, not parallel — a file-backed store has no concurrent-write story, and a demo/prototype scheduler has no need of one. */
export async function checkAllWaitingIncidents(
  store: WaitIncidentStore,
  claimStore: OperationClaimStore,
  nowIso: string,
  deps: WaitResumeDeps,
  runtimeId: string,
): Promise<readonly WaitCheckResult[]> {
  const waiting = await store.listWaiting();
  const results: WaitCheckResult[] = [];
  for (const record of waiting) {
    results.push(await checkWaitIncident(store, claimStore, record.incidentId, nowIso, deps, runtimeId));
  }
  return results;
}
