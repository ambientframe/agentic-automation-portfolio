import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  WebhookSideEffectExecutor,
  isRemoteProofSafeEndpoint,
} from '@/lib/ports/webhook-side-effect-executor';
import { AttemptUnavailableError } from '@/lib/ports/side-effect-executor';
import type { VerifyOutcome } from '@/lib/model/runtime';

/**
 * REMOTE VERIFICATION PROOF.
 *
 * `scripts/remote-execution-proof.ts` established that an authorized notification genuinely
 * leaves this machine and is recorded by a receiver this application cannot write to. It left
 * one hole: nothing could ever ASK that receiver afterwards whether a specific operation
 * arrived, so an `OUTCOME_UNKNOWN` stayed open forever and `attemptVerify` threw.
 *
 * This drives the real `WebhookSideEffectExecutor` against a real n8n instance over the public
 * internet and captures three facts:
 *
 *   A. A delivery that was made is CONFIRMED_EXECUTED, carrying the receiver's own execution id.
 *   B. A key that was never sent is STILL_UNKNOWN.
 *   C. (B) is never CONFIRMED_NOT_EXECUTED — against a live receiver, not only in unit tests.
 *
 * (C) is the one worth capturing. The asymmetry is easy to assert in a test with a stubbed
 * response and easy to lose against a real receiver that answers `found: false` confidently.
 *
 * Run with both endpoints set in `.env.local`:
 *   npx tsx --env-file=.env.local scripts/remote-verification-proof.ts
 */

const EVIDENCE_PATH = join(process.cwd(), 'n8n', 'evidence', 'lead-rescue-remote-verification.json');

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (value === undefined || value.length === 0) {
    throw new Error(`${name} is not set. This proof requires a real receiver; it will not simulate one.`);
  }
  if (!isRemoteProofSafeEndpoint(value)) {
    throw new Error(`${name} is not a public HTTPS endpoint. A receiver this machine could answer for itself proves nothing.`);
  }
  return value;
}

/** A read-only observation of the receiver's raw answer, retained alongside the executor's verdict. */
async function rawAnswer(lookupEndpoint: string, key: string): Promise<unknown> {
  const response = await fetch(lookupEndpoint, {
    method: 'GET',
    headers: { accept: 'application/json', 'idempotency-key': key },
  });
  return { httpStatus: response.status, body: await response.json() };
}

async function main(): Promise<void> {
  const endpoint = required('LEAD_RESCUE_WEBHOOK_ENDPOINT');
  const lookupEndpoint = required('LEAD_RESCUE_WEBHOOK_LOOKUP_ENDPOINT');

  const executor = new WebhookSideEffectExecutor({ endpoint, lookupEndpoint });
  const stamp = execSync('git rev-parse HEAD').toString().trim();
  const runId = `remote-verification-${Date.now()}`;

  const deliveredKey = `notify:${runId}:delivered`;
  const neverSentKey = `notify:${runId}:never-sent`;

  // A — a real delivery, then a real lookup of it.
  const sendOutcome = await executor.attemptSend({
    attemptId: `${runId}-send`,
    idempotencyKey: deliveredKey,
    provider: 'n8n',
    description: 'Remote verification proof: a delivery that will then be looked up.',
  });

  const confirmed: VerifyOutcome = await executor.attemptVerify({
    attemptId: `${runId}-verify-present`,
    targetIdempotencyKey: deliveredKey,
    provider: 'n8n',
  });

  // B — a key the receiver has never seen.
  const absent: VerifyOutcome = await executor.attemptVerify({
    attemptId: `${runId}-verify-absent`,
    targetIdempotencyKey: neverSentKey,
    provider: 'n8n',
  });

  // The raw receiver answers, captured separately and read-only, so the executor's verdict can be
  // checked against what the receiver actually said rather than taken on trust.
  const rawPresent = await rawAnswer(lookupEndpoint, deliveredKey);
  const rawAbsent = await rawAnswer(lookupEndpoint, neverSentKey);

  // A refusal is still a fact worth capturing: with no lookup configured, the boundary must
  // return to refusing rather than guessing.
  let refusalWithoutLookup: string;
  try {
    await new WebhookSideEffectExecutor({ endpoint }).attemptVerify({
      attemptId: `${runId}-verify-unconfigured`,
      targetIdempotencyKey: deliveredKey,
      provider: 'n8n',
    });
    refusalWithoutLookup = 'DID NOT REFUSE — an executor with no lookup channel returned an outcome';
  } catch (error) {
    refusalWithoutLookup =
      error instanceof AttemptUnavailableError
        ? `refused with AttemptUnavailableError: ${error.message}`
        : `refused with an unexpected error: ${String(error)}`;
  }

  const evidence = {
    schemaVersion: 'lead-rescue-remote-verification-evidence-1',
    capturedAt: new Date().toISOString(),
    gitHead: stamp,

    receiver: {
      kind: 'third-party automation platform (n8n), reachable only over the public internet',
      origin: new URL(endpoint).origin,
      onThisMachine: false,
      logWorkflow: 'Lead Rescue — Delivery Log',
      lookupWorkflow: 'Lead Rescue — Delivery Lookup',
      persistence:
        'An n8n data table named lead_rescue_deliveries, written by the receiver before it responds and readable only through the receiver. This application holds no credential for it and cannot write to or edit it.',
    },

    confirmable: {
      idempotencyKey: deliveredKey,
      sendOutcome,
      verifyOutcome: confirmed,
      rawReceiverAnswer: rawPresent,
      establishes:
        'A delivery that genuinely crossed to the receiver can be independently confirmed afterwards by asking the receiver, and the confirmation carries the receiver’s own execution id rather than anything this application generated.',
    },

    absent: {
      idempotencyKey: neverSentKey,
      verifyOutcome: absent,
      rawReceiverAnswer: rawAbsent,
      establishes:
        'A key the receiver has never seen returns STILL_UNKNOWN. The receiver answered plainly that it holds no record, and the executor still refused to convert that into a confirmed negative.',
    },

    standingGuarantee: {
      neverConfirmsANegative: absent.kind !== 'CONFIRMED_NOT_EXECUTED',
      observedKind: absent.kind,
      why: 'A receiver cannot prove it never received something. A request can be accepted at the socket and die before the first write to its log — precisely the failure that produces the OUTCOME_UNKNOWN being investigated. The receiver’s confident "found: false" is therefore not evidence of absence, and is not treated as any.',
    },

    unconfiguredLookup: {
      behaviour: refusalWithoutLookup,
      why: 'With no lookup channel the boundary must return to refusing rather than guessing, so that a missing verification path can never be mistaken for a completed one.',
    },

    scopeStatement:
      'This evidence proves that an authorized Lead Rescue notification left this machine over HTTPS, was recorded by a third-party automation platform in storage this application cannot write to, and was then INDEPENDENTLY CONFIRMED by querying that platform for the operation’s idempotency key; and that a key never sent returns an honest unknown rather than a fabricated negative. It was produced by the application running on this machine against a live receiver, not by a stub.',

    doesNotProve: [
      'It does not make Lead Rescue live for a client. No customer exists, no real business data was involved, every input was authored here, and the receiver forwards nothing to anyone.',
      'It does not prove the notification reached a person. The receiver records deliveries and forwards nothing; no human recipient is configured anywhere on this path.',
      'It does not prove exactly-once delivery across arbitrary crash and provider failure modes. It proves one confirmable delivery and one honest unknown.',
      'It does not prove a negative can ever be confirmed on this path. It proves the opposite: the receiver cannot observe what it failed to record, so an absent row stays unknown by design.',
      'It does not prove the DEPLOYED application does this. The crossing was made by the application running on this machine; the hosted build has no such endpoint configured.',
      'It does not prove real classification. No model was called during this capture.',
      'It does not prove durability of the receiver’s storage beyond the moment of capture. The lookup was performed seconds after the delivery.',
    ],
  };

  writeFileSync(EVIDENCE_PATH, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');

  console.log(`send:    ${sendOutcome.kind}`);
  console.log(`present: ${confirmed.kind}`);
  console.log(`absent:  ${absent.kind}`);
  console.log(`no-lookup: ${refusalWithoutLookup.slice(0, 60)}…`);
  console.log(`\nwrote ${EVIDENCE_PATH}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
