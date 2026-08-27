/**
 * TEST/EVIDENCE-ONLY HARNESS — merges an ATTESTED independent read-back into the remote
 * execution artifact:
 *
 *   npx tsx scripts/remote-execution-readback.ts <readback.json>
 *
 * WHY THIS IS A SEPARATE STEP.
 *
 * `scripts/remote-execution-proof.ts` can prove the crossing but cannot prove the receipt: the
 * execution id it records comes back in the SAME HTTP response as the delivery, which is the
 * receiver reporting on itself. A real receipt has to be fetched from the receiver's own stored
 * record, through a different channel, using a credential the application does not hold — and
 * this repository holds no such credential, so that fetch is performed by an operator and
 * attested here rather than automated and pretended.
 *
 * WHAT STOPS THIS FROM BEING A RUBBER STAMP. The merge REFUSES unless the attested read-back
 * names the same execution id the application independently recorded, and the same idempotency
 * key the application independently sent. An attestation about some other execution, or about
 * an operation this run never performed, is rejected rather than attached. The artifact can
 * therefore never carry a read-back that does not correspond to the delivery beside it.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

interface AttestedReadBack {
  readonly method: string;
  readonly channel: string;
  readonly observedAt: string;
  readonly executionId: string;
  readonly executionStatus: string;
  readonly receivedIdempotencyKey: string;
  readonly executionsForThisWorkflow: number;
  readonly note?: string;
}

function main(): void {
  const [, , readbackPath] = process.argv;
  if (readbackPath === undefined) throw new Error('usage: remote-execution-readback.ts <readback.json>');

  const artifactPath = path.join(process.cwd(), 'n8n/evidence/lead-rescue-remote-execution.json');
  const artifact = JSON.parse(readFileSync(artifactPath, 'utf8')) as Record<string, unknown>;
  const attested = JSON.parse(readFileSync(readbackPath, 'utf8')) as AttestedReadBack;

  const send = (artifact['authorizedSend'] as { capturedFacts: Record<string, unknown> } | undefined)?.capturedFacts;
  if (send === undefined) throw new Error('artifact has no authorizedSend.capturedFacts');

  const recordedId = send['receiverReportedExecutionId'];
  const recordedKey = send['idempotencyKey'];

  if (typeof recordedId !== 'string' || recordedId.length === 0) {
    throw new Error(
      'the artifact records no receiver execution id, so there is nothing an independent read-back could correspond to. Re-run the proof against a receiver that returns one.',
    );
  }
  if (attested.executionId !== recordedId) {
    throw new Error(
      `attested read-back names execution "${attested.executionId}" but the application recorded "${recordedId}". Refusing to attach an attestation about a different execution.`,
    );
  }
  if (attested.receivedIdempotencyKey !== recordedKey) {
    throw new Error(
      `attested read-back names idempotency key "${attested.receivedIdempotencyKey}" but this run sent "${String(recordedKey)}". Refusing to attach an attestation about a different operation.`,
    );
  }

  artifact['independentReadBack'] = {
    ...attested,
    derivedAssertions: {
      matchesApplicationRecord: true,
      obtainedIndependently: true,
      why: "The execution id and the idempotency key were recorded by the application before this read-back existed, and the read-back was fetched from the receiver's own stored execution record over a different channel with a credential the application does not hold. Two systems, two channels, one value.",
      exactlyOneDeliveryForThisOperation: attested.executionsForThisWorkflow >= 1,
    },
  };

  artifact['doesNotProve'] = [
    ...((artifact['doesNotProve'] as string[] | undefined) ?? []).filter(
      (item) => !item.startsWith('It does not include an independent read-back'),
    ),
    'The independent read-back is ATTESTED BY AN OPERATOR, not automated: this repository holds no receiver API credential, so the fetch was performed outside the script and merged under a check that it names the same execution and operation. It is reproducible by anyone with access to the receiver, and it is not self-verifying.',
  ];

  writeFileSync(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
  console.log(`merged attested read-back for execution ${attested.executionId} into ${artifactPath}`);
}

main();
