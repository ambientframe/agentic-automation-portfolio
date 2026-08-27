# Lead Rescue in 90 seconds

A guided read of [`/lead-rescue`](https://agentic-automation-portfolio.vercel.app/lead-rescue),
the reference implementation in this portfolio and the only system built to full depth.

**This page exists so the portfolio survives two readers the live site cannot reach:** one
whose link has died, and one who will not click. Every frame below was captured from a real
production build of this repository — never composed, annotated, or retouched. If a frame is
unconvincing, the fix belongs in the page, not here.

**Before anything else, what this is not.** Kestrel Compliance Group is a fictional business
built to exercise this system. Every contact, company, enquiry, and timestamp in these frames
was authored for the demonstration. Nothing here has run for a paying customer, no trigger is
connected to a real channel, and no real person has ever been contacted from this build.

---

## The 90 seconds

| # | Time | On screen | What it establishes |
| --- | --- | --- | --- |
| 1 | 12s | The banner and the masthead | The portfolio labels itself before it sells itself |
| 2 | 13s | The claim, and the four figures under it | 8 incidents, all landing in a declared state |
| 3 | 13s | Eight incidents, each with its own ending | The awkward ones are on the shelf too |
| 4 | 13s | One incident, opened to a single step | Where the rules stop and a model starts |
| 5 | 13s | The four boundary cards | What a model may never do, however confident |
| 6 | 13s | The operator console, running live | Real routes, real disk, one honest stand-in |
| 7 | 13s | The fidelity ledger, and its last row | Capability by capability, limits attached |

---

### 1 · The portfolio labels itself before it sells itself · 12s

![The Lead Rescue proof page at the top: a standing SIMULATED banner reading "Nothing here is connected to a live system. All businesses, people, and incidents are fictional", the Portfolio Flight Simulator masthead counting 6 systems as 5 simulated and 1 interactive prototype, and the headline "Every enquiry ends somewhere you can point at."](walkthrough/01-banner.png)

The first thing on the page is the disclaimer, not the pitch. The masthead counts its own
maturity out loud — **6 systems · 5 simulated · 1 interactive prototype** — so a visitor knows
what proportion of this is a prototype before reading a single claim.

Say: *"Everything you're about to see is labelled. The build tells you what it is."*

### 2 · Every enquiry ends somewhere you can point at · 13s

![The same page scrolled to the claim: three cards headed "What goes wrong today", "Why it costs real money", and "What this replaces it with", above four figures — incidents you can run, 8; ended in a declared state, 8 of 8; diverged from expectation, 0; confidence floor in force, 0.7.](walkthrough/02-claim.png)

The promise is narrow enough to check: no enquiry disappears, and anything past the system's
authority reaches a person. The four figures underneath are the check on exactly that claim.
**8 incidents**, all 8 finishing in one of the **17 states** the system declares in advance,
none diverging from what its scenario predicted.

**0.7** is the confidence floor — below it, a judgment routes to a person instead of acting.
It is this operator's configured policy, not an industry benchmark and not a measured result.

Say: *"Eight incidents, eight declared endings, nothing unaccounted for."*

### 3 · The awkward incidents are on the shelf too · 13s

![A grid of eight selectable incidents, each showing its ending: after-hours enquiry with missing scope ending Booked; the same enquiry delivered twice ending Booking ready with 1 sent and 3 held; an enquiry the system should not answer with nothing attempted; a contact who unsubscribed now writing directly; the acknowledgement provider going quiet with 1 unconfirmed; and three wait-window incidents ending Needs human.](walkthrough/03-incidents.png)

This is the tell. A demo picks its happy path; this shelf leads with the cases that go wrong —
a duplicate delivery where three sends are **held** rather than repeated, an enquiry the system
**should not answer**, a provider that **went quiet** and left an outcome unconfirmed, and three
deadlines that elapse into `Needs human`.

Six of the eight end with a person holding the case. That is the designed outcome for anything
past the system's authority, not a failure to automate.

Say: *"Six of eight end with a person. That's the design, not a shortfall."*

### 4 · Where the rules stop and a model starts · 13s

![One incident opened to thirteen steps down the left — validation, normalisation, duplicate check, consent screen, bounded interpretation, completeness check, disposition, acknowledgement, and more — with exactly one step marked AI. The right pane shows the selected step tagged FIXED RULE, what it chose, its authority level, the guardrail that engaged, and the two transitions it was allowed to make next.](walkthrough/04-step.png)

Thirteen steps, and exactly one carries the **AI** mark. Every other step is a fixed rule that
genuinely computes: validation, duplicate detection, consent screening, the confidence
comparison, transition legality. Each step opens to show what it chose, what authority it acted
under, which guardrail engaged, and — the part that is hard to fake — the complete set of moves
it was permitted to make next, out of the system's **37 declared moves**.

Say: *"One step out of thirteen is a model. The rest is arithmetic you can replay."*

### 5 · What a model may never do, however confident · 13s

![Four cards: what judgment is used for, listing three free-text interpretation tasks; what it may never do, listing six structural refusals including making a commercial commitment and raising its own authority; only a person may do these, listing five; and guardrails carried by every run.](walkthrough/05-boundary.png)

The model interprets free text. It may not make a commercial commitment, negotiate, override a
suppression or opt-out, assert a fact the input never established, or raise its own authority
because it feels certain. Those are refused structurally rather than discouraged by a prompt:
**confidence cannot buy any of them.**

Say: *"Confidence is not authority. The gate is outside the model."*

### 6 · Real routes, real disk, one honest stand-in · 13s

![The operator section marked REAL, reading "These controls write to disk and read the real clock", with an amber paragraph stating that the outbound message itself is a stand-in and nothing leaves the process. Below are live controls and a case loaded from disk showing its trigger, decision, action, guardrail, and outcome.](walkthrough/06-operator.png)

Everything above this point is a deterministic replay. This section is not: each button calls a
real route handler that re-reads a case stored on disk, applies one event through the same
engine, and returns the engine's own answer — including refusals. Restarting the server changes
nothing, because the file on disk is the only place that state lives.

And the exception is stated in the frame rather than discovered later: **the outbound message
itself is a stand-in.** Nothing leaves the process and no recipient exists. The claim, the
authority check, and the duplicate refusal around it are all real.

Say: *"Real routes, real persistence, and it tells you which single part is faked."*

### 7 · Capability by capability, with the limits attached · 13s

![The fidelity ledger tallying capabilities as REAL 10, FIXTURE-BACKED 2, SIMULATED 1, UNVERIFIED 1, with each label defined, followed by individual rows for the deterministic decision engine and the authority gate, each carrying a "does not establish" caveat and file paths to check it at.](walkthrough/07-ledger.png)

One label per capability, so nothing borrows credibility from anything beside it: **REAL 10 ·
FIXTURE-BACKED 2 · SIMULATED 1 · UNVERIFIED 1.** Every row carries a *does not establish* line
naming its own limit, and file paths to check it at.

![The last rows of the ledger: operational observability and alerting marked REAL, and the final row, Customer deployment, marked UNVERIFIED — "Nothing here has run for a paying customer. There is no live trigger connected to a real channel, no production scheduler, and no client data of any kind in this build", with the note "This is the row that bounds every other row on this page. Read the rest against it." The system's declared maturity reads INTERACTIVE PROTOTYPE.](walkthrough/08-unverified.png)

The page tells you to read the last row first, so this is where the walkthrough ends rather than
where it trails off. **Customer deployment: UNVERIFIED.** Nothing here has run for a paying
customer, no trigger is connected to a real channel, and there is no client data of any kind.
That row bounds all ten of the REAL ones above it.

The same discipline produced a result nobody would choose to publish: the labelled evaluation
corpus was run against a genuine `claude-opus-5` and **scored 6 of 9 against its own declared
floor of 75%**. It is retained rather than re-run, re-labelled, or quietly dropped. Every miss
routed to a person rather than to an action, so the failure is one of accuracy and never of
safety.

Say: *"It fails its own evaluation in public. That's the reason to trust the rest of it."*

---

## Recording it

The frames above are the storyboard; the *Say* lines are the script, timed to 90 seconds. To
record a screen capture, open `/lead-rescue`, and follow the beats in order — each one is a
single scroll position on one page, so it needs no editing beyond the scrolling.

## Re-cutting the frames

Frames are captured, never composed, so they can be regenerated rather than redrawn:

```bash
npm install --no-save playwright && npx playwright install chromium
npm run build && npx next start -p 3100
npx tsx scripts/capture-walkthrough.ts
```

Playwright is deliberately **not** a dependency of the application — this repository promises a
stranger that `npm install` is cheap — so the capture script installs it on demand and fails
with instructions if it is missing. Frames are written at a fixed 1440×900 viewport at 2×, with
the colour scheme pinned, so two captures of an unchanged page differ only where the page
differs.

**Captured from commit `0195146` against a local production build.** Frame 6 shows a runtime
store that had been used, which is why it has a case in it; a freshly deployed instance carries
no runtime state and its operator console starts empty, filling only from use of the demo
itself. That was chosen over seeding it, because authored history presented as a record would
break the first rule this portfolio holds itself to.

`tests/walkthrough.test.ts` recomputes every figure on this page from the model and fails if one
drifts, fails if a frame goes missing, and fails if this document stops carrying its own limits.
