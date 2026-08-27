/**
 * OBSERVATION INTEGRITY + ABNORMAL DELIVERY RUNTIME PROOF.
 *
 * `scripts/operational-view-proof.ts` proved the runtime can summarise many executions. It left
 * three things unproven, and this script exists for exactly those three:
 *
 *   1. the journal admits it can drop an observation, and nothing measured whether it had;
 *   2. abnormal conditions were viewable but never RAISED;
 *   3. the retained capture contained zero `FAILED_BEFORE_EFFECT` and zero `OUTCOME_UNKNOWN`
 *      at the dispatch boundary, so both semantics were test-proven only.
 *
 * NOTHING HERE IS INSERTED INTO THE ARTIFACT BY HAND. Every outcome below is produced by
 * driving the real HTTP routes of a real Next.js server against a real, deliberately faulty
 * SMTP server over a real TCP socket, and then read back out of the running application through
 * `GET /api/lead-rescue/operations`. The script owns the faults; the application owns every
 * classification.
 *
 * THE FIVE CASES, and why each one is the honest way to produce its outcome:
 *
 *   A  delivered      the ordinary path against the same server, so a failure elsewhere cannot
 *                     be dismissed as the harness being broken.
 *   B  refused        550 at RCPT TO. The receiving server independently records that no body
 *                     ever reached it and nothing was stored — confirmed non-execution, checked
 *                     against something other than the sender's own opinion.
 *   D  vanished       the body is received in full and stored, then the socket dies before the
 *                     acceptance reply. The receiver HAS the message and the sender cannot know.
 *   C  crashed        the body is received in full, the connection is held open, and the server
 *                     process is killed while it is inside the send with its durable claim
 *                     already taken. A genuine crash in a genuine window — then a fresh process
 *                     is asked to dispatch again, and must refuse rather than guess.
 *   E  unobserved     the journal directory is made unwritable for exactly one ingress, so the
 *                     runtime genuinely loses an observation while the business work succeeds.
 *
 * SAFETY, BY CONSTRUCTION: the SMTP server binds to 127.0.0.1, has no relay and no upstream,
 * and every recipient is on a reserved `.invalid` domain. No Anthropic call, no live provider,
 * no n8n, no real recipient. Expected external spend: $0. Outbound blast radius: none.
 *
 * Usage:  npx tsx scripts/observation-integrity-proof.ts
 *
 * It starts and stops its own server, so NO OTHER dev server for this project may be running:
 * two Next dev processes sharing one `.next` directory collide and neither becomes ready. That
 * is also why it must not be pointed at a shared instance — the fault configuration has to be
 * the one this script's own server resolved at boot, or the capture proves nothing about it.
 */

import { writeFileSync, chmodSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { SmtpFaultServer, type FaultMode } from './support/smtp-fault-server';
import { LEAD_RESCUE_INGRESS_SCHEMA_VERSION } from '@/lib/ingress/lead-rescue-ingress-contract';
import { INGRESS_FIXTURE_LEAD_MESSAGE } from '@/lib/engine/lead-ingress';

const APP_PORT = Number(process.env['OBSERVATION_PROOF_PORT'] ?? 3011);
const BASE = `http://127.0.0.1:${APP_PORT}`;
const EVIDENCE_PATH = path.join(process.cwd(), 'n8n', 'evidence', 'lead-rescue-observation-integrity.json');
const JOURNAL_DIR = path.join(process.cwd(), '.data', 'lead-rescue-execution-journal');
const INTENT_DIR = path.join(process.cwd(), '.data', 'lead-rescue-observation-intents');
const RUN = `observation-proof-${Date.now()}`;
const PROOF_ADDRESS = 'observation-integrity-proof@example.invalid';

/** One entry per connection the application will open, consumed in order. */
const FAULT_SCRIPT: readonly FaultMode[] = ['ACCEPT', 'REFUSE_ENVELOPE', 'ACCEPT_THEN_VANISH', 'HANG_AFTER_DATA'];

interface Step {
  readonly step: string;
  readonly request: string;
  readonly httpStatus: number | null;
  readonly observableOutcome: string;
}

const steps: Step[] = [];
const faults = new SmtpFaultServer(FAULT_SCRIPT);
let server: ChildProcess | undefined;

// ---------------------------------------------------------------------------
// The application under test — started and stopped by this script so the fault
// configuration is genuinely the one the server process resolved at boot.
// ---------------------------------------------------------------------------

async function startServer(smtpPort: number): Promise<void> {
  server = spawn('npx', ['next', 'dev', '--port', String(APP_PORT)], {
    cwd: process.cwd(),
    stdio: 'ignore',
    // Its own process group, so the whole tree (npx, then the Next server it spawns) can be
    // killed together. Killing only the wrapper would leave the real server holding the port,
    // and the "a genuinely fresh process recovered this" claim would be false.
    detached: true,
    env: {
      ...process.env,
      LEAD_RESCUE_SIDE_EFFECT_EXECUTOR: 'smtp',
      LEAD_RESCUE_SMTP_HOST: '127.0.0.1',
      LEAD_RESCUE_SMTP_PORT: String(smtpPort),
      LEAD_RESCUE_SMTP_FROM: PROOF_ADDRESS,
      LEAD_RESCUE_SMTP_TO: PROOF_ADDRESS,
      // Explicitly NOT set: the model provider and the live-evaluation gate. This proof must
      // never be able to reach a billable path, so neither switch is present at all.
      LEAD_RESCUE_DECISION_PROVIDER: '',
      RUN_LIVE_AI_EVAL: '',
    },
  });

  const deadline = Date.now() + 90_000;
  for (;;) {
    if (Date.now() > deadline) throw new Error('the application did not become ready within 90s');
    try {
      const response = await fetch(`${BASE}/api/lead-rescue/operations`, { cache: 'no-store' });
      if (response.ok) return;
    } catch {
      /* not listening yet */
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

function killServer(signal: NodeJS.Signals = 'SIGTERM'): void {
  if (server?.pid === undefined) return;
  try {
    // The dev server runs a child; kill the group so nothing is left holding the port.
    process.kill(-server.pid, signal);
  } catch {
    try {
      server.kill(signal);
    } catch {
      /* already gone */
    }
  }
}

async function stopServer(signal: NodeJS.Signals = 'SIGTERM'): Promise<void> {
  if (server === undefined) return;
  const exited = new Promise<void>((resolve) => server?.once('exit', () => resolve()));
  killServer(signal);
  await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 8_000))]);
  server = undefined;
  // The port must be genuinely free before the next boot, or the restart silently reuses the
  // old process and the "fresh runtime" claim would be false.
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      await fetch(`${BASE}/api/lead-rescue/operations`, { cache: 'no-store' });
    } catch {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

// ---------------------------------------------------------------------------

async function post(pathname: string, body: unknown, authorization?: string) {
  const response = await fetch(`${BASE}${pathname}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(authorization === undefined ? {} : { authorization }) },
    body: JSON.stringify(body),
  });
  return { status: response.status, json: (await response.json()) as Record<string, unknown> };
}

async function get(pathname: string) {
  const response = await fetch(`${BASE}${pathname}`, { cache: 'no-store' });
  return { status: response.status, json: (await response.json()) as Record<string, unknown> };
}

async function credentialFor(principalId: string): Promise<string> {
  const issued = await post('/api/lead-rescue/operator-session', { principalId });
  const token = issued.json['token'];
  if (typeof token !== 'string') {
    throw new Error(`could not obtain an operator credential for "${principalId}" (status ${issued.status})`);
  }
  return `Bearer ${token}`;
}

async function ingest(suffix: string, label: string) {
  const envelope = {
    schemaVersion: LEAD_RESCUE_INGRESS_SCHEMA_VERSION,
    source: 'website-intake-form',
    sourceEventId: `${RUN}-${suffix}`,
    lead: {
      contactName: `Observation Proof ${suffix.toUpperCase()}`,
      contactEmail: `observation-proof-${suffix}@example.invalid`,
      company: `Observation Proof ${suffix.toUpperCase()}`,
      message: INGRESS_FIXTURE_LEAD_MESSAGE,
      channel: 'web-form',
    },
  };
  const accepted = await post('/api/lead-rescue/ingress', envelope);
  steps.push({
    step: label,
    request: 'POST /api/lead-rescue/ingress',
    httpStatus: accepted.status,
    observableOutcome: String(accepted.json['outcome']),
  });
  return { incidentId: String(accepted.json['entityId']), revision: Number(accepted.json['revision']) };
}

async function dispatch(incidentId: string, revision: number, credential: string, label: string) {
  const result = await post(
    '/api/lead-rescue/wait-incidents/dispatch',
    {
      incidentId,
      expectedRevision: revision,
      target: PROOF_ADDRESS,
      offerSummary: 'Synthetic proof step: an authorized offer despatch across a real socket.',
    },
    credential,
  );
  steps.push({
    step: label,
    request: 'POST /api/lead-rescue/wait-incidents/dispatch',
    httpStatus: result.status,
    observableOutcome: String((result.json['result'] as Record<string, unknown> | undefined)?.['outcome'] ?? result.json['error']),
  });
  return result;
}

/** The journal records for one case, read through the real read-only operator route. */
async function journalFor(incidentId: string): Promise<readonly Record<string, unknown>[]> {
  const response = await get(`/api/lead-rescue/journal?incidentId=${encodeURIComponent(incidentId)}`);
  return (response.json['events'] ?? []) as readonly Record<string, unknown>[];
}

function dispatchRecord(events: readonly Record<string, unknown>[], outcome: string) {
  return events.find((event) => event['type'] === 'DISPATCH_ATTEMPTED' && event['outcome'] === outcome);
}

function gitHead(): string {
  return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
}

// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const smtpPort = await faults.listen();
  // Both directories must exist before the fault below, so that making one unwritable is a
  // permissions fault on a real ledger rather than an absent-directory accident.
  mkdirSync(JOURNAL_DIR, { recursive: true });
  mkdirSync(INTENT_DIR, { recursive: true });

  await startServer(smtpPort);
  const partner = await credentialFor('op-marisol-adeyemi');

  // --- A: the ordinary path, against the same server that will misbehave next ---------------
  const caseA = await ingest('delivered', 'case A · ingress');
  await dispatch(caseA.incidentId, caseA.revision, partner, 'case A · despatch (server accepts and acknowledges)');

  // --- B: the receiver refuses the envelope. Confirmed non-execution. ------------------------
  const caseB = await ingest('failed', 'case B · ingress');
  await dispatch(caseB.incidentId, caseB.revision, partner, 'case B · despatch (server refuses the envelope: 550 at RCPT)');

  // --- D: the receiver takes the body and dies before acknowledging. -------------------------
  const caseD = await ingest('vanished', 'case D · ingress');
  await dispatch(caseD.incidentId, caseD.revision, partner, 'case D · despatch (server stores the body, then vanishes)');

  // --- C: a real crash inside the send window, with the claim already taken -------------------
  const caseC = await ingest('crashed', 'case C · ingress');
  const hanging = dispatch(
    caseC.incidentId,
    caseC.revision,
    partner,
    'case C · despatch (server holds the connection; the application is killed mid-send)',
  ).catch(() => undefined);

  // Kill only once the server genuinely has the whole body: before that point the claim window
  // this case exists to demonstrate has not been entered yet.
  await faults.bodyReceived(4);
  killServer('SIGKILL');
  await hanging;
  await stopServer('SIGKILL');

  const connectionsBeforeRecovery = faults.connectionCount;

  // --- Recovery: a genuinely fresh process, asked to do the same thing again -----------------
  await startServer(smtpPort);
  const partnerAfterRestart = await credentialFor('op-marisol-adeyemi');
  await dispatch(
    caseC.incidentId,
    caseC.revision,
    partnerAfterRestart,
    'case C · despatch retried by a freshly started process (must refuse to guess)',
  );
  const connectionsAfterRecovery = faults.connectionCount;

  // --- E: the runtime genuinely loses an observation while business work succeeds -------------
  chmodSync(JOURNAL_DIR, 0o555);
  let caseE: { incidentId: string; revision: number };
  try {
    caseE = await ingest('unobserved', 'case E · ingress while the journal directory is unwritable');
  } finally {
    chmodSync(JOURNAL_DIR, 0o755);
  }

  // --- THE AGGREGATE, read back through the real read-only route ------------------------------
  const aggregate = await get('/api/lead-rescue/operations');
  if (aggregate.status !== 200) {
    throw new Error(`the aggregate route returned ${aggregate.status}: ${JSON.stringify(aggregate.json)}`);
  }
  const view = aggregate.json['view'] as Record<string, unknown>;
  const integrity = aggregate.json['integrity'] as Record<string, unknown>;
  const alerts = (aggregate.json['alerts'] ?? []) as readonly Record<string, unknown>[];
  const dispatchSummary = view['dispatch'] as Record<string, unknown>;

  const [journalA, journalB, journalC, journalD, journalE] = await Promise.all([
    journalFor(caseA.incidentId),
    journalFor(caseB.incidentId),
    journalFor(caseC.incidentId),
    journalFor(caseD.incidentId),
    journalFor(caseE.incidentId),
  ]);

  const losses = (integrity['losses'] ?? []) as readonly Record<string, unknown>[];
  const lossForCaseE = losses.find((loss) => loss['incidentId'] === caseE.incidentId);

  /**
   * THE POINT OF HAVING AN INDEPENDENT OBSERVER AT ALL. For every despatch the application
   * classified as confirmed non-execution, ask the receiver whether it in fact holds the
   * message. Agreement corroborates the classification; disagreement is a finding, and it is
   * recorded here rather than smoothed over — a capture that only ever confirmed what the
   * application already believed would not be evidence of anything.
   *
   * The pairing is exact rather than inferred: this script decides which fault each connection
   * gets, in order, so connection N belongs to a known case.
   */
  const transcript = faults.transcript();
  const claimedNonExecution: readonly { readonly label: string; readonly incidentId: string; readonly connection: number }[] = [
    { label: 'case B (envelope refused)', incidentId: caseB.incidentId, connection: 2 },
    { label: 'case D (body stored, then the socket died before the acknowledgement)', incidentId: caseD.incidentId, connection: 3 },
  ];

  const classificationChecks = claimedNonExecution.map((subject) => {
    const events = subject.incidentId === caseB.incidentId ? journalB : journalD;
    const nonExecutionRecord = dispatchRecord(events, 'FAILED_BEFORE_EFFECT');
    const uncertainRecord = dispatchRecord(events, 'OUTCOME_UNKNOWN');
    const receiver = transcript.find((entry) => entry.connection === subject.connection);
    const receiverHoldsTheMessage = receiver?.storedMessageId !== null && receiver?.storedMessageId !== undefined;
    const applicationClaimedNonExecution = nonExecutionRecord !== undefined;
    const record = nonExecutionRecord ?? uncertainRecord;

    /**
     * THREE outcomes, not two. The original version of this check knew only "claimed
     * non-execution" and "did not", which was sufficient while the executor always claimed it.
     * Once the classifier was corrected, the interesting case became the third one: the
     * application looking at a message the receiver genuinely holds and DECLINING to say it
     * was never sent. Collapsing that into `CORROBORATED` would have quietly reported the fix
     * as though nothing had been tested.
     */
    const agreement = applicationClaimedNonExecution
      ? receiverHoldsTheMessage
        ? 'CONTRADICTED'
        : 'CORROBORATED'
      : receiverHoldsTheMessage
        ? 'DECLINED_TO_CLAIM'
        : 'CORROBORATED';

    const finding = {
      CONTRADICTED:
        'The application recorded confirmed non-execution while the receiver genuinely holds the message. The journal is a faithful record of what the executor reported; what is unsound is the executor classifying a post-DATA socket failure as FAILED_BEFORE_EFFECT.',
      CORROBORATED:
        'The receiver independently confirms it received no message body and stored nothing, so the application’s confirmed-non-execution classification is corroborated by something other than itself.',
      DECLINED_TO_CLAIM:
        'The receiver genuinely holds the message, and the application did NOT claim non-execution: it recorded OUTCOME_UNKNOWN and parked the case for a person rather than authorising a retry that would have delivered a second copy. This is the corrected execution-boundary classification, observed against a real socket rather than asserted by a unit test.',
    }[agreement];

    return {
      subject: subject.label,
      incidentId: subject.incidentId,
      applicationOutcome: applicationClaimedNonExecution
        ? 'FAILED_BEFORE_EFFECT'
        : uncertainRecord !== undefined
          ? 'OUTCOME_UNKNOWN'
          : 'NOT_RECORDED',
      applicationDetail: record?.['detail'] ?? null,
      receiverBodyBytesReceived: receiver?.bodyBytesReceived ?? null,
      receiverStoredMessageId: receiver?.storedMessageId ?? null,
      receiverAcknowledgedToClient: receiver?.acknowledgedToClient ?? null,
      agreement,
      finding,
    };
  });

  const artifact = {
    schemaVersion: 'lead-rescue-observation-integrity-evidence-1',
    capturedAt: new Date().toISOString(),
    gitHead: gitHead(),
    environment: {
      runtime: `Next.js dev server started BY THIS SCRIPT on 127.0.0.1:${APP_PORT}, so the fault configuration is the one the server process itself resolved at boot`,
      executionPath:
        'Real HTTP routes: POST /api/lead-rescue/ingress, POST /api/lead-rescue/wait-incidents/dispatch, GET /api/lead-rescue/journal, GET /api/lead-rescue/operations.',
      httpHopExercised: true,
      everyOutcomeClassifiedByTheApplication: true,
      smtpServer: {
        kind: 'purpose-built local SMTP fault server (scripts/support/smtp-fault-server.ts)',
        boundTo: `127.0.0.1:${smtpPort}`,
        relayConfigured: false,
        thirdPartyProduct: false,
        note: 'A real SMTP conversation over a real TCP socket, scripted to fail in three specific ways. It is NOT a third-party product; n8n/evidence/lead-rescue-smtp-execution.json remains the capture where a real Mailpit instance issued the receipt.',
      },
      anthropicCalled: false,
      liveModelProviderSelected: false,
      n8nParticipated: false,
      syntheticData: true,
    },
    casesCreatedByThisRun: {
      caseADelivered: caseA.incidentId,
      caseBFailedBeforeEffect: caseB.incidentId,
      caseCCrashedMidSend: caseC.incidentId,
      caseDVanishedAfterData: caseD.incidentId,
      caseEUnobserved: caseE.incidentId,
    },
    steps,
    independentReceiverTranscript: {
      note: 'What the receiving server itself recorded, independently of what the application concluded.',
      connections: faults.transcript(),
      storedMessageCount: faults.storedMessageCount,
      connectionsBeforeRecovery,
      connectionsAfterRecovery,
    },
    abnormalDeliveryEvidence: {
      failedBeforeEffect: {
        incidentId: caseB.incidentId,
        journalRecord: dispatchRecord(journalB, 'FAILED_BEFORE_EFFECT') ?? null,
        independentNonExecution:
          faults.transcript().find((entry) => entry.mode === 'REFUSE_ENVELOPE') ?? null,
      },
      vanishedAfterData: {
        incidentId: caseD.incidentId,
        journalRecords: journalD.filter((event) => event['type'] === 'DISPATCH_ATTEMPTED'),
        independentReceiverState:
          faults.transcript().find((entry) => entry.mode === 'ACCEPT_THEN_VANISH') ?? null,
      },
      outcomeUnknownAfterCrash: {
        incidentId: caseC.incidentId,
        journalRecord: dispatchRecord(journalC, 'OUTCOME_UNKNOWN') ?? null,
        independentReceiverState: faults.transcript().find((entry) => entry.mode === 'HANG_AFTER_DATA') ?? null,
        note: 'The receiver holds the body and never acknowledged it; the sending process was killed with its durable claim taken. A freshly started process then refused to re-send rather than guess.',
      },
      delivered: {
        incidentId: caseA.incidentId,
        journalRecord: dispatchRecord(journalA, 'EXECUTED') ?? null,
        // The success case carries its receiver record too, so the two failures below are
        // compared against a card of the same shape rather than against an empty one.
        independentReceiverState: transcript.find((entry) => entry.mode === 'ACCEPT') ?? null,
      },
    },
    observationDegradationEvidence: {
      incidentId: caseE.incidentId,
      fault: 'the journal directory was made unwritable (0555) for exactly one ingress, then restored',
      businessWorkSucceeded: true,
      journalRecordsForThatCase: journalE,
      integrityLoss: lossForCaseE ?? null,
    },
    executionClassificationCheckedAgainstTheReceiver: classificationChecks,
    integrity,
    alerts,
    view,
    derivedAssertions: {
      realFailedBeforeEffectObserved: Number(dispatchSummary['failedBeforeEffect']) > 0,
      realOutcomeUnknownObserved: Number(dispatchSummary['outcomeUnknown']) > 0,
      nonExecutionCorroboratedByTheReceiverForAtLeastOneCase: classificationChecks.some(
        (check) => check.agreement === 'CORROBORATED',
      ),
      observationLossMeasuredNotAssumed: integrity['kind'] === 'KNOWN_LOSS' && lossForCaseE !== undefined,
      businessWorkSurvivedTheObservationLoss: journalE.length === 0 && caseE.revision >= 1,
      alertsRaisedForAbnormalConditions: alerts.length > 0,
      atMostOncePreservedAcrossTheCrash: connectionsAfterRecovery === connectionsBeforeRecovery,
      receiverConfirmedNonExecutionForTheRefusedCase:
        (faults.transcript().find((entry) => entry.mode === 'REFUSE_ENVELOPE')?.bodyBytesReceived ?? -1) === 0,
    },
    doesNotProve: [
      'Nothing here ran on a hosted or client deployment; this is a local prototype runtime.',
      'The receiving SMTP server is purpose-built for this proof, not a third-party product. It is an independent observer of the socket, not independent evidence of a vendor contract.',
      'An observation whose write-ahead marker ALSO failed to be written remains invisible. The clean answer is NO_KNOWN_LOSS and never "complete".',
      'The UNRESOLVED_INTENT loss kind (a process that died between the marker and the journal write) is proven by test, not by this capture.',
      'Where `executionClassificationCheckedAgainstTheReceiver` records CONTRADICTED, the alert derived from that record repeats the executor’s claim. Alerts are a faithful function of retained observations and cannot be more accurate than what the execution boundary reported.',
      'No real prospect, recipient, model, or external provider was involved at any point.',
    ],
  };

  writeFileSync(EVIDENCE_PATH, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');

  const failures = Object.entries(artifact.derivedAssertions).filter(([, passed]) => !passed);
  console.log(
    JSON.stringify(
      {
        integrityKind: integrity['kind'],
        alerts: alerts.map((a) => `${String(a['severity'])} ${String(a['condition'])} ${String(a['status'])}`),
        dispatch: dispatchSummary,
        receiverConnections: faults.connectionCount,
        receiverStoredMessages: faults.storedMessageCount,
        evidence: EVIDENCE_PATH,
        failedAssertions: failures.map(([name]) => name),
      },
      null,
      2,
    ),
  );
  if (failures.length > 0) {
    throw new Error(`the capture did not establish: ${failures.map(([name]) => name).join(', ')}`);
  }
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (existsSync(JOURNAL_DIR)) chmodSync(JOURNAL_DIR, 0o755);
    await stopServer('SIGKILL');
    await faults.close();
    // tsx keeps the process alive while the listener lingers; nothing below needs it.
    rmSync(path.join(process.cwd(), '.next', 'dev-proof-marker'), { force: true });
  });
