import { describe, expect, it } from 'vitest';

import { MODEL_GAPS } from '@/data/model-gaps';
import { REGISTERED_PROFILES } from '@/data/profiles';

/**
 * THE GAPS ARE EVIDENCE, SO THEY ARE HELD TO AN EVIDENCE STANDARD.
 *
 * `COMMERCIAL_THESIS.md` §3: a retained negative result is a commercial asset, because an
 * artifact that publishes only its successes gives a stranger no way to distinguish it from one
 * that is lying. These entries are the strongest version of that available here — limits found
 * by three authors who had no stake in the answer and had never seen this repository's
 * reasoning.
 *
 * Which means the register can fail in exactly the ways any other evidence can: by attributing a
 * finding to a business that does not exist, by degrading into abstract hand-waving that cannot
 * be checked or fixed, or by quietly becoming one author's opinion presented as three.
 */
describe('the model-gap register', () => {
  it('records gaps at all, or it is asserting nothing', () => {
    expect(MODEL_GAPS.length).toBeGreaterThan(0);
  });

  it('gives every gap a unique id', () => {
    const ids = MODEL_GAPS.map((gap) => gap.id);
    expect(new Set(ids).size, `duplicate ids among: ${ids.join(', ')}`).toBe(ids.length);
  });

  /**
   * The attribution has to survive a rename. Two profile slugs were changed on 2026-08-28
   * because they carried real firms' names; a gap crediting the old slug would look fine and
   * point at nothing.
   */
  it.each(MODEL_GAPS.map((gap) => [gap.id, gap] as const))(
    '%s credits a profile that is actually registered',
    (id, gap) => {
      const registered = REGISTERED_PROFILES.map((entry) => entry.profile.id);
      expect(
        registered,
        `"${id}" is credited to "${gap.foundBy}", which is not a registered profile. ` +
          'A finding attributed to a business that does not exist cannot be checked by anyone.',
      ).toContain(gap.foundBy);
    },
  );

  /**
   * The assertion that stops this becoming a list of complaints. A gap stated abstractly is
   * unfalsifiable and unfixable; a gap stated as an instance can be checked by a practitioner
   * and either fixed or refused on the merits.
   */
  it.each(MODEL_GAPS.map((gap) => [gap.id, gap] as const))(
    '%s states a concrete case, what the model does instead, and the shape of a fix',
    (id, gap) => {
      expect(gap.example.length, `${id} has no concrete example`).toBeGreaterThan(80);
      expect(gap.modelDoesInstead.length, `${id} does not say what the model does today`).toBeGreaterThan(60);
      expect(gap.aFixWouldNeed.length, `${id} does not say what a fix would need`).toBeGreaterThan(60);
      expect(gap.title.length, `${id} has no title`).toBeGreaterThan(15);
    },
  );

  /**
   * Independence is the whole value. One author finding thirteen limits is one opinion; three
   * independent authors converging on a model's boundaries is evidence about the model.
   */
  it('draws on more than one independent author', () => {
    const authors = new Set(MODEL_GAPS.map((gap) => gap.foundBy));
    expect(
      authors.size,
      'every gap is credited to one profile. A single author reporting limits is an opinion; ' +
        'independent authors converging on the same model is evidence.',
    ).toBeGreaterThan(1);
  });

  /**
   * The independence claim is the register's whole value, so it has to be auditable rather than
   * asserted. Each gap records who reported it, when, and what they had access to — and the
   * limit on that claim (three runs, one working tree) is stated on `GapDiscovery` rather than
   * left for a reader to discover.
   */
  it.each(MODEL_GAPS.map((gap) => [gap.id, gap] as const))(
    '%s records who reported it, when, and from what',
    (id, gap) => {
      expect(gap.discovery.reportedBy.length, `${id} names no reporting run`).toBeGreaterThan(20);
      expect(gap.discovery.reportedOn, `${id} has no report date`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(
        gap.discovery.workingFrom,
        `${id} does not say what its author was working from, so independence cannot be audited`,
      ).toContain('PROFILE_AUTHORING_PACKET');
      expect(gap.discovery.handbackHeld.length, `${id} does not say where the original is`).toBeGreaterThan(20);
    },
  );

  it('attributes gaps to as many distinct authoring runs as it does profiles', () => {
    const runs = new Set(MODEL_GAPS.map((gap) => gap.discovery.reportedBy));
    const profiles = new Set(MODEL_GAPS.map((gap) => gap.foundBy));
    expect(
      runs.size,
      'the number of distinct authoring runs no longer matches the number of crediting ' +
        'profiles. Two gaps credited to different profiles but the same run would inflate the ' +
        'independence claim.',
    ).toBe(profiles.size);
  });

  /**
   * A closed gap stays in the register. Deleting it would erase the evidence that an outside
   * author found a real limit — and a fix that cannot state what it still does not do is a
   * claim rather than a result.
   */
  it.each(MODEL_GAPS.filter((g) => g.addressed !== undefined).map((g) => [g.id, g] as const))(
    '%s states what shipped and what that fix still does not do',
    (id, gap) => {
      expect(gap.addressed?.on, `${id} records no date`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(gap.addressed?.what.length, `${id} does not say what shipped`).toBeGreaterThan(80);
      expect(
        gap.addressed?.limit.length,
        `${id} claims a fix with no stated limit. A closed gap is still a bounded claim.`,
      ).toBeGreaterThan(80);
    },
  );

  it('leaves closed gaps in the register rather than deleting them', () => {
    expect(
      MODEL_GAPS.some((gap) => gap.addressed !== undefined),
      'no gap is recorded as addressed. If one was closed, the record of it being found must survive.',
    ).toBe(true);
  });

  it('distinguishes what generalises from what is one trade’s quirk', () => {
    const general = MODEL_GAPS.filter((gap) => gap.generality === 'GENERALISES');
    expect(
      general.length,
      'no gap is marked as generalising. If every limit is trade-specific, none of them is a ' +
        'finding about the model, and this register is a list of feature requests.',
    ).toBeGreaterThan(0);
  });

  /** A pasted entry is the realistic way a register like this rots. */
  it('states each gap in its own words', () => {
    const examples = MODEL_GAPS.map((gap) => gap.example);
    expect(new Set(examples).size, 'two gaps share an example').toBe(examples.length);
  });
});
