import { z } from 'zod';
import { AuthorityLevelSchema, DecisionMechanismSchema } from './system';

/**
 * THE ADAPTER SEAM.
 *
 * Everything downstream of `CanonicalEvent` is indifferent to where the event came
 * from. Today a fixture adapter produces these. Later a webhook adapter will produce
 * the same shapes from real traffic. The business model and the portfolio UX must not
 * have to change when that happens — that is the invariant this file protects.
 *
 * DETERMINISM: every timestamp is supplied by the caller as an ISO-8601 string.
 * Nothing here reads a clock or a random source. Replay is therefore exact, which is
 * what makes `tests/replay.test.ts` a real assertion rather than a smoke test.
 */

export const EXECUTION_MODES = ['SIMULATED', 'LIVE'] as const;
export const ExecutionModeSchema = z.enum(EXECUTION_MODES);
export type ExecutionMode = z.infer<typeof ExecutionModeSchema>;

export const ACTOR_TYPES = ['SYSTEM', 'AI', 'HUMAN', 'EXTERNAL_PARTY'] as const;
export const ActorTypeSchema = z.enum(ACTOR_TYPES);
export type ActorType = z.infer<typeof ActorTypeSchema>;

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

export const CanonicalEventSchema = z.strictObject({
  eventId: z.string().min(1),
  /** Groups every event belonging to one business incident. */
  correlationId: z.string().min(1),
  /** The business entity this concerns (lead, invoice, engagement). */
  entityId: z.string().min(1),
  /** Business event type, e.g. `inbound.inquiry.received`. Never a node name. */
  type: z.string().min(1),
  /** The channel or system that emitted it. */
  source: z.string().min(1),
  /**
   * The id this event carries IN THE SOURCE SYSTEM. This is the natural idempotency
   * anchor: at-least-once delivery means the same sourceEventId can legitimately
   * arrive more than once, and must not produce a second external action.
   */
  sourceEventId: z.string().min(1),
  occurredAt: z.string().min(1),
  receivedAt: z.string().min(1),
  schemaVersion: z.string().min(1),
  actor: ActorTypeSchema,
  payload: z.record(z.string(), z.unknown()),
  executionMode: ExecutionModeSchema,
});

export type CanonicalEvent = z.infer<typeof CanonicalEventSchema>;

// ---------------------------------------------------------------------------
// Decision records
// ---------------------------------------------------------------------------

/**
 * A structured decision record. NEVER private chain-of-thought.
 *
 * `evidenceRefs` point at fields of the event or state that were actually consulted.
 * The distinction the visitor must always be able to see is `mechanism`: whether the
 * engine computed this, a bounded judgment produced it, or a person decided it.
 */
export const DecisionRecordSchema = z.strictObject({
  id: z.string().min(1),
  eventId: z.string().min(1),
  mechanism: DecisionMechanismSchema,
  objective: z.string().min(1),
  relevantState: z.string().min(1),
  evidenceRefs: z.array(z.string().min(1)),
  deterministicFacts: z.array(
    z.strictObject({ label: z.string().min(1), value: z.string().min(1) }),
  ),
  classification: z.string().optional(),
  /** Present only for BOUNDED_AI_JUDGMENT. Deterministic rules do not have confidence. */
  confidence: z.number().min(0).max(1).optional(),
  missingInformation: z.array(z.string().min(1)),
  permittedActions: z.array(z.string().min(1)),
  forbiddenActions: z.array(z.string().min(1)),
  selectedAction: z.string().min(1),
  applicablePolicy: z.array(z.string().min(1)),
  evaluatorResult: z.string().optional(),
  escalationReason: z.string().optional(),
  authority: AuthorityLevelSchema,
  /** Which DecisionProvider produced this, when mechanism is BOUNDED_AI_JUDGMENT. */
  providerId: z.string().optional(),
});

export type DecisionRecord = z.infer<typeof DecisionRecordSchema>;

// ---------------------------------------------------------------------------
// Side effects
// ---------------------------------------------------------------------------

export const SIDE_EFFECT_KINDS = [
  'MESSAGE_SEND',
  'RECORD_WRITE',
  'TASK_CREATE',
  'NOTIFICATION',
  'RESOURCE_PROVISION',
  'SCHEDULE',
] as const;
export const SideEffectKindSchema = z.enum(SIDE_EFFECT_KINDS);
export type SideEffectKind = z.infer<typeof SideEffectKindSchema>;

export const SIDE_EFFECT_STATUSES = [
  'EXECUTED',
  /** The idempotency ledger already held this key. The second attempt did nothing. */
  'SUPPRESSED_DUPLICATE',
  'BLOCKED_BY_POLICY',
  'AWAITING_APPROVAL',
  'FAILED',
] as const;
export const SideEffectStatusSchema = z.enum(SIDE_EFFECT_STATUSES);
export type SideEffectStatus = z.infer<typeof SideEffectStatusSchema>;

export const SideEffectSchema = z.strictObject({
  id: z.string().min(1),
  eventId: z.string().min(1),
  kind: SideEffectKindSchema,
  description: z.string().min(1),
  target: z.string().min(1),
  /**
   * The key the ledger dedupes on. Two attempts sharing a key are the same intended
   * external action, no matter how many times the event was delivered.
   */
  idempotencyKey: z.string().min(1),
  status: SideEffectStatusSchema,
  authority: AuthorityLevelSchema,
  /** SIMULATED here means: nothing left this process. Never rendered as if it did. */
  executionMode: ExecutionModeSchema,
  detail: z.string().optional(),
});

export type SideEffect = z.infer<typeof SideEffectSchema>;

// ---------------------------------------------------------------------------
// Verification
// ---------------------------------------------------------------------------

export const VERIFICATION_RESULTS = ['PASS', 'FAIL', 'NOT_APPLICABLE'] as const;
export const VerificationResultSchema = z.enum(VERIFICATION_RESULTS);
export type VerificationResult = z.infer<typeof VerificationResultSchema>;

export const VerificationRecordSchema = z.strictObject({
  id: z.string().min(1),
  eventId: z.string().min(1),
  /** What was checked after acting. "ACT" without "VERIFY" is how silent failure happens. */
  check: z.string().min(1),
  result: VerificationResultSchema,
  detail: z.string().min(1),
  sideEffectId: z.string().optional(),
});

export type VerificationRecord = z.infer<typeof VerificationRecordSchema>;

// ---------------------------------------------------------------------------
// State transitions (runtime, as opposed to the declared rule)
// ---------------------------------------------------------------------------

export const StateTransitionSchema = z.strictObject({
  id: z.string().min(1),
  eventId: z.string().min(1),
  from: z.string().min(1),
  to: z.string().min(1),
  /** The declared TransitionRule this matched, when it matched one. */
  ruleId: z.string().optional(),
  mechanism: DecisionMechanismSchema,
  accepted: z.boolean(),
  /** Populated when `accepted` is false. An illegal transition is recorded, never silently applied. */
  rejectionReason: z.string().optional(),
});

export type StateTransition = z.infer<typeof StateTransitionSchema>;

// ---------------------------------------------------------------------------
// Bounded AI judgment contract
// ---------------------------------------------------------------------------

/**
 * The output contract a bounded judgment must satisfy. Deliberately narrow: a
 * classification drawn from a closed set, a confidence, the fields it could not
 * determine, and references to the input text it relied on.
 *
 * `unsupported` is the field that keeps "unknown" unknown. A judgment that wants to
 * assert something the input does not support must list it here instead of inventing it.
 */
export const ClassificationResultSchema = z.strictObject({
  judgmentId: z.string().min(1),
  classification: z.string().min(1),
  confidence: z.number().min(0).max(1),
  /** Facts the input did not establish. These must NOT be filled in downstream. */
  missingInformation: z.array(z.string().min(1)),
  /** Quoted or referenced spans of the input the classification rests on. */
  evidenceRefs: z.array(z.string().min(1)),
  /** Claims the model declined to make because the input did not support them. */
  declinedToInfer: z.array(z.string().min(1)),
  rationaleSummary: z.string().min(1),
});

export type ClassificationResult = z.infer<typeof ClassificationResultSchema>;

// ---------------------------------------------------------------------------
// Timeline
// ---------------------------------------------------------------------------

export interface TimelineEntry {
  readonly event: CanonicalEvent;
  readonly transitions: readonly StateTransition[];
  readonly decisions: readonly DecisionRecord[];
  readonly sideEffects: readonly SideEffect[];
  readonly verifications: readonly VerificationRecord[];
  /** Lifecycle state id after this event was fully processed. */
  readonly stateAfter: string;
  /** Human-readable one-line summary for the timeline rail. */
  readonly summary: string;
}

// ---------------------------------------------------------------------------
// Scenarios
// ---------------------------------------------------------------------------

export const ScenarioSchema = z.strictObject({
  id: z.string().min(1),
  slug: z.string().regex(/^[a-z0-9-]+$/),
  systemId: z.string().min(1),
  title: z.string().min(1),
  summary: z.string().min(1),
  /** What a visitor should understand after watching this run. */
  demonstrates: z.array(z.string().min(1)).min(1),
  events: z.array(CanonicalEventSchema).min(1),
  /**
   * Fixture-backed bounded judgments, keyed by judgmentId. Resolved through the
   * DecisionProvider port before the reducer runs, so the reducer stays synchronous
   * and pure while the port stays async and swappable for a real model later.
   */
  judgments: z.record(z.string(), ClassificationResultSchema),
  expectedFinalState: z.string().min(1),
});

export type Scenario = z.infer<typeof ScenarioSchema>;
