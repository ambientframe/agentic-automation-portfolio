import { beforeAll, describe, expect, it } from 'vitest';
import { RUNNABLE_SYSTEMS } from '@/lib/engine/registry';
import { SCENARIO_UNEXERCISED_TRANSITIONS } from '@/data/transition-coverage';
import {
  computeScenarioTransitionCoverage,
  creditedRuleIds,
  type SystemTransitionCoverage,
} from '@/lib/proof/transition-coverage';

/**
 * WHICH DECLARED TRANSITIONS CAN A VISITOR ACTUALLY REPLAY?
 *
 * `validateLifecycle` now proves a declared recovery is BUILDABLE — that the graph could
 * perform it. It says nothing about whether anything ever does. Those are different questions,
 * and the gap between them is where `lr-fm-malformed` lived: entering `FAILED_RECOVERABLE` was
 * buildable and built, and every exit from it was buildable and never built, for months, behind
 * a `Pending` marker that read as unfinished writing.
 *
 * `docs/STATUS.md` gaps 1–5 are hand-maintained lists of exactly this — "declared but
 * unexercised" transitions, per system, written in prose and updated by whoever remembered.
 * A list maintained by memory is a list that is wrong. This computes it.
 *
 * SCENARIO coverage specifically, and the distinction is deliberate. A transition exercised
 * only by a unit test is proven to work; a transition exercised by a SCENARIO is one a visitor
 * can open in the simulator and watch. This portfolio's whole claim is inspectability, so the
 * second is the number that matters commercially, and it is the smaller and less flattering of
 * the two. Several transitions closed by direct tests this session are counted as unexercised
 * here, correctly.
 *
 * BOTH DIRECTIONS FAIL, the same discipline as the recovery validator. A transition that
 * quietly stops being exercised fails the build; so does a snapshot entry for a transition that
 * has since been covered. Otherwise the snapshot becomes the next stale annotation.
 */

let coverage: readonly SystemTransitionCoverage[];

beforeAll(async () => {
  coverage = await computeScenarioTransitionCoverage();
});

describe('scenario transition coverage', () => {
  it('reports one entry per runnable system', () => {
    expect(coverage).toHaveLength(RUNNABLE_SYSTEMS.length);
  });

  it('counts every declared transition exactly once', () => {
    for (const entry of coverage) {
      const system = RUNNABLE_SYSTEMS.find((r) => r.system.id === entry.systemId)?.system;
      expect(system, `${entry.systemId} is not a runnable system`).toBeDefined();
      expect(entry.declared).toBe(system?.lifecycle.transitions.length);
      expect(entry.exercised.length + entry.unexercised.length).toBe(entry.declared);
    }
  });

  it('exercises at least one transition per system, or the system is not runnable at all', () => {
    for (const entry of coverage) {
      expect(entry.exercised.length, `${entry.systemId} exercises no transition by scenario`).toBeGreaterThan(0);
    }
  });

  /**
   * The reconciliation. This is the test that turns STATUS's prose lists into enforced data.
   */
  it('matches the committed snapshot exactly, in both directions', () => {
    for (const entry of coverage) {
      const snapshot = SCENARIO_UNEXERCISED_TRANSITIONS[entry.systemId];
      expect(snapshot, `${entry.systemId} has no committed coverage snapshot`).toBeDefined();

      const computed = [...entry.unexercised].sort();
      const declaredUnexercised = [...(snapshot ?? [])].sort();

      const newlyUnexercised = computed.filter((id) => !declaredUnexercised.includes(id));
      const staleEntries = declaredUnexercised.filter((id) => !computed.includes(id));

      expect(
        newlyUnexercised,
        `${entry.systemId}: these transitions are no longer exercised by any scenario and are not recorded as such. Either author a scenario that drives them, or add them to data/transition-coverage.ts.`,
      ).toEqual([]);
      expect(
        staleEntries,
        `${entry.systemId}: these are recorded as unexercised but a scenario now drives them. Remove them from data/transition-coverage.ts — a stale snapshot is the next Pending marker.`,
      ).toEqual([]);
    }
  });

  it('records no transition id the system does not declare', () => {
    for (const [systemId, ids] of Object.entries(SCENARIO_UNEXERCISED_TRANSITIONS)) {
      const system = RUNNABLE_SYSTEMS.find((r) => r.system.id === systemId)?.system;
      expect(system, `snapshot names unknown system "${systemId}"`).toBeDefined();
      const declared = new Set(system?.lifecycle.transitions.map((t) => t.id));
      for (const id of ids) {
        expect(declared.has(id), `snapshot names "${id}", which ${systemId} does not declare`).toBe(true);
      }
    }
  });

  /**
   * A `Verified` standard can still contain a move nobody can watch, and this is what keeps
   * that visible.
   *
   * The earlier version of this test pinned `lr-t30`/`lr-t32` as the example. Two scenarios
   * later they are replayable, so the pin was retired rather than deleted — the claim it
   * protected is not about those two ids, it is that closing a standard and making it
   * inspectable are different achievements. `lr-fm-malformed` is the standing proof:
   * marked `Verified`, its declared recovery includes `lr-t31`
   * (`FAILED_RECOVERABLE -> FAILED_TERMINAL`), and no scenario drives it.
   */
  it('lets a Verified standard still admit a move nobody can watch', () => {
    const mode = RUNNABLE_SYSTEMS.find((r) => r.system.id === 'lead-rescue')
      ?.system.failureModes.find((m) => m.id === 'lr-fm-malformed');
    expect(mode?.verificationTest.startsWith('Pending')).toBe(false);
    expect(mode?.recoveryPath.shape).toBe('MOVES');

    const declaredMoves =
      mode?.recoveryPath.shape === 'MOVES' ? mode.recoveryPath.moves : [];
    expect(declaredMoves.length).toBeGreaterThan(1);

    const unexercised = SCENARIO_UNEXERCISED_TRANSITIONS['lead-rescue'] ?? [];
    expect(
      unexercised,
      'the terminal-failure exit is replayable now — retire this pin and pick the next standing example, do not delete the check',
    ).toContain('lr-t31');
  });

  /**
   * The engine's own refusal is not a demonstration of the thing it refused.
   *
   * Every rejection the current scenarios produce carries no `ruleId` — rejection today means
   * "no declared rule matched" — so this guard is unreachable through a scenario and a mutation
   * that removed it survived. It is driven directly instead, because a matched-but-refused move
   * would carry a rule id and must still not count.
   */
  it('never credits a transition the engine rejected, even when it matched a declared rule', () => {
    const credited = creditedRuleIds([
      { accepted: true, ruleId: 'lr-t01' },
      { accepted: false, ruleId: 'lr-t21' },
      { accepted: false },
      { accepted: true },
    ]);
    expect([...credited]).toEqual(['lr-t01']);
    expect(credited.has('lr-t21'), 'a refused transition was credited as coverage').toBe(false);
  });

  it('reports a portfolio total that is neither zero nor complete, and says so honestly', () => {
    const declared = coverage.reduce((sum, e) => sum + e.declared, 0);
    const exercised = coverage.reduce((sum, e) => sum + e.exercised.length, 0);
    expect(declared).toBeGreaterThan(100);
    expect(exercised).toBeGreaterThan(0);
    expect(exercised, 'full scenario coverage would be a claim this build cannot support').toBeLessThan(declared);
  });
});
