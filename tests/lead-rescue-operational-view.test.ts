import { describe, expect, it } from 'vitest';
import {
  EXECUTION_JOURNAL_SCHEMA_VERSION,
  InMemoryExecutionJournal,
  type JournalEvent,
  type ObservableOutcome,
  type JournalEventType,
} from '@/lib/persistence/execution-journal-store';
import { deriveOperationalView } from '@/lib/observability/operational-view';

/**
 * FALSIFYING TESTS for the AGGREGATE OPERATIONAL VIEW.
 *
 * `tests/execution-journal.test.ts` proves one case's history is recorded and readable. It
 * cannot falsify the claim this package makes, which is about MANY executions seen together
 * and about the ways an aggregate can lie:
 *
 *   - by only ever being able to show one case at a time;
 *   - by reporting a total that does not reconcile to the records underneath it;
 *   - by inventing a duration where no interval was ever observed;
 *   - by letting a suppressed replay inflate a business-level total;
 *   - by folding OUTCOME_UNKNOWN into either success or failure;
 *   - by losing failure, recovery, or operator intervention in the summing.
 *
 * Every check below is written against semantics, not against a placeholder: each one fails
 * for a substantively missing capability rather than for an unimplemented stub.
 */

let sequence = 0;

function event(overrides: Partial<JournalEvent> & { incidentId: string }): JournalEvent {
  sequence += 1;
  return {
    journalEventId: overrides.journalEventId ?? `evt-${sequence}`,
    schemaVersion: EXECUTION_JOURNAL_SCHEMA_VERSION,
    recordedAt: overrides.recordedAt ?? '2026-08-26T10:00:00.000Z',
    systemId: 'lead-rescue',
    correlationId: overrides.correlationId ?? `inc-${overrides.incidentId}`,
    type: (overrides.type ?? 'INGRESS_RECEIVED') as JournalEventType,
    outcome: (overrides.outcome ?? 'ACCEPTED') as ObservableOutcome,
    ...overrides,
  } as JournalEvent;
}

/** A dispatch attempt at the action boundary — the only place delivery outcomes appear. */
function dispatch(incidentId: string, outcome: ObservableOutcome, overrides: Partial<JournalEvent> = {}) {
  return event({ incidentId, type: 'DISPATCH_ATTEMPTED', outcome, mechanism: 'EXECUTION', ...overrides });
}

describe('aggregate operational view — multi-execution observation', () => {
  it('observes many incidents together rather than one case at a time', () => {
    const view = deriveOperationalView([
      event({ incidentId: 'lead-a' }),
      event({ incidentId: 'lead-b' }),
      event({ incidentId: 'lead-c' }),
    ]);

    expect(view.incidentCount).toBe(3);
    expect(view.observationCount).toBe(3);
    expect(view.incidents.map((i) => i.incidentId)).toEqual(['lead-a', 'lead-b', 'lead-c']);
  });

  it('reports an empty view as genuinely empty rather than as zeroed metrics', () => {
    const view = deriveOperationalView([]);

    expect(view.observationCount).toBe(0);
    expect(view.incidentCount).toBe(0);
    // The timing aggregate must not claim a measured zero when nothing was measured.
    expect(view.timing.observedIntervals.kind).toBe('UNAVAILABLE');
  });
});

describe('aggregate operational view — aggregates reconcile to their sources', () => {
  it('reconciles observation count to the sum of per-incident event counts', () => {
    const view = deriveOperationalView([
      event({ incidentId: 'lead-a' }),
      event({ incidentId: 'lead-a', recordedAt: '2026-08-26T10:00:05.000Z' }),
      event({ incidentId: 'lead-b' }),
    ]);

    const summed = view.incidents.reduce((total, incident) => total + incident.eventCount, 0);
    expect(summed).toBe(view.observationCount);
    expect(summed).toBe(3);
  });

  it('makes every outcome tally traceable back to the exact records that produced it', () => {
    const events = [
      dispatch('lead-a', 'EXECUTED', { journalEventId: 'x-1' }),
      dispatch('lead-b', 'EXECUTED', { journalEventId: 'x-2' }),
      dispatch('lead-c', 'FAILED_BEFORE_EFFECT', { journalEventId: 'x-3' }),
    ];
    const view = deriveOperationalView(events);

    const executed = view.outcomes.find((o) => o.outcome === 'EXECUTED');
    expect(executed?.count).toBe(2);
    // Not just a number: the ids that produced it, so a reviewer can open them.
    expect(executed?.journalEventIds).toEqual(['x-1', 'x-2']);

    // Every cited id must exist in the source records — no aggregate may cite a phantom.
    const known = new Set(events.map((e) => e.journalEventId));
    for (const tally of view.outcomes) {
      expect(tally.count).toBe(tally.journalEventIds.length);
      for (const id of tally.journalEventIds) expect(known.has(id)).toBe(true);
    }
  });
});

describe('aggregate operational view — timing comes from real timestamps only', () => {
  it('measures an interval from the recorded timestamps, not from a constant', () => {
    const view = deriveOperationalView([
      event({ incidentId: 'lead-a', recordedAt: '2026-08-26T10:00:00.000Z' }),
      event({ incidentId: 'lead-a', recordedAt: '2026-08-26T10:00:07.500Z' }),
    ]);

    const incident = view.incidents[0];
    expect(incident?.observedIntervalMs).toEqual({ kind: 'AVAILABLE', value: 7500 });
  });

  it('leaves a single-observation incident explicitly UNAVAILABLE rather than zero', () => {
    const view = deriveOperationalView([event({ incidentId: 'lead-solo' })]);

    const incident = view.incidents[0];
    expect(incident?.observedIntervalMs.kind).toBe('UNAVAILABLE');
    // The specific failure this guards: a convenient zero standing in for "never measured".
    expect(JSON.stringify(incident?.observedIntervalMs)).not.toContain('"value":0');
    expect(view.timing.unmeasurableIncidents.map((u) => u.incidentId)).toContain('lead-solo');
  });

  it('reports the aggregate as UNAVAILABLE when no incident had a measurable interval', () => {
    const view = deriveOperationalView([event({ incidentId: 'lead-a' }), event({ incidentId: 'lead-b' })]);

    expect(view.timing.observedIntervals.kind).toBe('UNAVAILABLE');
  });

  it('attributes elapsed time to observed stage transitions using real deltas', () => {
    const view = deriveOperationalView([
      event({ incidentId: 'lead-a', type: 'INGRESS_RECEIVED', recordedAt: '2026-08-26T10:00:00.000Z' }),
      event({
        incidentId: 'lead-a',
        type: 'HUMAN_DECISION_RECORDED',
        outcome: 'ACCEPTED',
        recordedAt: '2026-08-26T10:00:04.000Z',
      }),
    ]);

    const transition = view.timing.stageTransitions.find((t) => t.from === 'TRIGGER' && t.to === 'AUTHORITY');
    expect(transition?.totalMs).toBe(4000);
    expect(transition?.incidentIds).toEqual(['lead-a']);
  });
});

describe('aggregate operational view — replay must not inflate business totals', () => {
  it('separates execution attempts from the business incidents they belong to', () => {
    const view = deriveOperationalView([
      dispatch('lead-a', 'EXECUTED'),
      dispatch('lead-a', 'SUPPRESSED_DUPLICATE'),
      dispatch('lead-a', 'SUPPRESSED_DUPLICATE'),
    ]);

    expect(view.dispatch.attempts).toBe(3);
    expect(view.dispatch.executed).toBe(1);
    expect(view.dispatch.suppressedDuplicate).toBe(2);
    // The number that would mislead a buyer if it counted attempts: one lead was delivered to.
    expect(view.dispatch.incidentsWithConfirmedDelivery).toBe(1);
    expect(view.incidentCount).toBe(1);
  });

  /**
   * The case that separates the two numbers. Where a lead is delivered to twice — a genuine
   * re-send, not a suppressed replay — `executed` is 2 while the business total is still 1.
   * Without this, an implementation that simply reported the attempt count as the lead count
   * would pass every other check in this file, because the two happen to coincide whenever a
   * case is delivered to exactly once.
   */
  it('counts leads, not execution attempts, when one lead is delivered to more than once', () => {
    const view = deriveOperationalView([
      dispatch('lead-a', 'EXECUTED', { recordedAt: '2026-08-26T10:00:00.000Z' }),
      dispatch('lead-a', 'EXECUTED', { recordedAt: '2026-08-26T10:05:00.000Z' }),
    ]);

    expect(view.dispatch.executed).toBe(2);
    expect(view.dispatch.incidentsWithConfirmedDelivery).toBe(1);
    expect(view.incidentCount).toBe(1);
  });

  it('never lets a suppressed duplicate register as a second delivery', () => {
    const view = deriveOperationalView([
      dispatch('lead-a', 'SUPPRESSED_DUPLICATE'),
      dispatch('lead-b', 'SUPPRESSED_DUPLICATE'),
    ]);

    expect(view.dispatch.suppressedDuplicate).toBe(2);
    expect(view.dispatch.executed).toBe(0);
    expect(view.dispatch.incidentsWithConfirmedDelivery).toBe(0);
  });
});

describe('aggregate operational view — uncertainty stays distinct', () => {
  it('keeps OUTCOME_UNKNOWN apart from confirmed success and confirmed failure', () => {
    const view = deriveOperationalView([
      dispatch('lead-a', 'EXECUTED'),
      dispatch('lead-b', 'FAILED_BEFORE_EFFECT'),
      dispatch('lead-c', 'OUTCOME_UNKNOWN'),
    ]);

    expect(view.dispatch.executed).toBe(1);
    expect(view.dispatch.failedBeforeEffect).toBe(1);
    expect(view.dispatch.outcomeUnknown).toBe(1);

    // The three must never be collapsed into a success/failure binary.
    expect(view.dispatch.incidentsWithConfirmedDelivery).toBe(1);
    expect(view.dispatch.incidentsWithUnresolvedDelivery).toBe(1);
  });

  it('does not count an unresolved delivery as a failure', () => {
    const view = deriveOperationalView([dispatch('lead-a', 'OUTCOME_UNKNOWN')]);

    expect(view.dispatch.failedBeforeEffect).toBe(0);
    expect(view.dispatch.outcomeUnknown).toBe(1);
    expect(view.incidents[0]?.hadUnresolvedDelivery).toBe(true);
    expect(view.incidents[0]?.hadConfirmedDelivery).toBe(false);
  });
});

describe('aggregate operational view — failure, recovery and intervention stay inspectable', () => {
  it('tallies the canonical failure vocabulary with its source records', () => {
    const view = deriveOperationalView([
      dispatch('lead-a', 'FAILED_BEFORE_EFFECT', { failureClass: 'DOWNSTREAM_API_FAILURE', journalEventId: 'f-1' }),
      dispatch('lead-b', 'FAILED_BEFORE_EFFECT', { failureClass: 'DOWNSTREAM_API_FAILURE', journalEventId: 'f-2' }),
    ]);

    const tally = view.failures.find((f) => f.failureClass === 'DOWNSTREAM_API_FAILURE');
    expect(tally?.count).toBe(2);
    expect(tally?.journalEventIds).toEqual(['f-1', 'f-2']);
  });

  it('surfaces operator intervention and authentication refusal separately', () => {
    const view = deriveOperationalView([
      event({ incidentId: 'lead-a', type: 'HUMAN_DECISION_RECORDED', outcome: 'ACCEPTED', mechanism: 'HUMAN_DECISION' }),
      event({
        incidentId: 'lead-b',
        type: 'OPERATOR_AUTHENTICATION',
        outcome: 'REFUSED',
        mechanism: 'AUTHENTICATION',
      }),
    ]);

    expect(view.intervention.humanDecisions).toBe(1);
    expect(view.intervention.authenticationRefusals).toBe(1);
    expect(view.intervention.incidentsWithIntervention).toBe(1);
    expect(view.incidents.find((i) => i.incidentId === 'lead-a')?.hadOperatorIntervention).toBe(true);
  });

  it('shows a recovery — an incident that failed and was later delivered — as both', () => {
    const view = deriveOperationalView([
      dispatch('lead-a', 'FAILED_BEFORE_EFFECT', { recordedAt: '2026-08-26T10:00:00.000Z' }),
      dispatch('lead-a', 'EXECUTED', { recordedAt: '2026-08-26T10:00:30.000Z' }),
    ]);

    const incident = view.incidents[0];
    expect(incident?.hadConfirmedDelivery).toBe(true);
    expect(incident?.outcomes).toContain('FAILED_BEFORE_EFFECT');
    expect(view.dispatch.attempts).toBe(2);
    expect(view.dispatch.incidentsWithConfirmedDelivery).toBe(1);
  });
});

describe('journal reader — cross-incident capability', () => {
  it('reads every retained observation across all incidents in one query', async () => {
    const journal = new InMemoryExecutionJournal();
    await journal.record(event({ incidentId: 'lead-a' }));
    await journal.record(event({ incidentId: 'lead-b' }));

    // Without this the operator surface can only ever ask one case at a time.
    const all = await journal.readAll();
    expect(all).toHaveLength(2);
    expect([...new Set(all.map((e) => e.incidentId))].sort()).toEqual(['lead-a', 'lead-b']);
  });

  it('returns an empty cross-incident read when nothing was ever observed', async () => {
    expect(await new InMemoryExecutionJournal().readAll()).toEqual([]);
  });
});
