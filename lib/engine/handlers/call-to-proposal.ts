import { z } from 'zod';
import { numberParam, resolveAccountableRole, resolveEscalationOwner, type EscalationOwnerResolution } from '@/lib/model/profile';
import type { BusinessProfile } from '@/lib/model/profile';
import type { DecisionRecord } from '@/lib/model/runtime';
import { AUTHORITY_LEVELS, type AuthorityLevel } from '@/lib/model/system';
import type { HandlerContext, HandlerOutcome, HandlerStep, ProposedEffect, SystemHandlers } from '../types';

/**
 * CALL-TO-PROPOSAL REVENUE AGENT — operating logic.
 *
 * The commercial-truth model this handler enforces distinguishes four classes of
 * information, carried on every `Claim`:
 *
 *   TRANSCRIPT    — a buyer fact. Requires at least one evidence reference to a real
 *                    transcript segment. Zero references is not a weaker claim; it is an
 *                    inadmissible one.
 *   SELLER_POLICY — a seller fact or term. Requires a `ruleId` resolving to something the
 *                    business profile actually declares (a service line, a policy). Never
 *                    invented from the transcript.
 *   DERIVED       — a deterministic computation over other admitted claims. Requires
 *                    `derivedFrom` naming its inputs and a `ruleId` naming the rule.
 *   HUMAN_SUPPLIED — a person answered a recorded gap. Requires `suppliedBy`.
 *
 * `admitClaim` is the claim-admission gate: every claim destined for a proposal draft is
 * checked against these requirements before the draft may exist. This is executable
 * behaviour, not a narrated checklist — a claim that fails admission routes the whole
 * package to a person rather than being softened into prose.
 *
 * Extraction (transcript -> candidate claims) is the one BOUNDED_AI_JUDGMENT surface,
 * resolved through the `ExtractionProvider` port before this handler runs (see
 * `lib/ports/extraction-provider.ts` and `lib/engine/run.ts`). Everything downstream of
 * the extracted candidates — coverage, admission, scope derivation, approval authority,
 * artifact versioning — is DETERMINISTIC_RULE or HUMAN_DECISION. The bounded judgment
 * proposes; it never itself admits a claim or authorises a despatch.
 *
 * Transition legality, idempotency, and the authority gate are NOT implemented here.
 * They live in the engine core so this handler cannot bypass them.
 */

// ---------------------------------------------------------------------------
// Commercial-record fields
// ---------------------------------------------------------------------------

/**
 * Fields whose absence blocks progress until a person closes the gap. Requiredness is a
 * property of this business's proposal process, not a universal list — a different
 * profile could declare a different set by changing only the scenario/handler pairing at
 * a different fidelity pass. Cites `kestrel-cp-required-fields` — see the Kestrel policy
 * of that id for the prose rationale.
 */
export const CP_REQUIRED_FIELDS = [
  'buyerCompanyName',
  'primaryContact',
  'currentSituation',
  'desiredOutcome',
  'serviceInterest',
  'timing',
  'agreedNextStep',
  'nextStepOwner',
] as const;

/** Never required, and never blocks progress by staying unknown. */
export const CP_OPTIONAL_FIELDS = [
  'budgetDiscussed',
  'employeeCount',
  'decisionMakerInvolved',
  'currentTooling',
] as const;

// ---------------------------------------------------------------------------
// The commercial-truth model
// ---------------------------------------------------------------------------

export const CLAIM_SOURCES = ['TRANSCRIPT', 'SELLER_POLICY', 'DERIVED', 'HUMAN_SUPPLIED'] as const;
export type ClaimSource = (typeof CLAIM_SOURCES)[number];

export interface Claim {
  readonly field: string;
  readonly value: string;
  readonly source: ClaimSource;
  /** Transcript segment ids. Required (non-empty) when `source === 'TRANSCRIPT'`. */
  readonly evidenceRefs: readonly string[];
  /** Field names this was computed from. Required when `source === 'DERIVED'`. */
  readonly derivedFrom?: readonly string[];
  /** The role that supplied this fact. Required when `source === 'HUMAN_SUPPLIED'`. */
  readonly suppliedBy?: string;
  /** A service-line or policy id from the business profile. Required for SELLER_POLICY and DERIVED. */
  readonly ruleId?: string;
}

export interface AdmissionResult {
  readonly admitted: boolean;
  readonly reason?: string;
}

/**
 * A phrase this firm's policy prohibits in any outbound communication, regardless of
 * source. Deliberately small and literal rather than a language model of its own — the
 * gate this belongs to is a deterministic screen, not a second bounded judgment.
 */
const PROHIBITED_COMMITMENT_PHRASES = ['guarantee', 'guaranteed', 'certified by', 'promise'];

function screenProhibitedLanguage(claim: Claim): string | null {
  const lowered = claim.value.toLowerCase();
  const hit = PROHIBITED_COMMITMENT_PHRASES.find((phrase) => lowered.includes(phrase));
  return hit === undefined ? null : hit;
}

/** THE CLAIM-ADMISSION GATE. Executable, not narrated: every proposal claim passes through this. */
export function admitClaim(claim: Claim, profile: BusinessProfile): AdmissionResult {
  const prohibited = screenProhibitedLanguage(claim);
  if (prohibited !== null) {
    return {
      admitted: false,
      reason: `Value contains the prohibited-commitment phrase "${prohibited}". CLIENT_POLICY kestrel-attestation-language: no communication may state or imply a guaranteed or certified outcome.`,
    };
  }

  switch (claim.source) {
    case 'TRANSCRIPT':
      return claim.evidenceRefs.length > 0
        ? { admitted: true }
        : {
            admitted: false,
            reason: `Field "${claim.field}" is asserted as a buyer fact but cites zero transcript evidence references. A buyer fact requires evidence from an authoritative source artifact; it is never created merely because it is plausible.`,
          };
    case 'HUMAN_SUPPLIED':
      return claim.suppliedBy !== undefined
        ? { admitted: true }
        : {
            admitted: false,
            reason: `Field "${claim.field}" is marked human-supplied but names no supplying person.`,
          };
    case 'SELLER_POLICY': {
      if (claim.ruleId === undefined) {
        return { admitted: false, reason: `Field "${claim.field}" is a seller term but cites no rule id.` };
      }
      const known = profile.serviceLines.some((line) => line.id === claim.ruleId);
      return known
        ? { admitted: true }
        : {
            admitted: false,
            reason: `Field "${claim.field}" cites rule id "${claim.ruleId}", which does not resolve to a service line this business actually declares.`,
          };
    }
    case 'DERIVED':
      return claim.derivedFrom !== undefined && claim.derivedFrom.length > 0 && claim.ruleId !== undefined
        ? { admitted: true }
        : {
            admitted: false,
            reason: `Field "${claim.field}" is derived but does not name both its input claims and the rule that computed it.`,
          };
  }
}

// ---------------------------------------------------------------------------
// The proposal artifact
// ---------------------------------------------------------------------------

export interface ProposalApproval {
  readonly approvedBy: string;
  /** The artifact `version` that was actually shown to and approved by this person. */
  readonly approvedVersion: number;
  readonly at: string;
}

export interface ProposalArtifact {
  readonly id: string;
  readonly version: number;
  readonly opportunityId: string;
  readonly createdAt: string;
  readonly scope: readonly Claim[];
  readonly commercialTerms: readonly Claim[];
  readonly claimStatus: 'ALL_SUPPORTED' | 'UNSUPPORTED_CLAIM_PRESENT';
  readonly approval: ProposalApproval | null;
}

function computeClaimStatus(claims: readonly Claim[], profile: BusinessProfile): ProposalArtifact['claimStatus'] {
  return claims.every((c) => admitClaim(c, profile).admitted) ? 'ALL_SUPPORTED' : 'UNSUPPORTED_CLAIM_PRESENT';
}

export function createProposalArtifact(
  opportunityId: string,
  createdAt: string,
  scope: readonly Claim[],
  commercialTerms: readonly Claim[],
  profile: BusinessProfile,
): ProposalArtifact {
  return {
    id: `proposal:${opportunityId}`,
    version: 1,
    opportunityId,
    createdAt,
    scope,
    commercialTerms,
    claimStatus: computeClaimStatus([...scope, ...commercialTerms], profile),
    approval: null,
  };
}

/**
 * Revises an artifact's commercially meaningful content. Deliberately does NOT carry
 * forward a valid approval onto the new version — `approval` is left exactly as it was
 * (still naming the OLD version), so `canDeliver` on the returned artifact is false until
 * a person approves this specific new version. This is the mechanism, not a policy note:
 * a stale approval cannot authorise a changed artifact because the version numbers no
 * longer match.
 */
export function reviseProposalArtifact(
  artifact: ProposalArtifact,
  scope: readonly Claim[],
  commercialTerms: readonly Claim[],
  profile: BusinessProfile,
): ProposalArtifact {
  return {
    ...artifact,
    version: artifact.version + 1,
    scope,
    commercialTerms,
    claimStatus: computeClaimStatus([...scope, ...commercialTerms], profile),
  };
}

export function approveProposalArtifact(
  artifact: ProposalArtifact,
  approvedBy: string,
  at: string,
): ProposalArtifact {
  return { ...artifact, approval: { approvedBy, approvedVersion: artifact.version, at } };
}

/**
 * THE APPROVAL-VALIDITY INVARIANT. An artifact may be delivered only when every claim it
 * carries is admissible AND its recorded approval names the version currently in front of
 * us. A revision after approval leaves `approval.approvedVersion` pointing at the old
 * version, so this returns false until the new version is explicitly approved again.
 */
export function canDeliver(artifact: ProposalArtifact): boolean {
  return (
    artifact.claimStatus === 'ALL_SUPPORTED' &&
    artifact.approval !== null &&
    artifact.approval.approvedVersion === artifact.version
  );
}

// ---------------------------------------------------------------------------
// Serialisation into EngineState.facts
// ---------------------------------------------------------------------------

/**
 * `EngineState.facts` is `Record<string, string>` — deliberately unchanged for this
 * system, exactly as it is for the other two. Call-to-Proposal's structured commercial
 * record and proposal artifact are richer than a flat key/value fact, so they are carried
 * as one JSON-serialised fact each rather than forcing a shared engine type wider for a
 * shape only this system needs. See STATUS.md's architecture-falsification notes for why
 * this was the smaller change.
 */
const CLAIMS_FACT_KEY = 'commercialRecordClaimsJson';
const ARTIFACT_FACT_KEY = 'proposalArtifactJson';

/**
 * Exported (unlike the `write*` half below) because this is the read side of the System
 * 3 -> System 4 boundary: `lib/engine/handoffs/proposal-to-onboarding-handoff.ts` reads
 * the claims this system itself admitted, rather than a caller re-typing them. See that
 * file for why the boundary reads through here instead of duplicating the fact-key shape.
 */
export function readClaims(facts: Readonly<Record<string, string>>): Claim[] {
  const raw = facts[CLAIMS_FACT_KEY];
  return raw === undefined ? [] : (JSON.parse(raw) as Claim[]);
}

function writeClaims(claims: readonly Claim[]): Record<string, string> {
  return { [CLAIMS_FACT_KEY]: JSON.stringify(claims) };
}

/** Exported for the same reason as `readClaims` above. */
export function readArtifact(facts: Readonly<Record<string, string>>): ProposalArtifact | null {
  const raw = facts[ARTIFACT_FACT_KEY];
  return raw === undefined ? null : (JSON.parse(raw) as ProposalArtifact);
}

function writeArtifact(artifact: ProposalArtifact): Record<string, string> {
  return { [ARTIFACT_FACT_KEY]: JSON.stringify(artifact) };
}

// ---------------------------------------------------------------------------
// Payload contracts
// ---------------------------------------------------------------------------

const TranscriptSegmentSchema = z.object({
  id: z.string().min(1),
  speaker: z.string().min(1),
  text: z.string().min(1),
});

const TranscriptReceivedPayloadSchema = z.object({
  extraction: z.object({
    judgmentId: z.string().min(1),
    objective: z.string().min(1),
    sourceArtifactId: z.string().min(1),
    segments: z.array(TranscriptSegmentSchema).min(1),
    requiredFields: z.array(z.string().min(1)),
  }),
});

const ClarificationPayloadSchema = z.object({
  suppliedBy: z.string().min(1),
  field: z.string().min(1),
  value: z.string().min(1),
});

const HumanDecisionPayloadSchema = z.object({
  decidedBy: z.string().min(1),
  decision: z.enum(['APPROVE', 'REQUEST_REVISION', 'REJECT']),
  rationale: z.string().min(1),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function decision(partial: DecisionRecord): DecisionRecord {
  return partial;
}

const MIN_TRANSCRIPT_SEGMENTS = 3;

// ---------------------------------------------------------------------------
// Approval assignment — the facts cp-fm-approval-timeout is measured against
// ---------------------------------------------------------------------------

/** When the draft entered AWAITING_APPROVAL. The approval window is measured from here. */
const APPROVAL_ROUTED_AT_FACT = 'approvalRoutedAt';
/** `EscalationOwnerResolution.status` at routing — RESOLVED, or which way it failed. */
const APPROVAL_STATUS_FACT = 'approvalAssignmentStatus';
/** The resolution's target string: a role name, or an honest statement that there is none. */
const APPROVAL_ASSIGNEE_FACT = 'approvalAssignedTo';
/** The assignee's own authority ceiling. Written ONLY when an approver was actually named. */
const APPROVAL_CEILING_FACT = 'approvalAssigneeCeiling';
/** Where the business says an unactioned approval goes next. Written only when declared. */
const APPROVAL_ESCALATES_TO_FACT = 'approvalEscalatesTo';

/**
 * The action id this system asks the profile about. A business that has decided who approves a
 * proposal says so under this key; one that has not says nothing, and routing falls back to
 * authority resolution — which may itself be honestly ambiguous. See
 * `resolveAccountableRole`.
 */
export const PROPOSAL_APPROVAL_ACTION = 'PROPOSAL_APPROVAL';

/**
 * Who this draft is waiting on, answered in the order a real firm would answer it: first from
 * what the business actually DECLARED, and only then from what its authority ranks IMPLY.
 *
 * The order matters and is not a convenience. Rank answers "who has enough authority?", which
 * is a different question from "whose job is this?" — Kestrel's Operations Coordinator and
 * Finance both clear the proposal authority bar and neither approves proposals. Asking rank
 * first would produce a confidently wrong name; asking it second produces a fallback for a
 * business that has genuinely not decided, and an honest ambiguity when even that cannot
 * settle it.
 */
interface ApprovalAssignment {
  readonly status: 'DECLARED_ACCOUNTABILITY' | EscalationOwnerResolution['status'];
  readonly target: string;
  readonly ceiling?: AuthorityLevel;
  readonly escalatesTo?: string;
}

function resolveApprovalAssignment(profile: BusinessProfile, approvalAuthority: AuthorityLevel): ApprovalAssignment {
  const declared = resolveAccountableRole(profile, PROPOSAL_APPROVAL_ACTION);
  if (declared !== undefined) {
    return {
      status: 'DECLARED_ACCOUNTABILITY',
      target: declared.accountable.name,
      ceiling: declared.accountable.authorityCeiling,
      ...(declared.escalatesTo === undefined ? {} : { escalatesTo: declared.escalatesTo.name }),
    };
  }
  const inferred = resolveEscalationOwner(profile, approvalAuthority);
  return {
    status: inferred.status,
    target: inferred.target,
    ...(inferred.role === undefined ? {} : { ceiling: inferred.role.authorityCeiling }),
  };
}

/** True only when a specific person was actually identified, by either route. */
function isAssigned(assignment: Pick<ApprovalAssignment, 'status'>): boolean {
  return assignment.status === 'DECLARED_ACCOUNTABILITY' || assignment.status === 'RESOLVED';
}

/**
 * An operating parameter is a number; the authority ladder is a closed set. A profile that
 * configures an approval ceiling off the ladder is a configuration error that must surface
 * here rather than be clamped into range — clamping would silently move where approval sits.
 */
function asAuthorityLevel(value: number, key: string): AuthorityLevel {
  const level = AUTHORITY_LEVELS.find((candidate) => candidate === value);
  if (level === undefined) {
    throw new Error(
      `Operating parameter "${key}" is ${value}, which is not a declared authority level (${AUTHORITY_LEVELS.join(', ')}).`,
    );
  }
  return level;
}

/**
 * The next rung strictly above `level`, or null at the top of the ladder.
 *
 * This is the whole difference between Lead Rescue's attention timeout and this one. Lead
 * Rescue escalates to a fixed LEVEL (`NEXT_OWNER_ESCALATION_AUTHORITY`), which is correct
 * there because nothing was ever assigned to a particular person. Here canon says "escalate
 * to the NEXT approver in the authority chain", and "next" is only meaningful relative to
 * whoever was already asked. Deriving the target from the assignee's own ceiling makes it
 * structurally impossible to escalate a person to themselves — the qualifying set at
 * `ceiling + 1` cannot contain a role whose ceiling is `ceiling`.
 *
 * Returning null rather than saturating at 4 is deliberate, and the type system enforces it:
 * `AuthorityLevel` has no rung above 4, so "the approver is already the final escalation
 * point" cannot be expressed as a level and must be handled as its own condition.
 */
function nextAuthorityAbove(level: AuthorityLevel): AuthorityLevel | null {
  return AUTHORITY_LEVELS.find((candidate) => candidate > level) ?? null;
}

/**
 * Compares a service line's typical delivery duration against the buyer's own stated
 * timing. A DERIVED fact: neither party asserted it directly, and it is only as good as
 * the two claims it was computed from — both of which must themselves be admitted for it
 * to be admitted.
 */
function deriveTimelineFeasibility(
  serviceInterest: Claim,
  timing: Claim,
  profile: BusinessProfile,
): Claim | null {
  const line = profile.serviceLines.find((l) => l.id === serviceInterest.value);
  if (line === undefined || line.typicalDurationWeeks === undefined) return null;

  const match = /(\d+)\s*week/i.exec(timing.value);
  if (match?.[1] === undefined) return null;
  const stated = Number(match[1]);

  const feasible = line.typicalDurationWeeks <= stated;
  return {
    field: 'timelineFeasible',
    value: String(feasible),
    source: 'DERIVED',
    evidenceRefs: [],
    derivedFrom: ['serviceInterest', 'timing'],
    ruleId: 'seller-catalog-duration-check',
  };
}

function sellerPricingClaim(serviceInterest: Claim, profile: BusinessProfile): Claim | null {
  const line = profile.serviceLines.find((l) => l.id === serviceInterest.value);
  if (line === undefined) return null;
  return {
    field: 'commercialTerms',
    value: `${line.name}: ${line.deliveryModel === 'PROJECT' ? `$${line.typicalValue.toLocaleString()} total engagement value` : `$${line.typicalValue.toLocaleString()}/month`}`,
    source: 'SELLER_POLICY',
    evidenceRefs: [],
    ruleId: line.id,
  };
}

/**
 * Runs claims review against a candidate claim set and either assembles/updates the
 * proposal artifact and routes for approval, or blocks at NEEDS_HUMAN naming the first
 * inadmissible claim. Shared by the transcript path (no material gap) and the
 * clarification path (gap just closed), which is the one piece of step logic genuinely
 * common to both entry points into claims review.
 */
function reviewClaimsAndRouteForApproval(
  claims: readonly Claim[],
  event: { eventId: string; entityId: string; occurredAt: string },
  profile: BusinessProfile,
  id: (suffix: string) => string,
  atOffsetBase: number,
): HandlerStep[] {
  const steps: HandlerStep[] = [];
  const serviceInterest = claims.find((c) => c.field === 'serviceInterest');
  const timing = claims.find((c) => c.field === 'timing');

  const derived = serviceInterest && timing ? deriveTimelineFeasibility(serviceInterest, timing, profile) : null;
  const pricing = serviceInterest ? sellerPricingClaim(serviceInterest, profile) : null;

  const candidateScope = claims;
  const candidateTerms = [pricing, derived].filter((c): c is Claim => c !== null);
  const allCandidates = [...candidateScope, ...candidateTerms];

  const admissions = allCandidates.map((c) => ({ claim: c, result: admitClaim(c, profile) }));
  const rejected = admissions.find((a) => !a.result.admitted);

  steps.push({
    id: id('claims-review'),
    label: 'Claims review',
    atOffsetSeconds: atOffsetBase,
    transitionTo: rejected === undefined ? 'DRAFT_PREPARED' : 'NEEDS_HUMAN',
    summary:
      rejected === undefined
        ? `Every asserted claim resolves to a cited passage, a seller-catalog rule, or a human-supplied fact. ${allCandidates.length} claims admitted.`
        : `Claim "${rejected.claim.field}" (value: "${rejected.claim.value}") failed admission: ${rejected.result.reason}`,
    decisions: [
      decision({
        id: id('d-claims-review'),
        eventId: event.eventId,
        mechanism: 'DETERMINISTIC_RULE',
        objective: 'Resolve every asserted commercial claim against its cited evidence, seller rule, or human source before a draft may exist.',
        relevantState: 'CLAIMS_REVIEW',
        evidenceRefs: allCandidates.map((c) => `claim.${c.field}`),
        deterministicFacts: allCandidates.map((c) => ({
          label: c.field,
          value: `${c.value} [${c.source}${c.evidenceRefs.length > 0 ? `, refs: ${c.evidenceRefs.join(',')}` : ''}]`,
        })),
        missingInformation: [],
        permittedActions: rejected === undefined ? ['assemble_draft'] : ['route_to_human'],
        forbiddenActions: ['admit_unsupported_claim', 'soften_language_instead_of_blocking'],
        selectedAction: rejected === undefined ? 'assemble_draft' : 'route_to_human',
        applicablePolicy: [
          'LAB_TARGET cp-lab-zero-unsupported: a package containing any claim resolving to no cited passage and no human-supplied fact does not reach a reviewer.',
          'CLIENT_POLICY kestrel-attestation-language: no communication may state or imply a guaranteed or certified outcome.',
        ],
        escalationReason: rejected === undefined ? undefined : rejected.result.reason,
        authority: rejected === undefined ? 3 : 2,
      }),
    ],
    effects: [],
    verifications: [],
    statePatch: { facts: writeClaims(candidateScope) },
  });

  if (rejected !== undefined) return steps;

  const artifact = createProposalArtifact(event.entityId, event.occurredAt, candidateScope, candidateTerms, profile);

  steps.push({
    id: id('draft'),
    label: 'Draft assembled',
    atOffsetSeconds: atOffsetBase + 1,
    summary: `Proposal artifact ${artifact.id} version ${artifact.version} assembled from ${candidateScope.length} scope claims and ${candidateTerms.length} commercial-term claims.`,
    decisions: [
      decision({
        id: id('d-draft'),
        eventId: event.eventId,
        mechanism: 'DETERMINISTIC_RULE',
        objective: 'Assemble a versioned proposal artifact from the admitted claim set.',
        relevantState: 'DRAFT_PREPARED',
        evidenceRefs: [`artifact.id=${artifact.id}`, `artifact.version=${artifact.version}`],
        deterministicFacts: [
          { label: 'Artifact id', value: artifact.id },
          { label: 'Version', value: String(artifact.version) },
          { label: 'Claim status', value: artifact.claimStatus },
        ],
        missingInformation: [],
        permittedActions: ['route_for_approval'],
        forbiddenActions: ['despatch_without_approval'],
        selectedAction: 'route_for_approval',
        applicablePolicy: ['CLIENT_POLICY kestrel-proposal-authority: no proposal leaves the firm without named human approval.'],
        authority: 2,
      }),
    ],
    effects: [],
    verifications: [],
    statePatch: { facts: writeArtifact(artifact) },
  });

  // cp-fm-approval-timeout's declared PREVENTION is "Named approver and review window
  // assigned at the moment of routing" — so routing is where both are established, or where
  // it becomes a matter of record that they could not be. `resolveEscalationOwner` refuses to
  // break a tie between equally-qualified roles, and that refusal is load-bearing here: an
  // ambiguous result is not a degraded name, it is the failure mode's own declared cause
  // ("no named approver assigned at routing time") occurring at the moment it is declared to.
  const approvalAuthority = asAuthorityLevel(numberParam(profile, 'proposalAuthorityCeiling'), 'proposalAuthorityCeiling');
  const approver = resolveApprovalAssignment(profile, approvalAuthority);
  const assigned = isAssigned(approver);
  const windowHours = numberParam(profile, 'proposalApprovalTimeoutHours');

  steps.push({
    id: id('route'),
    label: 'Routed for approval',
    atOffsetSeconds: atOffsetBase + 2,
    transitionTo: 'AWAITING_APPROVAL',
    summary: assigned
      ? `Draft complete and held at authority level ${approvalAuthority}, assigned to ${approver.target} with a ${windowHours}-hour review window${approver.escalatesTo === undefined ? '' : `, escalating to ${approver.escalatesTo} if unactioned`}. Nothing may leave the firm from here without a person acting.`
      : `Draft complete and held at authority level ${approvalAuthority}, but NO named approver could be assigned: ${approver.target}. The ${windowHours}-hour review window still starts — the promise made to the buyer does not pause because the firm cannot say whose desk this is on.`,
    decisions: [
      decision({
        id: id('d-route'),
        eventId: event.eventId,
        mechanism: 'DETERMINISTIC_RULE',
        objective: 'Route the completed draft to a person with the required approval authority, and start the review window.',
        relevantState: 'DRAFT_PREPARED',
        evidenceRefs: [`artifact.id=${artifact.id}`, `profile.roles`],
        deterministicFacts: [
          { label: 'Proposal authority ceiling', value: String(approvalAuthority) },
          { label: 'Approver assignment', value: approver.status },
          { label: 'Assigned to', value: approver.target },
          { label: 'Escalates to', value: approver.escalatesTo ?? 'not declared' },
          { label: 'Review window', value: `${windowHours} hours` },
          { label: 'Routed at', value: event.occurredAt },
        ],
        missingInformation: assigned ? [] : ['Which named person owns approval of this draft'],
        permittedActions: ['await_human_approval'],
        forbiddenActions: ['auto_approve', 'despatch_at_this_authority_level', 'invent_an_approver'],
        selectedAction: 'await_human_approval',
        applicablePolicy: [
          'CLIENT_POLICY kestrel-proposal-authority: no proposal leaves the firm without named human approval.',
          `CLIENT_POLICY kestrel-proposal-approval-window: the review window starts at routing and runs for ${windowHours} hours.`,
        ],
        escalationReason: assigned ? undefined : `No approver could be named at routing: ${approver.target}`,
        authority: 2,
      }),
    ],
    effects: [],
    verifications: [],
    statePatch: {
      facts: {
        [APPROVAL_ROUTED_AT_FACT]: event.occurredAt,
        [APPROVAL_STATUS_FACT]: approver.status,
        [APPROVAL_ASSIGNEE_FACT]: approver.target,
        // Written ONLY when a role was actually resolved. An unresolved assignment has no
        // ceiling, and writing a placeholder would hand the timeout a number to escalate
        // above — manufacturing a chain position for a person who does not exist.
        ...(approver.ceiling === undefined ? {} : { [APPROVAL_CEILING_FACT]: String(approver.ceiling) }),
        // Written only when the business declared where an unactioned approval goes next.
        // Absent means "not declared", which the timeout reads as "derive it from rank".
        ...(approver.escalatesTo === undefined ? {} : { [APPROVAL_ESCALATES_TO_FACT]: approver.escalatesTo }),
      },
    },
  });

  return steps;
}

// ---------------------------------------------------------------------------
// sales.call.transcript.received
// ---------------------------------------------------------------------------

function handleTranscriptReceived(ctx: HandlerContext): HandlerOutcome {
  const { event, state, profile, extractions } = ctx;
  const id = (suffix: string) => `${event.eventId}:${suffix}`;
  const steps: HandlerStep[] = [];

  const parsed = TranscriptReceivedPayloadSchema.safeParse(event.payload);
  if (!parsed.success) {
    return {
      steps: [
        {
          id: id('validate-fail'),
          label: 'Transcript validation',
          atOffsetSeconds: 0,
          summary: 'Transcript payload failed schema validation. No extraction was attempted.',
          decisions: [
            decision({
              id: id('d-validate-fail'),
              eventId: event.eventId,
              mechanism: 'DETERMINISTIC_RULE',
              objective: 'Confirm the inbound transcript payload conforms to the declared schema before any extraction is attempted.',
              relevantState: state.lifecycleState,
              evidenceRefs: ['event.payload'],
              deterministicFacts: [
                { label: 'Validation errors', value: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') },
              ],
              missingInformation: [],
              permittedActions: ['retain_raw_payload'],
              forbiddenActions: ['attempt_extraction_on_invalid_input'],
              selectedAction: 'retain_raw_payload',
              applicablePolicy: ['A malformed transcript payload never produces a commercial record.'],
              escalationReason: 'Payload could not be validated against the declared schema.',
              authority: 0,
            }),
          ],
          effects: [],
          verifications: [],
        },
      ],
    };
  }

  const { extraction } = parsed.data;

  if (extraction.segments.length < MIN_TRANSCRIPT_SEGMENTS) {
    return {
      steps: [
        {
          id: id('validate-short'),
          label: 'Transcript validation',
          atOffsetSeconds: 0,
          summary: `Transcript carries only ${extraction.segments.length} segment(s), below the minimum of ${MIN_TRANSCRIPT_SEGMENTS} required to attempt extraction.`,
          decisions: [
            decision({
              id: id('d-validate-short'),
              eventId: event.eventId,
              mechanism: 'DETERMINISTIC_RULE',
              objective: 'Confirm the transcript meets minimum length before any extraction is attempted.',
              relevantState: state.lifecycleState,
              evidenceRefs: ['event.payload.extraction.segments'],
              deterministicFacts: [
                { label: 'Segment count', value: String(extraction.segments.length) },
                { label: 'Minimum required', value: String(MIN_TRANSCRIPT_SEGMENTS) },
              ],
              missingInformation: [],
              permittedActions: ['retain_raw_payload'],
              forbiddenActions: ['attempt_extraction_on_insufficient_input'],
              selectedAction: 'retain_raw_payload',
              applicablePolicy: ['Transcript passes schema and minimum length validation before extraction is attempted.'],
              escalationReason: 'Transcript below minimum length.',
              authority: 0,
            }),
          ],
          effects: [],
          verifications: [],
        },
      ],
    };
  }

  steps.push({
    id: id('received'),
    label: 'Transcript received',
    atOffsetSeconds: 0,
    transitionTo: 'EXTRACTING',
    summary: `Transcript ${extraction.sourceArtifactId} accepted, ${extraction.segments.length} segments.`,
    decisions: [
      decision({
        id: id('d-received'),
        eventId: event.eventId,
        mechanism: 'DETERMINISTIC_RULE',
        objective: 'Confirm the transcript passes schema and minimum-length validation before extraction begins.',
        relevantState: 'TRANSCRIPT_RECEIVED',
        evidenceRefs: [`event.payload.extraction.sourceArtifactId=${extraction.sourceArtifactId}`],
        deterministicFacts: [{ label: 'Segments', value: String(extraction.segments.length) }],
        missingInformation: [],
        permittedActions: ['begin_extraction'],
        forbiddenActions: [],
        selectedAction: 'begin_extraction',
        applicablePolicy: ['Extraction begins only once source material passes validation.'],
        authority: 3,
      }),
    ],
    effects: [],
    verifications: [],
  });

  const resolved = extractions.get(extraction.judgmentId);
  if (resolved === undefined || resolved.status !== 'OK') {
    const reason = resolved === undefined ? 'No extraction was resolved for this event.' : resolved.reason;
    steps.push({
      id: id('extract-fail'),
      label: 'Extraction',
      atOffsetSeconds: 1,
      transitionTo: 'NEEDS_HUMAN',
      summary: 'The bounded extraction was unavailable or violated its output contract. Routed to a person with the raw transcript.',
      decisions: [
        decision({
          id: id('d-extract-fail'),
          eventId: event.eventId,
          mechanism: 'DETERMINISTIC_RULE',
          objective: 'Decide what to do when transcript extraction is unavailable or malformed.',
          relevantState: 'EXTRACTING',
          evidenceRefs: ['extraction_provider.result'],
          deterministicFacts: [
            { label: 'Provider outcome', value: resolved?.status ?? 'MISSING' },
            { label: 'Reason', value: reason },
          ],
          missingInformation: ['structured commercial record'],
          permittedActions: ['route_to_human'],
          forbiddenActions: ['coerce_partial_output_into_schema', 'guess_missing_fields'],
          selectedAction: 'route_to_human',
          applicablePolicy: ['An unavailable or contract-violating extraction routes to a person; it is never coerced into a usable value.'],
          escalationReason: reason,
          authority: 2,
        }),
      ],
      effects: [],
      verifications: [],
    });
    return { steps };
  }

  const extracted = resolved.result;
  const claims: Claim[] = extracted.extracted.map((f) => ({
    field: f.field,
    value: f.value,
    source: 'TRANSCRIPT',
    evidenceRefs: f.evidenceRefs,
  }));

  steps.push({
    id: id('extracted'),
    label: 'Extraction',
    atOffsetSeconds: 1,
    transitionTo: 'STRUCTURED_RECORD',
    summary: `Extraction returned ${claims.length} candidate fields at overall confidence ${extracted.overallConfidence.toFixed(2)}.`,
    decisions: [
      decision({
        id: id('d-extracted'),
        eventId: event.eventId,
        mechanism: 'BOUNDED_AI_JUDGMENT',
        objective: 'Map conversational language onto structured commercial-record fields, each citing the passage it rests on.',
        relevantState: 'EXTRACTING',
        evidenceRefs: claims.flatMap((c) => c.evidenceRefs),
        deterministicFacts: claims.map((c) => ({ label: c.field, value: c.value })),
        confidence: extracted.overallConfidence,
        missingInformation: [...extracted.missingFields],
        permittedActions: ['return_extracted_fields'],
        forbiddenActions: ['assert_facts_not_present_in_input', 'convert_unknown_to_plausible_default', 'select_action', 'despatch_anything', 'propose_terms_outside_rate_card'],
        selectedAction: 'return_extracted_fields',
        applicablePolicy: ['Bounded judgment extracts; it never admits its own claims or decides authority.'],
        evaluatorResult: `Declined to infer: ${extracted.declinedToInfer.length > 0 ? extracted.declinedToInfer.join('; ') : 'nothing'}`,
        authority: 1,
        providerId: 'fixture-extraction-provider',
      }),
    ],
    effects: [],
    verifications: [],
    statePatch: { facts: writeClaims(claims), missingInformation: [...extracted.missingFields] },
  });

  const covered = new Set(claims.map((c) => c.field));
  const materialGaps = CP_REQUIRED_FIELDS.filter((f) => !covered.has(f));

  steps.push({
    id: id('gaps'),
    label: 'Required-field coverage',
    atOffsetSeconds: 2,
    transitionTo: 'GAPS_IDENTIFIED',
    summary:
      materialGaps.length > 0
        ? `${materialGaps.length} material field(s) unestablished: ${materialGaps.join(', ')}.`
        : 'Every material field is established. Non-material fields may remain unknown without blocking progress.',
    decisions: [
      decision({
        id: id('d-gaps'),
        eventId: event.eventId,
        mechanism: 'DETERMINISTIC_RULE',
        objective: 'Compute required-field coverage against the declared record schema.',
        relevantState: 'STRUCTURED_RECORD',
        evidenceRefs: [`record.fields=${[...covered].join(',')}`],
        deterministicFacts: [
          { label: 'Required fields', value: CP_REQUIRED_FIELDS.join(', ') },
          { label: 'Material gaps', value: materialGaps.length > 0 ? materialGaps.join(', ') : 'none' },
          { label: 'Still unknown (non-material)', value: extracted.missingFields.join(', ') || 'none' },
        ],
        missingInformation: [...materialGaps, ...extracted.missingFields],
        permittedActions: ['classify_gap_materiality'],
        forbiddenActions: ['default_a_material_field'],
        selectedAction: 'classify_gap_materiality',
        applicablePolicy: [
          'EVIDENCE salesforce-pipeline-exit-criteria: a deal advances only when the current stage’s defined exit criteria are actually met, not on activity alone.',
        ],
        authority: 3,
      }),
    ],
    effects: [],
    verifications: [],
  });

  if (materialGaps.length > 0) {
    steps.push({
      id: id('gap-routing'),
      label: 'Gap routing',
      atOffsetSeconds: 3,
      transitionTo: 'AWAITING_CLARIFICATION',
      summary: `Held for a person to close ${materialGaps.length} material gap(s): ${materialGaps.join(', ')}.`,
      decisions: [
        decision({
          id: id('d-gap-routing'),
          eventId: event.eventId,
          mechanism: 'DETERMINISTIC_RULE',
          objective: 'Route material gaps to a person rather than defaulting them.',
          relevantState: 'GAPS_IDENTIFIED',
          evidenceRefs: [`gaps=${materialGaps.join(',')}`],
          deterministicFacts: [{ label: 'Material gaps', value: materialGaps.join(', ') }],
          missingInformation: materialGaps,
          permittedActions: ['request_clarification'],
          forbiddenActions: ['default_a_material_field', 'proceed_with_material_gap'],
          selectedAction: 'request_clarification',
          applicablePolicy: ['LAB_TARGET cp-lab-unknown-stays-unknown: information the conversation did not establish stays marked unknown; it is never replaced by a plausible default.'],
          authority: 3,
        }),
      ],
      effects: [],
      verifications: [],
    });
    return { steps };
  }

  steps.push({
    id: id('gap-routing'),
    label: 'Gap routing',
    atOffsetSeconds: 3,
    transitionTo: 'CLAIMS_REVIEW',
    summary: 'No remaining gap is material. Proceeding to claims review.',
    decisions: [
      decision({
        id: id('d-gap-routing'),
        eventId: event.eventId,
        mechanism: 'DETERMINISTIC_RULE',
        objective: 'Route to claims review once no remaining gap is material.',
        relevantState: 'GAPS_IDENTIFIED',
        evidenceRefs: [`record.fields=${[...covered].join(',')}`],
        deterministicFacts: [{ label: 'Still unknown (non-material)', value: extracted.missingFields.join(', ') || 'none' }],
        missingInformation: [...extracted.missingFields],
        permittedActions: ['proceed_to_claims_review'],
        forbiddenActions: ['default_a_material_field'],
        selectedAction: 'proceed_to_claims_review',
        applicablePolicy: ['Immaterial gaps stay marked unknown; they do not block progress.'],
        authority: 3,
      }),
    ],
    effects: [],
    verifications: [],
  });

  steps.push(...reviewClaimsAndRouteForApproval(claims, event, profile, id, 4));
  return { steps };
}

// ---------------------------------------------------------------------------
// human.clarification.supplied
// ---------------------------------------------------------------------------

function handleClarificationSupplied(ctx: HandlerContext): HandlerOutcome {
  const { event, state, profile } = ctx;
  const id = (suffix: string) => `${event.eventId}:${suffix}`;
  const parsed = ClarificationPayloadSchema.safeParse(event.payload);

  if (!parsed.success) {
    return {
      steps: [
        {
          id: id('clarify-invalid'),
          label: 'Clarification',
          atOffsetSeconds: 0,
          summary: 'Clarification payload failed validation. No state change.',
          decisions: [
            decision({
              id: id('d-clarify-invalid'),
              eventId: event.eventId,
              mechanism: 'DETERMINISTIC_RULE',
              objective: 'Validate a supplied clarification before recording it.',
              relevantState: state.lifecycleState,
              evidenceRefs: ['event.payload'],
              deterministicFacts: [{ label: 'Validation errors', value: parsed.error.issues.map((i) => i.message).join('; ') }],
              missingInformation: [],
              permittedActions: ['reject_clarification'],
              forbiddenActions: ['apply_unvalidated_clarification'],
              selectedAction: 'reject_clarification',
              applicablePolicy: ['A clarification is recorded only when its payload validates.'],
              authority: 0,
            }),
          ],
          effects: [],
          verifications: [],
        },
      ],
    };
  }

  const supplied = parsed.data;
  const existing = readClaims(state.facts);
  const newClaim: Claim = {
    field: supplied.field,
    value: supplied.value,
    source: 'HUMAN_SUPPLIED',
    evidenceRefs: [],
    suppliedBy: supplied.suppliedBy,
  };
  const claims = [...existing.filter((c) => c.field !== supplied.field), newClaim];

  const id0 = (suffix: string) => `${event.eventId}:${suffix}`;
  const steps: HandlerStep[] = [
    {
      id: id0('clarify'),
      label: 'Clarification supplied',
      atOffsetSeconds: 0,
      transitionTo: 'CLAIMS_REVIEW',
      summary: `${supplied.suppliedBy} supplied "${supplied.field}": ${supplied.value}. Recorded as human-supplied, distinct from transcript-derived fields.`,
      decisions: [
        decision({
          id: id0('d-clarify'),
          eventId: event.eventId,
          mechanism: 'HUMAN_DECISION',
          objective: 'Record a person-supplied fact for a field the transcript did not establish.',
          relevantState: 'AWAITING_CLARIFICATION',
          evidenceRefs: [`event.payload.field=${supplied.field}`],
          deterministicFacts: [
            { label: 'Field', value: supplied.field },
            { label: 'Value', value: supplied.value },
            { label: 'Supplied by', value: supplied.suppliedBy },
          ],
          missingInformation: [],
          permittedActions: ['record_human_supplied_fact'],
          forbiddenActions: ['attribute_to_transcript'],
          selectedAction: 'record_human_supplied_fact',
          applicablePolicy: ['LAB_TARGET cp-lab-source-attribution: facts supplied by a person are recorded with that person as their source, distinguishable from transcript-derived facts.'],
          authority: 2,
        }),
      ],
      effects: [],
      verifications: [],
      statePatch: { facts: writeClaims(claims) },
    },
  ];

  steps.push(...reviewClaimsAndRouteForApproval(claims, event, profile, id, 1));
  return { steps };
}

// ---------------------------------------------------------------------------
// human.decision.recorded
// ---------------------------------------------------------------------------

function handleHumanDecision(ctx: HandlerContext): HandlerOutcome {
  const { event, state, profile } = ctx;
  const id = (suffix: string) => `${event.eventId}:${suffix}`;
  const parsed = HumanDecisionPayloadSchema.safeParse(event.payload);

  if (!parsed.success) {
    return {
      steps: [
        {
          id: id('human-invalid'),
          label: 'Human decision',
          atOffsetSeconds: 0,
          summary: 'Human decision payload failed validation. No state change.',
          decisions: [
            decision({
              id: id('d-human-invalid'),
              eventId: event.eventId,
              mechanism: 'DETERMINISTIC_RULE',
              objective: 'Validate a recorded human decision before applying it.',
              relevantState: state.lifecycleState,
              evidenceRefs: ['event.payload'],
              deterministicFacts: [{ label: 'Validation errors', value: parsed.error.issues.map((i) => i.message).join('; ') }],
              missingInformation: [],
              permittedActions: ['reject_decision'],
              forbiddenActions: ['apply_unvalidated_decision'],
              selectedAction: 'reject_decision',
              applicablePolicy: ['A decision is applied only when its record is complete.'],
              authority: 0,
            }),
          ],
          effects: [],
          verifications: [],
        },
      ],
    };
  }

  const humanDecision = parsed.data;
  const actor = profile.roles.find((r) => r.id === humanDecision.decidedBy);
  const ceiling = numberParam(profile, 'proposalAuthorityCeiling');
  const hasAuthority = (actor?.authorityCeiling ?? 0) >= ceiling;
  const artifact = readArtifact(state.facts);

  if (humanDecision.decision === 'APPROVE') {
    if (artifact === null || !hasAuthority) {
      return {
        steps: [
          {
            id: id('approve-blocked'),
            label: 'Human decision',
            atOffsetSeconds: 0,
            summary:
              artifact === null
                ? 'No proposal artifact exists to approve.'
                : `${humanDecision.decidedBy} does not hold sufficient authority to approve despatch.`,
            decisions: [
              decision({
                id: id('d-approve-blocked'),
                eventId: event.eventId,
                mechanism: 'HUMAN_DECISION',
                objective: 'Verify approval authority and artifact existence before applying an approval.',
                relevantState: state.lifecycleState,
                evidenceRefs: ['event.payload.decidedBy'],
                deterministicFacts: [
                  { label: 'Decided by', value: humanDecision.decidedBy },
                  { label: 'Authority ceiling of this role', value: String(actor?.authorityCeiling ?? 'unknown role') },
                  { label: 'Required authority', value: String(ceiling) },
                ],
                missingInformation: [],
                permittedActions: ['reject_decision'],
                forbiddenActions: ['approve_without_sufficient_authority', 'approve_nonexistent_artifact'],
                selectedAction: 'reject_decision',
                applicablePolicy: ['CLIENT_POLICY kestrel-proposal-authority: no proposal leaves the firm without named human approval from a sufficiently authorised role.'],
                authority: 0,
              }),
            ],
            effects: [],
            verifications: [],
          },
        ],
      };
    }

    const approved = approveProposalArtifact(artifact, humanDecision.decidedBy, event.occurredAt);
    const deliverable = canDeliver(approved);

    return {
      steps: [
        {
          id: id('approve'),
          label: 'Human decision',
          atOffsetSeconds: 0,
          transitionTo: 'APPROVED_SENT',
          summary: `${actor?.name ?? humanDecision.decidedBy} approved proposal ${approved.id} version ${approved.version}. Despatched.`,
          decisions: [
            decision({
              id: id('d-approve'),
              eventId: event.eventId,
              mechanism: 'HUMAN_DECISION',
              objective: 'Record and apply an approval to despatch a specific proposal artifact version.',
              relevantState: 'AWAITING_APPROVAL',
              evidenceRefs: ['event.payload.rationale'],
              deterministicFacts: [
                { label: 'Decided by', value: actor?.name ?? humanDecision.decidedBy },
                { label: 'Authority ceiling of this role', value: String(actor?.authorityCeiling ?? 'unknown') },
                { label: 'Approved artifact version', value: String(approved.approval?.approvedVersion) },
                { label: 'Rationale', value: humanDecision.rationale },
              ],
              missingInformation: [],
              permittedActions: ['approve_and_despatch'],
              forbiddenActions: ['self_approve_as_ai', 'approve_a_different_version_than_shown'],
              selectedAction: 'approve_and_despatch',
              applicablePolicy: ['Approval applies to a specific proposal version, not to the abstract opportunity.'],
              authority: 2,
            }),
          ],
          effects: deliverable
            ? [
                {
                  id: id('effect:despatch'),
                  kind: 'MESSAGE_SEND',
                  description: `Approved proposal package despatched to the buyer for opportunity ${event.entityId}.`,
                  target: event.entityId,
                  idempotencyKey: `${approved.id}:v${approved.version}:despatch`,
                  authority: 3,
                  policyPermits: true,
                  verification: {
                    check: 'Confirm exactly one despatch exists for this artifact version.',
                    expect: 'One despatch recorded at this version.',
                  },
                } satisfies ProposedEffect,
              ]
            : [],
          verifications: [
            {
              id: id('v-approve'),
              eventId: event.eventId,
              check: 'Confirm the approved version matches the current artifact version before despatch.',
              result: deliverable ? 'PASS' : 'FAIL',
              detail: deliverable
                ? `Artifact version ${approved.version} matches the approved version ${approved.approval?.approvedVersion}.`
                : `Artifact is not deliverable: claim status ${approved.claimStatus}, approved version ${approved.approval?.approvedVersion}, current version ${approved.version}.`,
            },
          ],
          statePatch: { facts: writeArtifact(approved) },
        },
      ],
    };
  }

  const target = humanDecision.decision === 'REQUEST_REVISION' ? 'REVISION_REQUESTED' : 'REJECTED';

  return {
    steps: [
      {
        id: id('decision'),
        label: 'Human decision',
        atOffsetSeconds: 0,
        transitionTo: target,
        summary: `${actor?.name ?? humanDecision.decidedBy} recorded: ${humanDecision.decision}.`,
        decisions: [
          decision({
            id: id('d-decision'),
            eventId: event.eventId,
            mechanism: 'HUMAN_DECISION',
            objective: 'Record and apply a review decision made by a person.',
            relevantState: state.lifecycleState,
            evidenceRefs: ['event.payload.rationale'],
            deterministicFacts: [
              { label: 'Decided by', value: actor?.name ?? humanDecision.decidedBy },
              { label: 'Rationale', value: humanDecision.rationale },
            ],
            missingInformation: [],
            permittedActions: ['apply_human_decision'],
            forbiddenActions: ['automate_this_decision'],
            selectedAction: `transition_to_${target}`,
            applicablePolicy: ['Rejecting or requesting revision of a package is a human-only action.'],
            authority: 2,
          }),
        ],
        effects: [],
        verifications: [],
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// proposal.approval.reevaluated — cp-fm-approval-timeout
// ---------------------------------------------------------------------------

/**
 * The last rung of the ladder — where an unassigned draft's overdue condition goes, because
 * there is no assignee to escalate "past". Matches Lead Rescue's `NEXT_OWNER_ESCALATION_
 * AUTHORITY` in value and in spirit: the final escalation point, not a preference.
 */
const FINAL_ESCALATION_AUTHORITY: AuthorityLevel = 4;

/**
 * THE APPROVAL ATTENTION TIMEOUT. Closes `cp-fm-approval-timeout`.
 *
 * This function NEVER sets `transitionTo`, in any branch. That is the executable form of the
 * failure mode's declared `recoveryPath.shape: 'HOLDS_POSITION'` — and it is structural, not
 * a promise: with no `transitionTo` the engine's transition-legality gate is never invoked,
 * so there is no lifecycle move for it to authorise or refuse. A draft sitting unapproved is
 * an OPERATIONAL ATTENTION failure ("nobody has acted"), never a licence for this system to
 * approve, revise, or reject a commercial document on a person's behalf. Escalation here
 * changes WHO IS ASKED. It never changes WHERE THE CASE IS.
 *
 * Four verdicts, because the failure mode declares two causes and the authority ladder has an
 * end:
 *
 *   1. Still inside the window            -> no action. The window is checked, not assumed.
 *   2. Overdue, approver named            -> escalate strictly ABOVE that approver's own
 *                                            ceiling. Never to them: they are the one not
 *                                            responding, and notifying them again is a no-op
 *                                            wearing the costume of an action.
 *   3. Overdue, approver named, at the top -> the chain is exhausted. Recorded as its own
 *                                            condition and NOT notified, because the only
 *                                            person it could reach is the one already asked.
 *                                            An empty escalation is not a quiet success.
 *   4. Overdue, no approver ever named    -> a materially different report: this draft was
 *                                            never assigned, which is the failure mode's own
 *                                            second declared cause. Saying "your reviewer is
 *                                            late" here would name a reviewer who does not
 *                                            exist.
 *
 * The idempotency key is anchored on the entity and the condition, never on the check, so a
 * scheduler that asks hourly escalates once — the ledger in the engine core enforces that,
 * not this handler.
 */
function handleApprovalAttentionTimeout(ctx: HandlerContext): HandlerOutcome {
  const { event, state, profile } = ctx;
  const id = (suffix: string) => `${event.eventId}:${suffix}`;
  const windowHours = numberParam(profile, 'proposalApprovalTimeoutHours');
  const routedAt = state.facts[APPROVAL_ROUTED_AT_FACT];

  const inertStep = (suffix: string, summary: string, facts: readonly { label: string; value: string }[]): HandlerOutcome => ({
    steps: [
      {
        id: id(suffix),
        label: 'Approval attention check',
        atOffsetSeconds: 0,
        summary,
        decisions: [
          decision({
            id: id(`d-${suffix}`),
            eventId: event.eventId,
            mechanism: 'DETERMINISTIC_RULE',
            objective: 'Determine whether the configured proposal approval window has elapsed.',
            relevantState: state.lifecycleState,
            evidenceRefs: [`state.facts.${APPROVAL_ROUTED_AT_FACT}`, 'event.occurredAt'],
            deterministicFacts: [...facts],
            missingInformation: [...state.missingInformation],
            permittedActions: ['remain_awaiting_approval'],
            forbiddenActions: ['synthesize_approval', 'auto_revise', 'transition_lifecycle_state'],
            selectedAction: 'remain_awaiting_approval',
            applicablePolicy: [
              `CLIENT_POLICY kestrel-proposal-approval-window: attention escalation is eligible only once the configured ${windowHours}-hour review window has genuinely elapsed.`,
            ],
            authority: 3,
          }),
        ],
        effects: [],
        verifications: [],
      },
    ],
  });

  // A check that arrives after the reviewer has already acted is a safe no-op, not an error.
  if (state.lifecycleState !== 'AWAITING_APPROVAL') {
    return inertStep('approval-check-moved-on', `Current lifecycle state (${state.lifecycleState}) is not awaiting approval. No action taken.`, [
      { label: 'Lifecycle state', value: state.lifecycleState },
    ]);
  }

  if (routedAt === undefined) {
    return inertStep('approval-check-invalid', 'No recorded approval-routing timestamp on this draft. No action taken.', [
      { label: 'Routed at', value: 'not recorded' },
    ]);
  }

  const elapsedMs = Date.parse(event.occurredAt) - Date.parse(routedAt);
  const elapsedHours = Math.round((elapsedMs / (60 * 60 * 1000)) * 10) / 10;
  const assignmentStatus = state.facts[APPROVAL_STATUS_FACT] ?? 'UNRECORDED';
  const assignedTo = state.facts[APPROVAL_ASSIGNEE_FACT] ?? 'not recorded';

  const timingFacts = [
    { label: 'Routed at', value: routedAt },
    { label: 'Checked at', value: event.occurredAt },
    { label: 'Elapsed', value: `${elapsedHours} hours` },
    { label: 'Configured window', value: `${windowHours} hours` },
    { label: 'Approver assignment', value: assignmentStatus },
    { label: 'Assigned to', value: assignedTo },
  ];

  if (elapsedMs < windowHours * 60 * 60 * 1000) {
    return inertStep(
      'approval-check',
      `Checked ${elapsedHours}h into a ${windowHours}h approval window. Still within policy — no action taken.`,
      timingFacts,
    );
  }

  const ceilingFact = state.facts[APPROVAL_CEILING_FACT];
  const assigneeCeiling = ceilingFact === undefined ? null : asAuthorityLevel(Number(ceilingFact), APPROVAL_CEILING_FACT);
  const nextAuthority = assigneeCeiling === null ? null : nextAuthorityAbove(assigneeCeiling);
  // Where the business SAID an unactioned approval goes, recorded at routing. Preferred over
  // any rank lookup: a firm that has named its next approver has answered the question, and
  // re-deriving it from authority would be substituting our inference for their decision —
  // and would silently disagree the moment the two differ.
  const declaredNextApprover = state.facts[APPROVAL_ESCALATES_TO_FACT];

  // Verdict 3 — a named approver who is already the final escalation point.
  if (declaredNextApprover === undefined && assigneeCeiling !== null && nextAuthority === null) {
    return {
      steps: [
        {
          id: id('approval-chain-exhausted'),
          label: 'Approval attention overdue',
          atOffsetSeconds: 0,
          summary: `No approval decision within the configured ${windowHours}-hour window (checked at ${elapsedHours}h). ${assignedTo} is the final escalation point, so there is no next approver to raise this to — the draft remains AWAITING_APPROVAL and the exhausted chain is recorded rather than escalated to the same person.`,
          decisions: [
            decision({
              id: id('d-approval-chain-exhausted'),
              eventId: event.eventId,
              mechanism: 'DETERMINISTIC_RULE',
              objective: 'Determine who the next approver in the authority chain is, once the approval window has elapsed.',
              relevantState: state.lifecycleState,
              evidenceRefs: [`state.facts.${APPROVAL_CEILING_FACT}`, 'profile.roles'],
              deterministicFacts: [...timingFacts, { label: 'Assignee authority ceiling', value: String(assigneeCeiling) }],
              missingInformation: [...state.missingInformation],
              permittedActions: ['record_escalation_chain_exhausted'],
              forbiddenActions: ['escalate_to_the_assignee', 'synthesize_approval', 'transition_lifecycle_state'],
              selectedAction: 'record_escalation_chain_exhausted',
              applicablePolicy: [
                'CLIENT_POLICY kestrel-proposal-approval-window: escalation is strictly upward, so an approver at the top of the ladder has nobody above them to escalate to.',
              ],
              escalationReason: `${assignedTo} holds the highest configured authority (${assigneeCeiling}); there is no higher authority to escalate to, and re-notifying the unresponsive approver would not be an escalation.`,
              authority: 2,
            }),
          ],
          effects: [],
          verifications: [],
        },
      ],
    };
  }

  // Verdict 2 — escalate strictly past the person already asked. Verdict 4 — nobody was ever
  // asked, so the report is about the assignment, not about a reviewer's timekeeping.
  const assigned = declaredNextApprover !== undefined || (assigneeCeiling !== null && nextAuthority !== null);
  const escalationAuthority = nextAuthority ?? FINAL_ESCALATION_AUTHORITY;
  // A declared next approver is used verbatim. Only an undeclared one is derived from rank.
  const escalationTarget =
    declaredNextApprover ?? resolveEscalationOwner(profile, escalationAuthority).target;
  const escalationBasis =
    declaredNextApprover === undefined
      ? `derived from the assignee's authority ceiling (escalating at authority ${escalationAuthority})`
      : 'named by the declared accountability for this action';

  return {
    steps: [
      {
        id: id('approval-overdue'),
        label: 'Approval attention overdue',
        atOffsetSeconds: 0,
        // Deliberately NO transitionTo — see this section's note. The draft stays exactly
        // where it is; only an operational attention condition is raised.
        summary: assigned
          ? `No approval decision within the configured ${windowHours}-hour window (checked at ${elapsedHours}h). Escalated past ${assignedTo} to ${escalationTarget} — the draft remains AWAITING_APPROVAL, pending an actual human decision.`
          : `No approval decision within the configured ${windowHours}-hour window (checked at ${elapsedHours}h), and this draft was never assigned to a named approver (${assignedTo}). Escalated to ${escalationTarget} as an unassigned draft rather than as a late review — the draft remains AWAITING_APPROVAL.`,
        decisions: [
          decision({
            id: id('d-approval-overdue'),
            eventId: event.eventId,
            mechanism: 'DETERMINISTIC_RULE',
            objective: 'Determine who the next approver in the authority chain is, once the approval window has elapsed.',
            relevantState: state.lifecycleState,
            evidenceRefs: [`state.facts.${APPROVAL_STATUS_FACT}`, 'profile.roles', 'event.occurredAt'],
            deterministicFacts: [
              ...timingFacts,
              { label: 'Assignee authority ceiling', value: assigneeCeiling === null ? 'none — no approver was named' : String(assigneeCeiling) },
              { label: 'Escalating at authority', value: String(escalationAuthority) },
              { label: 'Escalation reaches', value: escalationTarget },
              { label: 'Escalation basis', value: escalationBasis },
            ],
            missingInformation: [...state.missingInformation],
            permittedActions: [assigned ? 'escalate_attention_to_next_approver' : 'escalate_unassigned_draft'],
            forbiddenActions: ['escalate_to_the_assignee', 'synthesize_approval', 'apply_default_disposition', 'transition_lifecycle_state'],
            selectedAction: assigned ? 'escalate_attention_to_next_approver' : 'escalate_unassigned_draft',
            applicablePolicy: [
              `CLIENT_POLICY kestrel-proposal-approval-window: a draft held for approval past the configured ${windowHours}-hour window is escalated to the next approver in the authority chain. The draft itself is never auto-decided.`,
            ],
            escalationReason: assigned
              ? `No approval decision recorded within ${windowHours} hours of routing to ${assignedTo}.`
              : `This draft was never assigned to a named approver at routing (${assignedTo}), and ${windowHours} hours have elapsed. The overdue condition is an unowned draft, not an unresponsive reviewer.`,
            authority: 2,
          }),
        ],
        effects: [
          {
            id: id('effect:notify-approval-overdue'),
            kind: 'NOTIFICATION',
            description: assigned
              ? 'Notify the next approver in the authority chain that a draft has exceeded the configured approval window.'
              : 'Notify the final escalation point that a draft has exceeded the configured approval window without ever having been assigned to a named approver.',
            target: escalationTarget,
            // Anchored on the entity and the condition, never on the check that observed it,
            // so an hourly scheduler escalates once rather than once an hour.
            idempotencyKey: `notify:${event.entityId}:approval-overdue`,
            authority: 3,
            policyPermits: true,
            verification: {
              check: 'Confirm the notification reached an owner other than the assigned approver.',
              expect: 'Notification addressed to an owner above the assigned approver.',
            },
          },
        ],
        verifications: [],
      },
    ],
  };
}

export const CALL_TO_PROPOSAL_HANDLERS: SystemHandlers = {
  systemId: 'call-to-proposal',
  initialState: 'TRANSCRIPT_RECEIVED',
  handlers: {
    'sales.call.transcript.received': handleTranscriptReceived,
    'human.clarification.supplied': handleClarificationSupplied,
    'human.decision.recorded': handleHumanDecision,
    'proposal.approval.reevaluated': handleApprovalAttentionTimeout,
  },
};
