import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { KESTREL } from '@/data/profiles/kestrel/profile';
import { isProofSafeRecipient } from '@/lib/ports/smtp-side-effect-executor';

/**
 * FALSIFYING TESTS for the Lead Rescue execution-authority proof.
 *
 * The repository already proves a notification can cross a real SMTP socket. It has never
 * proved the thing a buyer actually needs to trust: that a prepared outbound action CANNOT
 * cross that boundary until a human with sufficient authority explicitly authorises it, and
 * that the authorisation grants only the bounded action approved.
 *
 * This suite rejects any evidence that cannot establish the whole chain. Its assertions are
 * cross-checked against real repository contracts — the KESTREL profile's own authority
 * ceilings, the real recipient-allowlist function, and the real revision semantics — rather
 * than against numbers re-typed into the artifact. A hand-authored artifact would have to
 * reconstruct the profile's actual authority model to pass.
 */

const EVIDENCE_PATH = path.join(process.cwd(), 'n8n', 'evidence', 'lead-rescue-authority-execution.json');

/**
 * Deliberately narrower than the pattern the other evidence verifiers use. "Authorization" is
 * this package's own domain vocabulary (`preAuthorizationState`, `authorizationEvent`), so a
 * bare substring match would reject legitimate authority fields. The genuine secret risk is a
 * captured HTTP *header*, matched exactly, not the concept.
 */
const SECRET_KEY_PATTERN = /^(authorization|authorization[-_]?header|api[-_]?key|password|passwd|secret|cookie|bearer|access[-_]?token|credentials?)$/i;

interface AuthorityEvidence {
  readonly schemaVersion: string;
  readonly gitHead: string;
  readonly environment: Record<string, unknown>;
  readonly capturedFacts: {
    readonly syntheticCase: { readonly incidentId: string; readonly syntheticData: boolean; readonly provenance: unknown };
    readonly preparedAction: { readonly kind: string; readonly recipient: string; readonly offerSummary: string };
    readonly preAuthorizationState: { readonly lifecycleState: string; readonly revision: number; readonly offerSentAt: unknown };
    readonly unauthorizedAttempts: ReadonlyArray<{
      readonly attempt: string;
      readonly via: string;
      readonly outcome: string;
      readonly smtpMessagesAfter: number;
      readonly recordUnchanged: boolean;
    }>;
    readonly authorizationEvent: {
      readonly via: string;
      readonly eventType: string;
      readonly actor: string;
      readonly decidedByRoleId: string;
      readonly decidedByAuthorityCeiling: number;
      readonly decision: string;
      readonly boundToIncidentId: string;
      readonly boundToExpectedRevision: number;
      readonly outcome: string;
      readonly occurredAt: string;
    };
    readonly postAuthorizationState: { readonly lifecycleState: string; readonly revision: number };
    readonly execution: {
      readonly via: string;
      readonly outcome: string;
      readonly executorId: string;
      readonly executorMode: string;
      readonly boundToExpectedRevision: number;
      readonly occurredAt: string;
      readonly operationClaim: { readonly operationId: string; readonly status: string };
      readonly smtpReceipt: { readonly captureServerId: string; readonly messageId: string; readonly to: readonly string[] };
    };
    readonly replay: { readonly via: string; readonly outcome: string; readonly smtpMessagesAfter: number; readonly captureServerIdAfterReplay: string };
    readonly smtpMessageCountTimeline: ReadonlyArray<{ readonly stage: string; readonly count: number }>;
  };
  readonly derivedAssertions: Record<string, boolean | string>;
}

function load(): AuthorityEvidence {
  return JSON.parse(readFileSync(EVIDENCE_PATH, 'utf-8')) as AuthorityEvidence;
}

function assertNoSecrets(value: unknown, keyPath: string): void {
  if (value === null || value === undefined) return;
  if (typeof value === 'string') {
    expect(value, `value at ${keyPath} looks like a retained secret`).not.toMatch(/^Bearer\s|^sk-[A-Za-z0-9-]{10,}/);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((v, i) => assertNoSecrets(v, `${keyPath}[${i}]`));
    return;
  }
  if (typeof value === 'object') {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      expect(k, `key at ${keyPath}.${k} looks like a secret field name`).not.toMatch(SECRET_KEY_PATTERN);
      assertNoSecrets(v, `${keyPath}.${k}`);
    }
  }
}

describe('Lead Rescue authority proof — a prepared action cannot execute without explicit authorisation', () => {
  it('1. the action existed in a prepared, not-yet-authorised state, on synthetic data', () => {
    const e = load();
    expect(e.capturedFacts.syntheticCase.syntheticData).toBe(true);
    // Under review — an offer is possible but the case is NOT cleared to send.
    expect(['NEEDS_HUMAN', 'ESCALATED', 'SUPPRESSION_REVIEW']).toContain(e.capturedFacts.preAuthorizationState.lifecycleState);
    // The decisive fact: no offer had been sent.
    expect(e.capturedFacts.preAuthorizationState.offerSentAt).toBeFalsy();
    expect(e.capturedFacts.preparedAction.kind).toMatch(/offer|message|despatch/i);
  });

  it('2+3. every pre-authorisation execution attempt was refused AND produced zero SMTP messages', () => {
    const e = load();
    const attempts = e.capturedFacts.unauthorizedAttempts;
    expect(attempts.length).toBeGreaterThanOrEqual(2);
    for (const a of attempts) {
      expect(a.outcome, `attempt "${a.attempt}" must not be a success outcome`).not.toBe('CONFIRMED');
      expect(a.outcome).not.toBe('ACCEPTED');
      // The falsifiable part: the capture server held nothing at each refusal.
      expect(a.smtpMessagesAfter, `attempt "${a.attempt}" leaked an SMTP message`).toBe(0);
      expect(a.recordUnchanged).toBe(true);
      expect(a.via.length).toBeGreaterThan(0);
    }
    // At least one attempt must be a genuine dispatch attempt against the unapproved case,
    // not merely an authority refusal on the decision route.
    expect(attempts.some((a) => /dispatch/i.test(a.via))).toBe(true);
  });

  it('4. an under-authority role was genuinely refused, cross-checked against the REAL profile ceiling', () => {
    const e = load();
    const underAuth = e.capturedFacts.unauthorizedAttempts.find((a) => a.outcome === 'UNAUTHORIZED');
    expect(underAuth, 'no UNAUTHORIZED attempt retained — the authority gate was never exercised').toBeDefined();

    // The authorising role must genuinely clear the bar the handler enforces (>= 2), and the
    // ceiling recorded must match the profile, not a number typed into the artifact.
    const roleId = e.capturedFacts.authorizationEvent.decidedByRoleId;
    const role = KESTREL.roles.find((r) => r.id === roleId);
    expect(role, `role "${roleId}" does not exist in the KESTREL profile`).toBeDefined();
    expect(e.capturedFacts.authorizationEvent.decidedByAuthorityCeiling).toBe(role?.authorityCeiling);
    expect(role?.authorityCeiling ?? 0).toBeGreaterThanOrEqual(2);
  });

  it('5. the authorisation is explicit and attributable — an event through the real operator boundary, not inferred from execution', () => {
    const e = load();
    const a = e.capturedFacts.authorizationEvent;
    expect(a.eventType).toBe('human.decision.recorded');
    expect(a.actor).toBe('HUMAN');
    expect(a.outcome).toBe('ACCEPTED');
    expect(a.via).toMatch(/decide|applyHumanDecision/i);
    expect(a.decision.length).toBeGreaterThan(0);
    expect(Number.isNaN(Date.parse(a.occurredAt))).toBe(false);
  });

  it('6. the authorisation is bound to this entity and this revision — not open-ended future permission', () => {
    const e = load();
    const a = e.capturedFacts.authorizationEvent;
    expect(a.boundToIncidentId).toBe(e.capturedFacts.syntheticCase.incidentId);
    // The approval was submitted against the pre-authorisation revision it actually saw.
    expect(a.boundToExpectedRevision).toBe(e.capturedFacts.preAuthorizationState.revision);
    // Approving re-parks the case at a NEW revision, so the approval cannot be replayed onto it.
    expect(e.capturedFacts.postAuthorizationState.revision).toBeGreaterThan(e.capturedFacts.preAuthorizationState.revision);
  });

  it('7. a stale-revision execution attempt was refused — approval for the old revision cannot authorise against a changed record', () => {
    const e = load();
    const stale = e.capturedFacts.unauthorizedAttempts.find((a) => a.outcome === 'STALE_REVISION');
    expect(stale, 'no STALE_REVISION attempt retained — revision binding was never falsified').toBeDefined();
    expect(stale?.smtpMessagesAfter).toBe(0);
  });

  it('8. execution occurred strictly AFTER authorisation and was bound to the post-authorisation revision', () => {
    const e = load();
    const authAt = Date.parse(e.capturedFacts.authorizationEvent.occurredAt);
    const execAt = Date.parse(e.capturedFacts.execution.occurredAt);
    expect(execAt).toBeGreaterThanOrEqual(authAt);
    expect(e.capturedFacts.execution.boundToExpectedRevision).toBe(e.capturedFacts.postAuthorizationState.revision);
    expect(e.capturedFacts.execution.outcome).toBe('CONFIRMED');
  });

  it('9. execution crossed the REAL local SMTP transport, never a fixture or simulated executor', () => {
    const e = load();
    const x = e.capturedFacts.execution;
    expect(x.executorMode).toBe('LIVE');
    expect(x.executorId).toMatch(/smtp/i);
    expect(x.executorId).not.toMatch(/simulated|fixture/i);
    // Independently observed receipt identity from the capture server itself.
    expect(x.smtpReceipt.captureServerId.length).toBeGreaterThan(0);
    expect(x.smtpReceipt.messageId.length).toBeGreaterThan(0);
    expect(x.operationClaim.status).toBe('CONFIRMED');
  });

  it('10. the recipient was synthetic and non-routable, cross-checked against the REAL allowlist function', () => {
    const e = load();
    for (const address of e.capturedFacts.execution.smtpReceipt.to) {
      expect(isProofSafeRecipient(address), `${address} is not a proof-safe recipient`).toBe(true);
    }
    expect(isProofSafeRecipient(e.capturedFacts.preparedAction.recipient)).toBe(true);
  });

  it('11. replay produced no second delivered message and no second claim', () => {
    const e = load();
    const r = e.capturedFacts.replay;
    expect(r.outcome).toBe('ALREADY_DISPATCHED');
    expect(r.smtpMessagesAfter).toBe(1);
    expect(r.captureServerIdAfterReplay).toBe(e.capturedFacts.execution.smtpReceipt.captureServerId);
  });

  it('12. the message-count timeline shows zero before authorisation and exactly one after — the whole claim in one series', () => {
    const e = load();
    const timeline = e.capturedFacts.smtpMessageCountTimeline;
    expect(timeline.length).toBeGreaterThanOrEqual(3);

    const authIndex = timeline.findIndex((t) => /after authoris|post-auth/i.test(t.stage));
    expect(authIndex).toBeGreaterThan(-1);
    // Every stage at or before authorisation must be zero.
    for (const stage of timeline.slice(0, authIndex + 1)) {
      expect(stage.count, `stage "${stage.stage}" should have had no SMTP message yet`).toBe(0);
    }
    // The series must never exceed one message at any point.
    expect(Math.max(...timeline.map((t) => t.count))).toBe(1);
    expect(timeline[timeline.length - 1]?.count).toBe(1);
  });

  it('13. derived assertions are present, distinguishable from captured facts, and all hold', () => {
    const e = load();
    expect(Object.keys(e.capturedFacts).length).toBeGreaterThan(0);
    const d = e.derivedAssertions;
    for (const key of [
      'noSideEffectBeforeAuthorization',
      'authorizationPrecededExecution',
      'executedActionMatchedAuthorizedAction',
      'exactlyOneLocalSmtpEffectRetained',
      'replaySuppressedDuplicate',
      'syntheticLocalOnlyExecution',
      'noRealRecipientInvolved',
    ]) {
      expect(d[key], `derived assertion "${key}" missing or false`).toBe(true);
    }
  });

  it('14. the artifact never claims production, client deployment, or real-recipient delivery', () => {
    const raw = readFileSync(EVIDENCE_PATH, 'utf-8').toLowerCase();
    for (const forbidden of ['in production', 'client deployed', 'client-deployed', 'live customer', 'real recipient', 'real customer', 'production deployment']) {
      // Permitted only as an explicit negation.
      const idx = raw.indexOf(forbidden);
      if (idx > -1) {
        const window = raw.slice(Math.max(0, idx - 60), idx);
        expect(window, `"${forbidden}" appears without a negation`).toMatch(/\bno\b|\bnot\b|never|zero/);
      }
    }
    expect(raw).toMatch(/synthetic/);
  });

  it('15. no secrets, credentials, raw payload dumps, or authorisation headers are retained', () => {
    const e = load();
    assertNoSecrets(e, 'authorityEvidence');
    // The prepared offer summary may be retained (it is synthetic business copy), but the
    // full delivered message body must not be.
    expect(JSON.stringify(e)).not.toContain('automated Lead Rescue execution-boundary proof message');
  });

  it('16. git head and environment metadata are retained so the run is locatable', () => {
    const e = load();
    expect(e.gitHead).toMatch(/^[0-9a-f]{40}$/);
    expect(e.schemaVersion.length).toBeGreaterThan(0);
    expect(Object.keys(e.environment).length).toBeGreaterThan(0);
  });
});
