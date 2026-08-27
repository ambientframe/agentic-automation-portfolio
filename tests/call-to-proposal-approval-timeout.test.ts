import { describe, expect, it } from 'vitest';
import { KESTREL } from '@/data/profiles/kestrel/profile';
import {
  CALL_TO_PROPOSAL_EXTRACTIONS,
  callToProposalScenarioBySlug,
} from '@/data/profiles/kestrel/scenarios/call-to-proposal';
import { CALL_TO_PROPOSAL } from '@/data/systems';
import { CALL_TO_PROPOSAL_HANDLERS } from '@/lib/engine/handlers/call-to-proposal';
import { runScenario } from '@/lib/engine/run';
import type { EngineRun } from '@/lib/engine/types';
import { numberParam, type BusinessProfile } from '@/lib/model/profile';
import { ScenarioSchema, type CanonicalEvent, type Scenario } from '@/lib/model/runtime';
import { FixtureDecisionProvider } from '@/lib/ports/decision-provider';
import { FixtureExtractionProvider } from '@/lib/ports/extraction-provider';

/**
 * FALSIFYING TESTS for the proposal APPROVAL ATTENTION TIMEOUT — closing
 * `cp-fm-approval-timeout` ("HUMAN_APPROVAL_TIMEOUT": a draft waits for approval past the
 * promised delivery window), the last failure mode in the portfolio whose `verificationTest`
 * still read "Pending — scenario not yet authored".
 *
 * Lead Rescue already proved the SHAPE (`lr-fm-approval-timeout`,
 * `tests/lead-rescue-attention-timeout.test.ts`): a stable start-of-wait fact compared against
 * a configured window, escalating attention while NEVER moving the business lifecycle state.
 * Call-to-Proposal's canon declares `recoveryPath.shape: 'HOLDS_POSITION'` for exactly that
 * reason, and these tests inherit that discipline unchanged.
 *
 * What is genuinely NEW here, and what the second half of this file exists to prove:
 *
 *   Lead Rescue escalates to an authority LEVEL — `resolveEscalationOwner(profile, 4)`, a
 *   lookup that does not know, and does not need to know, who was already asked. Call-to-
 *   Proposal's canon says something stronger: recovery is "Escalate to the NEXT approver in
 *   the authority chain", and its declared CAUSE has two halves — "Reviewer unavailable, OR
 *   NO NAMED APPROVER ASSIGNED AT ROUTING TIME". A level lookup cannot express either half.
 *   Escalating to the same person who is already unresponsive is a no-op wearing the costume
 *   of an action, and escalating "past" an approver who was never named is not an escalation
 *   at all — it is a different operational condition that must read differently.
 *
 * So: routing must record WHO the draft is waiting on and WHEN it started waiting, and the
 * timeout must branch on what routing actually managed to record. Four verdicts, one position.
 */

const BASE = callToProposalScenarioBySlug('discovery-to-approved-proposal');
if (BASE === undefined) throw new Error('fixture scenario "discovery-to-approved-proposal" not found');

/** The transcript event alone reaches AWAITING_APPROVAL; the fixture's second event approves it. */
const FIRST_EVENT = BASE.events[0];
if (FIRST_EVENT === undefined) throw new Error('fixture scenario has no events');
const TRANSCRIPT_EVENT: CanonicalEvent = FIRST_EVENT;

/** The routing step runs within the transcript event, so this is when the approval wait starts. */
const ROUTED_AT = TRANSCRIPT_EVENT.occurredAt;

const WINDOW_HOURS = numberParam(KESTREL, 'proposalApprovalTimeoutHours');

function hoursAfter(iso: string, hours: number): string {
  return new Date(Date.parse(iso) + hours * 60 * 60 * 1000).toISOString();
}

function approvalCheck(suffix: string, occurredAt: string): CanonicalEvent {
  return {
    eventId: `evt-cp-approval-check-${suffix}`,
    correlationId: TRANSCRIPT_EVENT.correlationId,
    entityId: TRANSCRIPT_EVENT.entityId,
    type: 'proposal.approval.reevaluated',
    source: 'scheduler',
    sourceEventId: `approval-check-${suffix}`,
    occurredAt,
    receivedAt: occurredAt,
    schemaVersion: TRANSCRIPT_EVENT.schemaVersion,
    actor: 'SYSTEM',
    executionMode: 'SIMULATED',
    payload: {},
  };
}

async function runWithChecks(
  checks: readonly CanonicalEvent[],
  profile: BusinessProfile = KESTREL,
): Promise<EngineRun> {
  const scenario: Scenario = ScenarioSchema.parse({
    ...BASE,
    id: 'cp-test-approval-timeout',
    slug: 'cp-test-approval-timeout',
    events: [TRANSCRIPT_EVENT, ...checks],
    expectedFinalState: 'AWAITING_APPROVAL',
  });
  return runScenario(scenario, {
    system: CALL_TO_PROPOSAL,
    profile,
    handlers: CALL_TO_PROPOSAL_HANDLERS,
    provider: new FixtureDecisionProvider(scenario.judgments),
    extractionProvider: new FixtureExtractionProvider(CALL_TO_PROPOSAL_EXTRACTIONS),
  });
}

/**
 * A profile that declares NO accountability and whose approval authority resolves to exactly
 * one role, with a strictly higher role above it. This exercises the authority-only fallback:
 * a business that has not said who approves, but whose ranks happen to answer unambiguously.
 */
const SINGLE_APPROVER: BusinessProfile = {
  ...KESTREL,
  accountabilities: undefined,
  roles: [
    { id: 'client-partner', name: 'Client Partner', responsibilities: 'Owns named accounts through proposal.', authorityCeiling: 2 },
    { id: 'founder', name: 'Managing Principal (founder)', responsibilities: 'Final escalation point.', authorityCeiling: 4 },
  ],
};

/** A profile whose only qualifying approver is already at the top of the ladder. */
const TOP_OF_CHAIN_APPROVER: BusinessProfile = {
  ...KESTREL,
  accountabilities: undefined,
  roles: [
    { id: 'founder', name: 'Managing Principal (founder)', responsibilities: 'Final escalation point.', authorityCeiling: 4 },
  ],
};

/**
 * A business that has never decided who approves a proposal — no accountability declared, and
 * two roles tied at the required authority. This was Kestrel's own condition until the profile
 * gained a declared accountability, and the case must stay provable after it: the mechanism
 * that reports an unowned draft is not allowed to rot just because this fiction fixed itself.
 */
const UNDECIDED_BUSINESS: BusinessProfile = {
  ...KESTREL,
  accountabilities: undefined,
  roles: [
    { id: 'ops-coordinator', name: 'Operations Coordinator', responsibilities: 'Runs onboarding logistics.', authorityCeiling: 2 },
    { id: 'finance', name: 'Finance (fractional bookkeeper)', responsibilities: 'Issues invoices.', authorityCeiling: 2 },
    { id: 'founder', name: 'Managing Principal (founder)', responsibilities: 'Final escalation point.', authorityCeiling: 4 },
  ],
};

describe('Call-to-Proposal approval attention timeout — cp-fm-approval-timeout', () => {
  // -------------------------------------------------------------------------
  // Prevention: "Named approver and review window assigned at the moment of routing."
  // -------------------------------------------------------------------------
  describe('routing assigns an approver and starts a clock', () => {
    it('records when the draft began waiting, so a window has something to measure from', async () => {
      const run = await runWithChecks([]);
      expect(run.finalState.lifecycleState).toBe('AWAITING_APPROVAL');
      expect(run.finalState.facts['approvalRoutedAt']).toBe(ROUTED_AT);
    });

    it('prefers the approver the business actually declared over anything inferred from rank', async () => {
      const run = await runWithChecks([]);
      expect(run.finalState.facts['approvalAssignmentStatus']).toBe('DECLARED_ACCOUNTABILITY');
      expect(run.finalState.facts['approvalAssignedTo']).toBe('Client Partner');
      expect(run.finalState.facts['approvalAssigneeCeiling']).toBe('3');
      expect(run.finalState.facts['approvalEscalatesTo']).toBe('Managing Principal (founder)');
    });

    it('falls back to authority when the business has declared no accountability', async () => {
      const run = await runWithChecks([], SINGLE_APPROVER);
      expect(run.finalState.facts['approvalAssignmentStatus']).toBe('RESOLVED');
      expect(run.finalState.facts['approvalAssignedTo']).toBe('Client Partner');
      expect(run.finalState.facts['approvalAssigneeCeiling']).toBe('2');
      expect(run.finalState.facts['approvalEscalatesTo']).toBeUndefined();
    });

    it('states plainly that no approver was named when the business has never decided, and invents nobody', async () => {
      // The declared cause of this very failure mode — "no named approver assigned at routing
      // time". Kestrel's own condition until its profile named one; kept provable here so the
      // mechanism cannot rot just because this particular fiction was fixed.
      const run = await runWithChecks([], UNDECIDED_BUSINESS);
      expect(run.finalState.facts['approvalAssignmentStatus']).toBe('UNRESOLVED_AMBIGUOUS_OWNER');
      expect(run.finalState.facts['approvalAssignedTo']).toContain('Operations Coordinator');
      expect(run.finalState.facts['approvalAssigneeCeiling']).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // Detection: "Age of drafts in AWAITING_APPROVAL against the promised window."
  // -------------------------------------------------------------------------
  describe('the window is checked, not assumed', () => {
    it('takes no action while the draft is still inside the promised window', async () => {
      const run = await runWithChecks([approvalCheck('early', hoursAfter(ROUTED_AT, WINDOW_HOURS - 1))]);
      const overdue = run.decisions.filter((d) => d.selectedAction.startsWith('escalate'));
      expect(overdue).toEqual([]);
      expect(run.sideEffects).toEqual([]);
      expect(run.finalState.lifecycleState).toBe('AWAITING_APPROVAL');
    });

    it('answers an approval check at all — an unhandled event type is not a policy', async () => {
      const run = await runWithChecks([approvalCheck('early', hoursAfter(ROUTED_AT, WINDOW_HOURS - 1))]);
      const labels = run.timeline.map((entry) => entry.stepLabel);
      expect(labels).toContain('Approval attention check');
    });

    it('treats the window as elapsed exactly at the boundary, not one tick later', async () => {
      // The boundary has to be pinned somewhere, and "48 hours have elapsed" is the plain
      // reading of a 48-hour window — the same reading lr-t14 and the review timeout already
      // use. Without this test a `<` / `<=` slip would pass every other assertion in the file.
      const run = await runWithChecks(
        [approvalCheck('exact', hoursAfter(ROUTED_AT, WINDOW_HOURS))],
        SINGLE_APPROVER,
      );
      const decision = run.decisions.find((d) => d.selectedAction === 'escalate_attention_to_next_approver');
      expect(decision, 'a check at exactly the window boundary is overdue').toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // Recovery: "Escalate to the next approver in the authority chain."
  // -------------------------------------------------------------------------
  describe('escalation goes past the person already asked, never back to them', () => {
    it('escalates above the assigned approver’s own ceiling once the window elapses', async () => {
      const run = await runWithChecks(
        [approvalCheck('late', hoursAfter(ROUTED_AT, WINDOW_HOURS + 1))],
        SINGLE_APPROVER,
      );
      expect(run.sideEffects).toHaveLength(1);
      const [notification] = run.sideEffects;
      expect(notification?.kind).toBe('NOTIFICATION');
      // The whole point: NOT the Client Partner, who is the one not responding.
      expect(notification?.target).toBe('Managing Principal (founder)');
      expect(notification?.target).not.toBe('Client Partner');
    });

    it('says the chain is exhausted rather than escalating an approver to themselves', async () => {
      const run = await runWithChecks(
        [approvalCheck('late', hoursAfter(ROUTED_AT, WINDOW_HOURS + 1))],
        TOP_OF_CHAIN_APPROVER,
      );
      const decision = run.decisions.find((d) => d.selectedAction === 'record_escalation_chain_exhausted');
      expect(decision, 'an approver at the top of the ladder has no next approver').toBeDefined();
      expect(decision?.escalationReason).toContain('no higher authority');
      // Nobody is notified, because there is nobody above to notify. Silence here is the
      // honest answer; a notification addressed back to the unresponsive approver is not.
      expect(run.sideEffects).toEqual([]);
    });

    it('reports an unassigned draft as unassigned, not as a slow reviewer', async () => {
      const run = await runWithChecks(
        [approvalCheck('late', hoursAfter(ROUTED_AT, WINDOW_HOURS + 1))],
        UNDECIDED_BUSINESS,
      );
      const decision = run.decisions.find((d) => d.selectedAction === 'escalate_unassigned_draft');
      expect(decision, 'this business names no approver, so the overdue condition is a different one').toBeDefined();
      expect(decision?.escalationReason).toContain('never assigned');
      expect(run.sideEffects).toHaveLength(1);
    });

    it('uses the declared next approver even when rank would name someone else', async () => {
      // The assertion that can actually fail. On Kestrel the declared target (founder) and the
      // rank-derived one (authority 3 + 1 → founder) AGREE, so a mutation that ignored the
      // declaration survived a test which only checked the label. Here they disagree by
      // construction: the business declares Client Partner (ceiling 2) escalates to the
      // founder, while rank would stop at Head of Delivery on the way. The business wins.
      const declaredSkipsARank: BusinessProfile = {
        ...KESTREL,
        roles: [
          { id: 'analyst', name: 'Compliance Analyst', responsibilities: 'Collects evidence.', authorityCeiling: 1 },
          { id: 'client-partner', name: 'Client Partner', responsibilities: 'Owns proposals.', authorityCeiling: 2 },
          { id: 'head-of-delivery', name: 'Head of Delivery', responsibilities: 'Owns staffing.', authorityCeiling: 3 },
          { id: 'founder', name: 'Managing Principal (founder)', responsibilities: 'Final escalation point.', authorityCeiling: 4 },
        ],
        accountabilities: [
          {
            action: 'PROPOSAL_APPROVAL',
            roleId: 'client-partner',
            escalatesToRoleId: 'founder',
            policyId: 'kestrel-proposal-authority',
          },
        ],
      };
      const run = await runWithChecks(
        [approvalCheck('late', hoursAfter(ROUTED_AT, WINDOW_HOURS + 1))],
        declaredSkipsARank,
      );
      expect(run.sideEffects[0]?.target).toBe('Managing Principal (founder)');
      expect(run.sideEffects[0]?.target).not.toBe('Head of Delivery');
    });

    it('escalates to the declared next approver rather than re-deriving one from rank', async () => {
      // Kestrel declares Client Partner -> founder. Deriving from the ceiling alone would also
      // reach authority 4 here, so the assertion that matters is the DECISION: the escalation
      // must cite the declared accountability, not a rank lookup that happens to agree.
      const run = await runWithChecks([approvalCheck('late', hoursAfter(ROUTED_AT, WINDOW_HOURS + 1))]);
      const decision = run.decisions.find((d) => d.selectedAction === 'escalate_attention_to_next_approver');
      expect(decision).toBeDefined();
      expect(decision?.escalationReason).toContain('Client Partner');
      expect(run.sideEffects[0]?.target).toBe('Managing Principal (founder)');
      expect(
        decision?.deterministicFacts.some((f) => f.value.includes('declared accountability')),
        'the escalation must say the target came from a declared accountability',
      ).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // recoveryPath.shape: 'HOLDS_POSITION' — the structural claim, not a promise
  // -------------------------------------------------------------------------
  describe('a timeout never decides a proposal', () => {
    it('makes no lifecycle transition on any approval check, in any profile', async () => {
      const late = [approvalCheck('late', hoursAfter(ROUTED_AT, WINDOW_HOURS + 1))];
      for (const [name, profile] of [
        ['kestrel', KESTREL],
        ['single approver', SINGLE_APPROVER],
        ['top of chain', TOP_OF_CHAIN_APPROVER],
      ] as const) {
        const run = await runWithChecks(late, profile);
        const afterRouting = run.transitions.filter((t) => t.to !== 'AWAITING_APPROVAL');
        expect(afterRouting.map((t) => t.to), name).not.toContain('APPROVED_SENT');
        expect(run.finalState.lifecycleState, name).toBe('AWAITING_APPROVAL');
      }
    });

    it('holds position across the authored scenario a visitor can actually watch', async () => {
      // The shelf item, run exactly as the simulator runs it. Without this the scenario is
      // decoration: `expectedFinalState` alone would pass even if both checks did nothing.
      const authored = callToProposalScenarioBySlug('approval-window-elapses');
      expect(authored, 'the approval-timeout scenario must be on the shelf').toBeDefined();
      if (authored === undefined) return;

      const run = await runScenario(authored, {
        system: CALL_TO_PROPOSAL,
        profile: KESTREL,
        handlers: CALL_TO_PROPOSAL_HANDLERS,
        provider: new FixtureDecisionProvider(authored.judgments),
        extractionProvider: new FixtureExtractionProvider(CALL_TO_PROPOSAL_EXTRACTIONS),
      });

      expect(run.finalState.lifecycleState).toBe('AWAITING_APPROVAL');
      // One check inside the window that does nothing, one past it that escalates.
      expect(run.decisions.filter((d) => d.selectedAction === 'remain_awaiting_approval')).toHaveLength(1);
      expect(run.decisions.filter((d) => d.selectedAction === 'escalate_attention_to_next_approver')).toHaveLength(1);
      expect(run.decisions.filter((d) => d.selectedAction === 'escalate_unassigned_draft')).toEqual([]);
      expect(run.sideEffects.filter((e) => e.status === 'EXECUTED')).toHaveLength(1);
    });

    it('never proposes an effect that despatches, only one that notifies', async () => {
      const run = await runWithChecks(
        [approvalCheck('late', hoursAfter(ROUTED_AT, WINDOW_HOURS + 1))],
        SINGLE_APPROVER,
      );
      for (const effect of run.sideEffects) {
        expect(effect.kind, effect.id).toBe('NOTIFICATION');
        expect(effect.executionMode, effect.id).toBe('SIMULATED');
      }
    });

    it('escalates once, not once per check, however often the scheduler asks', async () => {
      const run = await runWithChecks(
        [
          approvalCheck('late-1', hoursAfter(ROUTED_AT, WINDOW_HOURS + 1)),
          approvalCheck('late-2', hoursAfter(ROUTED_AT, WINDOW_HOURS + 2)),
          approvalCheck('late-3', hoursAfter(ROUTED_AT, WINDOW_HOURS + 3)),
        ],
        SINGLE_APPROVER,
      );
      // The later attempts are RECORDED as suppressed rather than silently dropped: the
      // ledger having refused them is itself the evidence that it works. One person is
      // notified; three checks are visible.
      expect(run.sideEffects.filter((e) => e.status === 'EXECUTED')).toHaveLength(1);
      expect(run.sideEffects.filter((e) => e.status === 'SUPPRESSED_DUPLICATE')).toHaveLength(2);
    });
  });
});
