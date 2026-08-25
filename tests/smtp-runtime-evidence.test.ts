import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { isProofSafeRecipient } from '@/lib/ports/smtp-side-effect-executor';

/**
 * FALSIFYING TESTS for RETAINED real-SMTP execution evidence.
 *
 * `tests/smtp-side-effect-executor.test.ts` pins the adapter's contract without a network.
 * This file rejects the weaker claim: that the repository may assert a real SMTP send
 * happened without an INDEPENDENTLY OBSERVED receipt. Every check below requires evidence
 * that could only exist if a separate mail server actually accepted a message — a
 * capture-server-issued id read back out of that server's own API, not the application's
 * self-report — and cross-checks the recipient against the real allowlist function rather
 * than trusting the artifact's own claim that it was safe.
 */

const EVIDENCE_PATH = path.join(process.cwd(), 'n8n', 'evidence', 'lead-rescue-smtp-execution.json');

const SECRET_KEY_PATTERN = /(authorization|api[-_]?key|password|passwd|secret|cookie|bearer|access[-_]?token|credential)/i;

interface SmtpEvidence {
  readonly schemaVersion: string;
  readonly capturedAt: string;
  readonly gitHead: string;
  readonly smtpServer: {
    readonly product: string;
    readonly version: string;
    readonly kind: string;
    readonly host: string;
    readonly port: number;
    readonly relayConfigured: boolean;
  };
  readonly authorizedSend: {
    readonly capturedFacts: {
      readonly operationClaimId: string;
      readonly operationClaimStatus: string;
      readonly applicationSendOutcome: { readonly kind: string; readonly externalId: string };
      readonly captureServerReceipt: {
        readonly messageId: string;
        readonly captureServerId: string;
        readonly to: readonly string[];
        readonly from: string;
        readonly subjectSha256: string;
        readonly bodySha256: string;
        readonly receivedAt: string;
        readonly source: string;
      };
    };
    readonly derivedAssertions: { readonly crossedRealSocket: boolean; readonly executorMode: string };
  };
  readonly duplicateReplay: {
    readonly capturedFacts: {
      readonly secondAttemptSideEffectStatus: string;
      readonly captureServerMessageCountForOperation: number;
      readonly captureServerIdAfterReplay: string;
    };
    readonly derivedAssertions: { readonly secondDeliverySuppressed: boolean };
  };
  readonly transportFailure: {
    readonly capturedFacts: {
      readonly port: number;
      readonly applicationSendOutcome: { readonly kind: string; readonly reason: string };
    };
    readonly derivedAssertions: { readonly falseExecutedAvoided: boolean };
  };
  readonly scopeStatement: string;
}

function load(): SmtpEvidence {
  return JSON.parse(readFileSync(EVIDENCE_PATH, 'utf-8')) as SmtpEvidence;
}

function assertNoSecrets(value: unknown, keyPath: string): void {
  if (value === null || value === undefined) return;
  if (typeof value === 'string') {
    expect(value, `value at ${keyPath} looks like a retained secret`).not.toMatch(/^Bearer\s|^sk-[A-Za-z0-9-]{10,}/);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, i) => assertNoSecrets(item, `${keyPath}[${i}]`));
    return;
  }
  if (typeof value === 'object') {
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      expect(key, `key at ${keyPath}.${key} looks like a secret field name`).not.toMatch(SECRET_KEY_PATTERN);
      assertNoSecrets(nested, `${keyPath}.${key}`);
    }
  }
}

describe('retained SMTP execution evidence — a real message genuinely reached a real local mail server', () => {
  it('A1. an evidence artifact exists and names a real local capture server that is NOT configured to relay', () => {
    const e = load();
    expect(e.schemaVersion).toBeTruthy();
    expect(e.smtpServer.product.length).toBeGreaterThan(0);
    expect(e.smtpServer.version.length).toBeGreaterThan(0);
    expect(e.smtpServer.kind).toMatch(/capture|sink|sandbox/i);
    // The blast-radius guard: loopback only, and no relay configuration at all.
    expect(['127.0.0.1', 'localhost']).toContain(e.smtpServer.host);
    expect(e.smtpServer.relayConfigured).toBe(false);
  });

  it('A2. the send is backed by an INDEPENDENTLY OBSERVED capture-server receipt, not only the application\'s own self-report', () => {
    const e = load();
    const receipt = e.authorizedSend.capturedFacts.captureServerReceipt;

    // A capture-server-issued id the application never generated — this is the field that
    // makes the claim falsifiable. An artifact asserting a send with no receipt fails here.
    expect(receipt.captureServerId.length).toBeGreaterThan(0);
    expect(receipt.messageId.length).toBeGreaterThan(0);
    expect(receipt.source).toMatch(/mailpit|capture server|api/i);
    expect(Number.isNaN(Date.parse(receipt.receivedAt))).toBe(false);

    // The application's own reported externalId must MATCH the id the independent server
    // recorded — two sources agreeing, not one source repeated.
    expect(e.authorizedSend.capturedFacts.applicationSendOutcome.kind).toBe('SUCCEEDED');
    expect(e.authorizedSend.capturedFacts.applicationSendOutcome.externalId).toBe(receipt.messageId);
  });

  it('A3. the recipient was synthetic and non-routable, cross-checked against the REAL allowlist function', () => {
    const e = load();
    const receipt = e.authorizedSend.capturedFacts.captureServerReceipt;
    expect(receipt.to.length).toBeGreaterThan(0);
    for (const address of receipt.to) {
      // Not "the artifact says it was safe" — the actual guard function must agree.
      expect(isProofSafeRecipient(address), `${address} is not a proof-safe recipient`).toBe(true);
    }
  });

  it('A4. only content hashes are retained, never full message bodies', () => {
    const e = load();
    const receipt = e.authorizedSend.capturedFacts.captureServerReceipt;
    expect(receipt.subjectSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(receipt.bodySha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('A5. the send is tied to a real, CONFIRMED operation claim and a LIVE executor', () => {
    const e = load();
    expect(e.authorizedSend.capturedFacts.operationClaimId.length).toBeGreaterThan(0);
    expect(e.authorizedSend.capturedFacts.operationClaimStatus).toBe('CONFIRMED');
    expect(e.authorizedSend.derivedAssertions.executorMode).toBe('LIVE');
    expect(e.authorizedSend.derivedAssertions.crossedRealSocket).toBe(true);
    expect(e.gitHead).toMatch(/^[0-9a-f]{40}$/);
  });

  it('B. replay produced NO second captured message: the capture server still holds exactly one, with the same receipt id', () => {
    const e = load();
    expect(e.duplicateReplay.capturedFacts.secondAttemptSideEffectStatus).toBe('SUPPRESSED_DUPLICATE');
    expect(e.duplicateReplay.capturedFacts.captureServerMessageCountForOperation).toBe(1);
    // The strongest available falsification: the id must be byte-identical to the original.
    expect(e.duplicateReplay.capturedFacts.captureServerIdAfterReplay).toBe(
      e.authorizedSend.capturedFacts.captureServerReceipt.captureServerId,
    );
    expect(e.duplicateReplay.derivedAssertions.secondDeliverySuppressed).toBe(true);
  });

  it('C. a real transport failure was exercised and surfaced truthfully, never as a false EXECUTED', () => {
    const e = load();
    expect(e.transportFailure.capturedFacts.applicationSendOutcome.kind).not.toBe('SUCCEEDED');
    expect(e.transportFailure.capturedFacts.applicationSendOutcome.reason.length).toBeGreaterThan(0);
    expect(e.transportFailure.capturedFacts.port).not.toBe(e.smtpServer.port);
    expect(e.transportFailure.derivedAssertions.falseExecutedAvoided).toBe(true);
  });

  it('D. the scope statement refuses the overclaims: not production, not a real person, no Anthropic call', () => {
    const e = load();
    expect(e.scopeStatement).toMatch(/local/i);
    expect(e.scopeStatement).toMatch(/synthetic|non-routable/i);
    expect(e.scopeStatement).toMatch(/not.*(production|client deploy)/i);
    expect(e.scopeStatement).toMatch(/no.*anthropic|anthropic.*not/i);
    expect(e.scopeStatement).toMatch(/real person|real recipient|real mailbox/i);
  });

  it('E. no secrets, credentials, or authorization material are retained', () => {
    assertNoSecrets(load(), 'smtpEvidence');
  });
});
