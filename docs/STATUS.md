# Status

**As of 2026-08-21 · Phase 1 checkpoint (canon + engine + minimal shell)**

## Portfolio maturity

**INTERACTIVE PROTOTYPE** — the application runs, all six systems are open and inspectable,
and one of them executes real operating logic against real scenarios.

| # | System | Maturity | Runs? |
| --- | --- | --- | --- |
| 1 | Lead Rescue | `SIMULATED` | Yes — 3 scenarios execute end to end |
| 2 | Dormant Pipeline Recovery | `CONCEPT` | No |
| 3 | Call-to-Proposal Revenue Agent | `CONCEPT` | No |
| 4 | Client Onboarding Operator | `CONCEPT` | No |
| 5 | Receivables / Invoice Recovery Agent | `CONCEPT` | No |
| 6 | Owner Revenue Intelligence Agent | `CONCEPT` | No |

Systems 2–6 hold complete, schema-validated canon but no executable scenario. They are
labelled `CONCEPT` rather than `SIMULATED` deliberately — see
[CANON_DIVERGENCES.md §1](CANON_DIVERGENCES.md).

## What is REAL

Real in the sense of *actually executing code*, not *connected to the outside world*.
Nothing here touches a network.

- **The lifecycle state machine.** Transitions resolve against declared rules. An
  undeclared move is rejected and recorded; the state does not move.
- **The idempotency ledger.** Side effects claim a key before executing. A second claim is
  refused. The duplicate-delivery scenario genuinely re-enters the ledger.
- **The event ledger.** Repeat deliveries of the same source event are recognised as
  repeats.
- **The authority gate.** Levels 0–1 never act externally, level 2 parks for approval,
  levels 3–4 may execute. Uniform, in the engine core, not bypassable by a handler.
- **The policy gate.** A closed gate blocks the effect before authority is even considered.
- **Deterministic decisions.** Schema validation, normalisation, identity resolution,
  consent screening, confidence-floor comparison, missing-field computation, disposition
  mapping, and retry accounting all compute from state, event, and policy.
- **Schema validation of all canon.** An uncited `EVIDENCE` claim is a parse failure, not a
  style problem.
- **Profile consistency.** Revenue, funnel, headcount, and engagement values reconcile
  against each other or the test suite fails.

## What is SIMULATED

- **Every side effect.** Nothing left this process. No message, record write, notification,
  or resource creation occurred anywhere.
- **Bounded AI judgments.** Free-text interpretation is replayed from authored fixtures
  through the `DecisionProvider` port. **No model is called.**
- **The business.** Kestrel Compliance Group, its clients, staff, figures, and every
  incident are invented and carry `FIXTURE` provenance.
- **All timestamps.** Authored in fixtures. The engine never reads a clock, which is what
  makes replay exact.

## What is an UNVERIFIED ASSUMPTION

- Two evidence claims sit at `PENDING_VERIFICATION`: the HBR 2011 response-time statistics
  (paywalled, not read) and the ISO 8000 / DAMA-DMBOK data-quality dimensions (paywalled,
  not read). Both are stated without numbers, and no design decision depends on a threshold
  from either.
- One claim sits at `DISPUTED_OR_WEAK`: the lead-response-latency evidence. See
  [CANON_DIVERGENCES.md §2](CANON_DIVERGENCES.md).
- The Kestrel profile is internally coherent but is not modelled on any real firm. Its
  ratios are plausible, not researched.

## Architecture introduced

- **Two seams.** `data/systems/**` (vertical-agnostic structure) is separated from
  `data/profiles/**` (business values and narrative); `CanonicalEvent` separates adapters
  from the engine. The first seam is enforced by a source scan in `tests/seam.test.ts`.
- **Pure synchronous reducer.** No clock, no randomness. Replay is byte-identical.
- **Two-phase execution.** Async judgment resolution at the edge, pure fold in the middle,
  so the port can be honest about being async while the state machine stays deterministic.
- **`DecisionProvider` port.** One contract, one fixture-backed implementation. The
  contract validates model output against a closed permitted set — the part that must
  survive when a live provider replaces it.
- **Provenance × verification as independent dimensions**, enforced by schema refinement.
- **Operating parameters** linking every engine threshold to the client policy it
  implements, so no threshold can silently become a universal truth.
- **Generated canon.** `docs/NORTH_STAR_CANON.md`, `FAILURE_MODE_REGISTER.md`, and
  `RESEARCH_LEDGER.md` are rendered from the typed model; a test fails if they go stale.

## Reliability mechanisms represented

| Mechanism | Represented | Executes |
| --- | --- | --- |
| At-least-once delivery / duplicate suppression | Yes | Yes |
| Transition legality | Yes | Yes |
| Authority ladder | Yes | Yes |
| Policy gate | Yes | Yes |
| Confidence floor → human review | Yes | Yes |
| Missing information carried, never invented | Yes | Yes |
| Post-action verification records | Yes | Yes |
| Bounded retry budget | Modelled in canon | No |
| Suppression / opt-out enforcement | Modelled + partial execution | Partial |
| Downstream API failure and recovery | Modelled in canon | No |
| Human approval timeout | Modelled in canon | No |

## Verification

```
npm run verify     # typecheck + lint + 140 tests
npm run build      # 13 pages prerender; the engine runs at build time
npm run docs       # regenerate canon from the model
```

All passing at this checkpoint. Visual inspection performed at 1280×1700 and 375×812 in
both colour schemes; no horizontal overflow at either width.

## Known fidelity gaps

1. **Five systems do not run.** Canon exists; no scenario replays through the engine.
2. **Lead Rescue's failure paths are mostly unexercised.** Malformed payload, suppression,
   downstream API failure, and approval timeout are all in the register with
   *"Pending — scenario not yet authored"* against them. That is honest, but a register
   entry with no test is a claim, not a capability.
3. **No reliability/evidence view.** The brief's fourth view (§8) does not exist yet; its
   content is currently spread across the dossier.
4. **The simulator steps a completed run** rather than executing incrementally. Honest —
   and the page says so — but a true step-execute would be a fidelity gain.
5. **No persistence.** State lives for one request. Nothing exercises the durable-state
   concern that real deployment will introduce.
6. **Two paywalled sources unread.** Recorded, not hidden.

## Single recommended next fidelity gap

**Author the two remaining Lead Rescue failure scenarios — suppression and downstream
failure — before adding any new system.**

The reasoning: gap 2 is the only one on this list that can currently make an existing
*claim* false. The register asserts that a suppressed contact is blocked and that a
downstream failure recovers into a named state; neither is tested, and both are guardrails
a buyer would specifically ask about. Every other gap is missing *breadth*, which is
visible and honest. This one is missing *proof of something already asserted*, which is
the only kind of gap that can quietly become a lie.

It is also cheap: both scenarios reuse the existing handler and engine, so the work is
fixture authoring plus tests, and it converts two "Pending" register rows into verified
ones.

Recommended order after that: one scenario for each of systems 2–6 to raise them honestly
to `SIMULATED`, then the reliability/evidence view, then durable state.

**Do not begin real n8n implementation yet.** The next fidelity gap should be selected
from evidence this build produces, not assumed in advance.
