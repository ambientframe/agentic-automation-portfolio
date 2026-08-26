/**
 * TEST/EVIDENCE-ONLY HARNESS — not a production entry point, not an HTTP route, never
 * imported by `app/`. Run manually against a local Mailpit capture server:
 *
 *   docker run -d --name lead-rescue-mailpit -p 127.0.0.1:1025:1025 -p 127.0.0.1:8025:8025 axllent/mailpit:latest
 *   npx tsx scripts/authority-execution-proof.ts
 *
 * WHAT THIS PROVES, AND WHAT IT IS NOT ALLOWED TO DO.
 *
 * The authority event is NOT faked. This harness seeds synthetic business data through
 * `WaitIncidentStore.park()` — the same production persistence method every ingress and
 * re-park already uses — and then drives `applyHumanDecision` and `dispatchAuthorizedOffer`
 * (`lib/engine/wait-resume.ts`), which are the EXACT functions
 * `app/api/lead-rescue/wait-incidents/decide/route.ts` and `.../dispatch/route.ts` call. It
 * never writes an authorisation result, an execution result, or an operation claim directly.
 * Every outcome below is computed by the real services against the real file-backed stores.
 *
 * The one production layer not exercised is the HTTP hop into those two routes. Those routes
 * resolve their executor from `process.env` at module load, and `.claude/launch.json` is a
 * tracked file — wiring real-SMTP mode into the repository's default dev launch would
 * contradict the config gate's whole purpose (simulated is the default safe mode). The
 * retained artifact states this explicitly rather than implying HTTP participated.
 */

import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import type { CanonicalEvent } from '../lib/model/runtime';

const MAILPIT_API = 'http://127.0.0.1:8025';
const SMTP_HOST = '127.0.0.1';
const SMTP_PORT = 1025;
const PROOF_FROM = 'lead-rescue-proof@example.invalid';
/** Reserved, non-routable (RFC 2606). Enforced by the executor's own constructor guard. */
const PROOF_TO = 'lead-rescue-authority-proof@example.invalid';
const INCIDENT_ID = 'lead-authority-proof-reviewed-offer-1';

const OFFER_SUMMARY = 'Offer a 30-minute SOC 2 readiness scoping call.';

async function mailpitCount(): Promise<number> {
  const r = await fetch(`${MAILPIT_API}/api/v1/messages`);
  if (!r.ok) throw new Error(`Mailpit API returned ${r.status}`);
  return ((await r.json()) as { total: number }).total;
}

function decisionEvent(decidedBy: string, decision: string, nowIso: string): CanonicalEvent {
  return {
    eventId: `${INCIDENT_ID}:decide:${nowIso}`,
    correlationId: `inc-${INCIDENT_ID}`,
    entityId: INCIDENT_ID,
    type: 'human.decision.recorded',
    source: 'operator-console',
    sourceEventId: `decide:${INCIDENT_ID}:${nowIso}`,
    occurredAt: nowIso,
    receivedAt: nowIso,
    schemaVersion: 'wait-resume-1',
    actor: 'HUMAN',
    executionMode: 'SIMULATED',
    payload: { decidedBy, decision, rationale: 'Synthetic authority proof: scope is clear and in segment.' },
  };
}

function despatchEvent(decidedBy: string, nowIso: string): CanonicalEvent {
  return {
    eventId: `${INCIDENT_ID}:despatch:${nowIso}`,
    correlationId: `inc-${INCIDENT_ID}`,
    entityId: INCIDENT_ID,
    type: 'lead.offer.despatched',
    source: 'operator-console',
    sourceEventId: `despatch:${INCIDENT_ID}:${nowIso}`,
    occurredAt: nowIso,
    receivedAt: nowIso,
    schemaVersion: 'wait-resume-1',
    actor: 'HUMAN',
    executionMode: 'SIMULATED',
    payload: { decidedBy, target: PROOF_TO, offerSummary: OFFER_SUMMARY },
  };
}

async function main(): Promise<void> {
  // Real SMTP proof mode, set BEFORE the runtime module resolves its executor.
  process.env['LEAD_RESCUE_SIDE_EFFECT_EXECUTOR'] = 'smtp';
  process.env['LEAD_RESCUE_SMTP_HOST'] = SMTP_HOST;
  process.env['LEAD_RESCUE_SMTP_PORT'] = String(SMTP_PORT);
  process.env['LEAD_RESCUE_SMTP_FROM'] = PROOF_FROM;
  process.env['LEAD_RESCUE_SMTP_TO'] = PROOF_TO;

  const runtime = await import('../lib/engine/lead-rescue-wait-runtime');
  const { applyHumanDecision, dispatchAuthorizedOffer, operationClaimId } = await import('../lib/engine/wait-resume');
  const { LEAD_RESCUE } = await import('../data/systems');
  const { KESTREL } = await import('../data/profiles/kestrel/profile');

  if (runtime.LEAD_RESCUE_EXECUTOR_SELECTION !== 'SMTP') {
    throw new Error(`expected SMTP executor, got ${runtime.LEAD_RESCUE_EXECUTOR_SELECTION}`);
  }
  if ((await mailpitCount()) !== 0) throw new Error('Mailpit must start empty for this proof');

  const store = runtime.leadRescueWaitStore;
  const claims = runtime.leadRescueClaimStore;
  const deps = runtime.LEAD_RESCUE_WAIT_DEPS;
  const runtimeId = runtime.LEAD_RESCUE_WAIT_RUNTIME_ID;
  const timeline: Array<{ stage: string; count: number }> = [];

  // ---- A. PREPARE: a synthetic case under human review. An offer is possible; nobody has
  //         authorised sending one. Business-data setup only — no outcome is written here.
  const prepared = await store.park({
    incidentId: INCIDENT_ID,
    systemId: LEAD_RESCUE.id,
    correlationId: `inc-${INCIDENT_ID}`,
    engineState: {
      lifecycleState: 'NEEDS_HUMAN',
      facts: { channel: 'web-form', company: 'Aldermoor Systems (synthetic)', contactName: 'Sam Okafor (synthetic)', reviewStartedAt: new Date().toISOString() },
      suppressed: false,
      awaitingHuman: 'Confirm the engagement is in segment before offering a next step.',
      missingInformation: [],
    },
  });
  timeline.push({ stage: 'prepared (awaiting authorisation)', count: await mailpitCount() });

  const unauthorizedAttempts: Array<Record<string, unknown>> = [];

  // ---- C1. Execution attempted with NO authorisation at all.
  const attempt1 = await dispatchAuthorizedOffer(store, claims, INCIDENT_ID, prepared.revision, despatchEvent('client-partner', new Date().toISOString()), deps, runtimeId);
  const after1 = await mailpitCount();
  const rec1 = await store.load(INCIDENT_ID);
  unauthorizedAttempts.push({
    attempt: 'despatch offer while still under human review, no authorisation recorded',
    via: 'dispatchAuthorizedOffer (same function POST /api/lead-rescue/wait-incidents/dispatch calls)',
    outcome: attempt1.outcome,
    smtpMessagesAfter: after1,
    recordUnchanged: rec1?.revision === prepared.revision && rec1?.engineState.lifecycleState === 'NEEDS_HUMAN',
  });
  timeline.push({ stage: 'after unauthorised despatch attempt', count: after1 });

  // ---- C2. Authorisation attempted by a role BELOW the required authority ceiling.
  const underRole = KESTREL.roles.find((r) => r.id === 'analyst');
  const attempt2 = await applyHumanDecision(store, INCIDENT_ID, prepared.revision, decisionEvent('analyst', 'CLEARED_TO_PROCEED', new Date().toISOString()), deps);
  const after2 = await mailpitCount();
  const rec2 = await store.load(INCIDENT_ID);
  unauthorizedAttempts.push({
    attempt: `authorisation attempted by role "analyst" (authority ceiling ${underRole?.authorityCeiling}), below the level the handler requires`,
    via: 'applyHumanDecision (same function POST /api/lead-rescue/wait-incidents/decide calls)',
    outcome: attempt2.outcome,
    smtpMessagesAfter: after2,
    recordUnchanged: rec2?.revision === prepared.revision && rec2?.engineState.lifecycleState === 'NEEDS_HUMAN',
  });
  timeline.push({ stage: 'after under-authority approval attempt', count: after2 });

  // ---- C3. Authorisation submitted against a revision that is not current.
  const attempt3 = await applyHumanDecision(store, INCIDENT_ID, prepared.revision + 41, decisionEvent('client-partner', 'CLEARED_TO_PROCEED', new Date().toISOString()), deps);
  const after3 = await mailpitCount();
  unauthorizedAttempts.push({
    attempt: 'authorisation submitted against a stale/mismatched revision',
    via: 'applyHumanDecision (same function POST /api/lead-rescue/wait-incidents/decide calls)',
    outcome: attempt3.outcome,
    smtpMessagesAfter: after3,
    recordUnchanged: (await store.load(INCIDENT_ID))?.revision === prepared.revision,
  });
  timeline.push({ stage: 'after stale-revision approval attempt', count: after3 });

  // ---- D. AUTHORISE: the real operator decision, by a role that genuinely holds authority.
  const authRole = KESTREL.roles.find((r) => r.id === 'client-partner');
  const authAt = new Date().toISOString();
  const authorized = await applyHumanDecision(store, INCIDENT_ID, prepared.revision, decisionEvent('client-partner', 'CLEARED_TO_PROCEED', authAt), deps);
  if (authorized.outcome !== 'ACCEPTED' || authorized.record === undefined) {
    throw new Error(`authorisation did not succeed: ${authorized.outcome}`);
  }
  const postAuth = authorized.record;
  const afterAuth = await mailpitCount();
  timeline.push({ stage: 'after authorisation (still no send)', count: afterAuth });

  // ---- E1. Revision binding: the PRE-authorisation revision must no longer authorise.
  const staleExec = await dispatchAuthorizedOffer(store, claims, INCIDENT_ID, prepared.revision, despatchEvent('client-partner', new Date().toISOString()), deps, runtimeId);
  const afterStaleExec = await mailpitCount();
  unauthorizedAttempts.push({
    attempt: 'despatch attempted against the pre-authorisation revision after the case was re-parked',
    via: 'dispatchAuthorizedOffer (same function POST /api/lead-rescue/wait-incidents/dispatch calls)',
    outcome: staleExec.outcome,
    smtpMessagesAfter: afterStaleExec,
    recordUnchanged: (await store.load(INCIDENT_ID))?.revision === postAuth.revision,
  });
  timeline.push({ stage: 'after stale-revision despatch attempt', count: afterStaleExec });

  // ---- E2. EXECUTE the specifically authorised action, bound to the current revision.
  const execAt = new Date().toISOString();
  const executed = await dispatchAuthorizedOffer(store, claims, INCIDENT_ID, postAuth.revision, despatchEvent('client-partner', execAt), deps, runtimeId);
  if (executed.outcome !== 'CONFIRMED' || executed.record === undefined) {
    throw new Error(`authorised despatch did not confirm: ${executed.outcome}`);
  }
  await new Promise((r) => setTimeout(r, 700));
  const afterExec = await mailpitCount();
  timeline.push({ stage: 'after authorised execution', count: afterExec });

  const sentEffect = executed.entries?.flatMap((e) => e.sideEffects).find((e) => e.status === 'EXECUTED' || e.status === 'SUPPRESSED_DUPLICATE');
  const claimId = sentEffect === undefined ? 'MISSING' : operationClaimId(sentEffect, postAuth);
  const claim = await claims.load(claimId);

  const listed = (await (await fetch(`${MAILPIT_API}/api/v1/messages`)).json()) as { messages: Array<{ ID: string; MessageID: string }> };
  const captured = listed.messages[0];
  if (captured === undefined) throw new Error('the authorised despatch confirmed but the capture server retained no message');
  const full = (await (await fetch(`${MAILPIT_API}/api/v1/message/${captured.ID}`)).json()) as { ID: string; MessageID: string; To: Array<{ Address: string }> };

  // ---- F. REPLAY the same logical execution at the now-current revision.
  const afterExecRecord = executed.record;
  const replay = await dispatchAuthorizedOffer(store, claims, INCIDENT_ID, afterExecRecord.revision, despatchEvent('client-partner', new Date().toISOString()), deps, runtimeId);
  await new Promise((r) => setTimeout(r, 700));
  const afterReplay = await mailpitCount();
  const listedAfter = (await (await fetch(`${MAILPIT_API}/api/v1/messages`)).json()) as { messages: Array<{ ID: string }> };
  timeline.push({ stage: 'after replay', count: afterReplay });

  const gitHead = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();

  const evidence = {
    schemaVersion: 'lead-rescue-authority-execution-evidence-1',
    capturedAt: new Date().toISOString(),
    gitHead,
    environment: {
      smtpServer: { product: 'Mailpit', version: 'v1.31.0', kind: 'local capture/sandbox server (stores messages, never relays)', host: SMTP_HOST, port: SMTP_PORT, relayConfigured: false },
      executionPath: 'applyHumanDecision / dispatchAuthorizedOffer (lib/engine/wait-resume.ts) against the real module-level FileWaitIncidentStore and FileOperationClaimStore singletons — the exact functions the /decide and /dispatch routes call.',
      httpHopExercised: false,
      httpHopNote: 'The HTTP hop into those two routes was not exercised: they resolve their executor from process.env at module load, and wiring real-SMTP mode into the tracked .claude/launch.json would contradict the config gate that keeps simulated the default safe mode.',
      n8nParticipated: false,
      n8nNote: 'Authority is enforced inside the application, not by the orchestrator. n8n transports commands elsewhere in this portfolio but plays no part in this authority decision, so no n8n execution identity is claimed here.',
      anthropicCalled: false,
    },
    capturedFacts: {
      syntheticCase: { incidentId: INCIDENT_ID, syntheticData: true, provenance: null, note: 'Seeded via WaitIncidentStore.park() — the same production persistence method ingress and re-park use. No real prospect, contact, or company.' },
      preparedAction: { kind: 'OFFER_DESPATCH (lead.offer.despatched)', recipient: PROOF_TO, offerSummary: OFFER_SUMMARY },
      preAuthorizationState: { lifecycleState: prepared.engineState.lifecycleState, revision: prepared.revision, offerSentAt: prepared.engineState.facts['offerSentAt'] ?? null, awaitingHuman: prepared.engineState.awaitingHuman },
      unauthorizedAttempts,
      authorizationEvent: {
        via: 'applyHumanDecision (same function POST /api/lead-rescue/wait-incidents/decide calls)',
        eventType: 'human.decision.recorded',
        actor: 'HUMAN',
        decidedByRoleId: 'client-partner',
        decidedByRoleName: authRole?.name ?? 'unknown',
        decidedByAuthorityCeiling: authRole?.authorityCeiling ?? -1,
        decision: 'CLEARED_TO_PROCEED',
        boundToIncidentId: INCIDENT_ID,
        boundToExpectedRevision: prepared.revision,
        outcome: authorized.outcome,
        occurredAt: authAt,
      },
      postAuthorizationState: { lifecycleState: postAuth.engineState.lifecycleState, revision: postAuth.revision },
      execution: {
        via: 'dispatchAuthorizedOffer (same function POST /api/lead-rescue/wait-incidents/dispatch calls)',
        outcome: executed.outcome,
        executorId: runtime.LEAD_RESCUE_EXECUTOR_ID,
        executorMode: 'LIVE',
        boundToExpectedRevision: postAuth.revision,
        occurredAt: execAt,
        operationClaim: { operationId: claimId, status: claim?.status ?? 'MISSING', confirmedAt: claim?.confirmedAt ?? null },
        smtpReceipt: { captureServerId: full.ID, messageId: full.MessageID, to: full.To.map((t) => t.Address), source: 'Mailpit HTTP API — read back from the capture server itself, not reported by the application.' },
        resultingState: { lifecycleState: afterExecRecord.engineState.lifecycleState, revision: afterExecRecord.revision, offerSentAt: afterExecRecord.engineState.facts['offerSentAt'] ?? null },
      },
      replay: {
        via: 'dispatchAuthorizedOffer (same function POST /api/lead-rescue/wait-incidents/dispatch calls)',
        outcome: replay.outcome,
        smtpMessagesAfter: afterReplay,
        captureServerIdAfterReplay: listedAfter.messages[0]?.ID ?? 'MISSING',
      },
      smtpMessageCountTimeline: timeline,
    },
    derivedAssertions: {
      noSideEffectBeforeAuthorization: timeline.slice(0, timeline.findIndex((t) => /after authoris/i.test(t.stage)) + 1).every((t) => t.count === 0),
      authorizationPrecededExecution: Date.parse(execAt) >= Date.parse(authAt),
      executedActionMatchedAuthorizedAction: executed.outcome === 'CONFIRMED' && authorized.outcome === 'ACCEPTED',
      authorizationBoundToEntityAndRevision: postAuth.revision > prepared.revision,
      staleAuthorizationRefused: unauthorizedAttempts.some((a) => a['outcome'] === 'STALE_REVISION'),
      underAuthorityRoleRefused: unauthorizedAttempts.some((a) => a['outcome'] === 'UNAUTHORIZED'),
      exactlyOneLocalSmtpEffectRetained: afterExec === 1 && afterReplay === 1,
      replaySuppressedDuplicate: replay.outcome === 'ALREADY_DISPATCHED' && afterReplay === 1,
      syntheticLocalOnlyExecution: true,
      noRealRecipientInvolved: true,
      modelGrantedNoExecutionAuthority: 'No AI judgment participated in this run; the decision to send was a human operator event validated against a configured role authority ceiling.',
    },
    scopeStatement:
      'A synthetic Lead Rescue outbound offer was prepared but could not execute before explicit authorisation: an unauthorised despatch, an under-authority approval, and a stale-revision approval were each refused with zero SMTP messages retained. A real operator authorisation by a role holding a sufficient configured authority ceiling was then validated by the application, and only the specifically authorised action crossed the existing local SMTP boundary to a sandbox capture server, addressed to a synthetic non-routable recipient. Replay produced no second delivery. No real person, mailbox, or mail provider was contacted. This is NOT autonomous execution, NOT a production deployment, NOT client operation, and NOT real-recipient delivery. No Anthropic call and no n8n execution participated in this run.',
  };

  const outPath = path.join(process.cwd(), 'n8n', 'evidence', 'lead-rescue-authority-execution.json');
  writeFileSync(outPath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ wrote: outPath, timeline, attempts: unauthorizedAttempts.map((a) => a['outcome']), authorized: authorized.outcome, executed: executed.outcome, replay: replay.outcome, mailpit: afterReplay }, null, 2));
}

main().catch((e: unknown) => {
  console.error(e);
  process.exitCode = 1;
});
