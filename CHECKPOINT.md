# Checkpoint

> One per accepted package (Constitution §14). Repository truth is authoritative; this file
> is an index, not a source. Append the new checkpoint above the previous one.

## Current — Blocked is not overdue, and the engine can finally tell them apart · 2026-08-28

**Verified state.** `npm run verify`: 80 files, **1535 passed / 1 skipped**, exit 0, no lint
warnings. `npm run build`: compiled, exit 0. $0 spent.

**The contract.** A profile declares `externalGates`. Each names what is blocked, the fact that
releases it, the event that satisfies it, who owns the dependency, what release authorizes, the
rule it rests on, an optional follow-up window with its owner, and an explicit
`actionClockRunsWhileBlocked`. `checkWaitIncident` returns a distinct outcome:

| Outcome | Means |
| --- | --- |
| `ATTENTION_OVERDUE` | an **authorized** obligation was not completed in time |
| `ATTENTION_BLOCKED` | execution is **not authorized** — a declared dependency is unsatisfied |

**Two clocks, and nothing is suspended.** The gate is checked *before* the window comparison, so
the action SLA never starts while execution is unauthorized — which is a different and more
honest thing than pausing a running timer. The dependency keeps its own window on the same
anchor: at +40h the case is blocked and silent; at +60h it is still blocked and a chase is raised
to the declared follow-up owner. Chasing a missing signature and being late on a despatch are two
facts and are reported as two.

**Derived, never guessed.** `wait-resume.ts` reads the handler's own recorded decision
(`GATE_HELD_ACTION`, a shared constant) exactly as it reads state for `lifecycleMoved`. Two
implementations of "is this gate closed?" would eventually disagree, and the disagreement would
surface as a case reported late that the firm was forbidden to action.

**A block carries no failure class, deliberately.** Every member of `FAILURE_CLASSES` names
something going wrong. Nothing has: the firm is declining to act because it is not permitted to.
Filing correct behaviour in the failure register is the same mislabelling as calling it overdue,
one layer down.

**The strongest case, and it is grounded.** `ashcombe` declares `ashcombe-signed-8879`: an ERO may
not transmit an individual return without a signed Form 8879 on file. The same parked case, the
same instant, the same anchor returns `ATTENTION_BLOCKED` under `ashcombe` and `ATTENTION_OVERDUE`
under `kestrel`, which declares no such gate. **Kestrel was deliberately given none** — it has no
external gate on this action, and inventing one so something would render is the fabrication this
repository exists to refuse.

**Falsification: 8 mutations, all failing.** The gate ceasing to hold, the closed-test inverted,
the boundary no longer distinguishing a held case, the escape hatch inverted, the chase firing on
the action window instead of its own, a gate applying to every action, the block recording no
actionable evidence, and a gate citing a policy that merely exists. **Two survived the first run
and both were real.** The evidence test searched the whole decision for a substring, so removing
the dependency owner survived because the name appeared elsewhere — now asserted per labelled
fact. And a gate could cite any existing policy; `validateProfileConsistency` now rejects a gate
sharing a policy with an operating parameter, because a threshold and a prohibition are different
claims. That catches the realistic error and **cannot** catch a bespoke-but-wrong policy, which is
recorded rather than papered over.

**A harness bug corrupted a source file mid-run, and it is worth recording.** Two of the four
mutation targets are named `profile.ts`; keying backups by basename mapped them to one temp file,
so a "restore" wrote `data/profiles/ashcombe/profile.ts` over `lib/model/profile.ts`. Caught
immediately by the harness's own SHA-256 restore check, which is exactly what that check is for.
The file was restored from HEAD and its three edits re-applied. **The safety net was the hash
comparison, not the tests** — the suite would have failed loudly, but only after the damage.

**Maturity. Unchanged, and this package does not move it.** Lead Rescue stays
`INTERACTIVE_PROTOTYPE`. What improved is fidelity, not liveness: the model can now express a
distinction real firms make daily and previously could not, and one action is wired.

**What the fix does not do**, recorded in the gap register beside the gap itself: only `DISPATCH`
consults gates today. The primitive is vertical-agnostic and any profile may declare a gate on any
action, but no other handler reads them, so such a gate would be declared and unread. Gate
evaluation is presence-of-fact only — it cannot judge whether the recorded evidence is genuine.

**`MODEL_GAPS` keeps closed gaps rather than deleting them.** An `addressed` block records what
shipped and what it still does not do; removing the entry would erase the evidence that an outside
author found a real limit, which is the whole point of the file.

**Next package.** The evidence layer. `MODEL_GAPS.md`, the fidelity ledger, and now
`ATTENTION_BLOCKED` are three structured sources a buyer cannot see, and the third is precisely
"where external dependencies constrain execution" from the canon decision.

## Earlier — Thirteen limits found by people with no stake in the answer, finally written down · 2026-08-28

**Verified state.** `npm run verify`: 78 files, **1494 passed / 1 skipped**, exit 0. `npm run
build`: compiled, exit 0. $0 spent.

**Proof claim earned.** `data/model-gaps.ts` records **13 limits of the six systems, found by 3
independent profile authors**, and `docs/MODEL_GAPS.md` is generated from it. Eight are not
specific to one trade. Every entry names a concrete case, what the model does today in its place,
and the shape a fix would take.

**These findings were being thrown away.** The authoring packet asks every profile author to
report what the model could not express. Three agents did exactly that, working from the packet
alone with no access to this repository's reasoning — and their findings arrived inside handback
documents, got one summary line in a checkpoint, and otherwise existed nowhere in the tree. Under
`COMMERCIAL_THESIS.md` §3 a retained negative result is a commercial asset, and **a limit found by
somebody with no stake in the answer is the strongest form of that evidence available here.** It
was being lost for want of a file to put it in.

**Not a backlog, and the document says so twice.** Nothing here is scheduled. `CLAUDE.md` scope
discipline requires the running system to produce the need before a capability is added, so
several of these may never be built — and saying that is the point rather than a hedge.
`CLAUDE.md`'s read-first table now points at it with the instruction to *add to it rather than fix
on sight*.

**Every entry carries a concrete case, and that is the load-bearing rule.** A gap stated
abstractly ("the model lacks nuance") is unfalsifiable and unfixable. A gap stated as an instance
— a completed tax return that may not legally be sent until a signed Form 8879 arrives — can be
evaluated by a practitioner and either fixed or refused on the merits. The test enforces it.

**Independence is enforced, not assumed.** One author reporting thirteen limits is an opinion;
three independent authors converging on a model's boundaries is evidence about the model. A test
fails if every gap collapses to a single author.

**Falsification.** 4 mutations, all failed: a gap credited to a pre-rename slug that no longer
exists, every gap collapsing to one author, a concrete case degraded to hand-waving, and the
generated document going stale against the register. Restored and verified by SHA-256.

**Maturity. Unchanged.** Writing down what the systems cannot do changes nothing about what they
can.

**Next package — and a decision that is yours.** `docs/MODEL_GAPS.md` is reachable only by reading
the repository; **the site links no docs at all.** Whether the rendered artifact should expose
developer documentation is a canon decision about its shape, not a refactor. If the answer is yes,
this document and the fidelity ledger's published gaps are the two strongest candidates. The
largest engineering prize remains `blocked-is-not-overdue`, now written down with its case.

## Earlier — No real company's name survives anywhere in the repository · 2026-08-28

**Verified state.** `npm run verify`: 77 files, **1461 passed / 1 skipped**, exit 0. `npm run
build`: compiled, exit 0. Capture: 38 of 38. $0 spent.

**`ledgerline` → `ashcombe`, `formwork` → `wrenfield`.** Both slugs were the trading names of real
firms in the exact trades their profiles depict. They had been kept on the reasoning that an
internal key reaches no rendered surface — **true, and beside the point.** A directory is still
this repository carrying a real practice's name, and keeping it bought nothing but continuity with
documents that could simply record the change. The owner made the call; this closes it properly
rather than half-way.

**The policy ids were the part that would have been missed.** Renaming the directories and consts
left thirty-four `formwork-*` and thirty-three `ledgerline-*` policy identifiers inside the profile
files. Those are not private keys: `docs/RESEARCH_LEDGER.md` is generated from the model and prints
them, so a real firm's name was reaching an inspectable surface through a route nobody was looking
at. Renamed with the trailing hyphen as the anchor, so the prose word in each naming note survived.

**Scope, deliberately split.** Code, data, generated docs, and the two live authoring documents
were renamed. `CHECKPOINT.md` and `PATTERN_LEDGER.md` were **not**: they are append-only history
and their entries are accurate about what happened under the old names. `docs/SESSION_HANDOFF.md`
gained a superseded banner rather than edits, because it is a record of a handoff, not live
instruction — and it names paths that no longer exist.

**The register keeps the history rather than erasing it.** Each naming note now says what the slug
was, what collided, and when it changed. A reader who greps the old name finds the explanation, not
a silence.

**Falsification.** Captures were regenerated twice — once after the id change, once after the
policy-id change moved `claimSha256` on two `establishes` strings — and both runs located all 38
quotes on live re-fetch. `git status` records both directories as renames rather than
delete-plus-add, so `git log --follow` still works on every profile file.

**Maturity. Unchanged.** Nothing about the businesses changed; only what they are called in the
tree.

**Next package.** The model gaps the three profiles surfaced. `blocked-vs-overdue` is the most
generalisable and the largest: a return awaiting a signed Form 8879 is legally gated, not late, and
the model has only "overdue". It touches the engine across all six systems.

## Earlier — The reference business stops being the least-grounded one · 2026-08-28

**Verified state.** `npm run verify`: 77 files, **1461 passed / 1 skipped**, exit 0. `npm run
build`: compiled, exit 0. Capture: **38 of 38 sources**, every quote located on a live re-fetch.
$0 spent.

**Shipping the retargeting surface exposed this within the hour.** The home page now prints each
demonstration's grounding-source count side by side, and Kestrel showed **3** against 7, 10 and 14
for the agent-authored profiles. The firm on every rendered surface — the only one a visitor sees
in depth — was visibly the least-evidenced. That is the published-gap mechanism working on its
author: a surface built to make a claim checkable immediately made a weakness legible.

**Kestrel 3 → 7 sources, and the four new ones close exactly the two weakest areas.** Its original
three all priced the trade and none touched `explicitlyNot` or the vocabulary, which
`PATTERN_LEDGER.md` had flagged as least-grounded since the profile was written.

**The boundaries turn out to be professional rules, not modesty.** A SOC 2 report may be issued
only by a licensed CPA firm; the opinion is signed by a CPA partner who applies the professional
judgment; and services central to a client's control environment threaten independence when
delivered by the entity that also audits it — the emphasis the AICPA's 2022 SOC 2 Guide revision
added. Kestrel's four `explicitlyNot` entries now each trace to a retrievable page, so a reader
can check that the fictional firm's limits are the trade's limits rather than ours.

**The vocabulary is cited from the standards body itself**, via the AICPA's own publication title
naming the five trust services categories. Worth recording against the architecture profile's
disclosed gap: `aicpa-cima.com` answers automated retrieval where every `aia.org` page returns 403,
so the same class of evidence was available for one trade and not the other. That asymmetry is
about the institutes, not about the profiles.

**Two sources from one page, which only works now.** Both legalclarity quotes come from the same
URL at different offsets — citable only because captures became keyed by quote as well as URL two
packages ago. This is the second batch to need that fix.

**Method note worth keeping.** The quotes were located with a probe that runs the gate's *own*
`extractText`, then sliced from the extracted text and written into the register by script — never
retyped. Pattern #31 applies to me exactly as it applied to the handbacks: a model retyping a
verbatim quote into its own output is the same lossy channel that cost a working day.

**Falsification.** Changing one word inside a newly added Kestrel quote — "can only" to "may only"
— fails two assertions in `tests/grounding-capture-evidence.test.ts`. Restored and verified by
SHA-256.

**Maturity. Unchanged.** These sources describe the trade and verify nothing about Kestrel, which
does not exist. Grounded still means synthetic assumptions calibrated against retrievable evidence.

**Next package.** The model gaps the three profiles surfaced are now the largest prize, and
blocked-vs-overdue is the most generalisable: a return awaiting a signed Form 8879 is legally
gated, not late, and the model has only "overdue". It generalises to any permit, consent, or
signature gate.

## Earlier — The artifact's central commercial claim stops being asserted · 2026-08-28

**Verified state.** `npm run verify`: 77 files, **1453 passed / 1 skipped**, exit 0. `npm run
build`: compiled, exit 0. $0 spent.

**Proof claim earned.** `COMMERCIAL_THESIS.md` §5 names retargetability as *the* commercial claim
the artifact must support. The home page asserted it in one sentence — "retargeting the portfolio
to another vertical is a data change rather than a rewrite" — and **no rendered surface referenced
any profile but Kestrel.** A reader had the claim and no way to check it, which under §3 is the one
thing this artifact must never do. The section now carries the evidence, derived from the register
at build time by `lib/proof/retargeting-evidence.ts`: four grounded businesses, the seventeen
contract keys each declares, the twenty-two authored scenarios that run under every profile they
were not written for, and each firm's headcount, revenue, and grounding-source count.

**It refuses to show the fixture as a business.** Meridian is ungrounded by design — that is what
lets it falsify the seam — so it is reported as a count and a role and never as a firm. Confirmed
in the prerendered page: all four business names present, "Meridian" absent entirely. A mutation
that lets the fixture leak into the list fails the suite.

**The limit ships with the claim, not after it.** The same block states that every business is
synthetic, that coherent synthetic profiles prove the engine retargets and each firm is internally
consistent, and that they prove nothing about a real firm's messy inbound. A test asserts the limit
names both the synthetic bound and the real-firm gap, so it cannot be trimmed to read better.

**Falsification.** 5 mutations: the fixture leaking in as a business, grounding counts written
rather than read, the contract width hard-coded, the limit ceasing to name the synthetic bound, and
every business claiming to be the rendered one. Four failed.

**One survived, and it is an equivalent mutant — recorded rather than chased.** Hard-coding
`contractKeyCount: 17` is undetectable because `PROFILE_ENGINE_CONTRACT.length` *is* 17 today. The
moment an eighteenth key is added the assertion fails, so the mutation is invisible exactly while
it is harmless. A source scan could close it; it would be chasing a difference that has no
consequence until the thing it guards changes, and the guard fires then.

**Maturity. Unchanged.** No customer exists. Four synthetic businesses on one engine is
retargetability across authored profiles and nothing more.

**Next package.** Kestrel's `explicitlyNot` and vocabulary remain the least-grounded part of the
reference profile — and it is now the only one of the four demonstrations a visitor sees in depth.
The model gaps the three profiles surfaced (blocked-vs-overdue first) are the larger prize.

## Earlier — Three profiles had never run anything, and now every profile runs everything · 2026-08-28

**Verified state.** `npm run verify`: 76 files, **1446 passed / 1 skipped**, exit 0. Suite duration
1.57s. `npm run build`: compiled, exit 0. $0 spent.

**The finding, which is the package.** `stratum`, `ledgerline` and `formwork` were registered this
morning as `DEMONSTRATION` profiles and had **never executed a single scenario.** The seam swap
has two halves: a parametrized half over `ALL_PROFILES` (schema, consistency, all seventeen
contract keys) and a scenario-execution half that was **hard-coded to `MERIDIAN`** — correct while
Meridian was the only other profile, and silently wrong the moment three more were registered.
This morning's checkpoint said all three "passed the seam swap". That was too strong, and the
entry now carries the correction rather than being edited.

**Contract-conformant is not execution-proven.** A profile can declare every key the engine demands
and still drive it into a state no handler expects. The distinction is the entire retargetability
claim, which `COMMERCIAL_THESIS.md` §5 names as the artifact's central commercial claim.

**Both halves now derive from the register.** All 22 authored scenarios run under **every** profile
they were not written for — four foreign profiles × 22 scenarios, each completing and replaying
identically. Suite 1310 → 1446 for +1.57s total.

**Coverage alone would have been decorative, and a mutation proved it.** Asserting only that a run
reaches *a* lifecycle state cannot see a threshold change: three separate mutations to `stratum`'s
thresholds — `confidenceFloor` to 0.999, `humanReviewTimeoutHours` to 0, `maxInformationQuestions`
to 0 — **all survived it.** So the "load-bearing, not decorative" divergence assertion was
parametrized too: each foreign profile must reach different final states from Kestrel in **at least
three of the six systems**. All four clear it. A handler that read a profile and ignored it now
fails, per profile, by name.

**Falsification.** Copied all seventeen of Kestrel's threshold values into `stratum`: divergence
collapsed and the assertion fired naming that profile specifically. Restored byte-for-byte and
verified by SHA-256. This is the mutation that makes the new coverage worth having — new tests that
pass on the first run prove nothing until they have been shown able to fail.

**Maturity. Unchanged.** Every profile here is synthetic. This proves retargetability across
authored businesses and says nothing about a real firm's messy inbound, which §6 requires be stated
rather than blurred. No customer exists.

**Next package.** The retargetability claim is now earned by execution and is **still asserted
rather than shown** on the buyer surface: `app/page.tsx` says retargeting is "a data change rather
than a rewrite" and no rendered surface references any profile but Kestrel. That is the same
built-it-can't-see-it gap closed for remote verification, on the larger claim.

## Earlier — The name check stops being something someone has to remember · 2026-08-28

**Verified state.** `npm run verify`: 76 files, **1310 passed / 1 skipped**, exit 0. `npm run
build`: compiled, exit 0. $0 spent.

**Proof claim earned.** Every `DEMONSTRATION` profile now carries a `nameCheck` in the register —
what was searched, when, and what came back. `tests/profile-register.test.ts` enforces the
property that actually broke: **`searchedFor` must equal the `name` the profile ships.** Renaming
a firm after clearing it, or clearing one variant and shipping another, now fails in the suite
instead of on a visitor's screen.

**This closes a gap opened the same day rather than publishing it.** The previous package caught
`formwork` wearing a real practice's trading name and recorded the check in prose. Prose is not
checkable, and Pattern #28 says a guard that must be remembered has already failed. The
`CHECKPOINT` rule is the tiebreak: publishing a gap is not a substitute for closing one that is
cheap to close. This one was cheap.

**It immediately found the profile nobody had checked.** Requiring the record forced a search on
`Kestrel Compliance Group` — the firm on every rendered surface, whose name had never been
checked in the life of the project. It clears: no company trades under it. The nearest neighbour
is Kestrel Labs, a Denver building-code compliance platform, recorded in the finding because a
reader deserves the near-miss rather than a bare negative.

**Falsification, and the first version of the rule was worthless.** 5 mutations: a demonstration
shipping with no check, the firm renamed after its check cleared the old name, a check recorded
for a name never shipped, the finding emptied to a bare negative, and one generic negative pasted
across two profiles. **The bare-negative mutation survived** — the rule asked only that a finding
be non-empty, and `'Nothing was found at all.'` cleared it: a shrug in the costume of a check.
Repaired with `MINIMUM_NAME_CHECK_FINDING_CHARS` and a distinctness assertion, because the
realistic way this rots is one generic negative copied everywhere. All five fail now; files
restored byte-for-byte and verified by SHA-256.

**A note on the first mutation run, because it is the more useful lesson.** The bare-negative
mutation initially *appeared* to survive for the wrong reason: it left the informative half of
the finding in place, so it never created the defect it named. A mutation that does not produce
the condition it claims is evidence about the mutation, not about the test. Re-specified, it
survived for the right reason, and only then was the test repaired.

**What this cannot do, stated in the field's own docstring.** It cannot establish that a name is
unused. No offline test reaches a company register, and every finding here came from a web
search, not a trademark search — each carries `[unverified — verify by: a formal register and
trademark search]`. It records diligence and pins it to the shipped name; it does not certify
availability.

**Next package.** Kestrel's `explicitlyNot` and vocabulary remain the least-grounded part of the
reference profile. The model gaps the three new profiles surfaced are the larger prize, and
blocked-vs-overdue is the most generalisable of them.

## Earlier — The strongest integration proof stops being invisible to a buyer · 2026-08-28

**Verified state.** `npm run verify`: 76 files, **1297 passed / 1 skipped**, exit 0. `npm run
build`: compiled, exit 0. $0 spent.

**Proof claim earned.** The fidelity ledger carries a `remote-verification` row: *Independent
verification of a despatch*, `REAL`, derived from
`n8n/evidence/lead-rescue-remote-verification.json` through a new quarantined reader. Confirmed
present in the prerendered `/lead-rescue` page — a buyer now reads that a notification which
crossed to `ambientframes.app.n8n.cloud` was afterwards confirmed **carrying the receiver's own
execution id (8)**, and that a key the receiver had never seen still came back `STILL_UNKNOWN`.

**This was the gap, stated plainly.** For a day the remote-verification capability was the
strongest integration evidence in the repository and appeared on **no rendered surface**. It
existed in `scripts/`, in `n8n/evidence/`, and in `tests/` — and in nothing under `lib/` or
`app/`. Built, retained, tested, invisible. Ledger row count 14 → 15; REAL 10 → 11.

**The row is REAL only on a conjunction, and that is the whole design.** A confirmation carrying
the receiver's identifier AND a never-seen key preserved as unknown. A capture showing a
confident confirmed-negative is not weaker evidence of verification — it is evidence the boundary
**lied**, and reading the confirmation half while ignoring the rest is exactly how a proof surface
flatters itself. `evidenceProvesIndependentVerification` returns false for it.

**One neighbouring clause was corrected, and only one.** The `n8n-orchestration` row's limit said
orchestration "does not establish a hosted deployment" — true of the local capture it reads, and
self-contradictory once a sibling row evidences a hosted receiver. Scoped to the artifact it
reads and pointed at the new row.

**Falsification, including a survivor that was a real hole.** 5 mutations: the row self-promoting
to REAL, the gate dropping the receiver-identifier requirement, the gate dropping the
preserved-unknown requirement, the limit ceasing to say an absence can never be confirmed, and
the retained artifact corrupted to confirm a negative. **The third survived the first run.** The
"boundary lied" test moved two fields together, so it could never isolate which clause was
load-bearing. Repaired with a case asserting that the recorded verdict outranks the capture's
claim about its own guarantee — an artifact describing its own good behaviour is the cheapest
thing in the chain to forge. All five fail now; files restored byte-for-byte, verified by
SHA-256.

**Maturity. Unchanged.** Lead Rescue stays `INTERACTIVE_PROTOTYPE`. The row's own limit is the
load-bearing half: it confirms an effect and can never confirm an absence, the receiver is an
automation platform holding a record rather than a person who read anything, and no customer is
on either end. `customer-deployment` remains the `UNVERIFIED` row that bounds the page.

**Next package.** Kestrel's `explicitlyNot` and vocabulary are still the least-grounded part of
the reference profile — the firm on every rendered surface. Alternatively, the model gaps the
three new profiles surfaced (blocked-vs-overdue is the most generalisable).

## Earlier — Three agent-authored profiles registered, and a real firm's name caught on the way in · 2026-08-28

**Verified state.** `npm run verify`: 76 files, **1291 passed / 1 skipped**, exit 0 (baseline was
1214 — the parametrized suites picked up 77 tests on registration). `npm run build`: compiled
successfully, exit 0. $0 spent.

**Proof claim earned.** `stratum`, `ledgerline` and `formwork` are registered `DEMONSTRATION`
profiles. Three independent Cursor agents, working from `docs/PROFILE_AUTHORING_PACKET.md` and
nothing else, each authored a profile declaring exactly the seventeen `PROFILE_ENGINE_CONTRACT`
keys and returning `[]` from `validateProfileConsistency` **with no engine or handler change**.
Pattern #26 amended rather than duplicated: the seam is now exercised by five profiles, three of
them authored by agents that never read this repository's reasoning.

> **CORRECTED later the same day.** This entry originally said the three also "passed the seam
> swap", which was too strong. They passed its *parametrized* half — schema, consistency, contract
> completeness. The scenario-execution half was hard-coded to `MERIDIAN`, so all three were
> registered as demonstrations having **never executed a single scenario**. Closed in the
> `Current` entry; the overstatement is left visible here rather than edited away, because a
> checkpoint that silently corrects itself is worth less than one that shows the correction.

**The blocker was a channel, not a defect.** The three registration snippets had reached this
repository only inside PDF-converted markdown, which split every `fi`/`fl` ligature (`profile` →
`pro fi le`) and collapsed line breaks. The quotes were no longer verbatim and could not pass
capture — through no fault of the authors. The recorded plan was to de-corrupt them by hand and
let the gate adjudicate the repair. **That was the wrong instinct.** A `.rtf` export of the same
three handbacks was sitting beside each PDF, carried the text unmodified, and captured first
time. Snippets were extracted by script and spliced mechanically, so nothing verbatim was routed
through generated text. Pattern #31 earned: look for a less-processed copy before reconstructing
anything, and never repair a payload to compensate for a lossy channel.

**Capture: 34 of 34 sources, every quote located on a live re-fetch.** kestrel 3, stratum 7,
ledgerline 10, formwork 14; 31 HTML and 3 PDF. The B101 owner–architect agreement captured three
times from one URL at three offsets, and one blog twice — which only works because captures are
now keyed by quote as well as URL, and because PDFs are parsed rather than tag-stripped. Both
fixes were made in the previous package and this is the first batch to actually need them.

**A real firm's name was caught, and the packet was the cause.** `formwork` shipped as *Formwork
Architecture + Engineering* — the trading name of several real practices, in St. Louis, Barbados,
London, and Australia. Renamed to **Wrenfield Architecture + Engineering** at registration. The
author was not at fault: packet §11 asserted "the names above are fictional and deliberately not
real firms", which was **untrue for two of the three**, so the one author who checked
(`ledgerline`, which collides with three real accounting practices) found it by accident. §11 now
requires an active check and forbids the assurance. `stratum` was checked here and clears.

**Slugs stay; trading names were the thing at risk.** `ledgerline` and `formwork` remain as
directory, `id`, and const, because nothing renders the register — it is consumed only by tests
and the capture script — and every document here refers to these profiles by slug. Each register
note now states the collision out loud rather than leaving it for a reader to discover.

**Falsification.** 4 mutations, each separately confirmed to fail — a word changed inside a
captured quote, an `establishes` claim edited after capture, a grounded demonstration relabelled
`STRUCTURAL_FIXTURE`, and a revenue mix no longer summing to 100. No survivors. Files restored
byte-for-byte and verified by SHA-256.

**Maturity. Unchanged, and this package does not move it.** Lead Rescue stays
`INTERACTIVE_PROTOTYPE`. Four grounded synthetic profiles prove retargetability across authored
businesses; they prove nothing about a real firm's messy inbound, and `COMMERCIAL_THESIS.md` §6
requires that stay stated rather than blurred. No customer exists.

**What these profiles found that the model cannot express** — reported by the authors, not
complaints: blocked is not overdue (a return awaiting a signed Form 8879 is legally gated, not
late); a confidence floor cannot say "never" where a regulator is categorical; client-side
approvers have no home in `roles`; pursuit cost has nowhere to live; qualifications-based
selection is not a pipeline the model recognises. These are genuine findings about the six
systems and are the strongest candidates for the next model change.

**Next package.** The fidelity ledger still has no row for independent verification — a
capability proven live against real n8n and invisible on the buyer surface. That is the
"built it, buyer can't see it" gap, and it has now been deferred twice.

## Earlier — Two parallel authors found four defects in the gate · 2026-08-28

**Verified state.** `npm run verify`: 76 files, 1214 passed / 1 skipped, exit 0. `npm run build`:
compiled successfully, exit 0.

**Proof claim earned.** The grounding gate stops rejecting good evidence and stops accepting bad
evidence. Two Stage B agents authored profiles independently and both reported the same
obstructions; every one was a defect in this repository, not in their work. Each was reproduced
here before being fixed.

| Defect | Consequence | Fix |
| --- | --- | --- |
| `extractText` decoded 14 named entities and no numeric references | Four faithfully transcribed quotes failed capture. **The gate accused the citation when the extractor was wrong.** | Decimal and hex references decoded generically; named set widened |
| PDFs ran through the HTML tag stripper | Worse than failing — a quote can **coincidentally match** inside binary metadata, so the gate could PASS on garbage. Verified: `f8879.pdf` yielded 38,715 chars of object stream in which a real phrase matched | Content type detected, PDF text parsed properly, `contentKind` recorded |
| Captures keyed by `(profileId, url)` | One page could support only one claim | Keyed by quote as well |
| `tests/seam.test.ts` required a hand-added profile id | **Registration required editing a test the packet forbids authors to touch.** Neither agent could hand back a green tree, however good the profile | Lexicon derives registered ids from the register |

**The PDF defect was the expensive one.** Regulator publications and standards-body benchmarks are
almost always PDFs, so the gate had been quietly biased toward vendor blogs and journalism and
against primary sources — the opposite of what the evidence standard wants. The accounting author
put it exactly right, and it cost that profile the AICPA MAP survey, Circular 230, and the IRS
publications, leaving it grounded on secondary commentary about documents it could not cite.
Verified fixed end to end: a real IRS PDF now captures as `contentKind: pdf`, 11,144 characters of
readable text, quote located at offset 82.

**A fifth defect surfaced while fixing them, and the suite could never have caught it.** Two
committed source files contained **raw NUL bytes** used as composite-key delimiters — valid
TypeScript, identical at runtime, all tests green. What they broke was the toolchain: `grep` and
`sed` treat such files as binary and go silent. Earlier this session `grep` returned nothing on a
506-line file and that was written off as tool flakiness rather than investigated; it was this. It
also defeated three consecutive edit attempts against text that was visibly present. Converted to
`\u0000` escapes, and `tests/source-hygiene.test.ts` now fails if a raw NUL returns.

**Falsification.** 4 mutations, each separately confirmed to fail — reintroducing a raw NUL, a
capture claiming `html` while retaining PDF bytes, an unrecognised `contentKind`, and the seam
lexicon ceasing to derive ids. All restored and verified.

**Maturity.** Unchanged. $0 spent.

**Patterns.** #30 earned — a defect the suite cannot see is one the toolchain will hide. #28 and
#29 amended rather than duplicated: both were written this session and both were wrong in ways
only an independent author could reveal.

**Next package.** Admit `stratum` and `ledgerline` once the third brief lands, or sooner if
waiting is not worth it. Both handbacks are held and both now merge with a single register edit.
Two things to weigh at merge: `ledgerline` reports that "Ledgerline" is a real accounting firm and
trades under `Ashcombe CPAs & Advisors` while keeping the slug, and `stratum` states plainly that
its own firm name was never checked against a company register. Neither agent hid it.

## Earlier — Kestrel's recurring revenue stops being made up in volume · 2026-08-28

**Verified state.** `npm run verify`: 75 files, 1212 passed / 1 skipped, exit 0. `npm run build`:
compiled successfully, exit 0.

**Proof claim earned.** Kestrel's retainer economics move from 33 clients at $3,200/month to
**20 at $5,000**. The old rate sat at the very floor of the $3,000–$12,000 mid-market band its own
captured source names, while the profile claimed a mid-market segment; 33 concurrent retainer
relationships alongside 60 annual projects was high for 14 staff. Both tells pointed the same way
— recurring revenue made up in volume rather than in rate. One change fixes both.

**Round numbers, no manufactured precision.** 20 × $5,000 × 12 = $1.20M against a 40% target of
$1.28M — 6.25% off, well inside the 15% tolerance that exists because these are approximations.
Revenue, headcount, mix, and revenue-per-head are untouched. Two service-line values moved with it
($5,500 managed compliance, $4,000 fractional officer), correcting a pre-existing incoherence
where the blended average equalled the higher of the two lines rather than sitting between them.

**The gate worked on its author.** Editing the grounding note broke `claimSha256` and the suite
failed loudly with "re-capture rather than adjusting the hash". Re-captured, as prescribed. That
is the citation gate from the previous package catching a real claim-drift the same day it was
built, on the person who built it.

**Wording corrected throughout.** The profile docstring claimed "None of it is researched,
benchmarked" — false since the grounding package. Grounded now means **synthetic assumptions
calibrated against retrievable evidence**, never that a source verified a figure about a firm that
does not exist. Each note separates `INDUSTRY FACT` from `OUR CALIBRATION`.

**Publishing a gap is not a substitute for closing a cheap one.** The divergence was published for
a day on the belief that changing it would cascade. It would not: the blast radius was one
equation, no scenario and no test quotes either figure. The register now says that plainly rather
than presenting the earlier restraint as rigour.

**Falsification.** 2 mutations, each separately confirmed to fail — the old rate against the new
client count, and the old count against the new rate. Both break `validateProfileConsistency`.
Restored byte-for-byte, verified by MD5.

**Maturity.** Unchanged. Kestrel remains fictional and labelled as such. $0 spent.

**Next package.** Admit the Bot-authored profiles as grounded evidence when the briefs arrive. The
packet now requires a verbatim quote per source and `scripts/capture-grounding.ts` refuses to
write unless every quote is found, so their citations face the gate on arrival rather than after.
Outside that sequence, one item remains open: the fidelity ledger has no row for independent
verification, so a capability proven live this session is still invisible on the buyer surface.

## Earlier — A citation nobody opened now fails loudly · 2026-08-28

**Verified state.** `npm run verify`: 75 files, 1212 passed / 1 skipped, exit 0. `npm run build`:
compiled successfully, exit 0.

**Proof claim earned.** Every grounding source in the register is backed by a retained capture
proving the URL resolved, at a stated time, with a stated status, and that a stated **verbatim
quote** was present in the text retrieved from it. Built before any Bot-authored citation is
accepted, not retrofitted after.

**The pattern is the split, and the boundary is preserved.** A grounding source now carries a
verbatim `quote` beside its interpretive `establishes`. The quote is mechanically checkable. The
interpretation is not checkable by anything, and the artifact says so in its own `doesNotProve`
rather than letting a capture imply it blesses a reading. What this buys is inspectability: claim,
source, exact material, and the moment it was observed are visible together, so a reader can
reject the reading without doubting the retrieval.

**The capture-time gate is the part that protects against fabrication**, and it was verified
live rather than reasoned about. A quote absent from the page → refused. A URL that does not
resolve → refused. Both wrote **nothing**; the artifact hash was unchanged after each. One
unreachable source aborts the whole run, because a partial file would report the register as
better evidenced than it is.

**`claimSha256` closes the drift a capture would otherwise hide** — a claim edited after capture
leaves genuine material that is no longer the material the claim rests on.

**No live network in CI.** `scripts/capture-grounding.ts` is the only thing in the repository that
fetches at runtime, and it runs deliberately. Everything downstream reads the artifact.

**Falsification.** 13 assertions, each defending a link in the chain. 7 corruptions each
separately confirmed to fail; 2 live capture-time refusals confirmed. All restored byte-for-byte,
verified by MD5.

**One wording correction applied while here, ahead of its package.** Kestrel's grounding notes
implied sources had verified its figures. They have not and cannot: Kestrel does not exist. Each
note now separates `INDUSTRY FACT` from `OUR CALIBRATION` and states that the source says nothing
about Kestrel. The numbers themselves are untouched — that is the next package.

**Maturity.** Unchanged. $0 spent.

**Pattern earned.** #29 — retrieval can be proven, interpretation cannot, so separate them.

**Next package.** Recalibrate Kestrel's retainer economics through this stronger standard: the
$3,200/month figure sits at the floor of the mid-market band its own captured source names, and
the 33-retainer count is high for 14 staff. Then, and only then, admit the Bot-authored profiles
as grounded evidence — the packet now requires a verbatim quote per source, so their citations
face this gate on arrival.

## Earlier — The unknown was closed against a receiver we do not own · 2026-08-28

**Verified state.** `npm run verify`: 74 files, 1199 passed / 1 skipped, exit 0. `npm run build`:
compiled successfully, exit 0.

**Proof claim earned.** An `OUTCOME_UNKNOWN` can be narrowed by asking a third-party system this
application holds no credential for, and the narrowing carries **that system's own execution id**
rather than anything generated here. Previously code-complete and unproven; now exercised over the
public internet against a live n8n instance.

**What ran.** `scripts/remote-verification-proof.ts` drove the real `WebhookSideEffectExecutor`:

| Step | Result |
| --- | --- |
| Send to the live receiver | `SUCCEEDED`, external id `8` |
| Look up that key | `CONFIRMED_EXECUTED`, external id `8` — the id the receiver returned |
| Look up a key never sent | `STILL_UNKNOWN` |
| Verify with no lookup configured | refused with `AttemptUnavailableError` |

**The asymmetry survived a live receiver.** n8n answered `found: false` for the never-sent key
with HTTP 200 and complete confidence. The executor still returned `STILL_UNKNOWN`. That refusal
is easy to hold against a stub and easy to lose against a provider that sounds certain, so the raw
receiver body is retained beside the verdict and a test asserts the link between them.

**Three recorded unknowns were settled by running it.** The `found` expression returns a real
boolean; `alwaysOutputData` answers on a miss instead of hanging; the lowercase `idempotency-key`
header is what reaches the receiver. All three had been published as unverified in the workflow
files and are now corrected there.

**Inertness was audited before activation, not after.** Every node in both workflows was checked
against an allowlist and every parameter scanned for outbound URLs: four nodes each — inbound
trigger, data-table write/read, field set, respond. No `httpRequest`, no mail/SMS/CRM node, no
Code or executeCommand, no outbound URL. The only `http` match was `httpMethod` on the inbound
trigger. Neither webhook requires a credential, so no credential boundary was crossed. Two
pre-existing workflows were left untouched.

**Falsification.** 13 evidence assertions, each checking a LINK — verdict ↔ raw receiver answer ↔
key asked about — rather than the presence of a field. 6 deliberate corruptions of the artifact,
each separately confirmed to fail it; artifact restored byte-for-byte and verified by MD5.

**MATURITY: UNCHANGED. Lead Rescue remains `INTERACTIVE_PROTOTYPE`.** A public-HTTPS crossing into
a third-party platform with independent read-back is stronger *integration and execution* proof
than anything previously retained here. It is not client-liveness and must never be read as it: no
customer exists, every input was authored here, nothing forwards to a person, and the deployed
build has no lookup endpoint configured. The capture's own `doesNotProve` list says so first, and
a test fails if that list is trimmed. $0 spent.

**Pattern.** #27 updated from asserted to proven-live rather than a new entry — it is the same
pattern, now carrying evidence.

**Next package.** SELECTED, in order, per the owner: (1) the retained citation-capture gate, so
grounding sources become inspectable evidence rather than a count and a sentence, built before any
Bot-authored citation is accepted; (2) recalibrate Kestrel's retainer economics through that
stronger standard; (3) only then admit the incoming profiles as grounded evidence. One smaller item
sits outside that sequence: the fidelity ledger has no row for independent verification, so a
capability that is now real is invisible on the buyer surface.

## Earlier — The firm on every screen is no longer ungrounded · 2026-08-27

**Verified state.** `npm run verify`: 73 files, 1186 passed / 1 skipped, exit 0. `npm run build`:
compiled successfully, exit 0.

**Proof claim earned.** `UNGROUNDED_DEMONSTRATIONS` is empty. It held `kestrel` — the business
every rendered surface depicts, authored from the retained brief in `docs/source/` rather than
from research, and failing the grounding rule written two packages earlier. Three published 2026
benchmarks now anchor its economics, each opened and read rather than taken from a search summary.

**Its figures were not edited to fit.** Two sit comfortably inside the published ranges. The
third does not, and is recorded rather than corrected:

| Kestrel | Published | Reading |
| --- | --- | --- |
| $228.6k revenue per head | SPI 2026 (509 orgs): $168k all-staff, $210k per billable consultant | Above the all-staff average, near the per-billable figure. Defensible for a 14-person firm carrying little non-billable overhead; top of the $150k–$250k mid-market band. |
| $32k average engagement | Readiness $10k–$20k + policy $5k–$15k + remediation $10k–$30k | Inside the $25k–$65k a bundled engagement totals; coherent as one firm's slice of a $60k–$100k mid-market program. |
| $3,200/month retainer | Mid-market $3,000–$12,000; smaller operations $1,500–$3,000 | **At the floor of its band despite a stated mid-market segment.** The one figure that reads low for the business described. |

Changing that retainer would move every scenario and expected outcome built on it, so the
divergence is published on the profile's grounding sources instead. **Grounded means anchored in
retrievable evidence including where it departs from that evidence** — never that every figure
matched.

**The audit output changed, which is the test.** `tests/profile-register.test.ts` pinned the
exemption list to `['kestrel']`; it now pins `[]`, and the edit between them is the record that
the gap was worked rather than quietly emptied.

**Mutation.** 2 mutations, each separately confirmed to fail: dropping a grounding source below
the floor, and reducing a citation to a bare label that establishes nothing. Neither survived;
the file restored byte-for-byte and verified by MD5.

**Maturity.** Unchanged. Kestrel remains fictional and labelled as such; grounding its economics
in real benchmarks does not make the firm real, and no claim here says otherwise. $0 spent.

**Next package.** NOT SELECTED. The remaining open candidate needs the owner: proving the
verification lookup against a real n8n instance, which requires an endpoint. Beyond that, the
largest unforced gap is that `MINIMUM_GROUNDING_SOURCES` checks a count and a sentence, not that a
URL resolves — a fabricated citation would still pass, and the three here were verified by hand.

## Earlier — The seam guard had already failed, and nobody knew · 2026-08-27

**Verified state.** `npm run verify`: 73 files, 1185 passed / 1 skipped, exit 0. `npm run build`:
compiled successfully, exit 0.

**Proof claim earned — and it is a negative one first.** `Bramwell Data`, a Kestrel CLIENT name
authored in `data/profiles/kestrel/scenarios/**`, was sitting inside
`data/systems/client-onboarding.ts` with the whole suite green, and had been published into
`docs/NORTH_STAR_CANON.md` where a buyer would read it. `tests/seam.test.ts` exists precisely to
keep business vocabulary out of the vertical-agnostic layer and did not notice, because its guard
is a list of terms somebody remembered and nobody had remembered that one. The leak is removed,
the canon regenerated, and `bramwell` added.

**It was found by accident**, while probing whether the lexicon could be derived from the profile
register instead of remembered. That is the finding: a guard nobody can audit reports success by
default.

**Derivation was measured and rejected.** Every naming field across both profiles yields ~95
terms, ~70 of which already appear legitimately in `data/systems/**` — `approval`, `review`,
`client`, `proposal` — so the allowance list needed to make it work would be larger and more
hand-maintained than the blacklist. Proper-noun extraction cuts it to ~36 but misses the terms
that matter most, because the fictional client names live in scenario files rather than in
`profile.ts`. Recorded as a dead end; the probe script was deleted rather than kept.

**What replaced it is deliberately smaller.** Every registered profile's own `id` must appear in
the lexicon, checked per profile from the register. Exact, guaranteed distinctive, and the term
most likely to be typed into a system definition by whoever is working on that profile. It caught
`meridian` unguarded on the first run.

**Falsification and mutation.** 2 mutations, each separately confirmed to fail — restoring the
leaked name, and registering a profile without guarding its id. Neither survived; both files
restored byte-for-byte and verified by MD5.

**Limits.** The remaining terms are still remembered. This narrows the fail-open surface rather
than closing it: an author who invents a client name and writes it into a system definition is
still uncaught until somebody adds the term.

**Maturity.** Unchanged. $0 spent, no provider crossed.

**Pattern earned.** #28 — a guard that must be remembered has already failed.

**Next package.** NOT SELECTED. The open candidates are unchanged and both need the owner: proving
the verification lookup against a real n8n instance (needs an endpoint), and grounding Kestrel,
which is the one demonstration profile in `UNGROUNDED_DEMONSTRATIONS` and the business every
rendered surface depicts. The second is the larger gap — the firm a buyer actually sees is the
one nothing external supports.

## Earlier — The ledger describes the firm it is rendering · 2026-08-27

**Verified state.** `npm run verify`: 73 files, 1183 passed / 1 skipped, exit 0. `npm run build`:
compiled successfully, exit 0.

**Proof claim earned.** `deriveFidelityLedger` takes the business it is describing as a required
input. It read the confidence floor and the review window off an imported `KESTREL` and printed
them into the prose a visitor reads — invisible while one profile existed, and a fabrication the
moment a second one did: the ledger would have quoted a 0.70 floor while depicting a firm whose
stated policy is 0.85. Not a cosmetic mismatch; a false claim about a named policy on the one
surface that exists to say what is real.

**Required, never defaulted.** A default would rebuild the same bug behind a friendlier
signature. Every caller now states whose numbers these are, and the page that depicts Kestrel
says so at the call site.

**A source scan keeps it gone.** `tests/fidelity-ledger-profile.test.ts` fails if the module
imports from `data/profiles` again, because the next reintroduction would be as quiet as the
first.

**Falsification and mutation.** 5 tests written RED first — `profile` was not a member of
`LedgerInputs`. 2 mutations, each separately confirmed to fail: hard-coding the floor back to
Kestrel's value, and re-adding a direct profile import. Neither survived; the file restored
byte-for-byte and verified by MD5.

**One reason the test suite needed a wrapper, not seventeen edits.** Every case in
`tests/lead-rescue-proof-fidelity.test.ts` describes the Lead Rescue page, so the profile is
supplied once by a local helper rather than repeated at each call. An earlier attempt to patch
the call sites with a structural regex corrupted the file and was reverted rather than repaired.

**Maturity.** Unchanged. This closes candidate (b) from the previous checkpoint. $0 spent.

**Next package.** NOT SELECTED. `tests/seam.test.ts` still hand-maintains a sixteen-term list of
Kestrel vocabulary. With a profile register in place, a blacklist somebody has to remember to
update is the wrong shape: a second profile's vocabulary could leak into `data/systems/**` and no
test would notice. Deriving the forbidden lexicon from the registered profiles is the natural
successor. The other open candidate is unchanged: proving the verification lookup against a real
n8n instance, which needs an owner-supplied endpoint.

## Earlier — An OUTCOME_UNKNOWN can finally be narrowed, in one direction · 2026-08-27

**Verified state.** `npm run verify`: 72 files, 1178 passed / 1 skipped, exit 0. `npm run build`:
compiled successfully, exit 0.

**Proof claim earned.** `WebhookSideEffectExecutor.attemptVerify` can close an `OUTCOME_UNKNOWN`
against the receiver's own record. It has thrown since it was written, because the receiver
echoed a receipt and persisted nothing, so there was nothing to ask about. That refusal was
honest and useless in equal measure.

**The asymmetry is the design.** A record found is `CONFIRMED_EXECUTED`. A record absent is
`STILL_UNKNOWN`, always, never `CONFIRMED_NOT_EXECUTED`. A receiver cannot prove it never
received something — a request can be accepted at the socket and die before the first write to
its log, which is exactly the failure that produced the unknown. A receiver that volunteers that
its log is complete is not believed either; it cannot observe what it failed to record. This is
`CLAUDE.md`'s absence-of-evidence rule applied to an external provider's answer for the first
time.

**Half is the useful half.** The dangerous error is sending twice, and confirming an effect DID
happen prevents it. Confirming one did not merely grants retry permission, and an unpermitted
retry is safe.

**Falsification and mutation.** 33 tests written RED first — `attemptVerify` threw
unconditionally. 6 targeted mutations, each separately confirmed to fail; none survived; the file
restored byte-for-byte and verified by MD5. A seventh finding came from the tests themselves: two
cases were passing `undefined` to a defaulted parameter, which selects the default, so they had
been building an executor WITH a lookup channel and asserting nothing.

**Maturity. Unchanged, and deliberately so.** The capability is code-complete and **unproven**.
Both n8n workflow JSONs are authored here and have never been deployed — no instance has imported
them, no execution has run them, and the data table they name does not exist.
`LEAD_RESCUE_WEBHOOK_LOOKUP_ENDPOINT` is unset. No artifact exists under `n8n/evidence/` for this
path and none may be claimed until one does. $0 spent, no provider crossed.

**Pattern earned.** #27 — a verification channel may confirm an effect, never its absence.

**Next package.** NOT SELECTED. Two candidates. (a) Prove this path: import both workflows into a
real instance, set `LEAD_RESCUE_WEBHOOK_LOOKUP_ENDPOINT`, drive a send whose outcome is unknown,
and retain an artifact for both a present and an absent key — this is the only way the `found`
expression, the `alwaysOutputData` miss behaviour, and the header casing stop being unverified,
and it needs an owner-supplied endpoint. (b) Decide what `lib/proof/fidelity-ledger.ts` says under
a profile that is not Kestrel, which #26 exposed and left open. (a) closes a gap this package
opened; (b) is a prerequisite for ever rendering a second profile.

## Earlier — The seam is exercised, not asserted · 2026-08-27

**Verified state.** `npm run verify`: 70 files, 1129 passed / 1 skipped, exit 0. `npm run build`:
compiled successfully, exit 0.

**Proof claim earned.** A second business profile runs all six systems, all twenty-two
scenarios, on the same engine through the same handlers. `lib/model/profile.ts` has claimed
since it was written that retargeting "should be a matter of authoring a second profile";
`tests/seam.test.ts` guarded that with a sixteen-term blacklist over `data/systems/**`. A
blacklist proves the vocabulary somebody remembered is absent. It cannot prove a second
profile is possible. One now exists and the claim is exercised.

**The engine was already generic. The wiring is not.** No handler or reducer changed, which is
exactly what the seam promised. The coupling lives in the surfaces: `lib/proof/fidelity-ledger.ts`
reads `KESTREL` directly, and `RUNNABLE_SYSTEMS` names it six times. Recorded rather than fixed —
what the buyer-facing ledger should *say* under a second profile is a canon decision.

**The contract was enforced but undeclared.** `numberParam` throws on a missing key, correctly,
but the seventeen demands existed only as scattered call sites — discoverable only by authoring a
profile and crashing into them one at a time, and impossible to hand to anyone else.
`PROFILE_ENGINE_CONTRACT` states it once; a source scan fails if it drifts in either direction.

**A published threshold governed nothing.** `dormantCoolingOffDays` carried a policy link and
rendered into `docs/RESEARCH_LEDGER.md` as a governing number that no code reads. Removed rather
than justified by inventing an engine rule to honour it. `docs.test.ts` caught the stale canon,
which is the mechanism working.

**Falsification and mutation.** 62 tests written RED first — the suite failed to import a profile
that did not exist. 4 targeted mutations, each separately confirmed to fail the suite; none
survived; all files restored byte-for-byte and verified by MD5. The hard-coded-threshold mutation
survived the aggregate divergence assertion and was caught only by the per-threshold isolation
cases, which is why those exist.

**Attribution was measured and was wrong twice.** The owner-intelligence divergence was credited
first to `exceptionVarianceThresholdPct`, then to `inputStalenessToleranceHours`. It is driven by
`confidenceFloor`.

**Maturity.** Unchanged. Meridian is a structural fixture, absent from `RUNNABLE_SYSTEMS` and
every rendered surface; nothing in it is grounded in how localisation firms operate, and
`COMMERCIAL_THESIS.md` §6 requires that grounding of any profile a visitor is shown. $0 spent, no
provider crossed.

**Pattern earned.** #26 — a seam is proven by a second instance, never by a blacklist.

**Next package.** NOT SELECTED. Two candidates, in order of my preference: (a) the remote
receiver's idempotency-key lookup, so `attemptVerify` stops throwing and an `OUTCOME_UNKNOWN` can
be narrowed — still the last structural hole in the execution boundary, and unchanged by this
package; (b) decide what `lib/proof/fidelity-ledger.ts` says under a profile that is not Kestrel,
which this package exposed and deliberately left open. (b) is a prerequisite for ever rendering a
second profile; (a) is the deeper gap.

## Earlier — Two of the four published gaps, closed · 2026-08-27

**Verified state.** `npm run verify`: 69 files, 1067 passed / 1 skipped, exit 0. `npm run build`:
exit 0.

**Proof claim earned.** `call-to-proposal/NEEDS_HUMAN` and `client-onboarding/NEEDS_HUMAN` — two
of the four states #22 published as places work could be parked with nothing declared about
being abandoned — now declare a `HUMAN_APPROVAL_TIMEOUT` and implement it. The assertion that
matters in each suite is not that the mechanism works but that **the audit's own output
changed**: a gap that could be closed without moving the number was measuring something else.

**Two of four, and a test pins that.** The other two stay published as backlog. Publishing a gap
is only worth anything if it gets worked rather than quietly emptied.

**The cross-system reuse is the real test of #21.** Call-to-Proposal was the easy half. Client
Onboarding is a different lifecycle, a different entry path, and a handler that had never had an
attention mechanism. The pattern carried unmodified.

**Client Onboarding stamps its clock at the handler boundary.** Three ways into NEEDS_HUMAN
exist and a fourth is plausible; hand-stamping would let one arrive with no clock, and a parked
case whose window never starts can never be overdue — silently the exact condition the mechanism
exists to catch.

**Falsification and mutation.** 18 new tests written RED first. 8 targeted mutations; one
survived — the `<`/`<=` window boundary, the same weakness caught and fixed on the approval
timeout, which I then failed to carry across when reusing the shape. Reuse copies the gaps in
the tests as faithfully as it copies the code. Repaired in both systems.

**Maturity.** Unchanged. $0 spent, no provider crossed.

**Pattern earned.** #25 — a published gap is a backlog, and closing it must change what the
audit reports.

**Next package.** NOT SELECTED. The strongest remaining candidate is the one named two
checkpoints ago and still open: give the remote receiver a lookup by idempotency key so
`attemptVerify` can stop throwing and an `OUTCOME_UNKNOWN` can actually be narrowed — the last
structural hole in the execution boundary. The two remaining abandonable states need a canon
decision, not machinery.

## Earlier — The firm can finally say who approves a proposal · 2026-08-27

**Verified state.** `npm run verify`: 67 files, 1048 passed / 1 skipped, exit 0. `npm run build`:
exit 0.

**Owner decision, delegated and taken.** The owner asked for a recommendation on the outstanding
canon questions and accepted it: give Kestrel a nameable proposal approver so the working path is
demonstrable, and keep the ambiguity provable on a synthetic profile rather than deleting it.

**The gap this closes.** `resolveEscalationOwner` answers "who has enough authority?" and rightly
refuses to break a tie. Kestrel's Operations Coordinator and Finance both clear the proposal
authority bar and neither approves proposals — so the model returned an honest ambiguity where
the business had a real answer all along, sitting in prose nobody could check: the Client Partner
owns proposals, escalating to the founder who approves all commercial commitments.
`accountabilities` makes that same fact data.

**It grants nobody anything.** The Client Partner's authority ceiling is unchanged at 3, and
despatch is still capped at authority 2. Accountability says whose desk an action lands on; it is
not a back door to authority, and a test pins that.

**The scenario got better, not just different.** `approval-window-elapses-unassigned` became
`approval-window-elapses`: a draft routed to the Client Partner with a 48-hour window, a check at
24 hours that does nothing and says so, and a check at 50 hours that escalates **past** the Client
Partner to the Managing Principal — with the draft not moving an inch. A visitor now watches the
mechanism work rather than watching it confess.

**The honesty machinery did not soften.** The unowned-draft path is still fully proven, now on a
profile that has genuinely never decided. A fiction fixing itself must not retire the mechanism
that reported the problem.

**Falsification and mutation.** 13 new tests written RED first. 7 targeted mutations; **two
survived** and were repaired. One is worth recording: on Kestrel the declared next approver and
the rank-derived one AGREE, so a mutation that ignored the declaration passed a test which had
only checked the label. Repaired with a profile where the two disagree by construction.

**Maturity.** Unchanged. $0 spent, no provider crossed.

**Pattern earned.** #24 — who is accountable is a fact a business knows, not an inference from
rank.

**Next package.** Closing two of the four published abandonable parked states, per the same
accepted recommendation: `call-to-proposal/NEEDS_HUMAN` (reuse within a system) and
`client-onboarding/NEEDS_HUMAN` (reuse across systems, the stronger claim). The other two stay
published as backlog.

## Earlier — A side effect finally leaves this machine · 2026-08-27

**Verified state.** `npm run verify`: 66 files, 1032 passed / 1 skipped, exit 0. `npm run build`:
exit 0. New runtime artifact: `n8n/evidence/lead-rescue-remote-execution.json`.

**Owner authorisation.** The owner gave explicit, in-session go-ahead for the gated execution
boundary. No email, SMS, or customer-facing message was sent; the counterparty is an automation
endpoint that forwards nothing.

**Proof claim earned — Execution 2 → 3.** An authorized Lead Rescue notification left this
machine over HTTPS, crossed the public internet, and was accepted and recorded by an n8n Cloud
workflow. The delivery was then read back from **n8n's own execution log through a separate
authenticated channel** — receiver execution `4`, carrying the exact idempotency key
`notify:lead-remote-proof-dispatch-timeout-1:dispatch-overdue`. Every prior execution claim in
this repository was bounded by `127.0.0.1`; that bound is gone.

**The replay was suppressed before the transport, confirmed from the receiver's side.** Case B
re-ran the identical protected operation and produced `SUPPRESSED_DUPLICATE` — and n8n's
execution list shows **no second execution**, which is the counterparty confirming that nothing
was sent rather than the application asserting it.

**The guard is the inverse of SMTP's, and that is the pattern.** `SmtpSideEffectExecutor`
refuses a ROUTABLE recipient so it can never reach a person. `WebhookSideEffectExecutor`
refuses a NON-ROUTABLE endpoint so it can never be satisfied by something on this machine.
Each guard enforces the exact claim its own executor exists to support; a remote-execution
executor that could be pointed at loopback would make its own claim unfalsifiable.

**Certainty is earned, not defaulted.** Over HTTP a receiver can act on a request it never
answers, so `OUTCOME_UNKNOWN` is the default and only a provably pre-request failure earns
`FAILED_BEFORE_EFFECT`. 5xx and 409 are both unknown, deliberately.

**A defect the capture found, which no test could have.** The first run reported
`receiverReportedExecutionId: null` for a send that had genuinely succeeded — `checkWaitIncident`
resolved the counterparty's identifier and dropped it, leaving no link between our record and
theirs. `attachExecutionReceipt` retains it, as a function deliberately separate from
`downgradeEffect`, which documents itself as never able to upgrade an effect.

**The attestation is bounded by a check.** No receiver API credential exists here, so the
independent read-back is operator-attested and merged by a script that REFUSES unless it names
the same execution and the same operation the application independently recorded.

**Falsification and mutation.** 55 new tests, written RED first. 8 targeted mutations of the
executor, all killed, restored byte-for-byte and verified by SHA-256.

**Maturity.** Lead Rescue outbound execution moves to REAL for this configuration. The fidelity
ledger's `outboundRow` gained a `WEBHOOK` case — the type system refused to compile until the
buyer-facing ledger said what the new mode means.

**Pattern earned.** #23 — a guard enforces the claim its own executor exists to make.

**Next package.** NOT SELECTED. Three candidates, in order of my preference: (a) give the
receiver a lookup by idempotency key so `attemptVerify` can stop throwing and an
`OUTCOME_UNKNOWN` can actually be narrowed — the last structural hole in this boundary;
(b) configure the deployed Vercel application for this mode, so the crossing is made by the
public deployment rather than a local process; (c) the four abandonable parked states, which
still need canon decisions.

## Earlier — The parked-state gap reaches the buyer · 2026-08-27

**Verified state.** `npm run verify`: 63 files, 977 passed / 1 skipped, exit 0. `npm run build`:
exit 0, 39 static pages.

**Proof claim earned.** The audit from the previous package now renders as `Two · c` on all five
`/proof/<slug>` pages, computed at build time from each system's own lifecycle. It sits directly
under the coverage panel and answers the question that panel provokes: those runs end with a
person holding the case, so what happens when the person does not act?

**The zero case is the one that had to be got right.** Receivables Recovery reads *"This system
declares what happens when nobody acts, for all 5 of the states work parks in"* — never
"complete", never "fully covered". A test forbids those words in the headline by name, because
rendering an empty finding as an absence of risk is precisely the move the integrity rule
forbids. The caveats say the rest: this reads what a system declares about itself, never what
its code does.

**Mutations found the sort was decorative.** Removing it survived, because no system currently
exposes more than one state, so ordering was unreachable from the real model. Driven directly
with a fixture rather than deleted — the second time this pass that an unreachable rule was
pinned instead of explained.

**A limit taken deliberately.** The panel is NOT on `/lead-rescue`. That page's nine walkthrough
frames are captured against its current layout, and adding a section invalidates them; a
re-capture is its own pass. Lead Rescue's list is empty, so the unmade claim is the affirmative
one — recorded here rather than quietly skipped.

**Maturity.** Unchanged. $0 spent, no provider crossed, no gated variable set.

**Pattern earned.** None — this renders #22 rather than adding residue, the same relationship
"the coverage figure reaches the buyer" had to #20.

**Next package.** NOT SELECTED. The published list is now a backlog four entries long, and the
repository has already demonstrated once that a published gap gets used as one. Closing any of
the four means ADDING a failure mode to canon, which is a modelling decision I have deliberately
declined twice now and which is the owner's. Separately and larger: Execution 2 → 3 remains the
only reference-exit blocker and is gated on explicit go-ahead.

## Earlier — A state you can enter and never be forced out of · 2026-08-27

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
