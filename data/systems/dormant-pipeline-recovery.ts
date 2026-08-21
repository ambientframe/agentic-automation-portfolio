import { SystemDefinitionSchema, type SystemDefinition } from '@/lib/model/system';

/** DORMANT PIPELINE RECOVERY — vertical-agnostic system definition. */

const RAW = {
  id: 'dormant-pipeline-recovery',
  slug: 'dormant-pipeline-recovery',
  name: 'Dormant Pipeline Recovery',
  order: 2,

  businessProblem:
    'Previously acquired leads and opportunities sit unused with no disciplined rule determining which should be revisited, why now, what changed, whether outreach is still permitted, and when to stop.',
  economicLeakage:
    'Acquisition cost already spent on these records is written off by inaction, while undisciplined reactivation burns the same list and converts a recoverable asset into a suppression list.',
  buyerOutcome:
    'Every dormant record is deliberately dispositioned — suppressed, archived, scheduled, reactivated, or routed to a person — with an explicit recorded reason, rather than left to decay or swept into a bulk send.',

  triggers: [
    'A scheduled evaluation of the dormant set runs',
    'A recorded objection reason expires',
    'A relevant customer or account event is observed',
    'A previously unmet qualification condition becomes satisfied',
    'A person defines a campaign over a named segment',
  ],
  sourcesOfTruth: [
    'The customer system of record is authoritative for entity identity, stage history, and consent state',
    'The suppression register is authoritative for contact permission',
    'The outreach log is authoritative for attempts already made',
  ],
  entities: ['Dormant record', 'Contact', 'Re-entry reason', 'Sequence', 'Attempt', 'Suppression entry'],

  lifecycle: {
    states: [
      { id: 'DORMANT', label: 'Dormant', kind: 'INITIAL', description: 'The record is inactive and has not yet been evaluated in this cycle.' },
      { id: 'ELIGIBILITY_REVIEW', label: 'Eligibility review', kind: 'ACTIVE', description: 'Being tested against consent state and the declared set of valid re-entry reasons.' },
      { id: 'SUPPRESSED', label: 'Suppressed', kind: 'TERMINAL_NEUTRAL', description: 'Contact permission is absent or withdrawn. Commercial interest does not override this.' },
      { id: 'ARCHIVED', label: 'Archived', kind: 'TERMINAL_NEUTRAL', description: 'No valid re-entry reason exists. Deliberately closed rather than left ambiguous.' },
      { id: 'SCHEDULED', label: 'Scheduled', kind: 'WAITING', description: 'Eligible with a valid reason, held until the reason’s appropriate moment.' },
      { id: 'REACTIVATION_ATTEMPTED', label: 'Reactivation attempted', kind: 'ACTIVE', description: 'One attempt from the sequence has been despatched.' },
      { id: 'AWAITING_RESPONSE', label: 'Awaiting response', kind: 'WAITING', description: 'Parked between attempts, within the declared cadence.' },
      { id: 'POSITIVE_RESPONSE', label: 'Positive response', kind: 'ACTIVE', description: 'The contact responded with interest and the response has been interpreted.' },
      { id: 'REOPENED', label: 'Reopened', kind: 'TERMINAL_SUCCESS', description: 'Returned to the active pipeline under human ownership.' },
      { id: 'OPTED_OUT', label: 'Opted out', kind: 'TERMINAL_NEUTRAL', description: 'The contact withdrew permission. Permanent and immediate.' },
      { id: 'ATTEMPTS_EXHAUSTED', label: 'Attempts exhausted', kind: 'ACTIVE', description: 'The declared maximum attempts were made without response.' },
      { id: 'COOLING_OFF', label: 'Cooling off', kind: 'WAITING', description: 'Held for the declared cooling-off period before any re-entry may be considered.' },
      { id: 'NEEDS_HUMAN', label: 'Needs human', kind: 'HUMAN_REVIEW', description: 'Eligibility or response interpretation exceeded the system’s authority.' },
    ],
    transitions: [
      { id: 'dp-t01', from: 'DORMANT', to: 'ELIGIBILITY_REVIEW', trigger: 'Evaluation cycle', mechanism: 'DETERMINISTIC_RULE', guard: 'Record is in the evaluated segment.', authority: 3 },
      { id: 'dp-t02', from: 'ELIGIBILITY_REVIEW', to: 'SUPPRESSED', trigger: 'Consent check', mechanism: 'DETERMINISTIC_RULE', guard: 'Suppression or opt-out state present.', authority: 3 },
      { id: 'dp-t03', from: 'ELIGIBILITY_REVIEW', to: 'ARCHIVED', trigger: 'Re-entry reason check', mechanism: 'DETERMINISTIC_RULE', guard: 'No declared re-entry reason applies. Inactivity alone is not a reason.', authority: 3 },
      { id: 'dp-t04', from: 'ELIGIBILITY_REVIEW', to: 'SCHEDULED', trigger: 'Re-entry reason check', mechanism: 'DETERMINISTIC_RULE', guard: 'A declared re-entry reason applies and consent permits contact.', authority: 3 },
      { id: 'dp-t05', from: 'ELIGIBILITY_REVIEW', to: 'NEEDS_HUMAN', trigger: 'Re-entry reason check', mechanism: 'DETERMINISTIC_RULE', guard: 'Evidence for the re-entry reason is contradictory or below the confidence floor.', authority: 2 },
      { id: 'dp-t06', from: 'SCHEDULED', to: 'REACTIVATION_ATTEMPTED', trigger: 'Cadence due', mechanism: 'DETERMINISTIC_RULE', guard: 'Attempt budget not exhausted and consent re-checked immediately before despatch.', authority: 3 },
      { id: 'dp-t07', from: 'REACTIVATION_ATTEMPTED', to: 'AWAITING_RESPONSE', trigger: 'Attempt despatched', mechanism: 'DETERMINISTIC_RULE', guard: 'The attempt resolved as executed and was logged.', authority: 3 },
      { id: 'dp-t08', from: 'AWAITING_RESPONSE', to: 'POSITIVE_RESPONSE', trigger: 'Response received', mechanism: 'DETERMINISTIC_RULE', guard: 'Response interpreted as interest at or above the confidence floor.', authority: 3 },
      { id: 'dp-t09', from: 'AWAITING_RESPONSE', to: 'OPTED_OUT', trigger: 'Response received', mechanism: 'DETERMINISTIC_RULE', guard: 'Response expresses opt-out.', authority: 3 },
      { id: 'dp-t10', from: 'AWAITING_RESPONSE', to: 'REACTIVATION_ATTEMPTED', trigger: 'Cadence due', mechanism: 'DETERMINISTIC_RULE', guard: 'No response, attempt budget not exhausted, cadence interval elapsed.', authority: 3 },
      { id: 'dp-t11', from: 'AWAITING_RESPONSE', to: 'ATTEMPTS_EXHAUSTED', trigger: 'Cadence due', mechanism: 'DETERMINISTIC_RULE', guard: 'Declared maximum attempts reached.', authority: 3 },
      { id: 'dp-t12', from: 'AWAITING_RESPONSE', to: 'NEEDS_HUMAN', trigger: 'Response received', mechanism: 'DETERMINISTIC_RULE', guard: 'Response is off-script, raises a complaint, or falls below the confidence floor.', authority: 2 },
      { id: 'dp-t13', from: 'POSITIVE_RESPONSE', to: 'REOPENED', trigger: 'Human acceptance', mechanism: 'HUMAN_DECISION', guard: 'A named owner accepted the opportunity back into the active pipeline.', authority: 2 },
      { id: 'dp-t14', from: 'POSITIVE_RESPONSE', to: 'NEEDS_HUMAN', trigger: 'Routing', mechanism: 'DETERMINISTIC_RULE', guard: 'No owner is available within the configured window.', authority: 2 },
      { id: 'dp-t15', from: 'ATTEMPTS_EXHAUSTED', to: 'COOLING_OFF', trigger: 'Sequence exit', mechanism: 'DETERMINISTIC_RULE', guard: 'Exit condition met; cooling-off period begins.', authority: 3 },
      { id: 'dp-t16', from: 'COOLING_OFF', to: 'ELIGIBILITY_REVIEW', trigger: 'Cooling-off elapsed', mechanism: 'DETERMINISTIC_RULE', guard: 'Declared cooling-off period elapsed and a NEW re-entry reason exists.', authority: 3 },
      { id: 'dp-t17', from: 'COOLING_OFF', to: 'ARCHIVED', trigger: 'Cooling-off elapsed', mechanism: 'DETERMINISTIC_RULE', guard: 'Cooling-off elapsed with no new re-entry reason.', authority: 3 },
      { id: 'dp-t18', from: 'NEEDS_HUMAN', to: 'REOPENED', trigger: 'Human decision', mechanism: 'HUMAN_DECISION', guard: 'A person judged the record worth reactivating.', authority: 2 },
      { id: 'dp-t19', from: 'NEEDS_HUMAN', to: 'ARCHIVED', trigger: 'Human decision', mechanism: 'HUMAN_DECISION', guard: 'A person closed the record.', authority: 2 },
      { id: 'dp-t20', from: 'NEEDS_HUMAN', to: 'SUPPRESSED', trigger: 'Human decision', mechanism: 'HUMAN_DECISION', guard: 'A person applied suppression.', authority: 2 },
    ],
  },

  deterministicDecisions: [
    'Consent and suppression screening, re-checked immediately before each despatch',
    'Re-entry reason evaluation against the declared set',
    'Attempt budget and cadence interval accounting',
    'Cooling-off period accounting',
    'Duplicate outreach detection across concurrent sequences',
    'Exit condition evaluation',
  ],
  aiJudgments: [
    'Interpreting whether an observed account event constitutes a relevant change',
    'Interpreting the intent of a free-text response',
  ],
  humanOnlyActions: [
    'Defining a campaign or segment',
    'Accepting a reopened opportunity into the active pipeline',
    'Granting an exception to cadence or attempt limits',
    'Overriding suppression state',
  ],
  possibleActions: [
    'Suppress the record',
    'Archive the record',
    'Schedule a future evaluation',
    'Despatch one sequence attempt',
    'Route to a named owner',
    'Return the record to the active pipeline',
  ],

  aiBoundary: [
    'May not treat inactivity alone as authority to make contact',
    'May not override suppression or consent state',
    'May not exceed the declared attempt budget or cadence',
    'May not assert that an account event occurred without a source record for it',
    'May not enter an existing customer into prospecting outreach',
  ],
  guardrails: [
    'Every re-entry carries an explicit recorded reason drawn from a declared set',
    'Consent is re-checked immediately before each despatch, not once at segment build time',
    'Every sequence declares entry criteria, cadence, maximum attempts, exit, suppression, and re-entry conditions before it may run',
    'Engagement proxies such as opens are excluded from success criteria',
    'Concurrent sequences cannot both contact the same entity',
  ],

  metrics: [
    { id: 'dp-evaluated', name: 'Dormant records evaluated', kind: 'COVERAGE', definition: 'Count of distinct dormant records passed through eligibility review in the cycle.', unit: 'records', sourceOfTruth: 'Workflow store' },
    { id: 'dp-eligibility-rate', name: 'Eligibility rate', kind: 'LEADING', definition: 'Records with a valid declared re-entry reason and permitted consent state, divided by records evaluated.', unit: 'percent', sourceOfTruth: 'Workflow store' },
    { id: 'dp-suppression-rate', name: 'Suppression rate', kind: 'RELIABILITY', definition: 'Records dispositioned as suppressed, divided by records evaluated.', unit: 'percent', sourceOfTruth: 'Suppression register' },
    { id: 'dp-attempts', name: 'Reactivation attempts', kind: 'LEADING', definition: 'Count of executed outreach attempts, excluding attempts suppressed as duplicates.', unit: 'attempts', sourceOfTruth: 'Side-effect ledger' },
    { id: 'dp-positive-replies', name: 'Positive replies', kind: 'LAGGING', definition: 'Responses interpreted as interest at or above the confidence floor, confirmed by a human acceptance.', unit: 'replies', sourceOfTruth: 'Workflow store' },
    { id: 'dp-reopened', name: 'Reopened opportunities', kind: 'LAGGING', definition: 'Records returned to the active pipeline under a named owner.', unit: 'opportunities', sourceOfTruth: 'Customer system of record' },
    { id: 'dp-recovered-value', name: 'Recovered pipeline value', kind: 'LAGGING', definition: 'Sum of opportunity values for reopened records at the stage value recorded on reopening. Recognised as pipeline, not revenue.', unit: 'currency', sourceOfTruth: 'Customer system of record' },
    { id: 'dp-time-to-action', name: 'Trigger-to-action latency', kind: 'LEADING', definition: 'Elapsed time from the re-entry reason becoming true to the first executed attempt.', unit: 'hours', sourceOfTruth: 'Side-effect ledger' },
    { id: 'dp-optout-rate', name: 'Opt-out rate', kind: 'RELIABILITY', definition: 'Opt-outs received divided by executed attempts. A rising value indicates the segment is being over-worked.', unit: 'percent', sourceOfTruth: 'Suppression register' },
    { id: 'dp-duplicate-outreach', name: 'Duplicate outreach rate', kind: 'RELIABILITY', definition: 'Executed attempts sharing an idempotency key or entity with a concurrent sequence, divided by executed attempts. Lab target is zero.', unit: 'percent', sourceOfTruth: 'Side-effect ledger' },
    { id: 'dp-disposition-coverage', name: 'Terminal disposition coverage', kind: 'COVERAGE', definition: 'Share of evaluated records holding a terminal, waiting, or human-review state at cycle end.', unit: 'percent', sourceOfTruth: 'Workflow store' },
  ],

  standards: [
    {
      id: 'dp-std-consent',
      statement:
        'Commercial email requires a working opt-out honoured within 10 business days, and addresses that have opted out may not be sold or transferred. Permission is a property of the contact, not of the campaign.',
      provenance: 'EVIDENCE',
      verification: 'VERIFIED',
      sourceIds: ['ftc-can-spam'],
      appliesTo:
        'Makes suppression a terminal disposition evaluated before eligibility, and makes overriding it a human-only action. Sets the legal floor; an operator policy may be stricter.',
    },
    {
      id: 'dp-std-opens-unreliable',
      statement:
        'Email open tracking is unreliable as a signal of recipient attention. Apple Mail preloads remote content on receipt rather than on open and prevents senders from seeing whether a message was opened, so tracking pixels fire regardless of whether anyone read the message.',
      provenance: 'EVIDENCE',
      verification: 'VERIFIED',
      sourceIds: ['apple-mpp'],
      appliesTo:
        'Excludes opens and open-derived rates from every success criterion and from the re-entry reason set. Reply, meeting, and reopened-opportunity are used instead.',
    },
    {
      id: 'dp-std-at-least-once',
      statement:
        'Event and job delivery is at-least-once, so a reactivation attempt can be triggered more than once for the same record unless external actions are keyed and deduplicated.',
      provenance: 'EVIDENCE',
      verification: 'VERIFIED',
      sourceIds: ['stripe-webhooks'],
      appliesTo: 'Justifies keying every outreach attempt and tracking duplicate outreach as a reliability metric.',
    },
    {
      id: 'dp-lab-explicit-reason',
      statement:
        'No record may enter outreach without an explicit re-entry reason drawn from the declared set. Elapsed inactivity is not a reason.',
      provenance: 'LAB_TARGET',
      verification: 'NOT_APPLICABLE',
      sourceIds: [],
      appliesTo: 'The eligibility transition guard, which rejects records lacking a declared reason.',
    },
    {
      id: 'dp-lab-sequence-contract',
      statement:
        'Every sequence declares entry criteria, cadence, maximum attempts, exit conditions, suppression conditions, and re-entry conditions before it is permitted to run.',
      provenance: 'LAB_TARGET',
      verification: 'NOT_APPLICABLE',
      sourceIds: [],
      appliesTo: 'Sequence definition validation and the attempts-exhausted exit path.',
    },
  ],

  failureModes: [
    {
      id: 'dp-fm-suppression',
      class: 'SUPPRESSION_STATE',
      failure: 'A suppressed or opted-out contact receives reactivation outreach.',
      cause: 'Consent evaluated at segment build time and gone stale by despatch, or held in a system not consulted.',
      businessImpact: 'Legal exposure and permanent loss of the contact. The most severe failure in this system.',
      prevention: 'Consent is re-checked immediately before each despatch as a transition guard.',
      detection: 'Suppression register lookup at despatch time.',
      recovery: 'Halt the sequence, move to SUPPRESSED, and block every pending effect for the entity.',
      escalationCondition: 'Any executed attempt to a suppressed contact.',
      authorityRequired: 4,
      terminalState: 'SUPPRESSED.',
      verificationTest: 'Pending — scenario not yet authored.',
    },
    {
      id: 'dp-fm-duplicate-outreach',
      class: 'RETRY_DUPLICATE_SIDE_EFFECT',
      failure: 'The same contact receives the same attempt twice, or is worked by two sequences at once.',
      cause: 'Job retry, overlapping segment definitions, or a record matching two campaigns.',
      businessImpact: 'Reads as spam, raises opt-out rate, and burns a recoverable record.',
      prevention: 'Attempts are keyed per entity and sequence step; concurrent sequence membership is rejected at eligibility.',
      detection: 'Idempotency key already claimed, or entity present in another running sequence.',
      recovery: 'Suppress the duplicate attempt and record it.',
      retryPolicy: 'Bounded retry; the key makes retries safe.',
      escalationCondition: 'Duplicate outreach rate above zero.',
      authorityRequired: 3,
      terminalState: 'No state change; attempt recorded as SUPPRESSED_DUPLICATE.',
      verificationTest: 'Pending — scenario not yet authored.',
    },
    {
      id: 'dp-fm-stale-data',
      class: 'STALE_DATA',
      failure: 'Outreach references an account fact that is no longer true.',
      cause: 'Segment built from a snapshot; the underlying record changed before despatch.',
      businessImpact: 'The message is visibly wrong, which damages credibility more than silence would.',
      prevention: 'Re-read the referenced facts at despatch time and abort if they no longer hold.',
      detection: 'Freshness comparison between snapshot and system of record.',
      recovery: 'Abort the attempt, return to eligibility review.',
      escalationCondition: 'Repeated staleness on a segment, indicating too long a build-to-send gap.',
      authorityRequired: 2,
      terminalState: 'ELIGIBILITY_REVIEW.',
      verificationTest: 'Pending — scenario not yet authored.',
    },
    {
      id: 'dp-fm-wrong-entity',
      class: 'WRONG_ENTITY_MATCH',
      failure: 'A dormant record is matched to the wrong person or account.',
      cause: 'Shared inbox addresses, role accounts, or a merged duplicate resolving incorrectly.',
      businessImpact: 'Confidential commercial history is disclosed to the wrong party.',
      prevention: 'Match on a stable identifier; ambiguous matches route to review rather than resolving to the closest candidate.',
      detection: 'Multiple candidate entities above the match threshold.',
      recovery: 'Route to human review with all candidates attached.',
      escalationCondition: 'Any ambiguous match involving commercially sensitive history.',
      authorityRequired: 2,
      terminalState: 'NEEDS_HUMAN.',
      verificationTest: 'Pending — scenario not yet authored.',
    },
    {
      id: 'dp-fm-existing-customer',
      class: 'POLICY_VIOLATION',
      failure: 'An existing customer is entered into prospecting outreach.',
      cause: 'Segment defined on pipeline stage without excluding active accounts.',
      businessImpact: 'A paying client receives a cold pitch for something they already buy.',
      prevention: 'Active customer status is an eligibility exclusion evaluated before the re-entry reason.',
      detection: 'Active engagement or retainer present on the resolved entity.',
      recovery: 'Archive the record from the sequence and route to the account owner.',
      escalationCondition: 'Any executed attempt to an active customer.',
      authorityRequired: 3,
      terminalState: 'ARCHIVED.',
      verificationTest: 'Pending — scenario not yet authored.',
    },
  ],

  maturity: 'CONCEPT',
  fidelityNote:
    'Business canon, lifecycle graph, metrics, standards, and failure modes are defined and validated. No executable scenario exists yet, so nothing in this system runs. It is deliberately labelled CONCEPT rather than SIMULATED until a scenario replays through the engine.',
} satisfies Parameters<typeof SystemDefinitionSchema.parse>[0];

export const DORMANT_PIPELINE_RECOVERY: SystemDefinition = SystemDefinitionSchema.parse(RAW);
