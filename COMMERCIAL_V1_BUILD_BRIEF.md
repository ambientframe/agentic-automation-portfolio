# Commercial V1 build brief — for the builder

**Read first, in order:** `COMMERCIAL_THESIS.md` → `COMMERCIAL_COMPLETION_PATCH.md` →
`CLAUDE.md`/`AGENTS.md` → `CHECKPOINT.md` (Current). This brief adds execution scope, acceptance
conditions, and authority boundaries. Strategy questions are settled in the patch; do not reopen
them, and do not re-derive go-to-market from first principles — that failure mode is why the
thesis exists.

**Mission:** four packages — CP1, CP2, D1, and opportunistic P2 — taking the artifact from
engineering-complete to gate-ready. Sequencing is yours except where a dependency is stated.
High agency inside the boundaries; the boundaries are hard.

## Authority boundaries

1. **Outward-facing copy ships as DRAFT.** It lives in the repo but does not render as final
   until the operator approves it. Deliver the full list of outward copy for approval in one
   batch per package.
2. **Reserved values render from one declaration module.** Public name, fee, contact, domain
   are CD1 decisions. Mirror the `lib/config/source-provenance.ts` pattern: a single declaration
   point, drift-guarded by tests. Until CD1 lands the module carries explicit placeholders and
   the UI renders a visible unset state — never an invented value, never a silent default.
3. **No capability work.** No new scenarios, no engine changes, no new validators or mutations
   except gates for your own new code. When implementation exposes an adjacent opportunity,
   record it in your checkpoint notes and keep moving — pursue it only if it invalidates a
   claim, breaks the gate, or changes the binding constraint.
4. **CP2b is gated on the real evidence bundle.** The log's sections 3–5 are composed only from
   `docs/evidence/o1/`. Do not draft session content — not even placeholder prose that could be
   mistaken for evidence. Structural scaffolding must announce itself as awaiting evidence.
5. **Truth machinery is inherited untouched:** simulation banner, maturity labels, fidelity
   ledger, fictional-business labels. Every commercial sentence carries a link into the proof
   layer or a label. Reserved slots, never mocks, on anything that deploys (patch §3).

## CP1 — commercial surfaces `[launch blocker]`

- **Front door rework:** business-first top per patch §4 — problem, author strip, honesty
  inversion, two routes ("I run a firm" / "I evaluate systems") — with the current homepage
  content retained below as the evaluator layer.
- **Engagement page:** the Revenue Leak Audit exactly per patch §2 — all eight concreteness
  elements, the not-claimed list, the after-email process, the permission-based publication
  statement (direction in patch §2; final copy is DRAFT for approval).
- **Author strip + colophon contact;** maturity legend in plain language on the surfaces that
  show maturity labels.
- **Acceptance:** gate conditions 2, 3, and 7 are testable against the built surfaces (with
  placeholders, "testable" means the structure is present and the unset state is explicit);
  every commercial claim resolves to a linked artifact or carries its label; drift guards on the
  declaration module pass and survive a mutation pass on the module itself.

## CP2 — operator's log skeleton + capture apparatus `[launch blocker]`

- **The log page** at a stable route, sections per patch §5. Sections 3–5 render an explicit
  awaiting-evidence state. `OPERATING`/`CONTROL` provenance labels exist in the rendering
  vocabulary alongside the existing provenance set.
- **Capture apparatus:** every "capture X" step in `docs/O1_OPERATOR_RUNBOOK.md` must have a
  working mechanism — journal and store records preservable into `docs/evidence/o1/` and citable
  from the log; screenshots have a home and a naming home; the runbook's `[apparatus: CP2]`
  markers get amended with the actual mechanics. Amend mechanics only; the protocol itself is
  pre-registered and is not yours to change.
- **Acceptance:** a dry run of the runbook's capture steps (not the session — the machinery)
  produces citable artifacts end to end, and the dry-run artifacts are then deleted, not left to
  be mistaken for evidence.

## D1 — recorded design/access pass `[launch blocker, small]`

Keyboard, focus, contrast, and responsive verification across all surfaces including the new
ones; evidence of the pass recorded in the repo (this closes the audit's long-open
`[unverified]` on the visual dimension). **Acceptance:** gate condition 6 is checkable from
recorded artifacts alone.

## P2 — declared-gates consultation test `[pre-launch, non-hostage]`

As previously specified: a test that every declared `gatesAction` is consulted by some handler.
Small; slot it wherever convenient. It defends a truthfulness claim the site already makes; it
does not hold anything hostage.

## Working agreements

- `npm run verify` green before any commit lands, including your new tests.
- One checkpoint entry per accepted package, in `CHECKPOINT.md`'s existing voice.
- When CP1 and CP2 are done and O1/O2 evidence exists, build CP2b, then stop: RT1 (the cold
  read) and gate adjudication are dispatched by the operator and adjudicated by the PM — they
  are not yours.
