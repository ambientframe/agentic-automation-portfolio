# Status

**As of 2026-08-23 · Lead Rescue wait/resume reliability closure — the notification
`WAITING_FOR_REPLY` escalates into is now safe against two independent runtimes racing on
the same durable incident, not merely against a single process's in-memory ledger**

## Portfolio maturity

**INTERACTIVE PROTOTYPE** — the application runs, all six systems are open and inspectable,
and all six execute real operating logic: Lead Rescue against six scenarios, Dormant
Pipeline Recovery against two, Call-to-Proposal Revenue Agent against two, Client
Onboarding Operator against two, Receivables / Invoice Recovery Agent against two, and
Owner Revenue Intelligence Agent against two, plus one smaller executable path exercising
a third declared transition pair in Call-to-Proposal.

| # | System | Maturity | Runs? |
| --- | --- | --- | --- |
| 1 | Lead Rescue | `INTERACTIVE_PROTOTYPE` | Yes — 6 scenarios execute end to end, plus a live wait/resume demo |
| 2 | Dormant Pipeline Recovery | `SIMULATED` | Yes — 2 scenarios execute end to end |
| 3 | Call-to-Proposal Revenue Agent | `SIMULATED` | Yes — 2 scenarios execute end to end |
| 4 | Client Onboarding Operator | `SIMULATED` | Yes — 2 scenarios execute end to end |
| 5 | Receivables / Invoice Recovery Agent | `SIMULATED` | Yes — 2 scenarios execute end to end |
| 6 | Owner Revenue Intelligence Agent | `SIMULATED` | Yes — 2 scenarios execute end to end |

**The horizontal portfolio finished two passes ago; the vertical climb into Lead Rescue
continues.** The prior pass gave `WAITING_FOR_REPLY` a genuine wait/resume mechanism —
durable persistence across a process boundary, an in-memory revision guard against a
duplicate resume. This pass falsified that guard specifically for the property it was never
actually proven against: two INDEPENDENT runtimes, each with its own freshly constructed
engine dependencies, racing to resume the SAME durably persisted incident. The falsification
was real, not hypothetical — see "Lead Rescue wait/resume reliability closure — this pass"
below — and the repair is a narrow, durable, cross-process-exclusive claim on the
notification side effect itself, layered underneath the existing revision guard rather than
replacing it. `maturity` does not change this pass: still `INTERACTIVE_PROTOTYPE`, still
`NOT_LIVE`, exactly as the prior pass left it — see that section below for what that
promotion does and does not claim.

**This pass built the sixth system from an already-authored CONCEPT canon**, the same
starting condition as Receivables one pass ago: the lifecycle graph (12 states, 14
transitions), metrics, standards, and failure modes for Owner Revenue Intelligence already
existed. Unlike every prior system, this one needed **zero new lifecycle states,
transitions, profile schema fields, or ports** — the existing `DecisionProvider` port,
reused completely unchanged, was sufficient for the system's one bounded-judgment
transition, and every one of the system's 14 declared transitions is now exercised by a
scenario or a direct test, a first for this portfolio. See "Owner Revenue Intelligence
Agent — this pass" below.

## Cross-system boundary closure (System 3 → 4, prior pass)

A red-team of the existing handoff found that, despite the continuity claim above being
true at the level of values matching, nothing in the codebase actually computed the
handoff from Call-to-Proposal's own engine output — `BRAMWELL_HANDOFF` in
`data/profiles/kestrel/scenarios/client-onboarding.ts` was a hand-typed object literal
authored to look consistent with Call-to-Proposal's Bramwell scenario, including several
prose fields (`scopeSummary`, `exclusions`, `customerCommitments`, `successCriteria`) with
no code-level connection to any `Claim` Call-to-Proposal actually admitted. One of those
fields had silently drifted into a real defect: the original `customerCommitments`
asserted "provide read-only access to in-scope systems," a fact the Bramwell transcript
never established — exactly the unsupported-inference failure mode Call-to-Proposal's own
`admitClaim` gate exists to catch, reintroduced because this fixture was typed by hand
instead of derived from an admitted claim.

This pass closes that gap with the smallest contract the repository's own constraints
allow: `lib/engine/handoffs/proposal-to-onboarding-handoff.ts` exports
`exportSignedEngagementHandoff`, a pure function (no new port — both sides are already
fully resolved engine output by the time it runs) that reads Call-to-Proposal's own
`ProposalArtifact` and `Claim[]` (via two functions on `call-to-proposal.ts` promoted from
private to exported for exactly this read) and either refuses — for a draft, an
unsupported claim, a stale approval, or an approved artifact missing a claim field the
translation needs — or produces a `SignedEngagementHandoff` whose commercially meaningful
fields are each traceable to a specific admitted claim or the seller's own catalog/profile
data, never re-typed prose. `client-onboarding.ts` still imports nothing from
`call-to-proposal.ts`; only this new boundary file is allowed to know about both systems'
shapes. `data/profiles/kestrel/scenarios/client-onboarding.ts` keeps `BRAMWELL_HANDOFF` as
a pinned literal — the fixture stays a synchronous data module, and no runtime coupling was
introduced between the two handlers — but `tests/handoff-boundary.test.ts` re-runs
Call-to-Proposal's own Bramwell scenario live on every test run and asserts the translation
equals that literal exactly, plus drives a live-translated handoff through Client
Onboarding to `FIRST_VALUE_REACHED` end to end. Edit Call-to-Proposal's Bramwell scenario
and this test fails until the pinned fixture is updated to match, rather than silently
diverging.

The same red-team pass on the secure-access model found a second, independent gap: the
secret-pattern screen (`screenForSecretLikeContent`) was applied to ordinary customer-intake
values but never to an `access.grant.confirmed` event's `externalReference` — a field typed
as a bare non-empty string with nothing stopping a secret-shaped value from being persisted
as a `SecureAccessRequirement.channelReference` and rendered into decision text. Fixed in
`handleAccessGrantConfirmed`: a secret-shaped reference is now screened, withheld exactly
like a leaked intake value, and its access requirement is never marked `CONFIRMED` nor its
task marked `COMPLETE` on the strength of it. The `SecureAccessRequirement` type itself
needed no change — it already modelled requirement/reference/status/owner rather than the
secret value; this was a control-flow gap, not a type-shape gap.

## Receivables / Invoice Recovery Agent — this pass

Two scenarios. A complex path (`overdue-reply-changes-policy`) whose reply deliberately
mentions "dispute" — about a *different*, already-settled invoice — while genuinely
committing to a date for the invoice in question; the bounded judgment reads it correctly
as `PROMISE_TO_PAY`, not `DISPUTE`, and a second, separate judgment extracts the committed
date with citation before the cadence pauses and a later settlement reaches `PAID`. A
guardrail path (`dispute-halts-cadence`) whose invoice ages three buckets in a single
evaluation event, is then genuinely disputed, absorbs a stale delayed evaluation with zero
side effects once it has left the ageing ladder, and is returned to the ladder by a named
person with sufficient authority.

Genuinely computed, not narrated: `computeBucket`/`daysPastDue` are pure date-string
arithmetic (no clock read); an ageing evaluation walks forward one declared transition per
bucket crossed, in a single inbound event, exactly the same "cascade of steps from one
event" pattern Call-to-Proposal's claims-review pipeline already established; a reminder
despatches only when the computed days-past-due exactly matches a configured cadence
checkpoint, with every dollar figure injected from the event's own authoritative balance,
never composed; and — the one guarantee this pass treated as non-negotiable rather than
assumed — a stale or out-of-order evaluation can only ever move an invoice *forward* along
the ageing ladder, never back, verified by a direct test that fires a later evaluation
first and then an earlier one and asserts the bucket does not regress.

Two bugs the executable path caught before any test was written to catch them
deliberately: the first version of the handler had no code path that ever returned an
invoice from `PAYMENT_PROMISED` to the ageing ladder once its committed date passed
unsettled (`rr-t23` was declared in the canon but nothing drove it), caught by a direct
test expecting exactly that and getting `PAYMENT_PROMISED` back unchanged; and the first
version of this system's own `fidelityNote` referenced a Kestrel-specific policy id in
`data/systems/receivables-recovery.ts`, tripping `tests/seam.test.ts` immediately —
the fastest possible confirmation that the seam test actually catches what it claims to.

Two ports reused with zero changes to either: `DecisionProvider` for the closed-set
dispute/promise/neither classification (Dormant Pipeline Recovery's own shape), and
`ExtractionProvider` for the citation-bearing committed-date value (Call-to-Proposal's own
shape) — deliberately not one port doing both jobs, because collapsing a classification
into an extracted field would have lost `ClassificationRequest`'s closed-set enforcement,
a real safety property for a question as consequential as "is this a dispute." No new
lifecycle states, transitions, side-effect kinds, or profile fields were needed: the
canon's existing `ESCALATED` state and the already-declared `collectionEscalationDays`
operating parameter were sufficient for the day-45 escalation path, exercised directly.

## Owner Revenue Intelligence Agent — this pass

Two scenarios. A complex path (`cash-collection-quietly-worsens`) whose primary signal —
cash collected falling sharply while revenue invoiced holds steady — would misdiagnose as a
demand problem if read alone; the exception is only surfaced once an independent source, a
different reporting system entirely, corroborates that collection quality is genuinely
worsening. The bounded judgment then composes a plain-language explanation and one
recommendation from a small closed set, structurally separated from the facts that
prompted it, and the owner records a decision against the evidence. A guardrail path
(`stale-concentration-read-dismissed`) reuses the business profile's own declared
referral-partner concentration figure: a read older than the configured staleness
tolerance blocks the conclusion outright, and a refreshed read landing well inside the
configured materiality threshold is correctly left alone rather than surfaced as a false
alarm.

Genuinely computed, not narrated: freshness is a transition guard, not an annotation — an
input's age against a configured tolerance decides whether the analysis proceeds at all,
verified directly by driving a second refresh attempt that is still stale and asserting it
resolves to `INSUFFICIENT_EVIDENCE` rather than concluding on a partial refresh. Variance
is a pure percentage computation against a configured materiality threshold. Corroboration
is a genuine agreement check — a candidate corroborating source is filtered for admissibility
(a source requiring cross-client aggregation is excluded before the direction check ever
runs, citing the confidentiality policy the profile had already declared for exactly this
system) and then checked against its *own* declared worsening direction, not against the
primary metric's raw sign — the two metrics in the proving scenario move in opposite raw
directions (cash collected down, days-sales-outstanding up) while genuinely corroborating
the same underlying condition, which a naive same-sign check would have missed entirely.

Every one of the system's 14 declared transitions is exercised by a scenario or a direct
test — the two guardrail transitions into `INSUFFICIENT_EVIDENCE` (a disagreeing
corroborator; a confidentiality-excluded one), the below-confidence-floor hold, and the
owner dismissing rather than acknowledging a routed recommendation are each proven directly
rather than through a full scenario, the same "smallest necessary" discipline every prior
system's gap list already reflects — but this is the first system in the portfolio to reach
full transition coverage at all.

One port reused with zero changes: `DecisionProvider`, for the single bounded judgment this
system's canon declares (composing a plain-language explanation and a candidate action from
a small closed set). No `ExtractionProvider`, no `ResourceProvisioner`, and no
`SideEffectExecutor` were needed — this system's only side effect is a `NOTIFICATION`
proposed at authority level 1, which the engine core's own authority gate refuses
automatically, exactly the structural proof the canon's "authority is capped at RECOMMEND
for the entire system" guardrail calls for. No new lifecycle states, transitions,
side-effect kinds, or core engine files were needed: the profile gained two new operating
parameters (`inputStalenessToleranceHours`, `exceptionVarianceThresholdPct`), each linked to
a new client policy, and nothing else outside the new handler, scenario, and test files
changed. Precise cost, across the whole shared engine surface: zero lines, in any of
`lib/model/`, `lib/engine/reducer.ts`, `lib/engine/run.ts`, or `lib/engine/types.ts`.

Cross-system evidence is used, deliberately, through the narrowest possible seam: the
window-closed event's observations are authored fixture data carrying their own
`sourceSystem` label (`accounting-system`, `workflow-store`, `crm`), exactly the same shape
every other system's events already use to represent a read from an external system of
record. No other system's handler, scenario, or engine run is imported, executed, or
otherwise coupled to this one — the narrow-boundary-artifact question the design brief
posed for this pass resolved to "the existing fixture-event pattern is already sufficient,"
not to a new abstraction.

## Lead Rescue wait/resume — this pass

**Prior defect, named precisely.** `WAITING_FOR_REPLY` was genuinely reached but only ever
exited because the next authored fixture event in a scenario happened to carry a later
`occurredAt`. `lr-t14` (`WAITING_FOR_REPLY → NEEDS_HUMAN`, "wait elapsed") was declared in
canon with zero code, event, scenario, or test anywhere. Nothing in the system
autonomously noticed that time had passed — the one stage in Lead Rescue's own loop with no
logic behind it at all, per `docs/FIDELITY_ASSESSMENT.md` section 3.1.

**What changed.** Three new files carry the whole mechanism. `lib/persistence/wait-incident-store.ts`
declares `WaitIncidentRecord` (incident id, system id, correlation id, an `EngineState`
snapshot, and a `revision` for optimistic concurrency — nothing else; `waitStartedAt` is
read out of the snapshot's own `facts`, never duplicated) and a `WaitIncidentStore`
interface with two implementations: `InMemoryWaitIncidentStore` for fast logic tests, and
`FileWaitIncidentStore` — one JSON file, written via a temp-file-then-rename so a killed
process leaves the prior good file rather than a torn one — which is the actual durability
mechanism. `lib/engine/wait-resume.ts` is the bridge: `parkWaitingIncident` persists a
snapshot after an ordinary engine run lands in a waiting state, and `checkWaitIncident`
loads a record, applies exactly one `lead.wait.reevaluated` event against it through
`applyEvent` (the same primitive the reducer already exposed — `reduceScenario` was never
touched), and resolves (deletes) the record only if the handler's own rule actually moved
the lifecycle state. `lib/engine/handlers/lead-rescue.ts` gained one new handler,
`handleWaitReevaluation`, implementing `lr-t14` for real: it compares the re-check event's
`occurredAt` against a `waitStartedAt` fact now written when `WAITING_FOR_REPLY` is first
entered, against a new `replyWaitWindowHours` operating parameter (24 hours, linked to a
new `kestrel-reply-wait-window` client policy) — and, on elapse, proposes the same kind of
`NOTIFICATION` effect every other escalation path in this handler already uses, through the
same authority and idempotency gates.

**The one real clock read in this codebase.** It happens at exactly two network boundaries —
`app/api/lead-rescue/wait-incidents/check/route.ts`'s default path, and the live demo page's
"Check" button — never inside `applyEvent`, `handleWaitReevaluation`, or anywhere in
`lib/engine/`. `occurredAt` arrives as an ordinary parameter, the same discipline every
other event in this portfolio already followed; this pass adds a caller that sometimes
supplies a genuine timestamp instead of an authored one, and changes nothing about the
guarantee itself.

**Falsifying tests, all passing.** `tests/wait-incident-store.test.ts` (20 tests) proves the
store in isolation, including a missing store file, a hand-corrupted record throwing
`MalformedWaitRecordError` rather than returning a wrong answer, and durability across
reconstructing a `FileWaitIncidentStore` pointed at the same path.
`tests/lead-rescue-wait-resume.test.ts` (7 tests) proves the four properties the assessment
named: a check before the deadline leaves the incident untouched with no transition or side
effect; a check after the deadline fires `lr-t14` with the correct decision and a real
`EXECUTED` notification; a `FileWaitIncidentStore` reconstructed after its first instance is
discarded entirely still resumes correctly and reaches the same final state as an
uninterrupted replay of the equivalent scenario; and a duplicate resume — both a sequential
repeat and two genuinely concurrent `Promise.all` calls racing to resolve the same elapsed
incident — never produces a second `ELAPSED` outcome. A sixth scenario,
`reply-window-elapses`, was added to `data/profiles/kestrel/scenarios/lead-rescue.ts` and
runs in the simulator like every other scenario — it proves the deterministic RULE computes
correctly against authored timestamps (the same claim every scenario in this portfolio
makes), which is a different claim from what the resume tests prove, and its own
`demonstrates` copy says so explicitly.

**Maturity reassessed, not assumed.** Lead Rescue's `maturity` moves `SIMULATED →
INTERACTIVE_PROTOTYPE` — the bar `docs/FIDELITY_ASSESSMENT.md` named in advance, cleared and
independently re-verified rather than awarded by that document itself. It remains
explicitly `NOT_LIVE`: no webhook, no real email/CRM provider, no production scheduler
exists, the notification effect is still `executionMode: 'SIMULATED'`, and nothing here
touches a network except the demo's own two route handlers talking to the local filesystem.

**Live UI/commercial proof.** `app/lead-rescue/wait/page.tsx` (a dynamic, never-statically-generated
page — the first in this portfolio that can honestly claim "executed on this request"
without the SSG caveat the simulator pages carry) lets a visitor park a real incident,
watch a real "check now" leave it untouched, then cross the deadline and watch `lr-t14`
fire, the notification execute, and the incident disappear from the waiting list — the
exact follow-up question `docs/FIDELITY_ASSESSMENT.md` flagged as the one a sharp buyer
would ask first ("what's actually checking whether the reply arrived?"), now answerable by
clicking a button instead of by explanation. One control, "Simulate past deadline & check,"
is clearly labelled as the sole demo-only affordance: it supplies a timestamp just past the
deadline instead of the real clock, through the otherwise-identical check path, so the
elapsed branch can be shown without an actual 24-hour wait.

**Reuse opportunities found, deliberately not implemented.** `lr-t22` ("Offer unanswered,"
`BOOKING_READY → NEEDS_HUMAN`) is the identical wait-elapsed shape on a different lifecycle
state within Lead Rescue itself — the smallest, lowest-risk next data point on whether this
mechanism generalizes, before generalizing it to a second system. Client Onboarding's
`BLOCKED` state and its `co-t07`/`co-t09` wait-elapsed transitions, Dormant Pipeline
Recovery's cadence-retry and cooling-off transitions, and Receivables' `PAYMENT_PROMISED`-elapsed
check all share the exact same shape of missing capability the assessment already
identified — none touched this pass, per its own exit condition: stop before generalizing,
and let the next choice come from evidence a second concrete case produces, not from a list
compiled in advance. True multi-process file-locking for `FileWaitIncidentStore` was also
considered and rejected — the revision-based optimistic-concurrency guard already proven in
`tests/lead-rescue-wait-resume.test.ts`'s concurrent-resume test is sufficient for a
single-process prototype, and a lock file's own failure modes (staleness, cleanup on crash)
would be new complexity with no concrete consumer yet.

## Lead Rescue wait/resume reliability closure — this pass

**The falsifying question.** The prior pass's own writeup named the limitation precisely:
`WaitIncidentStore.resolve()`'s revision guard "is not to support true multi-process
locking, which this prototype does not attempt." This pass asked whether that limitation was
merely theoretical or a genuine, provable gap — by tracing the exact execution order inside
`checkWaitIncident` (`lib/engine/wait-resume.ts`) rather than assuming either answer.

**What tracing found.** `checkWaitIncident` builds a brand-new `SideEffectLedger` /
`ExecutionLedger` on every call (`EngineInternals`, freshly constructed, never shared across
calls or persisted) and calls `applyEvent` with it BEFORE ever touching
`WaitIncidentStore.resolve()`. That means: two calls that each load the same unresolved
snapshot independently compute the wait-elapsed notification as `EXECUTED` — each against
its own empty ledger, so neither has any memory of the other — and only AFTER that
computation does the revision guard decide which caller gets to remove the incident record.
The guard was gating record deletion, never effect execution. A throwaway reproduction of
the exact pre-fix code path (two independent calls racing on one `InMemoryWaitIncidentStore`
snapshot) confirmed this empirically: both calls computed `EXECUTED`, not one — the losing
call's `NOT_FOUND` outcome was masking a duplicate computation that had already happened, not
preventing it.

A second, independent gap surfaced from the same trace: `FileWaitIncidentStore.resolve()`'s
own read-check-write is not atomic across two independent OS processes either. Two instances
can both read the same unresolved revision before either writes, and both then believe they
alone resolved it — the classic TOCTOU race a "revision check after the fact" cannot close
on its own, exactly the failure mode the task briefing for this pass named by name.

**The repair.** `lib/persistence/operation-claim-store.ts` is a new, narrowly scoped durable
primitive: an exclusive claim on a side effect's own identity, established BEFORE that
effect's `EXECUTED` status is trusted enough to return or act on, using `fs.open(path, 'wx')`
— POSIX `O_CREAT | O_EXCL` — for the one operation that must be genuinely atomic across
independent processes on a local filesystem. `checkWaitIncident` now claims every side effect
`applyEvent` marked `EXECUTED` before the incident's revision guard ever runs; a caller that
loses the claim (or finds it claimed-but-unconfirmed — the crash-window case) has its own
locally computed `EXECUTED` downgraded to `SUPPRESSED_DUPLICATE` or `OUTCOME_UNKNOWN` before
that result is ever returned to anyone. The claim identity is the effect's own
`idempotencyKey` scoped by the incident record's own `revision` — stable across every
repeated or concurrent check of one parked incident, but distinct across a legitimate
re-park, so a stale claim from before a corrected engine state can never suppress the
corrected cycle's own notification (proven directly: `tests/lead-rescue-wait-resume-concurrency.test.ts`,
case 10b).

**What this honestly does and does not claim.** Nothing here talks to a real notification
provider — `executionMode: 'SIMULATED'` is unchanged, and the guarantee this pass adds is
about SUPPRESSING DUPLICATE AUTOMATIC ATTEMPTS within this system, not about exactly-once
EXTERNAL delivery, which no system without a provider-honoured idempotency key or a
verifiable receipt can honestly claim. A claim that is durably recorded but never confirmed
(the crash window) is surfaced as `UNCERTAIN` and blocks automatic replay permanently, until
a human clears it out of band — this pass does not build that clearing workflow, since doing
so would mean inventing a provider acknowledgement this codebase does not have.

**Falsifying tests, all passing.** `tests/lead-rescue-wait-resume-concurrency.test.ts` (8
tests) proves: two independently constructed runtimes (own `WaitIncidentStore` instance, own
`OperationClaimStore` instance, own engine dependencies, sharing only the files on disk)
racing on the identical durable snapshot never produce two `EXECUTED` notifications; a
precisely traced deterministic interleaving where the loser observes the winner's
claimed-but-unconfirmed record and reports `UNCERTAIN` rather than guessing; a simulated
crash between claiming and confirming that a freshly constructed recovery runtime refuses to
retry automatically, leaving the incident visibly still parked; a confirmed claim that stays
confirmed after the claim store is reconstructed; a hand-corrupted claim record that fails
closed with `MalformedOperationClaimError`; distinct incidents claiming independently; and a
re-parked (still-waiting) incident whose corrected cycle is not suppressed by a stale claim
against the superseded revision. `tests/operation-claim-store.test.ts` (18 tests) proves the
new store's own contract in isolation, including genuine cross-process-style exclusivity
(two independently constructed `FileOperationClaimStore` instances racing to claim the same
operation id) and durability across reconstruction. `tests/lead-rescue-wait-resume.test.ts`
(now 6 tests — the original concurrent-resume case moved into the new file, where it belongs
alongside its stronger replacement) re-verifies every property the prior pass proved is
still intact: too-early, elapsed, restart durability, sequential duplicate resume, missing
incident, malformed incident record.

**Files changed.** One new file (`lib/persistence/operation-claim-store.ts`); one narrowly
extended file (`lib/engine/wait-resume.ts` — the claim gate, plus a revision-scoped claim-id
helper and an effect-downgrade helper, no change to its exported `WaitResumeDeps` shape);
`lib/engine/lead-rescue-wait-runtime.ts` and the `check` route threading the new store and an
opaque per-process `runtimeId` through; zero changes to `lib/engine/reducer.ts`,
`lib/engine/run.ts`, `lib/engine/handlers/lead-rescue.ts`, `lib/persistence/wait-incident-store.ts`,
or any other system's code. The reducer's purity is unchanged — no clock, no I/O, no
randomness inside `applyEvent`, still.

## What is REAL

Real in the sense of *actually executing code*, not *connected to the outside world*.
Nothing here touches a network — with one narrow exception, noted below, that itself never
leaves the local filesystem.

Everything already true of Lead Rescue, Dormant Pipeline Recovery, and Call-to-Proposal —
the lifecycle state machine, the idempotency ledger, the event ledger, the authority gate,
the policy gate, deterministic decisions, schema validation of all canon, profile
consistency — is unchanged and still holds, and now also holds for Client Onboarding,
Receivables / Invoice Recovery, and Owner Revenue Intelligence, all six running through the
same reducer and the same two-phase runner.

New this pass (Lead Rescue wait/resume):

- **A waiting incident now survives past a single call.** `WaitIncidentRecord`, persisted by
  `FileWaitIncidentStore` to a real JSON file, is the first state in this portfolio that
  outlives the `reduceScenario`/`runScenario` call that produced it — verified by
  reconstructing the store object entirely between parking and resuming.
- **A genuine, independently-triggerable check.** `checkWaitIncident` reads a real elapsed
  time (deadline vs. a caller-supplied `occurredAt`) rather than an authored fixture
  ordering, and the elapsed/not-elapsed judgment itself lives in exactly one place —
  `handleWaitReevaluation` — never duplicated into the persistence layer that orchestrates
  around it.
- **Duplicate and racing resumes are safe by construction.** `WaitIncidentStore.resolve`'s
  revision guard, not a new deduplication concept, is what makes two genuinely concurrent
  `checkWaitIncident` calls on the same elapsed incident produce exactly one `ELAPSED` and
  one refusal — proven with real `Promise.all` concurrency, not a sequential stand-in for it.
- **A malformed persisted record fails loudly, not silently.** A hand-corrupted record
  throws `MalformedWaitRecordError` naming what was wrong, rather than being coerced into a
  plausible-looking but wrong `WaitIncidentRecord`.
- **The wait-elapsed notification cannot execute twice across independent runtimes, this
  pass.** A durable, cross-process-exclusive claim (`lib/persistence/operation-claim-store.ts`)
  gates every side effect `applyEvent` marks `EXECUTED` before `checkWaitIncident` trusts or
  returns that status — closing the gap the prior pass's own writeup named but left open:
  its in-memory ledgers gave zero protection across independent calls, and the revision guard
  alone ran too late to prevent (only to partially mask) a duplicate execution.

New in the Owner Revenue Intelligence pass (prior), retained for continuity:

- **A freshness gate that genuinely blocks, not annotates.** An input older than the
  configured tolerance halts the analysis at `STALE_DATA_FLAGGED` before any variance is
  computed, and a refresh that still cannot establish freshness resolves to
  `INSUFFICIENT_EVIDENCE` rather than concluding on a partial read — verified directly by
  driving exactly that sequence.
- **A genuine per-metric direction check, not a same-sign shortcut.** Corroboration checks
  whether an independent source moves in *its own* declared worsening direction, not
  whether its raw sign matches the primary metric's — the proving scenario's two metrics
  move in opposite raw directions while genuinely agreeing, which a same-sign check would
  have missed.
- **A confidentiality gate that excludes evidence before it is ever compared.** A candidate
  corroborating source flagged as requiring cross-client aggregation is filtered out ahead
  of the direction check, citing the policy the profile had already declared for exactly
  this system, and is recorded at authority level 2 rather than silently used.
- **The authority ceiling enforced structurally, not by handler discipline.** This system's
  one proposed side effect — notifying the owner — is authority level 1, and the engine
  core's own authority gate refuses it automatically. No code in this handler decides not
  to notify; it cannot notify, because nothing above `RECOMMEND` is available to it.
- **Full transition coverage, a first for this portfolio.** All 14 declared transitions are
  exercised, most through direct tests rather than a full scenario — the same "smallest
  necessary" discipline every other system's gap list reflects, applied until nothing was
  left declared-but-unexercised.

New in the Client Onboarding pass (prior), retained for continuity:

- **A genuine precedence gate.** `resolveAuthoritativeValue()` decides what a field's known
  value actually is when more than one source asserts it: a higher-ranked source always
  wins outright, a lower-ranked source can never silently overwrite a higher one, and two
  sources at the same rank that disagree come back as an explicit, unresolved `CONFLICT` —
  never picked by recency, never picked by an AI judgment. Tested directly and through a
  dedicated scenario-shaped test that drives the real contradiction through the handler and
  asserts it reaches `NEEDS_HUMAN` with the conflicting field named.
- **A genuine information-gap model.** `requirementStatus()` classifies every onboarding
  requirement as `KNOWN`, `MISSING`, `CONFLICTED`, or — unconditionally, regardless of any
  value on file — `REQUIRES_SECURE_COLLECTION` for anything sensitive. The
  signed-client-to-first-value scenario's gap-computation step names every field it reused
  without asking, by field name, and the metric this makes checkable
  (`co-repeat-requests`) is asserted directly against the timeline.
- **A genuine scope-drift gate.** `admitOnboardingTask()` refuses any derived onboarding
  task whose necessity implies a service the signed engagement did not buy — the same shape
  as Call-to-Proposal's `admitClaim`, applied to a proposed obligation instead of a proposal
  claim. It runs for real over every task in each scenario's derived plan, and is also
  tested directly against a synthetic task implying an unbought service line.
- **Genuine resource reconciliation, not a scripted answer.** `FixtureResourceProvisioner`
  holds a plain in-memory map standing in for a real provider's current state and compares
  against it for real: a first `ensure()` creates, a second on the same identity with the
  same desired-state fingerprint reports `ALREADY_EXISTS_MATCHING`, and a different
  fingerprint at the same identity reports `EXISTS_DIFFERENT` — a genuine string comparison,
  not a fixture that recites the intended outcome. The `duplicate-provisioning-reconciled`
  scenario redelivers the access-confirmation event and shows this converging for real,
  while the engine core *independently* refuses the redelivered event's lifecycle
  transition for an unrelated reason (no rule permits it from the state already reached) —
  two guarantees holding simultaneously with no explicit "is this a duplicate?" check
  anywhere in the handler.
- **A secret screen with a real rejection test.** `screenForSecretLikeContent()` refuses any
  supplied value matching a secret-shaped pattern, including the reserved
  `TEST_ONLY_SECRET_SENTINEL_DO_NOT_USE` sentinel. The direct test submits it through an
  ordinary intake field and asserts it is absent from both final state and every rendered
  decision/summary string in the timeline — not merely that a flag was set.
- **The executable path caught two real defects during this pass, before any scenario ran
  clean.** The task model's dependency graph initially had no code path that ever marked a
  resource-creation or access-confirmation task `COMPLETE`, which would have left the
  first-value milestone permanently blocked; and the completion gate initially checked for
  the literal status `READY`, which a Kestrel-owned task waiting on Kestrel never reaches by
  design. Both were caught by the scenario failing to reach its declared final state on the
  first real run, not by inspection — the same falsification value Lead Rescue's original
  build derived from the engine rejecting an undeclared transition.

## What is SIMULATED

Unchanged in kind from the first three systems:

- **Every side effect**, including resource provisioning. `executionMode: 'SIMULATED'`
  throughout; nothing ever leaves the process.
- **The resource provisioner and the business.** `FixtureResourceProvisioner` reconciles
  genuinely, but against an in-memory map, not a real workspace, folder, or task-tracking
  product. Bramwell Data, its stated systems (AWS, Okta, GitHub Enterprise), and every other
  detail are invented, continuing Call-to-Proposal's own fixture economics rather than
  starting a new one.
- **Almost all timestamps.** The reducer itself still never reads a clock — that invariant
  is unchanged and unchangeable by design. But it is no longer true that every `occurredAt`
  in this portfolio is authored in a fixture: the Lead Rescue wait/resume check route
  (`app/api/lead-rescue/wait-incidents/check/route.ts`) and its demo page read the real
  server clock once, at the network boundary, and pass it in as an ordinary event field,
  same as any other caller. Every SSG-prerendered scenario page, including all six of Lead
  Rescue's own scenarios, still uses exclusively authored fixture timestamps.
- **The declared AI-judgment surfaces are not exercised this pass.** The canon lists two
  `aiJudgments` — interpreting free-text handover notes, and interpreting whether a customer
  reply supplies a requested item — but both scenarios use schema-validated structured
  intake rather than free text, so neither `DecisionProvider` nor `ExtractionProvider` is
  invoked anywhere in this system. Recorded honestly in "Known fidelity gaps," not glossed
  over: the canon claims more interpretive surface than this pass's implementation exercises.

## Architecture reuse: what worked without changes

- **The Kestrel profile — zero schema changes.** `onboardingRequirements` (including which
  items are `sensitive`) and the `kestrel-credential-handling` policy were already declared
  from the system's original CONCEPT-stage design pass. Confirmed by actually building the
  handler against them, not assumed in advance.
- **`lib/model/system.ts`, `lib/model/profile.ts`, `lib/model/provenance.ts` — zero changes.**
  Only `lib/model/runtime.ts` gained anything, and only one line of substance (below).
- **`EngineState.facts` — genuinely reusable, unmodified.** The signed handoff, the
  known-values map, recorded conflicts, secure-access requirements, and the onboarding task
  list are each one JSON-serialised fact, exactly the pattern Call-to-Proposal's claims and
  proposal artifact already established. No new engine-level state shape was needed for a
  fourth, materially different kind of business record.
- **The `Simulator` and badge components — one forced, one-line change.** Adding
  `CONFLICT_DETECTED` to `SideEffectStatus` required one new entry in `badges.tsx`'s
  `EFFECT_STYLE` record, because it is typed as `Record<SideEffectStatus, CSSProperties>` —
  the compiler itself is what prevents this enum from silently drifting out of sync with its
  renderer. Nothing else in either component changed.
- **`app/page.tsx`, `app/systems/[slug]/page.tsx` — zero changes.** Adding the system, its
  handlers, its profile, and its scenarios to `RUNNABLE_SYSTEMS` in `lib/engine/registry.ts`
  was sufficient for the portfolio index, the dossier, and the simulator to pick it up,
  fourth time running.
- **Owner Revenue Intelligence — the smallest cost of any system built so far.** Zero new
  lifecycle states, transitions, side-effect kinds, ports, or core engine files. The profile
  gained two new operating parameters and their linked policies; everything else lived
  entirely in the new handler, scenario, and test files. Even `RUNNABLE_SYSTEMS` needed only
  the same four-line entry every prior system's registration already established, with no
  `sendOutcomes`, `verifyOutcomes`, or `extractions` fields required at all.

## What did not generalize, and whether provisioning needed a third port

It did, genuinely — and the reasoning is the interesting part, not just the conclusion.
`SideEffectExecutor.attemptSend`'s contract defaults to *unsafe to retry*: an uncertain
outcome blocks a second attempt in the engine core until something independently proves the
first one did not land, because sending a message twice is a real, irreversible,
customer-facing consequence. Durable resource provisioning asks the opposite question by
design: `ensure()` is supposed to be safe to call again, and its whole job is to compare a
business identity's desired state against what may already exist and converge — a
send/verify pair has no field for "does the existing state match," because a send was never
asking that question. Forcing provisioning through the existing port would have meant either
weakening a retry-safety guarantee that genuinely matters for sends, or bolting an
identity/state-comparison concept onto a contract with no room for it. Two different shapes
of "did the side effect happen" earned two different ports, the same finding
`lib/ports/extraction-provider.ts` produced for bounded judgment one pass ago.

The new `lib/ports/resource-provisioner.ts` follows that precedent's shape exactly — one
contract, one fixture-backed implementation, room for exactly one live adapter later — and
resolves in the same kind of pre-pass phase the other two ports already use. Unlike the
other two, its resolved outcome had to reach the handler through **two channels at once**,
not one: `HandlerContext.provisions` (so the handler can decide its *own* next lifecycle
transition from a genuine CREATED/MATCHING/DIFFERENT result) and
`ExecutionOutcomes.provision` (so `resolveEffect` can still record the technical/status
detail on the proposed side effect, exactly like SEND/VERIFY do). That dual-channel
requirement is itself a finding: extractions only ever needed the first channel, sends and
verifies only ever needed the second — provisioning is the first shape that genuinely needs
both, because it is simultaneously a side effect or engine core mode.

Precise cost, across the whole shared engine surface:

| File | Added | Removed |
| --- | --- | --- |
| `lib/model/runtime.ts` | 6 | 0 |
| `lib/engine/types.ts` | 20 | 0 |
| `lib/engine/reducer.ts` | 120 | 3 |
| `lib/engine/run.ts` | 66 | 4 |
| **Total** | **212** | **7** |

Every one of the 7 removed lines was a call-site line replaced by a multi-line one — never a
behavioural change. All 240 pre-existing tests still pass unmodified in behaviour; the only
edits any of them needed were four literal `provision: new Map()` additions inside test
fixtures, forced by `ExecutionOutcomes` gaining a third required field, not by any change to
what those tests assert. `resolveProvisionEffect` deliberately never calls
`internals.effects.claim()` — the single-shot idempotency ledger that exists precisely
because a second SEND attempt is unsafe by default would be the wrong tool for an operation
that is safe to repeat by construction, and a direct `tests/engine.test.ts` case asserts the
ledger is never touched by a PROVISION effect at all.

Everything else stayed exactly as domain-specific as the first three systems' own handlers:

- **The handoff contract (`SignedEngagementHandoff`), the precedence model (`KnownValue`,
  `resolveAuthoritativeValue`), the task model (`OnboardingTask`), and the secure-access
  model (`SecureAccessRequirement`) are entirely local to
  `lib/engine/handlers/client-onboarding.ts`.** Not lifted into `lib/model/`, deliberately —
  exactly one system consumes the handoff contract today, and designing a shared
  cross-system envelope now would be guessing at a shape a fifth or sixth system might need.
  The coupling to Call-to-Proposal's own Bramwell scenario is matching fixture data, not a
  code import; `client-onboarding.ts` imports nothing from `call-to-proposal.ts`. As of this
  pass that fixture data is provably derived, not merely narrated to match — see
  "Cross-system boundary closure" above and `lib/engine/handoffs/proposal-to-onboarding-handoff.ts`,
  the one file allowed to know about both systems' shapes.
- **Payload-schema duplication continues**, matching the existing three handlers' own choice
  to stay dependency-light on engine orchestration.
- **Four transitions remain declared but unexercised**: the two wait-elapsed edges
  (`co-t07`, `co-t09`) have no timeout-driving event, and the `BLOCKED` state itself —
  reached only via `co-t13`/left only via `co-t14`/`co-t15` — is never entered by either
  scenario. The same honestly-scoped kind of gap Dormant Pipeline Recovery's cadence-retry
  loop and Call-to-Proposal's revision cycle left behind; see "Known fidelity gaps."

## Verification

```
npm run verify     # typecheck + lint + 387 tests
npm run build      # 27 pages prerender or route; the engine executes at build/request time
npm run docs       # regenerate canon from the model
```

All passing as of this pass, including `tests/wait-incident-store.test.ts` (20 tests),
`tests/lead-rescue-wait-resume.test.ts` (6 tests, re-verifying the prior pass's properties),
`tests/operation-claim-store.test.ts` (18 tests, new this pass), and
`tests/lead-rescue-wait-resume-concurrency.test.ts` (8 tests, new this pass — the
cross-runtime falsification and its repair). `npm run build` still reports two routes as `ƒ`
(server-rendered on demand) rather than prerendered — `/api/lead-rescue/wait-incidents` and
its `/check` sibling — unchanged from the prior pass; every other route remains `○` static or
`●` SSG. `npm run docs` was not re-run this pass: nothing under `data/` changed, and
`tests/docs.test.ts` (part of the 387) confirms the generated canon is still current against
the unchanged model.

Visual inspection performed on the portfolio index, the Owner Revenue Intelligence dossier,
and both new scenario pages — the run-summary panel's existing generic counters render
correctly with no new UI component: scenario A (`cash-collection-quietly-worsens`) shows 9 steps, 8
transitions accepted, 0 rejected, 0 side effects executed, 1 blocked by policy (the
notification, at authority level 1); scenario B (`stale-concentration-read-dismissed`) shows 4
steps, 4
transitions accepted (stale flag, refresh, and dismissal across two events), 0 side
effects, matching the "ordinary variation is left alone" claim exactly.

## Known fidelity gaps

1. **One Lead Rescue, three Dormant Pipeline Recovery, and two Call-to-Proposal transitions
   remain declared but unexercised.** `lr-t14` (wait elapsed) is closed by this pass —
   genuinely, via persisted resume, not merely a scenario reaching it. `lr-t22` ("Offer
   unanswered," `BOOKING_READY → NEEDS_HUMAN`) is the identical wait-elapsed shape on a
   different lifecycle state and is the named reuse opportunity this pass deliberately left
   for the next one, not a gap this pass missed. Dormant Pipeline Recovery and
   Call-to-Proposal are unchanged by this pass.
2. **Four Client Onboarding transitions are declared but unexercised**: `co-t07`/`co-t09`
   (wait-elapsed timeouts) have no driving event, and `BLOCKED` itself — `co-t13` in,
   `co-t14`/`co-t15` out — is never reached by either scenario. Checked twice now (the
   boundary-closure pass and the Receivables pass) for a natural fit and found none both
   times — every corruption path exercised so far resolves to a validation refusal,
   `NEEDS_HUMAN`, or (in Receivables) `ESCALATED`, never a genuine "waiting on something
   outside the system's control" condition — so this remains open rather than being forced
   a third time.
3. **One of Client Onboarding's two declared AI-judgment surfaces is not exercised**
   (interpreting whether a customer reply supplies a requested item); the other was narrowed
   to state explicitly that it does not apply to a structured, translated handoff.
4. **Several Receivables transitions and both human-only actions beyond dispute resolution
   are declared but not exercised through a full scenario**: `PAYMENT_PLAN` and
   `WRITE_OFF_REVIEW`/`WRITTEN_OFF` have no driving event yet; dispute-timeout-to-`ESCALATED`
   (`rr-t29`) is undriven; and `DUE_SOON`/`PAST_DUE_61_90` accepting a dispute reply and
   `PAST_DUE_90_PLUS` accepting neither a dispute nor a promise reply (a real, minor canon
   asymmetry left as-is rather than generalising without a scenario to justify it) are
   untested directly.
5. **Two of Owner Revenue Intelligence's five declared failure modes remain pending**:
   `or-fm-metric-ambiguity` (the same metric name resolving to different figures in
   different systems) and `or-fm-alert-fatigue` (decision rate trending toward zero across
   consecutive windows) have no driving scenario or direct test — genuinely different
   shapes of gap from anything the other five systems left open, and left honestly recorded
   rather than forced. Only one of the four declared recommendation classes
   (`INVESTIGATE_COLLECTION_PROCESS`) is ever returned by an authored fixture; the other
   three (`REVIEW_PRICING_OR_TERMS`, `ESCALATE_CONCENTRATION_RISK`, `MONITOR_ONLY`) are
   declared in the closed set but never exercised.
6. **The scope-drift and precedence gates cover one field pattern each** (Client Onboarding);
   the dispute/promise classification and date-extraction judgments are proven on one
   ambiguous-reply shape each (Receivables); the variance/corroboration gates are proven on
   one metric pattern each (Owner Revenue Intelligence). A production system would need more
   synthetic variations to be confident across each system's full requirement catalog.
7. **No reliability/evidence view, no true step-execute simulator, and — outside Lead
   Rescue's wait/resume slice — no persistence.** Otherwise unchanged from every prior pass;
   still why none of the six running systems is close to `PARTIALLY_LIVE`.
8. **The masthead's own maturity rollup (`app/layout.tsx`) has no bucket for
   `INTERACTIVE_PROTOTYPE`.** Verified directly in the browser: it now reads "6 systems · 5
   simulated · 0 concept · 0 live" — Lead Rescue's promotion is invisible there, undercounted
   rather than overclaimed, since the counter only tests for exact `SIMULATED`/`CONCEPT`
   matches plus `isLive()`. Not fixed this pass — a shared layout component is outside a
   Lead Rescue-scoped work package, and the direction of the error (understating advancement)
   does not violate "nothing simulated may read as live."
9. **An `UNCERTAIN` operation claim has no clearing workflow.** This pass's reliability
   closure correctly refuses to auto-retry a claimed-but-unconfirmed notification and blocks
   the incident from resolving — but nothing in this pass lets an operator durably mark that
   claim resolved once they've established what actually happened out of band. Building that
   would mean either a real provider acknowledgement (excluded this pass — no live
   notification provider exists to acknowledge anything) or an unverified manual override
   that could just as easily paper over a genuine duplicate as fix a false positive. Left
   open deliberately rather than forced: the `OperationClaimStore` interface has room for it
   (`confirm()` already exists; a symmetric manual `abandon()`/override would be additive,
   not a redesign), but no consumer of this demo-scale prototype needs it yet.

## Single recommended next fidelity gap

**`lr-t22` ("Offer unanswered"), using the exact wait/resume mechanism this pass built,
with zero new architecture.** `docs/FIDELITY_ASSESSMENT.md` named `WAITING_FOR_REPLY`'s
wait/resume gap as the highest-leverage next step; two passes closed it — first genuine
persistence and resume, then (this pass) the durable, cross-runtime-safe effect-execution
guarantee that persistence alone did not provide. `lr-t22` is the identical shape — a
lifecycle state waiting for an external response, no logic anywhere that notices time has
passed — on `BOOKING_READY` instead of `WAITING_FOR_REPLY`. Closing it would mean,
concretely: a second `waitStartedAt`-equivalent fact at the point an offer is made, a second
operating parameter for the response window (already declared in canon as a configured
window, not yet in `profile.operatingParameters`), and a second handler branch following
`handleWaitReevaluation`'s exact shape — no change to `WaitIncidentStore`, `checkWaitIncident`,
or `OperationClaimStore`: `checkWaitIncident`'s claim gate already loops over every side
effect a handler proposes, generically, so `lr-t22`'s own notification would inherit the same
cross-runtime protection this pass built, at zero additional cost.

**Why this outranks generalising to a second system.** Client Onboarding's `BLOCKED` state,
Dormant Pipeline Recovery's cadence-retry loop, and Receivables' promise-elapsed check all
share the same missing-capability shape and were all named in
`docs/FIDELITY_ASSESSMENT.md` as reuse candidates — but this pass proved the mechanism works
on exactly one lifecycle transition in one system. Reaching for a second SYSTEM next would
be generalising from a sample size of one, precisely the "built because production systems
eventually need it" temptation the brief warns against.
`docs/FIDELITY_ASSESSMENT.md`'s own exit condition says to wait for independent
confirmation, on a second concrete case, that the same shape of need recurs — `lr-t22`,
still inside Lead Rescue, is exactly that second concrete case, at the lowest possible risk
and cost before any cross-system generalisation is considered.

**Do not begin implementing `lr-t22` from this document.** Recorded here as the evidence-based
next candidate, the same discipline every prior pass's "next fidelity gap" section applied —
not as a plan to execute without its own re-verification.
