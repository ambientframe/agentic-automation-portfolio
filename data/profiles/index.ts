import type { BusinessProfile } from '@/lib/model/profile';
import { KESTREL } from './kestrel/profile';
import { MERIDIAN } from './meridian/profile';

/**
 * THE PROFILE REGISTER.
 *
 * Introduced when a second profile existed. Before it, `tests/profile-seam-swap.test.ts`
 * named Kestrel and Meridian in a literal array, which is correct for two profiles and wrong
 * the moment a third is authored: a profile nobody remembered to add to that array would be
 * held to no standard at all, and would fail silently by never being checked.
 *
 * This is a small correction, not a framework. It does not select an active profile, and it
 * does not make the portfolio multi-tenant. `RUNNABLE_SYSTEMS` still wires Kestrel explicitly,
 * because which business the rendered simulator depicts is a canon decision and not a lookup.
 *
 * WHAT THE `role` FIELD IS FOR.
 *
 * `COMMERCIAL_THESIS.md` §6 requires that any profile a visitor is shown be grounded in how
 * that industry actually operates — a practitioner should recognise their own operation, and a
 * model's guess about an industry will not clear that bar. That requirement was prose, and
 * prose is not checkable. Splitting the register by role makes it enforceable:
 *
 *   STRUCTURAL_FIXTURE — exists to falsify the seam. Never rendered, never grounded, and
 *     required to carry no grounding sources, so it cannot be quietly promoted into a
 *     demonstration by someone adding citations to it later.
 *   DEMONSTRATION — may be shown to a visitor, and must cite what grounds it.
 *
 * `tests/profile-register.test.ts` enforces both directions. A profile authored without
 * grounding cannot be registered as a demonstration, whoever or whatever authored it.
 */
export type ProfileRole = 'STRUCTURAL_FIXTURE' | 'DEMONSTRATION';

export interface GroundingSource {
  /** Where the claim came from. Must be retrievable by a reader, not a private note. */
  readonly url: string;
  /**
   * What this source establishes about the vertical, in one sentence. A bare URL list can be
   * padded with anything; naming the claim makes a citation that supports nothing visible.
   */
  readonly establishes: string;
}

export interface RegisteredProfile {
  readonly profile: BusinessProfile;
  readonly role: ProfileRole;
  /** Why this profile exists at all. */
  readonly note: string;
  /** Required for DEMONSTRATION, forbidden for STRUCTURAL_FIXTURE. */
  readonly groundingSources: readonly GroundingSource[];
}

/** The minimum a DEMONSTRATION profile must cite. Low, and a floor rather than a target. */
export const MINIMUM_GROUNDING_SOURCES = 3;

/**
 * DEMONSTRATION PROFILES THAT DO NOT MEET THE GROUNDING FLOOR.
 *
 * **Empty, and it was not empty when it was written.** Kestrel was on it — the profile every
 * rendered surface depicts, authored from the retained brief in `docs/source/` rather than from
 * research, and predating the requirement it failed. It has since been grounded against three
 * published 2026 benchmarks and removed.
 *
 * Its figures were not edited to fit those benchmarks. Two sit comfortably inside the published
 * ranges and one — the vCISO retainer — sits at the floor of its band for the segment claimed;
 * that divergence is recorded on the profile's grounding sources rather than corrected, because
 * changing the number would move every scenario and expected outcome built on it. Grounded means
 * anchored in retrievable evidence INCLUDING where it departs from that evidence, never that
 * every figure matched.
 *
 * `tests/profile-register.test.ts` pins this list. It may shrink; it has. Growing it means an
 * ungrounded business was shown to a visitor, which is a deliberate act that should require
 * editing a test that says out loud what it is.
 */
export const UNGROUNDED_DEMONSTRATIONS: readonly string[] = [];

export const REGISTERED_PROFILES: readonly RegisteredProfile[] = [
  {
    profile: KESTREL,
    role: 'DEMONSTRATION',
    note:
      'The reference business. Every rendered surface depicts this firm, and the six systems were built against its lifecycle. ' +
      'Originally derived from the retained brief in docs/source/ rather than from research, and grounded afterwards against ' +
      'published 2026 benchmarks. Its figures were NOT changed to fit those benchmarks — where one sits at the edge of the ' +
      'published range, the divergence is recorded below rather than corrected, because altering the profile would move ' +
      'every scenario and expected outcome built on it.',
    groundingSources: [
      {
        url: 'https://www.rocketlane.com/blogs/professional-services-maturity-index-2026',
        establishes:
          'The 2026 SPI Professional Services Maturity Benchmark, surveying 509 organisations, reports $168k revenue per employee and $210k per billable consultant. Kestrel implies $228.6k per head across 14 staff — above the all-staff average and near the per-billable figure, which is defensible for a small firm carrying little non-billable overhead and sits at the top of the $150k–$250k mid-market band.',
      },
      {
        url: 'https://www.brightdefense.com/resources/soc-2-certification-cost/',
        establishes:
          'SOC 2 readiness and gap assessment runs $10k–$20k for Type 2, policy development $5k–$15k, and remediation consulting $10k–$30k, against total mid-size program costs of $60k–$100k. Kestrel’s $32k average engagement sits inside the $25k–$65k a bundled readiness-plus-policy-plus-remediation engagement would total.',
      },
      {
        url: 'https://sidechannel.com/blog/the-ultimate-guide-to-vciso-pricing-everything-you-need-to-know/',
        establishes:
          'vCISO retainers run $3,000–$12,000/month for mid-market companies and $1,500–$3,000 for smaller operations. Kestrel’s $3,200/month sits at the FLOOR of the mid-market band despite a stated mid-market segment — the one figure that reads low for the business described, recorded rather than raised.',
      },
    ],
  },
  {
    profile: MERIDIAN,
    role: 'STRUCTURAL_FIXTURE',
    note: 'Authored to falsify the retargetability claim. Runs the six systems in tests and appears on no rendered surface.',
    groundingSources: [],
  },
];

export function registeredProfile(id: string): RegisteredProfile | undefined {
  return REGISTERED_PROFILES.find((r) => r.profile.id === id);
}

/** Profiles a visitor may be shown. */
export const DEMONSTRATION_PROFILES: readonly BusinessProfile[] = REGISTERED_PROFILES.filter(
  (r) => r.role === 'DEMONSTRATION',
).map((r) => r.profile);

/** Every registered profile, whatever its role. What the contract and swap tests iterate. */
export const ALL_PROFILES: readonly BusinessProfile[] = REGISTERED_PROFILES.map((r) => r.profile);
