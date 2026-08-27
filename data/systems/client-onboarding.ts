import { SystemDefinitionSchema, type SystemDefinition } from '@/lib/model/system';

/** CLIENT ONBOARDING OPERATOR — vertical-agnostic system definition. */

const RAW = {
  id: 'client-onboarding',
  slug: 'client-onboarding',
  name: 'Client Onboarding Operator',
  order: 4,

  businessProblem:
    'A closed sale turns into fragmented setup: repeated questions, unclear ownership, missing access, and delayed value.',
  economicLeakage:
    'Delay between payment and first value is the period in which the customer is paying and receiving nothing, which is where early churn and support burden originate. Every question re-asked also spends trust that the sale just bought.',
  buyerOutcome:
    'Sales context is preserved, only genuinely missing information is requested, required infrastructure is created safely and exactly once, and the customer reaches a defined first-value milestone.',

  triggers: [
    'An agreement is signed',
    'A customer supplies a requested item',
    'An access grant is confirmed',
    'A task owner records completion',
    'A blocking condition is cleared',
  ],
  sourcesOfTruth: [
    'The signed agreement is authoritative for scope and commercial terms',
    'The customer system of record is authoritative for account identity and known facts',
    'The delivery workspace is authoritative for task existence, ownership, and state',
    'The secret store is authoritative for credential material; the workflow store never is',
  ],
  entities: ['Engagement', 'Requirement', 'Access grant', 'Task', 'Owner', 'Milestone', 'Blocker'],

  lifecycle: {
    states: [
      { id: 'AGREEMENT_SIGNED', label: 'Agreement signed', kind: 'INITIAL', description: 'A closed sale exists and onboarding has not begun.' },
      { id: 'CONTEXT_LOADED', label: 'Context loaded', kind: 'ACTIVE', description: 'Everything already known from the sale has been read forward. Nothing here may be re-asked.' },
      { id: 'GAPS_COMPUTED', label: 'Gaps computed', kind: 'ACTIVE', description: 'The difference between required and known has been computed, distinguishing missing from contradictory.' },
      { id: 'AWAITING_CUSTOMER_INPUT', label: 'Awaiting customer input', kind: 'WAITING', description: 'Only genuinely missing items have been requested. Parked awaiting the customer.' },
      { id: 'ACCESS_REQUESTED', label: 'Access requested', kind: 'WAITING', description: 'Access grants requested through the customer’s own secret-sharing channel. No credential material enters workflow state.' },
      { id: 'PROVISIONING', label: 'Provisioning', kind: 'ACTIVE', description: 'Creating the required delivery infrastructure, keyed so repeated execution cannot duplicate it.' },
      { id: 'TASKS_ASSIGNED', label: 'Tasks assigned', kind: 'ACTIVE', description: 'Every required task exists with a named owner and a state.' },
      { id: 'BLOCKED', label: 'Blocked', kind: 'HUMAN_REVIEW', description: 'Progress depends on something outside the system’s control. Blocked time is measured, not hidden.' },
      { id: 'FIRST_VALUE_REACHED', label: 'First value reached', kind: 'TERMINAL_SUCCESS', description: 'The defined value milestone is met. Completion is defined by readiness, not by checklist exhaustion.' },
      { id: 'NEEDS_HUMAN', label: 'Needs human', kind: 'HUMAN_REVIEW', description: 'Contractual ambiguity or contradictory information requires judgement.' },
      { id: 'ABANDONED', label: 'Abandoned', kind: 'TERMINAL_FAILURE', description: 'Onboarding stopped without reaching value. Recorded explicitly so it is countable.' },
    ],
    transitions: [
      { id: 'co-t01', from: 'AGREEMENT_SIGNED', to: 'CONTEXT_LOADED', trigger: 'Agreement signed', mechanism: 'DETERMINISTIC_RULE', guard: 'Sales context retrieved and mapped to the requirement schema.', authority: 3 },
      { id: 'co-t02', from: 'CONTEXT_LOADED', to: 'GAPS_COMPUTED', trigger: 'Context loaded', mechanism: 'DETERMINISTIC_RULE', guard: 'Required set differenced against known set.', authority: 3 },
      { id: 'co-t03', from: 'GAPS_COMPUTED', to: 'AWAITING_CUSTOMER_INPUT', trigger: 'Gap routing', mechanism: 'DETERMINISTIC_RULE', guard: 'At least one non-sensitive item is genuinely missing and was never previously supplied.', authority: 3 },
      { id: 'co-t04', from: 'GAPS_COMPUTED', to: 'ACCESS_REQUESTED', trigger: 'Gap routing', mechanism: 'DETERMINISTIC_RULE', guard: 'At least one required item is an access grant, routed through the secret-sharing channel.', authority: 3 },
      { id: 'co-t05', from: 'GAPS_COMPUTED', to: 'NEEDS_HUMAN', trigger: 'Gap routing', mechanism: 'DETERMINISTIC_RULE', guard: 'Known information contradicts the agreement, or contractual scope is ambiguous.', authority: 2 },
      { id: 'co-t06', from: 'AWAITING_CUSTOMER_INPUT', to: 'GAPS_COMPUTED', trigger: 'Item supplied', mechanism: 'DETERMINISTIC_RULE', guard: 'Supplied item recorded; the gap set is recomputed rather than assumed closed.', authority: 3 },
      { id: 'co-t07', from: 'AWAITING_CUSTOMER_INPUT', to: 'BLOCKED', trigger: 'Wait elapsed', mechanism: 'DETERMINISTIC_RULE', guard: 'Configured window elapsed without the item.', authority: 2 },
      { id: 'co-t08', from: 'ACCESS_REQUESTED', to: 'PROVISIONING', trigger: 'Access confirmed', mechanism: 'DETERMINISTIC_RULE', guard: 'Access confirmed by the granting system. Confirmation is read from that system, never asserted by the requester.', authority: 3 },
      { id: 'co-t09', from: 'ACCESS_REQUESTED', to: 'BLOCKED', trigger: 'Wait elapsed', mechanism: 'DETERMINISTIC_RULE', guard: 'Configured window elapsed without the grant.', authority: 2 },
      { id: 'co-t10', from: 'PROVISIONING', to: 'TASKS_ASSIGNED', trigger: 'Resources created', mechanism: 'DETERMINISTIC_RULE', guard: 'Every required resource exists exactly once and every task has a named owner.', authority: 3 },
      { id: 'co-t11', from: 'PROVISIONING', to: 'NEEDS_HUMAN', trigger: 'Provisioning failed', mechanism: 'DETERMINISTIC_RULE', guard: 'Resource creation partially succeeded and reconciliation could not resolve the difference.', authority: 2 },
      { id: 'co-t12', from: 'TASKS_ASSIGNED', to: 'FIRST_VALUE_REACHED', trigger: 'Milestone check', mechanism: 'DETERMINISTIC_RULE', guard: 'The declared value criteria are satisfied. Checklist completion alone does not satisfy this guard.', authority: 3 },
      { id: 'co-t13', from: 'TASKS_ASSIGNED', to: 'BLOCKED', trigger: 'Task blocked', mechanism: 'DETERMINISTIC_RULE', guard: 'A task owner recorded a dependency outside the system’s control.', authority: 2 },
      { id: 'co-t14', from: 'BLOCKED', to: 'TASKS_ASSIGNED', trigger: 'Blocker cleared', mechanism: 'HUMAN_DECISION', guard: 'A person recorded the blocking condition as resolved.', authority: 2 },
      { id: 'co-t15', from: 'BLOCKED', to: 'NEEDS_HUMAN', trigger: 'Blocked too long', mechanism: 'DETERMINISTIC_RULE', guard: 'Blocked duration exceeded the configured threshold.', authority: 2 },
      { id: 'co-t16', from: 'NEEDS_HUMAN', to: 'TASKS_ASSIGNED', trigger: 'Human decision', mechanism: 'HUMAN_DECISION', guard: 'A person resolved the ambiguity or contradiction.', authority: 2 },
      { id: 'co-t17', from: 'NEEDS_HUMAN', to: 'ABANDONED', trigger: 'Human decision', mechanism: 'HUMAN_DECISION', guard: 'A person recorded that onboarding will not continue.', authority: 2 },
    ],
  },

  deterministicDecisions: [
    'Difference of the required set against the already-known set',
    'Distinguishing missing information from contradictory information',
    'Classifying a requirement as sensitive access material or ordinary information',
    'Idempotent resource creation keyed on engagement and resource identity',
    'Task ownership coverage checking',
    'Blocked-duration accounting',
    'Value-milestone evaluation against declared criteria',
  ],
  aiJudgments: [
    'Interpreting free-text agreement or handover notes into structured requirements, when the inbound handoff is not already a structured, schema-validated artifact translated from an upstream system',
    'Interpreting whether a customer reply actually supplies the requested item',
  ],
  humanOnlyActions: [
    'Resolving contractual scope ambiguity',
    'Resolving contradictions between the agreement and the customer record',
    'Recording a blocking condition as cleared',
    'Declaring onboarding abandoned',
    'Approving any deviation from agreed scope',
  ],
  possibleActions: [
    'Read known context forward from the sale',
    'Request a genuinely missing item',
    'Request an access grant through the secret-sharing channel',
    'Create a delivery resource idempotently',
    'Assign a task to a named owner',
    'Record a blocker',
    'Declare the value milestone met',
  ],

  aiBoundary: [
    'May not request information the record already holds',
    'May not persist credential material in workflow state, tickets, logs, or email',
    'May not treat a plausible answer as a supplied item without confirming it against the requirement',
    'May not resolve contractual ambiguity',
    'May not declare a value milestone met on the basis of checklist completion alone',
  ],
  guardrails: [
    'Previously known information is never requested again without a recorded reason',
    'Missing information and contradictory information are handled by different paths',
    'Every required task has an owner and a state before the engagement may progress',
    'Repeated execution cannot create duplicate resources, because creation is keyed',
    'Credential material is requested through the customer’s own secret channel and never captured in workflow state',
    'Completion is defined by value criteria, not by checklist exhaustion',
  ],

  metrics: [
    { id: 'co-handoff-completeness', name: 'Handoff completeness', kind: 'COVERAGE', definition: 'Required onboarding fields already populated from sales context at the moment of signature, divided by required fields.', unit: 'percent', sourceOfTruth: 'Customer system of record' },
    { id: 'co-repeat-requests', name: 'Repeated-information requests', kind: 'RELIABILITY', definition: 'Count of requests for items the record already held at request time. The lab target for this metric is zero.', unit: 'requests', sourceOfTruth: 'Side-effect ledger joined to customer system of record' },
    { id: 'co-kickoff-latency', name: 'Kickoff latency', kind: 'LEADING', definition: 'Elapsed time from signature to the first customer-visible onboarding action.', unit: 'hours', sourceOfTruth: 'Side-effect ledger' },
    { id: 'co-access-completion', name: 'Access completion', kind: 'LEADING', definition: 'Access grants confirmed by the granting system, divided by access grants requested.', unit: 'percent', sourceOfTruth: 'Granting systems' },
    { id: 'co-ownership-coverage', name: 'Task ownership coverage', kind: 'COVERAGE', definition: 'Required tasks with a named owner, divided by required tasks.', unit: 'percent', sourceOfTruth: 'Delivery workspace' },
    { id: 'co-blocked-time', name: 'Blocked time', kind: 'RELIABILITY', definition: 'Cumulative hours an engagement spent in the blocked state, reported separately from total elapsed time so external dependency is not counted as internal slowness.', unit: 'hours', sourceOfTruth: 'Workflow store' },
    { id: 'co-ttfv', name: 'Time to first value', kind: 'LAGGING', definition: 'Elapsed time from signature to satisfaction of the declared value criteria. The criteria themselves vary by engagement and are client policy.', unit: 'days', sourceOfTruth: 'Workflow store' },
    { id: 'co-duplicate-resources', name: 'Duplicate resource rate', kind: 'RELIABILITY', definition: 'Resources created more than once for the same engagement, divided by resources created. Lab target is zero.', unit: 'percent', sourceOfTruth: 'Side-effect ledger' },
    { id: 'co-completion-rate', name: 'Onboarding completion rate', kind: 'LAGGING', definition: 'Engagements reaching the value milestone, divided by engagements started.', unit: 'percent', sourceOfTruth: 'Workflow store' },
  ],

  standards: [
    {
      id: 'co-std-secrets',
      statement:
        'Secrets must not be hardcoded in source or scattered through configuration, must not be left in logs without a removal process, must be held in a centralised store under least privilege, and must have defined creation, rotation, revocation, and expiry.',
      provenance: 'EVIDENCE',
      verification: 'VERIFIED',
      sourceIds: ['owasp-secrets'],
      appliesTo:
        'Makes credential material structurally excluded from workflow state. Access is requested through the customer’s own secret channel, and confirmation is read from the granting system rather than from the message that claimed it.',
    },
    {
      id: 'co-std-idempotent-creation',
      statement:
        'Operations that create resources must be idempotent, because delivery and retry semantics guarantee that a creation instruction can be received more than once. The established pattern is a caller-supplied key recorded before the operation.',
      provenance: 'EVIDENCE',
      verification: 'VERIFIED',
      sourceIds: ['stripe-idempotency', 'stripe-webhooks'],
      appliesTo:
        'Justifies keying every resource creation on engagement plus resource identity, which is what prevents duplicate folders, projects, and task lists on re-run.',
    },
    {
      id: 'co-std-least-privilege',
      statement:
        'Access must be scoped to the minimum privilege necessary for the requesting role’s function, applied both horizontally and vertically, with periodic review against privilege creep.',
      provenance: 'EVIDENCE',
      verification: 'VERIFIED',
      sourceIds: ['owasp-authorization'],
      appliesTo:
        'Every secure-access requirement states a least-privilege scope by construction — never a broad or administrative grant requested casually.',
    },
    {
      id: 'co-std-handoff-and-value',
      statement:
        'Current customer-onboarding practice passes sales-established context forward so the customer is not asked to start from scratch, and treats a defined value milestone — not checklist completion — as the onboarding success criterion.',
      provenance: 'EVIDENCE',
      verification: 'VERIFIED',
      sourceIds: ['hubspot-customer-onboarding', 'gainsight-onboarding-metrics'],
      appliesTo:
        'Justifies reading the signed handoff forward before asking the customer anything, and justifies the milestone transition guard requiring recorded completion evidence rather than exhausted tasks.',
      correction:
        'Both sources are customer-success vendor content aimed at SaaS businesses, not controlled studies, and neither is authoritative for a project-based professional-services firm. A third-party churn statistic on the HubSpot page was not independently verified and is not repeated here. Gainsight’s metric glossary does not cover "customer effort" at all despite being checked specifically for it.',
    },
    {
      id: 'co-lab-never-reask',
      statement:
        'Information already held in the record is never requested from the customer again without a recorded reason.',
      provenance: 'LAB_TARGET',
      verification: 'NOT_APPLICABLE',
      sourceIds: [],
      appliesTo: 'The gap computation, which differences required against known before any request is composed.',
    },
    {
      id: 'co-lab-value-completion',
      statement:
        'Onboarding is complete when declared value criteria are satisfied, not when a checklist is exhausted.',
      provenance: 'LAB_TARGET',
      verification: 'NOT_APPLICABLE',
      sourceIds: [],
      appliesTo:
        'The milestone transition guard. Time-to-first-value is the primary outcome, but its target is client policy because service complexity varies.',
    },
    {
      id: 'co-lab-missing-vs-contradictory',
      statement:
        'Missing information and contradictory information are distinct conditions with distinct paths. Contradiction requires a person; absence does not.',
      provenance: 'LAB_TARGET',
      verification: 'NOT_APPLICABLE',
      sourceIds: [],
      appliesTo: 'Gap routing, which separates the request path from the human-review path.',
    },
  ],

  failureModes: [
    {
      id: 'co-fm-review-timeout',
      class: 'HUMAN_APPROVAL_TIMEOUT',
      failure: 'An engagement routed to a person is never picked up, and onboarding stalls silently.',
      cause: 'The system refused to resolve something on a person\u2019s behalf \u2014 a same-rank contradiction it will not settle by recency, or a resource whose state it will not overwrite \u2014 and nobody in particular was asked to deal with it.',
      businessImpact: 'A signed client waits while the system reports the engagement as correctly parked. The delay lands at exactly the moment a new client is forming their opinion of how the firm operates.',
      prevention: 'A review clock starts at every genuine entry into review, stamped at the handler boundary so a future entry point cannot arrive without one.',
      detection: 'Age of engagements in NEEDS_HUMAN against the configured review window.',
      recovery: 'Escalate to the final escalation point as an attention condition. There is no assignee to escalate past.',
      escalationCondition: 'Review window elapsed without a decision.',
      authorityRequired: 2,
      recoveryPath: {
        shape: 'HOLDS_POSITION',
        holdsAt: ['NEEDS_HUMAN'],
        note: 'The engagement stays in NEEDS_HUMAN. Escalation raises the fact that nobody has looked at it; it never resolves the contradiction, overwrites the resource, or abandons the engagement. A contradiction this system deliberately refuses to settle does not become settleable because it has been waiting.',
      },
      verificationTest: 'tests/client-onboarding-review-timeout.test.ts \u2014 a genuine same-rank contradiction enters review with a clock stamped at the handler boundary, a check inside the window takes no action, a check past it escalates to the final escalation point, the engagement never transitions, and repeated checks escalate once.',
    },
    {
      id: 'co-fm-credential-leak',
      class: 'CREDENTIAL_FAILURE',
      failure: 'Credential material is captured into workflow state, a ticket, an email thread, or a log.',
      cause: 'A customer pastes a secret into a reply, and the reply is persisted like any other message.',
      businessImpact: 'A customer secret is now stored somewhere it was never meant to be, in a system with different access controls and retention. Severe and often undetected.',
      prevention: 'Requirements flagged sensitive are routed to the secret-sharing channel and excluded from ordinary persistence; inbound content is screened for secret patterns before it is stored.',
      detection: 'Secret-pattern screening on inbound content and on state writes.',
      recovery: 'Purge the captured value, record the incident, and request rotation of the exposed credential.',
      escalationCondition: 'Any detected secret in persisted state. Treated as an incident, not a metric.',
      authorityRequired: 4,
      recoveryPath: {
        shape: 'MOVES',
        moves: [{ from: 'GAPS_COMPUTED', to: 'NEEDS_HUMAN' }],
        note: 'An incident record travels with it. A secret-shaped value arriving instead on an access-grant reference is withheld in place rather than moved: the requirement is never marked CONFIRMED and its task never marked COMPLETE on the strength of it.',
      },
      verificationTest:
        'tests/client-onboarding.test.ts — the secret-screen test submits the reserved TEST_ONLY_SECRET_SENTINEL_DO_NOT_USE sentinel through an ordinary intake field, and a second test submits it as an access-grant channel reference; both assert it appears nowhere in final state or in any rendered decision/summary text, and that the corresponding requirement is never marked confirmed or complete on the strength of the withheld value.',
    },
    {
      id: 'co-fm-duplicate-resources',
      class: 'RETRY_DUPLICATE_SIDE_EFFECT',
      failure: 'Re-running onboarding creates a second project, folder, or task list.',
      cause: 'A retry after a partial failure, or a person re-triggering the flow manually.',
      businessImpact: 'Work splits across duplicate containers and some of it is silently abandoned.',
      prevention: 'Creation is keyed on engagement plus resource identity and claimed before the call.',
      detection: 'Idempotency key already claimed.',
      recovery: 'Refuse the second creation and reconcile against the existing resource.',
      retryPolicy: 'Bounded retry; the key makes retries safe.',
      escalationCondition: 'Duplicate resource rate above zero.',
      authorityRequired: 3,
      recoveryPath: {
        shape: 'HOLDS_POSITION',
        note: 'No state change; the creation is recorded as SUPPRESSED_DUPLICATE and reconciled against the resource that already exists.',
      },
      verificationTest:
        'tests/client-onboarding.test.ts — the duplicate-provisioning-reconciled scenario redelivers the access-confirmation event; both resources resolve ALREADY_EXISTS_MATCHING the second time and exactly two EXECUTED creations exist across the whole run.',
    },
    {
      id: 'co-fm-contradictory-data',
      class: 'CONTRADICTORY_DATA',
      failure: 'The agreement and the customer record disagree about scope, contacts, or commercial terms.',
      cause: 'The record was updated after signature, or the sale captured something the agreement did not.',
      businessImpact: 'Delivery proceeds against the wrong scope, surfacing as a billing dispute later.',
      prevention: 'The agreement is authoritative for scope; disagreement is detected rather than silently resolved in favour of whichever was read last.',
      detection: 'Field-level comparison between agreement and record.',
      recovery: 'Route to a person with both values shown. Never auto-resolve.',
      escalationCondition: 'Any contradiction on a commercially material field.',
      authorityRequired: 2,
      recoveryPath: {
        shape: 'MOVES',
        moves: [{ from: 'GAPS_COMPUTED', to: 'NEEDS_HUMAN' }],
        note: 'Both values are shown to the person deciding. Two equally-ranked disagreeing sources stay an explicit conflict rather than being silently resolved.',
      },
      verificationTest:
        'tests/client-onboarding.test.ts — resolveAuthoritativeValue direct tests prove the precedence gate never lets a signed-agreement value be silently overwritten and never picks a side between two same-rank disagreeing sources; a dedicated scenario-level test then drives the same contradiction through the real handler and asserts it reaches NEEDS_HUMAN with the conflicting field named.',
    },
    {
      id: 'co-fm-repeat-question',
      class: 'POLICY_VIOLATION',
      failure: 'The customer is asked for something they already supplied.',
      cause: 'Gap computation reading a partial view of known context, or ignoring items supplied during the sale.',
      businessImpact: 'Spends the trust the sale just bought, and is the single most commonly cited onboarding complaint.',
      prevention: 'Gap computation differences required against the full known set including sales context before composing any request.',
      detection: 'Requested item present in the record at request time.',
      recovery: 'Suppress the request and recompute the gap set.',
      escalationCondition: 'Repeated-information requests above zero.',
      authorityRequired: 3,
      recoveryPath: {
        shape: 'MOVES',
        moves: [{ from: 'AWAITING_CUSTOMER_INPUT', to: 'GAPS_COMPUTED' }],
        note: 'The request is suppressed and the gap set recomputed, so the customer is never asked twice for something they already supplied.',
      },
      verificationTest:
        'tests/client-onboarding.test.ts — the signed-client-to-first-value scenario asserts the field already known from the handoff (named-owner) never appears in any "requested" list, and the gap-computation decision explicitly records it as reused.',
    },
    {
      id: 'co-fm-partial-provisioning',
      class: 'PARTIAL_SIDE_EFFECT',
      failure: 'Some required resources are created and others fail, leaving the engagement half-provisioned.',
      cause: 'A downstream system failed midway through a multi-resource sequence.',
      businessImpact: 'Onboarding appears started but cannot progress, and the gap is invisible without reconciliation.',
      prevention: 'Each resource is keyed and claimed independently so a retry completes only what is missing.',
      detection: 'Reconciliation of required resources against the ledger.',
      recovery: 'Retry only the unclaimed resources; if reconciliation cannot resolve the difference, route to a person.',
      retryPolicy: 'Bounded attempts per resource, not per sequence.',
      escalationCondition: 'Reconciliation unable to determine what exists.',
      authorityRequired: 2,
      recoveryPath: {
        shape: 'MOVES',
        moves: [{ from: 'PROVISIONING', to: 'NEEDS_HUMAN' }],
        note: 'Only unclaimed resources are retried. A difference reconciliation cannot resolve goes to a person rather than being retried blindly.',
      },
      verificationTest:
        'tests/client-onboarding.test.ts — the partial-provisioning direct test forces one resource attempt to OUTCOME_UNKNOWN while its sibling genuinely succeeds, and asserts the successful resource stays EXECUTED rather than being lost or recreated.',
    },
    {
      id: 'co-fm-timeout',
      class: 'TIMEOUT',
      failure: 'A resource-creation call times out without returning, leaving it unknown whether the resource was created.',
      cause: 'A slow downstream system. The request may well have succeeded after the caller gave up waiting.',
      businessImpact: 'A blind retry duplicates the resource; no retry leaves the engagement half-provisioned. Both fail quietly, which is what makes this worse than an outright error.',
      prevention: 'The idempotency key is claimed before the call, so a retry is safe regardless of which side of the timeout the original call actually landed on.',
      detection: 'No response within the configured deadline.',
      recovery: 'Reconcile by reading the resource back by its key before retrying, and retry only when the read confirms absence.',
      retryPolicy: 'Bounded attempts, each reconciling before acting.',
      escalationCondition: 'Reconciliation cannot determine whether the resource exists.',
      authorityRequired: 2,
      recoveryPath: {
        shape: 'MOVES',
        moves: [{ from: 'PROVISIONING', to: 'NEEDS_HUMAN' }],
        note: 'Reached only when reconciliation cannot confirm the outcome. The resource is read back by its key before any retry, and retried only when that read confirms absence.',
      },
      verificationTest:
        'tests/client-onboarding.test.ts \u2014 the partial-provisioning direct test forces an OUTCOME_UNKNOWN result on one attempt and asserts it is refused rather than assumed successful, routing to NEEDS_HUMAN instead of TASKS_ASSIGNED.',
    },
    {
      id: 'co-fm-scope-drift',
      class: 'POLICY_VIOLATION',
      failure: 'A derived onboarding task implies a service or commitment the signed engagement did not buy.',
      cause: 'Free-text handover notes or an onboarding requirement interpreted generously enough to suggest a bigger program than the one that was signed.',
      businessImpact: 'The customer receives an implicit commitment nobody with commercial authority actually approved, and delivery is later asked to honour it.',
      prevention: 'Every derived task is checked against the signed engagement\u2019s service line before it is admitted onto the plan; a task with no implied service is always a standard onboarding necessity and always passes.',
      detection: 'Task-to-scope comparison at plan derivation.',
      recovery: 'Refuse the task. It never becomes a client-visible commitment without a person separately approving an amended scope.',
      escalationCondition: 'Any candidate task whose implied service differs from the signed engagement.',
      authorityRequired: 2,
      recoveryPath: {
        shape: 'HOLDS_POSITION',
        note: 'The engagement carries on from where it was; the refused task simply never enters the derived plan. It cannot become a client-visible commitment without a person separately approving an amended scope.',
      },
      verificationTest:
        'tests/client-onboarding.test.ts \u2014 admitOnboardingTask is exercised directly against a synthetic task implying a service line the signed handoff did not buy, and is refused by name; the same gate runs for real over every task in each scenario\u2019s derived plan.',
    },
  ],

  maturity: 'SIMULATED',
  fidelityNote:
    'Two scenarios replay through the same engine core the first three systems proved: a signed engagement (continuing Call-to-Proposal’s own Bramwell Data opportunity, not a fresh fixture) carries its commercial context forward, requests only the two genuinely missing categories of information — ordinary fields and, separately, secure access — provisions its delivery resources exactly once, and reaches a first-value milestone that requires recorded completion evidence while one unrelated task is still open. A second scenario redelivers the access-confirmation event and shows both a resource-provisioning port and the core lifecycle engine independently refusing to duplicate the same outcome, for two different reasons. A draft or despatched proposal is not sufficient authority to begin onboarding; only a payload asserting kind=SIGNED_AGREEMENT is. That handoff is no longer authored to merely resemble Call-to-Proposal’s own approved artifact: `lib/engine/handoffs/proposal-to-onboarding-handoff.ts` derives it mechanically from the claims Call-to-Proposal itself admitted, and `tests/handoff-boundary.test.ts` re-runs Call-to-Proposal’s own scenario live and asserts the translation matches the fixture this system actually consumes — the fixture is pinned data (what a real onboarding system would have received once, at signature time), not something recomputed on every load, but it is provably derived rather than hand-typed to match. Resource provisioning introduced a genuine third port — see STATUS.md for why SideEffectExecutor’s retry-safety contract does not fit an operation that is safe to repeat by construction. As with the first three systems, nothing here is live: no resource was created anywhere real, no model was called, and the business is fictional.',
} satisfies Parameters<typeof SystemDefinitionSchema.parse>[0];

export const CLIENT_ONBOARDING: SystemDefinition = SystemDefinitionSchema.parse(RAW);
