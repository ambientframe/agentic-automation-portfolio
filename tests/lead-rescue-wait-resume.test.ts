import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { LEAD_RESCUE } from '@/data/systems';
import { KESTREL } from '@/data/profiles/kestrel/profile';
import { LEAD_RESCUE_HANDLERS } from '@/lib/engine/handlers/lead-rescue';
import { leadRescueScenarioBySlug } from '@/data/profiles/kestrel/scenarios/lead-rescue';
import { runScenario } from '@/lib/engine/run';
import { FixtureDecisionProvider } from '@/lib/ports/decision-provider';
import {
  FileWaitIncidentStore,
  InMemoryWaitIncidentStore,
  MalformedWaitRecordError,
  type WaitIncidentRecord,
  type WaitIncidentStore,
} from '@/lib/persistence/wait-incident-store';
import { checkWaitIncident, parkWaitingIncident, type WaitResumeDeps } from '@/lib/engine/wait-resume';
import type { Scenario } from '@/lib/model/runtime';

/**
 * FALSIFYING TESTS for genuine Lead Rescue wait/resume — see
 * `docs/FIDELITY_ASSESSMENT.md` section 6 for the four properties these exist to prove.
 *
 * Unlike `tests/lead-rescue.test.ts`'s "reply-window-elapses" scenario (which proves the
 * DETERMINISTIC RULE computes correctly against authored timestamps within one call), every
 * test here proves the PERSISTENCE property: an incident parked by one call is correctly
 * resumed by an entirely separate `checkWaitIncident` call, reading a genuinely persisted
 * record rather than anything held in a closure or a shared in-process variable.
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

/** Runs only the scenario's first event (the enquiry) — enough to reach WAITING_FOR_REPLY — through the real engine, then persists the result. Never hand-constructs an EngineState. */
async function parkSolaceIncident(store: WaitIncidentStore): Promise<WaitIncidentRecord> {
  const enquiryEvent = FULL_SCENARIO.events[0];
  if (enquiryEvent === undefined) throw new Error('fixture scenario has no events');
  const enquiryOnly: Scenario = { ...FULL_SCENARIO, events: [enquiryEvent] };
  const run = await runScenario(enquiryOnly, {
    system: LEAD_RESCUE,
    profile: KESTREL,
    handlers: LEAD_RESCUE_HANDLERS,
    provider: new FixtureDecisionProvider(enquiryOnly.judgments),
  });
  expect(run.finalState.lifecycleState).toBe('WAITING_FOR_REPLY');
  return parkWaitingIncident(store, LEAD_RESCUE, {
    incidentId: 'lead-solace',
    correlationId: 'inc-lr-solace',
    engineState: run.finalState,
  });
}

function hoursAfter(iso: string, hours: number): string {
  return new Date(Date.parse(iso) + hours * 60 * 60 * 1000).toISOString();
}

describe('Lead Rescue wait/resume — persisted incidents', () => {
  it('1. too early: resuming before the deadline leaves WAITING_FOR_REPLY untouched, with no transition and no side effect', async () => {
    const store = new InMemoryWaitIncidentStore();
    const parked = await parkSolaceIncident(store);
    const oneHourLater = hoursAfter(parked.engineState.facts.waitStartedAt ?? '', 1);

    const result = await checkWaitIncident(store, 'lead-solace', oneHourLater, DEPS);

    expect(result.outcome).toBe('STILL_WAITING');
    expect(result.state?.lifecycleState).toBe('WAITING_FOR_REPLY');
    expect(result.entries?.flatMap((e) => e.sideEffects)).toEqual([]);
    expect(result.entries?.flatMap((e) => e.transitions).some((t) => t.accepted)).toBe(false);

    // The record itself is untouched by an early, inconclusive check.
    expect(await store.load('lead-solace')).toEqual(parked);
  });

  it('2. elapsed: resuming after the deadline fires lr-t14 with a correct decision, escalation, and notification', async () => {
    const store = new InMemoryWaitIncidentStore();
    const parked = await parkSolaceIncident(store);
    const wellPastDeadline = hoursAfter(parked.engineState.facts.waitStartedAt ?? '', 30);

    const result = await checkWaitIncident(store, 'lead-solace', wellPastDeadline, DEPS);

    expect(result.outcome).toBe('ELAPSED');
    expect(result.state?.lifecycleState).toBe('NEEDS_HUMAN');

    const transition = result.entries?.flatMap((e) => e.transitions).find((t) => t.accepted);
    expect(transition?.ruleId).toBe('lr-t14');
    expect(transition?.mechanism).toBe('DETERMINISTIC_RULE');

    const notify = result.entries
      ?.flatMap((e) => e.sideEffects)
      .find((s) => s.idempotencyKey === 'notify:lead-solace:wait-elapsed');
    expect(notify?.status).toBe('EXECUTED');
    expect(notify?.kind).toBe('NOTIFICATION');

    const decision = result.entries?.flatMap((e) => e.decisions).find((d) => d.id.endsWith('d-wait-elapsed'));
    expect(decision?.authority).toBe(2);
    expect(decision?.applicablePolicy.some((p) => p.includes('kestrel-reply-wait-window'))).toBe(true);

    // Resolved: the incident no longer counts as waiting.
    expect(await store.load('lead-solace')).toBeUndefined();
  });

  it('3. restart durability: an incident parked by one store instance is correctly resumed by a freshly reconstructed instance', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'lr-wait-resume-test-'));
    try {
      const filePath = path.join(dir, 'wait-incidents.json');
      const firstProcessStore = new FileWaitIncidentStore(filePath);
      const parked = await parkSolaceIncident(firstProcessStore);

      // `firstProcessStore` is deliberately never referenced again below — the only thing
      // carrying state forward is the file on disk, exactly what a real process restart
      // would leave behind.
      const secondProcessStore = new FileWaitIncidentStore(filePath);
      const wellPastDeadline = hoursAfter(parked.engineState.facts.waitStartedAt ?? '', 30);
      const resumed = await checkWaitIncident(secondProcessStore, 'lead-solace', wellPastDeadline, DEPS);

      expect(resumed.outcome).toBe('ELAPSED');
      expect(resumed.state?.lifecycleState).toBe('NEEDS_HUMAN');

      // Cross-checked against the uninterrupted, single-call replay of the full scenario
      // (same rule, authored timestamps instead of a resumed process) — same outcome.
      const uninterrupted = await runScenario(FULL_SCENARIO, {
        system: LEAD_RESCUE,
        profile: KESTREL,
        handlers: LEAD_RESCUE_HANDLERS,
        provider: new FixtureDecisionProvider(FULL_SCENARIO.judgments),
      });
      expect(resumed.state?.lifecycleState).toBe(uninterrupted.finalState.lifecycleState);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('4. duplicate resume (sequential): re-checking an already-resolved incident is a safe no-op', async () => {
    const store = new InMemoryWaitIncidentStore();
    const parked = await parkSolaceIncident(store);
    const wellPastDeadline = hoursAfter(parked.engineState.facts.waitStartedAt ?? '', 30);

    const first = await checkWaitIncident(store, 'lead-solace', wellPastDeadline, DEPS);
    expect(first.outcome).toBe('ELAPSED');

    const second = await checkWaitIncident(store, 'lead-solace', wellPastDeadline, DEPS);
    expect(second.outcome).toBe('NOT_FOUND');
    expect(second.entries).toBeUndefined();
    expect(second.state).toBeUndefined();
  });

  it('4b. duplicate resume (concurrent): two overlapping checks on the same elapsed incident never both report ELAPSED', async () => {
    const store = new InMemoryWaitIncidentStore();
    const parked = await parkSolaceIncident(store);
    const wellPastDeadline = hoursAfter(parked.engineState.facts.waitStartedAt ?? '', 30);

    const [a, b] = await Promise.all([
      checkWaitIncident(store, 'lead-solace', wellPastDeadline, DEPS),
      checkWaitIncident(store, 'lead-solace', wellPastDeadline, DEPS),
    ]);

    const outcomes = [a.outcome, b.outcome].sort();
    // Exactly one caller resolves it and reports ELAPSED. The loser sees NOT_FOUND — by
    // the time it calls resolve(), the winner has already deleted the record — never a
    // second ELAPSED and never a second notification.
    expect(outcomes).toEqual(['ELAPSED', 'NOT_FOUND'].sort());
    expect(await store.load('lead-solace')).toBeUndefined();
  });

  it('resuming an incident that was never parked is a safe no-op (NOT_FOUND), not an error', async () => {
    const store = new InMemoryWaitIncidentStore();
    const result = await checkWaitIncident(store, 'lead-never-parked', '2026-08-12T00:00:00-04:00', DEPS);
    expect(result.outcome).toBe('NOT_FOUND');
  });

  it('a malformed persisted record surfaces as MalformedWaitRecordError rather than a silent wrong answer', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'lr-wait-resume-test-'));
    try {
      const filePath = path.join(dir, 'wait-incidents.json');
      writeFileSync(
        filePath,
        JSON.stringify({ 'lead-corrupt': { incidentId: 'lead-corrupt', systemId: 'lead-rescue' } }),
        'utf8',
      );
      const store = new FileWaitIncidentStore(filePath);

      await expect(checkWaitIncident(store, 'lead-corrupt', '2026-08-12T00:00:00-04:00', DEPS)).rejects.toBeInstanceOf(
        MalformedWaitRecordError,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
