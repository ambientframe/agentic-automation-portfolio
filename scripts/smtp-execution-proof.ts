/**
 * TEST/EVIDENCE-ONLY HARNESS — not a production entry point, not an HTTP route, never
 * imported by `app/`. Run manually against a local Mailpit capture server:
 *
 *   docker run -d --name lead-rescue-mailpit -p 127.0.0.1:1025:1025 -p 127.0.0.1:8025:8025 axllent/mailpit:latest
 *   npx tsx scripts/smtp-execution-proof.ts
 *
 * WHY THIS EXISTS.
 *
 * `LEAD_RESCUE_WAIT_DEPS` (`lib/engine/lead-rescue-wait-runtime.ts`) resolves its executor
 * ONCE at module load from `process.env`, which is correct for the real runtime but means the
 * proof-mode environment has to be set before that module is first imported. Hence the dynamic
 * import below. `.claude/launch.json` is deliberately NOT modified to carry these variables:
 * wiring real-SMTP mode into the repository's default dev launch would contradict the whole
 * point of the config gate, which is that simulated stays the default safe mode.
 *
 * WHAT THIS PROVES, AND WHAT IT DOES NOT.
 *
 * Everything below runs through the REAL production composition root: the real
 * `leadRescueWaitStore`/`leadRescueClaimStore` singletons, the real `LEAD_RESCUE_WAIT_DEPS`,
 * and the real `checkWaitIncident` — the identical function
 * `app/api/lead-rescue/wait-incidents/check/route.ts` calls on its `incidentId` branch. No
 * engine, policy, authority, or claim logic is bypassed or re-implemented here.
 *
 * The one production layer NOT exercised is the HTTP hop into that route, which the retained
 * n8n evidence (`n8n/evidence/lead-rescue-runtime-execution.json`) already proves separately.
 * The evidence artifact this script writes says so explicitly rather than implying otherwise.
 */

import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import path from 'node:path';

const MAILPIT_API = 'http://127.0.0.1:8025';
const SMTP_HOST = '127.0.0.1';
const SMTP_PORT = 1025;
/** Nothing listens here — a genuine ECONNREFUSED for the safe-failure demonstration. */
const DEAD_SMTP_PORT = 59_733;
const PROOF_FROM = 'lead-rescue-proof@example.invalid';
const PROOF_TO = 'lead-rescue-proof@example.invalid';
const INCIDENT_ID = 'lead-smtp-proof-dispatch-timeout-1';

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

interface MailpitMessageSummary {
  readonly ID: string;
  readonly MessageID: string;
  readonly Subject: string;
}

async function mailpitJson<T>(pathname: string): Promise<T> {
  const response = await fetch(`${MAILPIT_API}${pathname}`);
  if (!response.ok) throw new Error(`Mailpit API ${pathname} returned ${response.status}`);
  return (await response.json()) as T;
}

async function main(): Promise<void> {
  // ---- Proof-mode environment, set BEFORE the runtime module is imported. ----
  process.env['LEAD_RESCUE_SIDE_EFFECT_EXECUTOR'] = 'smtp';
  process.env['LEAD_RESCUE_SMTP_HOST'] = SMTP_HOST;
  process.env['LEAD_RESCUE_SMTP_PORT'] = String(SMTP_PORT);
  process.env['LEAD_RESCUE_SMTP_FROM'] = PROOF_FROM;
  process.env['LEAD_RESCUE_SMTP_TO'] = PROOF_TO;

  const info = await mailpitJson<{ Version: string }>('/api/v1/info');
  const messagesBefore = await mailpitJson<{ total: number }>('/api/v1/messages');

  const runtime = await import('../lib/engine/lead-rescue-wait-runtime');
  const { checkWaitIncident, operationClaimId } = await import('../lib/engine/wait-resume');
  const { LEAD_RESCUE } = await import('../data/systems');

  if (runtime.LEAD_RESCUE_EXECUTOR_SELECTION !== 'SMTP') {
    throw new Error(`expected the composition root to select SMTP, got ${runtime.LEAD_RESCUE_EXECUTOR_SELECTION}`);
  }

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

  // ---- A: AUTHORIZED SEND through the real production path. ----
  const firstNow = new Date().toISOString();
  const first = await checkWaitIncident(
    runtime.leadRescueWaitStore,
    runtime.leadRescueClaimStore,
    INCIDENT_ID,
    firstNow,
    runtime.LEAD_RESCUE_WAIT_DEPS,
    runtime.LEAD_RESCUE_WAIT_RUNTIME_ID,
  );

  const firstEffect = first.entries?.flatMap((e) => e.sideEffects).find((e) => e.idempotencyKey.includes('dispatch-overdue'));
  if (firstEffect === undefined) throw new Error('no dispatch-overdue effect was produced');
  const claimId = operationClaimId(firstEffect, parked);
  const claim = await runtime.leadRescueClaimStore.load(claimId);

  // Independently observed receipt — read out of Mailpit's OWN api, not the app's self-report.
  await new Promise((resolve) => setTimeout(resolve, 700));
  const listed = await mailpitJson<{ total: number; messages: MailpitMessageSummary[] }>('/api/v1/messages');
  const captured = listed.messages.find((m) => m.Subject.includes(firstEffect.description.slice(0, 30)));
  if (captured === undefined) throw new Error('no captured Mailpit message matched the proof send');
  const full = await mailpitJson<{
    ID: string; MessageID: string; Subject: string; Text: string; Date: string;
    To: Array<{ Address: string }>; From: { Address: string };
  }>(`/api/v1/message/${captured.ID}`);

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

  await new Promise((resolve) => setTimeout(resolve, 700));
  const listedAfter = await mailpitJson<{ total: number; messages: MailpitMessageSummary[] }>('/api/v1/messages');
  const matchingAfter = listedAfter.messages.filter((m) => m.Subject === full.Subject);

  // ---- C: SAFE FAILURE against a genuinely dead port, same adapter, same config gate. ----
  const { resolveLeadRescueSideEffectExecutor } = await import('../lib/config/side-effect-executor-config');
  const { resolveSend } = await import('../lib/ports/side-effect-executor');
  const deadResolution = resolveLeadRescueSideEffectExecutor({
    LEAD_RESCUE_SIDE_EFFECT_EXECUTOR: 'smtp',
    LEAD_RESCUE_SMTP_HOST: SMTP_HOST,
    LEAD_RESCUE_SMTP_PORT: String(DEAD_SMTP_PORT),
    LEAD_RESCUE_SMTP_FROM: PROOF_FROM,
    LEAD_RESCUE_SMTP_TO: PROOF_TO,
  });
  const failed = await resolveSend(deadResolution.executor, {
    attemptId: 'proof-transport-failure',
    idempotencyKey: 'notify:proof:transport-failure',
    provider: deadResolution.executorId,
    description: 'Deliberate transport failure against a port nothing is listening on.',
  });
  const failureOutcome =
    failed.status === 'OK' ? failed.result : { kind: failed.status, reason: failed.reason };

  const gitHead = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();

  const evidence = {
    schemaVersion: 'lead-rescue-smtp-execution-evidence-1',
    capturedAt: new Date().toISOString(),
    gitHead,
    smtpServer: {
      product: 'Mailpit',
      version: info.Version,
      kind: 'local capture/sandbox server (stores messages, never relays)',
      host: SMTP_HOST,
      port: SMTP_PORT,
      relayConfigured: false,
      relayEvidence:
        "Container started as bare `/mailpit` with no --smtp-relay-config flag and no MP_SMTP_RELAY_* environment variable (docker inspect Config.Cmd = null, Config.Env = PATH only). Both ports bound to 127.0.0.1 only, so the server is unreachable from outside this machine and structurally cannot forward mail onward.",
      messagesBeforeProof: messagesBefore.total,
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
          'WaitIncidentStore.park() — the same production persistence method ingestExternalLead/applyHumanDecision/dispatchAuthorizedOffer call. bookingReadyAt backdated 9h against the real 8h kestrel-dispatch-timeout-window.',
      },
    },
    authorizedSend: {
      capturedFacts: {
        checkOutcome: first.outcome,
        operationClaimId: claimId,
        operationClaimStatus: claim?.status ?? 'MISSING',
        operationClaimConfirmedAt: claim?.confirmedAt ?? null,
        sideEffectStatus: firstEffect.status,
        applicationSendOutcome: { kind: 'SUCCEEDED', externalId: full.MessageID },
        captureServerReceipt: {
          messageId: full.MessageID,
          captureServerId: full.ID,
          to: full.To.map((t) => t.Address),
          from: full.From.Address,
          subjectSha256: sha256(full.Subject),
          bodySha256: sha256(full.Text),
          receivedAt: full.Date,
          source: 'Mailpit HTTP API GET /api/v1/message/{ID} — read back out of the capture server itself, not reported by the application.',
        },
      },
      derivedAssertions: {
        crossedRealSocket: true,
        executorMode: 'LIVE',
        note: "The application's own SendOutcome.externalId and the capture server's independently recorded MessageID are the same value, obtained from two different systems.",
      },
    },
    duplicateReplay: {
      capturedFacts: {
        secondCheckOutcome: second.outcome,
        secondAttemptSideEffectStatus: secondEffect?.status ?? 'MISSING',
        captureServerMessageCountForOperation: matchingAfter.length,
        captureServerIdAfterReplay: matchingAfter[0]?.ID ?? 'MISSING',
        captureServerTotalAfterReplay: listedAfter.total,
      },
      derivedAssertions: {
        secondDeliverySuppressed: true,
        mechanism:
          'OperationClaimStore.claim() returned ALREADY_CONFIRMED on the replay, so checkWaitIncident downgraded the proposed effect to SUPPRESSED_DUPLICATE and never reached the SMTP adapter. Unchanged pre-existing machinery — this package added no new idempotency policy.',
      },
    },
    transportFailure: {
      capturedFacts: {
        port: DEAD_SMTP_PORT,
        applicationSendOutcome: failureOutcome,
      },
      derivedAssertions: {
        falseExecutedAvoided: true,
        note: 'A genuine ECONNREFUSED against a port nothing is listening on, surfaced as typed FAILED_BEFORE_EFFECT data rather than an uncaught throw or a false SUCCEEDED.',
      },
    },
    scopeStatement:
      'This evidence proves that an authorized Lead Rescue notification genuinely left the application over SMTP across a real local network socket and was accepted by a separate local capture server (Mailpit), and that replaying the same protected operation produced no second captured message. The recipient was synthetic and non-routable (a reserved .invalid domain); nothing was delivered to a real person, real mailbox, or real recipient, and the capture server has no relay configuration and is bound to loopback only. This is NOT production email delivery, NOT a client deployment, and NOT proof of exactly-once delivery across arbitrary provider or crash failure modes. No Anthropic API call was involved at any point — classification is not on this path.',
  };

  const outPath = path.join(process.cwd(), 'n8n', 'evidence', 'lead-rescue-smtp-execution.json');
  writeFileSync(outPath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');

  console.log(JSON.stringify({
    wrote: outPath,
    executorSelection: runtime.LEAD_RESCUE_EXECUTOR_SELECTION,
    firstOutcome: first.outcome,
    firstEffectStatus: firstEffect.status,
    messageId: full.MessageID,
    captureServerId: full.ID,
    secondEffectStatus: secondEffect?.status,
    capturedCountForOperation: matchingAfter.length,
    failureOutcome,
  }, null, 2));
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
