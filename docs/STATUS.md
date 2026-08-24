# Status

**As of 2026-08-23 · lr-t22 ("Offer unanswered") implemented — a second, materially
different Lead Rescue waiting condition (BOOKING_READY) now shares the exact durable
wait/resume, operation-claim, and claim-gated execution runtime lr-t14 (WAITING_FOR_REPLY)
already proved out, with zero new persistence, claim, or orchestration architecture**

## Portfolio maturity

**INTERACTIVE PROTOTYPE** — the application runs, all six systems are open and inspectable,
and all six execute real operating logic: Lead Rescue against six scenarios, Dormant
Pipeline Recovery against two, Call-to-Proposal Revenue Agent against two, Client
Onboarding Operator against two, Receivables / Invoice Recovery Agent against two, and
Owner Revenue Intelligence Agent against two, plus one smaller executable path exercising
a third declared transition pair in Call-to-Proposal.

| # | System | Maturity | Runs? |
| --- | --- | --- | --- |
| 1 | Lead Rescue | `INTERACTIVE_PROTOTYPE` | Yes — 7 scenarios execute end to end, plus a live wait/resume demo covering both waiting categories |
| 2 | Dormant Pipeline Recovery | `SIMULATED` | Yes — 2 scenarios execute end to end |
| 3 | Call-to-Proposal Revenue Agent | `SIMULATED` | Yes — 2 scenarios execute end to end |
| 4 | Client Onboarding Operator | `SIMULATED` | Yes — 2 scenarios execute end to end |
| 5 | Receivables / Invoice Recovery Agent | `SIMULATED` | Yes — 2 scenarios execute end to end |
| 6 | Owner Revenue Intelligence Agent | `SIMULATED` | Yes — 2 scenarios execute end to end |

**The horizontal portfolio finished four passes ago; the vertical climb into Lead Rescue
continues.** Three prior passes built and hardened the wait/resume mechanism entirely on
`WAITING_FOR_REPLY`/lr-t14: genuine persistence, a durable cross-runtime claim, and a claim
gate proven to guard the actual observable execution boundary, not merely a status label.
Every one of those passes deliberately deferred the question this pass answers: does that
machinery generalise to a SECOND, materially different waiting condition, or is it secretly
shaped around lr-t14's own specifics? `lr-t22` ("Offer unanswered," `BOOKING_READY ->
NEEDS_HUMAN`) was the evidence-based next candidate every prior pass's own report named for
exactly this reason. This pass implements it and finds the answer is genuinely yes: zero
changes to `WaitIncidentStore`, `OperationClaimStore`, or `checkWaitIncident`'s claim-gated
execution ordering were needed. The only new code is the lr-t22 business rule itself (a
handler-level sibling of lr-t14's own rule) and a lifecycle-state dispatch in
`handleWaitReevaluation` that decides which rule applies — the one narrow distinction two
real, concurrently-supported waiting categories actually demanded. See "lr-t22 implemented —
this pass" below. `maturity` does not change this pass: still `INTERACTIVE_PROTOTYPE`, still
`NOT_LIVE`.

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

## Lead Rescue wait/resume execution-boundary closure — this pass

**The question the prior pass's own report left ambiguous.** Its completion report said the
durable claim is acquired "after `applyEvent` computes its candidate result but before that
result is trusted" — true, but silent on whether anything OBSERVABLE happens before that
point. This pass answered it by instrumentation, not inference: a test-only recording
`SideEffectExecutor` (`tests/lead-rescue-wait-resume-execution-boundary.test.ts`) wired into
the exact point a live send would occur, counting real invocations independently of whatever
status label `checkWaitIncident` later returns.

**What tracing and instrumentation found.** `resolveEffect` (`lib/engine/reducer.ts`) has two
paths for a side effect that clears the authority/policy gate: an execution-TRACKED `SEND`
path that reads an already-resolved outcome a pre-pass fetched from a real
`SideEffectExecutor`, and the plain path Lead Rescue's wait-elapsed notification actually
takes (`proposed.execution === undefined`) — a claim against a per-call, in-memory
`SideEffectLedger`, then an unconditional `{status: 'EXECUTED'}`. That second path performs
no I/O and calls no executor; `EXECUTED` from it is, and was always, a PURE PLAN — "the
deterministic core authorized this" — never itself an action. The recording sink confirms
this directly: with no executor configured, nothing is ever invoked, by construction.

**The repair — an observable boundary that only exists behind the claim.**
`WaitResumeDeps.executor`, added this pass, is an OPTIONAL `SideEffectExecutor` — the SAME
port every other live-send path in this codebase already uses, not a new abstraction. When
absent (unchanged default), the plan remains the whole honest story. When present, the claim
loop in `checkWaitIncident` invokes it exactly once per EXECUTED effect, and ONLY inside the
branch already guarded by a successful claim — structurally unreachable any earlier. Every
recorded invocation in the falsifying tests carries proof of this ordering: the claim store
already shows `CLAIMED` at the exact moment the sink is called, in every single case, across
two independently constructed racing runtimes, a simulated crash immediately after claiming
(sink never invoked), and a simulated crash immediately after invoking but before confirming
(sink invoked exactly once, a fresh recovery runtime invokes it zero further times). This
required no changes to `applyEvent`, `resolveEffect`, `run.ts`'s pre-pass, or the Lead Rescue
handler — the existing two-phase (async I/O, then pure reduce) architecture already had the
right shape; this pass added one more orchestration-only step after the plan, not inside it.
The live demo (`lib/engine/lead-rescue-wait-runtime.ts`) now wires a small, honestly labelled
`AlwaysSucceedsNotificationExecutor` — `SIMULATED`, deterministic, no provider — so this
ordering is exercised by the running application, not only by tests; verified directly in the
browser, with the resulting `.data/lead-rescue-operation-claims/*.json` record showing
`status: "CONFIRMED"` only after a genuine `attemptSend` round trip.

**A second, independently real defect: revision-reset identity collisions.** The prior pass's
own report named the risk without closing it: `WaitIncidentStore.park()` computed `revision`
from the ACTIVE record alone, so a fully resolved-and-deleted incident's revision counter
silently reset. A genuinely new second wait cycle for the SAME `incidentId` — legitimate;
`park()` has always permitted re-parking — could then be assigned the exact same
`${incidentId, revision}` pair an earlier, already-CONFIRMED cycle used, and the claim store
would treat the new cycle's notification as an already-completed duplicate, suppressing it
forever. Falsified empirically before repair: reverting only `wait-incident-store.ts` and
re-running the new tests produced 6 failures across the store's own unit tests and the
full-cycle integration test, all showing revision `1` reused where a fresh cycle needed a new
one.

**The repair.** Both `WaitIncidentStore` implementations now persist a revision high-water
mark PER incidentId that survives `resolve()` — a `Map` for the in-memory store, a sibling
JSON file (`{filePath}.revisions.json`, same gitignored `.data/` scope, same temp-then-rename
durability) for the file-backed one, deliberately kept separate from the main incidents file
so `load()`/`listWaiting()`'s existing per-entry schema parsing needed no carve-out. `park()`
reserves the next revision durably FIRST, then writes the incident record — a crash between
the two only burns a revision number (safe: nothing claimed it), never reuses one (unsafe).
`revision`'s existing role as the `resolve()` concurrency token, and as the operation-claim
identity's revision suffix, is completely unchanged — this is a correctness fix to how
`revision` is COMPUTED, not a new field, a new concept, or a change to any consumer.

**Falsifying tests, all passing.** `tests/lead-rescue-wait-resume-execution-boundary.test.ts`
(7 tests, new this pass) proves the execution-boundary ordering: cross-runtime racing with
the sink invoked at most once; the pre-claim crash window demonstrated unreachable; both
post-claim crash windows (before invoke, after invoke) recovering to `UNCERTAIN` without a
second invocation; an authority-blocked effect never reaching the sink at all; confirmed
completion surviving full reconstruction; and the honest no-executor default. Deliberately
verified as genuinely falsifying, not vacuous: temporarily reordering the claim and the
invoke inside `checkWaitIncident` made 5 of these 7 tests fail, each showing the sink invoked
more than once or before a claim existed — confirmed, then reverted.
`tests/wait-incident-store.test.ts` gained 3 tests proving the revision high-water mark
survives resolve/delete/re-park and reconstruction, each empirically confirmed to fail
against the pre-fix store (5 failures across both store implementations).
`tests/lead-rescue-wait-resume-concurrency.test.ts` gained one integration-level test (10c)
driving the full resolve/delete/re-park cycle through the real `checkWaitIncident`
orchestration path, reusing the exact `waitStartedAt` and correlationId-construction pattern
the real application already reuses — not an artificially varied stand-in — and confirmed to
fail against the pre-fix store as well.

**What this honestly does and does not claim.** The executor added this pass is still
`SIMULATED` — `AlwaysSucceedsNotificationExecutor` invokes nothing external and always
reports success; this pass proves the ARCHITECTURE correctly gates whatever eventually sits
behind that port, not that a real provider now exists. A definite, confirmed-clean failure
(`FAILED_BEFORE_EFFECT`/`RATE_LIMITED`) is treated identically to a genuinely uncertain one —
conservative by choice: this build has no independent verification channel to trust a clean
failure report over a hopeful retry, so both block automatic replay rather than risk a second
unprotected send. A faster, more available path for provably-safe retries is a reasonable
future addition, not a gap this pass leaves silently unaddressed.

**Files changed.** `lib/persistence/wait-incident-store.ts` (revision high-water mark, both
implementations); `lib/engine/wait-resume.ts` (the executor seam and invoke-then-confirm
step, additive to the existing claim loop); `lib/engine/lead-rescue-wait-runtime.ts` (the
demo's `AlwaysSucceedsNotificationExecutor`). Zero changes to `lib/engine/reducer.ts`,
`lib/engine/run.ts`, `lib/engine/handlers/lead-rescue.ts`, `lib/persistence/operation-claim-store.ts`,
or any other system. One narrow UI addition: `app/lead-rescue/wait/page.tsx`'s existing raw
JSON result panel already surfaces every new field with no code change; no further UI edit
was needed or made this pass.

## lr-t22 implemented — this pass

**The canonical contract, read before anything was written.** `data/systems/lead-rescue.ts`
declares `lr-t22` precisely: `from: 'BOOKING_READY'`, `to: 'NEEDS_HUMAN'`, trigger "Offer
unanswered," mechanism `DETERMINISTIC_RULE`, guard "The offered next step went unanswered
beyond the configured window," authority 2 — the exact sibling shape of `lr-t14` on a
different lifecycle state, both destined for `NEEDS_HUMAN`. `BOOKING_READY` itself
("Enough is known to offer a next commercial step") is reached two ways already live in the
handler: `lr-t10` (a qualified, complete enquiry, straight from classification) and `lr-t16`
(a reply that supplies every previously missing field) — both DETERMINISTIC_RULE, both
already firing a "notify the named owner" `NOTIFICATION` effect the moment `BOOKING_READY`
is entered. Neither path recorded WHEN that happened; that gap, not the transition itself,
is what this pass closed. `lr-fm-approval-timeout` (a declared, `Pending`, unrelated failure
mode about un-actioned human review generally, terminal state `ESCALATED`) was checked and
correctly left alone — a different failure shape from lr-t22's own.

**A real, previously-unfilled canon parameter, not an invented one.** Canon left "the
configured window" as an open value, exactly the same shape `kestrel-reply-wait-window`
originally filled for `lr-t14` before any wait/resume pass existed. `data/profiles/kestrel/profile.ts`
gains `kestrel-booking-offer-window` (a new `CLIENT_POLICY`, explicitly documented as newly
introduced rather than derived from any prior source) and `bookingOfferWindowHours: 48` — two
business days, longer than the one-day reply-wait window because confirming a proposed next
step plausibly requires checking a calendar. Following this repository's own established
precedent (`replyWaitWindowHours` itself was added the same way, without a
`CANON_DIVERGENCES.md` entry, since that file records divergences from the ORIGINAL BRIEF,
not elaborations of a canon-declared-but-intentionally-open parameter), no
`CANON_DIVERGENCES.md` entry was added here either — the distinction between established and
newly introduced policy is instead documented directly on the policy's own `appliesTo` field
and here.

**The one narrow distinction two real waiting categories actually demanded.**
`WaitIncidentStore`, `OperationClaimStore`, and `checkWaitIncident`'s claim-gated execution
ordering are completely unchanged — not because lr-t22 was forced to fit them, but because
they were never shaped around lr-t14's specifics in the first place: `checkWaitIncident`
already treats "which effects did the handler propose" and "did the lifecycle state move" as
answers it reads FROM the handler, never questions it re-derives itself. The one genuine
distinction needed lives entirely inside the handler: `handleWaitReevaluation` is now a
three-way dispatch on `state.lifecycleState` — `WAITING_FOR_REPLY` to the renamed
`handleReplyWaitReevaluation` (lr-t14, byte-identical to before), `BOOKING_READY` to the new
`handleOfferWaitReevaluation` (lr-t22), anything else to a shared "no recognised waiting
condition" no-op. `state.lifecycleState` is already the authoritative, engine-tracked
discriminant — no new field, flag, or event type was needed to tell the two apart. A second,
narrowly scoped fact, `bookingReadyAt` (written at both `BOOKING_READY` entry points,
mirroring `waitStartedAt` exactly), was needed because `lr-t14` and `lr-t22` genuinely need
DIFFERENT start-of-wait evidence — reusing `waitStartedAt` would have meant a stale value
from one category leaking into the other's window computation. Both new tests proving this
matters (`tests/lead-rescue-offer-wait.test.ts`, cases 15a/15b) construct exactly that
adversarial leak — a `BOOKING_READY` record carrying a stray, already-elapsed
`waitStartedAt`, and vice versa — and confirm each category's rule reads only its own fact.

**A second event type was deliberately NOT added.** Both categories raise the identical
`lead.wait.reevaluated` event type. A genuinely third, materially different waiting
condition would be the first real signal that a shared event type stops being the right
shape; two is not that signal, and splitting the event type now — before a third case
exists to justify it — would be exactly the speculative generalisation this pass's brief
warns against.

**Falsifying tests, all written before implementation and confirmed failing for the right
reason first.** `tests/lead-rescue.test.ts`'s scenario-final-state loop caught the missing
transition immediately (`offer-window-elapses: expected 'BOOKING_READY' to be
'NEEDS_HUMAN'`) before a single line of handler code existed.
`tests/lead-rescue-offer-wait.test.ts` (10 tests) proves the deterministic rule itself:
BOOKING_READY reached through the real lr-t10 path; too-early and exact-boundary comparison
(`>=`, the same inclusive rule lr-t14 uses); the full decision record (trigger, evidence,
selected action, authority, escalation reason, its OWN policy citation — and explicitly NOT
lr-t14's); superseded/terminal states (`BOOKED`, `DO_NOT_CONTACT`, `CLOSED_BAD_FIT`,
`ESCALATED`) correctly producing no stale escalation; the cross-category leak tests above;
and a missing-fact safe no-op. `tests/lead-rescue-offer-wait-resume.test.ts` (7 tests) proves
the SAME persistence, cross-runtime, and crash-recovery guarantees already established for
lr-t14 genuinely extend to lr-t22 through the unmodified generic machinery: durable park with
a stable, revision-scoped identity; runtime reconstruction; a full resolve/delete/re-park
cycle producing a genuinely new, non-suppressed notification; sequential duplicate
suppression; two independently constructed runtimes racing on the same elapsed offer
incident with the observable sink invoked at most once; a crash after invoking the executor
but before confirmation yielding `UNCERTAIN` with zero automatic replay across a fresh
recovery runtime; and a malformed persisted record failing closed. Every test in both new
files was confirmed to fail for the missing-feature reason first — reverting only
`lib/engine/handlers/lead-rescue.ts` reproduced 6 failures in the first file and 6 in the
second, all `RangeError: Invalid time value` or a wrong final state, never a typo or a
setup bug — then implementation made all of them pass without weakening any assertion.

**One new canonical scenario.** `offer-window-elapses`
(`data/profiles/kestrel/scenarios/lead-rescue.ts`) is the `lr-t22` sibling of
`reply-window-elapses`: a complete, qualified enquiry (Northgate Analytics, SOC 2 Type II)
reaches `BOOKING_READY` immediately with no missing-information detour, a re-check twenty
hours later finds the 48-hour window still open, and a second re-check fifty hours in finds
it elapsed and escalates — the same TRIGGER (a qualified, complete enquiry) → DECISION (a
deterministic window comparison) → ACTION (owner notification) → GUARDRAIL (authority 2,
named-policy citation) → OUTCOME (`NEEDS_HUMAN`, notification `EXECUTED`) shape `lr-t14`'s
own scenario already established. Added to `LEAD_RESCUE_SCENARIOS` (now 7 scenarios; Lead
Rescue's dossier and simulator index update automatically, no other file needed a change),
and `npm run docs` regenerated `docs/RESEARCH_LEDGER.md` (the new operating parameter row) —
`docs/NORTH_STAR_CANON.md` and `docs/FAILURE_MODE_REGISTER.md` were unchanged, since `lr-t22`
and its states were already fully declared in canon before this pass.

**The interactive demo now demonstrates both categories.** `app/lead-rescue/wait/page.tsx`
gains a second "Park a demo incident" button (reply/lr-t14 and offer/lr-t22, clearly
labelled) and a "Kind" column; `app/api/lead-rescue/wait-incidents/route.ts` accepts an
optional `{kind}` on `POST` (defaulting to `'reply'`, so this is purely additive — no prior
caller's behaviour changed) and now reports each incident's category by reading whichever
start-of-wait fact is actually present on its record, the same authoritative discriminant
the handler itself uses, never a separately tracked label the route could drift out of sync
with. The `check` route's "simulate past deadline" control was generalised the same way — it
previously only knew about `waitStartedAt` and would have silently done nothing useful for
an offer incident. Live-verified in the browser: parked one of each kind, confirmed both
render with correct 24h/48h deadlines, drove the offer incident to `NEEDS_HUMAN` via the
"simulate past deadline" control while the reply incident sat untouched in the same list,
then confirmed the reply incident elapses correctly too — and inspected both resulting
`.data/lead-rescue-operation-claims/*.json` records directly, each showing `CONFIRMED` with
its own distinct, correct operation id
(`notify:<id>:wait-elapsed@rev1` vs `notify:<id>:offer-unanswered@rev1`).

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
- **The observable execution boundary — when one is configured — is genuinely gated behind
  that same claim, proven by instrumentation.** `WaitResumeDeps.executor`
  (`lib/engine/wait-resume.ts`, new this pass) is invoked, when present, only inside the
  branch a durable claim has already won; a test-only recording sink confirms this ordering
  empirically for every invocation it observes, and reverting the ordering to test-before-
  claim made the majority of the execution-boundary test suite fail. With no executor
  configured (the demo's own default before this pass, and every caller's default now),
  `EXECUTED` remains an honestly labelled pure plan — verified directly, not assumed.
- **An incident's operation identity survives a full resolve/delete/re-park cycle for the
  same `incidentId`, this pass.** `WaitIncidentStore`'s revision high-water mark
  (`lib/persistence/wait-incident-store.ts`) now persists per incidentId independently of
  whether an active record exists, closing a real (empirically falsified) collision: a
  resolved-then-reused incidentId could previously be assigned a revision an earlier,
  already-CONFIRMED cycle used, permanently suppressing the new cycle's notification.
- **A second, materially different Lead Rescue waiting condition — `lr-t22`, "Offer
  unanswered" on `BOOKING_READY` — now genuinely executes, this pass.** Reached through the
  real handler (`lr-t10`/`lr-t16`), durably parked, and resumed through the identical
  `WaitIncidentStore`/`OperationClaimStore`/`checkWaitIncident` machinery `lr-t14` uses, with
  zero changes to any of the three. The only new logic is the business rule itself
  (`handleOfferWaitReevaluation`) and a lifecycle-state dispatch deciding which rule a given
  `lead.wait.reevaluated` event should run — proof, not assertion, that the wait/resume
  architecture generalises rather than being secretly shaped around lr-t14's specifics.

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
npm run verify     # typecheck + lint + 417 tests
npm run build      # 28 pages prerender or route; the engine executes at build/request time
npm run docs       # regenerate canon from the model
```

All passing as of this pass, including `tests/wait-incident-store.test.ts` (25 tests),
`tests/lead-rescue-wait-resume.test.ts` (6 tests, unchanged — lr-t14 regression-verified),
`tests/operation-claim-store.test.ts` (18 tests),
`tests/lead-rescue-wait-resume-concurrency.test.ts` (9 tests),
`tests/lead-rescue-wait-resume-execution-boundary.test.ts` (7 tests),
`tests/lead-rescue-offer-wait.test.ts` (10 tests, new this pass — the lr-t22 deterministic
rule and its guardrails), and `tests/lead-rescue-offer-wait-resume.test.ts` (7 tests, new
this pass — persistence, cross-runtime racing, and crash recovery for the offer category
through the unmodified generic machinery). `npm run build` now reports 28 pages (27 before
this pass) — the new `offer-window-elapses` scenario's own simulator page — and still exactly
two `ƒ` (server-rendered on demand) routes, `/api/lead-rescue/wait-incidents` and its
`/check` sibling, unchanged from the prior pass. `npm run docs` WAS re-run this pass (the
first time since the wait/resume work began): the new `bookingOfferWindowHours` operating
parameter changed `docs/RESEARCH_LEDGER.md` by exactly one row;
`docs/NORTH_STAR_CANON.md`/`docs/FAILURE_MODE_REGISTER.md` were unchanged, since `lr-t22`
and its states were already fully declared in canon before this pass touched anything.

Visual inspection performed on the portfolio index, the Owner Revenue Intelligence dossier,
and both new scenario pages — the run-summary panel's existing generic counters render
correctly with no new UI component: scenario A (`cash-collection-quietly-worsens`) shows 9 steps, 8
transitions accepted, 0 rejected, 0 side effects executed, 1 blocked by policy (the
notification, at authority level 1); scenario B (`stale-concentration-read-dismissed`) shows 4
steps, 4
transitions accepted (stale flag, refresh, and dismissal across two events), 0 side
effects, matching the "ordinary variation is left alone" claim exactly.

## Known fidelity gaps

1. **Three Dormant Pipeline Recovery and two Call-to-Proposal transitions remain declared but
   unexercised.** Both of Lead Rescue's wait-elapsed transitions are now closed genuinely,
   via persisted resume and claim-gated execution: `lr-t14` (`WAITING_FOR_REPLY`, closed
   three passes ago) and `lr-t22` (`BOOKING_READY`, closed this pass). Dormant Pipeline
   Recovery and Call-to-Proposal are unchanged by this pass — see item 11 below for the one
   Lead Rescue gap this pass's own `lr-t22` work surfaced.
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
10. **A definite, confirmed-clean executor failure (`FAILED_BEFORE_EFFECT`, `RATE_LIMITED`)
    is treated identically to a genuinely uncertain one, this pass.** Both leave the claim
    unconfirmed and block automatic replay, even though a definite failure is, by the
    `SendOutcome` contract's own documentation, retry-safe. Deliberately conservative rather
    than fast-pathing the distinction: this build has no independent way to verify a clean
    failure report actually reflects reality (no `attemptVerify` implementation is wired to
    the wait/resume boundary), so collapsing "definitely safe to retry" and "genuinely
    unknown" into two different automatic behaviors would be exactly the kind of
    overconfident retry this pass's whole reliability story argues against. A future pass
    with a genuine verification channel is where that nuance belongs — `OperationClaimStore`
    already has room for a third, "abandoned" terminal state without a redesign.
11. **The three `HUMAN_DECISION` paths back into `BOOKING_READY` (`lr-t24`/`lr-t27`/`lr-t34`)
    never write `bookingReadyAt`, this pass.** Only the two `DETERMINISTIC_RULE` entry points
    (`lr-t10`, `lr-t16`) do. A case a person manually clears back to `BOOKING_READY` after
    `NEEDS_HUMAN`/`ESCALATED`/`SUPPRESSION_REVIEW` therefore has no offer-wait clock and
    `lr-t22` can never fire for it — safe (a missing fact is a no-op, never a false
    escalation; see case 17 in `tests/lead-rescue-offer-wait.test.ts`), but also a genuine
    coverage gap, and the single recommended next fidelity gap below.

## Single recommended next fidelity gap

**The three `HUMAN_DECISION` paths back into `BOOKING_READY` (`lr-t24`, `lr-t27`, `lr-t34`)
never write `bookingReadyAt`, so a case a person manually clears to `BOOKING_READY` has no
offer-wait clock at all.** Found by inspecting the repository this pass actually produced,
not by pattern-matching "another timeout is next": `bookingReadyAt` is written in exactly
two places — the `lr-t10`/`lr-t16` deterministic disposition steps
(`lib/engine/handlers/lead-rescue.ts`) — both DETERMINISTIC_RULE paths reached directly from
system-computed classification. `handleHumanDecision`'s `CLEARED_TO_PROCEED` branch
(`humanTarget()`, implementing `lr-t24`/`lr-t27`/`lr-t34` depending on the originating state)
routes to `BOOKING_READY` through a completely different code path this pass deliberately
did not touch, and writes no fact at all. The consequence is real, not hypothetical: a case
escalated to `NEEDS_HUMAN`, `ESCALATED`, or `SUPPRESSION_REVIEW` and then cleared by a
person to proceed re-enters `BOOKING_READY` with `bookingReadyAt` absent, so
`handleOfferWaitReevaluation` permanently takes its "no recorded booking-ready timestamp, no
action" branch for that case — safe (never a false escalation), but also never escalates a
second time no matter how long the cleared case then sits unanswered. `tests/lead-rescue-offer-wait.test.ts`
proves the SAFE half of this today (case 17, "missing bookingReadyAt fails safe"); the GAP is
that no test or scenario yet drives a case through an actual `lr-t24`/`lr-t27`/`lr-t34`
transition to demonstrate the missing clock concretely.

**Why this outranks generalising to a second system.** The prior pass's own recommendation
reasoned that two concrete cases within Lead Rescue were needed before cross-system
generalisation could be considered evidence-based rather than speculative — this pass
supplied the second case, and confirmed the underlying mechanism (`WaitIncidentStore`,
`OperationClaimStore`, `checkWaitIncident`) needed zero changes to support it. That question
is now answered. But this pass ALSO surfaced a real, narrower gap purely as a side effect of
implementing `lr-t22` honestly rather than covering every `BOOKING_READY` entry point — and
an unfixed correctness gap discovered while building the second case is higher-leverage than
speculating about a third, still-hypothetical one in a different system. Closing it would
mean: writing `bookingReadyAt` (or leaving it, if a person clearing a case is judged to
deliberately restart the wait differently than the system reaching it automatically —
genuinely a policy question, not just an implementation one) at the `CLEARED_TO_PROCEED`
branch, and a scenario or direct test driving `NEEDS_HUMAN -> BOOKING_READY` (`lr-t24`)
through to a real check. No new architecture either way — the same fact-write pattern this
pass already established twice.

**Do not begin closing this gap from this document.** Recorded here as the evidence-based
next candidate, the same discipline every prior pass's "next fidelity gap" section applied —
not as a plan to execute without its own re-verification, and not without first deciding
the genuine policy question (should a human-recovered case's offer-wait clock restart, or
did canon intend `lr-t22` to apply only to the system's own two direct paths?) rather than
assuming the answer.
