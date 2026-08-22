# Status

**As of 2026-08-22 · Client Onboarding Operator — the first cross-system handoff, a third
port for a problem shape neither existing port fit, and a fidelity-closure pass proving
that handoff is translated from authoritative upstream state rather than merely
resembling it**

## Portfolio maturity

**INTERACTIVE PROTOTYPE** — the application runs, all six systems are open and inspectable,
and four of them execute real operating logic: Lead Rescue against five scenarios, Dormant
Pipeline Recovery against two, Call-to-Proposal Revenue Agent against two, and Client
Onboarding Operator against two, plus one smaller executable path exercising a third
declared transition pair in Call-to-Proposal.

| # | System | Maturity | Runs? |
| --- | --- | --- | --- |
| 1 | Lead Rescue | `SIMULATED` | Yes — 5 scenarios execute end to end |
| 2 | Dormant Pipeline Recovery | `SIMULATED` | Yes — 2 scenarios execute end to end |
| 3 | Call-to-Proposal Revenue Agent | `SIMULATED` | Yes — 2 scenarios execute end to end |
| 4 | Client Onboarding Operator | `SIMULATED` | Yes — 2 scenarios execute end to end |
| 5 | Receivables / Invoice Recovery Agent | `CONCEPT` | No |
| 6 | Owner Revenue Intelligence Agent | `CONCEPT` | No |

Systems 5–6 hold complete, schema-validated canon but no executable scenario, per the same
rule recorded in [CANON_DIVERGENCES.md §1](CANON_DIVERGENCES.md).

**This pass stresses a materially different problem class from the first three systems.**
Lead Rescue, Dormant Pipeline Recovery, and Call-to-Proposal all reason about information
that is already in hand — a lead, a dormant record, a transcript — and decide what to do
with it. Client Onboarding starts one step earlier: a signed commercial fact has to become
a coordinated operating environment without losing context, re-asking for what is already
known, duplicating infrastructure, or mishandling a credential. The central risk this pass
tests is not "did we assert something nobody said" but "did we lose, duplicate, or leak
something we already had." It is also the portfolio's first genuine cross-system test: the
handoff into this system continues Call-to-Proposal's own Bramwell Data opportunity rather
than a fresh, disconnected fixture — and, as of this pass, is provably *translated* from
Call-to-Proposal's authoritative admitted claims rather than merely narrated to resemble
them (see "Cross-system boundary closure" below).

## Cross-system boundary closure (this pass)

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
npm run verify     # typecheck + lint + 280 tests
npm run build      # 21 pages prerender; the engine executes at build time
npm run docs       # regenerate canon from the model
```

All passing. Visual inspection performed at desktop and mobile widths, in both colour
schemes, on the portfolio index, the Client Onboarding dossier, and both new scenario pages;
no horizontal overflow, and the run-summary panel's existing generic counters (transitions
accepted/rejected, effects executed, duplicates suppressed, keys claimed) render the new
system's numbers correctly with no new UI component — including, on the duplicate-scenario
page, the pairing of "1 transition rejected" with "2 duplicates suppressed" that is the
whole point of that scenario.

## Known fidelity gaps

1. **Two systems do not run.** Canon exists for Receivables and Owner Revenue Intelligence;
   no scenario replays through the engine for either.
2. **Two Lead Rescue, three Dormant Pipeline Recovery, and two Call-to-Proposal transitions
   remain declared but unexercised**, unchanged by this pass.
3. **Four Client Onboarding transitions are declared but unexercised**: `co-t07`/`co-t09`
   (wait-elapsed timeouts) have no driving event, and `BLOCKED` itself — `co-t13` in,
   `co-t14`/`co-t15` out — is never reached by either scenario. All three are small,
   well-scoped additions to the existing handler, not a redesign. This pass's boundary-closure
   and secure-access work were checked for a natural `BLOCKED` fit and did not find one — every
   corruption path they exercise resolves to a validation refusal or `NEEDS_HUMAN`, not a
   "waiting on something outside the system's control" condition — so this remains open rather
   than being forced.
4. **One of two declared AI-judgment surfaces is not exercised.** Both scenarios use
   structured, schema-validated intake, so `DecisionProvider`/`ExtractionProvider` are not
   invoked. This pass narrowed the free-text-interpretation judgment's own canon wording to
   state explicitly that it does not apply when the inbound handoff is already a structured,
   translated artifact — which this pass just proved is the Bramwell path — rather than leaving
   the canon implying a judgment this system's real behaviour never actually calls. The second
   judgment (interpreting whether a customer reply supplies a requested item) remains genuinely
   open and unrelated to this pass's scope.
5. **The scope-drift and precedence gates cover one field pattern each.** `admitOnboardingTask`
   and `resolveAuthoritativeValue` are proven correct and are exercised for real, but a
   production system would need more than one synthetic drifting-task shape and more than
   one genuine handler-level conflict scenario to be confident across the full requirement
   catalog.
6. **No reliability/evidence view, no true step-execute simulator, no persistence.**
   Unchanged from the prior three passes; still why none of the four running systems is
   close to `PARTIALLY_LIVE`.

## Single recommended next fidelity gap

This pass closed the cross-system boundary gap and a secret-screening gap in the
secure-access path, both found by direct red-team rather than assumed in advance; it
deliberately left `BLOCKED` deferred (see gap 3 above) rather than forcing an artificial
fixture unrelated to boundary-contract fidelity. The prior recommendation therefore still
holds, now with a fifth data point:

Three comparable options, now with a fourth data point on how the architecture behaves
under load:

**Close Client Onboarding's own `BLOCKED`-state gap** (an event that records a blocking
condition, exercising `co-t13`/`co-t14`/`co-t15` and giving the "blocked time is measured,
not hidden" claim in the canon a scenario-level demonstration), **deepen Dormant Pipeline
Recovery's still-open cadence-retry loop** (the recommended-but-deferred option for three
passes running now), or **widen to a fifth system's first scenario**.

Widening has the weaker argument this time, for a reason specific to what this pass found:
Client Onboarding's own canon already promised more than this pass's two scenarios exercise
— the `BLOCKED` state, two wait-elapsed transitions, and both declared AI-judgment surfaces
are real, schema-valid, currently-unreachable parts of a system this document now calls
`SIMULATED`. Widening to a fifth system before closing gaps in the fourth would repeat the
exact pattern DPR's cadence-retry loop has already demonstrated is easy to keep deferring —
three passes running, per the note above. Closing Client Onboarding's `BLOCKED`-state gap is
the smallest of the three options, uses infrastructure this pass already built (the task
model's `BLOCKED` status is already computed; nothing currently drives the lifecycle state
that shares its name), and would make the newest system's own maturity claim measurably more
honest before the portfolio's breadth claim grows again.

**Do not begin real n8n implementation yet.** The next fidelity gap should continue to be
selected from evidence the build produces, not assumed in advance.
