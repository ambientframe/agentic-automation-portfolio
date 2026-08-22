# Status

**As of 2026-08-21 · Dormant Pipeline Recovery — horizontal fidelity move (System 2)**

## Portfolio maturity

**INTERACTIVE PROTOTYPE** — the application runs, all six systems are open and inspectable,
and two of them execute real operating logic: Lead Rescue against five scenarios and
Dormant Pipeline Recovery against two, including one that demonstrates dormancy alone
never grants outreach authority.

| # | System | Maturity | Runs? |
| --- | --- | --- | --- |
| 1 | Lead Rescue | `SIMULATED` | Yes — 5 scenarios execute end to end |
| 2 | Dormant Pipeline Recovery | `SIMULATED` | Yes — 2 scenarios execute end to end |
| 3 | Call-to-Proposal Revenue Agent | `CONCEPT` | No |
| 4 | Client Onboarding Operator | `CONCEPT` | No |
| 5 | Receivables / Invoice Recovery Agent | `CONCEPT` | No |
| 6 | Owner Revenue Intelligence Agent | `CONCEPT` | No |

Systems 3–6 hold complete, schema-validated canon but no executable scenario. They are
labelled `CONCEPT` rather than `SIMULATED` deliberately — see
[CANON_DIVERGENCES.md §1](CANON_DIVERGENCES.md).

**This pass is horizontal, not deeper.** It does not touch Lead Rescue's behaviour and does
not add a sixth failure class to its register. The purpose was to prove the architecture
built for one system supports a materially different one — a reactivation lifecycle with
its own re-entry principle, not a copy of Lead Rescue's intake funnel — without becoming
either a Lead-Rescue-specific framework or a generic universal workflow engine. See
"Architecture falsification result" below for what that test actually found.

## What is REAL

Real in the sense of *actually executing code*, not *connected to the outside world*.
Nothing here touches a network.

Everything already true of Lead Rescue (the lifecycle state machine, the idempotency
ledger, the execution ledger, the event ledger, the authority gate, the policy gate,
deterministic decisions, schema validation of all canon, profile consistency) is
unchanged and still holds, and now also holds for Dormant Pipeline Recovery, running
through the *same* engine core with zero changes to `lib/engine/reducer.ts` or
`lib/engine/run.ts`.

New this pass:

- **A genuine date-based re-entry-reason computation.** "Has the configured recycle date
  arrived, or has the recorded objection's expiry passed?" is a real string comparison
  against the event's own `occurredAt`, evaluated by `reEntryReasonFor()`. It is not a
  narrated "yes" — a record whose configured date has not yet arrived genuinely fails the
  check, and the eligible-reactivation scenario's expected outcome depends on that
  comparison actually running.
- **Ordered deterministic gates ahead of any bounded judgment.** Consent, then
  active-account status, then re-entry reason, then attempt-budget capacity — all four
  evaluated, in that declared order, before a candidate reactivation is ever prepared.
  The suppressed-recovery scenario proves the ordering matters: a textbook-qualifying
  recycle trigger is computed and then made irrelevant by the earlier consent gate.
- **A runnable-system registry** (`lib/engine/registry.ts`). Small and additive: a flat
  array plus a lookup function, introduced because the simulator and portfolio-index pages
  previously imported Lead Rescue's system, handlers, and fixtures by name. It does not
  touch the engine core.

## What is SIMULATED

Unchanged in kind from Lead Rescue, now also true of Dormant Pipeline Recovery:

- **Every side effect.** Nothing left this process. The one reactivation approach and the
  one record write in the eligible-reactivation scenario are both `executionMode:
  'SIMULATED'`.
- **The bounded AI judgment.** Reply interpretation is replayed from an authored fixture
  through the same `DecisionProvider` port Lead Rescue uses. **No model is called.**
- **The business.** Ferro Analytics, Solmark Insurance Services, and every other detail are
  invented, consistent with Kestrel Compliance Group's existing fixture economics.
- **All timestamps.** Authored in fixtures. The engine never reads a clock.

Dormant Pipeline Recovery's scenarios do not use the `SideEffectExecutor` port at all —
see "What did not generalize" below for why that was a deliberate choice, not an omission.

## Architecture reuse: what worked without changes

Confirmed by actually building the second system, not asserted in advance:

- **`lib/engine/reducer.ts` and `lib/engine/run.ts` — zero changes.** Both were already
  generic over `SystemDefinition` + `BusinessProfile` + `SystemHandlers`. Transition
  legality, idempotency, the authority gate, and the two-phase judgment-resolution split
  all worked immediately for a second system's own states, transitions, and event types.
- **`DecisionProvider` / `FixtureDecisionProvider` — zero changes.** The reply-interpretation
  judgment for Dormant Pipeline Recovery is resolved through the identical port and fixture
  class Lead Rescue uses.
- **`lib/model/system.ts`, `lib/model/profile.ts`, `lib/model/provenance.ts`,
  `lib/model/runtime.ts` — zero schema changes.** The Dormant Pipeline Recovery system
  definition authored during the earlier design pass was already schema-valid and needed
  no new fields; only its `maturity`, `fidelityNote`, two `failureModes[].verificationTest`
  entries, and two additional `metrics` entries changed.
- **The Kestrel profile — zero changes.** `dormantMaxAttempts`, `dormantWindowDays`, and
  `dormantCoolingOffDays` already existed as `operatingParameters`, already linked to
  `kestrel-outreach-cadence`, from the Lead Rescue era. `kestrel-suppression-immediate`
  already named Dormant Pipeline Recovery in its `appliesTo` text. The declared
  `dp-lab-sequence-contract` standard already named all six sequence-policy concepts
  (entry, cadence, maximum attempts, exit, suppression, re-entry) the work for this pass
  needed represented — it did not need to be written.
- **`app/layout.tsx` (masthead and footer) — zero changes.** Both already derive their
  counts from `ALL_SYSTEMS` generically; the maturity change was picked up automatically.
- **The `Simulator` and badge components — zero changes.** Fully generic over the runtime
  model already; Dormant Pipeline Recovery's timeline renders through the identical
  components Lead Rescue's does.
- **The test patterns generalized, not the test code.** `tests/systems.test.ts`,
  `tests/provenance.test.ts`, `tests/decision-provider.test.ts`,
  `tests/side-effect-executor.test.ts`, and `tests/seam.test.ts` already parametrize over
  `ALL_SYSTEMS` or are system-agnostic; they needed no edits and were already exercising
  Dormant Pipeline Recovery's canon before this pass.

## What did not generalize, and was not forced to

- **The handler is entirely new code**, not a shared abstraction. `dispositionFor`,
  `humanTarget`, the payload schemas, the state-name string literals, and the idempotency
  key conventions are all Dormant-Pipeline-Recovery-specific, exactly as Lead Rescue's own
  handler is Lead-Rescue-specific. The *shape* repeats (deterministic gates → bounded
  judgment → deterministic disposition → human decision), not the code.
- **`readJudgmentId` stays duplicated**, not extracted into a shared helper, matching Lead
  Rescue's own existing choice to keep handlers dependency-light on engine orchestration.
  A five-line duplicate across two handlers is the deliberate cost of that isolation, not
  an oversight.
- **The `SideEffectExecutor` port was not used.** Dormant Pipeline Recovery's one simulated
  contact attempt uses the plain always-succeeds effect path (the same one most Lead Rescue
  effects use), not execution-outcome tracking. Nothing in either required scenario needed
  an uncertain provider outcome, and building one in to "use both ports" would have been
  complexity added for its own sake. The port is proven reusable by Lead Rescue's own
  scenario; a second system does not need to re-prove it to remain honest about its
  existence.
- **No multi-step autonomous follow-up loop was built.** The cadence-retry cycle
  (`AWAITING_RESPONSE` → `REACTIVATION_ATTEMPTED` → `AWAITING_RESPONSE` again on silence,
  and eventually `ATTEMPTS_EXHAUSTED`) is fully declared in the system's transition table
  from the earlier design pass, but this iteration's handler does not implement a "cadence
  due, still no reply" event at all — only the one despatch the brief called for. The
  sequence-policy contract is represented and inspectable; the loop it bounds is not yet
  built, on instruction.

## Architecture falsification result

The work was explicitly framed as a test of whether the Lead Rescue architecture is
reusable or accidentally Lead-Rescue-shaped. The answer, from having actually built the
second system rather than argued about it in advance:

**The engine core and the ports are the genuinely cross-system layer; everything else is
domain-specific by design, and that boundary held with no adjustment.** Zero lines changed
in `lib/engine/reducer.ts`, `lib/engine/run.ts`, `lib/engine/ledger.ts`,
`lib/ports/decision-provider.ts`, or `lib/ports/side-effect-executor.ts`. The only new
shared code is `lib/engine/registry.ts` — a UI-layer concern (which scenario belongs to
which system), not an engine concern, and it stays a flat array rather than growing into a
plugin system. This is the "small shared execution kernel plus domain-specific operating
logic" shape the work called for, not a second independent engine and not one generic
engine full of system-name conditionals.

**One real design mistake was caught and fixed during implementation, not before it.** The
first draft of the attempt-budget check transitioned an exhausted record directly from
`SCHEDULED` to `ATTEMPTS_EXHAUSTED` — a transition the declared table does not permit;
`ATTEMPTS_EXHAUSTED` is only reachable from `AWAITING_RESPONSE` (`dp-t11`), because the
original design correctly modelled it as something that happens organically within a live
cadence cycle, not on a fresh evaluation. A test written against this ("attempts already
exhausted from a prior cycle") failed with a rejected transition, which is exactly what the
engine core is supposed to do to an illegal move — it caught a bug in the new handler,
the same way an undeclared transition caught a defect in Lead Rescue's own handler during
its original build. The fix moved the capacity check earlier, into the same deterministic
step that decides the re-entry reason, so an already-exhausted record is archived from
`ELIGIBILITY_REVIEW` (a legal move) rather than granted a `SCHEDULED` status it has no
attempt capacity left to act on.

**The payload-schema boundary needed no correction.** The non-strict-handler-schema /
strict-canonical-envelope split that Lead Rescue's reliability pass arrived at already
satisfies Dormant Pipeline Recovery's needs with no change: an evaluation payload carrying
a field the handler does not declare parses successfully (Zod's default `z.object()`
strips it) and never reaches a decision, a fact, or a side effect —
`tests/dormant-pipeline-recovery.test.ts`'s *"strips an unrecognised payload field..."*
test asserts this directly against the second system rather than assuming the first
system's fix generalizes.

## Verification

```
npm run verify     # typecheck + lint + 203 tests
npm run build      # 17 pages prerender; the engine runs at build time
npm run docs       # regenerate canon from the model
```

All passing. Visual inspection performed at desktop and mobile widths, in both colour
schemes, on both new scenario pages and the Dormant Pipeline Recovery dossier; no
horizontal overflow, and badge/decision-panel colouring renders identically to the
existing Lead Rescue pages since both share the same components unchanged.

## Known fidelity gaps

1. **Four systems do not run.** Canon exists for Call-to-Proposal, Client Onboarding,
   Receivables, and Owner Revenue Intelligence; no scenario replays through the engine for
   any of them.
2. **Three Lead Rescue failure classes remain modelled only**, unchanged by this pass:
   malformed payload, out-of-order events at the business-entity level, and human approval
   timeout.
3. **Three Dormant Pipeline Recovery failure classes remain modelled only**: stale data
   read at despatch time, wrong-entity matching, and provider rate-limiting mid-cycle. The
   first two would need a second contact/account-matching concept this iteration
   deliberately did not build; the third would need the `SideEffectExecutor` port wired in,
   which — as above — neither required scenario needed.
4. **The cadence-retry loop is declared, not executable.** `SCHEDULED` →
   `REACTIVATION_ATTEMPTED` → `AWAITING_RESPONSE` → (silence) → `REACTIVATION_ATTEMPTED`
   again → eventually `ATTEMPTS_EXHAUSTED` → `COOLING_OFF` is a real, legal path through
   the declared transition table, and the sequence-policy contract that bounds it
   (`dp-lab-sequence-contract`, `kestrel-outreach-cadence`) is fully represented and cited
   by the one despatch this iteration does execute — but no event type exists yet to drive
   a second attempt when the first gets silence rather than a reply.
5. **No reliability/evidence view.** Unchanged from the prior pass.
6. **The simulator steps a completed run**, not a true step-execute, for both systems.
7. **No persistence.** Unchanged from the prior pass; still why neither system is close to
   `PARTIALLY_LIVE`.

## Single recommended next fidelity gap

Two comparable options, same as the prior pass's framing, now with one more data point:

**Close the cadence-retry gap in Dormant Pipeline Recovery** (a "no response, cadence due,
retry" event plus its handler, exercising `dp-t10`/`dp-t11`/`dp-t15`/`dp-t16`/`dp-t17` and
retiring `dp-fm-duplicate-outreach`'s sibling concern about concurrent-sequence
duplication), **or pick one of systems 3–6 and author its first scenario.**

Deepening Dormant Pipeline Recovery has a specific advantage the last two passes didn't:
the sequence-policy contract is already fully declared and now proven inspectable by a real
despatch, so the retry loop's boundaries (entry, cadence, maximum attempts, exit,
suppression, re-entry) are already written down and cited — building the loop would be
implementing an already-specified contract, not designing one from scratch. Widening to a
third system has the portfolio-breadth argument the last pass also made, and is now
supported by concrete evidence that the architecture generalizes cleanly a second time.

**Do not begin real n8n implementation yet.** The next fidelity gap should continue to be
selected from evidence the build produces, not assumed in advance.
