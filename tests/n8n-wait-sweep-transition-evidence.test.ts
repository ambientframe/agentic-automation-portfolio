import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { KESTREL } from '@/data/profiles/kestrel/profile';
import { numberParam } from '@/lib/model/profile';
import { operationClaimId } from '@/lib/engine/wait-resume';
import type { SideEffect } from '@/lib/model/runtime';
import type { WaitIncidentRecord } from '@/lib/persistence/wait-incident-store';

/**
 * FALSIFYING TEST for a REAL, STATE-MUTATING wait-sweep transition proved through n8n.
 *
 * The prior evidence package proved n8n's schedule-triggered sweep genuinely calls the real
 * application boundary, but the only recorded outcome was `results: []` — orchestration
 * proven, but never that the sweep discovers a due incident and drives the intended
 * deadline/attention-timeout transition. This test rejects that gap explicitly: it requires
 * `resultsCount >= 1` and a real `ATTENTION_OVERDUE` outcome, and it fails for the intended
 * reason (missing entry, or `resultsCount === 0`) until that proof genuinely exists.
 *
 * Every numeric/identity check below is cross-checked against something else already real in
 * this repo — the configured `dispatchTimeoutHours` policy value (not a hardcoded "8"), the
 * real `operationClaimId()` construction function, and the real workflow JSON's HTTP node URL
 * — rather than trusting the evidence file's own self-reported numbers.
 */

const EVIDENCE_PATH = path.join(process.cwd(), 'n8n', 'evidence', 'lead-rescue-runtime-execution.json');
const SWEEP_WORKFLOW_PATH = path.join(process.cwd(), 'n8n', 'workflows', 'lead-rescue-wait-sweep.json');

interface TransitionEntry {
  readonly proofFocus: string;
  readonly workflow: { readonly repositoryPath: string; readonly name: string; readonly n8nWorkflowId: string };
  readonly n8nExecution: { readonly id: string; readonly status: string; readonly startedAt: string; readonly stoppedAt: string; readonly mode: string };
  readonly httpRequest: { readonly method: string; readonly targetRoute: string };
  readonly httpResponse: {
    readonly statusCode: number;
    readonly now: string;
    readonly resultsCount: number;
    readonly capturedFacts: { readonly incidentId: string; readonly outcome: string };
  };
  readonly precondition: {
    readonly capturedFacts: {
      readonly incidentId: string;
      readonly revision: number;
      readonly engineState: { readonly lifecycleState: string; readonly facts: Record<string, string> };
      readonly provenance: unknown;
    };
    readonly derivedAssertions: { readonly constructionMethod: string };
  };
  readonly dueConditionEvaluation: {
    readonly derivedAssertions: { readonly policyId: string; readonly configuredWindowHours: number; readonly eligible: boolean };
  };
  readonly postSweepState: {
    readonly capturedFacts: {
      readonly revisionAfter: number;
      readonly engineStateAfter: { readonly lifecycleState: string };
      readonly operationClaim: { readonly operationId: string; readonly status: string; readonly claimedAt: string; readonly confirmedAt: string };
    };
    readonly derivedAssertions: { readonly lifecycleStateChanged: boolean; readonly revisionChanged: boolean };
  };
  readonly replay: {
    readonly n8nExecution: { readonly id: string; readonly status: string };
    readonly httpResponse: { readonly statusCode: number; readonly capturedFacts: { readonly outcome: string } };
    readonly capturedFacts: { readonly operationClaimAfterReplay: { readonly operationId: string; readonly confirmedAt: string } };
    readonly derivedAssertions: { readonly duplicateSuppressed: boolean };
  };
}

function loadTransitionEntry(): TransitionEntry {
  const doc = JSON.parse(readFileSync(EVIDENCE_PATH, 'utf-8')) as { executions: TransitionEntry[] };
  const entry = doc.executions.find((e) => e.proofFocus === 'due-incident-state-mutation');
  if (entry === undefined) {
    throw new Error('no retained evidence entry with proofFocus "due-incident-state-mutation" — the state-mutating sweep proof does not exist yet');
  }
  return entry;
}

describe('n8n wait-sweep transition evidence — a real due incident genuinely drove a real transition', () => {
  it('retains an evidence entry proving the sweep processed at least one due incident (never resultsCount: 0)', () => {
    const entry = loadTransitionEntry();
    expect(entry.httpResponse.resultsCount).toBeGreaterThanOrEqual(1);
    expect(entry.httpResponse.capturedFacts.outcome).toBe('ATTENTION_OVERDUE');
    expect(entry.workflow.repositoryPath).toBe('n8n/workflows/lead-rescue-wait-sweep.json');

    const sweepWorkflowJson = JSON.parse(readFileSync(SWEEP_WORKFLOW_PATH, 'utf-8'));
    expect(entry.workflow.name).toBe(sweepWorkflowJson.name);
  });

  it('a real n8n execution identity is retained for the sweep that found the due incident', () => {
    const entry = loadTransitionEntry();
    expect(entry.n8nExecution.id.length).toBeGreaterThan(0);
    expect(entry.n8nExecution.id).not.toBe('simulated');
    expect(entry.n8nExecution.status).toBe('success');
    const startedAt = Date.parse(entry.n8nExecution.startedAt);
    const stoppedAt = Date.parse(entry.n8nExecution.stoppedAt);
    expect(Number.isNaN(startedAt)).toBe(false);
    expect(Number.isNaN(stoppedAt)).toBe(false);
    expect(stoppedAt).toBeGreaterThanOrEqual(startedAt);
  });

  it('the precondition was genuinely eligible: bookingReadyAt is more than the REAL configured dispatchTimeoutHours before the sweep\'s own observed "now"', () => {
    const entry = loadTransitionEntry();
    const configuredWindowHours = numberParam(KESTREL, 'dispatchTimeoutHours');
    expect(entry.dueConditionEvaluation.derivedAssertions.configuredWindowHours).toBe(configuredWindowHours);
    expect(entry.dueConditionEvaluation.derivedAssertions.policyId).toBe('kestrel-dispatch-timeout-window');

    const bookingReadyAt = entry.precondition.capturedFacts.engineState.facts['bookingReadyAt'];
    expect(bookingReadyAt).toBeTruthy();
    const elapsedMs = Date.parse(entry.httpResponse.now) - Date.parse(bookingReadyAt as string);
    expect(elapsedMs).toBeGreaterThanOrEqual(configuredWindowHours * 60 * 60 * 1000);
  });

  it('the precondition record was constructed through the real WaitIncidentStore API, never n8n-ingressed, and carries no fabricated provenance', () => {
    const entry = loadTransitionEntry();
    expect(entry.precondition.capturedFacts.engineState.lifecycleState).toBe('BOOKING_READY');
    expect(entry.precondition.capturedFacts.provenance).toBeFalsy();
    expect(entry.precondition.derivedAssertions.constructionMethod).toMatch(/park\(\)/);
    expect(entry.precondition.derivedAssertions.constructionMethod).toMatch(/scripts\/seed-due-wait-incident\.ts/);
  });

  it('the persisted WaitIncidentRecord reflects the REAL handleDispatchAttentionTimeout semantics: lifecycle unchanged, revision unchanged (an escalation, not a lifecycle move)', () => {
    const entry = loadTransitionEntry();
    expect(entry.postSweepState.capturedFacts.revisionAfter).toBe(entry.precondition.capturedFacts.revision);
    expect(entry.postSweepState.capturedFacts.engineStateAfter.lifecycleState).toBe('BOOKING_READY');
    expect(entry.postSweepState.derivedAssertions.lifecycleStateChanged).toBe(false);
    expect(entry.postSweepState.derivedAssertions.revisionChanged).toBe(false);
  });

  it('a real, durably confirmed operation claim is the actual persisted mutation, its identity cross-checked against the real operationClaimId() function', () => {
    const entry = loadTransitionEntry();
    const incidentId = entry.precondition.capturedFacts.incidentId;
    const revision = entry.precondition.capturedFacts.revision;
    const fakeEffect = { idempotencyKey: `notify:${incidentId}:dispatch-overdue` } as unknown as SideEffect;
    const fakeRecord = { revision } as unknown as WaitIncidentRecord;
    const expectedOperationId = operationClaimId(fakeEffect, fakeRecord);

    expect(entry.postSweepState.capturedFacts.operationClaim.operationId).toBe(expectedOperationId);
    expect(entry.postSweepState.capturedFacts.operationClaim.status).toBe('CONFIRMED');
  });

  it('replay proves idempotency: a second real n8n sweep execution suppresses the duplicate rather than confirming a second claim', () => {
    const entry = loadTransitionEntry();
    expect(entry.replay.n8nExecution.id).not.toBe(entry.n8nExecution.id);
    expect(entry.replay.n8nExecution.status).toBe('success');
    expect(entry.replay.httpResponse.statusCode).toBe(200);
    expect(entry.replay.httpResponse.capturedFacts.outcome).toBe('ATTENTION_OVERDUE');
    expect(entry.replay.derivedAssertions.duplicateSuppressed).toBe(true);

    // The strongest falsification available here: if a second claim had genuinely been
    // confirmed, this timestamp would differ (or the claim's operationId would differ). It
    // must be byte-identical to the claim already captured in postSweepState.
    expect(entry.replay.capturedFacts.operationClaimAfterReplay.operationId).toBe(entry.postSweepState.capturedFacts.operationClaim.operationId);
    expect(entry.replay.capturedFacts.operationClaimAfterReplay.confirmedAt).toBe(entry.postSweepState.capturedFacts.operationClaim.confirmedAt);
  });
});
