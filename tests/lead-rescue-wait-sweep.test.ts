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
import { checkAllWaitingIncidents, parkWaitingIncident, type WaitResumeDeps } from '@/lib/engine/wait-resume';
import type { Scenario } from '@/lib/model/runtime';

/**
 * FALSIFYING TESTS for `checkAllWaitingIncidents` ITSELF — the full-sweep entry point a
 * scheduled n8n trigger calls, as opposed to `checkWaitIncident` for one named incident,
 * which every existing test file (`lead-rescue-wait-resume-concurrency.test.ts`,
 * `lead-rescue-wait-resume-execution-boundary.test.ts`, the attention-timeout resume suite)
 * already proves safe under racing, crash, and restart conditions.
 *
 * `checkAllWaitingIncidents` has never been driven by any test before this file — every prior
 * proof exercises the per-incident function it wraps. This file asks the same three questions
 * the task names, at the boundary a scheduler actually calls, without inventing any new
 * deduplication or eligibility logic: the sweep is a thin `listWaiting()` + sequential loop
 * over the already-proven `checkWaitIncident`, and these tests either confirm that composition
 * preserves the existing guarantees or reveal a genuine gap the wrapper introduces.
 */

const DEPS: WaitResumeDeps = {
  system: LEAD_RESCUE,
  profile: KESTREL,
  handlers: LEAD_RESCUE_HANDLERS,
  reevaluationEventType: 'lead.wait.reevaluated',
};

const FOUND_SCENARIO = leadRescueScenarioBySlug('reply-window-elapses');
if (FOUND_SCENARIO === undefined) throw new Error('fixture scenario "reply-window-elapses" not found');
const FULL_SCENARIO: Scenario = FOUND_SCENARIO;

/**
 * `startOffsetHours` shifts the fixture enquiry event's `occurredAt` forward — the mechanism
 * `handleEnquiry` uses to stamp `waitStartedAt` (`lib/engine/handlers/lead-rescue.ts`) reads
 * directly off the event, so this is the one legitimate way to give two incidents parked from
 * the SAME authored fixture genuinely different wait-clock starting points, needed to
 * construct a "due" and "not yet due" incident within a single sweep's one shared `now`.
 */
async function parkIncident(store: WaitIncidentStore, incidentId: string, startOffsetHours = 0): Promise<WaitIncidentRecord> {
  const enquiryEvent = FULL_SCENARIO.events[0];
  if (enquiryEvent === undefined) throw new Error('fixture scenario has no events');
  const occurredAt =
    startOffsetHours === 0 ? enquiryEvent.occurredAt : hoursAfter(enquiryEvent.occurredAt, startOffsetHours);
  const enquiryOnly: Scenario = {
    ...FULL_SCENARIO,
    events: [{ ...enquiryEvent, entityId: incidentId, eventId: `${incidentId}:evt-001`, occurredAt, receivedAt: occurredAt }],
  };
  const run = await runScenario(enquiryOnly, {
    system: LEAD_RESCUE,
    profile: KESTREL,
    handlers: LEAD_RESCUE_HANDLERS,
    provider: new FixtureDecisionProvider(enquiryOnly.judgments),
  });
  expect(run.finalState.lifecycleState).toBe('WAITING_FOR_REPLY');
  return parkWaitingIncident(store, LEAD_RESCUE, {
    incidentId,
    correlationId: `inc-${incidentId}`,
    engineState: run.finalState,
  });
}

function hoursAfter(iso: string, hours: number): string {
  return new Date(Date.parse(iso) + hours * 60 * 60 * 1000).toISOString();
}

function notificationStatuses(
  entries: readonly { sideEffects: readonly { idempotencyKey: string; status: string }[] }[] | undefined,
  key: string,
): string[] {
  return (entries ?? []).flatMap((e) => e.sideEffects).filter((s) => s.idempotencyKey === key).map((s) => s.status);
}

describe('Lead Rescue wait/resume — sweep-level (checkAllWaitingIncidents) falsifying tests', () => {
  it('a sweep containing one eligible and one not-yet-due incident resolves only the eligible one, with zero side effects on the other', async () => {
    const incidentDir = mkdtempSync(path.join(tmpdir(), 'lr-sweep-mixed-incidents-'));
    const claimDir = mkdtempSync(path.join(tmpdir(), 'lr-sweep-mixed-claims-'));
    try {
      const incidentPath = path.join(incidentDir, 'incidents.json');
      const store = new FileWaitIncidentStore(incidentPath);
      const claimStore = new FileOperationClaimStore(claimDir);

      const due = await parkIncident(store, 'lead-sweep-due');
      // Starts waiting 25h "later" than `due` — at due's own 30h-elapsed sweep time, this
      // incident has only been waiting 5h, well under the 24h configured window.
      const notDue = await parkIncident(store, 'lead-sweep-not-due', 25);

      // A single "now" for the whole sweep — exactly what a real scheduled trigger supplies
      // once per invocation, never per-incident.
      const sweepNow = hoursAfter(due.engineState.facts.waitStartedAt ?? '', 30);

      const results = await checkAllWaitingIncidents(store, claimStore, sweepNow, DEPS, 'scheduler-runtime');

      const dueResult = results.find((r) => r.incidentId === 'lead-sweep-due');
      const notDueResult = results.find((r) => r.incidentId === 'lead-sweep-not-due');
      expect(dueResult?.outcome).toBe('ELAPSED');
      expect(notDueResult?.outcome).toBe('STILL_WAITING');
      expect(notDueResult?.entries?.flatMap((e) => e.sideEffects)).toEqual([]);

      // Durable effect: the eligible incident is gone (resolved), the ineligible one still parked.
      expect(await store.load('lead-sweep-due')).toBeUndefined();
      expect(await store.load('lead-sweep-not-due')).toBeDefined();
      void notDue;
    } finally {
      rmSync(incidentDir, { recursive: true, force: true });
      rmSync(claimDir, { recursive: true, force: true });
    }
  });

  it('two concurrently invoked sweeps (independently constructed stores) over the same eligible incident execute its notification at most once', async () => {
    const incidentDir = mkdtempSync(path.join(tmpdir(), 'lr-sweep-race-incidents-'));
    const claimDir = mkdtempSync(path.join(tmpdir(), 'lr-sweep-race-claims-'));
    try {
      const incidentPath = path.join(incidentDir, 'incidents.json');
      const parkingStore = new FileWaitIncidentStore(incidentPath);
      const parked = await parkIncident(parkingStore, 'lead-sweep-race');
      const sweepNow = hoursAfter(parked.engineState.facts.waitStartedAt ?? '', 30);

      // Two independently constructed store/claim-store pairs, sharing only the files on
      // disk — the same discipline the per-incident concurrency suite uses, applied to the
      // sweep entry point a scheduler actually calls.
      const storeA = new FileWaitIncidentStore(incidentPath);
      const storeB = new FileWaitIncidentStore(incidentPath);
      const claimStoreA = new FileOperationClaimStore(claimDir);
      const claimStoreB = new FileOperationClaimStore(claimDir);

      const [resultsA, resultsB] = await Promise.all([
        checkAllWaitingIncidents(storeA, claimStoreA, sweepNow, DEPS, 'scheduler-run-a'),
        checkAllWaitingIncidents(storeB, claimStoreB, sweepNow, DEPS, 'scheduler-run-b'),
      ]);

      const key = 'notify:lead-sweep-race:wait-elapsed';
      const allStatuses = [
        ...notificationStatuses(resultsA.flatMap((r) => r.entries ?? []), key),
        ...notificationStatuses(resultsB.flatMap((r) => r.entries ?? []), key),
      ];
      expect(allStatuses.filter((s) => s === 'EXECUTED')).toHaveLength(1);

      const outcomes = [
        resultsA.find((r) => r.incidentId === 'lead-sweep-race')?.outcome,
        resultsB.find((r) => r.incidentId === 'lead-sweep-race')?.outcome,
      ];
      expect(outcomes).toContain('ELAPSED');

      const verifyClaimStore = new FileOperationClaimStore(claimDir);
      const claimed = await verifyClaimStore.load(`${key}@rev${parked.revision}`);
      expect(claimed?.status).toBe('CONFIRMED');
    } finally {
      rmSync(incidentDir, { recursive: true, force: true });
      rmSync(claimDir, { recursive: true, force: true });
    }
  });

  it('restart durability: a second sweep, run against brand-new store instances reconstructed from disk, does not re-resolve what the first sweep already resolved and correctly discovers an incident that became eligible only after the first sweep ran', async () => {
    const incidentDir = mkdtempSync(path.join(tmpdir(), 'lr-sweep-restart-incidents-'));
    const claimDir = mkdtempSync(path.join(tmpdir(), 'lr-sweep-restart-claims-'));
    try {
      const incidentPath = path.join(incidentDir, 'incidents.json');
      const parkingStore = new FileWaitIncidentStore(incidentPath);

      const early = await parkIncident(parkingStore, 'lead-sweep-restart-early');
      // Starts waiting 20h "later" than `early` — not yet due at sweep 1 (10h elapsed at that
      // point), but genuinely due by sweep 2's own later `now`.
      const late = await parkIncident(parkingStore, 'lead-sweep-restart-late', 20);

      // Sweep 1: only "early" is due yet.
      const firstSweepNow = hoursAfter(early.engineState.facts.waitStartedAt ?? '', 30);
      const firstStore = new FileWaitIncidentStore(incidentPath);
      const firstClaimStore = new FileOperationClaimStore(claimDir);
      const firstResults = await checkAllWaitingIncidents(firstStore, firstClaimStore, firstSweepNow, DEPS, 'scheduler-run-1');
      expect(firstResults.find((r) => r.incidentId === 'lead-sweep-restart-early')?.outcome).toBe('ELAPSED');
      expect(firstResults.find((r) => r.incidentId === 'lead-sweep-restart-late')?.outcome).toBe('STILL_WAITING');

      // "Restart": brand-new store/claim-store instances, never referencing `firstStore`/
      // `firstClaimStore` again — only the files on disk carry state forward, exactly what a
      // fresh n8n-triggered process invocation would construct.
      const secondSweepNow = hoursAfter(late.engineState.facts.waitStartedAt ?? '', 30);
      const secondStore = new FileWaitIncidentStore(incidentPath);
      const secondClaimStore = new FileOperationClaimStore(claimDir);
      const secondResults = await checkAllWaitingIncidents(secondStore, secondClaimStore, secondSweepNow, DEPS, 'scheduler-run-2');

      // The already-resolved incident must not reappear in a later sweep at all — it is gone
      // from the store, so listWaiting() cannot return it a second time.
      expect(secondResults.find((r) => r.incidentId === 'lead-sweep-restart-early')).toBeUndefined();
      // The incident that only became eligible between sweeps is correctly discovered and
      // resolved by the reconstructed runtime's own sweep.
      expect(secondResults.find((r) => r.incidentId === 'lead-sweep-restart-late')?.outcome).toBe('ELAPSED');

      const key = 'notify:lead-sweep-restart-early:wait-elapsed';
      // Never re-executed: the winning claim from sweep 1 is still CONFIRMED, and the
      // incident record itself is durably gone.
      const verifyClaimStore = new FileOperationClaimStore(claimDir);
      const claimed = await verifyClaimStore.load(`${key}@rev${early.revision}`);
      expect(claimed?.status).toBe('CONFIRMED');
      expect(await new FileWaitIncidentStore(incidentPath).load('lead-sweep-restart-early')).toBeUndefined();
    } finally {
      rmSync(incidentDir, { recursive: true, force: true });
      rmSync(claimDir, { recursive: true, force: true });
    }
  });

  it('a sweep over a store with no waiting incidents returns an empty result and touches nothing', async () => {
    const incidentDir = mkdtempSync(path.join(tmpdir(), 'lr-sweep-empty-incidents-'));
    const claimDir = mkdtempSync(path.join(tmpdir(), 'lr-sweep-empty-claims-'));
    try {
      const store = new FileWaitIncidentStore(path.join(incidentDir, 'incidents.json'));
      const claimStore = new FileOperationClaimStore(claimDir);
      const results = await checkAllWaitingIncidents(store, claimStore, new Date().toISOString(), DEPS, 'scheduler-runtime');
      expect(results).toEqual([]);
    } finally {
      rmSync(incidentDir, { recursive: true, force: true });
      rmSync(claimDir, { recursive: true, force: true });
    }
  });
});
