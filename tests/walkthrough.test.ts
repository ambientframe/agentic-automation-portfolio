import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LEAD_RESCUE } from '@/data/systems';
import { KESTREL } from '@/data/profiles/kestrel/profile';
import { LEAD_RESCUE_SCENARIOS } from '@/data/profiles/kestrel/scenarios/lead-rescue';
import { ALL_RUNNABLE_SCENARIOS } from '@/lib/engine/registry';
import { numberParam } from '@/lib/model/profile';

/**
 * THE WALKTHROUGH IS COLLATERAL, WHICH IS EXACTLY WHY IT NEEDS A TEST.
 *
 * This repository has now twice shipped a README that described a build it no longer had:
 * `1e24806` fixed one that claimed 310 tests and 23 pages and denied n8n, live-model, and
 * outbound work that existed. Prose about the product is the part of the product with no
 * compiler, so it is the part that rots.
 *
 * A walkthrough is worse than a README on both counts. It is read by exactly the people who
 * will not check — a buyer, five minutes, no clone — and it is the surface where "nothing
 * simulated may read as live" is easiest to violate by omission rather than by assertion.
 *
 * So three separate things are guarded here, and they fail for three different reasons:
 *
 *   1. STRUCTURE — a walkthrough whose frames have gone missing is a dead link with extra
 *      steps, and the whole point of committing frames is surviving a dead link.
 *   2. ARITHMETIC — every figure the walkthrough states is recomputed from `data/` here. Add
 *      a ninth scenario and the sentence claiming eight goes RED, in this file, today.
 *   3. TRUTHFULNESS — the walkthrough must carry its own limits. Not "does not lie": it must
 *      positively state the fiction, the failed evaluation, and the absence of a customer.
 *      An omission is how collateral drifts live without a single false sentence.
 */

const REPO = process.cwd();
const WALKTHROUGH_PATH = join(REPO, 'docs/WALKTHROUGH.md');
const README_PATH = join(REPO, 'README.md');

function read(path: string): string {
  return readFileSync(path, 'utf8');
}

/** Every `![alt](path)` in a markdown file, resolved against that file's own directory. */
function imageReferences(markdownPath: string): readonly { alt: string; href: string; resolved: string }[] {
  const source = read(markdownPath);
  const found: { alt: string; href: string; resolved: string }[] = [];
  for (const match of source.matchAll(/!\[([^\]]*)\]\(([^)\s]+)\)/g)) {
    const alt = match[1] ?? '';
    const href = match[2];
    if (href === undefined) continue;
    found.push({ alt, href, resolved: resolve(dirname(markdownPath), href) });
  }
  return found;
}

/**
 * The beat table is the walkthrough's own contract with the clock. Parsing it rather than
 * trusting the title is what makes "90 seconds" a checkable claim instead of a round number.
 */
function beatSeconds(): readonly number[] {
  const source = read(WALKTHROUGH_PATH);
  const seconds: number[] = [];
  for (const line of source.split('\n')) {
    const row = /^\|\s*(\d+)\s*\|\s*(\d+)s\s*\|/.exec(line);
    if (row !== null) seconds.push(Number(row[2]));
  }
  return seconds;
}

describe('the 90-second walkthrough', () => {
  describe('structure — it has to survive a dead link', () => {
    it('is committed', () => {
      expect(
        existsSync(WALKTHROUGH_PATH),
        'docs/WALKTHROUGH.md is missing. Run `npx tsx scripts/capture-walkthrough.ts` and commit it.',
      ).toBe(true);
    });

    it('embeds at least one frame per beat', () => {
      const frames = imageReferences(WALKTHROUGH_PATH);
      expect(frames.length).toBeGreaterThanOrEqual(beatSeconds().length);
    });

    it('references only frames that exist on disk', () => {
      for (const frame of imageReferences(WALKTHROUGH_PATH)) {
        expect(existsSync(frame.resolved), `docs/WALKTHROUGH.md references a missing frame: ${frame.href}`).toBe(true);
      }
    });

    it('gives every frame alt text, because half the point is a reader who cannot see it', () => {
      for (const frame of imageReferences(WALKTHROUGH_PATH)) {
        expect(frame.alt.trim().length, `A frame in docs/WALKTHROUGH.md has no alt text: ${frame.href}`).toBeGreaterThan(
          0,
        );
      }
    });

    it('is linked from the README, which is the only document a stranger is guaranteed to open', () => {
      expect(read(README_PATH)).toContain('docs/WALKTHROUGH.md');
    });

    it('references only frames that exist, from the README too', () => {
      for (const frame of imageReferences(README_PATH)) {
        expect(existsSync(frame.resolved), `README.md references a missing frame: ${frame.href}`).toBe(true);
      }
    });

    it('records how its frames were captured, so they can be re-cut rather than re-imagined', () => {
      const source = read(WALKTHROUGH_PATH);
      expect(source).toContain('scripts/capture-walkthrough.ts');
      expect(existsSync(join(REPO, 'scripts/capture-walkthrough.ts'))).toBe(true);
    });
  });

  describe('arithmetic — every figure is recomputed from the model, never typed', () => {
    it('claims exactly as many incidents as Lead Rescue actually has', () => {
      const source = read(WALKTHROUGH_PATH);
      expect(source).toContain(`${LEAD_RESCUE_SCENARIOS.length} incidents`);
    });

    it('claims exactly as many lifecycle states as Lead Rescue declares', () => {
      const source = read(WALKTHROUGH_PATH);
      expect(source).toContain(`${LEAD_RESCUE.lifecycle.states.length} states`);
    });

    it('claims exactly as many transitions as Lead Rescue declares', () => {
      const source = read(WALKTHROUGH_PATH);
      expect(source).toContain(`${LEAD_RESCUE.lifecycle.transitions.length} declared moves`);
    });

    it('quotes the confidence floor from the profile rather than from memory', () => {
      const source = read(WALKTHROUGH_PATH);
      expect(source).toContain(String(numberParam(KESTREL, 'confidenceFloor')));
    });

    it('names the operator whose policy those numbers are', () => {
      expect(read(WALKTHROUGH_PATH)).toContain(KESTREL.name);
    });

    it('adds up to ninety seconds, because that is what it calls itself', () => {
      const seconds = beatSeconds();
      expect(seconds.length, 'No beat table found in docs/WALKTHROUGH.md').toBeGreaterThan(0);
      const total = seconds.reduce((sum, value) => sum + value, 0);
      expect(total, `The beats total ${total}s, not 90s. Re-time them or rename the walkthrough.`).toBe(90);
    });
  });

  describe('truthfulness — the limits travel with the pitch or they do not exist', () => {
    it('states that the business and every incident in it are fictional', () => {
      const source = read(WALKTHROUGH_PATH);
      expect(source.toLowerCase()).toContain('fictional');
    });

    it('carries the retained negative result rather than only the capability', () => {
      const source = read(WALKTHROUGH_PATH);
      expect(source).toContain('6 of 9');
    });

    it('says plainly that nothing has run for a customer', () => {
      const source = read(WALKTHROUGH_PATH);
      expect(source).toMatch(/nothing (here )?has (ever )?run for a paying customer/i);
    });

    it('carries the ledger row that bounds every other claim', () => {
      expect(read(WALKTHROUGH_PATH)).toContain('UNVERIFIED');
    });

    it('never calls the build live', () => {
      const source = read(WALKTHROUGH_PATH);
      expect(source).not.toMatch(/\bis live\b|\bgoes live\b|\bin production\b|\bproduction-ready\b/i);
    });
  });

  describe('the drift trap this repository has already fallen into twice', () => {
    /**
     * A suite-size claim in prose is a number engineered to go stale: it changes on every
     * package and nothing recomputes it. The README carried "310 tests" once and "836 tests"
     * after that, both wrong by the time anyone read them. The fix is not a tighter guard on
     * the number — it is not carrying the number. State the gate; let the gate report itself.
     */
    it('keeps hard-coded suite sizes out of the README', () => {
      const source = read(README_PATH);
      expect(source, 'README.md states a test count that will be wrong within one package.').not.toMatch(
        /\b\d{2,}\s+tests\b/,
      );
      expect(source, 'README.md states a test-file count that will be wrong within one package.').not.toMatch(
        /\b\d{2,}\s+(test )?files\b/,
      );
    });

    it('keeps a hard-coded page count out of the README', () => {
      expect(read(README_PATH), 'README.md states a page count that drifts on every new route.').not.toMatch(
        /\b\d{2,}\s+pages\b/,
      );
    });

    /**
     * This one IS a count, and it stays, because unlike a test total it is a claim about the
     * product rather than about the workshop: a visitor can go and run each one. It is
     * therefore recomputed here from the same registry the simulator routes are generated
     * from, so it cannot drift the way "836 tests" did.
     */
    it('states the incident count the simulator actually serves', () => {
      const source = read(README_PATH);
      const stated = /\*\*(\d+) incidents across 6 systems\*\*/.exec(source);
      expect(stated, 'README.md no longer states a runnable incident count in the expected form.').not.toBeNull();
      expect(Number(stated?.[1]), 'README.md states an incident count the registry does not serve.').toBe(
        ALL_RUNNABLE_SCENARIOS.length,
      );
    });
  });
});
