import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { KESTREL } from '@/data/profiles/kestrel/profile';
import { OPERATOR_PRINCIPALS } from '@/lib/auth/operator-identity';

/**
 * FALSIFYING TESTS for the RETAINED operator-authentication runtime evidence.
 *
 * `tests/operator-authentication.test.ts` proves the boundary's logic. This file guards the
 * artifact a real HTTP run produced, and is written to fail if that artifact drifts from what
 * actually happened — including by being hand-edited into something stronger than the run.
 *
 * The two assertions that carry the claim are 5 (no refusal executed anything or moved the
 * case) and 6 (the accepted principal's authority matches what the PROFILE says, checked
 * against the profile rather than against the artifact's own copy of it). An artifact that
 * quietly restated its own role mapping would pass a naive check and fail this one.
 */

const EVIDENCE_PATH = 'n8n/evidence/lead-rescue-operator-authentication.json';

interface Attempt {
  readonly step: string;
  readonly credential: string;
  readonly httpStatus: number;
  readonly refusal: string | null;
  readonly principalAccepted: string | null;
  readonly engineOutcome: string | null;
  readonly caseRevisionAfter: number | null;
  readonly offerSentAfter: boolean;
}

interface JournalRow {
  readonly type: string;
  readonly outcome: string;
  readonly mechanism: string | null;
  readonly actorId: string | null;
  readonly revision: number | null;
}

const ARTIFACT = JSON.parse(readFileSync(path.join(process.cwd(), EVIDENCE_PATH), 'utf8')) as Record<string, never>;

function at<T>(pathExpr: string): T {
  return pathExpr.split('.').reduce<unknown>((acc, key) => (acc as Record<string, unknown>)[key], ARTIFACT) as T;
}

const ATTEMPTS = at<Attempt[]>('attempts');
const REFUSED = ATTEMPTS.filter((a) => a.httpStatus >= 400);
const JOURNAL = at<JournalRow[]>('journal.capturedFacts.sequence');

function walkStrings(value: unknown, keyPath = '$'): Array<[string, string]> {
  if (typeof value === 'string') return [[keyPath, value]];
  if (Array.isArray(value)) return value.flatMap((v, i) => walkStrings(v, `${keyPath}[${i}]`));
  if (typeof value === 'object' && value !== null) {
    return Object.entries(value).flatMap(([k, v]) => walkStrings(v, `${keyPath}.${k}`));
  }
  return [];
}

const ALL_STRINGS = walkStrings(ARTIFACT);

describe('retained operator-authentication evidence', () => {
  it('1. the artifact is present, well-formed, and declares its own schema version', () => {
    expect(at<string>('schemaVersion')).toBe('lead-rescue-operator-authentication-evidence-1');
    expect(Date.parse(at<string>('capturedAt'))).not.toBeNaN();
    expect(ATTEMPTS.length).toBeGreaterThanOrEqual(5);
    expect(at<boolean>('case.syntheticData')).toBe(true);
  });

  it('2. gitHead names a commit that genuinely exists in this repository', () => {
    const head = at<string>('gitHead');
    expect(head).toMatch(/^[0-9a-f]{40}$/);
    expect(execFileSync('git', ['cat-file', '-t', head], { encoding: 'utf8' }).trim()).toBe('commit');
  });

  it('3. the declared authentication mechanism claims no login, provider, or second factor', () => {
    expect(at<string>('authentication.mechanism').toLowerCase()).toContain('hmac');
    expect(at<boolean>('authentication.externalIdentityProvider')).toBe(false);
    expect(at<boolean>('authentication.passwordOrMfa')).toBe(false);
    expect(['EPHEMERAL_KEY', 'CONFIGURED_KEY']).toContain(at<string>('authentication.mode'));
  });

  it('4. the run exercised impersonation, tampering, self-declared identity and under-authority', () => {
    const refusals = REFUSED.map((a) => `${a.httpStatus}:${a.refusal}`);
    expect(refusals, 'no missing-credential refusal').toContain('401:MISSING_CREDENTIAL');
    expect(refusals, 'no tampered-credential refusal').toContain('401:INVALID_SIGNATURE');
    expect(refusals.some((r) => r.startsWith('400:')), 'no self-declared-identity rejection').toBe(true);
    expect(refusals.some((r) => r.startsWith('403:')), 'no under-authority refusal').toBe(true);

    // A tampered credential must be a corruption of a real one, not a made-up string — that is
    // the only version of the test the signature actually has to defeat.
    expect(REFUSED.find((a) => a.refusal === 'INVALID_SIGNATURE')?.credential.toLowerCase()).toContain('tampered');
  });

  it('5. no refused attempt executed anything or moved the case', () => {
    expect(REFUSED.length).toBeGreaterThanOrEqual(4);
    const startingRevision = at<number>('case.startingRevision');
    for (const attempt of REFUSED) {
      expect(attempt.offerSentAfter, `"${attempt.step}" produced an offer`).toBe(false);
      expect(attempt.caseRevisionAfter, `"${attempt.step}" moved the case`).toBe(startingRevision);
      expect(attempt.principalAccepted, `"${attempt.step}" reported an accepted principal`).toBeNull();
    }
    expect(at<boolean>('zeroExecutionBeforeValidAuthorization.capturedFacts.offerSentAfterAnyRefusal')).toBe(false);
    expect(at<boolean>('zeroExecutionBeforeValidAuthorization.capturedFacts.revisionUnchangedThroughRefusals')).toBe(true);
  });

  it('6. the accepted principal is canonical and its authority matches the profile, not the artifact', () => {
    const principalId = at<string>('acceptedDecision.capturedFacts.principalId');
    const roleId = at<string>('acceptedDecision.capturedFacts.roleId');
    const ceiling = at<number>('acceptedDecision.capturedFacts.authorityCeiling');

    const registered = OPERATOR_PRINCIPALS.find((p) => p.principalId === principalId);
    expect(registered, 'the accepted principal is not in the canonical registry').toBeDefined();
    expect(roleId, 'the accepted role does not match the registry').toBe(registered?.roleId);

    // Cross-checked against the PROFILE — the trusted source — not the artifact's own copy.
    const role = KESTREL.roles.find((r) => r.id === roleId);
    expect(role, 'the accepted role is not defined in the profile').toBeDefined();
    expect(ceiling, 'the recorded authority does not match what the profile declares').toBe(role?.authorityCeiling);
  });

  it('7. the accepted decision was bound to a revision and genuinely advanced the case', () => {
    const bound = at<number>('acceptedDecision.capturedFacts.boundToExpectedRevision');
    const after = at<number>('acceptedDecision.capturedFacts.revisionAfter');
    expect(at<string>('acceptedDecision.capturedFacts.engineOutcome')).toBe('ACCEPTED');
    expect(bound).toBe(at<number>('case.startingRevision'));
    expect(after, 'an accepted decision did not advance the case').toBeGreaterThan(bound);

    // And revision binding still bit for a perfectly valid identity.
    const stale = ATTEMPTS.find((a) => a.engineOutcome === 'STALE_REVISION');
    expect(stale, 'the run never tested a stale revision with a valid identity').toBeDefined();
    expect(stale?.principalAccepted, 'the stale-revision attempt was not authenticated').toBeTruthy();
  });

  it('8. the journal separates "we do not know who you are" from "you may not do this"', () => {
    const authn = JOURNAL.filter((e) => e.type === 'OPERATOR_AUTHENTICATION' && e.outcome === 'REFUSED');
    const authz = JOURNAL.filter((e) => e.type === 'HUMAN_DECISION_RECORDED' && e.outcome === 'REFUSED');
    const accepted = JOURNAL.filter((e) => e.type === 'HUMAN_DECISION_RECORDED' && e.outcome === 'ACCEPTED');

    expect(authn.length, 'no authentication refusal was observable').toBeGreaterThan(0);
    expect(authz.length, 'no authorization refusal was observable').toBeGreaterThan(0);
    expect(accepted.length, 'the accepted decision was not observable').toBeGreaterThan(0);

    // An authentication refusal names nobody: at that point nobody had been identified, and
    // recording an unverified claim would reintroduce exactly the weakness this package closed.
    for (const event of authn) {
      expect(event.actorId, 'an authentication refusal named a claimant').toBeNull();
      expect(event.mechanism).toBe('AUTHENTICATION');
    }
    // An authorization refusal names the operator, because by then we knew exactly who it was.
    for (const event of [...authz, ...accepted]) {
      expect(event.actorId, 'a decision record named nobody').toBeTruthy();
      expect(OPERATOR_PRINCIPALS.map((p) => p.principalId)).toContain(event.actorId as string);
    }
  });

  it('9. no token, signature, signing key, or authorization header is retained', () => {
    // Targets credential VALUES, not the word "bearer": the artifact is allowed — and ought —
    // to name the scheme it uses. What it must never contain is a token anyone could present.
    for (const [keyPath, value] of ALL_STRINGS) {
      expect(value, `value at ${keyPath} carries a presented bearer credential`).not.toMatch(/Bearer\s+v1\.[A-Za-z0-9_-]{8,}/i);
      expect(value, `value at ${keyPath} carries an operator token`).not.toMatch(/\bv1\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}/);
      // A base64url HMAC-SHA256 digest is 43 characters of mixed case and digits. Length alone
      // is not the signal — `lead-rescue-operator-authentication-evidence-1` is 45 characters
      // of perfectly legitimate lowercase identifier — so the test is length AND alphabet.
      for (const run of value.match(/[A-Za-z0-9_-]{40,}/g) ?? []) {
        const looksLikeDigest = /[a-z]/.test(run) && /[A-Z]/.test(run) && /[0-9]/.test(run);
        expect(looksLikeDigest, `value at ${keyPath} carries something shaped like a signature`).toBe(false);
      }
      expect(value, `value at ${keyPath} looks like a credential`).not.toMatch(/sk-[A-Za-z0-9-]{10,}|xox[baprs]-/);
    }
    for (const [keyPath] of ALL_STRINGS) {
      expect(keyPath, `${keyPath} looks like a retained secret field`).not.toMatch(
        /\.(token|signature|signingKey|secret|authorization|cookie|password)(\.|\[|$)/i,
      );
    }
  });

  it('10. the artifact never claims a maturity the run did not establish', () => {
    const FORBIDDEN = ['sso', 'single sign-on', 'multi-factor', 'mfa', 'production iam', 'identity federation', 'federated', 'client deployment'];
    const denials = at<string[]>('doesNotProve');
    expect(denials.length).toBeGreaterThanOrEqual(3);
    // A forbidden phrase is permitted only inside the artifact's own denial list. Matched on
    // word boundaries: a bare substring test reads the DENIAL field `passwordOrMfa: false` as
    // an MFA claim, which would fail the artifact for saying exactly the right thing.
    const haystack = JSON.stringify({ ...ARTIFACT, doesNotProve: [] }).toLowerCase();
    for (const phrase of FORBIDDEN) {
      const pattern = new RegExp(`\\b${phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
      expect(pattern.test(haystack), `the artifact claims "${phrase}" outside its denial list`).toBe(false);
    }
  });

  it('11. every declared principal is synthetic and mapped to a role the profile actually defines', () => {
    const principals = at<Array<{ principalId: string; roleId: string; authorityCeiling: number | null; syntheticIdentity: boolean }>>('principals');
    expect(principals.length).toBeGreaterThanOrEqual(2);
    for (const principal of principals) {
      expect(principal.syntheticIdentity).toBe(true);
      const role = KESTREL.roles.find((r) => r.id === principal.roleId);
      expect(role, `principal "${principal.principalId}" names a role the profile does not define`).toBeDefined();
      expect(principal.authorityCeiling).toBe(role?.authorityCeiling);
    }
    // The roster spans the gate, or none of the refusals above would mean anything.
    const ceilings = principals.map((p) => p.authorityCeiling ?? 0);
    expect(Math.min(...ceilings)).toBeLessThan(2);
    expect(Math.max(...ceilings)).toBeGreaterThanOrEqual(2);
  });
});
