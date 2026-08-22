import { SystemDefinitionSchema, type SystemDefinition } from '@/lib/model/system';

/** OWNER REVENUE INTELLIGENCE AGENT — vertical-agnostic system definition. */

const RAW = {
  id: 'owner-revenue-intelligence',
  slug: 'owner-revenue-intelligence',
  name: 'Owner Revenue Intelligence Agent',
  order: 6,

  businessProblem:
    'Owners receive fragmented metrics from sales, delivery, billing, and finance, then still have to work out manually what changed, what is abnormal, why it matters, and what needs action now.',
  economicLeakage:
    'The scarcest resource in a founder-led business is the owner’s attention, and it is spent reconciling dashboards rather than deciding. Meanwhile the exceptions that matter — a concentration risk, a margin slide, a renewal cliff — stay invisible because no single dashboard owns them.',
  buyerOutcome:
    'Trusted cross-system state becomes a small number of evidence-linked business exceptions with recommended decisions, each showing where it came from, how fresh it is, and what it does not establish.',

  triggers: [
    'A scheduled analysis window closes',
    'A metric crosses a configured variance threshold',
    'A source system reports a freshness failure',
    'An owner records a decision on a surfaced exception',
  ],
  sourcesOfTruth: [
    'Each contributing system remains authoritative for its own domain; this system owns no primary facts',
    'The metric registry is authoritative for how each metric is defined',
    'The freshness record is authoritative for how current each input is',
  ],
  entities: ['Metric definition', 'Observation', 'Baseline', 'Exception', 'Evidence link', 'Recommendation', 'Decision'],

  lifecycle: {
    states: [
      { id: 'SIGNALS_COLLECTED', label: 'Signals collected', kind: 'INITIAL', description: 'Inputs gathered from contributing systems; nothing has been judged yet.' },
      { id: 'FRESHNESS_CHECKED', label: 'Freshness checked', kind: 'ACTIVE', description: 'Every input carries an age and a completeness assessment.' },
      { id: 'STALE_DATA_FLAGGED', label: 'Stale data flagged', kind: 'HUMAN_REVIEW', description: 'One or more inputs are too old or too incomplete to support a conclusion. Visibly identified rather than quietly used.' },
      { id: 'BASELINE_COMPARED', label: 'Baseline compared', kind: 'ACTIVE', description: 'Observations compared against a declared baseline or comparison period.' },
      { id: 'EXCEPTION_CANDIDATE', label: 'Exception candidate', kind: 'ACTIVE', description: 'Variance exceeded the configured threshold. Not yet corroborated.' },
      { id: 'CORROBORATING', label: 'Corroborating', kind: 'ACTIVE', description: 'Seeking independent supporting evidence from other systems before surfacing anything.' },
      { id: 'INSUFFICIENT_EVIDENCE', label: 'Insufficient evidence', kind: 'TERMINAL_NEUTRAL', description: 'Variance was real but could not be corroborated. Recorded rather than surfaced as a finding.' },
      { id: 'EXCEPTION_SURFACED', label: 'Exception surfaced', kind: 'ACTIVE', description: 'Corroborated and presented with its evidence, freshness, and stated limitations.' },
      { id: 'ACTION_RECOMMENDED', label: 'Action recommended', kind: 'ACTIVE', description: 'A recommendation exists, visibly distinguished from the facts that prompted it.' },
      { id: 'AWAITING_OWNER_DECISION', label: 'Awaiting owner decision', kind: 'HUMAN_REVIEW', description: 'Held for the owner. This system recommends and never executes.' },
      { id: 'DECISION_RECORDED', label: 'Decision recorded', kind: 'TERMINAL_SUCCESS', description: 'The owner decided, and the decision is recorded against the evidence that informed it.' },
      { id: 'DISMISSED', label: 'Dismissed', kind: 'TERMINAL_NEUTRAL', description: 'Judged not to require action, either by threshold or by the owner.' },
    ],
    transitions: [
      { id: 'or-t01', from: 'SIGNALS_COLLECTED', to: 'FRESHNESS_CHECKED', trigger: 'Analysis window closed', mechanism: 'DETERMINISTIC_RULE', guard: 'Every input carries a source reference and a timestamp.', authority: 3 },
      { id: 'or-t02', from: 'FRESHNESS_CHECKED', to: 'STALE_DATA_FLAGGED', trigger: 'Freshness evaluation', mechanism: 'DETERMINISTIC_RULE', guard: 'An input exceeds its configured staleness tolerance or fails completeness.', authority: 1 },
      { id: 'or-t03', from: 'FRESHNESS_CHECKED', to: 'BASELINE_COMPARED', trigger: 'Freshness evaluation', mechanism: 'DETERMINISTIC_RULE', guard: 'All inputs are within tolerance and complete.', authority: 3 },
      { id: 'or-t04', from: 'STALE_DATA_FLAGGED', to: 'BASELINE_COMPARED', trigger: 'Refresh succeeded', mechanism: 'DETERMINISTIC_RULE', guard: 'Inputs refreshed within tolerance.', authority: 3 },
      { id: 'or-t05', from: 'STALE_DATA_FLAGGED', to: 'INSUFFICIENT_EVIDENCE', trigger: 'Refresh failed', mechanism: 'DETERMINISTIC_RULE', guard: 'Inputs could not be refreshed within the window. No conclusion is drawn from stale data.', authority: 1 },
      { id: 'or-t06', from: 'BASELINE_COMPARED', to: 'EXCEPTION_CANDIDATE', trigger: 'Variance evaluation', mechanism: 'DETERMINISTIC_RULE', guard: 'Observed variance exceeds the configured threshold for that metric.', authority: 1 },
      { id: 'or-t07', from: 'BASELINE_COMPARED', to: 'DISMISSED', trigger: 'Variance evaluation', mechanism: 'DETERMINISTIC_RULE', guard: 'Variance within threshold. Recorded as evaluated, not silently dropped.', authority: 3 },
      { id: 'or-t08', from: 'EXCEPTION_CANDIDATE', to: 'CORROBORATING', trigger: 'Candidate raised', mechanism: 'DETERMINISTIC_RULE', guard: 'At least one independent corroborating source is identified for the metric.', authority: 1 },
      { id: 'or-t09', from: 'CORROBORATING', to: 'EXCEPTION_SURFACED', trigger: 'Corroboration evaluated', mechanism: 'DETERMINISTIC_RULE', guard: 'Independent evidence supports the variance and every figure resolves to a source record.', authority: 1 },
      { id: 'or-t10', from: 'CORROBORATING', to: 'INSUFFICIENT_EVIDENCE', trigger: 'Corroboration evaluated', mechanism: 'DETERMINISTIC_RULE', guard: 'No independent evidence supports the variance.', authority: 1 },
      { id: 'or-t11', from: 'EXCEPTION_SURFACED', to: 'ACTION_RECOMMENDED', trigger: 'Recommendation composed', mechanism: 'BOUNDED_AI_JUDGMENT', guard: 'A recommendation is composed and marked as recommendation, never as observed fact.', authority: 1 },
      { id: 'or-t12', from: 'ACTION_RECOMMENDED', to: 'AWAITING_OWNER_DECISION', trigger: 'Routed to owner', mechanism: 'DETERMINISTIC_RULE', guard: 'Exception, evidence, freshness, limitations, and required authority are all present.', authority: 1 },
      { id: 'or-t13', from: 'AWAITING_OWNER_DECISION', to: 'DECISION_RECORDED', trigger: 'Owner decision', mechanism: 'HUMAN_DECISION', guard: 'The owner recorded a decision.', authority: 2 },
      { id: 'or-t14', from: 'AWAITING_OWNER_DECISION', to: 'DISMISSED', trigger: 'Owner decision', mechanism: 'HUMAN_DECISION', guard: 'The owner judged no action required.', authority: 2 },
    ],
  },

  deterministicDecisions: [
    'Metric computation from the declared definition in the registry',
    'Freshness and completeness evaluation against configured tolerance',
    'Baseline selection and variance computation',
    'Threshold comparison per metric',
    'Corroboration requirement: at least one independent source before surfacing',
    'Provenance completeness: every figure must resolve to a source record',
  ],
  aiJudgments: [
    'Composing a plain-language explanation of what an exception means for the business',
    'Proposing candidate actions for the owner to consider',
  ],
  humanOnlyActions: [
    'Deciding any action arising from an exception',
    'Changing a metric definition',
    'Changing a variance threshold',
    'Accepting a causal explanation as established',
  ],
  possibleActions: [
    'Compute a metric from its declared definition',
    'Flag an input as stale',
    'Record a variance as within threshold',
    'Surface a corroborated exception with evidence',
    'Recommend an action for owner decision',
    'Record an owner decision against its evidence',
  ],

  aiBoundary: [
    'May not assert a causal explanation for an observed variance',
    'May not present a recommendation as an observed fact',
    'May not compute a metric by any definition other than the registered one',
    'May not draw a conclusion from data flagged as stale or incomplete',
    'May not execute any business action; this system recommends only',
    'May not aggregate confidential customer data across accounts where policy forbids it',
  ],
  guardrails: [
    'No metric is surfaced without a definition, a source, and a freshness timestamp',
    'Correlation is never presented as causation; contributing factors are labelled as candidates',
    'Stale or incomplete data blocks the conclusion and is shown, not silently used',
    'Recommendations are visually and structurally distinct from facts',
    'Every exception states what it does not establish',
    'Authority is capped at RECOMMEND for the entire system',
  ],

  metrics: [
    { id: 'or-provenance-coverage', name: 'Metric provenance coverage', kind: 'COVERAGE', definition: 'Surfaced figures resolving to a named source record and a registered definition, divided by surfaced figures. Lab target is 100 percent.', unit: 'percent', sourceOfTruth: 'Metric registry' },
    { id: 'or-freshness', name: 'Input freshness', kind: 'RELIABILITY', definition: 'Age of each contributing input at the moment the analysis window closed, reported per source rather than averaged.', unit: 'hours', sourceOfTruth: 'Freshness record' },
    { id: 'or-exception-count', name: 'Exceptions surfaced', kind: 'LEADING', definition: 'Count of corroborated exceptions presented to the owner in the window. Deliberately expected to be small; a rising count indicates thresholds are too loose.', unit: 'exceptions', sourceOfTruth: 'Workflow store' },
    { id: 'or-corroboration-rate', name: 'Corroboration rate', kind: 'RELIABILITY', definition: 'Exception candidates that found independent supporting evidence, divided by candidates raised.', unit: 'percent', sourceOfTruth: 'Workflow store' },
    { id: 'or-decision-rate', name: 'Decision rate', kind: 'LAGGING', definition: 'Surfaced exceptions receiving a recorded owner decision, divided by exceptions surfaced. A low value indicates the exceptions are not worth the owner’s attention.', unit: 'percent', sourceOfTruth: 'Workflow store' },
    { id: 'or-unsupported-causal', name: 'Unsupported causal claims', kind: 'RELIABILITY', definition: 'Count of surfaced statements asserting a cause without corroborating evidence. Lab target is zero.', unit: 'claims', sourceOfTruth: 'Reviewer annotations' },
    { id: 'or-concentration-risk', name: 'Revenue concentration', kind: 'LAGGING', definition: 'Share of period revenue attributable to the largest customer, and to the largest referral source, reported separately because they fail in different ways.', unit: 'percent', sourceOfTruth: 'Accounting system joined to customer system of record' },
    { id: 'or-stale-block-rate', name: 'Stale-blocked analyses', kind: 'RELIABILITY', definition: 'Analyses halted because inputs exceeded staleness tolerance, divided by analyses attempted. A healthy non-zero value; zero suggests the tolerance is not being enforced.', unit: 'percent', sourceOfTruth: 'Workflow store' },
  ],

  standards: [
    {
      id: 'or-std-confabulation',
      statement:
        'Generative models produce fluent explanations that are not grounded in their inputs, and confabulation is a named primary risk requiring managed controls. Narrative explanation of a metric movement is exactly the shape of output most prone to it.',
      provenance: 'EVIDENCE',
      verification: 'VERIFIED',
      sourceIds: ['nist-ai-600-1'],
      appliesTo:
        'Justifies capping this entire system at authority level 1, requiring corroboration before anything surfaces, and structurally separating recommendations from facts.',
    },
    {
      id: 'or-std-data-quality-dimensions',
      statement:
        'Data quality is conventionally decomposed into named dimensions including accuracy, completeness, consistency, and timeliness, and these are codified in international standards and industry bodies of knowledge.',
      provenance: 'EVIDENCE',
      verification: 'PENDING_VERIFICATION',
      sourceIds: ['iso-8000', 'dama-dmbok'],
      appliesTo:
        'Justifies treating freshness and completeness as first-class gates rather than caveats. Held as PENDING_VERIFICATION because the normative standard text is paywalled and was not read during this build; the design does not depend on any specific threshold from it.',
    },
    {
      id: 'or-lab-no-metric-without-provenance',
      statement:
        'No figure is surfaced without a registered definition, a named source record, and a freshness timestamp.',
      provenance: 'LAB_TARGET',
      verification: 'NOT_APPLICABLE',
      sourceIds: [],
      appliesTo: 'The corroboration transition guard and the provenance coverage metric.',
    },
    {
      id: 'or-lab-no-causal-claim',
      statement:
        'No causal explanation is asserted. Contributing factors are presented as candidates with their supporting evidence, and the absence of a determined cause is stated.',
      provenance: 'LAB_TARGET',
      verification: 'NOT_APPLICABLE',
      sourceIds: [],
      appliesTo: 'The unsupported causal claims metric, whose target is zero.',
    },
    {
      id: 'or-lab-recommend-only',
      statement:
        'This system observes and recommends. It holds no authority above level 1 for any action, regardless of confidence or corroboration.',
      provenance: 'LAB_TARGET',
      verification: 'NOT_APPLICABLE',
      sourceIds: [],
      appliesTo: 'Every transition in this lifecycle is capped at authority 1 except the human decision points.',
    },
  ],

  failureModes: [
    {
      id: 'or-fm-stale-conclusion',
      class: 'STALE_DATA',
      failure: 'A conclusion is drawn from an input that is no longer current.',
      cause: 'A source sync failed silently and the last known value was used as though it were fresh.',
      businessImpact: 'The owner makes a real decision on a stale picture, which is worse than making no decision.',
      prevention: 'Freshness is a transition guard. Exceeding tolerance blocks the analysis rather than annotating it.',
      detection: 'Input age compared against configured tolerance at window close.',
      recovery: 'Flag the input, attempt refresh, and record insufficient evidence if refresh fails.',
      escalationCondition: 'Repeated staleness from the same source.',
      authorityRequired: 1,
      terminalState: 'STALE_DATA_FLAGGED, then INSUFFICIENT_EVIDENCE.',
      verificationTest:
        'tests/owner-revenue-intelligence.test.ts — the stale-concentration-read scenario blocks on a first read older than the configured tolerance; a direct test drives a second refresh attempt that is still stale and asserts it resolves to INSUFFICIENT_EVIDENCE rather than concluding on a partial refresh.',
    },
    {
      id: 'or-fm-unsupported-causal',
      class: 'AI_UNSUPPORTED_INFERENCE',
      failure: 'A narrative asserts why a metric moved without evidence for that cause.',
      cause: 'A plausible story is the most fluent completion, and metric movements always admit one.',
      businessImpact: 'The owner acts on a fabricated cause and treats the real one as already explained.',
      prevention: 'Corroboration is required before surfacing, and causal language is structurally separated from observation.',
      detection: 'Claim-to-evidence resolution across surfaced statements.',
      recovery: 'Strip the causal assertion and present the variance with candidate factors instead.',
      escalationCondition: 'Any unsupported causal claim reaching the owner.',
      authorityRequired: 1,
      terminalState: 'EXCEPTION_SURFACED without a causal claim.',
      verificationTest:
        'tests/owner-revenue-intelligence.test.ts — the cash-collection scenario asserts the bounded judgment’s decision record forbids asserting a cause or presenting the recommendation as fact, and carries a non-empty "declined to infer" list rather than a determined root cause.',
    },
    {
      id: 'or-fm-metric-ambiguity',
      class: 'CONTRADICTORY_DATA',
      failure: 'The same metric name resolves to different figures in different systems.',
      cause: 'Two systems each compute a defensible version of the same concept using different definitions.',
      businessImpact: 'Trust in the whole report collapses the first time the owner spots the discrepancy.',
      prevention: 'Every metric resolves through the registry to exactly one definition, and the definition is shown alongside the figure.',
      detection: 'Comparison of computed value against each contributing system’s own reported value.',
      recovery: 'Surface both figures with their definitions and route the definition conflict to a person.',
      escalationCondition: 'Any metric with more than one active definition.',
      authorityRequired: 1,
      terminalState: 'AWAITING_OWNER_DECISION on the definition itself.',
      verificationTest: 'Pending — scenario not yet authored.',
    },
    {
      id: 'or-fm-alert-fatigue',
      class: 'POLICY_VIOLATION',
      failure: 'So many exceptions are surfaced that the owner stops reading them.',
      cause: 'Thresholds set too tight, or corroboration not enforced.',
      businessImpact: 'Functionally identical to surfacing nothing, but more expensive and more confidently wrong.',
      prevention: 'Corroboration is mandatory, thresholds are per metric, and exception count is itself a monitored metric.',
      detection: 'Exceptions surfaced per window, and decision rate trending toward zero.',
      recovery: 'Raise thresholds and route the tuning decision to the owner.',
      escalationCondition: 'Decision rate below the configured floor across consecutive windows.',
      authorityRequired: 1,
      terminalState: 'AWAITING_OWNER_DECISION on threshold configuration.',
      verificationTest: 'Pending — scenario not yet authored.',
    },
    {
      id: 'or-fm-confidentiality',
      class: 'POLICY_VIOLATION',
      failure: 'Confidential customer data is aggregated across accounts where policy forbids it.',
      cause: 'A cross-account metric composed without checking the aggregation policy for its inputs.',
      businessImpact: 'A contractual or confidentiality breach produced by an internal reporting feature.',
      prevention: 'Aggregation permission is a property of each input and is checked before composition.',
      detection: 'Aggregation policy check on every cross-account computation.',
      recovery: 'Block the metric and report it as unavailable by policy rather than omitting it silently.',
      escalationCondition: 'Any blocked aggregation, since it indicates a metric was specified without checking its inputs.',
      authorityRequired: 2,
      terminalState: 'INSUFFICIENT_EVIDENCE, recorded as blocked by policy.',
      verificationTest:
        'tests/owner-revenue-intelligence.test.ts — a direct test supplies a corroborating observation flagged as requiring cross-client aggregation and asserts it is excluded before comparison, resolving to INSUFFICIENT_EVIDENCE at authority level 2 with the confidentiality policy named in the decision record, rather than composed into the metric.',
    },
  ],

  maturity: 'SIMULATED',
  fidelityNote:
    'Two scenarios replay through the same engine core the first five systems proved, closing the horizontal portfolio. A complex path shows the point of the canon’s single bounded-judgment transition: cash collected falls sharply while revenue invoiced holds steady, which read alone would misdiagnose as a demand problem; the variance is only surfaced once an independent source — days sales outstanding, reported by a different system — corroborates that collection quality, not demand, is worsening. The bounded judgment then composes a plain-language explanation and one recommendation from a small closed set, both structurally marked as a recommendation rather than fact, and the owner records a decision against the evidence that produced it. A guardrail path shows an input older than the configured staleness tolerance blocking the conclusion outright, then a refreshed read landing well inside the configured materiality threshold and being correctly left alone rather than surfaced as a false alarm — reusing the business profile’s own declared referral-partner concentration figure as the metric under evaluation. Corroboration that disagrees in direction, and a candidate corroborating source that would require aggregating data across client accounts, each independently resolve to insufficient evidence rather than a surfaced exception, the latter citing the confidentiality policy the profile had already declared for exactly this system before this pass began. As with the first five systems, nothing here is live: no notification left this process, no model was called, and the business and its figures are fictional.',
} satisfies Parameters<typeof SystemDefinitionSchema.parse>[0];

export const OWNER_REVENUE_INTELLIGENCE: SystemDefinition = SystemDefinitionSchema.parse(RAW);
