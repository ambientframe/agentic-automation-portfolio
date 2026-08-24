import { z } from 'zod';
import { AuthorityLevelSchema, type AuthorityLevel } from './system';
import { OperatingStandardSchema } from './provenance';

/**
 * THE SWAPPABLE LAYER.
 *
 * A `BusinessProfile` supplies the values and vocabulary a `SystemDefinition`
 * deliberately withholds. Retargeting the portfolio to a different vertical should be
 * a matter of authoring a second profile, not editing systems or UI.
 *
 * EVERYTHING HERE IS FICTIONAL. The schema pins `provenance` to the literal `FIXTURE`
 * so invented company facts cannot be read as researched benchmarks, and the
 * `fictionalDisclosure` string is rendered wherever profile figures appear.
 *
 * The figures are not precise, but they ARE reconcilable: `validateProfileConsistency`
 * checks that revenue, engagement values, client counts, and lead volume describe one
 * coherent business. Metrics shown across the six systems draw on these same numbers,
 * so an incoherent profile would surface as contradictory KPIs.
 */

const Money = z.number().nonnegative();
const Percent = z.number().min(0).max(100);

export const ServiceLineSchema = z.strictObject({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  deliveryModel: z.enum(['PROJECT', 'RECURRING']),
  typicalValue: Money,
  typicalDurationWeeks: z.number().positive().optional(),
});
export type ServiceLine = z.infer<typeof ServiceLineSchema>;

export const RoleSchema = z.strictObject({
  id: z.string().min(1),
  name: z.string().min(1),
  responsibilities: z.string().min(1),
  /** The highest authority level this person may exercise. Caps what automation may do on their behalf. */
  authorityCeiling: AuthorityLevelSchema,
});
export type Role = z.infer<typeof RoleSchema>;

export const LeadSourceSchema = z.strictObject({
  id: z.string().min(1),
  name: z.string().min(1),
  channel: z.string().min(1),
  approxMonthlyVolume: z.number().nonnegative(),
  qualityNote: z.string().min(1),
  /** Whether inbound here carries prior consent to be contacted commercially. */
  impliesContactConsent: z.boolean(),
});
export type LeadSource = z.infer<typeof LeadSourceSchema>;

export const PipelineStageSchema = z.strictObject({
  id: z.string().min(1),
  name: z.string().min(1),
  exitCriteria: z.string().min(1),
});
export type PipelineStage = z.infer<typeof PipelineStageSchema>;

export const SourceSystemSchema = z.strictObject({
  id: z.string().min(1),
  name: z.string().min(1),
  /** What this system is AUTHORITATIVE for. Disagreements resolve in its favour. */
  systemOfRecordFor: z.array(z.string().min(1)).min(1),
});
export type SourceSystem = z.infer<typeof SourceSystemSchema>;

export const OnboardingRequirementSchema = z.strictObject({
  id: z.string().min(1),
  item: z.string().min(1),
  why: z.string().min(1),
  /** Secret or access-granting material. Must never be persisted in general workflow state. */
  sensitive: z.boolean(),
});
export type OnboardingRequirement = z.infer<typeof OnboardingRequirementSchema>;

/**
 * Explicit economic scaffolding. These exist so the profile can be CHECKED rather than
 * merely asserted — see `validateProfileConsistency`.
 */
export const DerivedEconomicsSchema = z.strictObject({
  newProjectEngagementsPerYear: z.number().positive(),
  averageProjectValue: Money,
  activeRetainerClients: z.number().positive(),
  averageRetainerMonthlyFee: Money,
  /** Inbound leads per year across all sources. */
  leadsPerYear: z.number().positive(),
  /** Share of inbound leads that turn out to be genuinely qualified. */
  qualifiedRatePct: Percent,
  /** Share of qualified leads that become project engagements. */
  closeRatePct: Percent,
});
export type DerivedEconomics = z.infer<typeof DerivedEconomicsSchema>;

export const BusinessProfileSchema = z.strictObject({
  id: z.string().min(1),
  name: z.string().min(1),
  tagline: z.string().min(1),

  /** Pinned literal. A profile can never claim any provenance other than FIXTURE. */
  provenance: z.literal('FIXTURE'),
  fictionalDisclosure: z.string().min(1),

  company: z.strictObject({
    headcount: z.number().int().positive(),
    approximateAnnualRevenue: Money,
    foundedYear: z.number().int(),
    operatingModel: z.string().min(1),
    /** What the firm explicitly does NOT do. Bounds every claim the systems may make. */
    explicitlyNot: z.array(z.string().min(1)).min(1),
  }),

  serviceLines: z.array(ServiceLineSchema).min(1),
  revenueMix: z.strictObject({ projectPct: Percent, recurringPct: Percent }),
  derivedEconomics: DerivedEconomicsSchema,

  clientProfile: z.strictObject({
    segment: z.string().min(1),
    typicalClientSize: z.string().min(1),
    typicalContacts: z.array(z.string().min(1)).min(1),
    buyingTriggers: z.array(z.string().min(1)).min(1),
  }),

  roles: z.array(RoleSchema).min(1),
  leadSources: z.array(LeadSourceSchema).min(1),
  pipelineStages: z.array(PipelineStageSchema).min(2),

  salesCycle: z.strictObject({
    typicalDaysToClose: z.number().positive(),
    typicalTouches: z.number().positive(),
    commonObjections: z.array(z.string().min(1)).min(1),
  }),

  onboardingRequirements: z.array(OnboardingRequirementSchema).min(1),
  sourceSystems: z.array(SourceSystemSchema).min(1),

  invoicing: z.strictObject({
    terms: z.string().min(1),
    netDays: z.number().int().positive(),
    cadence: z.string().min(1),
    typicalInvoiceValue: Money,
    commonDisputeReasons: z.array(z.string().min(1)).min(1),
  }),

  referralPartners: z.strictObject({
    description: z.string().min(1),
    shareOfPipelinePct: Percent,
    concentrationNote: z.string().min(1),
  }),

  renewals: z.strictObject({
    term: z.string().min(1),
    typicalRenewalRatePct: Percent,
    churnDrivers: z.array(z.string().min(1)).min(1),
  }),

  operatingConstraints: z.array(z.string().min(1)).min(1),

  /** Organisation-specific values: SLAs, cadences, thresholds. All CLIENT_POLICY. */
  policies: z.array(OperatingStandardSchema).min(1),

  /**
   * The machine-readable half of the policies above.
   *
   * Every threshold the engine actually compares against lives here, and every one
   * carries `policyId` back to the prose policy it implements. That link is what lets a
   * visitor ask "why 0.70?" and get an answer, and it is what keeps thresholds out of
   * the code where they would silently become universal truths.
   */
  operatingParameters: z
    .array(
      z.strictObject({
        key: z.string().min(1),
        label: z.string().min(1),
        value: z.union([z.number(), z.string()]),
        unit: z.string().min(1),
        /** Must resolve to an id in `policies`. Enforced by validateProfileConsistency. */
        policyId: z.string().min(1),
      }),
    )
    .min(1),
});

export type BusinessProfile = z.infer<typeof BusinessProfileSchema>;

// ---------------------------------------------------------------------------
// Internal consistency
// ---------------------------------------------------------------------------

export interface ProfileIssue {
  readonly kind: string;
  readonly detail: string;
}

/** Fixtures need not be precise, but they must not contradict each other. */
const TOLERANCE = 0.15;

function within(actual: number, expected: number, tolerance = TOLERANCE): boolean {
  if (expected === 0) return actual === 0;
  return Math.abs(actual - expected) / expected <= tolerance;
}

export function validateProfileConsistency(profile: BusinessProfile): ProfileIssue[] {
  const issues: ProfileIssue[] = [];
  const push = (kind: string, detail: string) => issues.push({ kind, detail });

  const { revenueMix, derivedEconomics: econ, company } = profile;

  // 1. The revenue mix must be a mix.
  const mixTotal = revenueMix.projectPct + revenueMix.recurringPct;
  if (Math.abs(mixTotal - 100) > 0.01) {
    push('REVENUE_MIX', `projectPct + recurringPct = ${mixTotal}, expected 100`);
  }

  // 2. Project revenue must follow from engagement count and value.
  const projectRevenue = econ.newProjectEngagementsPerYear * econ.averageProjectValue;
  const expectedProject = company.approximateAnnualRevenue * (revenueMix.projectPct / 100);
  if (!within(projectRevenue, expectedProject)) {
    push(
      'PROJECT_REVENUE',
      `${econ.newProjectEngagementsPerYear} engagements x ${econ.averageProjectValue} = ${Math.round(projectRevenue)}, but revenueMix implies ${Math.round(expectedProject)}`,
    );
  }

  // 3. Recurring revenue must follow from retainer count and fee.
  const recurringRevenue = econ.activeRetainerClients * econ.averageRetainerMonthlyFee * 12;
  const expectedRecurring = company.approximateAnnualRevenue * (revenueMix.recurringPct / 100);
  if (!within(recurringRevenue, expectedRecurring)) {
    push(
      'RECURRING_REVENUE',
      `${econ.activeRetainerClients} retainers x ${econ.averageRetainerMonthlyFee}/mo x 12 = ${Math.round(recurringRevenue)}, but revenueMix implies ${Math.round(expectedRecurring)}`,
    );
  }

  // 4. Both streams together must reconstruct stated revenue.
  if (!within(projectRevenue + recurringRevenue, company.approximateAnnualRevenue)) {
    push(
      'TOTAL_REVENUE',
      `project ${Math.round(projectRevenue)} + recurring ${Math.round(recurringRevenue)} = ${Math.round(projectRevenue + recurringRevenue)}, but stated revenue is ${company.approximateAnnualRevenue}`,
    );
  }

  // 5. The funnel must actually be able to produce that many engagements.
  const wonFromFunnel =
    econ.leadsPerYear * (econ.qualifiedRatePct / 100) * (econ.closeRatePct / 100);
  if (!within(wonFromFunnel, econ.newProjectEngagementsPerYear, 0.2)) {
    push(
      'FUNNEL_RECONCILIATION',
      `${econ.leadsPerYear} leads x ${econ.qualifiedRatePct}% qualified x ${econ.closeRatePct}% close = ${wonFromFunnel.toFixed(1)} engagements, but profile states ${econ.newProjectEngagementsPerYear}`,
    );
  }

  // 6. Declared lead sources must roughly account for stated lead volume.
  const sourcedPerYear = profile.leadSources.reduce((sum, s) => sum + s.approxMonthlyVolume, 0) * 12;
  if (!within(sourcedPerYear, econ.leadsPerYear, 0.2)) {
    push(
      'LEAD_VOLUME',
      `lead sources sum to ${sourcedPerYear}/yr but derivedEconomics states ${econ.leadsPerYear}/yr`,
    );
  }

  // 7. Revenue per head should be plausible for professional services.
  const perHead = company.approximateAnnualRevenue / company.headcount;
  if (perHead < 80_000 || perHead > 400_000) {
    push(
      'REVENUE_PER_HEAD',
      `${Math.round(perHead)} per head is outside the plausible 80k-400k band for a professional services firm`,
    );
  }

  // 8. Every service line's delivery model must be represented in the revenue mix.
  const hasProject = profile.serviceLines.some((l) => l.deliveryModel === 'PROJECT');
  const hasRecurring = profile.serviceLines.some((l) => l.deliveryModel === 'RECURRING');
  if (hasProject && revenueMix.projectPct === 0) {
    push('MIX_VS_SERVICE_LINES', 'profile has PROJECT service lines but projectPct is 0');
  }
  if (hasRecurring && revenueMix.recurringPct === 0) {
    push('MIX_VS_SERVICE_LINES', 'profile has RECURRING service lines but recurringPct is 0');
  }

  // 9. Someone must be able to authorise the highest-authority actions.
  const ceiling = Math.max(...profile.roles.map((r) => r.authorityCeiling));
  if (ceiling < 2) {
    push('AUTHORITY_CEILING', 'no role can approve prepared actions (authority level 2)');
  }

  // 10. Every policy the profile carries must genuinely be a client policy.
  for (const policy of profile.policies) {
    if (policy.provenance !== 'CLIENT_POLICY') {
      push(
        'POLICY_PROVENANCE',
        `policy "${policy.id}" has provenance ${policy.provenance}; profile policies must be CLIENT_POLICY`,
      );
    }
  }

  // 11. Every operating parameter must trace to a stated policy, and keys must be unique.
  const policyIds = new Set(profile.policies.map((p) => p.id));
  const seenKeys = new Set<string>();
  for (const parameter of profile.operatingParameters) {
    if (!policyIds.has(parameter.policyId)) {
      push(
        'PARAMETER_POLICY_REF',
        `operating parameter "${parameter.key}" references policy "${parameter.policyId}", which does not exist. A threshold with no stated policy is a hard-coded assumption.`,
      );
    }
    if (seenKeys.has(parameter.key)) {
      push('PARAMETER_DUPLICATE', `operating parameter key "${parameter.key}" is declared twice`);
    }
    seenKeys.add(parameter.key);
  }

  return issues;
}

// ---------------------------------------------------------------------------
// Parameter lookup
// ---------------------------------------------------------------------------

export interface OperatingParameter {
  readonly key: string;
  readonly label: string;
  readonly value: number | string;
  readonly unit: string;
  readonly policyId: string;
}

export function findParameter(
  profile: BusinessProfile,
  key: string,
): OperatingParameter | undefined {
  return profile.operatingParameters.find((p) => p.key === key);
}

/**
 * Reads a numeric threshold. Throws rather than defaulting: a missing threshold means
 * the engine would silently invent one, which is the exact failure this layer prevents.
 */
export function numberParam(profile: BusinessProfile, key: string): number {
  const parameter = findParameter(profile, key);
  if (parameter === undefined) {
    throw new Error(
      `Operating parameter "${key}" is not defined on profile "${profile.id}". Add it with the policy it implements rather than hard-coding a value.`,
    );
  }
  if (typeof parameter.value !== 'number') {
    throw new Error(`Operating parameter "${key}" is not numeric (got ${typeof parameter.value}).`);
  }
  return parameter.value;
}

// ---------------------------------------------------------------------------
// Escalation owner resolution
// ---------------------------------------------------------------------------

/**
 * The literal string a runtime notification target reads when NO configured role meets the
 * required authority — never a fabricated name, never silently promoted to whichever role
 * happens to exist. Distinct from the "Named owner" simulation placeholder it replaces: this
 * string states plainly that resolution failed, so the gap stays visible rather than being
 * quietly papered over.
 */
export const UNRESOLVED_NO_QUALIFYING_ROLE_TARGET = 'Unresolved — no configured role meets the required authority level';

/**
 * Prefix for the target string when two or more roles tie at the closest qualifying
 * authority ceiling with no canonical basis to prefer one — see `resolveEscalationOwner`'s
 * own docstring for why this codebase does not pick one anyway. The tied candidates' names
 * are appended so the ambiguity is genuinely inspectable, not merely labelled.
 */
export const UNRESOLVED_AMBIGUOUS_OWNER_PREFIX = 'Unresolved — ambiguous among equally-qualified roles: ';

export interface EscalationOwnerResolution {
  readonly status: 'RESOLVED' | 'UNRESOLVED_NO_QUALIFYING_ROLE' | 'UNRESOLVED_AMBIGUOUS_OWNER';
  /** Present iff RESOLVED — the actual configured role this escalation should reach. */
  readonly role?: Role;
  /** Present iff UNRESOLVED_AMBIGUOUS_OWNER — every role tied at the closest qualifying ceiling. */
  readonly candidates?: readonly Role[];
  /**
   * Always present. `role.name` when RESOLVED (a profile carries roles, not named
   * individuals — this IS the most specific truthful identifier the data model has);
   * `UNRESOLVED_NO_QUALIFYING_ROLE_TARGET` or an `UNRESOLVED_AMBIGUOUS_OWNER_PREFIX`-led
   * string otherwise. Kept as a plain string, the exact type `SideEffect.target` already
   * declares, so callers need no shape change.
   */
  readonly target: string;
}

/**
 * Answers, deterministically: given a business profile and a required authority level, which
 * configured role should an escalation notification reach?
 *
 * Policy — closest fit, HONEST ambiguity, never an invented tie-break. Among every role whose
 * `authorityCeiling` is at least `requiredAuthority`, find the SMALLEST such ceiling (the
 * least amount of unnecessary escalation past what's actually required). Exactly one role at
 * that ceiling resolves normally. Two or more resolve `UNRESOLVED_AMBIGUOUS_OWNER` — this
 * codebase does NOT break the tie, on evidence, not by default:
 *
 *   - `RoleSchema.authorityCeiling`'s own doc comment defines it as an execution CAP ("Caps
 *     what automation may do on their behalf"), never an ordering; its only other use in this
 *     codebase (`validateProfileConsistency`) treats it via `Math.max`, a ceiling check, never
 *     a hierarchy walk.
 *   - No field, comment, or documented policy anywhere in this repository ranks one
 *     same-ceiling role above another for escalation purposes. `profile.roles`' own declared
 *     array order carries no canonical meaning (verified directly: reversing it does not
 *     change which roles tie).
 *   - The one genuinely relevant precedent already in this codebase argues AGAINST inventing a
 *     tie-break: Client Onboarding's `resolveAuthoritativeValue()` (`lib/engine/handlers/
 *     client-onboarding.ts`) holds that two equally-ranked, disagreeing sources stay an
 *     explicit `CONFLICT` rather than being silently resolved by recency or any other
 *     incidental signal. An alphabetical-by-`id` tie-break would have been the same category
 *     of mistake this portfolio has already rejected once, applied to role ids instead of
 *     timestamps.
 *
 * Reaching for a NEW profile field (a rank, a priority, a hierarchy) to manufacture a
 * tie-break would not resolve this — it would relocate the same invented policy into
 * configuration while dressing it as data. If a future profile genuinely needs one role to
 * outrank another at equal authority, that is a real modelling decision for whoever owns the
 * canon to make explicitly — not an inference this function should make on their behalf.
 *
 * No role meeting `requiredAuthority` at all returns `UNRESOLVED_NO_QUALIFYING_ROLE` — a
 * genuinely different condition from ambiguity, and never conflated with it (see
 * `tests/profile.test.ts`, "the two unresolved reasons are genuinely distinguishable").
 * Neither unresolved case ever fabricates a person or silently promotes an insufficient or
 * ambiguous role — the same "fail loud, not plausible" discipline `MalformedWaitRecordError`/
 * `MalformedOperationClaimError` already apply elsewhere in this codebase to missing data.
 *
 * Pure and synchronous, like every other profile utility in this file — no I/O, no clock, no
 * randomness. Resolving an owner is a lookup against already-loaded profile data, not a new
 * kind of judgment or a new execution authority: it decides WHO a permitted notification names,
 * never WHETHER the notification is permitted at all (that remains the engine core's own
 * authority gate, unchanged) — true whether the answer is a name or an honest ambiguity.
 */
export function resolveEscalationOwner(profile: BusinessProfile, requiredAuthority: AuthorityLevel): EscalationOwnerResolution {
  const qualifying = profile.roles.filter((role) => role.authorityCeiling >= requiredAuthority);
  if (qualifying.length === 0) {
    return { status: 'UNRESOLVED_NO_QUALIFYING_ROLE', target: UNRESOLVED_NO_QUALIFYING_ROLE_TARGET };
  }
  const closestCeiling = Math.min(...qualifying.map((role) => role.authorityCeiling));
  const closestFit = qualifying.filter((role) => role.authorityCeiling === closestCeiling);
  if (closestFit.length > 1) {
    // Sorted only so the target STRING is stable/order-independent for display and testing —
    // this is not a tie-break: no role here is preferred over another, all are reported.
    const sorted = [...closestFit].sort((a, b) => a.id.localeCompare(b.id));
    return {
      status: 'UNRESOLVED_AMBIGUOUS_OWNER',
      candidates: sorted,
      target: `${UNRESOLVED_AMBIGUOUS_OWNER_PREFIX}${sorted.map((role) => role.name).join(', ')}`,
    };
  }
  const [chosen] = closestFit;
  if (chosen === undefined) {
    return { status: 'UNRESOLVED_NO_QUALIFYING_ROLE', target: UNRESOLVED_NO_QUALIFYING_ROLE_TARGET };
  }
  return { status: 'RESOLVED', role: chosen, target: chosen.name };
}
