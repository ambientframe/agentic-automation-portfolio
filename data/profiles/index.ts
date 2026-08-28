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
   * What we take this source to establish about the vertical. THIS IS INTERPRETATION, and it is
   * the one part of a grounding source that nothing can mechanically check. A capture can show
   * that a page said something at a moment in time; it cannot show that our reading of it is
   * right. Keep the two separable so a reader can disagree with the reading without having to
   * doubt the retrieval.
   */
  readonly establishes: string;
  /**
   * A VERBATIM excerpt from the source, chosen to be the material the claim above rests on.
   *
   * This is the half that IS checkable. `scripts/capture-grounding.ts` fetches the URL and
   * refuses to write a capture unless this exact string appears in the retrieved text, so a
   * fabricated citation dies at capture time rather than living in the register looking
   * plausible. Keep it long enough to be distinctive and short enough to be a quotation.
   */
  readonly quote: string;
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
 * Grounded means its figures are SYNTHETIC ASSUMPTIONS CALIBRATED against retrievable evidence.
 * It never means a source verified a figure about Kestrel — no source can, because Kestrel does
 * not exist. Each grounding note therefore separates the industry fact from our calibration, and
 * says which is which.
 *
 * Two figures sat comfortably inside their published ranges from the start. The third did not:
 * the vCISO retainer sat at the very floor of its band while the profile claimed a mid-market
 * segment, spread across an implausible number of concurrent relationships for the headcount.
 * That was published as a divergence for a day and then fixed on 2026-08-28, once it was clear
 * the blast radius was one equation rather than every scenario. Publishing a gap is not a
 * substitute for closing one that is cheap to close.
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
      'Originally derived from the retained brief in docs/source/ rather than from research, and calibrated afterwards ' +
      'against published 2026 benchmarks whose source material is retained in docs/evidence/grounding-captures.json. ' +
      'Every figure below is a synthetic assumption; the sources describe the industry and verify nothing about this ' +
      'firm. Retainer economics were recalibrated on 2026-08-28 from 33 clients at $3,200/month to 20 at $5,000.',
    groundingSources: [
      {
        url: 'https://www.rocketlane.com/blogs/professional-services-maturity-index-2026',
        quote: 'Revenue per employee climbed 6% to $168k',
        establishes:
          'INDUSTRY FACT: the 2026 SPI Professional Services Maturity Benchmark reports $168k revenue per employee across surveyed professional-services organisations. OUR CALIBRATION: Kestrel’s synthetic $228.6k per head sits above that all-staff figure, which we take to be a defensible assumption for a 14-person firm carrying little non-billable overhead. The source says nothing about Kestrel, which does not exist.',
      },
      {
        url: 'https://www.brightdefense.com/resources/soc-2-certification-cost/',
        quote:
          'A readiness assessment helps organizations pinpoint weaknesses, usually costing $5,000 to $20,000. Policy development and documentation may add another $5,000 to $15,000 if outsourced.',
        establishes:
          'INDUSTRY FACT: a SOC 2 readiness assessment runs $5k–$20k and policy development adds $5k–$15k when outsourced. OUR CALIBRATION: Kestrel’s synthetic $32k average engagement is assumed to bundle readiness, policy authoring and remediation, which the quoted components plus remediation would plausibly total. The source prices components, not Kestrel’s engagement.',
      },
      {
        url: 'https://sidechannel.com/blog/the-ultimate-guide-to-vciso-pricing-everything-you-need-to-know/',
        quote: 'For most mid-market companies, vCISO pricing runs $3,000 to $12,000 per month.',
        establishes:
          'INDUSTRY FACT: mid-market vCISO retainers run $3,000–$12,000 per month. OUR CALIBRATION: Kestrel’s synthetic average retainer of $5,000/month across 20 clients is an assumption chosen to sit inside that band rather than at its floor. It was $3,200 across 33 clients until 2026-08-28, which put the rate at the band’s edge and the relationship count implausibly high for 14 staff. The source describes an industry; it verifies nothing about this firm, which does not exist.',
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
