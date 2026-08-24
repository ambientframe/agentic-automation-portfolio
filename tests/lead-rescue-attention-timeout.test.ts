import { describe, expect, it } from 'vitest';
import { LEAD_RESCUE } from '@/data/systems';
import { KESTREL } from '@/data/profiles/kestrel/profile';
import { LEAD_RESCUE_HANDLERS } from '@/lib/engine/handlers/lead-rescue';
import { leadRescueScenarioBySlug } from '@/data/profiles/kestrel/scenarios/lead-rescue';
import { runScenario } from '@/lib/engine/run';
import { FixtureDecisionProvider } from '@/lib/ports/decision-provider';
import { InMemoryWaitIncidentStore, type WaitIncidentRecord, type WaitIncidentStore } from '@/lib/persistence/wait-incident-store';
import { InMemoryOperationClaimStore } from '@/lib/persistence/operation-claim-store';
import { applyHumanDecision, checkWaitIncident, dispatchAuthorizedOffer, type WaitResumeDeps } from '@/lib/engine/wait-resume';
import type { CanonicalEvent, Scenario } from '@/lib/model/runtime';

/**
 * FALSIFYING TESTS for the human-review and ready-but-undespatched ATTENTION TIMEOUT —
 * closing `lr-fm-approval-timeout` ("HUMAN_APPROVAL_TIMEOUT": a case held for human approval
 * is never actioned; the lead decays silently while the system reports it as correctly
 * parked).
 *
 * Two genuinely different sub-conditions share the same shape as lr-t14/lr-t22 (a stable
 * start-of-wait fact compared against a configured window) but with one deliberate
 * difference: NEITHER ever moves the business lifecycle state. This is an OPERATIONAL
 * ATTENTION signal ("a human has not acted in time"), never a business decision the system
 * is not authorized to make. `checkWaitIncident`'s existing ELAPSED path (lr-t14/lr-t22)
 * resolves the incident and moves the lifecycle state; the new `ATTENTION_OVERDUE` path
 * durably records the overdue condition (via the same claim store) and leaves the incident
 * parked, unresolved, in its original lifecycle state.
 *
 *   - Review timeout: NEEDS_HUMAN / ESCALATED / SUPPRESSION_REVIEW, anchored on a new fact,
 *     `reviewStartedAt`, written once at genuine entry into human review.
 *   - Dispatch timeout: BOOKING_READY with no `offerSentAt`, anchored on the existing
 *     `bookingReadyAt` fact (readiness evidence already established by the prior pass).
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

function baseEngineState(overrides: Partial<WaitIncidentRecord['engineState']> = {}): WaitIncidentRecord['engineState'] {
  return {
    lifecycleState: 'NEEDS_HUMAN',
    facts: {},
    suppressed: false,
    awaitingHuman: 'Policy-sensitive content detected.',
    missingInformation: [],
    ...overrides,
  };
}

/** Runs ONLY the enquiry event — reaches NEEDS_HUMAN with zero autonomous action (lr-t11). */
async function parkReviewIncident(store: WaitIncidentStore, incidentId = 'lead-review'): Promise<WaitIncidentRecord> {
  const enquiryEvent = REVIEW_FULL_SCENARIO.events[0];
  if (enquiryEvent === undefined) throw new Error('fixture scenario has no events');
  const enquiryOnly: Scenario = {
    ...REVIEW_FULL_SCENARIO,
    events: [{ ...enquiryEvent, entityId: incidentId, eventId: `${incidentId}:evt-001` }],
  };
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

/** Runs ONLY the enquiry event (lr-t10) — reaches BOOKING_READY with no offer ever despatched. */
async function parkReadyIncident(store: WaitIncidentStore, incidentId = 'lead-ready'): Promise<WaitIncidentRecord> {
  const enquiryEvent = OFFER_FULL_SCENARIO.events[0];
  if (enquiryEvent === undefined) throw new Error('fixture scenario has no events');
  const enquiryOnly: Scenario = {
    ...OFFER_FULL_SCENARIO,
    events: [{ ...enquiryEvent, entityId: incidentId, eventId: `${incidentId}:evt-001` }],
  };
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

function decisionEvent(incidentId: string, occurredAt: string): CanonicalEvent {
  return {
    eventId: `${incidentId}:decide-001`,
    correlationId: `inc-${incidentId}`,
    entityId: incidentId,
    type: 'human.decision.recorded',
    source: 'operator-console',
    sourceEventId: `decide:${incidentId}`,
    occurredAt,
    receivedAt: occurredAt,
    schemaVersion: 'wait-resume-1',
    actor: 'HUMAN',
    executionMode: 'SIMULATED',
    payload: {
      decidedBy: 'client-partner',
      decision: 'CLEARED_TO_PROCEED',
      rationale: 'Legal question resolved out of band. Clearing to proceed.',
    },
  };
}

describe('Lead Rescue attention timeout — review (lr-fm-approval-timeout)', () => {
  it('1. NEEDS_HUMAN is reached with a genuine reviewStartedAt anchor, written once at entry', async () => {
    const store = new InMemoryWaitIncidentStore();
    const parked = await parkReviewIncident(store);
    expect(parked.engineState.facts.reviewStartedAt).toBeDefined();
  });

  it('3. a check before the configured review window leaves the case untouched: no transition, no side effect', async () => {
    const store = new InMemoryWaitIncidentStore();
    const claimStore = new InMemoryOperationClaimStore();
    const parked = await parkReviewIncident(store);
    const wellBeforeDeadline = hoursAfter(parked.engineState.facts.reviewStartedAt ?? '', 5);

    const result = await checkWaitIncident(store, claimStore, 'lead-review', wellBeforeDeadline, DEPS, 'runtime-a');

    expect(result.outcome).toBe('STILL_WAITING');
    expect(result.state?.lifecycleState).toBe('NEEDS_HUMAN');
    expect(result.entries?.flatMap((e) => e.sideEffects)).toEqual([]);
    expect(await store.load('lead-review')).toEqual(parked);
  });

  it('5+7. crossing the review deadline records an overdue condition exactly once, leaves the lead NEEDS_HUMAN, and never fabricates a decision', async () => {
    const store = new InMemoryWaitIncidentStore();
    const claimStore = new InMemoryOperationClaimStore();
    const parked = await parkReviewIncident(store);
    const wellPastDeadline = hoursAfter(parked.engineState.facts.reviewStartedAt ?? '', 30);

    const result = await checkWaitIncident(store, claimStore, 'lead-review', wellPastDeadline, DEPS, 'runtime-a');

    expect(result.outcome).toBe('ATTENTION_OVERDUE');
    expect(result.state?.lifecycleState).toBe('NEEDS_HUMAN');
    // No transition was ever proposed or accepted — the lifecycle move never happened,
    // it was never attempted and rejected either.
    expect(result.entries?.flatMap((e) => e.transitions)).toEqual([]);
    // No HUMAN_DECISION mechanism anywhere in this result — nothing synthesizes a decision.
    expect(result.entries?.flatMap((e) => e.decisions).every((d) => d.mechanism !== 'HUMAN_DECISION')).toBe(true);

    const notify = result.entries?.flatMap((e) => e.sideEffects).find((s) => s.idempotencyKey === 'notify:lead-review:review-overdue');
    expect(notify?.status).toBe('EXECUTED');
    expect(notify?.kind).toBe('NOTIFICATION');

    // The incident stays parked — still under review, not resolved by the timeout itself.
    const stillParked = await store.load('lead-review');
    expect(stillParked?.engineState.lifecycleState).toBe('NEEDS_HUMAN');
    expect(stillParked?.revision).toBe(parked.revision);
  });

  it('11+12. repeated checks past the deadline are idempotent: exactly one EXECUTED notification across two sequential calls', async () => {
    const store = new InMemoryWaitIncidentStore();
    const claimStore = new InMemoryOperationClaimStore();
    const parked = await parkReviewIncident(store);
    const wellPastDeadline = hoursAfter(parked.engineState.facts.reviewStartedAt ?? '', 30);

    const first = await checkWaitIncident(store, claimStore, 'lead-review', wellPastDeadline, DEPS, 'runtime-a');
    const second = await checkWaitIncident(store, claimStore, 'lead-review', hoursAfter(wellPastDeadline, 1), DEPS, 'runtime-a');

    expect(first.outcome).toBe('ATTENTION_OVERDUE');
    expect(second.outcome).toBe('ATTENTION_OVERDUE');

    const statuses = [first, second]
      .flatMap((r) => r.entries ?? [])
      .flatMap((e) => e.sideEffects)
      .filter((s) => s.idempotencyKey === 'notify:lead-review:review-overdue')
      .map((s) => s.status);
    expect(statuses.filter((s) => s === 'EXECUTED')).toHaveLength(1);
    expect(statuses).toContain('SUPPRESSED_DUPLICATE');
  });

  it('12. two independently constructed checks racing (Promise.all) on the same incident never produce two EXECUTED review-overdue notifications', async () => {
    const store = new InMemoryWaitIncidentStore();
    const claimStore = new InMemoryOperationClaimStore();
    const parked = await parkReviewIncident(store);
    const wellPastDeadline = hoursAfter(parked.engineState.facts.reviewStartedAt ?? '', 30);

    const [a, b] = await Promise.all([
      checkWaitIncident(store, claimStore, 'lead-review', wellPastDeadline, DEPS, 'runtime-a'),
      checkWaitIncident(store, claimStore, 'lead-review', wellPastDeadline, DEPS, 'runtime-b'),
    ]);

    const statuses = [a, b]
      .flatMap((r) => r.entries ?? [])
      .flatMap((e) => e.sideEffects)
      .filter((s) => s.idempotencyKey === 'notify:lead-review:review-overdue')
      .map((s) => s.status);
    expect(statuses.filter((s) => s === 'EXECUTED')).toHaveLength(1);
  });

  it('13. re-parking the same review (lr-t23, NEEDS_HUMAN -> ESCALATED) does not restart the review timer', async () => {
    const store = new InMemoryWaitIncidentStore();
    const parked = await parkReviewIncident(store);
    const reviewStartedAt = parked.engineState.facts.reviewStartedAt ?? '';

    const escalateEvent: CanonicalEvent = {
      eventId: 'lead-review:escalate-001',
      correlationId: 'inc-lead-review',
      entityId: 'lead-review',
      type: 'human.decision.recorded',
      source: 'operator-console',
      sourceEventId: 'escalate:lead-review',
      occurredAt: hoursAfter(reviewStartedAt, 2),
      receivedAt: hoursAfter(reviewStartedAt, 2),
      schemaVersion: 'wait-resume-1',
      actor: 'HUMAN',
      executionMode: 'SIMULATED',
      payload: { decidedBy: 'client-partner', decision: 'ESCALATE', rationale: 'Raising to a second opinion.' },
    };

    const decisionResult = await applyHumanDecision(store, 'lead-review', parked.revision, escalateEvent, DEPS);
    expect(decisionResult.outcome).toBe('ACCEPTED');
    expect(decisionResult.record?.engineState.lifecycleState).toBe('ESCALATED');
    // The anchor survives the re-park unchanged — this is still the SAME review, not a new one.
    expect(decisionResult.record?.engineState.facts.reviewStartedAt).toBe(reviewStartedAt);
    expect(decisionResult.record?.revision).not.toBe(parked.revision);

    const claimStore = new InMemoryOperationClaimStore();
    // The original review window (from the ORIGINAL reviewStartedAt) is already elapsed by
    // this point — the escalation must not have granted a fresh window.
    const checkedShortlyAfterEscalation = hoursAfter(reviewStartedAt, 26);
    const result = await checkWaitIncident(store, claimStore, 'lead-review', checkedShortlyAfterEscalation, DEPS, 'runtime-a');
    expect(result.outcome).toBe('ATTENTION_OVERDUE');
    expect(result.state?.lifecycleState).toBe('ESCALATED');
  });

  it('15+16. completing the human decision resolves the review-overdue condition — a subsequent check on the cleared case is a genuine no-op', async () => {
    const store = new InMemoryWaitIncidentStore();
    const claimStore = new InMemoryOperationClaimStore();
    const parked = await parkReviewIncident(store);
    const reviewStartedAt = parked.engineState.facts.reviewStartedAt ?? '';
    const wellPastDeadline = hoursAfter(reviewStartedAt, 30);

    const overdue = await checkWaitIncident(store, claimStore, 'lead-review', wellPastDeadline, DEPS, 'runtime-a');
    expect(overdue.outcome).toBe('ATTENTION_OVERDUE');

    const decisionResult = await applyHumanDecision(
      store,
      'lead-review',
      parked.revision,
      decisionEvent('lead-review', hoursAfter(reviewStartedAt, 31)),
      DEPS,
    );
    expect(decisionResult.outcome).toBe('ACCEPTED');
    expect(decisionResult.record?.engineState.lifecycleState).toBe('BOOKING_READY');

    // Stale check: well past the ORIGINAL review deadline (still inside the NEW dispatch
    // window, so that condition stays silent too and this isolates exactly the property under
    // test). The case is no longer under review at all — this must never resurrect a
    // review-overdue escalation.
    const staleCheck = await checkWaitIncident(store, claimStore, 'lead-review', hoursAfter(reviewStartedAt, 35), DEPS, 'runtime-a');
    expect(staleCheck.outcome).toBe('STILL_WAITING');
    expect(staleCheck.entries?.flatMap((e) => e.sideEffects)).toEqual([]);
    expect(staleCheck.state?.lifecycleState).toBe('BOOKING_READY');
  });

  it('10. ESCALATED and SUPPRESSION_REVIEW are equally governed by the review-timeout rule, not just NEEDS_HUMAN', async () => {
    const store = new InMemoryWaitIncidentStore();
    const claimStore = new InMemoryOperationClaimStore();
    for (const reviewState of ['ESCALATED', 'SUPPRESSION_REVIEW'] as const) {
      const incidentId = `lead-review-${reviewState.toLowerCase()}`;
      await store.park({
        incidentId,
        systemId: LEAD_RESCUE.id,
        correlationId: `inc-${incidentId}`,
        engineState: baseEngineState({ lifecycleState: reviewState, facts: { reviewStartedAt: '2026-08-01T00:00:00-04:00' } }),
      });
      const result = await checkWaitIncident(store, claimStore, incidentId, '2026-08-04T00:00:00-04:00', DEPS, 'runtime-a');
      expect(result.outcome, reviewState).toBe('ATTENTION_OVERDUE');
      expect(result.state?.lifecycleState, reviewState).toBe(reviewState);
    }
  });

  it('14. terminal/waiting states are safe no-ops for the review-timeout rule', async () => {
    const store = new InMemoryWaitIncidentStore();
    const claimStore = new InMemoryOperationClaimStore();
    for (const other of ['BOOKED', 'DO_NOT_CONTACT', 'WAITING_FOR_REPLY'] as const) {
      const incidentId = `lead-other-${other.toLowerCase()}`;
      await store.park({
        incidentId,
        systemId: LEAD_RESCUE.id,
        correlationId: `inc-${incidentId}`,
        engineState: baseEngineState({ lifecycleState: other, facts: { reviewStartedAt: '2026-08-01T00:00:00-04:00' } }),
      });
      const result = await checkWaitIncident(store, claimStore, incidentId, '2026-08-04T00:00:00-04:00', DEPS, 'runtime-a');
      expect(result.outcome, other).toBe('STILL_WAITING');
      expect(result.entries?.flatMap((e) => e.sideEffects), other).toEqual([]);
    }
  });

  it('cross-leak: a NEEDS_HUMAN record with stray ancient waitStartedAt/bookingReadyAt/offerSentAt is governed only by reviewStartedAt', async () => {
    const store = new InMemoryWaitIncidentStore();
    const claimStore = new InMemoryOperationClaimStore();
    await store.park({
      incidentId: 'lead-cross-review',
      systemId: LEAD_RESCUE.id,
      correlationId: 'inc-lead-cross-review',
      engineState: baseEngineState({
        lifecycleState: 'NEEDS_HUMAN',
        facts: {
          reviewStartedAt: '2026-08-18T00:00:00-04:00',
          waitStartedAt: '2026-08-01T00:00:00-04:00',
          bookingReadyAt: '2026-08-01T00:00:00-04:00',
          offerSentAt: '2026-08-01T00:00:00-04:00',
        },
      }),
    });
    // 5h after reviewStartedAt: short of the review window, so if the rule correctly reads
    // only reviewStartedAt, this is STILL_WAITING despite the ancient stray facts.
    const result = await checkWaitIncident(store, claimStore, 'lead-cross-review', '2026-08-18T05:00:00-04:00', DEPS, 'runtime-a');
    expect(result.outcome).toBe('STILL_WAITING');
  });

  it('missing anchor fact fails safe: no action, not a guess', async () => {
    const store = new InMemoryWaitIncidentStore();
    const claimStore = new InMemoryOperationClaimStore();
    await store.park({
      incidentId: 'lead-review-no-anchor',
      systemId: LEAD_RESCUE.id,
      correlationId: 'inc-lead-review-no-anchor',
      engineState: baseEngineState({ lifecycleState: 'NEEDS_HUMAN', facts: {} }),
    });
    const result = await checkWaitIncident(store, claimStore, 'lead-review-no-anchor', '2026-08-20T00:00:00-04:00', DEPS, 'runtime-a');
    expect(result.outcome).toBe('STILL_WAITING');
    expect(result.entries?.flatMap((e) => e.sideEffects)).toEqual([]);
    const decision = result.entries?.flatMap((e) => e.decisions)[0];
    expect(decision?.selectedAction).toBe('record_unresolvable_check');
  });
});

describe('Lead Rescue attention timeout — dispatch (ready but undespatched)', () => {
  it('2. BOOKING_READY with no offer despatched carries bookingReadyAt as its own anchor', async () => {
    const store = new InMemoryWaitIncidentStore();
    const parked = await parkReadyIncident(store);
    expect(parked.engineState.facts.bookingReadyAt).toBeDefined();
    expect(parked.engineState.facts.offerSentAt).toBeUndefined();
  });

  it('4. a check before the configured dispatch window leaves the case untouched: no transition, no side effect', async () => {
    const store = new InMemoryWaitIncidentStore();
    const claimStore = new InMemoryOperationClaimStore();
    const parked = await parkReadyIncident(store);
    const wellBeforeDeadline = hoursAfter(parked.engineState.facts.bookingReadyAt ?? '', 1);

    const result = await checkWaitIncident(store, claimStore, 'lead-ready', wellBeforeDeadline, DEPS, 'runtime-a');

    expect(result.outcome).toBe('STILL_WAITING');
    expect(result.state?.lifecycleState).toBe('BOOKING_READY');
    expect(result.entries?.flatMap((e) => e.sideEffects)).toEqual([]);
  });

  it('6+9. crossing the dispatch deadline records an overdue condition exactly once, leaves the lead BOOKING_READY, and never fabricates offerSentAt', async () => {
    const store = new InMemoryWaitIncidentStore();
    const claimStore = new InMemoryOperationClaimStore();
    const parked = await parkReadyIncident(store);
    const wellPastDeadline = hoursAfter(parked.engineState.facts.bookingReadyAt ?? '', 40);

    const result = await checkWaitIncident(store, claimStore, 'lead-ready', wellPastDeadline, DEPS, 'runtime-a');

    expect(result.outcome).toBe('ATTENTION_OVERDUE');
    expect(result.state?.lifecycleState).toBe('BOOKING_READY');
    expect(result.state?.facts.offerSentAt).toBeUndefined();
    expect(result.entries?.flatMap((e) => e.transitions)).toEqual([]);

    const notify = result.entries?.flatMap((e) => e.sideEffects).find((s) => s.idempotencyKey === 'notify:lead-ready:dispatch-overdue');
    expect(notify?.status).toBe('EXECUTED');
    expect(notify?.kind).toBe('NOTIFICATION');

    const stillParked = await store.load('lead-ready');
    expect(stillParked?.engineState.lifecycleState).toBe('BOOKING_READY');
    expect(stillParked?.engineState.facts.offerSentAt).toBeUndefined();
  });

  it('an overdue dispatch is still dispatchable through the authorized dispatch path, which resolves the overdue condition', async () => {
    const store = new InMemoryWaitIncidentStore();
    const claimStore = new InMemoryOperationClaimStore();
    const parked = await parkReadyIncident(store);
    const bookingReadyAt = parked.engineState.facts.bookingReadyAt ?? '';
    const wellPastDeadline = hoursAfter(bookingReadyAt, 40);

    const overdue = await checkWaitIncident(store, claimStore, 'lead-ready', wellPastDeadline, DEPS, 'runtime-a');
    expect(overdue.outcome).toBe('ATTENTION_OVERDUE');

    const despatchEvent: CanonicalEvent = {
      eventId: 'lead-ready:despatch-001',
      correlationId: 'inc-lead-ready',
      entityId: 'lead-ready',
      type: 'lead.offer.despatched',
      source: 'operator-console',
      sourceEventId: 'despatch:lead-ready',
      occurredAt: hoursAfter(bookingReadyAt, 41),
      receivedAt: hoursAfter(bookingReadyAt, 41),
      schemaVersion: 'wait-resume-1',
      actor: 'HUMAN',
      executionMode: 'SIMULATED',
      payload: {
        decidedBy: 'client-partner',
        target: 'prospect@example.com',
        offerSummary: 'Offered a 30-minute scoping call.',
      },
    };

    const dispatchResult = await dispatchAuthorizedOffer(store, claimStore, 'lead-ready', parked.revision, despatchEvent, DEPS, 'runtime-a');
    expect(dispatchResult.outcome).toBe('CONFIRMED');
    expect(dispatchResult.record?.engineState.facts.offerSentAt).toBeDefined();

    // Stale re-check against the ORIGINAL dispatch-timeout deadline must not resurrect the
    // dispatch-overdue condition — the case is now governed by lr-t22's own 48h window,
    // anchored on offerSentAt, which has not elapsed yet.
    const staleCheck = await checkWaitIncident(store, claimStore, 'lead-ready', hoursAfter(bookingReadyAt, 45), DEPS, 'runtime-a');
    expect(staleCheck.outcome).toBe('STILL_WAITING');
    expect(staleCheck.state?.lifecycleState).toBe('BOOKING_READY');
  });

  it('lr-t22 governs exclusively once offerSentAt is present — the dispatch-timeout rule never fires alongside it', async () => {
    const store = new InMemoryWaitIncidentStore();
    const claimStore = new InMemoryOperationClaimStore();
    await store.park({
      incidentId: 'lead-both-anchors',
      systemId: LEAD_RESCUE.id,
      correlationId: 'inc-lead-both-anchors',
      engineState: baseEngineState({
        lifecycleState: 'BOOKING_READY',
        facts: {
          // bookingReadyAt is ancient enough that the dispatch-timeout window (if wrongly
          // consulted) would already read as elapsed — but offerSentAt is present and recent,
          // so lr-t22's own rule must govern exclusively.
          bookingReadyAt: '2026-08-01T00:00:00-04:00',
          offerSentAt: '2026-08-18T00:00:00-04:00',
        },
      }),
    });
    const result = await checkWaitIncident(store, claimStore, 'lead-both-anchors', '2026-08-19T06:00:00-04:00', DEPS, 'runtime-a');
    expect(result.outcome).toBe('STILL_WAITING');
    expect(result.entries?.flatMap((e) => e.sideEffects).some((s) => s.idempotencyKey.includes('dispatch-overdue'))).toBe(false);
  });

  it('cross-leak: a BOOKING_READY (no offerSentAt) record with a stray ancient reviewStartedAt is governed only by bookingReadyAt', async () => {
    const store = new InMemoryWaitIncidentStore();
    const claimStore = new InMemoryOperationClaimStore();
    await store.park({
      incidentId: 'lead-cross-dispatch',
      systemId: LEAD_RESCUE.id,
      correlationId: 'inc-lead-cross-dispatch',
      engineState: baseEngineState({
        lifecycleState: 'BOOKING_READY',
        facts: {
          bookingReadyAt: '2026-08-18T00:00:00-04:00',
          reviewStartedAt: '2026-08-01T00:00:00-04:00',
        },
      }),
    });
    // 1h after bookingReadyAt: short of the dispatch window, so if the rule correctly reads
    // only bookingReadyAt, this is STILL_WAITING despite the ancient stray reviewStartedAt.
    const result = await checkWaitIncident(store, claimStore, 'lead-cross-dispatch', '2026-08-18T01:00:00-04:00', DEPS, 'runtime-a');
    expect(result.outcome).toBe('STILL_WAITING');
  });
});
