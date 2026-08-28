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

/** Hand-curated vocabulary that must never appear in a system definition. */
const CURATED_VOCABULARY = [
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
  'localisation',
  'linguist',
];

/**
 * Every registered profile's own id, DERIVED rather than remembered.
 *
 * This was a hand-maintained entry per profile, and it created a contradiction that made the
 * parallel-authoring workflow impossible: registering a profile required adding its id here, but
 * `docs/PROFILE_AUTHORING_PACKET.md` rule 2.1 forbids a profile author from editing tests. Two
 * independently authored profiles hit it on the same day and both reported the same thing — they
 * could not hand back a state where `npm run verify` was green, however good the profile was.
 *
 * The id was always the one part of this lexicon that did not need remembering. Deriving it means
 * registering a profile guards its id automatically, and the packet's prohibition and this file's
 * requirement stop disagreeing.
 */
const REGISTERED_IDS = REGISTERED_PROFILES.map((entry) => entry.profile.id.toLowerCase());

const FORBIDDEN = [...CURATED_VOCABULARY, ...REGISTERED_IDS];

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
   * THE CURATED HALF FAILS OPEN. THE DERIVED HALF DOES NOT.
   *
   * `CURATED_VOCABULARY` guards the terms somebody thought of, and a term nobody remembered is
   * exactly how `bramwell` — a Kestrel client name — came to sit inside a system definition with
   * the whole suite green.
   *
   * Deriving the WHOLE lexicon was tried and does not work. Every naming field across the
   * registered profiles yields ~95 terms, ~70 of which already appear legitimately in
   * `data/systems/**` — "approval", "review", "client", "proposal" — so the allowance list needed
   * to make it usable would be larger and more hand-maintained than the blacklist it replaced.
   * Narrowing to proper nouns cuts the noise but misses the terms that matter most: `halcyon`,
   * `northwind`, and `vantage ledger` are fictional CLIENT names living in
   * `data/profiles/<id>/scenarios/**` rather than in `profile.ts`, so no extraction from the
   * profile object reaches them. Recorded as a dead end rather than half-built.
   *
   * A profile's own id is the exception, and it is now derived into `FORBIDDEN` rather than
   * copied there by hand. These tests assert the derivation actually happened — a silent break
   * in it would remove a guard while every scan below still reported clean.
   */
  it('derives an id for every registered profile', () => {
    expect(REGISTERED_IDS.length).toBe(REGISTERED_PROFILES.length);
    expect(REGISTERED_IDS.length, 'no profiles are registered, so the scans assert nothing').toBeGreaterThan(0);
  });

  it('carries every derived id into the lexicon the scans actually use', () => {
    const missing = REGISTERED_IDS.filter((id) => !FORBIDDEN.includes(id));
    expect(
      missing,
      'a registered profile id is not in FORBIDDEN, so writing it into a system definition would ' +
        'leak the seam with every test still green.',
    ).toEqual([]);
  });


  it('keeps the engine core free of business vocabulary too', () => {
    const enginePath = join(process.cwd(), 'lib', 'engine', 'reducer.ts');
    const contents = readFileSync(enginePath, 'utf8').toLowerCase();
    const found = FORBIDDEN.filter((term) => contents.includes(term));
    expect(found).toEqual([]);
  });
});
