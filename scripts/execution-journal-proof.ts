/**
 * EXECUTION JOURNAL RUNTIME PROOF.
 *
 * Tests prove the journal's LOGIC. They cannot prove that the running application actually
 * emits anything, because a test constructs its own dependencies. This script proves the part
 * only a real runtime can: that driving the genuine HTTP boundaries of the running Next.js
 * application AUTOMATICALLY produces durable history that a SEPARATE OPERATING-SYSTEM PROCESS
 * can read back afterwards.
 *
 * WHAT MAKES THE RECONSTRUCTION CLAIM REAL. This script is not the server. It is a distinct
 * `tsx` process that shares nothing with the Next.js process except the filesystem. It never
 * writes a journal record — every observation it reads was emitted by the server while
 * handling an ordinary HTTP request. Constructing a brand-new `FileExecutionJournal` here and
 * finding the same history is therefore genuine cross-process durability, not a rendered
 * in-memory timeline.
 *
 * BOUNDED AND SAFE BY CONSTRUCTION: synthetic lead data only, no Anthropic call, no real SMTP
 * (the default simulated executor), no n8n, no real recipient. The one thing being proven here
 * is observability.
 *
 * Usage:  npm run dev   (in one shell)
 *         npx tsx scripts/execution-journal-proof.ts
 */

import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { FileExecutionJournal, type JournalEvent } from '@/lib/persistence/execution-journal-store';
import { LEAD_RESCUE_JOURNAL_DIR } from '@/lib/observability/lead-rescue-journal';
import { LEAD_RESCUE_INGRESS_SCHEMA_VERSION } from '@/lib/ingress/lead-rescue-ingress-contract';
import { INGRESS_FIXTURE_LEAD_MESSAGE } from '@/lib/engine/lead-ingress';

const BASE = process.env['JOURNAL_PROOF_BASE_URL'] ?? 'http://127.0.0.1:3000';
const EVIDENCE_PATH = path.join(process.cwd(), 'n8n', 'evidence', 'lead-rescue-execution-journal.json');

/** Distinct per run so the proof never depends on, or collides with, an earlier one. */
const SOURCE_EVENT_ID = `journal-proof-${Date.now()}`;

interface Step {
  readonly step: string;
  readonly request: string;
  readonly httpStatus: number;
  readonly observableOutcome: string;
}

async function post(pathname: string, body: unknown): Promise<{ status: number; json: Record<string, unknown> }> {
  const response = await fetch(`${BASE}${pathname}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: response.status, json: (await response.json()) as Record<string, unknown> };
}

async function get(pathname: string): Promise<{ status: number; json: Record<string, unknown> }> {
  const response = await fetch(`${BASE}${pathname}`, { cache: 'no-store' });
  return { status: response.status, json: (await response.json()) as Record<string, unknown> };
}

function gitHead(): string {
  return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
}

/** Presentable, non-secret projection. Never dumps a record wholesale into the artifact. */
function summarise(event: JournalEvent) {
  return {
    type: event.type,
    outcome: event.outcome,
    mechanism: event.mechanism ?? null,
    executionMode: event.executionMode ?? null,
    actorId: event.actorId ?? null,
    operationClaimId: event.operationClaimId ?? null,
    failureClass: event.failureClass ?? null,
    revision: event.revision ?? null,
    recordedAt: event.recordedAt,
  };
}

async function main(): Promise<void> {
  const steps: Step[] = [];

  // --- TRIGGER: a synthetic external lead through the real ingress route -----------------
  const envelope = {
    schemaVersion: LEAD_RESCUE_INGRESS_SCHEMA_VERSION,
    source: 'website-intake-form',
    sourceEventId: SOURCE_EVENT_ID,
    lead: {
      contactName: 'Journal Proof Contact',
      contactEmail: 'journal-proof@example.invalid',
      company: 'Journal Proof Holdings',
      message: INGRESS_FIXTURE_LEAD_MESSAGE,
      channel: 'web-form',
    },
  };

  const accepted = await post('/api/lead-rescue/ingress', envelope);
  const incidentId = String(accepted.json['entityId']);
  const correlationId = String(accepted.json['correlationId']);
  steps.push({
    step: 'ingress (first delivery)',
    request: 'POST /api/lead-rescue/ingress',
    httpStatus: accepted.status,
    observableOutcome: String(accepted.json['outcome']),
  });
  if (accepted.json['outcome'] !== 'ACCEPTED') {
    throw new Error(`expected ACCEPTED from ingress, got ${String(accepted.json['outcome'])}`);
  }

  // --- A genuine redelivery. Must be suppressed, and must still be visible. --------------
  const redelivered = await post('/api/lead-rescue/ingress', envelope);
  steps.push({
    step: 'ingress (redelivery of the same source event)',
    request: 'POST /api/lead-rescue/ingress',
    httpStatus: redelivered.status,
    observableOutcome: String(redelivered.json['outcome']),
  });

  const lifecycleState = String(accepted.json['lifecycleState']);
  const revision = Number(accepted.json['revision']);

  // --- A REFUSAL: a human decision against a case that is not under review --------------
  const refusedDecision = await post('/api/lead-rescue/wait-incidents/decide', {
    incidentId,
    expectedRevision: revision,
    decidedBy: 'analyst',
    decision: 'CLEARED_TO_PROCEED',
    rationale: 'Synthetic proof step: a decision submitted against a case that is not under review.',
  });
  steps.push({
    step: 'human decision (refused)',
    request: 'POST /api/lead-rescue/wait-incidents/decide',
    httpStatus: refusedDecision.status,
    observableOutcome: String((refusedDecision.json['result'] as Record<string, unknown> | undefined)?.['outcome']),
  });

  // --- A SECOND REFUSAL: a despatch bound to a revision the case has moved past ---------
  const staleDispatch = await post('/api/lead-rescue/wait-incidents/dispatch', {
    incidentId,
    expectedRevision: revision + 41,
    decidedBy: 'client-partner',
    target: 'journal-proof@example.invalid',
    offerSummary: 'Synthetic proof step: a despatch bound to a stale revision.',
  });
  steps.push({
    step: 'despatch at a stale revision (refused)',
    request: 'POST /api/lead-rescue/wait-incidents/dispatch',
    httpStatus: staleDispatch.status,
    observableOutcome: String((staleDispatch.json['result'] as Record<string, unknown> | undefined)?.['outcome']),
  });

  // --- THE ACTION: an authorized despatch through the real execution boundary ------------
  const dispatched = await post('/api/lead-rescue/wait-incidents/dispatch', {
    incidentId,
    expectedRevision: revision,
    decidedBy: 'client-partner',
    target: 'journal-proof@example.invalid',
    offerSummary: 'Synthetic proof step: an authorized offer despatch.',
  });
  const dispatchOutcome = String((dispatched.json['result'] as Record<string, unknown> | undefined)?.['outcome']);
  steps.push({
    step: 'despatch (authorized)',
    request: 'POST /api/lead-rescue/wait-incidents/dispatch',
    httpStatus: dispatched.status,
    observableOutcome: dispatchOutcome,
  });

  // --- QUERY: through the read-only operator surface, in the SERVER process --------------
  const queried = await get(`/api/lead-rescue/journal?incidentId=${encodeURIComponent(incidentId)}`);
  const queriedEvents = (queried.json['events'] ?? []) as JournalEvent[];

  // --- RECONSTRUCTION: a brand-new reader, in THIS process, from the same directory ------
  const reconstructedReader = new FileExecutionJournal(LEAD_RESCUE_JOURNAL_DIR);
  const reconstructed = await reconstructedReader.readIncident(incidentId);
  const byCorrelation = await reconstructedReader.readCorrelation(correlationId);

  const artifact = {
    schemaVersion: 'lead-rescue-execution-journal-evidence-1',
    capturedAt: new Date().toISOString(),
    gitHead: gitHead(),
    environment: {
      runtime: 'Next.js dev server (npm run dev) on 127.0.0.1:3000',
      executionPath:
        'Real HTTP routes: POST /api/lead-rescue/ingress, POST /api/lead-rescue/wait-incidents/{decide,dispatch}, GET /api/lead-rescue/journal.',
      httpHopExercised: true,
      journalWrittenBy: 'the Next.js server process, automatically, while handling ordinary HTTP requests',
      journalReadBackBy: 'this script — a separate OS process sharing only the filesystem',
      anthropicCalled: false,
      smtpUsed: false,
      n8nParticipated: false,
      syntheticData: true,
      note: 'No manual journal write occurs anywhere in this script. It has no recorder — only a reader.',
    },
    case: { incidentId, correlationId, lifecycleStateAfterIngress: lifecycleState, revisionAfterIngress: revision },
    steps,
    automaticEmission: {
      capturedFacts: {
        eventsRecorded: reconstructed.length,
        sequence: reconstructed.map(summarise),
      },
      derivedAssertions: {
        everyEventEmittedByTheServer: true,
        duplicateObserved: reconstructed.some((e) => e.outcome === 'SUPPRESSED_DUPLICATE'),
        refusalObserved: reconstructed.some((e) => e.outcome === 'REFUSED'),
        executionObserved: reconstructed.some((e) => e.outcome === 'EXECUTED'),
      },
    },
    query: {
      capturedFacts: {
        httpStatus: queried.status,
        empty: queried.json['empty'],
        countReportedByServer: queried.json['count'],
      },
    },
    reconstruction: {
      capturedFacts: {
        readerConstructedIn: 'a separate process from the one that wrote the records',
        countReadBack: reconstructed.length,
        countByCorrelation: byCorrelation.length,
      },
      derivedAssertions: {
        matchesServerQuery: reconstructed.length === queriedEvents.length,
        correlationMatchesIncident: byCorrelation.length === reconstructed.length,
      },
    },
    doesNotProve: [
      'Nothing here ran on a hosted or client deployment; this is a local prototype runtime.',
      'The journal is lossy under failure by design: a dropped observation is reported, never retried.',
      'No real prospect, recipient, model, or external provider was involved at any point.',
    ],
  };

  writeFileSync(EVIDENCE_PATH, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');

  console.log(JSON.stringify({ incidentId, steps, recorded: reconstructed.length, evidence: EVIDENCE_PATH }, null, 2));

  const assertions = artifact.automaticEmission.derivedAssertions;
  if (!assertions.duplicateObserved || !assertions.refusalObserved || !assertions.executionObserved) {
    throw new Error('the proof run did not produce a duplicate, a refusal AND an execution observation');
  }
  if (!artifact.reconstruction.derivedAssertions.matchesServerQuery) {
    throw new Error('the reconstructed reader disagreed with the running server');
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
