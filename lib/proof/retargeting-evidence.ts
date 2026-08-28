import { REGISTERED_PROFILES } from '@/data/profiles';
import { PROFILE_ENGINE_CONTRACT } from '@/lib/model/profile';
import { RUNNABLE_SYSTEMS } from '@/lib/engine/registry';

/**
 * THE RETARGETABILITY CLAIM, TURNED INTO SOMETHING A STRANGER CAN CHECK.
 *
 * `COMMERCIAL_THESIS.md` §5 names retargetability as *the* commercial claim the artifact has to
 * support — that this is a general operating capability rather than one bespoke build. Until
 * 2026-08-28 the home page asserted it in a single sentence, "retargeting the portfolio to
 * another vertical is a data change rather than a rewrite", and **no rendered surface referenced
 * any profile but Kestrel.** A reader had the claim and no way to check it, which under §3 is the
 * one thing this artifact must never do: an assertion a stranger cannot inspect is exactly the
 * kind of claim that requires trusting the operator.
 *
 * WHY THIS IS DERIVED AND NOT WRITTEN. Every figure below is read from the register at build
 * time. Registering a profile moves this surface; deregistering one moves it back. A hand-written
 * "four businesses" would have been correct for a day and then quietly wrong, which is the exact
 * failure mode the register was introduced to end.
 *
 * WHAT IT DELIBERATELY DOES NOT DO. It does not present the structural fixture as a business.
 * Meridian is ungrounded by design — that is what makes it able to falsify the seam — and showing
 * it to a visitor as a demonstration would be the thing `tests/profile-register.test.ts` forbids
 * everywhere else. Its existence is reported as a count and a role, never as a firm.
 */
export interface RetargetedBusiness {
  readonly id: string;
  readonly name: string;
  /** The profile's own one-line description of the trade. */
  readonly trade: string;
  readonly headcount: number;
  readonly approximateAnnualRevenue: number;
  /** How many retrievable sources ground this profile, read from the register. */
  readonly groundingSourceCount: number;
  /**
   * Whether the rendered simulator depicts this firm. Exactly one does, and saying which
   * prevents the list reading as though all four are on screen somewhere.
   */
  readonly isRendered: boolean;
}

export interface RetargetingEvidence {
  readonly businesses: readonly RetargetedBusiness[];
  /** Reported as a count and a role. Never rendered as a business — see the module docstring. */
  readonly structuralFixtureCount: number;
  /** How many operating parameters every profile must declare for the engine to run at all. */
  readonly contractKeyCount: number;
  /** Authored scenarios across the six systems, each of which runs under every foreign profile. */
  readonly authoredScenarioCount: number;
  /** Profiles the scenarios were not written for. The number that makes the claim non-vacuous. */
  readonly foreignProfileCount: number;
  readonly basis: string;
  readonly limit: string;
}

export function deriveRetargetingEvidence(): RetargetingEvidence {
  const renderedIds = new Set(RUNNABLE_SYSTEMS.map((runnable) => runnable.profile.id));

  const businesses = REGISTERED_PROFILES.filter((entry) => entry.role === 'DEMONSTRATION').map(
    (entry): RetargetedBusiness => ({
      id: entry.profile.id,
      name: entry.profile.name,
      trade: entry.profile.tagline,
      headcount: entry.profile.company.headcount,
      approximateAnnualRevenue: entry.profile.company.approximateAnnualRevenue,
      groundingSourceCount: entry.groundingSources.length,
      isRendered: renderedIds.has(entry.profile.id),
    }),
  );

  return {
    businesses,
    structuralFixtureCount: REGISTERED_PROFILES.filter((e) => e.role === 'STRUCTURAL_FIXTURE')
      .length,
    contractKeyCount: PROFILE_ENGINE_CONTRACT.length,
    authoredScenarioCount: RUNNABLE_SYSTEMS.reduce((n, r) => n + r.scenarios.length, 0),
    foreignProfileCount: REGISTERED_PROFILES.filter((e) => !renderedIds.has(e.profile.id)).length,
    basis:
      'data/profiles/index.ts · tests/profile-seam-swap.test.ts · docs/evidence/grounding-captures.json',
    limit:
      'Every business here is synthetic and stays labelled as such. Coherent synthetic profiles ' +
      'prove that the engine retargets and that each firm is internally consistent. They do not ' +
      'prove the systems handle a real firm’s messy inbound, and no source cited anywhere here ' +
      'verifies a figure about a company that does not exist.',
  };
}
