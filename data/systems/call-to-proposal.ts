import { SystemDefinitionSchema, type SystemDefinition } from '@/lib/model/system';

/** CALL-TO-PROPOSAL REVENUE AGENT — vertical-agnostic system definition. */

const RAW = {
  id: 'call-to-proposal',
  slug: 'call-to-proposal',
  name: 'Call-to-Proposal Revenue Agent',
  order: 3,

  businessProblem:
    'Commercial truth established during a discovery conversation is lost or distorted on the way into follow-up, scope, the customer record, and the proposal.',
  economicLeakage:
    'The most expensive input in the sale — senior time in a live conversation — is partially discarded within hours. What survives is reconstructed from memory, so scope drifts, promises go unrecorded, and the resulting proposal is negotiated against facts nobody verified.',
  buyerOutcome:
    'A completed conversation becomes a verified, human-reviewable commercial package in which every asserted fact traces to something actually said, and everything unknown is visibly still unknown.',

  triggers: [
    'A conversation transcript becomes available',
    'A person supplies a clarification for a recorded gap',
    'A reviewer requests a revision',
  ],
  sourcesOfTruth: [
    'The transcript is authoritative for what was said',
    'The customer system of record is authoritative for account and opportunity identity',
    'The approved rate card is authoritative for commercial terms',
  ],
  entities: ['Transcript', 'Structured commercial record', 'Claim', 'Gap', 'Proposal draft', 'Approval'],

  lifecycle: {
    states: [
      { id: 'TRANSCRIPT_RECEIVED', label: 'Transcript received', kind: 'INITIAL', description: 'Source material is available and nothing has been extracted from it yet.' },
      { id: 'EXTRACTING', label: 'Extracting', kind: 'ACTIVE', description: 'A bounded judgment is mapping the transcript onto the structured commercial record.' },
      { id: 'STRUCTURED_RECORD', label: 'Structured record', kind: 'ACTIVE', description: 'Fields are populated and each carries a reference back to its supporting passage.' },
      { id: 'GAPS_IDENTIFIED', label: 'Gaps identified', kind: 'ACTIVE', description: 'Required fields the transcript did not establish are listed as unknown.' },
      { id: 'AWAITING_CLARIFICATION', label: 'Awaiting clarification', kind: 'WAITING', description: 'A gap was put to a person and the system is parked awaiting the answer.' },
      { id: 'CLAIMS_REVIEW', label: 'Claims review', kind: 'ACTIVE', description: 'Every asserted claim is being tested against its cited evidence.' },
      { id: 'DRAFT_PREPARED', label: 'Draft prepared', kind: 'ACTIVE', description: 'A proposal draft exists. It has not been seen by anyone outside the firm.' },
      { id: 'AWAITING_APPROVAL', label: 'Awaiting approval', kind: 'HUMAN_REVIEW', description: 'Held at authority level 2. Nothing may leave the firm from this state without a person acting.' },
      { id: 'REVISION_REQUESTED', label: 'Revision requested', kind: 'ACTIVE', description: 'A reviewer rejected the draft with recorded reasons.' },
      { id: 'APPROVED_SENT', label: 'Approved and sent', kind: 'TERMINAL_SUCCESS', description: 'A named person approved the package and it was despatched.' },
      { id: 'REJECTED', label: 'Rejected', kind: 'TERMINAL_NEUTRAL', description: 'A person judged the package should not be sent.' },
      { id: 'NEEDS_HUMAN', label: 'Needs human', kind: 'HUMAN_REVIEW', description: 'Extraction or claims review exceeded the system’s authority or confidence.' },
      { id: 'FAILED_TERMINAL', label: 'Failed — terminal', kind: 'TERMINAL_FAILURE', description: 'The package cannot be produced from the available material. Recorded explicitly.' },
    ],
    transitions: [
      { id: 'cp-t01', from: 'TRANSCRIPT_RECEIVED', to: 'EXTRACTING', trigger: 'Transcript available', mechanism: 'DETERMINISTIC_RULE', guard: 'Transcript passes schema and minimum length validation.', authority: 3 },
      { id: 'cp-t02', from: 'EXTRACTING', to: 'STRUCTURED_RECORD', trigger: 'Extraction returned', mechanism: 'BOUNDED_AI_JUDGMENT', guard: 'Output satisfies the record contract and every populated field cites a passage.', authority: 1 },
      { id: 'cp-t03', from: 'EXTRACTING', to: 'NEEDS_HUMAN', trigger: 'Extraction returned', mechanism: 'DETERMINISTIC_RULE', guard: 'Output violated its contract, or confidence fell below the configured floor.', authority: 2 },
      { id: 'cp-t04', from: 'STRUCTURED_RECORD', to: 'GAPS_IDENTIFIED', trigger: 'Coverage check', mechanism: 'DETERMINISTIC_RULE', guard: 'Required-field coverage computed against the declared record schema.', authority: 3 },
      { id: 'cp-t05', from: 'GAPS_IDENTIFIED', to: 'AWAITING_CLARIFICATION', trigger: 'Gap routing', mechanism: 'DETERMINISTIC_RULE', guard: 'At least one gap is material to scope or commercial terms.', authority: 3 },
      { id: 'cp-t06', from: 'GAPS_IDENTIFIED', to: 'CLAIMS_REVIEW', trigger: 'Gap routing', mechanism: 'DETERMINISTIC_RULE', guard: 'No remaining gap is material; immaterial gaps stay marked unknown.', authority: 3 },
      { id: 'cp-t07', from: 'AWAITING_CLARIFICATION', to: 'CLAIMS_REVIEW', trigger: 'Clarification supplied', mechanism: 'HUMAN_DECISION', guard: 'A person supplied the missing fact and it was recorded with them as its source.', authority: 2 },
      { id: 'cp-t08', from: 'AWAITING_CLARIFICATION', to: 'NEEDS_HUMAN', trigger: 'Clarification window elapsed', mechanism: 'DETERMINISTIC_RULE', guard: 'No clarification within the configured window.', authority: 2 },
      { id: 'cp-t09', from: 'CLAIMS_REVIEW', to: 'DRAFT_PREPARED', trigger: 'Claims evaluated', mechanism: 'DETERMINISTIC_RULE', guard: 'Every asserted claim resolves to a cited passage or a human-supplied fact. Zero unsupported claims.', authority: 3 },
      { id: 'cp-t10', from: 'CLAIMS_REVIEW', to: 'NEEDS_HUMAN', trigger: 'Claims evaluated', mechanism: 'DETERMINISTIC_RULE', guard: 'At least one claim has no supporting evidence.', authority: 2 },
      { id: 'cp-t11', from: 'DRAFT_PREPARED', to: 'AWAITING_APPROVAL', trigger: 'Draft complete', mechanism: 'DETERMINISTIC_RULE', guard: 'Draft assembled and routed to a person with approval authority.', authority: 2 },
      { id: 'cp-t12', from: 'AWAITING_APPROVAL', to: 'APPROVED_SENT', trigger: 'Human decision', mechanism: 'HUMAN_DECISION', guard: 'A named person with the required authority approved despatch.', authority: 2 },
      { id: 'cp-t13', from: 'AWAITING_APPROVAL', to: 'REVISION_REQUESTED', trigger: 'Human decision', mechanism: 'HUMAN_DECISION', guard: 'A reviewer recorded required changes.', authority: 2 },
      { id: 'cp-t14', from: 'AWAITING_APPROVAL', to: 'REJECTED', trigger: 'Human decision', mechanism: 'HUMAN_DECISION', guard: 'A reviewer judged the package should not be sent at all.', authority: 2 },
      { id: 'cp-t15', from: 'REVISION_REQUESTED', to: 'DRAFT_PREPARED', trigger: 'Revision applied', mechanism: 'DETERMINISTIC_RULE', guard: 'Recorded changes applied and the revision budget is not exhausted.', authority: 3 },
      { id: 'cp-t16', from: 'NEEDS_HUMAN', to: 'DRAFT_PREPARED', trigger: 'Human decision', mechanism: 'HUMAN_DECISION', guard: 'A person resolved the unsupported claim or supplied the missing fact.', authority: 2 },
      { id: 'cp-t17', from: 'NEEDS_HUMAN', to: 'REJECTED', trigger: 'Human decision', mechanism: 'HUMAN_DECISION', guard: 'A person judged the package should not proceed.', authority: 2 },
      { id: 'cp-t18', from: 'NEEDS_HUMAN', to: 'FAILED_TERMINAL', trigger: 'Human decision', mechanism: 'HUMAN_DECISION', guard: 'The material cannot support a package and no clarification is available.', authority: 2 },
    ],
  },

  deterministicDecisions: [
    'Transcript schema and minimum-length validation',
    'Required-field coverage against the declared record schema',
    'Materiality classification of each gap',
    'Claim-to-evidence resolution: every asserted claim must cite a passage or a human-supplied fact',
    'Commercial term validation against the approved rate card',
    'Revision budget accounting',
    'Approval authority verification',
  ],
  aiJudgments: [
    'Mapping conversational language onto structured commercial record fields',
    'Identifying which required fields the conversation did and did not establish',
    'Summarising stated objections and risks without resolving them',
  ],
  humanOnlyActions: [
    'Approving despatch of any proposal or commercial commitment',
    'Supplying a fact the transcript did not establish',
    'Agreeing pricing outside the approved rate card',
    'Rejecting or terminating the package',
  ],
  possibleActions: [
    'Populate a structured commercial record field with a cited passage',
    'Record a gap as unknown',
    'Ask a person to close a material gap',
    'Assemble a proposal draft',
    'Route for approval',
    'Despatch an approved package',
  ],

  aiBoundary: [
    'May not assert a commercial fact the transcript did not establish',
    'May not convert an unknown into a plausible default',
    'May not propose terms outside the approved rate card',
    'May not despatch anything externally at any confidence level',
    'May not resolve a stated objection on the buyer’s behalf',
    'May not infer budget, authority, or timing that was not discussed',
  ],
  guardrails: [
    'Every populated field carries a reference to the passage supporting it',
    'Unknown fields remain visibly unknown and are never defaulted',
    'A claim without supporting evidence blocks the draft rather than being softened',
    'Human-supplied facts are recorded with the person as their source, distinct from transcript-derived facts',
    'Despatch is capped at authority level 2 regardless of confidence',
  ],

  metrics: [
    { id: 'cp-extract-latency', name: 'Transcript-to-record latency', kind: 'LEADING', definition: 'Elapsed time from transcript availability to a structured record satisfying its contract.', unit: 'minutes', sourceOfTruth: 'Workflow store' },
    { id: 'cp-field-coverage', name: 'Required-field coverage', kind: 'COVERAGE', definition: 'Required fields populated with a cited source, divided by required fields in the declared schema. Fields marked unknown count as uncovered, deliberately.', unit: 'percent', sourceOfTruth: 'Structured commercial record' },
    { id: 'cp-unknown-accuracy', name: 'Unknowns correctly marked', kind: 'RELIABILITY', definition: 'Fields marked unknown that a human reviewer agrees were genuinely not established, divided by fields marked unknown.', unit: 'percent', sourceOfTruth: 'Reviewer annotations' },
    { id: 'cp-unsupported-claims', name: 'Unsupported claims', kind: 'RELIABILITY', definition: 'Count of asserted claims that resolve to no cited passage and no human-supplied fact. The lab target for this metric is zero.', unit: 'claims', sourceOfTruth: 'Claims review' },
    { id: 'cp-human-corrections', name: 'Human corrections', kind: 'RELIABILITY', definition: 'Count of reviewer edits that change a fact rather than wording, per package.', unit: 'corrections', sourceOfTruth: 'Reviewer annotations' },
    { id: 'cp-draft-latency', name: 'Proposal draft latency', kind: 'LEADING', definition: 'Elapsed time from transcript availability to a draft routed for approval.', unit: 'hours', sourceOfTruth: 'Workflow store' },
    { id: 'cp-revision-count', name: 'Revision count', kind: 'RELIABILITY', definition: 'Mean number of revision cycles per package before approval or rejection.', unit: 'cycles', sourceOfTruth: 'Workflow store' },
    { id: 'cp-scope-discrepancy', name: 'Scope discrepancy', kind: 'LAGGING', definition: 'Count of engagements where delivered scope differed materially from proposed scope, divided by engagements started.', unit: 'percent', sourceOfTruth: 'Delivery workspace joined to proposal record' },
    { id: 'cp-acceptance', name: 'Proposal acceptance rate', kind: 'LAGGING', definition: 'Packages accepted divided by packages despatched.', unit: 'percent', sourceOfTruth: 'Customer system of record' },
  ],

  standards: [
    {
      id: 'cp-std-confabulation',
      statement:
        'Generative models produce fluent output that is not grounded in their input. Confabulation is a named primary risk category requiring managed controls, not an occasional defect to be tuned away.',
      provenance: 'EVIDENCE',
      verification: 'VERIFIED',
      sourceIds: ['nist-ai-600-1'],
      appliesTo:
        'Justifies the entire claim-to-evidence architecture: cited passages on every populated field, explicit declined inferences, and a claims review that blocks the draft rather than softening the language.',
    },
    {
      id: 'cp-std-human-oversight',
      statement:
        'Human oversight and intervention are governance-level controls in recognised AI risk management practice, alongside content provenance and pre-deployment testing.',
      provenance: 'EVIDENCE',
      verification: 'VERIFIED',
      sourceIds: ['nist-ai-600-1'],
      appliesTo:
        'Justifies capping despatch at authority level 2 and treating approval as a lifecycle state rather than a notification.',
      correction:
        'The cited profile is a governance framework, not a technical standard. It prescribes no thresholds, so the confidence floor and revision budget used here are operator policy, not derived from it.',
    },
    {
      id: 'cp-std-next-step-capture',
      statement:
        "Current CRM practice treats a call's recommended next step as a structured, reviewable output distinct from freeform notes, gated by objective capture criteria.",
      provenance: 'EVIDENCE',
      verification: 'VERIFIED',
      sourceIds: ['hubspot-next-steps'],
      appliesTo:
        'Justifies representing agreed next step and its owner as required structured-record fields rather than leaving them in prose notes.',
      correction:
        'The cited page documents a beta product feature, not a study of outcomes. It supports treating structured next-step capture as current practice, not that it causes better results.',
    },
    {
      id: 'cp-std-pipeline-exit-criteria',
      statement:
        'Current pipeline-management guidance holds that a deal should only advance to the next stage when defined, measurable exit criteria for the current stage are actually met, not on rep judgment or activity alone.',
      provenance: 'EVIDENCE',
      verification: 'VERIFIED',
      sourceIds: ['salesforce-pipeline-exit-criteria'],
      appliesTo:
        'Justifies required-field coverage as a computed gate the record must satisfy before progressing to claims review, and justifies material gaps blocking progress until resolved.',
    },
    {
      id: 'cp-lab-zero-unsupported',
      statement:
        'A package containing any claim that resolves to no cited passage and no human-supplied fact does not reach a reviewer.',
      provenance: 'LAB_TARGET',
      verification: 'NOT_APPLICABLE',
      sourceIds: [],
      appliesTo: 'The claims review transition guard, which routes to human review rather than proceeding.',
    },
    {
      id: 'cp-lab-unknown-stays-unknown',
      statement:
        'Information the conversation did not establish remains marked unknown through the whole pipeline and is never replaced by a plausible default.',
      provenance: 'LAB_TARGET',
      verification: 'NOT_APPLICABLE',
      sourceIds: [],
      appliesTo: 'Required-field coverage, which deliberately counts unknown fields as uncovered rather than filling them.',
    },
    {
      id: 'cp-lab-source-attribution',
      statement:
        'Facts supplied by a person during clarification are recorded with that person as their source, distinguishable from facts derived from the transcript.',
      provenance: 'LAB_TARGET',
      verification: 'NOT_APPLICABLE',
      sourceIds: [],
      appliesTo: 'Provenance of every field in the structured commercial record.',
    },
  ],

  failureModes: [
    {
      id: 'cp-fm-unsupported-inference',
      class: 'AI_UNSUPPORTED_INFERENCE',
      failure: 'The record asserts a commercial fact the conversation never established.',
      cause: 'Fluent completion of a familiar commercial pattern — an inferred budget, an assumed decision-maker, a plausible timeline.',
      businessImpact: 'The invented fact is priced, proposed, and then contradicted by the buyer, damaging credibility at the moment of commitment.',
      prevention: 'Every populated field must cite a passage; unresolved fields must be declared unknown by the output contract.',
      detection: 'Claims review resolves each asserted claim against its citation.',
      recovery: 'Return the claim to unknown and route the gap for clarification.',
      escalationCondition: 'Any unsupported claim reaching a reviewer.',
      authorityRequired: 2,
      recoveryPath: {
        shape: 'MOVES',
        moves: [{ from: 'CLAIMS_REVIEW', to: 'NEEDS_HUMAN' }],
        note: 'The claim is returned to unknown; the gap goes to a person rather than into the draft.',
      },
      verificationTest: 'tests/call-to-proposal.test.ts — the unsupported-scope-claim-blocked scenario and the claim-admission-gate unit tests',
    },
    {
      id: 'cp-fm-malformed-output',
      class: 'AI_MALFORMED_OUTPUT',
      failure: 'Extraction returns output that does not satisfy the record contract.',
      cause: 'Model drift, prompt regression, or an unusually structured transcript.',
      businessImpact: 'Downstream deterministic checks receive fields they cannot validate.',
      prevention: 'Schema validation at the port before the result is returned to the engine.',
      detection: 'Contract validation failure in the DecisionProvider port.',
      recovery: 'Route to human review with the raw transcript. Never coerce partial output into the schema.',
      retryPolicy: 'At most one re-request before routing to review.',
      escalationCondition: 'Repeated contract violations on the same transcript format.',
      authorityRequired: 2,
      recoveryPath: {
        shape: 'MOVES',
        moves: [{ from: 'EXTRACTING', to: 'NEEDS_HUMAN' }],
        note: 'The raw transcript travels with it. Partial output is never coerced into the schema.',
      },
      verificationTest: 'tests/extraction-provider.test.ts — schema-invalid and mis-cited output is refused; tests/call-to-proposal.test.ts — an unavailable extraction routes to NEEDS_HUMAN',
    },
    {
      id: 'cp-fm-missing-fields',
      class: 'MISSING_REQUIRED_FIELD',
      failure: 'A material commercial field is absent and no one notices before the proposal is written.',
      cause: 'The conversation genuinely did not cover it, and its absence is easy to overlook in prose.',
      businessImpact: 'Scope is priced against an assumption, producing a change order or a margin loss later.',
      prevention: 'Required-field coverage is computed structurally, and unknown counts as uncovered.',
      detection: 'Coverage check against the declared record schema.',
      recovery: 'Route the material gap for clarification and hold the draft.',
      escalationCondition: 'Clarification window elapses without an answer.',
      authorityRequired: 2,
      recoveryPath: {
        shape: 'MOVES',
        moves: [
          { from: 'GAPS_IDENTIFIED', to: 'AWAITING_CLARIFICATION' },
          { from: 'AWAITING_CLARIFICATION', to: 'NEEDS_HUMAN' },
        ],
        note: 'The second movement is the timeout path, and remains undriven by any event.',
      },
      verificationTest: 'tests/call-to-proposal.test.ts — a call missing exactly one material field routes to AWAITING_CLARIFICATION and resolves once a person supplies it. The timeout-to-NEEDS_HUMAN edge itself remains unexercised — no event drives it yet.',
    },
    {
      id: 'cp-fm-policy-violation',
      class: 'POLICY_VIOLATION',
      failure: 'Draft text promises an outcome the firm does not control, or terms outside the approved rate card.',
      cause: 'Generated language optimising for persuasiveness against a buyer who asked for certainty.',
      businessImpact: 'A commitment the firm cannot honour, made in writing, before any person reviewed it.',
      prevention: 'Commercial terms validated against the rate card deterministically; prohibited commitment language screened before assembly.',
      detection: 'Rate card comparison and prohibited-language screen.',
      recovery: 'Block assembly and route to review with the offending passage identified.',
      escalationCondition: 'Any prohibited commitment reaching a draft.',
      authorityRequired: 2,
      recoveryPath: {
        shape: 'MOVES',
        moves: [{ from: 'CLAIMS_REVIEW', to: 'NEEDS_HUMAN' }],
        note: 'Assembly is blocked and the offending passage is identified for the reviewer.',
      },
      verificationTest: 'tests/call-to-proposal.test.ts — the claim-admission gate blocks any claim value containing a prohibited-commitment phrase, regardless of source or citation',
    },
    {
      id: 'cp-fm-review-timeout',
      class: 'HUMAN_APPROVAL_TIMEOUT',
      failure: 'A package routed to a person for review is never picked up.',
      cause: 'The package failed a gate — an unavailable extraction, or a claim that could not be admitted — and is waiting for whoever gets to it. Unlike an approval, nobody in particular was asked.',
      businessImpact: 'The conversation that produced it goes cold while the system reports the package as correctly parked. This is the failure the system was bought to remove, arriving one step earlier than the approval timeout.',
      prevention: 'A review clock starts at every genuine entry into review and is never restarted by re-reading the case.',
      detection: 'Age of packages in NEEDS_HUMAN against the configured review window.',
      recovery: 'Escalate to the final escalation point as an attention condition. There is no assignee to escalate past, so this differs deliberately from cp-fm-approval-timeout.',
      escalationCondition: 'Review window elapsed without a decision.',
      authorityRequired: 2,
      recoveryPath: {
        shape: 'HOLDS_POSITION',
        holdsAt: ['NEEDS_HUMAN'],
        note: 'The package stays in NEEDS_HUMAN. Escalation raises the fact that nobody has looked at it; it never resolves the claim, supplies the missing fact, or decides the package. Distinct from cp-fm-approval-timeout, which escalates PAST a named approver — here nobody was named, so escalation goes to the top of the chain rather than one rung above somebody.',
      },
      verificationTest: 'tests/call-to-proposal-review-timeout.test.ts — the review clock starts at both genuine entries into NEEDS_HUMAN, a check inside the window takes no action, a check past it escalates to the final escalation point and says plainly that no reviewer was ever assigned, the package never transitions, and repeated checks escalate once.',
    },
    {
      id: 'cp-fm-approval-timeout',
      class: 'HUMAN_APPROVAL_TIMEOUT',
      failure: 'A draft waits for approval past the promised delivery window.',
      cause: 'Reviewer unavailable, or no named approver assigned at routing time.',
      businessImpact: 'A promised follow-up arrives late, which is the exact failure the system was bought to remove.',
      prevention: 'Named approver and review window assigned at the moment of routing.',
      detection: 'Age of drafts in AWAITING_APPROVAL against the promised window.',
      recovery: 'Escalate to the next approver in the authority chain.',
      escalationCondition: 'Promised delivery window elapsed.',
      authorityRequired: 2,
      recoveryPath: {
        shape: 'HOLDS_POSITION',
        holdsAt: ['AWAITING_APPROVAL'],
        note: 'The draft stays in AWAITING_APPROVAL. Escalation changes who is asked, not where the case is — a timeout must never decide a proposal on its own. Escalation is strictly upward, resolved above the assigned approver’s own authority ceiling, so a draft can never be escalated to the person who is already not responding.',
      },
      verificationTest: 'tests/call-to-proposal-approval-timeout.test.ts — routing records the approver, the window, and the declared next approver; a check inside the window takes no action; past it, escalation goes strictly past the assignee, an approver at the top of the ladder records an exhausted chain and notifies nobody, and a business that has named no approver reports an unowned draft rather than a late reviewer. No branch sets a lifecycle transition. Replayable as the approval-window-elapses scenario.',
    },
  ],

  maturity: 'SIMULATED',
  fidelityNote:
    'Two scenarios replay through the same engine core Lead Rescue and Dormant Pipeline Recovery proved: a discovery call whose every material fact is cited, sourced, or derived reaches an approved, despatched proposal; and a candidate claim that expands scope with zero supporting citation is refused before a draft can exist, regardless of its confidence. A third, smaller path shows a genuinely missing material fact routed to a person and closed by a recorded human answer. Extraction is the one bounded judgment, resolved through a dedicated port before the deterministic claim-admission gate, required-field coverage, scope derivation, and approval-authority checks run — none of which the judgment itself may bypass. As with the first two systems, nothing here is live: no message left this process, no model was called, and the business is fictional.',
} satisfies Parameters<typeof SystemDefinitionSchema.parse>[0];

export const CALL_TO_PROPOSAL: SystemDefinition = SystemDefinitionSchema.parse(RAW);
