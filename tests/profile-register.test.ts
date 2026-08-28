import { describe, expect, it } from 'vitest';

import {
  ALL_PROFILES,
  DEMONSTRATION_PROFILES,
  MINIMUM_GROUNDING_SOURCES,
  MINIMUM_NAME_CHECK_FINDING_CHARS,
  REGISTERED_PROFILES,
  UNGROUNDED_DEMONSTRATIONS,
  registeredProfile,
} from '@/data/profiles';
import { RUNNABLE_SYSTEMS } from '@/lib/engine/registry';

/**
 * THE GROUNDING REQUIREMENT, MADE CHECKABLE.
 *
 * `COMMERCIAL_THESIS.md` §6 requires that a profile a visitor is shown be grounded in how its
 * industry actually operates — "a practitioner should recognise their own operation", and a
 * model's guess will not clear that bar. That was prose, and profiles are increasingly going
 * to be authored by agents working from a written brief rather than by a person who read the
 * thesis. Prose does not constrain them. This does.
 */
describe('the profile register', () => {
  it('registers every profile exactly once', () => {
    const ids = REGISTERED_PROFILES.map((r) => r.profile.id);
    expect(new Set(ids).size, `duplicate registration among: ${ids.join(', ')}`).toBe(ids.length);
  });

  it('can find a profile by its id', () => {
    for (const id of ALL_PROFILES.map((p) => p.id)) {
      expect(registeredProfile(id)?.profile.id).toBe(id);
    }
    expect(registeredProfile('no-such-firm')).toBeUndefined();
  });

  it('gives every profile a reason to exist', () => {
    for (const entry of REGISTERED_PROFILES) {
      expect(entry.note.length, `${entry.profile.id} is registered with no note`).toBeGreaterThan(20);
    }
  });
});

describe('a demonstration profile is grounded', () => {
  const grounded = REGISTERED_PROFILES.filter(
    (r) => r.role === 'DEMONSTRATION' && !UNGROUNDED_DEMONSTRATIONS.includes(r.profile.id),
  );

  it.each(grounded.map((r) => [r.profile.id, r] as const))(
    '%s cites what grounds it',
    (id, entry) => {
      expect(
        entry.groundingSources.length,
        `${id} is shown to visitors but cites ${entry.groundingSources.length} sources. ` +
          `COMMERCIAL_THESIS.md §6 requires at least ${MINIMUM_GROUNDING_SOURCES}: a profile a practitioner ` +
          'would not recognise is an invented business presented as a demonstration.',
      ).toBeGreaterThanOrEqual(MINIMUM_GROUNDING_SOURCES);

      for (const source of entry.groundingSources) {
        expect(source.url, `${id} cites an empty url`).not.toBe('');
        expect(
          source.establishes.length,
          `${id} cites ${source.url} without saying what it establishes. A citation that supports nothing is padding.`,
        ).toBeGreaterThan(20);
      }
    },
  );

  it('has at least one grounded demonstration, or asserts nothing', () => {
    // Guards the block above against passing vacuously once every demonstration is exempt.
    expect(
      grounded.length + UNGROUNDED_DEMONSTRATIONS.length,
      'no demonstration profiles are registered at all',
    ).toBeGreaterThan(0);
  });
});

describe('the ungrounded exemption does not become a loophole', () => {
  /**
   * This pinned `['kestrel']` when the exemption was introduced. It pins `[]` now, and the edit
   * from one to the other is the record that the gap was actually worked rather than quietly
   * emptied — closing a published gap has to change what the audit reports, or the gap was
   * measuring something else.
   */
  it('is empty, because the one exempt profile was grounded rather than excused', () => {
    expect(
      [...UNGROUNDED_DEMONSTRATIONS].sort(),
      'the exemption list changed. Shrinking it is the point. Growing it means an ungrounded ' +
        'business was shown to a visitor — if that is intended, say so here deliberately.',
    ).toEqual([]);
  });

  it('names only profiles that are actually registered demonstrations', () => {
    for (const id of UNGROUNDED_DEMONSTRATIONS) {
      const entry = registeredProfile(id);
      expect(entry, `exemption names "${id}", which is not registered`).toBeDefined();
      expect(
        entry?.role,
        `exemption names "${id}", which is not a demonstration — a fixture needs no exemption`,
      ).toBe('DEMONSTRATION');
    }
  });

  it('carries no grounding sources, so the exemption cannot be half-satisfied', () => {
    for (const id of UNGROUNDED_DEMONSTRATIONS) {
      expect(
        registeredProfile(id)?.groundingSources,
        `"${id}" is exempt but cites sources. Either it is grounded — remove it from the exemption — or it is not.`,
      ).toEqual([]);
    }
  });
});

/**
 * THE NAME CHECK, MADE CHECKABLE.
 *
 * A demonstration profile shipped with a real architecture practice's trading name. Nobody was
 * careless: the authoring packet ASSERTED the assigned names were "deliberately not real firms",
 * which was untrue for two of three, so the one author who checked found it by accident. The
 * correction to the packet is prose, and Pattern #28 says a guard that must be remembered has
 * already failed.
 *
 * So the register must now STATE the check rather than have run it. This cannot verify that a
 * name is unused — no offline test can reach a company register. What it enforces is narrower
 * and is the thing that actually broke: **the name that was checked must be the name that
 * shipped.** Renaming a firm after checking it, or checking one variant and shipping another,
 * now fails here instead of on a visitor's screen.
 */
describe('a demonstration profile states the name check that cleared it', () => {
  const demonstrations = REGISTERED_PROFILES.filter((r) => r.role === 'DEMONSTRATION');

  it.each(demonstrations.map((r) => [r.profile.id, r] as const))(
    '%s declares one',
    (id, entry) => {
      expect(
        entry.nameCheck,
        `"${id}" is shown to visitors as "${entry.profile.name}" and records no name check. ` +
          'An unchecked trading name is how a fictional firm ends up wearing a real one.',
      ).toBeDefined();
    },
  );

  it.each(demonstrations.map((r) => [r.profile.id, r] as const))(
    '%s checked the name it actually ships',
    (id, entry) => {
      expect(
        entry.nameCheck?.searchedFor,
        `"${id}" ships as "${entry.profile.name}" but records a check of ` +
          `"${entry.nameCheck?.searchedFor}". Checking one name and shipping another is worth nothing.`,
      ).toBe(entry.profile.name);
    },
  );

  it.each(demonstrations.map((r) => [r.profile.id, r] as const))(
    '%s says what the search found, and when',
    (id, entry) => {
      expect(
        entry.nameCheck?.finding.length,
        `${id} records a finding too short to be a search result. A mutation proved the earlier ` +
          'floor worthless: "Nothing was found at all." cleared it, which is a shrug in the shape ' +
          'of a check.',
      ).toBeGreaterThanOrEqual(MINIMUM_NAME_CHECK_FINDING_CHARS);
      expect(entry.nameCheck?.checkedOn, `${id} records no date`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    },
  );

  it('records a distinct finding per profile, because one generic negative is how this rots', () => {
    const findings = demonstrations.map((r) => r.nameCheck?.finding);
    expect(
      new Set(findings).size,
      'two or more profiles record the same name-check finding. Each searched a different name ' +
        'in a different trade; identical results mean the text was pasted, not obtained.',
    ).toBe(findings.length);
  });
});

describe('a structural fixture stays out of sight', () => {
  const fixtures = REGISTERED_PROFILES.filter((r) => r.role === 'STRUCTURAL_FIXTURE');

  it('exists, or the swap test has nothing to prove with', () => {
    expect(fixtures.length).toBeGreaterThan(0);
  });

  it.each(fixtures.map((r) => [r.profile.id, r] as const))(
    '%s is never wired into a rendered system',
    (id) => {
      const rendered = RUNNABLE_SYSTEMS.filter((r) => r.profile.id === id);
      expect(
        rendered.length,
        `${id} is a structural fixture but is wired into ${rendered.length} runnable systems. ` +
          'Fixtures are ungrounded by definition; rendering one shows a visitor an invented business.',
      ).toBe(0);
    },
  );

  it.each(fixtures.map((r) => [r.profile.id, r] as const))(
    '%s claims no grounding it does not have',
    (id, entry) => {
      expect(
        entry.groundingSources,
        `${id} is a fixture but cites grounding sources. If it is grounded, it should be a demonstration.`,
      ).toEqual([]);
    },
  );
});

describe('every rendered system depicts a registered profile', () => {
  it.each(RUNNABLE_SYSTEMS.map((r) => [r.system.id, r.profile.id] as const))(
    '%s runs %s',
    (systemId, profileId) => {
      const entry = registeredProfile(profileId);
      expect(entry, `${systemId} renders profile "${profileId}", which is not registered`).toBeDefined();
      expect(
        entry?.role,
        `${systemId} renders "${profileId}", which is a structural fixture rather than a demonstration`,
      ).toBe('DEMONSTRATION');
    },
  );
});
