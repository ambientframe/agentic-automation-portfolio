import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { isRemoteProofSafeEndpoint } from '@/lib/ports/webhook-side-effect-executor';

/**
 * FALSIFYING TESTS for RETAINED remote-execution evidence.
 *
 * `tests/webhook-side-effect-executor.test.ts` pins the adapter's contract without a network.
 * This file rejects the weaker claim: that the repository may assert a side effect left this
 * machine without a receipt from the system that received it — and, crucially, without that
 * receipt having been fetched from the receiver's OWN stored record rather than read out of the
 * same HTTP response that carried the delivery. A receiver echoing an id back in its own reply
 * is the receiver reporting on itself; it is not independent, and the artifact is not allowed
 * to blur the two.
 *
 * The endpoint is cross-checked against the REAL guard function rather than the artifact's own
 * claim that it was remote, for the same reason the SMTP evidence test re-checks the recipient
 * against `isProofSafeRecipient`: an artifact must not be the sole witness to its own safety.
 */

const EVIDENCE_PATH = path.join(process.cwd(), 'n8n', 'evidence', 'lead-rescue-remote-execution.json');

const SECRET_KEY_PATTERN = /(authorization|api[-_]?key|password|passwd|secret|cookie|bearer|access[-_]?token|credential)/i;

interface RemoteEvidence {
  readonly schemaVersion: string;
  readonly capturedAt: string;
  readonly gitHead: string;
  readonly receiver: { readonly origin: string; readonly onThisMachine: boolean };
  readonly executionPath: { readonly executorSelection: string; readonly executorId: string };
  readonly authorizedSend: {
    readonly capturedFacts: {
      readonly operationClaimStatus: string;
      readonly sideEffectStatus: string;
      readonly idempotencyKey: string;
      readonly receiverReportedExecutionId: string | null;
    };
    readonly derivedAssertions: { readonly leftThisMachine: boolean; readonly executorMode: string };
  };
  readonly duplicateReplay: {
    readonly capturedFacts: { readonly secondAttemptSideEffectStatus: string | null };
    readonly derivedAssertions: { readonly secondDeliverySuppressed: boolean };
  };
  readonly transportFailure: {
    readonly capturedFacts: { readonly applicationSendOutcome: { readonly kind: string } };
  };
  readonly blastRadiusGuard: {
    readonly capturedFacts: { readonly selectionKind: string };
    readonly derivedAssertions: { readonly refusedAtSelectionTime: boolean };
  };
  readonly independentReadBack?: {
    readonly executionId: string;
    readonly receivedIdempotencyKey: string;
    readonly channel: string;
    readonly executionStatus: string;
  };
  readonly scopeStatement: string;
  readonly doesNotProve: readonly string[];
}

const evidence = JSON.parse(readFileSync(EVIDENCE_PATH, 'utf8')) as RemoteEvidence;

/**
 * Every check the artifact must pass, as data — so the suite can prove it REJECTS a corrupted
 * copy rather than merely accepting the real one. A test that only ever sees valid input is
 * indistinguishable from a test that asserts nothing.
 */
function validate(candidate: RemoteEvidence): string[] {
  const issues: string[] = [];
  const push = (issue: string) => issues.push(issue);

  if (candidate.schemaVersion !== 'lead-rescue-remote-execution-evidence-1') push('wrong schema version');
  if (!/^[0-9a-f]{40}$/.test(candidate.gitHead)) push('gitHead is not a commit sha');

  // The whole claim: the counterparty is not on this machine. Checked against the real guard,
  // never against the artifact's own say-so.
  if (candidate.receiver.onThisMachine) push('receiver claims to be on this machine');
  if (!isRemoteProofSafeEndpoint(`${candidate.receiver.origin}/webhook/x`)) {
    push('receiver origin does not pass the remote-safety guard');
  }

  if (candidate.executionPath.executorSelection !== 'WEBHOOK') push('executor selection was not WEBHOOK');
  if (candidate.authorizedSend.derivedAssertions.executorMode !== 'LIVE') push('executor was not LIVE');
  if (!candidate.authorizedSend.derivedAssertions.leftThisMachine) push('send did not leave this machine');
  if (candidate.authorizedSend.capturedFacts.sideEffectStatus !== 'EXECUTED') push('send was not EXECUTED');
  if (candidate.authorizedSend.capturedFacts.operationClaimStatus !== 'CONFIRMED') push('claim was not CONFIRMED');

  const externalId = candidate.authorizedSend.capturedFacts.receiverReportedExecutionId;
  if (typeof externalId !== 'string' || externalId.length === 0) {
    push('no receiver-reported execution id was retained');
  }

  // A replay must be suppressed BEFORE the transport, not deduplicated after it.
  if (!candidate.duplicateReplay.derivedAssertions.secondDeliverySuppressed) push('replay was not suppressed');
  if (candidate.duplicateReplay.capturedFacts.secondAttemptSideEffectStatus !== 'SUPPRESSED_DUPLICATE') {
    push('replay status was not SUPPRESSED_DUPLICATE');
  }

  // The one failure class that may honestly grant retry permission.
  if (candidate.transportFailure.capturedFacts.applicationSendOutcome.kind !== 'FAILED_BEFORE_EFFECT') {
    push('an unresolvable host was not classified FAILED_BEFORE_EFFECT');
  }

  if (!candidate.blastRadiusGuard.derivedAssertions.refusedAtSelectionTime) push('loopback endpoint was not refused');
  if (candidate.blastRadiusGuard.capturedFacts.selectionKind !== 'WEBHOOK_MISCONFIGURED') {
    push('loopback selection did not fail closed');
  }

  // The independent receipt, and the thing that makes it independent.
  const readBack = candidate.independentReadBack;
  if (readBack === undefined) {
    push('no independent read-back is attached');
  } else {
    if (readBack.executionId !== externalId) push('read-back names a different execution than the send recorded');
    if (readBack.receivedIdempotencyKey !== candidate.authorizedSend.capturedFacts.idempotencyKey) {
      push('read-back names a different operation than the send recorded');
    }
    if (readBack.executionStatus !== 'success') push('read-back does not show a successful execution');
    if (!/separate|different/i.test(readBack.channel)) push('read-back does not state how it was independent');
  }

  if (candidate.doesNotProve.length < 3) push('doesNotProve is decorative');
  if (!candidate.doesNotProve.some((item) => /attested|operator/i.test(item))) {
    push('doesNotProve does not disclose that the read-back is attested rather than automated');
  }

  return issues;
}

describe('retained remote-execution evidence', () => {
  it('passes every check the artifact claims to satisfy', () => {
    expect(validate(evidence)).toEqual([]);
  });

  it('carries no secret-shaped key anywhere in the artifact', () => {
    const walk = (value: unknown, keyPath: string): void => {
      if (Array.isArray(value)) {
        value.forEach((item, i) => walk(item, `${keyPath}[${i}]`));
        return;
      }
      if (typeof value === 'object' && value !== null) {
        for (const [key, child] of Object.entries(value)) {
          expect(SECRET_KEY_PATTERN.test(key), `${keyPath}.${key} looks like a secret`).toBe(false);
          walk(child, `${keyPath}.${key}`);
        }
      }
    };
    walk(evidence, 'evidence');
  });

  // ---------------------------------------------------------------------------
  // The half that matters: it must REJECT a corrupted copy.
  // ---------------------------------------------------------------------------
  describe('rejects a deliberately corrupted copy', () => {
    const corrupt = (mutate: (copy: RemoteEvidence) => void): string[] => {
      const copy = JSON.parse(JSON.stringify(evidence)) as RemoteEvidence;
      mutate(copy);
      return validate(copy);
    };

    it('rejects a receiver that is actually on this machine', () => {
      expect(corrupt((c) => {
        (c.receiver as { origin: string }).origin = 'https://127.0.0.1';
      })).not.toEqual([]);
    });

    it('rejects a plaintext receiver origin', () => {
      expect(corrupt((c) => {
        (c.receiver as { origin: string }).origin = 'http://ambientframes.app.n8n.cloud';
      })).not.toEqual([]);
    });

    it('rejects a send with no retained receiver id', () => {
      expect(corrupt((c) => {
        (c.authorizedSend.capturedFacts as { receiverReportedExecutionId: string | null }).receiverReportedExecutionId = null;
      })).not.toEqual([]);
    });

    it('rejects a read-back that describes a different execution', () => {
      expect(corrupt((c) => {
        if (c.independentReadBack !== undefined) (c.independentReadBack as { executionId: string }).executionId = '9999';
      })).not.toEqual([]);
    });

    it('rejects a read-back that describes a different operation', () => {
      expect(corrupt((c) => {
        if (c.independentReadBack !== undefined) {
          (c.independentReadBack as { receivedIdempotencyKey: string }).receivedIdempotencyKey = 'notify:someone-else:x';
        }
      })).not.toEqual([]);
    });

    it('rejects a replay that was not suppressed', () => {
      expect(corrupt((c) => {
        (c.duplicateReplay.derivedAssertions as { secondDeliverySuppressed: boolean }).secondDeliverySuppressed = false;
      })).not.toEqual([]);
    });

    it('rejects a transport failure reported as anything other than provably-before-effect', () => {
      expect(corrupt((c) => {
        (c.transportFailure.capturedFacts.applicationSendOutcome as { kind: string }).kind = 'SUCCEEDED';
      })).not.toEqual([]);
    });

    it('rejects a run whose loopback guard did not fire', () => {
      expect(corrupt((c) => {
        (c.blastRadiusGuard.derivedAssertions as { refusedAtSelectionTime: boolean }).refusedAtSelectionTime = false;
      })).not.toEqual([]);
    });

    it('rejects an artifact that hides the attested nature of its read-back', () => {
      expect(corrupt((c) => {
        (c as unknown as { doesNotProve: string[] }).doesNotProve = ['a', 'b', 'c'];
      })).not.toEqual([]);
    });
  });
});
