import { describe, expect, it } from 'vitest';
import { KESTREL } from '@/data/profiles/kestrel/profile';
import {
  CALL_TO_PROPOSAL_EXTRACTIONS,
  callToProposalScenarioBySlug,
} from '@/data/profiles/kestrel/scenarios/call-to-proposal';
import { CALL_TO_PROPOSAL } from '@/data/systems';
import { CALL_TO_PROPOSAL_HANDLERS } from '@/lib/engine/handlers/call-to-proposal';
import { abandonableStateIds } from '@/lib/proof/parked-state-attention';
import { runScenario } from '@/lib/engine/run';
import type { EngineRun } from '@/lib/engine/types';
import { numberParam } from '@/lib/model/profile';
import { ScenarioSchema, type CanonicalEvent, type Scenario } from '@/lib/model/runtime';
import { FixtureDecisionProvider } from '@/lib/ports/decision-provider';
import { FixtureExtractionProvider } from '@/lib/ports/extraction-provider';

/**
 * FALSIFYING TESTS for Call-to-Proposal's HUMAN-REVIEW attention timeout — closing
 * `call-to-proposal/NEEDS_HUMAN`, one of the four states `data/parked-state-attention.ts`
 * published as places work could be parked with nothing declared about being abandoned.
 *
 * This is the FIRST reuse of #21's shape inside a system that already had it, and the contrast
 * with the approval timeout is the point rather than an inconsistency:
 *
 *   AWAITING_APPROVAL — a specific person was asked. Escalation must go strictly PAST them,
 *                       because notifying the unresponsive approver again is a no-op.
 *   NEEDS_HUMAN       — NOBODY was asked. The package failed a gate and is waiting for whoever
 *                       picks it up. There is no assignee to go past, so escalation goes to the
 *                       final escalation point, exactly as Lead Rescue's review timeout does.
 *
 * Two mechanisms, two situations, and the difference is derived from what routing actually
 * recorded rather than from which state happens to be involved.
 *
 * The window is Kestrel's EXISTING `humanReviewTimeoutHours` under its existing policy. A firm
 * that holds a case for human review has one rule about how long that may go unanswered; giving
 * Call-to-Proposal a second number for the same rule would be inventing a policy nobody set.
 */

const BASE = callToProposalScenarioBySlug('unsupported-scope-claim-blocked');
if (BASE === undefined) throw new Error('fixture scenario "unsupported-scope-claim-blocked" not found');

const FIRST_EVENT = BASE.events[0];
if (FIRST_EVENT === undefined) throw new Error('fixture scenario has no events');
const TRANSCRIPT_EVENT: CanonicalEvent = FIRST_EVENT;

const REVIEW_STARTED_AT = TRANSCRIPT_EVENT.occurredAt;
const WINDOW_HOURS = numberParam(KESTREL, 'humanReviewTimeoutHours');

function hoursAfter(iso: string, hours: number): string {
  return new Date(Date.parse(iso) + hours * 60 * 60 * 1000).toISOString();
}

function reviewCheck(suffix: string, occurredAt: string): CanonicalEvent {
  return {
    eventId: `evt-cp-review-check-${suffix}`,
    correlationId: TRANSCRIPT_EVENT.correlationId,
    entityId: TRANSCRIPT_EVENT.entityId,
    type: 'proposal.approval.reevaluated',
    source: 'scheduler',
    sourceEventId: `review-check-${suffix}`,
    occurredAt,
    receivedAt: occurredAt,
    schemaVersion: TRANSCRIPT_EVENT.schemaVersion,
    actor: 'SYSTEM',
    executionMode: 'SIMULATED',
    payload: {},
  };
}

async function runWithChecks(checks: readonly CanonicalEvent[]): Promise<EngineRun> {
  const scenario: Scenario = ScenarioSchema.parse({
    ...BASE,
    id: 'cp-test-review-timeout',
    slug: 'cp-test-review-timeout',
    events: [TRANSCRIPT_EVENT, ...checks],
    expectedFinalState: 'NEEDS_HUMAN',
  });
  return runScenario(scenario, {
    system: CALL_TO_PROPOSAL,
    profile: KESTREL,
    handlers: CALL_TO_PROPOSAL_HANDLERS,
    provider: new FixtureDecisionProvider(scenario.judgments),
    extractionProvider: new FixtureExtractionProvider(CALL_TO_PROPOSAL_EXTRACTIONS),
  });
}

describe('Call-to-Proposal human-review attention timeout', () => {
  describe('entering review starts a clock', () => {
    it('records when the package entered human review', async () => {
      const run = await runWithChecks([]);
      expect(run.finalState.lifecycleState).toBe('NEEDS_HUMAN');
      expect(run.finalState.facts['humanReviewStartedAt']).toBe(REVIEW_STARTED_AT);
    });

    it('does not claim an approver — nobody was asked', async () => {
      const run = await runWithChecks([]);
      expect(run.finalState.facts['approvalAssignedTo']).toBeUndefined();
    });
  });

  describe('the window is checked, not assumed', () => {
    it('takes no action inside the window and says how far in it looked', async () => {
      const run = await runWithChecks([reviewCheck('early', hoursAfter(REVIEW_STARTED_AT, WINDOW_HOURS - 1))]);
      expect(run.sideEffects).toEqual([]);
      const inert = run.decisions.find((d) => d.selectedAction === 'remain_under_review');
      expect(inert).toBeDefined();
      expect(inert?.deterministicFacts.some((f) => f.label === 'Elapsed')).toBe(true);
    });

    it('escalates to the final escalation point once the window elapses', async () => {
      const run = await runWithChecks([reviewCheck('late', hoursAfter(REVIEW_STARTED_AT, WINDOW_HOURS + 1))]);
      const decision = run.decisions.find((d) => d.selectedAction === 'escalate_review_attention');
      expect(decision).toBeDefined();
      expect(run.sideEffects).toHaveLength(1);
      expect(run.sideEffects[0]?.target).toBe('Managing Principal (founder)');
    });

    it('treats the window as elapsed exactly at the boundary, not one tick later', async () => {
      // The same `<` / `<=` slip that survived the approval timeout's first mutation pass. It
      // was fixed there and not carried across; a mutation caught the omission here too.
      const run = await runWithChecks([reviewCheck('exact', hoursAfter(REVIEW_STARTED_AT, WINDOW_HOURS))]);
      expect(run.decisions.find((d) => d.selectedAction === 'escalate_review_attention')).toBeDefined();
    });

    it('says plainly that nobody was assigned, rather than naming a reviewer who does not exist', async () => {
      const run = await runWithChecks([reviewCheck('late', hoursAfter(REVIEW_STARTED_AT, WINDOW_HOURS + 1))]);
      const decision = run.decisions.find((d) => d.selectedAction === 'escalate_review_attention');
      expect(decision?.escalationReason).toContain('no named reviewer');
    });
  });

  describe('a review timeout never decides the package', () => {
    it('makes no lifecycle transition and stays in NEEDS_HUMAN', async () => {
      const run = await runWithChecks([reviewCheck('late', hoursAfter(REVIEW_STARTED_AT, WINDOW_HOURS + 1))]);
      expect(run.finalState.lifecycleState).toBe('NEEDS_HUMAN');
      expect(run.transitions.map((t) => t.to)).not.toContain('DRAFT_PREPARED');
      expect(run.transitions.map((t) => t.to)).not.toContain('REJECTED');
    });

    it('escalates once however often the scheduler asks', async () => {
      const run = await runWithChecks([
        reviewCheck('late-1', hoursAfter(REVIEW_STARTED_AT, WINDOW_HOURS + 1)),
        reviewCheck('late-2', hoursAfter(REVIEW_STARTED_AT, WINDOW_HOURS + 2)),
      ]);
      expect(run.sideEffects.filter((e) => e.status === 'EXECUTED')).toHaveLength(1);
      expect(run.sideEffects.filter((e) => e.status === 'SUPPRESSED_DUPLICATE')).toHaveLength(1);
    });
  });

  it('removes call-to-proposal/NEEDS_HUMAN from the abandonable list', () => {
    // The published gap, used as a backlog and then closed. This assertion is what connects the
    // audit to the work: closing a state must actually change what the audit reports, or the
    // audit was measuring something other than what it claimed.
    expect(abandonableStateIds(CALL_TO_PROPOSAL)).not.toContain('NEEDS_HUMAN');
  });
});
