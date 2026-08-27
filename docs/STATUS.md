# Status

**As of 2026-08-27 (latest pass, same day) · A malformed intake payload is now genuinely
retried, and the retry budget is real.** `lr-fm-malformed` is closed — the last `Pending`
standard on Lead Rescue that was buildable rather than blocked by a canon defect. Entering
`FAILED_RECOVERABLE` has worked since the system was written; **nothing had ever left it.**
`lr-t30`, `lr-t31`, and `lr-t32` were declared in canon with no code, no event, and no test, so
"retained and retried" was half a sentence: the system retained, and nothing retried.

**That is worse than it sounds.** A case parked in `FAILED_RECOVERABLE` with no exit is
indistinguishable from outside from a case being patiently retried. It reads as handling — the
same failure shape as the two Dormant Pipeline recoveries, arrived at from the opposite
direction: there the recovery was declared and unbuildable, here it was buildable and never
built.

**The budget is bounded in both directions, and that is the point.** Retrying a payload that
will never validate is a loop, not resilience; giving up quietly drops the lead this system
exists to catch. `malformedRetryBudget` (3) is an operating parameter linked to a new
`kestrel-malformed-intake` policy, compared in the engine, and exhausting it routes to
`NEEDS_HUMAN` with the raw payload, the validation errors, and the attempt count attached —
never to a terminal state the system chose for itself. `close_as_terminal_failure` and
`retry_indefinitely` are recorded as forbidden actions rather than merely unselected.

**`lr-t30` needed no new code, which is the useful finding.** A corrected redelivery already
reaches `NORMALIZED` through the ordinary success path, because the engine permits that
transition from `FAILED_RECOVERABLE` as well as from `NEW`. Below budget the handler
deliberately requests no transition at all: staying put *is* the retry state, and re-entering
`FAILED_RECOVERABLE` on every attempt would have been a move the graph does not declare.

**Two mutations survived the first suite, and the tests were wrong, not the code.** Stripping
the validation errors from the escalation survived, because the assertion read the serialised
decision and the same field names also appear in `missingInformation` — the record looked
informative while the diagnosis was gone. And relinking the budget to an unrelated cadence
policy survived, because the assertion only checked that *a* policy existed. Both were
repaired to assert the specific field and the specific policy statement; all nine mutations are
now caught.

`npm run verify`: 58 files, 921 passed / 1 skipped, exit 0. `npm run build`: exit 0. 8 of the 10
new tests were RED before implementation. **7 pending standards remain**, 2 of them structurally
unbuildable. Maturity unchanged: `INTERACTIVE_PROTOTYPE`, `NOT_LIVE`.

**As of 2026-08-27 (earlier pass, same day) · A production deployment failed, and the defect was mine: a build that was
green only on the machine that wrote it.** `scripts/capture-walkthrough.ts` referenced Playwright
at the type level (`typeof import('playwright').chromium`). Playwright had been installed with
`npm install --no-save` on purpose — this repository promises a stranger that `npm install` is
cheap — so it sat in local `node_modules` and in no manifest. `next build` type-checks the whole
repository, so the deployment died on `TS2307: Cannot find module 'playwright'` after twenty
seconds, having passed `npm run verify` and `npm run build` locally minutes earlier.

**Fixed by declaring the surface instead of importing the types.** The script now defines the
slice of Playwright it actually calls as local interfaces and loads the module through a
**variable** specifier, so TypeScript never resolves it. The script stays fully type-checked
against what it calls, on a machine that has the package and on one that never will, and it
still degrades with an instruction when the package is absent. Proven under the failing
condition rather than assumed: `node_modules/playwright` was removed and `npm run verify` and
`npm run build` were both re-run to exit 0, then re-run to exit 0 again with it restored.

**The correction is not the interesting part; the mechanism is.**
`tests/dependency-honesty.test.ts` now scans every source file under `app/`, `components/`,
`data/`, `lib/`, `scripts/`, and `tests/` and fails if any import resolves to a package
`package.json` does not declare. It also pins this specific exemption — Playwright must stay out
of the manifest **and** out of any specifier TypeScript can resolve — so the arrangement cannot
be re-broken by someone tidying it up. Six mutations were each confirmed to fail it, including
the exact annotation that killed the deployment.

**Building the guard exposed a second-order lesson.** The first scanner reported twelve
offenders and zero defects, because it read prose inside comments and strings as imports —
`different from "the interval was zero"`, and this repository's own comments quoting bad
patterns as examples. A scanner that cries wolf twelve times is worse than no scanner, so it
strips comments and requires real import syntax, and a mutation that disables the comment
stripping is itself caught.

`npm run verify`: 57 files, 911 passed / 1 skipped, exit 0, with and without Playwright
installed. `npm run build`: exit 0 both ways.

**One unresolved flake, recorded rather than explained away.** `npm run verify` returned 1 once
while `typecheck`, `lint`, and `test` each independently returned 0 and the full output showed
no failure. It did not reproduce in 36 subsequent runs, including four `build`-then-`verify`
rounds aimed at the `.next/types` race this repository has hit before. Treated as an
environment-level flake, not a defect in the tree. The real lesson was procedural: that commit
went through because the gate was chained with `;` instead of `&&`, so a red gate did not stop
it. Chain the gate to the commit.

**As of 2026-08-26 (earlier pass) · A failure mode's declared recovery is now a claim
about the transition graph, and the graph is asked.** `terminalState` was free prose
(`'ELIGIBILITY_REVIEW.'`, `'SCHEDULED — unsent records return to the queue…'`) and a validator
cannot check a sentence, which is the whole reason gap 0 went unnoticed. It is replaced across
all six systems by `recoveryPath`: a discriminated union of `MOVES` (an ordered list of
`{from, to}` pairs), `HOLDS_POSITION` (not moving *is* the recovery — a duplicate, a replay, a
refused transition), and `BELOW_LIFECYCLE` (handled entirely on the side-effect record).
`validateLifecycle` now checks every movement of all 43 failure modes against the declared
transitions.

**It fails in two directions, deliberately.** An unbuildable recovery fails the build unless the
movement carries an explicit `unbuildable: true`, which renders it in the register as an open
canon defect rather than as handling. **And that marker itself fails the build the moment a
transition performs the move.** Without the second direction the honest escape hatch becomes the
next thing to rot, which is exactly how `Pending — scenario not yet authored` came to be hiding a
structural defect rather than describing unfinished writing.

**It found a third instance on its first run over migrated data, and that is the argument for
it.** `dp-fm-suppression` — a `Verified` failure mode, not a pending one — declares in both its
`prevention` and its `detection` that consent is re-checked **at despatch time**. Despatch
happens from `SCHEDULED`, and nothing performs `SCHEDULED -> SUPPRESSED`. Worse, `dp-t06` is the
*only* exit from `SCHEDULED` and it carries that same consent re-check as its guard — so a record
whose consent goes stale after scheduling fails the guard and has nowhere to go at all. Gap 0
found two failure modes that could not recover; this pass found a third, in a mode already marked
verified, plus the structural reason underneath it.

**Nothing was papered over.** No transition was added to satisfy a register entry: a transition
exists to be exercised, and adding one to close a validator complaint inverts the relationship
between canon and code. All three are marked, rendered as defects in
`FAILURE_MODE_REGISTER.md` ("declared in canon, but no declared transition performs it — an open
defect, not handling"), and pinned by name in `tests/lifecycle-recovery.test.ts`.

**Two encodings this migration deliberately refused to round up.** Receivables' dispute path is
declared from four ageing buckets and *not* from `PAST_DUE_90_PLUS`, because the canon genuinely
has no dispute transition out of the last bucket — the asymmetry recorded in gap 4 is preserved
rather than quietly resolved by declaring a move that does not exist. And Client Onboarding's
`co-fm-scope-drift`, whose prose read `CONTEXT_LOADED`, is `HOLDS_POSITION`: the engagement
carries on from where it was and the refused task simply never enters the derived plan. The case
does not move, so claiming a movement would have been a small fabrication.

**The prose did not disappear; it is derived.** `describeRecovery` renders the structured field
back into the sentence the register and the system pages used to store by hand, collapsing
genuinely chained movements into one path and separating alternatives with `·` — because joining
the whole list with "then" would assert a sequence several recoveries do not have. A
low-confidence judgment reaches a person from `NORMALIZED` *or* from `REPLIED`, never both in
order.

`npm run verify`: 56 files, 902 passed / 1 skipped, exit 0. `npm run build`: exit 0. 8 of the 12
new tests were RED before implementation, and 10 targeted mutations — short-circuiting the check,
disabling each of its three issue kinds, checking only the first movement of a multi-step
recovery, dropping gap 0's marker so the defect reads as handling, inventing the missing
transition, pointing a real recovery at an undeclared state, pointing one at a forbidden move,
and stripping the defect wording from the rendered prose — were each confirmed to fail the suite.
None survived.

**What this does not do.** It does not make the three marked recoveries buildable — they are
still structurally unbuildable, and the two pending Dormant Pipeline standards remain blocked for
that reason. It checks recoveries, not guards, so the `SCHEDULED` dead-end above was found by
reading rather than by the validator and is pinned by an explicit test rather than by the
mechanism. Maturity unchanged for all six systems.

**As of 2026-08-26 (earlier pass, same day) · The portfolio survives a reader who will not click,
and the collateral that carries it is now guarded by arithmetic rather than by proofreading.**
[`docs/WALKTHROUGH.md`](WALKTHROUGH.md) carries eight frames captured from a real production
build, keyed to a beat table that totals 90 seconds, with the README leading on one of them. That
closes the last open P0 item. A stranger can now judge this work with no clone, no browser, and a
dead link — the three failure modes a hosted URL alone does not survive.

**The guard is the package; the prose is the artifact it protects.**
`tests/walkthrough.test.ts` recomputes every figure the walkthrough states — incident count,
lifecycle states, declared moves, confidence floor, operator name — from `data/` at test time
rather than proofreading them. Add a ninth scenario and the sentence claiming eight goes RED in
that file rather than in a reader's browser.

**It caught three live defects on its first run, which is the whole argument for it.** The README
claimed **18** runnable incidents against a registry serving **19**, claimed **836** tests against
**868**, and credited `tests/observation-integrity-evidence.test.ts` with **20** tests against
**21**. Every one of those post-dates `1e24806` — the commit that fixed exactly this class of
defect earlier the same day. The drift returned inside one working day, which says the previous
fix was a correction and not a mechanism.

**The remedy for a number engineered to drift is not a tighter guard.** Suite and route totals
are now absent from the README entirely, and a test fails if one reappears: the gates report
their own sizes and nothing needs to restate them. Counts that are claims about the *product*
rather than about the workshop — runnable incidents — stay, and are recomputed from
`ALL_RUNNABLE_SCENARIOS` rather than typed.

**Truthfulness is asserted positively, never as an absence.** The suite requires the walkthrough
to state that the business and every incident in it are fictional, to carry the retained 6-of-9
live-evaluation failure, to name the `UNVERIFIED` `Customer deployment` row that bounds the other
thirteen, and to say plainly that nothing has run for a paying customer. Two of the eight frames
exist for that reason alone — the standing `SIMULATED` banner at the page top, and the ledger's
last row — because **a tour assembled entirely from true frames can still read as live by
cropping the ones that bound it.** That is the failure mode a screenshot tour has and a page
does not.

**Frames are captured, never composed.** `scripts/capture-walkthrough.ts` drives a real
production build at a pinned viewport, device scale, and colour scheme, so two captures of an
unchanged page differ only where the page differs. It is deliberately not an application
dependency — Playwright is installed on demand and the script fails with instructions if it is
absent — because this repository's README promises a stranger that `npm install` is cheap.

**What this deliberately does not cover.** The suite guards the walkthrough's arithmetic and its
disclaimers, never its argument: prose that is accurate and misleading in emphasis passes every
assertion. It also cannot tell whether a frame still depicts the current page — only that the
file exists — so re-capturing after a visual change remains a human step. And a *recorded*
screen capture is not delivered: the frames and a timed script are committed, but the recording
needs a voice and is the owner's to make.

`npm run verify`: 55 files, 889 passed / 1 skipped, exit 0. `npm run build`: exit 0. 19 of the 21
new tests were RED before any artifact existed, and 13 targeted mutations — a deleted frame, a
deleted capture script, stripped alt text, a broken README link, beat timings that stop totalling
90s, four figures drifting from the model, an edited-away failed evaluation, a removed
no-customer disclaimer, a build described as live, and a stale suite size returning to the README
— were each confirmed to fail the suite. None survived.

Maturity unchanged: Lead Rescue `INTERACTIVE_PROTOTYPE`, the other five `SIMULATED`, everything
`NOT_LIVE`. A walkthrough is not a capability. $0 spent, no provider crossed, no environment
variable set on any host.

**As of 2026-08-26 (earlier pass, same day) · The portfolio is reachable by someone who has not
cloned it.** It is deployed at
[agentic-automation-portfolio.vercel.app](https://agentic-automation-portfolio.vercel.app),
publicly, with no deployment protection. Until now every claim in this document was true of a
build that only existed on one laptop, which the same-day launch audit named as the binding
constraint on the whole portfolio: not build depth, but the fact that nothing could be seen.

**Verified against the deployed instance, not the local one.** `/`, `/lead-rescue`,
`/lead-rescue/wait`, `/proof/*`, `/systems/*`, `/simulator/*` all return 200, as do the dynamic
API routes. The masthead reads `6 SYSTEMS · 5 SIMULATED · 1 INTERACTIVE PROTOTYPE`. The fidelity
ledger reads **REAL 10 · FIXTURE-BACKED 2 · SIMULATED 1 · UNVERIFIED 1** — byte-identical to the
cold-environment prediction made before deploying, which is the useful part: a stranger sees the
same capability claims the author does, not a reduced set.

**What this does not change, stated plainly.** Maturity is unchanged: Lead Rescue
`INTERACTIVE_PROTOTYPE`, the other five `SIMULATED`, everything `NOT_LIVE`. Being *reachable* is
not being *live*. The `Customer deployment` row on the fidelity ledger remains `UNVERIFIED` and
still bounds every other row on that page: nothing has run for a paying customer, no live trigger
is connected to a real channel, there is no production scheduler, and there is no client data of
any kind in this build. A deployment is a demonstration surface, not operation, and the ledger
was deliberately not touched to celebrate it.

**Two deliberate absences on the hosted instance.** `.data/` is gitignored runtime state and does
not exist there, so the operator console starts empty and fills only from use of the demo itself
— chosen over seeding it, because seeded history presented as live would violate this project's
first invariant. And no environment variables are set, so both real-provider boundaries sit at
their fail-closed defaults: the model classifier is `fixture` and outbound execution is
`simulated`. A credential is not an activation, and a public deployment is the last place to
weaken that.

**One preparatory fix this required.** Five Turbopack warnings that a variable
`path.join(process.cwd(), …)` in the two evidence readers traced the whole project into the
server bundle — harmless locally, bundle bloat or a size-limit failure on a host. Both now
resolve against a literal `n8n/evidence` prefix, asserted rather than assumed. Warnings 5 → 0.

`npm run verify`: 54 files, 868 passed / 1 skipped, exit 0. `npm run build`: exit 0.

**As of 2026-08-26 (earlier pass, same day) · Dormant Pipeline Recovery will not guess which
company a dormant record belongs to.** `dp-fm-wrong-entity` — declared since the system was
written, marked `Pending — scenario not yet authored`, never built — is closed. A dormant record
whose only contact detail is a shared role address matches two legally distinct accounts at 0.94
and 0.91; both clear the configured 0.9 threshold. The cycle stops, routes to `NEEDS_HUMAN`, and
attaches both candidates for a person to separate.

**The placement is the substance, not the check.** This guard runs BEFORE the consent screen,
ahead of active-account status and any re-entry reason. Those are all questions about a *specific
party*; asking them against an identity nobody has established is meaningless work that reads as
diligence. Identity is not one eligibility check among several — it is the precondition for all
of them, and the handler now returns immediately rather than continuing to evaluate policy for a
company it cannot name.

**Why it matters commercially.** Reactivation outreach quotes the prior objection and the original
service interest back to whoever opens it. A wrong match therefore does not send a slightly
irrelevant message — it discloses one company's commercial history to another. The declared
business impact was always exactly that; nothing enforced it until now.

**Accepted on exactly one candidate at or above the threshold.** Two or more is the declared
ambiguity. Zero is the same failure wearing a different face, since resolving it would mean taking
the closest available match — which the policy forbids by name. `resolve_to_closest_candidate` and
`resolve_to_highest_confidence_match` are recorded as forbidden actions rather than merely left
unselected, so the record shows the system declining a choice it could have made.

**New in the profile, not hard-coded.** `entityMatchThreshold` (0.9) is an operating parameter
linked to a new `kestrel-entity-resolution` client policy, per the standing rule that a threshold
in a handler silently becomes a universal truth.

**Verified.** 8 new tests in `tests/dormant-pipeline-recovery.test.ts` (31 in that file, up from
23), 7 RED before implementation. Five targeted mutations of the shipped guard were each confirmed
to fail the suite — accepting the closest candidate, disabling the guard, dropping the attached
candidates, removing the forbidden actions, and redirecting the transition — and none survived.
`typecheck` caught a vacuous assertion in one of my own tests (`AI_JUDGMENT` against an enum whose
member is `BOUNDED_AI_JUDGMENT`) before it could pass for the wrong reason. `npm run verify`: 54
files, 868 passed / 1 skipped, exit 0. `npm run build`: exit 0. 19 runnable scenarios, up from 18.

**Two of that system's three pending standards remain blocked, and not for want of authoring** —
see gap 0 under Known fidelity gaps. `dp-fm-stale-data` and `dp-fm-rate-limited` declare recoveries
the lifecycle has no transition for. This pass deliberately closed the one that was structurally
buildable and left those two named rather than unblocking them by quietly adding transitions.

Maturity unchanged: `SIMULATED`. A closed failure mode is not a fidelity promotion.

**As of 2026-08-26 (earlier pass, same day) · The other five systems now have a buyer-facing
page, and the portfolio index no longer sends anyone to an engineering dossier first.** Until
this pass Lead Rescue had `/lead-rescue`, written in the register a buyer reads, and the other
five had only `/systems/<slug>`, which opens with paragraphs of engineering prose. Every row on
the index linked to the dossier. A visitor comparing them concluded, correctly, that one system
was real and five were write-ups — the outcome `PORTFOLIO_PM_CONSTITUTION.md` §1 names as
failure by name.

**The capability was never missing; only the register was.** `app/proof/[slug]/page.tsx` serves
all five, and needed no new derivation logic: `deriveJourney` and `deriveCommercialGrammar` were
already generic over `SystemDefinition`, `JourneyConsole` already accepted derived data, and
`businessProblem` / `economicLeakage` / `buyerOutcome` / `fidelityNote` are required fields on
every system. The three presentational primitives moved out of Lead Rescue's page into
`components/proof/proof-chrome.tsx` and are now shared rather than copied. The index's own
`proofHref` sends each system to its proof page; the dossier is one click away in every proof
page's first line of navigation, but it is no longer the front door.

**Nothing on these pages is authored per system.** The one piece of hand-written prose on Lead
Rescue's equivalent — the "what this replaces it with" card — is computed here from the
lifecycle instead: "Every case occupies one of the 11 positions this system declares in advance,
and can arrive there only by one of its 17 declared moves." A reader can check that against the
dossier, and unlike a sentence it cannot drift from the model. `fidelityNote` is the sole
verbatim string, rendered deliberately because it is the system's own statement of its limits.

**What these pages refuse to render, and why that is the point.** Lead Rescue's page has four
layers; these have two, plus an explicit account of the absence. There is no capability fidelity
ledger and no operator console, because these systems have no HTTP surface, no durable storage,
no real provider, and no retained runtime evidence. An empty ledger, or one inferring `REAL` from
the fixtures all six systems share, would be exactly the borrowed credibility this portfolio
exists to refuse. The page says so in its own words and links to Lead Rescue as what the next
fidelity level looks like once a system earns it. **A system earns a layer by acquiring the
capability, not by acquiring the component.**

**A sequencing estimate this pass falsified.** The launch audit written earlier the same day
scored this work as expensive and gated it behind freezing Lead Rescue, on the reasoning that
`lib/proof/` was still changing and generalising a moving target guarantees rework. Measuring
the coupling rather than assuming it showed `journey.ts` contained zero Lead Rescue vocabulary,
`commercial-grammar.ts` three occurrences (all example strings inside comments), and
`journey-console.tsx` one in 1,063 lines. Only `operator-console.tsx` and `fidelity-ledger.ts`
are genuinely coupled — correctly, since only Lead Rescue has the capabilities they describe.
The generic layer already existed and had simply never been pointed at a second system. Recorded
because the error was in the estimate, not in the work: measure coupling before sequencing
around it.

Maturity unchanged for all six: Lead Rescue `INTERACTIVE_PROTOTYPE`, the other five `SIMULATED`.
A page is not a capability. `npm run verify`: 54 files, 860 passed / 1 skipped, exit 0.
`npm run build`: exit 0, 35 routes (5 new).

**As of 2026-08-26 (earlier pass, same day) · The execution boundary no longer tells the rest of
the system it is safe to retry a message that may already have been delivered.** The defect the
previous pass found by looking rather than by testing — and deliberately scoped out of — is
fixed. `SmtpSideEffectExecutor` mapped `ESOCKET`, `ECONNECTION`, `ECONNRESET`, and `ETIMEDOUT`
to `FAILED_BEFORE_EFFECT` regardless of which SMTP phase failed. That verdict is not a
description of a socket; it is a **permission**, read by every layer above as "nothing reached
the recipient, so a retry is safe." None of those four codes carries phase information, and the
retained abnormal-delivery capture shows this adapter issuing exactly that permission for a
socket failure after DATA while the receiving process independently recorded that it was holding
the message. The portfolio's headline reliability claim — exactly one customer-facing effect
across a run — was therefore unsound at the only boundary where it would ever be tested against a
real provider.

**The fix reads the phase the transport actually reports rather than guessing from the code.**
A first attempt routed every socket-class code to `OUTCOME_UNKNOWN`; that was sound but blunt,
and it broke an existing test for a genuine connection refusal, because nodemailer collapses
connect-phase failures into `ESOCKET` — a real `ECONNREFUSED` arrives as
`{code: 'ESOCKET', syscall: 'connect', command: 'CONN'}`. Refusing every `ESOCKET` would park a
case for a human who has nothing to decide. The shipped rule instead grants
`FAILED_BEFORE_EFFECT` only where non-delivery is structural: codes that cannot follow DATA
(`ECONNREFUSED`, `ENOTFOUND`, `EHOSTUNREACH`, `EDNS`, `EENVELOPE`, `EAUTH`), a `connect` syscall,
or an error raised against an SMTP command that precedes DATA in the protocol. Everything else —
including every unrecognised code and every error carrying no code at all — resolves to
`OUTCOME_UNKNOWN`, which `resolveSend` already routes to the existing UNCERTAIN path that parks
the case for a person and never auto-retries. A false uncertainty costs an operator a decision;
a false certainty costs the customer a duplicate.

**The first version of this fix was wrong, and only the re-captured evidence caught it.** Reading
the phase meant trusting nodemailer's `command` field, and `CONN` was included in the pre-DATA
set on the assumption that it meant "still connecting." It does not. nodemailer tags **every**
connection-level error `command: 'CONN'` regardless of when the connection died — a live probe
against a server that takes the whole body and then destroys the socket returns
`{code: 'ECONNECTION', command: 'CONN', message: 'Connection closed unexpectedly'}`, identical in
shape to a failure during the greeting. So the first fix re-issued retry permission for precisely
the post-DATA case it was written to stop, and **39 green unit tests did not notice**. The
re-capture did, on the first run. `CONN` is now excluded, and a genuine connection refusal is
recognised instead by its `connect` syscall, which a mid-conversation close never carries.

**Verified against a real socket, not asserted.** The abnormal-delivery capture was re-run
against a cleared runtime store, and the two receiver-checked cases now read:

| Case | Receiver | Application | Verdict |
| --- | --- | --- | --- |
| B — envelope refused at `RCPT TO` | 0 bytes, stored nothing | `FAILED_BEFORE_EFFECT` | `CORROBORATED` |
| D — body stored, socket destroyed before the acknowledgement | **979 bytes, message held** | `OUTCOME_UNKNOWN` | `DECLINED_TO_CLAIM` |

Case D is the whole point: the system looked at a message the receiver genuinely holds and
refused to say it was never sent, parking the case for a person instead of authorising a retry
that would have delivered a second copy. The capture's own vocabulary was extended to express
that third outcome — collapsing it into `CORROBORATED` would have reported the fix as though
nothing had been tested.

`tests/observation-integrity-evidence.test.ts` gains test 9b, which ties the verdict to what the
receiver actually observed so the label cannot drift from the bytes; four targeted artifact
corruptions were each confirmed to fail it. `n8n/evidence/lead-rescue-operational-view.json` was
re-captured from the same journal so the aggregate and the capture describe one runtime state.

`npm run verify`: 54 files, 860 passed / 1 skipped, exit 0. `npm run build`: exit 0. 40 tests in
`tests/smtp-side-effect-executor.test.ts`, up from 17; five RED before implementation, and five
targeted mutations of the shipped fix each confirmed to fail the suite, none surviving.

Maturity unchanged: `INTERACTIVE_PROTOTYPE`, `NOT_LIVE`. No provider was crossed, $0 spent, no
model invoked, and nothing left this machine.

**As of 2026-08-26 (earlier pass, same day) · Lead Rescue can now say whether its own record is
complete, and it has finally seen the two abnormal delivery states it always claimed to
understand.** Three gaps closed in one run, none of them by assertion. (1) `record()` has always
been allowed to drop an observation rather than block business work; that policy is unchanged,
but ignorance about it is not. A durable write-ahead marker is written before every journal
write, removed on success, and annotated-and-left on a reported drop, then reconciled against
the journal by `journalEventId` — so a crash in the cleanup window is not mistaken for data loss
and a genuinely missing record cannot hide. The answer is one of three,
`NO_KNOWN_LOSS` / `KNOWN_LOSS` / `UNAVAILABLE`, and both an unreadable marker ledger and an
unreadable journal fail into the third rather than the flattering first. (2) Five conditions —
and deliberately only five — are now RAISED rather than left to be found: unresolved delivery,
failed delivery, an elapsed attention window, known observation loss, and an unmeasurable
instrument. An authority refusal and a suppressed duplicate raise nothing, because the system
refusing correctly is not an incident. (3) The retained capture contained zero
`FAILED_BEFORE_EFFECT` and zero `OUTCOME_UNKNOWN` at the dispatch boundary; it now contains both,
produced by a real run.

**How each one was produced, since none of it is a fixture.** The journal directory was made
unwritable for exactly one real HTTP ingress: the business path returned `200 ACCEPTED` and
durably parked the case, and the runtime named the lost observation as a `CONFIRMED_DROP`
carrying the recorder's own `EACCES: permission denied, mkdir …`. A despatch against a receiver
that refused the envelope with `550` at `RCPT TO` produced a genuine `FAILED_BEFORE_EFFECT` —
corroborated by that receiver independently recording zero bytes received and nothing stored,
which is the whole point of having a second observer. A despatch against a receiver that took
the entire message and never answered was interrupted by killing the server process inside its
send with the durable claim already taken; a freshly started process asked to despatch the same
case reported `OUTCOME_UNKNOWN` and opened no further connection, so at-most-once held across a
genuine crash rather than across a simulated one. Retained in
`n8n/evidence/lead-rescue-observation-integrity.json`, guarded by
`tests/observation-integrity-evidence.test.ts` (20 tests, each confirmed to fail against a
deliberately corrupted artifact).

**One defect this pass found by looking rather than by testing.** The same capture shows the
execution boundary classifying a socket failure AFTER DATA as `FAILED_BEFORE_EFFECT` — "the
executor confirmed nothing was sent" — while the receiving process genuinely holds the message
it stored. `SmtpSideEffectExecutor` maps `ESOCKET`/`ECONNECTION` to confirmed non-execution
regardless of which SMTP phase failed, which is unsound once DATA has been written. The journal
recorded exactly what the executor reported, so this is a defect at the execution boundary and
not in the record; it is retained under
`executionClassificationCheckedAgainstTheReceiver`, rendered on the proof surface under "Where
the receiver disagreed with the system", and deliberately not fixed here — this package was
scoped to observability. **The alert derived from that record repeats the executor's claim**,
which is stated on the artifact rather than left to be discovered.

Maturity unchanged: `INTERACTIVE_PROTOTYPE`, `NOT_LIVE`. Every input was synthetic, the
receiving SMTP server was purpose-built for this proof and bound to loopback with no relay, no
Anthropic call or live provider was involved, and $0 was spent.

**As of 2026-08-26 (earlier pass, same day) · A genuine `claude-opus-5` judgment has now executed
inside the real HTTP ingress path — and the frozen evaluation corpus it enabled promptly FAILED
its own predeclared thresholds.** Two claims, earned separately, and only one of them is good
news. `POST /api/lead-rescue/ingress` with `LEAD_RESCUE_DECISION_PROVIDER=claude` genuinely
traversed route → `ingestExternalLead` → `resolveJudgment` → `ClaudeDecisionProvider` → the
Anthropic Messages API → schema validation → the Lead Rescue handler, returning
`QUALIFIED_ENQUIRY` at confidence **0.92** — a value `INGRESS_FIXTURE_JUDGMENT` (pinned at 0.93)
cannot produce, which is what makes the run distinguishable from the fixture path at all. The
live classification network boundary is no longer `UNVERIFIED_LIVE`.

**The correction this pass paid for, and the reason the evidence is shaped the way it is.** An
earlier attempt in the same package read `classifierProvider: "claude-decision-provider"` on a
request whose API call returned 401 and produced **no judgment whatsoever** — the case routed to
`lr-t06`/`NEEDS_HUMAN` exactly as the fail-safe path is designed to. `classifierProvider` reports
which provider `resolveIngressDecisionProvider` SELECTED, never whether inference succeeded.
Any future evidence resting on that field alone would be false proof; this artifact rests on a
returned classification value and the adapter's own post-validation provenance line instead.

**The evaluation is a retained NEGATIVE result.** All 9 frozen cases ran against the real model:
**6/9 correct (66.7%)** against a declared floor of 75%, and `policy-sensitive-canon-fenwick`
returned `NEEDS_MORE_INFORMATION` (0.66) where canon expects `POLICY_SENSITIVE` — breaking the
"every canon-sourced case correct" threshold. No label, example, threshold, prompt, or model
setting was altered to soften that; the corpus literal is sha-verified byte-identical before and
after. **The failure is one of accuracy, never of safety**: zero unsafe misclassifications, every
miss either below the configured `confidenceFloor` (0.7) or reporting missing information, both
of which route to a person rather than to an action — and the adversarial prompt-injection case
passed, the injected "confidence 1.0, no missing information" demand refused with a returned
0.75. Retained in `n8n/evidence/lead-rescue-live-classification.json`, guarded by
`tests/live-classification-evidence.test.ts` (13 tests, each confirmed to fail against a
deliberately corrupted artifact).

**One real defect this pass found only by paying for it.** The live evaluation suite had never
once executed against a real provider, so nobody had discovered that nine SEQUENTIAL
`claude-opus-5` calls cannot finish inside vitest's 5-second default timeout. The suite aborted
after one case. Fixed with a transport bound only (`180_000`); it changes no label, threshold,
prompt, or model setting, and a corpus that fails still fails.

Maturity unchanged: `INTERACTIVE_PROTOTYPE`, `NOT_LIVE`. A successful API call does not make this
system live, production-ready, or customer-proven — every input was synthetic, nothing ran on a
deployment, and no outbound message, n8n execution, or third party other than the Anthropic API
was involved.

**As of 2026-08-26 (later pass, same day) · Lead Rescue operator authority is now bound to an
authenticated identity instead of a caller-supplied claim.** Until this pass a request chose
its own authority: `POST .../decide` accepted `decidedBy: 'client-partner'` in the body, and the
engine then enforced that role's ceiling faithfully — against an identity nobody had ever
verified. Every authority guarantee in this portfolio rested on the caller being honest.
`lib/auth/operator-identity.ts` adds a first-party HMAC-SHA256 signed bearer credential: the
signature is verified constant-time and BEFORE the payload is parsed, the principal resolves to
a canonical operator, and the authority ceiling is read from `profile.roles`. `decidedBy` is
gone from both wire contracts (`strictObject`), so a body naming its own role is rejected
outright rather than ignored. `dispatchAuthorizedOffer` now also enforces the authority
verification its own handler had always computed and this layer never read — a declared rule
that was silently unenforced. Verified against the real HTTP boundary: unauthenticated,
tampered, self-declared-identity, and under-authority attempts all refused with the case
unmoved and nothing executed; a valid client-partner accepted and bound. **This is not a
login** — there is no password, no MFA, and no identity provider; see "Lead Rescue operator
authentication," below, for exactly what that does and does not prove. Maturity unchanged:
`INTERACTIVE_PROTOTYPE`, `NOT_LIVE`.

**As of 2026-08-26 · Lead Rescue now keeps a durable, correlated, queryable execution
journal, generated automatically by the running application.** Until this pass the portfolio's
runtime evidence was excellent but one-off: three artifacts captured deliberately, for
demonstrations. Nothing recorded what the system did in the ordinary course of running.
`lib/persistence/execution-journal-store.ts` adds a schema-validated observation per
consequential boundary — ingress, wait evaluation, human decision, despatch — sharded one
directory per case, published by write-temp-then-`link` so publication is atomic and duplicate
`journalEventId`s are refused by the kernel. `app/api/lead-rescue/journal` and the run-history
panel on `app/lead-rescue/wait` let an operator read a case's TRIGGER → DECISION → AUTHORITY →
ACTION sequence without repository archaeology. **The journal is observability and nothing
else**: the write and read halves are separate interfaces, engine code is handed only the
recorder (and a structural test fails if any reader symbol appears under `lib/engine/**` or
`lib/ports/**`), and running the same business path with a journal that fails every write, and
one that throws on every write, produces byte-identical engine results.
**Its guarantee is explicitly lossy** — see "Lead Rescue execution journal," below. Maturity
unchanged: `INTERACTIVE_PROTOTYPE`, `NOT_LIVE`.

**As of 2026-08-24 (later pass, same day) · Corrected: provider activation was credential-driven,
not explicit — fixed before any higher-stakes external side effect was considered.** The pass
below ("Lead Rescue's bounded intake/reply classification...") wired `ClaudeDecisionProvider`
into the n8n ingress seam gated on `ANTHROPIC_API_KEY` presence ALONE, and gated the live
evaluation suite on that same presence check alone. Both are real activation defects: a
credential is a secret, not a feature flag, and a developer or CI runner with one exported for
an unrelated reason (a shared shell profile, a copied `.env`) would have silently gotten live
model calls and live spend with no explicit request to do either. Corrected with one small, pure
configuration boundary, `lib/config/decision-provider-config.ts`: real-provider activation now
requires an explicit `LEAD_RESCUE_DECISION_PROVIDER=claude` selection IN ADDITION TO a usable
credential; the live evaluation suite now requires an explicit `RUN_LIVE_AI_EVAL=1` opt-in IN
ADDITION TO a usable credential. Explicit real mode with no usable credential fails safe — never
a silent fallback to fixture output presented as real — by returning a provider whose
`classify()` throws the SAME `JudgmentUnavailableError` a genuine network failure would, routing
through the existing `UNAVAILABLE` → `NEEDS_HUMAN` handling with zero new logic. 15 new falsifying
tests (`tests/decision-provider-config.test.ts`) prove all four combinations (fixture/claude ×
credential present/absent) plus that no credential value is ever echoed anywhere. No genuine
network call occurred while making this correction (no credential and no opt-in were present in
this environment). Maturity unchanged: `INTERACTIVE_PROTOTYPE`, `NOT_LIVE`; the live classification
network boundary remains `UNVERIFIED_LIVE`. See "Lead Rescue live classification seam," below,
for the corrected activation semantics section.

**As of 2026-08-24 · Lead Rescue's bounded intake/reply classification can now be genuinely
performed by a live model.** `ClaudeDecisionProvider` (`lib/ports/claude-decision-provider.ts`)
is the second implementation of the `DecisionProvider` port — `claude-opus-5`, structured JSON
output validated at runtime against the same contract `FixtureDecisionProvider` already
enforces, closed to `request.permittedClassifications`, exactly one re-request on malformed
output per `lr-fm-malformed-ai`'s own declared retry policy, and every provider/network failure
routed to `UNAVAILABLE` — never a chance to authorize a side effect. Wired through the existing
n8n ingress seam (`app/api/lead-rescue/ingress/route.ts`) as an injected, optional dependency.
**Corrected by the later pass above:** this pass originally gated activation on `ANTHROPIC_API_KEY`
presence alone; real-provider selection now additionally requires an explicit
`LEAD_RESCUE_DECISION_PROVIDER=claude` setting — see `lib/config/decision-provider-config.ts`.
No credential was available in this environment, so the live network path is honestly
`UNVERIFIED_LIVE` — the adapter, its full falsifying test suite (structural, no network), and a
9-case labelled evaluation corpus are all built and ready. Also fixes a real, pre-existing bug
found while wiring provenance through: the handler hard-coded `providerId: 'fixture-decision-provider'`
at both classification call sites regardless of which provider actually ran. See "Lead Rescue
live classification seam," below. Maturity does not change: `INTERACTIVE_PROTOTYPE`, `NOT_LIVE`.

**As of 2026-08-24 (prior pass, same day) · Corrected: escalation owner resolution no longer breaks equal-authority
ties alphabetically.** The prior pass's own `resolveEscalationOwner` picked the
alphabetically-first role (`Client Partner`) whenever two roles tied at the closest qualifying
`authorityCeiling` — presented as a resolved name, with no signal that a real choice had been
made on no evidence. Audited against repository truth before changing anything: `authorityCeiling`
is documented on `RoleSchema` itself as an execution CAP, never an ordering; no field, comment,
or policy anywhere ranks `client-partner` above `head-of-delivery` (or vice versa); and this
codebase's own Client Onboarding precedent (`resolveAuthoritativeValue`) already holds that two
equally-ranked, disagreeing sources stay an explicit `CONFLICT` rather than being silently
resolved. Alphabetical selection was the same category of mistake, applied to role ids instead
of timestamps. `resolveEscalationOwner` now returns `UNRESOLVED_AMBIGUOUS_OWNER` — never a
picked name — when a genuine tie exists, distinct from `UNRESOLVED_NO_QUALIFYING_ROLE`. See
"Escalation owner resolution — semantic-integrity correction," below.

**As of 2026-08-24 (prior pass, same day) · Lead Rescue escalation notifications now name a
real configured role instead of the "Named owner" simulation placeholder** — the two-tier
mechanism itself (standard vs. "next owner in the authority chain") is unchanged by the
correction above; only the standard tier's own equal-ceiling tie is now honestly reported as
ambiguous rather than resolved. See "Lead Rescue escalation owner resolution," below.

**As of 2026-08-24 (prior pass, same day) · Lead Rescue's waiting incidents now wake themselves:
a real n8n Schedule Trigger, on its own timer, calls the existing full-sweep endpoint with no
human or script involved, and — live-verified against a local Docker n8n instance across an
actual container restart — correctly resolves exactly the incidents whose window has genuinely
elapsed while leaving everything else untouched. `checkAllWaitingIncidents` existed since the
attention-timeout pass but had never once been invoked by anything but a person clicking a
button; this closes that gap using the identical claim-store guarantee proven for cross-runtime
and crash safety, adding zero new engine code. n8n now owns both ends of orchestration this
portfolio has built — triggering-in (new-lead ingress) and waking-up (the wait sweep) — while
every decision stays inside the engine. See "Lead Rescue scheduled n8n sweep," below. This pass
also repaired a stale canon claim found during a state-reconciliation pass earlier the same day:
see "Known fidelity gaps," item 16.**

## Portfolio maturity

**INTERACTIVE PROTOTYPE** — the application runs, all six systems are open and inspectable,
and all six execute real operating logic: Lead Rescue against six scenarios, Dormant
Pipeline Recovery against two, Call-to-Proposal Revenue Agent against two, Client
Onboarding Operator against two, Receivables / Invoice Recovery Agent against two, and
Owner Revenue Intelligence Agent against two, plus one smaller executable path exercising
a third declared transition pair in Call-to-Proposal.

| # | System | Maturity | Runs? |
| --- | --- | --- | --- |
| 1 | Lead Rescue | `INTERACTIVE_PROTOTYPE` | Yes — 7 scenarios execute end to end, a live wait/resume demo covering both prospect-response waiting categories and both operator-attention timeout categories, a real n8n-driven ingress path for new leads, a real n8n-driven scheduled sweep that wakes waiting incidents on its own, and a genuine live-model classification seam (`claude-opus-5`) that has now genuinely executed through that same ingress path, reachable only via an explicit `LEAD_RESCUE_DECISION_PROVIDER=claude` selection — never by credential presence alone. Its 9-case evaluation corpus has been run against the real model and FAILED its predeclared thresholds (6/9; see the latest entry above) |
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

## lr-t22 semantic-integrity correction — this pass

**The question this pass answered from evidence, not assumption.** The prior pass's own
"Single recommended next fidelity gap" named a narrow, mechanical-looking hole: `lr-t24`,
`lr-t27`, and `lr-t34` — the three `HUMAN_DECISION` re-entries into `BOOKING_READY` — never
wrote `bookingReadyAt`, so a human-cleared case had no offer-wait clock at all. The
assignment for this pass was not to patch that in isolation, but to first answer a harder
question the prior write-up had left open without realising it needed answering: does
`bookingReadyAt` mean "an offer was sent," at all — for ANY of `BOOKING_READY`'s five entry
paths, not just the three unwritten ones?

**What tracing the actual handler code found.** `BOOKING_READY`'s own canon description is
"Enough is known to offer a next commercial step" — a readiness claim, not a delivery claim.
`lr-t10` and `lr-t16` (the two `DETERMINISTIC_RULE` paths already live before this pass) each
propose exactly one side effect on entry: a `NOTIFICATION`, addressed to `'Named owner'`,
describing that the enquiry is ready — never a `MESSAGE_SEND` to the prospect. Canon's own
`possibleActions` already lists "Notify a named owner" and "Offer a next commercial step" as
two distinct actions; the handler code was only ever doing the first one. `lr-t22`'s own
canon guard text — "the OFFERED next step went unanswered" — presupposes an offer actually
reached the prospect. The prior implementation started that clock from `bookingReadyAt`,
which is written the instant the case becomes ready, whether or not anyone ever sends
anything. That is Outcome B from this pass's own brief, confirmed by the repository's own
code rather than assumed: BOOKING_READY means "ready to offer," and readiness evidence and
offer-sent evidence were being silently treated as the same fact.

**The fix.** `bookingReadyAt` keeps its exact prior meaning and is now written at all FIVE
entry points — `lr-t10`, `lr-t16` (unchanged), and now `lr-t24`, `lr-t27`, `lr-t34`
(`lib/engine/handlers/lead-rescue.ts`'s `handleHumanDecision`) — closing the prior pass's own
named coverage gap honestly, as readiness evidence, nothing more. A new fact, `offerSentAt`,
is written in exactly one place: a new handler, `handleOfferDespatched`, for a new event type,
`lead.offer.despatched`, guarded to apply only from `BOOKING_READY` (a safe no-op everywhere
else, the same "no recognised condition, no guess" discipline `handleWaitReevaluation`
already uses) and requiring an authorizing person (`decidedBy`, authority-verified the same
way `handleHumanDecision` already verifies authority) — canon's own `humanOnlyActions` names
"Approving any message that makes or implies a commitment" as human-only, and this is that
approval, made explicit. `handleOfferWaitReevaluation` (`lr-t22`'s rule) now reads
`state.facts['offerSentAt']` exclusively; reading `bookingReadyAt` there was the entire
defect, and it is now used nowhere in that function. No new lifecycle state, transition,
side-effect kind, operating parameter, or client policy was needed: `bookingOfferWindowHours`
/`kestrel-booking-offer-window` keep their exact prior meaning, now correctly anchored.

**Deliberately NOT folded into `human.decision.recorded`.** An early design considered adding
an `'OFFER_SENT'` value to `HumanDecisionPayloadSchema.decision` instead of a new event type.
Rejected once traced through `humanTarget()`: that function maps a decision to a target state
and lets the engine's own transition-legality check decide if the move is permitted from
wherever the case currently is — which would have let an `'OFFER_SENT'` decision submitted
from, say, `NEEDS_HUMAN` silently ALSO perform `lr-t24`'s clearance (a declared, legal
`NEEDS_HUMAN -> BOOKING_READY` move exists for an unrelated reason), recreating the exact
conflation — clearing a case and offering it treated as the same action — this whole pass
exists to remove. `lead.offer.despatched` is a genuinely separate event instead, exactly the
same shape as `lead.wait.reevaluated`: dispatched by lifecycle state, not by decision label.

**Falsifying tests, written before implementation and confirmed failing for the right reason
first.** Reverting only the handler produced 23 failures across `tests/lead-rescue.test.ts`,
`tests/lead-rescue-offer-wait.test.ts`, and `tests/lead-rescue-offer-wait-resume.test.ts` —
`ELAPSED` where `STILL_WAITING` was expected, `undefined` facts, and an unhandled event type —
never a typo or a setup bug. New and rewritten coverage proves: `lr-t24` (the existing
`ambiguous-high-risk` scenario) and `lr-t34` (the existing `restricted-contact-review`
scenario) now write `bookingReadyAt` and never `offerSentAt`; a direct test drives `lr-t23`
then `lr-t27` (`ESCALATED -> BOOKING_READY`, previously exercised by no scenario or test at
all) to the same result; a case cleared to `BOOKING_READY` with no offer ever despatched
stays `STILL_WAITING` even ten thousand hours later; the enquiry's own acknowledgement
(a genuine `MESSAGE_SEND` to the prospect, but explicitly non-committal) is confirmed to
never be mistaken for the offer itself; re-escalating a case that was cleared again without a
fresh despatch is governed by the STALE `offerSentAt`, not a restarted clock; a despatch
attempt opted into execution-outcome tracking and resolved `OUTCOME_UNKNOWN` still writes
`offerSentAt` (this build's fidelity is "the system authorized and attempted despatch," the
same level the acknowledgement and question effects already commit to, not "a provider
confirmed delivery" — documented, not assumed); and `lead.offer.despatched` submitted with no
case ever having reached `BOOKING_READY` is a genuine no-op. Every property the prior three
passes proved for the generic `WaitIncidentStore`/`OperationClaimStore`/`checkWaitIncident`
machinery — cross-runtime claim exclusivity, crash-to-`UNCERTAIN`, revision-scoped re-park —
re-verified unchanged with `offerSentAt` as the anchor instead of `bookingReadyAt`, because
that machinery was never told which fact to read; it only asks the handler whether the state
moved.

**One new canonical scenario, and one live-demo generalisation.**
`reviewed-offer-elapses` (`data/profiles/kestrel/scenarios/lead-rescue.ts`) is the full
grammar this pass's brief asked for, visible end to end: a policy-sensitive enquiry (`lr-t11`)
reaches `NEEDS_HUMAN` with zero autonomous action, the founder clears it (`lr-t24`,
`bookingReadyAt` only), a genuinely separate event despatches the actual offer
(`offerSentAt`), a re-check within the window takes no action, and a re-check past it
escalates (`lr-t22`) — the identical rule and durable machinery `offer-window-elapses`
already proved on the direct `lr-t10` path, now proven on a human-cleared one too. That
existing direct-path scenario itself gained the missing despatch event, since — falsified
before the fix — it could no longer honestly reach `NEEDS_HUMAN` without one.
`app/api/lead-rescue/wait-incidents/route.ts`'s park flow, previously replaying only a
scenario's first event, now replays every SETUP event (everything before a fixture's first
`lead.wait.reevaluated` check) — one for `reply`, two for `offer` (the enquiry, then the
despatch) — so the live demo's "offer" park button genuinely exercises both events, not a
single event pretending to be both. Live-verified in the browser: parked an offer incident,
confirmed its deadline computes from the despatch (not the enquiry) time, escalated it via
"simulate past deadline," and inspected the resulting `NEEDS_HUMAN` state showing both
`bookingReadyAt` and `offerSentAt` as distinct, correctly-ordered facts, plus a `CONFIRMED`
operation-claim record for the resulting notification — then parked and independently
verified a `reply` incident is completely unaffected.

**What remains honestly simulated.** `handleOfferDespatched`'s `MESSAGE_SEND` effect uses the
same always-succeeds claim path every other effect in this handler uses by default, and can
opt into the same execution-outcome tracking (`sendAttempts`) the acknowledgement already
supports — proven directly, not assumed. `offerSentAt` is written the moment despatch is
authorized and attempted, independent of whether that attempt later resolves `EXECUTED` or
`OUTCOME_UNKNOWN` — the same fidelity choice this portfolio already made for the
acknowledgement and the missing-information question, not a new, offer-specific leniency
introduced by this pass. No live provider, credential, or outbound channel exists anywhere;
`maturity` does not change this pass: still `INTERACTIVE_PROTOTYPE`, still `NOT_LIVE`.

**Files changed.** `lib/engine/handlers/lead-rescue.ts` (`handleHumanDecision` gains the
`bookingReadyAt` write on `BOOKING_READY` re-entry; `handleOfferWaitReevaluation` reads
`offerSentAt`; a new `OfferDespatchPayloadSchema` and `handleOfferDespatched`; the acknowledgement's
send-attempt reader renamed `readSendAttempt`, now shared by both handlers; zero change to
`handleReplyWaitReevaluation`, `handleEnquiry`'s or `handleReply`'s own dispositions beyond
comments correcting what `bookingReadyAt` does and does not prove).
`data/profiles/kestrel/scenarios/lead-rescue.ts` (a despatch event inserted into
`offer-window-elapses`; the new `reviewed-offer-elapses` scenario).
`app/api/lead-rescue/wait-incidents/route.ts` and its `check` sibling (the offer kind's
discriminant fact, and the park flow's setup-event replay, generalised). `app/lead-rescue/wait/page.tsx`
(one sentence of copy, honestly describing the offer kind now replaying two events).
`tests/lead-rescue.test.ts`, `tests/lead-rescue-offer-wait.test.ts`, and
`tests/lead-rescue-offer-wait-resume.test.ts`. Zero changes to `data/systems/lead-rescue.ts`
(canon), `data/profiles/kestrel/profile.ts` (no new operating parameter or policy — the
existing `bookingOfferWindowHours`/`kestrel-booking-offer-window` needed no change), or any
of `lib/engine/reducer.ts`, `lib/engine/run.ts`, `lib/engine/wait-resume.ts`,
`lib/persistence/wait-incident-store.ts`, `lib/persistence/operation-claim-store.ts` — the
generic wait/resume/claim machinery genuinely did not need to know which fact anchors a given
category's clock, confirmed again rather than merely re-asserted. `npm run docs` was re-run
and produced no diff, confirming no canon or profile drift.

## The reviewed-offer operator journey goes live — this pass

**What the prior pass left readable but not clickable.** The prior pass proved, in one
canonical fixture (`reviewed-offer-elapses`), that a human-cleared case correctly separates
readiness (`bookingReadyAt`) from offer-sent evidence (`offerSentAt`). That proof lived
entirely in a deterministic scenario replay — an observer could read the transcript, not
drive the decision themselves. This pass's own "single recommended next fidelity gap" named
the resulting hole precisely: the live `/lead-rescue/wait` demo could park a pre-authored
`BOOKING_READY` incident and watch it wait, but could not let a visitor watch a case arrive
at `NEEDS_HUMAN`, decide it, and despatch a real offer to it, each step rendered as it
happens. This pass closes that hole.

**The journey, click by click.** `/lead-rescue/wait` now has three stages, each a distinct
panel: **Cases under human review** (NEEDS_HUMAN / ESCALATED / SUPPRESSION_REVIEW — why
automation stopped, what remains unresolved, a decision form); **Ready — no offer sent yet**
(BOOKING_READY, no `offerSentAt` — a despatch form, explicit that readiness is not delivery);
**Waiting for a response** (a genuine timer running — the pre-existing reply/offer table,
untouched). A new "Start a case needing human review" button parks only the fixture's
enquiry event, reaching a genuine `NEEDS_HUMAN` (`lr-t11`, policy-sensitive, zero autonomous
action) with zero pre-baked decision or despatch. The operator then supplies both: a decision
(role + decision kind + rationale) and, once cleared, a despatch (role + recipient + offer
content) — through two new routes, `POST .../decide` and `POST .../dispatch`.

**The false-positive risk this pass found and closed at the orchestration layer.**
`handleOfferDespatched`'s own pure computation has always included `offerSentAt` in its plan,
unconditionally — the same "EXECUTED is a plan, not an action" discipline this codebase
already documents extensively for the wait-elapsed notification. For scenario replay that is
correct and unchanged. But this pass's brief named a genuine defect in extending that same
plan to a LIVE, persisted journey: if the orchestration layer durably wrote that plan to disk
the instant `applyEvent` computed it, an offer whose simulated send came back
`OUTCOME_UNKNOWN` would still start a real 48-hour countdown to escalation — punishing a
prospect for not answering an offer that may never have reached them. `dispatchAuthorizedOffer`
(`lib/engine/wait-resume.ts`, new this pass) closes this by reusing, not reinventing, the
EXACT claim-then-invoke ordering `checkWaitIncident` already proved for lr-t14/lr-t22's own
notification: plan (pure `applyEvent`), claim (durable, exclusive, via the unmodified
`OperationClaimStore`), invoke the configured executor ONLY after the claim is won, confirm
only on genuine success — and only THEN, never before, is the plan's `offerSentAt` persisted
via `store.park()`. An `UNCERTAIN` outcome leaves the original record — still `BOOKING_READY`,
still no `offerSentAt` — completely untouched. Falsified directly: temporarily removing the
post-claim gate (returning to "always park the computed plan") made three tests fail
immediately, each showing a falsely `CONFIRMED` outcome where `UNCERTAIN` was required — the
exact defect this pass's brief asked to be closed, reproduced and then closed for real.

**A second, narrower defect: a self-loop identity collision.** `handleOfferDespatched`'s
proposed effect was previously keyed by `event.eventId` — fine for a single authored fixture
event, wrong for a live, resubmittable action: two concurrent despatch requests against the
SAME `BOOKING_READY` cycle would mint two different `eventId`s and therefore two different
idempotency keys, defeating the claim store's exclusivity entirely (each request would look
like a genuinely different operation). The key is now `offer:{entityId}:{bookingReadyAt}` —
stable for the entire lifetime of one un-dispatched `BOOKING_READY` cycle (changing only when
a case genuinely leaves and re-enters readiness), so two racing requests compute the
IDENTICAL identity and collide on the SAME durable claim, exactly the property
`OperationClaimStore` exists to enforce. No existing test asserted the old key's exact value
(all checked `.startsWith('offer:')`), so this is a correctness fix, not a breaking change.

**A second orchestration function for the decision step, with a guard the shared handler
does not itself need.** `applyHumanDecision` (`lib/engine/wait-resume.ts`) applies one
`human.decision.recorded` event against a case parked in `NEEDS_HUMAN` / `ESCALATED` /
`SUPPRESSION_REVIEW`, reusing `handleHumanDecision` completely unchanged. On top of the
handler's own (correct, scenario-appropriate) behavior, this function adds two guards a
one-shot scenario replay never needed: an expected-revision check (refusing a stale or
duplicate resubmission, the same discipline `WaitIncidentStore.resolve()` already applies to
racing resumes) and treating the handler's own authority verification as GATING rather than
merely informational — `handleHumanDecision` records a PASS/FAIL authority check but has
never blocked on it, correct for narrating a scenario, insufficient for an interactive
surface a person can submit to with the wrong role. Falsified directly: submitting a decision
as `'analyst'` (authority 1, below the handler's own `>= 2` threshold) is refused
(`UNAUTHORIZED`) with the original record untouched, verified both by test and live in the
browser.

**Reused without any change:** `applyEvent`, `handleHumanDecision`, `handleOfferDespatched`
(beyond the one identity-key fix above), `WaitIncidentStore` (including its revision
high-water mark), `OperationClaimStore`, `checkWaitIncident`, and the demo's own
`SideEffectExecutor` — renamed `AlwaysSucceedsSimulatedExecutor` (from
`AlwaysSucceedsNotificationExecutor`) because it is now genuinely shared, unchanged in
behavior, between the wait-elapsed notification and the operator-initiated offer send, rather
than a second executor invented for the second kind of send. A review-stage or ready-stage
snapshot is parked directly via `store.park()` rather than through `parkWaitingIncident` —
whose own documented contract is scoped to "already in a genuinely waiting lifecycle
state" — keeping that existing wrapper's contract honest rather than stretching it; the
underlying durability is identical either way, since `WaitIncidentRecord` was never
wait-specific in its own type.

**Falsifying tests, written before and during implementation.**
`tests/lead-rescue-review-dispatch.test.ts` (19 tests, new this pass) proves: a case reaches
a legitimate `NEEDS_HUMAN` with zero autonomous action; the parked record exposes the
escalation reason and missing information a review screen needs; an authorized decision
reaches `BOOKING_READY` through the real `lr-t24` transition; insufficient authority, a
malformed payload, a stale/duplicate resubmission, an out-of-order resubmission against a
case no longer under review, and a decision against a nonexistent or terminal incident are
ALL refused safely with the original record untouched; `BOOKING_READY` alone starts no timer
even ten thousand hours later; an explicit despatch produces a genuine prospect-facing
`MESSAGE_SEND` (never a `NOTIFICATION`) with `executionMode: 'SIMULATED'`; a confirmed
despatch starts a real, checkable 48-hour window (before: untouched; at/after: `lr-t22`
fires); an uncertain or rejected despatch creates no offer-sent evidence and never falsely
elapses; re-dispatching an already-dispatched case is refused with no second send attempted;
two concurrent despatch attempts on the same cleared case invoke the observable executor at
most once (file-backed stores, genuine `Promise.all` racing); a crash after invoking but
before confirming yields `UNCERTAIN` and a fresh recovery runtime never replays the send; a
fresh runtime reconstructs every stage — review, decision, dispatch, elapse — across
independently constructed store instances; and the dispatch claim identity and the
wait-elapsed notification claim identity are distinct and both independently confirmable
within the same journey. Two of the most safety-critical guards — the uncertain-dispatch
persistence gate and the revision/state-allowlist guard on decisions — were confirmed
falsifying directly: temporarily disabling each one reproduced exactly the failures the
corresponding tests were written to catch, then the fix was restored and re-verified green.

**Live-verified in the browser, the full journey in one sitting.** Started a review case
(`NEEDS_HUMAN`, "Policy-sensitive content detected. Routed to a person rather than
answered."); submitted a decision as `analyst` and confirmed `UNAUTHORIZED` with the case
still listed under review; submitted the same decision as `client-partner` and watched it
move to "Ready — no offer sent yet" with `outcome: "ACCEPTED"` and `bookingReadyAt` set;
despatched an offer and watched it move to "Waiting for a response" with `outcome:
"CONFIRMED"`, `offerSentAt` set, and a 48-hour deadline computed from the despatch time, not
the enquiry or the decision; clicked "Check" before the deadline and confirmed
`STILL_WAITING`; clicked "Simulate past deadline & check" and confirmed `outcome: "ELAPSED"`,
`lr-t22`, final state `NEEDS_HUMAN`; confirmed the incident disappeared from the waiting list
on resolution; then, independently, parked a `reply` (lr-t14) demo incident and confirmed it
still parks, lists, and computes its 24-hour deadline exactly as before, completely
unaffected by any of this pass's changes.

**Files changed.** `lib/engine/wait-resume.ts` (`applyHumanDecision`, `dispatchAuthorizedOffer`,
and three small exported/shared helpers — `executedSideEffects`, `operationClaimId`,
`downgradeEffect` — promoted from private to exported so the new functions reuse them rather
than re-deriving the same logic; `checkWaitIncident` itself unchanged in behavior, only
refactored to share a `freshInternals()`/`toStoredEngineState()` helper with the new
functions). `lib/engine/handlers/lead-rescue.ts` (`handleOfferDespatched`'s idempotencyKey
now keyed by `bookingReadyAt` instead of `event.eventId` — the self-loop identity fix above).
`lib/engine/lead-rescue-wait-runtime.ts` (executor
class renamed, one export, one field value, no behavior change).
`app/api/lead-rescue/wait-incidents/route.ts` (a `review` kind and `stage` computation, both
additive). Two new routes: `app/api/lead-rescue/wait-incidents/decide/route.ts` and
`.../dispatch/route.ts`. `app/lead-rescue/wait/page.tsx` (three-panel rewrite: review /
ready / waiting, the existing waiting table preserved verbatim in behavior). One new test
file, `tests/lead-rescue-review-dispatch.test.ts`. Zero changes to `data/systems/lead-rescue.ts`
(canon), `data/profiles/kestrel/profile.ts`, `lib/engine/reducer.ts`, `lib/engine/run.ts`,
`lib/persistence/wait-incident-store.ts`, or `lib/persistence/operation-claim-store.ts`.
`npm run docs` was re-run and produced no diff.

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
  unanswered" on `BOOKING_READY` — genuinely executes, correctly anchored, this pass.**
  Reached through the real handler (`lr-t10`/`lr-t16`, and now also `lr-t24`/`lr-t27`/`lr-t34`
  after a human clears a case), durably parked, and resumed through the identical
  `WaitIncidentStore`/`OperationClaimStore`/`checkWaitIncident` machinery `lr-t14` uses, with
  zero changes to any of the three. The clock itself is anchored to `offerSentAt` — written
  only by a new, explicit `lead.offer.despatched` event — never to `bookingReadyAt`, which
  proves only that a case became ready, not that a prospect received anything. This pass
  closed a genuine false-positive risk the prior implementation carried: entering
  `BOOKING_READY` alone, via any of its five paths, can no longer be mistaken for proof an
  offer was sent.
- **The full reviewed-offer lifecycle is now a live, clickable operator journey, this
  pass.** `/lead-rescue/wait` genuinely drives a case from a real `NEEDS_HUMAN` through an
  authorized human decision (`applyHumanDecision`), a claim-gated simulated offer despatch
  (`dispatchAuthorizedOffer`), a durable wait, and a real `lr-t22` escalation — each step a
  real file write and a real HTTP round trip, not a fixture replay. The same false-positive
  risk this pass's own earlier section closed for scenario replay (an uncertain despatch
  durably recording `offerSentAt`) is now also closed for this live path, by reusing —
  unmodified — the exact claim-then-invoke ordering `checkWaitIncident` already proved.
- **Waiting incidents now wake themselves, this pass.** A real n8n Schedule Trigger, on its own
  one-minute interval, calls the existing full-sweep endpoint with no person or script involved
  — live-verified across an autonomous first tick (an eligible incident resolved, a not-yet-due
  one left untouched) and a genuine container-restart boundary (the schedule resumed on its own
  and correctly discovered a newly-eligible incident afterward). `checkAllWaitingIncidents` had
  existed since the attention-timeout pass but had never been driven by anything but a person
  clicking a button; `tests/lead-rescue-wait-sweep.test.ts` additionally proves, at the sweep
  entry point itself rather than only at the per-incident level underneath it, that mixed
  eligible/non-eligible sweeps, concurrent sweeps, and restart-reconstructed sweeps all still
  hold the exact same claim-store guarantee already proven — with zero changes to
  `checkWaitIncident`, `checkAllWaitingIncidents`, or either persistence store.

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

## Lead Rescue attention timeout (lr-fm-approval-timeout) — this pass

**The declared, `Pending` failure mode the prior pass's own live surface made concrete.**
`data/systems/lead-rescue.ts` names `lr-fm-approval-timeout` ("HUMAN_APPROVAL_TIMEOUT")
precisely: "A case held for human approval is never actioned... the lead decays silently
while the system reports it as correctly parked," recovery "Escalate to the next owner in
the authority chain," `verificationTest: 'Pending — approval timeout scenario not yet
authored'`. The prior pass's own "Cases under human review" and "Ready — no offer sent yet"
panels made this genuinely reachable for the first time: a real operator can park a real case
there and simply never act on it, and until this pass nothing in the codebase noticed.

**The policy question this pass answered, not assumed.** `docs/STATUS.md`'s own prior "single
recommended next fidelity gap" flagged three open questions rather than resolving them: what
review window is appropriate, which lifecycle state an unattended review or un-despatched
offer escalates TO, and whether the two conditions warrant the same window or two different
ones. Tracing the actual canon text answered the second question directly: `lr-fm-approval-
timeout`'s own `terminalState` ("ESCALATED") is the failure-mode CLASS's typical eventual
recovery path, described in the abstract — it is not a declared transition, no scenario or
parameter for it was ever authored, and this document's own prior text explicitly named
"which lifecycle state to escalate TO" as unresolved. Treating it as settled would have meant
inventing canon drift this repository's own rules forbid. Instead: **business state and
operational-attention state are kept as two genuinely separate concerns.** A case that times
out for lack of human attention stays exactly where it was — `NEEDS_HUMAN`, `ESCALATED`,
`SUPPRESSION_REVIEW`, or `BOOKING_READY` — and only a durably-recorded, claim-gated
NOTIFICATION marks the attention condition. Timeout never approves, rejects, closes, or
despatches on a person's behalf; it only makes the silence itself visible and once-only. The
window question was answered the same way `kestrel-reply-wait-window` and `kestrel-booking-
offer-window` themselves were: two new client policies,
`kestrel-review-timeout-window` (24h — the same urgency tier already established for a
question waiting on a reply) and `kestrel-dispatch-timeout-window` (8h — deliberately shorter,
since by this point a person has already decided to proceed and only the mechanical act of
despatch remains outstanding), each linked to a new `humanReviewTimeoutHours` /
`dispatchTimeoutHours` operating parameter. The two conditions did warrant different windows,
resolving the third open question directly from that same reasoning.

**Architecture: the SAME generic machinery, asked one new question.** `checkWaitIncident`
(`lib/engine/wait-resume.ts`) previously used "did the lifecycle state move?" as its sole
signal for "did anything happen." That signal is correct for lr-t14/lr-t22 (each proposes a
side effect only when it also transitions) but wrong in general — a lifecycle move whose only
proposed effect is `BLOCKED_BY_POLICY` still legitimately resolves the incident with zero
executed effects, and the new attention rules propose a genuinely `EXECUTED` effect while
NEVER transitioning. The gate is now `!lifecycleMoved && candidateEffects.length === 0`
(both conditions, not either alone — proven necessary by a genuine regression this pass caught
against its own change: `tests/lead-rescue-wait-resume-execution-boundary.test.ts`'s
authority-blocked-effect case failed with a lifecycleState-only-replaced gate, confirming
neither signal in isolation is sufficient, before the combined condition was written). Past
the claim loop, the SAME question — did the lifecycle move? — decides whether to call
`store.resolve()` (lr-t14/lr-t22's `ELAPSED`: the incident is genuinely done, remove it) or
leave the record parked and return a new outcome, `ATTENTION_OVERDUE` (the case is still
exactly what it was, still needing a real decision or despatch). No new persistence primitive,
no second claim store, no scheduler: `WaitIncidentStore` and `OperationClaimStore` are
completely unmodified, and the exact `${idempotencyKey}@rev${revision}` claim identity
lr-t14/lr-t22 already established governs the two new notification kinds
(`notify:{id}:review-overdue`, `notify:{id}:dispatch-overdue`) unchanged.

**The one new fact this pass required, and why it is authoritative.** The dispatch-timeout
anchor needed no new fact at all — `bookingReadyAt`, already written at every `BOOKING_READY`
entry point since the semantic-integrity-correction pass, is exactly the "stable readiness
fact" the brief for this pass named as the default anchor, and nothing about its prior meaning
changed. The review-timeout anchor genuinely had no existing fact to reuse: no NEEDS_HUMAN or
SUPPRESSION_REVIEW entry point recorded WHEN a case arrived there. `reviewStartedAt`, written
at all seven genuine entry points (three in `handleEnquiry`, two in `handleReply`, and the
`lr-t14`/`lr-t22` elapsed-escalation branches) and deliberately left untouched by
`handleHumanDecision`'s review-to-review moves (`lr-t23` `NEEDS_HUMAN -> ESCALATED`, `lr-t37`
`SUPPRESSION_REVIEW -> ESCALATED`) closes that gap — escalating a case to a second opinion is
still the SAME unresolved review, not a new one, and must never buy a fresh window. Proven
directly (`tests/lead-rescue-attention-timeout.test.ts`, case 13): a review already 26 hours
old at the moment it is escalated via `lr-t23` reports `ATTENTION_OVERDUE` on the very next
check, not a freshly-reset 24-hour grace period.

**Resolution is derived, never a second mutable flag.** Completing a human decision (moving
the case out of `NEEDS_HUMAN`/`ESCALATED`/`SUPPRESSION_REVIEW`) or a confirmed dispatch
(writing `offerSentAt`) resolves the corresponding attention condition automatically: the next
check simply finds the case no longer matches the rule's own guard and is a safe no-op — no
"resolved" field was added anywhere, following this repository's own stated preference for
derived status over duplicate mutable truth. A stale check against the ORIGINAL deadline after
resolution cannot resurrect the escalation, proven directly rather than assumed
(`tests/lead-rescue-attention-timeout.test.ts`, cases "15+16" and "an overdue dispatch is
still dispatchable...").

**Falsifying tests, written before implementation and confirmed failing for the right reason
first.** `tests/lead-rescue-attention-timeout.test.ts` (17 tests) and
`tests/lead-rescue-attention-timeout-resume.test.ts` (3 tests) were written and run against
the pre-existing code first: 10 of the 17 failed immediately — either a `RangeError` from a
genuinely absent `reviewStartedAt`/missing operating parameter, or `STILL_WAITING` where
`ATTENTION_OVERDUE` was required — never a typo or a setup bug. Implementation then made all
20 pass. Coverage includes: both anchors and both windows computed correctly; pre-deadline
checks are genuine no-ops; crossing each deadline records the overdue condition exactly once
with zero lifecycle transitions and zero synthesized decisions; `ESCALATED` and
`SUPPRESSION_REVIEW` are equally governed by the review rule, not only `NEEDS_HUMAN`; terminal
and unrelated states (`BOOKED`, `DO_NOT_CONTACT`, `WAITING_FOR_REPLY`) are safe no-ops for
both new rules; two adversarial cross-leak cases (a record carrying BOTH a fresh correct
anchor and stale ancient ones for every OTHER category) prove each rule reads only its own
fact; re-parking via `lr-t23` does not restart the review timer; resolution via a genuine
human decision or confirmed dispatch is a durable no-op afterward; `lr-t22` continues to
govern exclusively once `offerSentAt` is present, never the dispatch-timeout rule alongside
it; and, in the resume file, two independently constructed `FileWaitIncidentStore`/
`FileOperationClaimStore` pairs genuinely racing (`Promise.all`, never sequential calls) on
the identical durable snapshot produce at most one `EXECUTED` notification each, verified
through a third, freshly constructed claim-store instance — the same convention
`tests/lead-rescue-wait-resume-concurrency.test.ts` already established for `lr-t14` — plus a
wholly independent runtime, reconstructed after the parking process is discarded, resuming
correctly and remaining idempotent on a second check. Three pre-existing tests
(`tests/lead-rescue-offer-wait.test.ts` cases 2 and 17,
`tests/lead-rescue-review-dispatch.test.ts` cases 5 and 8a — four assertions across three
tests) asserted the OLD, now-intentionally-superseded behavior ("no escalation, no matter how
long it sits") and were deliberately rewritten to assert the NEW correct behavior (readiness
alone still never fabricates `offerSentAt` or fires `lr-t22`, but the SEPARATE
ready-but-undespatched attention condition now correctly fires) — not weakened, and every
property those tests originally proved about `lr-t22`'s own semantic integrity still holds.

**Operator surface.** `/lead-rescue/wait`'s review and ready panels each gained an
`AttentionTimeoutPanel`: what the system is waiting for, the authoritative anchor timestamp,
the computed deadline, a live "within policy"/"OVERDUE" badge (compared against the real
clock on every page load — never a cached or check-triggered flag), the permitted next action,
and an explicit statement of what the timeout does NOT do. "Check attention timeout" and
"Simulate past deadline & check" reuse the existing `/check` route unchanged — `checkWaitIncident`
already generalizes to all four categories, so no new route was needed; only `resolveNow`'s
own "simulate past deadline" helper was rewritten to dispatch by `lifecycleState` first rather
than by "whichever start-of-wait fact happens to be present," closing a genuine ambiguity a
record can carry more than one of (e.g. a case that `lr-t14`-elapsed into `NEEDS_HUMAN` still
carries its now-stale `waitStartedAt` alongside a fresh `reviewStartedAt`). Live-verified in
the browser end to end, both paths: **Path 1** — parked a genuine `NEEDS_HUMAN` case (`lr-t11`,
zero autonomous action), confirmed the review badge read "WITHIN POLICY" with the correct
24h-out deadline, confirmed a real pre-deadline check left it untouched, simulated crossing
the deadline and confirmed the result JSON showed `ATTENTION_OVERDUE` with zero transitions,
`forbiddenActions` explicitly including `synthesize_decision`/`transition_lifecycle_state`,
and a `notify:...:review-overdue` effect `EXECUTED` — then submitted an authorized decision
(`CLEARED_TO_PROCEED`) and confirmed the case moved to `BOOKING_READY` and vanished from the
review panel. **Path 2**, continuing the same case: confirmed the dispatch badge and its
independent 8h deadline (`bookingReadyAt`-anchored), simulated crossing it and confirmed
`ATTENTION_OVERDUE` with `BOOKING_READY` unchanged and `offerSentAt` still absent, then
despatched the offer and confirmed `CONFIRMED` with a genuine `offerSentAt` written and the
case correctly reappearing in "Waiting for a response" governed by `lr-t22`'s own 48-hour
window from that despatch time. Also smoke-tested the independent `lr-t14` path (parked a
`reply` incident) alongside the `lr-t22` incident from Path 2 — both waiting categories
coexisted correctly in the table with independent deadlines. Demo runtime data (`.data/`)
cleaned after verification.

**What remains honestly simulated, and what this pass does not claim.** No scheduler exists
anywhere in this build — an overdue condition is detected only when a check genuinely runs (a
button click here, or a script hitting `/check`), exactly the same honesty already established
for `lr-t14`/`lr-t22`'s own timers; this pass adds two more conditions a real interval-driven
sweep would need to cover, not a sweep itself. Both new escalation notifications are simulated
sends through the SAME `AlwaysSucceedsSimulatedExecutor` every other effect in this demo
already uses — no new provider, credential, or outbound channel. The escalation is always
addressed to the same generic `'Named owner'` target every notification in this handler file
already uses, never a resolved, ordered "next owner in the authority chain" — see "Single
recommended next fidelity gap," below, for why this is now the sharpest remaining gap rather
than a new one this pass introduced. `maturity` does not change this pass: still
`INTERACTIVE_PROTOTYPE`, still `NOT_LIVE`.

**Files changed.** `data/profiles/kestrel/profile.ts` (two new client policies,
`kestrel-review-timeout-window`/`kestrel-dispatch-timeout-window`, and two new operating
parameters, `humanReviewTimeoutHours`/`dispatchTimeoutHours`). `lib/engine/handlers/lead-rescue.ts`
(`reviewStartedAt` written at seven entry points; a new `REVIEW_STATES` dispatch branch in
`handleWaitReevaluation`; two new pure rule functions, `handleReviewAttentionTimeout` and
`handleDispatchAttentionTimeout`, the latter replacing `handleOfferWaitReevaluation`'s prior
unconditional no-op for an un-despatched case). `lib/engine/wait-resume.ts` (`checkWaitIncident`'s
gate and final branch generalized; a new `ATTENTION_OVERDUE` outcome — zero changes to
`applyHumanDecision`, `dispatchAuthorizedOffer`, or either's exported shape).
`app/api/lead-rescue/wait-incidents/route.ts` (GET response gains `reviewStartedAt`,
`attentionWindowHours`, `attentionDeadlineAt`, `attentionOverdue` per incident, and
`windows.review`/`windows.dispatch`) and its `check` sibling (`resolveNow` generalized).
`app/lead-rescue/wait/page.tsx` (a new `AttentionTimeoutPanel` component, wired into both the
review and ready forms; updated "what is real" copy). `tests/lead-rescue-attention-timeout.test.ts`
and `tests/lead-rescue-attention-timeout-resume.test.ts` (new, 20 tests); three pre-existing
tests updated in `tests/lead-rescue-offer-wait.test.ts` and
`tests/lead-rescue-review-dispatch.test.ts`. Zero changes to `data/systems/lead-rescue.ts`
(canon — no new lifecycle state or transition, per this pass's own policy finding above),
`lib/engine/reducer.ts`, `lib/engine/run.ts`, `lib/persistence/wait-incident-store.ts`,
`lib/persistence/operation-claim-store.ts`, `app/api/lead-rescue/wait-incidents/decide/route.ts`,
or `app/api/lead-rescue/wait-incidents/dispatch/route.ts`.

## Lead Rescue n8n ingress seam — this pass

**The gap named at the start of this pass.** Lead Rescue's own canon and every source document
describe an n8n-centered automation system; every runtime proof so far was application-only —
scenario replay, or a live demo page calling the engine directly, never a genuinely separate
orchestration runtime. This pass closes the FIRST seam: an external-shaped lead event, delivered
through a real, executing n8n workflow, reaching the canonical engine. Not a migration of Lead
Rescue into n8n — the engine remains the sole authority on lifecycle, policy, and idempotency;
n8n is proven as a genuine, additional caller of it.

**The authority boundary, enforced structurally, not by convention.** The n8n workflow
(`n8n/workflows/lead-rescue-ingress.json`) has exactly three working nodes: **Lead Event**
(webhook trigger, accepts the external POST), **Validate / Envelope** (a `Set` node that maps
external field names — `event_id`, `submitted_at`, `source_system`, `contact.*` — into the
canonical ingress contract's own field names, nothing else computed), and **Invoke Lead Rescue**
(an HTTP Request node calling the application). Two response nodes, **Return Outcome** and
**Return Transport Error**, surface whatever the application decided. No `IF`, no `Switch`, no
business conditional exists anywhere in the graph — there was never a point where recreating an
engine rule in an n8n node would have been the easy path, because the graph does not ask any
business question at all. Classification, routing, consent screening, and idempotency are 100%
inside `lib/engine/lead-ingress.ts` and the handlers it calls unmodified.

**The ingress contract.** `lib/ingress/lead-rescue-ingress-contract.ts` declares
`LeadRescueIngressEnvelopeSchema`, versioned (`lead-rescue-ingress-1`): `source`, `sourceEventId`
(the idempotency anchor — `CanonicalEvent`'s own documented "natural idempotency anchor", one
layer removed from the engine), an optional `receivedAt`, and a `lead` object (`contactName?`,
`contactEmail?`, `company?`, `message`, `channel`) — deliberately NOT the engine's own
`EnquiryPayloadSchema` (which also carries `consentState` and `requiredFields`, internal
normalization concerns an external system does not and should not know). One realistic fixture:
a complete SOC 2 Type II readiness enquiry naming a framework, a target audit window, and a
headcount — Kestrel's own standard qualification shape, reused verbatim from every existing
scenario rather than invented for this pass.

**Idempotency: the same durable claim primitive, asked a new question.**
`lib/engine/lead-ingress.ts`'s `ingestExternalLead` reuses `OperationClaimStore` — the exact
`fs.open(path, 'wx')`-backed, cross-process-exclusive primitive `checkWaitIncident` and
`dispatchAuthorizedOffer` already proved — keyed on `ingress:{entityId}`, where `entityId` is
DETERMINISTIC from `(source, sourceEventId)`, never random. `EventLedger` (in-memory, per-call)
is explicitly not reused: it has zero memory across HTTP requests, the same insufficiency
`checkWaitIncident`'s own module docstring already identified for durable dedupe. A claim that
wins runs the real engine exactly once and durably parks the result (reusing `WaitIncidentStore`
— the SAME store the review/ready/waiting operator panels already read, so an n8n-ingested case
is visible in the existing UI with zero new surface); a claim that finds `ALREADY_CONFIRMED`
loads the existing case and reports `DUPLICATE`, executing nothing; a claim that finds
`UNCERTAIN` (a concurrent delivery mid-flight, or a crash between claiming and confirming)
refuses to guess and reports `UNCERTAIN` — the identical three-way outcome shape this codebase
already established for every other durable claim in this system.

**The one new persisted field, and why it is authoritative.** `WaitIncidentRecordSchema` gains
an optional `provenance: { source, sourceEventId, ingestionPath }` — record-level metadata,
deliberately NOT folded into `engineState.facts`: provenance is a fact about the ORCHESTRATION
boundary that delivered an event, not business state the pure handler computes from event
content. Not derivable from anything else already on the record. Carried forward unchanged
across every re-park (`applyHumanDecision`, `dispatchAuthorizedOffer`) rather than dropped —
a case that entered through n8n stays traceably marked as having done so through its entire
lifecycle, verified directly (`tests/lead-rescue-ingress.test.ts`, case 3).

**The classification judgment stays fixture-backed — this is not AI classification expansion.**
`FixtureDecisionProvider`, constructed fresh per ingress call with exactly one authored
judgment, is the identical SIMULATED provider every scenario in this portfolio already uses.
The judgment's identity is derived from the message's own content hash (djb2, deterministic,
never `Math.random`), so the one authored lead genuinely resolves; any other message content
resolves a DIFFERENT judgment id, `FixtureDecisionProvider` correctly reports `UNAVAILABLE`, and
the existing "bounded judgment unavailable" rule in `handleEnquiry` routes it to `NEEDS_HUMAN` —
fails safe by construction, proven directly rather than assumed
(`tests/lead-rescue-ingress.test.ts`, "a business outcome of NEEDS_HUMAN...").

**Transport failure vs. business outcome, made structural at both layers.** The application's
new `POST /api/lead-rescue/ingress` route returns 400 for a malformed envelope, 409 for
`UNCERTAIN`, and 200 for EVERY valid business outcome — `ACCEPTED` into `BOOKING_READY`,
`ACCEPTED` into `NEEDS_HUMAN`, or `DUPLICATE` — never conflating "parked for human review" with
failure. The n8n workflow's `Invoke Lead Rescue` node deliberately does NOT set `neverError`:
a non-2xx response correctly trips the node's own error output, wired to **Return Transport
Error** (502, the underlying detail preserved); every 200 flows to **Return Outcome** carrying
the application's own structured JSON verbatim. This was caught and fixed mid-pass: an earlier
draft set `neverError: true` to simplify capturing the full response, which silently routed a
malformed-payload 400 through the SUCCESS branch — corrected once traced, and re-verified live
(see below).

**A hard environmental blocker, found and worked around, not glossed over.** The user directed
using the connected n8n MCP integration. Every MCP call initially returned a bare `Not Found` —
including `get_workflow_best_practices('list')`, a purely static, instance-independent lookup —
and the connector registry (`list_connectors`) showed no n8n connector installed at all,
confirming this was the connector itself, not an auth/instance issue. Reported to the user
directly rather than silently working around it; the user asked to retry, and on retry the
connector was genuinely live. The workflow was built and created there — but `get_workflow_details`
revealed its production URL as `https://ambientframes.app.n8n.cloud/...`: a genuine SaaS
instance, structurally unable to reach `localhost` on this machine. Rather than claim execution
against an unreachable target, or substitute a homemade script and call it n8n, this pass stood
up a second, real n8n instance the task's own preference order already named — local Docker
(`docker.n8n.io/n8nio/n8n`, official image, a named container + a named persistent volume, both
fully reversible) — imported the IDENTICAL workflow JSON via `n8n import:workflow`, published
and activated it via `n8n publish:workflow` (the CLI's own documented replacement for the
deprecated `update:workflow --active`), and ran the full demonstration journey against it,
`host.docker.internal` resolving to this machine's own Next.js dev server exactly as Docker
Desktop's own local networking already provides. The identical workflow JSON was ALSO corrected
on the cloud instance via `update_workflow` for parity — both real, both inspectable, only the
local one was reachable enough to genuinely execute end to end.

**The full demonstration journey, executed live, not narrated.** Every step below is a real
`curl` against the real local n8n webhook (`http://localhost:5678/webhook/lead-rescue-ingress`),
verified against the actual persisted record on disk, not inferred from the HTTP response alone:
1. **First delivery** — a realistic SOC 2 enquiry, genuinely posted. n8n's webhook fired, mapped
   the payload, called the application, and the response was `ACCEPTED`/`BOOKING_READY`/
   `lr-t10`, with `provenance.ingestionPath: "n8n"` — confirmed independently by reading
   `.data/lead-rescue-wait-incidents.json` directly off disk, not merely trusting the HTTP body.
2. **Duplicate delivery** — the exact same payload, redelivered. `outcome: "DUPLICATE"`,
   `revision` unchanged, zero new engine execution — discovered, in fact, because the FIRST
   attempt's own terminal output was silently swallowed by a shell buffering quirk; the second
   call correctly reporting `DUPLICATE` is itself proof the first had already landed.
3. **Distinct delivery** — a genuinely different `sourceEventId`, same message content.
   `outcome: "ACCEPTED"`, a wholly independent second case, `attentionOverdue`/deadline computed
   independently.
4. **Concurrent duplicate delivery** — two `curl` calls backgrounded and fired together
   (genuine OS-level concurrency, not sequential calls relabelled) at the identical
   `sourceEventId`: one came back `ACCEPTED`, the other `DUPLICATE` — never two `ACCEPTED` — and
   exactly one durable case exists afterward.
5. **Malformed payload** — a transport failure, correctly caught by the HTTP Request node's own
   error output and returned as a 502 through **Return Transport Error**, carrying the
   application's own 400 detail through rather than a generic n8n error.
6. **Restart boundary** — the n8n container itself was restarted (`docker restart`) and the
   original event redelivered: still `DUPLICATE`, `revision` still unchanged — the orchestration
   runtime holds no cache of its own; every durable fact lives in the application's file-backed
   store, exactly as `tests/lead-rescue-ingress.test.ts` case 6 (independent `FileWaitIncidentStore`/
   `FileOperationClaimStore` reconstruction) already proves directly.

**Operator observability — the existing surface, not a new one.** `GET /api/lead-rescue/wait-incidents`
gains one additive field, `provenance` (null for every fixture-demo case, populated for a
genuine n8n arrival); `app/lead-rescue/wait/page.tsx` gains one small `ProvenanceBadge`
component ("via n8n · website-intake-form") shown next to the lifecycle-state badge on both the
review and ready panels — the SAME operator page the last two passes already built, showing an
n8n-ingested case sitting in "Ready — no offer sent yet" with its dispatch-attention countdown
already running, no disconnected dashboard anywhere.

**Falsifying tests, written before hardening the implementation.** `tests/lead-rescue-ingress.test.ts`
(10 tests) proves: a valid ingress genuinely executes the engine and returns a structured
`ACCEPTED` result with a real declared `ruleId`; a malformed envelope is rejected by schema
before any claim is attempted; provenance is durably retained; case identity is deterministic
from `(source, sourceEventId)`, never random; identical redelivery is a `DUPLICATE`, never a
second execution; redelivery after full store/claim-store/runtime reconstruction (independently
constructed `FileWaitIncidentStore`/`FileOperationClaimStore` instances, the discarded original
never referenced again) remains safe; two genuinely distinct source event ids are never
deduplicated against each other; two genuinely concurrent (`Promise.all`, file-backed, racing)
deliveries of the same identity produce at most one `ACCEPTED`, verified through a THIRD,
freshly constructed store; a `NEEDS_HUMAN` business outcome is still a structured `ACCEPTED`
result, never a transport failure; and the existing direct (non-n8n) demo park path is
unaffected — a case parked the old way still carries no `provenance` field. Deliberately broken
before restoring the fix: the `ALREADY_CONFIRMED` branch was disabled
(`if (false && attempt.decision === 'ALREADY_CONFIRMED')`), and the sequential-redelivery and
restart-reconstruction tests immediately failed — `ACCEPTED` where `DUPLICATE` was required,
never a typo or setup bug — confirming the guard is genuinely load-bearing before it was
restored.

**What remains honestly simulated, and what this pass does not claim.** No real prospect, form
provider, or CRM sent any of the traffic this pass verified — every payload was authored and
posted by this pass itself, through a real webhook, to prove the SEAM, not to prove a live
external integration exists. The bounded judgment remains fixture-backed for the one authored
lead shape; a structurally different message correctly fails safe to `NEEDS_HUMAN` rather than
being classified, which is honest but is not a general classifier. No scheduler exists — this
pass proves ONE trigger shape (an inbound webhook), not the recurring sweep the last several
passes have named as still absent (`checkAllWaitingIncidents` still requires a manual "Check all
waiting now" click or a direct API call; see "Single recommended next fidelity gap," below).
`maturity` does not change this pass: still `INTERACTIVE_PROTOTYPE`, still `NOT_LIVE` — an
additional orchestration RUNTIME now genuinely calls into the application, which is new, but
`PARTIALLY_LIVE`'s own bar (`docs/FIDELITY_ASSESSMENT.md`: "nothing external is contacted") is
about a real-world, outside-the-portfolio consequence — a real prospect, a real provider, a real
credential — none of which this pass touches. The distinction this pass draws precisely: n8n
genuinely executing locally is real; the durable application state it produces is real; every
downstream provider action remains simulated; and no production credential, endpoint, or
deployment exists anywhere in this path.

**Files changed.** `lib/ingress/lead-rescue-ingress-contract.ts` (new — the versioned envelope
schema). `lib/engine/lead-ingress.ts` (new — `ingestExternalLead`, the orchestration seam).
`lib/persistence/wait-incident-store.ts` (`provenance`, optional, additive).
`lib/engine/wait-resume.ts` (`applyHumanDecision`/`dispatchAuthorizedOffer` carry `provenance`
forward across re-park — additive, no behavior change for any record without one).
`app/api/lead-rescue/ingress/route.ts` (new — the canonical HTTP ingress n8n calls).
`app/api/lead-rescue/wait-incidents/route.ts` (`provenance` added to the GET response).
`app/lead-rescue/wait/page.tsx` (`ProvenanceBadge`, wired into the review and ready panels).
`n8n/workflows/lead-rescue-ingress.json` (new — the canonical, importable workflow artifact).
`tests/lead-rescue-ingress.test.ts` (new, 10 tests). Zero changes to `data/systems/lead-rescue.ts`
(canon), `data/profiles/kestrel/profile.ts`, `lib/engine/reducer.ts`, `lib/engine/run.ts`,
`lib/engine/handlers/lead-rescue.ts`, `lib/persistence/operation-claim-store.ts`, or any of the
existing `decide`/`dispatch`/`check` routes.

## Lead Rescue scheduled n8n sweep — this pass

**The gap named at the end of the prior pass.** `checkAllWaitingIncidents` (`lib/engine/wait-resume.ts`)
has existed since the attention-timeout pass and already sweeps every waiting AND
overdue-attention incident correctly — but nothing had ever called it except a person clicking
"Check all waiting now" in the operator UI or a hand-run API call. The prior pass's own "Single
recommended next fidelity gap" named this precisely: n8n had proven it could safely TRIGGER the
engine (new-lead ingress); the still-open question was whether anything could independently WAKE
it. This pass closes that gap.

**A stale canon claim, repaired first.** A same-day state-reconciliation pass (independent of
this implementation) found `data/systems/lead-rescue.ts`'s `lr-fm-approval-timeout` failure mode
still declared `verificationTest: 'Pending — approval timeout scenario not yet authored.'`, even
though the attention-timeout pass had closed it with 20 tests three passes ago. Corrected to cite
`tests/lead-rescue-attention-timeout.test.ts`/`tests/lead-rescue-attention-timeout-resume.test.ts`
by name; `npm run docs` regenerated `docs/FAILURE_MODE_REGISTER.md` with exactly that one
propagated change, confirmed by diff before touching anything else.

**Falsifying the sweep entry point itself, not just what it wraps.** Every existing reliability
proof — cross-runtime racing, crash-window recovery, restart durability — exercises
`checkWaitIncident` for one named incident. `checkAllWaitingIncidents` had never been driven by
any test before this pass: it is a thin `listWaiting()` + sequential loop over that already-proven
function, and the task's own instruction was explicit — reuse the existing claim-store guarantee,
do not invent scheduler-specific deduplication. `tests/lead-rescue-wait-sweep.test.ts` (4 new
tests) asks whether that composition actually preserves the guarantee at the boundary a scheduler
calls: a sweep containing one eligible and one not-yet-due incident resolves only the eligible one
with zero side effects on the other; two concurrently invoked sweeps (independently constructed
stores, sharing only the files on disk) over the same eligible incident execute its notification
at most once, verified through a third, freshly constructed claim store; a second sweep run
against brand-new store instances reconstructed from disk does not re-resolve what the first
already resolved, and correctly discovers an incident that became eligible only after the first
sweep ran; and a sweep over an empty store returns cleanly. All four passed against entirely
unmodified production code — the architecture already proved this property at the per-incident
level, and this pass demonstrates rather than assumes that the sweep wrapper does not undermine
it. Zero changes to `checkWaitIncident`, `checkAllWaitingIncidents`, `OperationClaimStore`, or
`WaitIncidentStore` were needed.

**The workflow.** `n8n/workflows/lead-rescue-wait-sweep.json` has exactly two working nodes: a
Schedule Trigger (interval mode, one-minute cadence — a demo-appropriate cadence, not a production
SLA decision) and an HTTP Request node calling `POST /api/lead-rescue/wait-incidents/check` with
no body (the route's own existing no-`incidentId` branch, which already reads the real server
clock and calls `checkAllWaitingIncidents`). No `IF`/`Switch` node exists anywhere in the graph —
the same structural discipline the ingress workflow established: this graph never asks a business
question, only the clock. A sticky note documents the one genuine design question the task named
in advance as a policy decision rather than an implementation detail (interval and scope), and
records explicitly why no scheduler-level mutex was added: `OperationClaimStore`'s existing
cross-process-exclusive claim already makes overlapping or genuinely concurrent sweeps safe,
proven directly above, not assumed.

**Live-verified against the local Docker n8n instance — the scheduler itself doing the
triggering, not a manual call standing in for it.** Two eligible incidents and one persistently
not-yet-due incident were seeded directly into the durable store (backdating `waitStartedAt`,
the same mechanism a genuinely-25-hours-old case would produce, rather than waiting real hours).
The workflow was imported and activated; a real, un-manually-triggered tick fired within the
first minute and correctly resolved the eligible incident while leaving the not-due one
completely untouched — confirmed by reading the persisted store directly, not by trusting the
HTTP response of a call this pass never made. The container was then restarted — a genuine
process-boundary crossing for the orchestration runtime itself, not a simulated one — with a
freshly-seeded eligible incident in place; the schedule resumed on its own after the restart (no
manual re-activation), and the next tick correctly discovered and resolved it. One early
verification step accidentally called the endpoint manually via `wget` from inside the container
before the schedule's own first tick — caught immediately (the test incident resolved a beat
before intended), the incident was re-seeded, and the actual scheduled-trigger proof was
re-run cleanly from there; recorded here rather than silently smoothed over. All test data and
the local claim-store artifacts were removed after verification (`.data/` is gitignored,
demo-runtime state); the container was deactivated and stopped cleanly, matching the ingress
pass's own convention.

**What remains honestly true, not overclaimed.** This pass proves ONE thing: an external
scheduler can safely and repeatedly wake this system's own already-correct sweep logic. It does
not add a second n8n ingress surface (replies, decisions, and dispatch still only reach the
engine through the direct application UI/API — unchanged from the ingress pass), does not change
what "eligible" means, does not add a queue or a second deduplication mechanism, and does not
change maturity: nothing external-to-the-portfolio was contacted. The one-minute interval is a
demo cadence, not a claim about a production SLA — a real deployment would choose its own
interval, a policy decision this pass deliberately leaves open (see the workflow's own sticky
note).

**Files changed.** `data/systems/lead-rescue.ts` (`lr-fm-approval-timeout.verificationTest`
corrected — canon truth repair only, no behavior change). `docs/FAILURE_MODE_REGISTER.md`
(regenerated, exactly the one propagated change). `n8n/workflows/lead-rescue-wait-sweep.json`
(new — the canonical, importable workflow artifact). `tests/lead-rescue-wait-sweep.test.ts` (new,
4 tests). Zero changes to `lib/engine/wait-resume.ts`, `lib/persistence/operation-claim-store.ts`,
`lib/persistence/wait-incident-store.ts`, `app/api/lead-rescue/wait-incidents/check/route.ts`, or
any other application code — this pass is entirely a new orchestration trigger and a canon
correction on top of machinery that already did the right thing.

## Lead Rescue escalation owner resolution — this pass

**The gap named at the end of the prior pass.** Every Lead Rescue notification that reaches a
human — six call sites across `lib/engine/handlers/lead-rescue.ts` — addressed
`target: 'Named owner'`, a simulation placeholder, even though `data/profiles/kestrel/profile.ts`
already declares a real `roles` array with a genuine `authorityCeiling` per role. The prior
pass's own "Known fidelity gaps" item 14 named this precisely and deliberately left it open.

**What the profile actually models, checked before designing anything.** `RoleSchema`
(`lib/model/profile.ts`) has no person-name field — a business profile in this portfolio models
CONFIGURED ROLES (`'Client Partner'`, `'Managing Principal (founder)'`), not named individuals.
Inventing a person's name to satisfy "identify the actual configured person" would have been
worse than the placeholder it replaced — a fabricated identity dressed as real personnel data.
The truthful resolution is therefore a role name: the most specific real identifier this data
model has. `awaitingHuman` (`EngineState`) was checked and ruled out as an "owner" field — every
existing use across this codebase writes it as a human-readable REASON string ("Low-confidence
classification," "Restricted contact..."), never an assignee; no "current owner" tracking exists
anywhere to walk a chain from. The two-tier design below is derived entirely from
`authorityCeiling` values already on the profile, not from any invented hierarchy.

**The policy.** `resolveEscalationOwner(profile, requiredAuthority)` (`lib/model/profile.ts`):
among every role whose `authorityCeiling` is at least `requiredAuthority`, pick the one with the
SMALLEST such ceiling (closest fit — no more escalation than actually required); break ties
between equal-ceiling roles alphabetically by `id`, an explicit rule, never the profile's own
declared array order, which carries no canonical meaning (checked directly: reversing
`profile.roles` and re-resolving returns the identical role). No qualifying role returns
`UNRESOLVED` with a distinct, honest fallback string
(`UNRESOLVED_ESCALATION_OWNER = 'Unresolved — no configured role meets the required authority
level'`) — never a fabricated name, never silently promoted to the closest-but-insufficient
role. Pure, synchronous, and vertical-agnostic — placed alongside `numberParam`/`findParameter`
in the profile-utility layer, not inside the Lead Rescue handler, since `profile.roles` is a
core profile-model concept another system could reuse later, though nothing else was touched
this pass.

**The two genuine tiers, both grounded in real profile data, not invented.** The Kestrel profile
happens to have two roles tied at `authorityCeiling: 3` (`client-partner`, `head-of-delivery`)
and exactly one at `4` (`founder`) — a real, checked precondition, not assumed. Every "first-line"
notification (the two `BOOKING_READY`-entry routings, the `lr-t14`/`lr-t22` wait-elapsed
escalations) calls the resolver at `STANDARD_ESCALATION_AUTHORITY` (3), resolving to `Client
Partner` — the alphabetically-first of the tie, and, independently, the role whose own declared
`responsibilities` text ("Owns named accounts through qualification, scoping, and proposal") is
exactly the right fit for a newly-qualified enquiry. The two attention-timeout rules — the ONLY
two call sites whose own decision/description text already says "the next owner in the authority
chain" — call the resolver at `NEXT_OWNER_ESCALATION_AUTHORITY` (4), one level above the standard
tier, resolving to `Managing Principal (founder)`: a genuinely different, higher-tier owner,
matching the canon language exactly rather than reusing the same placeholder pattern reworded.

**Falsifying tests, written before implementation.** `tests/profile.test.ts` (+5) proves the
resolver in isolation: a configured qualifying role resolves correctly and is always a real
profile role name, never fabricated; the tie-break is genuinely order-independent (reversing
`profile.roles` changes nothing); the strictly-higher tier resolves to a different role than the
tied tier below it; no qualifying role fails safe to `UNRESOLVED_ESCALATION_OWNER`, never a real
or plausible-looking name; the function is pure (identical input, identical output).
`tests/lead-rescue-escalation-owner.test.ts` (new, 7 tests) proves the resolver is genuinely
applied through the real handler paths, not merely available: `handleEnquiry`'s routing
notification and `handleReply`'s reply-completes-fields notification — two materially different
code paths — both resolve to the identical standard-tier owner; `lr-t14`'s wait-elapsed
notification resolves it through the `checkWaitIncident` orchestration boundary;
`handleReviewAttentionTimeout` and `handleDispatchAttentionTimeout` both resolve the genuinely
higher "next owner" tier; every scenario this portfolio declares is swept and asserted to never
emit `'Named owner'` again; and a repeated check of the same overdue incident resolves to the
identical owner both times while the pre-existing `ATTENTION_OVERDUE` idempotency semantics
(never resolved, never a second lifecycle transition) remain completely undisturbed — proving
owner resolution, added at the very boundary the claim store already guards, does not touch
that guarantee. Two pre-existing tests in `tests/lead-rescue-offer-wait.test.ts` asserted the
literal old placeholder string as a stand-in for an unrelated property (effect kind/recipient,
not ownership) and were deliberately updated to assert the resolved value instead, without
weakening what they originally proved.

**Authority boundaries, unchanged.** Resolving WHO a permitted notification names is a lookup
against already-loaded profile data — it never decides WHETHER the notification is permitted.
The engine core's own authority gate, `NOTIFICATION` effect authority levels, and every
human-review lifecycle state are byte-for-byte unchanged; `resolveEscalationOwner` has no access
to `EngineState`, cannot affect a transition, and is called strictly after an effect has already
cleared the authority gate.

**Files changed.** `lib/model/profile.ts` (`resolveEscalationOwner`, `UNRESOLVED_ESCALATION_OWNER`
— new, additive). `lib/engine/handlers/lead-rescue.ts` (`escalationOwnerTarget` helper; all six
`target: 'Named owner'` sites and one step summary now call it). `tests/profile.test.ts` (+5).
`tests/lead-rescue-escalation-owner.test.ts` (new, 7 tests). `tests/lead-rescue-offer-wait.test.ts`
(2 pre-existing assertions updated to the resolved value). Zero changes to `data/systems/lead-rescue.ts`,
`data/profiles/kestrel/profile.ts`, the reducer, the authority gate, `WaitIncidentStore`,
`OperationClaimStore`, or any route. `npm run docs` produced no diff — no canon or profile data
changed.

## Escalation owner resolution — semantic-integrity correction — this pass

**The concern, stated precisely.** The prior pass's `resolveEscalationOwner` broke ties between
equal-`authorityCeiling` roles alphabetically by `id`. Presented with two roles genuinely tied
at ceiling 3 (`client-partner`, `head-of-delivery`), it confidently returned `RESOLVED` /
`Client Partner` — string-sort determinism dressed as a business decision, with no repository
evidence that `client-partner` actually outranks `head-of-delivery` for escalation purposes.

**Audit performed before changing any code, per instruction not to invent an answer.**

1. *Does `authorityCeiling` represent an ordered hierarchy, an execution ceiling, or something
   else?* An execution ceiling only — `RoleSchema`'s own doc comment: "The highest authority
   level this person may exercise. **Caps what automation may do on their behalf.**" Its one
   other use in this codebase (`validateProfileConsistency`, `lib/model/profile.ts`) reads it via
   `Math.max(...)`, a ceiling check, never a hierarchy walk.
2. *Does existing canon provide a semantic method to choose between equally-qualified roles?*
   No field, comment, or documented policy anywhere ranks one same-ceiling role above another.
   The one genuinely relevant precedent argues the opposite way: Client Onboarding's
   `resolveAuthoritativeValue()` (`lib/engine/handlers/client-onboarding.ts`) holds that two
   equally-ranked, disagreeing sources stay an explicit `CONFLICT`, never silently resolved by
   recency or any other incidental signal — this portfolio has already rejected exactly this
   category of shortcut once, for a structurally identical problem.
3. *Does the escalation itself carry enough domain/context to distinguish them?* No. None of
   the four standard-tier `NOTIFICATION` effects (or their `DecisionRecord`) carry any field
   indicating which business domain a case belongs to, and Lead Rescue's own lifecycle
   (enquiry → qualification → booking-ready) never reaches delivery/staffing territory at all —
   there is no structural signal to route on even if one were sought.
4. *Is there a canonical ordering that makes one the legitimate next owner?* Not a declared one.
   `client-partner` appears repeatedly (six times, across Lead Rescue, Dormant Pipeline
   Recovery, and Client Onboarding fixture data) as a `decidedBy`/`owner`/`ownerRoleId` value,
   and its own `responsibilities` text ("Owns named accounts through qualification, scoping, and
   proposal") fits Lead Rescue's domain more naturally than `head-of-delivery`'s ("engagement
   staffing... audit-window handover"). Weighed deliberately and rejected as a basis: this is
   circumstantial evidence from hand-authored narrative fixture data, not a declared rule — using
   it would relocate the same invented policy into a different, harder-to-see place, exactly what
   the task's own instruction warned against.
5. *Was alphabetical ordering ever declared as policy anywhere?* No — confirmed by direct
   search; it originated only in the prior pass's own implementation and its own documentation.

**Conclusion: no legitimate semantic tie-break exists in canon.** `resolveEscalationOwner` no
longer picks a winner among tied roles. `EscalationOwnerResolution.status` is now
`'RESOLVED' | 'UNRESOLVED_NO_QUALIFYING_ROLE' | 'UNRESOLVED_AMBIGUOUS_OWNER'` — two genuinely
distinguishable unresolved reasons, never conflated. The ambiguous case names every tied
candidate (`candidates: readonly Role[]`) and produces a target string listing their names,
prefixed `UNRESOLVED_AMBIGUOUS_OWNER_PREFIX` — the ambiguity is truthfully identified, not
merely flagged. No new profile field (rank, priority, hierarchy) was added — the task's own
instruction not to manufacture one by relocating the invented policy into configuration was
followed.

**What changes in practice, and what does not.** The four "standard-tier" notifications
(`handleEnquiry`'s and `handleReply`'s `BOOKING_READY` routing, `lr-t14`/`lr-t22`'s wait-elapsed
escalations) now correctly report the ambiguous target — this is a genuine behavior change from
the prior pass, and the honest one. The two attention-timeout "next owner in the authority
chain" notifications are completely unaffected: authority 4 is uniquely held by `founder`, so
they continue to resolve cleanly to `Managing Principal (founder)`, proving the fix does not
degrade a genuinely unique resolution into false ambiguity. `escalationOwnerTarget()`
(`lib/engine/handlers/lead-rescue.ts`) and all six call sites are unchanged — they already only
read `.target`, which stays a plain string regardless of which status produced it, so no handler
code needed editing at all.

**Falsifying tests.** `tests/profile.test.ts`: the tied-roles test now asserts
`UNRESOLVED_AMBIGUOUS_OWNER` with both candidates named, and that the target is never either
role's own name (proving the old alphabetical result no longer occurs); a rewritten
order-independence test proves reversing `profile.roles` changes neither the status nor the
candidate set nor the target string; the unique-founder test is retained, confirming genuine
uniqueness still resolves normally; a new test proves the two unresolved reasons produce
genuinely different statuses and target strings, never the same fallback reused; the purity
test is extended to cover the ambiguous case specifically. `tests/lead-rescue-escalation-owner.test.ts`:
the three standard-tier handler tests (`handleEnquiry`, `handleReply`, `lr-t14`) now assert the
live-computed ambiguous target and explicitly assert it is neither `'Client Partner'` nor
`'Head of Delivery'` — proving no silent pick survives at the handler level, not only at the
resolver's own unit tests; both attention-timeout tests are unchanged, proving the higher tier's
genuine uniqueness still propagates correctly; the idempotency test is unchanged and still
passes, since ambiguity resolution never touches the claim store or `checkWaitIncident`'s
identity/dedup logic. Two pre-existing assertions in `tests/lead-rescue-offer-wait.test.ts` that
call `resolveEscalationOwner(KESTREL, 3).target` live (rather than a hardcoded string, a
deliberate choice made the prior pass) needed no changes at all — they continued to pass
correctly once the function they call was corrected, which is itself a small confirmation that
referencing the live function rather than a literal string was the right call.

**Files changed.** `lib/model/profile.ts` (`resolveEscalationOwner` rewritten;
`UNRESOLVED_ESCALATION_OWNER` renamed `UNRESOLVED_NO_QUALIFYING_ROLE_TARGET`; new
`UNRESOLVED_AMBIGUOUS_OWNER_PREFIX`; `EscalationOwnerResolution.status`/`.candidates` extended).
`tests/profile.test.ts` (rewritten resolver tests). `tests/lead-rescue-escalation-owner.test.ts`
(three standard-tier assertions corrected). Zero changes to
`lib/engine/handlers/lead-rescue.ts`, `data/systems/lead-rescue.ts`,
`data/profiles/kestrel/profile.ts`, the reducer, the authority gate, `WaitIncidentStore`, or
`OperationClaimStore`. `npm run docs` produced no diff.

## Lead Rescue live classification seam — this pass

**The gap named at the end of the prior pass.** Every bounded judgment in this portfolio has
always been `FixtureDecisionProvider` replaying authored data — real policy (confidence floor,
contract validation, missing/declined-to-infer discipline) around a simulated boundary. This
pass adds the second `DecisionProvider` implementation the port's own docstring has said "there
should be exactly one more later" of since the port was first declared.

**Orientation before design, per instruction.** No vendor is mandated by canon — `docs/source/`
references "Claude Code" only as the tool that authored this repository, never as a runtime
dependency. This repository's own `claude-api` skill answers the question instead: use
`claude-opus-5` unless a different model is explicitly named, structured JSON output validated
at runtime, closed classification space. `ClassificationResultSchema`
(`lib/model/runtime.ts`) already declares exactly the output contract needed —
`judgmentId`/`classification`/`confidence`/`missingInformation`/`evidenceRefs`/`declinedToInfer`/
`rationaleSummary` — no schema change was needed for the model's own output; `judgmentId` is
deliberately never asked of the model and is injected from the request after validation.
`lr-fm-malformed-ai`'s own declared `retryPolicy` ("At most one re-request; repeated violations
disable the judgment path") is followed exactly, discovered by reading the failure-mode register
rather than inventing a retry count. `EXECUTION_MODES` already declares `'LIVE'`, unused
anywhere in this portfolio until now (`lib/model/runtime.ts:17`) — the correct value for this
provider's own `mode`, not a new concept.

**A real, pre-existing bug found while wiring provenance.** `DecisionRecordSchema.providerId`
("Which DecisionProvider produced this") has existed since this port's earliest pass, but both
of Lead Rescue's classification call sites hard-coded the literal string
`'fixture-decision-provider'` regardless of which provider actually resolved the judgment —
already false the moment two providers existed. Fixed by extending `ResolvedJudgment`'s `OK`
variant with `providerId: string`, populated by `resolveJudgment()` from `provider.id` (already
in scope, previously just not threaded through) — two other tests that hand-constructed a
`ResolvedJudgment` literal (Owner Revenue Intelligence, Receivables) needed the same one-field
addition to keep type-checking, changing nothing about what they prove.

**The boundary granted to the model, exactly what the task specified and no more.** One call, one
response, one classification, from the closed set the CALLER supplies —
`ClaudeDecisionProvider.classify()` has no tools, no memory across calls, no visibility into
lifecycle state, and returns exactly the same shape `FixtureDecisionProvider` already returns.
It cannot send a message, execute an offer, choose escalation authority, or modify state —
those all remain entirely inside the deterministic handler, byte-for-byte unchanged by this
pass. The system prompt (`lib/ports/claude-decision-provider.ts`, versioned in source, not a
runtime-configurable string) is narrow: definitions of the required JSON shape, an explicit
instruction to report low confidence rather than invent certainty, and an explicit instruction
that the delimited `<input-to-classify>` content is untrusted DATA to classify, never
instructions to follow — proven, not merely claimed, by a falsifying test that captures the
actual request sent to the API and asserts an adversarial input string appears only inside that
delimited section, never inside the system prompt (which is byte-identical across every call
regardless of input).

**Failure and uncertainty, all already-existing machinery, none newly built.** A response that
is not valid JSON, fails schema validation, or names a classification outside the permitted set
is retried once, then reported as `JudgmentContractError` — `resolveJudgment` converts this to
`CONTRACT_VIOLATION` with zero new handling, and the existing "unavailable-or-violating judgment
routes to NEEDS_HUMAN" rule in `handleEnquiry`/`handleReply` applies unchanged. A transport
failure, timeout, or explicit model refusal (`stop_reason: 'refusal'`) is never retried at this
layer (the SDK's own transport retries already cover transience) and is reported as
`JudgmentUnavailableError` → `UNAVAILABLE`, same downstream handling. Confidence is passed
through completely unmodified — the provider never gates or interprets its own certainty; the
engine's existing, unchanged `confidenceFloor` comparison decides whether a classification is
usable. No new "uncertainty" concept was built because none was needed: this portfolio's
existing floor-comparison-outside-the-judgment design already IS the safe-uncertainty behavior
the task asked to confirm.

**Provenance, using fields that already existed.** `provider.id`
(`'claude-decision-provider'`) and `provider.mode` (`'LIVE'`) identify the provider; the now-
correctly-threaded `DecisionRecord.providerId` carries that into every decision record a viewer
can already inspect; `judgmentId`/`classification`/`confidence` were already part of
`ClassificationResult`. The ingress route's JSON response gains one additive field,
`classifierProvider`, naming which provider actually ran (`'claude-decision-provider'` or
`'fixture-decision-provider'`) — small, additive, no schema disruption. A structured,
non-secret line (`judgmentId`, model, classification, confidence — never the input text or any
credential) is logged at the point of a successful classification for lightweight operational
observability; nothing about this is persisted into replayable engine state, which stays exactly
as clock-free and pure as before.

**CORRECTED by a later same-day pass — activation was credential-driven, not explicit.** This
section originally described the ingress route as constructing `ClaudeDecisionProvider`
whenever `ANTHROPIC_API_KEY` was present. That was a real defect: a credential is a secret, not
a feature flag, and its mere presence must never by itself select the real provider or
authorize a live call. The activation decision now lives in one small, pure module,
`lib/config/decision-provider-config.ts`: real-provider selection requires an explicit
`LEAD_RESCUE_DECISION_PROVIDER=claude` setting IN ADDITION TO a usable credential. Fixture mode
is the default and stays fully deterministic regardless of whether a credential happens to be
configured. An explicit `claude` selection with no usable credential fails safe rather than
silently reusing fixture output: `resolveIngressDecisionProvider` returns a provider whose
`classify()` throws the same `JudgmentUnavailableError` a genuine network failure would, so it
routes through the existing `UNAVAILABLE` → `NEEDS_HUMAN` handling with zero new logic anywhere
downstream. See "Lead Rescue provider-activation semantics correction," below, for the full
account and its falsifying tests.

**Falsifying tests, written before implementation.** `tests/claude-decision-provider.test.ts`
(11 tests, zero network) injects a fake `AnthropicMessagesClient` — a minimal
`{messages: {create}}` shape both the real SDK client and a test double satisfy — and proves:
valid structured output maps correctly; non-JSON output fails safely with exactly one retry, and
a transient failure recovers on that retry; an out-of-permitted-set classification is refused,
never coerced; a transport failure routes to `UNAVAILABLE` with no additional retry loop stacked
on the SDK's own; a model refusal is treated as unavailable, never as a classification;
confidence passes through unmodified regardless of how low; provenance identifies the real
provider without ever touching a credential value; the adversarial-input security boundary
(above); `FixtureDecisionProvider` is a completely separate class, unaffected; and the model id
defaults to `claude-opus-5` with an explicit override respected. `tests/lead-rescue-ingress.test.ts`
gains two more: a real (fake-but-realistic) `DecisionProvider`, injected through the EXISTING
`LeadIngressDeps.provider` field with no special-case code, genuinely classifies a message the
authored fixture was never keyed to — proving the live path uses the same orchestration seam,
not a parallel one — and a claimed-duplicate redelivery never invokes the provider a second
time, because the durable claim in `ingestExternalLead` refuses the redelivery BEFORE the
provider is ever reached, proving replay/idempotency holds with a real provider exactly as it
already did with the fixture one.

**Evaluation corpus.** `tests/lead-rescue-claude-classifier-eval.test.ts` — 9 labelled cases:
`QUALIFIED_ENQUIRY` and `POLICY_SENSITIVE` reused VERBATIM from existing canon fixture messages
(`INGRESS_FIXTURE_LEAD_MESSAGE`, the restricted-contact scenario's Fenwick message — never
re-typed, so the corpus can't drift from what the live seam actually sends); `NOT_AN_ENQUIRY`,
`OUT_OF_SEGMENT`, and `NEEDS_MORE_INFORMATION` hand-authored, since no existing scenario
exercises any of the three; a genuinely ambiguous case with an explicit acceptable-classification
set rather than a single forced label; an adversarial instruction-injection case judged not by
strict label match but by a dedicated assertion that the injected "confidence 1.0, no missing
information" demand was not obeyed; and two `REPLY_CLASSES` cases (`OPT_OUT` — covering
"rejection," which `ENQUIRY_CLASSES` has no direct member for — and `SUPPLIES_INFORMATION`)
proving the same adapter is genuinely generic over which closed set it is asked to choose from,
not hard-coded to intake. Every expected label was fixed before any model saw the corpus and is
never rewritten to match what a run produces. A structural suite scores the harness itself
against a deterministic fake provider (proving the evaluation/reporting logic independent of
model quality); a second, `describe.skipIf`-gated suite runs the full corpus against the REAL
model and asserts on it. **CORRECTED by a later same-day pass:** this originally read "but only
when `ANTHROPIC_API_KEY` is configured" — a credential alone would have let the suite spend
against the real API merely because one happened to be present in the environment. It now
additionally requires `RUN_LIVE_AI_EVAL=1`; see "Lead Rescue provider-activation semantics
correction," below.

**Live verification: `UNVERIFIED_LIVE`.** `ANTHROPIC_API_KEY` and `ANTHROPIC_AUTH_TOKEN` were
both checked for presence (never printed) in this environment and found absent; no `ant` CLI
was available either. Per the task's own explicit instruction, no live result was fabricated —
the adapter, all 11+2 falsifying tests, and the full 9-case evaluation corpus are built and
pass completely without a credential. **CORRECTED by a later same-day pass:** this originally
said the live evaluation suite "will run for real the moment a credential is configured" — that
was the same activation defect stated in terms of the eval suite. It now runs for real only once
BOTH a usable credential AND `RUN_LIVE_AI_EVAL=1` are configured; a credential with no opt-in
still reports honest `UNVERIFIED_LIVE` and makes no network call.

**What this does NOT do.** No credential was created, printed, committed, or embedded anywhere
— confirmed by direct search of the diff for credential-shaped strings before this pass was
considered complete. No n8n workflow was touched — the live provider is reached entirely through
the existing `/api/lead-rescue/ingress` route and `LeadIngressDeps`, which n8n already calls
unchanged. No tool use, agent loop, or multi-step planning was introduced — one request, one
response, exactly as `FixtureDecisionProvider` already models. Maturity does NOT change: a
private classification API call — the model never contacts a prospect, provider-of-record, or
credential-bearing customer system — does not clear `PARTIALLY_LIVE`'s own bar (a real-world,
outside-the-portfolio consequence), the same reasoning the prior pass's own "next fidelity gap"
section already argued in advance of doing this work.

**Files changed.** `lib/ports/claude-decision-provider.ts` (new — the adapter).
`lib/ports/decision-provider.ts` (`ResolvedJudgment.OK` gains `providerId`; `resolveJudgment`
populates it; module docstring updated). `lib/engine/handlers/lead-rescue.ts` (both hard-coded
`providerId` literals replaced with `resolved.providerId`). `lib/engine/lead-ingress.ts`
(`LeadIngressDeps` gains optional `provider`; falls back to the existing single-fixture behavior
when absent — zero change for every existing caller). `app/api/lead-rescue/ingress/route.ts`
(constructs `ClaudeDecisionProvider` only when `ANTHROPIC_API_KEY` is present; adds
`classifierProvider` to the response). `tests/claude-decision-provider.test.ts` (new, 11 tests).
`tests/lead-rescue-claude-classifier-eval.test.ts` (new, corpus + harness). `tests/lead-rescue-ingress.test.ts`
(+2). `tests/owner-revenue-intelligence.test.ts`, `tests/receivables-recovery.test.ts` (one field
added to a hand-constructed test fixture each, to satisfy the extended `ResolvedJudgment` type —
no behavior change). `package.json`/`package-lock.json` (`@anthropic-ai/sdk`, the only new
dependency). Zero changes to `data/systems/lead-rescue.ts`, `data/profiles/kestrel/profile.ts`,
the reducer, the authority gate, `WaitIncidentStore`, `OperationClaimStore`, or any n8n workflow.
**CORRECTED by a later same-day pass:** the `app/api/lead-rescue/ingress/route.ts` line above
originally read "constructs `ClaudeDecisionProvider` only when `ANTHROPIC_API_KEY` is present" —
the activation defect this section's correction addresses. The route now delegates the whole
decision to `resolveIngressDecisionProvider` (`lib/config/decision-provider-config.ts`), which
requires an explicit `LEAD_RESCUE_DECISION_PROVIDER=claude` selection in addition to a usable
credential; see "Lead Rescue provider-activation semantics correction," below.

## Lead Rescue operator authentication — this pass

**The weakness.** Role ceilings, revision binding, claim-before-execute and the authority proof
were all real. They shared one unexamined assumption: that whoever called the endpoint was who
they said they were. `decidedBy` arrived in the request body. Anyone able to reach the route
could grant themselves founder authority by typing `founder`.

**Authentication and authorization are now separate concerns, in separate modules.**

| question | answered by | source of truth |
| --- | --- | --- |
| who is this? | `lib/auth/operator-identity.ts` | a signature the caller cannot forge |
| what may they do? | the engine, unchanged | `profile.roles` authority ceilings |
| what happens to this case? | the engine, unchanged | declared transitions and policy |

`lib/auth/operator-identity.ts` contains no threshold and no decision rule. It resolves a
principal to its canonical role id and reports the ceiling the profile already declares; it
never compares that ceiling to anything. An auth module that started deciding what a role may
approve would have become a second authorization policy competing with the engine's.

**The credential.** `v1.<base64url payload>.<HMAC-SHA256(payload)>`. Three properties carry the
proof: the signature is over the encoded payload with a key the caller does not hold, so editing
the principal invalidates it; comparison is constant-time; and the signature is checked BEFORE
the payload is ever parsed, so a tampered token is refused as tampered rather than decoded and
reasoned about. Missing, malformed, wrongly-signed, expired, unknown-principal and unknown-role
each return a distinct typed refusal. There is no branch that returns a principal on a doubt.

**Identity cannot be manufactured downstream either.** `AuthenticatedPrincipal` carries a
module-private symbol brand, and every instance the module mints is added to a `WeakSet`.
`requireAuthenticatedPrincipal` checks that set and throws, so a hand-built object that
satisfies the type through an `as` cast still cannot be used as an identity at runtime.

**Modes, and why the default is the safe one.** `lib/config/operator-auth-config.ts`:
`CONFIGURED_KEY` when `LEAD_RESCUE_OPERATOR_SIGNING_KEY` is set and long enough — tokens survive
restarts, and the prototype principal selector refuses to issue anything at all, so a runtime
with durable credentials has no faucet handing identities to whoever asks. `EPHEMERAL_KEY` (the
default) generates a random key once per process: exactly as unforgeable, worthless after a
restart, and the selector is available so the local operator page works. `MISCONFIGURED` — a key
that is set but too short — refuses everyone rather than silently downgrading to a working mode.
No key is hard-coded anywhere; the ephemeral one is generated, never authored.

**What this does NOT prove, stated plainly.** There is no login. The prototype principal
selector (`app/api/lead-rescue/operator-session`) asks for no password, verifies no human, and
contacts no identity provider — building that needs real accounts and is a different package.
So this portfolio does not demonstrate that a human proved who they were. It does demonstrate
that the decision boundary accepts only a credential this runtime could have minted, that the
credential resolves to one canonical operator, and that authority comes from the profile rather
than the caller — which hold regardless of how the credential was obtained. No SSO, no MFA, no
production IAM, no identity federation.

**A declared-but-unenforced rule, fixed.** `handleOfferDespatched` has always computed a
`v-offer-despatch` verification requiring ceiling ≥ 2, and `dispatchAuthorizedOffer` never read
it — so despatch authority was documented and unchecked. It is now gated exactly the way
`applyHumanDecision` already gates its own `v-human` check, before any claim or executor call.
No new policy and no new threshold: the rule was already there.

**Runtime proof.** `scripts/operator-authentication-proof.ts` drives the real HTTP boundary of
the running application against a synthetic case: no credential (401), a credential whose
signature was corrupted (401), a valid credential whose body also claimed `founder` (400), an
authenticated analyst (403), a valid client-partner at a stale revision (200 STALE_REVISION),
and finally the accepted decision bound to `op-marisol-adeyemi`. The case is re-read from the
live store after every refusal: no offer, no revision movement. The script holds no key — it
obtains credentials the same way the page does, and the tampered one is a corruption of a real
one. Retained as `n8n/evidence/lead-rescue-operator-authentication.json`, guarded by
`tests/operator-authentication-evidence.test.ts`, whose falsifiers were checked to bite against
three fabrication classes.

**Observability.** One new journal event type, `OPERATOR_AUTHENTICATION`, and one new
mechanism, `AUTHENTICATION`. It exists so an operator can tell "nobody could prove who they
were" from "they proved it and were still not allowed" — different problems with different
fixes. An authentication refusal records the typed reason and NAMES NOBODY: at that point
nobody has been identified, and recording an unverified claim would be the original weakness
moved into the journal. No token, signature, or header is ever persisted. The journal remains
non-authoritative.

## Lead Rescue execution journal — this pass

**The gap this closes.** `n8n/evidence/` holds three genuinely strong artifacts, but every one
of them was produced by a script written to produce it. They prove that specific capabilities
existed on a specific day. None of them is an operational history: before this pass, if a case
went through the running application, nothing anywhere recorded what happened to it.

**Three authorities, still three.** The invariant that governs this whole design:

| concern | authority | question it answers |
| --- | --- | --- |
| business / lifecycle state | `WaitIncidentStore` | what the case IS |
| execution / idempotency | `OperationClaimStore` | what may HAPPEN, once |
| observability / history | `FileExecutionJournal` | what was OBSERVED |

The journal never becomes an input to the first two. That is enforced three ways rather than
asserted once: the write and read halves are separate interfaces (`ExecutionJournalRecorder`,
`ExecutionJournalReader`); `lib/observability/lead-rescue-journal.ts` hands the engine a value
typed as the recorder, so decision code is type-incapable of reading history back; and a
structural test scans `lib/engine/**` and `lib/ports/**` and fails if any reader symbol appears
there at all. Behaviourally, `tests/execution-journal.test.ts` runs the same business path
three times — with a working journal, one that drops every write, and one that throws on every
write — and requires byte-identical engine results.

**What is recorded.** One observation per consequential boundary, never one per function call:
`INGRESS_RECEIVED`, `WAIT_EVALUATED`, `HUMAN_DECISION_RECORDED`, `DISPATCH_ATTEMPTED`. Each
carries the case and correlation ids, the revision in force, the mechanism (the canonical
`DECISION_MECHANISMS` plus `EXECUTION`, since carrying out a decision is not making one), a
normalized outcome, the canonical `FailureClass` where one applies, the execution mode and
executor identity where something ran, the governing operation-claim id, and the provenance the
case actually has. `EXECUTED`, `SUPPRESSED_DUPLICATE`, `FAILED_BEFORE_EFFECT` and
`OUTCOME_UNKNOWN` are deliberately four distinct outcomes.

**What is deliberately NOT recorded.** A wait evaluation that correctly found nothing due
writes nothing. A scheduled trigger runs on a timer, so recording every no-op would produce a
per-tick heartbeat that buries the handful of events that matter — a log, not a journal. The
absence of a record between two consequential events therefore means "nothing consequential
happened". There is also no field anywhere in the schema for a message body, a payload, or
model reasoning: the schema is a `strictObject` over a fixed field list, so private
chain-of-thought has nowhere to go even if a future caller tried. The one free-text field is
length-bounded and refuses credential-shaped content outright.

**The observation can be more specific than the business position, on purpose.** When the
executor reports `FAILED_BEFORE_EFFECT`, the case is still held `UNCERTAIN` — the durable claim
was already taken and this build has no independent verification channel to prove
non-execution. The journal records both facts rather than collapsing them into the weaker one.

**Persistence.** One directory per `incidentId`, one file per observation, published by writing
a temp file in the same directory and then `fs.link()`-ing it into place. `link` is atomic and
fails with `EEXIST` if that `journalEventId` already exists, so duplicate suppression is a
kernel guarantee rather than a read-then-write window, and a crash before the link leaves an
orphaned `.tmp` and no partial record. Sharding also gives isolation for free: one case's
history is physically incapable of appearing in another's read. Reads fail loudly — an
unparseable or non-conforming record raises `MalformedJournalRecordError` and is never skipped,
because silently omitting it would present a shorter history as though it were complete.

**The guarantee, precisely.** Every observation that is durably written survives process
restart and is readable by any later process pointed at the same directory. That is the whole
claim. The journal is **not lossless**: `record()` never throws and never retries, and a
failure is reported as `DROPPED` with a reason. This is a deliberate trade — making the
business write and the journal write atomic would let an observability outage stop real work.
Ordering is by recorded timestamp, then by identity; two observations written in the same
millisecond by two independent writers are ordered deterministically but that order is not a
claim about their true sequence. There is no distributed tracing here, no production telemetry,
and no aggregate metrics.

**Runtime proof.** `scripts/execution-journal-proof.ts` drives the real HTTP routes of the
running application — ingress, a redelivery, a refused human decision, a despatch at a stale
revision, and an authorized despatch — then queries `GET /api/lead-rescue/journal` and,
separately, constructs a brand-new reader in its own OS process. The script contains no
recorder and writes no journal record; every observation it reads was emitted by the server
while handling an ordinary request. Retained as
`n8n/evidence/lead-rescue-execution-journal.json` and guarded by
`tests/execution-journal-evidence.test.ts`.

## Lead Rescue provider-activation semantics correction — this pass

**The defect.** The prior pass ("Lead Rescue live classification seam," above) wired activation
two ways, both keyed on the SAME single signal — `ANTHROPIC_API_KEY` presence — never its value,
but presence alone: `app/api/lead-rescue/ingress/route.ts` constructed a real
`ClaudeDecisionProvider` whenever the key was present, and
`tests/lead-rescue-claude-classifier-eval.test.ts` gated its live-network suite on the same
check. Both are activation defects, not implementation defects — the adapter itself
(`lib/ports/claude-decision-provider.ts`) is unchanged by this pass. A credential is a secret,
not a feature flag: anyone with `ANTHROPIC_API_KEY` exported for an unrelated reason (a shared
shell profile, a copied `.env`, a CI secret meant for a different job) would have silently
gotten live model calls on every inbound lead, and `npm test`/`npm run verify`/CI would have
silently spent against the real Anthropic API — neither ever explicitly requested.

**The fix — one small, pure configuration boundary.** `lib/config/decision-provider-config.ts`
is now the ONLY place either environment variable is read. `resolveDecisionProviderSelection`
and `resolveLiveEvalGate` are pure functions — no `process.env` read, no SDK construction — that
take an `env` record and return a decision as data:
```
resolveDecisionProviderSelection(env) → { kind: 'FIXTURE' }
                                       | { kind: 'CLAUDE' }
                                       | { kind: 'CLAUDE_MISSING_CREDENTIAL'; reason }

resolveLiveEvalGate(env) → { kind: 'DISABLED' } | { kind: 'MISSING_CREDENTIAL' } | { kind: 'READY' }
```
`FIXTURE`/`DISABLED` is the outcome whenever the explicit switch (`LEAD_RESCUE_DECISION_PROVIDER
=claude` for the route, `RUN_LIVE_AI_EVAL=1` for the eval suite) is absent, REGARDLESS of
whether a credential exists — credential presence is checked only after the explicit switch is
already `claude`/`1`. `resolveIngressDecisionProvider` is the thin, non-pure composition-root
wrapper the route actually calls (`env` defaults to `process.env`); it is the only function in
the module that constructs a real `ClaudeDecisionProvider`.

**Fail-safe, not silent fallback.** `LEAD_RESCUE_DECISION_PROVIDER=claude` with no usable
credential does NOT fall back to fixture output — that would silently substitute simulated
classification for an explicitly requested real one while reporting the request as honoured.
Instead `resolveIngressDecisionProvider` returns a provider (`claude-decision-provider-unavailable`)
whose `classify()` immediately throws `JudgmentUnavailableError` — the SAME typed error
`ClaudeDecisionProvider` itself throws on a genuine network failure — which `resolveJudgment`
converts into the existing `UNAVAILABLE` outcome, routed by every Lead Rescue handler's
already-existing rule to `NEEDS_HUMAN`. Misconfiguration fails exactly like a live network
failure would; zero new handling was added anywhere downstream to make this true.

**Provenance.** The ingress route's `classifierProvider` response field now takes one of three
honest values instead of two: `'fixture-decision-provider'`, `'claude-decision-provider'`, or
`'claude-decision-provider-unavailable'` — an operator reading the response can always tell
whether classification was simulated, genuinely live, or explicitly requested-but-unusable.
Never a credential value in any of the three.

**Falsifying tests, written before the fix (RED confirmed: the import failed because
`lib/config/decision-provider-config.ts` did not yet exist).** `tests/decision-provider-config.test.ts`
— 15 tests, zero network — prove: credential present with no explicit mode selects fixture, never
the real provider; explicit `claude` mode with a credential selects the real provider; explicit
`claude` mode with no credential fails safe (a provider is returned, but `classify()` rejects
with `JudgmentUnavailableError`) rather than silently reusing fixture output; an unrecognized
mode value is treated as fixture, never as an implicit real selection; `ANTHROPIC_AUTH_TOKEN`
alone is an equally usable credential; no credential value is ever echoed into a selection or
reason string; and the live-eval gate requires BOTH `RUN_LIVE_AI_EVAL=1` and a credential —
credential alone never reaches `READY`. `tests/lead-rescue-claude-classifier-eval.test.ts` was
updated to gate on `resolveLiveEvalGate` instead of a raw credential check, and now fails
explicitly (`expect.fail`, never a silent skip) if `RUN_LIVE_AI_EVAL=1` is set but no credential
is configured — an operator who opted in and then finds it failing gets a clear reason, not a
suite that quietly did nothing.

**What this does NOT do.** No credential was created, printed, committed, or embedded — the diff
was searched directly for credential-shaped strings before this pass was considered complete. No
change to `ClaudeDecisionProvider` itself, `lib/engine/lead-ingress.ts`, the reducer, replay, or
idempotency — `deps.provider` and its existing undefined-falls-back-to-fixture behavior in
`ingestExternalLead` are untouched, so every existing fixture-mode test continues to pass
unmodified. No outbound provider, credential provisioning, or n8n change — out of scope, per this
pass's own non-goals. Maturity does not change: `INTERACTIVE_PROTOTYPE`, `NOT_LIVE`; the live
classification network boundary remains honestly `UNVERIFIED_LIVE` — this pass corrected
activation semantics, it did not cross the network boundary.

**Files changed.** `lib/config/decision-provider-config.ts` (new — the configuration boundary).
`app/api/lead-rescue/ingress/route.ts` (delegates provider resolution to the new module; removes
the credential-presence-only local function). `tests/lead-rescue-claude-classifier-eval.test.ts`
(gates on `resolveLiveEvalGate` instead of a raw `ANTHROPIC_API_KEY` check; explicit failure path
for opted-in-but-missing-credential). `tests/decision-provider-config.test.ts` (new, 15 tests).
`docs/STATUS.md` (this correction, plus the false claims it corrects marked inline above). Zero
changes to `data/`, the reducer, `lib/ports/claude-decision-provider.ts`,
`lib/ports/decision-provider.ts`, `lib/engine/lead-ingress.ts`, or any n8n workflow.

## Verification

```
npm run verify     # typecheck + lint + 526 tests (+1 live-eval test skipped without RUN_LIVE_AI_EVAL=1)
npm run build      # 29 pages prerender; 5 dynamic (ƒ) API routes; the engine executes at build/request time
npm run docs       # regenerate canon from the model — no diff this pass
```

Counts as of the later same-day provider-activation correction pass (511 tests + 15 new
falsifying tests in `tests/decision-provider-config.test.ts` = 526; the one `skipIf`'d live
evaluation test is skipped because `RUN_LIVE_AI_EVAL` is not set to `1` in this environment, not
merely because a credential is absent — see "Lead Rescue provider-activation semantics
correction," below). `tests/claude-decision-provider.test.ts`
(new, 11 tests) and `tests/lead-rescue-claude-classifier-eval.test.ts` (new, corpus + harness)
prove the adapter; `tests/lead-rescue-ingress.test.ts` (+2) proves the live seam and its
idempotency through the real orchestration path. `npm run build` still reports 5 dynamic (`ƒ`)
routes and 29 prerendered pages, unchanged — this pass added no new route, only a provider
choice inside the existing ingress route. `npm run docs` produced zero diff — no `data/` or
profile change.

Prior pass, same day: `tests/profile.test.ts`'s resolver tests were rewritten (one net new: the
two-unresolved-reasons test) and `tests/lead-rescue-escalation-owner.test.ts`'s three
standard-tier assertions were corrected to expect honest ambiguity — see "Escalation owner
resolution — semantic-integrity correction," above, for what each now proves.
`tests/lead-rescue-offer-wait.test.ts` needed no changes (its two assertions call the live
function rather than a hardcoded string).

Prior pass, same day: `tests/profile.test.ts` (+5) and `tests/lead-rescue-escalation-owner.test.ts`
(new, 7 tests) proved `resolveEscalationOwner` and its application at every Lead Rescue call
site — see "Lead Rescue escalation owner resolution," above. Two pre-existing assertions in
`tests/lead-rescue-offer-wait.test.ts` were deliberately updated (the literal old placeholder
string to the resolved value).

Prior pass, same day: `tests/lead-rescue-wait-sweep.test.ts` (4 tests) is new — see "Lead Rescue
scheduled n8n sweep," above, for what each proves. `npm run docs` was re-run twice that pass:
once immediately after its own canon correction (confirming exactly the one expected propagated
change to `docs/FAILURE_MODE_REGISTER.md`, nothing else), and once again at the end (confirming
zero further diff). Local n8n execution independently verified live — an autonomous,
un-manually-triggered first tick correctly resolving an eligible incident while leaving a
not-yet-due one untouched, and a post-container-restart tick correctly discovering and
resolving a newly-eligible incident, each confirmed by reading the durable store directly.

Visual inspection performed on the portfolio index, the Owner Revenue Intelligence dossier,
and both new scenario pages — the run-summary panel's existing generic counters render
correctly with no new UI component: scenario A (`cash-collection-quietly-worsens`) shows 9 steps, 8
transitions accepted, 0 rejected, 0 side effects executed, 1 blocked by policy (the
notification, at authority level 1); scenario B (`stale-concentration-read-dismissed`) shows 4
steps, 4
transitions accepted (stale flag, refresh, and dismissal across two events), 0 side
effects, matching the "ordinary variation is left alone" claim exactly.

## Known fidelity gaps

0. **ENFORCED, and now three rather than two — still open, deliberately.** As of the latest pass
   `terminalState` is gone: every failure mode declares a structured `recoveryPath`, and
   `validateLifecycle` checks each movement against the transition graph, failing the build both
   when an unbuildable recovery is unmarked and when a marker outlives the defect it names. The
   two below are marked and render in `FAILURE_MODE_REGISTER.md` as open defects rather than as
   handling. A **third** was found on the first run over migrated data: `dp-fm-suppression`,
   already marked `Verified`, declares a consent re-check at despatch time and therefore a
   `SCHEDULED -> SUPPRESSED` recovery that no transition performs — and `dp-t06`, the only exit
   from `SCHEDULED`, carries that same re-check as its guard, so a record whose consent goes
   stale after scheduling has nowhere to go. None of the three was fixed by adding a transition;
   the original finding follows, unchanged.

   **Two Dormant Pipeline failure modes declare a recovery the lifecycle forbids, and nothing
   checks that.** Found 2026-08-26 while scoping the three `Pending — scenario not yet authored`
   standards on that system. `dp-fm-stale-data` declares its recovery terminal state as
   `ELIGIBILITY_REVIEW`, reached from `SCHEDULED` at despatch time; there is no
   `SCHEDULED -> ELIGIBILITY_REVIEW` transition. `dp-fm-rate-limited` declares unsent records
   returning to `SCHEDULED` from `REACTIVATION_ATTEMPTED`; there is no such transition either.
   The engine would refuse both, so these two standards were never merely unwritten — **they
   were structurally unbuildable**, and the `Pending` marker read as unfinished authoring rather
   than as a canon defect. `dp-fm-wrong-entity` is the exception: its `ELIGIBILITY_REVIEW ->
   NEEDS_HUMAN` recovery is `dp-t05`, which exists, so that one is buildable as it stands.

   **Why nothing caught it — resolved.** `validateLifecycle` checked that transitions reference
   real states, that every state is reachable, and that no non-terminal state is a dead end. It
   never compared a failure mode's declared recovery against the transition graph, because
   `terminalState` was free prose and a validator cannot check a sentence. That field is now the
   structured reference this paragraph called for, across all six systems' failure registers, and
   the comparison it enables is what surfaced the third instance above.

   Not fixed here, and deliberately not papered over by quietly adding transitions: a
   transition exists to be exercised, and adding one to satisfy a register entry would invert
   the relationship between canon and code. Recorded as the defect it is — now mechanically
   rather than in prose.

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
11. **CLOSED this pass.** The three `HUMAN_DECISION` paths back into `BOOKING_READY`
    (`lr-t24`/`lr-t27`/`lr-t34`) now write `bookingReadyAt`, exactly like `lr-t10`/`lr-t16`
    always have — the coverage gap named here as the prior pass's own recommendation.
    Closing it honestly required first re-examining whether `bookingReadyAt` was the right
    fact to write at all: it was not being treated as readiness evidence, it was being read
    (by `lr-t22`, at every entry point) as offer-SENT evidence, which none of the five
    `BOOKING_READY` entry paths — old or newly-covered — ever actually provide. See "lr-t22
    semantic-integrity correction — this pass," above, for the fix: a new fact, `offerSentAt`,
    written only by a new, explicit despatch event, now governs `lr-t22` instead.
12. **CLOSED this pass.** The interactive wait/resume demo now lets an operator drive the
    human-review chain live, not only replay it from a fixture — see "The reviewed-offer
    operator journey goes live," above. `app/lead-rescue/wait/page.tsx` genuinely applies an
    operator-submitted `human.decision.recorded` and `lead.offer.despatched` event, through
    `applyHumanDecision`/`dispatchAuthorizedOffer`, each step's own outcome and decision
    record rendered as it happens.
13. **CLOSED this pass.** A case parked under review, or ready but never despatched, is no
    longer able to sit forever with no reminder and no escalation — see "Lead Rescue
    attention timeout (lr-fm-approval-timeout) — this pass," above, for the full mechanism:
    two new, deliberately non-transitioning attention rules
    (`handleReviewAttentionTimeout`/`handleDispatchAttentionTimeout`) durably escalate the
    operational fact that a human has not acted, while `NEEDS_HUMAN`, `ESCALATED`,
    `SUPPRESSION_REVIEW`, and `BOOKING_READY` never move on the strength of a timeout alone.
14. **CLOSED this pass.** The escalation target used to be a generic `'Named owner'` string,
    never a resolved "next owner in the authority chain" — despite `lr-fm-approval-timeout`'s
    own declared `recovery` naming exactly that, and `handleReviewAttentionTimeout`/
    `handleDispatchAttentionTimeout`'s decision text already quoting it verbatim. See "Lead
    Rescue escalation owner resolution," above: `resolveEscalationOwner` now reads
    `profile.roles`' real `authorityCeiling` data and resolves a genuine, deterministic owner
    at all six call sites — including the two-tier distinction this item's own text first
    named as merely plausible.
15. **n8n covers exactly one ingress surface — new-lead intake — and nothing else.** A reply
    from a prospect, a human decision, or an offer despatch still only reach the engine through
    the direct application UI/API, never through an orchestration path. This is the honest
    scope this pass declared in advance (`inbound.enquiry.received` only), not an oversight —
    but it means "n8n-centered automation" is proven for exactly one of Lead Rescue's several
    inbound event types.
16. **CLOSED this pass.** `checkAllWaitingIncidents` (`lib/engine/wait-resume.ts`) already existed
    and already swept every waiting AND overdue-attention incident correctly, but nothing had
    ever called it except a person clicking "Check all waiting now." See "Lead Rescue scheduled
    n8n sweep," above: a real n8n Schedule Trigger, live-verified across an autonomous first tick
    and a container-restart boundary, now wakes it on its own, with zero new engine code.
17. **CLOSED this pass.** The prior pass's own real-provider activation was credential-driven —
    `ANTHROPIC_API_KEY` presence alone selected `ClaudeDecisionProvider` and alone gated the
    live evaluation suite, so an incidentally-exported credential would have silently triggered
    real model calls and real spend. See "Lead Rescue provider-activation semantics correction,"
    above: both now require an explicit opt-in (`LEAD_RESCUE_DECISION_PROVIDER=claude`,
    `RUN_LIVE_AI_EVAL=1` respectively) in addition to a usable credential, and an explicit real
    selection with no usable credential fails safe through the existing `UNAVAILABLE` →
    `NEEDS_HUMAN` path rather than silently reusing fixture output.

## Single recommended next fidelity gap

**Bounded real AI classification, recommended two passes ago, was built two passes ago, and its
activation semantics were corrected this pass** — see "Lead Rescue live classification seam" and
"Lead Rescue provider-activation semantics correction," both above. Its own live-network leg
remains `UNVERIFIED_LIVE` (`RUN_LIVE_AI_EVAL` is not set to `1` in this environment); everything
else about it, including the corrected activation gate, is complete and green. That leaves the
same two candidates named two passes ago, unchanged by this pass's own scope:

**Real outbound provider execution — wiring a live messaging send behind the existing
`SideEffectExecutor` port, the same "swap the fixture for a real implementation" shape this
pass just proved for `DecisionProvider`.** This is the highest-fidelity gain remaining in Lead
Rescue — the claim-then-invoke reliability machinery (`OperationClaimStore`, the execution
boundary `checkWaitIncident`/`dispatchAuthorizedOffer` already gate) has been fully proven
against a SIMULATED executor across every prior pass; what's missing is not more logic, but a
real provider behind logic that already works. Deliberately NOT picked as this pass's own work,
per this pass's explicit non-goals ("no live outbound customer messaging") and because it is a
materially higher-stakes external boundary than classification: the moment it is wired for
real, an actual message can reach an actual inbox, even a test one. This document does not
decide in advance whether that risk is worth taking next — only names it as the evidence-based
candidate.

**A second n8n ingress surface for `prospect.replied`** remains open (item 15) but is explicitly
the same proven pattern (a webhook → `ingestExternalLead`-shaped seam) applied to a third event
type — evidence of generalisation, not of a new capability, and now also directly benefits from
this pass's own live classifier once wired, since reply interpretation uses the identical
`DecisionProvider` contract.

**Do not begin closing either gap from this document.** Recorded here as the evidence-based next
candidates, the same discipline every prior pass's "next fidelity gap" section applied — not as
a plan to execute without its own re-verification, and not a decision to add a live credential
or contact a real message provider without the user's own explicit go-ahead. This applies with
particular force to real outbound provider execution specifically: it remains the
highest-stakes candidate named above, not a recommendation, and this pass's own correction (an
explicit opt-in required in addition to a credential, never credential presence alone) is the
activation pattern any future real-provider work — outbound or otherwise — should reuse rather
than reinvent.
