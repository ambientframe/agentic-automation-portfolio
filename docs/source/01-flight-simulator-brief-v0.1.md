You are the principal implementation engineer for **Agentic Automation Portfolio**, a canonical repository for six progressively productionized, n8n-centered small-business operating systems.

Your task is to create **Portfolio Flight Simulator v0.1** and establish the business/engineering canon that all later implementation must obey.

This is not a generic automation portfolio and not a collection of workflow diagrams.

It is an interactive systems-engineering laboratory that shows how real business incidents move through state, decisions, policy, AI judgment, human authority, actions, verification, and recovery.

## 0. BEGIN WITH REPOSITORY DISCOVERY

Before modifying anything:

1. Inspect the complete repository.
2. Read all README, handoff, architecture, instruction, AGENTS, status, and related Markdown files.
3. Identify existing application infrastructure and preserve sound decisions.
4. Do not duplicate an existing source of truth.
5. Report internally what exists before deciding what must change.

If no suitable application exists, use:

- Next.js;
- TypeScript;
- Tailwind CSS;
- minimal additional dependencies;
- fixture-driven local data;
- a structure suitable for eventual Vercel deployment.

Prefer an existing sensible stack over migration.

Proceed autonomously with low-risk, reversible repository work.

Do not spend money, publish externally, use production credentials, alter external accounts, or perform destructive/irreversible actions.

---

# 1. NORTH STAR

The final portfolio contains six systems:

1. Lead Rescue
2. Dormant Pipeline Recovery
3. Call-to-Proposal Revenue Agent
4. Client Onboarding Operator
5. Receivables / Invoice Recovery Agent
6. Owner Revenue Intelligence Agent

The portfolio demonstrates this capability:

> Inspect a messy small-business process, identify expensive operational leakage, define authoritative state and measurable outcomes, model how information and decisions should move, and implement reliable operating logic across deterministic software, AI judgment, APIs, persistence, loops, human authority, evaluation, and event-driven workflows.

n8n will eventually serve primarily as the business-process orchestration/runtime layer.

Do NOT implement live n8n workflows in this iteration.

---

# 2. MATURITY TARGET FOR THIS ITERATION

At completion:

**Portfolio:** INTERACTIVE PROTOTYPE

**Lead Rescue:** SIMULATED — highest fidelity

**Other five systems:** SIMULATED — lower fidelity

Nothing may imply that simulated behavior is live.

Use only these maturity labels:

CONCEPT  
SIMULATED  
INTERACTIVE PROTOTYPE  
PARTIALLY LIVE  
LIVE  
AGENTIC  
LOOPED  
GRAPH-BASED  
PRODUCTION-HARDENED

Maturity is descriptive, not aspirational.

---

# 3. CREATE THE CANON BEFORE BUILDING THE EXPERIENCE

Create a concise canonical document at an appropriate path such as:

`docs/NORTH_STAR_CANON.md`

It must define all six systems using the same operating contract.

For each system document:

- business problem;
- economic leakage;
- buyer/operator outcome;
- trigger(s);
- authoritative source(s) of truth;
- important entities;
- lifecycle states;
- deterministic decisions;
- ambiguous judgments appropriate for bounded AI;
- possible actions;
- human-only actions;
- guardrails;
- success/terminal states;
- KPIs;
- leading indicators;
- lagging outcomes;
- known failure modes;
- prevention;
- detection;
- recovery;
- escalation;
- configurable client policies;
- evidence-backed standards;
- portfolio lab targets.

Do not claim universal numeric benchmarks where none are established.

Every standard must be classified as one of:

**EVIDENCE**
Externally supported research, accepted domain practice, or authoritative documentation.

**CLIENT_POLICY**
A value that varies by organization, jurisdiction, channel, contract, risk tolerance, or customer segment.

**LAB_TARGET**
An engineering or quality acceptance target established for this portfolio.

The application data model must preserve this distinction.

---

# 4. RESEARCH-GROUNDED BUSINESS CANON

Use the following as the minimum operating truth for v0.1.

Do not silently weaken it.

## A. LEAD RESCUE

### Business problem

Legitimate inbound demand is lost because inquiries are:

- never captured;
- noticed too late;
- duplicated;
- incorrectly classified;
- acknowledged without being tracked;
- forgotten after initial contact;
- mishandled after a reply;
- never escalated.

### Core outcome

Every legitimate inbound lead reaches a known terminal or waiting state with no silent disappearance.

### Primary measures

Track at minimum:

- inbound events received;
- valid leads captured;
- capture coverage;
- acknowledgement latency;
- meaningful-response or routing latency;
- missed-lead rate;
- duplicate-event rate;
- duplicate-external-action rate;
- contact rate;
- qualification/classification distribution;
- reply rate;
- booking-ready rate;
- booked rate where applicable;
- escalation rate;
- SLA/policy breaches;
- final disposition coverage.

### Initial portfolio lab targets

- every valid fixture event receives a terminal or waiting disposition;
- zero duplicate external actions from replayed duplicate events;
- zero silently dropped valid leads;
- immediate simulated acknowledgement path;
- simulated routing/meaningful-response path designed around a configurable five-minute speed-to-lead objective where appropriate;
- every low-confidence or policy-sensitive case has a safe human path.

These are LAB_TARGET values, not universal industry claims.

### Lead Rescue state model

Model states sufficient to represent:

NEW  
NORMALIZED  
DUPLICATE  
CLASSIFIED  
NEEDS_INFORMATION  
WAITING_FOR_REPLY  
REPLIED  
NEEDS_HUMAN  
BOOKING_READY  
BOOKED  
CLOSED_BAD_FIT  
CLOSED_SPAM  
DO_NOT_CONTACT  
ESCALATED  
FAILED_RECOVERABLE  
FAILED_TERMINAL

You may refine names, but do not remove explicit lifecycle state.

### AI boundary

AI may interpret ambiguous language or produce structured classification.

AI must not independently grant itself authority to:

- send high-risk messages;
- make binding promises;
- negotiate price;
- override suppression/consent state;
- fabricate missing facts;
- bypass policy.

---

## B. DORMANT PIPELINE RECOVERY

### Business problem

Previously acquired leads/opportunities remain dormant without a disciplined rule determining:

- which should be revisited;
- why now;
- what changed;
- whether outreach is still permitted;
- when to stop.

### Core outcome

Eligible dormant opportunities are systematically evaluated and either:

- suppressed;
- archived;
- scheduled for later;
- reactivated;
- routed to human review;
- returned to active pipeline.

### Measures

Track:

- dormant records evaluated;
- eligibility rate;
- suppression rate;
- reactivation attempts;
- positive replies;
- reopened opportunities;
- recovered pipeline value;
- recovered closed revenue;
- time from eligible trigger to action;
- unsubscribe/do-not-contact rate;
- false-positive reactivation;
- duplicate outreach;
- terminal disposition coverage.

Do not optimize primarily for opens or clicks.

### Required policy concepts

Re-entry must have an explicit reason such as:

- time-based recycle policy;
- previous timing objection expired;
- new engagement;
- relevant customer event;
- newly satisfied qualification condition;
- human-defined campaign.

“No activity for a while” alone does not automatically grant outreach authority.

Every sequence must define:

- entry criteria;
- cadence;
- maximum attempts;
- exit conditions;
- suppression conditions;
- re-entry conditions.

These are CLIENT_POLICY unless specifically identified otherwise.

---

## C. CALL-TO-PROPOSAL REVENUE AGENT

### Business problem

Commercial truth captured during discovery is lost or distorted during manual handoff into follow-up, scope, CRM records, and proposals.

### Core outcome

Turn a completed discovery conversation into a verified, human-reviewable commercial package without inventing buyer facts.

### Structured commercial record

Represent at minimum:

- buyer goals;
- current situation;
- pains/problems;
- business impact;
- desired outcome;
- stakeholders;
- decision process;
- timing;
- budget/commercial information when actually discussed;
- constraints;
- requirements;
- objections/risks;
- agreed next step;
- promised seller actions;
- unknown/missing information;
- explicit assumptions;
- evidence references back to source material.

### Measures

Track:

- transcript-to-structured-record latency;
- required-field coverage;
- facts correctly preserved;
- unknowns correctly marked unknown;
- unsupported claims;
- human corrections;
- proposal draft latency;
- promised-delivery SLA;
- revision count;
- scope discrepancy;
- proposal acceptance;
- win rate;
- downstream sales-cycle duration.

### Lab quality target

Unsupported commercial claims: zero.

Unknown information must remain unknown rather than be plausibly invented.

No external proposal is sent without the authority level defined for that client.

---

## D. CLIENT ONBOARDING OPERATOR

### Business problem

A closed sale turns into fragmented setup, repeated questions, unclear ownership, missing access, and delayed value.

### Core outcome

Preserve sales context, ask only for information actually missing, create the required onboarding infrastructure safely, and move the customer toward a defined first-value milestone.

### Measures

Track:

- sales-to-onboarding handoff completeness;
- repeated-information requests;
- kickoff latency;
- missing-information count;
- access/setup completion;
- task ownership coverage;
- blocked time;
- milestone completion;
- time-to-first-value;
- onboarding completion rate;
- customer effort/feedback when available;
- support burden;
- escalation count.

### Required rules

- previously known information must not be requested again without reason;
- missing information must be distinguished from contradictory information;
- every required task must have an owner and state;
- repeated execution must not duplicate folders/projects/tasks/resources;
- credentials/secrets must not be casually persisted in general workflow state;
- ambiguous contractual scope goes to human review;
- onboarding completion is defined by value/readiness criteria, not merely checklist exhaustion.

Time-to-first-value is a primary outcome but its target is CLIENT_POLICY because service complexity varies.

---

## E. RECEIVABLES / INVOICE RECOVERY AGENT

### Business problem

Outstanding receivables are inconsistently monitored and followed up, creating cash-flow leakage and relationship risk.

### Core outcome

Maintain accurate invoice state, execute the approved collection policy consistently, recognize replies/payment/disputes, and escalate cases that exceed automation authority.

### Financial state

Support conventional aging concepts such as:

CURRENT  
1–30 DAYS PAST DUE  
31–60  
61–90  
90+

Also model orthogonal states where needed:

DISPUTED  
PAYMENT_PROMISED  
PAYMENT_PLAN  
PAID  
ESCALATED  
WRITE_OFF_REVIEW

### Measures

Track:

- total AR;
- overdue AR;
- aging distribution;
- days sales outstanding when meaningful;
- recovered cash;
- recovery rate;
- days from due date to payment;
- promise-to-pay kept rate;
- disputed amount;
- dispute-resolution time;
- reminder/action count;
- policy exceptions;
- write-offs where applicable.

### Non-negotiable authority rules

The accounting/billing system is authoritative for:

- invoice identity;
- amount;
- due date;
- balance;
- payment status.

AI must never fabricate or alter financial truth.

Payment stops normal collection behavior.

Dispute stops normal collection behavior and enters the dispute policy.

AI cannot autonomously:

- invent late fees;
- change payment terms;
- threaten legal consequences;
- initiate litigation;
- engage a collections agency;
- misrepresent contractual rights.

Reminder cadence and escalation thresholds are CLIENT_POLICY.

---

## F. OWNER REVENUE INTELLIGENCE AGENT

### Business problem

Owners receive fragmented metrics from sales, operations, billing, and finance but still have to determine manually:

- what changed;
- what is abnormal;
- why it matters;
- what requires action now.

### Core outcome

Convert trusted cross-system state into a small number of evidence-linked business exceptions and recommended decisions.

This is not primarily a dashboard-generation system.

### Possible metric families

Select based on business model:

FINANCE
- revenue;
- gross profit/margin;
- net profit/margin;
- cash position;
- operating cash flow;
- receivables;
- overdue AR;
- liquidity.

REVENUE PIPELINE
- inbound lead volume;
- stage conversion;
- win rate;
- average deal value;
- sales-cycle duration;
- pipeline velocity;
- stale opportunities;
- forecast versus actual.

CUSTOMER/OPERATIONS
- onboarding TTV;
- churn/retention where meaningful;
- service backlog;
- delivery exceptions;
- concentration risk;
- other domain-specific constraints.

### Every intelligence object must show

- metric definition;
- observation period;
- source systems/records;
- data freshness;
- baseline or comparison;
- observed variance;
- why the exception was surfaced;
- corroborating evidence;
- confidence when probabilistic;
- recommended action;
- required authority;
- assumptions/limitations.

### Lab quality targets

- zero metric without provenance;
- zero hidden metric-definition ambiguity;
- zero unsupported causal claim;
- stale or incomplete data is visibly identified;
- recommendations are distinguishable from facts.

---

# 5. CROSS-SYSTEM RELIABILITY CONTRACT

Every eventual live system must be capable of implementing this lifecycle:

EVENT
→ VALIDATE
→ NORMALIZE
→ IDENTIFY / DEDUPLICATE
→ LOAD AUTHORITATIVE STATE
→ DECIDE
→ CHECK POLICY / AUTHORITY
→ ACT
→ RECORD SIDE EFFECT
→ UPDATE STATE
→ VERIFY
→ WAIT / TERMINATE / ESCALATE

Model this contract in the simulator now even where execution remains fictional.

For each event/action, support fields such as:

- eventId;
- correlationId;
- entityId;
- source;
- sourceEventId;
- occurredAt;
- receivedAt;
- schemaVersion;
- normalizedPayload;
- previousState;
- nextState;
- decisionType;
- actorType;
- authorityLevel;
- idempotencyKey where relevant;
- sideEffect;
- verificationResult;
- provenance;
- simulation/live status.

Do not force every field onto every UI surface. The underlying model should support them.

---

# 6. FAILURE-MODE ENGINEERING

Create:

`docs/FAILURE_MODE_REGISTER.md`

This is required before live implementation begins.

For every system record foreseeable failure classes.

Each entry must contain:

- failure;
- cause;
- business impact;
- prevention;
- detection signal;
- recovery action;
- retry policy if applicable;
- human escalation condition;
- authority required;
- terminal state;
- verification test.

Cover at minimum across the portfolio:

- duplicate events;
- out-of-order events;
- malformed payload;
- missing required fields;
- stale data;
- contradictory data;
- wrong record/entity match;
- source-system outage;
- downstream API failure;
- rate limiting;
- timeout;
- partial side-effect success;
- retry causing duplicate side effect;
- AI malformed output;
- AI low confidence;
- AI unsupported inference;
- policy violation;
- permission/credential failure;
- human approval timeout;
- unexpected human reply;
- suppression/opt-out state;
- state-transition conflict;
- replay after previous completion.

Known failure classes must not be represented only as generic “error” states.

---

# 7. AUTHORITY MODEL

Use a shared authority ladder:

0 — OBSERVE  
1 — RECOMMEND  
2 — PREPARE / HUMAN APPROVES  
3 — EXECUTE UNDER EXPLICIT POLICY  
4 — EXECUTE AND MANAGE BOUNDED DOWNSTREAM CONSEQUENCES

Authority is assigned per action.

AI reasoning capability never automatically raises authority.

Every simulated consequential action should make its authority level inspectable.

---

# 8. PORTFOLIO FLIGHT SIMULATOR UX

Build a polished interactive application with four conceptual views.

## Portfolio

Show all six systems with:

- business pain;
- economic leakage;
- primary outcome;
- maturity;
- simulated/live provenance;
- highest-value KPI(s);
- ability to open the system.

## System Dossier

For each system expose:

- business case;
- lifecycle/state model;
- operating standards;
- KPIs;
- deterministic logic;
- AI responsibilities;
- authority;
- guardrails;
- major failure modes;
- current fidelity.

Make EVIDENCE vs CLIENT_POLICY vs LAB_TARGET visually distinguishable.

## Flight Simulator

Allow a visitor to:

- select scenario;
- play/pause execution;
- step through events;
- inspect timeline;
- inspect current state;
- inspect state transitions;
- inspect decisions;
- inspect policies/guardrails;
- inspect side effects;
- inspect verification;
- see why something escalated;
- replay the scenario.

Do not expose private chain-of-thought.

Decision inspection uses structured records only.

## Reliability / Evidence View

Expose enough information to prove the system was engineered rather than merely animated:

- operating target;
- provenance type;
- applicable policy;
- failure mode;
- prevention/detection/recovery;
- authority boundary;
- verification result.

Do not overwhelm the default buyer-facing view with technical detail. Make deeper inspection available intentionally.

---

# 9. SCENARIOS

Use realistic fictional businesses and data.

No lorem ipsum.

## Lead Rescue

Implement at least three scenarios:

### Scenario 1 — After-hours legitimate lead

Show:

inquiry
→ normalization
→ duplicate check
→ deterministic checks
→ ambiguous-language interpretation
→ classification
→ missing-information detection
→ acknowledgement
→ policy check
→ simulated send
→ state wait
→ prospect reply
→ reply interpretation
→ state update
→ booking-ready or human next action.

### Scenario 2 — Duplicate/replayed event

Demonstrate that the same business event can be delivered more than once without producing duplicate external behavior.

### Scenario 3 — Ambiguous/high-risk case

Demonstrate low-confidence or policy-sensitive input safely entering human review rather than autonomous action.

## Other five systems

Create one strong end-to-end scenario for each plus at least one visible exception/failure condition.

These scenarios exist to preserve the final destination, not to productionize five workflows simultaneously.

---

# 10. DATA ARCHITECTURE

The application must be data-driven.

Create typed models sufficient to represent concepts such as:

- SystemDefinition
- MetricDefinition
- OperatingStandard
- Policy
- Scenario
- TimelineEvent
- BusinessState
- StateTransition
- DecisionRecord
- AuthorityRecord
- SideEffect
- VerificationRecord
- FailureMode
- Outcome
- MaturityLevel
- ProvenanceType

Names may differ if your model is cleaner.

Do not build six bespoke hard-coded pages.

Fixture adapters should produce the same canonical event structures that future live integrations can produce.

That seam is critical.

Future progression should be able to replace:

fixture adapter
→ real trigger adapter
→ real persistence
→ real deterministic decision
→ bounded AI
→ real side effect
→ wait/resume
→ reply handling

without rebuilding the portfolio experience.

---

# 11. STRUCTURED DECISION RECORDS

Never expose hidden reasoning.

A decision record may contain:

- objective;
- relevant state;
- evidence references;
- deterministic facts;
- classification;
- confidence where applicable;
- missing information;
- permitted actions;
- forbidden actions;
- selected action;
- applicable policy;
- evaluator result;
- escalation reason.

Distinguish visibly between:

DETERMINISTIC RULE  
BOUNDED AI JUDGMENT  
HUMAN DECISION

---

# 12. UX QUALITY BAR

Avoid generic AI-dashboard aesthetics.

Prefer:

- excellent hierarchy;
- generous whitespace;
- restrained visual language;
- strong typography;
- inspectable data;
- timelines;
- state transitions;
- compact evidence;
- purposeful interaction;
- clear provenance.

Avoid:

- excessive gradients;
- gratuitous glassmorphism;
- floating AI imagery;
- fake customer logos;
- fabricated performance claims;
- decorative charts without decision value;
- node-count bragging;
- automation buzzword copy.

The business incident is the hero.

The technical system is proof.

---

# 13. ENGINEERING QUALITY

Create a canonical repository foundation with:

- TypeScript strictness where practical;
- clean component boundaries;
- typed fixtures;
- schema validation where useful;
- reusable renderers;
- deterministic fixture replay;
- no obvious duplicated logic;
- appropriate empty/error states;
- README/run instructions;
- lint;
- typecheck;
- automated tests.

Tests must include meaningful behavior, not only snapshot existence.

At minimum test:

- system definitions validate;
- all six systems load;
- maturity/provenance is truthful;
- state transitions are valid;
- duplicate Lead Rescue fixture does not create duplicate side effects;
- low-confidence fixture escalates;
- unsupported commercial fact is not silently created;
- paid invoice cannot remain in normal collection state;
- intelligence record requires provenance.

---

# 14. PORTFOLIO RESEARCH LEDGER

Create a concise:

`docs/RESEARCH_LEDGER.md`

Seed it with the operating claims supplied in this brief and classify each as:

- evidence;
- domain practice;
- client policy;
- lab target.

For external claims, record:

- claim;
- source organization;
- source title;
- source URL if supplied/known;
- source date when known;
- accessed/as-of date;
- limitations.

Never manufacture citations.

If repository/network tooling allows verification against authoritative current sources, verify material claims.

Prefer:

- primary research;
- official government sources;
- official n8n documentation;
- reputable domain platforms publishing methodology;
- current sources over SEO summaries.

A source ledger is not a license to turn vendor marketing claims into universal truth.

---

# 15. CURRENT RESEARCH SEEDS

Seed the ledger with these source families rather than inventing replacements:

- Salesforce 2026 State of Agentic Marketing / inbound pipeline-gap research;
- Salesforce 2026 State of Sales;
- Harvard Business Review, “The Short Life of Online Sales Leads”;
- InsideSales Lead Response Study 2021;
- HubSpot current sales pipeline, prospecting, discovery, RevOps, and customer-onboarding guidance;
- Gainsight current customer-onboarding guidance;
- Stripe accounts-receivable aging and small-business cash-flow guidance;
- Xero current accounts-receivable guidance;
- QuickBooks current KPI Scorecard / financial KPI documentation;
- FTC CAN-SPAM business compliance guidance;
- official n8n documentation for execution handling, environments/source control, security, permissions, monitoring, and production operations.

Do not block application development because a source is temporarily unavailable.

Record unverifiable claims as needing verification rather than fabricating support.

---

# 16. DO NOT BUILD YET

Do not add:

- live client integrations;
- production credentials;
- live outbound communications;
- CRM infrastructure;
- a production database merely for the simulator;
- vector databases;
- autonomous negotiation;
- multi-agent orchestration;
- LangGraph or another graph framework;
- complex enrichment;
- authentication unless an existing app requires it;
- unnecessary analytics infrastructure;
- six production workflows.

These are later fidelity upgrades.

---

# 17. VERIFICATION GATE

Before declaring v0.1 complete:

1. Run the application locally.
2. Run lint.
3. Run typecheck.
4. Run automated tests.
5. Inspect the rendered application.
6. Verify all six systems open.
7. Verify all systems expose operating standards and KPIs.
8. Verify standard provenance is visible.
9. Verify Lead Rescue has all three required scenarios.
10. Verify scenario replay works.
11. Verify event inspection works.
12. Verify decision/authority records render.
13. Verify known failure behavior is inspectable.
14. Verify simulator events never masquerade as live integrations.
15. Verify no fabricated customer results or benchmarks appear.
16. Verify reasonable desktop and mobile layouts.
17. Fix defects found during verification.

If browser automation or screenshot tooling is available, visually inspect the application rather than assuming successful compilation equals acceptable UX.

---

# 18. STATUS DOCUMENT

Create or update a concise canonical status file.

Record:

- current portfolio maturity;
- maturity of each system;
- what is simulated;
- what is real;
- architecture introduced;
- reliability mechanisms represented;
- research claims verified;
- research claims pending verification;
- known fidelity gaps;
- single recommended next fidelity gap.

Do not create documentation bureaucracy.

---

# 19. STOP CONDITION

Stop when:

- the six-system portfolio is a functioning interactive simulation;
- the North Star canon exists;
- the research ledger exists;
- the failure-mode register exists;
- Lead Rescue demonstrates reliability concepts through scenarios;
- verification passes.

Do NOT proceed into real n8n implementation.

The next fidelity gap must be selected from evidence produced by this build, not assumed in advance.

---

# 20. COMPLETION REPORT

Return:

1. repository state found;
2. what was created or changed;
3. architecture decisions;
4. canonical business/metrics decisions;
5. important assumptions;
6. research verification performed;
7. files/directories materially changed;
8. verification commands and results;
9. maturity table for all six systems;
10. known gaps or risks;
11. the single highest-leverage fidelity gap now remaining;
12. anything genuinely requiring operator attention.

Explicitly distinguish:

SIMULATED  
REAL  
UNVERIFIED ASSUMPTION

Do not recommend beginning another major build merely because this one is complete.