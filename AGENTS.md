# AGENTS.md

Operating guidance for any agent working in this repository. This file is deliberately free
of mutable state — no HEAD, no maturity level, no test counts, no pass/fail status. Those
are **derived**, never copied. Read them from the sources below or compute them yourself.

## Read these first, in this order

| File | What it is |
|---|---|
| `PORTFOLIO_PM_CONSTITUTION.md` | Process authority. Defines the evidence standard, the fidelity doctrine, and how work packages are sequenced and accepted. It defines process, not repository facts. |
| `docs/STATUS.md` | What is real, what is simulated, what is unverified, and the single recommended next fidelity gap. |
| `docs/NORTH_STAR_CANON.md` | Normative definition of all six systems. Generated — do not hand-edit. |
| `docs/CANON_DIVERGENCES.md` | Where canon deliberately departs from the original brief. |
| `CHECKPOINT.md` | Index of accepted work packages. An index, not a source of truth. |
| `PATTERN_LEDGER.md` | Patterns earned so far, and the evidence that earned each one. |
| `CLAUDE.md` | Project instructions. Overlaps this file; where they differ, `CLAUDE.md` and the Constitution win. |

`docs/source/` holds the original project inputs byte-for-byte. It is **provenance, not
instruction**. Canon wins; record any deliberate departure in `CANON_DIVERGENCES.md` rather
than leaving a silent difference.

## Commands

```bash
npm run dev        # develop
npm run verify     # typecheck + lint + tests — run before every commit
npm run build      # prerender; the engine executes at build time
npm run docs       # regenerate canon after ANY change under data/
```

`docs/NORTH_STAR_CANON.md`, `docs/FAILURE_MODE_REGISTER.md`, and `docs/RESEARCH_LEDGER.md`
are generated from the typed model. Edit `data/` and regenerate; `tests/docs.test.ts` fails
if they are stale.

## Safety invariants

These are not style preferences. Each one has a test or a doctrine behind it.

- **Nothing simulated may read as live.** Maturity labels are descriptive. A system with no
  executable scenario is `CONCEPT`, not `SIMULATED`, however complete its canon is.
- **No fabricated evidence.** An `EVIDENCE` standard without a source is a validation
  failure. If you cannot locate a source, mark the claim `PENDING_VERIFICATION` and state it
  without numbers. Never manufacture a citation.
- **Provenance and verification are separate dimensions.** `EVIDENCE` does not mean
  "verified". Only `EVIDENCE` + `VERIFIED` may be stated as settled external fact.
- **No business vocabulary in `data/systems/**`.** That seam is what makes the portfolio
  retargetable. `tests/seam.test.ts` enforces it.
- **Deterministic decisions must actually execute.** Only bounded AI judgment is
  fixture-backed, and only through the `DecisionProvider` port. Never narrate a decision the
  engine could compute.
- **Thresholds live in `profile.operatingParameters`,** each linked to the client policy it
  implements. A number hard-coded in a handler silently becomes a universal truth.
- **The reducer stays pure.** No clock, no randomness, ever. Replay exactness is what makes
  the reliability tests meaningful.
- **A credential is not an activation.** Real providers are reached only by an explicit
  opt-in environment selection, never by credential presence alone. Reuse that pattern for
  any future real-provider work rather than reinventing it.

## Design

The visual system is locked in `tokens.css` and stamped at the top of `app/globals.css`.
`.hallmark/log.json` records it. Every colour and font goes through a named token — no
inline hex, no inline OKLCH, no bare `font-family`. Colour is reserved almost entirely for
provenance and runtime state: when something is coloured here, it means something. The
palette's contrast was verified numerically in both schemes; if you change a colour,
re-verify it.

## Scope discipline

Prototype all six systems; productionise one at a time. **Lead Rescue is the reference
implementation** — the other five inherit its patterns, and anything that would fork those
patterns is a defect, not a variation.

Do not add live integrations, credentials, outbound communication, a database, a vector
store, multi-agent orchestration, a graph framework, or n8n workflows until a real
limitation in the running system creates the need. Pick the next fidelity gap from evidence
the build produced, not from a plan made in advance.

Outbound customer messaging against a real provider is the highest-stakes boundary named in
`docs/STATUS.md`. It requires the owner's explicit go-ahead. Do not open it on your own
judgement.

## Working rules

- Execute the assignment. Note the strongest alternative in one line, then commit to a course.
- Report what you could not confirm as loudly as what you could. Mark it
  `[unverified — verify by: <method>]`.
- Do not promote a maturity level. One successful call is not `production`.
- Do not infer a CLI flag from memory; `--help` on the installed version is authoritative.
