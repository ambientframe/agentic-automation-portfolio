import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LEAD_RESCUE } from '@/data/systems';
import {
  FIDELITY_STATUSES,
  FIDELITY_STATUS_MEANING,
  deriveFailureRegister,
  deriveFidelityLedger,
} from '@/lib/proof/fidelity-ledger';
import {
  evidenceProvesOrchestration,
  readRuntimeEvidence,
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

describe('the ledger reports configuration, and never improves on it', () => {
  it('reads a fixture provider as fixture-backed, not as real', () => {
    const ledger = deriveFidelityLedger({ evidence: ABSENT, env: {} });
    const row = ledger.rows.find((entry) => entry.id === 'ai-classification');
    expect(row?.status).toBe('FIXTURE_BACKED');
    expect(row?.whatIsTrue).toContain('authored');
  });

  it('reads a simulated executor as simulated, and says nothing leaves the process', () => {
    const ledger = deriveFidelityLedger({ evidence: ABSENT, env: {} });
    const row = ledger.rows.find((entry) => entry.id === 'outbound-execution');
    expect(row?.status).toBe('SIMULATED');
    expect(row?.whatIsTrue).toContain('Nothing leaves this process');
  });

  it('follows the resolved configuration when a live provider and transport are set', () => {
    const ledger = deriveFidelityLedger({
      evidence: ABSENT,
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
    const ledger = deriveFidelityLedger({
      evidence: ABSENT,
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
    const ledger = deriveFidelityLedger({
      evidence: ABSENT,
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

  it('opens the evaluation row only when the gate and a credential are both present', () => {
    expect(
      deriveFidelityLedger({ evidence: ABSENT, env: { ANTHROPIC_API_KEY: 'k' } }).rows.find(
        (entry) => entry.id === 'evaluation',
      )?.status,
    ).toBe('UNVERIFIED');
    expect(
      deriveFidelityLedger({ evidence: ABSENT, env: { RUN_LIVE_AI_EVAL: '1' } }).rows.find(
        (entry) => entry.id === 'evaluation',
      )?.status,
    ).toBe('UNVERIFIED');
    expect(
      deriveFidelityLedger({
        evidence: ABSENT,
        env: { RUN_LIVE_AI_EVAL: '1', ANTHROPIC_API_KEY: 'k' },
      }).rows.find((entry) => entry.id === 'evaluation')?.status,
    ).toBe('REAL');
  });

  /**
   * The operator signing key resolves to three modes, and the third is the one worth a test:
   * a key that was configured but is too short does NOT fall back to the working ephemeral
   * mode. Reporting it as REAL because a key exists would describe an authenticated boundary on
   * a runtime that currently answers every operator action with a 503.
   */
  it('reports operator authentication from the resolved signing mode, and fails closed on a bad key', () => {
    const ephemeral = deriveFidelityLedger({ evidence: ABSENT, env: {} }).rows.find(
      (entry) => entry.id === 'operator-authentication',
    );
    expect(ephemeral?.status).toBe('REAL');
    expect(ephemeral?.whatIsTrue).toContain('never written to disk');

    const configured = deriveFidelityLedger({
      evidence: ABSENT,
      env: { LEAD_RESCUE_OPERATOR_SIGNING_KEY: 'k'.repeat(48) },
    }).rows.find((entry) => entry.id === 'operator-authentication');
    expect(configured?.status).toBe('REAL');
    expect(configured?.whatIsTrue).toContain('survives a restart');

    const broken = deriveFidelityLedger({
      evidence: ABSENT,
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
    const ledger = deriveFidelityLedger({ evidence: ABSENT, env: {} });
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
    const absent = deriveFidelityLedger({ evidence: ABSENT, env: {} });
    expect(absent.rows.find((entry) => entry.id === 'n8n-orchestration')?.status).toBe('UNVERIFIED');
    expect(absent.rows.find((entry) => entry.id === 'n8n-orchestration')?.basis).toContain('definitions only');

    const proven = deriveFidelityLedger({ evidence: PROVEN, env: {} });
    expect(proven.rows.find((entry) => entry.id === 'n8n-orchestration')?.status).toBe('REAL');
  });

  it('never promotes customer deployment, whatever the configuration', () => {
    for (const env of [{}, { LEAD_RESCUE_DECISION_PROVIDER: 'claude', ANTHROPIC_API_KEY: 'k' }]) {
      const ledger = deriveFidelityLedger({ evidence: PROVEN, env });
      expect(ledger.rows.find((entry) => entry.id === 'customer-deployment')?.status).toBe('UNVERIFIED');
    }
  });

  it('passes the declared maturity through without recomputing it', () => {
    const ledger = deriveFidelityLedger({
      evidence: PROVEN,
      env: { LEAD_RESCUE_DECISION_PROVIDER: 'claude', ANTHROPIC_API_KEY: 'k' },
    });
    expect(ledger.declaredMaturity).toBe(LEAD_RESCUE.maturity);
    expect(ledger.fidelityNote).toBe(LEAD_RESCUE.fidelityNote);
  });
});

describe('every ledger row stays falsifiable', () => {
  const ledger = deriveFidelityLedger({ evidence: ABSENT, env: {} });

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
    expect(deriveFidelityLedger({ evidence: stale, env: {} }).rows.find((row) => row.id === 'n8n-orchestration')?.status).toBe(
      'UNVERIFIED',
    );
  });

  it('treats an unreadable capture as unproven', () => {
    expect(evidenceProvesOrchestration({ kind: 'UNREADABLE', detail: 'not json' })).toBe(false);
    expect(evidenceProvesOrchestration(ABSENT)).toBe(false);
    expect(evidenceProvesOrchestration(PROVEN)).toBe(true);
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
