import { describe, expect, it } from 'vitest';
import { LEAD_RESCUE } from '@/data/systems';
import { KESTREL } from '@/data/profiles/kestrel/profile';
import { LEAD_RESCUE_HANDLERS } from '@/lib/engine/handlers/lead-rescue';
import { leadRescueScenarioBySlug } from '@/data/profiles/kestrel/scenarios/lead-rescue';
import { runScenario } from '@/lib/engine/run';
import { FixtureDecisionProvider } from '@/lib/ports/decision-provider';
import { InMemoryWaitIncidentStore, type WaitIncidentStore } from '@/lib/persistence/wait-incident-store';
import { InMemoryOperationClaimStore } from '@/lib/persistence/operation-claim-store';
import { checkWaitIncident, parkWaitingIncident, type WaitResumeDeps } from '@/lib/engine/wait-resume';
import type { WaitIncidentRecord } from '@/lib/persistence/wait-incident-store';
import type { Scenario } from '@/lib/model/runtime';

/**
 * DETERMINISTIC-RULE FALSIFYING TESTS for lr-t22 ("Offer unanswered", BOOKING_READY ->
 * NEEDS_HUMAN) — the sibling of lr-t14 on a second Lead Rescue waiting state.
 *
 * These tests exercise the handler's own RULE (does `bookingReadyAt` vs `occurredAt` against
 * `bookingOfferWindowHours` compute the right answer, does a superseded/terminal state
 * correctly refuse to fire, do the two waiting categories stay genuinely independent) through
 * the real `checkWaitIncident` orchestration path with plain in-memory stores — no
 * cross-runtime racing here; that lives in `tests/lead-rescue-offer-wait-resume.test.ts`
 * alongside the persistence and claim-execution proofs, mirroring exactly how
 * `tests/lead-rescue-wait-resume.test.ts` and `tests/lead-rescue-wait-resume-concurrency.test.ts`
 * split those two concerns for lr-t14.
 */

const DEPS: WaitResumeDeps = {
  system: LEAD_RESCUE,
  profile: KESTREL,
  handlers: LEAD_RESCUE_HANDLERS,
  reevaluationEventType: 'lead.wait.reevaluated',
};

const FOUND_SCENARIO = leadRescueScenarioBySlug('offer-window-elapses');
if (FOUND_SCENARIO === undefined) throw new Error('fixture scenario "offer-window-elapses" not found');
const FULL_SCENARIO: Scenario = FOUND_SCENARIO;

async function parkOfferIncident(store: WaitIncidentStore, incidentId = 'lead-northgate') {
  const enquiryEvent = FULL_SCENARIO.events[0];
  if (enquiryEvent === undefined) throw new Error('fixture scenario has no events');
  const enquiryOnly: Scenario = { ...FULL_SCENARIO, events: [{ ...enquiryEvent, entityId: incidentId, eventId: `${incidentId}:evt-001` }] };
  const run = await runScenario(enquiryOnly, {
    system: LEAD_RESCUE,
    profile: KESTREL,
    handlers: LEAD_RESCUE_HANDLERS,
    provider: new FixtureDecisionProvider(enquiryOnly.judgments),
  });
  expect(run.finalState.lifecycleState).toBe('BOOKING_READY');
  return parkWaitingIncident(store, LEAD_RESCUE, {
    incidentId,
    correlationId: `inc-${incidentId}`,
    engineState: run.finalState,
  });
}

function hoursAfter(iso: string, hours: number): string {
  return new Date(Date.parse(iso) + hours * 60 * 60 * 1000).toISOString();
}

function baseEngineState(overrides: Partial<WaitIncidentRecord['engineState']> = {}): WaitIncidentRecord['engineState'] {
  return {
    lifecycleState: 'BOOKING_READY',
    facts: {},
    suppressed: false,
    awaitingHuman: null,
    missingInformation: [],
    ...overrides,
  };
}

describe('Lead Rescue lr-t22 — offer-unanswered deterministic rule', () => {
  it('1. the canonical scenario reaches BOOKING_READY directly, through a legitimate complete-and-qualified enquiry (lr-t10)', async () => {
    const incidentStore = new InMemoryWaitIncidentStore();
    const parked = await parkOfferIncident(incidentStore);
    expect(parked.engineState.lifecycleState).toBe('BOOKING_READY');
    expect(parked.engineState.facts.bookingReadyAt).toBeDefined();
    expect(parked.engineState.missingInformation).toEqual([]);
  });

  it('3. too early: a check before the configured window leaves BOOKING_READY untouched, with no transition and no side effect', async () => {
    const store = new InMemoryWaitIncidentStore();
    const claimStore = new InMemoryOperationClaimStore();
    const parked = await parkOfferIncident(store);
    const wellBeforeDeadline = hoursAfter(parked.engineState.facts.bookingReadyAt ?? '', 20);

    const result = await checkWaitIncident(store, claimStore, 'lead-northgate', wellBeforeDeadline, DEPS, 'runtime-a');

    expect(result.outcome).toBe('STILL_WAITING');
    expect(result.state?.lifecycleState).toBe('BOOKING_READY');
    expect(result.entries?.flatMap((e) => e.sideEffects)).toEqual([]);
    expect(result.entries?.flatMap((e) => e.transitions).some((t) => t.accepted)).toBe(false);
    expect(await store.load('lead-northgate')).toEqual(parked);
  });

  it('4. exact boundary: a check at precisely the configured window counts as elapsed, the same inclusive comparison lr-t14 uses', async () => {
    const store = new InMemoryWaitIncidentStore();
    const claimStore = new InMemoryOperationClaimStore();
    const parked = await parkOfferIncident(store);
    const exactlyAtDeadline = hoursAfter(parked.engineState.facts.bookingReadyAt ?? '', 48);

    const result = await checkWaitIncident(store, claimStore, 'lead-northgate', exactlyAtDeadline, DEPS, 'runtime-a');

    expect(result.outcome).toBe('ELAPSED');
    expect(result.state?.lifecycleState).toBe('NEEDS_HUMAN');
  });

  it('one hour before the boundary is still STILL_WAITING — the inclusive comparison is not simply "always true"', async () => {
    const store = new InMemoryWaitIncidentStore();
    const claimStore = new InMemoryOperationClaimStore();
    const parked = await parkOfferIncident(store);
    const oneHourShort = hoursAfter(parked.engineState.facts.bookingReadyAt ?? '', 47);

    const result = await checkWaitIncident(store, claimStore, 'lead-northgate', oneHourShort, DEPS, 'runtime-a');
    expect(result.outcome).toBe('STILL_WAITING');
  });

  it('5-6. elapsed: fires lr-t22 to NEEDS_HUMAN with a decision record naming the trigger, evidence, action, policy, and guardrail', async () => {
    const store = new InMemoryWaitIncidentStore();
    const claimStore = new InMemoryOperationClaimStore();
    const parked = await parkOfferIncident(store);
    const wellPastDeadline = hoursAfter(parked.engineState.facts.bookingReadyAt ?? '', 60);

    const result = await checkWaitIncident(store, claimStore, 'lead-northgate', wellPastDeadline, DEPS, 'runtime-a');

    expect(result.outcome).toBe('ELAPSED');
    expect(result.state?.lifecycleState).toBe('NEEDS_HUMAN');

    const transition = result.entries?.flatMap((e) => e.transitions).find((t) => t.accepted);
    expect(transition?.ruleId).toBe('lr-t22');
    expect(transition?.from).toBe('BOOKING_READY');
    expect(transition?.to).toBe('NEEDS_HUMAN');
    expect(transition?.mechanism).toBe('DETERMINISTIC_RULE');

    const decision = result.entries?.flatMap((e) => e.decisions).find((d) => d.id.endsWith('d-offer-elapsed'));
    expect(decision).toBeDefined();
    // TRIGGER + EVIDENCE
    expect(decision?.evidenceRefs).toEqual(expect.arrayContaining(['state.facts.bookingReadyAt', 'event.occurredAt']));
    // ACTION
    expect(decision?.selectedAction).toBe('escalate_to_human');
    // GUARDRAIL (authority + escalation reason)
    expect(decision?.authority).toBe(2);
    expect(decision?.escalationReason).toBeDefined();
    // POLICY — its OWN policy, not lr-t14's
    expect(decision?.applicablePolicy.some((p) => p.includes('kestrel-booking-offer-window'))).toBe(true);
    expect(decision?.applicablePolicy.some((p) => p.includes('kestrel-reply-wait-window'))).toBe(false);

    const notify = result.entries?.flatMap((e) => e.sideEffects).find((s) => s.idempotencyKey === 'notify:lead-northgate:offer-unanswered');
    expect(notify?.status).toBe('EXECUTED');
    expect(notify?.kind).toBe('NOTIFICATION');

    expect(await store.load('lead-northgate')).toBeUndefined();
  });

  it('12. a superseded/terminal state (BOOKED — the offer WAS answered) never produces a stale lr-t22 escalation', async () => {
    const store = new InMemoryWaitIncidentStore();
    const claimStore = new InMemoryOperationClaimStore();
    // Simulate: the offer was accepted (lr-t21, BOOKING_READY -> BOOKED) through a path this
    // durable record was never told about — the parked snapshot itself is now stale relative
    // to reality, exactly the case a genuinely superseded state must guard against.
    await store.park({
      incidentId: 'lead-booked',
      systemId: LEAD_RESCUE.id,
      correlationId: 'inc-lead-booked',
      engineState: baseEngineState({ lifecycleState: 'BOOKED', facts: { bookingReadyAt: '2026-08-01T00:00:00-04:00' } }),
    });

    const result = await checkWaitIncident(store, claimStore, 'lead-booked', '2026-08-20T00:00:00-04:00', DEPS, 'runtime-a');

    // No recognized waiting condition for BOOKED — safe no-op, not an escalation.
    expect(result.outcome).toBe('STILL_WAITING');
    expect(result.entries?.flatMap((e) => e.sideEffects)).toEqual([]);
    expect(result.entries?.flatMap((e) => e.transitions).some((t) => t.accepted)).toBe(false);
  });

  it('12b. other terminal/suppressed states (DO_NOT_CONTACT, CLOSED_BAD_FIT) are equally safe no-ops, not just BOOKED', async () => {
    const store = new InMemoryWaitIncidentStore();
    const claimStore = new InMemoryOperationClaimStore();
    for (const terminal of ['DO_NOT_CONTACT', 'CLOSED_BAD_FIT', 'ESCALATED'] as const) {
      const incidentId = `lead-terminal-${terminal.toLowerCase()}`;
      await store.park({
        incidentId,
        systemId: LEAD_RESCUE.id,
        correlationId: `inc-${incidentId}`,
        engineState: baseEngineState({ lifecycleState: terminal, facts: { bookingReadyAt: '2026-08-01T00:00:00-04:00' } }),
      });
      const result = await checkWaitIncident(store, claimStore, incidentId, '2026-08-20T00:00:00-04:00', DEPS, 'runtime-a');
      expect(result.outcome, terminal).toBe('STILL_WAITING');
      expect(result.entries?.flatMap((e) => e.sideEffects), terminal).toEqual([]);
    }
  });

  it('15a. a BOOKING_READY incident with a stray leftover waitStartedAt fact is still evaluated by lr-t22\'s own rule and policy, never lr-t14\'s', async () => {
    const store = new InMemoryWaitIncidentStore();
    const claimStore = new InMemoryOperationClaimStore();
    // A contrived, adversarial fact set: BOTH facts present, and waitStartedAt (if it were
    // consulted) would ALSO read as elapsed under lr-t14's 24h window. Only bookingReadyAt
    // may legitimately drive the decision while lifecycleState is BOOKING_READY.
    await store.park({
      incidentId: 'lead-cross-a',
      systemId: LEAD_RESCUE.id,
      correlationId: 'inc-lead-cross-a',
      engineState: baseEngineState({
        lifecycleState: 'BOOKING_READY',
        facts: { bookingReadyAt: '2026-08-18T00:00:00-04:00', waitStartedAt: '2026-08-01T00:00:00-04:00' },
      }),
    });

    // 30h after bookingReadyAt: still short of the 48h booking-offer window, so if the rule
    // correctly reads bookingReadyAt (not the ancient, already-elapsed waitStartedAt), this
    // must be STILL_WAITING.
    const result = await checkWaitIncident(store, claimStore, 'lead-cross-a', '2026-08-19T06:00:00-04:00', DEPS, 'runtime-a');
    expect(result.outcome).toBe('STILL_WAITING');
  });

  it('15b. a WAITING_FOR_REPLY incident with a stray leftover bookingReadyAt fact is still evaluated by lr-t14\'s own rule and policy, never lr-t22\'s', async () => {
    const store = new InMemoryWaitIncidentStore();
    const claimStore = new InMemoryOperationClaimStore();
    // Mirror image of 15a: waitStartedAt is recent (short of lr-t14's 24h window), but a
    // stray bookingReadyAt is old enough that lr-t22's 48h window (if wrongly consulted)
    // would also read as elapsed.
    await store.park({
      incidentId: 'lead-cross-b',
      systemId: LEAD_RESCUE.id,
      correlationId: 'inc-lead-cross-b',
      engineState: baseEngineState({
        lifecycleState: 'WAITING_FOR_REPLY',
        facts: { waitStartedAt: '2026-08-18T00:00:00-04:00', bookingReadyAt: '2026-08-01T00:00:00-04:00' },
      }),
    });

    // 10h after waitStartedAt: short of lr-t14's 24h window.
    const result = await checkWaitIncident(store, claimStore, 'lead-cross-b', '2026-08-18T10:00:00-04:00', DEPS, 'runtime-a');
    expect(result.outcome).toBe('STILL_WAITING');
    expect(result.state?.lifecycleState).toBe('WAITING_FOR_REPLY');
  });

  it('17. a missing recorded bookingReadyAt on a BOOKING_READY incident fails safe: no action, not a guess', async () => {
    const store = new InMemoryWaitIncidentStore();
    const claimStore = new InMemoryOperationClaimStore();
    await store.park({
      incidentId: 'lead-no-fact',
      systemId: LEAD_RESCUE.id,
      correlationId: 'inc-lead-no-fact',
      engineState: baseEngineState({ lifecycleState: 'BOOKING_READY', facts: {} }),
    });

    const result = await checkWaitIncident(store, claimStore, 'lead-no-fact', '2026-08-20T00:00:00-04:00', DEPS, 'runtime-a');
    expect(result.outcome).toBe('STILL_WAITING');
    expect(result.entries?.flatMap((e) => e.sideEffects)).toEqual([]);
    const decision = result.entries?.flatMap((e) => e.decisions)[0];
    expect(decision?.selectedAction).toBe('record_unresolvable_check');
  });
});
