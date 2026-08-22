import {
  desiredResourceFingerprint,
  onboardingResourceKey,
  type SignedEngagementHandoff,
} from '@/lib/engine/handlers/client-onboarding';
import { ScenarioSchema, type Scenario } from '@/lib/model/runtime';

/**
 * CLIENT ONBOARDING OPERATOR — Kestrel scenarios.
 *
 * Both scenarios continue Bramwell Data's journey from Call-to-Proposal's
 * `discovery-to-approved-proposal` scenario (`data/profiles/kestrel/scenarios/call-to-proposal.ts`)
 * rather than inventing a fresh customer. This is the portfolio's first cross-system
 * continuity: the same opportunity, the same approved artifact id and version, the same
 * primary contact — carried forward as a typed handoff rather than a second, disconnected
 * fixture. System 3's own scenario file is NOT imported here; the coupling at MODULE level
 * is matching data, not a code dependency (see the handoff contract's doc comment in
 * `lib/engine/handlers/client-onboarding.ts` for why).
 *
 * `BRAMWELL_HANDOFF` below is NOT hand-typed to merely resemble Call-to-Proposal's
 * Bramwell run — every field beyond `customerId`/`engagementId` (genuinely new identity,
 * assigned by whatever system captured the actual signature; Call-to-Proposal has no
 * concept of either) is exactly what
 * `lib/engine/handoffs/proposal-to-onboarding-handoff.ts#exportSignedEngagementHandoff`
 * computes from Call-to-Proposal's own admitted claims and approved artifact.
 * `tests/handoff-boundary.test.ts` re-runs Call-to-Proposal's scenario live and asserts
 * the translation equals this literal — so this file stays a synchronous data module (no
 * top-level await, no runtime coupling between the two handlers) while the fixture itself
 * is provably derived: edit Call-to-Proposal's Bramwell scenario and that test fails until
 * this literal is updated to match, rather than silently drifting.
 *
 * Bramwell's actual signature lands about a week after the proposal was approved and
 * despatched (2026-08-11) — a plausible procurement delay, not the same moment.
 */

const BRAMWELL_HANDOFF: SignedEngagementHandoff = {
  kind: 'SIGNED_AGREEMENT',
  customerId: 'cust-bramwell',
  customerName: 'Bramwell Data',
  engagementId: 'eng-bramwell',
  commercialArtifact: {
    id: 'proposal:opp-bramwell',
    version: 1,
    approvedBy: 'founder',
    approvedAt: '2026-08-11T09:00:00-04:00',
  },
  serviceLineId: 'questionnaire-sprint',
  // = `${serviceLine.name}: ${desiredOutcome claim}` — the seller's own catalog name plus
  // the buyer's own admitted, evidenced desired-outcome claim. Neither half is invented.
  scopeSummary: 'Security questionnaire remediation sprint: Unblock the stalled enterprise deal with something concrete to show procurement.',
  // = profile.company.explicitlyNot verbatim — the firm's own standing, SELLER_POLICY-grade
  // boundaries, not a per-engagement list authored to sound plausible for this proposal.
  exclusions: [
    'Not a certification body. Kestrel does not issue certificates or attestations.',
    'Not an independent auditor. Kestrel does not perform the audit or issue the opinion, and works alongside the audit firm the client engages separately.',
    'Not in control of audit outcomes or timelines, and therefore never in a position to promise them.',
    'Not a law firm. Kestrel does not give legal advice on regulatory obligations.',
  ],
  // = the artifact's own SELLER_POLICY commercial-terms claim (the DERIVED feasibility
  // claim alongside it in commercialTerms is an internal validation fact, not a commitment).
  sellerCommitments: ['Security questionnaire remediation sprint: $12,000 total engagement value'],
  // = derived from the nextStepOwner claim. The prior version of this fixture asserted a
  // customer commitment ("provide read-only access to in-scope systems") that nobody on
  // the actual call established — exactly the unsupported-inference failure mode
  // Call-to-Proposal's own claim-admission gate exists to catch, reintroduced here because
  // this field used to be typed by hand rather than derived from an admitted claim.
  customerCommitments: ['Priya Nandy owns bringing this engagement forward as the accountable contact.'],
  timing: '4 weeks',
  // = the desiredOutcome claim again — CP has no distinct "success criteria" claim, and
  // reusing the buyer's own stated objective is more honest than authoring a new one.
  successCriteria: ['Unblock the stalled enterprise deal with something concrete to show procurement.'],
  stakeholders: [{ name: 'Priya Nandy', role: 'Priya Nandy — Head of Security, first security hire' }],
  // Reused, not re-asked: both values were already established on the discovery call.
  knownFacts: { 'named-owner': 'Priya Nandy — Head of Security, first security hire' },
  // = the artifact's own final missingInformation, verbatim — not a narrated explanation
  // of why it's missing, which would be this file inventing a rationale CP never recorded
  // as structured state.
  knownUnknowns: ['budgetDiscussed'],
  originatingSystem: 'call-to-proposal',
};

// ---------------------------------------------------------------------------
// Scenario A — signed client to first value
// ---------------------------------------------------------------------------

const workspaceKey = onboardingResourceKey(BRAMWELL_HANDOFF.engagementId, 'workspace');
const taskListKey = onboardingResourceKey(BRAMWELL_HANDOFF.engagementId, 'task-list');
const workspaceFingerprint = desiredResourceFingerprint(BRAMWELL_HANDOFF.engagementId, 'workspace', BRAMWELL_HANDOFF.serviceLineId);
const taskListFingerprint = desiredResourceFingerprint(BRAMWELL_HANDOFF.engagementId, 'task-list', BRAMWELL_HANDOFF.serviceLineId);

function provisionAttempts(suffix: string) {
  return [
    {
      attemptId: `prov-bramwell-workspace-${suffix}`,
      resourceKey: workspaceKey,
      resourceType: 'workspace',
      desiredStateFingerprint: workspaceFingerprint,
      provider: 'workspace-provider',
      description: 'Create the Bramwell Data engagement workspace.',
    },
    {
      attemptId: `prov-bramwell-tasklist-${suffix}`,
      resourceKey: taskListKey,
      resourceType: 'task-list',
      desiredStateFingerprint: taskListFingerprint,
      provider: 'workspace-provider',
      description: 'Create the Bramwell Data onboarding task list.',
    },
  ];
}

const scenarioA: Scenario = ScenarioSchema.parse({
  id: 'co-scenario-signed-to-first-value',
  slug: 'signed-client-to-first-value',
  systemId: 'client-onboarding',
  title: 'Signed client to first value',
  summary:
    'Bramwell Data’s signed engagement carries commercial context forward from Call-to-Proposal. Already-known facts are never re-requested, only genuinely missing information is asked for, sensitive access is requested through a secure channel rather than captured directly, delivery resources are provisioned exactly once, and the engagement reaches its declared first-value milestone with one unrelated task still open.',
  demonstrates: [
    'A signed handoff — not a merely despatched proposal — is what authorises onboarding to begin',
    'Fields already known from the sale (the named owner) are never re-requested',
    'Only genuinely missing, non-sensitive information is put to the customer',
    'Sensitive access is requested through a secure channel and confirmed by the granting system, never captured as a plain value',
    'Delivery resources are created exactly once, keyed by business identity',
    'The first-value milestone requires recorded completion evidence, not merely a complete checklist — one unrelated task is still open when it fires',
  ],
  events: [
    {
      eventId: 'evt-co-bramwell-001',
      correlationId: 'inc-co-bramwell',
      entityId: 'eng-bramwell',
      type: 'engagement.signed',
      source: 'esignature-platform',
      sourceEventId: 'sig-2026-08-18-bramwell',
      occurredAt: '2026-08-18T10:00:00-04:00',
      receivedAt: '2026-08-18T10:01:00-04:00',
      schemaVersion: '2026-08-01',
      actor: 'EXTERNAL_PARTY',
      executionMode: 'SIMULATED',
      payload: { handoff: BRAMWELL_HANDOFF },
    },
    {
      eventId: 'evt-co-bramwell-002',
      correlationId: 'inc-co-bramwell',
      entityId: 'eng-bramwell',
      type: 'customer.intake.supplied',
      source: 'onboarding-portal',
      sourceEventId: 'intake-2026-08-19-bramwell',
      occurredAt: '2026-08-19T14:00:00-04:00',
      receivedAt: '2026-08-19T14:00:30-04:00',
      schemaVersion: '2026-08-01',
      actor: 'EXTERNAL_PARTY',
      executionMode: 'SIMULATED',
      payload: {
        items: [
          {
            requirementId: 'system-inventory',
            value: 'AWS (single account, us-east-1), GitHub Enterprise Cloud org, Okta as IdP for all employees.',
            suppliedBy: 'Priya Nandy',
          },
          {
            requirementId: 'existing-policies',
            value: 'No formal written security policies exist yet — only ad hoc internal engineering docs.',
            suppliedBy: 'Priya Nandy',
          },
          {
            requirementId: 'audit-window',
            value: 'No formal audit window yet. This sprint is meant to unblock procurement, not to start an audit.',
            suppliedBy: 'Priya Nandy',
          },
        ],
      },
    },
    {
      eventId: 'evt-co-bramwell-003',
      correlationId: 'inc-co-bramwell',
      entityId: 'eng-bramwell',
      type: 'access.grant.confirmed',
      source: 'bramwell-identity-provider',
      sourceEventId: 'grants-2026-08-20-bramwell',
      occurredAt: '2026-08-20T09:00:00-04:00',
      receivedAt: '2026-08-20T09:00:15-04:00',
      schemaVersion: '2026-08-01',
      actor: 'EXTERNAL_PARTY',
      executionMode: 'SIMULATED',
      payload: {
        confirmedBy: 'granting-system:bramwell-identity',
        grants: [
          { requirementId: 'cloud-access', externalReference: 'aws-iam-role:kestrel-readonly-audit' },
          { requirementId: 'idp-access', externalReference: 'okta-app-integration:kestrel-readonly' },
          { requirementId: 'scm-access', externalReference: 'github-app-install:kestrel-readonly' },
        ],
        provisionAttempts: provisionAttempts('a1'),
      },
    },
    {
      eventId: 'evt-co-bramwell-004',
      correlationId: 'inc-co-bramwell',
      entityId: 'eng-bramwell',
      type: 'onboarding.task.completed',
      source: 'operator-console',
      sourceEventId: 'console-2026-08-22-bramwell-milestone',
      occurredAt: '2026-08-22T16:00:00-04:00',
      receivedAt: '2026-08-22T16:00:00-04:00',
      schemaVersion: '2026-08-01',
      actor: 'HUMAN',
      executionMode: 'SIMULATED',
      payload: {
        taskId: 'deliver-initial-gap-baseline',
        completedBy: 'analyst',
        evidence:
          'Initial control/evidence gap baseline delivered to Priya Nandy via the engagement workspace, covering AWS, Okta, and GitHub Enterprise findings against the specific questionnaire’s control set.',
      },
    },
  ],
  judgments: {},
  expectedFinalState: 'FIRST_VALUE_REACHED',
});

// ---------------------------------------------------------------------------
// Scenario B — duplicate access confirmation, reconciliation not duplication
// ---------------------------------------------------------------------------

const scenarioB: Scenario = ScenarioSchema.parse({
  id: 'co-scenario-duplicate-provisioning-reconciled',
  slug: 'duplicate-provisioning-reconciled',
  systemId: 'client-onboarding',
  title: 'Duplicate provisioning reconciled',
  summary:
    'The granting system redelivers its access-confirmation event for Bramwell Data — an ordinary at-least-once retry, not a new fact. The same two resources are ensured a second time and genuinely reconcile as already matching rather than being recreated, and the lifecycle transition the duplicate event tries to repeat is independently rejected as illegal from the state the engagement has already reached.',
  demonstrates: [
    'A redelivered trigger converges on one logical onboarding environment rather than creating a second one',
    'Resource reconciliation is real port behaviour — the second ensure() call is compared against the first, not narrated as safe',
    'The engine core independently refuses the duplicate’s lifecycle transition, because the declared graph has no rule from the state already reached',
    'Both guarantees hold simultaneously without an explicit "is this a duplicate?" check anywhere in the handler',
  ],
  events: [
    {
      eventId: 'evt-co-bramwell-dup-001',
      correlationId: 'inc-co-bramwell-dup',
      entityId: 'eng-bramwell',
      type: 'engagement.signed',
      source: 'esignature-platform',
      sourceEventId: 'sig-2026-08-18-bramwell-dup',
      occurredAt: '2026-08-18T10:00:00-04:00',
      receivedAt: '2026-08-18T10:01:00-04:00',
      schemaVersion: '2026-08-01',
      actor: 'EXTERNAL_PARTY',
      executionMode: 'SIMULATED',
      payload: { handoff: BRAMWELL_HANDOFF },
    },
    {
      eventId: 'evt-co-bramwell-dup-002',
      correlationId: 'inc-co-bramwell-dup',
      entityId: 'eng-bramwell',
      type: 'customer.intake.supplied',
      source: 'onboarding-portal',
      sourceEventId: 'intake-2026-08-19-bramwell-dup',
      occurredAt: '2026-08-19T14:00:00-04:00',
      receivedAt: '2026-08-19T14:00:30-04:00',
      schemaVersion: '2026-08-01',
      actor: 'EXTERNAL_PARTY',
      executionMode: 'SIMULATED',
      payload: {
        items: [
          {
            requirementId: 'system-inventory',
            value: 'AWS (single account, us-east-1), GitHub Enterprise Cloud org, Okta as IdP for all employees.',
            suppliedBy: 'Priya Nandy',
          },
          {
            requirementId: 'existing-policies',
            value: 'No formal written security policies exist yet — only ad hoc internal engineering docs.',
            suppliedBy: 'Priya Nandy',
          },
          {
            requirementId: 'audit-window',
            value: 'No formal audit window yet. This sprint is meant to unblock procurement, not to start an audit.',
            suppliedBy: 'Priya Nandy',
          },
        ],
      },
    },
    {
      eventId: 'evt-co-bramwell-dup-003',
      correlationId: 'inc-co-bramwell-dup',
      entityId: 'eng-bramwell',
      type: 'access.grant.confirmed',
      source: 'bramwell-identity-provider',
      sourceEventId: 'grants-2026-08-20-bramwell-dup',
      occurredAt: '2026-08-20T09:00:00-04:00',
      receivedAt: '2026-08-20T09:00:15-04:00',
      schemaVersion: '2026-08-01',
      actor: 'EXTERNAL_PARTY',
      executionMode: 'SIMULATED',
      payload: {
        confirmedBy: 'granting-system:bramwell-identity',
        grants: [
          { requirementId: 'cloud-access', externalReference: 'aws-iam-role:kestrel-readonly-audit' },
          { requirementId: 'idp-access', externalReference: 'okta-app-integration:kestrel-readonly' },
          { requirementId: 'scm-access', externalReference: 'github-app-install:kestrel-readonly' },
        ],
        provisionAttempts: provisionAttempts('b1'),
      },
    },
    {
      // The SAME confirmation, redelivered — a distinct eventId (as at-least-once delivery
      // produces) but the identical business content, arriving after the engine already
      // moved on to TASKS_ASSIGNED.
      eventId: 'evt-co-bramwell-dup-003-redelivered',
      correlationId: 'inc-co-bramwell-dup',
      entityId: 'eng-bramwell',
      type: 'access.grant.confirmed',
      source: 'bramwell-identity-provider',
      sourceEventId: 'grants-2026-08-20-bramwell-dup',
      occurredAt: '2026-08-20T09:04:00-04:00',
      receivedAt: '2026-08-20T09:04:05-04:00',
      schemaVersion: '2026-08-01',
      actor: 'EXTERNAL_PARTY',
      executionMode: 'SIMULATED',
      payload: {
        confirmedBy: 'granting-system:bramwell-identity',
        grants: [
          { requirementId: 'cloud-access', externalReference: 'aws-iam-role:kestrel-readonly-audit' },
          { requirementId: 'idp-access', externalReference: 'okta-app-integration:kestrel-readonly' },
          { requirementId: 'scm-access', externalReference: 'github-app-install:kestrel-readonly' },
        ],
        provisionAttempts: provisionAttempts('b2'),
      },
    },
  ],
  judgments: {},
  expectedFinalState: 'TASKS_ASSIGNED',
});

export const CLIENT_ONBOARDING_SCENARIOS: readonly Scenario[] = [scenarioA, scenarioB];

export function clientOnboardingScenarioBySlug(slug: string): Scenario | undefined {
  return CLIENT_ONBOARDING_SCENARIOS.find((s) => s.slug === slug);
}
