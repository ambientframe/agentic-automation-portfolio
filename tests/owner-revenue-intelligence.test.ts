import { describe, expect, it } from 'vitest';
import { runOwnerRevenueIntelligence } from './helpers';
import {
  OWNER_REVENUE_INTELLIGENCE_SCENARIOS,
  ownerRevenueIntelligenceScenarioBySlug,
} from '@/data/profiles/kestrel/scenarios/owner-revenue-intelligence';
import {
  computeVariancePct,
  inputAgeHours,
  isObservationFresh,
  isWorsening,
  OR_RECOMMENDATION_CLASSES,
  OWNER_REVENUE_INTELLIGENCE_HANDLERS,
} from '@/lib/engine/handlers/owner-revenue-intelligence';
import { applyEvent } from '@/lib/engine/reducer';
import { EventLedger, ExecutionLedger, SideEffectLedger } from '@/lib/engine/ledger';
import { initialState } from '@/lib/engine/types';
import { OWNER_REVENUE_INTELLIGENCE } from '@/data/systems';
import { KESTREL } from '@/data/profiles/kestrel/profile';
import type { CanonicalEvent, Scenario } from '@/lib/model/runtime';

const scenarioA = ownerRevenueIntelligenceScenarioBySlug('cash-collection-quietly-worsens');
const scenarioB = ownerRevenueIntelligenceScenarioBySlug('stale-concentration-read-dismissed');

if (scenarioA === undefined || scenarioB === undefined) {
  throw new Error('Owner Revenue Intelligence scenario fixtures are missing.');
}

describe('Owner Revenue Intelligence — cash collection quietly worsens', () => {
  it('reaches the declared final state', async () => {
    const run = await runOwnerRevenueIntelligence(scenarioA);
    expect(run.finalState.lifecycleState).toBe('DECISION_RECORDED');
  });

  it('walks the full intake-to-decision path, in order', async () => {
    const run = await runOwnerRevenueIntelligence(scenarioA);
    const accepted = run.transitions.filter((t) => t.accepted).map((t) => `${t.from}->${t.to}`);
    expect(accepted).toEqual([
      'SIGNALS_COLLECTED->FRESHNESS_CHECKED',
      'FRESHNESS_CHECKED->BASELINE_COMPARED',
      'BASELINE_COMPARED->EXCEPTION_CANDIDATE',
      'EXCEPTION_CANDIDATE->CORROBORATING',
      'CORROBORATING->EXCEPTION_SURFACED',
      'EXCEPTION_SURFACED->ACTION_RECOMMENDED',
      'ACTION_RECOMMENDED->AWAITING_OWNER_DECISION',
      'AWAITING_OWNER_DECISION->DECISION_RECORDED',
    ]);
  });

  it('does not surface the exception until an independent, different-system source corroborates it', async () => {
    const run = await runOwnerRevenueIntelligence(scenarioA);
    const surfaced = run.decisions.find((d) => d.id.endsWith(':d-exception-surfaced'));
    expect(surfaced?.evidenceRefs).toContain('cash-collected@accounting-system');
    expect(surfaced?.evidenceRefs).toContain('days-sales-outstanding@workflow-store');
  });

  it('composes a recommendation, never presenting it as an observed fact or an established cause', async () => {
    const run = await runOwnerRevenueIntelligence(scenarioA);
    const judgment = run.decisions.find((d) => d.id.endsWith(':d-judgment'));
    expect(judgment?.mechanism).toBe('BOUNDED_AI_JUDGMENT');
    expect(judgment?.classification).toBe('INVESTIGATE_COLLECTION_PROCESS');
    expect(judgment?.forbiddenActions).toContain('assert_a_causal_explanation');
    expect(judgment?.forbiddenActions).toContain('present_the_recommendation_as_an_observed_fact');
    expect(judgment?.evaluatorResult).toContain('Declined to infer');
  });

  it('proposes a notification at authority level 1 and the engine core refuses it outright', async () => {
    const run = await runOwnerRevenueIntelligence(scenarioA);
    const notifications = run.sideEffects.filter((e) => e.kind === 'NOTIFICATION');
    expect(notifications).toHaveLength(1);
    expect(notifications[0]?.status).toBe('BLOCKED_BY_POLICY');
    expect(notifications[0]?.detail).toContain('permits observation or recommendation only');
  });

  it('records the owner’s decision as a human decision, against the evidence that informed it', async () => {
    const run = await runOwnerRevenueIntelligence(scenarioA);
    const resolved = run.decisions.find((d) => d.id.endsWith(':d-resolved'));
    expect(resolved?.mechanism).toBe('HUMAN_DECISION');
    const verification = run.verifications.find((v) => v.id.endsWith(':v-authority'));
    expect(verification?.result).toBe('PASS');
  });

  it('replays byte-identical', async () => {
    const first = await runOwnerRevenueIntelligence(scenarioA);
    const second = await runOwnerRevenueIntelligence(scenarioA);
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });
});

describe('Owner Revenue Intelligence — stale read blocks the conclusion, then normal variance is left alone', () => {
  it('reaches the declared final state', async () => {
    const run = await runOwnerRevenueIntelligence(scenarioB);
    expect(run.finalState.lifecycleState).toBe('DISMISSED');
  });

  it('is flagged stale on the first read, then refreshes and is dismissed as immaterial', async () => {
    const run = await runOwnerRevenueIntelligence(scenarioB);
    const accepted = run.transitions.filter((t) => t.accepted).map((t) => `${t.from}->${t.to}`);
    expect(accepted).toEqual([
      'SIGNALS_COLLECTED->FRESHNESS_CHECKED',
      'FRESHNESS_CHECKED->STALE_DATA_FLAGGED',
      'STALE_DATA_FLAGGED->BASELINE_COMPARED',
      'BASELINE_COMPARED->DISMISSED',
    ]);
  });

  it('never surfaces a side effect or a recommendation from a dismissed, immaterial variance', async () => {
    const run = await runOwnerRevenueIntelligence(scenarioB);
    expect(run.sideEffects).toHaveLength(0);
    expect(run.decisions.some((d) => d.mechanism === 'BOUNDED_AI_JUDGMENT')).toBe(false);
  });

  it('replays byte-identical', async () => {
    const first = await runOwnerRevenueIntelligence(scenarioB);
    const second = await runOwnerRevenueIntelligence(scenarioB);
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });
});

describe('Owner Revenue Intelligence — direct behavioural tests', () => {
  function windowEvent(overrides: Partial<CanonicalEvent> & { payload: Record<string, unknown> }): CanonicalEvent {
    return {
      eventId: 'evt-direct-1',
      correlationId: 'inc-direct',
      entityId: 'metric-direct-0001',
      type: 'owner.signals.evaluated',
      source: 'accounting-system',
      sourceEventId: 'src-direct-1',
      occurredAt: '2026-07-31T18:00:00-04:00',
      receivedAt: '2026-07-31T18:00:05-04:00',
      schemaVersion: '2026-08-01',
      actor: 'SYSTEM',
      executionMode: 'SIMULATED',
      ...overrides,
    };
  }

  function run(fromState: string, event: CanonicalEvent, judgments = new Map()) {
    return applyEvent(initialState(fromState), event, {
      system: OWNER_REVENUE_INTELLIGENCE,
      profile: KESTREL,
      handlers: OWNER_REVENUE_INTELLIGENCE_HANDLERS,
      judgments,
      internals: { effects: new SideEffectLedger(), events: new EventLedger(), executions: new ExecutionLedger() },
    });
  }

  const FRESH_PRIMARY = {
    metricId: 'cash-collected',
    sourceSystem: 'accounting-system',
    value: 148_000,
    baselineValue: 210_000,
    reportedAt: '2026-07-31T12:00:00-04:00',
    available: true,
    worseningDirection: 'DOWN' as const,
  };

  it('inputAgeHours and computeVariancePct are pure arithmetic', () => {
    expect(inputAgeHours('2026-07-31T18:00:00-04:00', '2026-07-31T12:00:00-04:00')).toBe(6);
    expect(computeVariancePct(148_000, 210_000)).toBeCloseTo(-29.52, 1);
    expect(computeVariancePct(29, 28)).toBeCloseTo(3.57, 1);
  });

  it('isWorsening respects each metric’s own declared direction', () => {
    expect(isWorsening({ ...FRESH_PRIMARY, worseningDirection: 'DOWN' }, -10)).toBe(true);
    expect(isWorsening({ ...FRESH_PRIMARY, worseningDirection: 'DOWN' }, 10)).toBe(false);
    expect(isWorsening({ ...FRESH_PRIMARY, worseningDirection: 'UP' }, 10)).toBe(true);
  });

  it('isObservationFresh treats an unavailable input as never fresh', () => {
    expect(isObservationFresh({ ...FRESH_PRIMARY, available: false }, '2026-07-31T18:00:00-04:00', 96)).toBe(false);
    expect(isObservationFresh(FRESH_PRIMARY, '2026-07-31T18:00:00-04:00', 96)).toBe(true);
  });

  it('an input older than the staleness tolerance blocks the conclusion rather than being used anyway', () => {
    const event = windowEvent({
      payload: {
        primaryObservation: { ...FRESH_PRIMARY, reportedAt: '2026-06-01T00:00:00-04:00' },
        contextObservations: [],
        corroboratingObservations: [],
      },
    });
    const result = run('SIGNALS_COLLECTED', event);
    expect(result.state.lifecycleState).toBe('STALE_DATA_FLAGGED');
    expect(result.entries.flatMap((e) => e.sideEffects)).toHaveLength(0);
  });

  it('a refresh that is still stale reaches INSUFFICIENT_EVIDENCE rather than concluding on a partial refresh', () => {
    const internals = { effects: new SideEffectLedger(), events: new EventLedger(), executions: new ExecutionLedger() };
    const deps = { system: OWNER_REVENUE_INTELLIGENCE, profile: KESTREL, handlers: OWNER_REVENUE_INTELLIGENCE_HANDLERS, judgments: new Map(), internals };

    const staleEvent = windowEvent({ payload: { primaryObservation: { ...FRESH_PRIMARY, reportedAt: '2026-06-01T00:00:00-04:00' }, contextObservations: [], corroboratingObservations: [] } });
    const first = applyEvent(initialState('SIGNALS_COLLECTED'), staleEvent, deps);
    expect(first.state.lifecycleState).toBe('STALE_DATA_FLAGGED');

    const stillStaleEvent = windowEvent({ eventId: 'evt-direct-2', sourceEventId: 'src-direct-2', payload: { primaryObservation: { ...FRESH_PRIMARY, reportedAt: '2026-06-02T00:00:00-04:00' }, contextObservations: [], corroboratingObservations: [] } });
    const second = applyEvent(first.state, stillStaleEvent, deps);
    expect(second.state.lifecycleState).toBe('INSUFFICIENT_EVIDENCE');
  });

  it('a corroborating source that disagrees in direction does not surface the exception', () => {
    const event = windowEvent({
      payload: {
        primaryObservation: FRESH_PRIMARY,
        contextObservations: [],
        corroboratingObservations: [
          { metricId: 'days-sales-outstanding', sourceSystem: 'workflow-store', value: 30, baselineValue: 34, reportedAt: '2026-07-31T09:00:00-04:00', available: true, worseningDirection: 'UP' },
        ],
      },
    });
    const result = run('SIGNALS_COLLECTED', event);
    expect(result.state.lifecycleState).toBe('INSUFFICIENT_EVIDENCE');
    const insufficient = result.entries.flatMap((e) => e.decisions).find((d) => d.id.endsWith(':d-insufficient-evidence'));
    expect(insufficient?.authority).toBe(1);
  });

  it('a corroborating source that would require cross-client aggregation is excluded, citing the confidentiality policy', () => {
    const event = windowEvent({
      payload: {
        primaryObservation: FRESH_PRIMARY,
        contextObservations: [],
        corroboratingObservations: [
          {
            metricId: 'peer-client-control-maturity',
            sourceSystem: 'evidence-platform',
            value: 40,
            baselineValue: 60,
            reportedAt: '2026-07-31T09:00:00-04:00',
            available: true,
            worseningDirection: 'DOWN',
            requiresCrossClientAggregation: true,
          },
        ],
      },
    });
    const result = run('SIGNALS_COLLECTED', event);
    expect(result.state.lifecycleState).toBe('INSUFFICIENT_EVIDENCE');
    const insufficient = result.entries.flatMap((e) => e.decisions).find((d) => d.id.endsWith(':d-insufficient-evidence'));
    expect(insufficient?.authority).toBe(2);
    expect(insufficient?.applicablePolicy.some((p) => p.includes('kestrel-evidence-confidentiality'))).toBe(true);
  });

  it('a recommendation below the confidence floor is held for a person, never promoted to ACTION_RECOMMENDED', () => {
    const judgmentId = 'jud-direct-low-confidence';
    const event = windowEvent({
      payload: {
        primaryObservation: FRESH_PRIMARY,
        contextObservations: [],
        corroboratingObservations: [
          { metricId: 'days-sales-outstanding', sourceSystem: 'workflow-store', value: 51, baselineValue: 34, reportedAt: '2026-07-31T09:00:00-04:00', available: true, worseningDirection: 'UP' },
        ],
        judgment: {
          judgmentId,
          objective: 'Compose a plain-language explanation of this exception and propose a candidate action.',
          input: 'Cash collected fell while revenue held steady; DSO independently worsened.',
          permittedClassifications: [...OR_RECOMMENDATION_CLASSES],
          requiredFields: [],
        },
      },
    });
    const judgments = new Map([
      [
        judgmentId,
        {
          status: 'OK' as const,
          result: {
            judgmentId,
            classification: 'INVESTIGATE_COLLECTION_PROCESS' as const,
            confidence: 0.5,
            missingInformation: [],
            evidenceRefs: ['cash-collected@accounting-system'],
            declinedToInfer: [],
            rationaleSummary: 'Ambiguous — low confidence.',
          },
          providerId: 'fixture-decision-provider',
        },
      ],
    ]);
    const result = run('SIGNALS_COLLECTED', event, judgments);
    expect(result.state.lifecycleState).toBe('EXCEPTION_SURFACED');
    expect(result.state.awaitingHuman).toBe('Recommendation judgment below confidence floor');
  });

  it('the owner can dismiss a routed recommendation, reaching DISMISSED rather than DECISION_RECORDED', async () => {
    const dismissScenario: Scenario = {
      ...scenarioA,
      id: 'or-scenario-dismiss-test',
      slug: 'or-dismiss-test',
      events: [
        scenarioA.events[0]!,
        { ...scenarioA.events[1]!, payload: { decidedBy: 'founder', decision: 'DISMISS_EXCEPTION', rationale: 'Already addressed informally; no further action needed.' } },
      ],
      expectedFinalState: 'DISMISSED',
    };
    const dismissRun = await runOwnerRevenueIntelligence(dismissScenario);
    expect(dismissRun.finalState.lifecycleState).toBe('DISMISSED');
  });

  it('a human decision cannot be recorded when no recommendation is awaiting one', () => {
    const humanEvent: CanonicalEvent = {
      eventId: 'evt-not-awaiting',
      correlationId: 'inc-direct',
      entityId: 'metric-direct-0001',
      type: 'human.decision.recorded',
      source: 'operator-console',
      sourceEventId: 'src-not-awaiting',
      occurredAt: '2026-07-31T18:00:00-04:00',
      receivedAt: '2026-07-31T18:00:05-04:00',
      schemaVersion: '2026-08-01',
      actor: 'HUMAN',
      executionMode: 'SIMULATED',
      payload: { decidedBy: 'founder', decision: 'ACKNOWLEDGE_RECOMMENDATION', rationale: 'n/a' },
    };
    const result = run('SIGNALS_COLLECTED', humanEvent);
    expect(result.state.lifecycleState).toBe('SIGNALS_COLLECTED');
  });

  it('an incident already past the intake path is not re-evaluated by a further analysis event', async () => {
    const priorRun = await runOwnerRevenueIntelligence(scenarioB);
    expect(priorRun.finalState.lifecycleState).toBe('DISMISSED');

    const staleFollowUp = windowEvent({
      eventId: 'evt-or-concentration-003',
      sourceEventId: 'window-2026-08-01-concentration-late',
      payload: { primaryObservation: { metricId: 'referral-partner-pipeline-share', sourceSystem: 'crm', value: 45, baselineValue: 28, reportedAt: '2026-08-01T09:00:00-04:00', available: true, worseningDirection: 'UP' }, contextObservations: [], corroboratingObservations: [] },
    });
    const internals = { effects: new SideEffectLedger(), events: new EventLedger(), executions: new ExecutionLedger() };
    const result = applyEvent(priorRun.finalState, staleFollowUp, {
      system: OWNER_REVENUE_INTELLIGENCE,
      profile: KESTREL,
      handlers: OWNER_REVENUE_INTELLIGENCE_HANDLERS,
      judgments: new Map(),
      internals,
    });
    expect(result.state.lifecycleState).toBe('DISMISSED');
    expect(result.entries.flatMap((e) => e.sideEffects)).toHaveLength(0);
    expect(result.entries.flatMap((e) => e.transitions)).toHaveLength(0);
  });

  it('malformed payloads are rejected without a state change', () => {
    const badWindow = run('SIGNALS_COLLECTED', windowEvent({ payload: { primaryObservation: { metricId: 'x' } } }));
    expect(badWindow.state.lifecycleState).toBe('SIGNALS_COLLECTED');

    const badHuman: CanonicalEvent = {
      eventId: 'evt-bad-human',
      correlationId: 'inc-bad',
      entityId: 'metric-direct-0001',
      type: 'human.decision.recorded',
      source: 'operator-console',
      sourceEventId: 'src-bad-human',
      occurredAt: '2026-07-31T18:00:00-04:00',
      receivedAt: '2026-07-31T18:00:05-04:00',
      schemaVersion: '2026-08-01',
      actor: 'HUMAN',
      executionMode: 'SIMULATED',
      payload: { decidedBy: 'founder' },
    };
    const badHumanResult = run('AWAITING_OWNER_DECISION', badHuman);
    expect(badHumanResult.state.lifecycleState).toBe('AWAITING_OWNER_DECISION');
  });

  it('permitted recommendation classes are exactly the declared closed set', () => {
    expect(OR_RECOMMENDATION_CLASSES).toEqual([
      'INVESTIGATE_COLLECTION_PROCESS',
      'REVIEW_PRICING_OR_TERMS',
      'ESCALATE_CONCENTRATION_RISK',
      'MONITOR_ONLY',
    ]);
  });
});

describe('Owner Revenue Intelligence — registry wiring', () => {
  it('registers both scenarios', () => {
    expect(OWNER_REVENUE_INTELLIGENCE_SCENARIOS).toHaveLength(2);
  });
});
