# Status

**As of 2026-08-21 · Lead Rescue reliability closure (post-Phase-1)**

## Portfolio maturity

**INTERACTIVE PROTOTYPE** — the application runs, all six systems are open and inspectable,
and one of them executes real operating logic against five real scenarios, including two
that exercise reliability behaviour under adversity rather than the happy path.

| # | System | Maturity | Runs? |
| --- | --- | --- | --- |
| 1 | Lead Rescue | `SIMULATED` | Yes — 5 scenarios execute end to end |
| 2 | Dormant Pipeline Recovery | `CONCEPT` | No |
| 3 | Call-to-Proposal Revenue Agent | `CONCEPT` | No |
| 4 | Client Onboarding Operator | `CONCEPT` | No |
| 5 | Receivables / Invoice Recovery Agent | `CONCEPT` | No |
| 6 | Owner Revenue Intelligence Agent | `CONCEPT` | No |

Systems 2–6 hold complete, schema-validated canon but no executable scenario. They are
labelled `CONCEPT` rather than `SIMULATED` deliberately — see
[CANON_DIVERGENCES.md §1](CANON_DIVERGENCES.md).

**Lead Rescue's maturity does not advance in this pass, on purpose.** More code executing
is not the same claim as a live integration existing, and the maturity ladder tracks the
latter. `SIMULATED` remains the honest label until a real provider, a real model, or
durable state exists behind one of its ports. What changed is *which* of Lead Rescue's
simulated claims are now backed by executing logic rather than by narration — see below.

## What is REAL

Real in the sense of *actually executing code*, not *connected to the outside world*.
Nothing here touches a network.

- **The lifecycle state machine.** Transitions resolve against declared rules. An
  undeclared move is rejected and recorded; the state does not move.
- **The idempotency ledger.** Side effects claim a key before executing. A second claim is
  refused. The duplicate-delivery scenario genuinely re-enters the ledger.
- **The execution ledger.** *(New this pass.)* A side effect whose outcome came back
  uncertain cannot be retried by a later attempt on the same key unless an independent
  verification attempt proved non-execution, or the provider is known to honour the
  idempotency key. The uncertain-downstream-outcome scenario genuinely re-enters this
  ledger, and a naive retry with neither basis is refused by the core, not by the scenario
  script.
- **The event ledger.** Repeat deliveries of the same source event are recognised as
  repeats.
- **The authority gate.** Levels 0–1 never act externally, level 2 parks for approval,
  levels 3–4 may execute. Uniform, in the engine core, not bypassable by a handler.
- **The policy gate.** A closed gate blocks the effect before authority is even considered.
  The restricted-contact scenario computes a real candidate action and genuinely blocks
  it here — the block is `BLOCKED_BY_POLICY` on an actual proposed effect, not an
  omitted step.
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
- **Provider send/verify outcomes.** *(New this pass.)* Whether an acknowledgement
  succeeded, failed before effect, was rate-limited, or came back with no confirmation at
  all is replayed from authored fixtures through the `SideEffectExecutor` port. **No
  provider is called.** The port's contract — two methods, `attemptSend` and
  `attemptVerify`, four possible send outcomes — is what a live provider adapter would
  satisfy later without the engine core changing.
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

## Architecture introduced this pass

- **`SideEffectExecutor` port** (`lib/ports/side-effect-executor.ts`), a peer to
  `DecisionProvider`. `attemptSend` returns one of `SUCCEEDED` / `FAILED_BEFORE_EFFECT` /
  `RATE_LIMITED` / `OUTCOME_UNKNOWN`; `attemptVerify` is read-only and can only narrow an
  existing `OUTCOME_UNKNOWN` toward a definite answer, or leave it exactly as unresolved
  (`STILL_UNKNOWN`) — it can never itself cause a customer-facing effect.
- **`ExecutionLedger`** (`lib/engine/ledger.ts`), the single source of truth for retry
  safety. Additive: the pre-existing `SideEffectLedger` is untouched, and every side effect
  that doesn't opt into execution tracking runs the exact byte-identical path it always did.
- **`TechnicalExecution`**, a new optional field on `SideEffect`, deliberately kept separate
  from business lifecycle state. A lead can sit in `BOOKING_READY` while one of its side
  effects carries `OUTCOME_UNKNOWN` — the uncertainty lives on the side effect record, not
  on the state machine. Inspectable in the simulator via a collapsed drill-down, not
  surfaced on the default view.
- **`SUPPRESSION_REVIEW`**, a new Lead Rescue lifecycle state distinct from
  `DO_NOT_CONTACT` — an open question held for a person, not a closed one. Reached when a
  candidate action is computed and then blocked by the new
  `kestrel-restricted-contact-review` client policy, which routes every new inquiry from a
  consent-restricted contact to a person regardless of classification or confidence.

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
| Suppression / restricted-contact review | Yes | **Yes** *(was partial)* |
| Retry safety for uncertain outcomes | Yes | **Yes** *(new)* |
| Bounded retry budget | Modelled in canon | No |
| Downstream API failure and recovery | Yes, as retry safety | **Yes**, for the send-outcome case *(was no)* |
| Human approval timeout | Modelled in canon | No |
| Out-of-order events, malformed payload | Modelled in canon | No |

## Verification

```
npm run verify     # typecheck + lint + 180 tests
npm run build      # 15 pages prerender; the engine runs at build time
npm run docs       # regenerate canon from the model
```

All passing. Visual inspection performed at 1280×1400, 900×1400, and 375×812, in both
colour schemes; no horizontal overflow at any width. The `OUTCOME_UNKNOWN` badge and the
technical-execution drill-down were confirmed rendering with distinct, token-driven colour
in both themes.

## Known fidelity gaps

1. **Five systems do not run.** Canon exists; no scenario replays through the engine.
2. **Three Lead Rescue failure classes remain modelled only.** Malformed payload,
   out-of-order events at the business-entity level, and human approval timeout are still
   *"Pending — scenario not yet authored"* in the register. Suppression and the uncertain-
   outcome / downstream-failure case — the two this pass targeted — are now verified.
3. **No reliability/evidence view.** The brief's fourth view (§8) does not exist yet; its
   content is currently spread across the dossier.
4. **The simulator steps a completed run** rather than executing incrementally. Honest —
   and the page says so — but a true step-execute would be a fidelity gain.
5. **No persistence.** State lives for one request. Nothing exercises the durable-state
   concern that real deployment will introduce. This is also why "PARTIALLY LIVE" is not
   yet reachable for Lead Rescue even with the new ports: a live provider without durable
   state would lose the retry-safety ledger on every request.
6. **Two paywalled sources unread.** Recorded, not hidden.

## What would have to become real before Lead Rescue could legitimately move toward PARTIALLY LIVE

At least one of: a live send provider behind `SideEffectExecutor`, a live model behind
`DecisionProvider`, or durable state so the execution and idempotency ledgers survive
across requests. The ports exist and are proven correct against fixtures; none of the
three has a live implementation, and none is planned until a real limitation in the running
system creates the need.

## Single recommended next fidelity gap

**Author scenarios for the remaining three unexercised Lead Rescue failure classes
(malformed payload, out-of-order events, human approval timeout) before adding any new
system**, OR pick one of systems 2–6 and author its first scenario to raise it honestly
from `CONCEPT` to `SIMULATED`.

Both are legitimate next steps and roughly comparable in cost; which one matters more
depends on whether the goal is deepening Lead Rescue's proof of reliability further or
widening the portfolio's breadth. Deepening has slightly higher leverage right now: two
of five originally-Pending failure classes just converted to verified, which is a
faster rate of return than the portfolio has seen on any other kind of work, and the
remaining three are the same shape of gap — a claim in the register with no test behind it.

**Do not begin real n8n implementation yet.** The next fidelity gap should be selected
from evidence this build produces, not assumed in advance.
