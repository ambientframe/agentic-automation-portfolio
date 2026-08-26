import type { EngineRun } from '@/lib/engine/types';
import type {
  DecisionRecord,
  SideEffect,
  SideEffectStatus,
  StateTransition,
  TechnicalExecution,
  TimelineEntry,
  VerificationRecord,
} from '@/lib/model/runtime';
import {
  isTerminal,
  type AuthorityLevel,
  type DecisionMechanism,
  type StateKind,
  type SystemDefinition,
} from '@/lib/model/system';

/**
 * RUN → READABLE JOURNEY. Pure derivation, no new truth.
 *
 * Every field below is either copied verbatim out of an `EngineRun` / `SystemDefinition`
 * or computed from them by an operation a reader could repeat by hand. Nothing here
 * asserts anything the engine did not already record, because the entire value of this
 * page depends on a sceptical reader being able to check it.
 *
 * Two things this module deliberately does NOT do:
 *
 *   - It does not decide what a run *means* commercially. `stepLabel` and `summary` are
 *     the handler's own words, passed through untouched.
 *   - It does not infer a guardrail from prose. A guardrail is reported only when a
 *     STRUCTURAL fact in the run proves one engaged — a refused transition, a blocked
 *     effect, a claimed key, a recorded escalation. Pattern-matching guardrail sentences
 *     against summaries would manufacture exactly the confident-sounding claim the rest of
 *     this codebase is built to refuse.
 */

// ---------------------------------------------------------------------------
// Effects
// ---------------------------------------------------------------------------

/**
 * Three answers to "did this reach anyone", which is the only distinction a buyer needs
 * before the detail: it happened, it was held back, or nobody can currently say.
 * UNCERTAIN is kept separate from WITHHELD on purpose — an unconfirmed send may well have
 * arrived, and collapsing it into "withheld" would be the reassuring lie.
 */
export const EFFECT_DISPOSITIONS = ['EXECUTED', 'WITHHELD', 'UNCERTAIN'] as const;
export type EffectDisposition = (typeof EFFECT_DISPOSITIONS)[number];

const DISPOSITION_BY_STATUS: Record<SideEffectStatus, EffectDisposition> = {
  EXECUTED: 'EXECUTED',
  OUTCOME_UNKNOWN: 'UNCERTAIN',
  SUPPRESSED_DUPLICATE: 'WITHHELD',
  BLOCKED_BY_POLICY: 'WITHHELD',
  AWAITING_APPROVAL: 'WITHHELD',
  FAILED: 'WITHHELD',
  RATE_LIMITED: 'WITHHELD',
  CONFLICT_DETECTED: 'WITHHELD',
};

/**
 * Plain-language gloss on the canonical status, which is always shown alongside it.
 *
 * Split by whether the effect leaves the business, because several of these sentences are
 * only true of an outbound message. An internal record write described as "the recipient got
 * this" tells a reader someone was contacted — and the scenario that most needs to be
 * understood is the one where the system deliberately contacted nobody, whose only executed
 * effect is exactly such a write. One gloss for both would state the opposite of the point.
 */
function statusMeaning(status: SideEffectStatus, customerFacing: boolean): string {
  switch (status) {
    case 'EXECUTED':
      return customerFacing
        ? 'Performed. The recipient got this.'
        : 'Performed. This wrote to internal records only — nobody outside the business was contacted.';
    case 'SUPPRESSED_DUPLICATE':
      return customerFacing
        ? 'Refused: this exact action was already claimed. Nobody was contacted twice.'
        : 'Refused: this exact action was already claimed. It was not applied a second time.';
    case 'BLOCKED_BY_POLICY':
      return customerFacing
        ? 'Computed, then refused at the policy gate. Nothing was sent.'
        : 'Computed, then refused at the policy gate. Nothing was written.';
    case 'AWAITING_APPROVAL':
      return 'Prepared and held. It needs a person before it can happen.';
    case 'FAILED':
      return 'Confirmed not to have happened. Safe to try again.';
    case 'RATE_LIMITED':
      return 'Confirmed not to have happened; the provider was throttling. Safe to try again after backoff.';
    case 'OUTCOME_UNKNOWN':
      return customerFacing
        ? 'The provider never confirmed either way. This may or may not have reached the recipient — so it is not retried on an assumption.'
        : 'The provider never confirmed either way. This may or may not have been applied — so it is not retried on an assumption.';
    case 'CONFLICT_DETECTED':
      return 'Something already exists at this target that does not match what was intended. Held for a person; never resolved automatically.';
  }
}

export interface EffectView {
  readonly id: string;
  readonly disposition: EffectDisposition;
  readonly status: SideEffectStatus;
  readonly meaning: string;
  readonly kind: SideEffect['kind'];
  readonly description: string;
  readonly target: string;
  readonly authority: AuthorityLevel;
  readonly executionMode: SideEffect['executionMode'];
  readonly idempotencyKey: string;
  readonly detail: string | null;
  /**
   * Narrowed to `| null` rather than reusing `SideEffect['technical']`, which is optional.
   * Keeping both `undefined` and `null` in the type would force every reader of this view to
   * handle two spellings of "absent" for no gain.
   */
  readonly technical: TechnicalExecution | null;
  /** True for effects that would have been seen by someone outside the business. */
  readonly customerFacing: boolean;
}

const CUSTOMER_FACING_KINDS: readonly SideEffect['kind'][] = ['MESSAGE_SEND'];

function toEffectView(effect: SideEffect): EffectView {
  const customerFacing = CUSTOMER_FACING_KINDS.includes(effect.kind);
  return {
    id: effect.id,
    disposition: DISPOSITION_BY_STATUS[effect.status],
    status: effect.status,
    meaning: statusMeaning(effect.status, customerFacing),
    kind: effect.kind,
    description: effect.description,
    target: effect.target,
    authority: effect.authority,
    executionMode: effect.executionMode,
    idempotencyKey: effect.idempotencyKey,
    detail: effect.detail ?? null,
    technical: effect.technical ?? null,
    customerFacing,
  };
}

// ---------------------------------------------------------------------------
// Guardrails
// ---------------------------------------------------------------------------

/**
 * Guardrail kinds, ordered weakest to strongest. The order is load-bearing: a moment can
 * engage several at once and the rail shows only the strongest, so this list decides what
 * a reader sees at a glance.
 */
export const GUARDRAIL_KINDS = [
  'UNKNOWN_KEPT_UNKNOWN',
  'BOUNDED_ACTION_SET',
  'IDEMPOTENCY',
  'RETRY_SAFETY',
  'AUTHORITY_HOLD',
  'ESCALATION',
  'TRANSITION_LEGALITY',
  'CONFLICT_HOLD',
  'POLICY_BLOCK',
] as const;
export type GuardrailKind = (typeof GUARDRAIL_KINDS)[number];

const GUARDRAIL_LABEL: Record<GuardrailKind, string> = {
  UNKNOWN_KEPT_UNKNOWN: 'Unknown kept unknown',
  BOUNDED_ACTION_SET: 'Bounded action set',
  IDEMPOTENCY: 'Duplicate refused',
  RETRY_SAFETY: 'Retry withheld',
  AUTHORITY_HOLD: 'Held for approval',
  ESCALATION: 'Escalated to a person',
  TRANSITION_LEGALITY: 'Illegal move refused',
  CONFLICT_HOLD: 'Conflict held',
  POLICY_BLOCK: 'Blocked by policy',
};

export interface GuardrailEngagement {
  readonly kind: GuardrailKind;
  readonly label: string;
  /** What was prevented, stated as an outcome rather than a mechanism. */
  readonly prevented: string;
  /** Verbatim lines out of the run. The reader's means of checking the claim. */
  readonly evidence: readonly string[];
}

/**
 * Collects guardrails from structural facts only. Each branch below corresponds to a
 * condition the engine core itself recorded — there is no branch that fires on wording.
 */
function collectGuardrails(
  transitions: readonly StateTransition[],
  decisions: readonly DecisionRecord[],
  effects: readonly EffectView[],
): readonly GuardrailEngagement[] {
  const found = new Map<GuardrailKind, GuardrailEngagement>();
  const add = (kind: GuardrailKind, prevented: string, evidence: readonly string[]) => {
    const existing = found.get(kind);
    if (existing === undefined) {
      found.set(kind, { kind, label: GUARDRAIL_LABEL[kind], prevented, evidence });
      return;
    }
    found.set(kind, { ...existing, evidence: [...existing.evidence, ...evidence] });
  };

  for (const transition of transitions) {
    if (!transition.accepted) {
      add('TRANSITION_LEGALITY', `A move from ${transition.from} to ${transition.to} was requested and refused. The case stayed where it was.`, [
        transition.rejectionReason ?? `No declared transition permits ${transition.from} → ${transition.to}.`,
      ]);
    }
  }

  for (const effect of effects) {
    switch (effect.status) {
      case 'BLOCKED_BY_POLICY':
        add('POLICY_BLOCK', `An outbound action was computed and then refused: ${effect.description}`, [
          effect.detail ?? effect.meaning,
          `Target that was NOT contacted: ${effect.target}`,
        ]);
        break;
      case 'SUPPRESSED_DUPLICATE':
        add('IDEMPOTENCY', `A second attempt at an action already taken was refused, so nobody received it twice.`, [
          `Key already claimed: ${effect.idempotencyKey}`,
          effect.detail ?? effect.meaning,
        ]);
        break;
      case 'OUTCOME_UNKNOWN':
        add('RETRY_SAFETY', `An unconfirmed send was left unresolved rather than repeated on an assumption.`, [
          effect.detail ?? effect.meaning,
          ...(effect.technical === null ? [] : [`Retry safety: ${effect.technical.retrySafety} · verification: ${effect.technical.verificationStatus}`]),
        ]);
        break;
      case 'AWAITING_APPROVAL':
        add('AUTHORITY_HOLD', `A prepared action was held because it needs a person's approval.`, [effect.detail ?? effect.meaning]);
        break;
      case 'CONFLICT_DETECTED':
        add('CONFLICT_HOLD', `An existing resource did not match what this run intended, and was not overwritten.`, [effect.detail ?? effect.meaning]);
        break;
      default:
        break;
    }
    // Independent of status: an UNSAFE attempt is a withheld retry even where the status
    // itself resolved, which is why this is not folded into the OUTCOME_UNKNOWN branch.
    if (effect.technical !== null && effect.technical.retrySafety === 'UNSAFE' && effect.status !== 'OUTCOME_UNKNOWN') {
      add('RETRY_SAFETY', `A further attempt on this action was refused as unsafe.`, [
        `Attempt ${effect.technical.attempt} via ${effect.technical.provider}: ${effect.technical.outcomeKind}`,
      ]);
    }
  }

  for (const decision of decisions) {
    if (decision.escalationReason !== undefined) {
      add('ESCALATION', `The case was handed to a person instead of being acted on.`, [decision.escalationReason]);
    }
    if (decision.forbiddenActions.length > 0) {
      add('BOUNDED_ACTION_SET', `The decision could only choose from a closed set. These were not available to it at all.`, [
        `Forbidden: ${decision.forbiddenActions.join('; ')}`,
      ]);
    }
    if (decision.missingInformation.length > 0) {
      add('UNKNOWN_KEPT_UNKNOWN', `Facts the input did not establish were carried as missing rather than filled in.`, [
        `Still unknown: ${decision.missingInformation.join(', ')}`,
      ]);
    }
  }

  return GUARDRAIL_KINDS.filter((kind) => found.has(kind))
    .map((kind) => found.get(kind))
    .filter((entry): entry is GuardrailEngagement => entry !== undefined)
    .reverse();
}

// ---------------------------------------------------------------------------
// Provenance
// ---------------------------------------------------------------------------

export interface ProvenanceGroup {
  readonly label: string;
  readonly entries: readonly { readonly label: string; readonly value: string }[];
}

function collectProvenance(
  entry: TimelineEntry,
  decisions: readonly DecisionRecord[],
  effects: readonly EffectView[],
  verifications: readonly VerificationRecord[],
): readonly ProvenanceGroup[] {
  const groups: ProvenanceGroup[] = [
    {
      label: 'Where this came from',
      entries: [
        { label: 'Channel', value: entry.event.source },
        { label: 'Id in that system', value: entry.event.sourceEventId },
        { label: 'Raised by', value: entry.event.actor },
        { label: 'Occurred', value: entry.event.occurredAt },
        { label: 'Received', value: entry.event.receivedAt },
        { label: 'Schema', value: entry.event.schemaVersion },
        { label: 'Execution mode', value: entry.event.executionMode },
      ],
    },
  ];

  const cited = decisions.flatMap((decision) =>
    decision.evidenceRefs.map((ref, index) => ({ label: `Ref ${index + 1}`, value: ref })),
  );
  if (cited.length > 0) {
    groups.push({ label: 'What the decision actually read', entries: cited });
  }

  const providers = decisions
    .filter((decision) => decision.providerId !== undefined)
    .map((decision) => ({ label: 'Judgment provider', value: decision.providerId ?? '' }));
  const confidences = decisions
    .filter((decision) => decision.confidence !== undefined)
    .map((decision) => ({ label: 'Confidence', value: (decision.confidence ?? 0).toFixed(2) }));
  if (providers.length > 0 || confidences.length > 0) {
    groups.push({ label: 'Judgment attribution', entries: [...providers, ...confidences] });
  }

  const keys = effects.map((effect) => ({ label: effect.kind, value: effect.idempotencyKey }));
  const externalIds = effects
    .filter((effect) => effect.technical?.externalId !== undefined)
    .map((effect) => ({ label: 'External id', value: effect.technical?.externalId ?? '' }));
  if (keys.length > 0) {
    groups.push({ label: 'Action identity', entries: [...keys, ...externalIds] });
  }

  if (verifications.length > 0) {
    groups.push({
      label: 'Checked afterwards',
      entries: verifications.map((verification) => ({
        label: verification.result,
        value: `${verification.check} — ${verification.detail}`,
      })),
    });
  }

  return groups;
}

// ---------------------------------------------------------------------------
// Moments
// ---------------------------------------------------------------------------

export interface NextMove {
  readonly ruleId: string;
  readonly to: string;
  readonly toLabel: string;
  readonly trigger: string;
  readonly guard: string;
  readonly mechanism: DecisionMechanism;
  readonly authority: AuthorityLevel;
}

export interface DecisionView {
  readonly id: string;
  readonly mechanism: DecisionMechanism;
  readonly objective: string;
  readonly selectedAction: string;
  readonly authority: AuthorityLevel;
  readonly confidence: number | null;
  readonly classification: string | null;
  readonly providerId: string | null;
  readonly facts: readonly { readonly label: string; readonly value: string }[];
  readonly permittedActions: readonly string[];
  readonly forbiddenActions: readonly string[];
  readonly applicablePolicy: readonly string[];
  readonly missingInformation: readonly string[];
  readonly evaluatorResult: string | null;
  readonly escalationReason: string | null;
}

function toDecisionView(decision: DecisionRecord): DecisionView {
  return {
    id: decision.id,
    mechanism: decision.mechanism,
    objective: decision.objective,
    selectedAction: decision.selectedAction,
    authority: decision.authority,
    confidence: decision.confidence ?? null,
    classification: decision.classification ?? null,
    providerId: decision.providerId ?? null,
    facts: decision.deterministicFacts,
    permittedActions: decision.permittedActions,
    forbiddenActions: decision.forbiddenActions,
    applicablePolicy: decision.applicablePolicy,
    missingInformation: decision.missingInformation,
    evaluatorResult: decision.evaluatorResult ?? null,
    escalationReason: decision.escalationReason ?? null,
  };
}

export interface JourneyMoment {
  readonly id: string;
  readonly index: number;
  /** The handler's own label for this step. Not rewritten. */
  readonly stepLabel: string;
  readonly summary: string;
  readonly atOffsetSeconds: number;

  readonly eventType: string;
  readonly eventSource: string;
  readonly correlationId: string;

  readonly stateBefore: string;
  readonly stateAfter: string;
  readonly stateAfterLabel: string;
  readonly stateAfterKind: StateKind;
  readonly stateChanged: boolean;
  readonly transitions: readonly StateTransition[];
  readonly hasRefusedTransition: boolean;

  readonly decisions: readonly DecisionView[];
  readonly mechanisms: readonly DecisionMechanism[];
  /** Highest authority any decision at this step exercised. Null when none decided. */
  readonly authority: AuthorityLevel | null;

  readonly effects: readonly EffectView[];
  readonly guardrails: readonly GuardrailEngagement[];
  readonly provenance: readonly ProvenanceGroup[];
  readonly next: readonly NextMove[];
  /** True when the case has finished and no declared move can leave this state. */
  readonly terminal: boolean;
}

export interface JourneyStop {
  readonly state: string;
  readonly label: string;
  readonly kind: StateKind;
  /** Index of the moment that first put the case in this state. */
  readonly momentIndex: number;
}

export interface IncidentOutcome {
  readonly subject: string | null;
  readonly finalState: string;
  readonly finalStateLabel: string;
  readonly finalStateKind: StateKind;
  readonly finalStateDescription: string;
  readonly expectedFinalState: string;
  readonly matchedExpectation: boolean;
  readonly customerFacingExecuted: number;
  readonly withheld: number;
  readonly uncertain: number;
  readonly personInvolved: boolean;
  readonly awaitingHuman: string | null;
  readonly stillUnknown: readonly string[];
  readonly boundedJudgments: number;
  readonly deterministicDecisions: number;
  readonly refusedTransitions: number;
}

export interface Journey {
  readonly scenarioSlug: string;
  readonly scenarioTitle: string;
  readonly scenarioSummary: string;
  readonly demonstrates: readonly string[];
  readonly moments: readonly JourneyMoment[];
  readonly stops: readonly JourneyStop[];
  readonly outcome: IncidentOutcome;
}

/** Names the lead this run is about, when the run actually established one. */
function subjectOf(facts: Readonly<Record<string, string>>): string | null {
  const name = facts['contactName'];
  const company = facts['company'];
  if (name !== undefined && company !== undefined) return `${name} · ${company}`;
  return name ?? company ?? null;
}

export function deriveJourney(
  system: SystemDefinition,
  run: EngineRun,
  scenario: { readonly slug: string; readonly title: string; readonly summary: string; readonly demonstrates: readonly string[]; readonly expectedFinalState: string },
): Journey {
  const stateById = new Map(system.lifecycle.states.map((state) => [state.id, state]));
  const outgoing = new Map<string, NextMove[]>();
  for (const rule of system.lifecycle.transitions) {
    const target = stateById.get(rule.to);
    const move: NextMove = {
      ruleId: rule.id,
      to: rule.to,
      toLabel: target?.label ?? rule.to,
      trigger: rule.trigger,
      guard: rule.guard,
      mechanism: rule.mechanism,
      authority: rule.authority,
    };
    outgoing.set(rule.from, [...(outgoing.get(rule.from) ?? []), move]);
  }

  const moments: JourneyMoment[] = run.timeline.map((entry, index) => {
    const previous = index === 0 ? undefined : run.timeline[index - 1];
    // The engine records `from` on every transition it considered, accepted or not, so it
    // is the authoritative prior state. Only a step that requested no move at all needs
    // the previous entry's result.
    const stateBefore = entry.transitions[0]?.from ?? previous?.stateAfter ?? entry.stateAfter;
    const effects = entry.sideEffects.map(toEffectView);
    const decisions = entry.decisions.map(toDecisionView);
    const state = stateById.get(entry.stateAfter);
    const kind: StateKind = state?.kind ?? 'ACTIVE';
    const authorities = entry.decisions.map((decision) => decision.authority);

    return {
      id: entry.id,
      index,
      stepLabel: entry.stepLabel,
      summary: entry.summary,
      atOffsetSeconds: entry.atOffsetSeconds,
      eventType: entry.event.type,
      eventSource: entry.event.source,
      correlationId: entry.event.correlationId,
      stateBefore,
      stateAfter: entry.stateAfter,
      stateAfterLabel: state?.label ?? entry.stateAfter,
      stateAfterKind: kind,
      stateChanged: stateBefore !== entry.stateAfter,
      transitions: entry.transitions,
      hasRefusedTransition: entry.transitions.some((transition) => !transition.accepted),
      decisions,
      mechanisms: [...new Set(entry.decisions.map((decision) => decision.mechanism))],
      authority: authorities.length === 0 ? null : (Math.max(...authorities) as AuthorityLevel),
      effects,
      guardrails: collectGuardrails(entry.transitions, entry.decisions, effects),
      provenance: collectProvenance(entry, entry.decisions, effects, entry.verifications),
      next: outgoing.get(entry.stateAfter) ?? [],
      terminal: isTerminal(kind),
    };
  });

  // The path actually taken: consecutive duplicates collapsed, so the ribbon shows moves
  // rather than one chip per processing step.
  const stops: JourneyStop[] = [];
  for (const moment of moments) {
    const last = stops.at(-1);
    if (last !== undefined && last.state === moment.stateAfter) continue;
    const state = stateById.get(moment.stateAfter);
    stops.push({
      state: moment.stateAfter,
      label: state?.label ?? moment.stateAfter,
      kind: state?.kind ?? 'ACTIVE',
      momentIndex: moment.index,
    });
  }

  const allEffects = moments.flatMap((moment) => moment.effects);
  const finalState = stateById.get(run.finalState.lifecycleState);

  return {
    scenarioSlug: scenario.slug,
    scenarioTitle: scenario.title,
    scenarioSummary: scenario.summary,
    demonstrates: scenario.demonstrates,
    moments,
    stops,
    outcome: {
      subject: subjectOf(run.finalState.facts),
      finalState: run.finalState.lifecycleState,
      finalStateLabel: finalState?.label ?? run.finalState.lifecycleState,
      finalStateKind: finalState?.kind ?? 'ACTIVE',
      finalStateDescription: finalState?.description ?? '',
      expectedFinalState: scenario.expectedFinalState,
      matchedExpectation: run.finalState.lifecycleState === scenario.expectedFinalState,
      customerFacingExecuted: allEffects.filter((effect) => effect.customerFacing && effect.disposition === 'EXECUTED').length,
      withheld: allEffects.filter((effect) => effect.disposition === 'WITHHELD').length,
      uncertain: allEffects.filter((effect) => effect.disposition === 'UNCERTAIN').length,
      personInvolved: moments.some((moment) => moment.mechanisms.includes('HUMAN_DECISION')),
      awaitingHuman: run.finalState.awaitingHuman,
      stillUnknown: run.finalState.missingInformation,
      boundedJudgments: run.decisions.filter((decision) => decision.mechanism === 'BOUNDED_AI_JUDGMENT').length,
      deterministicDecisions: run.decisions.filter((decision) => decision.mechanism === 'DETERMINISTIC_RULE').length,
      refusedTransitions: run.transitions.filter((transition) => !transition.accepted).length,
    },
  };
}
