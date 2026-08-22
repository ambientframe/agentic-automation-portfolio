# Status

**As of 2026-08-22 · Receivables / Invoice Recovery Agent — the fifth system, and the
horizontal portfolio's last system built from an already-authored CONCEPT canon rather
than from nothing**

## Portfolio maturity

**INTERACTIVE PROTOTYPE** — the application runs, all six systems are open and inspectable,
and five of them execute real operating logic: Lead Rescue against five scenarios, Dormant
Pipeline Recovery against two, Call-to-Proposal Revenue Agent against two, Client
Onboarding Operator against two, and Receivables / Invoice Recovery Agent against two,
plus one smaller executable path exercising a third declared transition pair in
Call-to-Proposal.

| # | System | Maturity | Runs? |
| --- | --- | --- | --- |
| 1 | Lead Rescue | `SIMULATED` | Yes — 5 scenarios execute end to end |
| 2 | Dormant Pipeline Recovery | `SIMULATED` | Yes — 2 scenarios execute end to end |
| 3 | Call-to-Proposal Revenue Agent | `SIMULATED` | Yes — 2 scenarios execute end to end |
| 4 | Client Onboarding Operator | `SIMULATED` | Yes — 2 scenarios execute end to end |
| 5 | Receivables / Invoice Recovery Agent | `SIMULATED` | Yes — 2 scenarios execute end to end |
| 6 | Owner Revenue Intelligence Agent | `CONCEPT` | No |

System 6 holds complete, schema-validated canon but no executable scenario, per the same
rule recorded in [CANON_DIVERGENCES.md §1](CANON_DIVERGENCES.md). It is now the only
remaining `CONCEPT` system — the horizontal portfolio is one system away from complete.

**This pass built the fifth system from an already-authored CONCEPT canon**, not from a
blank page: the lifecycle graph (12 states, 33 transitions), metrics, standards, and
failure modes for Receivables / Invoice Recovery Agent already existed, written before any
scenario proved them out. The central question this pass answered was whether that
pre-authored canon actually held together once forced through a real handler and a real
scenario — it did, needing zero new lifecycle states or transitions, because the existing
`ESCALATED`/`DISPUTED` states and a `collectionEscalationDays` parameter the profile had
already declared were exactly what the handler needed. This is also the portfolio's second
genuine use of two bounded-judgment ports on the same input: a reply is classified (dispute
/ promise / neither) through `DecisionProvider`, exactly as Dormant Pipeline Recovery
established, and — only when it reads as a promise — a committed date is extracted with
citation through `ExtractionProvider`, exactly as Call-to-Proposal established. Neither
port changed. See "Receivables / Invoice Recovery Agent — this pass" below.

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

## What is REAL

Real in the sense of *actually executing code*, not *connected to the outside world*.
Nothing here touches a network.

Everything already true of Lead Rescue, Dormant Pipeline Recovery, and Call-to-Proposal —
the lifecycle state machine, the idempotency ledger, the event ledger, the authority gate,
the policy gate, deterministic decisions, schema validation of all canon, profile
consistency — is unchanged and still holds, and now also holds for Client Onboarding,
running through the same reducer and the same two-phase runner.

New this pass:

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
- **All timestamps.** Authored in fixtures. The engine never reads a clock.
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
npm run verify     # typecheck + lint + 310 tests
npm run build      # 23 pages prerender; the engine executes at build time
npm run docs       # regenerate canon from the model
```

All passing. Visual inspection performed on the portfolio index (now reading "5 SIMULATED ·
1 CONCEPT"), the Receivables dossier, and both new scenario pages — the run-summary panel's
existing generic counters render correctly with no new UI component: scenario A shows 7
steps, 4 transitions accepted, 0 rejected, 2 effects executed (the two reminders), 2 keys
claimed; scenario B shows 7 steps, 5 transitions accepted (three bucket hops in one event,
the dispute, and the resolution), 0 side effects, matching the "a dispute halts everything"
claim exactly.

## Known fidelity gaps

1. **One system does not run.** Owner Revenue Intelligence Agent holds complete,
   schema-validated canon but no scenario replays through the engine.
2. **Two Lead Rescue, three Dormant Pipeline Recovery, and two Call-to-Proposal transitions
   remain declared but unexercised**, unchanged by this pass.
3. **Four Client Onboarding transitions are declared but unexercised**: `co-t07`/`co-t09`
   (wait-elapsed timeouts) have no driving event, and `BLOCKED` itself — `co-t13` in,
   `co-t14`/`co-t15` out — is never reached by either scenario. Checked twice now (the
   boundary-closure pass and this one) for a natural fit and found none both times — every
   corruption path exercised so far resolves to a validation refusal, `NEEDS_HUMAN`, or (in
   Receivables) `ESCALATED`, never a genuine "waiting on something outside the system's
   control" condition — so this remains open rather than being forced a third time.
4. **One of Client Onboarding's two declared AI-judgment surfaces is not exercised**
   (interpreting whether a customer reply supplies a requested item); the other was narrowed
   to state explicitly that it does not apply to a structured, translated handoff.
5. **Several Receivables transitions and both human-only actions beyond dispute resolution
   are declared but not exercised through a full scenario**: `PAYMENT_PLAN` and
   `WRITE_OFF_REVIEW`/`WRITTEN_OFF` have no driving event yet; dispute-timeout-to-`ESCALATED`
   (`rr-t29`) is undriven; and `DUE_SOON`/`PAST_DUE_61_90` accepting a dispute reply and
   `PAST_DUE_90_PLUS` accepting neither a dispute nor a promise reply (a real, minor canon
   asymmetry this pass found and left as-is rather than generalising without a scenario to
   justify it) are untested directly. Escalation, partial payment, and a broken promise are
   exercised directly rather than through a full scenario, per the same "smallest necessary"
   discipline the other four systems' gap lists already reflect.
6. **The scope-drift and precedence gates cover one field pattern each** (Client Onboarding);
   the dispute/promise classification and date-extraction judgments are proven on one
   ambiguous-reply shape each (Receivables). A production system would need more synthetic
   variations to be confident across each system's full requirement catalog.
7. **No reliability/evidence view, no true step-execute simulator, no persistence.**
   Unchanged from every prior pass; still why none of the five running systems is close to
   `PARTIALLY_LIVE`.

## Single recommended next fidelity gap

**Widen to Owner Revenue Intelligence Agent's first scenario.** This is now the only
`CONCEPT` system left, and the portfolio's own governing build strategy — explore all six
systems to credible simulated depth before vertically hardening any one of them — makes
completing the horizontal pass the highest-leverage move available, not a default
assumption: this pass re-confirmed the architecture generalises with zero core changes for
a third consecutive system built from a pre-authored canon (Receivables needed no new
lifecycle states, transitions, or profile fields, and reused both existing bounded-judgment
ports unmodified), so there is no accumulating cross-cutting defect that would justify
interrupting breadth to go fix something narrower first. The two deferred, single-system
gaps that keep recurring — Client Onboarding's `BLOCKED` state and Dormant Pipeline
Recovery's cadence-retry loop — remain genuinely smaller and lower-priority than finishing
the sixth system, for the same reason widening lost to closing gaps in the prior two
passes: once the sixth system exists, the portfolio's breadth claim is complete and every
remaining gap becomes a candidate for the *next* kind of decision — which single-system gap
to close, or when to begin pushing Lead Rescue toward production depth — made from a
finished horizontal baseline instead of a partial one.

**Do not begin real n8n implementation yet, and do not begin Lead Rescue production
hardening before Owner Revenue Intelligence exists.** The next fidelity gap should continue
to be selected from evidence the build produces, not assumed in advance.
