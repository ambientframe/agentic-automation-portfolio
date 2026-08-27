# North Star Canon

> **Generated from the typed model — do not edit by hand.**
> Run `npm run docs` after changing anything in `data/`. `tests/docs.test.ts` fails if this file is stale.

This is the normative business and engineering canon for the Agentic Automation Portfolio.
All later implementation obeys it. Where a historical input in `docs/source/` disagrees,
this document wins, and the divergence is recorded in [CANON_DIVERGENCES.md](CANON_DIVERGENCES.md).

## The operating contract

Every system in this portfolio is defined against the same contract:

```
EVENT -> VALIDATE -> NORMALIZE -> IDENTIFY / DEDUPLICATE -> LOAD AUTHORITATIVE STATE
      -> DECIDE -> CHECK POLICY / AUTHORITY -> ACT -> RECORD SIDE EFFECT
      -> UPDATE STATE -> VERIFY -> WAIT / TERMINATE / ESCALATE
```

## How to read a standard

Two independent dimensions travel with every operating standard, and conflating them is
the failure this canon exists to prevent.

**Provenance** answers *what kind of claim is this?*

| Type | Meaning |
| --- | --- |
| `EVIDENCE` | Externally supported research, accepted domain practice, or authoritative documentation. |
| `CLIENT_POLICY` | A value that legitimately varies by organisation, jurisdiction, channel, contract, or risk tolerance. |
| `LAB_TARGET` | An engineering or quality acceptance target established for this portfolio. |
| `FIXTURE` | Invented data belonging to a fictional demonstration business. Asserts nothing externally. |

**Verification** answers *how well is this external claim actually supported right now?*

| Status | Meaning |
| --- | --- |
| `VERIFIED` | Located and read on the recorded date; supported as stated. |
| `PENDING_VERIFICATION` | Asserted from a named source family, not yet located and read. |
| `DISPUTED_OR_WEAK` | Located, but materially weaker than its common retelling. |
| `SUPERSEDED` | Replaced by newer sources or changed practice. |
| `NOT_APPLICABLE` | Not an external claim; verification is not a meaningful question. |

An `EVIDENCE` standard is not automatically true. Only `EVIDENCE` + `VERIFIED` may be
stated to a reader as settled external fact; everything else renders with its caveat attached.

## The authority ladder

Authority is assigned **per action**. Reasoning capability never raises it.

0. **OBSERVE**
1. **RECOMMEND**
2. **PREPARE / HUMAN APPROVES**
3. **EXECUTE UNDER EXPLICIT POLICY**
4. **EXECUTE AND MANAGE BOUNDED DOWNSTREAM CONSEQUENCES**

## Maturity labels

Maturity is descriptive, not aspirational.

`CONCEPT` · `SIMULATED` · `INTERACTIVE PROTOTYPE` · `PARTIALLY LIVE` · `LIVE` ·
`AGENTIC` · `LOOPED` · `GRAPH-BASED` · `PRODUCTION-HARDENED`

| System | Maturity |
| --- | --- |
| 1. Lead Rescue | INTERACTIVE PROTOTYPE |
| 2. Dormant Pipeline Recovery | SIMULATED |
| 3. Call-to-Proposal Revenue Agent | SIMULATED |
| 4. Client Onboarding Operator | SIMULATED |
| 5. Receivables / Invoice Recovery Agent | SIMULATED |
| 6. Owner Revenue Intelligence Agent | SIMULATED |

## Canon at a glance

- 6 systems
- 139 declared lifecycle transitions
- 62 metric definitions, each with an explicit formula and a named system of record
- 39 operating standards, of which 20 assert external evidence
- 45 named failure modes
- 20 sources in the ledger

## The demonstration environment

Kestrel Compliance Group is a **fictional** business. Kestrel Compliance Group is a fictional business created for this portfolio. Its clients, figures, staff, and incidents are invented. Nothing here describes a real company or a real result.

It exists so the six systems can be shown operating on one coherent business rather than
six unrelated ones. Every figure is invented and carries `FIXTURE` provenance. System
definitions below contain **no** business-specific vocabulary — that separation is what
makes the portfolio retargetable to another vertical as a data change rather than a rewrite,
and it is enforced by `tests/seam.test.ts`.

---

## 1. Lead Rescue

**Maturity: INTERACTIVE PROTOTYPE**

Runs end to end as a deterministic simulation, with one genuine exception: WAITING_FOR_REPLY now persists to a real file-backed store and resumes independently of the process that parked it. A separate, real-clock-driven check (a route handler, not a production scheduler) loads a waiting incident back off disk and correctly fires lr-t14 only once the configured window has genuinely elapsed — proven by tests that tear down and reconstruct the store between parking and checking, not by a fixture event’s timestamp happening to arrive later. Every other stage — the lifecycle graph, duplicate suppression, confidence floor, policy gates, authority ladder, and retry-safety gating for uncertain provider outcomes — still genuinely executes within a single request, and bounded judgments and provider send/verify outcomes are still replayed from authored fixtures rather than produced by a model or a real provider. No message, record write, or notification leaves the process, and there is still no live trigger, live send, or production scheduler: the new mechanism is a persisted incident and an independently-triggerable check, not a connection to anything external.

### Business problem

Legitimate inbound demand is lost because enquiries are never captured, noticed too late, duplicated, misclassified, acknowledged without being tracked, forgotten after first contact, mishandled after a reply, or never escalated.

### Economic leakage

Demand that has already been paid for is wasted after acquisition. The cost is incurred whether or not the enquiry is ever worked, so every silently dropped enquiry is a fully sunk acquisition cost plus the margin of the work it would have become.

### Buyer / operator outcome

Every legitimate inbound enquiry reaches a known terminal or waiting state. Nothing disappears silently, and every case that exceeds the system’s authority reaches a person.

### Triggers

- An enquiry arrives on a monitored inbound channel
- A prospect replies to an earlier message
- A waiting period elapses without a reply
- A person records a decision on a case held for review

### Authoritative sources of truth

- The inbound channel is authoritative for receipt and raw content
- The customer system of record is authoritative for entity identity and consent state
- The workflow store is authoritative for lifecycle position and side-effect history

### Important entities

- Inbound event
- Lead
- Contact
- Conversation
- Side effect
- Decision record

### Lifecycle states

| State | Kind | Meaning |
| --- | --- | --- |
| `NEW` | INITIAL | An inbound event has been received and nothing has been decided about it yet. |
| `NORMALIZED` | ACTIVE | The payload validated and was mapped to canonical fields. Identity resolution can now run. |
| `DUPLICATE` | TERMINAL NEUTRAL | This record refers to an entity already under management and has been merged into it. Distinct from a duplicate *event*, which never reaches a lifecycle state because the ledger refuses it first. |
| `CLASSIFIED` | ACTIVE | A bounded judgment returned a classification from the permitted set at or above the confidence floor. |
| `NEEDS_INFORMATION` | ACTIVE | The enquiry is legitimate but is missing facts required to route or scope it. The minimum missing set has been identified. |
| `WAITING_FOR_REPLY` | WAITING | A question was sent and the system is legitimately parked awaiting an external response. Not a failure and not terminal. |
| `REPLIED` | ACTIVE | The prospect responded and the response has been interpreted. |
| `NEEDS_HUMAN` | HUMAN REVIEW | The case exceeds the system’s authority or confidence. A named person owns it. A valid architectural state, not a failure of autonomy. |
| `BOOKING_READY` | ACTIVE | Enough is known to offer a next commercial step. |
| `BOOKED` | TERMINAL SUCCESS | A next step is confirmed on the calendar. |
| `CLOSED_BAD_FIT` | TERMINAL NEUTRAL | Genuine enquiry, outside the served segment. Closed correctly rather than pursued. |
| `CLOSED_SPAM` | TERMINAL NEUTRAL | Automated, solicitation, or otherwise not a buying enquiry. |
| `DO_NOT_CONTACT` | TERMINAL NEUTRAL | Suppression or opt-out state applies. Overrides commercial intent permanently. |
| `SUPPRESSION_REVIEW` | HUMAN REVIEW | A candidate action was computed and blocked by policy because the resolved entity carries restricted consent state. Distinct from DO_NOT_CONTACT: the outcome here is not yet decided — a person determines whether this specific inquiry may be answered. |
| `ESCALATED` | HUMAN REVIEW | Raised above the first human owner because of risk, value, or an unresolved review. |
| `FAILED_RECOVERABLE` | ACTIVE | Processing failed in a way that a retry may resolve. Retry budget is bounded and visible. |
| `FAILED_TERMINAL` | TERMINAL FAILURE | Processing failed and no retry can resolve it. Recorded explicitly so it is countable, never a silent drop. |

### Declared transitions

Only these moves are permitted. The engine rejects anything else and records the rejection.

| From | To | Mechanism | Guard | Authority |
| --- | --- | --- | --- | --- |
| `NEW` | `NORMALIZED` | DETERMINISTIC RULE | Required fields present and payload conforms to the declared schema version. | 3 |
| `NEW` | `FAILED_RECOVERABLE` | DETERMINISTIC RULE | Payload malformed or required fields absent. | 0 |
| `NORMALIZED` | `DUPLICATE` | DETERMINISTIC RULE | Normalised identity matches an entity already under active management. | 3 |
| `NORMALIZED` | `DO_NOT_CONTACT` | DETERMINISTIC RULE | Suppression or opt-out state present on the resolved entity. | 3 |
| `NORMALIZED` | `CLASSIFIED` | BOUNDED AI JUDGMENT | Classification is within the permitted set and confidence is at or above the configured floor. | 1 |
| `NORMALIZED` | `NEEDS_HUMAN` | DETERMINISTIC RULE | Confidence below the configured floor, or the judgment violated its output contract. | 2 |
| `CLASSIFIED` | `CLOSED_SPAM` | DETERMINISTIC RULE | Classification is a non-enquiry class. | 3 |
| `CLASSIFIED` | `CLOSED_BAD_FIT` | DETERMINISTIC RULE | Classification is a genuine enquiry outside the served segment. | 3 |
| `CLASSIFIED` | `NEEDS_INFORMATION` | DETERMINISTIC RULE | Required routing or scoping fields are absent from the enquiry. | 3 |
| `CLASSIFIED` | `BOOKING_READY` | DETERMINISTIC RULE | All required routing fields are present and no policy-sensitive marker applies. | 3 |
| `CLASSIFIED` | `NEEDS_HUMAN` | DETERMINISTIC RULE | A policy-sensitive marker applies to the content or the requested commitment. | 2 |
| `NEEDS_INFORMATION` | `WAITING_FOR_REPLY` | DETERMINISTIC RULE | The minimum missing-information question was sent and recorded. | 3 |
| `WAITING_FOR_REPLY` | `REPLIED` | DETERMINISTIC RULE | An inbound reply correlates to the waiting conversation. | 3 |
| `WAITING_FOR_REPLY` | `NEEDS_HUMAN` | DETERMINISTIC RULE | The configured wait expired and the follow-up budget is exhausted. | 2 |
| `WAITING_FOR_REPLY` | `DO_NOT_CONTACT` | DETERMINISTIC RULE | The reply expresses opt-out or the contact appears on a suppression list. | 3 |
| `REPLIED` | `BOOKING_READY` | DETERMINISTIC RULE | The reply supplied every previously missing required field. | 3 |
| `REPLIED` | `NEEDS_INFORMATION` | DETERMINISTIC RULE | The reply resolved some but not all missing fields and the question budget is not exhausted. | 3 |
| `REPLIED` | `NEEDS_HUMAN` | DETERMINISTIC RULE | The reply is off-script, raises a commitment question, or interpretation confidence is below the floor. | 2 |
| `REPLIED` | `DO_NOT_CONTACT` | DETERMINISTIC RULE | The reply expresses opt-out. | 3 |
| `REPLIED` | `CLOSED_BAD_FIT` | DETERMINISTIC RULE | The reply establishes the enquiry is outside the served segment. | 3 |
| `BOOKING_READY` | `BOOKED` | HUMAN DECISION | A person or the prospect confirmed a scheduled next step. | 2 |
| `BOOKING_READY` | `NEEDS_HUMAN` | DETERMINISTIC RULE | The offered next step went unanswered beyond the configured window. | 2 |
| `NEEDS_HUMAN` | `ESCALATED` | HUMAN DECISION | The first owner raised the case. | 2 |
| `NEEDS_HUMAN` | `BOOKING_READY` | HUMAN DECISION | A person resolved the ambiguity and cleared the case to proceed. | 2 |
| `NEEDS_HUMAN` | `CLOSED_BAD_FIT` | HUMAN DECISION | A person judged the enquiry out of segment. | 2 |
| `NEEDS_HUMAN` | `DO_NOT_CONTACT` | HUMAN DECISION | A person applied suppression. | 2 |
| `ESCALATED` | `BOOKING_READY` | HUMAN DECISION | The escalation was resolved in favour of proceeding. | 2 |
| `ESCALATED` | `CLOSED_BAD_FIT` | HUMAN DECISION | The escalation was resolved as out of segment. | 2 |
| `ESCALATED` | `FAILED_TERMINAL` | HUMAN DECISION | The case cannot be progressed and is closed as a recorded failure. | 2 |
| `FAILED_RECOVERABLE` | `NORMALIZED` | DETERMINISTIC RULE | A retry within the bounded budget produced a valid normalised payload. | 3 |
| `FAILED_RECOVERABLE` | `FAILED_TERMINAL` | DETERMINISTIC RULE | Maximum attempts reached without success. | 0 |
| `FAILED_RECOVERABLE` | `NEEDS_HUMAN` | DETERMINISTIC RULE | Maximum attempts reached and the payload retains enough signal for a person to act on. | 2 |
| `CLASSIFIED` | `SUPPRESSION_REVIEW` | DETERMINISTIC RULE | Authoritative consent state on the resolved entity is restricted pending review; the candidate action is blocked regardless of classification or confidence. | 2 |
| `SUPPRESSION_REVIEW` | `BOOKING_READY` | HUMAN DECISION | A person determined this specific inquiry may be answered and cleared it to proceed. | 2 |
| `SUPPRESSION_REVIEW` | `CLOSED_BAD_FIT` | HUMAN DECISION | A person judged the enquiry out of segment. | 2 |
| `SUPPRESSION_REVIEW` | `DO_NOT_CONTACT` | HUMAN DECISION | A person confirmed the restriction stands. | 2 |
| `SUPPRESSION_REVIEW` | `ESCALATED` | HUMAN DECISION | The first reviewer raised the case rather than deciding it. | 2 |

### Deterministic decisions

- Schema and required-field validation of the inbound payload
- Normalisation of contact identity, channel, and timestamps
- Duplicate event detection by source event identity
- Duplicate entity resolution against records already under management
- Consent and suppression screening
- Confidence-floor comparison against the configured threshold
- Missing-required-field computation
- Policy-sensitivity screening of proposed outbound content
- Lifecycle transition legality
- Idempotency-key construction and claim
- Retry budget accounting

### Bounded AI judgments

- Interpreting free-text enquiries into a classification drawn from a closed permitted set
- Identifying which required facts the free text does and does not establish
- Interpreting the intent of a free-text reply

### Human-only actions

- Approving any message that makes or implies a commitment
- Overriding a suppression or opt-out state
- Accepting a case the system routed for review
- Closing a case as a recorded terminal failure
- Granting an exception to a configured policy

### Possible actions

- Send an acknowledgement
- Send a minimum missing-information question
- Write or update the lead record
- Notify a named owner
- Schedule a follow-up
- Offer a next commercial step
- Apply suppression
- Route to human review

### The AI boundary

Regardless of confidence, the system may never:

- May not send a message that makes or implies a commercial commitment
- May not negotiate price or terms
- May not override suppression, opt-out, or consent state
- May not assert a fact the input did not establish
- May not raise its own authority on the basis of high confidence
- May not select an action outside the permitted set supplied with its request

### Guardrails

- Every external action is keyed and claimed before it executes, so replay cannot duplicate it
- Confidence below the configured floor routes to a person rather than to an action
- Suppression state is evaluated before commercial intent, never after
- Restricted consent state blocks the candidate action regardless of classification or confidence, and routes to a named person rather than resolving itself either way
- Lifecycle movement requires a declared transition; an undeclared move is rejected and recorded
- Facts the input did not establish are carried as missing information, never filled in
- Authority is attached to the action, not to the actor’s confidence
- A side effect whose execution outcome is unknown is never retried without independent verification that it did not occur, unless the provider itself guarantees idempotent processing of the same key

### Success and terminal states

- `DUPLICATE` (terminal neutral) — This record refers to an entity already under management and has been merged into it. Distinct from a duplicate *event*, which never reaches a lifecycle state because the ledger refuses it first.
- `BOOKED` (terminal success) — A next step is confirmed on the calendar.
- `CLOSED_BAD_FIT` (terminal neutral) — Genuine enquiry, outside the served segment. Closed correctly rather than pursued.
- `CLOSED_SPAM` (terminal neutral) — Automated, solicitation, or otherwise not a buying enquiry.
- `DO_NOT_CONTACT` (terminal neutral) — Suppression or opt-out state applies. Overrides commercial intent permanently.
- `FAILED_TERMINAL` (terminal failure) — Processing failed and no retry can resolve it. Recorded explicitly so it is countable, never a silent drop.

### Measures

| Metric | Kind | Definition | System of record | Unit |
| --- | --- | --- | --- | --- |
| Inbound events received | COVERAGE | Count of distinct inbound events accepted at the channel boundary, before deduplication. | Inbound channel adapter | events |
| Valid leads captured | COVERAGE | Count of distinct entities created or matched from inbound events that were not classified as non-enquiries. | Workflow store | leads |
| Capture coverage | COVERAGE | Valid leads captured divided by inbound events received, after removing events deduplicated by source event identity and events classified as non-enquiries. | Workflow store joined to inbound channel adapter | percent |
| Acknowledgement latency | LEADING | Elapsed time from event receipt to the acknowledgement side effect resolving as executed. Reported as median and 95th percentile; a single mean hides the tail that matters. | Side-effect ledger | seconds |
| Meaningful-response latency | LEADING | Elapsed time from event receipt to either a named human owner being notified or a substantive question being despatched. Excludes automated acknowledgement, which is not a meaningful response. | Side-effect ledger | seconds |
| Missed-lead rate | RELIABILITY | Share of valid leads that reached neither a terminal state, a waiting state, nor human review within the observation window. | Workflow store | percent |
| Duplicate-event rate | RELIABILITY | Share of received events whose source event identity had already been observed. | Event ledger | percent |
| Duplicate external-action rate | RELIABILITY | Count of executed side effects sharing an idempotency key with an earlier executed side effect, divided by executed side effects. The lab target for this metric is zero. | Side-effect ledger | percent |
| Escalation rate | LEADING | Share of valid leads that entered human review or escalation at any point. | Workflow store | percent |
| Final disposition coverage | COVERAGE | Share of valid leads holding a terminal, waiting, or human-review state at the end of the observation window. Any other state counts as uncovered. | Workflow store | percent |
| Booking-ready rate | LAGGING | Share of valid leads that reached a state where a next commercial step could be offered. | Workflow store | percent |
| Booked rate | LAGGING | Share of valid leads that reached a confirmed scheduled next step. | Customer system of record | percent |

### Operating standards

**Evidence · weak support** — Delay between an inbound enquiry and a first meaningful response is associated with materially lower odds of making contact and of qualifying the lead.

- *Applies to:* Justifies acknowledgement and routing latency as leading indicators, and justifies treating after-hours arrival as a design problem rather than an acceptable delay.
- *Sources:* MIT Sloan School of Management / InsideSales.com, *Lead Response Management Study (James B. Oldroyd)*
- *Caveat:* Located, but materially weaker than its common retelling. Treated as directional only.
- *Correction:* The widely quoted "5 minutes versus 30 minutes = 100x contact, 21x qualification" figures come from the 2007 MIT/InsideSales Lead Response Management study, NOT from the 2011 Harvard Business Review article they are usually credited to. The study is a six-company non-random sample co-produced with a vendor holding a commercial interest in the result, and its data is now nearly two decades old. It is used here as directional support for measuring latency, never as a benchmark to hit.

**Evidence · unverified** — Typical organisational first-response times to inbound enquiries are substantially slower than the window in which response appears to matter most.

- *Applies to:* Frames the size of the commercial opportunity. Deliberately stated without numbers, because the underlying figures were not read in the primary text during this build.
- *Sources:* Harvard Business Review, *The Short Life of Online Sales Leads (Oldroyd, McElheran, Elkington)*
- *Caveat:* Asserted from a named source family; not yet located and read. Not established fact.

**Evidence** — Commercial email carries legal obligations: accurate header information, a non-deceptive subject line, identification as an advertisement, a valid physical postal address, and a working opt-out mechanism honoured within 10 business days.

- *Applies to:* Makes suppression state a first-class lifecycle concern evaluated before commercial intent, and makes overriding opt-out a human-only action. Sets the legal floor; an operator’s own policy may be stricter.
- *Sources:* US Federal Trade Commission, *CAN-SPAM Act: A Compliance Guide for Business*

**Evidence** — Event delivery to an endpoint is at-least-once: the same business event can legitimately arrive more than once, and retries of undelivered events compound this. Consumers must therefore key and deduplicate the external actions they take.

- *Applies to:* Directly justifies the side-effect ledger, the idempotency key on every proposed effect, and the SUPPRESSED_DUPLICATE outcome. This is the reason duplicate handling is core-level rather than per-system.
- *Sources:* Stripe, *Receive Stripe events in your webhook endpoint*; Stripe, *Idempotent requests (API Reference)*

**Evidence** — The intended orchestration runtime provides node-level retry with bounded attempts, a separate error output branch, and dedicated error workflows. Failure handling is an explicit design responsibility, not an automatic property of the runtime.

- *Applies to:* Justifies modelling FAILED_RECOVERABLE and FAILED_TERMINAL as distinct explicit states with a bounded retry budget, rather than a single generic error state.
- *Sources:* n8n, *Handle errors gracefully (n8n Docs)*

**Lab target** — Every valid inbound event finishes the observation window in a terminal state, a waiting state, or human review. Silent disappearance counts as a defect.

- *Applies to:* Final disposition coverage metric and the missed-lead rate.

**Lab target** — Replayed duplicate events produce zero duplicate external actions.

- *Applies to:* Asserted by the duplicate-suppression test, which replays a real duplicate event through the engine rather than depicting one.

**Lab target** — Every low-confidence or policy-sensitive case has a safe path to a person, and takes it rather than acting.

- *Applies to:* Asserted by the low-confidence escalation test.

**Lab target** — The simulated acknowledgement and routing paths are designed around a configurable speed-to-lead objective. The specific interval is a client policy value and is not asserted as a universal benchmark.

- *Applies to:* Keeps the latency objective configurable per operator rather than hard-coded, and keeps the portfolio from restating vendor benchmarks as fact.

**Lab target** — A side effect whose outcome is unknown is retried only after independent verification proves it did not occur, or when the provider itself guarantees idempotent processing of the same key. It is never retried on the strength of an assumption.

- *Applies to:* The execution ledger’s retry-safety gate. Tested for both the verification-gated case and the provider-idempotent case separately, since the two must not share a code path by accident.

### Known failure modes

See [FAILURE_MODE_REGISTER.md](FAILURE_MODE_REGISTER.md) for the full entries. This system declares 14: `DUPLICATE_EVENT`, `RETRY_DUPLICATE_SIDE_EFFECT`, `MALFORMED_PAYLOAD`, `MISSING_REQUIRED_FIELD`, `AI_LOW_CONFIDENCE`, `AI_MALFORMED_OUTPUT`, `AI_UNSUPPORTED_INFERENCE`, `SUPPRESSION_STATE`, `DOWNSTREAM_API_FAILURE`, `HUMAN_APPROVAL_TIMEOUT`, `UNEXPECTED_HUMAN_REPLY`, `STATE_TRANSITION_CONFLICT`, `REPLAY_AFTER_COMPLETION`, `OUT_OF_ORDER_EVENT`.

---

## 2. Dormant Pipeline Recovery

**Maturity: SIMULATED**

Two scenarios replay through the same engine core Lead Rescue proved: a timing objection expires and the opportunity is genuinely reopened after a named human acceptance, and a textbook-qualifying recycle trigger is correctly overridden by suppression before any candidate action is ever computed. The re-entry reason is a real date comparison against the event, never a narrated yes. As with Lead Rescue, nothing here is live: no message left this process, no model was called, and the business is fictional.

### Business problem

Previously acquired leads and opportunities sit unused with no disciplined rule determining which should be revisited, why now, what changed, whether outreach is still permitted, and when to stop.

### Economic leakage

Acquisition cost already spent on these records is written off by inaction, while undisciplined reactivation burns the same list and converts a recoverable asset into a suppression list.

### Buyer / operator outcome

Every dormant record is deliberately dispositioned — suppressed, archived, scheduled, reactivated, or routed to a person — with an explicit recorded reason, rather than left to decay or swept into a bulk send.

### Triggers

- A scheduled evaluation of the dormant set runs
- A recorded objection reason expires
- A relevant customer or account event is observed
- A previously unmet qualification condition becomes satisfied
- A person defines a campaign over a named segment

### Authoritative sources of truth

- The customer system of record is authoritative for entity identity, stage history, and consent state
- The suppression register is authoritative for contact permission
- The outreach log is authoritative for attempts already made

### Important entities

- Dormant record
- Contact
- Re-entry reason
- Sequence
- Attempt
- Suppression entry

### Lifecycle states

| State | Kind | Meaning |
| --- | --- | --- |
| `DORMANT` | INITIAL | The record is inactive and has not yet been evaluated in this cycle. |
| `ELIGIBILITY_REVIEW` | ACTIVE | Being tested against consent state and the declared set of valid re-entry reasons. |
| `SUPPRESSED` | TERMINAL NEUTRAL | Contact permission is absent or withdrawn. Commercial interest does not override this. |
| `ARCHIVED` | TERMINAL NEUTRAL | No valid re-entry reason exists. Deliberately closed rather than left ambiguous. |
| `SCHEDULED` | WAITING | Eligible with a valid reason, held until the reason’s appropriate moment. |
| `REACTIVATION_ATTEMPTED` | ACTIVE | One attempt from the sequence has been despatched. |
| `AWAITING_RESPONSE` | WAITING | Parked between attempts, within the declared cadence. |
| `POSITIVE_RESPONSE` | ACTIVE | The contact responded with interest and the response has been interpreted. |
| `REOPENED` | TERMINAL SUCCESS | Returned to the active pipeline under human ownership. |
| `OPTED_OUT` | TERMINAL NEUTRAL | The contact withdrew permission. Permanent and immediate. |
| `ATTEMPTS_EXHAUSTED` | ACTIVE | The declared maximum attempts were made without response. |
| `COOLING_OFF` | WAITING | Held for the declared cooling-off period before any re-entry may be considered. |
| `NEEDS_HUMAN` | HUMAN REVIEW | Eligibility or response interpretation exceeded the system’s authority. |

### Declared transitions

Only these moves are permitted. The engine rejects anything else and records the rejection.

| From | To | Mechanism | Guard | Authority |
| --- | --- | --- | --- | --- |
| `DORMANT` | `ELIGIBILITY_REVIEW` | DETERMINISTIC RULE | Record is in the evaluated segment. | 3 |
| `ELIGIBILITY_REVIEW` | `SUPPRESSED` | DETERMINISTIC RULE | Suppression or opt-out state present. | 3 |
| `ELIGIBILITY_REVIEW` | `ARCHIVED` | DETERMINISTIC RULE | No declared re-entry reason applies. Inactivity alone is not a reason. | 3 |
| `ELIGIBILITY_REVIEW` | `SCHEDULED` | DETERMINISTIC RULE | A declared re-entry reason applies and consent permits contact. | 3 |
| `ELIGIBILITY_REVIEW` | `NEEDS_HUMAN` | DETERMINISTIC RULE | Evidence for the re-entry reason is contradictory or below the confidence floor. | 2 |
| `SCHEDULED` | `REACTIVATION_ATTEMPTED` | DETERMINISTIC RULE | Attempt budget not exhausted and consent re-checked immediately before despatch. | 3 |
| `REACTIVATION_ATTEMPTED` | `AWAITING_RESPONSE` | DETERMINISTIC RULE | The attempt resolved as executed and was logged. | 3 |
| `AWAITING_RESPONSE` | `POSITIVE_RESPONSE` | DETERMINISTIC RULE | Response interpreted as interest at or above the confidence floor. | 3 |
| `AWAITING_RESPONSE` | `OPTED_OUT` | DETERMINISTIC RULE | Response expresses opt-out. | 3 |
| `AWAITING_RESPONSE` | `REACTIVATION_ATTEMPTED` | DETERMINISTIC RULE | No response, attempt budget not exhausted, cadence interval elapsed. | 3 |
| `AWAITING_RESPONSE` | `ATTEMPTS_EXHAUSTED` | DETERMINISTIC RULE | Declared maximum attempts reached. | 3 |
| `AWAITING_RESPONSE` | `NEEDS_HUMAN` | DETERMINISTIC RULE | Response is off-script, raises a complaint, or falls below the confidence floor. | 2 |
| `POSITIVE_RESPONSE` | `REOPENED` | HUMAN DECISION | A named owner accepted the opportunity back into the active pipeline. | 2 |
| `POSITIVE_RESPONSE` | `NEEDS_HUMAN` | DETERMINISTIC RULE | No owner is available within the configured window. | 2 |
| `ATTEMPTS_EXHAUSTED` | `COOLING_OFF` | DETERMINISTIC RULE | Exit condition met; cooling-off period begins. | 3 |
| `COOLING_OFF` | `ELIGIBILITY_REVIEW` | DETERMINISTIC RULE | Declared cooling-off period elapsed and a NEW re-entry reason exists. | 3 |
| `COOLING_OFF` | `ARCHIVED` | DETERMINISTIC RULE | Cooling-off elapsed with no new re-entry reason. | 3 |
| `NEEDS_HUMAN` | `REOPENED` | HUMAN DECISION | A person judged the record worth reactivating. | 2 |
| `NEEDS_HUMAN` | `ARCHIVED` | HUMAN DECISION | A person closed the record. | 2 |
| `NEEDS_HUMAN` | `SUPPRESSED` | HUMAN DECISION | A person applied suppression. | 2 |

### Deterministic decisions

- Consent and suppression screening, re-checked immediately before each despatch
- Re-entry reason evaluation against the declared set
- Attempt budget and cadence interval accounting
- Cooling-off period accounting
- Duplicate outreach detection across concurrent sequences
- Exit condition evaluation

### Bounded AI judgments

- Interpreting whether an observed account event constitutes a relevant change
- Interpreting the intent of a free-text response

### Human-only actions

- Defining a campaign or segment
- Accepting a reopened opportunity into the active pipeline
- Granting an exception to cadence or attempt limits
- Overriding suppression state

### Possible actions

- Suppress the record
- Archive the record
- Schedule a future evaluation
- Despatch one sequence attempt
- Route to a named owner
- Return the record to the active pipeline

### The AI boundary

Regardless of confidence, the system may never:

- May not treat inactivity alone as authority to make contact
- May not override suppression or consent state
- May not exceed the declared attempt budget or cadence
- May not assert that an account event occurred without a source record for it
- May not enter an existing customer into prospecting outreach

### Guardrails

- Every re-entry carries an explicit recorded reason drawn from a declared set
- Consent is re-checked immediately before each despatch, not once at segment build time
- Every sequence declares entry criteria, cadence, maximum attempts, exit, suppression, and re-entry conditions before it may run
- Engagement proxies such as opens are excluded from success criteria
- Concurrent sequences cannot both contact the same entity

### Success and terminal states

- `SUPPRESSED` (terminal neutral) — Contact permission is absent or withdrawn. Commercial interest does not override this.
- `ARCHIVED` (terminal neutral) — No valid re-entry reason exists. Deliberately closed rather than left ambiguous.
- `REOPENED` (terminal success) — Returned to the active pipeline under human ownership.
- `OPTED_OUT` (terminal neutral) — The contact withdrew permission. Permanent and immediate.

### Measures

| Metric | Kind | Definition | System of record | Unit |
| --- | --- | --- | --- | --- |
| Dormant records evaluated | COVERAGE | Count of distinct dormant records passed through eligibility review in the cycle. | Workflow store | records |
| Eligibility rate | LEADING | Records with a valid declared re-entry reason and permitted consent state, divided by records evaluated. | Workflow store | percent |
| Suppression rate | RELIABILITY | Records dispositioned as suppressed, divided by records evaluated. | Suppression register | percent |
| Reactivation attempts | LEADING | Count of executed outreach attempts, excluding attempts suppressed as duplicates. | Side-effect ledger | attempts |
| Positive replies | LAGGING | Responses interpreted as interest at or above the confidence floor, confirmed by a human acceptance. | Workflow store | replies |
| Reopened opportunities | LAGGING | Records returned to the active pipeline under a named owner. | Customer system of record | opportunities |
| Recovered pipeline value | LAGGING | Sum of opportunity values for reopened records at the stage value recorded on reopening. Recognised as pipeline, not revenue. | Customer system of record | currency |
| Recovered closed revenue | LAGGING | Sum of invoiced value from engagements that originated from a reopened dormant record, recognised only once a signed agreement exists, never projected from reopened pipeline value. | Customer system of record | currency |
| Trigger-to-action latency | LEADING | Elapsed time from the re-entry reason becoming true to the first executed attempt. | Side-effect ledger | hours |
| Opt-out rate | RELIABILITY | Opt-outs received divided by executed attempts. A rising value indicates the segment is being over-worked. | Suppression register | percent |
| False-positive reactivation rate | RELIABILITY | Records accepted back into the active pipeline whose accepting owner reverses that decision within a defined review window, divided by records accepted in the period. | Workflow store | percent |
| Duplicate outreach rate | RELIABILITY | Executed attempts sharing an idempotency key or entity with a concurrent sequence, divided by executed attempts. Lab target is zero. | Side-effect ledger | percent |
| Terminal disposition coverage | COVERAGE | Share of evaluated records holding a terminal, waiting, or human-review state at cycle end. | Workflow store | percent |

### Operating standards

**Evidence** — Commercial email requires a working opt-out honoured within 10 business days, and addresses that have opted out may not be sold or transferred. Permission is a property of the contact, not of the campaign.

- *Applies to:* Makes suppression a terminal disposition evaluated before eligibility, and makes overriding it a human-only action. Sets the legal floor; an operator policy may be stricter.
- *Sources:* US Federal Trade Commission, *CAN-SPAM Act: A Compliance Guide for Business*

**Evidence** — Email open tracking is unreliable as a signal of recipient attention. Apple Mail preloads remote content on receipt rather than on open and prevents senders from seeing whether a message was opened, so tracking pixels fire regardless of whether anyone read the message.

- *Applies to:* Excludes opens and open-derived rates from every success criterion and from the re-entry reason set. Reply, meeting, and reopened-opportunity are used instead.
- *Sources:* Apple, *Mail Privacy Protection*

**Evidence** — Event and job delivery is at-least-once, so a reactivation attempt can be triggered more than once for the same record unless external actions are keyed and deduplicated.

- *Applies to:* Justifies keying every outreach attempt and tracking duplicate outreach as a reliability metric.
- *Sources:* Stripe, *Receive Stripe events in your webhook endpoint*

**Lab target** — No record may enter outreach without an explicit re-entry reason drawn from the declared set. Elapsed inactivity is not a reason.

- *Applies to:* The eligibility transition guard, which rejects records lacking a declared reason.

**Lab target** — Every sequence declares entry criteria, cadence, maximum attempts, exit conditions, suppression conditions, and re-entry conditions before it is permitted to run.

- *Applies to:* Sequence definition validation and the attempts-exhausted exit path.

### Known failure modes

See [FAILURE_MODE_REGISTER.md](FAILURE_MODE_REGISTER.md) for the full entries. This system declares 6: `SUPPRESSION_STATE`, `RETRY_DUPLICATE_SIDE_EFFECT`, `STALE_DATA`, `WRONG_ENTITY_MATCH`, `POLICY_VIOLATION`, `RATE_LIMITED`.

---

## 3. Call-to-Proposal Revenue Agent

**Maturity: SIMULATED**

Two scenarios replay through the same engine core Lead Rescue and Dormant Pipeline Recovery proved: a discovery call whose every material fact is cited, sourced, or derived reaches an approved, despatched proposal; and a candidate claim that expands scope with zero supporting citation is refused before a draft can exist, regardless of its confidence. A third, smaller path shows a genuinely missing material fact routed to a person and closed by a recorded human answer. Extraction is the one bounded judgment, resolved through a dedicated port before the deterministic claim-admission gate, required-field coverage, scope derivation, and approval-authority checks run — none of which the judgment itself may bypass. As with the first two systems, nothing here is live: no message left this process, no model was called, and the business is fictional.

### Business problem

Commercial truth established during a discovery conversation is lost or distorted on the way into follow-up, scope, the customer record, and the proposal.

### Economic leakage

The most expensive input in the sale — senior time in a live conversation — is partially discarded within hours. What survives is reconstructed from memory, so scope drifts, promises go unrecorded, and the resulting proposal is negotiated against facts nobody verified.

### Buyer / operator outcome

A completed conversation becomes a verified, human-reviewable commercial package in which every asserted fact traces to something actually said, and everything unknown is visibly still unknown.

### Triggers

- A conversation transcript becomes available
- A person supplies a clarification for a recorded gap
- A reviewer requests a revision

### Authoritative sources of truth

- The transcript is authoritative for what was said
- The customer system of record is authoritative for account and opportunity identity
- The approved rate card is authoritative for commercial terms

### Important entities

- Transcript
- Structured commercial record
- Claim
- Gap
- Proposal draft
- Approval

### Lifecycle states

| State | Kind | Meaning |
| --- | --- | --- |
| `TRANSCRIPT_RECEIVED` | INITIAL | Source material is available and nothing has been extracted from it yet. |
| `EXTRACTING` | ACTIVE | A bounded judgment is mapping the transcript onto the structured commercial record. |
| `STRUCTURED_RECORD` | ACTIVE | Fields are populated and each carries a reference back to its supporting passage. |
| `GAPS_IDENTIFIED` | ACTIVE | Required fields the transcript did not establish are listed as unknown. |
| `AWAITING_CLARIFICATION` | WAITING | A gap was put to a person and the system is parked awaiting the answer. |
| `CLAIMS_REVIEW` | ACTIVE | Every asserted claim is being tested against its cited evidence. |
| `DRAFT_PREPARED` | ACTIVE | A proposal draft exists. It has not been seen by anyone outside the firm. |
| `AWAITING_APPROVAL` | HUMAN REVIEW | Held at authority level 2. Nothing may leave the firm from this state without a person acting. |
| `REVISION_REQUESTED` | ACTIVE | A reviewer rejected the draft with recorded reasons. |
| `APPROVED_SENT` | TERMINAL SUCCESS | A named person approved the package and it was despatched. |
| `REJECTED` | TERMINAL NEUTRAL | A person judged the package should not be sent. |
| `NEEDS_HUMAN` | HUMAN REVIEW | Extraction or claims review exceeded the system’s authority or confidence. |
| `FAILED_TERMINAL` | TERMINAL FAILURE | The package cannot be produced from the available material. Recorded explicitly. |

### Declared transitions

Only these moves are permitted. The engine rejects anything else and records the rejection.

| From | To | Mechanism | Guard | Authority |
| --- | --- | --- | --- | --- |
| `TRANSCRIPT_RECEIVED` | `EXTRACTING` | DETERMINISTIC RULE | Transcript passes schema and minimum length validation. | 3 |
| `EXTRACTING` | `STRUCTURED_RECORD` | BOUNDED AI JUDGMENT | Output satisfies the record contract and every populated field cites a passage. | 1 |
| `EXTRACTING` | `NEEDS_HUMAN` | DETERMINISTIC RULE | Output violated its contract, or confidence fell below the configured floor. | 2 |
| `STRUCTURED_RECORD` | `GAPS_IDENTIFIED` | DETERMINISTIC RULE | Required-field coverage computed against the declared record schema. | 3 |
| `GAPS_IDENTIFIED` | `AWAITING_CLARIFICATION` | DETERMINISTIC RULE | At least one gap is material to scope or commercial terms. | 3 |
| `GAPS_IDENTIFIED` | `CLAIMS_REVIEW` | DETERMINISTIC RULE | No remaining gap is material; immaterial gaps stay marked unknown. | 3 |
| `AWAITING_CLARIFICATION` | `CLAIMS_REVIEW` | HUMAN DECISION | A person supplied the missing fact and it was recorded with them as its source. | 2 |
| `AWAITING_CLARIFICATION` | `NEEDS_HUMAN` | DETERMINISTIC RULE | No clarification within the configured window. | 2 |
| `CLAIMS_REVIEW` | `DRAFT_PREPARED` | DETERMINISTIC RULE | Every asserted claim resolves to a cited passage or a human-supplied fact. Zero unsupported claims. | 3 |
| `CLAIMS_REVIEW` | `NEEDS_HUMAN` | DETERMINISTIC RULE | At least one claim has no supporting evidence. | 2 |
| `DRAFT_PREPARED` | `AWAITING_APPROVAL` | DETERMINISTIC RULE | Draft assembled and routed to a person with approval authority. | 2 |
| `AWAITING_APPROVAL` | `APPROVED_SENT` | HUMAN DECISION | A named person with the required authority approved despatch. | 2 |
| `AWAITING_APPROVAL` | `REVISION_REQUESTED` | HUMAN DECISION | A reviewer recorded required changes. | 2 |
| `AWAITING_APPROVAL` | `REJECTED` | HUMAN DECISION | A reviewer judged the package should not be sent at all. | 2 |
| `REVISION_REQUESTED` | `DRAFT_PREPARED` | DETERMINISTIC RULE | Recorded changes applied and the revision budget is not exhausted. | 3 |
| `NEEDS_HUMAN` | `DRAFT_PREPARED` | HUMAN DECISION | A person resolved the unsupported claim or supplied the missing fact. | 2 |
| `NEEDS_HUMAN` | `REJECTED` | HUMAN DECISION | A person judged the package should not proceed. | 2 |
| `NEEDS_HUMAN` | `FAILED_TERMINAL` | HUMAN DECISION | The material cannot support a package and no clarification is available. | 2 |

### Deterministic decisions

- Transcript schema and minimum-length validation
- Required-field coverage against the declared record schema
- Materiality classification of each gap
- Claim-to-evidence resolution: every asserted claim must cite a passage or a human-supplied fact
- Commercial term validation against the approved rate card
- Revision budget accounting
- Approval authority verification

### Bounded AI judgments

- Mapping conversational language onto structured commercial record fields
- Identifying which required fields the conversation did and did not establish
- Summarising stated objections and risks without resolving them

### Human-only actions

- Approving despatch of any proposal or commercial commitment
- Supplying a fact the transcript did not establish
- Agreeing pricing outside the approved rate card
- Rejecting or terminating the package

### Possible actions

- Populate a structured commercial record field with a cited passage
- Record a gap as unknown
- Ask a person to close a material gap
- Assemble a proposal draft
- Route for approval
- Despatch an approved package

### The AI boundary

Regardless of confidence, the system may never:

- May not assert a commercial fact the transcript did not establish
- May not convert an unknown into a plausible default
- May not propose terms outside the approved rate card
- May not despatch anything externally at any confidence level
- May not resolve a stated objection on the buyer’s behalf
- May not infer budget, authority, or timing that was not discussed

### Guardrails

- Every populated field carries a reference to the passage supporting it
- Unknown fields remain visibly unknown and are never defaulted
- A claim without supporting evidence blocks the draft rather than being softened
- Human-supplied facts are recorded with the person as their source, distinct from transcript-derived facts
- Despatch is capped at authority level 2 regardless of confidence

### Success and terminal states

- `APPROVED_SENT` (terminal success) — A named person approved the package and it was despatched.
- `REJECTED` (terminal neutral) — A person judged the package should not be sent.
- `FAILED_TERMINAL` (terminal failure) — The package cannot be produced from the available material. Recorded explicitly.

### Measures

| Metric | Kind | Definition | System of record | Unit |
| --- | --- | --- | --- | --- |
| Transcript-to-record latency | LEADING | Elapsed time from transcript availability to a structured record satisfying its contract. | Workflow store | minutes |
| Required-field coverage | COVERAGE | Required fields populated with a cited source, divided by required fields in the declared schema. Fields marked unknown count as uncovered, deliberately. | Structured commercial record | percent |
| Unknowns correctly marked | RELIABILITY | Fields marked unknown that a human reviewer agrees were genuinely not established, divided by fields marked unknown. | Reviewer annotations | percent |
| Unsupported claims | RELIABILITY | Count of asserted claims that resolve to no cited passage and no human-supplied fact. The lab target for this metric is zero. | Claims review | claims |
| Human corrections | RELIABILITY | Count of reviewer edits that change a fact rather than wording, per package. | Reviewer annotations | corrections |
| Proposal draft latency | LEADING | Elapsed time from transcript availability to a draft routed for approval. | Workflow store | hours |
| Revision count | RELIABILITY | Mean number of revision cycles per package before approval or rejection. | Workflow store | cycles |
| Scope discrepancy | LAGGING | Count of engagements where delivered scope differed materially from proposed scope, divided by engagements started. | Delivery workspace joined to proposal record | percent |
| Proposal acceptance rate | LAGGING | Packages accepted divided by packages despatched. | Customer system of record | percent |

### Operating standards

**Evidence** — Generative models produce fluent output that is not grounded in their input. Confabulation is a named primary risk category requiring managed controls, not an occasional defect to be tuned away.

- *Applies to:* Justifies the entire claim-to-evidence architecture: cited passages on every populated field, explicit declined inferences, and a claims review that blocks the draft rather than softening the language.
- *Sources:* US National Institute of Standards and Technology, *AI Risk Management Framework: Generative AI Profile (NIST AI 600-1)*

**Evidence** — Human oversight and intervention are governance-level controls in recognised AI risk management practice, alongside content provenance and pre-deployment testing.

- *Applies to:* Justifies capping despatch at authority level 2 and treating approval as a lifecycle state rather than a notification.
- *Sources:* US National Institute of Standards and Technology, *AI Risk Management Framework: Generative AI Profile (NIST AI 600-1)*
- *Correction:* The cited profile is a governance framework, not a technical standard. It prescribes no thresholds, so the confidence floor and revision budget used here are operator policy, not derived from it.

**Evidence** — Current CRM practice treats a call's recommended next step as a structured, reviewable output distinct from freeform notes, gated by objective capture criteria.

- *Applies to:* Justifies representing agreed next step and its owner as required structured-record fields rather than leaving them in prose notes.
- *Sources:* HubSpot, *Review recommended next steps for deals*
- *Correction:* The cited page documents a beta product feature, not a study of outcomes. It supports treating structured next-step capture as current practice, not that it causes better results.

**Evidence** — Current pipeline-management guidance holds that a deal should only advance to the next stage when defined, measurable exit criteria for the current stage are actually met, not on rep judgment or activity alone.

- *Applies to:* Justifies required-field coverage as a computed gate the record must satisfy before progressing to claims review, and justifies material gaps blocking progress until resolved.
- *Sources:* Salesforce, *Sales Pipeline Management: A Complete Guide and the Best Tools in 2026*

**Lab target** — A package containing any claim that resolves to no cited passage and no human-supplied fact does not reach a reviewer.

- *Applies to:* The claims review transition guard, which routes to human review rather than proceeding.

**Lab target** — Information the conversation did not establish remains marked unknown through the whole pipeline and is never replaced by a plausible default.

- *Applies to:* Required-field coverage, which deliberately counts unknown fields as uncovered rather than filling them.

**Lab target** — Facts supplied by a person during clarification are recorded with that person as their source, distinguishable from facts derived from the transcript.

- *Applies to:* Provenance of every field in the structured commercial record.

### Known failure modes

See [FAILURE_MODE_REGISTER.md](FAILURE_MODE_REGISTER.md) for the full entries. This system declares 6: `AI_UNSUPPORTED_INFERENCE`, `AI_MALFORMED_OUTPUT`, `MISSING_REQUIRED_FIELD`, `POLICY_VIOLATION`, `HUMAN_APPROVAL_TIMEOUT`, `HUMAN_APPROVAL_TIMEOUT`.

---

## 4. Client Onboarding Operator

**Maturity: SIMULATED**

Two scenarios replay through the same engine core the first three systems proved: a signed engagement (continuing Call-to-Proposal’s own opportunity, not a fresh fixture) carries its commercial context forward, requests only the two genuinely missing categories of information — ordinary fields and, separately, secure access — provisions its delivery resources exactly once, and reaches a first-value milestone that requires recorded completion evidence while one unrelated task is still open. A second scenario redelivers the access-confirmation event and shows both a resource-provisioning port and the core lifecycle engine independently refusing to duplicate the same outcome, for two different reasons. A draft or despatched proposal is not sufficient authority to begin onboarding; only a payload asserting kind=SIGNED_AGREEMENT is. That handoff is no longer authored to merely resemble Call-to-Proposal’s own approved artifact: `lib/engine/handoffs/proposal-to-onboarding-handoff.ts` derives it mechanically from the claims Call-to-Proposal itself admitted, and `tests/handoff-boundary.test.ts` re-runs Call-to-Proposal’s own scenario live and asserts the translation matches the fixture this system actually consumes — the fixture is pinned data (what a real onboarding system would have received once, at signature time), not something recomputed on every load, but it is provably derived rather than hand-typed to match. Resource provisioning introduced a genuine third port — see STATUS.md for why SideEffectExecutor’s retry-safety contract does not fit an operation that is safe to repeat by construction. As with the first three systems, nothing here is live: no resource was created anywhere real, no model was called, and the business is fictional.

### Business problem

A closed sale turns into fragmented setup: repeated questions, unclear ownership, missing access, and delayed value.

### Economic leakage

Delay between payment and first value is the period in which the customer is paying and receiving nothing, which is where early churn and support burden originate. Every question re-asked also spends trust that the sale just bought.

### Buyer / operator outcome

Sales context is preserved, only genuinely missing information is requested, required infrastructure is created safely and exactly once, and the customer reaches a defined first-value milestone.

### Triggers

- An agreement is signed
- A customer supplies a requested item
- An access grant is confirmed
- A task owner records completion
- A blocking condition is cleared

### Authoritative sources of truth

- The signed agreement is authoritative for scope and commercial terms
- The customer system of record is authoritative for account identity and known facts
- The delivery workspace is authoritative for task existence, ownership, and state
- The secret store is authoritative for credential material; the workflow store never is

### Important entities

- Engagement
- Requirement
- Access grant
- Task
- Owner
- Milestone
- Blocker

### Lifecycle states

| State | Kind | Meaning |
| --- | --- | --- |
| `AGREEMENT_SIGNED` | INITIAL | A closed sale exists and onboarding has not begun. |
| `CONTEXT_LOADED` | ACTIVE | Everything already known from the sale has been read forward. Nothing here may be re-asked. |
| `GAPS_COMPUTED` | ACTIVE | The difference between required and known has been computed, distinguishing missing from contradictory. |
| `AWAITING_CUSTOMER_INPUT` | WAITING | Only genuinely missing items have been requested. Parked awaiting the customer. |
| `ACCESS_REQUESTED` | WAITING | Access grants requested through the customer’s own secret-sharing channel. No credential material enters workflow state. |
| `PROVISIONING` | ACTIVE | Creating the required delivery infrastructure, keyed so repeated execution cannot duplicate it. |
| `TASKS_ASSIGNED` | ACTIVE | Every required task exists with a named owner and a state. |
| `BLOCKED` | HUMAN REVIEW | Progress depends on something outside the system’s control. Blocked time is measured, not hidden. |
| `FIRST_VALUE_REACHED` | TERMINAL SUCCESS | The defined value milestone is met. Completion is defined by readiness, not by checklist exhaustion. |
| `NEEDS_HUMAN` | HUMAN REVIEW | Contractual ambiguity or contradictory information requires judgement. |
| `ABANDONED` | TERMINAL FAILURE | Onboarding stopped without reaching value. Recorded explicitly so it is countable. |

### Declared transitions

Only these moves are permitted. The engine rejects anything else and records the rejection.

| From | To | Mechanism | Guard | Authority |
| --- | --- | --- | --- | --- |
| `AGREEMENT_SIGNED` | `CONTEXT_LOADED` | DETERMINISTIC RULE | Sales context retrieved and mapped to the requirement schema. | 3 |
| `CONTEXT_LOADED` | `GAPS_COMPUTED` | DETERMINISTIC RULE | Required set differenced against known set. | 3 |
| `GAPS_COMPUTED` | `AWAITING_CUSTOMER_INPUT` | DETERMINISTIC RULE | At least one non-sensitive item is genuinely missing and was never previously supplied. | 3 |
| `GAPS_COMPUTED` | `ACCESS_REQUESTED` | DETERMINISTIC RULE | At least one required item is an access grant, routed through the secret-sharing channel. | 3 |
| `GAPS_COMPUTED` | `NEEDS_HUMAN` | DETERMINISTIC RULE | Known information contradicts the agreement, or contractual scope is ambiguous. | 2 |
| `AWAITING_CUSTOMER_INPUT` | `GAPS_COMPUTED` | DETERMINISTIC RULE | Supplied item recorded; the gap set is recomputed rather than assumed closed. | 3 |
| `AWAITING_CUSTOMER_INPUT` | `BLOCKED` | DETERMINISTIC RULE | Configured window elapsed without the item. | 2 |
| `ACCESS_REQUESTED` | `PROVISIONING` | DETERMINISTIC RULE | Access confirmed by the granting system. Confirmation is read from that system, never asserted by the requester. | 3 |
| `ACCESS_REQUESTED` | `BLOCKED` | DETERMINISTIC RULE | Configured window elapsed without the grant. | 2 |
| `PROVISIONING` | `TASKS_ASSIGNED` | DETERMINISTIC RULE | Every required resource exists exactly once and every task has a named owner. | 3 |
| `PROVISIONING` | `NEEDS_HUMAN` | DETERMINISTIC RULE | Resource creation partially succeeded and reconciliation could not resolve the difference. | 2 |
| `TASKS_ASSIGNED` | `FIRST_VALUE_REACHED` | DETERMINISTIC RULE | The declared value criteria are satisfied. Checklist completion alone does not satisfy this guard. | 3 |
| `TASKS_ASSIGNED` | `BLOCKED` | DETERMINISTIC RULE | A task owner recorded a dependency outside the system’s control. | 2 |
| `BLOCKED` | `TASKS_ASSIGNED` | HUMAN DECISION | A person recorded the blocking condition as resolved. | 2 |
| `BLOCKED` | `NEEDS_HUMAN` | DETERMINISTIC RULE | Blocked duration exceeded the configured threshold. | 2 |
| `NEEDS_HUMAN` | `TASKS_ASSIGNED` | HUMAN DECISION | A person resolved the ambiguity or contradiction. | 2 |
| `NEEDS_HUMAN` | `ABANDONED` | HUMAN DECISION | A person recorded that onboarding will not continue. | 2 |

### Deterministic decisions

- Difference of the required set against the already-known set
- Distinguishing missing information from contradictory information
- Classifying a requirement as sensitive access material or ordinary information
- Idempotent resource creation keyed on engagement and resource identity
- Task ownership coverage checking
- Blocked-duration accounting
- Value-milestone evaluation against declared criteria

### Bounded AI judgments

- Interpreting free-text agreement or handover notes into structured requirements, when the inbound handoff is not already a structured, schema-validated artifact translated from an upstream system
- Interpreting whether a customer reply actually supplies the requested item

### Human-only actions

- Resolving contractual scope ambiguity
- Resolving contradictions between the agreement and the customer record
- Recording a blocking condition as cleared
- Declaring onboarding abandoned
- Approving any deviation from agreed scope

### Possible actions

- Read known context forward from the sale
- Request a genuinely missing item
- Request an access grant through the secret-sharing channel
- Create a delivery resource idempotently
- Assign a task to a named owner
- Record a blocker
- Declare the value milestone met

### The AI boundary

Regardless of confidence, the system may never:

- May not request information the record already holds
- May not persist credential material in workflow state, tickets, logs, or email
- May not treat a plausible answer as a supplied item without confirming it against the requirement
- May not resolve contractual ambiguity
- May not declare a value milestone met on the basis of checklist completion alone

### Guardrails

- Previously known information is never requested again without a recorded reason
- Missing information and contradictory information are handled by different paths
- Every required task has an owner and a state before the engagement may progress
- Repeated execution cannot create duplicate resources, because creation is keyed
- Credential material is requested through the customer’s own secret channel and never captured in workflow state
- Completion is defined by value criteria, not by checklist exhaustion

### Success and terminal states

- `FIRST_VALUE_REACHED` (terminal success) — The defined value milestone is met. Completion is defined by readiness, not by checklist exhaustion.
- `ABANDONED` (terminal failure) — Onboarding stopped without reaching value. Recorded explicitly so it is countable.

### Measures

| Metric | Kind | Definition | System of record | Unit |
| --- | --- | --- | --- | --- |
| Handoff completeness | COVERAGE | Required onboarding fields already populated from sales context at the moment of signature, divided by required fields. | Customer system of record | percent |
| Repeated-information requests | RELIABILITY | Count of requests for items the record already held at request time. The lab target for this metric is zero. | Side-effect ledger joined to customer system of record | requests |
| Kickoff latency | LEADING | Elapsed time from signature to the first customer-visible onboarding action. | Side-effect ledger | hours |
| Access completion | LEADING | Access grants confirmed by the granting system, divided by access grants requested. | Granting systems | percent |
| Task ownership coverage | COVERAGE | Required tasks with a named owner, divided by required tasks. | Delivery workspace | percent |
| Blocked time | RELIABILITY | Cumulative hours an engagement spent in the blocked state, reported separately from total elapsed time so external dependency is not counted as internal slowness. | Workflow store | hours |
| Time to first value | LAGGING | Elapsed time from signature to satisfaction of the declared value criteria. The criteria themselves vary by engagement and are client policy. | Workflow store | days |
| Duplicate resource rate | RELIABILITY | Resources created more than once for the same engagement, divided by resources created. Lab target is zero. | Side-effect ledger | percent |
| Onboarding completion rate | LAGGING | Engagements reaching the value milestone, divided by engagements started. | Workflow store | percent |

### Operating standards

**Evidence** — Secrets must not be hardcoded in source or scattered through configuration, must not be left in logs without a removal process, must be held in a centralised store under least privilege, and must have defined creation, rotation, revocation, and expiry.

- *Applies to:* Makes credential material structurally excluded from workflow state. Access is requested through the customer’s own secret channel, and confirmation is read from the granting system rather than from the message that claimed it.
- *Sources:* OWASP, *Secrets Management Cheat Sheet (OWASP Cheat Sheet Series)*

**Evidence** — Operations that create resources must be idempotent, because delivery and retry semantics guarantee that a creation instruction can be received more than once. The established pattern is a caller-supplied key recorded before the operation.

- *Applies to:* Justifies keying every resource creation on engagement plus resource identity, which is what prevents duplicate folders, projects, and task lists on re-run.
- *Sources:* Stripe, *Idempotent requests (API Reference)*; Stripe, *Receive Stripe events in your webhook endpoint*

**Evidence** — Access must be scoped to the minimum privilege necessary for the requesting role’s function, applied both horizontally and vertically, with periodic review against privilege creep.

- *Applies to:* Every secure-access requirement states a least-privilege scope by construction — never a broad or administrative grant requested casually.
- *Sources:* OWASP, *Authorization Cheat Sheet (OWASP Cheat Sheet Series)*

**Evidence** — Current customer-onboarding practice passes sales-established context forward so the customer is not asked to start from scratch, and treats a defined value milestone — not checklist completion — as the onboarding success criterion.

- *Applies to:* Justifies reading the signed handoff forward before asking the customer anything, and justifies the milestone transition guard requiring recorded completion evidence rather than exhausted tasks.
- *Sources:* HubSpot, *Customer Onboarding: Definition, Best Practices, and Key Metrics*; Gainsight, *Customer Onboarding Metrics (Glossary)*
- *Correction:* Both sources are customer-success vendor content aimed at SaaS businesses, not controlled studies, and neither is authoritative for a project-based professional-services firm. A third-party churn statistic on the HubSpot page was not independently verified and is not repeated here. Gainsight’s metric glossary does not cover "customer effort" at all despite being checked specifically for it.

**Lab target** — Information already held in the record is never requested from the customer again without a recorded reason.

- *Applies to:* The gap computation, which differences required against known before any request is composed.

**Lab target** — Onboarding is complete when declared value criteria are satisfied, not when a checklist is exhausted.

- *Applies to:* The milestone transition guard. Time-to-first-value is the primary outcome, but its target is client policy because service complexity varies.

**Lab target** — Missing information and contradictory information are distinct conditions with distinct paths. Contradiction requires a person; absence does not.

- *Applies to:* Gap routing, which separates the request path from the human-review path.

### Known failure modes

See [FAILURE_MODE_REGISTER.md](FAILURE_MODE_REGISTER.md) for the full entries. This system declares 8: `HUMAN_APPROVAL_TIMEOUT`, `CREDENTIAL_FAILURE`, `RETRY_DUPLICATE_SIDE_EFFECT`, `CONTRADICTORY_DATA`, `POLICY_VIOLATION`, `PARTIAL_SIDE_EFFECT`, `TIMEOUT`, `POLICY_VIOLATION`.

---

## 5. Receivables / Invoice Recovery Agent

**Maturity: SIMULATED**

Two scenarios replay through the same engine core the first four systems proved. A complex path shows the point of the two declared bounded judgments: a reply that mentions "dispute" in passing — about a different, already-settled invoice — is correctly read as a promise to pay, not a dispute, and a second, separate judgment extracts the committed date with citation, reusing Call-to-Proposal’s ExtractionProvider port rather than a new one, because a closed-set classification and an evidence-citing value extraction are genuinely different shapes of judgment. Reminders despatch only on the exact configured collection-cadence day, with every financial figure injected from the accounting record, never composed. A guardrail path shows a clear dispute halting the cadence immediately regardless of how far the invoice had aged, a stale delayed evaluation being safely absorbed rather than corrupting state once the invoice left the ageing ladder, and a person resolving the dispute back onto it. An invoice never regresses to an earlier ageing bucket from a stale or out-of-order evaluation, verified directly. Escalation at the configured day-45 threshold, partial payment, and a broken promise re-entering the ageing ladder are exercised directly rather than through a full scenario. As with the first four systems, nothing here is live: no reminder left this process, no model was called, and the business and its invoices are fictional.

### Business problem

Outstanding receivables are monitored and chased inconsistently, creating cash-flow leakage and relationship risk at the same time.

### Economic leakage

Cash already earned sits uncollected while the business finances the gap. Inconsistent chasing makes it worse in both directions: overdue balances age past the point where recovery odds fall sharply, while indiscriminate reminders reach clients who already paid or who have a legitimate dispute.

### Buyer / operator outcome

Invoice state stays accurate against the accounting system, the approved collection policy executes consistently, replies and payments and disputes are recognised, and anything exceeding automation authority reaches a person.

### Triggers

- A scheduled ageing evaluation runs
- A payment is recorded in the accounting system
- A customer reply is received
- A dispute is raised
- A promised payment date passes

### Authoritative sources of truth

- The accounting system is authoritative for invoice identity, amount, due date, balance, and payment status — without exception
- The customer system of record is authoritative for contact identity and relationship ownership
- The outreach log is authoritative for reminders already sent

### Important entities

- Invoice
- Customer
- Reminder
- Promise to pay
- Dispute
- Payment plan

### Lifecycle states

| State | Kind | Meaning |
| --- | --- | --- |
| `CURRENT` | INITIAL | Issued and not yet due. |
| `DUE_SOON` | ACTIVE | Inside the pre-due reminder window. |
| `PAST_DUE_1_30` | ACTIVE | Conventional first ageing bucket. Usually ordinary payment-run drift. |
| `PAST_DUE_31_60` | ACTIVE | Second ageing bucket. A pattern rather than drift. |
| `PAST_DUE_61_90` | ACTIVE | Third ageing bucket. Materially elevated recovery risk. |
| `PAST_DUE_90_PLUS` | ACTIVE | Oldest conventional bucket. Recovery odds decline sharply here. |
| `DISPUTED` | HUMAN REVIEW | The customer contests the invoice. Orthogonal to ageing: a disputed invoice keeps ageing but leaves the collection cadence entirely. |
| `PAYMENT_PROMISED` | WAITING | A specific date was committed. The cadence pauses until that date passes. |
| `PAYMENT_PLAN` | WAITING | A human-approved instalment arrangement is in force. |
| `PAID` | TERMINAL SUCCESS | The accounting system reports the balance settled. This state can only be entered from that system. |
| `ESCALATED` | HUMAN REVIEW | Beyond automation authority. Owned by a named person. |
| `WRITE_OFF_REVIEW` | HUMAN REVIEW | Proposed for write-off. Only a person may decide. |
| `WRITTEN_OFF` | TERMINAL FAILURE | Recorded as uncollectable by human decision. |

### Declared transitions

Only these moves are permitted. The engine rejects anything else and records the rejection.

| From | To | Mechanism | Guard | Authority |
| --- | --- | --- | --- | --- |
| `CURRENT` | `DUE_SOON` | DETERMINISTIC RULE | Due date is inside the configured pre-due window. | 3 |
| `CURRENT` | `PAID` | DETERMINISTIC RULE | The accounting system reports the balance settled. | 3 |
| `DUE_SOON` | `PAST_DUE_1_30` | DETERMINISTIC RULE | Days past due is between 1 and 30 inclusive. | 3 |
| `DUE_SOON` | `PAID` | DETERMINISTIC RULE | The accounting system reports the balance settled. | 3 |
| `DUE_SOON` | `DISPUTED` | DETERMINISTIC RULE | A customer communication contests the invoice. | 3 |
| `PAST_DUE_1_30` | `PAST_DUE_31_60` | DETERMINISTIC RULE | Days past due is between 31 and 60 inclusive. | 3 |
| `PAST_DUE_1_30` | `PAID` | DETERMINISTIC RULE | The accounting system reports the balance settled. | 3 |
| `PAST_DUE_1_30` | `DISPUTED` | DETERMINISTIC RULE | A customer communication contests the invoice. | 3 |
| `PAST_DUE_1_30` | `PAYMENT_PROMISED` | DETERMINISTIC RULE | A reply commits to a specific date at or above the confidence floor. | 3 |
| `PAST_DUE_31_60` | `PAST_DUE_61_90` | DETERMINISTIC RULE | Days past due is between 61 and 90 inclusive. | 3 |
| `PAST_DUE_31_60` | `PAID` | DETERMINISTIC RULE | The accounting system reports the balance settled. | 3 |
| `PAST_DUE_31_60` | `DISPUTED` | DETERMINISTIC RULE | A customer communication contests the invoice. | 3 |
| `PAST_DUE_31_60` | `PAYMENT_PROMISED` | DETERMINISTIC RULE | A reply commits to a specific date at or above the confidence floor. | 3 |
| `PAST_DUE_31_60` | `ESCALATED` | DETERMINISTIC RULE | Configured escalation threshold on age or value reached. | 2 |
| `PAST_DUE_61_90` | `PAST_DUE_90_PLUS` | DETERMINISTIC RULE | Days past due exceeds 90. | 3 |
| `PAST_DUE_61_90` | `PAID` | DETERMINISTIC RULE | The accounting system reports the balance settled. | 3 |
| `PAST_DUE_61_90` | `DISPUTED` | DETERMINISTIC RULE | A customer communication contests the invoice. | 3 |
| `PAST_DUE_61_90` | `ESCALATED` | DETERMINISTIC RULE | Configured escalation threshold reached. | 2 |
| `PAST_DUE_90_PLUS` | `PAID` | DETERMINISTIC RULE | The accounting system reports the balance settled. | 3 |
| `PAST_DUE_90_PLUS` | `ESCALATED` | DETERMINISTIC RULE | Configured escalation threshold reached. | 2 |
| `PAST_DUE_90_PLUS` | `WRITE_OFF_REVIEW` | DETERMINISTIC RULE | Age and recovery-likelihood criteria met. Proposal only; the decision is human. | 1 |
| `PAYMENT_PROMISED` | `PAID` | DETERMINISTIC RULE | The accounting system reports the balance settled. | 3 |
| `PAYMENT_PROMISED` | `PAST_DUE_31_60` | DETERMINISTIC RULE | Promised date passed without settlement; the invoice returns to its ageing bucket. | 3 |
| `PAYMENT_PROMISED` | `PAYMENT_PLAN` | HUMAN DECISION | A person approved an instalment arrangement. | 2 |
| `PAYMENT_PLAN` | `PAID` | DETERMINISTIC RULE | The accounting system reports the balance settled. | 3 |
| `PAYMENT_PLAN` | `ESCALATED` | DETERMINISTIC RULE | A scheduled instalment was missed. | 2 |
| `DISPUTED` | `PAID` | DETERMINISTIC RULE | The accounting system reports the balance settled. | 3 |
| `DISPUTED` | `PAST_DUE_31_60` | HUMAN DECISION | A person resolved the dispute in favour of the invoice as issued. | 2 |
| `DISPUTED` | `ESCALATED` | DETERMINISTIC RULE | Dispute open beyond the configured resolution window. | 2 |
| `ESCALATED` | `PAID` | DETERMINISTIC RULE | The accounting system reports the balance settled. | 3 |
| `ESCALATED` | `WRITE_OFF_REVIEW` | HUMAN DECISION | A person proposed write-off. | 2 |
| `WRITE_OFF_REVIEW` | `WRITTEN_OFF` | HUMAN DECISION | A person with the required authority approved the write-off. | 2 |
| `WRITE_OFF_REVIEW` | `PAID` | DETERMINISTIC RULE | The accounting system reports the balance settled. | 3 |

### Deterministic decisions

- Ageing bucket computation from due date against the evaluation date
- Reading payment status from the accounting system as authoritative truth
- Cadence scheduling and reminder eligibility
- Halting the cadence on payment, promise, plan, or dispute
- Escalation threshold evaluation on age and value
- Write-off criteria evaluation, as a proposal only
- Duplicate reminder suppression

### Bounded AI judgments

- Interpreting whether a free-text reply constitutes a dispute, a promise to pay, or neither
- Extracting a committed payment date from free text

### Human-only actions

- Approving a payment plan or altered terms
- Approving a write-off
- Resolving a dispute
- Engaging any third party for collection
- Any communication referencing legal consequences

### Possible actions

- Send a scheduled reminder
- Pause the cadence
- Record a promise to pay
- Route a dispute to a person
- Escalate to a named owner
- Propose a write-off for human decision

### The AI boundary

Regardless of confidence, the system may never:

- May not create, alter, or contradict financial truth held in the accounting system
- May not invent or apply late fees
- May not change payment terms
- May not reference legal consequences or threaten action
- May not initiate litigation or engage a collection agency
- May not misrepresent contractual rights
- May not continue the normal cadence after payment, dispute, promise, or plan

### Guardrails

- The accounting system is authoritative for financial truth and is read, never written, by this system
- Payment halts the collection cadence immediately
- Dispute halts the collection cadence immediately and enters the dispute path
- Reminder cadence and escalation thresholds are configuration, not code
- Write-off is proposed at authority level 1 and decided only by a person
- No message may reference legal consequences without human authorship and approval

### Success and terminal states

- `PAID` (terminal success) — The accounting system reports the balance settled. This state can only be entered from that system.
- `WRITTEN_OFF` (terminal failure) — Recorded as uncollectable by human decision.

### Measures

| Metric | Kind | Definition | System of record | Unit |
| --- | --- | --- | --- | --- |
| Total accounts receivable | LAGGING | Sum of outstanding balances across all unsettled invoices, read from the accounting system. | Accounting system | currency |
| Overdue accounts receivable | LAGGING | Sum of outstanding balances where days past due is greater than zero. | Accounting system | currency |
| Ageing distribution | LAGGING | Outstanding balance apportioned across current, 1–30, 31–60, 61–90, and 90+ day buckets, where days past due equals the evaluation date minus the due date. | Accounting system | currency by bucket |
| Days sales outstanding | LAGGING | Outstanding receivables divided by credit sales over the period, multiplied by the days in the period. Interpreted only against stated payment terms, since the terms set the achievable floor. | Accounting system | days |
| Recovered cash | LAGGING | Cash received against invoices that were past due at the time the first reminder executed. | Accounting system | currency |
| Days from due date to payment | LAGGING | Mean days between due date and settlement, for invoices settled in the period. | Accounting system | days |
| Promise-to-pay kept rate | LEADING | Promises settled on or before the committed date, divided by promises recorded. | Workflow store joined to accounting system | percent |
| Disputed amount | RELIABILITY | Sum of outstanding balances currently in the disputed state. | Workflow store joined to accounting system | currency |
| Dispute resolution time | RELIABILITY | Mean elapsed time from dispute raised to dispute resolved by a person. | Workflow store | days |
| Reminders executed | LEADING | Count of reminder side effects resolving as executed, excluding those suppressed as duplicates. | Side-effect ledger | reminders |
| Post-settlement contact rate | RELIABILITY | Reminders executed against invoices already settled at execution time, divided by reminders executed. Lab target is zero. | Side-effect ledger joined to accounting system | percent |

### Operating standards

**Evidence** — Receivables are conventionally aged into current, 1–30, 31–60, 61–90, and 90+ day buckets, where days past due is the evaluation date minus the due date. Bucket boundaries beyond 90 days vary between systems.

- *Applies to:* Justifies the ageing states and the ageing distribution metric. Two independent vendor sources are cited because neither is an accounting standard; agreement between them is what supports the claim that the convention is conventional.
- *Sources:* Stripe, *Accounts receivable aging explained*; Xero, *Accounts receivable aging report*
- *Correction:* Health thresholds commonly quoted alongside these buckets — such as a target share of balance in the current bucket — are rules of thumb in vendor guidance, not established benchmarks, and are deliberately not adopted here.

**Evidence** — The US Fair Debt Collection Practices Act governs debts incurred by a natural person primarily for personal, family, or household purposes, and applies principally to third parties collecting debts owed to another. It does not govern a business collecting its own commercial invoices from another business.

- *Applies to:* This standard exists to PREVENT a false claim rather than to justify a control. The guardrails against threatening legal consequences and misrepresenting contractual rights are retained, but they rest on operator policy and on the general prohibition of deceptive or unfair practices, NOT on FDCPA compliance. Two caveats are carried forward: a creditor collecting under a name implying a third party can fall within FDCPA scope, and some state laws reach original creditors.
- *Sources:* US Consumer Financial Protection Bureau, *Regulation F, 12 CFR 1006.2 Definitions; FDCPA examination procedures*; US Federal Trade Commission, *Think your company's not covered by the FDCPA? You may want to think again.*
- *Correction:* Automation vendors frequently present FDCPA-style constraints as universally applicable to invoice chasing. For business-to-business collection of one’s own invoices that is not correct, and the portfolio does not repeat it.

**Lab target** — The accounting system is the sole authority for invoice identity, amount, due date, balance, and payment status. This system reads that truth and never writes or contradicts it.

- *Applies to:* Every transition into PAID is guarded on the accounting system rather than on an inference from a reply, which is what prevents a customer saying "paid yesterday" from settling an invoice.

**Lab target** — Payment, dispute, an accepted promise to pay, and an approved payment plan each halt the normal collection cadence immediately.

- *Applies to:* The post-settlement contact rate metric, whose target is zero.

**Lab target** — No automated message may reference legal consequences, threaten action, or characterise contractual rights. Such communications are human-authored and human-approved.

- *Applies to:* Prohibited-language screening before any reminder is despatched, and the human-only action list.

### Known failure modes

See [FAILURE_MODE_REGISTER.md](FAILURE_MODE_REGISTER.md) for the full entries. This system declares 6: `STALE_DATA`, `POLICY_VIOLATION`, `AI_UNSUPPORTED_INFERENCE`, `UNEXPECTED_HUMAN_REPLY`, `DUPLICATE_EVENT`, `SOURCE_SYSTEM_OUTAGE`.

---

## 6. Owner Revenue Intelligence Agent

**Maturity: SIMULATED**

Two scenarios replay through the same engine core the first five systems proved, closing the horizontal portfolio. A complex path shows the point of the canon’s single bounded-judgment transition: cash collected falls sharply while revenue invoiced holds steady, which read alone would misdiagnose as a demand problem; the variance is only surfaced once an independent source — days sales outstanding, reported by a different system — corroborates that collection quality, not demand, is worsening. The bounded judgment then composes a plain-language explanation and one recommendation from a small closed set, both structurally marked as a recommendation rather than fact, and the owner records a decision against the evidence that produced it. A guardrail path shows an input older than the configured staleness tolerance blocking the conclusion outright, then a refreshed read landing well inside the configured materiality threshold and being correctly left alone rather than surfaced as a false alarm — reusing the business profile’s own declared referral-partner concentration figure as the metric under evaluation. Corroboration that disagrees in direction, and a candidate corroborating source that would require aggregating data across client accounts, each independently resolve to insufficient evidence rather than a surfaced exception, the latter citing the confidentiality policy the profile had already declared for exactly this system before this pass began. As with the first five systems, nothing here is live: no notification left this process, no model was called, and the business and its figures are fictional.

### Business problem

Owners receive fragmented metrics from sales, delivery, billing, and finance, then still have to work out manually what changed, what is abnormal, why it matters, and what needs action now.

### Economic leakage

The scarcest resource in a founder-led business is the owner’s attention, and it is spent reconciling dashboards rather than deciding. Meanwhile the exceptions that matter — a concentration risk, a margin slide, a renewal cliff — stay invisible because no single dashboard owns them.

### Buyer / operator outcome

Trusted cross-system state becomes a small number of evidence-linked business exceptions with recommended decisions, each showing where it came from, how fresh it is, and what it does not establish.

### Triggers

- A scheduled analysis window closes
- A metric crosses a configured variance threshold
- A source system reports a freshness failure
- An owner records a decision on a surfaced exception

### Authoritative sources of truth

- Each contributing system remains authoritative for its own domain; this system owns no primary facts
- The metric registry is authoritative for how each metric is defined
- The freshness record is authoritative for how current each input is

### Important entities

- Metric definition
- Observation
- Baseline
- Exception
- Evidence link
- Recommendation
- Decision

### Lifecycle states

| State | Kind | Meaning |
| --- | --- | --- |
| `SIGNALS_COLLECTED` | INITIAL | Inputs gathered from contributing systems; nothing has been judged yet. |
| `FRESHNESS_CHECKED` | ACTIVE | Every input carries an age and a completeness assessment. |
| `STALE_DATA_FLAGGED` | HUMAN REVIEW | One or more inputs are too old or too incomplete to support a conclusion. Visibly identified rather than quietly used. |
| `BASELINE_COMPARED` | ACTIVE | Observations compared against a declared baseline or comparison period. |
| `EXCEPTION_CANDIDATE` | ACTIVE | Variance exceeded the configured threshold. Not yet corroborated. |
| `CORROBORATING` | ACTIVE | Seeking independent supporting evidence from other systems before surfacing anything. |
| `INSUFFICIENT_EVIDENCE` | TERMINAL NEUTRAL | Variance was real but could not be corroborated. Recorded rather than surfaced as a finding. |
| `EXCEPTION_SURFACED` | ACTIVE | Corroborated and presented with its evidence, freshness, and stated limitations. |
| `ACTION_RECOMMENDED` | ACTIVE | A recommendation exists, visibly distinguished from the facts that prompted it. |
| `AWAITING_OWNER_DECISION` | HUMAN REVIEW | Held for the owner. This system recommends and never executes. |
| `DECISION_RECORDED` | TERMINAL SUCCESS | The owner decided, and the decision is recorded against the evidence that informed it. |
| `DISMISSED` | TERMINAL NEUTRAL | Judged not to require action, either by threshold or by the owner. |

### Declared transitions

Only these moves are permitted. The engine rejects anything else and records the rejection.

| From | To | Mechanism | Guard | Authority |
| --- | --- | --- | --- | --- |
| `SIGNALS_COLLECTED` | `FRESHNESS_CHECKED` | DETERMINISTIC RULE | Every input carries a source reference and a timestamp. | 3 |
| `FRESHNESS_CHECKED` | `STALE_DATA_FLAGGED` | DETERMINISTIC RULE | An input exceeds its configured staleness tolerance or fails completeness. | 1 |
| `FRESHNESS_CHECKED` | `BASELINE_COMPARED` | DETERMINISTIC RULE | All inputs are within tolerance and complete. | 3 |
| `STALE_DATA_FLAGGED` | `BASELINE_COMPARED` | DETERMINISTIC RULE | Inputs refreshed within tolerance. | 3 |
| `STALE_DATA_FLAGGED` | `INSUFFICIENT_EVIDENCE` | DETERMINISTIC RULE | Inputs could not be refreshed within the window. No conclusion is drawn from stale data. | 1 |
| `BASELINE_COMPARED` | `EXCEPTION_CANDIDATE` | DETERMINISTIC RULE | Observed variance exceeds the configured threshold for that metric. | 1 |
| `BASELINE_COMPARED` | `DISMISSED` | DETERMINISTIC RULE | Variance within threshold. Recorded as evaluated, not silently dropped. | 3 |
| `EXCEPTION_CANDIDATE` | `CORROBORATING` | DETERMINISTIC RULE | At least one independent corroborating source is identified for the metric. | 1 |
| `CORROBORATING` | `EXCEPTION_SURFACED` | DETERMINISTIC RULE | Independent evidence supports the variance and every figure resolves to a source record. | 1 |
| `CORROBORATING` | `INSUFFICIENT_EVIDENCE` | DETERMINISTIC RULE | No independent evidence supports the variance. | 1 |
| `EXCEPTION_SURFACED` | `ACTION_RECOMMENDED` | BOUNDED AI JUDGMENT | A recommendation is composed and marked as recommendation, never as observed fact. | 1 |
| `ACTION_RECOMMENDED` | `AWAITING_OWNER_DECISION` | DETERMINISTIC RULE | Exception, evidence, freshness, limitations, and required authority are all present. | 1 |
| `AWAITING_OWNER_DECISION` | `DECISION_RECORDED` | HUMAN DECISION | The owner recorded a decision. | 2 |
| `AWAITING_OWNER_DECISION` | `DISMISSED` | HUMAN DECISION | The owner judged no action required. | 2 |

### Deterministic decisions

- Metric computation from the declared definition in the registry
- Freshness and completeness evaluation against configured tolerance
- Baseline selection and variance computation
- Threshold comparison per metric
- Corroboration requirement: at least one independent source before surfacing
- Provenance completeness: every figure must resolve to a source record

### Bounded AI judgments

- Composing a plain-language explanation of what an exception means for the business
- Proposing candidate actions for the owner to consider

### Human-only actions

- Deciding any action arising from an exception
- Changing a metric definition
- Changing a variance threshold
- Accepting a causal explanation as established

### Possible actions

- Compute a metric from its declared definition
- Flag an input as stale
- Record a variance as within threshold
- Surface a corroborated exception with evidence
- Recommend an action for owner decision
- Record an owner decision against its evidence

### The AI boundary

Regardless of confidence, the system may never:

- May not assert a causal explanation for an observed variance
- May not present a recommendation as an observed fact
- May not compute a metric by any definition other than the registered one
- May not draw a conclusion from data flagged as stale or incomplete
- May not execute any business action; this system recommends only
- May not aggregate confidential customer data across accounts where policy forbids it

### Guardrails

- No metric is surfaced without a definition, a source, and a freshness timestamp
- Correlation is never presented as causation; contributing factors are labelled as candidates
- Stale or incomplete data blocks the conclusion and is shown, not silently used
- Recommendations are visually and structurally distinct from facts
- Every exception states what it does not establish
- Authority is capped at RECOMMEND for the entire system

### Success and terminal states

- `INSUFFICIENT_EVIDENCE` (terminal neutral) — Variance was real but could not be corroborated. Recorded rather than surfaced as a finding.
- `DECISION_RECORDED` (terminal success) — The owner decided, and the decision is recorded against the evidence that informed it.
- `DISMISSED` (terminal neutral) — Judged not to require action, either by threshold or by the owner.

### Measures

| Metric | Kind | Definition | System of record | Unit |
| --- | --- | --- | --- | --- |
| Metric provenance coverage | COVERAGE | Surfaced figures resolving to a named source record and a registered definition, divided by surfaced figures. Lab target is 100 percent. | Metric registry | percent |
| Input freshness | RELIABILITY | Age of each contributing input at the moment the analysis window closed, reported per source rather than averaged. | Freshness record | hours |
| Exceptions surfaced | LEADING | Count of corroborated exceptions presented to the owner in the window. Deliberately expected to be small; a rising count indicates thresholds are too loose. | Workflow store | exceptions |
| Corroboration rate | RELIABILITY | Exception candidates that found independent supporting evidence, divided by candidates raised. | Workflow store | percent |
| Decision rate | LAGGING | Surfaced exceptions receiving a recorded owner decision, divided by exceptions surfaced. A low value indicates the exceptions are not worth the owner’s attention. | Workflow store | percent |
| Unsupported causal claims | RELIABILITY | Count of surfaced statements asserting a cause without corroborating evidence. Lab target is zero. | Reviewer annotations | claims |
| Revenue concentration | LAGGING | Share of period revenue attributable to the largest customer, and to the largest referral source, reported separately because they fail in different ways. | Accounting system joined to customer system of record | percent |
| Stale-blocked analyses | RELIABILITY | Analyses halted because inputs exceeded staleness tolerance, divided by analyses attempted. A healthy non-zero value; zero suggests the tolerance is not being enforced. | Workflow store | percent |

### Operating standards

**Evidence** — Generative models produce fluent explanations that are not grounded in their inputs, and confabulation is a named primary risk requiring managed controls. Narrative explanation of a metric movement is exactly the shape of output most prone to it.

- *Applies to:* Justifies capping this entire system at authority level 1, requiring corroboration before anything surfaces, and structurally separating recommendations from facts.
- *Sources:* US National Institute of Standards and Technology, *AI Risk Management Framework: Generative AI Profile (NIST AI 600-1)*

**Evidence · unverified** — Data quality is conventionally decomposed into named dimensions including accuracy, completeness, consistency, and timeliness, and these are codified in international standards and industry bodies of knowledge.

- *Applies to:* Justifies treating freshness and completeness as first-class gates rather than caveats. Held as PENDING_VERIFICATION because the normative standard text is paywalled and was not read during this build; the design does not depend on any specific threshold from it.
- *Sources:* International Organization for Standardization, *ISO 8000 series - Data quality (ISO/TC 184/SC 4), with ISO/IEC 25012*; DAMA International, *DAMA-DMBOK: Data Management Body of Knowledge*
- *Caveat:* Asserted from a named source family; not yet located and read. Not established fact.

**Lab target** — No figure is surfaced without a registered definition, a named source record, and a freshness timestamp.

- *Applies to:* The corroboration transition guard and the provenance coverage metric.

**Lab target** — No causal explanation is asserted. Contributing factors are presented as candidates with their supporting evidence, and the absence of a determined cause is stated.

- *Applies to:* The unsupported causal claims metric, whose target is zero.

**Lab target** — This system observes and recommends. It holds no authority above level 1 for any action, regardless of confidence or corroboration.

- *Applies to:* Every transition in this lifecycle is capped at authority 1 except the human decision points.

### Known failure modes

See [FAILURE_MODE_REGISTER.md](FAILURE_MODE_REGISTER.md) for the full entries. This system declares 5: `STALE_DATA`, `AI_UNSUPPORTED_INFERENCE`, `CONTRADICTORY_DATA`, `POLICY_VIOLATION`, `POLICY_VIOLATION`.
