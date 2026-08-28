import { describe, expect, it } from 'vitest';
import { LEAD_RESCUE } from '@/data/systems';
import { KESTREL } from '@/data/profiles/kestrel/profile';
import { ASHCOMBE } from '@/data/profiles/ashcombe/profile';
import { LEAD_RESCUE_HANDLERS } from '@/lib/engine/handlers/lead-rescue';
import { InMemoryWaitIncidentStore, type WaitIncidentRecord } from '@/lib/persistence/wait-incident-store';
import { InMemoryOperationClaimStore } from '@/lib/persistence/operation-claim-store';
import { checkWaitIncident, type WaitResumeDeps } from '@/lib/engine/wait-resume';
import { gateById } from '@/lib/model/profile';

/**
 * BLOCKED IS NOT OVERDUE, PROVEN THROUGH THE ENGINE.
 *
 * `tests/external-gate.test.ts` proves the primitive reads evidence correctly. This proves the
 * distinction survives the boundary that actually reports to an operator, because that is where
 * it matters: a queue saying OVERDUE against a return the firm is legally forbidden to send is
 * the defect, and a correct model behind a wrong queue would not have fixed anything.
 *
 *   OVERDUE           an AUTHORIZED obligation was not completed in time.
 *   ATTENTION_BLOCKED execution is not authorized, because a declared dependency is unsatisfied.
 *
 * TWO CLOCKS. The action SLA never starts while the gate is closed — nothing is suspended,
 * because there was never an authorized obligation to measure. The firm still owes the taxpayer
 * a chase for the missing signature, and that is a SEPARATE window on the same anchor. These
 * tests hold both apart, because collapsing them is the easiest way to lose the distinction
 * while appearing to keep it.
 */

const ASHCOMBE_DEPS: WaitResumeDeps = {
  system: LEAD_RESCUE,
  profile: ASHCOMBE,
  handlers: LEAD_RESCUE_HANDLERS,
  reevaluationEventType: 'lead.wait.reevaluated',
};

const KESTREL_DEPS: WaitResumeDeps = { ...ASHCOMBE_DEPS, profile: KESTREL };

const GATE = gateById(ASHCOMBE, 'ashcombe-signed-8879');
if (GATE === undefined) throw new Error('ashcombe declares no Form 8879 gate');

const READY_AT = '2026-08-20T09:00:00.000Z';
const hoursAfter = (iso: string, hours: number) =>
  new Date(Date.parse(iso) + hours * 60 * 60 * 1000).toISOString();

/** A prepared-but-undespatched case. `facts` decides whether the gate is open. */
async function parkReady(facts: Record<string, string> = {}) {
  const store = new InMemoryWaitIncidentStore();
  const claimStore = new InMemoryOperationClaimStore();
  const engineState: WaitIncidentRecord['engineState'] = {
    lifecycleState: 'BOOKING_READY',
    facts: { bookingReadyAt: READY_AT, ...facts },
    suppressed: false,
    awaitingHuman: null,
    missingInformation: [],
  };
  await store.park({
    incidentId: 'gated',
    systemId: LEAD_RESCUE.id,
    correlationId: 'inc-gated',
    engineState,
  });
  return { store, claimStore };
}

describe('a closed gate reports BLOCKED, never OVERDUE', () => {
  it('holds the action past its SLA without ever calling it late', async () => {
    const { store, claimStore } = await parkReady();
    const wellPastActionSla = hoursAfter(READY_AT, 40);

    const result = await checkWaitIncident(store, claimStore, 'gated', wellPastActionSla, ASHCOMBE_DEPS, 'runtime-a');

    expect(result.outcome).toBe('ATTENTION_BLOCKED');
    expect(result.state?.lifecycleState).toBe('BOOKING_READY');
  });

  it('never fabricates the dispatch it is holding, and moves no lifecycle state', async () => {
    const { store, claimStore } = await parkReady();
    const result = await checkWaitIncident(store, claimStore, 'gated', hoursAfter(READY_AT, 40), ASHCOMBE_DEPS, 'runtime-a');

    expect(result.state?.facts.offerSentAt).toBeUndefined();
    expect(result.entries?.flatMap((e) => e.transitions)).toEqual([]);
    const parked = await store.load('gated');
    expect(parked?.engineState.lifecycleState).toBe('BOOKING_READY');
  });

  /** The whole point: the same instant, the same anchor, a different verdict per profile. */
  it('reports OVERDUE for the same case under a profile that declares no such gate', async () => {
    const { store, claimStore } = await parkReady();
    const result = await checkWaitIncident(store, claimStore, 'gated', hoursAfter(READY_AT, 40), KESTREL_DEPS, 'runtime-a');

    expect(result.outcome).toBe('ATTENTION_OVERDUE');
  });

  it('returns to OVERDUE once the releasing fact is recorded', async () => {
    const { store, claimStore } = await parkReady({ [GATE.releasedByFact]: '2026-08-20T12:00:00.000Z' });
    const result = await checkWaitIncident(store, claimStore, 'gated', hoursAfter(READY_AT, 40), ASHCOMBE_DEPS, 'runtime-a');

    expect(result.outcome).toBe('ATTENTION_OVERDUE');
  });

  it('is still blocked before the action SLA would even have elapsed', async () => {
    const { store, claimStore } = await parkReady();
    const result = await checkWaitIncident(store, claimStore, 'gated', hoursAfter(READY_AT, 1), ASHCOMBE_DEPS, 'runtime-a');

    expect(result.outcome).toBe('ATTENTION_BLOCKED');
  });
});

describe('the evidence a block leaves is enough to act on', () => {
  /**
   * Asserted per LABELLED FACT rather than by searching the whole decision for a substring.
   * The looser version of this test let a mutation removing the dependency owner survive, because
   * the owner's name still appeared elsewhere in the record. A block an operator cannot act on is
   * the failure being fixed, so each of the six things has to be individually present.
   */
  it('records what is blocked, why, who owns it, and what would release it', async () => {
    const { store, claimStore } = await parkReady();
    const result = await checkWaitIncident(store, claimStore, 'gated', hoursAfter(READY_AT, 40), ASHCOMBE_DEPS, 'runtime-a');

    const decision = result.entries?.flatMap((e) => e.decisions).at(-1);
    expect(decision?.mechanism).toBe('DETERMINISTIC_RULE');

    const facts = new Map((decision?.deterministicFacts ?? []).map((f) => [f.label, f.value]));
    const has = (label: string, expected: string) => {
      const value = facts.get(label);
      expect(value, `the block records no "${label}"`).toBeDefined();
      expect(value, `"${label}" does not carry the gate's own declaration`).toContain(expected);
    };

    has('External gate', GATE.id);
    has('Releasing fact', GATE.releasedByFact);
    has('Released when', GATE.satisfiedBy);
    has('Dependency owned by', GATE.ownedBy);
    has('Release authorizes', GATE.authorizes);
    has('Basis', GATE.basis);
  });

  /**
   * A gate cites the policy that explains the refusal. Swapping it for a different but existing
   * policy passes `validateProfileConsistency` — the reference resolves — and would have the
   * decision quote an unrelated rule at whoever is trying to understand why nothing is happening.
   */
  it('quotes the gate’s own policy, not merely a policy that exists', async () => {
    const { store, claimStore } = await parkReady();
    const result = await checkWaitIncident(store, claimStore, 'gated', hoursAfter(READY_AT, 40), ASHCOMBE_DEPS, 'runtime-a');
    const decision = result.entries?.flatMap((e) => e.decisions).at(-1);

    expect(decision?.applicablePolicy.join(' '), 'the refusal cites the wrong policy').toContain(GATE.policyId);
  });

  /** A block is a refusal to act. A refusal with no authority recorded is indistinguishable from a bug. */
  it('records the block as a decision taken at zero authority', async () => {
    const { store, claimStore } = await parkReady();
    const result = await checkWaitIncident(store, claimStore, 'gated', hoursAfter(READY_AT, 40), ASHCOMBE_DEPS, 'runtime-a');
    const decision = result.entries?.flatMap((e) => e.decisions).at(-1);

    expect(decision?.authority).toBe(0);
    expect(decision?.forbiddenActions.join(' ')).toContain('dispatch');
  });
});

describe('the blocked action and the neglected dependency are different clocks', () => {
  it('raises no chase before the follow-up window, even past the action SLA', async () => {
    const { store, claimStore } = await parkReady();
    // 40h: past the action SLA, inside the 48h follow-up window.
    const result = await checkWaitIncident(store, claimStore, 'gated', hoursAfter(READY_AT, 40), ASHCOMBE_DEPS, 'runtime-a');

    expect(result.outcome).toBe('ATTENTION_BLOCKED');
    expect(result.entries?.flatMap((e) => e.sideEffects)).toEqual([]);
  });

  it('raises a chase once the follow-up window elapses, and stays blocked', async () => {
    const { store, claimStore } = await parkReady();
    const result = await checkWaitIncident(store, claimStore, 'gated', hoursAfter(READY_AT, 60), ASHCOMBE_DEPS, 'runtime-a');

    expect(result.outcome, 'chasing the dependency does not make the action late').toBe('ATTENTION_BLOCKED');
    const chase = result.entries
      ?.flatMap((e) => e.sideEffects)
      .find((s) => s.idempotencyKey === 'notify:gated:dependency-chase');
    expect(chase?.status).toBe('EXECUTED');
    expect(chase?.kind).toBe('NOTIFICATION');
  });

  it('never raises the dispatch-overdue condition while blocked, at any elapsed time', async () => {
    for (const hours of [1, 40, 60, 500]) {
      const { store, claimStore } = await parkReady();
      const result = await checkWaitIncident(store, claimStore, 'gated', hoursAfter(READY_AT, hours), ASHCOMBE_DEPS, 'runtime-a');
      const overdue = result.entries
        ?.flatMap((e) => e.sideEffects)
        .find((s) => s.idempotencyKey.includes('dispatch-overdue'));
      expect(overdue, `dispatch-overdue raised at +${hours}h while blocked`).toBeUndefined();
    }
  });
});

/**
 * THE ESCAPE HATCH, AND WHY IT IS OPT-IN PER GATE.
 *
 * Some businesses genuinely do owe a clock regardless of the dependency — a promised turnaround
 * that the client's own lateness does not excuse. That has to be expressible, or profiles would
 * quietly stop declaring gates to get their clock back, and "blocked" would lose its meaning by
 * disuse rather than by decision. Making it explicit per gate keeps the global meaning intact:
 * every other gate still means "not authorized", and this one says out loud that it does not.
 */
describe('a profile may declare that its clock runs anyway, and must say so explicitly', () => {
  const CLOCK_RUNS_ANYWAY: WaitResumeDeps = {
    ...ASHCOMBE_DEPS,
    profile: {
      ...ASHCOMBE,
      externalGates: (ASHCOMBE.externalGates ?? []).map((gate) => ({
        ...gate,
        actionClockRunsWhileBlocked: true,
      })),
    },
  };

  it('reports OVERDUE past the action window despite the gate being closed', async () => {
    const { store, claimStore } = await parkReady();
    const result = await checkWaitIncident(store, claimStore, 'gated', hoursAfter(READY_AT, 40), CLOCK_RUNS_ANYWAY, 'runtime-a');

    expect(result.outcome).toBe('ATTENTION_OVERDUE');
  });

  it('is the only thing that changed — the same profile without the flag is blocked', async () => {
    const { store, claimStore } = await parkReady();
    const blocked = await checkWaitIncident(store, claimStore, 'gated', hoursAfter(READY_AT, 40), ASHCOMBE_DEPS, 'runtime-a');

    expect(blocked.outcome).toBe('ATTENTION_BLOCKED');
  });
});

describe('a block is idempotent and replays exactly', () => {
  it('repeats the same verdict without duplicating the chase', async () => {
    const { store, claimStore } = await parkReady();
    const at = hoursAfter(READY_AT, 60);

    const first = await checkWaitIncident(store, claimStore, 'gated', at, ASHCOMBE_DEPS, 'runtime-a');
    const second = await checkWaitIncident(store, claimStore, 'gated', at, ASHCOMBE_DEPS, 'runtime-a');

    expect(first.outcome).toBe('ATTENTION_BLOCKED');
    expect(second.outcome).toBe('ATTENTION_BLOCKED');

    const executed = second.entries
      ?.flatMap((e) => e.sideEffects)
      .filter((s) => s.idempotencyKey === 'notify:gated:dependency-chase' && s.status === 'EXECUTED');
    expect(executed, 'the chase executed a second time').toHaveLength(0);
  });

  it('leaves the case exactly as it found it, so a re-check is a genuine no-op', async () => {
    const { store, claimStore } = await parkReady();
    const before = await store.load('gated');
    await checkWaitIncident(store, claimStore, 'gated', hoursAfter(READY_AT, 40), ASHCOMBE_DEPS, 'runtime-a');
    const after = await store.load('gated');

    expect(after?.engineState).toEqual(before?.engineState);
  });
});
