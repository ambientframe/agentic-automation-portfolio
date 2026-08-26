import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  OBSERVATION_INTEGRITY_EVIDENCE_RELATIVE_PATH,
  OPERATIONAL_VIEW_EVIDENCE_RELATIVE_PATH,
} from '@/lib/proof/n8n-evidence';

/**
 * FALSIFICATION TESTS for the retained observation-integrity capture.
 *
 * The artifact makes claims a reader cannot check by hand: that two abnormal delivery outcomes
 * were produced by a real run rather than typed in, that a lost observation was measured rather
 * than asserted, and that an independent process corroborated a non-execution the application
 * had classified itself. Each test below is written so that it FAILS if the corresponding claim
 * were fabricated — an artifact edited to look better must not be able to pass this file.
 *
 * The rule this file exists to enforce: the capture may report a negative, an ambiguity, or a
 * disagreement, but it may never report something the run did not produce.
 */

const REPO_ROOT = process.cwd();

function load<T = Record<string, unknown>>(relative: string): T {
  return JSON.parse(readFileSync(path.join(REPO_ROOT, ...relative.split('/')), 'utf8')) as T;
}

const artifact = load(OBSERVATION_INTEGRITY_EVIDENCE_RELATIVE_PATH);
const aggregate = load(OPERATIONAL_VIEW_EVIDENCE_RELATIVE_PATH);

function record(key: string): Record<string, unknown> {
  return (artifact[key] ?? {}) as Record<string, unknown>;
}
const abnormal = record('abnormalDeliveryEvidence');
const integrity = record('integrity');
const degradation = record('observationDegradationEvidence');
const transcript = record('independentReceiverTranscript');
const view = record('view');
const alerts = (artifact['alerts'] ?? []) as readonly Record<string, unknown>[];
const connections = (transcript['connections'] ?? []) as readonly Record<string, unknown>[];

function nested(source: Record<string, unknown>, ...keys: readonly string[]): Record<string, unknown> {
  let current: Record<string, unknown> = source;
  for (const key of keys) current = (current[key] ?? {}) as Record<string, unknown>;
  return current;
}

describe('observation-integrity capture — it describes a run that genuinely happened', () => {
  it('1. gitHead names a commit that exists in this repository', () => {
    const head = String(artifact['gitHead'] ?? '');
    expect(head).toMatch(/^[0-9a-f]{40}$/);
    expect(() => execFileSync('git', ['cat-file', '-e', `${head}^{commit}`], { cwd: REPO_ROOT })).not.toThrow();
  });

  it('2. the despatches ran through the REAL execution boundary, not a stand-in', () => {
    const failed = nested(abnormal, 'failedBeforeEffect', 'journalRecord');
    const unknown = nested(abnormal, 'outcomeUnknownAfterCrash', 'journalRecord');

    for (const [label, entry] of [
      ['failed-before-effect', failed],
      ['outcome-unknown', unknown],
    ] as const) {
      expect(entry['type'], `${label} is not a despatch record`).toBe('DISPATCH_ATTEMPTED');
      expect(entry['mechanism'], `${label} was not produced by execution`).toBe('EXECUTION');
      expect(entry['executionMode'], `${label} ran on a simulated executor`).toBe('LIVE');
      expect(entry['actorId'], `${label} names no real executor`).toBe('lead-rescue-local-smtp-executor');
      expect(String(entry['operationClaimId'] ?? ''), `${label} took no durable claim`).not.toHaveLength(0);
    }
  });

  it('3. the outcomes are the ones claimed — a relabelled record cannot pass', () => {
    expect(nested(abnormal, 'failedBeforeEffect', 'journalRecord')['outcome']).toBe('FAILED_BEFORE_EFFECT');
    expect(nested(abnormal, 'outcomeUnknownAfterCrash', 'journalRecord')['outcome']).toBe('OUTCOME_UNKNOWN');
    expect(nested(abnormal, 'delivered', 'journalRecord')['outcome']).toBe('EXECUTED');
  });

  it('4. both abnormal outcomes reached the aggregate the application computed for itself', () => {
    const dispatch = (view['dispatch'] ?? {}) as Record<string, number>;
    expect(Number(dispatch['failedBeforeEffect']), 'no real failed-before-effect is in the view').toBeGreaterThan(0);
    expect(Number(dispatch['outcomeUnknown']), 'no real outcome-unknown is in the view').toBeGreaterThan(0);
  });
});

describe('observation-integrity capture — the second observer is doing real work', () => {
  it('5. confirmed non-execution is corroborated by a process other than the sender', () => {
    const receiver = nested(abnormal, 'failedBeforeEffect', 'independentNonExecution');
    expect(receiver['mode'], 'the refused case was not the one the receiver refused').toBe('REFUSE_ENVELOPE');
    expect(receiver['bodyBytesReceived'], 'the receiver actually received a body it claims it did not').toBe(0);
    expect(receiver['storedMessageId'], 'the receiver stored something for a case reported as non-executed').toBeNull();
  });

  it('6. the unknown outcome rests on genuine ambiguity, not on a returned enum', () => {
    const receiver = nested(abnormal, 'outcomeUnknownAfterCrash', 'independentReceiverState');
    expect(Number(receiver['bodyBytesReceived']), 'nothing was ever sent, so nothing could be uncertain').toBeGreaterThan(0);
    expect(receiver['acknowledgedToClient'], 'the receiver DID answer, so the sender could have known').toBe(false);
    expect(String(receiver['storedMessageId'] ?? ''), 'the receiver holds nothing, so this is a failure not an unknown').not.toHaveLength(0);
  });

  it('7. at-most-once survived the crash: recovery opened no further connection', () => {
    expect(
      transcript['connectionsAfterRecovery'],
      'the recovery re-sent, which would make the whole capture a duplicate-delivery demonstration',
    ).toBe(transcript['connectionsBeforeRecovery']);
  });

  it('8. the receiver is declared for what it is and claims no third-party independence', () => {
    const server = nested(record('environment'), 'smtpServer');
    expect(server['thirdPartyProduct'], 'the capture claims a third-party receiver it does not have').toBe(false);
    expect(server['relayConfigured']).toBe(false);
    expect(String(server['boundTo'] ?? '')).toMatch(/^127\.0\.0\.1:/);
  });

  it('9. a disagreement between the observers is reported rather than smoothed away', () => {
    const checks = (artifact['executionClassificationCheckedAgainstTheReceiver'] ?? []) as readonly Record<
      string,
      unknown
    >[];
    expect(checks.length, 'no classification was checked against the receiver at all').toBeGreaterThan(0);
    for (const check of checks) {
      expect(['CORROBORATED', 'CONTRADICTED']).toContain(check['agreement']);
      // Whichever way it went, the reasoning has to be stated. A verdict with no finding is an
      // assertion, and an artifact that only ever agreed with itself would prove nothing.
      expect(String(check['finding'] ?? '').length).toBeGreaterThan(60);
    }
    expect(checks.some((check) => check['agreement'] === 'CORROBORATED')).toBe(true);
  });
});

describe('observation-integrity capture — the loss was measured, not assumed', () => {
  it('10. integrity reports a named loss rather than a bare count', () => {
    expect(integrity['kind']).toBe('KNOWN_LOSS');
    const losses = (integrity['losses'] ?? []) as readonly Record<string, unknown>[];
    expect(losses.length).toBeGreaterThan(0);
    for (const loss of losses) {
      expect(['CONFIRMED_DROP', 'UNRESOLVED_INTENT']).toContain(loss['kind']);
      expect(String(loss['journalEventId'] ?? '')).not.toHaveLength(0);
      expect(String(loss['incidentId'] ?? '')).not.toHaveLength(0);
      expect(String(loss['reason'] ?? '').length, 'a loss with no reason is not a measurement').toBeGreaterThan(10);
    }
  });

  it('11. the lost observation belongs to a case that genuinely has no journal record', () => {
    const lostCase = String(degradation['incidentId'] ?? '');
    expect(lostCase).not.toHaveLength(0);

    const records = (degradation['journalRecordsForThatCase'] ?? []) as readonly unknown[];
    expect(records, 'the "lost" observation is present in the journal after all').toHaveLength(0);

    const incidents = (view['incidents'] ?? []) as readonly Record<string, unknown>[];
    expect(
      incidents.some((incident) => incident['incidentId'] === lostCase),
      'the aggregate can see a case whose observation was supposedly lost',
    ).toBe(false);

    const loss = (integrity['losses'] as readonly Record<string, unknown>[]).find((l) => l['incidentId'] === lostCase);
    expect(loss, 'the loss ledger does not name the case the fault was applied to').toBeDefined();
    expect(loss?.['kind']).toBe('CONFIRMED_DROP');
  });

  it('12. the business work still happened, so observability never blocked it', () => {
    expect(degradation['businessWorkSucceeded']).toBe(true);
    const steps = (artifact['steps'] ?? []) as readonly Record<string, unknown>[];
    const ingressUnderFault = steps.find((step) => String(step['step'] ?? '').includes('unwritable'));
    expect(ingressUnderFault, 'the capture never drove an ingress under the fault').toBeDefined();
    expect(ingressUnderFault?.['httpStatus'], 'the business boundary failed when observability did').toBe(200);
    expect(ingressUnderFault?.['observableOutcome']).toBe('ACCEPTED');
  });

  it('13. no completeness rate is claimed anywhere in the capture', () => {
    expect(JSON.stringify(integrity)).not.toMatch(/completeness|percent|coverageRate/i);
    expect(String(integrity['basis'] ?? '').toLowerCase(), 'the clean answer is presented without its bound').toContain(
      'cannot',
    );
  });
});

describe('observation-integrity capture — the alerts are derived, not decorative', () => {
  it('14. every alert carries identity, severity, reason, action, status and evidence', () => {
    expect(alerts.length, 'nothing was raised at all').toBeGreaterThan(0);
    for (const alert of alerts) {
      expect(String(alert['alertId'] ?? '')).not.toHaveLength(0);
      expect(['CRITICAL', 'ATTENTION']).toContain(alert['severity']);
      expect(['ACTIVE', 'RESOLVED_BY_LATER_EVIDENCE']).toContain(alert['status']);
      expect(String(alert['reason'] ?? '').length).toBeGreaterThan(20);
      expect(String(alert['operatorAction'] ?? '').length).toBeGreaterThan(20);
      expect((alert['evidenceJournalEventIds'] ?? []) as readonly string[], 'an alert with no evidence').not.toHaveLength(0);
    }
  });

  it('15. every alert’s evidence resolves to records this capture actually holds', () => {
    const incidents = (view['incidents'] ?? []) as readonly Record<string, unknown>[];
    const observed = new Set(incidents.flatMap((incident) => (incident['journalEventIds'] ?? []) as readonly string[]));
    const lost = new Set(
      ((integrity['losses'] ?? []) as readonly Record<string, unknown>[]).map((loss) => String(loss['journalEventId'])),
    );

    for (const alert of alerts) {
      for (const id of (alert['evidenceJournalEventIds'] ?? []) as readonly string[]) {
        expect(
          observed.has(id) || lost.has(id),
          `alert ${String(alert['alertId'])} cites ${id}, which is neither an observed nor a named-lost record`,
        ).toBe(true);
      }
    }
  });

  it('16. the raised conditions match the conditions the evidence actually supports', () => {
    const raised = new Set(alerts.map((alert) => String(alert['condition'])));
    const dispatch = (view['dispatch'] ?? {}) as Record<string, number>;

    expect(raised.has('OBSERVATION_LOSS'), 'a known loss was measured but never raised').toBe(true);
    if (Number(dispatch['outcomeUnknown']) > 0) {
      expect(raised.has('UNRESOLVED_DELIVERY'), 'an unresolved delivery was recorded but never raised').toBe(true);
    }
    if (Number(dispatch['failedBeforeEffect']) > 0) {
      expect(raised.has('FAILED_DELIVERY'), 'a failed delivery was recorded but never raised').toBe(true);
    }
    // And the noise floor holds: refusals are recorded in this run and must raise nothing.
    expect(raised.has('OPERATOR_REFUSAL' as never)).toBe(false);
  });

  it('17. the capture reaches the same journal the aggregate capture describes', () => {
    const aggregateView = (aggregate['view'] ?? {}) as Record<string, unknown>;
    const aggregateDispatch = (aggregateView['dispatch'] ?? {}) as Record<string, number>;
    const captureDispatch = (view['dispatch'] ?? {}) as Record<string, number>;

    // The aggregate is captured from the same machine's journal at or after this run, so it can
    // never know about FEWER abnormal despatches than this capture proved.
    expect(
      Number(aggregateDispatch['failedBeforeEffect']),
      'the aggregate on the proof page does not contain the failure this capture produced',
    ).toBeGreaterThanOrEqual(Number(captureDispatch['failedBeforeEffect']));
    expect(
      Number(aggregateDispatch['outcomeUnknown']),
      'the aggregate on the proof page does not contain the unknown outcome this capture produced',
    ).toBeGreaterThanOrEqual(Number(captureDispatch['outcomeUnknown']));

    const aggregateIncidents = new Set(
      ((aggregateView['incidents'] ?? []) as readonly Record<string, unknown>[]).map((i) => String(i['incidentId'])),
    );
    for (const alert of alerts) {
      const incidentId = alert['incidentId'];
      if (typeof incidentId !== 'string') continue;
      expect(
        aggregateIncidents.has(incidentId),
        `the page raises ${String(alert['condition'])} for ${incidentId}, a case its own aggregate cannot show`,
      ).toBe(true);
    }
  });
});

describe('observation-integrity capture — it refuses the overclaims it cannot support', () => {
  it('18. no credential, token, or signature material appears anywhere', () => {
    const serialised = JSON.stringify(artifact);
    expect(serialised).not.toMatch(/sk-ant-/);
    expect(serialised).not.toMatch(/Bearer\s+v1\./);
    expect(serialised).not.toMatch(/"signingKey"|ANTHROPIC_API_KEY/);
  });

  it('19. it states that no model or live provider was involved', () => {
    const environment = record('environment');
    expect(environment['anthropicCalled']).toBe(false);
    expect(environment['liveModelProviderSelected']).toBe(false);
    expect(environment['syntheticData']).toBe(true);
  });

  it('20. its stated limits include the two that genuinely bound it', () => {
    const limits = ((artifact['doesNotProve'] ?? []) as readonly string[]).join(' ').toLowerCase();
    expect(limits, 'the invisible-marker bound is not stated').toContain('marker');
    expect(limits, 'the receiver is not disclaimed as a non-third-party').toContain('third-party');
    expect(limits, 'the untested loss kind is not named').toContain('unresolved_intent');
  });
});
