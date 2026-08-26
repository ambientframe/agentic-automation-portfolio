import { describe, expect, it } from 'vitest';
import { DECISION_MECHANISMS } from '@/lib/model/system';
import {
  JOURNAL_EVENT_TYPES,
  JOURNAL_MECHANISMS,
  JOURNAL_STAGES,
  OBSERVABLE_OUTCOMES,
  STAGE_FOR_EVENT_TYPE,
} from '@/lib/persistence/execution-journal-store';
import { GRAMMAR_STAGES } from '@/lib/proof/commercial-grammar';
import {
  EVENT_SUBJECT,
  GUARDRAIL_PRECEDENCE,
  LIVE_SELECTION_RULES,
  MECHANISM_GLOSS,
  NON_DECISION_MECHANISMS,
  OUTCOME_GLOSS,
  deriveLiveGrammar,
  type JournalWireEvent,
} from '@/lib/proof/live-grammar';

/**
 * The live strip is the one part of the proof page that narrates a case which is genuinely
 * running, so the failure that matters is not an ugly render — it is the strip asserting a
 * stage the runtime never recorded, or laundering a simulated send into a real one.
 *
 * Two families of test, therefore:
 *
 *   1. VOCABULARY CANNOT DRIFT. `lib/proof/live-grammar.ts` imports the persistence module for
 *      TYPES ONLY so its file-system code stays out of the browser bundle. That erasure is
 *      exactly what would let it keep a private, stale copy of the runtime's vocabulary without
 *      anyone noticing. These tests import the real constants and compare.
 *
 *   2. NO CELL MAY CLAIM MORE THAN ITS RECORD. Every OBSERVED cell must name a record that was
 *      actually in the input, and every absent one must read as unobserved rather than as
 *      nothing having happened.
 */

const BASE = {
  incidentId: 'demo-lead-1',
  correlationId: 'inc-demo-lead-1',
} as const;

function event(overrides: Partial<JournalWireEvent> & Pick<JournalWireEvent, 'type' | 'outcome'>): JournalWireEvent {
  return {
    ...BASE,
    journalEventId: `${overrides.type}:${overrides.outcome}:${overrides.recordedAt ?? '2026-01-01T00:00:00.000Z'}`,
    recordedAt: '2026-01-01T00:00:00.000Z',
    stage: STAGE_FOR_EVENT_TYPE[overrides.type],
    ...overrides,
  };
}

function derive(events: readonly JournalWireEvent[], lifecycleState: string | null = 'NEEDS_HUMAN') {
  return deriveLiveGrammar({
    incidentId: BASE.incidentId,
    events,
    lifecycleState,
    lifecycleMeaning: lifecycleState === null ? null : 'A named person owns this case.',
  });
}

function cell(events: readonly JournalWireEvent[], stage: (typeof GRAMMAR_STAGES)[number], lifecycleState?: string | null) {
  const grammar = derive(events, lifecycleState === undefined ? 'NEEDS_HUMAN' : lifecycleState);
  const found = grammar.cells.find((candidate) => candidate.stage === stage);
  expect(found, stage).toBeDefined();
  return found as NonNullable<typeof found>;
}

// ---------------------------------------------------------------------------

describe('the live strip speaks the runtime\u2019s vocabulary, not a copy of it', () => {
  it('glosses every observable outcome the journal can record', () => {
    for (const outcome of OBSERVABLE_OUTCOMES) {
      expect(OUTCOME_GLOSS[outcome], outcome).toBeDefined();
      expect(OUTCOME_GLOSS[outcome].meaning.length, outcome).toBeGreaterThan(20);
    }
    expect(Object.keys(OUTCOME_GLOSS).sort()).toEqual([...OBSERVABLE_OUTCOMES].sort());
  });

  it('names every instrumented boundary and every mechanism the journal admits', () => {
    expect(Object.keys(EVENT_SUBJECT).sort()).toEqual([...JOURNAL_EVENT_TYPES].sort());
    expect(Object.keys(MECHANISM_GLOSS).sort()).toEqual([...JOURNAL_MECHANISMS].sort());
  });

  /**
   * The DECISION rule is "carries a decision mechanism". It is expressed as a subtraction from
   * the journal vocabulary rather than as a hard-coded allow-list, so that a genuine fourth
   * canonical decision mechanism becomes a decision here automatically. This test is what makes
   * that claim true rather than aspirational.
   */
  it('treats exactly the non-canonical mechanisms as non-decisions', () => {
    for (const mechanism of NON_DECISION_MECHANISMS) {
      expect(JOURNAL_MECHANISMS, mechanism).toContain(mechanism);
      expect(DECISION_MECHANISMS as readonly string[], mechanism).not.toContain(mechanism);
    }
    for (const mechanism of DECISION_MECHANISMS) {
      expect(NON_DECISION_MECHANISMS as readonly string[], mechanism).not.toContain(mechanism);
    }
    expect(NON_DECISION_MECHANISMS.length + DECISION_MECHANISMS.length).toBe(JOURNAL_MECHANISMS.length);
  });

  it('orders only real outcomes in the guardrail precedence', () => {
    for (const outcome of GUARDRAIL_PRECEDENCE) {
      expect(OBSERVABLE_OUTCOMES, outcome).toContain(outcome);
    }
    expect(new Set(GUARDRAIL_PRECEDENCE).size).toBe(GUARDRAIL_PRECEDENCE.length);
  });

  it('renders the same five cells as the built runs, in the same order', () => {
    expect(derive([]).cells.map((entry) => entry.stage)).toEqual([...GRAMMAR_STAGES]);
    expect(LIVE_SELECTION_RULES.map((rule) => rule.stage)).toEqual([...GRAMMAR_STAGES]);
    for (const rule of LIVE_SELECTION_RULES) {
      expect(rule.rule.length, rule.stage).toBeGreaterThan(30);
    }
  });

  /**
   * `OUTCOME` is a declared journal stage that no event type ever produces. The strip must read
   * it from the case record and say so; deriving it from history would mean waiting for a
   * record that structurally cannot arrive.
   */
  it('knows that no journal event type produces an outcome record', () => {
    expect(JOURNAL_STAGES).toContain('OUTCOME');
    expect(Object.values(STAGE_FOR_EVENT_TYPE)).not.toContain('OUTCOME');
    expect(cell([], 'OUTCOME').status).toBe('FROM_CASE_RECORD');
  });
});

describe('no cell claims more than the record behind it', () => {
  it('reports an empty journal as five unobserved stages, inventing nothing', () => {
    const grammar = derive([], null);
    expect(grammar.recordCount).toBe(0);
    expect(grammar.observedStages).toBe(0);
    for (const entry of grammar.cells) {
      expect(entry.status, entry.stage).not.toBe('OBSERVED');
      expect(entry.evidence, entry.stage).toHaveLength(0);
      expect(entry.executionMode, entry.stage).toBeNull();
    }
  });

  it('says "not observed" rather than "did not happen" where the runtime wrote nothing', () => {
    const trigger = cell([], 'TRIGGER');
    expect(trigger.status).toBe('NOT_OBSERVED');
    expect(trigger.headline).toContain('Not recorded');

    // "Nothing was refused" is the one absent-cell headline a reader could mistake for a
    // guarantee, so it has to carry the disclaimer rather than merely avoid the word.
    const guardrail = cell([], 'GUARDRAIL');
    expect(guardrail.status).toBe('NOT_OBSERVED');
    expect(guardrail.detail).toContain('what was observed');
    expect(guardrail.detail).toMatch(/not a guarantee/i);
  });

  it('cites a record id that was genuinely in the input for every observed cell', () => {
    const events = [
      event({ type: 'INGRESS_RECEIVED', outcome: 'ACCEPTED', mechanism: 'DETERMINISTIC_RULE' }),
      event({ type: 'DISPATCH_ATTEMPTED', outcome: 'EXECUTED', mechanism: 'EXECUTION', executionMode: 'SIMULATED' }),
    ];
    const ids = new Set(events.map((entry) => entry.journalEventId));
    const grammar = derive(events);

    for (const entry of grammar.cells.filter((candidate) => candidate.status === 'OBSERVED')) {
      expect(entry.evidence.length, entry.stage).toBeGreaterThan(0);
      for (const id of entry.evidence) expect(ids, entry.stage).toContain(id);
    }
  });

  /**
   * The one substitution that would be worth more to a vendor than anything else on the page,
   * and the one this build must never make.
   */
  it('never upgrades a simulated transport to a real one', () => {
    const simulated = cell(
      [event({ type: 'DISPATCH_ATTEMPTED', outcome: 'EXECUTED', mechanism: 'EXECUTION', executionMode: 'SIMULATED' })],
      'ACTION',
    );
    expect(simulated.executionMode).toBe('SIMULATED');

    // An executor that reported no mode is reported as unknown, never as either one.
    const unstated = cell([event({ type: 'DISPATCH_ATTEMPTED', outcome: 'EXECUTED', mechanism: 'EXECUTION' })], 'ACTION');
    expect(unstated.executionMode).toBeNull();
  });

  it('reports an unconfirmed send as uncertain rather than as done', () => {
    const action = cell(
      [event({ type: 'DISPATCH_ATTEMPTED', outcome: 'OUTCOME_UNKNOWN', mechanism: 'EXECUTION' })],
      'ACTION',
    );
    expect(action.tone).toBe('UNCERTAIN');
    expect(action.headline).not.toMatch(/carried out/i);
  });
});

describe('the decision cell reports decisions, and the guardrail cell reports refusals', () => {
  /**
   * A refused attempt is not a decision. Counting one would let a case that was blocked at the
   * gate render a DECISION headline, which is precisely the flattering reading the strip exists
   * to prevent.
   */
  it('never counts a refused attempt as the decision', () => {
    const refusedOnly = [
      event({ type: 'HUMAN_DECISION_RECORDED', outcome: 'REFUSED', mechanism: 'HUMAN_DECISION' }),
      event({ type: 'OPERATOR_AUTHENTICATION', outcome: 'REFUSED', mechanism: 'AUTHENTICATION' }),
    ];
    expect(cell(refusedOnly, 'DECISION').status).toBe('NOT_OBSERVED');
    expect(cell(refusedOnly, 'GUARDRAIL').status).toBe('OBSERVED');
  });

  it('never counts an execution or an identity check as the decision', () => {
    const notDecisions = [
      event({ type: 'DISPATCH_ATTEMPTED', outcome: 'EXECUTED', mechanism: 'EXECUTION' }),
      event({ type: 'OPERATOR_AUTHENTICATION', outcome: 'ACCEPTED', mechanism: 'AUTHENTICATION' }),
    ];
    expect(cell(notDecisions, 'DECISION').status).toBe('NOT_OBSERVED');
  });

  it('takes the most recent accepted decision, and names who or what made it', () => {
    const decision = cell(
      [
        event({
          type: 'WAIT_EVALUATED',
          outcome: 'NO_ACTION',
          mechanism: 'DETERMINISTIC_RULE',
          recordedAt: '2026-01-01T00:00:00.000Z',
        }),
        event({
          type: 'HUMAN_DECISION_RECORDED',
          outcome: 'ACCEPTED',
          mechanism: 'HUMAN_DECISION',
          recordedAt: '2026-01-01T01:00:00.000Z',
        }),
      ],
      'DECISION',
    );
    expect(decision.status).toBe('OBSERVED');
    expect(decision.technicalName).toContain('HUMAN_DECISION_RECORDED');
    expect(decision.detail).toContain('person');
    expect(decision.recordCount).toBe(2);
  });

  it('shows the strongest refusal, not the latest one', () => {
    const guardrail = cell(
      [
        event({ type: 'HUMAN_DECISION_RECORDED', outcome: 'REFUSED', mechanism: 'HUMAN_DECISION', recordedAt: '2026-01-01T00:00:00.000Z' }),
        event({ type: 'WAIT_EVALUATED', outcome: 'ESCALATED', mechanism: 'DETERMINISTIC_RULE', recordedAt: '2026-01-01T09:00:00.000Z' }),
      ],
      'GUARDRAIL',
    );
    expect(guardrail.technicalName).toContain('REFUSED');
    expect(guardrail.recordCount).toBe(2);
  });

  it('prefers the runtime\u2019s own detail over the generic gloss', () => {
    const guardrail = cell(
      [
        event({
          type: 'HUMAN_DECISION_RECORDED',
          outcome: 'REFUSED',
          mechanism: 'HUMAN_DECISION',
          detail: 'The role "analyst" does not hold sufficient authority for this decision.',
        }),
      ],
      'GUARDRAIL',
    );
    expect(guardrail.detail).toContain('analyst');
  });
});

describe('the outcome cell is read from the case, and never from history', () => {
  it('labels its source as the case record even when the journal is full', () => {
    const outcome = cell(
      [event({ type: 'DISPATCH_ATTEMPTED', outcome: 'EXECUTED', mechanism: 'EXECUTION', executionMode: 'SIMULATED' })],
      'OUTCOME',
      'AWAITING_REPLY',
    );
    expect(outcome.status).toBe('FROM_CASE_RECORD');
    expect(outcome.evidence).toHaveLength(0);
    expect(outcome.headline).toBe('AWAITING REPLY');
    expect(outcome.detail).toContain('no journal event type produces an outcome record');
  });

  it('reports a case that is not in the store as having no state, rather than guessing one', () => {
    const outcome = cell([event({ type: 'INGRESS_RECEIVED', outcome: 'ACCEPTED' })], 'OUTCOME', null);
    expect(outcome.status).toBe('NOT_OBSERVED');
    expect(outcome.technicalName).toBeNull();
  });
});
