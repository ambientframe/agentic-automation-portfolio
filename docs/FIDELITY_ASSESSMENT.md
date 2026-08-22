# Portfolio Fidelity Assessment

**Date: 2026-08-22 · Baseline: `08e4e70` · Phase: HORIZONTAL EXPLORATION COMPLETE → PORTFOLIO
FIDELITY ASSESSMENT → LEAD RESCUE VERTICAL CLIMB**

This is a hand-authored assessment, not a generated document — it is not touched by
`npm run docs` and is not held to the drift-detection contract `tests/docs.test.ts` applies
to `NORTH_STAR_CANON.md`, `FAILURE_MODE_REGISTER.md`, and `RESEARCH_LEDGER.md`. It records a
point-in-time judgment call, not a rendering of the typed model.

**Purpose.** All six systems are now `SIMULATED`. This document answers, with repository
evidence rather than a plan made in advance: which single Lead Rescue capability is the
highest-leverage next step toward client-deliverable production depth, and why.

**What this document is not.** It does not implement anything. No system's maturity changes
here. No `data/systems/**` or `lib/engine/**` file is edited by this pass.

---

## 1. Baseline recovery

Started at `08e4e70` (the Owner Revenue Intelligence checkpoint). `git status` was clean.
`.next/types/*` had to be regenerated (a stray local artifact, gitignored, unrelated to any
committed code) before `npm run verify` would pass; once regenerated:

```
npm run verify   # typecheck clean, lint clean, 335/335 tests pass
npm run build    # 25 pages prerender
```

Both match the state `STATUS.md` claims. Baseline confirmed truthful before any assessment
work began.

**On `STATUS.md`'s own recommendation.** Per instruction, its "Single recommended next
fidelity gap" (a portfolio-wide assessment, deferring to evidence rather than naming a
feature) was treated as a hypothesis, not an instruction. It held up — the assessment below
independently arrives at "assess before implementing," which is exactly what this document
now does.

---

## 2. Six-system fidelity matrix

Scale: `0` conceptual only · `1` simulated/fixture-backed · `2` interactive or realistically
stateful · `3` partially live · `4` live/operationally credible · `5` production-hardened.

No cell below exceeds **2** anywhere in the portfolio, for a structural reason worth stating
once rather than six times: **nothing in this repository crosses a network boundary.**
`package.json` declares exactly four runtime dependencies — `next`, `react`, `react-dom`,
`zod` — and no database, queue, HTTP client, or webhook framework. Every "live provider" is
a `Fixture*` port implementation (`lib/ports/*.ts`) that replays authored data. This is a
portfolio-wide fact, not a per-system finding, and it caps every cell in this matrix at 2
regardless of how sophisticated the logic behind that boundary is. The asymmetry that
matters lives in **how much genuine logic sits behind the simulated boundary**, which is
what the rest of this matrix, and the citations under it, are actually measuring.

| # | System | Visual/Interaction | Data/State | Execution/Reasoning | Integration/Reliability | Commercial |
|---|---|---|---|---|---|---|
| 1 | Lead Rescue | 2 | 1 | **2** | **2** (strongest) | **2** |
| 2 | Dormant Pipeline Recovery | 2 | 1 | 1 | 1 | 1 |
| 3 | Call-to-Proposal | 2 | 1 | 2 | 1 | 1 |
| 4 | Client Onboarding | 2 | 1 | **1** (0 of 2 judgments exercised) | **2** (different kind) | 1 |
| 5 | Receivables | 2 | 1 | 2 | 1 | **2** |
| 6 | Owner Revenue Intelligence | 2 | 1 | 2 | **1** (weakest, by design) | 1 |

**Do not average this row into a single portfolio number.** A mean would erase exactly the
asymmetry this assessment exists to surface — e.g. Lead Rescue and Client Onboarding both
score 2 on Integration/Reliability for *structurally different reasons* (send/verify retry
safety vs. convergent resource reconciliation), and averaging Execution/Reasoning across a
system that exercises 3 of 3 declared judgments (Lead Rescue) against one that exercises 0
of 2 (Client Onboarding) would report "1.5 on average" as if that were a real property of
either system, when it is a property of neither.

### 2.1 Visual/Interaction fidelity — genuinely uniform, not lazily scored

Every runnable scenario, across all six systems, renders through the identical
`components/simulator.tsx` (timeline scrubber, decision inspector, side-effect panel) and
`components/badges.tsx` (mechanism/authority/effect-status/maturity/provenance badges). This
is real, client-side, genuinely-computed-result interaction — stepping through a run reveals
successive prefixes of an actual computed `EngineRun`, not a canned animation
(`components/simulator.tsx:17-24`). There is no per-system visual differentiation because
the architecture deliberately has none: `app/simulator/[slug]/page.tsx` and
`app/systems/[slug]/page.tsx` are system-agnostic, driven entirely by `SystemDefinition` +
`EngineRun` shape. Scoring this dimension unevenly across systems would be inventing an
asymmetry that does not exist. The one caveat worth naming precisely: `app/simulator/[slug]`
uses `generateStaticParams`, and the build output shows `● (SSG)` for every scenario page —
meaning "Executed on this request by the engine" (the page's own copy,
`app/simulator/[slug]/page.tsx:93-95`) is true in the *deterministic-replay* sense the
sentence intends, but the actual `runScenario` call happens once, at **build time**, not on
each visitor's request. This is not dishonest (the result is byte-identical either way,
which is the entire point of the determinism tests), but it is a real precision gap between
what the copy implies and what literally happens, worth knowing before it is challenged by a
technically sophisticated visitor.

### 2.2 Data/State fidelity — uniform ceiling, real internal asymmetry

No system persists a fact past the single `reduceScenario`/`runScenario` call that produces
it (`lib/engine/run.ts:333-346` constructs a fresh `EngineState` and fresh ledgers on every
call; nothing outlives the call). That caps every system at **1**. Beneath that ceiling, the
five systems' actual use of `EngineState.facts` varies sharply:

| System | Fact keys | Nature |
|---|---|---|
| Dormant Pipeline Recovery | **0** | No `statePatch.facts` write exists anywhere in the handler — confirmed by direct inspection of `lib/engine/handlers/dormant-pipeline-recovery.ts`. Every fact the handler needs is re-asserted fresh on each event's payload. |
| Lead Rescue | 0 explicit JSON keys (a few flat fields: `channel`, `company`, `contactName`) | Field copying, not structured accumulation. |
| Call-to-Proposal | 2 (`commercialRecordClaimsJson`, `proposalArtifactJson`) | A genuinely versioned business object (`ProposalArtifact` with `version`/`claimStatus`/`approval`), mutated across steps within one run. |
| Client Onboarding | 5 (`signedHandoffJson`, `knownValuesJson`, `conflictsJson`, `secureAccessJson`, `onboardingTasksJson`) | The richest: a genuine multi-entity, multi-step accumulation with precedence resolution and dependency-graph recomputation (`recomputeTaskStatuses`). |
| Receivables | 3 (`invoiceRecordJson`, `paymentPromiseJson`, `disputeJson`) | Structured per-invoice record, mutated across ageing/reply/payment events. |
| Owner Revenue Intelligence | 3 (`analysisRecordJson`, `exceptionRecordJson`, `recommendationRecordJson`) | Structured per-incident record. |

The honest read: **"real computation over accumulated state within one run" and "durable
persistence across runs" are two different claims**, and every system in this portfolio has
some of the first and none of the second. Client Onboarding has the most of the first.

### 2.3 Execution/Reasoning fidelity — the sharpest asymmetry in the matrix

| System | Declared `aiJudgments` | Exercised by a real scenario/test | Evidence |
|---|---|---|---|
| Lead Rescue | 3 | **3 of 3** | Intake classification (5 scenarios) + reply interpretation (after-hours, ambiguous-high-risk scenarios), confidence floor proven both directions, a dedicated cross-cutting test asserts declined inferences never leak into `finalState.facts` for *any* scenario (`tests/lead-rescue.test.ts:378-391`). |
| Dormant Pipeline Recovery | 2 | **1 of 2** | Reply-interpretation judgment is genuinely invoked (`lib/engine/handlers/dormant-pipeline-recovery.ts:702-733`, `providerId: 'fixture-decision-provider'`) and reaches `POSITIVE_RESPONSE` via a real scenario. "Interpreting whether an observed account event constitutes a relevant change" has no driving event type anywhere in the handler and is never invoked. |
| Call-to-Proposal | 3 (folded into one `ExtractionProvider` call) | Exercised as designed, but the extraction itself is 100% hand-authored fixture data (`ExtractionResult` objects with no computation from the transcript segments) — the *deterministic wrapper* around it (the claim-admission gate, `admitClaim`) is the genuinely strong part. |
| Client Onboarding | 2 | **0 of 2** | Confirmed independently by the research agent: `tests/helpers.ts`'s `runClientOnboarding` wires no `provider`-consuming path the handler ever reads; both scenarios use schema-validated structured intake, never free text. Self-reported in `data/systems/client-onboarding.ts`'s own `aiJudgments` phrasing ("...when the inbound handoff is not already a structured, schema-validated artifact") and in `STATUS.md`'s Client Onboarding pass narrative. |
| Receivables | 2 | **2 of 2** | Dispute/promise classification (`DecisionProvider`) and committed-date extraction (`ExtractionProvider`) both genuinely exercised on the same input in the same scenario — the portfolio's clearest "two ports, two shapes of ambiguity" demonstration. |
| Owner Revenue Intelligence | 2 (folded into one transition) | **1 of 1** | The one bounded judgment (composing explanation + recommendation) is exercised with declined-to-infer and evidence citation. |

**Client Onboarding is the one system whose canon claims more interpretive surface than its
implementation exercises.** This is not a new finding — it was self-reported at the time —
but it is now independently confirmed at the code level, and it is the sharpest single
asymmetry this dimension produced.

### 2.4 Integration/Reliability fidelity — two genuinely different "2"s, and a deliberate "1"

| System | Idempotency mechanism | Uncertain-outcome ever produced? |
|---|---|---|
| Lead Rescue | Ledger key-claim **+ full `SideEffectExecutor`/`ExecutionLedger` retry-safety loop** | **Yes** — `OUTCOME_UNKNOWN` genuinely produced, a naive retry genuinely refused, an independent `VERIFICATION_CHECK` genuinely narrows it, exactly one customer-facing send ever succeeds across the run (`tests/lead-rescue.test.ts:288-373`). The only system in the portfolio proving this loop end to end. |
| Dormant Pipeline Recovery | Ledger key-claim only | No — `RATE_LIMITED` failure mode's own `verificationTest` says "Pending" (`data/systems/dormant-pipeline-recovery.ts:268`). |
| Call-to-Proposal | Ledger key-claim + an independent artifact-version invariant (`canDeliver`) | No — `HUMAN_APPROVAL_TIMEOUT`'s `verificationTest` says "Pending." |
| Client Onboarding | **`ResourceProvisioner` convergent reconciliation** — a structurally different guarantee (safe-by-construction repetition, not retry-safety) | **Yes** — `OUTCOME_UNKNOWN`, `CONFLICT_DETECTED`, and `ALREADY_EXISTS_MATCHING` are all genuinely produced and routed on (`tests/client-onboarding.test.ts:78-104, 338-363`). The only system besides Lead Rescue with a real uncertain-outcome proof, of a genuinely different shape. |
| Receivables | Ledger key-claim only | No — no `sendOutcomes`/`verifyOutcomes` wired in `lib/engine/registry.ts`. |
| Owner Revenue Intelligence | N/A by design | No — its one proposed effect is authority level 1 and is refused by the authority gate *before* the ledger is ever consulted. This is not a gap; it is the intended structural proof that a RECOMMEND-only system cannot act, at the cost of never exercising duplicate-suppression for its own effect. |

**Lead Rescue and Client Onboarding are the only two systems with a real uncertain-outcome
proof, and they prove different things** — send/retry safety vs. convergent provisioning.
This is the strongest evidence in the whole assessment that Lead Rescue's reliability
*design* is close to production-ready; what is missing is not more logic, but a live
provider and durable state behind logic that already exists.

### 2.5 Commercial fidelity — the most subjective dimension; scored with that stated plainly

| System | Score | Why |
|---|---|---|
| Lead Rescue | **2** | Five scenarios covering the most universally recognizable SMB fear ("did we lose a lead") — after-hours, duplicate delivery, a genuinely ambiguous high-risk enquiry, a restricted-contact consent nuance, and a provider outage with an honestly uncertain outcome. No buyer sophistication required to feel the stakes. |
| Receivables | **2** | Equally visceral ("chasing an invoice a client already disputes, or already paid"), with one genuinely clever demo beat: a reply that mentions "dispute" about a *different* invoice, correctly read as a promise to pay — a vivid, low-effort proof of judgment quality. |
| Dormant Pipeline Recovery | 1 | Recognizable ("stale CRM records") but thinner — 2 scenarios, no equivalently memorable twist. |
| Call-to-Proposal | 1 | Commercially real, but the payoff (citation-based claim admission) is more legible to a technical buyer than a lay owner; requires more framing to land. |
| Client Onboarding | 1 | Recognizable pain ("stop asking me things you already know"), solid demo, unremarkable relative to the other five. |
| Owner Revenue Intelligence | 1 | The most sophisticated *business* story in the portfolio (cash collected worsening while revenue holds steady) — but it requires the most financial literacy from a viewer to appreciate why it matters, and rewards attention rather than landing instantly. |

Disagreement with this ranking is reasonable — it is the one dimension where a different
person could credibly assign different numbers. The evidence citations above (scenario
files, `demonstrates` arrays) are what should be argued with, not the numbers themselves.

---

## 3. Lead Rescue: production-gap map

### 3.1 Systems-engineering red-team, stage by stage

`trigger → normalize → persist → deterministic routing → bounded AI classification →
response → wait/resume → reply interpretation → evaluation → escalation`

| Stage | Status | Evidence |
|---|---|---|
| **Trigger** | Simulated | `inbound.enquiry.received` events are TypeScript object literals in `data/profiles/kestrel/scenarios/lead-rescue.ts`. No HTTP route, no webhook handler, no channel adapter exists anywhere in `app/` or `lib/`. |
| **Normalize** | Real, but trivial | `EnquiryPayloadSchema.safeParse` genuinely rejects malformed input into `FAILED_RECOVERABLE` (`lib/engine/handlers/lead-rescue.ts:118-152`); the mapping itself (`:187-224`) is straight field copying from an already-clean object, not parsing of raw external bytes. |
| **Persist** | **Absent** | `EngineState` lives only in the JS heap for one call. No database, KV store, or file-backed state anywhere (`package.json` has zero such dependencies). Simulator pages are SSG-prerendered at build time — there is no per-request recomputation to persist *from*, let alone *to*. |
| **Deterministic routing** | Real | Validation, normalization, duplicate check, consent screen, missing-field intersection, disposition mapping — all genuinely computed and directly tested (e.g. "computes the missing set as the intersection of policy and judgment, not from either alone," `tests/lead-rescue.test.ts:42-51`). |
| **Bounded AI classification** | Simulated, real policy around it | `FixtureDecisionProvider` replays authored `ClassificationResult`s; the confidence-floor comparison, contract validation, and forbidden-action enforcement around it are real and tested in both directions. |
| **Response (send)** | Real decision logic, simulated execution | The uncertain-outcome scenario (`uncertain-downstream-outcome`) proves the full `ExecutionLedger` retry-safety contract for real; the actual "send" is `FixtureSideEffectExecutor` replaying an authored outcome — nothing ever reaches an email address. |
| **Wait/resume** | **The one stage with no logic behind it at all** | `WAITING_FOR_REPLY` is a real, declared, correctly-accounted-for lifecycle state — but it is only ever exited because the *next authored fixture event* happens to carry a later `occurredAt`. `lr-t14` (`WAITING_FOR_REPLY → NEEDS_HUMAN`, "wait elapsed") is declared in canon (`data/systems/lead-rescue.ts:73`) and has **zero** code, event type, scenario, or test anywhere that drives it. There is no timer, no scheduled check, no cron — nothing that could independently discover a wait has elapsed. This is a difference in *kind* from every other stage above: those have real logic behind a simulated I/O boundary; this stage has no logic behind anything. |
| **Reply interpretation** | Simulated, real policy around it | Same shape as classification; `REPLY_CLASSES` genuinely drive disposition. |
| **Evaluation** | **Absent, portfolio-wide** | 12 metrics are defined with rigorous formulas (`lr-inbound-received` through `lr-booked-rate`) and **zero are computed by any code** anywhere in the repository. No aggregation, no dashboard, no cross-run scoring. This is true of all six systems, not a Lead Rescue-specific gap. |
| **Escalation** | Real | `NEEDS_HUMAN`/`ESCALATED` genuinely reached; authority-ceiling verification is a real, computed `VerificationRecord` (`PASS`/`FAIL` from `profile.roles`), not asserted. One of the most solidly implemented stages in the whole system. |

Additional properties inspected directly:

- **Idempotency**: the strongest guarantee in the system — `SideEffectLedger` + `EventLedger`
  + `ExecutionLedger`, all independently, rigorously tested. This is production-grade
  *design*; what's absent is a durable backing store, not correct logic.
- **Event identity**: real (`source:sourceEventId` composite key, `lib/engine/ledger.ts:67-69`, tested directly).
- **Ordering**: real *within* one event's multi-step processing (`atOffsetSeconds` strictly
  increasing, `tests/replay.test.ts:55-72`); genuinely out-of-order *cross-event* delivery
  has a declared failure mode (`lr-fm-out-of-order`) whose own `verificationTest` says
  "Pending — out-of-order scenario not yet authored" — an honestly-declared gap.
- **Timeout handling**: absent — `lr-t14` (above) and `lr-t22` ("offer unanswered") have no
  driving event or test anywhere.
- **AI uncertainty**: unusually well-handled — the declined-inference-never-leaks
  cross-cutting test (`tests/lead-rescue.test.ts:378-391`) is a genuinely rare, rigorous
  negative-property test.
- **Failure recovery**: `FAILED_RECOVERABLE`'s retry-budget path (`lr-t30`/`lr-t31`/`lr-t32`)
  is declared but not scenario-exercised — `lr-fm-malformed`'s `verificationTest` says
  "Pending."
- **Secrets/credentials**: not applicable to Lead Rescue (Client Onboarding's domain,
  already well-covered there).
- **Configuration boundaries**: genuinely real — every threshold (`confidenceFloor`,
  `acknowledgementTargetSeconds`, `routingTargetMinutes`, `maxInformationQuestions`) is read
  through `numberParam()`, never hard-coded.
- **Cross-run durability**: absent (same root cause as persistence).

### 3.2 Commercial-demonstration red-team

Walking through the Simulator as a prospective buyer would:

- **Trigger, evidence, decision, action are all legible** — the decision-record panel
  (objective, facts consulted, evidence, permitted/forbidden actions, applicable policy) is
  genuinely unusual in how much it exposes, and `MechanismBadge` makes the
  deterministic/AI/human distinction impossible to miss.
- **Guardrails and authority are legible** — the restricted-contact scenario is a
  particularly strong demo beat: a high-confidence, well-qualified classification is
  computed, shown, and *still* blocked by policy, with the block itself inspectable rather
  than hidden.
- **The "what is real here" panel is a commercial strength, not a hedge** — it preempts the
  sophisticated buyer's objection ("did this actually send?") before they ask it, rather
  than getting caught overclaiming.
- **The one place the demo would not survive a sharp follow-up question**: "so what's
  actually checking whether the reply arrived — and what happens if it never does?" The
  honest answer today is *nothing is checking anything* — the wait "resolves" only because
  the next scripted event in the fixture happens to arrive. This is the single largest gap
  between what the demo *reads as* (an agent that waits and responds to changing reality)
  and what is *actually implemented* (a fixed sequence of pre-authored events).

This is the same finding the systems-engineering pass arrived at independently, from a
different direction — which is itself useful corroboration.

---

## 4. Challenging the presumed sequence

The brief's default order is `trigger → normalize → persist → routing → classification →
response → wait/resume → reply → evaluation → escalation`. The evidence above argues against
following it literally:

- **Trigger and response are already "as simulated as they should be" for `SIMULATED`
  maturity** — real decision logic wrapped around a fixture I/O boundary. Making either one
  *live* before durable state exists would not be progress; it would be regression dressed
  as progress. The portfolio's single most-tested claim — exactly-once side effects under
  at-least-once delivery — is proven against an **in-process** ledger. A real webhook or a
  real send, with the *same* in-memory-only ledger behind it, would silently stop being true
  the moment there are two server processes or one restart. The demo would look more real
  and quietly be less true.
- **Persistence has no standalone falsifiable target.** "Add a database" is exactly the kind
  of infrastructure-because-production-systems-eventually-need-it the brief warns against.
  It only earns its cost attached to a concrete consumer.
- **Wait/resume is the one stage that is not "simulated with real logic behind it" — it is
  simply absent.** Every other stage in Lead Rescue's own loop has genuine decision logic
  sitting behind a simulated boundary. This stage has no logic at all: nothing evaluates
  whether time has passed. That is a difference in kind, not degree, and it is also exactly
  the property the commercial red-team flagged as the one a sophisticated buyer would find
  first.
- **Observability over a run is already good; observability *across* runs has nothing to
  observe** — there is no durable record spanning more than one computed run, so a
  dashboard today would only ever show the run already on screen.

**Dependency logic, made explicit:** a genuine wait/resume mechanism requires *some* durable
record that an incident is waiting, and for how long — which means the smallest defensible
slice of "persistence" is not a separate initiative, it is a **direct, minimal prerequisite**
of wait/resume, sized to exactly what wait/resume needs and nothing more. This reorders the
presumed sequence: the first real fidelity gain is **wait/resume, backed by the minimum
persistence it requires** — not "persistence" as an abstract platform investment, and not a
live trigger or a live send, both of which are downstream of this and would be
architecturally premature ahead of it.

---

## 5. Architecture pressure test

| Component | Classification | Why |
|---|---|---|
| **Scheduler / wait mechanism** | **NEEDED NOW** | This is the chosen capability itself (§6). Even a minimal, manually- or trivially-triggered re-check that reads a real clock is what's missing — not a service, a mechanism. |
| **Minimal durable state boundary** (a single store — file- or SQLite-backed, not a hosted database) | **NEEDED NOW**, scoped tightly | Required for a waiting incident to survive independently of any one function call. Must be sized to exactly what wait/resume needs; nothing more. |
| **Persistent state store** (a general-purpose production database/ORM) | NOT YET JUSTIFIED | No concrete need beyond what the minimal boundary above already covers. Reaching for Postgres/an ORM now would be solving a scale problem this portfolio does not yet have. |
| **Event store** (formal event-sourcing log distinct from state) | NOT YET JUSTIFIED | `TimelineEntry` + `EngineState.facts` already capture what's needed for replay/audit within one run. **LIKELY LATER**, if durable cross-run audit trails become a real requirement once persistence exists at all. |
| **Queue/job mechanism** | NOT YET JUSTIFIED | A single demo scenario's wait/resume needs a scheduled check, not a job queue. **LIKELY LATER**, once many concurrently-waiting incidents need independent scheduling at real scale. |
| **Webhook adapter** | NOT YET JUSTIFIED | Would be architecturally misleading ahead of durable state (§4). **LIKELY LATER**, after persistence is proven. |
| **Integration adapter** (real email/SMS provider) | NOT YET JUSTIFIED | Same reasoning as the webhook adapter, plus an operational risk (an actual outbound send in a demo context) this assessment should not casually invite. **LIKELY LATER**. |
| **Observability store** | NOT YET JUSTIFIED as dedicated infrastructure | A lightweight "incidents currently waiting, since when" view is a natural, near-zero-cost byproduct of the minimal store above, not a separate investment. |
| **Evaluation layer** | NOT YET JUSTIFIED | Real, valuable, and genuinely separate work (a harness, labeled data, scoring) that answers "how good is this judgment" — a different question from "does this loop actually operate," which is what's unresolved today. **LIKELY LATER**. |
| **Configuration/secrets interface** | NOT YET JUSTIFIED | Lead Rescue handles no secrets. Already well-covered where it matters (Client Onboarding, `kestrel-credential-handling`). |

**What stays fixed regardless of which component moves:** deterministic logic stays
deterministic; AI stays bounded and never gains authority from confidence; execution
authority stays separate from judgment (the core's authority gate, unmodified); runtime
state stays in one authoritative place per run; idempotency stays first-class; failure
recovery stays explicit. None of these need to change for wait/resume to exist — the new
mechanism is a new *trigger path* into the same reducer, not a new kind of engine.

**Explicitly not justified by anything found in this pass:** graph-native architecture,
dynamic transition policies, or a persistent-cycle runtime. Loops existing (wait, retry,
cadence) does not by itself justify a graph engine — every loop in this portfolio today is a
bounded, declared sequence of ordinary state-machine transitions, and nothing in this
assessment found a case where that stopped being sufficient.

---

## 6. The selected work package

**Give `WAITING_FOR_REPLY` a genuine wait/resume mechanism: a minimal durable record of
which incidents are waiting and since when, plus a real, independently-triggerable,
clock-driven re-evaluation that can discover a wait window has elapsed — rather than relying
on the next fixture event happening to carry a later timestamp.**

**Current state.** `WAITING_FOR_REPLY` is genuinely reached (the after-hours scenario parks
there for real). It is exited *only* because the scenario author wrote a `prospect.replied`
event with a later `occurredAt` immediately afterward. `lr-t14` (wait-elapsed →
`NEEDS_HUMAN`) is declared, authority 2, and has no code, event, scenario, or test anywhere.
`EngineState` — including the fact that an incident is waiting at all — exists only for the
duration of one function call.

**Fidelity gap.** The system cannot distinguish "no reply has been evaluated yet" from
"nothing has autonomously noticed that time is up," because nothing autonomously notices
anything. Every other stage in Lead Rescue's own declared loop has real decision logic
behind a simulated I/O boundary; this is the one stage with no logic behind it at all.

**Target property.** A waiting incident's state survives independently of any one function
call, and a genuinely separate, re-triggerable check can correctly compute — from a real
elapsed-time comparison, not an authored next-event timestamp — whether the configured wait
window has passed, firing `lr-t14` exactly as the reducer already knows how to authorize, or
producing a clean no-op when it has not. This generalizes the exact pattern
`side_effect.reconciliation.attempted` already established for uncertain sends (a genuine,
separately-fired automated check the reducer evaluates on its own terms) to waiting states.

**Scope.**
- A minimal durable store for "incidents currently waiting, and when their wait began" — the
  smallest thing that survives a process boundary (e.g. a single file- or SQLite-backed
  store), not a hosted database.
- A new event type (e.g. `lead.wait.reevaluated`) and handler branch in
  `lib/engine/handlers/lead-rescue.ts` computing elapsed time against the existing
  `numberParam`/policy pattern, firing `lr-t14` when exceeded.
- A minimal, explicitly-labeled invocation path (a script or a single route) that runs that
  check against the persisted waiting incidents — not a production scheduler service.
- A new or extended scenario, plus direct tests, proving the falsifying conditions below.
- Possibly a small, low-cost addition to the UI showing which incidents are currently
  waiting and since when — a natural byproduct, not a separate initiative.

**Non-scope.** No live webhook/inbound channel. No real outbound send/email provider. No
queue/job service. No changes to Systems 2–6 (though see Reuse). No evaluation/scoring
harness. No secrets/credentials work. No maturity promotion decided in advance of
verification.

**Verification (falsifying tests).**
1. A wait that has genuinely elapsed (real clock comparison, not fixture-authored ordering)
   fires `lr-t14` with a correct decision/escalation record.
2. A wait that has not elapsed produces no transition and no side effect.
3. State survives a simulated process restart — the store is torn down and reconstructed
   from its durable backing, and a waiting incident is still found and correctly
   re-evaluated.
4. The existing idempotency/authority guarantees hold here too: a duplicate re-evaluation of
   an already-resolved wait produces zero additional transitions or effects, reusing the
   existing ledger machinery rather than inventing new deduplication logic.

**Maturity impact.** Lead Rescue does **not** move to `PARTIALLY_LIVE` — nothing external is
contacted. The defensible claim, *if and only if* the implementation pass actually delivers
and verifies the above, is `INTERACTIVE_PROTOTYPE`: still explicitly `NOT_LIVE`
(`lib/model/system.ts:40`, `NOT_LIVE` includes `INTERACTIVE_PROTOTYPE`), but for the first
time anywhere in the portfolio, a property genuinely depends on real elapsed time and a
real process boundary rather than authored fixture ordering. This assessment does not award
that promotion — it names the bar the next pass must clear, and clearing it must be
independently re-verified, not assumed from this document.

**Commercial demonstration gain.** A viewer will, for the first time, be able to watch a
waiting incident *not* resolve when re-checked too early, and *correctly* escalate when
re-checked after the real window — the exact property today's demo cannot show, because
today's "wait" has no independent question to ask at all.

**Reusable capability gained.** This closes the single most-repeated specific gap in the
portfolio's own history, now confirmed at the code level: Client Onboarding's entire
`BLOCKED` state and 7 of its 17 declared transitions (`co-t07`, `co-t09`, `co-t13`–`co-t17`)
are unexercised for exactly this reason; Dormant Pipeline Recovery's cadence-due retries and
cooling-off transitions (`dp-t10`, `dp-t11`, `dp-t15`–`dp-t17`) have the identical shape;
Receivables' `PAYMENT_PROMISED`-elapsed check is today driven only by a fixture-authored
follow-up evaluation event, not a real one. One mechanism, proven once on Lead Rescue,
directly transfers to three other systems' most-recurring self-reported gaps.

### 6.1 Why this outranks the alternatives

- **Persistence as a standalone initiative** — rejected: no falsifiable target on its own;
  exactly the premature-infrastructure trap the brief warns against. Folded in here only to
  the exact size wait/resume requires.
- **A live trigger (webhook) first** — rejected: would make the portfolio's central
  reliability claim silently false the moment a second process or a restart occurs (§4).
- **A live outbound send first** — rejected: same durability problem, plus an unnecessary
  operational risk in a demo context.
- **Observability/run-history first** — rejected as the *first* move: there is nothing
  durable yet to observe across runs. Included here as a near-free byproduct once the store
  exists, not pursued as its own initiative.
- **An evaluation harness first** — rejected: answers "how good is the judgment," a
  legitimately separate question from "does the loop actually operate over real time,"
  which is the one still unresolved.

**Exit condition — stop and reassess before continuing.** Stop once: (a) the four falsifying
tests above pass for Lead Rescue specifically; (b) the durable store used is confirmed
genuinely minimal (one store, not a framework); and, critically, (c) **before** generalizing
the mechanism to Systems 2–6 or reaching for any queue/scheduler service. That
generalization is precisely the "built because production systems eventually need it"
temptation the brief warns against — it should wait for an independent confirmation, on a
second system actually touched, that the same shape of need recurs, not merely because it
is visible in three other systems' canon today.

---

## 7. Next reassessment point

Reassess after the work package above is implemented and its four falsifying tests pass —
before deciding whether to (a) generalize the mechanism to a second system, (b) reach for
any component currently classified `LIKELY LATER`, or (c) select the next Lead Rescue
capability. Do not chain directly into further Lead Rescue work from this document; the next
choice should be made from what the implementation pass actually learns, the same discipline
this assessment applied to the pass before it.
