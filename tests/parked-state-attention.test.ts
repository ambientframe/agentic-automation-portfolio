import { describe, expect, it } from 'vitest';
import { ALL_SYSTEMS } from '@/data/systems';
import { ABANDONABLE_PARKED_STATES } from '@/data/parked-state-attention';
import { auditParkedStates, abandonableStateIds } from '@/lib/proof/parked-state-attention';
import { validateLifecycle, type SystemDefinition } from '@/lib/model/system';

/**
 * WHICH PARKED STATES CAN ONLY BE LEFT BY THE PERSON WHO IS NOT ACTING?
 *
 * `validateLifecycle` already refuses a DEAD_END_STATE — a non-terminal state with no
 * outgoing transition at all. This file is about its subtler sibling, which that check passes
 * cleanly: a state with several declared exits, EVERY one of which requires a HUMAN_DECISION.
 * Such a state is not a dead end on the graph. It is a dead end in practice, because the only
 * thing that can move the case is the party the case is already waiting on.
 *
 * That is not automatically a defect. Lead Rescue's NEEDS_HUMAN and Call-to-Proposal's
 * AWAITING_APPROVAL are both in exactly that shape, and both are fine, because canon declares
 * an attention mechanism for them — a HUMAN_APPROVAL_TIMEOUT failure mode that escalates the
 * fact that nobody has acted without moving the case. The defect is the pair:
 *
 *     no self-driven exit  AND  no declared attention mechanism
 *
 * which is a state work can enter and never be forced out of, with nothing in canon admitting
 * it. This was found the way `docs/STATUS.md` gap 0 was found: by asking the graph a question
 * nobody had asked it, immediately after asserting something about the graph that was wrong.
 *
 * The link from "attention mechanism" to "which states it covers" did not previously exist in
 * data — `HOLDS_POSITION` carried only a prose `note`, and a validator cannot check a
 * sentence. That is the same reason `RecoveryMoveSchema` replaced prose `terminalState`. So
 * `holdsAt` is now a declared field, and the tests below check both that it resolves and that
 * an attention claim cannot decline to say where it applies.
 */

/** A system whose lifecycle is trivially known, so the assertions are about the derivation. */
function fixtureSystem(overrides: Partial<SystemDefinition>): SystemDefinition {
  const base = ALL_SYSTEMS[0];
  if (base === undefined) throw new Error('no systems registered');
  return { ...base, id: 'fixture-system', ...overrides };
}

const HUMAN_ONLY_EXIT = fixtureSystem({
  lifecycle: {
    states: [
      { id: 'START', label: 'Start', kind: 'INITIAL', description: 'Start.' },
      { id: 'PARKED', label: 'Parked', kind: 'HUMAN_REVIEW', description: 'Held for a person.' },
      { id: 'DONE', label: 'Done', kind: 'TERMINAL_SUCCESS', description: 'Done.' },
    ],
    transitions: [
      { id: 'fx-t01', from: 'START', to: 'PARKED', trigger: 'Held', mechanism: 'DETERMINISTIC_RULE', guard: 'Always.', authority: 3 },
      { id: 'fx-t02', from: 'PARKED', to: 'DONE', trigger: 'Human decision', mechanism: 'HUMAN_DECISION', guard: 'A person acted.', authority: 2 },
    ],
  },
  failureModes: [],
});

const SELF_DRIVEN_EXIT = fixtureSystem({
  lifecycle: {
    states: [...HUMAN_ONLY_EXIT.lifecycle.states],
    transitions: [
      ...HUMAN_ONLY_EXIT.lifecycle.transitions,
      { id: 'fx-t03', from: 'PARKED', to: 'DONE', trigger: 'Window elapsed', mechanism: 'DETERMINISTIC_RULE', guard: 'Configured window elapsed.', authority: 3 },
    ],
  },
  failureModes: [],
});

function withAttention(system: SystemDefinition, holdsAt: readonly string[]): SystemDefinition {
  const base = ALL_SYSTEMS[0];
  if (base === undefined || base.failureModes[0] === undefined) throw new Error('no failure mode to base on');
  return {
    ...system,
    failureModes: [
      {
        ...base.failureModes[0],
        id: 'fx-fm-attention',
        class: 'HUMAN_APPROVAL_TIMEOUT',
        recoveryPath: { shape: 'HOLDS_POSITION', holdsAt: [...holdsAt], note: 'Escalates attention without moving the case.' },
      },
    ],
  };
}

describe('parked-state attention audit', () => {
  describe('the derivation asks the graph, not the prose', () => {
    it('flags a parked state whose every declared exit needs the person who is not acting', () => {
      const rows = auditParkedStates(HUMAN_ONLY_EXIT);
      const parked = rows.find((r) => r.stateId === 'PARKED');
      expect(parked?.selfDrivenExits).toBe(0);
      expect(parked?.abandonable).toBe(true);
    });

    it('does not flag a parked state the system itself can leave', () => {
      const rows = auditParkedStates(SELF_DRIVEN_EXIT);
      const parked = rows.find((r) => r.stateId === 'PARKED');
      expect(parked?.selfDrivenExits).toBe(1);
      expect(parked?.abandonable).toBe(false);
    });

    it('does not flag a stranded state that a declared attention mechanism names', () => {
      const rows = auditParkedStates(withAttention(HUMAN_ONLY_EXIT, ['PARKED']));
      const parked = rows.find((r) => r.stateId === 'PARKED');
      expect(parked?.selfDrivenExits).toBe(0);
      expect(parked?.attendedBy).toEqual(['fx-fm-attention']);
      expect(parked?.abandonable).toBe(false);
    });

    it('still flags a stranded state when the attention mechanism names a different one', () => {
      // Covering AWAITING_APPROVAL says nothing about NEEDS_HUMAN. A per-system check would
      // call this handled; a per-state one does not, and the difference is the whole point.
      const rows = auditParkedStates(withAttention(HUMAN_ONLY_EXIT, ['DONE']));
      expect(rows.find((r) => r.stateId === 'PARKED')?.abandonable).toBe(true);
    });

    it('considers only states work actually parks in, never active or terminal ones', () => {
      const rows = auditParkedStates(HUMAN_ONLY_EXIT);
      expect(rows.map((r) => r.stateId)).toEqual(['PARKED']);
    });

    it('reports every declared exit, so a row can be checked rather than trusted', () => {
      const parked = auditParkedStates(HUMAN_ONLY_EXIT).find((r) => r.stateId === 'PARKED');
      expect(parked?.exits).toEqual([{ id: 'fx-t02', to: 'DONE', mechanism: 'HUMAN_DECISION' }]);
    });

    it('does not accept a bounded judgment as the system acting on its own', () => {
      // No parked state in any of the six systems currently declares a BOUNDED_AI_JUDGMENT
      // exit, so this rule is unreachable from the real model and a mutation weakening it
      // survived the first suite. It is driven directly here rather than deleted or left
      // untested, the same repair `creditedRuleIds` got in the transition-coverage package.
      //
      // The rule itself: a judgment is not a person and not a clock. It still has to be
      // invoked by something, and a portfolio that caps despatch at human approval does not
      // get to count a model call as the escape hatch from a state a human is sitting on.
      const judgmentExit = fixtureSystem({
        lifecycle: {
          states: [...HUMAN_ONLY_EXIT.lifecycle.states],
          transitions: [
            ...HUMAN_ONLY_EXIT.lifecycle.transitions,
            { id: 'fx-t04', from: 'PARKED', to: 'DONE', trigger: 'Interpretation returned', mechanism: 'BOUNDED_AI_JUDGMENT', guard: 'Confidence above the floor.', authority: 1 },
          ],
        },
        failureModes: [],
      });
      const parked = auditParkedStates(judgmentExit).find((r) => r.stateId === 'PARKED');
      expect(parked?.exits).toHaveLength(2);
      expect(parked?.selfDrivenExits).toBe(0);
      expect(parked?.abandonable).toBe(true);
    });

    it('returns ids in a stable order, so declaration order never leaks into the snapshot', () => {
      const outOfOrder = fixtureSystem({
        lifecycle: {
          states: [
            { id: 'START', label: 'Start', kind: 'INITIAL', description: 'Start.' },
            { id: 'ZED_PARKED', label: 'Zed parked', kind: 'HUMAN_REVIEW', description: 'Held.' },
            { id: 'ALPHA_PARKED', label: 'Alpha parked', kind: 'WAITING', description: 'Held.' },
            { id: 'DONE', label: 'Done', kind: 'TERMINAL_SUCCESS', description: 'Done.' },
          ],
          transitions: [
            { id: 'fx-t01', from: 'START', to: 'ZED_PARKED', trigger: 'Held', mechanism: 'DETERMINISTIC_RULE', guard: 'Always.', authority: 3 },
            { id: 'fx-t02', from: 'ZED_PARKED', to: 'ALPHA_PARKED', trigger: 'Human decision', mechanism: 'HUMAN_DECISION', guard: 'A person acted.', authority: 2 },
            { id: 'fx-t03', from: 'ALPHA_PARKED', to: 'DONE', trigger: 'Human decision', mechanism: 'HUMAN_DECISION', guard: 'A person acted.', authority: 2 },
          ],
        },
        failureModes: [],
      });
      expect(abandonableStateIds(outOfOrder)).toEqual(['ALPHA_PARKED', 'ZED_PARKED']);
    });
  });

  describe('an attention claim must say where it applies', () => {
    it('refuses a holdsAt naming a state the lifecycle does not declare', () => {
      const issues = validateLifecycle(withAttention(HUMAN_ONLY_EXIT, ['NOT_A_STATE']));
      expect(issues.map((i) => i.kind)).toContain('UNKNOWN_HOLDS_AT_STATE');
    });

    it('refuses an attention failure mode that declines to name any state', () => {
      const base = ALL_SYSTEMS[0];
      if (base?.failureModes[0] === undefined) throw new Error('no failure mode to base on');
      const vague = fixtureSystem({
        lifecycle: HUMAN_ONLY_EXIT.lifecycle,
        failureModes: [
          {
            ...base.failureModes[0],
            id: 'fx-fm-vague',
            class: 'HUMAN_APPROVAL_TIMEOUT',
            recoveryPath: { shape: 'HOLDS_POSITION', note: 'It holds position somewhere.' },
          },
        ],
      });
      expect(validateLifecycle(vague).map((i) => i.kind)).toContain('ATTENTION_WITHOUT_STATES');
    });

    it('leaves other HOLDS_POSITION recoveries alone — not every hold is about attention', () => {
      // A duplicate side effect holds wherever the case happens to be. Demanding a state list
      // there would be false precision, not rigour.
      const base = ALL_SYSTEMS[0];
      if (base?.failureModes[0] === undefined) throw new Error('no failure mode to base on');
      const duplicate = fixtureSystem({
        lifecycle: HUMAN_ONLY_EXIT.lifecycle,
        failureModes: [
          {
            ...base.failureModes[0],
            id: 'fx-fm-duplicate',
            class: 'RETRY_DUPLICATE_SIDE_EFFECT',
            recoveryPath: { shape: 'HOLDS_POSITION', note: 'The replay is refused and the case does not move.' },
          },
        ],
      });
      expect(validateLifecycle(duplicate).map((i) => i.kind)).not.toContain('ATTENTION_WITHOUT_STATES');
    });
  });

  describe('the published snapshot is reconciled against the model, in both directions', () => {
    it('names exactly the states the model currently finds abandonable', () => {
      for (const system of ALL_SYSTEMS) {
        expect(
          [...(ABANDONABLE_PARKED_STATES[system.id] ?? [])].sort(),
          `${system.id}: data/parked-state-attention.ts disagrees with the model. Author an attention failure mode to shorten this list — never edit an entry away.`,
        ).toEqual([...abandonableStateIds(system)].sort());
      }
    });

    it('lists no system the registry does not have, and no state the system does not declare', () => {
      const systemIds = new Set(ALL_SYSTEMS.map((s) => s.id));
      for (const [systemId, states] of Object.entries(ABANDONABLE_PARKED_STATES)) {
        expect(systemIds.has(systemId), `unknown system "${systemId}"`).toBe(true);
        const system = ALL_SYSTEMS.find((s) => s.id === systemId);
        const declared = new Set(system?.lifecycle.states.map((s) => s.id) ?? []);
        for (const stateId of states) {
          expect(declared.has(stateId), `${systemId}: unknown state "${stateId}"`).toBe(true);
        }
      }
    });

    it('holds the two systems that DID declare attention to their own claim', () => {
      // Lead Rescue and Call-to-Proposal both ship a HUMAN_APPROVAL_TIMEOUT. Their covered
      // states must therefore be absent from the list — if one reappears, the mechanism was
      // removed or the state was renamed out from under it.
      expect(ABANDONABLE_PARKED_STATES['lead-rescue'] ?? []).not.toContain('NEEDS_HUMAN');
      expect(ABANDONABLE_PARKED_STATES['call-to-proposal'] ?? []).not.toContain('AWAITING_APPROVAL');
    });
  });

  describe('what the real portfolio currently says', () => {
    it('finds at least one system whose parked work has nothing declared about being abandoned', () => {
      const exposed = ALL_SYSTEMS.filter((s) => abandonableStateIds(s).length > 0);
      expect(
        exposed.length,
        'if this ever reaches zero, delete this assertion and say so — do not weaken it',
      ).toBeGreaterThan(0);
    });
  });
});
