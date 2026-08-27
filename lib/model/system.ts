import { z } from 'zod';
import { OperatingStandardSchema } from './provenance';

/**
 * THE VERTICAL-AGNOSTIC LAYER.
 *
 * A `SystemDefinition` describes STRUCTURE: what states exist, which transitions are
 * legal, which decisions are deterministic, where authority stops, how the system fails.
 *
 * It must contain NO business-specific vocabulary. Say "the customer", not the name of
 * a fictional customer; say "the accounting system", not a product name; say "the
 * service being delivered", not a service line. Values and narrative belong to a
 * business profile (`lib/model/profile.ts`), which is swappable.
 *
 * This is enforced by `tests/seam.test.ts`, which scans `data/systems/**` for a
 * forbidden lexicon. If that test fails, the seam has leaked and the portfolio is no
 * longer retargetable without a rewrite.
 */

// ---------------------------------------------------------------------------
// Maturity
// ---------------------------------------------------------------------------

export const MATURITY_LEVELS = [
  'CONCEPT',
  'SIMULATED',
  'INTERACTIVE_PROTOTYPE',
  'PARTIALLY_LIVE',
  'LIVE',
  'AGENTIC',
  'LOOPED',
  'GRAPH_BASED',
  'PRODUCTION_HARDENED',
] as const;

export const MaturityLevelSchema = z.enum(MATURITY_LEVELS);
export type MaturityLevel = z.infer<typeof MaturityLevelSchema>;

/** Maturity is descriptive, not aspirational. Everything at or below this is not live. */
export const NOT_LIVE: readonly MaturityLevel[] = ['CONCEPT', 'SIMULATED', 'INTERACTIVE_PROTOTYPE'];

export function isLive(level: MaturityLevel): boolean {
  return !NOT_LIVE.includes(level);
}

// ---------------------------------------------------------------------------
// Authority
// ---------------------------------------------------------------------------

/**
 * The shared authority ladder. Authority is assigned PER ACTION.
 * Reasoning capability never raises authority — only policy does.
 */
export const AUTHORITY_LEVELS = [0, 1, 2, 3, 4] as const;
export const AuthorityLevelSchema = z.union([
  z.literal(0),
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
]);
export type AuthorityLevel = z.infer<typeof AuthorityLevelSchema>;

export const AUTHORITY_LABELS: Record<AuthorityLevel, string> = {
  0: 'OBSERVE',
  1: 'RECOMMEND',
  2: 'PREPARE / HUMAN APPROVES',
  3: 'EXECUTE UNDER EXPLICIT POLICY',
  4: 'EXECUTE AND MANAGE BOUNDED DOWNSTREAM CONSEQUENCES',
};

// ---------------------------------------------------------------------------
// Decision mechanism
// ---------------------------------------------------------------------------

export const DECISION_MECHANISMS = [
  /** Computed by the engine from state + event + policy. Reproducible, inspectable, no model involved. */
  'DETERMINISTIC_RULE',
  /** Ambiguity resolved through the DecisionProvider port under an explicit output contract. */
  'BOUNDED_AI_JUDGMENT',
  /** A person decided. Enters the engine as an explicit human event. */
  'HUMAN_DECISION',
] as const;

export const DecisionMechanismSchema = z.enum(DECISION_MECHANISMS);
export type DecisionMechanism = z.infer<typeof DecisionMechanismSchema>;

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

export const STATE_KINDS = [
  'INITIAL',
  'ACTIVE',
  /** Legitimately parked awaiting an external event. Not a terminal state, not a failure. */
  'WAITING',
  /** Human review. A valid architectural state, never a failure of autonomy. */
  'HUMAN_REVIEW',
  'TERMINAL_SUCCESS',
  /** Ended correctly without a sale/recovery, e.g. bad fit, spam, suppressed. */
  'TERMINAL_NEUTRAL',
  'TERMINAL_FAILURE',
] as const;

export const StateKindSchema = z.enum(STATE_KINDS);
export type StateKind = z.infer<typeof StateKindSchema>;

export const TERMINAL_KINDS: readonly StateKind[] = [
  'TERMINAL_SUCCESS',
  'TERMINAL_NEUTRAL',
  'TERMINAL_FAILURE',
];

export function isTerminal(kind: StateKind): boolean {
  return TERMINAL_KINDS.includes(kind);
}

/** A state that satisfies "no silent disappearance": terminal, waiting, or with a human. */
export function isAccountedFor(kind: StateKind): boolean {
  return isTerminal(kind) || kind === 'WAITING' || kind === 'HUMAN_REVIEW';
}

export const LifecycleStateSchema = z.strictObject({
  id: z.string().min(1),
  label: z.string().min(1),
  kind: StateKindSchema,
  description: z.string().min(1),
});

export type LifecycleState = z.infer<typeof LifecycleStateSchema>;

export const TransitionRuleSchema = z.strictObject({
  id: z.string().min(1),
  from: z.string().min(1),
  to: z.string().min(1),
  /** What causes this transition to be considered. */
  trigger: z.string().min(1),
  mechanism: DecisionMechanismSchema,
  /** The condition that must hold. Deterministic transitions state a checkable predicate. */
  guard: z.string().min(1),
  /** Authority required to actually take this transition's associated action. */
  authority: AuthorityLevelSchema,
});

export type TransitionRule = z.infer<typeof TransitionRuleSchema>;

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------

export const METRIC_KINDS = ['LEADING', 'LAGGING', 'COVERAGE', 'RELIABILITY'] as const;
export const MetricKindSchema = z.enum(METRIC_KINDS);
export type MetricKind = z.infer<typeof MetricKindSchema>;

export const MetricDefinitionSchema = z.strictObject({
  id: z.string().min(1),
  name: z.string().min(1),
  kind: MetricKindSchema,
  /**
   * How the number is computed, precisely enough that two engineers would produce the
   * same value. "Zero hidden metric-definition ambiguity" is a portfolio lab target.
   */
  definition: z.string().min(1),
  unit: z.string().min(1),
  /** Which systems of record the inputs come from. Never optional — no metric without provenance. */
  sourceOfTruth: z.string().min(1),
});

export type MetricDefinition = z.infer<typeof MetricDefinitionSchema>;

// ---------------------------------------------------------------------------
// Failure modes
// ---------------------------------------------------------------------------

export const FAILURE_CLASSES = [
  'DUPLICATE_EVENT',
  'OUT_OF_ORDER_EVENT',
  'MALFORMED_PAYLOAD',
  'MISSING_REQUIRED_FIELD',
  'STALE_DATA',
  'CONTRADICTORY_DATA',
  'WRONG_ENTITY_MATCH',
  'SOURCE_SYSTEM_OUTAGE',
  'DOWNSTREAM_API_FAILURE',
  'RATE_LIMITED',
  'TIMEOUT',
  'PARTIAL_SIDE_EFFECT',
  'RETRY_DUPLICATE_SIDE_EFFECT',
  'AI_MALFORMED_OUTPUT',
  'AI_LOW_CONFIDENCE',
  'AI_UNSUPPORTED_INFERENCE',
  'POLICY_VIOLATION',
  'CREDENTIAL_FAILURE',
  'HUMAN_APPROVAL_TIMEOUT',
  'UNEXPECTED_HUMAN_REPLY',
  'SUPPRESSION_STATE',
  'STATE_TRANSITION_CONFLICT',
  'REPLAY_AFTER_COMPLETION',
] as const;

export const FailureClassSchema = z.enum(FAILURE_CLASSES);
export type FailureClass = z.infer<typeof FailureClassSchema>;

/**
 * One lifecycle movement a recovery requires, as a pair the transition graph can be asked
 * about. This replaced free prose (`'ELIGIBILITY_REVIEW.'`) because a validator cannot check
 * a sentence — see `validateLifecycle` and `docs/STATUS.md` gap 0.
 */
export const RecoveryMoveSchema = z.strictObject({
  from: z.string().min(1),
  to: z.string().min(1),
  /**
   * Set ONLY when this movement is declared in canon and the lifecycle has no transition that
   * performs it. It renders in the register as an open canon defect rather than as handling,
   * and `validateLifecycle` fails if it is set on a movement that IS buildable — so the
   * honest escape hatch cannot quietly become the next `Pending` marker.
   */
  unbuildable: z.literal(true).optional(),
});

export type RecoveryMove = z.infer<typeof RecoveryMoveSchema>;

export const RECOVERY_SHAPES = ['MOVES', 'HOLDS_POSITION', 'BELOW_LIFECYCLE'] as const;
export const RecoveryShapeSchema = z.enum(RECOVERY_SHAPES);
export type RecoveryShape = z.infer<typeof RecoveryShapeSchema>;

export const RecoveryPathSchema = z.discriminatedUnion('shape', [
  /** The case moves. Every movement is checked against the declared transitions. */
  z.strictObject({
    shape: z.literal('MOVES'),
    moves: z.array(RecoveryMoveSchema).min(1),
    note: z.string().min(1).optional(),
  }),
  /** Holding position IS the recovery — a duplicate, a replay, a refused transition. */
  z.strictObject({
    shape: z.literal('HOLDS_POSITION'),
    /**
     * The lifecycle states this recovery holds AT, when that is a meaningful question.
     *
     * Same reasoning as `RecoveryMoveSchema` above: `note` is prose, and a validator cannot
     * check a sentence. An attention mechanism that says "the case stays where it is" is
     * making a claim about WHICH cases, and until that claim was data nothing could ask
     * whether a given parked state was covered by anything at all.
     *
     * Optional, because not every hold is about attention. A refused duplicate holds wherever
     * the case happens to be; enumerating states there would be false precision. It is
     * REQUIRED for `HUMAN_APPROVAL_TIMEOUT`, enforced in `validateLifecycle` — an attention
     * claim that declines to say where it applies cannot be checked, and an uncheckable claim
     * is the thing this repository exists to not make.
     */
    holdsAt: z.array(z.string().min(1)).min(1).optional(),
    note: z.string().min(1),
  }),
  /** Handled entirely below the lifecycle, on the side-effect record. Say where. */
  z.strictObject({
    shape: z.literal('BELOW_LIFECYCLE'),
    note: z.string().min(1),
  }),
]);

export type RecoveryPath = z.infer<typeof RecoveryPathSchema>;

export const FailureModeSchema = z.strictObject({
  id: z.string().min(1),
  class: FailureClassSchema,
  failure: z.string().min(1),
  cause: z.string().min(1),
  businessImpact: z.string().min(1),
  prevention: z.string().min(1),
  detection: z.string().min(1),
  recovery: z.string().min(1),
  retryPolicy: z.string().optional(),
  escalationCondition: z.string().min(1),
  authorityRequired: AuthorityLevelSchema,
  /**
   * Where the case ends up, as a structured claim about the transition graph rather than as
   * prose. Never a generic "error".
   */
  recoveryPath: RecoveryPathSchema,
  /** How we would know the handling works. Names a test where one exists. */
  verificationTest: z.string().min(1),
});

export type FailureMode = z.infer<typeof FailureModeSchema>;

// ---------------------------------------------------------------------------
// System definition
// ---------------------------------------------------------------------------

export const SystemDefinitionSchema = z.strictObject({
  id: z.string().min(1),
  slug: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string().min(1),
  order: z.number().int().positive(),

  businessProblem: z.string().min(1),
  economicLeakage: z.string().min(1),
  buyerOutcome: z.string().min(1),

  triggers: z.array(z.string().min(1)).min(1),
  sourcesOfTruth: z.array(z.string().min(1)).min(1),
  entities: z.array(z.string().min(1)).min(1),

  lifecycle: z.strictObject({
    states: z.array(LifecycleStateSchema).min(2),
    transitions: z.array(TransitionRuleSchema).min(1),
  }),

  deterministicDecisions: z.array(z.string().min(1)).min(1),
  aiJudgments: z.array(z.string().min(1)),
  humanOnlyActions: z.array(z.string().min(1)).min(1),
  possibleActions: z.array(z.string().min(1)).min(1),

  /** What the system must never do, regardless of confidence. */
  aiBoundary: z.array(z.string().min(1)).min(1),
  guardrails: z.array(z.string().min(1)).min(1),

  metrics: z.array(MetricDefinitionSchema).min(1),
  standards: z.array(OperatingStandardSchema).min(1),
  failureModes: z.array(FailureModeSchema).min(1),

  maturity: MaturityLevelSchema,
  /** Honest statement of what is and is not real today. Rendered verbatim to visitors. */
  fidelityNote: z.string().min(1),
});

export type SystemDefinition = z.infer<typeof SystemDefinitionSchema>;

// ---------------------------------------------------------------------------
// Structural validation beyond the schema
// ---------------------------------------------------------------------------

export interface StructuralIssue {
  readonly systemId: string;
  readonly kind: string;
  readonly detail: string;
}

/**
 * Checks the graph is coherent: transitions reference real states, every non-initial
 * state is reachable, and every path can terminate. A lifecycle that cannot terminate
 * is a lifecycle that silently drops work.
 */
export function validateLifecycle(system: SystemDefinition): StructuralIssue[] {
  const issues: StructuralIssue[] = [];
  const ids = new Set(system.lifecycle.states.map((s) => s.id));
  const push = (kind: string, detail: string) =>
    issues.push({ systemId: system.id, kind, detail });

  for (const t of system.lifecycle.transitions) {
    if (!ids.has(t.from)) push('UNKNOWN_FROM_STATE', `transition ${t.id} leaves undefined state "${t.from}"`);
    if (!ids.has(t.to)) push('UNKNOWN_TO_STATE', `transition ${t.id} enters undefined state "${t.to}"`);
  }

  const initial = system.lifecycle.states.filter((s) => s.kind === 'INITIAL');
  if (initial.length !== 1) {
    push('INITIAL_STATE_COUNT', `expected exactly 1 INITIAL state, found ${initial.length}`);
  }

  const terminal = system.lifecycle.states.filter((s) => isTerminal(s.kind));
  if (terminal.length === 0) push('NO_TERMINAL_STATE', 'lifecycle has no terminal state');

  // Reachability from the initial state.
  const outgoing = new Map<string, string[]>();
  for (const t of system.lifecycle.transitions) {
    outgoing.set(t.from, [...(outgoing.get(t.from) ?? []), t.to]);
  }
  const start = initial[0];
  if (start) {
    const seen = new Set<string>([start.id]);
    const queue = [start.id];
    while (queue.length > 0) {
      const current = queue.shift();
      if (current === undefined) break;
      for (const next of outgoing.get(current) ?? []) {
        if (!seen.has(next)) {
          seen.add(next);
          queue.push(next);
        }
      }
    }
    for (const state of system.lifecycle.states) {
      if (!seen.has(state.id)) {
        push('UNREACHABLE_STATE', `state "${state.id}" cannot be reached from "${start.id}"`);
      }
    }
  }

  // Every non-terminal state must have a way out.
  for (const state of system.lifecycle.states) {
    if (!isTerminal(state.kind) && (outgoing.get(state.id) ?? []).length === 0) {
      push('DEAD_END_STATE', `non-terminal state "${state.id}" has no outgoing transition`);
    }
  }

  /**
   * An attention mechanism's scope is a claim about this graph too.
   *
   * `DEAD_END_STATE` above catches a state with no exit. It says nothing about a state whose
   * every exit needs the person who is, by hypothesis, not acting — see
   * `lib/proof/parked-state-attention.ts`, which derives that. What is checked HERE is the
   * narrower thing a validator can settle outright: that a declared attention mechanism names
   * real states, and that it names some.
   */
  for (const mode of system.failureModes) {
    const recovery = mode.recoveryPath;
    if (recovery.shape !== 'HOLDS_POSITION') continue;
    for (const stateId of recovery.holdsAt ?? []) {
      if (!ids.has(stateId)) {
        push('UNKNOWN_HOLDS_AT_STATE', `failure mode ${mode.id} holds at undefined state "${stateId}"`);
      }
    }
    if (mode.class === 'HUMAN_APPROVAL_TIMEOUT' && recovery.holdsAt === undefined) {
      push(
        'ATTENTION_WITHOUT_STATES',
        `failure mode ${mode.id} is a HUMAN_APPROVAL_TIMEOUT holding position but names no states — declare holdsAt so the claim can be checked against the states work actually parks in`,
      );
    }
  }

  /**
   * Every failure mode's declared recovery is a claim about this graph, so ask the graph.
   *
   * This is the check that was missing when `dp-fm-stale-data` and `dp-fm-rate-limited`
   * declared recoveries the lifecycle had no transition for. Both sat marked
   * `Pending — scenario not yet authored`, which read as unfinished writing and was in fact a
   * canon defect: the standards were not unwritten, they were unbuildable. See
   * `docs/STATUS.md` gap 0.
   *
   * The marker is checked in BOTH directions on purpose. An unmarked unbuildable recovery
   * fails, and so does a marker on a movement that has since become buildable — otherwise the
   * escape hatch rots into exactly the kind of stale annotation it was introduced to replace.
   */
  const declared = new Set(system.lifecycle.transitions.map((t) => `${t.from} ${t.to}`));
  for (const mode of system.failureModes) {
    if (mode.recoveryPath.shape !== 'MOVES') continue;
    for (const move of mode.recoveryPath.moves) {
      const known = ids.has(move.from) && ids.has(move.to);
      if (!known) {
        push(
          'UNKNOWN_RECOVERY_STATE',
          `failure mode ${mode.id} recovers via "${move.from}" -> "${move.to}", which names a state this lifecycle never declares`,
        );
        continue;
      }
      const buildable = declared.has(`${move.from} ${move.to}`);
      if (!buildable && move.unbuildable !== true) {
        push(
          'UNBUILDABLE_RECOVERY',
          `failure mode ${mode.id} declares the recovery "${move.from}" -> "${move.to}", but no transition performs it. Build the transition, correct the recovery, or mark the move \`unbuildable: true\` to record it as an open canon defect.`,
        );
      }
      if (buildable && move.unbuildable === true) {
        push(
          'STALE_UNBUILDABLE_MARKER',
          `failure mode ${mode.id} marks "${move.from}" -> "${move.to}" unbuildable, but a transition now performs it. Remove the marker.`,
        );
      }
    }
  }

  return issues;
}

/**
 * Renders a structured recovery back into the sentence the register and the system pages
 * used to store by hand. Derived rather than authored, so it cannot drift from the graph —
 * and an unbuildable movement says so in the prose rather than reading as handling.
 */
export function describeRecovery(system: SystemDefinition, recovery: RecoveryPath): string {
  if (recovery.shape !== 'MOVES') return recovery.note;

  const label = (id: string) => system.lifecycle.states.find((s) => s.id === id)?.label ?? id;

  /**
   * Consecutive movements that genuinely chain (this one starts where the last ended) render
   * as one path; everything else is a separate alternative. Joining the whole list with
   * "then" would assert a sequence several of these recoveries do not have — a low-confidence
   * judgment reaches a person from NORMALIZED *or* from REPLIED, never both in order.
   */
  interface Segment {
    readonly states: string[];
    unbuildable: boolean;
  }
  const segments: Segment[] = [];
  for (const move of recovery.moves) {
    const open = segments[segments.length - 1];
    if (open !== undefined && open.states[open.states.length - 1] === move.from) {
      open.states.push(move.to);
      open.unbuildable ||= move.unbuildable === true;
    } else {
      segments.push({ states: [move.from, move.to], unbuildable: move.unbuildable === true });
    }
  }

  const path = segments
    .map((segment) => {
      const arrow = segment.states.map(label).join(' → ');
      return segment.unbuildable
        ? `${arrow} (declared in canon, but no declared transition performs it — an open defect, not handling)`
        : arrow;
    })
    .join(' · ');

  return recovery.note === undefined ? `${path}.` : `${path}. ${recovery.note}`;
}
