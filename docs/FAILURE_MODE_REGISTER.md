# Failure Mode Register

> **Generated from the typed model — do not edit by hand.**
> Run `npm run docs` after changing anything in `data/`. `tests/docs.test.ts` fails if this file is stale.

Known failure classes resolve into **named states**, never a generic error. Every entry
names its prevention, its detection signal, its recovery, the authority required, the state
it resolves into, and the test that would catch a regression.

Entries whose verification reads *"Pending"* have no executable scenario yet. That is
recorded rather than hidden: an unverified recovery path is a claim, not a capability.

## Classes covered

- `AI_LOW_CONFIDENCE`
- `AI_MALFORMED_OUTPUT`
- `AI_UNSUPPORTED_INFERENCE`
- `CONTRADICTORY_DATA`
- `CREDENTIAL_FAILURE`
- `DOWNSTREAM_API_FAILURE`
- `DUPLICATE_EVENT`
- `HUMAN_APPROVAL_TIMEOUT`
- `MALFORMED_PAYLOAD`
- `MISSING_REQUIRED_FIELD`
- `OUT_OF_ORDER_EVENT`
- `PARTIAL_SIDE_EFFECT`
- `POLICY_VIOLATION`
- `RATE_LIMITED`
- `REPLAY_AFTER_COMPLETION`
- `RETRY_DUPLICATE_SIDE_EFFECT`
- `SOURCE_SYSTEM_OUTAGE`
- `STALE_DATA`
- `STATE_TRANSITION_CONFLICT`
- `SUPPRESSION_STATE`
- `TIMEOUT`
- `UNEXPECTED_HUMAN_REPLY`
- `WRONG_ENTITY_MATCH`

Coverage: 23 distinct failure classes across 45 entries.

---

## Lead Rescue

### DUPLICATE EVENT — The same business event is delivered more than once.

| Field | Value |
| --- | --- |
| **Cause** | At-least-once delivery, channel retry after a slow acknowledgement, or an operator replaying a backlog. |
| **Business impact** | A prospect receives the same message twice, which reads as disorganised and can breach frequency expectations. |
| **Prevention** | Every external action claims an idempotency key derived from stable business identity before it executes. |
| **Detection signal** | The event ledger reports the source event identity as already observed; the side-effect ledger refuses the key. |
| **Recovery** | Record the attempt as SUPPRESSED_DUPLICATE, leave lifecycle state unchanged, and continue. |
| **Retry policy** | Not applicable. A duplicate is not retried; it is refused. |
| **Escalates when** | Duplicate rate on a channel exceeds the configured threshold, indicating a broken acknowledgement contract upstream. |
| **Authority required** | 3 · EXECUTE UNDER EXPLICIT POLICY |
| **Resolves into** | No state change. The original lifecycle position is preserved and the attempt is recorded as SUPPRESSED_DUPLICATE — moving would itself be the duplicate. |
| **Verification** | tests/lead-rescue.test.ts — replayed duplicate event produces no second executed side effect |

### RETRY DUPLICATE SIDE EFFECT — A retry after a partially completed step re-executes an external action that already succeeded.

| Field | Value |
| --- | --- |
| **Cause** | The action succeeded but the acknowledgement or state write failed, so the runtime retried the whole step. |
| **Business impact** | Duplicate outbound contact, and a state record that disagrees with what the prospect actually received. |
| **Prevention** | Claim the idempotency key before the action, not after, so the claim survives a failure of the write that follows. |
| **Detection signal** | Second claim on an existing key. |
| **Recovery** | Refuse the second execution and reconcile state from the ledger, which is authoritative for what was actually done. |
| **Retry policy** | Bounded attempts with backoff; the key makes retries safe. |
| **Escalates when** | Ledger and state record disagree after reconciliation. |
| **Authority required** | 3 · EXECUTE UNDER EXPLICIT POLICY |
| **Resolves into** | Original state preserved; the effect is recorded as SUPPRESSED_DUPLICATE. State is reconciled from the ledger, which is authoritative for what was actually done. |
| **Verification** | tests/lead-rescue.test.ts — ledger refuses a second claim on the same key |

### MALFORMED PAYLOAD — An inbound payload does not conform to the declared schema.

| Field | Value |
| --- | --- |
| **Cause** | An upstream form change, a truncated body, or an unexpected content type. |
| **Business impact** | A real enquiry is at risk of being dropped without anyone knowing it existed. |
| **Prevention** | Validate at the boundary and preserve the raw payload alongside the validation error. |
| **Detection signal** | Schema validation failure at the adapter. |
| **Recovery** | Enter FAILED_RECOVERABLE, retain the raw payload, and retry within the bounded budget. |
| **Retry policy** | Bounded attempts; exhaustion moves to human review when the payload retains usable signal, otherwise to terminal failure. |
| **Escalates when** | Repeated malformed payloads from the same channel, indicating an upstream contract change. |
| **Authority required** | 2 · PREPARE / HUMAN APPROVES |
| **Resolves into** | New → Failed — recoverable → Normalised · Failed — recoverable → Needs human · Failed — recoverable → Failed — terminal. The raw payload is retained throughout. A retry inside the bounded budget returns the case to NORMALIZED; exhausting it reaches a person or a recorded terminal failure, never silence. |
| **Verification** | Verified — tests/lead-rescue-malformed-retry.test.ts: a payload missing every required field enters FAILED_RECOVERABLE with the raw payload retained and zero side effects; a corrected redelivery returns it to NORMALIZED via lr-t30; repeated failures below the configured budget deliberately do not move the case; and exhausting the budget routes to NEEDS_HUMAN via lr-t32 with the validation errors and attempt count attached. The budget is read from profile.operatingParameters.malformedRetryBudget — raising it in a cloned profile is proven to delay the escalation, so the number cannot be hard-coded in the handler. |

### MISSING REQUIRED FIELD — The enquiry is legitimate but omits facts required to route or scope it.

| Field | Value |
| --- | --- |
| **Cause** | Free-text channels have no required fields, so most enquiries arrive incomplete. |
| **Business impact** | Either the case stalls, or someone guesses and the guess propagates downstream as if it were established. |
| **Prevention** | Compute the minimum missing set deterministically and ask only for that. |
| **Detection signal** | Required-field comparison against the classified enquiry type. |
| **Recovery** | Enter NEEDS_INFORMATION, ask one question, and wait. |
| **Retry policy** | Bounded question budget before routing to a person. |
| **Escalates when** | Question budget exhausted without resolution. |
| **Authority required** | 3 · EXECUTE UNDER EXPLICIT POLICY |
| **Resolves into** | Classified → Needs information → Waiting for reply → Needs human. Exactly one question is asked, then the case waits against a real deadline. The last movement is the wait elapsing. |
| **Verification** | tests/lead-rescue.test.ts — after-hours scenario carries missing information forward |

### AI LOW CONFIDENCE — A bounded judgment returns a classification below the configured confidence floor.

| Field | Value |
| --- | --- |
| **Cause** | Genuinely ambiguous input, or input outside the distribution the contract anticipated. |
| **Business impact** | Acting on a low-confidence classification risks the wrong message to the wrong party. |
| **Prevention** | A configured floor compared deterministically, outside the judgment itself. |
| **Detection signal** | Confidence comparison in the engine, not in the model output. |
| **Recovery** | Route to human review with the classification, its confidence, and the evidence attached. |
| **Escalates when** | Human review not accepted within the configured window. |
| **Authority required** | 2 · PREPARE / HUMAN APPROVES |
| **Resolves into** | Normalised → Needs human · Replied → Needs human. The classification, its confidence, and the evidence travel with it. The floor is compared in the engine, so the model cannot decide it has cleared it. |
| **Verification** | tests/lead-rescue.test.ts — low-confidence judgment escalates and takes no external action |

### AI MALFORMED OUTPUT — A bounded judgment returns a classification outside its permitted set, or output that fails its schema.

| Field | Value |
| --- | --- |
| **Cause** | Model drift, prompt regression, or a provider change. |
| **Business impact** | Downstream deterministic logic receives a value it has no branch for and may behave unpredictably. |
| **Prevention** | The permitted set travels with the request, and the port validates the response against it before returning. |
| **Detection signal** | Contract validation in the DecisionProvider port. |
| **Recovery** | Treat as unavailable and route to human review. Never coerce the value into a nearby permitted one. |
| **Retry policy** | At most one re-request; repeated violations disable the judgment path. |
| **Escalates when** | Contract violations exceed the configured rate. |
| **Authority required** | 2 · PREPARE / HUMAN APPROVES |
| **Resolves into** | Normalised → Needs human. Treated as unavailable. The value is never coerced into a nearby permitted one. |
| **Verification** | tests/decision-provider.test.ts — out-of-set classification is refused |

### AI UNSUPPORTED INFERENCE — A judgment asserts a fact the input did not establish.

| Field | Value |
| --- | --- |
| **Cause** | Fluent completion of a plausible pattern; named in the NIST generative AI profile as confabulation. |
| **Business impact** | An invented fact enters the record and is treated as established by every downstream step and person. |
| **Prevention** | The output contract requires unresolved facts to be listed as missing information and declined inferences to be listed explicitly. |
| **Detection signal** | Required-field coverage is computed from the declared missing set, not from the narrative text. |
| **Recovery** | Carry the fact as missing and ask for it. |
| **Escalates when** | A declined inference reappears as an asserted fact downstream. |
| **Authority required** | 2 · PREPARE / HUMAN APPROVES |
| **Resolves into** | Classified → Needs information. The fact is carried as missing and asked for. Coverage is computed from the declared missing set, never inferred from the narrative text. |
| **Verification** | tests/lead-rescue.test.ts — declined inferences never enter engine facts |

### SUPPRESSION STATE — A contact under suppression, opt-out, or restricted-review state receives commercial outreach without a person deciding it should.

| Field | Value |
| --- | --- |
| **Cause** | Suppression checked after commercial routing, held in a system that was not consulted, or classification/confidence mistaken for authority to act. |
| **Business impact** | Legal exposure and permanent relationship damage; the single highest-severity failure in this system. |
| **Prevention** | Suppression is screened before commercial intent is evaluated, as a transition guard rather than a step in a message template. A hard opt-out moves straight to DO_NOT_CONTACT; a restricted-but-not-confirmed state still lets classification run, then blocks the candidate action at the policy gate and routes to a person — the classification result and its confidence cannot override that gate. |
| **Detection signal** | Consent state on the resolved entity in the customer system of record. |
| **Recovery** | Hard opt-out: move to DO_NOT_CONTACT immediately and permanently, blocking every pending effect. Restricted-pending-review: hold the candidate action as BLOCKED_BY_POLICY and enter SUPPRESSION_REVIEW for a named person to decide. |
| **Escalates when** | Any executed outbound effect to a suppressed or unreviewed-restricted entity. Treated as an incident, not a metric. |
| **Authority required** | 4 · EXECUTE AND MANAGE BOUNDED DOWNSTREAM CONSEQUENCES |
| **Resolves into** | Normalised → Do not contact · Classified → Suppression review → Booking ready · Suppression review → Closed — not a fit · Suppression review → Do not contact · Suppression review → Escalated. Two distinct paths. A hard opt-out moves to DO_NOT_CONTACT immediately and permanently. A restricted-pending-review contact holds its candidate action as BLOCKED_BY_POLICY and waits in SUPPRESSION_REVIEW for a named person, who may resolve it any of four ways. |
| **Verification** | tests/lead-rescue.test.ts — restricted-contact scenario: candidate action blocked by policy, zero prohibited sends, human authority verified before clearance. |

### DOWNSTREAM API FAILURE — The channel or system of record rejects an action, or returns no confirmation at all.

| Field | Value |
| --- | --- |
| **Cause** | Provider outage, rate limiting, credential expiry, or a dropped connection after the request already left this system. |
| **Business impact** | The prospect receives nothing while internal state may claim they were contacted — or, worse, they DID receive it and a naive retry contacts them again. |
| **Prevention** | Every execution-tracked send is claimed against the execution ledger first. A definite pre-effect failure or rate limit is retried immediately, since nothing happened. A response with no confirmation is recorded as OUTCOME_UNKNOWN and blocks further attempts on that key until independent verification resolves it, unless the provider itself guarantees idempotent processing. |
| **Detection signal** | Non-success response, an explicit rate-limit response, or the absence of any confirmation within the attempt. |
| **Recovery** | FAILED_BEFORE_EFFECT or RATE_LIMITED: retry is safe and permitted immediately. OUTCOME_UNKNOWN: blocked until a verification attempt confirms non-execution, at which point exactly one retry is permitted. |
| **Retry policy** | Retry-safe outcomes retry immediately; unknown outcomes retry only after verification. See lr-lab-retry-safety. |
| **Escalates when** | Verification itself returns STILL_UNKNOWN, leaving the key permanently blocked pending manual investigation. |
| **Authority required** | 3 · EXECUTE UNDER EXPLICIT POLICY |
| **Resolves into** | The business lifecycle state is unaffected — this failure lives entirely at the side-effect level and is inspectable on the affected SideEffect record. FAILED_BEFORE_EFFECT and RATE_LIMITED permit an immediate retry; OUTCOME_UNKNOWN is blocked until a verification attempt confirms non-execution, and only then is exactly one retry permitted. |
| **Verification** | tests/lead-rescue.test.ts — uncertain-outcome scenario: exactly one customer-facing send across attempt, blocked naive retry, and verified retry. |

### HUMAN APPROVAL TIMEOUT — A case held for human approval is never actioned.

| Field | Value |
| --- | --- |
| **Cause** | Notification missed, owner unavailable, or no named owner assigned. |
| **Business impact** | The lead decays silently while the system reports it as correctly parked. |
| **Prevention** | Every routed case has a named owner and a configured review window at the moment it is routed. |
| **Detection signal** | Age of cases in human review against the configured window. |
| **Recovery** | Escalate to the next owner in the authority chain. |
| **Escalates when** | Review window elapsed without acceptance. |
| **Authority required** | 2 · PREPARE / HUMAN APPROVES |
| **Resolves into** | CORRECTED 2026-08-27: this declared `MOVES` (NEEDS_HUMAN -> ESCALATED) while its own verification test, and the handler doctrine in lib/engine/handlers/lead-rescue.ts, both state that the timeout never transitions lifecycle state — and the note under that MOVES already said "it never decides the case", which is HOLDS_POSITION semantics written under the wrong shape. The transition NEEDS_HUMAN -> ESCALATED is real and buildable (lr-t23), so validateLifecycle passed and nothing caught the contradiction; it is performed by a PERSON escalating, never by the timeout. Escalation names the next owner in the authority chain, resolved from the configured roles. A timeout escalates the fact that nobody has acted; it never decides the case. |
| **Verification** | tests/lead-rescue-attention-timeout.test.ts, tests/lead-rescue-attention-timeout-resume.test.ts — review and dispatch attention timeouts durably escalate without transitioning lifecycle state |

### UNEXPECTED HUMAN REPLY — A reply does not answer the question asked and instead raises a commitment, complaint, or unrelated request.

| Field | Value |
| --- | --- |
| **Cause** | Real conversations do not follow the state machine. |
| **Business impact** | A templated follow-up to a complaint or a pricing demand actively damages the relationship. |
| **Prevention** | Reply interpretation may route to a person; it may not compose a commitment. |
| **Detection signal** | Interpretation returns an off-script class or falls below the confidence floor. |
| **Recovery** | Route to a person with the full conversation attached. |
| **Escalates when** | Reply contains a commitment request, a complaint, or a legal reference. |
| **Authority required** | 2 · PREPARE / HUMAN APPROVES |
| **Resolves into** | Replied → Needs human. The full conversation is attached. An off-script or below-floor reply reaches a person rather than producing a templated answer. |
| **Verification** | tests/lead-rescue.test.ts — ambiguous high-risk scenario routes to review |

### STATE TRANSITION CONFLICT — Logic requests a lifecycle move that no declared transition permits.

| Field | Value |
| --- | --- |
| **Cause** | A handler bug, a race between two events, or an out-of-order delivery. |
| **Business impact** | Silent corruption of lifecycle state makes every downstream metric wrong. |
| **Prevention** | The engine core resolves every requested move against the declared transition set before applying it. |
| **Detection signal** | No matching rule for the from/to pair. |
| **Recovery** | Reject the move, preserve the current state, and record the rejection on the timeline. |
| **Escalates when** | Any rejected transition, since each one indicates a real defect. |
| **Authority required** | 1 · RECOMMEND |
| **Resolves into** | The move is rejected, the current state preserved, and the rejection recorded on the timeline. An undeclared transition is refused by the engine core, so no handler can opt out of this. |
| **Verification** | tests/engine.test.ts — undeclared transition is rejected and state does not move |

### REPLAY AFTER COMPLETION — An event arrives for an entity that already reached a terminal state.

| Field | Value |
| --- | --- |
| **Cause** | Backlog replay, a delayed webhook, or a manual reprocess. |
| **Business impact** | A closed case reopens and re-contacts someone who was correctly finished with. |
| **Prevention** | Terminal states declare no outgoing transitions, so no move can be authorised out of them. |
| **Detection signal** | A requested transition from a terminal state finds no matching rule. |
| **Recovery** | Record the event against the entity and take no action. |
| **Escalates when** | Repeated post-terminal replay on a channel. |
| **Authority required** | 1 · RECOMMEND |
| **Resolves into** | The terminal state is preserved. The event is recorded against the entity and no action is taken — nothing can leave a terminal state. |
| **Verification** | tests/engine.test.ts — no transition may leave a terminal state |

### OUT OF ORDER EVENT — A reply is delivered and processed before the outbound message that prompted it has been recorded.

| Field | Value |
| --- | --- |
| **Cause** | Inbound and outbound travel independent paths with no ordering guarantee; the inbound channel can be faster than the side-effect write. |
| **Business impact** | The reply correlates to nothing, so a genuinely engaged prospect is treated as an unsolicited message and risks being misclassified or dropped. |
| **Prevention** | Correlate on the conversation identifier carried by the event rather than on the presence of a prior recorded send, and claim the side-effect key before acting so the ledger stays authoritative for what was sent. |
| **Detection signal** | A reply whose correlation identifier resolves to an entity with no recorded outbound effect. |
| **Recovery** | Process the reply against the entity’s current state and reconcile the outbound record from the ledger, rather than rejecting the reply for arriving early. |
| **Escalates when** | The correlation identifier cannot be resolved to any known entity. |
| **Authority required** | 2 · PREPARE / HUMAN APPROVES |
| **Resolves into** | Waiting for reply → Replied → Needs human. The reply is processed against the entity’s current state and the outbound record reconciled from the ledger, rather than being rejected for arriving early. It reaches a person only if it cannot be interpreted. |
| **Verification** | Pending — out-of-order scenario not yet authored. |

---

## Dormant Pipeline Recovery

### SUPPRESSION STATE — A suppressed or opted-out contact receives reactivation outreach.

| Field | Value |
| --- | --- |
| **Cause** | Consent evaluated at segment build time and gone stale by despatch, or held in a system not consulted. |
| **Business impact** | Legal exposure and permanent loss of the contact. The most severe failure in this system. |
| **Prevention** | Consent is re-checked immediately before each despatch as a transition guard. |
| **Detection signal** | Suppression register lookup at despatch time. |
| **Recovery** | Halt the sequence, move to SUPPRESSED, and block every pending effect for the entity. |
| **Escalates when** | Any executed attempt to a suppressed contact. |
| **Authority required** | 4 · EXECUTE AND MANAGE BOUNDED DOWNSTREAM CONSEQUENCES |
| **Resolves into** | Eligibility review → Suppressed · Scheduled → Suppressed (declared in canon, but no declared transition performs it — an open defect, not handling). Only the eligibility-review screen is exercised by a scenario; it is the movement the built path takes. |
| **Verification** | Verified — tests/dormant-pipeline-recovery.test.ts, 'suppressed recovery': consent is evaluated before the re-entry reason, a textbook-qualifying recycle trigger is recorded and then overridden, and zero side effects are produced. |

### RETRY DUPLICATE SIDE EFFECT — The same contact receives the same attempt twice, or is worked by two sequences at once.

| Field | Value |
| --- | --- |
| **Cause** | Job retry, overlapping segment definitions, or a record matching two campaigns. |
| **Business impact** | Reads as spam, raises opt-out rate, and burns a recoverable record. |
| **Prevention** | Attempts are keyed per entity and sequence step; concurrent sequence membership is rejected at eligibility. |
| **Detection signal** | Idempotency key already claimed, or entity present in another running sequence. |
| **Recovery** | Suppress the duplicate attempt and record it. |
| **Retry policy** | Bounded retry; the key makes retries safe. |
| **Escalates when** | Duplicate outreach rate above zero. |
| **Authority required** | 3 · EXECUTE UNDER EXPLICIT POLICY |
| **Resolves into** | No state change; the attempt is recorded as SUPPRESSED_DUPLICATE. Holding position is the recovery — moving would itself be the duplicate. |
| **Verification** | Verified — tests/dormant-pipeline-recovery.test.ts, 'redelivering the same triggering event produces zero additional customer-facing outreach': the same business event delivered twice claims the same idempotency key once and is refused the second time. |

### STALE DATA — Outreach references an account fact that is no longer true.

| Field | Value |
| --- | --- |
| **Cause** | Segment built from a snapshot; the underlying record changed before despatch. |
| **Business impact** | The message is visibly wrong, which damages credibility more than silence would. |
| **Prevention** | Re-read the referenced facts at despatch time and abort if they no longer hold. |
| **Detection signal** | Freshness comparison between snapshot and system of record. |
| **Recovery** | Abort the attempt, return to eligibility review. |
| **Escalates when** | Repeated staleness on a segment, indicating too long a build-to-send gap. |
| **Authority required** | 2 · PREPARE / HUMAN APPROVES |
| **Resolves into** | Scheduled → Eligibility review (declared in canon, but no declared transition performs it — an open defect, not handling). |
| **Verification** | Pending — scenario not yet authored. |

### WRONG ENTITY MATCH — A dormant record is matched to the wrong person or account.

| Field | Value |
| --- | --- |
| **Cause** | Shared inbox addresses, role accounts, or a merged duplicate resolving incorrectly. |
| **Business impact** | Confidential commercial history is disclosed to the wrong party. |
| **Prevention** | Match on a stable identifier; ambiguous matches route to review rather than resolving to the closest candidate. |
| **Detection signal** | Multiple candidate entities above the match threshold. |
| **Recovery** | Route to human review with all candidates attached. |
| **Escalates when** | Any ambiguous match involving commercially sensitive history. |
| **Authority required** | 2 · PREPARE / HUMAN APPROVES |
| **Resolves into** | Eligibility review → Needs human. Identity resolves before any policy question, so the ambiguity is caught at eligibility review with every candidate attached. |
| **Verification** | Verified — tests/dormant-pipeline-recovery.test.ts, the ambiguous-entity-match scenario: two candidates both clear the configured match threshold, the cycle routes to NEEDS_HUMAN with every candidate attached, and zero side effects occur. Resolving to the closest or highest-confidence candidate is named as a forbidden action rather than merely left unselected, and the guard is proven not to fire on the two scenarios that supply no competing candidates. Identity is asserted to resolve BEFORE the consent screen, because consent, account status, and the re-entry reason are all questions about a specific party. |

### POLICY VIOLATION — An existing customer is entered into prospecting outreach.

| Field | Value |
| --- | --- |
| **Cause** | Segment defined on pipeline stage without excluding active accounts. |
| **Business impact** | A paying client receives a cold pitch for something they already buy. |
| **Prevention** | Active customer status is an eligibility exclusion evaluated before the re-entry reason. |
| **Detection signal** | Active engagement or retainer present on the resolved entity. |
| **Recovery** | Archive the record from the sequence and route to the account owner. |
| **Escalates when** | Any executed attempt to an active customer. |
| **Authority required** | 3 · EXECUTE UNDER EXPLICIT POLICY |
| **Resolves into** | Eligibility review → Archived. Active-customer status is an eligibility exclusion, evaluated before the re-entry reason. |
| **Verification** | Verified — tests/dormant-pipeline-recovery.test.ts, 'excludes an account that is already active elsewhere': the active-account exclusion runs before the re-entry reason is evaluated and produces zero side effects. |

### RATE LIMITED — The outreach provider refuses further sends partway through a cycle.

| Field | Value |
| --- | --- |
| **Cause** | A cycle evaluates a large segment and despatches faster than the provider’s published limit allows. |
| **Business impact** | Part of a campaign silently fails to send while the run records the whole batch as processed, so the shortfall is invisible. |
| **Prevention** | Despatch is paced against the declared provider limit, and every attempt is keyed so a resumed batch cannot resend what already went. |
| **Detection signal** | A rate-limit response from the provider, or a send-rate breach detected before the call is made. |
| **Recovery** | Pause the batch, honour the provider’s retry-after interval, and resume from the ledger rather than from the top of the segment. |
| **Retry policy** | Honour the provider’s retry-after; bounded attempts with increasing delay. |
| **Escalates when** | The limit is reached on consecutive cycles, indicating the segment is too large for the window. |
| **Authority required** | 2 · PREPARE / HUMAN APPROVES |
| **Resolves into** | Reactivation attempted → Scheduled (declared in canon, but no declared transition performs it — an open defect, not handling). Unsent records should return to the queue rather than being marked attempted. |
| **Verification** | Pending — scenario not yet authored. |

---

## Call-to-Proposal Revenue Agent

### AI UNSUPPORTED INFERENCE — The record asserts a commercial fact the conversation never established.

| Field | Value |
| --- | --- |
| **Cause** | Fluent completion of a familiar commercial pattern — an inferred budget, an assumed decision-maker, a plausible timeline. |
| **Business impact** | The invented fact is priced, proposed, and then contradicted by the buyer, damaging credibility at the moment of commitment. |
| **Prevention** | Every populated field must cite a passage; unresolved fields must be declared unknown by the output contract. |
| **Detection signal** | Claims review resolves each asserted claim against its citation. |
| **Recovery** | Return the claim to unknown and route the gap for clarification. |
| **Escalates when** | Any unsupported claim reaching a reviewer. |
| **Authority required** | 2 · PREPARE / HUMAN APPROVES |
| **Resolves into** | Claims review → Needs human. The claim is returned to unknown; the gap goes to a person rather than into the draft. |
| **Verification** | tests/call-to-proposal.test.ts — the unsupported-scope-claim-blocked scenario and the claim-admission-gate unit tests |

### AI MALFORMED OUTPUT — Extraction returns output that does not satisfy the record contract.

| Field | Value |
| --- | --- |
| **Cause** | Model drift, prompt regression, or an unusually structured transcript. |
| **Business impact** | Downstream deterministic checks receive fields they cannot validate. |
| **Prevention** | Schema validation at the port before the result is returned to the engine. |
| **Detection signal** | Contract validation failure in the DecisionProvider port. |
| **Recovery** | Route to human review with the raw transcript. Never coerce partial output into the schema. |
| **Retry policy** | At most one re-request before routing to review. |
| **Escalates when** | Repeated contract violations on the same transcript format. |
| **Authority required** | 2 · PREPARE / HUMAN APPROVES |
| **Resolves into** | Extracting → Needs human. The raw transcript travels with it. Partial output is never coerced into the schema. |
| **Verification** | tests/extraction-provider.test.ts — schema-invalid and mis-cited output is refused; tests/call-to-proposal.test.ts — an unavailable extraction routes to NEEDS_HUMAN |

### MISSING REQUIRED FIELD — A material commercial field is absent and no one notices before the proposal is written.

| Field | Value |
| --- | --- |
| **Cause** | The conversation genuinely did not cover it, and its absence is easy to overlook in prose. |
| **Business impact** | Scope is priced against an assumption, producing a change order or a margin loss later. |
| **Prevention** | Required-field coverage is computed structurally, and unknown counts as uncovered. |
| **Detection signal** | Coverage check against the declared record schema. |
| **Recovery** | Route the material gap for clarification and hold the draft. |
| **Escalates when** | Clarification window elapses without an answer. |
| **Authority required** | 2 · PREPARE / HUMAN APPROVES |
| **Resolves into** | Gaps identified → Awaiting clarification → Needs human. The second movement is the timeout path, and remains undriven by any event. |
| **Verification** | tests/call-to-proposal.test.ts — a call missing exactly one material field routes to AWAITING_CLARIFICATION and resolves once a person supplies it. The timeout-to-NEEDS_HUMAN edge itself remains unexercised — no event drives it yet. |

### POLICY VIOLATION — Draft text promises an outcome the firm does not control, or terms outside the approved rate card.

| Field | Value |
| --- | --- |
| **Cause** | Generated language optimising for persuasiveness against a buyer who asked for certainty. |
| **Business impact** | A commitment the firm cannot honour, made in writing, before any person reviewed it. |
| **Prevention** | Commercial terms validated against the rate card deterministically; prohibited commitment language screened before assembly. |
| **Detection signal** | Rate card comparison and prohibited-language screen. |
| **Recovery** | Block assembly and route to review with the offending passage identified. |
| **Escalates when** | Any prohibited commitment reaching a draft. |
| **Authority required** | 2 · PREPARE / HUMAN APPROVES |
| **Resolves into** | Claims review → Needs human. Assembly is blocked and the offending passage is identified for the reviewer. |
| **Verification** | tests/call-to-proposal.test.ts — the claim-admission gate blocks any claim value containing a prohibited-commitment phrase, regardless of source or citation |

### HUMAN APPROVAL TIMEOUT — A package routed to a person for review is never picked up.

| Field | Value |
| --- | --- |
| **Cause** | The package failed a gate — an unavailable extraction, or a claim that could not be admitted — and is waiting for whoever gets to it. Unlike an approval, nobody in particular was asked. |
| **Business impact** | The conversation that produced it goes cold while the system reports the package as correctly parked. This is the failure the system was bought to remove, arriving one step earlier than the approval timeout. |
| **Prevention** | A review clock starts at every genuine entry into review and is never restarted by re-reading the case. |
| **Detection signal** | Age of packages in NEEDS_HUMAN against the configured review window. |
| **Recovery** | Escalate to the final escalation point as an attention condition. There is no assignee to escalate past, so this differs deliberately from cp-fm-approval-timeout. |
| **Escalates when** | Review window elapsed without a decision. |
| **Authority required** | 2 · PREPARE / HUMAN APPROVES |
| **Resolves into** | The package stays in NEEDS_HUMAN. Escalation raises the fact that nobody has looked at it; it never resolves the claim, supplies the missing fact, or decides the package. Distinct from cp-fm-approval-timeout, which escalates PAST a named approver — here nobody was named, so escalation goes to the top of the chain rather than one rung above somebody. |
| **Verification** | tests/call-to-proposal-review-timeout.test.ts — the review clock starts at both genuine entries into NEEDS_HUMAN, a check inside the window takes no action, a check past it escalates to the final escalation point and says plainly that no reviewer was ever assigned, the package never transitions, and repeated checks escalate once. |

### HUMAN APPROVAL TIMEOUT — A draft waits for approval past the promised delivery window.

| Field | Value |
| --- | --- |
| **Cause** | Reviewer unavailable, or no named approver assigned at routing time. |
| **Business impact** | A promised follow-up arrives late, which is the exact failure the system was bought to remove. |
| **Prevention** | Named approver and review window assigned at the moment of routing. |
| **Detection signal** | Age of drafts in AWAITING_APPROVAL against the promised window. |
| **Recovery** | Escalate to the next approver in the authority chain. |
| **Escalates when** | Promised delivery window elapsed. |
| **Authority required** | 2 · PREPARE / HUMAN APPROVES |
| **Resolves into** | The draft stays in AWAITING_APPROVAL. Escalation changes who is asked, not where the case is — a timeout must never decide a proposal on its own. Escalation is strictly upward, resolved above the assigned approver’s own authority ceiling, so a draft can never be escalated to the person who is already not responding. |
| **Verification** | tests/call-to-proposal-approval-timeout.test.ts — routing records the approver, the window, and the declared next approver; a check inside the window takes no action; past it, escalation goes strictly past the assignee, an approver at the top of the ladder records an exhausted chain and notifies nobody, and a business that has named no approver reports an unowned draft rather than a late reviewer. No branch sets a lifecycle transition. Replayable as the approval-window-elapses scenario. |

---

## Client Onboarding Operator

### HUMAN APPROVAL TIMEOUT — An engagement routed to a person is never picked up, and onboarding stalls silently.

| Field | Value |
| --- | --- |
| **Cause** | The system refused to resolve something on a person’s behalf — a same-rank contradiction it will not settle by recency, or a resource whose state it will not overwrite — and nobody in particular was asked to deal with it. |
| **Business impact** | A signed client waits while the system reports the engagement as correctly parked. The delay lands at exactly the moment a new client is forming their opinion of how the firm operates. |
| **Prevention** | A review clock starts at every genuine entry into review, stamped at the handler boundary so a future entry point cannot arrive without one. |
| **Detection signal** | Age of engagements in NEEDS_HUMAN against the configured review window. |
| **Recovery** | Escalate to the final escalation point as an attention condition. There is no assignee to escalate past. |
| **Escalates when** | Review window elapsed without a decision. |
| **Authority required** | 2 · PREPARE / HUMAN APPROVES |
| **Resolves into** | The engagement stays in NEEDS_HUMAN. Escalation raises the fact that nobody has looked at it; it never resolves the contradiction, overwrites the resource, or abandons the engagement. A contradiction this system deliberately refuses to settle does not become settleable because it has been waiting. |
| **Verification** | tests/client-onboarding-review-timeout.test.ts — a genuine same-rank contradiction enters review with a clock stamped at the handler boundary, a check inside the window takes no action, a check past it escalates to the final escalation point, the engagement never transitions, and repeated checks escalate once. |

### CREDENTIAL FAILURE — Credential material is captured into workflow state, a ticket, an email thread, or a log.

| Field | Value |
| --- | --- |
| **Cause** | A customer pastes a secret into a reply, and the reply is persisted like any other message. |
| **Business impact** | A customer secret is now stored somewhere it was never meant to be, in a system with different access controls and retention. Severe and often undetected. |
| **Prevention** | Requirements flagged sensitive are routed to the secret-sharing channel and excluded from ordinary persistence; inbound content is screened for secret patterns before it is stored. |
| **Detection signal** | Secret-pattern screening on inbound content and on state writes. |
| **Recovery** | Purge the captured value, record the incident, and request rotation of the exposed credential. |
| **Escalates when** | Any detected secret in persisted state. Treated as an incident, not a metric. |
| **Authority required** | 4 · EXECUTE AND MANAGE BOUNDED DOWNSTREAM CONSEQUENCES |
| **Resolves into** | Gaps computed → Needs human. An incident record travels with it. A secret-shaped value arriving instead on an access-grant reference is withheld in place rather than moved: the requirement is never marked CONFIRMED and its task never marked COMPLETE on the strength of it. |
| **Verification** | tests/client-onboarding.test.ts — the secret-screen test submits the reserved TEST_ONLY_SECRET_SENTINEL_DO_NOT_USE sentinel through an ordinary intake field, and a second test submits it as an access-grant channel reference; both assert it appears nowhere in final state or in any rendered decision/summary text, and that the corresponding requirement is never marked confirmed or complete on the strength of the withheld value. |

### RETRY DUPLICATE SIDE EFFECT — Re-running onboarding creates a second project, folder, or task list.

| Field | Value |
| --- | --- |
| **Cause** | A retry after a partial failure, or a person re-triggering the flow manually. |
| **Business impact** | Work splits across duplicate containers and some of it is silently abandoned. |
| **Prevention** | Creation is keyed on engagement plus resource identity and claimed before the call. |
| **Detection signal** | Idempotency key already claimed. |
| **Recovery** | Refuse the second creation and reconcile against the existing resource. |
| **Retry policy** | Bounded retry; the key makes retries safe. |
| **Escalates when** | Duplicate resource rate above zero. |
| **Authority required** | 3 · EXECUTE UNDER EXPLICIT POLICY |
| **Resolves into** | No state change; the creation is recorded as SUPPRESSED_DUPLICATE and reconciled against the resource that already exists. |
| **Verification** | tests/client-onboarding.test.ts — the duplicate-provisioning-reconciled scenario redelivers the access-confirmation event; both resources resolve ALREADY_EXISTS_MATCHING the second time and exactly two EXECUTED creations exist across the whole run. |

### CONTRADICTORY DATA — The agreement and the customer record disagree about scope, contacts, or commercial terms.

| Field | Value |
| --- | --- |
| **Cause** | The record was updated after signature, or the sale captured something the agreement did not. |
| **Business impact** | Delivery proceeds against the wrong scope, surfacing as a billing dispute later. |
| **Prevention** | The agreement is authoritative for scope; disagreement is detected rather than silently resolved in favour of whichever was read last. |
| **Detection signal** | Field-level comparison between agreement and record. |
| **Recovery** | Route to a person with both values shown. Never auto-resolve. |
| **Escalates when** | Any contradiction on a commercially material field. |
| **Authority required** | 2 · PREPARE / HUMAN APPROVES |
| **Resolves into** | Gaps computed → Needs human. Both values are shown to the person deciding. Two equally-ranked disagreeing sources stay an explicit conflict rather than being silently resolved. |
| **Verification** | tests/client-onboarding.test.ts — resolveAuthoritativeValue direct tests prove the precedence gate never lets a signed-agreement value be silently overwritten and never picks a side between two same-rank disagreeing sources; a dedicated scenario-level test then drives the same contradiction through the real handler and asserts it reaches NEEDS_HUMAN with the conflicting field named. |

### POLICY VIOLATION — The customer is asked for something they already supplied.

| Field | Value |
| --- | --- |
| **Cause** | Gap computation reading a partial view of known context, or ignoring items supplied during the sale. |
| **Business impact** | Spends the trust the sale just bought, and is the single most commonly cited onboarding complaint. |
| **Prevention** | Gap computation differences required against the full known set including sales context before composing any request. |
| **Detection signal** | Requested item present in the record at request time. |
| **Recovery** | Suppress the request and recompute the gap set. |
| **Escalates when** | Repeated-information requests above zero. |
| **Authority required** | 3 · EXECUTE UNDER EXPLICIT POLICY |
| **Resolves into** | Awaiting customer input → Gaps computed. The request is suppressed and the gap set recomputed, so the customer is never asked twice for something they already supplied. |
| **Verification** | tests/client-onboarding.test.ts — the signed-client-to-first-value scenario asserts the field already known from the handoff (named-owner) never appears in any "requested" list, and the gap-computation decision explicitly records it as reused. |

### PARTIAL SIDE EFFECT — Some required resources are created and others fail, leaving the engagement half-provisioned.

| Field | Value |
| --- | --- |
| **Cause** | A downstream system failed midway through a multi-resource sequence. |
| **Business impact** | Onboarding appears started but cannot progress, and the gap is invisible without reconciliation. |
| **Prevention** | Each resource is keyed and claimed independently so a retry completes only what is missing. |
| **Detection signal** | Reconciliation of required resources against the ledger. |
| **Recovery** | Retry only the unclaimed resources; if reconciliation cannot resolve the difference, route to a person. |
| **Retry policy** | Bounded attempts per resource, not per sequence. |
| **Escalates when** | Reconciliation unable to determine what exists. |
| **Authority required** | 2 · PREPARE / HUMAN APPROVES |
| **Resolves into** | Provisioning → Needs human. Only unclaimed resources are retried. A difference reconciliation cannot resolve goes to a person rather than being retried blindly. |
| **Verification** | tests/client-onboarding.test.ts — the partial-provisioning direct test forces one resource attempt to OUTCOME_UNKNOWN while its sibling genuinely succeeds, and asserts the successful resource stays EXECUTED rather than being lost or recreated. |

### TIMEOUT — A resource-creation call times out without returning, leaving it unknown whether the resource was created.

| Field | Value |
| --- | --- |
| **Cause** | A slow downstream system. The request may well have succeeded after the caller gave up waiting. |
| **Business impact** | A blind retry duplicates the resource; no retry leaves the engagement half-provisioned. Both fail quietly, which is what makes this worse than an outright error. |
| **Prevention** | The idempotency key is claimed before the call, so a retry is safe regardless of which side of the timeout the original call actually landed on. |
| **Detection signal** | No response within the configured deadline. |
| **Recovery** | Reconcile by reading the resource back by its key before retrying, and retry only when the read confirms absence. |
| **Retry policy** | Bounded attempts, each reconciling before acting. |
| **Escalates when** | Reconciliation cannot determine whether the resource exists. |
| **Authority required** | 2 · PREPARE / HUMAN APPROVES |
| **Resolves into** | Provisioning → Needs human. Reached only when reconciliation cannot confirm the outcome. The resource is read back by its key before any retry, and retried only when that read confirms absence. |
| **Verification** | tests/client-onboarding.test.ts — the partial-provisioning direct test forces an OUTCOME_UNKNOWN result on one attempt and asserts it is refused rather than assumed successful, routing to NEEDS_HUMAN instead of TASKS_ASSIGNED. |

### POLICY VIOLATION — A derived onboarding task implies a service or commitment the signed engagement did not buy.

| Field | Value |
| --- | --- |
| **Cause** | Free-text handover notes or an onboarding requirement interpreted generously enough to suggest a bigger program than the one that was signed. |
| **Business impact** | The customer receives an implicit commitment nobody with commercial authority actually approved, and delivery is later asked to honour it. |
| **Prevention** | Every derived task is checked against the signed engagement’s service line before it is admitted onto the plan; a task with no implied service is always a standard onboarding necessity and always passes. |
| **Detection signal** | Task-to-scope comparison at plan derivation. |
| **Recovery** | Refuse the task. It never becomes a client-visible commitment without a person separately approving an amended scope. |
| **Escalates when** | Any candidate task whose implied service differs from the signed engagement. |
| **Authority required** | 2 · PREPARE / HUMAN APPROVES |
| **Resolves into** | The engagement carries on from where it was; the refused task simply never enters the derived plan. It cannot become a client-visible commitment without a person separately approving an amended scope. |
| **Verification** | tests/client-onboarding.test.ts — admitOnboardingTask is exercised directly against a synthetic task implying a service line the signed handoff did not buy, and is refused by name; the same gate runs for real over every task in each scenario’s derived plan. |

---

## Receivables / Invoice Recovery Agent

### STALE DATA — A reminder is sent for an invoice that has already been paid.

| Field | Value |
| --- | --- |
| **Cause** | Payment status read at schedule time rather than at despatch time, or a reconciliation lag in the accounting system. |
| **Business impact** | The most relationship-damaging failure in this system: it tells a paying client the firm does not know it was paid. |
| **Prevention** | Payment status is re-read from the accounting system immediately before despatch, as a transition guard rather than a step in the message. |
| **Detection signal** | Balance check at despatch time. |
| **Recovery** | Abort the reminder and move the invoice to PAID. |
| **Escalates when** | Any executed reminder against a settled invoice. |
| **Authority required** | 3 · EXECUTE UNDER EXPLICIT POLICY |
| **Resolves into** | Due soon → Paid · 1–30 days past due → Paid · 31–60 days past due → Paid · 61–90 days past due → Paid · 90+ days past due → Paid. The reminder is aborted before despatch; the invoice settles from whichever bucket it was in. |
| **Verification** | tests/receivables-recovery.test.ts — the direct "payment stops further collection" test settles an invoice, then fires a stale evaluation event against it and asserts zero side effects and zero attempted transitions. |

### POLICY VIOLATION — The cadence continues after a customer raised a dispute.

| Field | Value |
| --- | --- |
| **Cause** | The dispute arrived as free text in a reply and was not recognised as a state change. |
| **Business impact** | Chasing a client who has raised a legitimate objection converts a resolvable disagreement into a relationship failure. |
| **Prevention** | Dispute is a lifecycle state that removes the invoice from the cadence, not a flag on a message. |
| **Detection signal** | Reply interpretation returning the dispute class, or a manual dispute flag. |
| **Recovery** | Halt every pending reminder for the invoice and route to a person. |
| **Escalates when** | Any reminder executed against a disputed invoice. |
| **Authority required** | 3 · EXECUTE UNDER EXPLICIT POLICY |
| **Resolves into** | Due soon → Disputed · 1–30 days past due → Disputed · 31–60 days past due → Disputed · 61–90 days past due → Disputed. Every pending reminder for the invoice halts the moment a dispute is recognised. |
| **Verification** | tests/receivables-recovery.test.ts — the dispute-halts-cadence scenario drives a real dispute reply to DISPUTED and asserts zero reminders despatch from there or after a subsequent stale evaluation; a direct test independently confirms zero side effects from DISPUTED. |

### AI UNSUPPORTED INFERENCE — A message states an amount, due date, or balance that does not match the accounting system.

| Field | Value |
| --- | --- |
| **Cause** | A generated message composing figures from conversational context rather than from the record. |
| **Business impact** | The firm asserts an incorrect financial claim in writing, undermining every other invoice it sends. |
| **Prevention** | Financial figures are injected from the accounting system as structured values and are never generated as text. |
| **Detection signal** | Comparison of every figure in the assembled message against the record before despatch. |
| **Recovery** | Block despatch and route to a person. |
| **Escalates when** | Any mismatch detected. |
| **Authority required** | 4 · EXECUTE AND MANAGE BOUNDED DOWNSTREAM CONSEQUENCES |
| **Resolves into** | 31–60 days past due → Escalated · 61–90 days past due → Escalated · 90+ days past due → Escalated. Despatch is blocked before the message leaves. A figure that does not match the record never reaches a customer. |
| **Verification** | tests/receivables-recovery.test.ts — the overdue-reply-changes-policy scenario asserts every despatched reminder’s description contains the exact balance figure from the authoritative record; reminder text is composed from structured facts and never generated. |

### UNEXPECTED HUMAN REPLY — A promised payment date passes with no payment and no follow-up.

| Field | Value |
| --- | --- |
| **Cause** | The cadence was paused on the promise and never resumed. |
| **Business impact** | The invoice ages silently while the system reports it as correctly parked. |
| **Prevention** | A promise sets a dated resume condition rather than an indefinite pause. |
| **Detection signal** | Promise date elapsed with balance outstanding. |
| **Recovery** | Return the invoice to its ageing bucket and resume the cadence. |
| **Escalates when** | A second promise broken by the same customer. |
| **Authority required** | 3 · EXECUTE UNDER EXPLICIT POLICY |
| **Resolves into** | Payment promised → 31–60 days past due. The one declared return to the ageing ladder. A stale evaluation can only ever move an invoice forward along it, never back. |
| **Verification** | tests/receivables-recovery.test.ts — the direct "a broken promise re-enters the ageing ladder" test records a genuine promise, evaluates again after the committed date with the balance still outstanding, and asserts the invoice returns to PAST_DUE_31_60. |

### DUPLICATE EVENT — The same reminder is sent twice for the same invoice and cadence step.

| Field | Value |
| --- | --- |
| **Cause** | Scheduled job retry or overlapping evaluation runs. |
| **Business impact** | Reads as automated harassment on a topic where tone is already delicate. |
| **Prevention** | Reminders are keyed on invoice plus cadence step and claimed before despatch. |
| **Detection signal** | Idempotency key already claimed. |
| **Recovery** | Suppress the duplicate and record it. |
| **Retry policy** | Bounded retry; the key makes retries safe. |
| **Escalates when** | Duplicate reminder rate above zero. |
| **Authority required** | 3 · EXECUTE UNDER EXPLICIT POLICY |
| **Resolves into** | No state change; the attempt is recorded as SUPPRESSED_DUPLICATE. A second reminder is the failure, so not moving is the recovery. |
| **Verification** | tests/receivables-recovery.test.ts — the direct "duplicate events do not cause duplicate sends" test redelivers the same evaluation event and asserts the first reminder resolves EXECUTED while the second resolves SUPPRESSED_DUPLICATE against the shared idempotency ledger. |

### SOURCE SYSTEM OUTAGE — The accounting system is unavailable at evaluation time.

| Field | Value |
| --- | --- |
| **Cause** | Provider outage, credential expiry, or rate limiting. |
| **Business impact** | Without authoritative balances the system could chase paid invoices, which is worse than chasing nothing. |
| **Prevention** | No reminder may despatch without a fresh authoritative balance read. Absence of truth blocks action rather than defaulting to the last known value. |
| **Detection signal** | Read failure or a freshness timestamp older than the configured tolerance. |
| **Recovery** | Hold the entire cadence, retry with backoff, and notify a person if the outage exceeds the tolerance. |
| **Retry policy** | Bounded attempts with increasing delay. |
| **Escalates when** | Outage exceeds the configured tolerance window. |
| **Authority required** | 2 · PREPARE / HUMAN APPROVES |
| **Resolves into** | The current ageing state is preserved and the whole cadence is held. Ageing on an unread balance would invent facts about a customer. |
| **Verification** | Pending — this pass modelled every evaluation event as carrying a fresh, present balance read (the payload schema requires one); it did not model the read itself failing or going stale, which would need a distinct "no reading available" event shape rather than a variant of the one authored so far. |

---

## Owner Revenue Intelligence Agent

### STALE DATA — A conclusion is drawn from an input that is no longer current.

| Field | Value |
| --- | --- |
| **Cause** | A source sync failed silently and the last known value was used as though it were fresh. |
| **Business impact** | The owner makes a real decision on a stale picture, which is worse than making no decision. |
| **Prevention** | Freshness is a transition guard. Exceeding tolerance blocks the analysis rather than annotating it. |
| **Detection signal** | Input age compared against configured tolerance at window close. |
| **Recovery** | Flag the input, attempt refresh, and record insufficient evidence if refresh fails. |
| **Escalates when** | Repeated staleness from the same source. |
| **Authority required** | 1 · RECOMMEND |
| **Resolves into** | Freshness checked → Stale data flagged → Insufficient evidence. A refresh is attempted first; the second movement is what happens when it fails. Freshness is a transition guard, not an annotation. |
| **Verification** | tests/owner-revenue-intelligence.test.ts — the stale-concentration-read scenario blocks on a first read older than the configured tolerance; a direct test drives a second refresh attempt that is still stale and asserts it resolves to INSUFFICIENT_EVIDENCE rather than concluding on a partial refresh. |

### AI UNSUPPORTED INFERENCE — A narrative asserts why a metric moved without evidence for that cause.

| Field | Value |
| --- | --- |
| **Cause** | A plausible story is the most fluent completion, and metric movements always admit one. |
| **Business impact** | The owner acts on a fabricated cause and treats the real one as already explained. |
| **Prevention** | Corroboration is required before surfacing, and causal language is structurally separated from observation. |
| **Detection signal** | Claim-to-evidence resolution across surfaced statements. |
| **Recovery** | Strip the causal assertion and present the variance with candidate factors instead. |
| **Escalates when** | Any unsupported causal claim reaching the owner. |
| **Authority required** | 1 · RECOMMEND |
| **Resolves into** | Corroborating → Exception surfaced. The exception is surfaced WITHOUT the causal claim — the variance is presented with candidate factors instead of a cause. |
| **Verification** | tests/owner-revenue-intelligence.test.ts — the cash-collection scenario asserts the bounded judgment’s decision record forbids asserting a cause or presenting the recommendation as fact, and carries a non-empty "declined to infer" list rather than a determined root cause. |

### CONTRADICTORY DATA — The same metric name resolves to different figures in different systems.

| Field | Value |
| --- | --- |
| **Cause** | Two systems each compute a defensible version of the same concept using different definitions. |
| **Business impact** | Trust in the whole report collapses the first time the owner spots the discrepancy. |
| **Prevention** | Every metric resolves through the registry to exactly one definition, and the definition is shown alongside the figure. |
| **Detection signal** | Comparison of computed value against each contributing system’s own reported value. |
| **Recovery** | Surface both figures with their definitions and route the definition conflict to a person. |
| **Escalates when** | Any metric with more than one active definition. |
| **Authority required** | 1 · RECOMMEND |
| **Resolves into** | Action recommended → Awaiting owner decision. Both figures travel with their definitions; what the owner decides is the definition, not the number. |
| **Verification** | Pending — scenario not yet authored. |

### POLICY VIOLATION — So many exceptions are surfaced that the owner stops reading them.

| Field | Value |
| --- | --- |
| **Cause** | Thresholds set too tight, or corroboration not enforced. |
| **Business impact** | Functionally identical to surfacing nothing, but more expensive and more confidently wrong. |
| **Prevention** | Corroboration is mandatory, thresholds are per metric, and exception count is itself a monitored metric. |
| **Detection signal** | Exceptions surfaced per window, and decision rate trending toward zero. |
| **Recovery** | Raise thresholds and route the tuning decision to the owner. |
| **Escalates when** | Decision rate below the configured floor across consecutive windows. |
| **Authority required** | 1 · RECOMMEND |
| **Resolves into** | Action recommended → Awaiting owner decision. The tuning decision goes to the owner. The system never quietly raises its own thresholds. |
| **Verification** | Pending — scenario not yet authored. |

### POLICY VIOLATION — Confidential customer data is aggregated across accounts where policy forbids it.

| Field | Value |
| --- | --- |
| **Cause** | A cross-account metric composed without checking the aggregation policy for its inputs. |
| **Business impact** | A contractual or confidentiality breach produced by an internal reporting feature. |
| **Prevention** | Aggregation permission is a property of each input and is checked before composition. |
| **Detection signal** | Aggregation policy check on every cross-account computation. |
| **Recovery** | Block the metric and report it as unavailable by policy rather than omitting it silently. |
| **Escalates when** | Any blocked aggregation, since it indicates a metric was specified without checking its inputs. |
| **Authority required** | 2 · PREPARE / HUMAN APPROVES |
| **Resolves into** | Corroborating → Insufficient evidence. Reported as unavailable by policy rather than omitted silently, so the absence is visible. |
| **Verification** | tests/owner-revenue-intelligence.test.ts — a direct test supplies a corroborating observation flagged as requiring cross-client aggregation and asserts it is excluded before comparison, resolving to INSUFFICIENT_EVIDENCE at authority level 2 with the confidentiality policy named in the decision record, rather than composed into the metric. |
