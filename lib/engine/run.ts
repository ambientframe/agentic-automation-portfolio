import { z } from 'zod';
import type { BusinessProfile } from '@/lib/model/profile';
import type { SystemDefinition } from '@/lib/model/system';
import type { CanonicalEvent, Scenario, TimelineEntry } from '@/lib/model/runtime';
import {
  resolveJudgment,
  type ClassificationRequest,
  type DecisionProvider,
  type ResolvedJudgment,
} from '@/lib/ports/decision-provider';
import { EventLedger, SideEffectLedger } from './ledger';
import { applyEvent } from './reducer';
import { initialState, type EngineRun, type EngineState, type SystemHandlers } from './types';

/**
 * TWO-PHASE EXECUTION.
 *
 * Phase 1 (async, impure): resolve every bounded judgment the scenario needs through
 * the DecisionProvider port. Today that port replays fixtures; later it may call a
 * model. Either way the I/O happens HERE, at the edge.
 *
 * Phase 2 (sync, pure): fold events through the reducer with judgments already in hand.
 *
 * Splitting them is what lets the port be honest about being async while the state
 * machine stays deterministic and replayable.
 */

/**
 * A bounded judgment request carried on the event that contains the ambiguous input.
 * The request travels with the input because that is where the ambiguity actually is.
 */
export const JudgmentRequestPayloadSchema = z.strictObject({
  judgmentId: z.string().min(1),
  objective: z.string().min(1),
  input: z.string().min(1),
  permittedClassifications: z.array(z.string().min(1)).min(2),
  requiredFields: z.array(z.string().min(1)),
});

export function extractJudgmentRequest(event: CanonicalEvent): ClassificationRequest | null {
  const raw = event.payload['judgment'];
  if (raw === undefined) return null;
  const parsed = JudgmentRequestPayloadSchema.safeParse(raw);
  if (!parsed.success) return null;
  return { ...parsed.data, correlationId: event.correlationId };
}

export interface RunDeps {
  readonly system: SystemDefinition;
  readonly profile: BusinessProfile;
  readonly handlers: SystemHandlers;
  readonly provider: DecisionProvider;
}

/** Phase 1. Walks the scenario in order and resolves each declared judgment once. */
export async function resolveJudgments(
  scenario: Scenario,
  provider: DecisionProvider,
): Promise<Map<string, ResolvedJudgment>> {
  const resolved = new Map<string, ResolvedJudgment>();
  for (const event of scenario.events) {
    const request = extractJudgmentRequest(event);
    if (request === null) continue;
    if (resolved.has(request.judgmentId)) continue;
    resolved.set(request.judgmentId, await resolveJudgment(provider, request));
  }
  return resolved;
}

/** Phase 2. Pure fold. Exported separately so tests can assert determinism directly. */
export function reduceScenario(
  scenario: Scenario,
  judgments: ReadonlyMap<string, ResolvedJudgment>,
  deps: Omit<RunDeps, 'provider'>,
): EngineRun {
  const internals = { effects: new SideEffectLedger(), events: new EventLedger() };
  const timeline: TimelineEntry[] = [];
  let state: EngineState = initialState(deps.handlers.initialState);

  for (const event of scenario.events) {
    const result = applyEvent(state, event, { ...deps, judgments, internals });
    state = result.state;
    timeline.push(...result.entries);
  }

  return {
    scenarioId: scenario.id,
    systemId: scenario.systemId,
    timeline,
    finalState: state,
    transitions: timeline.flatMap((e) => e.transitions),
    decisions: timeline.flatMap((e) => e.decisions),
    sideEffects: timeline.flatMap((e) => e.sideEffects),
    verifications: timeline.flatMap((e) => e.verifications),
    ledgerEntries: internals.effects.list().map((entry) => ({
      idempotencyKey: entry.idempotencyKey,
      sideEffectId: entry.sideEffectId,
    })),
  };
}

export async function runScenario(scenario: Scenario, deps: RunDeps): Promise<EngineRun> {
  const judgments = await resolveJudgments(scenario, deps.provider);
  return reduceScenario(scenario, judgments, {
    system: deps.system,
    profile: deps.profile,
    handlers: deps.handlers,
  });
}
