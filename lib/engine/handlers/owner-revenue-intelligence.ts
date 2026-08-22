import { z } from 'zod';
import { numberParam } from '@/lib/model/profile';
import type { DecisionRecord } from '@/lib/model/runtime';
import type { HandlerContext, HandlerOutcome, HandlerStep, ProposedEffect, SystemHandlers } from '../types';

/**
 * OWNER REVENUE INTELLIGENCE AGENT — operating logic.
 *
 * TRIGGER -> DECISION -> ACTION -> GUARDRAIL -> OUTCOME, concretely:
 *
 *   `owner.signals.evaluated`  — the scheduled analysis window. Every input carries its own
 *                                source system, a report timestamp, and a declared
 *                                worsening direction. Freshness is a transition guard
 *                                (STALE_DATA_FLAGGED), not an annotation: a stale input
 *                                blocks the conclusion rather than being used anyway.
 *                                Variance against baseline, and whether independent
 *                                evidence corroborates it, are both DETERMINISTIC; only
 *                                composing the owner-facing explanation and candidate
 *                                action is a BOUNDED_AI_JUDGMENT, and only after
 *                                corroboration — never from the primary observation alone.
 *   `human.decision.recorded`  — the owner accepting or dismissing a routed recommendation.
 *                                The only event this system ever receives that carries any
 *                                authority above RECOMMEND, because deciding is the one
 *                                action this system never takes itself.
 *
 * This system's own authority ceiling is 1 (RECOMMEND) end to end. The single proposed
 * side effect below is authority 1 by construction, so the engine core's own authority
 * gate (`lib/engine/reducer.ts`) refuses it automatically — the guarantee "this system
 * never acts on its own" is enforced by code this handler cannot see, let alone bypass.
 *
 * Transition legality, idempotency, and the authority gate are NOT implemented here. They
 * live in the engine core so this handler cannot bypass them.
 */

// ---------------------------------------------------------------------------
// The bounded judgment's closed set
// ---------------------------------------------------------------------------

export const OR_RECOMMENDATION_CLASSES = [
  'INVESTIGATE_COLLECTION_PROCESS',
  'REVIEW_PRICING_OR_TERMS',
  'ESCALATE_CONCENTRATION_RISK',
  'MONITOR_ONLY',
] as const;
export type RecommendationClass = (typeof OR_RECOMMENDATION_CLASSES)[number];

// ---------------------------------------------------------------------------
// Payload contracts
// ---------------------------------------------------------------------------

const InputObservationSchema = z.object({
  metricId: z.string().min(1),
  sourceSystem: z.string().min(1),
  value: z.number(),
  baselineValue: z.number(),
  /** When this figure was reported by its own source system — never a clock read here. */
  reportedAt: z.string().min(1),
  /** False models a source system reporting a freshness/read failure, not merely an old value. */
  available: z.boolean(),
  /** Which direction of movement would indicate a worsening condition for this metric. */
  worseningDirection: z.enum(['UP', 'DOWN']),
  /** True only when composing this figure would require aggregating across client accounts. */
  requiresCrossClientAggregation: z.boolean().optional(),
});
type ObservedInput = z.infer<typeof InputObservationSchema>;

const JudgmentRequestSchema = z.object({
  judgmentId: z.string().min(1),
  objective: z.string().min(1),
  input: z.string().min(1),
  permittedClassifications: z.array(z.string().min(1)).min(2),
  requiredFields: z.array(z.string().min(1)),
});

const AnalysisWindowPayloadSchema = z.object({
  primaryObservation: InputObservationSchema,
  contextObservations: z.array(InputObservationSchema),
  corroboratingObservations: z.array(InputObservationSchema),
  /** Present only when the primary observation could plausibly reach a judgment this event. */
  judgment: JudgmentRequestSchema.optional(),
});
type AnalysisWindowPayload = z.infer<typeof AnalysisWindowPayloadSchema>;

const HumanDecisionPayloadSchema = z.object({
  decidedBy: z.string().min(1),
  decision: z.enum(['ACKNOWLEDGE_RECOMMENDATION', 'DISMISS_EXCEPTION']),
  rationale: z.string().min(1),
});

// ---------------------------------------------------------------------------
// Serialisation into EngineState.facts
// ---------------------------------------------------------------------------

const ANALYSIS_FACT_KEY = 'analysisRecordJson';
const EXCEPTION_FACT_KEY = 'exceptionRecordJson';
const RECOMMENDATION_FACT_KEY = 'recommendationRecordJson';

function writeAnalysis(record: AnalysisWindowPayload): Record<string, string> {
  return { [ANALYSIS_FACT_KEY]: JSON.stringify(record) };
}

interface ExceptionRecord {
  readonly metricId: string;
  readonly variancePct: number;
  readonly corroboratingMetricId: string;
  readonly corroboratingVariancePct: number;
  readonly limitations: string;
}

function writeException(record: ExceptionRecord): Record<string, string> {
  return { [EXCEPTION_FACT_KEY]: JSON.stringify(record) };
}

interface RecommendationRecord {
  readonly classification: RecommendationClass;
  readonly rationaleSummary: string;
  readonly confidence: number;
}

function writeRecommendation(record: RecommendationRecord): Record<string, string> {
  return { [RECOMMENDATION_FACT_KEY]: JSON.stringify(record) };
}

// ---------------------------------------------------------------------------
// Pure computation — no clock, no randomness
// ---------------------------------------------------------------------------

/** Pure date-string arithmetic — no clock read. Same inputs always produce the same output. */
export function inputAgeHours(evaluatedAt: string, reportedAt: string): number {
  return (new Date(evaluatedAt).getTime() - new Date(reportedAt).getTime()) / 3_600_000;
}

export function isObservationFresh(obs: ObservedInput, evaluatedAt: string, toleranceHours: number): boolean {
  if (!obs.available) return false;
  return inputAgeHours(evaluatedAt, obs.reportedAt) <= toleranceHours;
}

/** Signed period-over-period variance, as a percentage of baseline. */
export function computeVariancePct(value: number, baseline: number): number {
  if (baseline === 0) return value === 0 ? 0 : 100;
  return ((value - baseline) / baseline) * 100;
}

/** Whether a variance moves in the direction this specific metric declares as worsening. */
export function isWorsening(obs: ObservedInput, variancePct: number): boolean {
  return obs.worseningDirection === 'UP' ? variancePct > 0 : variancePct < 0;
}

function staleInputs(observations: readonly ObservedInput[], evaluatedAt: string, toleranceHours: number): readonly ObservedInput[] {
  return observations.filter((o) => !isObservationFresh(o, evaluatedAt, toleranceHours));
}

function decision(partial: DecisionRecord): DecisionRecord {
  return partial;
}

// ---------------------------------------------------------------------------
// owner.signals.evaluated
// ---------------------------------------------------------------------------

function handleSignalsEvaluated(ctx: HandlerContext): HandlerOutcome {
  const { event, state, profile, judgments } = ctx;
  const id = (suffix: string) => `${event.eventId}:${suffix}`;
  const steps: HandlerStep[] = [];

  const parsed = AnalysisWindowPayloadSchema.safeParse(event.payload);
  if (!parsed.success) {
    return {
      steps: [
        {
          id: id('validate-fail'),
          label: 'Signals evaluated',
          atOffsetSeconds: 0,
          summary: 'Analysis window payload failed schema validation. No comparison was attempted.',
          decisions: [
            decision({
              id: id('d-validate-fail'),
              eventId: event.eventId,
              mechanism: 'DETERMINISTIC_RULE',
              objective: 'Confirm the inbound analysis payload conforms to the declared schema before any comparison is attempted.',
              relevantState: state.lifecycleState,
              evidenceRefs: ['event.payload'],
              deterministicFacts: [{ label: 'Validation errors', value: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') }],
              missingInformation: [],
              permittedActions: ['retain_raw_payload'],
              forbiddenActions: ['compute_variance_on_invalid_input'],
              selectedAction: 'retain_raw_payload',
              applicablePolicy: ['A malformed analysis payload never produces an exception or a recommendation.'],
              escalationReason: 'Payload could not be validated against the declared schema.',
              authority: 0,
            }),
          ],
          effects: [],
          verifications: [],
        },
      ],
    };
  }

  const record = parsed.data;
  const toleranceHours = numberParam(profile, 'inputStalenessToleranceHours');
  const allObservations = [record.primaryObservation, ...record.contextObservations, ...record.corroboratingObservations];
  const stale = staleInputs(allObservations, event.occurredAt, toleranceHours);

  // --- Only SIGNALS_COLLECTED and STALE_DATA_FLAGGED are on the intake path ---
  if (state.lifecycleState !== 'SIGNALS_COLLECTED' && state.lifecycleState !== 'STALE_DATA_FLAGGED') {
    return {
      steps: [
        {
          id: id('not-applicable'),
          label: 'Signals evaluated',
          atOffsetSeconds: 0,
          summary: `This incident is already in ${state.lifecycleState}, past the intake path. A further analysis event does not reopen or re-evaluate it.`,
          decisions: [
            decision({
              id: id('d-not-applicable'),
              eventId: event.eventId,
              mechanism: 'DETERMINISTIC_RULE',
              objective: 'Refuse to re-evaluate an incident that has already left the freshness/baseline intake path.',
              relevantState: state.lifecycleState,
              evidenceRefs: [`state.lifecycleState=${state.lifecycleState}`],
              deterministicFacts: [{ label: 'Current state', value: state.lifecycleState }],
              missingInformation: [],
              permittedActions: ['record_informational_only'],
              forbiddenActions: ['reopen_a_resolved_or_in_flight_exception', 'alert_again_for_an_already_owned_condition'],
              selectedAction: 'record_informational_only',
              applicablePolicy: ['A previously resolved or already-owned condition is never re-alerted by a later or duplicate evaluation.'],
              authority: 0,
            }),
          ],
          effects: [],
          verifications: [],
        },
      ],
    };
  }

  const firstPass = state.lifecycleState === 'SIGNALS_COLLECTED';

  if (firstPass) {
    steps.push({
      id: id('intake'),
      label: 'Signals collected',
      atOffsetSeconds: 0,
      transitionTo: 'FRESHNESS_CHECKED',
      summary: `${allObservations.length} input(s) received, each carrying a source system and a report timestamp.`,
      decisions: [
        decision({
          id: id('d-intake'),
          eventId: event.eventId,
          mechanism: 'DETERMINISTIC_RULE',
          objective: 'Confirm every input carries a source reference and a timestamp before any freshness or variance judgment is made.',
          relevantState: 'SIGNALS_COLLECTED',
          evidenceRefs: allObservations.map((o) => `${o.metricId}@${o.sourceSystem}`),
          deterministicFacts: [{ label: 'Inputs received', value: String(allObservations.length) }],
          missingInformation: [],
          permittedActions: ['proceed_to_freshness_check'],
          forbiddenActions: ['compare_against_baseline_before_freshness_is_confirmed'],
          selectedAction: 'proceed_to_freshness_check',
          applicablePolicy: ['Every input must resolve to a source record before it is used in any conclusion.'],
          authority: 3,
        }),
      ],
      effects: [],
      verifications: [],
      statePatch: { facts: writeAnalysis(record) },
    });

    if (stale.length > 0) {
      steps.push({
        id: id('stale'),
        label: 'Stale data flagged',
        atOffsetSeconds: 1,
        transitionTo: 'STALE_DATA_FLAGGED',
        summary: `${stale.length} input(s) exceed the ${toleranceHours}h staleness tolerance or are unavailable: ${stale.map((o) => o.metricId).join(', ')}. No conclusion is drawn from stale data.`,
        decisions: [
          decision({
            id: id('d-stale'),
            eventId: event.eventId,
            mechanism: 'DETERMINISTIC_RULE',
            objective: 'Block the analysis rather than concluding on an input older than the configured tolerance or reported unavailable.',
            relevantState: 'FRESHNESS_CHECKED',
            evidenceRefs: stale.map((o) => `${o.metricId}.reportedAt=${o.reportedAt}`),
            deterministicFacts: stale.map((o) => ({ label: `${o.metricId} age (hours)`, value: o.available ? inputAgeHours(event.occurredAt, o.reportedAt).toFixed(1) : 'unavailable' })),
            missingInformation: stale.map((o) => o.metricId),
            permittedActions: ['flag_input_as_stale', 'hold_for_refresh'],
            forbiddenActions: ['compare_against_baseline_on_stale_input', 'surface_a_conclusion_from_incomplete_data'],
            selectedAction: 'flag_input_as_stale',
            applicablePolicy: ['CLIENT_POLICY kestrel-analysis-freshness: an input older than the configured tolerance blocks the analysis rather than being used anyway.'],
            authority: 1,
          }),
        ],
        effects: [],
        verifications: [],
      });
      return { steps };
    }

    steps.push(freshnessPassStep(id, event, 'or-t03', 'SIGNALS_COLLECTED'));
  } else {
    // STALE_DATA_FLAGGED — a refresh attempt.
    if (stale.length > 0) {
      steps.push({
        id: id('refresh-failed'),
        label: 'Refresh failed',
        atOffsetSeconds: 0,
        transitionTo: 'INSUFFICIENT_EVIDENCE',
        summary: `${stale.length} input(s) still exceed the staleness tolerance after this refresh attempt: ${stale.map((o) => o.metricId).join(', ')}. Recorded as insufficient evidence rather than concluding on an incomplete picture.`,
        decisions: [
          decision({
            id: id('d-refresh-failed'),
            eventId: event.eventId,
            mechanism: 'DETERMINISTIC_RULE',
            objective: 'Refuse to conclude when a refresh attempt still cannot establish a fresh reading for every input.',
            relevantState: 'STALE_DATA_FLAGGED',
            evidenceRefs: stale.map((o) => `${o.metricId}.reportedAt=${o.reportedAt}`),
            deterministicFacts: stale.map((o) => ({ label: `${o.metricId} still stale or unavailable`, value: 'true' })),
            missingInformation: stale.map((o) => o.metricId),
            permittedActions: ['record_insufficient_evidence'],
            forbiddenActions: ['conclude_on_a_partial_refresh'],
            selectedAction: 'record_insufficient_evidence',
            applicablePolicy: ['CLIENT_POLICY kestrel-analysis-freshness: a refresh that does not establish freshness for every input still blocks the conclusion.'],
            authority: 1,
          }),
        ],
        effects: [],
        verifications: [],
        statePatch: { facts: writeAnalysis(record) },
      });
      return { steps };
    }

    steps.push(freshnessPassStep(id, event, 'or-t04', 'STALE_DATA_FLAGGED'));
  }

  // --- Baseline comparison ---
  const primary = record.primaryObservation;
  const variancePct = computeVariancePct(primary.value, primary.baselineValue);
  const threshold = numberParam(profile, 'exceptionVarianceThresholdPct');
  const exceedsThreshold = Math.abs(variancePct) >= threshold;

  if (!exceedsThreshold) {
    steps.push({
      id: id('dismissed'),
      label: 'Dismissed',
      atOffsetSeconds: steps.length,
      transitionTo: 'DISMISSED',
      summary: `${primary.metricId} moved ${variancePct.toFixed(1)}% against baseline, within the configured ${threshold}% materiality threshold. Recorded as evaluated and not material — not surfaced as a false alarm.`,
      decisions: [
        decision({
          id: id('d-dismissed'),
          eventId: event.eventId,
          mechanism: 'DETERMINISTIC_RULE',
          objective: 'Compare observed variance against the configured materiality threshold before treating any movement as an exception.',
          relevantState: 'BASELINE_COMPARED',
          evidenceRefs: [`${primary.metricId}.value=${primary.value}`, `${primary.metricId}.baselineValue=${primary.baselineValue}`],
          deterministicFacts: [
            { label: 'Observed variance', value: `${variancePct.toFixed(1)}%` },
            { label: 'Materiality threshold', value: `${threshold}%` },
          ],
          missingInformation: [],
          permittedActions: ['record_variance_within_threshold'],
          forbiddenActions: ['surface_normal_variation_as_an_exception'],
          selectedAction: 'record_variance_within_threshold',
          applicablePolicy: ['CLIENT_POLICY kestrel-exception-materiality: variance within the configured threshold is recorded as evaluated, never surfaced.'],
          authority: 3,
        }),
      ],
      effects: [],
      verifications: [],
    });
    return { steps };
  }

  steps.push({
    id: id('exception-candidate'),
    label: 'Exception candidate',
    atOffsetSeconds: steps.length,
    transitionTo: 'EXCEPTION_CANDIDATE',
    summary: `${primary.metricId} moved ${variancePct.toFixed(1)}% against baseline, exceeding the configured ${threshold}% materiality threshold. Not yet corroborated.`,
    decisions: [
      decision({
        id: id('d-exception-candidate'),
        eventId: event.eventId,
        mechanism: 'DETERMINISTIC_RULE',
        objective: 'Compare observed variance against the configured materiality threshold before treating any movement as an exception.',
        relevantState: 'BASELINE_COMPARED',
        evidenceRefs: [`${primary.metricId}.value=${primary.value}`, `${primary.metricId}.baselineValue=${primary.baselineValue}`],
        deterministicFacts: [
          { label: 'Observed variance', value: `${variancePct.toFixed(1)}%` },
          { label: 'Materiality threshold', value: `${threshold}%` },
        ],
        missingInformation: [],
        permittedActions: ['raise_exception_candidate'],
        forbiddenActions: ['surface_a_candidate_before_corroboration'],
        selectedAction: 'raise_exception_candidate',
        applicablePolicy: ['CLIENT_POLICY kestrel-exception-materiality: variance exceeding the configured threshold is raised as a candidate, never surfaced directly.'],
        authority: 1,
      }),
    ],
    effects: [],
    verifications: [],
  });

  // --- Corroboration ---
  const policyExcluded = record.corroboratingObservations.filter((o) => o.requiresCrossClientAggregation === true);
  const admissible = record.corroboratingObservations.filter((o) => o.requiresCrossClientAggregation !== true);

  steps.push({
    id: id('corroborating'),
    label: 'Corroborating',
    atOffsetSeconds: steps.length,
    transitionTo: 'CORROBORATING',
    summary: `Seeking independent supporting evidence from ${record.corroboratingObservations.length} candidate source(s) before surfacing anything.`,
    decisions: [
      decision({
        id: id('d-corroborating'),
        eventId: event.eventId,
        mechanism: 'DETERMINISTIC_RULE',
        objective: 'Confirm at least one independent corroborating source is identified for this metric before evaluating whether it actually supports the variance.',
        relevantState: 'EXCEPTION_CANDIDATE',
        evidenceRefs: record.corroboratingObservations.map((o) => `${o.metricId}@${o.sourceSystem}`),
        deterministicFacts: [{ label: 'Candidate corroborating sources', value: String(record.corroboratingObservations.length) }],
        missingInformation: [],
        permittedActions: ['seek_independent_corroboration'],
        forbiddenActions: ['surface_a_single-source_exception'],
        selectedAction: 'seek_independent_corroboration',
        applicablePolicy: ['No exception is surfaced from a single source. Independent corroboration is required first.'],
        authority: 1,
      }),
    ],
    effects: [],
    verifications: [],
  });

  const agreeing = admissible.filter((o) => isWorsening(o, computeVariancePct(o.value, o.baselineValue)));

  if (agreeing.length === 0) {
    const reason =
      policyExcluded.length > 0 && admissible.length === 0
        ? `The only candidate corroborating source(s) — ${policyExcluded.map((o) => o.metricId).join(', ')} — would require aggregating data across client accounts, which CLIENT_POLICY kestrel-evidence-confidentiality forbids. Excluded from consideration rather than used.`
        : 'None of the admissible candidate sources independently confirm the variance is worsening.';
    steps.push({
      id: id('insufficient-evidence'),
      label: 'Insufficient evidence',
      atOffsetSeconds: steps.length,
      transitionTo: 'INSUFFICIENT_EVIDENCE',
      summary: `The variance in ${primary.metricId} was real but could not be corroborated. ${reason} Recorded rather than surfaced as a finding.`,
      decisions: [
        decision({
          id: id('d-insufficient-evidence'),
          eventId: event.eventId,
          mechanism: 'DETERMINISTIC_RULE',
          objective: 'Refuse to surface a variance that could not be independently corroborated, regardless of how material it looked in isolation.',
          relevantState: 'CORROBORATING',
          evidenceRefs: record.corroboratingObservations.map((o) => `${o.metricId}@${o.sourceSystem}`),
          deterministicFacts: [
            { label: 'Admissible candidate sources', value: String(admissible.length) },
            { label: 'Excluded by aggregation policy', value: String(policyExcluded.length) },
            { label: 'Agreeing sources', value: String(agreeing.length) },
          ],
          missingInformation: [`independent corroboration for ${primary.metricId}`],
          permittedActions: ['record_insufficient_evidence'],
          forbiddenActions: ['surface_an_uncorroborated_variance', 'aggregate_confidential_data_across_client_accounts'],
          selectedAction: 'record_insufficient_evidence',
          applicablePolicy: [
            'A variance without independent corroboration is recorded, never surfaced as a finding.',
            ...(policyExcluded.length > 0 ? ['CLIENT_POLICY kestrel-evidence-confidentiality: client control and evidence data is never aggregated across clients.'] : []),
          ],
          authority: policyExcluded.length > 0 ? 2 : 1,
        }),
      ],
      effects: [],
      verifications: [],
    });
    return { steps };
  }

  const corroborator = agreeing[0]!;
  const corroboratorVariance = computeVariancePct(corroborator.value, corroborator.baselineValue);

  steps.push({
    id: id('exception-surfaced'),
    label: 'Exception surfaced',
    atOffsetSeconds: steps.length,
    transitionTo: 'EXCEPTION_SURFACED',
    summary: `${primary.metricId} (${variancePct.toFixed(1)}%) is independently corroborated by ${corroborator.metricId} (${corroboratorVariance.toFixed(1)}%, from ${corroborator.sourceSystem}). Every figure resolves to a source record.`,
    decisions: [
      decision({
        id: id('d-exception-surfaced'),
        eventId: event.eventId,
        mechanism: 'DETERMINISTIC_RULE',
        objective: 'Surface the exception once independent evidence supports the variance and every figure resolves to a named source record.',
        relevantState: 'CORROBORATING',
        evidenceRefs: [`${primary.metricId}@${primary.sourceSystem}`, `${corroborator.metricId}@${corroborator.sourceSystem}`],
        deterministicFacts: [
          { label: 'Primary variance', value: `${variancePct.toFixed(1)}%` },
          { label: 'Corroborating variance', value: `${corroboratorVariance.toFixed(1)}%` },
          { label: 'Corroborating source', value: corroborator.sourceSystem },
        ],
        missingInformation: [],
        permittedActions: ['surface_corroborated_exception'],
        forbiddenActions: ['assert_a_cause_for_the_variance', 'present_a_candidate_factor_as_confirmed'],
        selectedAction: 'surface_corroborated_exception',
        applicablePolicy: ['LAB_TARGET or-lab-no-metric-without-provenance: no figure is surfaced without a definition, a source, and a freshness timestamp.'],
        authority: 1,
      }),
    ],
    effects: [],
    verifications: [],
    statePatch: {
      facts: writeException({
        metricId: primary.metricId,
        variancePct,
        corroboratingMetricId: corroborator.metricId,
        corroboratingVariancePct: corroboratorVariance,
        limitations: 'Corroboration confirms the variance is real and independently observed; it does not by itself establish what caused it.',
      }),
    },
  });

  // --- Bounded judgment: compose the recommendation, never as fact ---
  if (record.judgment === undefined) {
    steps.push({
      id: id('no-judgment-request'),
      label: 'Recommendation',
      atOffsetSeconds: steps.length,
      summary: 'No judgment was requested for this exception. Held at EXCEPTION_SURFACED for a person.',
      decisions: [
        decision({
          id: id('d-no-judgment-request'),
          eventId: event.eventId,
          mechanism: 'DETERMINISTIC_RULE',
          objective: 'Decide what to do when a corroborated exception carries no request for a bounded judgment.',
          relevantState: 'EXCEPTION_SURFACED',
          evidenceRefs: [],
          deterministicFacts: [],
          missingInformation: ['recommendation'],
          permittedActions: ['route_to_human'],
          forbiddenActions: ['compose_a_recommendation_without_a_judgment_request'],
          selectedAction: 'route_to_human',
          applicablePolicy: ['A corroborated exception with no judgment request is held for a person rather than left to compose one unprompted.'],
          escalationReason: 'No judgment request accompanied this exception.',
          authority: 2,
        }),
      ],
      effects: [],
      verifications: [],
      statePatch: { awaitingHuman: 'Corroborated exception with no judgment request' },
    });
    return { steps };
  }

  const judgmentReq = record.judgment;
  const resolved = judgments.get(judgmentReq.judgmentId);

  if (resolved === undefined || resolved.status !== 'OK') {
    const reason = resolved === undefined ? 'No bounded judgment was resolved for this event.' : resolved.reason;
    steps.push({
      id: id('judgment-fail'),
      label: 'Recommendation',
      atOffsetSeconds: steps.length,
      summary: 'The bounded judgment was unavailable or violated its output contract. Held for a person; no recommendation was recorded.',
      decisions: [
        decision({
          id: id('d-judgment-fail'),
          eventId: event.eventId,
          mechanism: 'DETERMINISTIC_RULE',
          objective: 'Decide what to do when recommendation composition is unavailable.',
          relevantState: 'EXCEPTION_SURFACED',
          evidenceRefs: ['decision_provider.result'],
          deterministicFacts: [
            { label: 'Provider outcome', value: resolved?.status ?? 'MISSING' },
            { label: 'Reason', value: reason },
          ],
          missingInformation: ['recommendation'],
          permittedActions: ['route_to_human'],
          forbiddenActions: ['guess_a_recommendation', 'promote_to_action_recommended_without_a_valid_judgment'],
          selectedAction: 'route_to_human',
          applicablePolicy: ['An unavailable or contract-violating judgment routes to a person; it is never coerced into a usable recommendation.'],
          escalationReason: reason,
          authority: 2,
        }),
      ],
      effects: [],
      verifications: [],
      statePatch: { awaitingHuman: 'Recommendation judgment unavailable' },
    });
    return { steps };
  }

  const judgment = resolved.result;
  const floor = numberParam(profile, 'confidenceFloor');

  steps.push({
    id: id('judgment'),
    label: 'Recommendation composed',
    atOffsetSeconds: steps.length,
    summary: `Recommendation composed as ${judgment.classification} at confidence ${judgment.confidence.toFixed(2)}.`,
    decisions: [
      decision({
        id: id('d-judgment'),
        eventId: event.eventId,
        mechanism: 'BOUNDED_AI_JUDGMENT',
        objective: 'Compose a plain-language explanation of what this corroborated exception means and propose a candidate action for the owner to consider.',
        relevantState: 'EXCEPTION_SURFACED',
        evidenceRefs: judgment.evidenceRefs,
        deterministicFacts: [
          { label: 'Permitted recommendation classes', value: OR_RECOMMENDATION_CLASSES.join(', ') },
          { label: 'Returned class', value: judgment.classification },
        ],
        classification: judgment.classification,
        confidence: judgment.confidence,
        missingInformation: judgment.missingInformation,
        permittedActions: ['return_classification_within_permitted_set', 'compose_plain_language_explanation'],
        forbiddenActions: ['assert_a_causal_explanation', 'present_the_recommendation_as_an_observed_fact', 'execute_any_business_action'],
        selectedAction: 'return_classification',
        applicablePolicy: ['LAB_TARGET or-lab-no-causal-claim: no causal explanation is asserted; contributing factors are presented as candidates.'],
        evaluatorResult: `Declined to infer: ${judgment.declinedToInfer.length > 0 ? judgment.declinedToInfer.join('; ') : 'nothing'}`,
        authority: 1,
        providerId: 'fixture-decision-provider',
      }),
    ],
    effects: [],
    verifications: [],
  });

  if (judgment.confidence < floor) {
    steps.push({
      id: id('below-floor'),
      label: 'Recommendation',
      atOffsetSeconds: steps.length,
      summary: `Confidence ${judgment.confidence.toFixed(2)} is below the configured floor of ${floor.toFixed(2)}. Held for a person; nothing was recorded as a recommendation.`,
      decisions: [
        decision({
          id: id('d-below-floor'),
          eventId: event.eventId,
          mechanism: 'DETERMINISTIC_RULE',
          objective: 'Compare returned confidence against the configured floor, outside the judgment itself, before promoting any recommendation.',
          relevantState: 'EXCEPTION_SURFACED',
          evidenceRefs: ['judgment.confidence'],
          deterministicFacts: [
            { label: 'Returned confidence', value: judgment.confidence.toFixed(2) },
            { label: 'Configured floor', value: floor.toFixed(2) },
          ],
          missingInformation: judgment.missingInformation,
          permittedActions: ['route_to_human'],
          forbiddenActions: ['promote_a_below-floor_judgment_to_a_recommendation'],
          selectedAction: 'route_to_human',
          applicablePolicy: ['A recommendation below the confidence floor is never promoted; it is held for a person instead.'],
          escalationReason: `Confidence ${judgment.confidence.toFixed(2)} below floor ${floor.toFixed(2)}.`,
          authority: 2,
        }),
      ],
      effects: [],
      verifications: [],
      statePatch: { awaitingHuman: 'Recommendation judgment below confidence floor' },
    });
    return { steps };
  }

  steps.push({
    id: id('action-recommended'),
    label: 'Action recommended',
    atOffsetSeconds: steps.length,
    transitionTo: 'ACTION_RECOMMENDED',
    summary: `Recommendation recorded as ${judgment.classification}, structurally marked as a recommendation rather than an observed fact.`,
    decisions: [
      decision({
        id: id('d-action-recommended'),
        eventId: event.eventId,
        mechanism: 'DETERMINISTIC_RULE',
        objective: 'Promote a recommendation to ACTION_RECOMMENDED only once confidence is at or above the configured floor.',
        relevantState: 'EXCEPTION_SURFACED',
        evidenceRefs: ['judgment.confidence'],
        deterministicFacts: [{ label: 'Returned confidence', value: judgment.confidence.toFixed(2) }],
        missingInformation: [],
        permittedActions: ['promote_to_action_recommended'],
        forbiddenActions: ['promote_a_below-floor_judgment'],
        selectedAction: 'promote_to_action_recommended',
        applicablePolicy: ['LAB_TARGET or-lab-recommend-only: this system holds no authority above level 1 for any action.'],
        authority: 1,
      }),
    ],
    effects: [],
    verifications: [],
    statePatch: {
      facts: writeRecommendation({ classification: judgment.classification as RecommendationClass, rationaleSummary: judgment.rationaleSummary, confidence: judgment.confidence }),
    },
  });

  const notifyEffect: ProposedEffect = {
    id: id('effect:notify-owner'),
    kind: 'NOTIFICATION',
    description: `Notify the owner that a recommendation (${judgment.classification}) is ready for review on ${primary.metricId}.`,
    target: 'owner',
    idempotencyKey: `owner-notify:${event.correlationId}`,
    authority: 1,
    policyPermits: true,
  };

  steps.push({
    id: id('routed'),
    label: 'Routed to owner',
    atOffsetSeconds: steps.length,
    transitionTo: 'AWAITING_OWNER_DECISION',
    summary: 'Exception, evidence, freshness, limitations, and the recommendation are all present. Held for the owner; this system never acts on its own recommendation.',
    decisions: [
      decision({
        id: id('d-routed'),
        eventId: event.eventId,
        mechanism: 'DETERMINISTIC_RULE',
        objective: 'Confirm every required field is present before routing the recommendation to the owner for decision.',
        relevantState: 'ACTION_RECOMMENDED',
        evidenceRefs: [EXCEPTION_FACT_KEY, RECOMMENDATION_FACT_KEY],
        deterministicFacts: [{ label: 'Authority ceiling for this system', value: '1 (RECOMMEND)' }],
        missingInformation: [],
        permittedActions: ['route_to_owner'],
        forbiddenActions: ['execute_the_recommendation_autonomously', 'notify_or_act_above_authority_level_1'],
        selectedAction: 'route_to_owner',
        applicablePolicy: ['LAB_TARGET or-lab-recommend-only: authority is capped at RECOMMEND for the entire system.'],
        authority: 1,
      }),
    ],
    effects: [notifyEffect],
    verifications: [],
  });

  return { steps };
}

function freshnessPassStep(
  id: (suffix: string) => string,
  event: HandlerContext['event'],
  ruleTag: 'or-t03' | 'or-t04',
  fromLabel: string,
): HandlerStep {
  return {
    id: id(ruleTag === 'or-t03' ? 'fresh' : 'refreshed'),
    label: ruleTag === 'or-t03' ? 'Freshness checked' : 'Refresh succeeded',
    atOffsetSeconds: 1,
    transitionTo: 'BASELINE_COMPARED',
    summary:
      ruleTag === 'or-t03'
        ? 'Every input is within tolerance and complete. Proceeding to baseline comparison.'
        : 'Inputs refreshed within tolerance. Proceeding to baseline comparison.',
    decisions: [
      decision({
        id: id(ruleTag === 'or-t03' ? 'd-fresh' : 'd-refreshed'),
        eventId: event.eventId,
        mechanism: 'DETERMINISTIC_RULE',
        objective: 'Confirm every input is within the configured staleness tolerance before comparing against baseline.',
        relevantState: fromLabel,
        evidenceRefs: [],
        deterministicFacts: [],
        missingInformation: [],
        permittedActions: ['proceed_to_baseline_comparison'],
        forbiddenActions: ['compare_against_baseline_while_any_input_is_stale'],
        selectedAction: 'proceed_to_baseline_comparison',
        applicablePolicy: ['CLIENT_POLICY kestrel-analysis-freshness: all inputs within tolerance permits the comparison to proceed.'],
        authority: 3,
      }),
    ],
    effects: [],
    verifications: [],
  };
}

// ---------------------------------------------------------------------------
// human.decision.recorded
// ---------------------------------------------------------------------------

function handleHumanDecision(ctx: HandlerContext): HandlerOutcome {
  const { event, state, profile } = ctx;
  const id = (suffix: string) => `${event.eventId}:${suffix}`;
  const parsed = HumanDecisionPayloadSchema.safeParse(event.payload);

  if (!parsed.success) {
    return {
      steps: [
        {
          id: id('validate-fail'),
          label: 'Human decision',
          atOffsetSeconds: 0,
          summary: 'Human decision payload failed validation. No state change.',
          decisions: [
            decision({
              id: id('d-validate-fail'),
              eventId: event.eventId,
              mechanism: 'DETERMINISTIC_RULE',
              objective: 'Validate a recorded owner decision before applying it.',
              relevantState: state.lifecycleState,
              evidenceRefs: ['event.payload'],
              deterministicFacts: [{ label: 'Validation errors', value: parsed.error.issues.map((i) => i.message).join('; ') }],
              missingInformation: [],
              permittedActions: ['reject_decision'],
              forbiddenActions: ['apply_unvalidated_decision'],
              selectedAction: 'reject_decision',
              applicablePolicy: ['A decision is applied only when its record is complete.'],
              authority: 0,
            }),
          ],
          effects: [],
          verifications: [],
        },
      ],
    };
  }

  const humanDecision = parsed.data;
  const actor = profile.roles.find((r) => r.id === humanDecision.decidedBy);

  if (state.lifecycleState !== 'AWAITING_OWNER_DECISION') {
    return {
      steps: [
        {
          id: id('not-awaiting'),
          label: 'Human decision',
          atOffsetSeconds: 0,
          summary: `No recommendation is awaiting a decision on this incident (currently ${state.lifecycleState}). Nothing to record.`,
          decisions: [
            decision({
              id: id('d-not-awaiting'),
              eventId: event.eventId,
              mechanism: 'DETERMINISTIC_RULE',
              objective: 'Refuse to record an owner decision when no recommendation is currently awaiting one.',
              relevantState: state.lifecycleState,
              evidenceRefs: [`state.lifecycleState=${state.lifecycleState}`],
              deterministicFacts: [],
              missingInformation: [],
              permittedActions: ['reject_decision'],
              forbiddenActions: ['record_a_decision_against_a_recommendation_that_is_not_awaiting_one'],
              selectedAction: 'reject_decision',
              applicablePolicy: ['A decision is applied only while a recommendation is genuinely awaiting one.'],
              authority: 0,
            }),
          ],
          effects: [],
          verifications: [],
        },
      ],
    };
  }

  const sufficientAuthority = (actor?.authorityCeiling ?? 0) >= 2;
  const targetState = humanDecision.decision === 'ACKNOWLEDGE_RECOMMENDATION' ? 'DECISION_RECORDED' : 'DISMISSED';

  return {
    steps: [
      {
        id: id('resolved'),
        label: 'Human decision',
        atOffsetSeconds: 0,
        transitionTo: targetState,
        summary: `${actor?.name ?? humanDecision.decidedBy} ${humanDecision.decision === 'ACKNOWLEDGE_RECOMMENDATION' ? 'acknowledged the recommendation' : 'dismissed the exception'}. Recorded against the evidence that informed it.`,
        decisions: [
          decision({
            id: id('d-resolved'),
            eventId: event.eventId,
            mechanism: 'HUMAN_DECISION',
            objective: 'Record and apply the owner’s decision on a routed recommendation.',
            relevantState: 'AWAITING_OWNER_DECISION',
            evidenceRefs: ['event.payload.rationale'],
            deterministicFacts: [
              { label: 'Decided by', value: actor?.name ?? humanDecision.decidedBy },
              { label: 'Authority ceiling of this role', value: String(actor?.authorityCeiling ?? 'unknown') },
              { label: 'Decision', value: humanDecision.decision },
              { label: 'Rationale', value: humanDecision.rationale },
            ],
            missingInformation: [],
            permittedActions: ['record_owner_decision'],
            forbiddenActions: ['automate_this_decision'],
            selectedAction: 'record_owner_decision',
            applicablePolicy: ['Deciding any action arising from an exception is a human-only action.'],
            authority: 2,
          }),
        ],
        effects: [],
        verifications: [
          {
            id: id('v-authority'),
            eventId: event.eventId,
            check: 'Confirm the deciding role holds sufficient authority to record a decision on a routed recommendation.',
            result: sufficientAuthority ? 'PASS' : 'FAIL',
            detail: sufficientAuthority
              ? `${actor?.name ?? 'Role'} holds authority level ${actor?.authorityCeiling}, which permits this decision.`
              : `${actor?.name ?? humanDecision.decidedBy} does not hold sufficient authority.`,
          },
        ],
      },
    ],
  };
}

export const OWNER_REVENUE_INTELLIGENCE_HANDLERS: SystemHandlers = {
  systemId: 'owner-revenue-intelligence',
  initialState: 'SIGNALS_COLLECTED',
  handlers: {
    'owner.signals.evaluated': handleSignalsEvaluated,
    'human.decision.recorded': handleHumanDecision,
  },
};
