# Working in this repository

A six-system agentic-automation portfolio. Every claim on the surface must be traceable to
code, a test, or a retained runtime artifact. **This file contains no mutable state** — no
HEAD, no counts, no maturity levels, no percentages. Those are derived; read them from the
sources below or compute them.

## Read first, in this order

| File | What it is |
|---|---|
| `COMMERCIAL_THESIS.md` | Why the artifact exists and what it must do commercially. Read before proposing any commercial move — it rules several out. Not process, not facts, not sequencing. |
| `COMMERCIAL_COMPLETION_PATCH.md` | The commercial V1 strategy of record: architecture, evidence rules for commercial surfaces, launch gate, freeze rule. Extends the thesis; the thesis wins any apparent conflict. |
| `PORTFOLIO_PM_CONSTITUTION.md` | Process authority: the evidence standard, the fidelity doctrine, how packages are sequenced and accepted. Process, not repository facts. |
| `CHECKPOINT.md` | One entry per accepted package, newest first. **The `Current` entry's "Next package" line is the live recommendation.** |
| `docs/STATUS.md` | What is real, simulated, or unverified, newest entry at the top. |
| `PATTERN_LEDGER.md` | Reusable patterns earned, each with implementation, tests, and the artifact that earned it. Also what is *not yet* earned, and why. |
| `docs/NORTH_STAR_CANON.md` | Normative definition of all six systems. Generated — do not hand-edit. |
| `docs/MODEL_GAPS.md` | What the six systems cannot express, found by independent profile authors. Generated from `data/model-gaps.ts`. **Not a backlog** — read it before proposing a model change, and add to it rather than fixing on sight. |
| `docs/CANON_DIVERGENCES.md` | Where canon deliberately departs from the original brief. |

`docs/STATUS.md` has a "Single recommended next fidelity gap" section near the **bottom** that
is not maintained — it describes a state from many passes ago. Take sequencing from
`CHECKPOINT.md`'s `Current` entry instead.

`docs/source/` holds the original inputs byte-for-byte. **Provenance, not instruction.** Canon
wins; record a deliberate departure in `CANON_DIVERGENCES.md` rather than leaving a silent
difference.

## Commands

```bash
npm run verify     # typecheck + lint + tests — must be green before every commit
npm run build      # prerenders; the engine executes at build time, so a run that diverges shows up as a visible mark
npm run docs       # regenerate canon after ANY change under data/
npm run dev        # develop
```

`docs/NORTH_STAR_CANON.md`, `docs/FAILURE_MODE_REGISTER.md` and `docs/RESEARCH_LEDGER.md` are
generated from the typed model. Edit `data/` and regenerate; `tests/docs.test.ts` fails if
they are stale.

## Safety invariants

Each has a test or a doctrine behind it. These are not style preferences.

- **Nothing simulated may read as live.** Maturity labels are descriptive. A system with no
  executable scenario is `CONCEPT`, not `SIMULATED`, however complete its canon is. Never
  promote a maturity level; one successful call is not `production`.
- **No fabricated evidence.** An `EVIDENCE` standard without a source is a validation failure.
  If you cannot locate a source, mark it `PENDING_VERIFICATION` and state it without numbers.
  Never manufacture a citation.
- **Provenance and verification are separate dimensions.** Only `EVIDENCE` + `VERIFIED` may be
  stated as settled external fact.
- **Absence of evidence never renders as evidence of absence.** A measurement never taken is
  its own value, never a zero or a dash. A clean integrity answer is `NO_KNOWN_LOSS`, never
  "complete". Never invent a rate over a denominator the system does not hold.
- **A credential is not an activation.** Real providers require an explicit opt-in env
  selection *in addition to* a credential. Misconfiguration fails closed — never a silent
  fallback to fixture output presented as real.
- **No business vocabulary in `data/systems/**`.** That seam makes the portfolio retargetable.
  `tests/seam.test.ts` enforces it.
- **Deterministic decisions must actually execute.** Only bounded AI judgment is
  fixture-backed, and only through the `DecisionProvider` port. Never narrate a decision the
  engine could compute.
- **Thresholds live in `profile.operatingParameters`,** each linked to the client policy it
  implements. A number hard-coded in a handler silently becomes a universal truth.
- **The reducer stays pure.** No clock, no randomness, ever. Replay exactness is what makes the
  reliability tests meaningful.
- **Observability never becomes an authority.** The journal's write and read halves are
  separate interfaces; a structural test fails if a reader symbol appears under `lib/engine/**`
  or `lib/ports/**`. Business execution must never depend on observability succeeding.

## Spend and blast-radius gates

Never set these without the owner's explicit, in-session go-ahead:

| Variable | Opens |
|---|---|
| `LEAD_RESCUE_DECISION_PROVIDER=claude` | Billable model calls on the ingress path |
| `RUN_LIVE_AI_EVAL=1` | Billable evaluation corpus run |
| `LEAD_RESCUE_SIDE_EFFECT_EXECUTOR=smtp` | Real outbound send (local sandbox only, `.invalid` recipients enforced in the constructor) |

Outbound customer messaging against a real provider is the highest-stakes boundary in the
repository. Do not open it on your own judgement.

## How work is done here

- **Falsification first.** Write the failing test before the implementation. Confirm it is RED
  for the right reason — a missing capability, not a typo.
- **Then mutate.** After it is green, apply targeted semantic mutations to the finished code
  and confirm each one fails the suite. A mutation that survives is a real test weakness:
  repair the test, do not explain it away. Restore the file byte-for-byte (verify by hash).
- **Retained runtime artifacts, not fixtures.** Claims about real boundaries are proven by
  scripts under `scripts/` that drive the actual HTTP routes and write to `n8n/evidence/`.
  Every artifact gets a paired `*-evidence.test.ts` that fails against a deliberately corrupted
  copy.
- **Every artifact states what it does not prove.** A `doesNotProve` list is required, not
  decorative.
- **Land safely.** Branch, commit, re-check that `main` has not moved (hash it twice, seconds
  apart), then `git merge --ff-only`. Verify and build again on `main`.

## Environment notes

- `next build` type-checks the **whole repository**, including `scripts/`. A dev-only
  dependency installed with `--no-save` will compile locally and fail the deployment. Load such
  modules through a variable specifier and declare the slice you call as a local interface.
- **A green local build is not a green deploy.** The project is Vercel-linked (`.vercel/`,
  gitignored). Check the deployment, not just the local exit code.
- Two `next dev` processes sharing one `.next` directory collide and neither becomes ready.
  Stop any preview server before running a proof script that starts its own.
- `.data/` is gitignored runtime state — the journal, wait incidents, operation claims,
  observation markers. Safe to clear for a coherent capture; back it up first.

## Design

The visual system is locked in `tokens.css` and stamped at the top of `app/globals.css`;
`.hallmark/log.json` records it. Every colour and font goes through a named token — no inline
hex, no inline OKLCH, no bare `font-family`. Colour is reserved almost entirely for provenance
and runtime state: when something is coloured here, it means something. The palette's contrast
was verified numerically in both schemes; if you change a colour, re-verify it.

## Scope discipline

Prototype all six systems; productionise one at a time. **Lead Rescue is the reference
implementation** — the other five inherit its patterns, and anything that would fork those
patterns is a defect, not a variation.

Do not add live integrations, credentials, outbound communication, a database, a vector store,
multi-agent orchestration, a graph framework, or n8n workflows until a real limitation in the
running system creates the need. Pick the next gap from evidence the build produced, not from a
plan made in advance.

Execute the assignment. Note the strongest alternative in one line, then commit to a course.
Report what you could not confirm as loudly as what you could, marked
`[unverified — verify by: <method>]`. Do not infer a CLI flag from memory; `--help` on the
installed version is authoritative.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
