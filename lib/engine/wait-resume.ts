import type { BusinessProfile } from '@/lib/model/profile';
import type { SystemDefinition } from '@/lib/model/system';
import type { CanonicalEvent, TimelineEntry } from '@/lib/model/runtime';
import type { WaitIncidentRecord, WaitIncidentStore } from '@/lib/persistence/wait-incident-store';
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

export type WaitCheckOutcome = 'NOT_FOUND' | 'STILL_WAITING' | 'ELAPSED' | 'STALE_REVISION';

export interface WaitCheckResult {
  readonly incidentId: string;
  readonly outcome: WaitCheckOutcome;
  /** Present for STILL_WAITING and ELAPSED — the state and timeline the re-check produced. */
  readonly state?: EngineState;
  readonly entries?: readonly TimelineEntry[];
}

/**
 * Loads the persisted incident, applies exactly one re-evaluation event against it, and —
 * ONLY if the handler's own deterministic rule actually moved the lifecycle state —
 * resolves (removes) the persisted record.
 *
 * Whether the wait has elapsed is decided in exactly one place: the handler registered for
 * `deps.reevaluationEventType` (for Lead Rescue, `handleWaitReevaluation` in
 * `lib/engine/handlers/lead-rescue.ts`, implementing lr-t14). This function never
 * re-derives that answer — it only asks "did the lifecycle state move?" to decide whether
 * to resolve the record, which is what keeps the elapsed/not-elapsed judgment itself
 * single-sourced rather than duplicated between the handler and this orchestration layer.
 *
 * `STALE_REVISION` and the `NOT_FOUND` returned by a `resolve()` race are both safe,
 * expected no-ops from the caller's perspective — see `WaitIncidentStore.resolve`'s own
 * documentation for why a second racing or repeated call can never re-report `ELAPSED`.
 */
export async function checkWaitIncident(
  store: WaitIncidentStore,
  incidentId: string,
  nowIso: string,
  deps: WaitResumeDeps,
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

  const resolution = await store.resolve(incidentId, record.revision);
  if (resolution === 'STALE_REVISION') return { incidentId, outcome: 'STALE_REVISION' };
  if (resolution === 'NOT_FOUND') return { incidentId, outcome: 'NOT_FOUND' };

  return { incidentId, outcome: 'ELAPSED', state: result.state, entries: result.entries };
}

/** Convenience over `checkWaitIncident` for a full sweep. Sequential, not parallel — a file-backed store has no concurrent-write story, and a demo/prototype scheduler has no need of one. */
export async function checkAllWaitingIncidents(
  store: WaitIncidentStore,
  nowIso: string,
  deps: WaitResumeDeps,
): Promise<readonly WaitCheckResult[]> {
  const waiting = await store.listWaiting();
  const results: WaitCheckResult[] = [];
  for (const record of waiting) {
    results.push(await checkWaitIncident(store, record.incidentId, nowIso, deps));
  }
  return results;
}
