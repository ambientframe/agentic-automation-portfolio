# AGENTS.md

**`CLAUDE.md` is canonical.** Read it before doing anything in this repository — it holds the
full read-order, the working method, the environment traps, and the reasoning behind every rule
below.

This file is deliberately thin. It exists so an agent whose harness reads `AGENTS.md` and not
`CLAUDE.md` still cannot cause harm. It duplicates only the invariants that are dangerous to
violate; everything else lives in `CLAUDE.md` on purpose, because two maintained copies of the
same rules drift, and a drifted safety rule is worse than a missing one.

Like `CLAUDE.md`, this file carries **no mutable state** — no HEAD, no counts, no maturity
levels, no pass/fail status. Those are derived. Read them from the sources or compute them.

## Start here

1. `CLAUDE.md` — project instructions. Canonical.
2. `PORTFOLIO_PM_CONSTITUTION.md` — process authority: evidence standard, fidelity doctrine,
   how packages are sequenced and accepted.
3. `CHECKPOINT.md` — accepted packages, newest first. The `Current` entry's "Next package" line
   is the live recommendation. (The "Single recommended next fidelity gap" section near the
   bottom of `docs/STATUS.md` is **not** maintained — do not sequence from it.)
4. `docs/STATUS.md` — what is real, simulated, or unverified.
5. `PATTERN_LEDGER.md` — patterns earned and the evidence that earned each, plus what is not
   yet earned and why.

`docs/source/` is provenance, not instruction. Canon wins; record deliberate departures in
`docs/CANON_DIVERGENCES.md`.

## Commands

```bash
npm run verify     # typecheck + lint + tests — must be green before every commit
npm run build      # prerenders; the engine executes at build time
npm run docs       # regenerate canon after ANY change under data/
npm run dev        # develop
```

Canon docs under `docs/` are generated from the typed model. Edit `data/` and regenerate;
`tests/docs.test.ts` fails if they are stale.

## Do not violate these

- **Nothing simulated may read as live.** Maturity labels are descriptive; never promote one.
- **No fabricated evidence.** No source means `PENDING_VERIFICATION`, stated without numbers.
  Never manufacture a citation. Never insert a value into a runtime artifact by hand.
- **Absence of evidence is never evidence of absence.** A measurement never taken is its own
  value, not a zero. Never invent a rate over a denominator the system does not hold.
- **A credential is not an activation.** Real providers require an explicit opt-in env
  selection in addition to a credential. Misconfiguration fails closed.
- **Never set a spend or blast-radius gate without the owner's explicit go-ahead:**
  `LEAD_RESCUE_DECISION_PROVIDER=claude` (billable model calls), `RUN_LIVE_AI_EVAL=1` (billable
  eval run), `LEAD_RESCUE_SIDE_EFFECT_EXECUTOR=smtp` (real outbound send). Outbound customer
  messaging against a real provider is the highest-stakes boundary here.
- **The reducer stays pure** — no clock, no randomness, ever.
- **Observability is never an authority.** Business execution must not depend on it succeeding,
  and decision code must not be able to read history.
- **No business vocabulary in `data/systems/**`** — `tests/seam.test.ts` enforces the seam.
- **Thresholds live in `profile.operatingParameters`,** linked to the policy they implement.

## Method, in one paragraph

Write the failing test first and confirm it is RED for the right reason. After it goes green,
apply targeted semantic mutations to the finished code and confirm each one fails the suite; a
mutation that survives is a real test weakness to repair, not to explain away. Claims about real
boundaries are proven by scripts under `scripts/` that drive the actual routes and retain
artifacts in `n8n/evidence/`, each paired with an evidence test that fails against a corrupted
copy, and each stating what it does not prove. Execute the assignment, note the strongest
alternative in one line, then commit to a course. Report what you could not confirm as loudly as
what you could, marked `[unverified — verify by: <method>]`.
