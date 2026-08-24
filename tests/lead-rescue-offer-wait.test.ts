import { describe, expect, it } from 'vitest';
import { LEAD_RESCUE } from '@/data/systems';
import { KESTREL } from '@/data/profiles/kestrel/profile';
import { resolveEscalationOwner } from '@/lib/model/profile';
import { LEAD_RESCUE_HANDLERS } from '@/lib/engine/handlers/lead-rescue';
import { leadRescueScenarioBySlug } from '@/data/profiles/kestrel/scenarios/lead-rescue';
import { runScenario } from '@/lib/engine/run';
import { FixtureDecisionProvider } from '@/lib/ports/decision-provider';
import { FixtureSideEffectExecutor } from '@/lib/ports/side-effect-executor';
import { InMemoryWaitIncidentStore, type WaitIncidentStore } from '@/lib/persistence/wait-incident-store';
import { InMemoryOperationClaimStore } from '@/lib/persistence/operation-claim-store';
import { checkWaitIncident, parkWaitingIncident, type WaitResumeDeps } from '@/lib/engine/wait-resume';
import { applyEvent } from '@/lib/engine/reducer';
import { EventLedger, ExecutionLedger, SideEffectLedger } from '@/lib/engine/ledger';
import type { EngineState } from '@/lib/engine/types';
import type { WaitIncidentRecord } from '@/lib/persistence/wait-incident-store';
import type { CanonicalEvent, Scenario } from '@/lib/model/runtime';

/**
 * DETERMINISTIC-RULE FALSIFYING TESTS for lr-t22 ("Offer unanswered", BOOKING_READY ->
 * NEEDS_HUMAN) — the sibling of lr-t14 on a second Lead Rescue waiting state.
 *
 * SEMANTIC-INTEGRITY CORRECTION, this pass: `BOOKING_READY` means "enough is known to offer
 * a next commercial step" (canon's own words) — a READINESS state, not proof a prospect
 * received anything. Every entry path into it (`lr-t10`, `lr-t16`, and the three
 * `HUMAN_DECISION` re-entries `lr-t24`/`lr-t27`/`lr-t34`) fires, at most, an internal
 * `NOTIFICATION` to the named owner. None of them despatch a message to the prospect. The
 * PRIOR implementation started lr-t22's clock from `bookingReadyAt` — readiness evidence —
 * which means it was measuring "how long has this case sat ready" and calling that "how long
 * has the offer gone unanswered." Those are different claims, and canon's own guard text says
 * so: lr-t22 fires when "the OFFERED next step went unanswered," which presupposes an offer
 * actually reached the prospect.
 *
 * This file now proves the corrected rule: lr-t22's clock starts only at `offerSentAt`, a fact
 * written by exactly one place — `handleOfferDespatched`, for the new `lead.offer.despatched`
 * event — representing a person having explicitly authorized and despatched a prospect-facing
 * offer. `bookingReadyAt` continues to be written by every BOOKING_READY entry path (now
 * including the three HUMAN_DECISION re-entries, closing the coverage gap
 * `docs/STATUS.md` named), but it no longer drives this rule at all.
 *
 * These tests exercise the handler's own RULE (does `offerSentAt` vs `occurredAt` against
 * `bookingOfferWindowHours` compute the right answer, does readiness alone ever leak into
 * proof-of-offer, does a superseded/terminal state correctly refuse to fire, do the two
 * waiting categories stay genuinely independent) through the real `checkWaitIncident`
 * orchestration path with plain in-memory stores — no cross-runtime racing here; that lives in
 * `tests/lead-rescue-offer-wait-resume.test.ts` alongside the persistence and claim-execution
 * proofs, mirroring exactly how `tests/lead-rescue-wait-resume.test.ts` and
 * `tests/lead-rescue-wait-resume-concurrency.test.ts` split those two concerns for lr-t14.
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

/** Every event up to (not including) the first re-evaluation check — the genuine setup. */
function setupEvents(scenario: Scenario, incidentId: string): CanonicalEvent[] {
  const events: CanonicalEvent[] = [];
  for (const e of scenario.events) {
    if (e.type === 'lead.wait.reevaluated') break;
    events.push({ ...e, entityId: incidentId, eventId: `${incidentId}:evt-${String(events.length + 1).padStart(3, '0')}` });
  }
  if (events.length === 0) throw new Error('scenario has no setup events');
  return events;
}

/** Runs the real enquiry AND the real offer-despatch event — genuine offer-sent evidence. */
async function parkOfferIncident(store: WaitIncidentStore, incidentId = 'lead-northgate') {
  const scenarioWithSetup: Scenario = { ...FULL_SCENARIO, events: setupEvents(FULL_SCENARIO, incidentId) };
  const run = await runScenario(scenarioWithSetup, {
    system: LEAD_RESCUE,
    profile: KESTREL,
    handlers: LEAD_RESCUE_HANDLERS,
    provider: new FixtureDecisionProvider(scenarioWithSetup.judgments),
  });
  expect(run.finalState.lifecycleState).toBe('BOOKING_READY');
  expect(run.finalState.facts.offerSentAt).toBeDefined();
  return parkWaitingIncident(store, LEAD_RESCUE, {
    incidentId,
    correlationId: `inc-${incidentId}`,
    engineState: run.finalState,
  });
}

/** Applies exactly one event against an already-reached EngineState, outside any scenario. */
function runEventAgainst(state: EngineState, event: CanonicalEvent): EngineState {
  return applyEvent(state, event, {
    system: LEAD_RESCUE,
    profile: KESTREL,
    handlers: LEAD_RESCUE_HANDLERS,
    judgments: new Map(),
    internals: { effects: new SideEffectLedger(), events: new EventLedger(), executions: new ExecutionLedger() },
  }).state;
}

/** Runs ONLY the enquiry (lr-t10) — reaches BOOKING_READY with no offer ever despatched. */
async function readyWithNoOfferDespatched(incidentId = 'lead-no-despatch') {
  const enquiryEvent = FULL_SCENARIO.events[0];
  if (enquiryEvent === undefined) throw new Error('fixture scenario has no events');
  const enquiryOnly: Scenario = {
    ...FULL_SCENARIO,
    events: [{ ...enquiryEvent, entityId: incidentId, eventId: `${incidentId}:evt-001` }],
  };
  return runScenario(enquiryOnly, {
    system: LEAD_RESCUE,
    profile: KESTREL,
    handlers: LEAD_RESCUE_HANDLERS,
    provider: new FixtureDecisionProvider(enquiryOnly.judgments),
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
  it('1. the canonical scenario reaches BOOKING_READY directly (lr-t10), and the offer-wait clock starts only once a real offer-despatch event is processed', async () => {
    const incidentStore = new InMemoryWaitIncidentStore();
    const parked = await parkOfferIncident(incidentStore);
    expect(parked.engineState.lifecycleState).toBe('BOOKING_READY');
    // Readiness evidence — written the moment BOOKING_READY is entered.
    expect(parked.engineState.facts.bookingReadyAt).toBeDefined();
    // Offer-sent evidence — written later, by a genuinely separate event.
    expect(parked.engineState.facts.offerSentAt).toBeDefined();
    expect(Date.parse(parked.engineState.facts.offerSentAt ?? '')).toBeGreaterThanOrEqual(
      Date.parse(parked.engineState.facts.bookingReadyAt ?? ''),
    );
    expect(parked.engineState.missingInformation).toEqual([]);
  });

  it('2. human clearance without a despatched offer (lr-t10 alone) never starts the offer-wait clock, no matter how long it sits — lr-t22 never fires without offerSentAt', async () => {
    const run = await readyWithNoOfferDespatched();
    expect(run.finalState.lifecycleState).toBe('BOOKING_READY');
    expect(run.finalState.facts.bookingReadyAt).toBeDefined();
    expect(run.finalState.facts.offerSentAt).toBeUndefined();

    const store = new InMemoryWaitIncidentStore();
    const claimStore = new InMemoryOperationClaimStore();
    await parkWaitingIncident(store, LEAD_RESCUE, {
      incidentId: 'lead-no-despatch',
      correlationId: 'inc-lead-no-despatch',
      engineState: run.finalState,
    });

    // Ten thousand hours — far past any configured window. lr-t22 (which requires offerSentAt)
    // never fires and the lifecycle never moves, because nothing here is evidence a prospect
    // ever received anything. The ready-but-undespatched attention condition DOES fire — that
    // is the separate, correctly-scoped operational-attention gap this pass closes.
    const farInTheFuture = hoursAfter(run.finalState.facts.bookingReadyAt ?? '', 10_000);
    const result = await checkWaitIncident(store, claimStore, 'lead-no-despatch', farInTheFuture, DEPS, 'runtime-a');

    expect(result.outcome).toBe('ATTENTION_OVERDUE');
    expect(result.state?.lifecycleState).toBe('BOOKING_READY');
    expect(result.state?.facts.offerSentAt).toBeUndefined();
    expect(result.entries?.flatMap((e) => e.transitions)).toEqual([]);
    expect(result.entries?.flatMap((e) => e.sideEffects).some((s) => s.idempotencyKey.endsWith(':offer-unanswered'))).toBe(false);
  });

  it('3. an owner-only NOTIFICATION at BOOKING_READY entry is not offer evidence — a genuinely different effect kind and recipient from a despatched offer', async () => {
    const run = await readyWithNoOfferDespatched('lead-owner-notify-only');
    const notify = run.sideEffects.find((e) => e.idempotencyKey.startsWith('notify:'));
    expect(notify?.status).toBe('EXECUTED');
    expect(notify?.kind).toBe('NOTIFICATION');
    // Resolved from the profile's own configured roles, not the retired "Named owner"
    // simulation placeholder — see lib/model/profile.ts's resolveEscalationOwner.
    expect(notify?.target).toBe(resolveEscalationOwner(KESTREL, 3).target);
    // The enquiry's own acknowledgement IS a MESSAGE_SEND to the prospect — but it explicitly
    // makes no commitment (see its own decision record). It is not, and must never be read
    // as, the offer itself: no `offer:`-prefixed effect exists from lr-t10 alone.
    expect(run.sideEffects.some((e) => e.idempotencyKey.startsWith('offer:'))).toBe(false);
    expect(run.finalState.facts.offerSentAt).toBeUndefined();
  });

  it('4. too early: a check before the configured window leaves BOOKING_READY untouched, with no transition and no side effect', async () => {
    const store = new InMemoryWaitIncidentStore();
    const claimStore = new InMemoryOperationClaimStore();
    const parked = await parkOfferIncident(store);
    const wellBeforeDeadline = hoursAfter(parked.engineState.facts.offerSentAt ?? '', 20);

    const result = await checkWaitIncident(store, claimStore, 'lead-northgate', wellBeforeDeadline, DEPS, 'runtime-a');

    expect(result.outcome).toBe('STILL_WAITING');
    expect(result.state?.lifecycleState).toBe('BOOKING_READY');
    expect(result.entries?.flatMap((e) => e.sideEffects)).toEqual([]);
    expect(result.entries?.flatMap((e) => e.transitions).some((t) => t.accepted)).toBe(false);
    expect(await store.load('lead-northgate')).toEqual(parked);
  });

  it('5. exact boundary: a check at precisely the configured window counts as elapsed, the same inclusive comparison lr-t14 uses', async () => {
    const store = new InMemoryWaitIncidentStore();
    const claimStore = new InMemoryOperationClaimStore();
    const parked = await parkOfferIncident(store);
    const exactlyAtDeadline = hoursAfter(parked.engineState.facts.offerSentAt ?? '', 48);

    const result = await checkWaitIncident(store, claimStore, 'lead-northgate', exactlyAtDeadline, DEPS, 'runtime-a');

    expect(result.outcome).toBe('ELAPSED');
    expect(result.state?.lifecycleState).toBe('NEEDS_HUMAN');
  });

  it('one hour before the boundary is still STILL_WAITING — the inclusive comparison is not simply "always true"', async () => {
    const store = new InMemoryWaitIncidentStore();
    const claimStore = new InMemoryOperationClaimStore();
    const parked = await parkOfferIncident(store);
    const oneHourShort = hoursAfter(parked.engineState.facts.offerSentAt ?? '', 47);

    const result = await checkWaitIncident(store, claimStore, 'lead-northgate', oneHourShort, DEPS, 'runtime-a');
    expect(result.outcome).toBe('STILL_WAITING');
  });

  it('6-7. elapsed: fires lr-t22 to NEEDS_HUMAN with a decision record naming the trigger, evidence, action, policy, and guardrail', async () => {
    const store = new InMemoryWaitIncidentStore();
    const claimStore = new InMemoryOperationClaimStore();
    const parked = await parkOfferIncident(store);
    const wellPastDeadline = hoursAfter(parked.engineState.facts.offerSentAt ?? '', 60);

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
    // TRIGGER + EVIDENCE — offerSentAt, never bookingReadyAt
    expect(decision?.evidenceRefs).toEqual(expect.arrayContaining(['state.facts.offerSentAt', 'event.occurredAt']));
    expect(decision?.evidenceRefs).not.toContain('state.facts.bookingReadyAt');
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
    // A contrived, adversarial fact set: offerSentAt is recent, but a stray waitStartedAt is
    // old enough that lr-t14's 24h window (if it were wrongly consulted) would already read
    // as elapsed. Only offerSentAt may legitimately drive the decision while lifecycleState
    // is BOOKING_READY — bookingReadyAt (readiness) is present too and must be equally inert.
    await store.park({
      incidentId: 'lead-cross-a',
      systemId: LEAD_RESCUE.id,
      correlationId: 'inc-lead-cross-a',
      engineState: baseEngineState({
        lifecycleState: 'BOOKING_READY',
        facts: {
          bookingReadyAt: '2026-08-17T12:00:00-04:00',
          offerSentAt: '2026-08-18T00:00:00-04:00',
          waitStartedAt: '2026-08-01T00:00:00-04:00',
        },
      }),
    });

    // 30h after offerSentAt: still short of the 48h booking-offer window, so if the rule
    // correctly reads offerSentAt (not the ancient, already-elapsed waitStartedAt, and not
    // bookingReadyAt either), this must be STILL_WAITING.
    const result = await checkWaitIncident(store, claimStore, 'lead-cross-a', '2026-08-19T06:00:00-04:00', DEPS, 'runtime-a');
    expect(result.outcome).toBe('STILL_WAITING');
  });

  it('15b. a WAITING_FOR_REPLY incident with a stray leftover offerSentAt/bookingReadyAt fact is still evaluated by lr-t14\'s own rule and policy, never lr-t22\'s', async () => {
    const store = new InMemoryWaitIncidentStore();
    const claimStore = new InMemoryOperationClaimStore();
    // Mirror image of 15a: waitStartedAt is recent (short of lr-t14's 24h window), but stray
    // offerSentAt and bookingReadyAt facts are old enough that lr-t22's 48h window (if wrongly
    // consulted) would also read as elapsed.
    await store.park({
      incidentId: 'lead-cross-b',
      systemId: LEAD_RESCUE.id,
      correlationId: 'inc-lead-cross-b',
      engineState: baseEngineState({
        lifecycleState: 'WAITING_FOR_REPLY',
        facts: {
          waitStartedAt: '2026-08-18T00:00:00-04:00',
          bookingReadyAt: '2026-08-01T00:00:00-04:00',
          offerSentAt: '2026-08-01T00:00:00-04:00',
        },
      }),
    });

    // 10h after waitStartedAt: short of lr-t14's 24h window.
    const result = await checkWaitIncident(store, claimStore, 'lead-cross-b', '2026-08-18T10:00:00-04:00', DEPS, 'runtime-a');
    expect(result.outcome).toBe('STILL_WAITING');
    expect(result.state?.lifecycleState).toBe('WAITING_FOR_REPLY');
  });

  it('17. a BOOKING_READY incident with readiness but no despatched offer never misreads bookingReadyAt as offer evidence — lr-t22 fails safe, only the dispatch-timeout attention rule may fire', async () => {
    const store = new InMemoryWaitIncidentStore();
    const claimStore = new InMemoryOperationClaimStore();
    // The exact shape the prior implementation got wrong: bookingReadyAt IS present (the
    // case is genuinely ready), but offerSentAt is absent because no one has despatched an
    // offer yet. This must never be read as "offer unanswered" (lr-t22) — it is governed
    // exclusively by the separate ready-but-undespatched attention rule.
    await store.park({
      incidentId: 'lead-no-fact',
      systemId: LEAD_RESCUE.id,
      correlationId: 'inc-lead-no-fact',
      engineState: baseEngineState({
        lifecycleState: 'BOOKING_READY',
        facts: { bookingReadyAt: '2026-01-01T00:00:00-04:00' },
      }),
    });

    const result = await checkWaitIncident(store, claimStore, 'lead-no-fact', '2026-08-20T00:00:00-04:00', DEPS, 'runtime-a');
    expect(result.outcome).toBe('ATTENTION_OVERDUE');
    expect(result.state?.lifecycleState).toBe('BOOKING_READY');
    expect(result.entries?.flatMap((e) => e.transitions)).toEqual([]);
    expect(result.entries?.flatMap((e) => e.sideEffects).some((s) => s.idempotencyKey.endsWith(':offer-unanswered'))).toBe(false);
    const decision = result.entries?.flatMap((e) => e.decisions).find((d) => d.id.includes('dispatch-overdue'));
    expect(decision?.selectedAction).toBe('escalate_attention_to_next_owner');
  });

  // -------------------------------------------------------------------------
  // The three HUMAN_DECISION re-entries into BOOKING_READY (lr-t24, lr-t27, lr-t34):
  // each must reach BOOKING_READY through its own canonical originating state, write
  // bookingReadyAt (readiness), and NOT write offerSentAt (no offer was despatched).
  // -------------------------------------------------------------------------

  it('lr-t24 (NEEDS_HUMAN -> BOOKING_READY): the existing ambiguous-high-risk scenario now records readiness evidence, and only readiness evidence', async () => {
    const found = leadRescueScenarioBySlug('ambiguous-high-risk');
    if (found === undefined) throw new Error('scenario not found');
    const run = await runScenario(found, {
      system: LEAD_RESCUE,
      profile: KESTREL,
      handlers: LEAD_RESCUE_HANDLERS,
      provider: new FixtureDecisionProvider(found.judgments),
    });

    expect(run.finalState.lifecycleState).toBe('BOOKING_READY');
    const transition = run.transitions.find((t) => t.ruleId === 'lr-t24');
    expect(transition?.accepted).toBe(true);
    expect(transition?.from).toBe('NEEDS_HUMAN');
    expect(transition?.to).toBe('BOOKING_READY');
    expect(run.finalState.facts.bookingReadyAt).toBeDefined();
    expect(run.finalState.facts.offerSentAt).toBeUndefined();
  });

  it('lr-t34 (SUPPRESSION_REVIEW -> BOOKING_READY): the existing restricted-contact-review scenario now records readiness evidence, and only readiness evidence', async () => {
    const found = leadRescueScenarioBySlug('restricted-contact-review');
    if (found === undefined) throw new Error('scenario not found');
    const run = await runScenario(found, {
      system: LEAD_RESCUE,
      profile: KESTREL,
      handlers: LEAD_RESCUE_HANDLERS,
      provider: new FixtureDecisionProvider(found.judgments),
    });

    expect(run.finalState.lifecycleState).toBe('BOOKING_READY');
    const transition = run.transitions.find((t) => t.ruleId === 'lr-t34');
    expect(transition?.accepted).toBe(true);
    expect(transition?.from).toBe('SUPPRESSION_REVIEW');
    expect(transition?.to).toBe('BOOKING_READY');
    expect(run.finalState.facts.bookingReadyAt).toBeDefined();
    expect(run.finalState.facts.offerSentAt).toBeUndefined();
  });

  it('lr-t27 (ESCALATED -> BOOKING_READY): a case raised past the first owner and then cleared reaches BOOKING_READY through its own canonical originating state', async () => {
    const events: CanonicalEvent[] = [
      {
        eventId: 'evt-meridian-001',
        correlationId: 'inc-lr-meridian',
        entityId: 'lead-meridian',
        type: 'inbound.enquiry.received',
        source: 'shared-inbox',
        sourceEventId: 'inbox-2026-08-05-0001',
        occurredAt: '2026-08-05T09:00:00-04:00',
        receivedAt: '2026-08-05T09:00:00-04:00',
        schemaVersion: '2026-08-01',
        actor: 'EXTERNAL_PARTY',
        executionMode: 'SIMULATED',
        payload: {
          contactName: 'Sam Okoye',
          contactEmail: 's.okoye@meridianactuarial.example',
          company: 'Meridian Actuarial',
          channel: 'shared-inbox',
          consentState: 'PERMITTED',
          requiredFields: ['framework', 'target_audit_window', 'headcount'],
          message: 'Can you guarantee our audit outcome? We need this locked in before our board meets.',
          judgment: {
            judgmentId: 'jd-meridian-intake',
            objective: 'Classify an inbound enquiry into the permitted set.',
            input: 'Can you guarantee our audit outcome? We need this locked in before our board meets.',
            permittedClassifications: ['QUALIFIED_ENQUIRY', 'NEEDS_MORE_INFORMATION', 'OUT_OF_SEGMENT', 'NOT_AN_ENQUIRY', 'POLICY_SENSITIVE'],
            requiredFields: ['framework', 'target_audit_window', 'headcount'],
          },
        },
      },
      {
        eventId: 'evt-meridian-002',
        correlationId: 'inc-lr-meridian',
        entityId: 'lead-meridian',
        type: 'human.decision.recorded',
        source: 'operator-console',
        sourceEventId: 'console-2026-08-05-0100',
        occurredAt: '2026-08-05T09:30:00-04:00',
        receivedAt: '2026-08-05T09:30:00-04:00',
        schemaVersion: '2026-08-01',
        actor: 'HUMAN',
        executionMode: 'SIMULATED',
        payload: {
          decidedBy: 'client-partner',
          decision: 'ESCALATE',
          rationale: 'A guarantee request needs the founder’s sign-off before anyone replies.',
        },
      },
      {
        eventId: 'evt-meridian-003',
        correlationId: 'inc-lr-meridian',
        entityId: 'lead-meridian',
        type: 'human.decision.recorded',
        source: 'operator-console',
        sourceEventId: 'console-2026-08-05-0200',
        occurredAt: '2026-08-05T14:00:00-04:00',
        receivedAt: '2026-08-05T14:00:00-04:00',
        schemaVersion: '2026-08-01',
        actor: 'HUMAN',
        executionMode: 'SIMULATED',
        payload: {
          decidedBy: 'founder',
          decision: 'CLEARED_TO_PROCEED',
          rationale: 'Replied personally: no outcome guarantee, offered a scoping call instead. Cleared to proceed on that basis.',
        },
      },
    ];
    const scenario: Scenario = {
      id: 'lr-scenario-lrt27-direct-test',
      slug: 'lrt27-direct-test',
      systemId: 'lead-rescue',
      title: 'Direct test: lr-t27',
      summary: 'Direct test only, not a canonical demo scenario.',
      demonstrates: [],
      expectedFinalState: 'BOOKING_READY',
      judgments: {
        'jd-meridian-intake': {
          judgmentId: 'jd-meridian-intake',
          classification: 'POLICY_SENSITIVE',
          confidence: 0.55,
          missingInformation: ['framework', 'target_audit_window', 'headcount'],
          evidenceRefs: ['"can you guarantee our audit outcome"'],
          declinedToInfer: ['Which framework, timeline, or headcount applies — none stated'],
          rationaleSummary: 'An outcome guarantee is requested outright with no other detail. Ambiguous and policy-sensitive.',
        },
      },
      events,
    };

    const run = await runScenario(scenario, {
      system: LEAD_RESCUE,
      profile: KESTREL,
      handlers: LEAD_RESCUE_HANDLERS,
      provider: new FixtureDecisionProvider(scenario.judgments),
    });

    expect(run.finalState.lifecycleState).toBe('BOOKING_READY');
    const escalate = run.transitions.find((t) => t.ruleId === 'lr-t23');
    expect(escalate?.accepted).toBe(true);
    expect(escalate?.to).toBe('ESCALATED');
    const cleared = run.transitions.find((t) => t.ruleId === 'lr-t27');
    expect(cleared?.accepted).toBe(true);
    expect(cleared?.from).toBe('ESCALATED');
    expect(cleared?.to).toBe('BOOKING_READY');
    expect(run.finalState.facts.bookingReadyAt).toBeDefined();
    expect(run.finalState.facts.offerSentAt).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // Offer despatch itself: the new lead.offer.despatched event and its guardrails.
  // -------------------------------------------------------------------------

  it('the despatch effect is addressed to the prospect, not the named owner — a genuinely different action from BOOKING_READY entry\'s own NOTIFICATION', async () => {
    const scenarioWithSetup: Scenario = { ...FULL_SCENARIO, events: setupEvents(FULL_SCENARIO, 'lead-despatch-shape') };
    const run = await runScenario(scenarioWithSetup, {
      system: LEAD_RESCUE,
      profile: KESTREL,
      handlers: LEAD_RESCUE_HANDLERS,
      provider: new FixtureDecisionProvider(scenarioWithSetup.judgments),
    });

    const ownerNotification = run.sideEffects.find((e) => e.kind === 'NOTIFICATION');
    expect(ownerNotification?.target).toBe(resolveEscalationOwner(KESTREL, 3).target);

    const offerSend = run.sideEffects.find((e) => e.kind === 'MESSAGE_SEND' && e.idempotencyKey.startsWith('offer:'));
    expect(offerSend?.status).toBe('EXECUTED');
    expect(offerSend?.target).not.toBe(resolveEscalationOwner(KESTREL, 3).target);

    expect(run.finalState.facts.offerSentAt).toBeDefined();
    expect(Date.parse(run.finalState.facts.offerSentAt ?? '')).toBeGreaterThanOrEqual(
      Date.parse(run.finalState.facts.bookingReadyAt ?? ''),
    );
  });

  it('lead.offer.despatched is a safe no-op outside BOOKING_READY — it cannot manufacture readiness or send anything', async () => {
    const scenario: Scenario = {
      id: 'lr-scenario-despatch-guard',
      slug: 'despatch-guard-direct-test',
      systemId: 'lead-rescue',
      title: 'Direct test: despatch guard',
      summary: 'Direct test only.',
      demonstrates: [],
      expectedFinalState: 'NEW',
      judgments: {},
      events: [
        {
          eventId: 'evt-guard-001',
          correlationId: 'inc-lead-despatch-guard',
          entityId: 'lead-despatch-guard',
          type: 'lead.offer.despatched',
          source: 'operator-console',
          sourceEventId: 'console-guard-001',
          occurredAt: '2026-08-13T01:00:00-04:00',
          receivedAt: '2026-08-13T01:00:00-04:00',
          schemaVersion: '2026-08-01',
          actor: 'HUMAN',
          executionMode: 'SIMULATED',
          payload: { decidedBy: 'founder', target: 'prospect@example.com', offerSummary: 'Offered a scoping call.' },
        },
      ],
    };
    const result = await runScenario(scenario, {
      system: LEAD_RESCUE,
      profile: KESTREL,
      handlers: LEAD_RESCUE_HANDLERS,
      provider: new FixtureDecisionProvider(scenario.judgments),
    });
    // A despatch event with no case ever having reached BOOKING_READY (still NEW): a safe no-op.
    expect(result.finalState.lifecycleState).toBe('NEW');
    expect(result.finalState.facts.offerSentAt).toBeUndefined();
    expect(result.sideEffects.some((e) => e.kind === 'MESSAGE_SEND')).toBe(false);
  });

  it('re-entering BOOKING_READY after an elapsed offer, without despatching a new one, does not restart the timer — the stale offerSentAt still governs', async () => {
    const store = new InMemoryWaitIncidentStore();
    const claimStore = new InMemoryOperationClaimStore();
    const parked = await parkOfferIncident(store, 'lead-restart-check');
    const originalOfferSentAt = parked.engineState.facts.offerSentAt ?? '';

    const elapsed = await checkWaitIncident(
      store,
      claimStore,
      'lead-restart-check',
      hoursAfter(originalOfferSentAt, 60),
      DEPS,
      'runtime-a',
    );
    expect(elapsed.outcome).toBe('ELAPSED');
    expect(elapsed.state?.lifecycleState).toBe('NEEDS_HUMAN');
    if (elapsed.state === undefined) throw new Error('expected a resulting state');

    // A person clears the case again (lr-t24), WITHOUT a fresh offer despatch.
    const clearedState = runEventAgainst(elapsed.state, {
      eventId: 'evt-restart-clear',
      correlationId: 'inc-lead-restart-check',
      entityId: 'lead-restart-check',
      type: 'human.decision.recorded',
      source: 'operator-console',
      sourceEventId: 'console-restart-clear',
      occurredAt: hoursAfter(originalOfferSentAt, 61),
      receivedAt: hoursAfter(originalOfferSentAt, 61),
      schemaVersion: '2026-08-01',
      actor: 'HUMAN',
      executionMode: 'SIMULATED',
      payload: { decidedBy: 'client-partner', decision: 'CLEARED_TO_PROCEED', rationale: 'Reviewed again, still worth pursuing.' },
    });

    expect(clearedState.lifecycleState).toBe('BOOKING_READY');
    // bookingReadyAt moved forward (fresh readiness); offerSentAt did NOT — no new offer went out.
    expect(clearedState.facts.offerSentAt).toBe(originalOfferSentAt);
  });

  it('confirmed vs. uncertain despatch outcomes are tracked independently of whether the offer-wait clock starts', async () => {
    const events = setupEvents(FULL_SCENARIO, 'lead-uncertain-despatch');
    const despatchEvent = events[events.length - 1];
    if (despatchEvent === undefined) throw new Error('no despatch event in fixture');
    events[events.length - 1] = {
      ...despatchEvent,
      payload: {
        ...despatchEvent.payload,
        sendAttempts: [
          {
            attemptId: 'test-offer-uncertain-1',
            idempotencyKey: `offer:lead-uncertain-despatch:${despatchEvent.eventId}`,
            provider: 'transactional-email',
            description: 'Offer of a next commercial step despatched to the prospect.',
            honorsIdempotencyKey: false,
          },
        ],
      },
    };
    const scenario: Scenario = { ...FULL_SCENARIO, events };
    const run = await runScenario(scenario, {
      system: LEAD_RESCUE,
      profile: KESTREL,
      handlers: LEAD_RESCUE_HANDLERS,
      provider: new FixtureDecisionProvider(scenario.judgments),
      executor: new FixtureSideEffectExecutor(
        { 'test-offer-uncertain-1': { kind: 'OUTCOME_UNKNOWN', reason: 'connection dropped before confirmation' } },
        {},
      ),
    });

    const offerEffect = run.sideEffects.find((e) => e.kind === 'MESSAGE_SEND' && e.idempotencyKey.startsWith('offer:'));
    expect(offerEffect?.status).toBe('OUTCOME_UNKNOWN');
    // The business fact is still written — this build's fidelity records "the system
    // authorized and attempted despatch," not "a provider confirmed delivery," the same
    // level every other outbound effect in this portfolio (ack, question) already commits to.
    expect(run.finalState.facts.offerSentAt).toBeDefined();
  });
});
