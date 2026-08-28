import type { BusinessProfile } from '@/lib/model/profile';
import type { SystemDefinition } from '@/lib/model/system';
import { GATE_HELD_ACTION } from '@/lib/model/profile';
import type { CanonicalEvent, SideEffect, TimelineEntry } from '@/lib/model/runtime';
import type { WaitIncidentRecord, WaitIncidentStore } from '@/lib/persistence/wait-incident-store';
import type { ClaimAttempt, OperationClaimRecord, OperationClaimStore } from '@/lib/persistence/operation-claim-store';
import { resolveSend, type SideEffectExecutor } from '@/lib/ports/side-effect-executor';
import {
  EXECUTION_JOURNAL_SCHEMA_VERSION,
  recordSafely,
  type ExecutionJournalRecorder,
  type JournalEvent,
} from '@/lib/persistence/execution-journal-store';
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
 * **What `applyEvent`'s `EXECUTED` actually means — traced, not assumed.** `resolveEffect`
 * (`lib/engine/reducer.ts`) has two paths for a proposed side effect that clears the
 * authority/policy gate: an execution-TRACKED path (`proposed.execution.kind === 'SEND'`)
 * that reads an already-resolved `SendOutcome` a pre-pass fetched from a real
 * `SideEffectExecutor`, and the plain path Lead Rescue's wait-elapsed notification actually
 * takes (`proposed.execution === undefined`) — `internals.effects.claim()` against a
 * PER-CALL, in-memory `SideEffectLedger`, then unconditionally `{status: 'EXECUTED'}`. That
 * second path performs no I/O, calls no executor, and has no effect observable outside the
 * returned data structure — confirmed by direct instrumentation, not inference, in
 * `tests/lead-rescue-wait-resume-execution-boundary.test.ts`. `applyEvent` is exactly what
 * its own docstring says: pure and synchronous. `EXECUTED` from that call is therefore a
 * PLAN — "the deterministic core has authorized this action" — never itself the action.
 *
 * **The actual observable execution boundary, if one exists, is HERE, not in `applyEvent`.**
 * `WaitResumeDeps.executor`, added this pass, is an OPTIONAL `SideEffectExecutor`
 * (`lib/ports/side-effect-executor.ts` — the same port every other live-send path in this
 * codebase already uses). When absent (every caller before this pass, and any caller that
 * doesn't need this), the plan IS the whole story: `EXECUTED` means "authorized, nothing
 * further attempted," and `executionMode: 'SIMULATED'` on the resulting `SideEffect` already
 * says so honestly, the same as everywhere else in this portfolio. When present, the claim
 * loop below invokes it exactly once per EXECUTED effect, and ONLY after that effect has
 * already won a durable, exclusive `OperationClaimStore` claim — never before. This ordering
 * (authorize → claim → invoke → confirm → resolve) is what makes "at most one observable
 * invocation across independent runtimes" a provable property rather than a hopeful one; see
 * `tests/lead-rescue-wait-resume-execution-boundary.test.ts`'s recording executor, which
 * asserts a durable claim already existed at the moment of every invocation it observed.
 *
 * **Why this lives here and not in `applyStep`.** `applyEvent`/`resolveEffect` are pure and
 * synchronous by design (`lib/engine/reducer.ts`'s own docstring: "no clock, no randomness,
 * ever"). An `OperationClaimStore.claim()` call and a `SideEffectExecutor.attemptSend()` call
 * are both async I/O — they cannot live inside the reducer without breaking that guarantee.
 * They also cannot run in the SAME kind of pre-pass `lib/engine/run.ts` uses for ordinary
 * SEND-tracked effects (`resolveExecutionAttempts`, always BEFORE `applyEvent`), because that
 * pre-pass needs to know in advance which effects a handler will propose — true for an
 * authored scenario's whole event list, false here: whether `handleWaitReevaluation` proposes
 * a notification at all depends on a runtime comparison (`occurredAt` vs `waitStartedAt`)
 * this function cannot and must not re-derive (see `checkWaitIncident`'s own docstring).
 * So the order here is necessarily POST-`applyEvent`: plan first (pure), then claim, invoke,
 * and confirm the plan's proposed effects (impure, orchestration-only) — the "genuine resume
 * boundary" this file's own name describes.
 *
 * **Effect-execution safety across independent runtimes.** `applyEvent` is called here with
 * a brand-new `SideEffectLedger`/`ExecutionLedger` PER CALL (`EngineInternals` below) — that
 * ledger has zero memory of any other `checkWaitIncident` call, so it cannot by itself stop
 * two overlapping calls from both computing `EXECUTED` for the same notification PLAN. The
 * `OperationClaimStore` gate below is what actually prevents that plan from being acted on
 * twice: every side effect `applyEvent` marked `EXECUTED` must win a durable, exclusive claim
 * on its own operation identity before this function trusts that status enough to invoke an
 * executor, return it, or resolve the incident record. A caller that loses the claim (or
 * finds it claimed-but-unconfirmed, the crash window) never invokes the executor and never
 * reports a second genuine `EXECUTED`; see `lib/persistence/operation-claim-store.ts` for
 * why, and `tests/lead-rescue-wait-resume-concurrency.test.ts` /
 * `tests/lead-rescue-wait-resume-execution-boundary.test.ts` for the falsifying tests that
 * drove and then verified this design.
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
  /**
   * Optional. When absent (every caller before this pass), a claim-winning EXECUTED effect
   * is confirmed immediately — the plan IS the whole story, honestly labelled `SIMULATED`.
   * When present, the claim-winning caller invokes `executor.attemptSend()` — genuinely
   * awaited, genuinely able to fail or return an uncertain outcome — AFTER winning the claim
   * and BEFORE confirming it. See the module docstring for why this cannot live inside
   * `applyEvent`, and `lead-rescue-wait-runtime.ts` for the SIMULATED (not live) instance
   * this portfolio's own demo wires in.
   */
  readonly executor?: SideEffectExecutor;
  /**
   * Optional, WRITE-ONLY observability — the recorder half of the execution journal and never
   * the reader half. Absent (every caller before this pass, and every existing test) records
   * nothing and changes nothing. Present, each of the three consequential boundaries below
   * emits exactly one observation per outcome.
   *
   * Nothing in this file ever reads the journal back, and it must stay that way: the moment a
   * resume, authority, or despatch decision consulted recorded history, that history would
   * have become business state under a different name. See
   * `lib/persistence/execution-journal-store.ts`.
   */
  readonly journal?: ExecutionJournalRecorder;
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

export type WaitCheckOutcome =
  | 'NOT_FOUND'
  | 'STILL_WAITING'
  | 'ELAPSED'
  /**
   * A configured window elapsed and a durable, exclusive claim confirmed an attention-only
   * NOTIFICATION — but, unlike ELAPSED, the lifecycle state did NOT move (see
   * `lib/engine/handlers/lead-rescue.ts`'s "ATTENTION TIMEOUT" section: the human-review and
   * ready-but-undespatched checks never set `transitionTo`). The incident stays parked,
   * unresolved — the underlying condition (nobody has acted) is still true, and the SAME
   * check remains eligible to run again, idempotently, until a genuine human decision or
   * dispatch resolves it.
   */
  | 'ATTENTION_OVERDUE'
  /**
   * A configured window was NOT measured, because execution is not authorized: a declared
   * external gate on the action is closed. Distinct from ATTENTION_OVERDUE in the one way that
   * matters to whoever reads the queue —
   *
   *   ATTENTION_OVERDUE  an AUTHORIZED obligation was not completed in time.
   *   ATTENTION_BLOCKED  execution is not authorized, because a declared dependency is unsatisfied.
   *
   * A firm holding a completed tax return for a signature it may not legally proceed without is
   * obeying a rule, not dropping a ball, and reporting the two identically was the defect. Like
   * ATTENTION_OVERDUE the lifecycle does not move and the same check stays eligible to run again.
   * Unlike it, nothing here is late: the action's clock never started. The dependency may have
   * its OWN clock and its own chase, which is a separate obligation and is reported separately.
   */
  | 'ATTENTION_BLOCKED'
  | 'STALE_REVISION'
  | 'UNCERTAIN';

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
 * propose more than one. Exported: `dispatchAuthorizedOffer`, below, reuses this exact
 * function rather than re-deriving "which effects need a durable claim" a second way.
 */
export function executedSideEffects(entries: readonly TimelineEntry[]): SideEffect[] {
  return entries.flatMap((entry) => entry.sideEffects).filter((effect) => effect.status === 'EXECUTED');
}

function freshInternals(): EngineInternals {
  return { effects: new SideEffectLedger(), events: new EventLedger(), executions: new ExecutionLedger() };
}

/**
 * Defensive copy into `WaitIncidentRecord`'s own (mutable-field) shape — the same copy
 * `parkWaitingIncident` already makes for its own caller, applied here for `applyHumanDecision`
 * and `dispatchAuthorizedOffer`'s re-parks, so a later mutation on `result.state` (there isn't
 * one today, but nothing here should rely on that) can never reach a persisted record.
 */
function toStoredEngineState(state: EngineState): WaitIncidentRecord['engineState'] {
  return {
    lifecycleState: state.lifecycleState,
    facts: { ...state.facts },
    suppressed: state.suppressed,
    awaitingHuman: state.awaitingHuman,
    missingInformation: [...state.missingInformation],
  };
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
export function operationClaimId(effect: SideEffect, record: WaitIncidentRecord): string {
  return `${effect.idempotencyKey}@rev${record.revision}`;
}

/**
 * Rewrites one EXECUTED side effect's status within a (deep-enough-to-mutate-safely) copy of
 * `entries`, without touching any other effect. `applyEvent`'s own computation is trusted
 * for every field except `status`/`detail` — the claim below is strictly a downgrade path,
 * never an upgrade, so nothing here can make an effect look MORE executed than the pure core
 * actually computed.
 */
export function downgradeEffect(
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
 * Attaches the RECEIVER'S OWN identifier for what it recorded, to the effect that earned it.
 *
 * A receipt you obtained and threw away is a receipt you do not have. When a real executor
 * succeeds it returns the counterparty's identifier — the only value that lets anyone later
 * point at the counterparty's record and check this delivery against a log this application
 * does not own. Before this existed, that identifier was resolved and dropped: the claim was
 * confirmed, the effect was EXECUTED, and the link between our record and theirs was gone. The
 * first remote capture is what surfaced it, by reporting `null` for a send that had genuinely
 * succeeded against a third-party system.
 *
 * DELIBERATELY SEPARATE FROM `downgradeEffect`, which documents itself as "strictly a downgrade
 * path, never an upgrade". Attaching provenance is a different operation with a different risk,
 * and folding it in would place an upgrade-shaped branch inside the one function documented as
 * unable to contain one. This annotates and does nothing else: it touches only `technical`,
 * only on an effect the pure core already marked `EXECUTED`, and can never alter `status`.
 */
export function attachExecutionReceipt(
  entries: readonly TimelineEntry[],
  idempotencyKey: string,
  receipt: { readonly provider: string; readonly attemptedAt: string; readonly externalId?: string },
): TimelineEntry[] {
  return entries.map((entry) => ({
    ...entry,
    sideEffects: entry.sideEffects.map((effect) =>
      effect.idempotencyKey === idempotencyKey && effect.status === 'EXECUTED'
        ? {
            ...effect,
            technical: {
              attempt: 1,
              provider: receipt.provider,
              attemptedAt: receipt.attemptedAt,
              outcomeKind: 'SUCCEEDED',
              // Never fabricated: an executor that returned no id is recorded as having
              // returned none, which is a different fact from not having been asked.
              ...(receipt.externalId === undefined ? {} : { externalId: receipt.externalId }),
              retrySafety: 'NOT_APPLICABLE' as const,
              verificationStatus: 'NOT_APPLICABLE' as const,
            },
          }
        : effect,
    ),
  }));
}

/**
 * Emits ONE observation. Awaited so a successful write is durable before the boundary
 * returns, but its result is always discarded — a dropped observation must never be able to
 * change what a boundary returns, and `recordSafely` guarantees it can never throw.
 *
 * Boundaries deliberately record NOTHING for a `NOT_FOUND` outcome: an attempt against a case
 * that does not exist has no `correlationId` and no `systemId` that could be read rather than
 * invented, and inventing them to make the history look complete is precisely the fabrication
 * this journal exists to avoid.
 */
async function observe(journal: ExecutionJournalRecorder | undefined, event: Omit<JournalEvent, 'schemaVersion'>): Promise<void> {
  await recordSafely(journal, { ...event, schemaVersion: EXECUTION_JOURNAL_SCHEMA_VERSION });
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

  /**
   * The DECISION observation, recorded ONLY when the evaluation was consequential.
   *
   * A sweep that correctly finds the window has not elapsed is deliberately NOT recorded. A
   * scheduled trigger runs on a timer, so recording every no-op evaluation would write a
   * per-tick heartbeat that buries the handful of events an operator actually needs — a log,
   * not a journal. The absence of a record between two consequential events therefore means
   * "nothing consequential happened", which is exactly what it should mean.
   */
  const observeEvaluation = (outcome: JournalEvent['outcome'], detail: string, failureClass?: JournalEvent['failureClass']) =>
    observe(deps.journal, {
      journalEventId: `${incidentId}:WAIT_EVALUATED:${outcome}:${nowIso}`,
      recordedAt: nowIso,
      systemId: record.systemId,
      incidentId,
      correlationId: record.correlationId,
      revision: record.revision,
      type: 'WAIT_EVALUATED',
      mechanism: 'DETERMINISTIC_RULE',
      outcome,
      detail,
      ...(failureClass === undefined ? {} : { failureClass }),
    });

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

  const internals = freshInternals();

  const result = applyEvent(record.engineState, event, {
    system: deps.system,
    profile: deps.profile,
    handlers: deps.handlers,
    judgments: new Map(),
    internals,
  });

  // Nothing to do: the lifecycle did not move AND nothing was proposed that needs a durable
  // claim. Neither condition alone is sufficient — a lifecycle move whose only proposed effect
  // is BLOCKED_BY_POLICY (never EXECUTED) still legitimately resolves the incident (see
  // `tests/lead-rescue-wait-resume-execution-boundary.test.ts`'s "authority-blocked effects"
  // case), and the new attention-timeout rules below propose an EXECUTED effect on elapse
  // while NEVER moving the lifecycle at all — a lifecycleState-only gate would have missed
  // that case entirely, and an effects-only gate would have missed the blocked-effect case.
  const lifecycleMoved = result.state.lifecycleState !== record.engineState.lifecycleState;
  const candidateEffects = executedSideEffects(result.entries);

  // Asked of the handler's own recorded decision, exactly as `lifecycleMoved` is asked of the
  // state: this module never re-derives whether a gate is closed, because two implementations of
  // that question would eventually disagree and the disagreement would surface as a case
  // reported late that the firm was forbidden to action.
  const heldByGate = result.entries
    .flatMap((entry) => entry.decisions)
    .some((decision) => decision.selectedAction === GATE_HELD_ACTION);

  if (!lifecycleMoved && candidateEffects.length === 0) {
    // A held case usually proposes nothing — there is no chase due yet — and would otherwise
    // fall out here as STILL_WAITING. That is not wrong so much as silent: it reports a case
    // nobody may action identically to one everybody is simply still waiting on, which is the
    // distinction this outcome exists to draw.
    if (heldByGate) {
      await observeEvaluation(
        'REFUSED',
        'Execution is not authorized: a declared external dependency is unsatisfied. Nothing was proposed and no window was measured, because there is no authorized obligation to measure.',
      );
      return { incidentId, outcome: 'ATTENTION_BLOCKED', state: result.state, entries: result.entries };
    }
    return { incidentId, outcome: 'STILL_WAITING', state: result.state, entries: result.entries };
  }

  // A candidate side effect was proposed and may have proposed side effects the reducer's own
  // (fresh, per-call) ledger marked EXECUTED. Before any of that is trusted, each one must win
  // a durable, exclusive claim on its own idempotencyKey — see the module docstring.
  let entries = result.entries;
  let blocking: OperationClaimRecord | undefined;

  for (const effect of executedSideEffects(result.entries)) {
    const operationId = operationClaimId(effect, record);
    const attempt: ClaimAttempt = await claimStore.claim(operationId, runtimeId, nowIso);

    if (attempt.decision === 'CLAIMED') {
      if (deps.executor === undefined) {
        // No executor configured: the plan is the whole story. Confirm immediately — this
        // is the exact prior behavior, unchanged for every caller that doesn't opt in.
        await claimStore.confirm(operationId, nowIso);
        continue;
      }

      // The one and only place this whole module invokes something observable — and it can
      // only be reached after the claim above already succeeded durably and exclusively.
      const resolved = await resolveSend(deps.executor, {
        attemptId: operationId,
        idempotencyKey: effect.idempotencyKey,
        provider: deps.executor.id,
        description: effect.description,
      });

      if (resolved.status === 'OK' && resolved.result.kind === 'SUCCEEDED') {
        await claimStore.confirm(operationId, nowIso);
        // Retain what the counterparty said it recorded. Status is unchanged — the pure core
        // already computed EXECUTED — but the link to their record is kept rather than dropped.
        entries = attachExecutionReceipt(entries, effect.idempotencyKey, {
          provider: deps.executor.id,
          attemptedAt: nowIso,
          ...(resolved.result.externalId === undefined ? {} : { externalId: resolved.result.externalId }),
        });
        continue;
      }

      // Anything else — FAILED_BEFORE_EFFECT, RATE_LIMITED, OUTCOME_UNKNOWN, a contract
      // violation, or an executor that threw — leaves the claim CLAIMED-but-unconfirmed and
      // this call reports UNCERTAIN below. Deliberately conservative rather than fast-pathing
      // a "definitely safe to retry" case: this build has no independent way to verify a
      // clean failure report actually reflects reality, and collapsing that distinction
      // would be exactly the "second unprotected notification" the task this pass implements
      // forbids. A future pass with a genuine verification channel (an independent
      // `attemptVerify`, a provider receipt) is where that nuance belongs.
      const detail =
        resolved.status === 'OK'
          ? `attemptSend on "${deps.executor.id}" returned ${resolved.result.kind}: ${'reason' in resolved.result ? resolved.result.reason : 'no further detail'}.`
          : `attemptSend on "${deps.executor.id}" could not be resolved (${resolved.status}): ${resolved.reason}.`;
      entries = downgradeEffect(
        entries,
        effect.idempotencyKey,
        'OUTCOME_UNKNOWN',
        `Idempotency key "${effect.idempotencyKey}" was durably claimed by this runtime but the observable executor did not confirm success. ${detail} Refusing to retry automatically.`,
      );
      blocking = await claimStore.load(operationId);
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
    await observeEvaluation(
      'OUTCOME_UNKNOWN',
      `A durable claim held by ${blocking.claimedBy} was never confirmed, so this evaluation cannot resolve the case.`,
    );
    return { incidentId, outcome: 'UNCERTAIN', state: result.state, entries, uncertainOperations: [blocking] };
  }

  // Every proposed effect is now durably confirmed (or a duplicate of an already-confirmed
  // one). Whether that means the wait genuinely ELAPSED (lr-t14/lr-t22 — resolve the incident,
  // the lifecycle moved and there is nothing left to wait for) or an attention condition is
  // merely ATTENTION_OVERDUE (the new review/dispatch timeouts — the incident stays parked,
  // still under review or still ready-but-undespatched, exactly as it was) is decided by
  // asking the ONE question this module always asks rather than re-deriving: did the handler's
  // own rule move the lifecycle state? Never guessed from the check's own outcome kind.
  if (lifecycleMoved) {
    const resolution = await store.resolve(incidentId, record.revision);
    if (resolution === 'STALE_REVISION') {
      await observeEvaluation(
        'REFUSED',
        'A concurrent caller resolved this case first; this evaluation changed nothing.',
        'STATE_TRANSITION_CONFLICT',
      );
      return { incidentId, outcome: 'STALE_REVISION', state: result.state, entries };
    }
    if (resolution === 'NOT_FOUND') return { incidentId, outcome: 'NOT_FOUND' };
    await observeEvaluation('RESOLVED', `The configured window elapsed; the case moved to ${result.state.lifecycleState}.`);
    return { incidentId, outcome: 'ELAPSED', state: result.state, entries };
  }

  if (heldByGate) {
    await observeEvaluation(
      'REFUSED',
      'Execution is not authorized: a declared external dependency is unsatisfied. The case stays parked and is NOT reported as overdue — no window was measured against it.',
      // Deliberately NO failure class. Every member of FAILURE_CLASSES names something going
      // wrong, and nothing has: the firm is declining to act because it is not permitted to.
      // Filing this under a failure mode would put correct behaviour in the failure register,
      // which is the same mislabelling as calling it overdue, one layer down.
    );
    return { incidentId, outcome: 'ATTENTION_BLOCKED', state: result.state, entries };
  }

  await observeEvaluation(
    'ESCALATED',
    'The attention window elapsed with nobody acting. The case stays parked and was raised to the next owner.',
    'HUMAN_APPROVAL_TIMEOUT',
  );
  return { incidentId, outcome: 'ATTENTION_OVERDUE', state: result.state, entries };
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

// ---------------------------------------------------------------------------
// HUMAN REVIEW: NEEDS_HUMAN / ESCALATED / SUPPRESSION_REVIEW -> a canonical disposition.
//
// A genuinely different boundary from the wait-elapsed one above, sharing the same store
// for the same reason `WaitIncidentRecord` was never wait-specific in its own type: it is
// the smallest snapshot that survives a process boundary, regardless of WHY an incident is
// parked. `store.park()` (not `parkWaitingIncident`, which exists specifically for the
// "already reached a genuinely waiting state" caller) is called directly by
// `parkReviewCase`-shaped callers — see `app/api/lead-rescue/wait-incidents/route.ts`'s
// `review` kind — for exactly this reason: a case under human review is not "waiting on a
// timer," so labelling it through the wait-specific wrapper would be dishonest. It IS every
// bit as durable as a genuinely waiting record — the underlying file and temp-then-rename
// guarantee do not care what lifecycle state a snapshot represents — the distinction that
// matters is semantic (what resumes it: a clock, or a person), not durability.
// ---------------------------------------------------------------------------

/**
 * Lifecycle states a `human.decision.recorded` event may legitimately be applied against
 * through this boundary. Not enforced by `handleHumanDecision` itself — that handler (shared
 * by every scenario and test in this system) applies unconditionally and lets the engine's
 * own transition-legality gate be the only check, correct for a one-shot scenario replay but
 * not sufficient for a LIVE, resubmittable interactive surface: a decision resubmitted after
 * the case already left one of these states would otherwise hit a self-loop
 * (`humanTarget()`'s `'CLEARED_TO_PROCEED' -> 'BOOKING_READY'` mapping, applied to a case
 * ALREADY in `BOOKING_READY`), which bypasses the engine's from/to legality check entirely
 * (self-loops are unconditionally accepted — see `lib/engine/reducer.ts`) and would silently
 * re-stamp `bookingReadyAt` a second time. This allowlist is that missing guard, added here
 * at the orchestration boundary rather than inside the shared handler.
 */
const UNDER_REVIEW_STATES = ['NEEDS_HUMAN', 'ESCALATED', 'SUPPRESSION_REVIEW'];

export type DecisionOutcome = 'NOT_FOUND' | 'STALE_REVISION' | 'NOT_UNDER_REVIEW' | 'REJECTED' | 'UNAUTHORIZED' | 'ACCEPTED';

export interface DecisionResult {
  readonly incidentId: string;
  readonly outcome: DecisionOutcome;
  /** Present except on NOT_FOUND: the record BEFORE this call for every rejected outcome, or the freshly re-parked one on ACCEPTED. */
  readonly record?: WaitIncidentRecord;
  readonly entries?: readonly TimelineEntry[];
}

/**
 * Applies one `human.decision.recorded` event against a case parked in one of
 * `UNDER_REVIEW_STATES`. On an authorized, canonically-accepted decision, re-parks the
 * resulting state — a genuinely new revision, exactly like every other re-park in this
 * module — and returns it. Every other outcome leaves the original record completely
 * untouched, so a caller can safely retry with corrected input.
 *
 * Reuses `applyEvent` and `handleHumanDecision` exactly as authored for scenario replay;
 * nothing about the pure handler changed to support this. The guards this function adds on
 * top of what the handler itself checks — the state allowlist above, the expected-revision
 * match, and treating the handler's OWN authority verification as gating rather than merely
 * informational — are additive safety appropriate to an interactive surface a person can
 * resubmit to, not a change to the handler every scenario and test already relies on.
 */
export async function applyHumanDecision(
  store: WaitIncidentStore,
  incidentId: string,
  expectedRevision: number,
  event: CanonicalEvent,
  deps: Pick<WaitResumeDeps, 'system' | 'profile' | 'handlers' | 'journal'>,
): Promise<DecisionResult> {
  const record = await store.load(incidentId);
  if (record === undefined) return { incidentId, outcome: 'NOT_FOUND' };

  const decidedBy = typeof event.payload['decidedBy'] === 'string' ? event.payload['decidedBy'] : undefined;
  /**
   * WHO exercised the role, when an authenticated boundary established it — distinct from the
   * role itself, which is WHAT authority was exercised. Attribution only: nothing here reads
   * it to make a decision, and an event without one (every caller before the authentication
   * boundary existed) still attributes to the role id exactly as it always did.
   */
  const decidedByPrincipalId =
    typeof event.payload['decidedByPrincipalId'] === 'string' ? event.payload['decidedByPrincipalId'] : undefined;
  const attributedActor = decidedByPrincipalId ?? decidedBy;

  /**
   * The AUTHORITY observation. Every outcome is recorded — including, especially, the
   * refusals: an operator asking "why did nothing go out?" is answered by the refusals, not
   * by the approval. Recording one never grants any: this runs strictly after the guard that
   * produced the outcome, and its result is discarded.
   */
  const observeDecision = (outcome: JournalEvent['outcome'], detail: string, failureClass?: JournalEvent['failureClass']) =>
    observe(deps.journal, {
      journalEventId: `${incidentId}:HUMAN_DECISION_RECORDED:${outcome}:${event.sourceEventId}`,
      recordedAt: event.occurredAt,
      systemId: record.systemId,
      incidentId,
      correlationId: record.correlationId,
      revision: record.revision,
      type: 'HUMAN_DECISION_RECORDED',
      mechanism: 'HUMAN_DECISION',
      outcome,
      detail,
      ...(attributedActor === undefined ? {} : { actorId: attributedActor }),
      ...(failureClass === undefined ? {} : { failureClass }),
    });

  if (record.revision !== expectedRevision) {
    await observeDecision(
      'REFUSED',
      `Decision submitted against revision ${expectedRevision} but the case is at revision ${record.revision}.`,
      'STATE_TRANSITION_CONFLICT',
    );
    return { incidentId, outcome: 'STALE_REVISION', record };
  }
  if (!UNDER_REVIEW_STATES.includes(record.engineState.lifecycleState)) {
    await observeDecision(
      'REFUSED',
      `Decision submitted while the case is in ${record.engineState.lifecycleState}, which is not under human review.`,
      'STATE_TRANSITION_CONFLICT',
    );
    return { incidentId, outcome: 'NOT_UNDER_REVIEW', record };
  }

  const result = applyEvent(record.engineState, event, {
    system: deps.system,
    profile: deps.profile,
    handlers: deps.handlers,
    judgments: new Map(),
    internals: freshInternals(),
  });

  const accepted = result.entries.flatMap((e) => e.transitions).some((t) => t.accepted);
  if (!accepted) {
    await observeDecision('REJECTED', 'No declared transition accepted this decision for the case’s current state.');
    return { incidentId, outcome: 'REJECTED', record, entries: result.entries };
  }

  const authorityCheck = result.entries.flatMap((e) => e.verifications).find((v) => v.check.includes('authority'));
  if (authorityCheck !== undefined && authorityCheck.result !== 'PASS') {
    await observeDecision(
      'REFUSED',
      'The submitted decision exceeded the deciding role’s configured authority ceiling.',
      'POLICY_VIOLATION',
    );
    return { incidentId, outcome: 'UNAUTHORIZED', record, entries: result.entries };
  }

  const reparked = await store.park({
    incidentId: record.incidentId,
    systemId: record.systemId,
    correlationId: record.correlationId,
    engineState: toStoredEngineState(result.state),
    // Provenance describes how this case genuinely entered the system, once — a re-park
    // (this function reuses that word deliberately) is a continuation of the SAME case, not
    // a new arrival, so this carries the original record's provenance forward unchanged
    // rather than dropping it. `undefined` for every case that never had one (all of them,
    // before the n8n ingress adapter existed) — never fabricated.
    ...(record.provenance === undefined ? {} : { provenance: record.provenance }),
  });
  await observeDecision(
    'ACCEPTED',
    `Authorized decision accepted; the case moved to ${result.state.lifecycleState}. Approval alone despatches nothing.`,
  );
  return { incidentId, outcome: 'ACCEPTED', record: reparked, entries: result.entries };
}

// ---------------------------------------------------------------------------
// OFFER DESPATCH: a claim-gated, genuinely observable prospect-facing send.
// ---------------------------------------------------------------------------

export type DispatchOutcome =
  | 'NOT_FOUND'
  | 'STALE_REVISION'
  | 'NOT_READY'
  | 'ALREADY_DISPATCHED'
  | 'REJECTED'
  /**
   * The despatching role does not hold sufficient authority. `handleOfferDespatched` has
   * ALWAYS computed this verification (`v-offer-despatch`, ceiling >= 2) — this orchestration
   * layer simply never read it, so the rule was declared and unenforced. Gating on it here is
   * the identical treatment `applyHumanDecision` already gives its own `v-human` check; no new
   * policy, no new threshold, and nothing about what an offer requires is decided in this file.
   */
  | 'UNAUTHORIZED'
  | 'CONFIRMED'
  | 'UNCERTAIN';

export interface DispatchResult {
  readonly incidentId: string;
  readonly outcome: DispatchOutcome;
  /** Present on CONFIRMED: the newly re-parked, now genuinely waiting (offerSentAt-bearing) record. */
  readonly record?: WaitIncidentRecord;
  readonly entries?: readonly TimelineEntry[];
  /** Present on UNCERTAIN: the durable claim record blocking automatic trust. */
  readonly uncertainOperation?: OperationClaimRecord;
}

/**
 * Applies one `lead.offer.despatched` event against a BOOKING_READY case with no offer sent
 * yet, through the IDENTICAL claim-then-invoke ordering `checkWaitIncident` already
 * established for lr-t14/lr-t22's own notification: plan (pure `applyEvent`), claim
 * (durable, exclusive), invoke the configured executor ONLY after the claim is won, confirm
 * only on genuine success.
 *
 * This is the fix for the false-positive risk this pass exists to close.
 * `handleOfferDespatched`'s own pure computation always includes `offerSentAt` in its plan —
 * the same "EXECUTED is a plan, not an action" discipline documented on `checkWaitIncident`,
 * above — but that plan is durably PERSISTED, and the offer-wait clock therefore actually
 * starts, ONLY once this function reaches CONFIRMED. An UNCERTAIN outcome leaves the original
 * record — still BOOKING_READY, still no `offerSentAt` — completely untouched: the incident
 * is not silently treated as sent or unsent, a human sees `UNCERTAIN` and decides what to do,
 * exactly the discipline `tests/lead-rescue-wait-resume-execution-boundary.test.ts` already
 * proved for lr-t14/lr-t22's own notification.
 *
 * The claim identity reuses `operationClaimId` unchanged — the SAME `${idempotencyKey}@rev${revision}`
 * scheme, not a second one invented for this newly-observable send. Two callers racing to
 * despatch the SAME BOOKING_READY cycle compute the SAME idempotencyKey (see
 * `handleOfferDespatched`'s own `bookingReadyAt`-keyed identity) against the SAME loaded
 * `revision`, so they collide on the SAME claim — the "at most one observable invocation"
 * guarantee, reusing the store rather than inventing a second locking mechanism. A caller
 * that discovers the claim was ALREADY_CONFIRMED by a concurrent winner reports
 * `ALREADY_DISPATCHED` and re-parks nothing itself, so the winner's own re-park is never
 * raced or duplicated.
 */
export async function dispatchAuthorizedOffer(
  store: WaitIncidentStore,
  claimStore: OperationClaimStore,
  incidentId: string,
  expectedRevision: number,
  event: CanonicalEvent,
  deps: WaitResumeDeps,
  runtimeId: string,
): Promise<DispatchResult> {
  const record = await store.load(incidentId);
  if (record === undefined) return { incidentId, outcome: 'NOT_FOUND' };

  /**
   * The ACTION observation — the one an operator asking "did anything actually go out?" reads
   * first. It records the executor that ran, the mode it ran in, and the durable claim that
   * governed it, so a real send and a simulated one are never presented as the same event.
   *
   * The `outcome` here is what was OBSERVED, which can legitimately be more specific than the
   * conservative position the business state takes. A confirmed `FAILED_BEFORE_EFFECT` from
   * the executor still leaves the case UNCERTAIN, because the durable claim was already taken
   * and this build has no independent verification channel to prove non-execution — the
   * journal records both facts rather than collapsing them into the weaker one.
   */
  const observeDispatch = (
    outcome: JournalEvent['outcome'],
    detail: string,
    extra: { operationClaimId?: string; failureClass?: JournalEvent['failureClass'] } = {},
  ) =>
    observe(deps.journal, {
      journalEventId: `${incidentId}:DISPATCH_ATTEMPTED:${outcome}:${extra.operationClaimId ?? event.sourceEventId}`,
      recordedAt: event.occurredAt,
      systemId: record.systemId,
      incidentId,
      correlationId: record.correlationId,
      revision: record.revision,
      type: 'DISPATCH_ATTEMPTED',
      mechanism: 'EXECUTION',
      outcome,
      detail,
      ...(deps.executor === undefined ? {} : { executionMode: deps.executor.mode, actorId: deps.executor.id }),
      ...(extra.operationClaimId === undefined ? {} : { operationClaimId: extra.operationClaimId }),
      ...(extra.failureClass === undefined ? {} : { failureClass: extra.failureClass }),
    });

  if (record.revision !== expectedRevision) {
    await observeDispatch(
      'REFUSED',
      `Despatch attempted against revision ${expectedRevision} but the case is at revision ${record.revision}.`,
      { failureClass: 'STATE_TRANSITION_CONFLICT' },
    );
    return { incidentId, outcome: 'STALE_REVISION', record };
  }
  if (record.engineState.lifecycleState !== 'BOOKING_READY') {
    await observeDispatch(
      'REFUSED',
      `Despatch attempted while the case is in ${record.engineState.lifecycleState}, which is not authorized to send.`,
      { failureClass: 'POLICY_VIOLATION' },
    );
    return { incidentId, outcome: 'NOT_READY', record };
  }
  if (record.engineState.facts['offerSentAt'] !== undefined) {
    await observeDispatch('SUPPRESSED_DUPLICATE', 'An offer was already recorded as sent for this cycle. Nothing was sent again.', {
      failureClass: 'RETRY_DUPLICATE_SIDE_EFFECT',
    });
    return { incidentId, outcome: 'ALREADY_DISPATCHED', record };
  }

  const result = applyEvent(record.engineState, event, {
    system: deps.system,
    profile: deps.profile,
    handlers: deps.handlers,
    judgments: new Map(),
    internals: freshInternals(),
  });

  // AUTHORITY BEFORE ANY CLAIM OR EXECUTOR CALL. Reads the handler's own already-computed
  // verification rather than re-deriving the rule, exactly as `applyHumanDecision` does.
  const authorityCheck = result.entries.flatMap((e) => e.verifications).find((v) => v.check.includes('authority'));
  if (authorityCheck !== undefined && authorityCheck.result !== 'PASS') {
    await observeDispatch(
      'REFUSED',
      'The despatching role does not hold sufficient authority to authorize a prospect-facing offer.',
      { failureClass: 'POLICY_VIOLATION' },
    );
    return { incidentId, outcome: 'UNAUTHORIZED', record, entries: result.entries };
  }

  const executed = executedSideEffects(result.entries);
  if (executed.length === 0) {
    await observeDispatch('REJECTED', 'The engine proposed no executable effect for this despatch event.');
    return { incidentId, outcome: 'REJECTED', record, entries: result.entries };
  }

  let entries = result.entries;
  let blocking: OperationClaimRecord | undefined;

  for (const effect of executed) {
    const operationId = operationClaimId(effect, record);
    const attempt: ClaimAttempt = await claimStore.claim(operationId, runtimeId, event.occurredAt);

    if (attempt.decision === 'ALREADY_CONFIRMED') {
      entries = downgradeEffect(
        entries,
        effect.idempotencyKey,
        'SUPPRESSED_DUPLICATE',
        `Idempotency key "${effect.idempotencyKey}" was already durably confirmed despatched by a concurrent caller (claimed by ${attempt.record.claimedBy} at ${attempt.record.claimedAt}). No second despatch occurred.`,
      );
      // The winner already re-parked the confirmed state; this caller must not also park,
      // which would duplicate or race that re-park under a different revision.
      await observeDispatch(
        'SUPPRESSED_DUPLICATE',
        `A prior confirmed claim already covers this despatch (claimed by ${attempt.record.claimedBy}). Nothing was sent again.`,
        { operationClaimId: operationId, failureClass: 'RETRY_DUPLICATE_SIDE_EFFECT' },
      );
      return { incidentId, outcome: 'ALREADY_DISPATCHED', entries };
    }

    if (attempt.decision === 'CLAIMED') {
      if (deps.executor === undefined) {
        await claimStore.confirm(operationId, event.occurredAt);
        await observeDispatch('EXECUTED', 'Claim confirmed with no executor configured; the plan is the whole story.', {
          operationClaimId: operationId,
        });
        continue;
      }

      // The one and only place this function invokes something observable — reachable only
      // after the claim above already succeeded durably and exclusively.
      const resolved = await resolveSend(deps.executor, {
        attemptId: operationId,
        idempotencyKey: effect.idempotencyKey,
        provider: deps.executor.id,
        description: effect.description,
      });

      if (resolved.status === 'OK' && resolved.result.kind === 'SUCCEEDED') {
        await claimStore.confirm(operationId, event.occurredAt);
        await observeDispatch('EXECUTED', 'The executor confirmed the send succeeded.', { operationClaimId: operationId });
        continue;
      }

      const detail =
        resolved.status === 'OK'
          ? `attemptSend on "${deps.executor.id}" returned ${resolved.result.kind}: ${'reason' in resolved.result ? resolved.result.reason : 'no further detail'}.`
          : `attemptSend on "${deps.executor.id}" could not be resolved (${resolved.status}): ${resolved.reason}.`;

      // What the executor OBSERVABLY reported, which is more specific than the conservative
      // position the business state is about to take. Confirmed non-execution and genuine
      // uncertainty are different operational facts and are recorded as different outcomes.
      const observedKind = resolved.status === 'OK' ? resolved.result.kind : 'UNRESOLVED';
      const held = 'The case is still held UNCERTAIN: the durable claim was already taken and nothing here can independently verify non-execution.';
      if (observedKind === 'FAILED_BEFORE_EFFECT') {
        await observeDispatch('FAILED_BEFORE_EFFECT', `The executor confirmed nothing was sent. ${held}`, {
          operationClaimId: operationId,
          failureClass: 'DOWNSTREAM_API_FAILURE',
        });
      } else if (observedKind === 'RATE_LIMITED') {
        await observeDispatch('FAILED_BEFORE_EFFECT', `The provider refused the attempt before any effect. ${held}`, {
          operationClaimId: operationId,
          failureClass: 'RATE_LIMITED',
        });
      } else {
        await observeDispatch('OUTCOME_UNKNOWN', 'The executor gave no confirmation either way. Whether the offer reached the prospect is genuinely unknown.', {
          operationClaimId: operationId,
        });
      }

      entries = downgradeEffect(
        entries,
        effect.idempotencyKey,
        'OUTCOME_UNKNOWN',
        `Idempotency key "${effect.idempotencyKey}" was durably claimed by this runtime but the observable executor did not confirm success. ${detail} Refusing to treat the offer as sent.`,
      );
      blocking = await claimStore.load(operationId);
      continue;
    }

    // UNCERTAIN: a claim exists but was never confirmed — a concurrent claimant still
    // mid-flight, or a crash between claiming and confirming. This caller must not despatch,
    // must not durably record offerSentAt, and must say so plainly.
    entries = downgradeEffect(
      entries,
      effect.idempotencyKey,
      'OUTCOME_UNKNOWN',
      `Idempotency key "${effect.idempotencyKey}" was claimed by ${attempt.record.claimedBy} at ${attempt.record.claimedAt} but never durably confirmed. Whether it despatched is genuinely unknown from here; refusing to treat the offer as sent.`,
    );
    await observeDispatch(
      'OUTCOME_UNKNOWN',
      `An unconfirmed claim by ${attempt.record.claimedBy} already exists. Whether the offer despatched is genuinely unknown from here.`,
      { operationClaimId: operationId },
    );
    blocking = attempt.record;
  }

  if (blocking !== undefined) {
    return { incidentId, outcome: 'UNCERTAIN', entries, uncertainOperation: blocking };
  }

  // Only now — every proposed effect durably confirmed — is offerSentAt persisted as
  // authoritative. A genuinely new wait cycle: a fresh revision, checkable by the completely
  // unmodified checkWaitIncident/handleOfferWaitReevaluation machinery from here on.
  const reparked = await store.park({
    incidentId: record.incidentId,
    systemId: record.systemId,
    correlationId: record.correlationId,
    engineState: toStoredEngineState(result.state),
    // Provenance describes how this case genuinely entered the system, once — a re-park
    // (this function reuses that word deliberately) is a continuation of the SAME case, not
    // a new arrival, so this carries the original record's provenance forward unchanged
    // rather than dropping it. `undefined` for every case that never had one (all of them,
    // before the n8n ingress adapter existed) — never fabricated.
    ...(record.provenance === undefined ? {} : { provenance: record.provenance }),
  });
  return { incidentId, outcome: 'CONFIRMED', record: reparked, entries };
}
