import { describe, expect, it } from 'vitest';
import { ALL_SYSTEMS } from '@/data/systems';
import { DORMANT_PIPELINE_RECOVERY } from '@/data/systems/dormant-pipeline-recovery';
import {
  describeRecovery,
  validateLifecycle,
  type RecoveryMove,
  type SystemDefinition,
} from '@/lib/model/system';

/**
 * A FAILURE MODE'S RECOVERY IS A CLAIM ABOUT THE TRANSITION GRAPH, SO IT SHOULD BE CHECKED
 * AGAINST ONE.
 *
 * Gap 0 in `docs/STATUS.md` is the reason this file exists. Two Dormant Pipeline failure modes
 * declared recoveries the lifecycle has no transition for — `dp-fm-stale-data` asking for
 * `SCHEDULED -> ELIGIBILITY_REVIEW`, `dp-fm-rate-limited` for
 * `REACTIVATION_ATTEMPTED -> SCHEDULED`. The engine would have refused both. They sat for
 * months marked `Pending — scenario not yet authored`, which read as unfinished authoring and
 * was in fact a canon defect: the standards were not unwritten, they were **unbuildable**.
 *
 * Nothing caught it because `terminalState` was free prose (`'ELIGIBILITY_REVIEW.'`,
 * `'SCHEDULED — unsent records return to the queue…'`). A validator cannot check a sentence.
 *
 * The fix is not a stricter reader — it is a structured field. A recovery now declares the
 * movements it requires as (from, to) pairs, and `validateLifecycle` checks each against the
 * declared transitions.
 *
 * TWO DIRECTIONS OF FAILURE, DELIBERATELY. An unbuildable recovery fails the build unless it
 * carries an explicit `unbuildable: true` marker, which renders it in the register as an open
 * canon defect rather than as handling. And that marker itself fails the build the moment the
 * transition exists — otherwise the honest escape hatch becomes the next thing to rot, which
 * is exactly how `Pending` got here.
 */

/** A system whose lifecycle is trivially known, so the assertions are about the validator. */
function fixtureSystem(moves: readonly RecoveryMove[]): SystemDefinition {
  const base = ALL_SYSTEMS[0];
  if (base === undefined) throw new Error('no systems registered');
  return {
    ...base,
    id: 'fixture-system',
    failureModes: [
      {
        ...base.failureModes[0]!,
        id: 'fx-fm-under-test',
        recoveryPath: { shape: 'MOVES', moves: [...moves] },
      },
    ],
  };
}

const REAL_TRANSITION = (() => {
  const base = ALL_SYSTEMS[0];
  const t = base?.lifecycle.transitions[0];
  if (t === undefined) throw new Error('no transitions registered');
  return { from: t.from, to: t.to };
})();

describe('failure-mode recovery is checked against the transition graph', () => {
  describe('the portfolio as it stands', () => {
    it('declares a structured recovery on every failure mode in every system', () => {
      for (const system of ALL_SYSTEMS) {
        for (const mode of system.failureModes) {
          expect(mode.recoveryPath, `${system.id}/${mode.id} has no structured recovery`).toBeDefined();
          expect(['MOVES', 'HOLDS_POSITION', 'BELOW_LIFECYCLE']).toContain(mode.recoveryPath.shape);
        }
      }
    });

    it('reports no structural issues across all six systems', () => {
      for (const system of ALL_SYSTEMS) {
        expect(validateLifecycle(system), `${system.id} has structural issues`).toEqual([]);
      }
    });

    it('still renders every recovery as readable prose for the register and the UI', () => {
      for (const system of ALL_SYSTEMS) {
        for (const mode of system.failureModes) {
          const prose = describeRecovery(system, mode.recoveryPath);
          expect(prose.length, `${system.id}/${mode.id} renders an empty recovery`).toBeGreaterThan(4);
          expect(prose.toLowerCase()).not.toBe('error');
        }
      }
    });
  });

  describe('gap 0 is now a bounded, named defect rather than an invisible one', () => {
    const unbuildable = ALL_SYSTEMS.flatMap((system) =>
      system.failureModes.flatMap((mode) =>
        mode.recoveryPath.shape === 'MOVES'
          ? mode.recoveryPath.moves.filter((m) => m.unbuildable === true).map(() => `${system.id}/${mode.id}`)
          : [],
      ),
    );

    /**
     * Three, not the two gap 0 named. `dp-fm-suppression` was the find: its `prevention` and
     * `detection` both declare a consent re-check at DESPATCH time, which happens from
     * SCHEDULED — and nothing performs SCHEDULED -> SUPPRESSED. dp-t06 is the only way out of
     * SCHEDULED and it carries that re-check as a guard, so a record whose consent goes stale
     * after scheduling fails the guard and has nowhere to go. The validator found it on the
     * first run over migrated data, which is the argument for the validator.
     */
    it('marks exactly the three Dormant Pipeline recoveries the lifecycle cannot perform', () => {
      expect(new Set(unbuildable)).toEqual(
        new Set([
          'dormant-pipeline-recovery/dp-fm-suppression',
          'dormant-pipeline-recovery/dp-fm-stale-data',
          'dormant-pipeline-recovery/dp-fm-rate-limited',
        ]),
      );
    });

    it('leaves the transition graph alone rather than inventing transitions to satisfy them', () => {
      const has = (from: string, to: string) =>
        DORMANT_PIPELINE_RECOVERY.lifecycle.transitions.some((t) => t.from === from && t.to === to);
      expect(has('SCHEDULED', 'ELIGIBILITY_REVIEW')).toBe(false);
      expect(has('REACTIVATION_ATTEMPTED', 'SCHEDULED')).toBe(false);
      expect(has('SCHEDULED', 'SUPPRESSED')).toBe(false);
    });

    /**
     * The one non-obvious consequence of the find: SCHEDULED's only exit is guarded on the
     * very check that fails. This is not the validator's own concern — it checks recoveries,
     * not guards — so it is pinned here explicitly rather than left to be rediscovered.
     */
    it('pins the structural reason: SCHEDULED has exactly one exit, and its guard is the failing check', () => {
      const out = DORMANT_PIPELINE_RECOVERY.lifecycle.transitions.filter((t) => t.from === 'SCHEDULED');
      expect(out).toHaveLength(1);
      expect(out[0]?.id).toBe('dp-t06');
      expect(out[0]?.guard).toContain('consent re-checked immediately before despatch');
    });

    it('renders an unbuildable recovery as an open defect, never as handling', () => {
      const mode = DORMANT_PIPELINE_RECOVERY.failureModes.find((m) => m.id === 'dp-fm-stale-data');
      expect(mode).toBeDefined();
      expect(describeRecovery(DORMANT_PIPELINE_RECOVERY, mode!.recoveryPath)).toContain(
        'no declared transition',
      );
    });
  });

  describe('the validator catches what free prose could not', () => {
    it('rejects a recovery whose movement has no declared transition', () => {
      const issues = validateLifecycle(fixtureSystem([{ from: 'NEW', to: 'BOOKED' }]));
      expect(issues.map((i) => i.kind)).toContain('UNBUILDABLE_RECOVERY');
    });

    it('accepts a recovery whose movement is a declared transition', () => {
      const issues = validateLifecycle(fixtureSystem([REAL_TRANSITION]));
      expect(issues).toEqual([]);
    });

    it('rejects a recovery that names a state the lifecycle never declared', () => {
      const issues = validateLifecycle(fixtureSystem([{ from: 'NEW', to: 'NOWHERE_AT_ALL' }]));
      expect(issues.map((i) => i.kind)).toContain('UNKNOWN_RECOVERY_STATE');
    });

    it('accepts an unbuildable movement when it is explicitly marked as one', () => {
      const issues = validateLifecycle(fixtureSystem([{ from: 'NEW', to: 'BOOKED', unbuildable: true }]));
      expect(issues).toEqual([]);
    });

    /**
     * The escape hatch must not become the next `Pending`. Once somebody adds the transition,
     * the marker is a lie in the opposite direction — it reports an open defect that is closed
     * — so it fails the build until it is removed.
     */
    it('rejects an unbuildable marker on a movement the lifecycle can actually perform', () => {
      const issues = validateLifecycle(fixtureSystem([{ ...REAL_TRANSITION, unbuildable: true }]));
      expect(issues.map((i) => i.kind)).toContain('STALE_UNBUILDABLE_MARKER');
    });

    it('checks every movement in a multi-step recovery, not just the first', () => {
      const issues = validateLifecycle(fixtureSystem([REAL_TRANSITION, { from: 'NEW', to: 'BOOKED' }]));
      expect(issues.map((i) => i.kind)).toContain('UNBUILDABLE_RECOVERY');
    });
  });
});
