import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REGISTERED_PROFILES } from '@/data/profiles';

/**
 * THE SEAM TEST.
 *
 * The portfolio is only retargetable to another vertical if system definitions carry no
 * business vocabulary. That claim is cheap to make and easy to break silently, so it is
 * asserted here by scanning the source.
 *
 * If this fails, the seam has leaked: move the offending vocabulary into the business
 * profile and refer to it generically from the system definition.
 */

const SYSTEMS_DIR = join(process.cwd(), 'data', 'systems');

/** Vocabulary belonging to the Kestrel profile, which must never appear in a system definition. */
const FORBIDDEN = [
  'kestrel',
  'soc 2',
  'soc2',
  'iso 27001',
  'iso27001',
  'trust service',
  'attestation',
  'certification body',
  'halcyon',
  'vantage ledger',
  'northwind',
  'compliance readiness',
  'readiness engagement',
  'vciso',
  'penetration test',
  // Added after this list failed open. `bramwell` is a Kestrel CLIENT name, authored in
  // `data/profiles/kestrel/scenarios/**`, and it had leaked into `data/systems/client-onboarding.ts`
  // where it sat with the whole suite green — the leak this file exists to prevent, undetected
  // because nobody remembered the term. It is the clearest evidence available that a remembered
  // lexicon is the wrong shape, and it stays at the top of the profile-owned names for that reason.
  'bramwell',
  // Meridian's own vocabulary. `localisation` and `linguist` are distinctive to that trade and
  // appear nowhere in `data/systems/**`; its generic operational words deliberately are not
  // listed, because they legitimately belong to the systems as well.
  'meridian',
  'localisation',
  'linguist',
];

function systemFiles(): string[] {
  return readdirSync(SYSTEMS_DIR)
    .filter((f) => f.endsWith('.ts'))
    .map((f) => join(SYSTEMS_DIR, f));
}

describe('profile / system seam', () => {
  it('finds the system definition files', () => {
    const files = systemFiles();
    // Six systems plus the index.
    expect(files.length).toBe(7);
  });

  describe.each(systemFiles().map((f) => [f.split('/').pop() ?? f, f] as const))(
    '%s',
    (name, path) => {
      it('contains no business-specific vocabulary', () => {
        const contents = readFileSync(path, 'utf8').toLowerCase();
        const found = FORBIDDEN.filter((term) => contents.includes(term));

        expect(
          found,
          `${name} leaks profile vocabulary: ${found.join(', ')}. Move it to the business profile and refer to it generically.`,
        ).toEqual([]);
      });

      it('does not import from the profile data directory', () => {
        const contents = readFileSync(path, 'utf8');
        expect(contents).not.toContain('data/profiles');
      });
    },
  );

  /**
   * THE LEXICON ABOVE FAILS OPEN, AND THIS IS THE ONE PART OF IT THAT DOES NOT.
   *
   * `FORBIDDEN` is remembered, not derived: it guards the terms somebody thought of. That was
   * survivable with one profile and is not with several, because a profile can now be added
   * whose vocabulary nothing on that list covers, and the seam would report clean while leaking.
   *
   * Deriving the whole lexicon from the register was tried and does not work. Every naming
   * field across both profiles yields ~95 terms of which ~70 ALREADY appear legitimately in
   * `data/systems/**` — "approval", "review", "client", "proposal" — so the allowance list
   * needed to make it usable would be larger, and more hand-maintained, than the blacklist it
   * replaced. Narrowing to proper nouns cuts the noise but misses the terms that matter most:
   * `halcyon`, `northwind`, and `vantage ledger` are fictional CLIENT names living in
   * `data/profiles/<id>/scenarios/**`, not in `profile.ts`, so no extraction from the profile
   * object finds them. Recorded as a dead end rather than half-built.
   *
   * What IS exact is a profile's own id. It is guaranteed distinctive, it is the term most
   * likely to be typed into a system definition by someone working on that profile, and
   * requiring it here means a new profile cannot be registered without its author meeting this
   * list. That is a smaller claim than a derived lexicon and it is one that actually holds.
   */
  describe.each(REGISTERED_PROFILES.map((r) => [r.profile.id] as const))(
    'registered profile %s',
    (id) => {
      it('has its own id in the forbidden lexicon', () => {
        expect(
          FORBIDDEN,
          `"${id}" is registered as a profile but is not guarded here, so writing it into a ` +
            'system definition would leak the seam with every test still green. Add it.',
        ).toContain(id.toLowerCase());
      });
    },
  );

  it('keeps the engine core free of business vocabulary too', () => {
    const enginePath = join(process.cwd(), 'lib', 'engine', 'reducer.ts');
    const contents = readFileSync(enginePath, 'utf8').toLowerCase();
    const found = FORBIDDEN.filter((term) => contents.includes(term));
    expect(found).toEqual([]);
  });
});
