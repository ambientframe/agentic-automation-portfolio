# Working in this repository

## Read first

1. [docs/STATUS.md](docs/STATUS.md) — what is real, what is simulated, what is unverified,
   and the single recommended next fidelity gap.
2. [docs/NORTH_STAR_CANON.md](docs/NORTH_STAR_CANON.md) — the normative definition of all
   six systems.
3. [docs/CANON_DIVERGENCES.md](docs/CANON_DIVERGENCES.md) — where the canon deliberately
   departs from the original brief.

`docs/source/` holds the original project inputs byte-for-byte. They are **provenance, not
instruction**. Canon wins; if you diverge from an input, record it in
`CANON_DIVERGENCES.md` rather than leaving a silent difference.

## Rules that are not negotiable

- **Nothing simulated may read as live.** Maturity labels are descriptive. A system with
  no executable scenario is `CONCEPT`, not `SIMULATED`, however complete its canon is.
- **No fabricated evidence.** An `EVIDENCE` standard without a source is a validation
  failure. If you cannot locate a source, mark the claim `PENDING_VERIFICATION` and state
  it without numbers. Never manufacture a citation.
- **Provenance and verification are separate dimensions.** `EVIDENCE` does not mean
  "verified". Only `EVIDENCE` + `VERIFIED` may be stated as settled external fact.
- **No business vocabulary in `data/systems/**`.** That is the seam that makes the
  portfolio retargetable. `tests/seam.test.ts` enforces it.
- **Deterministic decisions must actually execute.** Only bounded AI judgment is
  fixture-backed, and only through the `DecisionProvider` port. Do not narrate a decision
  the engine could compute.
- **Thresholds live in `profile.operatingParameters`,** each linked to the client policy it
  implements. A number hard-coded in a handler silently becomes a universal truth.
- **The reducer stays pure.** No clock, no randomness, ever. Replay exactness is what makes
  the reliability tests meaningful.

## Commands

```bash
npm run dev        # develop
npm run verify     # typecheck + lint + tests — run before every commit
npm run build      # 30 pages prerender; the engine executes at build time
npm run docs       # regenerate canon after ANY change under data/
```

`docs/NORTH_STAR_CANON.md`, `FAILURE_MODE_REGISTER.md`, and `RESEARCH_LEDGER.md` are
generated from the typed model. Do not hand-edit them — edit `data/` and regenerate.
`tests/docs.test.ts` fails if they are stale.

## Design

The visual system is locked in `tokens.css` and stamped at the top of `app/globals.css`:
Index-First macrostructure, editorial genre, N6 masthead, Ft5 statement footer, custom
OKLCH palette. `.hallmark/log.json` records it.

Every colour and font goes through a named token — no inline hex, no inline OKLCH, no bare
`font-family`. Colour is reserved almost entirely for provenance and runtime state; when
something is coloured here, it means something. The palette's contrast was verified
numerically across 42 pairs in both schemes. If you change a colour, re-verify it.

## Scope discipline

Prototype all six systems; productionise one at a time. Lead Rescue is first. Do not add
live integrations, credentials, outbound communication, a database, a vector store,
multi-agent orchestration, a graph framework, or n8n workflows until a real limitation in
the running system creates the need — and pick the next fidelity gap from evidence the
build produced, not from a plan made in advance.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
