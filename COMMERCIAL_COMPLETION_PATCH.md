# COMMERCIAL COMPLETION PATCH

**Authority:** this document is the commercial V1 strategy of record — the architecture,
evidence rules, launch gate, and freeze rule that take the artifact from engineering-complete to
commercially usable. It extends `COMMERCIAL_THESIS.md` and contradicts nothing in it; if the two
ever seem to disagree, the thesis wins and this file is wrong. Process remains
`PORTFOLIO_PM_CONSTITUTION.md`'s; live state remains `CHECKPOINT.md`'s. Accepted by the operator
2026-08-29, with four corrections, all incorporated below.

Like the thesis, this file carries no mutable state. Operator-reserved values — public name,
contact address, engagement fee, domain — are decided in a private decision batch (**CD1**) and
rendered on the site from a single declaration module. This file marks each `[CD1]`. Until CD1
lands, the site renders an explicit unset state, never an invented value.

---

## 1. THE VERDICT THIS PATCH ANSWERS

Release integrity is closed. The capability exit gate (`§8` of the audit sequence) is met. Live
inspection (2026-08-29, desktop and 375px) found the design system to be an asset, not a defect.
What remains is this: **thesis §9 says "judge me on what you find," and the artifact contains no
me.** No author, no offer, no path from a favorable judgment to a conversation. The proof chain
runs from stranger to convinced inspector and terminates in silence.

The binding constraint is therefore commercial completion, and within it the keystone is the
**offer** — identity, narrative, and conversion can only be written coherently around a concrete
thing a stranger can hire.

Everything the engineering scorecard ranks is post-launch until the gate in §7 passes. The
governing standard from here, in the operator's words: *we are not trying to make this portfolio
impossible to criticize; we are trying to make it credible enough, clear enough, and commercially
complete enough that the right person can rationally choose to pay.*

## 2. COMMERCIAL V1 ARCHITECTURE

**Identity.** The operator appears by real name, as an **independent operator** — not an agency,
studio, or team. Default public name: **Christopher Schafrath**, final form `[CD1]` — internal
documents' use of "Chris" establishes nothing publicly. Background appears as provenance, not
story: two or three factual sentences (the trade history is already public in thesis §4a; site
and canon must simply agree). `ambientframe` remains the build namespace only, described as such
in the colophon; no brand is developed on it. Reversible; revisit only if collaborators or
productization arrive.

**Positioning.** For owner-run service firms. The artifact stays protagonist; the human
translates. Register: small service firms leak revenue they already paid to earn; automation
vendors ask for trust before verification; this site is a system you can check before you trust,
running, with its limits published.

**The offer: the Revenue Leak Audit.** A bounded, fixed-fee diagnostic of where a firm's
operation drops paid-for demand — enquiry handling first, because that is where the deep proof
is. Fee: fixed, stated on the page, `[CD1]`; the figure is a tracked commercial bet, not
doctrine — it is revised on consistent evidence from qualified conversations that price (not
trust, scope, fit, or urgency) blocks purchase, and it is not discounted because somebody
hesitates once.

The engagement page must make the audit concrete enough that the fee refers to a product, not
"some consulting." All eight elements, in the site's own vocabulary:

1. **What goes in:** read-only access to (or exports from) the places enquiries arrive and are
   worked — inboxes, forms, phone log if kept, the CRM or its absence; one bounded interview
   (~60–90 min) with whoever works enquiries; whatever historical enquiry data exists. Missing
   data is itself a finding, not a blocker.
2. **What is inspected:** the enquiry-to-engagement lifecycle end to end — capture points,
   time-to-first-response, duplicate handling, classification and routing, acknowledgment versus
   tracked ownership, follow-up after first contact, handling after a reply, escalation, and the
   dormant edge (what happens to enquiries that go quiet).
3. **Boundaries:** diagnosis of that pipeline. Not marketing performance, not pricing, not
   staffing design, not tool procurement.
4. **What comes out:** a written, evidence-grade report in this portfolio's register — each
   observed leak with severity, observed frequency, and exposure estimate where measurable, with
   measured and estimated figures labeled as such; a prioritized intervention order; and the
   subset fixable without hiring anyone, this operator included. Plus a readout conversation.
5. **Shape:** roughly two weeks elapsed; a handful of hours of the firm's time. No fabricated
   precision beyond that.
6. **Excluded:** implementation. A first build, if the evidence warrants one, is scoped
   separately from the audit's findings.
7. **Implementation included?** No, by default — stated plainly.
8. **If there is nothing worth building:** the report says so. A defensible "your operation does
   not leak enough here to justify systems work" is a successful audit outcome, and the
   diagnostic artifact stands on its own either way.

**Measurement and publication (binding, from the operator's correction).** The engagement is not
optimized for this portfolio's need for social proof:

- measurement necessary to diagnose the operation is simply part of doing the work properly;
- the client owns and receives the useful measurements;
- the operator retains methodology internally to learn from the engagement;
- publication of any identifiable or anonymized client result requires a **separate, explicit
  permission step**, after the fact;
- declining that permission reduces nothing about the service received.

Site copy direction (not final copy): *with permission, real engagements may later contribute
anonymized outcome evidence to this portfolio; nothing is published without approval.* The first
transaction creates the **possibility** of earned social proof. Social-proof extraction is not
part of the offer.

**Deliberately not claimed in V1:** clients, deployments, outcomes, savings, speed, team
("we"), vertical expertise, or production status for Systems 2–6. Where a reader would look for
one of these, the absence is stated, not papered over.

**Conversion model.** One action, sitewide: a real email address `[CD1]`, with the after-state
declared — a reply within two business days containing two or three specific questions about the
firm's operation before any call. No forms, no scheduler, no intake machinery.

**Systems 2–6.** Breadth with a truthful maturity gradient. Their commercial job: show that the
flagship's discipline is a repeatable method and enumerate the other leak classes a firm has.
Pre-launch contribution: a plain-language maturity legend, nothing else. No parity work, no new
capability.

## 3. EVIDENCE RULES FOR COMMERCIAL SURFACES

Commercial surfaces inherit the portfolio's evidence standard; they do not get a marketing
exemption. Thesis §4 stays fully in force — what follows is how a commercial layer exists inside
it rather than around it.

1. **Evidence register.** Every commercial sentence either resolves, by link, to the artifact
   that backs it, or is labeled for what it is. Nothing outward-facing requires a call to be
   understood.
2. **Operating evidence and control evidence are different things and stay labeled as such.**
   `OPERATING`: what happened during ordinary use of the system, recorded as encountered.
   `CONTROL`: a deliberate, declared challenge to a specific safeguard. A safeguard proven by a
   control test is not presented as something that "happened"; a quiet normal run is not dressed
   up as drama. If ordinary use produces no dramatic failure, that is the finding — none is
   manufactured. This distinction survives into the evidence register and the public log.
3. **Reserved slots, never mocks, on shipped surfaces.** Where real evidence does not exist yet
   (measured client outcomes, before/after deltas, deployment history), the surface shows a
   named empty slot stating exactly what will appear there, how it will be earned, and that
   nothing above it will be retro-softened. `MOCK`/`SYNTHETIC` scaffolding is a build-time tool
   and never deploys.
4. **Existing truth machinery is untouched:** simulation banner, maturity labels, fidelity
   ledger, fictional-business labels, `doesNotProve` registers.
5. **No capability work rides along.** A commercial package that grows an engine feature has
   left its scope.

## 4. THE SURFACES

Five, each with a job. Everything currently live is retained; the front door is reworked, the
rest is added.

| Surface | Question it answers | Action it enables | Deeper layer |
|---|---|---|---|
| **Front door** (rework) | Is this worth two minutes of a busy owner's attention? | Route choice: "I run a firm" → log + engagement; "I evaluate systems" → systems/proof/repo | The existing homepage content, retained below as the evaluator layer |
| **Operator's log** (new, flagship) | What is it like when a person runs this, and where does it stop? | The offer handoff | Journal records, wait-incident store, fidelity ledger, `MODEL_GAPS.md`, this file's §5 |
| **Engagement page** (new) | What exactly can be hired, for how much, with what risk? | The email action | Method links into the proof layer; thesis §4a |
| **Author block + colophon** (extended) | Who is accountable for all of this? | Contact | Repository, commit provenance — identity is part of provenance, the only register it appears in |
| **System pages / proof console / simulator** (unchanged) | Existing jobs | Existing actions | Plus the maturity legend |

The public name for the flagship surface is **"operator's log," not "case study"** — required by
thesis §4, and the stronger choice anyway: a dated, commit-pinned log defuses exactly the
skepticism a self-authored "case study" invites.

## 5. OPERATOR'S LOG ARCHITECTURE

Form: evidence-grade throughout — dated, commit-pinned, first person, every claim linked to the
artifact behind it, composed only from the evidence bundle the pre-registered protocol
(`docs/O1_OPERATOR_RUNBOOK.md`) produces. Sections, in order:

1. **Why I ran this.** Thesis §4a said out loud: the operator does not sell what he has not
   lived, so before asking anyone to hire this judgment, he operated the system as a user.
2. **What I ran.** The system in one paragraph; the fidelity summary of *this run*; the
   fictional-business label restated; ledger linked.
3. **The operating session** (`OPERATING`). Chronological, from the normal run: timestamp, what
   the system did, what the operator did, screenshot, journal record — recorded as encountered,
   surprises and tedium included.
4. **The control challenge** (`CONTROL`). Opens by declaring itself: a safeguard deliberately
   challenged — the authority ceiling — because the operator would want to know whether it holds
   before trusting the system with someone else's business. The attempt, the refusal (or its
   failure, captured harder), the routing artifact.
5. **What surprised me.** From the operating session's contemporaneous notes: friction, defects,
   judgment on where a real deployment would differ. Defects found are published, not hidden.
6. **What this run does not prove.** The `doesNotProve` register — synthetic firm, no real
   inbound mess, no live providers by default, no customer outcomes — and the reserved slot for
   measured client outcomes, with its earning path and the no-retro-softening commitment.
7. **If this were your firm.** The translation, and the Revenue Leak Audit handoff. Any
   illustrative economics labeled as reasoning, never as measurement.

## 6. ACTIVATION PRINCIPLES

Sanctioned by thesis §4's placement clause: the artifact must be encountered; ego-minimal solves
conversion, not discovery. The motion is **placement + conversion** — no cold outreach, no
volume acquisition, no vertical identity (§5: verticals are demonstrations).

- **The encounter surface is the operator's log**, not the homepage.
- **The shortlist is ranked by credible proximity to the buying problem, not familiarity.**
  Highest value: (1) owners of appropriately sized service firms with observable operational
  leakage; (2) people with trusted access to several such owners — fractional COOs/CFOs,
  accountants, agency principals, business-community connectors. The operator's existing network
  is an **access graph, not the ICP**: used where it reaches commercially relevant operators,
  never a reason to force the offer toward where the relationships happen to originate.
- **The objective is not friendly reactions.** It is the smallest graph likely to produce:
  qualified inspection → relevant conversation → paid diagnostic.
- **Conversion happens in conversation**, which is the operator's strongest terrain (§4a). The
  artifact creates and qualifies the encounter; the operator converts it.

Tactical state (the list itself, note drafts, pricing posture) is held privately, not in canon.

## 7. LAUNCH GATE AND THE FREEZE RULE

Eight conditions, each observable, all required:

1. **Truthfulness** — do what every page invites, cold: everything works or honestly refuses;
   public CI green at the deployed commit; zero claims implying customers, outcomes, or scale;
   every label and reserved slot present.
2. **Buyer comprehension** — an unbriefed cold reader (owner persona) answers in ≤2 minutes:
   who built this, what problem it addresses, what is real versus simulated, what can be hired,
   what to do next.
3. **Identity/offer clarity** — name, offer, and fee reachable from any page in ≤2 clicks; the
   cold reader can state the offer and fee back correctly.
4. **Inspectable proof** — claim → artifact → source in ≤2 clicks, unauthenticated, from every
   commercial sentence.
5. **Log credibility** — a skeptic persona finds no statement in the operator's log it can tag
   as theater: every session claim resolves to a journal record, screenshot, or commit, and the
   `OPERATING`/`CONTROL` boundary is legible.
6. **Design/access** — recorded keyboard/focus/contrast pass; no horizontal scroll 375–1440px;
   console states usable on mobile; the operator signs the art direction.
7. **Conversion path** — the email action works (verified with a real message), names the
   operator, states what happens next.
8. **Deploy integrity** — live serves `HEAD`; acceptance probes re-run clean at the launch
   commit.

**The state transition is the point.** When all eight pass: portfolio construction **freezes** —
defect repairs only — and first-client acquisition becomes the binding constraint. Portfolio
work resumes only for (a) evidence earned by real engagements, or (b) post-launch packages that
win a written scorecard comparison. The failure mode this gate exists to prevent is polishing a
launched portfolio instead of using it.

## 8. DEPENDENCY GRAPH (structure; live state is `CHECKPOINT.md`'s)

```
CD1 (operator, private) ─────────────┐
CP1 commercial surfaces (builder) ───┤
CP2 log skeleton + capture           ├─→ RT1 cold read ─→ GATE ─→ freeze + activate
    apparatus (builder)              │
      └→ O1/O2 (operator, per        │
          runbook) → CP2b log body   │
          (builder, real evidence    │
          only)                      │
D1 recorded design/access (builder) ─┤
P2 gates test (builder, opportun.) ──┘
shortlist build (operator) — parallel; needed at activation, not at the gate
```

Post-launch, compressed: P4 → M2 (first capability slot, per the standing comparison) → M3
(evidence-gated) → M1 (graduated, per-system scoring) → P3 (explicit budget go). Preserve only:
in-app rendering of canon documents, any redesign, `ambientframe` as a brand.
