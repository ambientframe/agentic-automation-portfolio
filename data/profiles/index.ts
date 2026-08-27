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
 * Kestrel is on this list, and it is the profile every rendered surface depicts. It was
 * authored from the retained project brief in `docs/source/` rather than from external
 * research into how compliance consultancies actually operate, and it predates the
 * requirement it now fails. Saying so is cheaper than pretending otherwise, and lowering
 * `MINIMUM_GROUNDING_SOURCES` to accommodate it would remove the requirement for every
 * profile authored after it — including the ones this list exists to hold to it.
 *
 * `tests/profile-register.test.ts` pins this list. It may shrink. Growing it means a second
 * ungrounded business was shown to a visitor, which is a deliberate act that should require
 * editing a test that says out loud what it is.
 */
export const UNGROUNDED_DEMONSTRATIONS: readonly string[] = ['kestrel'];

export const REGISTERED_PROFILES: readonly RegisteredProfile[] = [
  {
    profile: KESTREL,
    role: 'DEMONSTRATION',
    note: 'The reference business. Every rendered surface depicts this firm, and the six systems were built against its lifecycle. Listed in UNGROUNDED_DEMONSTRATIONS: derived from the retained brief in docs/source/, never from external research into how compliance consultancies operate.',
    groundingSources: [],
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
