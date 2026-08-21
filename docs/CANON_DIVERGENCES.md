# Canon Divergences

Where the canonical documents in `docs/` intentionally depart from the historical inputs
in `docs/source/`, the decision is recorded here rather than left as a silent difference.

The rule: **canon wins, and the divergence is written down.** A future session that finds
a conflict between a canonical document and a historical input should find the reason on
this page. If it does not, that is a defect — record it.

---

## 1. Systems 2–6 are labelled CONCEPT, not SIMULATED

**Input.** `01-flight-simulator-brief-v0.1.md` §2 sets the v0.1 maturity target as
*"Other five systems: SIMULATED — lower fidelity."*

**Canon.** Dormant Pipeline Recovery, Call-to-Proposal, Client Onboarding, Receivables,
and Owner Revenue Intelligence are labelled `CONCEPT`.

**Why.** The same brief insists that *"maturity is descriptive, not aspirational"* and
that *"nothing may imply that simulated behavior is live."* These five systems have full
canon — lifecycle graphs, metrics, standards, failure modes, all schema-validated — but no
executable scenario. Nothing about them runs. Calling that `SIMULATED` would claim a
fidelity the code does not have, which is the precise failure the maturity ladder exists
to prevent.

**Status.** Temporal, not substantive. Each system becomes `SIMULATED` the moment a
scenario replays through the engine. The brief's target stands; this records where we are
against it.

---

## 2. The lead-response evidence is 2007, not 2021, and is weaker than usually claimed

**Input.** §15 seeds the ledger with *"InsideSales Lead Response Study 2021."* §4A builds
the speed-to-lead objective on it, and §15 also lists HBR's *"The Short Life of Online
Sales Leads."*

**Canon.** No 2021 edition was located. The study that actually produces the widely quoted
figures — *"5 minutes versus 30 minutes = 100× contact, 21× qualification"* — is the **2007
Lead Response Management study** by James B. Oldroyd at MIT Sloan, produced with
InsideSales.com. It is recorded at `DISPUTED_OR_WEAK`, not `VERIFIED`.

**Why.** Three separate problems, each recorded rather than smoothed over:

- The figures are near-universally **misattributed to HBR 2011**. HBR's own contribution
  was a different finding (a first-response-time audit). Repeating the misattribution
  would put a fabricated citation in a ledger whose entire purpose is not to.
- The study is a **six-company non-random convenience sample**, co-produced with a vendor
  holding a direct commercial interest in the conclusion.
- The data is **nearly two decades old** and predates present-day buying channels.

The HBR article itself is recorded as `PENDING_VERIFICATION`: its existence, authorship,
venue, and date were confirmed, but the full text is paywalled and was not read, so the
canon states the claim **without any numbers** rather than borrowing them secondhand.

**Effect on design.** None, deliberately. Latency is still measured and the acknowledgement
path is still fast — but the five-minute interval is `CLIENT_POLICY` (an operating choice
of the fictional firm), never an evidence-backed benchmark. Designing conservatively here
costs nothing and keeps the ledger honest.

---

## 3. FDCPA does not govern the receivables system, and the canon says so

**Input.** §4E lists collection guardrails — no invented late fees, no threatened legal
consequences, no misrepresented contractual rights — in a framing that reads as regulatory.

**Canon.** The guardrails are **kept in full**. Their basis is corrected: they rest on
operator policy plus the general prohibition on deceptive or unfair practices, **not** on
FDCPA compliance.

**Why.** The FDCPA governs debts incurred by a natural person primarily for personal,
family, or household purposes, and applies principally to third parties collecting debts
owed to another. CFPB examination procedures state plainly that it does not apply to
corporate debt or debt owed for business purposes. The demonstration business collects its
own B2B invoices, so the Act does not reach it.

Automation vendors routinely present FDCPA-style constraints as universal to invoice
chasing. That claim is wrong for this case, and a portfolio whose selling point is
engineering rigour cannot afford to repeat it.

**Two caveats are carried forward in the canon**, because they are the cases where the
conclusion flips: a creditor collecting under a name implying a third party can itself fall
within FDCPA scope, and some state laws reach original creditors.

---

## 4. Deterministic decisions execute; only bounded judgments are fixture-backed

**Input.** §9 and §11 describe scenarios and decision records in terms that permit the
whole timeline to be authored fixture data.

**Canon.** Anything labelled `DETERMINISTIC_RULE` genuinely computes from state, event, and
policy — validation, normalisation, identity resolution, consent screening, the
confidence-floor comparison, missing-field computation, disposition mapping, transition
legality, idempotency, and the authority gate. Only `BOUNDED_AI_JUDGMENT` is replayed from
authored fixtures, through a typed `DecisionProvider` port.

**Why.** Operator correction, recorded at the design gate: *"I want executable operating
logic, not a timeline that merely narrates what the system supposedly decided."*

The distinction is load-bearing. A narrated timeline can depict duplicate suppression; an
executing one can be **wrong about it**, and therefore can be tested. The duplicate-delivery
scenario genuinely re-enters the idempotency ledger and is refused — and during
development the engine caught a real defect in the handler by rejecting an undeclared
transition, which a scripted timeline could not have done.

---

## 5. Runtime field names differ from the brief's flat list

**Input.** §5 lists fields to support per event and action, including `previousState`,
`nextState`, `decisionType`, and `actorType`.

**Canon.** The same information is modelled where it belongs rather than flattened onto
every event: `previousState`/`nextState` are `StateTransition.from`/`.to`, `decisionType`
is `DecisionRecord.mechanism`, and `actorType` is `CanonicalEvent.actor`.

**Why.** §10 explicitly permits this: *"Names may differ if your model is cleaner."* One
event can produce several transitions and several decisions, so flat per-event fields would
have to be either duplicated or lossy. No information from §5 is dropped.

---

## 6. The ChatGPT handoff pack is historical, not operative

**Input.** `02-START_HERE.md`, `03-PROJECT_HANDOFF.md`, and
`04-CHATGPT_PROJECT_INSTRUCTIONS.md` describe setting up a ChatGPT Project as the working
environment.

**Canon.** The work happens in this repository. `03-PROJECT_HANDOFF.md` remains valuable as
the **strategy layer** — the ten-layer learning progression, the anti-dead-end rules, and
the commercial positioning are not restated anywhere else and are still binding as intent.
`02` and `04` are operational setup for a different tool and carry no engineering content.

**Why.** Two sources of truth is the failure mode; `docs/source/README.md` records which is
which.
