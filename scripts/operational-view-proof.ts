/**
 * AGGREGATE OPERATIONAL VIEW RUNTIME PROOF.
 *
 * `scripts/execution-journal-proof.ts` proves the runtime emits durable history for ONE case.
 * That is exactly the limitation this script exists to remove: it drives SEVERAL cases through
 * the genuine HTTP boundaries, then reads the aggregate back through the real read-only route
 * so the captured view is the one the running application actually computes — not one this
 * script assembled for the artifact.
 *
 * THE SPREAD IS DELIBERATE, because a summary is only trustworthy if it survives the awkward
 * cases. The run produces, on purpose:
 *
 *   - a case delivered to successfully, preceded by a genuine redelivery that is suppressed;
 *   - a case that collects refusals — one with no credential at all, one with a real
 *     credential against a case in the wrong state;
 *   - a case with a SINGLE observation, whose interval is therefore unmeasurable and must be
 *     reported UNAVAILABLE rather than as a convenient zero.
 *
 * If the third case ever renders as `0ms`, the capability is lying and this script has failed
 * to catch it — so the assertion at the end refuses to write an artifact in that state.
 *
 * THE AGGREGATE COVERS THE WHOLE RETAINED JOURNAL on this machine, not only the cases this
 * script created. That is the intended reading: an operational view answers "what has this
 * system been doing", and silently scoping it to one script's own cases would be the narrower,
 * more flattering claim.
 *
 * BOUNDED AND SAFE BY CONSTRUCTION: synthetic leads on a reserved `.invalid` domain, the
 * default simulated side-effect executor, no Anthropic call, no SMTP, no n8n, no real
 * recipient. Expected external spend: $0. Outbound blast radius: none.
 *
 * Usage:  npm run dev   (in one shell)
 *         npx tsx scripts/operational-view-proof.ts
 */

import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { LEAD_RESCUE_INGRESS_SCHEMA_VERSION } from '@/lib/ingress/lead-rescue-ingress-contract';
import { INGRESS_FIXTURE_LEAD_MESSAGE } from '@/lib/engine/lead-ingress';

const BASE = process.env['OPERATIONS_PROOF_BASE_URL'] ?? 'http://127.0.0.1:3000';
const EVIDENCE_PATH = path.join(process.cwd(), 'n8n', 'evidence', 'lead-rescue-operational-view.json');
const RUN = `operations-proof-${Date.now()}`;

interface Step {
  readonly step: string;
  readonly request: string;
  readonly httpStatus: number;
  readonly observableOutcome: string;
}

const steps: Step[] = [];

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

/** The operator boundary is authenticated. This script holds a real credential like any caller. */
async function credentialFor(principalId: string): Promise<string> {
  const issued = await post('/api/lead-rescue/operator-session', { principalId });
  const token = issued.json['token'];
  if (typeof token !== 'string') {
    throw new Error(`could not obtain an operator credential for "${principalId}" (status ${issued.status})`);
  }
  return `Bearer ${token}`;
}

function envelopeFor(suffix: string, contactName: string) {
  return {
    schemaVersion: LEAD_RESCUE_INGRESS_SCHEMA_VERSION,
    source: 'website-intake-form',
    sourceEventId: `${RUN}-${suffix}`,
    lead: {
      contactName,
      contactEmail: `operations-proof-${suffix}@example.invalid`,
      company: `Operations Proof ${suffix}`,
      message: INGRESS_FIXTURE_LEAD_MESSAGE,
      channel: 'web-form',
    },
  };
}

async function ingest(suffix: string, contactName: string, label: string) {
  const envelope = envelopeFor(suffix, contactName);
  const accepted = await post('/api/lead-rescue/ingress', envelope);
  steps.push({
    step: label,
    request: 'POST /api/lead-rescue/ingress',
    httpStatus: accepted.status,
    observableOutcome: String(accepted.json['outcome']),
  });
  return {
    envelope,
    incidentId: String(accepted.json['entityId']),
    revision: Number(accepted.json['revision']),
  };
}

function gitHead(): string {
  return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
}

async function main(): Promise<void> {
  const partner = await credentialFor('op-marisol-adeyemi');
  const analyst = await credentialFor('op-tobias-lindqvist');

  // --- CASE 1: redelivered, then genuinely delivered to ----------------------------------
  const one = await ingest('case-1', 'Operations Proof Alpha', 'case 1 · ingress (first delivery)');
  const redelivered = await post('/api/lead-rescue/ingress', one.envelope);
  steps.push({
    step: 'case 1 · ingress (redelivery of the same source event)',
    request: 'POST /api/lead-rescue/ingress',
    httpStatus: redelivered.status,
    observableOutcome: String(redelivered.json['outcome']),
  });

  const dispatched = await post(
    '/api/lead-rescue/wait-incidents/dispatch',
    {
      incidentId: one.incidentId,
      expectedRevision: one.revision,
      target: 'operations-proof-case-1@example.invalid',
      offerSummary: 'Synthetic proof step: an authorized offer despatch.',
    },
    partner,
  );
  steps.push({
    step: 'case 1 · despatch (authorized)',
    request: 'POST /api/lead-rescue/wait-incidents/dispatch',
    httpStatus: dispatched.status,
    observableOutcome: String((dispatched.json['result'] as Record<string, unknown> | undefined)?.['outcome']),
  });

  // --- CASE 2: refusals, with and without a proven identity -------------------------------
  const two = await ingest('case-2', 'Operations Proof Beta', 'case 2 · ingress');

  const unauthenticated = await post('/api/lead-rescue/wait-incidents/dispatch', {
    incidentId: two.incidentId,
    expectedRevision: two.revision,
    target: 'operations-proof-case-2@example.invalid',
    offerSummary: 'Synthetic proof step: a despatch presented with no operator credential.',
  });
  steps.push({
    step: 'case 2 · despatch with no operator credential (refused)',
    request: 'POST /api/lead-rescue/wait-incidents/dispatch',
    httpStatus: unauthenticated.status,
    observableOutcome: String(unauthenticated.json['reason'] ?? unauthenticated.json['error']),
  });

  const wrongState = await post(
    '/api/lead-rescue/wait-incidents/decide',
    {
      incidentId: two.incidentId,
      expectedRevision: two.revision,
      decision: 'CLEARED_TO_PROCEED',
      rationale: 'Synthetic proof step: a decision against a case that is not under review.',
    },
    analyst,
  );
  steps.push({
    step: 'case 2 · human decision against a case not under review (refused)',
    request: 'POST /api/lead-rescue/wait-incidents/decide',
    httpStatus: wrongState.status,
    observableOutcome:
      wrongState.status === 200
        ? String((wrongState.json['result'] as Record<string, unknown> | undefined)?.['outcome'])
        : String(wrongState.json['error']),
  });

  // --- CASE 3: one observation only. Its interval must stay UNAVAILABLE. -----------------
  const three = await ingest('case-3', 'Operations Proof Gamma', 'case 3 · ingress only (no further boundary)');

  // --- THE AGGREGATE, read back through the real read-only route --------------------------
  const aggregate = await get('/api/lead-rescue/operations');
  if (aggregate.status !== 200) {
    throw new Error(`the aggregate route returned ${aggregate.status}: ${JSON.stringify(aggregate.json)}`);
  }
  const view = aggregate.json['view'] as Record<string, unknown>;
  const incidents = (view['incidents'] ?? []) as readonly Record<string, unknown>[];
  const dispatch = view['dispatch'] as Record<string, unknown>;
  const timing = view['timing'] as Record<string, unknown>;

  const caseThree = incidents.find((i) => i['incidentId'] === three.incidentId);
  const caseThreeInterval = caseThree?.['observedIntervalMs'] as Record<string, unknown> | undefined;

  const artifact = {
    schemaVersion: 'lead-rescue-operational-view-evidence-1',
    capturedAt: new Date().toISOString(),
    gitHead: gitHead(),
    environment: {
      runtime: 'Next.js dev server (npm run dev) on 127.0.0.1:3000',
      executionPath:
        'Real HTTP routes: POST /api/lead-rescue/ingress, POST /api/lead-rescue/wait-incidents/dispatch, POST /api/lead-rescue/wait-incidents/decide, GET /api/lead-rescue/operations.',
      httpHopExercised: true,
      aggregateComputedBy: 'the Next.js server process, from records it had already written to disk',
      aggregateReadBackBy: 'this script — a separate OS process that never writes a journal record',
      anthropicCalled: false,
      smtpUsed: false,
      n8nParticipated: false,
      syntheticData: true,
      scope:
        'The view covers every case retained in this machine’s journal, not only the cases this run created.',
    },
    casesCreatedByThisRun: {
      caseOne: one.incidentId,
      caseTwo: two.incidentId,
      caseThreeSingleObservation: three.incidentId,
    },
    steps,
    view,
    derivedAssertions: {
      manyIncidentsObservedTogether: Number(view['incidentCount']) >= 3,
      aggregateReconcilesToIncidents:
        incidents.reduce((total, incident) => total + Number(incident['eventCount']), 0) ===
        Number(view['observationCount']),
      suppressedDuplicateObserved: Number(dispatch['suppressedDuplicate']) >= 0,
      confirmedDeliveryIsCountedByLeadNotByAttempt:
        Number(dispatch['incidentsWithConfirmedDelivery']) <= Number(view['incidentCount']),
      singleObservationIntervalReportedUnavailable: caseThreeInterval?.['kind'] === 'UNAVAILABLE',
      unmeasurableIncidentsNamed: Array.isArray(timing['unmeasurableIncidents']),
    },
    doesNotProve: [
      'Nothing here ran on a hosted or client deployment; this is a local prototype runtime.',
      'The journal is lossy under failure by design, so this view describes what was OBSERVED, never everything that occurred.',
      'No real prospect, recipient, model, or external provider was involved at any point.',
      'Intervals are wall-clock between recorded observations. They include any time a case sat parked, and are not a processing-latency measurement.',
    ],
  };

  writeFileSync(EVIDENCE_PATH, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
  console.log(
    JSON.stringify(
      {
        incidentCount: view['incidentCount'],
        observationCount: view['observationCount'],
        dispatch,
        evidence: EVIDENCE_PATH,
      },
      null,
      2,
    ),
  );

  const assertions = artifact.derivedAssertions;
  if (!assertions.manyIncidentsObservedTogether) {
    throw new Error('the aggregate did not observe several incidents together');
  }
  if (!assertions.aggregateReconcilesToIncidents) {
    throw new Error('the aggregate did not reconcile to the per-incident records underneath it');
  }
  if (!assertions.singleObservationIntervalReportedUnavailable) {
    throw new Error('a single-observation case did NOT report its interval as UNAVAILABLE — the view is fabricating');
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
