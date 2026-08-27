# Checkpoint

> One per accepted package (Constitution §14). Repository truth is authoritative; this file
> is an index, not a source. Append the new checkpoint above the previous one.

## Current — A state you can enter and never be forced out of · 2026-08-27

**Verified state.** `npm run verify`: 62 files, 971 passed / 1 skipped, exit 0. `npm run build`:
exit 0, 39 static pages. Four abandonable parked states published in
`data/parked-state-attention.ts`.

**How this package was chosen.** Not from a plan — from a wrong claim I made an hour earlier.
Pattern #21's "reusable" line asserted Client Onboarding's readiness sign-off was the obvious
next taker. Checking it found Client Onboarding declares no human-attention failure mode at all,
and only two exist portfolio-wide. The claim is corrected in the ledger, and #22 exists so that
nothing can make it again without being caught.

**The question nobody had asked the graph.** `validateLifecycle` refuses a `DEAD_END_STATE` — a
non-terminal state with no exit. It passes cleanly over the sibling condition: a state whose
every declared exit needs a `HUMAN_DECISION`, so the only thing that can move the case is the
party it is already waiting on. That is not a defect on its own — it is the normal shape of
human review. The defect is the pair: **no self-driven exit AND no declared attention
mechanism**. Four states across four systems are in that pair, and each is named with its exits
rather than counted.

**Prose became data, for the same reason as last time.** `HOLDS_POSITION` carried only a note,
so "holds position *where*" was unanswerable and no audit could distinguish a covered parked
state from an uncovered one. `holdsAt` is now declared, validated to resolve to real states, and
required for `HUMAN_APPROVAL_TIMEOUT` — an attention claim that will not say where it applies
cannot be checked.

**It found a live canon/code contradiction on its first run.** `lr-fm-approval-timeout` declared
`shape: 'MOVES'` (`NEEDS_HUMAN -> ESCALATED`) while its own verification test said "without
transitioning lifecycle state", the handler doctrine said never setting `transitionTo` "is the
entire point", and the note under that MOVES said "it never decides the case". Nothing caught it
because the movement is genuinely buildable — a person performs lr-t23, the timeout never does —
so `validateLifecycle` passed. Corrected to `HOLDS_POSITION`; **no existing test broke**, which
is the measure of how invisible it was.

**Falsification and mutation.** 15 tests written RED first. 9 targeted mutations; one survived —
"a bounded judgment counts as the system acting", unreachable from the real model because no
parked state declares such an exit. Repaired by driving it directly with a synthetic fixture,
the same repair `creditedRuleIds` got in #20, not by explaining it away. Both files restored
byte-for-byte and verified by SHA-256.

**Maturity.** Unchanged. $0 spent, no provider crossed, no gated variable set.

**Pattern earned.** #22 — a state you can enter and never be forced out of, asked of the graph
rather than of the reviewer.

**Next package.** NOT SELECTED. Following #20's own precedent, the natural successor is to put
this list where a buyer sees it — #20 landed the mechanism and the pass after it took the figure
to the surface. The other standing candidate is unchanged and larger: Execution 2 → 3, no side
effect has yet crossed to anything off this machine, which is gated on the owner. Owner
sequences.

## Earlier — The last Pending standard closes, and names nobody · 2026-08-27

**Verified state.** `npm run verify`: 61 files, 956 passed / 1 skipped, exit 0. `npm run build`:
exit 0, 39 static pages. Call-to-Proposal scenarios 2 → 3; portfolio 21 → 22. Lead Rescue
coverage unchanged at 18 of 37; Call-to-Proposal unchanged at 8 of 18 — see below, that is the
finding, not an omission.

**Proof claim earned.** `cp-fm-approval-timeout` was the last Pending standard with a clear
shape. Its declared prevention — "Named approver and review window assigned at the moment of
routing" — is now executed at cp-t11, and its declared recovery — "escalate to the next approver
in the authority chain" — is resolved strictly above the assigned approver's own authority
ceiling, so a draft can never be escalated to the person who is already not responding.

**Implementing the prevention faithfully found something.** Kestrel's Operations Coordinator and
Finance tie at the proposal authority ceiling, so `resolveEscalationOwner` names nobody — which
means the failure mode's own second declared cause, "no named approver assigned at routing
time", is Kestrel's standing condition rather than an edge case. The routing step records that
verbatim and invents no one; the overdue report says the draft was never assigned rather than
that a reviewer is late. Whether to change the fiction so a proposal approver is nameable is an
owner decision, deliberately not taken here.

**The authority ladder is closed, which forced the honest branch.** `AuthorityLevel` has no rung
above 4, so "this approver is already the final escalation point" could not be expressed as a
level and became its own verdict: the exhausted chain is recorded and nobody is notified,
because the only reachable person is the one already asked.

**Zero transition coverage, by construction.** `recoveryPath.shape: 'HOLDS_POSITION'` means no
branch sets `transitionTo`, so the engine's legality gate is never invoked — and a mechanism
that makes no lifecycle move cannot register on a metric that counts lifecycle moves. The
coverage guard did not fire, and that silence is now published rather than assumed.

**Guards caught the collateral.** The generated docs, the Call-to-Proposal scenario-slug list,
and the README's runnable total all failed on this change. None was found by reading.

**Falsification and mutation.** 13 tests written RED first — the first RED was the profile
refusing to let a threshold be hard-coded. 9 targeted mutations, all killed, file restored
byte-for-byte and verified by SHA-256. One mutation (a one-tick window-boundary slip) survived
the first pass and earned a boundary test rather than an explanation.

**Maturity.** Unchanged. $0 spent, no provider crossed, no gated variable set.

**Pattern earned.** #21 — Escalation is a sequence, not a level: a timeout must know who was
already asked, and "nobody" changes the escalation rather than leaving a blank to fill.

**Next package.** NOT SELECTED. Two candidates with a clear shape, in order of my preference:
(a) inherit #21 into Client Onboarding's readiness sign-off, the obvious next taker and cheap;
(b) the standing Execution 2 → 3 blocker — no side effect has crossed to anything off this
machine — which is the only reference-exit blocker left and is not cheap. Owner sequences.

## Earlier — The published gap was used as a backlog: 15 → 18 of 37 · 2026-08-27

**Verified state.** `npm run verify`: 60 files, 943 passed / 1 skipped, exit 0. `npm run build`:
exit 0. Lead Rescue coverage **15 → 18 of 37 (41% → 49%)**; scenarios 8 → 10, portfolio 19 → 21.

**Proof claim earned.** The coverage panel listed `lr-t02`, `lr-t30` and `lr-t32` as moves no
scenario drives — the malformed-payload retry path, closed by unit test hours earlier so it
worked and nobody could watch it. Two authored scenarios put it on the simulator shelf. This is
the first demonstration that publishing the gap closes gaps rather than merely confessing them.

**Two scenarios, because they are alternative exits from one state.**
`malformed-payload-corrected`: a form rebuilt overnight posts its own field names, the system
refuses to guess the mapping and acknowledges nothing to a contact it cannot identify, then
rejoins the ordinary path when the form is fixed. `malformed-payload-unreadable`: a partner API
on the wrong contract posts the identical payload four times — three hold position, the fourth
exhausts the budget and reaches a person with the payload, errors and attempt count attached.

**A pin retired, not deleted.** `lr-t30`/`lr-t32` were the standing example of "closed by test,
still unwatchable"; they are replayable now, so the pin moved to `lr-t31`, which `lr-fm-malformed`
still declares and nothing drives. The failure message says to move it rather than remove it.

**Four guards caught the collateral.** The proof-route journey count, the scenario-slug list, the
walkthrough's incident count and the README's runnable total all failed on the 8 → 10 change.
None was found by reading.

**Maturity.** Unchanged. $0 spent, no provider crossed.

**Pattern earned.** None — this consumes #20's output.

**Next package.** NOT SELECTED. `cp-fm-approval-timeout` is the last Pending standard with a
clear shape; Call-to-Proposal has no attention-timeout mechanism and Lead Rescue's is the model.

## Earlier — The coverage figure reaches the buyer, and names its own gap · 2026-08-27

**Verified state.** `npm run verify`: 60 files, 940 passed / 1 skipped, exit 0. `npm run build`:
exit 0, 36 routes. 10 new tests; 8 targeted mutations, all caught after a repair — 2 survived
the first suite.

**Proof claim earned.** The coverage measurement now renders on `/lead-rescue` (Part Two · b)
and on all five `/proof/<slug>` pages, computed at build time by replaying that system's own
scenarios. Lead Rescue reads **15 / 37 · 41%**.

**Naming beats counting.** The 22 moves nothing drives are listed by id, states and trigger —
readable without the dossier. A number asks to be trusted; a list hands a sceptic the means to
check.

**Three caveats, each test-required.** Only engine-*accepted* moves are credited; an unlisted
move is usually unauthored rather than broken; and being covered by a unit test is not the same
as being replayable — so the figure **understates correctness** while stating inspectability
accurately.

**Two mutations survived first, both real.** Deleting the unit-test caveat passed because a
different caveat also contains the words "unit test"; the assertion now requires the
load-bearing phrase. Removing the sort passed because today's transitions are declared in id
order, so it is now driven with shuffled input rather than deleted.

**Walkthrough re-captured, not assumed.** The page changed, so all nine frames were retaken at
`dc4307d` and re-timed to eight beats totalling 90s, including a new coverage beat that admits
two of the 22 were closed by unit test hours earlier and still cannot be watched.

**Maturity.** Unchanged. $0 spent, no provider crossed.

**Pattern earned.** None — this renders #20 rather than adding residue.

**Next package.** NOT SELECTED.

## Earlier — Buildable is not built: 57 of 139 · 2026-08-27

**Verified state.** `npm run verify`: 59 files, 930 passed / 1 skipped, exit 0. `npm run build`:
exit 0. 9 new tests; 6 targeted mutations of the coverage mechanism, all caught.

**Proof claim earned.** How much of each system a visitor can actually watch is computed by
replaying all 19 scenarios, not remembered. **57 of 139** declared transitions are exercised by
a replayable scenario. Only transitions the engine *accepted* are credited — a refusal is not a
demonstration of the thing refused.

**Scenario coverage, not test coverage.** A unit test proves a transition works; a scenario lets
someone watch it. This portfolio sells inspectability, so it measures the smaller number.

**It made this session's own work look worse.** `lr-t30`/`lr-t32` were closed by direct test
hours earlier and are listed as unexercised, because nobody can watch them. Closing a standard
and making it inspectable are different achievements; a test now pins that.

**Prose became data.** STATUS gaps 1–5 were hand-maintained lists updated from memory.
`data/transition-coverage.ts` holds them as data, reconciled against a real run, failing in both
directions so the snapshot cannot rot into the next `Pending`.

**A surviving mutation exposed an unreachable guard.** Removing the `accepted` check changed
nothing — every rejection the scenarios produce carries no `ruleId`. Rather than delete a guard
that is still right for a matched-but-refused move, the rule was extracted as `creditedRuleIds`
and driven directly.

**Also hardened.** `observation-integrity-evidence.test.ts` read the independent receiver's
transcript and never asserted on it: twenty tests guarded the sender, none guarded the receiver.
Test 21 now ties each verdict to the receiver's own byte counts.

**Maturity.** Unchanged. $0 spent, no provider crossed.

**Pattern earned.** #20 — buildable is not built.

**Next package.** NOT SELECTED. The coverage table is a strong candidate to render on the proof
surface, but a system earns a layer by acquiring the capability, not the component.

## Earlier — A malformed payload is retried, and the budget is real · 2026-08-27

**Verified state.** `npm run verify`: 58 files, 921 passed / 1 skipped, exit 0. `npm run build`:
exit 0. 10 new tests, 8 RED before implementation; 9 targeted mutations, all caught after a
repair — 2 survived the first suite.

**Proof claim earned.** `lr-fm-malformed` is closed. Entering `FAILED_RECOVERABLE` had worked
since the system was written and nothing had ever left it: `lr-t30`/`lr-t31`/`lr-t32` were
declared with no code, no event, no test. A case parked there with no exit is indistinguishable
from one being patiently retried — it reads as handling.

**Bounded in both directions.** `malformedRetryBudget` (3) is an operating parameter on a new
`kestrel-malformed-intake` policy. Below budget the handler requests no transition, because
staying put *is* the retry state. Exhausting it routes to `NEEDS_HUMAN` with the raw payload,
the validation errors, and the attempt count — never a terminal state the system chose itself;
`retry_indefinitely` and `close_as_terminal_failure` are named forbidden actions.

**`lr-t30` needed no new code.** A corrected redelivery already reaches `NORMALIZED` through the
ordinary success path, since the engine permits that transition from `FAILED_RECOVERABLE` too.

**Two mutations survived first, and the tests were wrong.** Redacting the validation errors
survived because the assertion read the serialised decision, where the same field names appear
in `missingInformation`. Relinking the budget to an unrelated policy survived because the
assertion only required *a* policy to exist. Both repaired to assert the specific field and the
specific policy statement.

**Maturity.** Unchanged. $0 spent, no provider crossed.

**Pattern earned.** None — this exercises #18's graph and the existing authority/idempotency
gates rather than adding residue.

**Still open.** 7 pending standards, 2 structurally unbuildable.

**Next package.** NOT SELECTED. Redeploy to publish this.

## Earlier — A build is only green if it is green somewhere else · 2026-08-27

**Verified state.** `npm run verify`: 57 files, 911 passed / 1 skipped, exit 0 — with and
without Playwright installed. `npm run build`: exit 0 both ways. 9 new tests; 6 targeted
mutations each confirmed to fail the suite, none survived.

**What happened.** The production deployment failed on `TS2307: Cannot find module 'playwright'`
after twenty seconds. `scripts/capture-walkthrough.ts` referenced Playwright at the type level,
and Playwright had been installed `--no-save` on purpose, so it existed in local `node_modules`
and in no manifest. `next build` type-checks the whole repository. Local gates had gone green
minutes earlier. My defect.

**Proof claim earned.** The script declares the slice of Playwright it calls as local interfaces
and loads the module through a variable specifier, so TypeScript never resolves it — fully
type-checked, and buildable on a machine that will never have the package. Proven by removing
`node_modules/playwright` and re-running both gates, then restoring it and re-running both again.

**The mechanism, not the correction.** `tests/dependency-honesty.test.ts` fails if any import
under `app/`, `components/`, `data/`, `lib/`, `scripts/`, or `tests/` resolves to a package
`package.json` does not declare, and pins this exemption specifically so it cannot be tidied
back into a static import.

**A second-order lesson worth keeping.** The first scanner reported twelve offenders and zero
defects — it read prose in comments and strings as imports. It now strips comments and requires
real import syntax, and disabling that stripping is itself a caught mutation.

**Maturity.** Unchanged. $0 spent, no provider crossed.

**Pattern earned.** #19 — an undeclared import is a build that only works where it was written.

**Next package.** NOT SELECTED. Redeploy is the immediate next action.

## Earlier — A declared recovery is checked against the transition graph · 2026-08-26

**Verified state.** `npm run verify`: 56 files, 902 passed / 1 skipped, exit 0. `npm run build`:
exit 0. 12 new tests, 8 RED before implementation; 10 targeted mutations each confirmed to fail
the suite, none survived.

**Proof claim earned.** `terminalState` is gone. All 43 failure modes across all six systems
declare a structured `recoveryPath` — `MOVES` (ordered `{from, to}` pairs), `HOLDS_POSITION` (not
moving *is* the recovery), or `BELOW_LIFECYCLE` — and `validateLifecycle` checks every movement
against the declared transitions. STATUS gap 0 is now enforced rather than described.

**It fails in both directions.** An unbuildable recovery fails the build unless explicitly marked
`unbuildable: true`, which renders it in the register as an open canon defect rather than as
handling — and that marker itself fails the build once a transition performs the move. Without
the second direction the escape hatch becomes the next `Pending`.

**It found a third instance on its first run.** `dp-fm-suppression`, already marked `Verified`,
declares a consent re-check at despatch and therefore a `SCHEDULED -> SUPPRESSED` recovery no
transition performs. `dp-t06` is the only exit from `SCHEDULED` and carries that same re-check as
its guard, so a record whose consent goes stale after scheduling has nowhere to go at all.

**Nothing was papered over.** No transition was added to satisfy a register entry. All three are
marked, rendered as defects, and pinned by name. Receivables' missing 90-plus dispute path and
Client Onboarding's non-moving scope-drift refusal were both encoded as what they are rather than
rounded up into movements that do not exist.

**Maturity.** Unchanged for all six. A validator is not a capability. $0 spent, no provider
crossed.

**Pattern earned.** #18 — a declared recovery is a claim about the transition graph.

**Still blocked.** The two pending Dormant Pipeline standards remain unbuildable; this made them
visible and enforced, not buildable.

**Next package.** NOT SELECTED.

## Earlier — The portfolio survives a reader who will not click · 2026-08-26

**Verified state.** `npm run verify`: 55 files, 889 passed / 1 skipped, exit 0. `npm run build`:
exit 0. 21 new tests, 19 RED before any artifact existed; 13 targeted mutations each confirmed to
fail the suite, none survived.

**Proof claim earned.** The last open P0 item is closed. `docs/WALKTHROUGH.md` carries eight
frames captured from a real production build, keyed to a beat table that totals 90 seconds, and
the README leads with one of them. A stranger can now judge the work with no clone, no browser,
and a dead link.

**The guard is the package, not the prose.** `tests/walkthrough.test.ts` recomputes every figure
the walkthrough states — incidents, lifecycle states, declared moves, confidence floor, operator
name — from `data/` at test time. It caught three live defects on its first run: the README
claimed 18 runnable incidents against a registry serving 19, 836 tests against 868, and 20 tests
in `observation-integrity-evidence.test.ts` against 21. All three post-date `1e24806`, the commit
that fixed this exact class of defect. **The drift came back inside one working day.**

**Numbers engineered to drift were deleted rather than guarded.** Suite and route totals are gone
from the README and a test fails if one returns. Counts that describe the product rather than the
workshop stay, recomputed from `ALL_RUNNABLE_SCENARIOS`.

**Truthfulness is asserted positively.** The suite requires the walkthrough to state the fiction,
carry the retained 6-of-9 evaluation failure, name the `UNVERIFIED` row bounding the other
thirteen, and say plainly that nothing has run for a paying customer. Two frames exist only for
that: the standing SIMULATED banner and the ledger's last row. A tour assembled entirely from
true frames can still read as live by cropping the ones that bound it.

**Maturity.** Unchanged: Lead Rescue `INTERACTIVE_PROTOTYPE`, the other five `SIMULATED`, all
`NOT_LIVE`. A walkthrough is not a capability. $0 spent, no provider crossed, no env var set.

**Pattern earned.** #17 — collateral guarded by recomputation, not proofreading.

**Not delivered.** A recorded screen capture. The frames and a timed script are committed; the
recording itself needs a voice and is the owner's.

**Next package.** NOT SELECTED. The open Track D item with the clearest shape is unchanged:
make `terminalState` structured so `validateLifecycle` can check failure-mode recoveries against
the transition graph (STATUS gap 0).

## Earlier — Deployed and publicly reachable · 2026-08-26

**Verified state.** Live at https://agentic-automation-portfolio.vercel.app, public, no
deployment protection. All page routes and both probed API routes return 200 against the deployed
instance. `npm run verify`: 54 files, 868 passed / 1 skipped, exit 0. `npm run build`: exit 0.

**Proof claim earned.** The portfolio can be seen by someone who has not cloned it. The launch
audit named this as the binding constraint on the whole project — not build depth, but that
nothing could be reached — and it is now discharged. The fidelity ledger on the deployed instance
reads REAL 10 / FIXTURE-BACKED 2 / SIMULATED 1 / UNVERIFIED 1, byte-identical to the
cold-environment prediction made before deploying: a stranger sees the same capability claims the
author does.

**What it does not change.** Maturity unchanged — Lead Rescue `INTERACTIVE_PROTOTYPE`, the other
five `SIMULATED`, everything `NOT_LIVE`. Reachable is not live. The `Customer deployment` ledger
row stays `UNVERIFIED` and still bounds every other row; it was deliberately not touched.

**Two deliberate absences on the host.** No `.data/` runtime store, so the operator console starts
empty and fills only from use of the demo — chosen over seeding, which would have presented
authored history as live. And no environment variables, so both real-provider boundaries sit at
their fail-closed defaults. A credential is not an activation, and a public host is the last place
to weaken that.

**Next package.** NOT SELECTED. Track L is complete apart from a walkthrough recording. The
open Track D item with the clearest shape is making `terminalState` structured so
`validateLifecycle` can check failure-mode recoveries against the transition graph (STATUS gap 0).

## Previous — Entity resolution precedes every policy question · 2026-08-26

**Verified state.** `npm run verify`: 54 files, 868 passed / 1 skipped, exit 0. `npm run build`:
exit 0. 8 new tests, 7 RED before implementation; five targeted mutations of the shipped guard
each confirmed to fail the suite, none survived. 19 runnable scenarios, up from 18.

**Proof claim earned.** `dp-fm-wrong-entity` is closed. A dormant record whose only contact detail
is a shared role address matches two legally distinct accounts at 0.94 and 0.91 — both above the
configured 0.9 threshold — and the cycle routes to `NEEDS_HUMAN` with both candidates attached
instead of taking the higher score. Accepted on exactly one candidate at or above threshold: two
or more is the declared ambiguity, and zero is the same failure wearing a different face, since
resolving it means taking the closest match.

**The placement is the substance.** The guard runs BEFORE the consent screen, ahead of
active-account status and the re-entry reason. Those are all questions about a specific party;
asking them against an unestablished identity is meaningless work that reads as diligence. The
handler returns immediately rather than evaluating policy for a company it cannot name.

**Why it is a confidentiality guard, not a tidiness one.** Reactivation outreach quotes the prior
objection and original service interest back to its recipient, so a wrong match discloses one
company's commercial history to another. That business impact was declared from the start; nothing
enforced it until now.

**Threshold in the profile, not the handler.** `entityMatchThreshold` (0.9) is an operating
parameter linked to a new `kestrel-entity-resolution` client policy.

**Two standards on this system remain blocked** — gap 0 under Known fidelity gaps.
`dp-fm-stale-data` and `dp-fm-rate-limited` declare recoveries the lifecycle has no transition
for. This pass closed the one that was structurally buildable and left those two named rather
than unblocking them by quietly adding transitions.

**Maturity.** Unchanged: `SIMULATED`. A closed failure mode is not a fidelity promotion.

**Pattern earned.** #16 — identity resolution as the precondition for every policy check.

**Next package.** NOT SELECTED. Track L's last item is a reachable URL, prepared and awaiting a
credential (spine `LAUNCH_PLAN.md` SOP-6).

## Earlier — Buyer-facing proof route for the other five systems · 2026-08-26

**Verified state.** `npm run verify`: 54 files, 860 passed / 1 skipped, exit 0.
`npm run build`: exit 0, 35 routes (5 new). All five new pages return 200 from a production
server; the index's six rows resolve to `/lead-rescue` and five `/proof/<slug>` and no longer to
any dossier.

**Proof claim earned.** The commercial register is a projection of any `SystemDefinition` plus a
real engine run, not a Lead Rescue asset. `app/proof/[slug]/page.tsx` serves the other five with
no new derivation logic — `deriveJourney` and `deriveCommercialGrammar` were already generic,
`JourneyConsole` already took derived data, and the four fields the page reads are required on
every system. Three presentational primitives moved from Lead Rescue's page into
`components/proof/proof-chrome.tsx` and are shared rather than copied.

**Nothing authored per system.** The one hand-written card on Lead Rescue's own page is computed
here from the lifecycle instead ("one of the 11 positions this system declares in advance,
reachable only by one of its 17 declared moves"), so it cannot drift from the model.
`fidelityNote` is the only verbatim string, rendered deliberately.

**What it refuses to render.** No capability ledger, no operator console. These systems have no
HTTP surface, no durable storage, no real provider, and no retained runtime evidence; an empty
ledger or one inferring REAL from shared fixtures would be borrowed credibility. The page states
the absence and links to Lead Rescue as what the next level looks like once earned. A system
earns a layer by acquiring the capability, not the component.

**An estimate this pass falsified.** The same-day launch audit scored this as expensive and gated
it behind freezing Lead Rescue. Measuring the coupling showed `journey.ts` at zero Lead Rescue
mentions, `commercial-grammar.ts` at three (all comment examples), `journey-console.tsx` at one in
1,063 lines. The generic layer already existed and had never been pointed at a second system.
Measure coupling before sequencing around it.

**Maturity.** Unchanged for all six — a page is not a capability. Lead Rescue
`INTERACTIVE_PROTOTYPE`, the other five `SIMULATED`. $0 spent, no provider crossed.

**Pattern earned.** #15, and it discharges the "Cross-domain generalisation of the proof surface"
row from NOT YET EARNED (§8's ≥2-domain gate is now met by six).

**Next package.** NOT SELECTED — PM sequences from the §6 scorecard. Track L's last open item is
a reachable URL; deploy is prepared and awaits the owner (spine `LAUNCH_PLAN.md` SOP-6).

## Earlier — Execution-boundary classification corrected · 2026-08-26

**Verified state.** `main` clean at time of commit. `npm run verify`: 54 files, 860 passed /
1 skipped, exit 0. `npm run build`: exit 0. Five tests were RED before implementation; five
targeted mutations of the shipped fix were each confirmed to fail the suite, none survived.

**Proof claim earned.** `FAILED_BEFORE_EFFECT` — the verdict that grants retry permission — is
now issued only where non-delivery is structural: a code that cannot follow DATA, a `connect`
syscall, or an SMTP command that precedes DATA. Every socket-class failure whose phase cannot be
established resolves to `OUTCOME_UNKNOWN` and parks for a person. The previous behaviour could
authorise a retry of a message the receiver already held, which is how a system promising exactly
one customer-facing send delivers two.

**Precision, not just safety.** A first attempt routed all socket codes to uncertainty and broke a
genuine connection-refusal test, because nodemailer reports a real `ECONNREFUSED` as `ESOCKET`.
The shipped fix reads `err.command` / `err.syscall`, so a refused connection keeps its retry
permission and a post-DATA failure does not.

**The second attempt was also wrong, and only the evidence caught it.** `CONN` was included in the
pre-DATA command set on the assumption that it meant "still connecting." nodemailer tags **every**
connection-level error `CONN` whenever it happens: a live probe against a server that takes the
whole body and then destroys the socket returns `{code:'ECONNECTION', command:'CONN'}`, identical
in shape to a greeting failure. So that version re-issued retry permission for exactly the
post-DATA case it existed to stop — and **39 green unit tests did not notice.** The re-capture
caught it on the first run. `CONN` is excluded; a genuine refusal is recognised by its `connect`
syscall, which a mid-conversation close never carries.

**Evidence re-captured against a cleared store.** Case B (envelope refused, 0 bytes received)
reads `FAILED_BEFORE_EFFECT` / `CORROBORATED`. Case D (body stored, 979 bytes genuinely held,
socket destroyed before the acknowledgement) now reads `OUTCOME_UNKNOWN` / `DECLINED_TO_CLAIM` —
the system looking at a message the receiver holds and refusing to say it was never sent. The
capture's vocabulary was extended to express that third verdict rather than collapsing it into
`CORROBORATED`. `lead-rescue-operational-view.json` was re-captured from the same journal so the
aggregate and the capture describe one runtime state. Test 9b added, tying each verdict to the
bytes the receiver actually observed; four targeted artifact corruptions each confirmed to fail it.

**Maturity.** Unchanged: proof `INTERACTIVE_PROTOTYPE`, operational `NOT_LIVE`. $0 spent, no
provider crossed, nothing left the machine.

**Also this pass, outside the package.** Three legibility defects fixed in `1e24806`: the masthead
counted 3 of 9 maturity levels and hid Lead Rescue entirely; the footer asserted "no record write
is sent" on every page, false since durable persistence landed; the README understated the work by
roughly 60% and denied n8n, live-model, and outbound work that exists.

**Environmental hazard, unresolved.** The repository lives inside iCloud-synced `~/Desktop`, which
conflict-duplicates build output as `* 2.*`. 543 such files inside gitignored `.next/` made
`npm run verify` fail while `git status` reported clean. Cleared by rebuilding, but it will recur
until the repo moves off iCloud. See spine `LAUNCH_PLAN.md`.

**Next package.** NOT SELECTED — PM sequences from the §6 scorecard. Track L (a reachable URL)
awaits an owner decision; see spine `LAUNCH_PLAN.md`.

## Earlier — Observation integrity, deterministic alerting, abnormal-delivery evidence · 2026-08-26

**Verified state.** `main` clean. `npm run verify`: 54 files, 836 passed / 1 skipped.
`npm run build`: 30/30 pages, exit 0. Both new falsification suites were RED before
implementation; 16 targeted semantic mutations and 15 artifact corruptions were each confirmed
to fail them, one of which SURVIVED first and forced a real test repair.

**Proof claim earned.** Lead Rescue can now say whether its own record is complete, raises the
few conditions that need a person, and has observed the two abnormal delivery states it
declares. In one real run: the journal directory was made unwritable for exactly one HTTP
ingress — the business path returned `200 ACCEPTED` and durably parked the case, and the
runtime named the lost observation as a `CONFIRMED_DROP` with the recorder's own `EACCES`
reason; a despatch to a receiver that refused the envelope produced a genuine
`FAILED_BEFORE_EFFECT`, corroborated by that receiver recording zero bytes and nothing stored;
a process killed inside its send with its claim taken produced a genuine `OUTCOME_UNKNOWN`,
and the recovering process opened no further connection.

**Maturity.** Retained runtime evidence, local prototype. Proof `INTERACTIVE_PROTOTYPE`,
operational `NOT_LIVE` — unchanged. No provider crossed, $0 spent, no model invoked.

**Patterns earned.** Two: durable write-ahead observation accounting reconciled rather than
counted (#12), and deterministic operator alerting with a defended noise floor (#13).

**Finding retained, not fixed.** The same capture shows the execution boundary classifying a
socket failure AFTER DATA as `FAILED_BEFORE_EFFECT` while the receiver genuinely holds the
message. The journal recorded exactly what the executor reported; the unsound classification
belongs to `SmtpSideEffectExecutor`, which this package was scoped out of. Retained in
`executionClassificationCheckedAgainstTheReceiver` and rendered on the proof surface.

**Current bottleneck.** Observability moves **2 → 3**. Execution stays **2**: no side effect
has crossed to anything off this machine, and the post-DATA misclassification above is now
evidenced. That is Lead Rescue's only remaining reference-exit blocker.

**Next package.** NOT SELECTED — PM sequences from the §6 scorecard.

## Earlier — Aggregate operational observability · 2026-08-26

**Verified state.** `main` clean. `npm run verify`: 51 files, 777 passed / 1 skipped.
`npm run build`: 30/30 pages, exit 0. Falsification suite was RED before implementation.

**Proof claim earned.** Lead Rescue produces an inspectable multi-execution view from its own
retained journal — 13 leads, 41 observations, delivery counted by lead and never by attempt,
intervals measured only from recorded timestamps with 3 leads explicitly unmeasurable, failure
classes and operator intervention tallied, every total traceable to its records.

**Maturity.** Retained runtime evidence, local prototype. Proof `INTERACTIVE_PROTOTYPE`,
operational `NOT_LIVE` — unchanged. No provider crossed, $0 spent.

**Pattern earned.** Deterministic aggregate projection over an append-only journal.

> **Superseded artifact, 2026-08-26.** The 13-lead / 41-observation capture this entry describes
> was recaptured by the next package against a cleared runtime store, so
> `lead-rescue-operational-view.json` now reports 7 leads / 15 observations. The original is
> retained in git history at `fb41367`. The claim above was true of that capture and the
> mechanism did not change.

**Current bottleneck.** Observability stays **2**, not 3: dropped observations are unmeasured,
nothing alerts, and the capture never exercised a failed or unknown dispatch.

**Next package.** NOT SELECTED — PM sequences from the §6 scorecard.

## Earlier — Governance reconciliation · 2026-08-26

**Verified state.** `main` @ `343e8e0`, clean, no remote. `npm run verify`: 50 files,
759 passed / 1 skipped. `npm run build`: 30/30 pages. `rescue/local-proof-surface-wip`
@ `aafebf0` stays preservation-only, not an ancestor of `main`.

**Proof claim earned.** The repository now carries the accepted PM process authority
(sha256 `32ca6f53…0d9304`) plus evidence-backed checkpoint and reusable-pattern indexes,
so proof work can be sequenced from governed §6 arithmetic rather than inferred. No Lead
Rescue behaviour changed.

**Maturity.** Unchanged — proof `INTERACTIVE_PROTOTYPE`, operational `NOT_LIVE`.

**Pattern earned.** None. Ten pre-existing patterns were indexed, not created.

**Current bottleneck.** Lowest §6 product is Provenance (3 × 1 = 3), saturated at score 3
— `SATURATED_NUMERIC_BOTTLENECK`. Lowest improvable product is 4: Reasoning, Integration,
Evaluation (each 2 × ×2).

**Next package.** NOT SELECTED. PM must recompute from the now-reachable §6 scorecard; the
§8 gate is unmet on dimensions 7 and 11.
