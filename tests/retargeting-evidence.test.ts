import { describe, expect, it } from 'vitest';

import { REGISTERED_PROFILES } from '@/data/profiles';
import { PROFILE_ENGINE_CONTRACT } from '@/lib/model/profile';
import { deriveRetargetingEvidence } from '@/lib/proof/retargeting-evidence';

/**
 * RETARGETABILITY, MADE CHECKABLE ON THE SURFACE THAT CLAIMS IT.
 *
 * `COMMERCIAL_THESIS.md` §5 names retargetability as the commercial claim the artifact must
 * support, and §3 requires that a stranger be able to check a claim rather than trust it. The
 * home page asserted it in one sentence — "retargeting the portfolio to another vertical is a
 * data change rather than a rewrite" — with nothing behind it a reader could inspect, and no
 * rendered surface referenced any profile but Kestrel.
 *
 * These assertions guard the two ways that surface could start lying: by drifting from the
 * register it derives from, and by quietly presenting the structural fixture as a business.
 */
describe('the retargeting evidence derives from the register', () => {
  const evidence = deriveRetargetingEvidence();

  it('counts every registered demonstration, and no more', () => {
    const demonstrations = REGISTERED_PROFILES.filter((r) => r.role === 'DEMONSTRATION');
    expect(evidence.businesses.map((b) => b.id).sort()).toEqual(
      demonstrations.map((r) => r.profile.id).sort(),
    );
  });

  /**
   * The failure this exists to stop. A structural fixture is deliberately ungrounded — showing
   * one to a visitor as a demonstration business is precisely what `tests/profile-register.test.ts`
   * forbids elsewhere, and a summary surface is the easiest place to do it by accident.
   */
  it('never presents a structural fixture as a business', () => {
    const fixtureIds = REGISTERED_PROFILES.filter((r) => r.role === 'STRUCTURAL_FIXTURE').map(
      (r) => r.profile.id,
    );
    for (const id of fixtureIds) {
      expect(
        evidence.businesses.map((b) => b.id),
        `${id} is a structural fixture and must not appear as a demonstrated business`,
      ).not.toContain(id);
    }
    expect(evidence.structuralFixtureCount).toBe(fixtureIds.length);
  });

  it('reports each business’s grounding from the register rather than a literal', () => {
    for (const business of evidence.businesses) {
      const entry = REGISTERED_PROFILES.find((r) => r.profile.id === business.id);
      expect(business.groundingSourceCount).toBe(entry?.groundingSources.length);
      expect(business.groundingSourceCount).toBeGreaterThan(0);
    }
  });

  it('marks exactly one business as the one the rendered simulator depicts', () => {
    expect(evidence.businesses.filter((b) => b.isRendered)).toHaveLength(1);
  });

  it('reports the contract width the profiles actually have to satisfy', () => {
    expect(evidence.contractKeyCount).toBe(PROFILE_ENGINE_CONTRACT.length);
  });

  it('claims more than one business, or the claim is not evidenced at all', () => {
    expect(
      evidence.businesses.length,
      'one demonstration business cannot evidence retargetability. COMMERCIAL_THESIS.md §5: ' +
        'only a second profile can prove a second profile is possible.',
    ).toBeGreaterThan(1);
  });

  /**
   * §6 requires this stay stated rather than blurred: coherent synthetic profiles prove
   * retargetability and internal consistency, and prove nothing about a real firm's inbound.
   */
  it('publishes the limit alongside the claim, never after it', () => {
    expect(evidence.limit).toMatch(/synthetic/i);
    expect(evidence.limit).toMatch(/real/i);
    expect(evidence.limit.length).toBeGreaterThan(80);
  });
});
