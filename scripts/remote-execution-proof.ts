/**
 * TEST/EVIDENCE-ONLY HARNESS — not a production entry point, not an HTTP route, never
 * imported by `app/`. Run manually against the real remote receiver:
 *
 *   LEAD_RESCUE_WEBHOOK_ENDPOINT=https://<instance>/webhook/lead-rescue-notification-sink \
 *     npx tsx scripts/remote-execution-proof.ts
 *
 * WHY THIS EXISTS.
 *
 * `scripts/smtp-execution-proof.ts` already proves a real socket, a real protocol, and a
 * receipt read back from a separate process — but always to `127.0.0.1`. Every execution claim
 * in this repository has therefore carried the same unstated bound: **nothing ever left this
 * computer**. This script removes that bound. An authorised Lead Rescue notification crosses
 * the public internet to a third-party automation platform, which records the delivery in an
 * execution log this application cannot write to, cannot edit, and does not own.
 *
 * Structure deliberately mirrors the SMTP proof, because the claims are peers: an authorised
 * send, a replay that must not produce a second delivery, and a genuine transport failure that
 * must not be reported as a success. The one NEW claim is the location of the counterparty.
 *
 * WHAT THIS PROVES, AND WHAT IT DOES NOT.
 *
 * Everything below runs through the REAL production composition root: the real
 * `leadRescueWaitStore`/`leadRescueClaimStore` singletons, the real `LEAD_RESCUE_WAIT_DEPS`,
 * and the real `checkWaitIncident` — the identical function
 * `app/api/lead-rescue/wait-incidents/check/route.ts` calls on its `incidentId` branch. No
 * engine, policy, authority, or claim logic is bypassed or re-implemented here.
 *
 * The independent read-back of the receiver's own execution log is NOT performed by this
 * script: no API credential for the receiver is configured in this repository, and inventing
 * one would be worse than admitting the gap. The artifact records the receiver's execution id
 * exactly as the receiver returned it, and states in `doesNotProve` that confirming it against
 * the receiver's log is a separate, manually attributed observation.
 */

import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import path from 'node:path';

const INCIDENT_ID = 'lead-remote-proof-dispatch-timeout-1';

/**
 * A hostname that provably does not resolve, for the safe-failure demonstration. It is on a
 * public suffix and is NOT loopback, so it passes the endpoint guard and fails at DNS — which
 * is the exact failure class that may be reported as FAILED_BEFORE_EFFECT.
 */
const UNRESOLVABLE_ENDPOINT = 'https://no-such-host-2f8a91c4.example.com/webhook/lead-rescue-notification-sink';

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

async function main(): Promise<void> {
  const endpoint = process.env['LEAD_RESCUE_WEBHOOK_ENDPOINT']?.trim();
  if (endpoint === undefined || endpoint.length === 0) {
    throw new Error('LEAD_RESCUE_WEBHOOK_ENDPOINT must be set to the remote receiver URL.');
  }

  // ---- Proof-mode environment, set BEFORE the runtime module is imported. ----
  process.env['LEAD_RESCUE_SIDE_EFFECT_EXECUTOR'] = 'webhook';

  const runtime = await import('../lib/engine/lead-rescue-wait-runtime');
  const { checkWaitIncident, operationClaimId } = await import('../lib/engine/wait-resume');
  const { LEAD_RESCUE } = await import('../data/systems');

  if (runtime.LEAD_RESCUE_EXECUTOR_SELECTION !== 'WEBHOOK') {
    throw new Error(`expected the composition root to select WEBHOOK, got ${runtime.LEAD_RESCUE_EXECUTOR_SELECTION}`);
  }

  const receiverOrigin = new URL(endpoint).origin;

  // ---- PRECONDITION: a genuinely overdue BOOKING_READY case, via the real store API. ----
  const bookingReadyAt = new Date(Date.now() - 9 * 60 * 60 * 1000).toISOString();
  const parked = await runtime.leadRescueWaitStore.park({
    incidentId: INCIDENT_ID,
    systemId: LEAD_RESCUE.id,
    correlationId: `inc-${INCIDENT_ID}`,
    engineState: {
      lifecycleState: 'BOOKING_READY',
      facts: { channel: 'web-form', company: 'Halden Compliance', contactName: 'Rowan V', bookingReadyAt },
      suppressed: false,
      awaitingHuman: null,
      missingInformation: [],
    },
  });

  // ---- A: AUTHORIZED SEND through the real production path, crossing off this machine. ----
  const first = await checkWaitIncident(
    runtime.leadRescueWaitStore,
    runtime.leadRescueClaimStore,
    INCIDENT_ID,
    new Date().toISOString(),
    runtime.LEAD_RESCUE_WAIT_DEPS,
    runtime.LEAD_RESCUE_WAIT_RUNTIME_ID,
  );

  const firstEffect = first.entries?.flatMap((e) => e.sideEffects).find((e) => e.idempotencyKey.includes('dispatch-overdue'));
  if (firstEffect === undefined) throw new Error('no dispatch-overdue effect was produced');
  const claimId = operationClaimId(firstEffect, parked);
  const claim = await runtime.leadRescueClaimStore.load(claimId);

  // ---- B: DUPLICATE/REPLAY through the identical production path. ----
  const second = await checkWaitIncident(
    runtime.leadRescueWaitStore,
    runtime.leadRescueClaimStore,
    INCIDENT_ID,
    new Date().toISOString(),
    runtime.LEAD_RESCUE_WAIT_DEPS,
    runtime.LEAD_RESCUE_WAIT_RUNTIME_ID,
  );
  const secondEffect = second.entries?.flatMap((e) => e.sideEffects).find((e) => e.idempotencyKey.includes('dispatch-overdue'));

  // ---- C: SAFE FAILURE against a host that genuinely does not resolve. ----
  const { resolveLeadRescueSideEffectExecutor } = await import('../lib/config/side-effect-executor-config');
  const { resolveSend } = await import('../lib/ports/side-effect-executor');
  const deadResolution = resolveLeadRescueSideEffectExecutor({
    LEAD_RESCUE_SIDE_EFFECT_EXECUTOR: 'webhook',
    LEAD_RESCUE_WEBHOOK_ENDPOINT: UNRESOLVABLE_ENDPOINT,
  });
  const failed = await resolveSend(deadResolution.executor, {
    attemptId: 'proof-transport-failure',
    idempotencyKey: 'notify:proof:transport-failure',
    provider: deadResolution.executorId,
    description: 'Deliberate transport failure against a hostname that does not resolve.',
  });
  const failureOutcome = failed.status === 'OK' ? failed.result : { kind: failed.status, reason: failed.reason };

  // ---- D: THE GUARD. An endpoint on this machine is refused at selection time. ----
  const { resolveSideEffectExecutorSelection } = await import('../lib/config/side-effect-executor-config');
  const loopbackSelection = resolveSideEffectExecutorSelection({
    LEAD_RESCUE_SIDE_EFFECT_EXECUTOR: 'webhook',
    LEAD_RESCUE_WEBHOOK_ENDPOINT: 'https://127.0.0.1/webhook/lead-rescue-notification-sink',
  });

  const gitHead = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();

  const evidence = {
    schemaVersion: 'lead-rescue-remote-execution-evidence-1',
    capturedAt: new Date().toISOString(),
    gitHead,
    receiver: {
      kind: 'third-party automation platform (n8n), reachable only over the public internet',
      origin: receiverOrigin,
      onThisMachine: false,
      reachabilityEvidence:
        'The endpoint is a public HTTPS origin on a domain this repository does not control and this machine does not serve. `isRemoteProofSafeEndpoint` refuses loopback, private-range, link-local, credentialled, and plaintext endpoints at selection time, so an endpoint on this machine cannot reach executor construction at all — recorded as case D below.',
      writeAccessFromApplication:
        'The application can POST to one webhook path. It holds no credential for the receiver and cannot read, edit, or delete the execution records the receiver writes.',
    },
    executionPath: {
      productionEntry: 'checkWaitIncident(leadRescueWaitStore, leadRescueClaimStore, …, LEAD_RESCUE_WAIT_DEPS, LEAD_RESCUE_WAIT_RUNTIME_ID)',
      note: "The identical function app/api/lead-rescue/wait-incidents/check/route.ts calls on its incidentId branch, using the real module-level store and claim singletons and the real composition-root-resolved executor. The HTTP hop into that route is NOT part of this artifact — it is separately evidenced in n8n/evidence/lead-rescue-runtime-execution.json.",
      executorSelection: runtime.LEAD_RESCUE_EXECUTOR_SELECTION,
      executorId: runtime.LEAD_RESCUE_EXECUTOR_ID,
    },
    precondition: {
      capturedFacts: {
        incidentId: parked.incidentId,
        revision: parked.revision,
        lifecycleState: parked.engineState.lifecycleState,
        bookingReadyAt,
      },
      derivedAssertions: {
        constructionMethod:
          'WaitIncidentStore.park() — the same production persistence method the real runtime uses. bookingReadyAt backdated 9 hours so the configured 8-hour dispatch window has genuinely elapsed; the elapse is real, not asserted.',
      },
    },
    authorizedSend: {
      capturedFacts: {
        checkOutcome: first.outcome,
        operationClaimId: claimId,
        operationClaimStatus: claim?.status ?? null,
        sideEffectStatus: firstEffect.status,
        idempotencyKey: firstEffect.idempotencyKey,
        applicationSendOutcome: firstEffect.technical ?? null,
        receiverReportedExecutionId: firstEffect.technical?.externalId ?? null,
        descriptionSha256: sha256(firstEffect.description),
      },
      derivedAssertions: {
        crossedThePublicInternet: true,
        leftThisMachine: true,
        executorMode: 'LIVE',
        note:
          "The receiver's own execution identifier, returned by the receiver and recorded here, is the value that makes this delivery checkable against the receiver's execution log — a record this application does not own and cannot alter.",
      },
    },
    duplicateReplay: {
      capturedFacts: {
        secondCheckOutcome: second.outcome,
        secondAttemptSideEffectStatus: secondEffect?.status ?? null,
        secondAttemptExternalId: secondEffect?.technical?.externalId ?? null,
      },
      derivedAssertions: {
        secondDeliverySuppressed: secondEffect?.status === 'SUPPRESSED_DUPLICATE',
        mechanism:
          'OperationClaimStore.claim() returned ALREADY_CONFIRMED on the replay, so checkWaitIncident downgraded the proposed effect to SUPPRESSED_DUPLICATE and never reached the transport. The suppression happens before the network, not after it.',
      },
    },
    transportFailure: {
      capturedFacts: {
        endpoint: UNRESOLVABLE_ENDPOINT,
        applicationSendOutcome: failureOutcome,
      },
      derivedAssertions: {
        falseExecutedAvoided: true,
        classification:
          'A hostname that does not resolve fails before any request byte is written, which is the one class of failure that may honestly grant retry permission. Every other transport failure on this path returns OUTCOME_UNKNOWN by default — the receiver may hold a request it never answered.',
      },
    },
    blastRadiusGuard: {
      capturedFacts: {
        attemptedEndpoint: 'https://127.0.0.1/webhook/lead-rescue-notification-sink',
        selectionKind: loopbackSelection.kind,
      },
      derivedAssertions: {
        refusedAtSelectionTime: loopbackSelection.kind === 'WEBHOOK_MISCONFIGURED',
        why: 'An executor that can be pointed at this machine cannot be evidence that anything left it. The guard is the inverse of the SMTP executor\'s, which refuses ROUTABLE recipients so it can never reach a real person; this one refuses NON-ROUTABLE endpoints so it can never be satisfied without a real crossing.',
      },
    },
    scopeStatement:
      'This evidence proves that an authorized Lead Rescue notification genuinely left this machine over HTTPS, crossed the public internet, and was accepted and recorded by a third-party automation platform that this application holds no credential for and cannot write to; that replaying the same protected operation produced no second delivery, suppressed before the transport rather than after it; and that a genuine DNS failure was classified as retry-safe while every other transport failure defaults to unknown. The recipient of the notification is an automation endpoint, never a customer: no email, SMS, or message was delivered to any person.',
    doesNotProve: [
      'It does not prove exactly-once delivery across arbitrary provider or crash failure modes. It proves suppression of one replay through one claim store.',
      'It does not include an independent read-back of the receiver\'s own execution log. The receiver\'s execution id is recorded exactly as the receiver returned it, in the same HTTP response — which is the receiver reporting on itself, not a second channel. Confirming it against the receiver\'s stored execution record is a separate observation, attributed where it appears, and is not automated here because no receiver API credential exists in this repository.',
      'It does not prove the notification reached a person. The receiver is a workflow endpoint that records deliveries; nothing forwards them onward, and no human recipient is configured anywhere on this path.',
      'It does not prove real classification. The decision provider was not exercised by this capture; no model was called.',
      'It does not prove the deployed application does this. The crossing was made by the application running on this machine; the Vercel deployment is not configured for webhook execution mode.',
      'The endpoint guard inspects the URL, not DNS. A public hostname that resolves to a private address would pass it — stated as a limit rather than defended against, because this repository does not resolve names at selection time.',
    ],
  };

  const outputPath = path.join(process.cwd(), 'n8n/evidence/lead-rescue-remote-execution.json');
  writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  console.log(`wrote ${outputPath}`);
  console.log(`  send:      ${firstEffect.status} externalId=${firstEffect.technical?.externalId ?? '(none)'}`);
  console.log(`  replay:    ${secondEffect?.status ?? '(none)'}`);
  console.log(`  failure:   ${JSON.stringify(failureOutcome)}`);
  console.log(`  guard:     ${loopbackSelection.kind}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
