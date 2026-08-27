import { beforeAll, describe, expect, it } from 'vitest';
import { ALL_SYSTEMS } from '@/data/systems';
import { RUNNABLE_SYSTEMS } from '@/lib/engine/registry';
import { computeScenarioTransitionCoverage } from '@/lib/proof/transition-coverage';
import { deriveCoverageView, type CoverageView } from '@/lib/proof/coverage-view';

/**
 * THE COVERAGE NUMBER IS A COMMERCIAL CLAIM, SO IT GETS THE SAME TREATMENT AS EVERY OTHER ONE.
 *
 * `tests/transition-coverage.test.ts` proves the measurement is right. This proves the thing a
 * buyer READS is the measurement — that the page cannot state a rounder, kinder number than the
 * one the engine produced, and cannot show the headline without the caveats that bound it.
 *
 * The failure mode here is specific and this repository has already lived it: a figure typed
 * into prose beside a figure that is computed, drifting apart silently. Every number in this
 * view is derived, and the uncovered transitions are NAMED rather than counted — "22 of 37 are
 * not replayable" invites trust, a list of exactly which 22 invites checking.
 */

let views: readonly CoverageView[];

beforeAll(async () => {
  const coverage = await computeScenarioTransitionCoverage();
  views = coverage.map((entry) => {
    const system = ALL_SYSTEMS.find((s) => s.id === entry.systemId);
    if (system === undefined) throw new Error(`no system for ${entry.systemId}`);
    return deriveCoverageView(system, entry);
  });
});

describe('the coverage a visitor reads is the coverage the engine measured', () => {
  it('derives a view for every runnable system', () => {
    expect(views).toHaveLength(RUNNABLE_SYSTEMS.length);
  });

  it('states counts that add up to the declared total', () => {
    for (const view of views) {
      expect(view.exercised + view.unexercised.length).toBe(view.declared);
      expect(view.declared).toBeGreaterThan(0);
    }
  });

  it('computes the percentage rather than rounding it in prose', () => {
    for (const view of views) {
      expect(view.percentage).toBe(Math.round((view.exercised / view.declared) * 100));
    }
  });

  it('names every unexercised transition, never just how many there are', () => {
    for (const view of views) {
      const system = ALL_SYSTEMS.find((s) => s.id === view.systemId);
      for (const row of view.unexercised) {
        const rule = system?.lifecycle.transitions.find((t) => t.id === row.id);
        expect(rule, `${view.systemId} names unknown transition ${row.id}`).toBeDefined();
        // The row carries readable state labels, so a reader can tell what is missing without
        // opening the dossier to decode an id.
        expect(row.from.length).toBeGreaterThan(0);
        expect(row.to.length).toBeGreaterThan(0);
        expect(row.from).not.toBe(rule?.from);
        expect(row.trigger).toBe(rule?.trigger);
      }
    }
  });

  it('renders the headline from the counts, so prose cannot drift from arithmetic', () => {
    for (const view of views) {
      expect(view.headline).toContain(String(view.exercised));
      expect(view.headline).toContain(String(view.declared));
    }
  });

  /**
   * Both caveats are load-bearing and neither is optional. Without the first, a reader assumes
   * the uncovered transitions are broken. Without the second, this page understates correctness
   * — several of these ARE proven by unit tests — and an understatement presented as the whole
   * truth is still a false impression.
   */
  it('carries both caveats: uncovered is not broken, and covered-by-test is not replayable', () => {
    for (const view of views) {
      const caveats = view.caveats.join(' ').toLowerCase();
      expect(caveats, 'the "not broken" caveat is missing').toMatch(/not (a defect|broken)|unauthored/);
      // Not merely "mentions a unit test somewhere" — that passed with the whole caveat deleted,
      // because a different caveat also happens to say "unit test". The load-bearing claim is
      // the DISTINCTION, and that it admits the number understates correctness.
      expect(caveats, 'the unit-test distinction is missing').toContain(
        'not the same as being replayable',
      );
      expect(caveats, 'the view does not admit that it understates correctness').toContain('understates');
    }
  });

  it('never claims a system is fully replayable when it is not', () => {
    for (const view of views) {
      if (view.unexercised.length > 0) {
        expect(view.complete).toBe(false);
        expect(view.percentage).toBeLessThan(100);
      }
    }
  });

  it('reports the portfolio total honestly across all six', () => {
    const declared = views.reduce((n, v) => n + v.declared, 0);
    const exercised = views.reduce((n, v) => n + v.exercised, 0);
    expect(declared).toBeGreaterThan(100);
    expect(exercised).toBeLessThan(declared);
  });

  it('sorts unexercised rows by transition id so two renders of one build agree', () => {
    for (const view of views) {
      const ids = view.unexercised.map((r) => r.id);
      expect(ids).toEqual([...ids].sort());
    }
  });

  /**
   * The assertion above cannot fail on today's data: transitions happen to be declared in id
   * order, so the sort is a no-op and removing it survived a mutation. The sort is still
   * defensive — a future system need not declare them in order — so it is driven directly with
   * input that is genuinely out of order rather than deleted as redundant.
   */
  it('orders the list even when the coverage arrives shuffled', () => {
    const system = ALL_SYSTEMS.find((s) => s.id === 'lead-rescue');
    expect(system).toBeDefined();
    const view = deriveCoverageView(system!, {
      systemId: 'lead-rescue',
      declared: system!.lifecycle.transitions.length,
      exercised: [],
      unexercised: ['lr-t09', 'lr-t01', 'lr-t22', 'lr-t05'],
    });
    expect(view.unexercised.map((r) => r.id)).toEqual(['lr-t01', 'lr-t05', 'lr-t09', 'lr-t22']);
  });
});
