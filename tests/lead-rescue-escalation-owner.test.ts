import { describe, expect, it } from 'vitest';
import { KESTREL } from '@/data/profiles/kestrel/profile';
import { LEAD_RESCUE } from '@/data/systems';
import { LEAD_RESCUE_HANDLERS } from '@/lib/engine/handlers/lead-rescue';
import { leadRescueScenarioBySlug } from '@/data/profiles/kestrel/scenarios/lead-rescue';
import { runScenario } from '@/lib/engine/run';
import { runLeadRescue } from './helpers';
import { FixtureDecisionProvider } from '@/lib/ports/decision-provider';
import { InMemoryWaitIncidentStore, type WaitIncidentStore } from '@/lib/persistence/wait-incident-store';
import { InMemoryOperationClaimStore } from '@/lib/persistence/operation-claim-store';
import { checkWaitIncident, parkWaitingIncident, type WaitResumeDeps } from '@/lib/engine/wait-resume';
import { resolveEscalationOwner } from '@/lib/model/profile';
import type { EngineRun } from '@/lib/engine/types';
import type { Scenario } from '@/lib/model/runtime';

/**
 * FALSIFYING TESTS proving `resolveEscalationOwner` (`lib/model/profile.ts`) is genuinely
 * applied at every Lead Rescue notification that used to hard-code the "Named owner"
 * simulation placeholder — not just the first occurrence found, and not a second, parallel
 * hard-coded string in its place.
 *
 * Two tiers exist in the real profile data, not an invented hierarchy: authority 3 (the
 * uniform required level every "first-line" notification effect already declared) hits a
 * genuine tie between `client-partner` and `head-of-delivery`, and — per the corrected audit
 * in `tests/profile.test.ts` — no canon anywhere ranks one above the other, so this tier
 * correctly resolves AMBIGUOUS, never a silently-picked name; authority 4 — used only by the
 * two attention-timeout "next owner in the authority chain" notifications, matching that
 * exact canon language — is uniquely held by `founder` and resolves cleanly. Both are proven
 * end to end here, through the real handler paths, not only against the resolver in isolation.
 */

const DEPS: WaitResumeDeps = {
  system: LEAD_RESCUE,
  profile: KESTREL,
  handlers: LEAD_RESCUE_HANDLERS,
  reevaluationEventType: 'lead.wait.reevaluated',
};

const STANDARD_TIER_TARGET = resolveEscalationOwner(KESTREL, 3).target;
const NEXT_OWNER_TIER = 'Managing Principal (founder)';

function allTargets(run: EngineRun): string[] {
  return run.sideEffects.map((s) => s.target);
}

describe('Lead Rescue escalation owner resolution — applied consistently, not just at one call site', () => {
  it('handleEnquiry: a qualified, complete enquiry routes to the honestly ambiguous standard-tier target, never a silently-picked name and never "Named owner"', async () => {
    const scenario = leadRescueScenarioBySlug('offer-window-elapses');
    if (scenario === undefined) throw new Error('fixture scenario not found');
    const enquiryEvent = scenario.events[0];
    if (enquiryEvent === undefined) throw new Error('scenario has no events');
    const enquiryOnly: Scenario = { ...scenario, events: [enquiryEvent] };

    const run = await runScenario(enquiryOnly, {
      system: LEAD_RESCUE,
      profile: KESTREL,
      handlers: LEAD_RESCUE_HANDLERS,
      provider: new FixtureDecisionProvider(enquiryOnly.judgments),
    });

    expect(run.finalState.lifecycleState).toBe('BOOKING_READY');
    const notify = run.sideEffects.find((s) => s.idempotencyKey.startsWith('notify:'));
    expect(notify?.target).toBe(STANDARD_TIER_TARGET);
    expect(notify?.target).not.toBe('Client Partner');
    expect(notify?.target).not.toBe('Head of Delivery');
    expect(allTargets(run)).not.toContain('Named owner');
  });

  it('handleReply (a materially different code path from handleEnquiry): a reply completing the missing fields resolves the SAME ambiguous target, never a second hard-coded string', async () => {
    const scenario = leadRescueScenarioBySlug('after-hours-enquiry');
    if (scenario === undefined) throw new Error('fixture scenario not found');
    const run = await runLeadRescue(scenario);

    // The full scenario proceeds past BOOKING_READY (to BOOKED); the notification under
    // test fires at the BOOKING_READY transition itself, not at whatever the final state is.
    expect(run.transitions.some((t) => t.to === 'BOOKING_READY' && t.accepted)).toBe(true);
    const notify = run.sideEffects.find((s) => s.idempotencyKey.startsWith('notify:'));
    expect(notify?.target).toBe(STANDARD_TIER_TARGET);
    expect(allTargets(run)).not.toContain('Named owner');
  });

  it('lr-t14 (reply-window elapsed) resolves the SAME ambiguous standard-tier target through checkWaitIncident, the wait/resume orchestration boundary', async () => {
    const scenario = leadRescueScenarioBySlug('reply-window-elapses');
    if (scenario === undefined) throw new Error('fixture scenario not found');
    const enquiryEvent = scenario.events[0];
    if (enquiryEvent === undefined) throw new Error('scenario has no events');
    const store: WaitIncidentStore = new InMemoryWaitIncidentStore();
    const claimStore = new InMemoryOperationClaimStore();

    const setupRun = await runScenario(
      { ...scenario, events: [{ ...enquiryEvent, entityId: 'lead-owner-t14', eventId: 'lead-owner-t14:evt-001' }] },
      { system: LEAD_RESCUE, profile: KESTREL, handlers: LEAD_RESCUE_HANDLERS, provider: new FixtureDecisionProvider(scenario.judgments) },
    );
    expect(setupRun.finalState.lifecycleState).toBe('WAITING_FOR_REPLY');
    const parked = await parkWaitingIncident(store, LEAD_RESCUE, {
      incidentId: 'lead-owner-t14',
      correlationId: 'inc-lead-owner-t14',
      engineState: setupRun.finalState,
    });

    const wellPastDeadline = new Date(Date.parse(parked.engineState.facts.waitStartedAt ?? '') + 30 * 3_600_000).toISOString();
    const result = await checkWaitIncident(store, claimStore, 'lead-owner-t14', wellPastDeadline, DEPS, 'test-runtime');

    expect(result.outcome).toBe('ELAPSED');
    const notify = (result.entries ?? []).flatMap((e) => e.sideEffects).find((s) => s.idempotencyKey.includes('wait-elapsed'));
    expect(notify?.target).toBe(STANDARD_TIER_TARGET);
  });

  it('handleReviewAttentionTimeout ("next owner in the authority chain"): resolves the genuinely higher-tier owner, distinct from the standard tier', async () => {
    const scenario = leadRescueScenarioBySlug('reviewed-offer-elapses');
    if (scenario === undefined) throw new Error('fixture scenario not found');
    const enquiryEvent = scenario.events[0];
    if (enquiryEvent === undefined) throw new Error('scenario has no events');
    const store: WaitIncidentStore = new InMemoryWaitIncidentStore();
    const claimStore = new InMemoryOperationClaimStore();

    const setupRun = await runScenario(
      { ...scenario, events: [{ ...enquiryEvent, entityId: 'lead-owner-review', eventId: 'lead-owner-review:evt-001' }] },
      { system: LEAD_RESCUE, profile: KESTREL, handlers: LEAD_RESCUE_HANDLERS, provider: new FixtureDecisionProvider(scenario.judgments) },
    );
    expect(setupRun.finalState.lifecycleState).toBe('NEEDS_HUMAN');
    const parked = await store.park({
      incidentId: 'lead-owner-review',
      systemId: LEAD_RESCUE.id,
      correlationId: 'inc-lead-owner-review',
      engineState: { ...setupRun.finalState, missingInformation: [...setupRun.finalState.missingInformation] },
    });

    const wellPastDeadline = new Date(Date.parse(parked.engineState.facts.reviewStartedAt ?? '') + 30 * 3_600_000).toISOString();
    const result = await checkWaitIncident(store, claimStore, 'lead-owner-review', wellPastDeadline, DEPS, 'test-runtime');

    expect(result.outcome).toBe('ATTENTION_OVERDUE');
    const notify = (result.entries ?? []).flatMap((e) => e.sideEffects).find((s) => s.idempotencyKey.includes('review-overdue'));
    expect(notify?.target).toBe(NEXT_OWNER_TIER);
    expect(notify?.target).not.toBe(STANDARD_TIER_TARGET);
  });

  it('handleDispatchAttentionTimeout ("next owner in the authority chain"): resolves the SAME higher tier as the review path, via a materially different rule', async () => {
    const scenario = leadRescueScenarioBySlug('offer-window-elapses');
    if (scenario === undefined) throw new Error('fixture scenario not found');
    const enquiryEvent = scenario.events[0];
    if (enquiryEvent === undefined) throw new Error('scenario has no events');
    const store: WaitIncidentStore = new InMemoryWaitIncidentStore();
    const claimStore = new InMemoryOperationClaimStore();

    const setupRun = await runScenario(
      { ...scenario, events: [{ ...enquiryEvent, entityId: 'lead-owner-dispatch', eventId: 'lead-owner-dispatch:evt-001' }] },
      { system: LEAD_RESCUE, profile: KESTREL, handlers: LEAD_RESCUE_HANDLERS, provider: new FixtureDecisionProvider(scenario.judgments) },
    );
    expect(setupRun.finalState.lifecycleState).toBe('BOOKING_READY');
    expect(setupRun.finalState.facts.offerSentAt).toBeUndefined();
    const parked = await parkWaitingIncident(store, LEAD_RESCUE, {
      incidentId: 'lead-owner-dispatch',
      correlationId: 'inc-lead-owner-dispatch',
      engineState: setupRun.finalState,
    });

    const wellPastDeadline = new Date(Date.parse(parked.engineState.facts.bookingReadyAt ?? '') + 30 * 3_600_000).toISOString();
    const result = await checkWaitIncident(store, claimStore, 'lead-owner-dispatch', wellPastDeadline, DEPS, 'test-runtime');

    expect(result.outcome).toBe('ATTENTION_OVERDUE');
    const notify = (result.entries ?? []).flatMap((e) => e.sideEffects).find((s) => s.idempotencyKey.includes('dispatch-overdue'));
    expect(notify?.target).toBe(NEXT_OWNER_TIER);
  });

  it('no Lead Rescue notification, across every scenario this portfolio declares, still emits the "Named owner" placeholder', async () => {
    const results = await Promise.all(
      [
        'after-hours-enquiry',
        'duplicate-delivery',
        'ambiguous-high-risk',
        'restricted-contact-review',
        'uncertain-downstream-outcome',
        'reply-window-elapses',
        'offer-window-elapses',
        'reviewed-offer-elapses',
      ].map(async (slug) => {
        const scenario = leadRescueScenarioBySlug(slug);
        if (scenario === undefined) throw new Error(`fixture scenario "${slug}" not found`);
        return runLeadRescue(scenario);
      }),
    );

    for (const run of results) {
      expect(allTargets(run)).not.toContain('Named owner');
    }
  });

  it('idempotency/replay preserved: repeated checks of the same overdue incident resolve to the identical owner, and the pre-existing duplicate-suppression outcome is unaffected by owner resolution', async () => {
    const scenario = leadRescueScenarioBySlug('reviewed-offer-elapses');
    if (scenario === undefined) throw new Error('fixture scenario not found');
    const enquiryEvent = scenario.events[0];
    if (enquiryEvent === undefined) throw new Error('scenario has no events');
    const store: WaitIncidentStore = new InMemoryWaitIncidentStore();
    const claimStore = new InMemoryOperationClaimStore();

    const setupRun = await runScenario(
      { ...scenario, events: [{ ...enquiryEvent, entityId: 'lead-owner-repeat', eventId: 'lead-owner-repeat:evt-001' }] },
      { system: LEAD_RESCUE, profile: KESTREL, handlers: LEAD_RESCUE_HANDLERS, provider: new FixtureDecisionProvider(scenario.judgments) },
    );
    const parked = await store.park({
      incidentId: 'lead-owner-repeat',
      systemId: LEAD_RESCUE.id,
      correlationId: 'inc-lead-owner-repeat',
      engineState: { ...setupRun.finalState, missingInformation: [...setupRun.finalState.missingInformation] },
    });
    const wellPastDeadline = new Date(Date.parse(parked.engineState.facts.reviewStartedAt ?? '') + 30 * 3_600_000).toISOString();

    const first = await checkWaitIncident(store, claimStore, 'lead-owner-repeat', wellPastDeadline, DEPS, 'runtime-a');
    const second = await checkWaitIncident(store, claimStore, 'lead-owner-repeat', wellPastDeadline, DEPS, 'runtime-a');

    // Pre-existing ATTENTION_OVERDUE semantics (idempotent repeated checks, never resolved,
    // never a second lifecycle transition) are exactly what this pass must NOT disturb.
    expect(first.outcome).toBe('ATTENTION_OVERDUE');
    expect(second.outcome).toBe('ATTENTION_OVERDUE');

    const firstTarget = (first.entries ?? []).flatMap((e) => e.sideEffects).find((s) => s.idempotencyKey.includes('review-overdue'))?.target;
    const secondTarget = (second.entries ?? []).flatMap((e) => e.sideEffects).find((s) => s.idempotencyKey.includes('review-overdue'))?.target;
    expect(firstTarget).toBe(NEXT_OWNER_TIER);
    expect(secondTarget).toBe(NEXT_OWNER_TIER);
  });
});
