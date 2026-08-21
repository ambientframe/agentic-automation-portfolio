import { z } from 'zod';
import { AuthorityLevelSchema } from './system';
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
