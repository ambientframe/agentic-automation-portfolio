import type { BusinessProfile } from '@/lib/model/profile';
import { canDeliver, type Claim, type ProposalArtifact } from '@/lib/engine/handlers/call-to-proposal';
import { SignedEngagementHandoffSchema, type SignedEngagementHandoff } from '@/lib/engine/handlers/client-onboarding';

/**
 * THE SYSTEM 3 -> SYSTEM 4 BOUNDARY.
 *
 * Call-to-Proposal's own authoritative, approved-and-despatched commercial state —
 * `ProposalArtifact` plus the `Claim[]` it was built from — translated into the
 * Client Onboarding handoff, mechanically, from claims Call-to-Proposal itself already
 * admitted through `admitClaim`. Nothing here re-types business prose to match; every
 * field is either copied verbatim from the artifact's own approval record or derived
 * from a specific named claim, so a change to what Call-to-Proposal actually admitted
 * changes what this function produces.
 *
 * Deliberately a plain function, not a port: both sides of this boundary are already
 * fully resolved, deterministic engine output by the time it runs. There is no I/O left
 * to abstract, so adding a provider indirection here would be the "universal DTO layer
 * without evidence" this pass was told not to build.
 *
 * `client-onboarding.ts` does not import this file or anything from `call-to-proposal.ts`
 * — it only ever consumes a `SignedEngagementHandoff` off an event payload, exactly as
 * before. This file is the seam that is allowed to know about both systems' shapes;
 * neither handler is.
 */

export interface SignatureConfirmation {
  /** The customer identity as known to whatever system captured the actual signature. Not derivable from CP, which has no customer-identity concept of its own. */
  readonly customerId: string;
  /** The delivery-engagement identity assigned once onboarding begins. Distinct from CP's opportunityId by design — see `ProposalArtifact.opportunityId`, still recoverable from `commercialArtifact.id`. */
  readonly engagementId: string;
}

export type HandoffTranslationResult =
  | { readonly kind: 'OK'; readonly handoff: SignedEngagementHandoff }
  | { readonly kind: 'REFUSED'; readonly reason: string };

/**
 * Claim fields this translation cannot proceed without. A shorter list than
 * `CP_REQUIRED_FIELDS` deliberately — `agreedNextStep` and `currentSituation`, for
 * instance, are required for CP's own draft to exist at all, but this function does not
 * itself read them, so their absence would not corrupt anything it produces.
 */
const REQUIRED_CLAIM_FIELDS = ['buyerCompanyName', 'desiredOutcome', 'serviceInterest', 'timing', 'nextStepOwner', 'primaryContact'] as const;

/** Onboarding-requirement id -> the CP claim field that answers it. The one piece of genuine cross-vocabulary translation this boundary does. */
const KNOWN_FACT_FIELD_MAP: Readonly<Record<string, string>> = {
  'named-owner': 'primaryContact',
};

/**
 * THE TRANSLATION GATE. Refuses before it ever produces a handoff — never after, never
 * partially. A draft, an in-review package, a rejected package, or an approval that no
 * longer matches the artifact's current version (see `canDeliver`) all refuse here. So
 * does an approved artifact missing a claim this function needs to read: better an
 * honest refusal than a handoff carrying an invented or empty value for a field the
 * upstream system never actually established.
 */
export function exportSignedEngagementHandoff(
  artifact: ProposalArtifact | null,
  claims: readonly Claim[],
  missingInformation: readonly string[],
  profile: BusinessProfile,
  signature: SignatureConfirmation,
): HandoffTranslationResult {
  if (artifact === null) {
    return {
      kind: 'REFUSED',
      reason: 'No proposal artifact exists for this opportunity. A transcript that never reached a draft carries no authoritative commercial state to translate.',
    };
  }

  if (!canDeliver(artifact)) {
    const approvalDetail = artifact.approval === null ? 'no approval on file' : `approval names version ${artifact.approval.approvedVersion}, artifact is at version ${artifact.version}`;
    return {
      kind: 'REFUSED',
      reason: `Proposal ${artifact.id} v${artifact.version} is not deliverable (claimStatus=${artifact.claimStatus}, ${approvalDetail}). Only an artifact whose every claim was admitted AND whose approval names the version currently in front of us may authorise onboarding.`,
    };
  }

  const byField = (field: string): Claim | undefined => claims.find((c) => c.field === field);
  const missingClaimFields = REQUIRED_CLAIM_FIELDS.filter((f) => byField(f) === undefined);
  if (missingClaimFields.length > 0) {
    return {
      kind: 'REFUSED',
      reason: `Approved artifact ${artifact.id} is missing claim field(s) this translation requires: ${missingClaimFields.join(', ')}. An approved artifact that is missing a field this boundary reads is treated as malformed, not defaulted.`,
    };
  }

  const serviceInterest = byField('serviceInterest')!;
  const serviceLine = profile.serviceLines.find((l) => l.id === serviceInterest.value);
  if (serviceLine === undefined) {
    return {
      kind: 'REFUSED',
      reason: `Admitted serviceInterest "${serviceInterest.value}" does not resolve to a service line this business declares.`,
    };
  }

  const knownFacts: Record<string, string> = {};
  for (const [requirementId, claimField] of Object.entries(KNOWN_FACT_FIELD_MAP)) {
    const claim = byField(claimField);
    if (claim !== undefined) knownFacts[requirementId] = claim.value;
  }

  const candidate: SignedEngagementHandoff = {
    kind: 'SIGNED_AGREEMENT',
    customerId: signature.customerId,
    customerName: byField('buyerCompanyName')!.value,
    engagementId: signature.engagementId,
    commercialArtifact: {
      id: artifact.id,
      version: artifact.version,
      approvedBy: artifact.approval!.approvedBy,
      approvedAt: artifact.approval!.at,
    },
    serviceLineId: serviceLine.id,
    scopeSummary: `${serviceLine.name}: ${byField('desiredOutcome')!.value}`,
    // Firm-wide, already-authoritative SELLER_POLICY boundaries. Not "every other catalog
    // service line" — a real proposal does not enumerate unrelated offerings it did not
    // sell, and CP has no claim shape for that. What it CAN say authoritatively is what
    // this firm never does, at all, on any engagement.
    exclusions: [...profile.company.explicitlyNot],
    // Only the SELLER_POLICY-sourced commercial term(s) — the DERIVED feasibility check
    // alongside it in `artifact.commercialTerms` is an internal validation fact, not
    // itself a commitment.
    sellerCommitments: artifact.commercialTerms.filter((c) => c.source === 'SELLER_POLICY').map((c) => c.value),
    // CP's claim model has no distinct "customer obligation" field — the closest genuine
    // claim is who the buyer named as the accountable owner of moving this forward.
    customerCommitments: [`${byField('nextStepOwner')!.value} owns bringing this engagement forward as the accountable contact.`],
    timing: byField('timing')!.value,
    successCriteria: [byField('desiredOutcome')!.value],
    stakeholders: [{ name: byField('nextStepOwner')!.value, role: byField('primaryContact')!.value }],
    knownFacts,
    knownUnknowns: [...missingInformation],
    originatingSystem: 'call-to-proposal',
  };

  const parsed = SignedEngagementHandoffSchema.safeParse(candidate);
  if (!parsed.success) {
    return {
      kind: 'REFUSED',
      reason: `Translated handoff failed its own schema: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}.`,
    };
  }

  return { kind: 'OK', handoff: parsed.data };
}
