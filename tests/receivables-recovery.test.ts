import { describe, expect, it } from 'vitest';
import { runReceivablesRecovery } from './helpers';
import {
  RECEIVABLES_RECOVERY_SCENARIOS,
  receivablesRecoveryScenarioBySlug,
} from '@/data/profiles/kestrel/scenarios/receivables-recovery';
import {
  computeBucket,
  daysPastDue,
  screenProhibitedCollectionLanguage,
  RECEIVABLES_RECOVERY_HANDLERS,
  RR_REPLY_CLASSES,
} from '@/lib/engine/handlers/receivables-recovery';
import { applyEvent } from '@/lib/engine/reducer';
import { runScenario } from '@/lib/engine/run';
import { EventLedger, ExecutionLedger, SideEffectLedger } from '@/lib/engine/ledger';
import { initialState } from '@/lib/engine/types';
import { RECEIVABLES_RECOVERY } from '@/data/systems';
import { KESTREL } from '@/data/profiles/kestrel/profile';
import { FixtureDecisionProvider } from '@/lib/ports/decision-provider';
import { FixtureExtractionProvider } from '@/lib/ports/extraction-provider';
import type { CanonicalEvent, Scenario } from '@/lib/model/runtime';

const scenarioA = receivablesRecoveryScenarioBySlug('overdue-reply-changes-policy');
const scenarioB = receivablesRecoveryScenarioBySlug('dispute-halts-cadence');

if (scenarioA === undefined || scenarioB === undefined) {
  throw new Error('Receivables Recovery scenario fixtures are missing.');
}

describe('Receivables Recovery — overdue invoice reply changes collection policy', () => {
  it('reaches the declared final state', async () => {
    const run = await runReceivablesRecovery(scenarioA);
    expect(run.finalState.lifecycleState).toBe('PAID');
  });

  it('walks CURRENT -> DUE_SOON -> PAST_DUE_1_30 -> PAYMENT_PROMISED -> PAID, in order', async () => {
    const run = await runReceivablesRecovery(scenarioA);
    const accepted = run.transitions.filter((t) => t.accepted).map((t) => `${t.from}->${t.to}`);
    expect(accepted).toEqual(['CURRENT->DUE_SOON', 'DUE_SOON->PAST_DUE_1_30', 'PAST_DUE_1_30->PAYMENT_PROMISED', 'PAYMENT_PROMISED->PAID']);
  });

  it('despatches exactly two reminders, at the -3 and +1 checkpoints, with the balance figure injected verbatim', async () => {
    const run = await runReceivablesRecovery(scenarioA);
    const reminders = run.sideEffects.filter((e) => e.kind === 'MESSAGE_SEND');
    expect(reminders).toHaveLength(2);
    expect(reminders.every((r) => r.status === 'EXECUTED')).toBe(true);
    expect(reminders.every((r) => r.description.includes('$8,500'))).toBe(true);
    expect(reminders.map((r) => r.idempotencyKey).sort()).toEqual(['reminder:inv-halden-0417:-3', 'reminder:inv-halden-0417:1']);
  });

  it('a reply mentioning "dispute" about a different invoice is read as a promise to pay, not a dispute', async () => {
    const run = await runReceivablesRecovery(scenarioA);
    const interpretation = run.decisions.find((d) => d.id.endsWith(':d-interpret'));
    expect(interpretation?.classification).toBe('PROMISE_TO_PAY');
  });

  it('extracts the committed date through a separate, citation-bearing judgment and records it as the promise', async () => {
    const run = await runReceivablesRecovery(scenarioA);
    const extractionDecision = run.decisions.find((d) => d.id.endsWith(':d-promise') && d.mechanism === 'BOUNDED_AI_JUDGMENT');
    expect(extractionDecision?.evidenceRefs).toContain('reply-01');
    expect(extractionDecision?.deterministicFacts.some((f) => f.label === 'Committed date' && f.value === '2026-08-05')).toBe(true);
  });

  it('full settlement from the accounting system halts everything and reaches PAID', async () => {
    const run = await runReceivablesRecovery(scenarioA);
    const paidDecision = run.decisions.find((d) => d.id.endsWith(':d-paid'));
    expect(paidDecision?.applicablePolicy.some((p) => p.includes('rr-lab-financial-authority'))).toBe(true);
  });

  it('replays byte-identical', async () => {
    const first = await runReceivablesRecovery(scenarioA);
    const second = await runReceivablesRecovery(scenarioA);
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });
});

describe('Receivables Recovery — dispute halts the cadence', () => {
  it('reaches the declared final state', async () => {
    const run = await runReceivablesRecovery(scenarioB);
    expect(run.finalState.lifecycleState).toBe('PAST_DUE_31_60');
  });

  it('ages three buckets in one evaluation event, then a clear dispute halts the cadence', async () => {
    const run = await runReceivablesRecovery(scenarioB);
    const accepted = run.transitions.filter((t) => t.accepted).map((t) => `${t.from}->${t.to}`);
    expect(accepted).toEqual([
      'CURRENT->DUE_SOON',
      'DUE_SOON->PAST_DUE_1_30',
      'PAST_DUE_1_30->PAST_DUE_31_60',
      'PAST_DUE_31_60->DISPUTED',
      'DISPUTED->PAST_DUE_31_60',
    ]);
  });

  it('despatches zero reminders — the only evaluation before the dispute lands on a non-checkpoint day', async () => {
    const run = await runReceivablesRecovery(scenarioB);
    expect(run.sideEffects.filter((e) => e.kind === 'MESSAGE_SEND')).toHaveLength(0);
  });

  it('a stale evaluation arriving after the dispute produces zero side effects and zero attempted transitions', async () => {
    const run = await runReceivablesRecovery(scenarioB);
    const staleDecision = run.decisions.find((d) => d.id.endsWith(':d-not-applicable'));
    expect(staleDecision).toBeDefined();
    expect(staleDecision?.forbiddenActions).toContain('despatch_reminder_outside_ageing_ladder');
    expect(run.sideEffects).toHaveLength(0);
    const rejected = run.transitions.filter((t) => !t.accepted);
    expect(rejected).toHaveLength(0); // the handler never even attempted an illegal transition
  });

  it('dispute resolution requires sufficient authority and is recorded as a human decision', async () => {
    const run = await runReceivablesRecovery(scenarioB);
    const resolved = run.decisions.find((d) => d.id.endsWith(':d-resolved'));
    expect(resolved?.mechanism).toBe('HUMAN_DECISION');
    const verification = run.verifications.find((v) => v.id.endsWith(':v-authority'));
    expect(verification?.result).toBe('PASS');
  });

  it('replays byte-identical', async () => {
    const first = await runReceivablesRecovery(scenarioB);
    const second = await runReceivablesRecovery(scenarioB);
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });
});

describe('Receivables Recovery — direct behavioural tests', () => {
  function evalEvent(overrides: Partial<CanonicalEvent> & { payload: Record<string, unknown> }): CanonicalEvent {
    return {
      eventId: 'evt-direct-1',
      correlationId: 'inc-direct',
      entityId: 'inv-direct-0001',
      type: 'receivables.aging.evaluated',
      source: 'accounting-system',
      sourceEventId: 'src-direct-1',
      occurredAt: '2026-07-21T09:00:00-04:00',
      receivedAt: '2026-07-21T09:00:05-04:00',
      schemaVersion: '2026-08-01',
      actor: 'SYSTEM',
      executionMode: 'SIMULATED',
      ...overrides,
    };
  }

  function run(fromState: string, event: CanonicalEvent) {
    return applyEvent(initialState(fromState), event, {
      system: RECEIVABLES_RECOVERY,
      profile: KESTREL,
      handlers: RECEIVABLES_RECOVERY_HANDLERS,
      judgments: new Map(),
      internals: { effects: new SideEffectLedger(), events: new EventLedger(), executions: new ExecutionLedger() },
    });
  }

  const INVOICE_PAYLOAD = { invoiceId: 'inv-direct-0001', customerId: 'cust-direct', customerName: 'Direct Test Co', amount: 5000, balance: 5000, dueDate: '2026-07-20' };

  it('daysPastDue is pure date-string arithmetic', () => {
    expect(daysPastDue('2026-07-21T09:00:00-04:00', '2026-07-20')).toBe(1);
    expect(daysPastDue('2026-07-17T09:00:00-04:00', '2026-07-20')).toBe(-3);
    expect(daysPastDue('2026-07-20T01:00:00-04:00', '2026-07-20')).toBe(0);
  });

  it('computeBucket matches the declared ageing convention', () => {
    expect(computeBucket(-10)).toBe('CURRENT');
    expect(computeBucket(-1)).toBe('DUE_SOON');
    expect(computeBucket(0)).toBe('DUE_SOON');
    expect(computeBucket(1)).toBe('PAST_DUE_1_30');
    expect(computeBucket(30)).toBe('PAST_DUE_1_30');
    expect(computeBucket(31)).toBe('PAST_DUE_31_60');
    expect(computeBucket(60)).toBe('PAST_DUE_31_60');
    expect(computeBucket(61)).toBe('PAST_DUE_61_90');
    expect(computeBucket(91)).toBe('PAST_DUE_90_PLUS');
  });

  it('no collection action before it is permitted: outside the pre-due window, the invoice stays CURRENT and sends nothing', () => {
    const event = evalEvent({ occurredAt: '2026-07-15T09:00:00-04:00', payload: INVOICE_PAYLOAD });
    const result = run('CURRENT', event);
    expect(result.state.lifecycleState).toBe('CURRENT');
    expect(result.entries.flatMap((e) => e.sideEffects)).toHaveLength(0);
  });

  it('duplicate events do not cause duplicate sends: redelivering the same reminder event suppresses the second attempt', () => {
    const event = evalEvent({ occurredAt: '2026-07-21T09:00:00-04:00', payload: INVOICE_PAYLOAD });
    const internals = { effects: new SideEffectLedger(), events: new EventLedger(), executions: new ExecutionLedger() };
    const deps = { system: RECEIVABLES_RECOVERY, profile: KESTREL, handlers: RECEIVABLES_RECOVERY_HANDLERS, judgments: new Map(), internals };

    const first = applyEvent(initialState('DUE_SOON'), event, deps);
    const second = applyEvent(first.state, { ...event, eventId: 'evt-direct-2' }, deps); // same sourceEventId, redelivered

    const firstEffect = first.entries.flatMap((e) => e.sideEffects).find((e) => e.kind === 'MESSAGE_SEND');
    const secondEffect = second.entries.flatMap((e) => e.sideEffects).find((e) => e.kind === 'MESSAGE_SEND');
    expect(firstEffect?.status).toBe('EXECUTED');
    expect(secondEffect?.status).toBe('SUPPRESSED_DUPLICATE');
  });

  it('payment stops further collection: a stale evaluation after PAID takes no action', () => {
    const event = evalEvent({ occurredAt: '2026-08-01T09:00:00-04:00', payload: INVOICE_PAYLOAD });
    const result = run('PAID', event);
    expect(result.state.lifecycleState).toBe('PAID');
    expect(result.entries.flatMap((e) => e.sideEffects)).toHaveLength(0);
    expect(result.entries.flatMap((e) => e.transitions).filter((t) => !t.accepted)).toHaveLength(0);
  });

  it('disputed status changes authority: no reminder or transition is ever attempted from DISPUTED', () => {
    const event = evalEvent({ occurredAt: '2026-08-01T09:00:00-04:00', payload: INVOICE_PAYLOAD });
    const result = run('DISPUTED', event);
    expect(result.state.lifecycleState).toBe('DISPUTED');
    expect(result.entries.flatMap((e) => e.sideEffects)).toHaveLength(0);
  });

  it('a stale/out-of-order evaluation never regresses the ageing bucket', () => {
    const advance = evalEvent({ eventId: 'evt-advance', sourceEventId: 'src-advance', occurredAt: '2026-08-20T09:00:00-04:00', payload: INVOICE_PAYLOAD });
    const advanced = run('CURRENT', advance);
    expect(advanced.state.lifecycleState).toBe('PAST_DUE_31_60');

    const stale = evalEvent({ eventId: 'evt-stale', sourceEventId: 'src-stale', occurredAt: '2026-07-21T09:00:00-04:00', payload: INVOICE_PAYLOAD });
    const internals = { effects: new SideEffectLedger(), events: new EventLedger(), executions: new ExecutionLedger() };
    const result = applyEvent(advanced.state, stale, {
      system: RECEIVABLES_RECOVERY,
      profile: KESTREL,
      handlers: RECEIVABLES_RECOVERY_HANDLERS,
      judgments: new Map(),
      internals,
    });
    expect(result.state.lifecycleState).toBe('PAST_DUE_31_60');
    expect(result.entries.flatMap((e) => e.sideEffects)).toHaveLength(0);
  });

  it('escalation fires at the configured day-45 threshold and halts the cadence at ESCALATED', () => {
    const event = evalEvent({ occurredAt: '2026-09-04T09:00:00-04:00', payload: INVOICE_PAYLOAD }); // 46 days past due
    const result = run('CURRENT', event);
    expect(result.state.lifecycleState).toBe('ESCALATED');
  });

  it('ambiguous customer language cannot silently become an authoritative financial fact: low confidence records nothing', async () => {
    const scenario: Scenario = {
      ...scenarioA,
      id: 'rr-scenario-low-confidence-test',
      slug: 'rr-low-confidence-test',
      events: [
        scenarioA.events[0]!,
        scenarioA.events[1]!,
        { ...scenarioA.events[2]!, occurredAt: '2026-07-23T14:00:00-04:00' },
      ],
      judgments: {
        'jud-rr-halden-reply': {
          judgmentId: 'jud-rr-halden-reply',
          classification: 'PROMISE_TO_PAY',
          confidence: 0.4,
          missingInformation: [],
          evidenceRefs: ['reply-01'],
          declinedToInfer: [],
          rationaleSummary: 'Ambiguous — low confidence.',
        },
      },
      expectedFinalState: 'PAST_DUE_1_30',
    };
    const run2 = await runReceivablesRecovery(scenario);
    expect(run2.finalState.lifecycleState).toBe('PAST_DUE_1_30'); // unchanged — never promoted to PAYMENT_PROMISED
    expect(run2.finalState.awaitingHuman).toBe('Reply interpretation below confidence floor');
  });

  it('unknown data remains unknown rather than defaulted: a promise classification with no extractable date records nothing', async () => {
    const scenario: Scenario = {
      ...scenarioA,
      id: 'rr-scenario-no-date-test',
      slug: 'rr-no-date-test',
      events: [scenarioA.events[0]!, scenarioA.events[1]!, scenarioA.events[2]!],
      judgments: scenarioA.judgments,
      expectedFinalState: 'PAST_DUE_1_30',
    };
    const noExtractionRun = await runScenario(scenario, {
      system: RECEIVABLES_RECOVERY,
      profile: KESTREL,
      handlers: RECEIVABLES_RECOVERY_HANDLERS,
      provider: new FixtureDecisionProvider(scenario.judgments),
      extractionProvider: new FixtureExtractionProvider({}),
    });
    expect(noExtractionRun.finalState.lifecycleState).toBe('PAST_DUE_1_30');
    expect(noExtractionRun.finalState.awaitingHuman).toBe('Promise to pay reply with no extractable committed date');
  });

  it('partial payment does not settle the invoice or halt the cadence', () => {
    const event: CanonicalEvent = {
      eventId: 'evt-partial-1',
      correlationId: 'inc-partial',
      entityId: 'inv-direct-0001',
      type: 'receivables.payment.recorded',
      source: 'accounting-system',
      sourceEventId: 'src-partial-1',
      occurredAt: '2026-07-25T09:00:00-04:00',
      receivedAt: '2026-07-25T09:00:05-04:00',
      schemaVersion: '2026-08-01',
      actor: 'SYSTEM',
      executionMode: 'SIMULATED',
      payload: { invoiceId: 'inv-direct-0001', amountPaid: 2000, newBalance: 3000 },
    };
    const result = run('PAST_DUE_1_30', event);
    expect(result.state.lifecycleState).toBe('PAST_DUE_1_30');
    expect(result.entries[0]?.summary).toContain('Partial payment');
  });

  it('a broken promise re-enters the ageing ladder', () => {
    const internals = { effects: new SideEffectLedger(), events: new EventLedger(), executions: new ExecutionLedger() };
    const deps = { system: RECEIVABLES_RECOVERY, profile: KESTREL, handlers: RECEIVABLES_RECOVERY_HANDLERS, judgments: new Map(), internals };

    const replyEvent: CanonicalEvent = {
      eventId: 'evt-promise-reply',
      correlationId: 'inc-direct',
      entityId: 'inv-direct-0001',
      type: 'receivables.customer.replied',
      source: 'shared-inbox',
      sourceEventId: 'src-promise-reply',
      occurredAt: '2026-07-23T09:00:00-04:00',
      receivedAt: '2026-07-23T09:00:05-04:00',
      schemaVersion: '2026-08-01',
      actor: 'EXTERNAL_PARTY',
      executionMode: 'SIMULATED',
      payload: {
        invoiceId: 'inv-direct-0001',
        judgment: {
          judgmentId: 'jud-direct-promise',
          objective: 'Interpret whether this reply constitutes a dispute, a promise to pay, or neither.',
          input: 'We will pay by August 1st.',
          permittedClassifications: [...RR_REPLY_CLASSES],
          requiredFields: [],
        },
        extraction: {
          judgmentId: 'jud-direct-promise-date',
          objective: 'Extract a specific committed payment date, if one is stated.',
          sourceArtifactId: 'reply-direct-promise',
          segments: [{ id: 'reply-01', speaker: 'Customer', text: 'We will pay by August 1st.' }],
          requiredFields: ['committedDate'],
        },
      },
    };
    const promiseJudgments = new Map([
      [
        'jud-direct-promise',
        {
          status: 'OK' as const,
          result: { judgmentId: 'jud-direct-promise', classification: 'PROMISE_TO_PAY' as const, confidence: 0.9, missingInformation: [], evidenceRefs: ['reply-01'], declinedToInfer: [], rationaleSummary: 'Clear promise.' },
        },
      ],
    ]);
    const promiseExtractions = new Map([
      [
        'jud-direct-promise-date',
        { status: 'OK' as const, result: { judgmentId: 'jud-direct-promise-date', extracted: [{ field: 'committedDate', value: '2026-08-01', evidenceRefs: ['reply-01'], confidence: 0.9 }], missingFields: [], declinedToInfer: [], overallConfidence: 0.9, rationaleSummary: 'Explicit date stated.' } },
      ],
    ]);

    const afterReply = applyEvent(initialState('PAST_DUE_1_30'), replyEvent, {
      ...deps,
      judgments: promiseJudgments,
      extractions: promiseExtractions,
    });
    expect(afterReply.state.lifecycleState).toBe('PAYMENT_PROMISED');

    const evaluationAfterPromise = evalEvent({
      eventId: 'evt-broken-promise',
      sourceEventId: 'src-broken-promise',
      occurredAt: '2026-08-10T09:00:00-04:00',
      payload: INVOICE_PAYLOAD,
    });
    const result = applyEvent(afterReply.state, evaluationAfterPromise, deps);
    expect(result.state.lifecycleState).toBe('PAST_DUE_31_60');
  });

  it('prohibited-language screen catches a legal-threat phrase regardless of source', () => {
    expect(screenProhibitedCollectionLanguage('We will pursue legal action if this remains unpaid.')).not.toBeNull();
    expect(screenProhibitedCollectionLanguage('Reminder for Acme Co: invoice inv-1, $500 outstanding, due 2026-07-20.')).toBeNull();
  });

  it('malformed payloads are rejected without a state or balance change', () => {
    const badEval = run('CURRENT', evalEvent({ payload: { invoiceId: 'x' } }));
    expect(badEval.state.lifecycleState).toBe('CURRENT');

    const badPayment: CanonicalEvent = {
      eventId: 'evt-bad-payment',
      correlationId: 'inc-bad',
      entityId: 'inv-direct-0001',
      type: 'receivables.payment.recorded',
      source: 'accounting-system',
      sourceEventId: 'src-bad-payment',
      occurredAt: '2026-07-25T09:00:00-04:00',
      receivedAt: '2026-07-25T09:00:05-04:00',
      schemaVersion: '2026-08-01',
      actor: 'SYSTEM',
      executionMode: 'SIMULATED',
      payload: { invoiceId: 'inv-direct-0001' },
    };
    const badPaymentResult = run('PAST_DUE_1_30', badPayment);
    expect(badPaymentResult.state.lifecycleState).toBe('PAST_DUE_1_30');

    const badHuman: CanonicalEvent = {
      eventId: 'evt-bad-human',
      correlationId: 'inc-bad',
      entityId: 'inv-direct-0001',
      type: 'human.decision.recorded',
      source: 'operator-console',
      sourceEventId: 'src-bad-human',
      occurredAt: '2026-07-25T09:00:00-04:00',
      receivedAt: '2026-07-25T09:00:05-04:00',
      schemaVersion: '2026-08-01',
      actor: 'HUMAN',
      executionMode: 'SIMULATED',
      payload: { decidedBy: 'finance' },
    };
    const badHumanResult = run('DISPUTED', badHuman);
    expect(badHumanResult.state.lifecycleState).toBe('DISPUTED');
  });

  it('a human decision cannot resolve a dispute that is not open', () => {
    const humanEvent: CanonicalEvent = {
      eventId: 'evt-not-disputed',
      correlationId: 'inc-not-disputed',
      entityId: 'inv-direct-0001',
      type: 'human.decision.recorded',
      source: 'operator-console',
      sourceEventId: 'src-not-disputed',
      occurredAt: '2026-07-25T09:00:00-04:00',
      receivedAt: '2026-07-25T09:00:05-04:00',
      schemaVersion: '2026-08-01',
      actor: 'HUMAN',
      executionMode: 'SIMULATED',
      payload: { decidedBy: 'finance', decision: 'RESOLVE_DISPUTE', rationale: 'n/a' },
    };
    const result = run('PAST_DUE_1_30', humanEvent);
    expect(result.state.lifecycleState).toBe('PAST_DUE_1_30');
  });

  it('permitted reply classes are exactly the declared closed set', () => {
    expect(RR_REPLY_CLASSES).toEqual(['DISPUTE', 'PROMISE_TO_PAY', 'NEITHER']);
  });
});

describe('Receivables Recovery — registry wiring', () => {
  it('registers both scenarios', () => {
    expect(RECEIVABLES_RECOVERY_SCENARIOS).toHaveLength(2);
  });
});
