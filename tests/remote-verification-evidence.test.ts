import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isRemoteProofSafeEndpoint } from '@/lib/ports/webhook-side-effect-executor';

/**
 * FALSIFYING TESTS for the retained remote-verification capture.
 *
 * The capture in `n8n/evidence/lead-rescue-remote-verification.json` is the only thing standing
 * behind the claim that an `OUTCOME_UNKNOWN` can be closed against a receiver this application
 * does not own. A JSON file asserting that is worth nothing on its own — anyone can write one.
 * So these assertions are built to fail against a corrupted copy, and each checks a LINK in the
 * chain rather than the presence of a field:
 *
 *   the executor's verdict  ↔  what the receiver actually answered  ↔  the key that was asked about
 *
 * The most important assertion in this file is the last one. The receiver answered `found: false`
 * for a key it had never seen, confidently and with HTTP 200, and the executor still refused to
 * turn that into `CONFIRMED_NOT_EXECUTED`. That refusal is easy to hold in a unit test with a
 * stubbed response and easy to lose against a live receiver that sounds certain.
 */

const EVIDENCE_PATH = join(
  process.cwd(),
  'n8n',
  'evidence',
  'lead-rescue-remote-verification.json',
);

interface RawAnswer {
  readonly httpStatus: number;
  readonly body: {
    readonly idempotencyKey?: string;
    readonly found?: boolean;
    readonly n8nExecutionId?: string | null;
  };
}

interface Evidence {
  readonly schemaVersion: string;
  readonly capturedAt: string;
  readonly gitHead: string;
  readonly receiver: { readonly origin: string; readonly onThisMachine: boolean };
  readonly confirmable: {
    readonly idempotencyKey: string;
    readonly sendOutcome: { readonly kind: string; readonly externalId?: string };
    readonly verifyOutcome: { readonly kind: string; readonly externalId?: string };
    readonly rawReceiverAnswer: RawAnswer;
  };
  readonly absent: {
    readonly idempotencyKey: string;
    readonly verifyOutcome: { readonly kind: string };
    readonly rawReceiverAnswer: RawAnswer;
  };
  readonly standingGuarantee: { readonly neverConfirmsANegative: boolean; readonly observedKind: string };
  readonly unconfiguredLookup: { readonly behaviour: string };
  readonly doesNotProve: readonly string[];
}

const evidence = JSON.parse(readFileSync(EVIDENCE_PATH, 'utf8')) as Evidence;

describe('the capture is what it says it is', () => {
  it('carries the expected schema and a git head', () => {
    expect(evidence.schemaVersion).toBe('lead-rescue-remote-verification-evidence-1');
    expect(evidence.gitHead).toMatch(/^[0-9a-f]{40}$/);
    expect(Number.isNaN(Date.parse(evidence.capturedAt))).toBe(false);
  });

  it('was produced against a receiver that is not this machine', () => {
    expect(evidence.receiver.onThisMachine).toBe(false);
    expect(
      isRemoteProofSafeEndpoint(evidence.receiver.origin),
      'the receiver origin would be refused by the executor’s own guard, so it cannot be evidence anything left this machine',
    ).toBe(true);
  });
});

describe('the confirmed delivery traces to the receiver, not to us', () => {
  const { confirmable } = evidence;

  it('sent successfully and confirmed afterwards', () => {
    expect(confirmable.sendOutcome.kind).toBe('SUCCEEDED');
    expect(confirmable.verifyOutcome.kind).toBe('CONFIRMED_EXECUTED');
  });

  it('the receiver was asked about the key that was actually sent', () => {
    expect(confirmable.rawReceiverAnswer.body.idempotencyKey).toBe(confirmable.idempotencyKey);
  });

  it('the receiver said it held the record', () => {
    expect(confirmable.rawReceiverAnswer.httpStatus).toBe(200);
    expect(confirmable.rawReceiverAnswer.body.found).toBe(true);
  });

  /** The link that matters: the confirmation's id is the receiver's, not one we minted. */
  it('the confirmed external id is the id the receiver returned', () => {
    const fromReceiver = confirmable.rawReceiverAnswer.body.n8nExecutionId;
    expect(fromReceiver, 'the receiver returned no execution id, so nothing corroborates the confirmation').toBeTruthy();
    expect(
      confirmable.verifyOutcome.externalId,
      'the confirmation carries an id the receiver did not give — it was invented somewhere between them',
    ).toBe(fromReceiver);
    expect(
      confirmable.sendOutcome.externalId,
      'the send and the later lookup disagree about which execution recorded this operation',
    ).toBe(fromReceiver);
  });
});

describe('an absent record stays unknown against a live receiver', () => {
  const { absent } = evidence;

  it('asked about a key that was never sent', () => {
    expect(absent.rawReceiverAnswer.body.idempotencyKey).toBe(absent.idempotencyKey);
    expect(absent.idempotencyKey).not.toBe(evidence.confirmable.idempotencyKey);
  });

  it('the receiver answered plainly that it holds no record', () => {
    expect(absent.rawReceiverAnswer.httpStatus).toBe(200);
    expect(
      absent.rawReceiverAnswer.body.found,
      'this assertion is vacuous unless the receiver actually denied holding the record',
    ).toBe(false);
  });

  /** THE POINT OF THE WHOLE CAPTURE. */
  it('and the executor still refused to confirm a negative', () => {
    expect(absent.verifyOutcome.kind).toBe('STILL_UNKNOWN');
    expect(absent.verifyOutcome.kind).not.toBe('CONFIRMED_NOT_EXECUTED');
    expect(evidence.standingGuarantee.neverConfirmsANegative).toBe(true);
    expect(evidence.standingGuarantee.observedKind).toBe(absent.verifyOutcome.kind);
  });
});

describe('the boundary refuses when it has no channel', () => {
  it('records an explicit refusal rather than an outcome', () => {
    expect(evidence.unconfiguredLookup.behaviour).toContain('AttemptUnavailableError');
    expect(evidence.unconfiguredLookup.behaviour).not.toContain('DID NOT REFUSE');
  });
});

describe('the capture states what it does not establish', () => {
  it('carries a non-trivial doesNotProve list', () => {
    expect(evidence.doesNotProve.length).toBeGreaterThanOrEqual(5);
    for (const entry of evidence.doesNotProve) expect(entry.length).toBeGreaterThan(40);
  });

  it('denies client-liveness explicitly, because that is the claim this is most likely to be mistaken for', () => {
    const joined = evidence.doesNotProve.join(' ').toLowerCase();
    expect(joined).toContain('live');
    expect(joined).toMatch(/no customer|not.*live for a client/);
  });

  it('denies that a negative can ever be confirmed on this path', () => {
    expect(evidence.doesNotProve.join(' ')).toMatch(/negative/i);
  });
});
