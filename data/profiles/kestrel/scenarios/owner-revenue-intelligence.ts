import { OR_RECOMMENDATION_CLASSES } from '@/lib/engine/handlers/owner-revenue-intelligence';
import { ScenarioSchema, type Scenario } from '@/lib/model/runtime';

/**
 * OWNER REVENUE INTELLIGENCE AGENT — Kestrel scenarios.
 *
 * Two scenarios, per the same discipline as the first five systems: a complex path
 * proving genuine judgment across several interacting signals, and a guardrail path
 * proving stale data blocks a conclusion and immaterial variance is correctly left alone.
 *
 * Scenario A's business shape is deliberately not "revenue dropped, alert the owner" — cash
 * collected falls sharply while revenue invoiced holds steady, which would misdiagnose as a
 * demand problem if read alone. Independent corroboration from a different source system
 * (days sales outstanding worsening) is what lets the exception surface as a collections
 * issue rather than a false alarm about sales.
 *
 * Scenario B reuses Kestrel's own declared referral-partner concentration figure
 * (`referralPartners.shareOfPipelinePct` in the profile) as the metric under evaluation: a
 * stale read is refreshed, and the refreshed figure turns out to be normal variation — not
 * surfaced as a false alarm.
 */

// ---------------------------------------------------------------------------
// Scenario A — cash collection quietly worsens while invoiced revenue looks fine
// ---------------------------------------------------------------------------

const CASH_JUDGMENT_ID = 'jud-or-cash-collection-001';

const CASH_JUDGMENT_INPUT =
  'Cash collected fell 29.5% against the prior period while revenue invoiced held steady (+3.4%). Independently, days sales outstanding rose 50% (34 to 51 days) in the same window, reported by the delivery workspace rather than the accounting system. Both figures resolve to a source record and neither input is stale.';

const scenarioA: Scenario = ScenarioSchema.parse({
  id: 'or-scenario-cash-collection-quietly-worsens',
  slug: 'cash-collection-quietly-worsens',
  systemId: 'owner-revenue-intelligence',
  title: 'Cash collection quietly worsens while invoiced revenue looks fine',
  summary:
    'A scheduled analysis window closes. Cash collected has fallen sharply against baseline while revenue invoiced held steady — read alone, this would misdiagnose as a demand problem. An independent signal from a different source system, days sales outstanding, is also worsening in the same window, which is what lets the variance surface as a genuine, corroborated exception rather than noise. A bounded judgment composes a plain-language explanation and a candidate action, structurally marked as a recommendation rather than fact, and the owner acknowledges it.',
  demonstrates: [
    'Freshness is checked before any comparison is drawn — every input carries a source and a timestamp',
    'A large variance in one metric is not surfaced until an independent source, from a different system, corroborates it',
    'Apparent topline stability (revenue invoiced) does not suppress a genuine exception in a different, corroborated metric (cash collected)',
    'The bounded judgment composes an explanation and a candidate action, never presenting either as an observed fact',
    'This system proposes a notification at authority level 1 and the engine core refuses it outright — the system recommends and never acts',
    'A recorded owner decision closes the loop against the evidence that informed it',
  ],
  events: [
    {
      eventId: 'evt-or-cash-001',
      correlationId: 'inc-or-cash-collection',
      entityId: 'metric-cash-collected-2026-07',
      type: 'owner.signals.evaluated',
      source: 'accounting-system',
      sourceEventId: 'window-2026-07-31-cash',
      occurredAt: '2026-07-31T18:00:00-04:00',
      receivedAt: '2026-07-31T18:00:05-04:00',
      schemaVersion: '2026-08-01',
      actor: 'SYSTEM',
      executionMode: 'SIMULATED',
      payload: {
        primaryObservation: {
          metricId: 'cash-collected',
          sourceSystem: 'accounting-system',
          value: 148_000,
          baselineValue: 210_000,
          reportedAt: '2026-07-31T12:00:00-04:00',
          available: true,
          worseningDirection: 'DOWN',
        },
        contextObservations: [
          {
            metricId: 'revenue-invoiced',
            sourceSystem: 'accounting-system',
            value: 215_000,
            baselineValue: 208_000,
            reportedAt: '2026-07-31T12:00:00-04:00',
            available: true,
            worseningDirection: 'DOWN',
          },
        ],
        corroboratingObservations: [
          {
            metricId: 'days-sales-outstanding',
            sourceSystem: 'workflow-store',
            value: 51,
            baselineValue: 34,
            reportedAt: '2026-07-31T09:00:00-04:00',
            available: true,
            worseningDirection: 'UP',
          },
        ],
        judgment: {
          judgmentId: CASH_JUDGMENT_ID,
          objective: 'Compose a plain-language explanation of this exception and propose a candidate action for the owner to consider.',
          input: CASH_JUDGMENT_INPUT,
          permittedClassifications: [...OR_RECOMMENDATION_CLASSES],
          requiredFields: [],
        },
      },
    },
    {
      eventId: 'evt-or-cash-002',
      correlationId: 'inc-or-cash-collection',
      entityId: 'metric-cash-collected-2026-07',
      type: 'human.decision.recorded',
      source: 'operator-console',
      sourceEventId: 'console-2026-08-03-cash',
      occurredAt: '2026-08-03T10:00:00-04:00',
      receivedAt: '2026-08-03T10:00:00-04:00',
      schemaVersion: '2026-08-01',
      actor: 'HUMAN',
      executionMode: 'SIMULATED',
      payload: {
        decidedBy: 'founder',
        decision: 'ACKNOWLEDGE_RECOMMENDATION',
        rationale: 'Agreed — asking the Head of Delivery to review the aging queue before next week’s close.',
      },
    },
  ],
  judgments: {
    [CASH_JUDGMENT_ID]: {
      judgmentId: CASH_JUDGMENT_ID,
      classification: 'INVESTIGATE_COLLECTION_PROCESS',
      confidence: 0.82,
      missingInformation: ['Which invoices or customers are driving the days-sales-outstanding increase'],
      evidenceRefs: ['cash-collected@accounting-system', 'days-sales-outstanding@workflow-store'],
      declinedToInfer: [
        'Which specific account or process step is responsible is not established by these figures alone.',
        'Whether this reflects a single large account or a broader pattern across clients.',
      ],
      rationaleSummary:
        'Cash collected fell sharply while revenue invoiced held steady, so the shortfall is not a demand problem. Days sales outstanding independently worsened in the same window from a different system, consistent with a collections or follow-up issue rather than weaker sales. Investigating the collection process is the better-supported next step than a pricing or demand review.',
    },
  },
  expectedFinalState: 'DECISION_RECORDED',
});

// ---------------------------------------------------------------------------
// Scenario B — a stale concentration read refreshes clean; normal variance is left alone
// ---------------------------------------------------------------------------

const scenarioB: Scenario = ScenarioSchema.parse({
  id: 'or-scenario-stale-concentration-read-dismissed',
  slug: 'stale-concentration-read-dismissed',
  systemId: 'owner-revenue-intelligence',
  title: 'Stale concentration read blocks the conclusion, then refreshes to normal variance',
  summary:
    'A scheduled window closes with a referral-partner concentration read that is far older than the configured staleness tolerance — the analysis is held rather than concluding on it. A refreshed read arrives within tolerance and shows only ordinary movement, well inside the configured materiality threshold, so it is correctly recorded as evaluated and left alone rather than surfaced as a false alarm.',
  demonstrates: [
    'An input older than the configured staleness tolerance blocks the conclusion rather than being used anyway',
    'A refreshed read that lands within tolerance allows the comparison to proceed',
    'Ordinary period-over-period variation is recorded as evaluated, never surfaced as an exception',
  ],
  events: [
    {
      eventId: 'evt-or-concentration-001',
      correlationId: 'inc-or-referral-concentration',
      entityId: 'metric-referral-concentration-2026-07',
      type: 'owner.signals.evaluated',
      source: 'crm',
      sourceEventId: 'window-2026-07-10-concentration',
      occurredAt: '2026-07-10T09:00:00-04:00',
      receivedAt: '2026-07-10T09:00:05-04:00',
      schemaVersion: '2026-08-01',
      actor: 'SYSTEM',
      executionMode: 'SIMULATED',
      payload: {
        primaryObservation: {
          metricId: 'referral-partner-pipeline-share',
          sourceSystem: 'crm',
          value: 29,
          baselineValue: 28,
          reportedAt: '2026-06-20T09:00:00-04:00',
          available: true,
          worseningDirection: 'UP',
        },
        contextObservations: [],
        corroboratingObservations: [],
      },
    },
    {
      eventId: 'evt-or-concentration-002',
      correlationId: 'inc-or-referral-concentration',
      entityId: 'metric-referral-concentration-2026-07',
      type: 'owner.signals.evaluated',
      source: 'crm',
      sourceEventId: 'window-2026-07-11-concentration-refresh',
      occurredAt: '2026-07-11T09:00:00-04:00',
      receivedAt: '2026-07-11T09:00:05-04:00',
      schemaVersion: '2026-08-01',
      actor: 'SYSTEM',
      executionMode: 'SIMULATED',
      payload: {
        primaryObservation: {
          metricId: 'referral-partner-pipeline-share',
          sourceSystem: 'crm',
          value: 29,
          baselineValue: 28,
          reportedAt: '2026-07-11T08:00:00-04:00',
          available: true,
          worseningDirection: 'UP',
        },
        contextObservations: [],
        corroboratingObservations: [],
      },
    },
  ],
  judgments: {},
  expectedFinalState: 'DISMISSED',
});

export const OWNER_REVENUE_INTELLIGENCE_SCENARIOS: readonly Scenario[] = [scenarioA, scenarioB];

export function ownerRevenueIntelligenceScenarioBySlug(slug: string): Scenario | undefined {
  return OWNER_REVENUE_INTELLIGENCE_SCENARIOS.find((s) => s.slug === slug);
}
