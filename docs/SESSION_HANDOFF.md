# Session Handoff — 2026-08-28

> **SUPERSEDED — 2026-08-28.** Kept as a record of how that session handed off, not as
> live instruction. Its open blocker is closed and six packages have landed since; the
> `Current` entry in `CHECKPOINT.md` is authoritative. Two slugs it names were renamed
> because they carried real firms' names: `ledgerline` → `ashcombe`, `formwork` →
> `wrenfield`. Paths below referencing the old slugs no longer exist.

Paste this into a fresh session. It assumes no prior context.

---

## 0. Read these first, in this order

You are working in `~/code/agentic-automation-portfolio`. **A session started in `~/code` does
NOT auto-load this repo's `CLAUDE.md`** — open it deliberately, or you will reconstruct strategy
the repo already forbids.

1. `CLAUDE.md` — safety invariants, method, environment traps. Canonical.
2. `COMMERCIAL_THESIS.md` — why the artifact exists. **Read before proposing any commercial move; it rules several out.**
3. `PORTFOLIO_PM_CONSTITUTION.md` — evidence standard, fidelity doctrine.
4. `CHECKPOINT.md` — the `Current` entry is the live state and the next-package recommendation.
5. `PATTERN_LEDGER.md` — 30 earned patterns and what is *not* yet earned.

## 1. How Chris wants to be worked with

- **He has delegated authority. Decide and act; do not hand back menus.** He will say so if you
  over-ask. Recommend, state the reasoning in a line, proceed.
- He is not a seasoned developer and is leaning on delegated judgment. He scans rather than reads,
  so anything needing his action goes at the very top.
- AuDHD; this project is a deliberate push against a long procrastination streak. **Finish, verify,
  and land each layer before starting the next — never leave the repo mid-change.** Ambiguous state
  is the specific thing that ends his streaks.
- **He can sell.** Fine-dining sommelier background: diagnosing an unstated need, closing high-ticket
  decisions, ego-minimal by trade discipline. His condition is that he sells only what he has lived.
  Do not read his reluctance to do outreach as sales avoidance and try to coach around it — it is
  correct sequencing, and `COMMERCIAL_THESIS.md` §4a says so.
- Make claims checkable by him directly: a command he can run, a URL he can open.

## 2. The thesis, in one line

**Substitute inspectable work for reputation.** He hit the freelance catch-22 — no reviews, no
clients, no reviews — and the response is an artifact a stranger can verify rather than trust.
The published gaps are load-bearing, not modesty: an artifact claiming only success gives a
stranger no way to distinguish it from one that is lying. Never soften a limitation to strengthen
a pitch. Never propose cold outreach, lead-gen, persuasion collateral, or picking a vertical.

## 3. State as of handoff

`main` at `139216e`. Tree clean. `npm run verify`: 76 files, 1214 passed / 1 skipped, exit 0.
`npm run build`: compiled. $0 spent this session.

**Landed today (newest first):**

| Commit | What |
| --- | --- |
| `139216e` | formwork's post-commit corrections; records how three agent profiles got tracked |
| `e0d064c` | Gate fixes: entity decoding, PDF parsing, quote-keyed captures, derived seam ids, NUL hygiene |
| `65afd96` | Dispatch prompts v2 |
| `65076f5` | Kestrel retainers recalibrated: 33 × $3,200 → 20 × $5,000 |
| `67b5b0f` | Grounding capture gate — citations verified by re-fetch |
| `f877fd0` | Remote verification proven live against real n8n |

**Live n8n (his instance, `ambientframes.app.n8n.cloud`):** two active workflows
`1onJs9j9KaG07FXc` (Delivery Log) and `yLdQ6yKw7p1YlZUk` (Delivery Lookup), plus data table
`lead_rescue_deliveries` (`N1VlIimgaOC09etI`). `.env.local` holds both endpoints.
`LEAD_RESCUE_SIDE_EFFECT_EXECUTOR` is deliberately **not** set to `webhook`.

**Maturity is unchanged and must stay so.** Lead Rescue is `INTERACTIVE_PROTOTYPE`. The n8n
crossing is stronger integration/execution proof than anything previously retained; it is **not**
client-liveness. No customer exists.

## 4. THE OPEN BLOCKER — start here

Three agent-authored profiles are in the repo and **tracked but UNREGISTERED**, so they are not yet
evidence of anything:

- `data/profiles/stratum/profile.ts` — RevOps/CRM consultancy, 18 staff, $2.8M
- `data/profiles/ledgerline/profile.ts` — accounting/CAS firm, 22 staff, $3.75M
- `data/profiles/formwork/profile.ts` — architecture practice, 28 staff, $5.04M

All three independently verified: parse against `BusinessProfileSchema`, return `[]` from
`validateProfileConsistency`, declare exactly the 17 `PROFILE_ENGINE_CONTRACT` keys, no extras.

**What blocks registration:** each agent handed back a registration snippet containing its
`groundingSources` (7, 10, and 14 sources respectively). Those snippets reached us **only inside
PDF-converted markdown**, which split every `fi`/`fl` ligature (`profile` → `pro fi le`,
`verified` → `veri fi ed`) and collapsed line breaks into double spaces. **The grounding quotes in
them are therefore no longer verbatim and will fail capture** — through no fault of the agents.

The originals are in `~/Downloads`:
`cursor-formwork-pdf.md`, `markdown-files (7)/cursor-Stratum-pdf.md`,
`markdown-files (7)/Cursor-A2-ledgerline-pdf.md`.

**Two ways forward. Ask Chris which, or just do (b):**

**(a) Get the raw snippets.** Cheapest and cleanest. Ask him to re-export the three handbacks as
plain text/markdown rather than via PDF, or to have each Cursor agent write its snippet to
`data/profiles/<slug>/registration.snippet.ts` so it travels through git intact.

**(b) Reconstruct and let the gate adjudicate.** De-corrupt each quote (`fi ` → `fi`, `fl ` → `fl`,
collapse double spaces), put them in the register, and run `npx tsx scripts/capture-grounding.ts`.
The capture script re-fetches every URL and refuses to write unless the exact string is present, so
a correct repair is *proven* rather than assumed, and a wrong one fails loudly. **Never edit a
quote to make it pass** — report it. A partial scaffold exists at
`/private/tmp/claude-501/-Users-tophermichael-code/0093450f-.../scratchpad/repair.py`.

**Also fix the packet defect that caused this:** `docs/PROFILE_AUTHORING_PACKET.md` §8 asks agents
to hand back the snippet *in their report*. Reports travel lossily. It should ask them to write it
to a file in the repo.

## 5. The finding that matters most

**The citation gate caught a paraphrase presented as a quotation, on the first real batch.**

The formwork Stage A brief cited the Deltek Clarity study for:
> `The median win rate reported in this year's study is 50.0%.`

That sentence **does not exist in the document.** What it actually says, at offset 52,246 of
192,011 extracted characters, is *"The median win rate increased slightly in 2024, rising 0.9
percentage points to 50.0%."*

**The claim was true and the document supports it. The quote was fabricated.** The Stage B agent
did not edit it to pass — it dropped the citation and downgraded `closeRatePct` from "published
figure" to "a choice seated below a verified median," which is what the evidence actually supports.

That is the whole gate working end to end: quote demanded → paraphrase refused → agent reports
instead of fudging → dependent claim downgraded to match real evidence. Re-adding that source with
its *real* sentence is a register-owner decision, not a quote to swap in silently.

## 6. Judgment calls waiting at merge

1. **`ledgerline` name collision.** "Ledgerline" is a real accounting firm — two of them. The agent
   kept the slug but set the trading name to `Ashcombe CPAs & Advisors`. Correct per packet §11;
   the slug/name mismatch is a coordination call.
2. **`stratum` name unchecked.** The agent states plainly it never checked "Stratum Revenue Systems"
   against a company register. Check before a visitor sees it.
3. **AIA blocks automated retrieval.** Every `aia.org` page returns HTTP 403 (Varnish, blanket).
   That costs formwork the five Basic Services phase names and related vocabulary, so **vocabulary
   is the least-evidenced part of that profile** — the agent disclosed it rather than glossing.

## 7. Traps that cost real time this session

- **`git add -A` is wrong in this tree.** Sibling agents write here. `e0d064c` swept 1,884 lines of
  unreviewed agent work into main as a side effect. Stage `git add <path>` explicitly.
- **Raw NUL bytes make files invisible to `grep`/`sed`.** Two committed files had them. `grep` on a
  506-line file returned nothing and it was written off as flakiness — it was the corruption. Fixed,
  and `tests/source-hygiene.test.ts` now fails if one returns. If a tool goes silent on a file that
  plainly has content, that is a fact about the file.
- **`npm run verify` on a clean tree does NOT validate an unregistered profile.**
  `BusinessProfileSchema.parse` runs only on import, so an invalid profile typechecks and passes
  while sitting unregistered. Verification requires temporary registration.
- **`perl -0pi` with `\$` replacements introduced a NUL** into a source file. Prefer Python with
  exact string replacement for surgical edits.
- **Run Stage B agents sequentially or in separate worktrees.** Parallel runs in one checkout race
  on `.data/` and on `docs/evidence/grounding-captures.json`.

## 8. Open items after the blocker clears

1. **Register the three profiles** (§4), then re-run `capture-grounding.ts` and `npm run verify`.
2. **The fidelity ledger has no row for independent verification.** A capability proven live today
   is invisible on the buyer surface — the exact "built it, buyer can't see it" gap Chris opened the
   session complaining about. He has said twice he wants this taken.
3. **Kestrel's `explicitlyNot` / vocabulary** are still the least-grounded part of the reference
   profile.
4. The three profiles surfaced real model gaps worth reading in their handbacks — blocked-vs-overdue
   (a legally-gated action is not a late one), confidence floors that cannot express "never",
   client-side approvers with no home in `roles`, and pursuit cost with nowhere to live. These are
   genuine findings about the six systems, not complaints.

## 9. Method, non-negotiable

Write the failing test first and confirm it is RED for the right reason. After green, apply
targeted semantic mutations and confirm each fails; a survivor is a real test weakness. Restore
byte-for-byte and verify by hash. Land safely: branch, commit, re-check `main` has not moved (hash
it twice, seconds apart), `git merge --ff-only`, then verify and build again on `main`. Report what
you could not confirm as loudly as what you could, marked `[unverified — verify by: <method>]`.
