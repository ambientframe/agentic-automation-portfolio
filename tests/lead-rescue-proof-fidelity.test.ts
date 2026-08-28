import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LEAD_RESCUE } from '@/data/systems';
import {
  FIDELITY_STATUSES,
  FIDELITY_STATUS_MEANING,
  deriveFailureRegister,
  deriveFidelityLedger,
  type LedgerInputs,
} from '@/lib/proof/fidelity-ledger';
import { KESTREL } from '@/data/profiles/kestrel/profile';

/**
 * Every case in this file describes the Lead Rescue page, which depicts Kestrel. The profile is
 * a required ledger input rather than a default, so it is supplied once here instead of at
 * seventeen call sites — see tests/fidelity-ledger-profile.test.ts for why it may not default.
 */
const ledgerFor = (inputs: Omit<LedgerInputs, 'profile'>) =>
  deriveFidelityLedger({ ...inputs, profile: KESTREL });
import {
  evidenceProvesOrchestration,
  readEvaluationEvidence,
  readRuntimeEvidence,
  type EvaluationEvidence,
  type RemoteVerificationEvidence,
  type RuntimeEvidence,
} from '@/lib/proof/n8n-evidence';

/**
 * The fidelity ledger is the only part of this page a buyer cannot check by reading the rest
 * of it — every other claim is traceable to a run they can step through. So these tests
 * guard the two properties that make it worth trusting:
 *
 *   1. No row can flatter itself. Statuses are derived from resolved configuration and
 *      retained evidence, never from how the surface renders.
 *   2. Every row stays falsifiable: it names a real path in this repository and states what
 *      it does not establish.
 */

const ABSENT: RuntimeEvidence = { kind: 'ABSENT', detail: 'no capture in this build' };
const PROVEN: RuntimeEvidence = {
  kind: 'PRESENT',
  schemaVersion: '1',
  capturedAt: '2026-01-01T00:00:00.000Z',
  runtime: '1.0.0',
  scopeStatement: 'local n8n driving a local application',
  unrecognisedShape: false,
  executions: [
    {
      label: 'lead-rescue-intake',
      workflowPath: 'n8n/workflows/lead-rescue-intake.json',
      executionId: '1',
      status: 'success',
      mode: 'webhook',
      startedAt: '2026-01-01T00:00:00.000Z',
      targetRoute: '/api/lead-rescue/wait-incidents',
      statusCode: 200,
      durableStateNote: null,
    },
  ],
};

const NO_EVAL: EvaluationEvidence = { kind: 'ABSENT', detail: 'no capture in this build' };
const EVALUATED: Extract<EvaluationEvidence, { kind: 'PRESENT' }> = {
  kind: 'PRESENT',
  model: 'claude-opus-5',
  capturedAt: '2026-01-01T00:00:00.000Z',
  gitHead: 'abcdef1234567890',
  completedCaseCount: 9,
  correctCount: 6,
  overallPassed: false,
  unsafeMisclassifiedCount: 0,
  safetyReading: 'every miss routed to a person',
  scopeStatement: 'local capture of a synthetic corpus',
  doesNotProve: ['NOT production traffic', 'NOT a production deployment'],
  unrecognisedShape: false,
};

/** Shaped after the retained capture: a confirmation carrying the RECEIVER's id, and a
 *  never-seen key that stayed unknown. Both halves are required — see the row's docstring. */
const VERIFIED: Extract<RemoteVerificationEvidence, { kind: 'PRESENT' }> = {
  kind: 'PRESENT',
  capturedAt: '2026-08-28T05:55:56.221Z',
  gitHead: '9e5c00f876679fcee60ab7fad36ae889d7f0c874',
  receiverOrigin: 'https://ambientframes.app.n8n.cloud',
  receiverOnThisMachine: false,
  confirmedKind: 'CONFIRMED_EXECUTED',
  confirmedExternalId: '8',
  absentKind: 'STILL_UNKNOWN',
  neverConfirmsANegative: true,
  unconfiguredBehaviour: 'refused with AttemptUnavailableError',
  scopeStatement: 'one confirmable delivery and one honest unknown',
  doesNotProve: ['NOT live for a client', 'NOT proof a person read anything'],
  unrecognisedShape: false,
};

describe('the ledger reports configuration, and never improves on it', () => {
  it('reads a fixture provider as fixture-backed, not as real', () => {
    const ledger = ledgerFor({ evidence: ABSENT, evaluation: NO_EVAL, env: {} });
    const row = ledger.rows.find((entry) => entry.id === 'ai-classification');
    expect(row?.status).toBe('FIXTURE_BACKED');
    expect(row?.whatIsTrue).toContain('authored');
  });

  it('reads a simulated executor as simulated, and says nothing leaves the process', () => {
    const ledger = ledgerFor({ evidence: ABSENT, evaluation: NO_EVAL, env: {} });
    const row = ledger.rows.find((entry) => entry.id === 'outbound-execution');
    expect(row?.status).toBe('SIMULATED');
    expect(row?.whatIsTrue).toContain('Nothing leaves this process');
  });

  it('follows the resolved configuration when a live provider and transport are set', () => {
    const ledger = ledgerFor({
      evidence: ABSENT, evaluation: NO_EVAL,
      env: {
        LEAD_RESCUE_DECISION_PROVIDER: 'claude',
        ANTHROPIC_API_KEY: 'test-key',
        LEAD_RESCUE_SIDE_EFFECT_EXECUTOR: 'smtp',
        LEAD_RESCUE_SMTP_HOST: '127.0.0.1',
        LEAD_RESCUE_SMTP_PORT: '1025',
        LEAD_RESCUE_SMTP_FROM: 'proof@example.invalid',
        LEAD_RESCUE_SMTP_TO: 'proof@example.invalid',
      },
    });
    expect(ledger.rows.find((entry) => entry.id === 'ai-classification')?.status).toBe('REAL');
    expect(ledger.rows.find((entry) => entry.id === 'outbound-execution')?.status).toBe('REAL');
  });

  /**
   * The case that matters most: a real implementation asked for and unable to run. Both
   * composition roots fail closed there, so reporting it as fixture-backed or simulated would
   * describe working stand-in behaviour that is not happening.
   */
  it('reports an explicitly requested but unusable implementation as unverified, not as the stand-in', () => {
    const ledger = ledgerFor({
      evidence: ABSENT, evaluation: NO_EVAL,
      env: {
        LEAD_RESCUE_DECISION_PROVIDER: 'claude',
        LEAD_RESCUE_SIDE_EFFECT_EXECUTOR: 'smtp',
      },
    });

    const classification = ledger.rows.find((entry) => entry.id === 'ai-classification');
    expect(classification?.status).toBe('UNVERIFIED');
    expect(classification?.whatIsTrue).toContain('failing closed');
    expect(classification?.whatIsTrue).not.toContain('replayed');

    const outbound = ledger.rows.find((entry) => entry.id === 'outbound-execution');
    expect(outbound?.status).toBe('UNVERIFIED');
    expect(outbound?.whatIsTrue).toContain('failing closed');
  });

  it('refuses a routable SMTP recipient rather than reporting a real send', () => {
    const ledger = ledgerFor({
      evidence: ABSENT, evaluation: NO_EVAL,
      env: {
        LEAD_RESCUE_SIDE_EFFECT_EXECUTOR: 'smtp',
        LEAD_RESCUE_SMTP_HOST: '127.0.0.1',
        LEAD_RESCUE_SMTP_PORT: '1025',
        LEAD_RESCUE_SMTP_FROM: 'proof@example.invalid',
        LEAD_RESCUE_SMTP_TO: 'someone@gmail.com',
      },
    });
    expect(ledger.rows.find((entry) => entry.id === 'outbound-execution')?.status).toBe('UNVERIFIED');
  });

  /**
   * An open gate used to be enough to call this row REAL. It is not: a gate that is open
   * means the evaluation COULD run, which is a statement about configuration, not about
   * judgment quality. The row now turns on a retained result, so the ability to measure
   * can no longer be reported as having measured.
   */
  it('does not treat an openable gate as an evaluation that happened', () => {
    for (const env of [
      { ANTHROPIC_API_KEY: 'k' },
      { RUN_LIVE_AI_EVAL: '1' },
      { RUN_LIVE_AI_EVAL: '1', ANTHROPIC_API_KEY: 'k' },
    ]) {
      const row = ledgerFor({ evidence: ABSENT, evaluation: NO_EVAL, env }).rows.find(
        (entry) => entry.id === 'evaluation',
      );
      expect(row?.status).toBe('UNVERIFIED');
    }
  });

  /**
   * The operator signing key resolves to three modes, and the third is the one worth a test:
   * a key that was configured but is too short does NOT fall back to the working ephemeral
   * mode. Reporting it as REAL because a key exists would describe an authenticated boundary on
   * a runtime that currently answers every operator action with a 503.
   */
  it('reports operator authentication from the resolved signing mode, and fails closed on a bad key', () => {
    const ephemeral = ledgerFor({ evidence: ABSENT, evaluation: NO_EVAL, env: {} }).rows.find(
      (entry) => entry.id === 'operator-authentication',
    );
    expect(ephemeral?.status).toBe('REAL');
    expect(ephemeral?.whatIsTrue).toContain('never written to disk');

    const configured = ledgerFor({
      evidence: ABSENT, evaluation: NO_EVAL,
      env: { LEAD_RESCUE_OPERATOR_SIGNING_KEY: 'k'.repeat(48) },
    }).rows.find((entry) => entry.id === 'operator-authentication');
    expect(configured?.status).toBe('REAL');
    expect(configured?.whatIsTrue).toContain('survives a restart');

    const broken = ledgerFor({
      evidence: ABSENT, evaluation: NO_EVAL,
      env: { LEAD_RESCUE_OPERATOR_SIGNING_KEY: 'too-short' },
    }).rows.find((entry) => entry.id === 'operator-authentication');
    expect(broken?.status).toBe('UNVERIFIED');
    expect(broken?.whatIsTrue).toContain('fails closed');
    expect(broken?.whatIsTrue).not.toContain('survives a restart');
  });

  /**
   * The claim this branch shipped before the authenticated boundary landed on main. Left
   * unchanged it would have been the page's only outright false statement — worse than an
   * under-claim, because a sceptic who checked it would find the opposite of what it said.
   */
  it('no longer claims the operator routes are unauthenticated or the role caller-supplied', () => {
    const ledger = ledgerFor({ evidence: ABSENT, evaluation: NO_EVAL, env: {} });
    const authority = ledger.rows.find((entry) => entry.id === 'authority-gate');
    const httpPath = ledger.rows.find((entry) => entry.id === 'http-operator-path');

    expect(authority?.limit).not.toMatch(/nothing authenticates/i);
    expect(authority?.limit).not.toMatch(/there is no sign-in/i);
    expect(httpPath?.limit).not.toMatch(/these routes are unauthenticated/i);

    // And the honest residue is still stated: a credential is not a person.
    expect(
      ledger.rows.find((entry) => entry.id === 'operator-authentication')?.limit,
    ).toMatch(/never that a particular person proved who they were/i);
  });

  it('holds orchestration at unverified until a capture is actually readable', () => {
    const absent = ledgerFor({ evidence: ABSENT, evaluation: NO_EVAL, env: {} });
    expect(absent.rows.find((entry) => entry.id === 'n8n-orchestration')?.status).toBe('UNVERIFIED');
    expect(absent.rows.find((entry) => entry.id === 'n8n-orchestration')?.basis).toContain('definitions only');

    const proven = ledgerFor({ evidence: PROVEN, evaluation: NO_EVAL, env: {} });
    expect(proven.rows.find((entry) => entry.id === 'n8n-orchestration')?.status).toBe('REAL');
  });

  it('reports independent verification, and holds it at unverified without a readable capture', () => {
    const absent = ledgerFor({ evidence: ABSENT, evaluation: NO_EVAL, env: {} });
    const row = absent.rows.find((entry) => entry.id === 'remote-verification');
    expect(row, 'the ledger has no row for independent verification').toBeDefined();
    expect(row?.status).toBe('UNVERIFIED');
    expect(row?.whatIsTrue).toContain('not claimed here');
  });

  it('reads a proving capture as real, and quotes the receiver’s own identifier', () => {
    const row = ledgerFor({
      evidence: ABSENT, evaluation: NO_EVAL, env: {}, remoteVerification: VERIFIED,
    }).rows.find((entry) => entry.id === 'remote-verification');

    expect(row?.status).toBe('REAL');
    // The id must be the RECEIVER's. One this application generated would prove nothing.
    expect(row?.whatIsTrue).toContain('8');
    expect(row?.whatIsTrue).toContain('ambientframes.app.n8n.cloud');
  });

  /**
   * The assertion this row exists for. A capture may show a perfectly good confirmation and
   * ALSO show the boundary converting an unfound key into a confirmed negative. That is not
   * weaker evidence of verification — it is evidence the boundary lied, and reading the
   * confirmation half while ignoring the rest is exactly how a proof surface flatters itself.
   */
  it('refuses a capture whose boundary confirmed a negative, however good its confirmation', () => {
    const liar = { ...VERIFIED, absentKind: 'CONFIRMED_NOT_EXECUTED', neverConfirmsANegative: false } as const;
    const row = ledgerFor({
      evidence: ABSENT, evaluation: NO_EVAL, env: {}, remoteVerification: liar,
    }).rows.find((entry) => entry.id === 'remote-verification');

    expect(row?.status).toBe('UNVERIFIED');
    expect(row?.whatIsTrue).toContain('readable but does not show');
  });

  /**
   * The observation outranks the artifact's description of itself. A capture can assert the
   * standing guarantee in one field while the outcome it actually recorded contradicts it —
   * a file describing its own good behaviour is the cheapest thing in the chain to forge, and
   * the recorded verdict is the expensive one. This case exists because a mutation removing
   * the recorded-verdict clause SURVIVED: the test above moved both fields together, so it
   * could never tell which one was load-bearing.
   */
  it('trusts the recorded verdict over the capture’s claim about its own guarantee', () => {
    const boastful = { ...VERIFIED, absentKind: 'CONFIRMED_NOT_EXECUTED' } as const;
    expect(boastful.neverConfirmsANegative, 'the capture still claims the guarantee').toBe(true);

    const row = ledgerFor({
      evidence: ABSENT, evaluation: NO_EVAL, env: {}, remoteVerification: boastful,
    }).rows.find((entry) => entry.id === 'remote-verification');

    expect(row?.status).toBe('UNVERIFIED');
  });

  it('refuses a confirmation that carries no identifier from the receiver', () => {
    const unattributed = { ...VERIFIED, confirmedExternalId: null } as const;
    const row = ledgerFor({
      evidence: ABSENT, evaluation: NO_EVAL, env: {}, remoteVerification: unattributed,
    }).rows.find((entry) => entry.id === 'remote-verification');

    expect(row?.status).toBe('UNVERIFIED');
  });

  it('never lets the row imply it could confirm an absence, in either state', () => {
    for (const remote of [undefined, VERIFIED]) {
      const row = ledgerFor({
        evidence: ABSENT, evaluation: NO_EVAL, env: {}, remoteVerification: remote,
      }).rows.find((entry) => entry.id === 'remote-verification');
      expect(row?.limit).toContain('never confirm its absence');
      expect(row?.limit).toContain('no customer');
    }
  });

  it('never promotes customer deployment, whatever the configuration', () => {
    for (const env of [{}, { LEAD_RESCUE_DECISION_PROVIDER: 'claude', ANTHROPIC_API_KEY: 'k' }]) {
      const ledger = ledgerFor({ evidence: PROVEN, evaluation: NO_EVAL, env });
      expect(ledger.rows.find((entry) => entry.id === 'customer-deployment')?.status).toBe('UNVERIFIED');
    }
  });

  it('passes the declared maturity through without recomputing it', () => {
    const ledger = ledgerFor({
      evidence: PROVEN, evaluation: NO_EVAL,
      env: { LEAD_RESCUE_DECISION_PROVIDER: 'claude', ANTHROPIC_API_KEY: 'k' },
    });
    expect(ledger.declaredMaturity).toBe(LEAD_RESCUE.maturity);
    expect(ledger.fidelityNote).toBe(LEAD_RESCUE.fidelityNote);
  });
});

describe('every ledger row stays falsifiable', () => {
  const ledger = ledgerFor({ evidence: ABSENT, evaluation: NO_EVAL, env: {} });

  it('covers each capability the brief asks about', () => {
    for (const id of [
      'http-operator-path',
      'operator-authentication',
      'persistence',
      'n8n-orchestration',
      'ai-classification',
      'outbound-execution',
      'reply-interpretation',
      'evaluation',
      'customer-deployment',
    ]) {
      expect(ledger.rows.some((row) => row.id === id), id).toBe(true);
    }
  });

  it('uses only the four declared statuses, and counts them correctly', () => {
    for (const row of ledger.rows) {
      expect(FIDELITY_STATUSES).toContain(row.status);
    }
    for (const status of FIDELITY_STATUSES) {
      expect(ledger.counts[status]).toBe(ledger.rows.filter((row) => row.status === status).length);
    }
    expect(Object.values(ledger.counts).reduce((a, b) => a + b, 0)).toBe(ledger.rows.length);
  });

  it('states a limit on every row, including the real ones', () => {
    for (const row of ledger.rows) {
      expect(row.limit.length, row.id).toBeGreaterThan(20);
      expect(row.whatIsTrue.length, row.id).toBeGreaterThan(20);
    }
  });

  it('does not hang a measurement verdict on any row except the evaluation', () => {
    for (const row of ledger.rows) {
      if (row.id === 'evaluation') continue;
      expect(row.verdict, row.id).toBeUndefined();
    }
  });

  it('names at least one path that exists in this repository', () => {
    const root = resolve(__dirname, '..');
    for (const row of ledger.rows) {
      const paths = row.basis
        .split('·')
        .map((part) => part.trim().replace(/\s*\(.*\)$/, ''))
        .filter((part) => part.length > 0);
      expect(paths.length, row.id).toBeGreaterThan(0);

      // Globs and ** segments are resolved to their containing directory: the point is that
      // the reader is pointed somewhere real, not that the string is a literal filename.
      const anyExists = paths.some((path) => {
        const literal = resolve(root, path);
        if (existsSync(literal)) return true;
        const dir = path.split('/').filter((segment) => !segment.includes('*'));
        return existsSync(resolve(root, dir.join('/')));
      });
      expect(anyExists, `${row.id}: ${row.basis}`).toBe(true);
    }
  });

  it('explains each status once, in the legend', () => {
    for (const status of FIDELITY_STATUSES) {
      expect(FIDELITY_STATUS_MEANING[status].length).toBeGreaterThan(40);
    }
  });
});

/**
 * The adapter is the isolation boundary against the evidence schema another engineer is
 * actively changing. Its contract to the rest of the page is that it always answers, and
 * never claims proof it does not have.
 */
describe('the runtime-evidence adapter degrades instead of failing', () => {
  it('always returns a labelled result against the real repository, whatever is on disk', async () => {
    const evidence = await readRuntimeEvidence();
    expect(['ABSENT', 'UNREADABLE', 'PRESENT']).toContain(evidence.kind);
  });

  it('treats a parsed capture with no recognisable execution as unproven, not as proof', () => {
    const stale: RuntimeEvidence = { ...PROVEN, executions: [], unrecognisedShape: true };
    expect(evidenceProvesOrchestration(stale)).toBe(false);
    expect(ledgerFor({ evidence: stale, evaluation: NO_EVAL, env: {} }).rows.find((row) => row.id === 'n8n-orchestration')?.status).toBe(
      'UNVERIFIED',
    );
  });

  it('treats an unreadable capture as unproven', () => {
    expect(evidenceProvesOrchestration({ kind: 'UNREADABLE', detail: 'not json' })).toBe(false);
    expect(evidenceProvesOrchestration(ABSENT)).toBe(false);
    expect(evidenceProvesOrchestration(PROVEN)).toBe(true);
  });
});

/**
 * The judgment-quality row is the one place where honest reporting makes the page look
 * worse, so it gets the strictest tests: it must be capable of saying "failed", it must
 * not say "unverified" when a real failing result exists, and it must not reassure anyone
 * on a figure the artefact did not record.
 */
describe('the ledger reports a measured classifier even when the measurement failed', () => {
  const evaluationRow = (evaluation: EvaluationEvidence, env: Record<string, string> = {}) =>
    ledgerFor({ evidence: ABSENT, evaluation, env }).rows.find(
      (row) => row.id === 'evaluation',
    );

  it('claims no accuracy at all when no capture is readable', () => {
    for (const evaluation of [
      NO_EVAL,
      { kind: 'UNREADABLE', detail: 'not json' } as const,
    ] satisfies EvaluationEvidence[]) {
      const row = evaluationRow(evaluation);
      expect(row?.status).toBe('UNVERIFIED');
      expect(row?.whatIsTrue).toContain('no accuracy figure is claimed');
      expect(row?.whatIsTrue).not.toMatch(/\d+ of \d+/);
      expect(row?.verdict).toBeUndefined();
    }
  });

  it('still claims nothing when the gate is open but nothing has been retained', () => {
    const row = evaluationRow(NO_EVAL, { RUN_LIVE_AI_EVAL: '1' });
    expect(row?.status).toBe('UNVERIFIED');
    expect(row?.whatIsTrue).toContain('No retained result is readable');
  });

  it('reports a retained failure as a performed evaluation, not as an absence', () => {
    const row = evaluationRow(EVALUATED);
    // The uncomfortable direction: better evidence, worse sentence, higher status.
    expect(row?.status).toBe('REAL');
    expect(row?.whatIsTrue).toContain('FAILED');
    expect(row?.whatIsTrue).toContain('6 of 9');
    expect(row?.whatIsTrue).toContain('claude-opus-5');
    expect(row?.basis).toContain('n8n/evidence/lead-rescue-live-classification.json');
    expect(row?.limit).toContain('abcdef1');
    // A green "Real" badge alone would read as a passing classifier. The verdict is the
    // word a skimming reader must not be allowed to miss.
    expect(row?.verdict?.tone).toBe('NEGATIVE');
    expect(row?.verdict?.label).toMatch(/failed/i);
  });

  it('counts from the cases rather than repeating a summary the artefact supplied', () => {
    const row = evaluationRow({ ...EVALUATED, correctCount: 2, completedCaseCount: 4 });
    expect(row?.whatIsTrue).toContain('2 of 4');
    expect(row?.whatIsTrue).not.toContain('6 of 9');
  });

  it('does not print a pass as a failure when a later run succeeds', () => {
    const row = evaluationRow({ ...EVALUATED, overallPassed: true, correctCount: 9 });
    expect(row?.status).toBe('REAL');
    expect(row?.whatIsTrue).toContain('met its predeclared thresholds');
    expect(row?.whatIsTrue).not.toContain('FAILED');
    expect(row?.verdict?.tone).toBe('AFFIRMATIVE');
  });

  it('fails closed on a capture whose verdict or case counts it cannot read', () => {
    for (const broken of [
      { ...EVALUATED, overallPassed: null, unrecognisedShape: true },
      { ...EVALUATED, correctCount: null, unrecognisedShape: true },
    ] satisfies EvaluationEvidence[]) {
      expect(evaluationRow(broken)?.status).toBe('UNVERIFIED');
    }
  });

  it('offers no safety reassurance the capture did not record', () => {
    expect(evaluationRow(EVALUATED)?.whatIsTrue).toContain('no unsafe misclassification');

    const silent = evaluationRow({ ...EVALUATED, unsafeMisclassifiedCount: null });
    expect(silent?.whatIsTrue).not.toContain('unsafe');

    const unsafe = evaluationRow({ ...EVALUATED, unsafeMisclassifiedCount: 2 });
    expect(unsafe?.whatIsTrue).toContain('2 unsafe misclassification');
    expect(unsafe?.whatIsTrue).not.toContain('no unsafe misclassification');
  });

  it('reads the artefact this repository actually ships, and reports its real verdict', async () => {
    const evaluation = await readEvaluationEvidence();
    expect(['ABSENT', 'UNREADABLE', 'PRESENT']).toContain(evaluation.kind);
    if (evaluation.kind !== 'PRESENT' || evaluation.unrecognisedShape) return;

    // The committed capture is a retained negative result. If someone re-runs it green,
    // this asserts the row follows the artefact rather than a sentence written here.
    const row = evaluationRow(evaluation);
    expect(row?.status).toBe('REAL');
    expect(row?.whatIsTrue).toContain(
      `${evaluation.correctCount} of ${evaluation.completedCaseCount}`,
    );
    expect(row?.whatIsTrue).toContain(evaluation.overallPassed ? 'met its' : 'FAILED');
    expect(row?.verdict?.tone).toBe(evaluation.overallPassed ? 'AFFIRMATIVE' : 'NEGATIVE');

    // The adapter must not invent a scope or a "does not prove" list. If the artefact
    // carries them, they are passed through; if it does not, they stay empty/null.
    expect(evaluation.doesNotProve.every((item) => item.length > 0)).toBe(true);
    if (evaluation.scopeStatement !== null) {
      expect(evaluation.scopeStatement.length).toBeGreaterThan(20);
    }
  });
});

describe('the failure register separates proven handling from designed handling', () => {
  const entries = deriveFailureRegister();

  it('carries every declared failure mode', () => {
    expect(entries).toHaveLength(LEAD_RESCUE.failureModes.length);
    expect(entries.length).toBeGreaterThan(0);
  });

  it('marks a pending verification as not exercised', () => {
    for (const entry of entries) {
      const declared = LEAD_RESCUE.failureModes.find((mode) => mode.id === entry.id);
      expect(entry.exercised).toBe(!declared?.verificationTest.startsWith('Pending'));
    }
    // The split is only worth rendering if it actually separates the set.
    expect(entries.some((entry) => entry.exercised)).toBe(true);
  });

  it('never claims a test for an unexercised mode', () => {
    for (const entry of entries.filter((candidate) => !candidate.exercised)) {
      expect(entry.verificationTest).toMatch(/^Pending/);
    }
  });
});
