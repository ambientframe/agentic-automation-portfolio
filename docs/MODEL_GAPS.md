# Model Gaps

> Generated from the typed model. Do not hand-edit — change `data/model-gaps.ts` and run `npm run docs`.

**13 limits of the six systems, found by 3 independent profile authors**
(`ashcombe`, `stratum`, `wrenfield`) working from `docs/PROFILE_AUTHORING_PACKET.md` alone, with no access
to this repository's reasoning. 8 of them are not specific to one trade.

This is not a backlog and not a roadmap. Nothing here is scheduled, and `CLAUDE.md` scope
discipline requires the running system to produce the need before a capability is added — several
of these may never be built, and saying so is the point.

It exists because these findings had nowhere to live. They arrived inside handback documents and
were otherwise lost, which is a poor fate for the strongest evidence this artifact has that its
model has edges: **limits reported by people with no stake in the answer.**

Every entry names a concrete case. A gap stated abstractly cannot be checked or fixed; one stated
as an instance can be evaluated by a practitioner and either fixed or refused on the merits.

## How far the independence claim goes

Each entry records who reported it, when, and what that author had access to, so the claim can be
audited rather than taken on trust.

**The limit, stated because it weakens the claim.** The three authoring runs were separate agent
sessions, each working from the packet and its own research brief — but they ran **in the same
working tree**, sequentially, and could in principle have read one another's profile files. One of
them reported exactly that interference. So this is independence of *authorship and brief*, not
isolation; separate worktrees would be needed for the stronger claim.

The original handbacks are held outside this repository. They are referenced rather than copied in:
a verbatim dump would be archival theatre, and the structured record is what an auditor needs.

## Gaps that generalise beyond one trade

### Blocked is not the same as overdue, and the model has only overdue

Found while authoring `ashcombe`.

| Field | |
| --- | --- |
| **The case** | A completed tax return waiting on a signed Form 8879 is legally forbidden to send. The firm is obeying a rule, not dropping a ball, and no amount of waiting makes the return sendable — only the signature does. |
| **What the model does instead** | `dispatchTimeoutHours` flags any prepared-but-unsent action as late once its window elapses. The clock runs regardless of whether proceeding is even permitted, so a firm behaving correctly is reported as behind. |
| **What a fix would need** | A way to declare that an action is gated on an external precondition, so the engine can hold it in a state distinct from overdue and not start the clock until the gate clears. The distinction has to reach the operational view, or a person still sees "late". |
| **Reported by** | Cursor Stage B run, accounting / CAS profile (handed back as `ledgerline`, renamed at registration), 2026-08-28 |
| **Working from** | docs/PROFILE_AUTHORING_PACKET.md and its own Stage A research brief. No access to CHECKPOINT.md, PATTERN_LEDGER.md, or this repository's reasoning. |

### A confidence floor cannot express "never"

Found while authoring `ashcombe`.

| Field | |
| --- | --- |
| **The case** | The regulator’s rule is categorical: a machine may not decide a tax position at any confidence. The profile can only approximate that with 0.95, which still says "at 0.96, go ahead." |
| **What the model does instead** | A single scalar `confidenceFloor` per profile. The absolute carve-out is stated in policy prose, and the engine reads the number rather than the sentence. |
| **What a fix would need** | A per-decision-class prohibition that is not a threshold at all — a list of judgments no confidence may authorise, checked before the floor is consulted. |
| **Reported by** | Cursor Stage B run, accounting / CAS profile (handed back as `ledgerline`, renamed at registration), 2026-08-28 |
| **Working from** | docs/PROFILE_AUTHORING_PACKET.md and its own Stage A research brief. No access to CHECKPOINT.md, PATTERN_LEDGER.md, or this repository's reasoning. |

### `entityMatchThreshold` conflates confidence with permission

Found while authoring `ashcombe`.

| Field | |
| --- | --- |
| **The case** | The trade’s rule is not "be very sure before merging". It is "do not auto-merge, because combining two records that each carry a Social Security number is a disclosure decision with criminal exposure." |
| **What the model does instead** | The threshold is set to 1 as the closest available encoding. It works, and it reads as extreme caution rather than as a prohibition. |
| **What a fix would need** | A separation between how confident a match is and whether merging is permitted at all. They are different questions and one number answers both. |
| **Reported by** | Cursor Stage B run, accounting / CAS profile (handed back as `ledgerline`, renamed at registration), 2026-08-28 |
| **Working from** | docs/PROFILE_AUTHORING_PACKET.md and its own Stage A research brief. No access to CHECKPOINT.md, PATTERN_LEDGER.md, or this repository's reasoning. |

### The client is a required actor, and the model has no way to say so

Found while authoring `stratum`.

| Field | |
| --- | --- |
| **The case** | In a CRM implementation, which duplicate record wins, which field is authoritative, and whether a phase gate passes all belong to a named person at the client — not to anyone on the delivering firm’s staff. |
| **What the model does instead** | `authorityCeiling` describes only the firm’s own roles, and `accountabilities.escalatesToRoleId` must resolve to a role the profile declares. The best-evidenced fact in that brief could only be encoded as prose. |
| **What a fix would need** | An external-approver concept: a party who holds authority over a decision without being an employee of the business the profile describes. |
| **Reported by** | Cursor Stage B run, RevOps / CRM implementation profile, 2026-08-27 |
| **Working from** | docs/PROFILE_AUTHORING_PACKET.md and its own Stage A research brief. No access to CHECKPOINT.md, PATTERN_LEDGER.md, or this repository's reasoning. |

### Reactivation is assumed to be time-driven when it is event-driven

Found while authoring `stratum`.

| Field | |
| --- | --- |
| **The case** | In this trade a dormant account reopens on a renewal date, a new revenue leader, or an acquisition. A firm would rather wait indefinitely and act on a trigger than run three touches over 45 days. |
| **What the model does instead** | `dormantMaxAttempts` and `dormantWindowDays` describe a fixed cadence. The event-driven shape can only be approximated by stretching the window. |
| **What a fix would need** | A trigger concept for reactivation, so waiting for a known event is a modelled state rather than a long timeout. |
| **Reported by** | Cursor Stage B run, RevOps / CRM implementation profile, 2026-08-27 |
| **Working from** | docs/PROFILE_AUTHORING_PACKET.md and its own Stage A research brief. No access to CHECKPOINT.md, PATTERN_LEDGER.md, or this repository's reasoning. |

### A stalled approval at the top of the firm reads as an omission, not a risk

Found while authoring `wrenfield`.

| Field | |
| --- | --- |
| **The case** | In an architecture practice the fee-proposal approver is the managing principal — the top of the ladder. The brief identifies that person as the practice’s defining operational bottleneck. |
| **What the model does instead** | `validateProfileConsistency` requires `escalatesToRoleId` to hold strictly higher authority, so the profile correctly declares no escalation. The honest consequence — a pursuit dying quietly on the one desk that can release it — becomes invisible to the model rather than modelled. |
| **What a fix would need** | A way to express that a decision has no one above it, and that this is a named risk rather than a missing field. |
| **Reported by** | Cursor Stage B run, architecture / engineering profile (handed back as `formwork`, renamed at registration), 2026-08-28 |
| **Working from** | docs/PROFILE_AUTHORING_PACKET.md and its own Stage A research brief. No access to CHECKPOINT.md, PATTERN_LEDGER.md, or this repository's reasoning. Its Stage A brief's tool-stack citations were not supplied to it, which it reported. |

### Recurring revenue has no notion of a seasonal peak

Found while authoring `ashcombe`.

| Field | |
| --- | --- |
| **The case** | Between January and April this firm’s capacity is fixed and its inbound roughly triples. The same SLA means something different in February than in August. |
| **What the model does instead** | `derivedEconomics` is annual and flat. The constraint is recorded in `operatingConstraints`, where nothing reads it. |
| **What a fix would need** | A seasonal shape on demand or capacity, so a threshold can mean the same thing all year or deliberately not. |
| **Reported by** | Cursor Stage B run, accounting / CAS profile (handed back as `ledgerline`, renamed at registration), 2026-08-28 |
| **Working from** | docs/PROFILE_AUTHORING_PACKET.md and its own Stage A research brief. No access to CHECKPOINT.md, PATTERN_LEDGER.md, or this repository's reasoning. |

### Consent is typed, and the model has one boolean

Found while authoring `ashcombe`.

| Field | |
| --- | --- |
| **The case** | Consent to be contacted commercially is a different object from the written §7216 consent required before return information may be disclosed to an offshore preparer. |
| **What the model does instead** | `leadSources[].impliesContactConsent` is a boolean. The second consent is modelled as an onboarding requirement, which works and is not the same thing. |
| **What a fix would need** | Consent as a typed permission with a scope, rather than a single flag meaning "may we contact them". |
| **Reported by** | Cursor Stage B run, accounting / CAS profile (handed back as `ledgerline`, renamed at registration), 2026-08-28 |
| **Working from** | docs/PROFILE_AUTHORING_PACKET.md and its own Stage A research brief. No access to CHECKPOINT.md, PATTERN_LEDGER.md, or this repository's reasoning. |

## Gaps specific to one trade

### A change order is a second commercial document, and there is one proposal path

Found while authoring `stratum`.

| Field | |
| --- | --- |
| **The case** | A change order is smaller than the original SOW, raised mid-delivery, urgent, approved by both parties — and skipping it is the exact thing that becomes a disputed invoice. |
| **What the model does instead** | `proposalAuthorityCeiling` and `proposalApprovalTimeoutHours` describe the initial SOW only. The change order is folded under the same commercial-authority policy. |
| **What a fix would need** | A second commercial-document path with its own authority level and its own clock, rather than one path serving two instruments with different economics. |
| **Reported by** | Cursor Stage B run, RevOps / CRM implementation profile, 2026-08-27 |
| **Working from** | docs/PROFILE_AUTHORING_PACKET.md and its own Stage A research brief. No access to CHECKPOINT.md, PATTERN_LEDGER.md, or this repository's reasoning. |

### A project-then-retainer sequence is modelled as two unrelated numbers

Found while authoring `stratum`.

| Field | |
| --- | --- |
| **The case** | Most retainer clients are the same clients continuing after go-live. That relationship is what makes the churn driver "support tailed off after go-live" a revenue event rather than a satisfaction one. |
| **What the model does instead** | `derivedEconomics` holds `newProjectEngagementsPerYear` and `activeRetainerClients` with nothing connecting them. |
| **What a fix would need** | A way to state that one population converts into the other, so a system can reason about the transition rather than about two independent counts. |
| **Reported by** | Cursor Stage B run, RevOps / CRM implementation profile, 2026-08-27 |
| **Working from** | docs/PROFILE_AUTHORING_PACKET.md and its own Stage A research brief. No access to CHECKPOINT.md, PATTERN_LEDGER.md, or this repository's reasoning. |

### Pursuit cost has nowhere to live

Found while authoring `wrenfield`.

| Field | |
| --- | --- |
| **The case** | Unpaid qualifications submissions, interviews, and fee negotiation are real, principal-priced, and written off entirely when a pursuit is lost. |
| **What the model does instead** | The practice can describe this in `operatingConstraints`. No field carries it as a quantity, so no system can compute the cost of a lost pursuit. |
| **What a fix would need** | A cost-of-pursuit quantity attached to the pipeline, so a loss has a price the owner-intelligence system could report. |
| **Reported by** | Cursor Stage B run, architecture / engineering profile (handed back as `formwork`, renamed at registration), 2026-08-28 |
| **Working from** | docs/PROFILE_AUTHORING_PACKET.md and its own Stage A research brief. No access to CHECKPOINT.md, PATTERN_LEDGER.md, or this repository's reasoning. Its Stage A brief's tool-stack citations were not supplied to it, which it reported. |

### Rank-then-negotiate-with-one is not a pipeline the model recognises

Found while authoring `wrenfield`.

| Field | |
| --- | --- |
| **The case** | Public architecture work is ranked on competence, and the fee is then negotiated with the top-ranked firm only. No stage of that pipeline is a competitive fee bid. |
| **What the model does instead** | `pipelineStages` express it as prose exit criteria. The model has no concept of the selection shape, and nothing prevents a reader assuming competitive bidding. |
| **What a fix would need** | Pipeline stages that can declare their selection mechanism, so a generic professional-services assumption cannot silently misread how the business wins work. |
| **Reported by** | Cursor Stage B run, architecture / engineering profile (handed back as `formwork`, renamed at registration), 2026-08-28 |
| **Working from** | docs/PROFILE_AUTHORING_PACKET.md and its own Stage A research brief. No access to CHECKPOINT.md, PATTERN_LEDGER.md, or this repository's reasoning. Its Stage A brief's tool-stack citations were not supplied to it, which it reported. |

### "Recurring" assumes guaranteed revenue that an on-call agreement does not provide

Found while authoring `wrenfield`.

| Field | |
| --- | --- |
| **The case** | An on-call or IDIQ appointment guarantees nothing. It is a term appointment against which task orders may or may not be issued. |
| **What the model does instead** | `activeRetainerClients × averageRetainerMonthlyFee × 12` models guaranteed monthly revenue. The arithmetic reconciles while describing a retainer the trade does not have. |
| **What a fix would need** | A recurring-revenue shape that can express an appointment without a guarantee, distinct from a subscription. |
| **Reported by** | Cursor Stage B run, architecture / engineering profile (handed back as `formwork`, renamed at registration), 2026-08-28 |
| **Working from** | docs/PROFILE_AUTHORING_PACKET.md and its own Stage A research brief. No access to CHECKPOINT.md, PATTERN_LEDGER.md, or this repository's reasoning. Its Stage A brief's tool-stack citations were not supplied to it, which it reported. |
