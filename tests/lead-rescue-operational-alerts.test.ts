import path from 'node:path';
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  EXECUTION_JOURNAL_SCHEMA_VERSION,
  type JournalEvent,
  type JournalEventType,
  type ObservableOutcome,
} from '@/lib/persistence/execution-journal-store';
import { deriveOperationalView } from '@/lib/observability/operational-view';
import { deriveOperationalAlerts, type OperationalAlert } from '@/lib/observability/operational-alerts';
import type { ObservationIntegrity } from '@/lib/observability/observation-integrity';

/**
 * FALSIFYING TESTS for DETERMINISTIC OPERATOR ALERTING.
 *
 * The aggregate view answers "what has this system been doing" to somebody who goes and looks.
 * These tests falsify the claim that materially actionable conditions are RAISED instead —
 * and, just as importantly, the claim that ordinary correct behaviour is NOT raised:
 *
 *   - an alert layer that fires on every abnormal-looking record is a log with a red border;
 *   - an alert whose evidence cannot be opened is an assertion;
 *   - an alert whose identity changes between derivations cannot be deduplicated or tracked;
 *   - an alert layer that can act is no longer an observability component;
 *   - "zero alerts" that means "we could not tell" is the most dangerous output of all.
 */

const CLEAN_INTEGRITY: ObservationIntegrity = {
  kind: 'NO_KNOWN_LOSS',
  intentsReconciled: 0,
  basis: 'Every write-ahead observation marker was reconciled. This cannot rule out a loss whose marker was itself never written.',
};

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

function dispatch(incidentId: string, outcome: ObservableOutcome, overrides: Partial<JournalEvent> = {}) {
  return event({ incidentId, type: 'DISPATCH_ATTEMPTED', outcome, mechanism: 'EXECUTION', ...overrides });
}

function alertsFor(events: readonly JournalEvent[], integrity: ObservationIntegrity = CLEAN_INTEGRITY) {
  return deriveOperationalAlerts(deriveOperationalView(events), integrity);
}

function conditions(alerts: readonly OperationalAlert[]): readonly string[] {
  return alerts.map((alert) => alert.condition);
}

// ---------------------------------------------------------------------------

describe('operator alerts — conditions that genuinely need a person', () => {
  it('raises an unresolved delivery as the highest severity, because nobody knows if it reached anyone', () => {
    const alerts = alertsFor([
      event({ incidentId: 'case-1' }),
      dispatch('case-1', 'OUTCOME_UNKNOWN', { journalEventId: 'case-1:dispatch:unknown' }),
    ]);

    const unresolved = alerts.find((a) => a.condition === 'UNRESOLVED_DELIVERY');
    expect(unresolved, 'an outcome-unknown delivery raised nothing at all').toBeDefined();
    expect(unresolved?.severity).toBe('CRITICAL');
    expect(unresolved?.incidentId).toBe('case-1');
    expect(unresolved?.evidenceJournalEventIds).toContain('case-1:dispatch:unknown');
    expect(unresolved?.operatorAction.length, 'the alert did not say what a person should do').toBeGreaterThan(20);
  });

  it('raises a confirmed failed delivery separately from an unknown one — they need different actions', () => {
    const alerts = alertsFor([
      event({ incidentId: 'case-2' }),
      dispatch('case-2', 'FAILED_BEFORE_EFFECT', {
        journalEventId: 'case-2:dispatch:failed',
        failureClass: 'DOWNSTREAM_API_FAILURE',
      }),
    ]);

    const failed = alerts.find((a) => a.condition === 'FAILED_DELIVERY');
    expect(failed).toBeDefined();
    expect(failed?.severity).toBe('ATTENTION');
    expect(
      conditions(alerts),
      'a confirmed non-delivery was reported as an unknown one, collapsing two different problems',
    ).not.toContain('UNRESOLVED_DELIVERY');
    expect(failed?.evidenceJournalEventIds).toContain('case-2:dispatch:failed');
  });

  it('raises an elapsed attention window from the engine’s own escalation record, never from a clock', () => {
    const alerts = alertsFor([
      event({ incidentId: 'case-3' }),
      event({
        incidentId: 'case-3',
        journalEventId: 'case-3:wait:escalated',
        type: 'WAIT_EVALUATED',
        outcome: 'ESCALATED',
        failureClass: 'HUMAN_APPROVAL_TIMEOUT',
      }),
    ]);

    const stalled = alerts.find((a) => a.condition === 'ATTENTION_OVERDUE');
    expect(stalled, 'an elapsed attention window raised nothing').toBeDefined();
    expect(stalled?.severity).toBe('ATTENTION');
    expect(stalled?.evidenceJournalEventIds).toContain('case-3:wait:escalated');
  });

  it('raises known observation loss, so a degraded instrument is itself an operational condition', () => {
    const alerts = alertsFor([event({ incidentId: 'case-4' })], {
      kind: 'KNOWN_LOSS',
      intentsReconciled: 2,
      basis: 'bound',
      losses: [
        {
          kind: 'CONFIRMED_DROP',
          journalEventId: 'case-4:INGRESS_RECEIVED:accepted',
          incidentId: 'case-4',
          correlationId: 'inc-case-4',
          systemId: 'lead-rescue',
          type: 'INGRESS_RECEIVED',
          outcome: 'ACCEPTED',
          intendedAt: '2026-08-26T10:00:00.000Z',
          reason: 'EACCES: permission denied',
        },
      ],
    });

    const loss = alerts.find((a) => a.condition === 'OBSERVATION_LOSS');
    expect(loss).toBeDefined();
    expect(loss?.severity).toBe('ATTENTION');
    expect(loss?.reason, 'the alert did not name how many observations were lost').toContain('1');
    expect(loss?.evidenceJournalEventIds).toContain('case-4:INGRESS_RECEIVED:accepted');
  });

  it('raises an UNMEASURABLE instrument as a DIFFERENT, higher condition than known loss', () => {
    const alerts = alertsFor([event({ incidentId: 'case-5' })], {
      kind: 'UNAVAILABLE',
      basis: 'bound',
      reason: 'the intent ledger could not be read',
    });

    expect(conditions(alerts)).toContain('OBSERVATION_UNMEASURABLE');
    expect(conditions(alerts), 'not knowing was reported as knowing there was loss').not.toContain('OBSERVATION_LOSS');
    expect(alerts.find((a) => a.condition === 'OBSERVATION_UNMEASURABLE')?.severity).toBe('CRITICAL');
  });
});

describe('operator alerts — the noise floor is part of the capability', () => {
  it('raises nothing for a clean, entirely ordinary run', () => {
    const alerts = alertsFor([
      event({ incidentId: 'case-6' }),
      dispatch('case-6', 'EXECUTED'),
    ]);
    expect(alerts).toEqual([]);
  });

  it('does NOT raise an authority refusal — the system refusing correctly is not an incident', () => {
    const alerts = alertsFor([
      event({ incidentId: 'case-7' }),
      event({
        incidentId: 'case-7',
        type: 'HUMAN_DECISION_RECORDED',
        outcome: 'REFUSED',
        failureClass: 'POLICY_VIOLATION',
      }),
      event({ incidentId: 'case-7', type: 'OPERATOR_AUTHENTICATION', outcome: 'REFUSED' }),
      dispatch('case-7', 'REFUSED', { failureClass: 'POLICY_VIOLATION' }),
    ]);
    expect(alerts, 'correct refusals were raised as operational alerts, which is noise').toEqual([]);
  });

  it('does NOT raise a suppressed duplicate — duplicate suppression working is the success case', () => {
    const alerts = alertsFor([
      event({ incidentId: 'case-8' }),
      dispatch('case-8', 'EXECUTED'),
      dispatch('case-8', 'SUPPRESSED_DUPLICATE', { failureClass: 'RETRY_DUPLICATE_SIDE_EFFECT' }),
    ]);
    expect(alerts).toEqual([]);
  });

  it('stops raising a failed delivery once a later delivery genuinely succeeded, and shows it as resolved', () => {
    const alerts = alertsFor([
      event({ incidentId: 'case-9' }),
      dispatch('case-9', 'FAILED_BEFORE_EFFECT', {
        journalEventId: 'case-9:failed',
        recordedAt: '2026-08-26T10:00:01.000Z',
        failureClass: 'DOWNSTREAM_API_FAILURE',
      }),
      dispatch('case-9', 'EXECUTED', { journalEventId: 'case-9:executed', recordedAt: '2026-08-26T10:00:02.000Z' }),
    ]);

    const failed = alerts.find((a) => a.condition === 'FAILED_DELIVERY');
    expect(failed, 'the recovery erased the failure entirely instead of showing it resolved').toBeDefined();
    expect(failed?.status).toBe('RESOLVED_BY_LATER_EVIDENCE');
    expect(alerts.filter((a) => a.status === 'ACTIVE'), 'a recovered case still demands attention').toEqual([]);
  });

  it('an empty alert list on an EMPTY journal still reports the integrity basis rather than implying health', () => {
    const alerts = alertsFor([]);
    expect(alerts).toEqual([]);
    // The absence of alerts is only meaningful alongside a readable instrument; that pairing is
    // enforced by the UNMEASURABLE case above, which must fire even with no events at all.
    const blind = deriveOperationalAlerts(deriveOperationalView([]), {
      kind: 'UNAVAILABLE',
      basis: 'bound',
      reason: 'unreadable',
    });
    expect(conditions(blind), 'a blind instrument with no events looked identical to a healthy one').toContain(
      'OBSERVATION_UNMEASURABLE',
    );
  });
});

describe('operator alerts — identity, ordering and purity', () => {
  it('gives each alert a stable identity across repeated derivations', () => {
    const events = [
      event({ incidentId: 'case-10', journalEventId: 'case-10:ingress' }),
      dispatch('case-10', 'OUTCOME_UNKNOWN', { journalEventId: 'case-10:unknown' }),
    ];
    const first = alertsFor(events);
    const second = alertsFor(events);

    expect(first.map((a) => a.alertId)).toEqual(second.map((a) => a.alertId));
    expect(JSON.stringify(first), 'the alert layer is not a pure function of its inputs').toEqual(JSON.stringify(second));
  });

  it('keeps that identity FIXED as the same condition accumulates more evidence', () => {
    // The identity has to survive the thing that actually changes between two derivations of a
    // live condition: more records arriving for it. An id derived from its own evidence would
    // pass the previous test and still make the same open condition unrecognisable an hour
    // later, which is the failure that breaks deduplication and tracking.
    const base = [
      event({ incidentId: 'case-10b', journalEventId: 'case-10b:ingress' }),
      dispatch('case-10b', 'FAILED_BEFORE_EFFECT', {
        journalEventId: 'case-10b:f1',
        failureClass: 'DOWNSTREAM_API_FAILURE',
      }),
    ];
    const later = [
      ...base,
      dispatch('case-10b', 'FAILED_BEFORE_EFFECT', {
        journalEventId: 'case-10b:f2',
        recordedAt: '2026-08-26T10:05:00.000Z',
        failureClass: 'RATE_LIMITED',
      }),
    ];

    const before = alertsFor(base).find((a) => a.condition === 'FAILED_DELIVERY');
    const after = alertsFor(later).find((a) => a.condition === 'FAILED_DELIVERY');

    expect(before?.alertId, 'the alert identity moved when new evidence arrived for the same condition').toBe(
      after?.alertId,
    );
    expect(after?.evidenceJournalEventIds, 'the new evidence was not picked up at all').toHaveLength(2);
  });

  it('deduplicates one condition per incident even when several records evidence it', () => {
    const alerts = alertsFor([
      event({ incidentId: 'case-11' }),
      dispatch('case-11', 'FAILED_BEFORE_EFFECT', { journalEventId: 'case-11:f1', failureClass: 'DOWNSTREAM_API_FAILURE' }),
      dispatch('case-11', 'FAILED_BEFORE_EFFECT', { journalEventId: 'case-11:f2', failureClass: 'RATE_LIMITED' }),
    ]);

    const failed = alerts.filter((a) => a.condition === 'FAILED_DELIVERY');
    expect(failed, 'the same condition on one case produced two alerts').toHaveLength(1);
    expect(failed[0]?.evidenceJournalEventIds, 'deduplication threw away the evidence').toEqual([
      'case-11:f1',
      'case-11:f2',
    ]);
  });

  it('orders CRITICAL before ATTENTION, and is total — no two alerts ever tie', () => {
    const alerts = alertsFor([
      event({ incidentId: 'b-case' }),
      dispatch('b-case', 'FAILED_BEFORE_EFFECT', { failureClass: 'DOWNSTREAM_API_FAILURE' }),
      event({ incidentId: 'a-case' }),
      dispatch('a-case', 'OUTCOME_UNKNOWN'),
      event({ incidentId: 'c-case' }),
      dispatch('c-case', 'OUTCOME_UNKNOWN'),
    ]);

    expect(alerts[0]?.severity).toBe('CRITICAL');
    const severities = alerts.map((a) => a.severity);
    expect(severities.indexOf('ATTENTION'), 'an ATTENTION alert sorted above a CRITICAL one').toBeGreaterThan(
      severities.lastIndexOf('CRITICAL'),
    );
    expect(new Set(alerts.map((a) => a.alertId)).size, 'two alerts share an identity').toBe(alerts.length);
    // Critical alerts for two different cases are ordered by a real tiebreak, not by input order.
    const criticalIncidents = alerts.filter((a) => a.severity === 'CRITICAL').map((a) => a.incidentId);
    expect(criticalIncidents).toEqual([...criticalIncidents].sort());
  });

  it('reads no clock and no random source — the same records alert identically at any time', () => {
    const source = readFileSync(path.join(process.cwd(), 'lib', 'observability', 'operational-alerts.ts'), 'utf8');
    expect(source, 'the alert layer reads the clock, so its output is not reproducible').not.toMatch(
      /Date\.now|new Date\(|Math\.random/,
    );
  });

  it('holds no execution authority: it imports nothing that can act, persist, or decide', () => {
    const source = readFileSync(path.join(process.cwd(), 'lib', 'observability', 'operational-alerts.ts'), 'utf8');
    const forbidden = [
      'SideEffectExecutor',
      'OperationClaimStore',
      'WaitIncidentStore',
      'ExecutionJournalRecorder',
      'applyEvent',
      'node:fs',
      'fetch(',
    ];
    const offenders = forbidden.filter((symbol) => source.includes(symbol));
    expect(offenders, 'the alert layer can reach something that acts').toEqual([]);
  });

  it('carries no Lead Rescue business vocabulary, so another system can consume it unchanged', () => {
    const source = readFileSync(path.join(process.cwd(), 'lib', 'observability', 'operational-alerts.ts'), 'utf8');
    const forbidden = ['Kestrel', 'kestrel', 'lead-rescue', 'leadRescue', 'BOOKING_READY', 'prospect'];
    const offenders = forbidden.filter((term) => source.includes(term));
    expect(offenders, 'the alert layer imported Lead Rescue vocabulary and cannot be reused').toEqual([]);
  });

  it('every alert is inspectable: identity, severity, reason, evidence, status and action are all present', () => {
    const alerts = alertsFor([
      event({ incidentId: 'case-12' }),
      dispatch('case-12', 'OUTCOME_UNKNOWN', { journalEventId: 'case-12:unknown' }),
    ]);
    for (const alert of alerts) {
      expect(alert.alertId.length).toBeGreaterThan(0);
      expect(alert.condition.length).toBeGreaterThan(0);
      expect(['CRITICAL', 'ATTENTION']).toContain(alert.severity);
      expect(alert.reason.length).toBeGreaterThan(20);
      expect(alert.operatorAction.length).toBeGreaterThan(20);
      expect(['ACTIVE', 'RESOLVED_BY_LATER_EVIDENCE']).toContain(alert.status);
      expect(alert.evidenceJournalEventIds.length).toBeGreaterThan(0);
    }
  });
});

describe('operator alerts — the module stays where it belongs', () => {
  it('is not reachable from engine or port code', () => {
    const roots = [path.join(process.cwd(), 'lib', 'engine'), path.join(process.cwd(), 'lib', 'ports')];
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
          continue;
        }
        if (!entry.name.endsWith('.ts')) continue;
        const source = readFileSync(full, 'utf8');
        for (const symbol of ['deriveOperationalAlerts', 'operational-alerts']) {
          if (source.includes(symbol)) offenders.push(`${path.relative(process.cwd(), full)} references ${symbol}`);
        }
      }
    };
    for (const root of roots) walk(root);
    expect(offenders, 'decision code can reach the alert layer').toEqual([]);
  });
});
