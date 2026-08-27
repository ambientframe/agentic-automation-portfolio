import { z } from 'zod';
import { numberParam, resolveEscalationOwner } from '@/lib/model/profile';
import type { AuthorityLevel } from '@/lib/model/system';
import type { DecisionRecord } from '@/lib/model/runtime';
import type { ResolvedProvision } from '@/lib/ports/resource-provisioner';
import type { EventHandler, HandlerContext, HandlerOutcome, HandlerStep, ProposedEffect, SystemHandlers } from '../types';

/**
 * CLIENT ONBOARDING OPERATOR — operating logic.
 *
 * The problem shape this handler tests is not "gate an action" (Lead Rescue, Dormant
 * Pipeline Recovery) and not "admit a claim into an artifact" (Call-to-Proposal). It is:
 * turn an already-authoritative commercial fact into a coordinated operating environment
 * without losing context, re-asking for what is already known, duplicating resources, or
 * mishandling credentials. Three genuine mechanisms carry that, all local to this file:
 *
 *   PRECEDENCE  — `resolveAuthoritativeValue` decides what a field's known value actually
 *                 is when more than one source asserts it. A signed agreement can never be
 *                 silently outranked; two same-rank sources that disagree stay CONFLICTED
 *                 rather than being resolved by whichever arrived last.
 *   GAP MODEL   — `requirementStatus` classifies every onboarding requirement as KNOWN,
 *                 MISSING, CONFLICTED, or (for sensitive items) REQUIRES_SECURE_COLLECTION.
 *                 Only a genuine MISSING is ever put to the customer.
 *   SCOPE GATE  — `admitOnboardingTask` refuses a task whose implied service differs from
 *                 the signed engagement's service line, the same shape of gate as
 *                 Call-to-Proposal's `admitClaim`, applied to a different kind of claim.
 *
 * Resource provisioning is the one genuinely new side-effect shape this system exercises:
 * see `lib/ports/resource-provisioner.ts` for why it is a third port rather than a
 * deformation of `SideEffectExecutor`.
 *
 * Transition legality, idempotency of ordinary effects, and the authority gate are NOT
 * implemented here. They live in the engine core so this handler cannot bypass them.
 */

// ---------------------------------------------------------------------------
// The cross-system handoff contract
// ---------------------------------------------------------------------------

/**
 * THE SIGNED-ENGAGEMENT HANDOFF. The smallest typed contract that lets onboarding start
 * from authoritative commercial truth instead of an empty form.
 *
 * Deliberately local to this file, not lifted into `lib/model/`. Only one system consumes
 * it today; a shared cross-system envelope designed now would be guessing at a shape a
 * fifth or sixth system might need, which is exactly the premature abstraction this
 * portfolio's own design notes warn against. If a second consuming system appears, this is
 * the natural extraction point.
 *
 * `kind` is pinned to the literal `SIGNED_AGREEMENT` on purpose: a proposal that was only
 * drafted or sent — `APPROVED_SENT` in Call-to-Proposal's own lifecycle — is NOT this. A
 * handoff of any other `kind` (or none) fails validation and authorises nothing. This file
 * does not import anything from Call-to-Proposal's handler; the coupling is a matching
 * shape and matching fixture data (see `data/profiles/kestrel/scenarios/client-onboarding.ts`),
 * not a code dependency.
 */
export const SignedEngagementHandoffSchema = z.strictObject({
  kind: z.literal('SIGNED_AGREEMENT'),
  customerId: z.string().min(1),
  customerName: z.string().min(1),
  engagementId: z.string().min(1),
  /** Reference to the approved commercial artifact this handoff carries forward, e.g. Call-to-Proposal's proposal. */
  commercialArtifact: z.strictObject({
    id: z.string().min(1),
    version: z.number().int().positive(),
    approvedBy: z.string().min(1),
    approvedAt: z.string().min(1),
  }),
  serviceLineId: z.string().min(1),
  scopeSummary: z.string().min(1),
  exclusions: z.array(z.string()),
  sellerCommitments: z.array(z.string()),
  customerCommitments: z.array(z.string()),
  timing: z.string().min(1),
  successCriteria: z.array(z.string()),
  stakeholders: z.array(z.strictObject({ name: z.string().min(1), role: z.string().min(1) })),
  /** Onboarding-requirement id -> value already established during the sale. Never re-asked. */
  knownFacts: z.record(z.string(), z.string()),
  knownUnknowns: z.array(z.string()),
  originatingSystem: z.string().min(1),
});
export type SignedEngagementHandoff = z.infer<typeof SignedEngagementHandoffSchema>;

// ---------------------------------------------------------------------------
// Authoritative-information precedence
// ---------------------------------------------------------------------------

export const INFORMATION_SOURCES = [
  'SIGNED_AGREEMENT',
  'HUMAN_CONFIRMED',
  'CUSTOMER_INTAKE',
  'ACCOUNT_RECORD',
  'SELLER_POLICY',
] as const;
export type InformationSource = (typeof INFORMATION_SOURCES)[number];

/** Higher rank wins outright. Never blindly time-ordered — see `resolveAuthoritativeValue`. */
const SOURCE_RANK: Record<InformationSource, number> = {
  SIGNED_AGREEMENT: 4,
  HUMAN_CONFIRMED: 3,
  CUSTOMER_INTAKE: 2,
  ACCOUNT_RECORD: 1,
  SELLER_POLICY: 0,
};

export interface KnownValue {
  readonly field: string;
  readonly value: string;
  readonly source: InformationSource;
  readonly recordedAt: string;
}

export interface ConflictRecord {
  readonly field: string;
  readonly a: KnownValue;
  readonly b: KnownValue;
}

export type PrecedenceResult = { readonly kind: 'RESOLVED'; readonly value: KnownValue } | { readonly kind: 'CONFLICT'; readonly conflict: ConflictRecord };

/**
 * THE PRECEDENCE GATE. Executable, not narrated.
 *
 * Rules, in order:
 *   1. No existing value: the candidate is simply recorded.
 *   2. Candidate outranks existing: candidate wins, unconditionally. A signed agreement
 *      can never be silently overwritten by a later operational update to the same field.
 *   3. Existing outranks candidate: existing is kept. A lower-authority source updating a
 *      field a higher-authority source already settled does not even reach a conflict —
 *      it is simply not authoritative enough to matter.
 *   4. Same rank, same value: no-op, no conflict.
 *   5. Same rank, different value: CONFLICT. Neither this function nor any AI judgment
 *      resolves it — it is returned as data for a person to see.
 */
export function resolveAuthoritativeValue(existing: KnownValue | undefined, candidate: KnownValue): PrecedenceResult {
  if (existing === undefined) return { kind: 'RESOLVED', value: candidate };

  const existingRank = SOURCE_RANK[existing.source];
  const candidateRank = SOURCE_RANK[candidate.source];

  if (candidateRank > existingRank) return { kind: 'RESOLVED', value: candidate };
  if (candidateRank < existingRank) return { kind: 'RESOLVED', value: existing };
  if (existing.value === candidate.value) return { kind: 'RESOLVED', value: existing };
  return { kind: 'CONFLICT', conflict: { field: existing.field, a: existing, b: candidate } };
}

// ---------------------------------------------------------------------------
// The information-gap model
// ---------------------------------------------------------------------------

export const REQUIREMENT_STATUSES = [
  'KNOWN',
  'MISSING',
  'CONFLICTED',
  'NOT_APPLICABLE',
  'REQUIRES_SECURE_COLLECTION',
  'REQUIRES_HUMAN_CONFIRMATION',
] as const;
export type RequirementStatus = (typeof REQUIREMENT_STATUSES)[number];

export interface RequirementEvaluation {
  readonly requirementId: string;
  readonly status: RequirementStatus;
  readonly known?: KnownValue;
}

/**
 * THE CENTRAL INVARIANT: sensitive requirements are never satisfied by an ordinary known
 * value, no matter how confidently one is on file — that would be the exact leak this
 * system exists to prevent. They always resolve to REQUIRES_SECURE_COLLECTION and are
 * handled through `SecureAccessRequirement`, never through the ordinary gap-request path.
 */
export function requirementStatus(
  requirementId: string,
  sensitive: boolean,
  known: KnownValue | undefined,
  conflicted: boolean,
): RequirementEvaluation {
  if (sensitive) return { requirementId, status: 'REQUIRES_SECURE_COLLECTION' };
  if (conflicted) return { requirementId, status: 'CONFLICTED' };
  if (known !== undefined && known.value.trim().length > 0) return { requirementId, status: 'KNOWN', known };
  return { requirementId, status: 'MISSING' };
}

// ---------------------------------------------------------------------------
// Secure access — reference, never the secret
// ---------------------------------------------------------------------------

export interface SecureAccessRequirement {
  readonly id: string;
  readonly targetSystem: string;
  readonly reason: string;
  /** A least-privilege description, e.g. "read-only". Never "admin" without a named reason. */
  readonly minimumScope: string;
  readonly owner: string;
  readonly status: 'REQUESTED' | 'CONFIRMED' | 'DENIED';
  /** A reference into the customer's own secure channel. Never the secret value itself. */
  readonly channelReference: string;
}

const MINIMUM_SCOPE_BY_REQUIREMENT: Readonly<Record<string, string>> = {
  'cloud-access': 'Read-only, scoped to a security/config-audit role. No write or administrative permissions.',
  'idp-access': 'Read-only directory and user-listing scope. No credential reset or policy-change permissions.',
  'scm-access': 'Read-only repository and commit-history scope on in-scope repositories only. No write access.',
};

// ---------------------------------------------------------------------------
// Secret-leak screening
// ---------------------------------------------------------------------------

const SECRET_PATTERNS: readonly { readonly test: (value: string) => boolean; readonly reason: string }[] = [
  {
    test: (v) => v.includes('TEST_ONLY_SECRET_SENTINEL_DO_NOT_USE'),
    reason: 'matches the reserved test-only secret sentinel',
  },
  { test: (v) => /AKIA[0-9A-Z]{16}/.test(v), reason: 'matches an AWS access key id pattern' },
  { test: (v) => /-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(v), reason: 'matches a PEM private key header' },
];

/** THE SECRET SCREEN. A generic onboarding field cannot become trusted state by holding a secret-shaped value. */
export function screenForSecretLikeContent(value: string): string | null {
  const hit = SECRET_PATTERNS.find((p) => p.test(value));
  return hit === null || hit === undefined ? null : hit.reason;
}

const REDACTED = '[REDACTED — secret-like value withheld from persisted state]';

// ---------------------------------------------------------------------------
// The onboarding task model
// ---------------------------------------------------------------------------

export const TASK_STATUSES = [
  'BLOCKED',
  'READY',
  'AWAITING_CUSTOMER',
  'AWAITING_KESTREL',
  'AWAITING_SECURE_ACCESS',
  'COMPLETE',
  'ESCALATED',
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export interface OnboardingTask {
  readonly id: string;
  readonly description: string;
  readonly owner: string;
  readonly ownerType: 'KESTREL_ROLE' | 'CUSTOMER_CONTACT' | 'SYSTEM_AUTOMATION';
  readonly dependsOn: readonly string[];
  readonly requiresInformation: readonly string[];
  readonly completionCriterion: string;
  readonly milestoneRelated: boolean;
  readonly automationMayExecute: boolean;
  readonly requiresCustomerAction: boolean;
  readonly requiresSecureAccess: boolean;
  /** A service-line id this task's necessity is tied to, when it goes beyond generic onboarding. See `admitOnboardingTask`. */
  readonly impliedServiceLineId?: string;
  readonly status: TaskStatus;
  readonly completionEvidence?: string;
}

/**
 * THE SCOPE GATE. A task whose necessity is tied to a service the signed engagement did
 * not buy is refused — the same shape as Call-to-Proposal's `admitClaim`, applied here to
 * a proposed onboarding obligation instead of a proposal claim. A task with no
 * `impliedServiceLineId` is a standard onboarding necessity and always passes.
 */
export function admitOnboardingTask(
  task: OnboardingTask,
  handoff: SignedEngagementHandoff,
): { readonly admitted: boolean; readonly reason?: string } {
  if (task.impliedServiceLineId === undefined) return { admitted: true };
  if (task.impliedServiceLineId === handoff.serviceLineId) return { admitted: true };
  return {
    admitted: false,
    reason: `Task "${task.id}" implies service "${task.impliedServiceLineId}", which is not the signed engagement's service ("${handoff.serviceLineId}") and is not a standard onboarding necessity. Onboarding may not silently expand the signed scope.`,
  };
}

function computeTaskStatus(task: OnboardingTask, byId: ReadonlyMap<string, OnboardingTask>): TaskStatus {
  if (task.status === 'COMPLETE' || task.status === 'ESCALATED') return task.status;
  const blocked = task.dependsOn.some((depId) => byId.get(depId)?.status !== 'COMPLETE');
  if (blocked) return 'BLOCKED';
  if (task.requiresSecureAccess) return 'AWAITING_SECURE_ACCESS';
  if (task.requiresCustomerAction) return 'AWAITING_CUSTOMER';
  if (task.ownerType === 'SYSTEM_AUTOMATION') return 'READY';
  return 'AWAITING_KESTREL';
}

/** Recomputes every task's status from its dependency graph. Pure; never mutates in place. */
export function recomputeTaskStatuses(tasks: readonly OnboardingTask[]): OnboardingTask[] {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  return tasks.map((t) => ({ ...t, status: computeTaskStatus(t, byId) }));
}

/**
 * Marks the named tasks COMPLETE because their real-world completion criterion was just
 * satisfied elsewhere (a resource converged, an access grant was confirmed, an item was
 * supplied) — then recomputes every OTHER task's readiness against that new fact. Ids not
 * present in `tasks` are ignored rather than erroring, since not every engagement derives
 * every optional task.
 */
export function markTasksComplete(tasks: readonly OnboardingTask[], ids: readonly string[]): OnboardingTask[] {
  const idSet = new Set(ids);
  const marked = tasks.map((t) => (idSet.has(t.id) ? { ...t, status: 'COMPLETE' as const } : t));
  return recomputeTaskStatuses(marked);
}

const MILESTONE_TASK_ID = 'deliver-initial-gap-baseline';

/**
 * Builds the onboarding plan from signed commercial truth plus Kestrel's standard
 * onboarding requirements. `knownById` and `sensitiveIds` are precomputed by the caller so
 * this stays a pure function of already-resolved information, not a second gap computation.
 */
export function deriveOnboardingPlan(
  handoff: SignedEngagementHandoff,
  nonSensitiveRequirementIds: readonly string[],
  sensitiveRequirementIds: readonly string[],
  missingNonSensitiveIds: readonly string[],
): OnboardingTask[] {
  const base: OnboardingTask[] = [
    {
      id: 'provision-workspace',
      description: `Create the engagement workspace and onboarding task list for ${handoff.customerName}.`,
      owner: 'ops-coordinator',
      ownerType: 'KESTREL_ROLE',
      dependsOn: [],
      requiresInformation: [],
      completionCriterion: 'Workspace and task-list resources exist, exactly once, at their business identity.',
      milestoneRelated: false,
      automationMayExecute: true,
      requiresCustomerAction: false,
      requiresSecureAccess: false,
      status: 'READY',
    },
    ...missingNonSensitiveIds.map(
      (id): OnboardingTask => ({
        id: `collect-${id}`,
        description: `Collect "${id}" from ${handoff.customerName}.`,
        owner: 'ops-coordinator',
        ownerType: 'CUSTOMER_CONTACT',
        dependsOn: [],
        requiresInformation: [id],
        completionCriterion: `A non-empty value is on file for "${id}".`,
        milestoneRelated: false,
        automationMayExecute: false,
        requiresCustomerAction: true,
        requiresSecureAccess: false,
        status: 'AWAITING_CUSTOMER',
      }),
    ),
    ...sensitiveRequirementIds.map(
      (id): OnboardingTask => ({
        id: `request-access-${id}`,
        description: `Request least-privilege access for "${id}" through ${handoff.customerName}'s own secure channel.`,
        owner: 'ops-coordinator',
        ownerType: 'CUSTOMER_CONTACT',
        dependsOn: [],
        requiresInformation: [id],
        completionCriterion: 'The granting system confirms the access grant. Never satisfied by a claimed value.',
        milestoneRelated: false,
        automationMayExecute: false,
        requiresCustomerAction: true,
        requiresSecureAccess: true,
        status: 'AWAITING_SECURE_ACCESS',
      }),
    ),
    {
      id: 'confirm-audit-firm-engagement',
      description: 'Confirm which audit firm the customer has engaged for the eventual examination, once the audit window is known.',
      owner: 'client-partner',
      ownerType: 'KESTREL_ROLE',
      dependsOn: missingNonSensitiveIds.includes('audit-window') ? ['collect-audit-window'] : [],
      requiresInformation: ['audit-window'],
      completionCriterion: 'A named audit firm is on file, or the customer has confirmed one is not yet selected.',
      milestoneRelated: false,
      automationMayExecute: false,
      requiresCustomerAction: true,
      requiresSecureAccess: false,
      status: 'AWAITING_CUSTOMER',
    },
    {
      id: MILESTONE_TASK_ID,
      description: 'Deliver a validated initial control/evidence gap baseline for the engaged scope, confirmed against actual infrastructure access rather than documentation alone.',
      owner: 'analyst',
      ownerType: 'KESTREL_ROLE',
      dependsOn: [
        'provision-workspace',
        ...sensitiveRequirementIds.map((id) => `request-access-${id}`),
        ...(nonSensitiveRequirementIds.includes('system-inventory') && missingNonSensitiveIds.includes('system-inventory')
          ? ['collect-system-inventory']
          : []),
      ],
      requiresInformation: [],
      completionCriterion:
        'A written baseline mapping the engaged scope against the target control set is delivered to the named customer owner, with recorded delivery evidence. This is the declared first-value milestone — it is never satisfied merely because every other task is complete.',
      milestoneRelated: true,
      automationMayExecute: false,
      requiresCustomerAction: false,
      requiresSecureAccess: false,
      status: 'BLOCKED',
    },
  ];

  return recomputeTaskStatuses(base);
}

// ---------------------------------------------------------------------------
// Resource identity and desired-state fingerprinting
// ---------------------------------------------------------------------------

export const ONBOARDING_RESOURCE_TYPES = ['workspace', 'task-list'] as const;

export function onboardingResourceKey(engagementId: string, resourceType: string): string {
  return `onboarding:${engagementId}:${resourceType}`;
}

/** Deterministic, no clock and no randomness. Two calls with the same inputs always agree. */
export function desiredResourceFingerprint(engagementId: string, resourceType: string, serviceLineId: string): string {
  return JSON.stringify({ engagementId, resourceType, serviceLineId });
}

// ---------------------------------------------------------------------------
// Serialisation into EngineState.facts
// ---------------------------------------------------------------------------

const HANDOFF_FACT_KEY = 'signedHandoffJson';
const KNOWN_VALUES_FACT_KEY = 'knownValuesJson';
const CONFLICTS_FACT_KEY = 'conflictsJson';
const ACCESS_FACT_KEY = 'secureAccessJson';
const TASKS_FACT_KEY = 'onboardingTasksJson';

function readJson<T>(facts: Readonly<Record<string, string>>, key: string, fallback: T): T {
  const raw = facts[key];
  return raw === undefined ? fallback : (JSON.parse(raw) as T);
}

function readHandoff(facts: Readonly<Record<string, string>>): SignedEngagementHandoff | null {
  return readJson<SignedEngagementHandoff | null>(facts, HANDOFF_FACT_KEY, null);
}
function readKnownValues(facts: Readonly<Record<string, string>>): Record<string, KnownValue> {
  return readJson(facts, KNOWN_VALUES_FACT_KEY, {});
}
function readConflicts(facts: Readonly<Record<string, string>>): ConflictRecord[] {
  return readJson(facts, CONFLICTS_FACT_KEY, []);
}
function readAccess(facts: Readonly<Record<string, string>>): Record<string, SecureAccessRequirement> {
  return readJson(facts, ACCESS_FACT_KEY, {});
}
function readTasks(facts: Readonly<Record<string, string>>): OnboardingTask[] {
  return readJson(facts, TASKS_FACT_KEY, []);
}

// ---------------------------------------------------------------------------
// Payload contracts
// ---------------------------------------------------------------------------

const EngagementSignedPayloadSchema = z.object({ handoff: SignedEngagementHandoffSchema });

const IntakeItemSchema = z.object({ requirementId: z.string().min(1), value: z.string().min(1), suppliedBy: z.string().min(1) });
const CustomerIntakePayloadSchema = z.object({ items: z.array(IntakeItemSchema).min(1) });

const AccessGrantSchema = z.object({ requirementId: z.string().min(1), externalReference: z.string().min(1) });
const ProvisionAttemptSchema = z.object({
  attemptId: z.string().min(1),
  resourceKey: z.string().min(1),
  resourceType: z.string().min(1),
  desiredStateFingerprint: z.string().min(1),
  provider: z.string().min(1),
  description: z.string().min(1),
});
const AccessGrantConfirmedPayloadSchema = z.object({
  confirmedBy: z.string().min(1),
  grants: z.array(AccessGrantSchema).min(1),
  provisionAttempts: z.array(ProvisionAttemptSchema).min(1),
});

const TaskCompletedPayloadSchema = z.object({
  taskId: z.string().min(1),
  completedBy: z.string().min(1),
  evidence: z.string(),
});

const HumanDecisionPayloadSchema = z.object({
  decidedBy: z.string().min(1),
  decision: z.enum(['RESOLVE_AND_CONTINUE', 'ABANDON']),
  rationale: z.string().min(1),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function decision(partial: DecisionRecord): DecisionRecord {
  return partial;
}

/** `signed-sow` is satisfied by the mere existence of a validated handoff; never looked up in `knownFacts`. */
function fastKnownValue(requirementId: string, handoff: SignedEngagementHandoff): KnownValue | undefined {
  if (requirementId === 'signed-sow') {
    return {
      field: requirementId,
      value: `${handoff.commercialArtifact.id} v${handoff.commercialArtifact.version}, approved by ${handoff.commercialArtifact.approvedBy}`,
      source: 'SIGNED_AGREEMENT',
      recordedAt: handoff.commercialArtifact.approvedAt,
    };
  }
  const value = handoff.knownFacts[requirementId];
  if (value === undefined) return undefined;
  return { field: requirementId, value, source: 'SIGNED_AGREEMENT', recordedAt: handoff.commercialArtifact.approvedAt };
}

// ---------------------------------------------------------------------------
// engagement.signed
// ---------------------------------------------------------------------------

function handleEngagementSigned(ctx: HandlerContext): HandlerOutcome {
  const { event, state, profile } = ctx;
  const id = (suffix: string) => `${event.eventId}:${suffix}`;
  const steps: HandlerStep[] = [];

  const parsed = EngagementSignedPayloadSchema.safeParse(event.payload);
  if (!parsed.success) {
    return {
      steps: [
        {
          id: id('validate-fail'),
          label: 'Handoff validation',
          atOffsetSeconds: 0,
          summary:
            'The inbound handoff failed schema validation or does not carry the SIGNED_AGREEMENT authority marker. Onboarding was not authorised to begin.',
          decisions: [
            decision({
              id: id('d-validate-fail'),
              eventId: event.eventId,
              mechanism: 'DETERMINISTIC_RULE',
              objective: 'Confirm the inbound handoff is a well-formed, authoritative signed-agreement package before authorising onboarding.',
              relevantState: state.lifecycleState,
              evidenceRefs: ['event.payload.handoff'],
              deterministicFacts: [
                { label: 'Validation errors', value: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') },
              ],
              missingInformation: [],
              permittedActions: ['reject_handoff'],
              forbiddenActions: ['begin_onboarding_on_unauthoritative_input', 'infer_a_signature_that_was_not_asserted'],
              selectedAction: 'reject_handoff',
              applicablePolicy: [
                'A draft or sent proposal is not sufficient authority to begin client onboarding. Only a handoff explicitly asserting kind=SIGNED_AGREEMENT authorises this transition.',
              ],
              escalationReason: 'Handoff failed validation or is not an authoritative signed-agreement package.',
              authority: 0,
            }),
          ],
          effects: [],
          verifications: [],
        },
      ],
    };
  }

  const { handoff } = parsed.data;

  // --- co-t01: AGREEMENT_SIGNED -> CONTEXT_LOADED ---------------------------
  steps.push({
    id: id('context-loaded'),
    label: 'Context loaded',
    atOffsetSeconds: 0,
    transitionTo: 'CONTEXT_LOADED',
    summary: `Authoritative signed handoff accepted for ${handoff.customerName} (${handoff.engagementId}), referencing ${handoff.commercialArtifact.id} v${handoff.commercialArtifact.version}, approved by ${handoff.commercialArtifact.approvedBy}.`,
    decisions: [
      decision({
        id: id('d-context-loaded'),
        eventId: event.eventId,
        mechanism: 'DETERMINISTIC_RULE',
        objective: 'Read every already-established fact forward from the signed commercial truth before asking the customer anything.',
        relevantState: 'AGREEMENT_SIGNED',
        evidenceRefs: [`handoff.commercialArtifact.id=${handoff.commercialArtifact.id}`, `handoff.originatingSystem=${handoff.originatingSystem}`],
        deterministicFacts: [
          { label: 'Customer', value: handoff.customerName },
          { label: 'Service line', value: handoff.serviceLineId },
          { label: 'Known facts carried forward', value: Object.keys(handoff.knownFacts).join(', ') || 'none' },
          { label: 'Known unknowns declared at handoff', value: handoff.knownUnknowns.join(', ') || 'none' },
        ],
        missingInformation: [],
        permittedActions: ['load_context'],
        forbiddenActions: ['discard_upstream_context', 'treat_onboarding_as_a_blank_form'],
        selectedAction: 'load_context',
        applicablePolicy: ['LAB_TARGET co-lab-never-reask: information already held in the record is never requested from the customer again without a recorded reason.'],
        authority: 3,
      }),
    ],
    effects: [],
    verifications: [],
    statePatch: { facts: { [HANDOFF_FACT_KEY]: JSON.stringify(handoff) } },
  });

  // --- Gap computation (no state change yet) --------------------------------
  const nonSensitiveIds = profile.onboardingRequirements.filter((r) => !r.sensitive).map((r) => r.id);
  const sensitiveIds = profile.onboardingRequirements.filter((r) => r.sensitive).map((r) => r.id);

  const knownValues: Record<string, KnownValue> = {};
  const conflicts: ConflictRecord[] = [];
  for (const reqId of nonSensitiveIds) {
    const candidate = fastKnownValue(reqId, handoff);
    if (candidate === undefined) continue;
    const result = resolveAuthoritativeValue(undefined, candidate);
    if (result.kind === 'RESOLVED') knownValues[reqId] = result.value;
    else conflicts.push(result.conflict);
  }

  const evaluations = nonSensitiveIds.map((reqId) =>
    requirementStatus(reqId, false, knownValues[reqId], conflicts.some((c) => c.field === reqId)),
  );
  const reusedIds = evaluations.filter((e) => e.status === 'KNOWN').map((e) => e.requirementId);
  const missingIds = evaluations.filter((e) => e.status === 'MISSING').map((e) => e.requirementId);
  const conflictedIds = evaluations.filter((e) => e.status === 'CONFLICTED').map((e) => e.requirementId);

  // --- Scope-drift gate over the derived plan (real execution, not narrated) --
  const plan = deriveOnboardingPlan(handoff, nonSensitiveIds, sensitiveIds, missingIds);
  const admissions = plan.map((t) => ({ task: t, result: admitOnboardingTask(t, handoff) }));
  const rejectedTasks = admissions.filter((a) => !a.result.admitted);
  const admittedPlan = admissions.filter((a) => a.result.admitted).map((a) => a.task);

  steps.push({
    id: id('scope-check'),
    label: 'Onboarding plan scope check',
    atOffsetSeconds: 1,
    summary:
      rejectedTasks.length === 0
        ? `Onboarding plan derived: ${admittedPlan.length} tasks, all within the signed engagement's scope.`
        : `${rejectedTasks.length} candidate task(s) implied scope beyond the signed engagement and were refused: ${rejectedTasks.map((r) => r.task.id).join(', ')}.`,
    decisions: [
      decision({
        id: id('d-scope-check'),
        eventId: event.eventId,
        mechanism: 'DETERMINISTIC_RULE',
        objective: 'Refuse any derived onboarding task whose necessity implies a service beyond the signed engagement.',
        relevantState: 'CONTEXT_LOADED',
        evidenceRefs: [`handoff.serviceLineId=${handoff.serviceLineId}`],
        deterministicFacts: admittedPlan.map((t) => ({ label: t.id, value: t.description })),
        missingInformation: [],
        permittedActions: ['admit_in_scope_tasks'],
        forbiddenActions: ['silently_expand_signed_scope', 'let_a_derived_task_become_a_client_commitment_without_authority'],
        selectedAction: 'admit_in_scope_tasks',
        applicablePolicy: ['Onboarding does not expand the contract by accident. A derived requirement cannot silently become an approved client commitment.'],
        authority: 3,
      }),
    ],
    effects: [],
    verifications: [],
    statePatch: { facts: { [TASKS_FACT_KEY]: JSON.stringify(admittedPlan) } },
  });

  // --- co-t02: CONTEXT_LOADED -> GAPS_COMPUTED ------------------------------
  steps.push({
    id: id('gaps-computed'),
    label: 'Gaps computed',
    atOffsetSeconds: 2,
    transitionTo: 'GAPS_COMPUTED',
    summary: `${reusedIds.length} field(s) already known and reused without being re-asked: ${reusedIds.join(', ') || 'none'}. ${missingIds.length} genuinely missing. ${sensitiveIds.length} require secure collection. ${conflictedIds.length} conflicted.`,
    decisions: [
      decision({
        id: id('d-gaps-computed'),
        eventId: event.eventId,
        mechanism: 'DETERMINISTIC_RULE',
        objective: 'Difference the required onboarding set against everything already known from the signed handoff, before composing any request to the customer.',
        relevantState: 'CONTEXT_LOADED',
        evidenceRefs: nonSensitiveIds.map((r) => `requirement.${r}`),
        deterministicFacts: [
          { label: 'Known (reused)', value: reusedIds.join(', ') || 'none' },
          { label: 'Missing (non-sensitive)', value: missingIds.join(', ') || 'none' },
          { label: 'Requires secure collection', value: sensitiveIds.join(', ') || 'none' },
          { label: 'Conflicted', value: conflictedIds.join(', ') || 'none' },
        ],
        missingInformation: missingIds,
        permittedActions: ['route_gaps'],
        forbiddenActions: ['request_a_known_field', 'silently_pick_a_value_for_a_conflicted_field'],
        selectedAction: 'route_gaps',
        applicablePolicy: [
          'LAB_TARGET co-lab-never-reask: information already held in the record is never requested from the customer again without a recorded reason.',
          'LAB_TARGET co-lab-missing-vs-contradictory: missing information and contradictory information are distinct conditions with distinct paths.',
        ],
        authority: 3,
      }),
    ],
    effects: [],
    verifications: [],
    statePatch: { facts: { [KNOWN_VALUES_FACT_KEY]: JSON.stringify(knownValues), [CONFLICTS_FACT_KEY]: JSON.stringify(conflicts) } },
  });

  // --- Gap routing: contradiction > missing-info > access ------------------
  if (conflictedIds.length > 0) {
    steps.push({
      id: id('gap-routing'),
      label: 'Gap routing',
      atOffsetSeconds: 3,
      transitionTo: 'NEEDS_HUMAN',
      summary: `Conflicting information on ${conflictedIds.join(', ')}. A person must resolve this before onboarding proceeds; it is never resolved automatically.`,
      decisions: [
        decision({
          id: id('d-gap-routing'),
          eventId: event.eventId,
          mechanism: 'DETERMINISTIC_RULE',
          objective: 'Route a genuine contradiction to a person rather than resolving it by precedence, recency, or inference.',
          relevantState: 'GAPS_COMPUTED',
          evidenceRefs: conflictedIds.map((f) => `conflict.${f}`),
          deterministicFacts: conflictedIds.map((f) => ({ label: f, value: 'CONFLICTED — see recorded conflict' })),
          missingInformation: [],
          permittedActions: ['route_to_human'],
          forbiddenActions: ['resolve_contradiction_automatically', 'let_ai_pick_a_side'],
          selectedAction: 'route_to_human',
          applicablePolicy: ['AI inference cannot resolve an authoritative contradiction by itself.'],
          escalationReason: `Conflicting information on: ${conflictedIds.join(', ')}.`,
          authority: 2,
        }),
      ],
      effects: [],
      verifications: [],
    });
    return { steps };
  }

  if (missingIds.length > 0) {
    steps.push({
      id: id('gap-routing'),
      label: 'Gap routing',
      atOffsetSeconds: 3,
      transitionTo: 'AWAITING_CUSTOMER_INPUT',
      summary: `Requesting only the genuinely missing item(s): ${missingIds.join(', ')}. ${reusedIds.length} already-known item(s) are not requested.`,
      decisions: [
        decision({
          id: id('d-gap-routing'),
          eventId: event.eventId,
          mechanism: 'DETERMINISTIC_RULE',
          objective: 'Request only items that are genuinely missing, never an item the signed handoff already established.',
          relevantState: 'GAPS_COMPUTED',
          evidenceRefs: missingIds.map((f) => `requirement.${f}`),
          deterministicFacts: [
            { label: 'Requested', value: missingIds.join(', ') },
            { label: 'Not requested (already known)', value: reusedIds.join(', ') || 'none' },
          ],
          missingInformation: missingIds,
          permittedActions: ['request_missing_items'],
          forbiddenActions: ['request_an_already_known_item'],
          selectedAction: 'request_missing_items',
          applicablePolicy: ['co-fm-repeat-question: the customer is never asked for something they already supplied.'],
          authority: 3,
        }),
      ],
      effects: [],
      verifications: [],
    });
    return { steps };
  }

  // No non-sensitive gap remains. Route straight to secure-access collection.
  steps.push(...routeToAccessRequested(handoff, sensitiveIds, event, id, 3));
  return { steps };
}

function routeToAccessRequested(
  handoff: SignedEngagementHandoff,
  sensitiveIds: readonly string[],
  event: { eventId: string },
  id: (suffix: string) => string,
  atOffsetSeconds: number,
): HandlerStep[] {
  const access: Record<string, SecureAccessRequirement> = {};
  for (const reqId of sensitiveIds) {
    access[reqId] = {
      id: reqId,
      targetSystem: reqId,
      reason: `Required to evidence the ${handoff.serviceLineId} engagement for ${handoff.customerName}.`,
      minimumScope: MINIMUM_SCOPE_BY_REQUIREMENT[reqId] ?? 'Least privilege appropriate to the requirement. Exact scope is CLIENT_POLICY.',
      owner: 'ops-coordinator',
      status: 'REQUESTED',
      channelReference: `secure-channel:${handoff.engagementId}:${reqId}`,
    };
  }

  return [
    {
      id: id('access-requested'),
      label: 'Access requested',
      atOffsetSeconds,
      transitionTo: 'ACCESS_REQUESTED',
      summary:
        sensitiveIds.length > 0
          ? `Requested least-privilege access for: ${sensitiveIds.join(', ')}, through ${handoff.customerName}'s own secure channel. No credential material is captured here.`
          : 'No sensitive access is required for this engagement.',
      decisions: [
        decision({
          id: id('d-access-requested'),
          eventId: event.eventId,
          mechanism: 'DETERMINISTIC_RULE',
          objective: 'Request every sensitive requirement through the secure channel, as a reference and requirement rather than as a captured value.',
          relevantState: 'GAPS_COMPUTED',
          evidenceRefs: sensitiveIds.map((r) => `requirement.${r}`),
          deterministicFacts: Object.values(access).map((a) => ({ label: a.id, value: `${a.minimumScope} — owner ${a.owner}` })),
          missingInformation: [],
          permittedActions: ['request_secure_access'],
          forbiddenActions: ['persist_a_credential_value', 'request_broader_than_least_privilege'],
          selectedAction: 'request_secure_access',
          applicablePolicy: [
            'EVIDENCE co-std-secrets: secrets must not be hardcoded or scattered through configuration, must be held under least privilege, and must have defined creation, rotation, revocation, and expiry.',
            'EVIDENCE co-std-least-privilege: access is scoped to the minimum necessary for the role’s function, never granted broadly by default.',
            'CLIENT_POLICY kestrel-credential-handling: access credentials are requested through the client’s own secure channel and never captured in workflow state, tickets, email, or logs.',
          ],
          authority: 3,
        }),
      ],
      effects: [],
      verifications: [],
      statePatch: { facts: { [ACCESS_FACT_KEY]: JSON.stringify(access) } },
    },
  ];
}

// ---------------------------------------------------------------------------
// customer.intake.supplied
// ---------------------------------------------------------------------------

function handleCustomerIntakeSupplied(ctx: HandlerContext): HandlerOutcome {
  const { event, state, profile } = ctx;
  const id = (suffix: string) => `${event.eventId}:${suffix}`;

  const parsed = CustomerIntakePayloadSchema.safeParse(event.payload);
  if (!parsed.success) {
    return {
      steps: [
        {
          id: id('intake-invalid'),
          label: 'Customer intake',
          atOffsetSeconds: 0,
          summary: 'Intake payload failed validation. No state change.',
          decisions: [
            decision({
              id: id('d-intake-invalid'),
              eventId: event.eventId,
              mechanism: 'DETERMINISTIC_RULE',
              objective: 'Validate supplied intake items before recording any of them.',
              relevantState: state.lifecycleState,
              evidenceRefs: ['event.payload'],
              deterministicFacts: [{ label: 'Validation errors', value: parsed.error.issues.map((i) => i.message).join('; ') }],
              missingInformation: [],
              permittedActions: ['reject_intake'],
              forbiddenActions: ['apply_unvalidated_intake'],
              selectedAction: 'reject_intake',
              applicablePolicy: ['Intake is recorded only when its payload validates.'],
              authority: 0,
            }),
          ],
          effects: [],
          verifications: [],
        },
      ],
    };
  }

  const handoff = readHandoff(state.facts);
  if (handoff === null) {
    return {
      steps: [
        {
          id: id('no-handoff'),
          label: 'Customer intake',
          atOffsetSeconds: 0,
          summary: 'No signed handoff is on file for this engagement. Intake cannot be evaluated against requirements that were never loaded.',
          decisions: [
            decision({
              id: id('d-no-handoff'),
              eventId: event.eventId,
              mechanism: 'DETERMINISTIC_RULE',
              objective: 'Refuse to process intake without an authoritative signed handoff already on file.',
              relevantState: state.lifecycleState,
              evidenceRefs: [],
              deterministicFacts: [],
              missingInformation: [],
              permittedActions: ['reject_intake'],
              forbiddenActions: ['record_intake_without_a_signed_handoff'],
              selectedAction: 'reject_intake',
              applicablePolicy: ['Onboarding state without a signed handoff has no authoritative context to reconcile against.'],
              authority: 0,
            }),
          ],
          effects: [],
          verifications: [],
        },
      ],
    };
  }

  const existingKnown = readKnownValues(state.facts);
  const existingConflicts = readConflicts(state.facts);
  const nextKnown: Record<string, KnownValue> = { ...existingKnown };
  const newConflicts: ConflictRecord[] = [...existingConflicts];
  const leaked: { requirementId: string; reason: string }[] = [];
  const accepted: string[] = [];

  for (const item of parsed.data.items) {
    const secretReason = screenForSecretLikeContent(item.value);
    if (secretReason !== null) {
      leaked.push({ requirementId: item.requirementId, reason: secretReason });
      continue;
    }
    const candidate: KnownValue = {
      field: item.requirementId,
      value: item.value,
      source: 'CUSTOMER_INTAKE',
      recordedAt: event.occurredAt,
    };
    const result = resolveAuthoritativeValue(nextKnown[item.requirementId], candidate);
    if (result.kind === 'RESOLVED') {
      nextKnown[item.requirementId] = result.value;
      accepted.push(item.requirementId);
    } else {
      newConflicts.push(result.conflict);
    }
  }

  const steps: HandlerStep[] = [
    {
      id: id('intake-received'),
      label: 'Customer intake received',
      atOffsetSeconds: 0,
      summary:
        leaked.length === 0
          ? `${accepted.length} item(s) recorded: ${accepted.join(', ') || 'none'}.`
          : `${accepted.length} item(s) recorded. ${leaked.length} item(s) were withheld from ordinary state — see the secret-handling decision below.`,
      decisions: [
        decision({
          id: id('d-intake-received'),
          eventId: event.eventId,
          mechanism: 'DETERMINISTIC_RULE',
          objective: 'Screen every supplied value for secret-like content, then resolve it against precedence, before recording it as ordinary onboarding state.',
          relevantState: state.lifecycleState,
          evidenceRefs: parsed.data.items.map((i) => `item.${i.requirementId}`),
          deterministicFacts: [
            { label: 'Accepted', value: accepted.join(', ') || 'none' },
            { label: 'Withheld (secret-like)', value: leaked.map((l) => l.requirementId).join(', ') || 'none' },
          ],
          missingInformation: [],
          permittedActions: ['record_supplied_items'],
          forbiddenActions: ['persist_secret_like_value_as_ordinary_field', 'echo_a_withheld_value_in_summary_text'],
          selectedAction: 'record_supplied_items',
          applicablePolicy: ['EVIDENCE co-std-secrets: a generic onboarding field cannot become trusted state by holding a secret-shaped value.'],
          authority: 3,
        }),
      ],
      effects: [],
      verifications: [],
      statePatch: {
        facts: {
          [KNOWN_VALUES_FACT_KEY]: JSON.stringify(nextKnown),
          [CONFLICTS_FACT_KEY]: JSON.stringify(newConflicts),
          // Each accepted item's completion criterion ("a value is on file") is genuinely
          // satisfied here, so the matching collect-* task is marked complete now rather
          // than left BLOCKED forever — the same pattern `handleAccessGrantConfirmed` uses
          // for the resource and access-request tasks once THEIR criteria are met for real.
          [TASKS_FACT_KEY]: JSON.stringify(markTasksComplete(readTasks(state.facts), accepted.map((r) => `collect-${r}`))),
        },
      },
    },
  ];

  if (leaked.length > 0) {
    steps.push({
      id: id('secret-handling'),
      label: 'Secret-like content intercepted',
      atOffsetSeconds: 1,
      summary: `${leaked.length} supplied value(s) matched a secret-like pattern and were refused as ordinary onboarding fields: ${leaked.map((l) => l.requirementId).join(', ')}. ${REDACTED}`,
      decisions: [
        decision({
          id: id('d-secret-handling'),
          eventId: event.eventId,
          mechanism: 'DETERMINISTIC_RULE',
          objective: 'Ensure a secret-shaped value submitted through a generic field is never persisted as trusted canonical state.',
          relevantState: state.lifecycleState,
          evidenceRefs: leaked.map((l) => `item.${l.requirementId}`),
          deterministicFacts: leaked.map((l) => ({ label: l.requirementId, value: `${REDACTED} (${l.reason})` })),
          missingInformation: leaked.map((l) => l.requirementId),
          permittedActions: ['route_to_secure_handling'],
          forbiddenActions: ['persist_raw_secret_value', 'render_raw_secret_value'],
          selectedAction: 'route_to_secure_handling',
          applicablePolicy: [
            'co-fm-credential-leak: client credentials submitted through an ordinary field are never captured into workflow state.',
          ],
          escalationReason: `Secret-like value submitted for: ${leaked.map((l) => l.requirementId).join(', ')}.`,
          authority: 4,
        }),
      ],
      effects: [],
      verifications: [],
    });
  }

  // --- Recompute gaps and route --------------------------------------------
  const nonSensitiveIds = profile.onboardingRequirements.filter((r) => !r.sensitive).map((r) => r.id);
  const sensitiveIds = profile.onboardingRequirements.filter((r) => r.sensitive).map((r) => r.id);
  const evaluations = nonSensitiveIds.map((reqId) =>
    requirementStatus(reqId, false, nextKnown[reqId], newConflicts.some((c) => c.field === reqId)),
  );
  const stillMissing = evaluations.filter((e) => e.status === 'MISSING').map((e) => e.requirementId);
  const stillConflicted = evaluations.filter((e) => e.status === 'CONFLICTED').map((e) => e.requirementId);

  steps.push({
    id: id('recompute'),
    label: 'Gaps recomputed',
    atOffsetSeconds: 2,
    transitionTo: 'GAPS_COMPUTED',
    summary: `Gap set recomputed rather than assumed closed. ${stillMissing.length} still missing, ${stillConflicted.length} conflicted.`,
    decisions: [
      decision({
        id: id('d-recompute'),
        eventId: event.eventId,
        mechanism: 'DETERMINISTIC_RULE',
        objective: 'Recompute the gap set from the updated known-values record rather than assuming the supplied items closed it.',
        relevantState: state.lifecycleState,
        evidenceRefs: nonSensitiveIds.map((r) => `requirement.${r}`),
        deterministicFacts: [
          { label: 'Still missing', value: stillMissing.join(', ') || 'none' },
          { label: 'Conflicted', value: stillConflicted.join(', ') || 'none' },
        ],
        missingInformation: stillMissing,
        permittedActions: ['recompute_gaps'],
        forbiddenActions: ['assume_gap_closed_without_recomputing'],
        selectedAction: 'recompute_gaps',
        applicablePolicy: ['A supplied item is recorded and the gap set is recomputed, never assumed closed.'],
        authority: 3,
      }),
    ],
    effects: [],
    verifications: [],
  });

  if (stillConflicted.length > 0) {
    steps.push({
      id: id('route-conflicted'),
      label: 'Gap routing',
      atOffsetSeconds: 3,
      transitionTo: 'NEEDS_HUMAN',
      summary: `Conflicting information remains on ${stillConflicted.join(', ')}.`,
      decisions: [
        decision({
          id: id('d-route-conflicted'),
          eventId: event.eventId,
          mechanism: 'DETERMINISTIC_RULE',
          objective: 'Route unresolved contradiction to a person.',
          relevantState: 'GAPS_COMPUTED',
          evidenceRefs: stillConflicted.map((f) => `conflict.${f}`),
          deterministicFacts: [],
          missingInformation: [],
          permittedActions: ['route_to_human'],
          forbiddenActions: ['resolve_contradiction_automatically'],
          selectedAction: 'route_to_human',
          applicablePolicy: ['AI inference cannot resolve an authoritative contradiction by itself.'],
          escalationReason: `Conflicting information on: ${stillConflicted.join(', ')}.`,
          authority: 2,
        }),
      ],
      effects: [],
      verifications: [],
    });
    return { steps };
  }

  if (stillMissing.length > 0) {
    steps.push({
      id: id('route-missing'),
      label: 'Gap routing',
      atOffsetSeconds: 3,
      transitionTo: 'AWAITING_CUSTOMER_INPUT',
      summary: `Still requesting: ${stillMissing.join(', ')}.`,
      decisions: [
        decision({
          id: id('d-route-missing'),
          eventId: event.eventId,
          mechanism: 'DETERMINISTIC_RULE',
          objective: 'Continue requesting only genuinely outstanding items.',
          relevantState: 'GAPS_COMPUTED',
          evidenceRefs: stillMissing.map((f) => `requirement.${f}`),
          deterministicFacts: [],
          missingInformation: stillMissing,
          permittedActions: ['request_missing_items'],
          forbiddenActions: ['request_an_already_known_item'],
          selectedAction: 'request_missing_items',
          applicablePolicy: ['co-fm-repeat-question: the customer is never asked for something they already supplied.'],
          authority: 3,
        }),
      ],
      effects: [],
      verifications: [],
    });
    return { steps };
  }

  steps.push(...routeToAccessRequested(handoff, sensitiveIds, event, id, 3));
  return { steps };
}

// ---------------------------------------------------------------------------
// access.grant.confirmed
// ---------------------------------------------------------------------------

interface ProvisionClassification {
  readonly kind: 'CONVERGED' | 'CONFLICTED' | 'UNRESOLVED';
  readonly detail: string;
}

/** Turns a resolved provision outcome into the three-way distinction the handler routes on. */
function classifyProvisionOutcome(resolved: ResolvedProvision | undefined): ProvisionClassification {
  if (resolved === undefined) return { kind: 'UNRESOLVED', detail: 'No provision outcome was resolved for this attempt.' };
  if (resolved.status !== 'OK') return { kind: 'UNRESOLVED', detail: resolved.reason };

  const outcome = resolved.result;
  switch (outcome.kind) {
    case 'CREATED':
      return { kind: 'CONVERGED', detail: 'CREATED' };
    case 'ALREADY_EXISTS_MATCHING':
      return { kind: 'CONVERGED', detail: 'ALREADY_EXISTS_MATCHING' };
    case 'EXISTS_DIFFERENT':
      return { kind: 'CONFLICTED', detail: outcome.reason };
    case 'FAILED_BEFORE_EFFECT':
      return { kind: 'UNRESOLVED', detail: outcome.reason };
    case 'OUTCOME_UNKNOWN':
      return { kind: 'UNRESOLVED', detail: outcome.reason };
  }
}

function handleAccessGrantConfirmed(ctx: HandlerContext): HandlerOutcome {
  const { event, state, provisions } = ctx;
  const id = (suffix: string) => `${event.eventId}:${suffix}`;

  const parsed = AccessGrantConfirmedPayloadSchema.safeParse(event.payload);
  if (!parsed.success) {
    return {
      steps: [
        {
          id: id('grant-invalid'),
          label: 'Access confirmation',
          atOffsetSeconds: 0,
          summary: 'Access confirmation payload failed validation. No state change.',
          decisions: [
            decision({
              id: id('d-grant-invalid'),
              eventId: event.eventId,
              mechanism: 'DETERMINISTIC_RULE',
              objective: 'Validate the access confirmation before applying it.',
              relevantState: state.lifecycleState,
              evidenceRefs: ['event.payload'],
              deterministicFacts: [{ label: 'Validation errors', value: parsed.error.issues.map((i) => i.message).join('; ') }],
              missingInformation: [],
              permittedActions: ['reject_confirmation'],
              forbiddenActions: ['apply_unvalidated_confirmation'],
              selectedAction: 'reject_confirmation',
              applicablePolicy: ['Access is confirmed only when the grant record validates.'],
              authority: 0,
            }),
          ],
          effects: [],
          verifications: [],
        },
      ],
    };
  }

  const { confirmedBy, grants, provisionAttempts } = parsed.data;
  const access = readAccess(state.facts);
  const nextAccess: Record<string, SecureAccessRequirement> = { ...access };
  // `externalReference` is a reference INTO the granting system (e.g. an IAM role arn or
  // an app-integration id), never the credential itself — but the payload only requires a
  // non-empty string, so nothing upstream of this screen stops a secret-shaped value from
  // arriving here instead of a genuine reference. This is the same gate
  // `handleCustomerIntakeSupplied` already runs on `item.value`; a generic access-grant
  // field cannot become trusted canonical state by holding a secret-shaped value either.
  const leakedGrants: { requirementId: string; reason: string }[] = [];
  const confirmedGrants: typeof grants = [];
  for (const g of grants) {
    const secretReason = screenForSecretLikeContent(g.externalReference);
    if (secretReason !== null) {
      leakedGrants.push({ requirementId: g.requirementId, reason: secretReason });
      continue;
    }
    confirmedGrants.push(g);
    const existing = nextAccess[g.requirementId];
    if (existing !== undefined) {
      nextAccess[g.requirementId] = { ...existing, status: 'CONFIRMED', channelReference: g.externalReference };
    }
  }

  const steps: HandlerStep[] = [
    {
      id: id('access-confirmed'),
      label: 'Access confirmed',
      atOffsetSeconds: 0,
      transitionTo: 'PROVISIONING',
      summary:
        leakedGrants.length === 0
          ? `${grants.length} access grant(s) confirmed by the granting system(s), read from that system rather than asserted by the requester.`
          : `${confirmedGrants.length} access grant(s) confirmed. ${leakedGrants.length} carried a secret-shaped reference and were withheld — see the secret-handling decision below.`,
      decisions: [
        decision({
          id: id('d-access-confirmed'),
          eventId: event.eventId,
          mechanism: 'DETERMINISTIC_RULE',
          objective: 'Confirm access from the granting system’s own record before beginning resource provisioning.',
          relevantState: 'ACCESS_REQUESTED',
          evidenceRefs: [`event.payload.confirmedBy=${confirmedBy}`],
          deterministicFacts: confirmedGrants.map((g) => ({ label: g.requirementId, value: `confirmed via ${g.externalReference}` })),
          missingInformation: [],
          permittedActions: ['begin_provisioning'],
          forbiddenActions: [
            'trust_a_customer_claim_of_access_without_granting_system_confirmation',
            'persist_a_secret_shaped_reference_as_a_channel_reference',
          ],
          selectedAction: 'begin_provisioning',
          applicablePolicy: ['Confirmation is read from the granting system, never asserted by the requester.'],
          authority: 3,
        }),
      ],
      effects: [],
      verifications: [],
      statePatch: { facts: { [ACCESS_FACT_KEY]: JSON.stringify(nextAccess) } },
    },
  ];

  if (leakedGrants.length > 0) {
    steps.push({
      id: id('access-secret-handling'),
      label: 'Secret-like content intercepted',
      atOffsetSeconds: 1,
      summary: `${leakedGrants.length} access-grant reference(s) matched a secret-like pattern and were refused as an ordinary channel reference: ${leakedGrants.map((l) => l.requirementId).join(', ')}. ${REDACTED}`,
      decisions: [
        decision({
          id: id('d-access-secret-handling'),
          eventId: event.eventId,
          mechanism: 'DETERMINISTIC_RULE',
          objective: 'Ensure a secret-shaped value submitted as a granting-system reference is never persisted as a channel reference.',
          relevantState: 'ACCESS_REQUESTED',
          evidenceRefs: leakedGrants.map((l) => `grant.${l.requirementId}`),
          deterministicFacts: leakedGrants.map((l) => ({ label: l.requirementId, value: `${REDACTED} (${l.reason})` })),
          missingInformation: leakedGrants.map((l) => l.requirementId),
          permittedActions: ['route_to_secure_handling'],
          forbiddenActions: ['persist_raw_secret_value', 'render_raw_secret_value', 'confirm_access_on_a_secret_shaped_reference'],
          selectedAction: 'route_to_secure_handling',
          applicablePolicy: [
            'co-fm-credential-leak: client credentials submitted through an ordinary field are never captured into workflow state.',
          ],
          escalationReason: `Secret-like value submitted as a channel reference for: ${leakedGrants.map((l) => l.requirementId).join(', ')}.`,
          authority: 4,
        }),
      ],
      effects: [],
      verifications: [],
    });
  }

  // --- Propose one RESOURCE_PROVISION effect per declared attempt -----------
  const effects: ProposedEffect[] = provisionAttempts.map((a) => ({
    id: id(`effect:provision:${a.resourceType}`),
    kind: 'RESOURCE_PROVISION',
    description: a.description,
    target: a.resourceKey,
    idempotencyKey: a.resourceKey,
    authority: 3,
    policyPermits: true,
    execution: { kind: 'PROVISION', attemptId: a.attemptId, resourceKey: a.resourceKey, provider: a.provider },
  }));

  const outcomes = provisionAttempts.map((a) => ({ attempt: a, classification: classifyProvisionOutcome(provisions.get(a.attemptId)) }));
  const conflicted = outcomes.filter((o) => o.classification.kind === 'CONFLICTED');
  const unresolved = outcomes.filter((o) => o.classification.kind === 'UNRESOLVED');
  const converged = outcomes.filter((o) => o.classification.kind === 'CONVERGED');

  steps.push({
    id: id('provisioning'),
    label: 'Resource provisioning',
    atOffsetSeconds: 1,
    summary: `${converged.length}/${provisionAttempts.length} resource(s) converged (created or already matching). ${conflicted.length} conflict(s). ${unresolved.length} unresolved.`,
    decisions: [
      decision({
        id: id('d-provisioning'),
        eventId: event.eventId,
        mechanism: 'DETERMINISTIC_RULE',
        objective: 'Ensure every required delivery resource exists exactly once, keyed by business identity rather than by execution count.',
        relevantState: 'PROVISIONING',
        evidenceRefs: provisionAttempts.map((a) => `resource.${a.resourceKey}`),
        deterministicFacts: outcomes.map((o) => ({ label: o.attempt.resourceKey, value: o.classification.detail })),
        missingInformation: [],
        permittedActions: ['reconcile_resources'],
        forbiddenActions: ['create_a_second_resource_for_an_already_matching_identity', 'overwrite_a_conflicting_existing_resource'],
        selectedAction: 'reconcile_resources',
        applicablePolicy: [
          'EVIDENCE co-std-idempotent-creation: operations that create resources must be idempotent, keyed on a caller-supplied identity recorded before the operation.',
          'LAB_TARGET: zero duplicate logical onboarding environments under replay.',
        ],
        authority: 3,
      }),
    ],
    effects,
    verifications: [],
  });

  if (conflicted.length > 0 || unresolved.length > 0) {
    steps.push({
      id: id('provisioning-blocked'),
      label: 'Provisioning outcome',
      atOffsetSeconds: 2,
      transitionTo: 'NEEDS_HUMAN',
      summary:
        conflicted.length > 0
          ? `Existing resource state conflicts with what this run intends for: ${conflicted.map((o) => o.attempt.resourceKey).join(', ')}. Not overwritten automatically.`
          : `Provisioning outcome could not be confirmed for: ${unresolved.map((o) => o.attempt.resourceKey).join(', ')}.`,
      decisions: [
        decision({
          id: id('d-provisioning-blocked'),
          eventId: event.eventId,
          mechanism: 'DETERMINISTIC_RULE',
          objective: 'Route an unreconciled or conflicting resource to a person rather than guessing which state is correct.',
          relevantState: 'PROVISIONING',
          evidenceRefs: [...conflicted, ...unresolved].map((o) => `resource.${o.attempt.resourceKey}`),
          deterministicFacts: [],
          missingInformation: [],
          permittedActions: ['route_to_human'],
          forbiddenActions: ['blindly_overwrite_existing_resource', 'assume_unresolved_outcome_succeeded'],
          selectedAction: 'route_to_human',
          applicablePolicy: ['An existing resource that conflicts with desired state is never overwritten because an automation believes its own fixture is authoritative.'],
          escalationReason: 'Partial or conflicting provisioning outcome.',
          authority: 2,
        }),
      ],
      effects: [],
      verifications: [],
    });
    return { steps };
  }

  // --- co-t10: PROVISIONING -> TASKS_ASSIGNED -------------------------------
  // Both the resource-creation task and each just-confirmed access-request task have
  // genuinely satisfied their completion criterion at this point (converged resources,
  // grants read back from the granting system) — mark them complete for real rather than
  // leaving `deliver-initial-gap-baseline` permanently blocked on tasks nothing ever closes.
  const tasks = markTasksComplete(readTasks(state.facts), [
    'provision-workspace',
    ...confirmedGrants.map((g) => `request-access-${g.requirementId}`),
  ]);
  const unowned = tasks.filter((t) => t.owner.trim().length === 0);

  steps.push({
    id: id('tasks-assigned'),
    label: 'Tasks assigned',
    atOffsetSeconds: 3,
    transitionTo: 'TASKS_ASSIGNED',
    summary: `All ${provisionAttempts.length} resource(s) converged. ${tasks.length} onboarding tasks confirmed owned; task readiness recomputed against the provisioned resources.`,
    decisions: [
      decision({
        id: id('d-tasks-assigned'),
        eventId: event.eventId,
        mechanism: 'DETERMINISTIC_RULE',
        objective: 'Confirm every required task has a named owner before the engagement is allowed to progress.',
        relevantState: 'PROVISIONING',
        evidenceRefs: tasks.map((t) => `task.${t.id}`),
        deterministicFacts: tasks.map((t) => ({ label: t.id, value: `${t.status} — owner ${t.owner || 'NONE'}` })),
        missingInformation: [],
        permittedActions: ['confirm_ownership_and_progress'],
        forbiddenActions: ['progress_with_an_unowned_task'],
        selectedAction: 'confirm_ownership_and_progress',
        applicablePolicy: ['Every required onboarding action has an explicit owner. AI does not gain action authority merely because it generated the plan.'],
        escalationReason: unowned.length > 0 ? `Unowned tasks: ${unowned.map((t) => t.id).join(', ')}` : undefined,
        authority: 3,
      }),
    ],
    effects: [],
    verifications: [
      {
        id: id('v-ownership'),
        eventId: event.eventId,
        check: 'Every required task has a named owner.',
        result: unowned.length === 0 ? 'PASS' : 'FAIL',
        detail: unowned.length === 0 ? `All ${tasks.length} tasks have a named owner.` : `Unowned: ${unowned.map((t) => t.id).join(', ')}`,
      },
    ],
    statePatch: { facts: { [TASKS_FACT_KEY]: JSON.stringify(tasks) } },
  });

  return { steps };
}

// ---------------------------------------------------------------------------
// onboarding.task.completed
// ---------------------------------------------------------------------------

function handleTaskCompleted(ctx: HandlerContext): HandlerOutcome {
  const { event, state } = ctx;
  const id = (suffix: string) => `${event.eventId}:${suffix}`;
  const parsed = TaskCompletedPayloadSchema.safeParse(event.payload);

  if (!parsed.success) {
    return {
      steps: [
        {
          id: id('completion-invalid'),
          label: 'Task completion',
          atOffsetSeconds: 0,
          summary: 'Task completion payload failed validation. No state change.',
          decisions: [
            decision({
              id: id('d-completion-invalid'),
              eventId: event.eventId,
              mechanism: 'DETERMINISTIC_RULE',
              objective: 'Validate a recorded task completion before applying it.',
              relevantState: state.lifecycleState,
              evidenceRefs: ['event.payload'],
              deterministicFacts: [{ label: 'Validation errors', value: parsed.error.issues.map((i) => i.message).join('; ') }],
              missingInformation: [],
              permittedActions: ['reject_completion'],
              forbiddenActions: ['apply_unvalidated_completion'],
              selectedAction: 'reject_completion',
              applicablePolicy: ['A completion is applied only when its record validates.'],
              authority: 0,
            }),
          ],
          effects: [],
          verifications: [],
        },
      ],
    };
  }

  const { taskId, completedBy, evidence } = parsed.data;
  const tasks = readTasks(state.facts);
  const target = tasks.find((t) => t.id === taskId);
  // "Actionable" covers every status where the task's OWN dependencies are satisfied and
  // it is simply waiting on whichever party owns it next (customer, Kestrel, or secure
  // access) — READY is only the specific label for a SYSTEM_AUTOMATION task in that same
  // condition. BLOCKED is the one status a completion can never legally clear.
  const actionable: readonly TaskStatus[] = ['READY', 'AWAITING_CUSTOMER', 'AWAITING_KESTREL', 'AWAITING_SECURE_ACCESS'];

  if (target === undefined || !actionable.includes(target.status)) {
    return {
      steps: [
        {
          id: id('completion-blocked'),
          label: 'Task completion',
          atOffsetSeconds: 0,
          summary:
            target === undefined
              ? `No task "${taskId}" exists on this engagement's plan.`
              : `Task "${taskId}" is not actionable (currently ${target.status}). A blocked dependency does not become complete by assertion.`,
          decisions: [
            decision({
              id: id('d-completion-blocked'),
              eventId: event.eventId,
              mechanism: 'DETERMINISTIC_RULE',
              objective: 'Refuse a completion for a task whose dependencies are not satisfied.',
              relevantState: state.lifecycleState,
              evidenceRefs: [`task.${taskId}`],
              deterministicFacts: [{ label: 'Current status', value: target?.status ?? 'UNKNOWN' }],
              missingInformation: [],
              permittedActions: ['reject_completion'],
              forbiddenActions: ['mark_a_blocked_task_complete'],
              selectedAction: 'reject_completion',
              applicablePolicy: ['A blocked dependency never incorrectly becomes complete.'],
              authority: 0,
            }),
          ],
          effects: [],
          verifications: [],
        },
      ],
    };
  }

  const updated = recomputeTaskStatuses(
    tasks.map((t) => (t.id === taskId ? { ...t, status: 'COMPLETE' as const, completionEvidence: evidence } : t)),
  );
  const milestone = updated.find((t) => t.id === MILESTONE_TASK_ID);
  const milestoneReached =
    milestone !== undefined &&
    milestone.status === 'COMPLETE' &&
    milestone.completionEvidence !== undefined &&
    milestone.completionEvidence.trim().length > 0;

  const steps: HandlerStep[] = [
    {
      id: id('completed'),
      label: 'Task completed',
      atOffsetSeconds: 0,
      summary: `${completedBy} completed "${taskId}".`,
      decisions: [
        decision({
          id: id('d-completed'),
          eventId: event.eventId,
          mechanism: 'HUMAN_DECISION',
          objective: 'Record a task completion and recompute dependent task readiness.',
          relevantState: state.lifecycleState,
          evidenceRefs: [`task.${taskId}`],
          deterministicFacts: [
            { label: 'Completed by', value: completedBy },
            { label: 'Evidence recorded', value: evidence.length > 0 ? 'yes' : 'none' },
          ],
          missingInformation: [],
          permittedActions: ['mark_complete_and_unblock_dependents'],
          forbiddenActions: ['mark_complete_without_evidence_when_evidence_is_the_completion_criterion'],
          selectedAction: 'mark_complete_and_unblock_dependents',
          applicablePolicy: ['A task moves to COMPLETE only on a recorded completion event; dependents are unblocked from this fact, never from an assumption.'],
          authority: 3,
        }),
      ],
      effects: [],
      verifications: [],
      statePatch: { facts: { [TASKS_FACT_KEY]: JSON.stringify(updated) } },
    },
  ];

  if (!milestoneReached) return { steps };

  const stillOpen = updated.filter((t) => t.status !== 'COMPLETE' && !t.milestoneRelated);

  // --- co-t12: TASKS_ASSIGNED -> FIRST_VALUE_REACHED ------------------------
  steps.push({
    id: id('first-value'),
    label: 'First-value milestone reached',
    atOffsetSeconds: 1,
    transitionTo: 'FIRST_VALUE_REACHED',
    summary: `Declared value criterion satisfied with recorded completion evidence. ${stillOpen.length} non-milestone task(s) remain open (${stillOpen.map((t) => t.id).join(', ') || 'none'}) — completion is defined by the milestone, not by exhausting the checklist.`,
    decisions: [
      decision({
        id: id('d-first-value'),
        eventId: event.eventId,
        mechanism: 'DETERMINISTIC_RULE',
        objective: 'Confirm the declared first-value criterion is genuinely satisfied, with evidence, before declaring the milestone reached.',
        relevantState: 'TASKS_ASSIGNED',
        evidenceRefs: [`task.${MILESTONE_TASK_ID}.completionEvidence`],
        deterministicFacts: [
          { label: 'Milestone task', value: MILESTONE_TASK_ID },
          { label: 'Completion evidence', value: milestone?.completionEvidence ?? '' },
          { label: 'Other tasks still open', value: stillOpen.map((t) => t.id).join(', ') || 'none' },
        ],
        missingInformation: [],
        permittedActions: ['declare_first_value'],
        forbiddenActions: ['declare_first_value_on_checklist_completion_alone', 'declare_first_value_without_recorded_evidence'],
        selectedAction: 'declare_first_value',
        applicablePolicy: ['LAB_TARGET co-lab-value-completion: onboarding is complete when declared value criteria are satisfied, not when a checklist is exhausted.'],
        authority: 3,
      }),
    ],
    effects: [],
    verifications: [
      {
        id: id('v-first-value'),
        eventId: event.eventId,
        check: 'The milestone task is complete and carries non-empty completion evidence.',
        result: 'PASS',
        detail: `Evidence: ${milestone?.completionEvidence ?? ''}`,
      },
    ],
  });

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
  const from = state.lifecycleState;
  const target =
    humanDecision.decision === 'ABANDON'
      ? 'ABANDONED'
      : from === 'BLOCKED'
        ? 'TASKS_ASSIGNED'
        : 'TASKS_ASSIGNED';

  return {
    steps: [
      {
        id: id('human'),
        label: 'Human decision',
        atOffsetSeconds: 0,
        transitionTo: target,
        summary: `${actor?.name ?? humanDecision.decidedBy} recorded: ${humanDecision.decision}.`,
        decisions: [
          decision({
            id: id('d-human'),
            eventId: event.eventId,
            mechanism: 'HUMAN_DECISION',
            objective: 'Record and apply a decision made by a person to resolve a blocked or escalated onboarding.',
            relevantState: from,
            evidenceRefs: ['event.payload.rationale'],
            deterministicFacts: [
              { label: 'Decided by', value: actor?.name ?? humanDecision.decidedBy },
              { label: 'Authority ceiling of this role', value: String(actor?.authorityCeiling ?? 'unknown') },
              { label: 'Rationale', value: humanDecision.rationale },
            ],
            missingInformation: [],
            permittedActions: ['apply_human_decision'],
            forbiddenActions: ['automate_this_decision'],
            selectedAction: `transition_to_${target}`,
            applicablePolicy: ['Resolving contractual ambiguity, a contradiction, or an abandonment is a human-only action.'],
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
// onboarding.review.reevaluated — co-fm-review-timeout
// ---------------------------------------------------------------------------

/** The final escalation point. Matching Lead Rescue's value and its reasoning. */
const FINAL_ESCALATION_AUTHORITY: AuthorityLevel = 4;

/**
 * When this engagement entered human review. The peer of Lead Rescue's `reviewStartedAt` and
 * Call-to-Proposal's fact of the same name.
 */
const REVIEW_STARTED_AT_FACT = 'humanReviewStartedAt';

/**
 * Stamps the review clock onto whichever step actually enters human review.
 *
 * Applied ONCE at the handler boundary rather than at each entry point, because this handler
 * has three ways into NEEDS_HUMAN — a contradiction at intake, a contradiction surviving
 * clarification, and a provisioning outcome that cannot be confirmed — and a fourth is
 * entirely plausible. Hand-stamping would mean a future entry point arrives with no clock, and
 * a parked case whose window never starts can never be overdue: silently the exact condition
 * this mechanism exists to catch.
 *
 * It only ever ADDS a fact to a step the handler already decided to route into review. It
 * cannot create, redirect, or suppress a transition.
 */
function stampReviewStart(steps: readonly HandlerStep[], occurredAt: string): HandlerStep[] {
  return steps.map((step) =>
    step.transitionTo === 'NEEDS_HUMAN'
      ? {
          ...step,
          statePatch: {
            ...step.statePatch,
            facts: { ...step.statePatch?.facts, [REVIEW_STARTED_AT_FACT]: occurredAt },
          },
        }
      : step,
  );
}

/**
 * THE HUMAN-REVIEW ATTENTION TIMEOUT. Closes `co-fm-review-timeout`, and with it the
 * `client-onboarding/NEEDS_HUMAN` entry `data/parked-state-attention.ts` published.
 *
 * Nobody in particular was asked here: an engagement reaches NEEDS_HUMAN because the system
 * refused to resolve something on a person's behalf — a same-rank contradiction it will not
 * settle by recency, or a resource whose state it will not overwrite. There is no assignee to
 * escalate past, so this escalates to the final escalation point, exactly as Lead Rescue's
 * review timeout does.
 *
 * Sets no `transitionTo`, in any branch. An engagement nobody has looked at is an operational
 * attention failure, never a licence to resolve a contradiction or overwrite a resource.
 */
function handleReviewAttentionTimeout(ctx: HandlerContext): HandlerOutcome {
  const { event, state, profile } = ctx;
  const id = (suffix: string) => `${event.eventId}:${suffix}`;
  const windowHours = numberParam(profile, 'humanReviewTimeoutHours');
  const startedAt = state.facts[REVIEW_STARTED_AT_FACT];

  if (state.lifecycleState !== 'NEEDS_HUMAN' || startedAt === undefined) {
    const why =
      state.lifecycleState !== 'NEEDS_HUMAN'
        ? `Current lifecycle state (${state.lifecycleState}) is not human review. No action taken.`
        : 'No recorded review-start timestamp on this engagement. No action taken.';
    return {
      steps: [
        {
          id: id('review-check-inert'),
          label: 'Review attention check',
          atOffsetSeconds: 0,
          summary: why,
          decisions: [
            decision({
              id: id('d-review-check-inert'),
              eventId: event.eventId,
              mechanism: 'DETERMINISTIC_RULE',
              objective: 'Determine whether the configured human-review window has elapsed.',
              relevantState: state.lifecycleState,
              evidenceRefs: [`state.facts.${REVIEW_STARTED_AT_FACT}`],
              deterministicFacts: [
                { label: 'Lifecycle state', value: state.lifecycleState },
                { label: 'Review started', value: startedAt ?? 'not recorded' },
              ],
              missingInformation: [...state.missingInformation],
              permittedActions: ['record_unresolvable_check'],
              forbiddenActions: ['guess_review_start', 'escalate_without_evidence'],
              selectedAction: 'record_unresolvable_check',
              applicablePolicy: ['A review attention check that cannot be computed concludes nothing and takes no action.'],
              authority: 0,
            }),
          ],
          effects: [],
          verifications: [],
        },
      ],
    };
  }

  const elapsedMs = Date.parse(event.occurredAt) - Date.parse(startedAt);
  const elapsedHours = Math.round((elapsedMs / (60 * 60 * 1000)) * 10) / 10;
  const timingFacts = [
    { label: 'Review started', value: startedAt },
    { label: 'Checked at', value: event.occurredAt },
    { label: 'Elapsed', value: `${elapsedHours} hours` },
    { label: 'Configured window', value: `${windowHours} hours` },
  ];

  if (elapsedMs < windowHours * 60 * 60 * 1000) {
    return {
      steps: [
        {
          id: id('review-check'),
          label: 'Review attention check',
          atOffsetSeconds: 0,
          summary: `Checked ${elapsedHours}h into a ${windowHours}h review window. Still within policy — no action taken.`,
          decisions: [
            decision({
              id: id('d-review-check'),
              eventId: event.eventId,
              mechanism: 'DETERMINISTIC_RULE',
              objective: 'Determine whether the configured human-review window has elapsed.',
              relevantState: state.lifecycleState,
              evidenceRefs: [`state.facts.${REVIEW_STARTED_AT_FACT}`, 'event.occurredAt'],
              deterministicFacts: timingFacts,
              missingInformation: [...state.missingInformation],
              permittedActions: ['remain_under_review'],
              forbiddenActions: ['escalate_before_window_elapses', 'resolve_contradiction', 'overwrite_resource'],
              selectedAction: 'remain_under_review',
              applicablePolicy: [
                `CLIENT_POLICY kestrel-review-timeout-window: attention escalation is eligible only once the configured ${windowHours}-hour review window has genuinely elapsed.`,
              ],
              authority: 3,
            }),
          ],
          effects: [],
          verifications: [],
        },
      ],
    };
  }

  const escalationOwner = resolveEscalationOwner(profile, FINAL_ESCALATION_AUTHORITY);

  return {
    steps: [
      {
        id: id('review-overdue'),
        label: 'Review attention overdue',
        atOffsetSeconds: 0,
        // Deliberately NO transitionTo. The engagement stays exactly where it is.
        summary: `No human decision within the configured ${windowHours}-hour review window (checked at ${elapsedHours}h). Escalated to ${escalationOwner.target} as an overdue attention condition — the engagement remains NEEDS_HUMAN, pending an actual human decision.`,
        decisions: [
          decision({
            id: id('d-review-overdue'),
            eventId: event.eventId,
            mechanism: 'DETERMINISTIC_RULE',
            objective: 'Determine whether the configured human-review window has elapsed.',
            relevantState: state.lifecycleState,
            evidenceRefs: [`state.facts.${REVIEW_STARTED_AT_FACT}`, 'event.occurredAt', 'profile.roles'],
            deterministicFacts: [
              ...timingFacts,
              { label: 'Escalation reaches', value: escalationOwner.target },
              { label: 'Escalation basis', value: 'final escalation point — no reviewer was ever assigned to go past' },
            ],
            missingInformation: [...state.missingInformation],
            permittedActions: ['escalate_review_attention'],
            forbiddenActions: ['resolve_contradiction', 'overwrite_resource', 'transition_lifecycle_state'],
            selectedAction: 'escalate_review_attention',
            applicablePolicy: [
              `CLIENT_POLICY kestrel-review-timeout-window: an engagement held for human review past the configured ${windowHours}-hour window is escalated as an attention condition. It is never auto-resolved.`,
            ],
            escalationReason: `An engagement has been held for human review for ${elapsedHours} hours with no named reviewer assigned to it, past the configured ${windowHours}-hour window.`,
            authority: 2,
          }),
        ],
        effects: [
          {
            id: id('effect:notify-review-overdue'),
            kind: 'NOTIFICATION',
            description: 'Notify the final escalation point that an engagement held for human review has exceeded the configured window.',
            target: escalationOwner.target,
            idempotencyKey: `notify:${event.entityId}:review-overdue`,
            authority: 3,
            policyPermits: true,
            verification: {
              check: 'Confirm the notification reached a named owner rather than a shared queue.',
              expect: 'Notification addressed to a named owner.',
            },
          },
        ],
        verifications: [],
      },
    ],
  };
}

/**
 * Wraps a handler so any step it routes into review carries a review clock.
 *
 * Applied at the registration boundary rather than inside each handler, so that a new entry
 * point into NEEDS_HUMAN — or a whole new handler — cannot arrive without one. It only adds a
 * fact to a step the wrapped handler already decided to route into review; it cannot create,
 * redirect, or suppress a transition, and every other step passes through untouched.
 */
function withReviewClock(handler: EventHandler): EventHandler {
  return (ctx) => ({ steps: stampReviewStart(handler(ctx).steps, ctx.event.occurredAt) });
}

export const CLIENT_ONBOARDING_HANDLERS: SystemHandlers = {
  systemId: 'client-onboarding',
  initialState: 'AGREEMENT_SIGNED',
  handlers: {
    'engagement.signed': withReviewClock(handleEngagementSigned),
    'customer.intake.supplied': withReviewClock(handleCustomerIntakeSupplied),
    'access.grant.confirmed': withReviewClock(handleAccessGrantConfirmed),
    'onboarding.task.completed': withReviewClock(handleTaskCompleted),
    'human.decision.recorded': withReviewClock(handleHumanDecision),
    'onboarding.review.reevaluated': handleReviewAttentionTimeout,
  },
};
