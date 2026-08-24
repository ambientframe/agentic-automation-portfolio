import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { LEAD_RESCUE } from '@/data/systems';
import { KESTREL } from '@/data/profiles/kestrel/profile';
import { LEAD_RESCUE_HANDLERS } from '@/lib/engine/handlers/lead-rescue';
import { leadRescueScenarioBySlug } from '@/data/profiles/kestrel/scenarios/lead-rescue';
import { runScenario } from '@/lib/engine/run';
import { FixtureDecisionProvider } from '@/lib/ports/decision-provider';
import { FileWaitIncidentStore, type WaitIncidentRecord, type WaitIncidentStore } from '@/lib/persistence/wait-incident-store';
import { FileOperationClaimStore } from '@/lib/persistence/operation-claim-store';
import { checkWaitIncident, type WaitResumeDeps } from '@/lib/engine/wait-resume';
import type { Scenario } from '@/lib/model/runtime';

/**
 * RESTART/CROSS-RUNTIME FALSIFYING TESTS for the review and dispatch attention timeouts —
 * the same durable guarantees `tests/lead-rescue-wait-resume-concurrency.test.ts` proves for
 * lr-t14/lr-t22's own notification, proven here for the two NEW, non-transitioning checks.
 * Genuinely independent `FileWaitIncidentStore`/`FileOperationClaimStore` instances sharing
 * only files on disk, and genuine `Promise.all` racing — never sequential calls relabelled as
 * concurrent.
 */

const DEPS: WaitResumeDeps = {
  system: LEAD_RESCUE,
  profile: KESTREL,
  handlers: LEAD_RESCUE_HANDLERS,
  reevaluationEventType: 'lead.wait.reevaluated',
};

const REVIEW_SCENARIO = leadRescueScenarioBySlug('reviewed-offer-elapses');
if (REVIEW_SCENARIO === undefined) throw new Error('fixture scenario "reviewed-offer-elapses" not found');
const REVIEW_FULL_SCENARIO: Scenario = REVIEW_SCENARIO;

const OFFER_SCENARIO = leadRescueScenarioBySlug('offer-window-elapses');
if (OFFER_SCENARIO === undefined) throw new Error('fixture scenario "offer-window-elapses" not found');
const OFFER_FULL_SCENARIO: Scenario = OFFER_SCENARIO;

function hoursAfter(iso: string, hours: number): string {
  return new Date(Date.parse(iso) + hours * 60 * 60 * 1000).toISOString();
}

async function parkReviewIncident(store: WaitIncidentStore, incidentId: string): Promise<WaitIncidentRecord> {
  const enquiryEvent = REVIEW_FULL_SCENARIO.events[0];
  if (enquiryEvent === undefined) throw new Error('fixture scenario has no events');
  const enquiryOnly: Scenario = { ...REVIEW_FULL_SCENARIO, events: [{ ...enquiryEvent, entityId: incidentId, eventId: `${incidentId}:evt-001` }] };
  const run = await runScenario(enquiryOnly, {
    system: LEAD_RESCUE,
    profile: KESTREL,
    handlers: LEAD_RESCUE_HANDLERS,
    provider: new FixtureDecisionProvider(enquiryOnly.judgments),
  });
  expect(run.finalState.lifecycleState).toBe('NEEDS_HUMAN');
  return store.park({
    incidentId,
    systemId: LEAD_RESCUE.id,
    correlationId: `inc-${incidentId}`,
    engineState: { ...run.finalState, missingInformation: [...run.finalState.missingInformation] },
  });
}

async function parkReadyIncident(store: WaitIncidentStore, incidentId: string): Promise<WaitIncidentRecord> {
  const enquiryEvent = OFFER_FULL_SCENARIO.events[0];
  if (enquiryEvent === undefined) throw new Error('fixture scenario has no events');
  const enquiryOnly: Scenario = { ...OFFER_FULL_SCENARIO, events: [{ ...enquiryEvent, entityId: incidentId, eventId: `${incidentId}:evt-001` }] };
  const run = await runScenario(enquiryOnly, {
    system: LEAD_RESCUE,
    profile: KESTREL,
    handlers: LEAD_RESCUE_HANDLERS,
    provider: new FixtureDecisionProvider(enquiryOnly.judgments),
  });
  expect(run.finalState.lifecycleState).toBe('BOOKING_READY');
  expect(run.finalState.facts.offerSentAt).toBeUndefined();
  return store.park({
    incidentId,
    systemId: LEAD_RESCUE.id,
    correlationId: `inc-${incidentId}`,
    engineState: { ...run.finalState, missingInformation: [...run.finalState.missingInformation] },
  });
}

describe('Lead Rescue attention timeout — cross-runtime and restart durability', () => {
  it('review: two independently constructed runtimes racing (Promise.all) on the same durable snapshot produce at most one EXECUTED review-overdue notification', async () => {
    const incidentDir = mkdtempSync(path.join(tmpdir(), 'lr-attn-review-incidents-'));
    const claimDir = mkdtempSync(path.join(tmpdir(), 'lr-attn-review-claims-'));
    try {
      const incidentPath = path.join(incidentDir, 'incidents.json');
      const parkingStore = new FileWaitIncidentStore(incidentPath);
      const parked = await parkReviewIncident(parkingStore, 'lead-review-race');
      const wellPastDeadline = hoursAfter(parked.engineState.facts.reviewStartedAt ?? '', 30);

      const runtimeAStore = new FileWaitIncidentStore(incidentPath);
      const runtimeBStore = new FileWaitIncidentStore(incidentPath);
      const claimStoreA = new FileOperationClaimStore(claimDir);
      const claimStoreB = new FileOperationClaimStore(claimDir);

      const [a, b] = await Promise.all([
        checkWaitIncident(runtimeAStore, claimStoreA, 'lead-review-race', wellPastDeadline, DEPS, 'runtime-a'),
        checkWaitIncident(runtimeBStore, claimStoreB, 'lead-review-race', wellPastDeadline, DEPS, 'runtime-b'),
      ]);

      // THE property this proves: never two EXECUTED, no matter which outcome label the two
      // calls individually land on (the loser may see ATTENTION_OVERDUE via a suppressed
      // duplicate, or UNCERTAIN if it collides mid-flight before the winner confirms) — and at
      // least one call genuinely confirms the escalation. Same convention
      // `tests/lead-rescue-wait-resume-concurrency.test.ts` already establishes for lr-t14.
      expect([a.outcome, b.outcome]).toContain('ATTENTION_OVERDUE');
      expect([a.outcome, b.outcome].every((o) => o === 'ATTENTION_OVERDUE' || o === 'UNCERTAIN')).toBe(true);

      const key = 'notify:lead-review-race:review-overdue';
      const statuses = [a, b].flatMap((r) => r.entries ?? []).flatMap((e) => e.sideEffects).filter((s) => s.idempotencyKey === key).map((s) => s.status);
      expect(statuses.filter((s) => s === 'EXECUTED')).toHaveLength(1);

      const verifyClaimStore = new FileOperationClaimStore(claimDir);
      const claimed = await verifyClaimStore.load(`${key}@rev${parked.revision}`);
      expect(claimed?.status).toBe('CONFIRMED');

      // The incident is STILL parked — an attention escalation never resolves the record.
      const reconstructed = new FileWaitIncidentStore(incidentPath);
      const stillParked = await reconstructed.load('lead-review-race');
      expect(stillParked?.engineState.lifecycleState).toBe('NEEDS_HUMAN');
    } finally {
      rmSync(incidentDir, { recursive: true, force: true });
      rmSync(claimDir, { recursive: true, force: true });
    }
  });

  it('dispatch: two independently constructed runtimes racing (Promise.all) on the same durable snapshot produce at most one EXECUTED dispatch-overdue notification', async () => {
    const incidentDir = mkdtempSync(path.join(tmpdir(), 'lr-attn-dispatch-incidents-'));
    const claimDir = mkdtempSync(path.join(tmpdir(), 'lr-attn-dispatch-claims-'));
    try {
      const incidentPath = path.join(incidentDir, 'incidents.json');
      const parkingStore = new FileWaitIncidentStore(incidentPath);
      const parked = await parkReadyIncident(parkingStore, 'lead-dispatch-race');
      const wellPastDeadline = hoursAfter(parked.engineState.facts.bookingReadyAt ?? '', 40);

      const runtimeAStore = new FileWaitIncidentStore(incidentPath);
      const runtimeBStore = new FileWaitIncidentStore(incidentPath);
      const claimStoreA = new FileOperationClaimStore(claimDir);
      const claimStoreB = new FileOperationClaimStore(claimDir);

      const [a, b] = await Promise.all([
        checkWaitIncident(runtimeAStore, claimStoreA, 'lead-dispatch-race', wellPastDeadline, DEPS, 'runtime-a'),
        checkWaitIncident(runtimeBStore, claimStoreB, 'lead-dispatch-race', wellPastDeadline, DEPS, 'runtime-b'),
      ]);

      expect([a.outcome, b.outcome]).toContain('ATTENTION_OVERDUE');
      expect([a.outcome, b.outcome].every((o) => o === 'ATTENTION_OVERDUE' || o === 'UNCERTAIN')).toBe(true);

      const key = 'notify:lead-dispatch-race:dispatch-overdue';
      const statuses = [a, b].flatMap((r) => r.entries ?? []).flatMap((e) => e.sideEffects).filter((s) => s.idempotencyKey === key).map((s) => s.status);
      expect(statuses.filter((s) => s === 'EXECUTED')).toHaveLength(1);

      const verifyClaimStore = new FileOperationClaimStore(claimDir);
      const claimed = await verifyClaimStore.load(`${key}@rev${parked.revision}`);
      expect(claimed?.status).toBe('CONFIRMED');

      const reconstructed = new FileWaitIncidentStore(incidentPath);
      const stillParked = await reconstructed.load('lead-dispatch-race');
      expect(stillParked?.engineState.lifecycleState).toBe('BOOKING_READY');
      expect(stillParked?.engineState.facts.offerSentAt).toBeUndefined();
    } finally {
      rmSync(incidentDir, { recursive: true, force: true });
      rmSync(claimDir, { recursive: true, force: true });
    }
  });

  it('review: a wholly independent runtime, reconstructed after the parking process is discarded, resumes correctly and remains idempotent on a second check', async () => {
    const incidentDir = mkdtempSync(path.join(tmpdir(), 'lr-attn-review-restart-'));
    const claimDir = mkdtempSync(path.join(tmpdir(), 'lr-attn-review-restart-claims-'));
    try {
      const incidentPath = path.join(incidentDir, 'incidents.json');
      let parkingStore: WaitIncidentStore | undefined = new FileWaitIncidentStore(incidentPath);
      const parked = await parkReviewIncident(parkingStore, 'lead-review-restart');
      const reviewStartedAt = parked.engineState.facts.reviewStartedAt ?? '';
      // Discard the parking instance entirely — nothing below may reference it again.
      parkingStore = undefined;
      void parkingStore;

      const freshStore = new FileWaitIncidentStore(incidentPath);
      const freshClaimStore = new FileOperationClaimStore(claimDir);
      const wellPastDeadline = hoursAfter(reviewStartedAt, 30);

      const first = await checkWaitIncident(freshStore, freshClaimStore, 'lead-review-restart', wellPastDeadline, DEPS, 'runtime-restart');
      expect(first.outcome).toBe('ATTENTION_OVERDUE');

      // A second, later check against an ANOTHER independently reconstructed runtime must not
      // fire a duplicate EXECUTED notification.
      const secondStore = new FileWaitIncidentStore(incidentPath);
      const secondClaimStore = new FileOperationClaimStore(claimDir);
      const second = await checkWaitIncident(secondStore, secondClaimStore, 'lead-review-restart', hoursAfter(wellPastDeadline, 5), DEPS, 'runtime-restart-2');
      expect(second.outcome).toBe('ATTENTION_OVERDUE');

      const key = 'notify:lead-review-restart:review-overdue';
      const statuses = [first, second].flatMap((r) => r.entries ?? []).flatMap((e) => e.sideEffects).filter((s) => s.idempotencyKey === key).map((s) => s.status);
      expect(statuses.filter((s) => s === 'EXECUTED')).toHaveLength(1);
      expect(statuses).toContain('SUPPRESSED_DUPLICATE');
    } finally {
      rmSync(incidentDir, { recursive: true, force: true });
      rmSync(claimDir, { recursive: true, force: true });
    }
  });
});
