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
import {
  resolveExtraction,
  type ExtractionProvider,
  type ExtractionRequest,
  type ResolvedExtraction,
} from '@/lib/ports/extraction-provider';
import {
  resolveSend,
  resolveVerify,
  type ResolvedSend,
  type ResolvedVerify,
  type SendRequest,
  type SideEffectExecutor,
  type VerifyRequest,
} from '@/lib/ports/side-effect-executor';
import { EventLedger, ExecutionLedger, SideEffectLedger } from './ledger';
import { applyEvent, type ExecutionOutcomes } from './reducer';
import { initialState, type EngineRun, type EngineState, type SystemHandlers } from './types';

/**
 * TWO-PHASE EXECUTION.
 *
 * Phase 1 (async, impure): resolve every bounded judgment AND every provider send/verify
 * attempt the scenario needs, through their respective ports. Today those ports replay
 * fixtures; later they may call a model or a real provider. Either way the I/O happens
 * HERE, at the edge.
 *
 * Phase 2 (sync, pure): fold events through the reducer with everything already resolved.
 *
 * Splitting them is what lets both ports be honest about being async while the state
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

/**
 * Send/verify attempt requests carried on the event whose handler needs them. An event
 * may declare zero or more of each — the acknowledgement-with-uncertain-outcome scenario
 * declares one send; the reconciliation event that follows it declares one verify and one
 * retry send, since a single automated pass both checks and (if safe) acts on what it finds.
 */
// Non-strict deliberately: a handler may need a field on the same array entry that this
// pre-pass does not (e.g. the retry-despatch handler reads `target` off its send request).
// A strict schema here would silently drop a handler's own attempt — exactly the failure
// that shipped once during this feature's own development, caught only because the core
// reports an unresolved attemptId as a clear FAILED/OUTCOME_UNKNOWN rather than crashing.
const SendRequestPayloadSchema = z.object({
  attemptId: z.string().min(1),
  idempotencyKey: z.string().min(1),
  provider: z.string().min(1),
  description: z.string().min(1),
  /** Not read by the pre-pass or the executor — both only need `attemptId`. See above. */
  honorsIdempotencyKey: z.boolean(),
});
const VerifyRequestPayloadSchema = z.object({
  attemptId: z.string().min(1),
  targetIdempotencyKey: z.string().min(1),
  provider: z.string().min(1),
});

export function extractSendRequests(event: CanonicalEvent): SendRequest[] {
  const raw = event.payload['sendAttempts'];
  if (!Array.isArray(raw)) return [];
  return raw
    .map((r) => SendRequestPayloadSchema.safeParse(r))
    .filter((r): r is { success: true; data: z.infer<typeof SendRequestPayloadSchema> } => r.success)
    .map((r) => r.data);
}

export function extractVerifyRequests(event: CanonicalEvent): VerifyRequest[] {
  const raw = event.payload['verifyAttempts'];
  if (!Array.isArray(raw)) return [];
  return raw
    .map((r) => VerifyRequestPayloadSchema.safeParse(r))
    .filter((r): r is { success: true; data: z.infer<typeof VerifyRequestPayloadSchema> } => r.success)
    .map((r) => r.data);
}

/**
 * A structured-extraction request carried on the event whose payload it concerns. Uses
 * the `ExtractionProvider` port (`lib/ports/extraction-provider.ts`), not
 * `DecisionProvider` — see that file for why the two are not the same contract. Kept as
 * its own strict payload rather than folded into `JudgmentRequestPayloadSchema` because
 * the shapes genuinely differ: a classification request has no segments to cite.
 */
const TranscriptSegmentPayloadSchema = z.strictObject({
  id: z.string().min(1),
  speaker: z.string().min(1),
  text: z.string().min(1),
});

export const ExtractionRequestPayloadSchema = z.strictObject({
  judgmentId: z.string().min(1),
  objective: z.string().min(1),
  sourceArtifactId: z.string().min(1),
  segments: z.array(TranscriptSegmentPayloadSchema).min(1),
  requiredFields: z.array(z.string().min(1)),
});

export function extractExtractionRequest(event: CanonicalEvent): ExtractionRequest | null {
  const raw = event.payload['extraction'];
  if (raw === undefined) return null;
  const parsed = ExtractionRequestPayloadSchema.safeParse(raw);
  if (!parsed.success) return null;
  return { ...parsed.data, correlationId: event.correlationId };
}

export interface RunDeps {
  readonly system: SystemDefinition;
  readonly profile: BusinessProfile;
  readonly handlers: SystemHandlers;
  readonly provider: DecisionProvider;
  /** Only required when a scenario declares `sendAttempts` / `verifyAttempts`. */
  readonly executor?: SideEffectExecutor;
  /** Only required when a scenario declares an `extraction` request. Today, only Call-to-Proposal does. */
  readonly extractionProvider?: ExtractionProvider;
}

/** Phase 1a. Walks the scenario in order and resolves each declared judgment once. */
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

/**
 * Phase 1b. Resolves every declared send/verify attempt once. If a scenario declares none
 * (every scenario before this file existed), this returns empty maps and never touches
 * `executor` — so `executor` stays genuinely optional for those callers.
 */
export async function resolveExecutionAttempts(
  scenario: Scenario,
  executor: SideEffectExecutor | undefined,
): Promise<{ send: Map<string, ResolvedSend>; verify: Map<string, ResolvedVerify> }> {
  const send = new Map<string, ResolvedSend>();
  const verify = new Map<string, ResolvedVerify>();

  const sendRequests = scenario.events.flatMap(extractSendRequests);
  const verifyRequests = scenario.events.flatMap(extractVerifyRequests);
  if (sendRequests.length === 0 && verifyRequests.length === 0) return { send, verify };

  if (executor === undefined) {
    throw new Error(
      `Scenario "${scenario.id}" declares ${sendRequests.length} send and ${verifyRequests.length} verify attempt(s) but no SideEffectExecutor was supplied.`,
    );
  }

  for (const request of sendRequests) {
    if (send.has(request.attemptId)) continue;
    send.set(request.attemptId, await resolveSend(executor, request));
  }
  for (const request of verifyRequests) {
    if (verify.has(request.attemptId)) continue;
    verify.set(request.attemptId, await resolveVerify(executor, request));
  }
  return { send, verify };
}

/**
 * Phase 1c. Resolves every declared extraction request once. If a scenario declares
 * none (every scenario before Call-to-Proposal existed), this returns an empty map and
 * never touches `provider` — so `provider` stays genuinely optional for those callers.
 */
export async function resolveExtractions(
  scenario: Scenario,
  provider: ExtractionProvider | undefined,
): Promise<Map<string, ResolvedExtraction>> {
  const resolved = new Map<string, ResolvedExtraction>();
  const requests = scenario.events
    .map(extractExtractionRequest)
    .filter((r): r is ExtractionRequest => r !== null);
  if (requests.length === 0) return resolved;

  if (provider === undefined) {
    throw new Error(
      `Scenario "${scenario.id}" declares ${requests.length} extraction request(s) but no ExtractionProvider was supplied.`,
    );
  }

  for (const request of requests) {
    if (resolved.has(request.judgmentId)) continue;
    resolved.set(request.judgmentId, await resolveExtraction(provider, request));
  }
  return resolved;
}

export interface ReduceDeps {
  readonly system: SystemDefinition;
  readonly profile: BusinessProfile;
  readonly handlers: SystemHandlers;
}

/** Phase 2. Pure fold. Exported separately so tests can assert determinism directly. */
export function reduceScenario(
  scenario: Scenario,
  judgments: ReadonlyMap<string, ResolvedJudgment>,
  deps: ReduceDeps,
  executionOutcomes: ExecutionOutcomes = { send: new Map(), verify: new Map() },
  extractions: ReadonlyMap<string, ResolvedExtraction> = new Map(),
): EngineRun {
  const internals = {
    effects: new SideEffectLedger(),
    events: new EventLedger(),
    executions: new ExecutionLedger(),
  };
  const timeline: TimelineEntry[] = [];
  let state: EngineState = initialState(deps.handlers.initialState);

  for (const event of scenario.events) {
    const result = applyEvent(state, event, {
      ...deps,
      judgments,
      internals,
      executionOutcomes,
      extractions,
    });
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
  const executionOutcomes = await resolveExecutionAttempts(scenario, deps.executor);
  const extractions = await resolveExtractions(scenario, deps.extractionProvider);
  return reduceScenario(
    scenario,
    judgments,
    { system: deps.system, profile: deps.profile, handlers: deps.handlers },
    executionOutcomes,
    extractions,
  );
}
