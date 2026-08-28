# Checkpoint

> One per accepted package (Constitution §14). Repository truth is authoritative; this file
> is an index, not a source. Append the new checkpoint above the previous one.

## Current — A citation nobody opened now fails loudly · 2026-08-28

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
