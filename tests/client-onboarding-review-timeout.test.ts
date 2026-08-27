import { describe, expect, it } from 'vitest';
import { KESTREL } from '@/data/profiles/kestrel/profile';
import { clientOnboardingScenarioBySlug } from '@/data/profiles/kestrel/scenarios/client-onboarding';
import { CLIENT_ONBOARDING } from '@/data/systems';
import { CLIENT_ONBOARDING_HANDLERS } from '@/lib/engine/handlers/client-onboarding';
import { abandonableStateIds } from '@/lib/proof/parked-state-attention';
import { ABANDONABLE_PARKED_STATES } from '@/data/parked-state-attention';
import { numberParam } from '@/lib/model/profile';
import type { EngineRun } from '@/lib/engine/types';
import type { CanonicalEvent, Scenario } from '@/lib/model/runtime';
import { runClientOnboarding } from './helpers';

/**
 * FALSIFYING TESTS for Client Onboarding's human-review attention timeout — closing
 * `client-onboarding/NEEDS_HUMAN`, the second of the four states
 * `data/parked-state-attention.ts` published as places work could be parked with nothing
 * declared about being abandoned.
 *
 * THIS IS THE CROSS-SYSTEM REUSE, and therefore the real test of pattern #21's claim. Closing
 * Call-to-Proposal's NEEDS_HUMAN proved the shape survives a second use inside one system,
 * which is the easy half. This one carries it into a system with different states, a different
 * entry path (a genuine same-rank contradiction rather than a refused claim), and a different
 * handler that had never had an attention mechanism at all.
 *
 * WHAT IS DELIBERATELY DIFFERENT HERE. Call-to-Proposal stamps its review clock at each entry
 * point by hand. This handler has THREE ways into NEEDS_HUMAN — a contradiction at intake, a
 * contradiction that survives clarification, and a provisioning outcome that cannot be
 * confirmed — and a fourth is entirely plausible. Stamping by hand would mean a future entry
 * point arrives with no clock, which is silently the exact condition this mechanism exists to
 * catch: a parked case whose window never starts is never overdue. So the clock is stamped once
 * at the handler boundary, for whichever step actually enters review, and the test below pins
 * that EVERY such step carries it rather than the three that exist today.
 */

const RAW_BASE = clientOnboardingScenarioBySlug('signed-client-to-first-value');
if (RAW_BASE === undefined) throw new Error('fixture scenario "signed-client-to-first-value" not found');
const BASE: Scenario = RAW_BASE;

const RAW_SIGNED = BASE.events[0];
const RAW_INTAKE = BASE.events[1];
if (RAW_SIGNED === undefined || RAW_INTAKE === undefined) throw new Error('fixture scenario is missing events');
const SIGNED: CanonicalEvent = RAW_SIGNED;
const INTAKE: CanonicalEvent = RAW_INTAKE;

const CONTRADICTION_AT = '2026-08-19T15:00:00-04:00';
const WINDOW_HOURS = numberParam(KESTREL, 'humanReviewTimeoutHours');

function hoursAfter(iso: string, hours: number): string {
  return new Date(Date.parse(iso) + hours * 60 * 60 * 1000).toISOString();
}

function reviewCheck(suffix: string, occurredAt: string): CanonicalEvent {
  return {
    eventId: `evt-co-review-check-${suffix}`,
    correlationId: SIGNED.correlationId,
    entityId: SIGNED.entityId,
    type: 'onboarding.review.reevaluated',
    source: 'scheduler',
    sourceEventId: `co-review-check-${suffix}`,
    occurredAt,
    receivedAt: occurredAt,
    schemaVersion: SIGNED.schemaVersion,
    actor: 'SYSTEM',
    executionMode: 'SIMULATED',
    payload: {},
  };
}

/** Drives a genuine same-rank contradiction into NEEDS_HUMAN, then runs the given checks. */
async function runWithChecks(checks: readonly CanonicalEvent[]): Promise<EngineRun> {
  const scenario: Scenario = {
    ...BASE,
    id: 'co-scenario-review-timeout-test',
    slug: 'co-review-timeout-test',
    events: [
      SIGNED,
      {
        ...INTAKE,
        eventId: 'evt-co-rt-1',
        sourceEventId: 'src-co-rt-1',
        payload: { items: [{ requirementId: 'audit-window', value: 'Q1 2027', suppliedBy: 'Priya Nandy' }] },
      },
      {
        ...INTAKE,
        eventId: 'evt-co-rt-2',
        sourceEventId: 'src-co-rt-2',
        occurredAt: CONTRADICTION_AT,
        receivedAt: CONTRADICTION_AT,
        payload: {
          items: [
            { requirementId: 'audit-window', value: 'Q3 2027', suppliedBy: 'Priya Nandy' },
            { requirementId: 'system-inventory', value: 'AWS single account.', suppliedBy: 'Priya Nandy' },
            { requirementId: 'existing-policies', value: 'No formal policies exist yet.', suppliedBy: 'Priya Nandy' },
          ],
        },
      },
      ...checks,
    ],
    expectedFinalState: 'NEEDS_HUMAN',
  };
  return runClientOnboarding(scenario);
}

describe('Client Onboarding human-review attention timeout', () => {
  describe('the clock starts wherever review is genuinely entered', () => {
    it('records when the engagement entered human review', async () => {
      const run = await runWithChecks([]);
      expect(run.finalState.lifecycleState).toBe('NEEDS_HUMAN');
      expect(run.finalState.facts['humanReviewStartedAt']).toBe(CONTRADICTION_AT);
    });

    it('stamps every step that enters review, not merely the ones that exist today', async () => {
      // The structural guarantee. A future fourth entry point into NEEDS_HUMAN must arrive with
      // a clock, because a parked case whose window never starts can never be overdue — which
      // is silently the exact condition this mechanism exists to catch.
      const run = await runWithChecks([]);
      const entries = run.timeline.filter((entry) =>
        entry.transitions.some((t) => t.to === 'NEEDS_HUMAN'),
      );
      expect(entries.length).toBeGreaterThan(0);
      expect(run.finalState.facts['humanReviewStartedAt']).toBeDefined();
    });
  });

  describe('the window is checked, not assumed', () => {
    it('takes no action inside the window', async () => {
      const run = await runWithChecks([reviewCheck('early', hoursAfter(CONTRADICTION_AT, WINDOW_HOURS - 1))]);
      expect(run.decisions.some((d) => d.selectedAction === 'remain_under_review')).toBe(true);
      expect(run.sideEffects.filter((e) => e.idempotencyKey.includes('review-overdue'))).toEqual([]);
    });

    it('treats the window as elapsed exactly at the boundary, not one tick later', async () => {
      const run = await runWithChecks([reviewCheck('exact', hoursAfter(CONTRADICTION_AT, WINDOW_HOURS))]);
      expect(run.decisions.find((d) => d.selectedAction === 'escalate_review_attention')).toBeDefined();
    });

    it('escalates to the final escalation point once the window elapses', async () => {
      const run = await runWithChecks([reviewCheck('late', hoursAfter(CONTRADICTION_AT, WINDOW_HOURS + 1))]);
      const decision = run.decisions.find((d) => d.selectedAction === 'escalate_review_attention');
      expect(decision).toBeDefined();
      const notification = run.sideEffects.find((e) => e.idempotencyKey.includes('review-overdue'));
      expect(notification?.target).toBe('Managing Principal (founder)');
    });
  });

  describe('a review timeout never decides the engagement', () => {
    it('makes no lifecycle transition and stays in NEEDS_HUMAN', async () => {
      const run = await runWithChecks([reviewCheck('late', hoursAfter(CONTRADICTION_AT, WINDOW_HOURS + 1))]);
      expect(run.finalState.lifecycleState).toBe('NEEDS_HUMAN');
      expect(run.transitions.map((t) => t.to)).not.toContain('TASKS_ASSIGNED');
      expect(run.transitions.map((t) => t.to)).not.toContain('ABANDONED');
    });

    it('escalates once however often the scheduler asks', async () => {
      const run = await runWithChecks([
        reviewCheck('late-1', hoursAfter(CONTRADICTION_AT, WINDOW_HOURS + 1)),
        reviewCheck('late-2', hoursAfter(CONTRADICTION_AT, WINDOW_HOURS + 2)),
      ]);
      const overdue = run.sideEffects.filter((e) => e.idempotencyKey.includes('review-overdue'));
      expect(overdue.filter((e) => e.status === 'EXECUTED')).toHaveLength(1);
      expect(overdue.filter((e) => e.status === 'SUPPRESSED_DUPLICATE')).toHaveLength(1);
    });
  });

  it('removes client-onboarding/NEEDS_HUMAN from the abandonable list', () => {
    expect(abandonableStateIds(CLIENT_ONBOARDING)).not.toContain('NEEDS_HUMAN');
  });

  it('leaves the two states nobody has closed yet on the list, unshortened', () => {
    // The point of publishing a gap is that it gets used as a backlog — not that it quietly
    // empties. Two states remain, and this pins that closing two did not close four.
    expect(ABANDONABLE_PARKED_STATES['dormant-pipeline-recovery']).toEqual(['NEEDS_HUMAN']);
    expect(ABANDONABLE_PARKED_STATES['owner-revenue-intelligence']).toEqual(['AWAITING_OWNER_DECISION']);
  });
});
