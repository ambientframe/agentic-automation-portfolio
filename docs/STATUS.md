# Status

**As of 2026-08-21 · Call-to-Proposal Revenue Agent — a third, materially different problem
class proves the architecture, and finds its first real seam**

## Portfolio maturity

**INTERACTIVE PROTOTYPE** — the application runs, all six systems are open and inspectable,
and three of them execute real operating logic: Lead Rescue against five scenarios, Dormant
Pipeline Recovery against two, and Call-to-Proposal Revenue Agent against two, plus one
smaller executable path exercising a third declared transition pair.

| # | System | Maturity | Runs? |
| --- | --- | --- | --- |
| 1 | Lead Rescue | `SIMULATED` | Yes — 5 scenarios execute end to end |
| 2 | Dormant Pipeline Recovery | `SIMULATED` | Yes — 2 scenarios execute end to end |
| 3 | Call-to-Proposal Revenue Agent | `SIMULATED` | Yes — 2 scenarios execute end to end |
| 4 | Client Onboarding Operator | `CONCEPT` | No |
| 5 | Receivables / Invoice Recovery Agent | `CONCEPT` | No |
| 6 | Owner Revenue Intelligence Agent | `CONCEPT` | No |

Systems 4–6 hold complete, schema-validated canon but no executable scenario, per the same
rule recorded in [CANON_DIVERGENCES.md §1](CANON_DIVERGENCES.md).

**This pass stresses a materially different problem class from the first two systems.**
Lead Rescue and Dormant Pipeline Recovery both move a business record through a lifecycle
under deterministic gates and one closed-set bounded judgment. Call-to-Proposal is not that
shape: its bounded judgment produces many structured, cited facts from a free-text
conversation in one pass, and the central risk is not "did we act too early" but "did we
let the system assert something nobody said." The question this pass actually tests is
whether the portfolio's truth model — evidence, policy, derivation, human authority — holds
up against an artifact-generation workflow, not just an action-gating one.

## What is REAL

Real in the sense of *actually executing code*, not *connected to the outside world*.
Nothing here touches a network.

Everything already true of Lead Rescue and Dormant Pipeline Recovery — the lifecycle state
machine, the idempotency ledger, the event ledger, the authority gate, the policy gate,
deterministic decisions, schema validation of all canon, profile consistency — is unchanged
and still holds, and now also holds for Call-to-Proposal, running through the same reducer
and the same two-phase runner.

New this pass:

- **A genuine claim-admission gate.** Every claim destined for a proposal is classified by
  where it came from — a cited transcript passage, an approved seller term, a deterministic
  derivation, or a person's recorded answer — and `admitClaim()` refuses anything that fails
  its class's requirement: a transcript claim with no citation, a seller term that does not
  resolve to a real catalog entry, a derived fact missing its inputs or its rule. This is
  not a checklist row; the `unsupported-scope-claim-blocked` scenario genuinely re-enters
  this function and is refused by it.
- **A genuine derived fact.** `timelineFeasible` is computed by comparing a buyer's own
  stated timing against a seller catalog entry's typical duration — real string parsing and
  a real numeric comparison over two already-admitted claims, not a narrated "yes."
- **A genuine proposal-artifact/approval-validity invariant.** `canDeliver()` checks that a
  recorded approval's `approvedVersion` still matches the artifact's current `version`.
  `reviseProposalArtifact()` deliberately does not carry a valid approval forward onto a new
  version. Tested directly as a pure-function behavioural test — not routed through a
  fabricated third scenario, since the declared lifecycle has no state representing
  "approved but still mutable," and inventing one to dramatise an already-provable invariant
  would have been complexity for its own sake.
- **A malformed evidence reference is refused at the port boundary.** `FixtureExtractionProvider`
  checks every returned citation against the segment ids the request actually supplied,
  independently of whatever the claim-admission gate later does with a *present but empty*
  citation list. The two failure modes are genuinely different and are tested separately.
- **A small deterministic prohibited-language screen.** Any claim value containing a
  small set of commitment phrases ("guarantee," "certified by," …) is refused regardless of
  source or citation, citing `kestrel-attestation-language` directly. Cheap, and it closes
  `cp-fm-policy-violation` with a real test rather than leaving it declared-only.

## What is SIMULATED

Unchanged in kind from the first two systems:

- **Every side effect.** The one proposal despatch in the approved-path scenario is
  `executionMode: 'SIMULATED'`.
- **The bounded extraction.** Replayed from an authored fixture through
  `FixtureExtractionProvider`. **No model is called.**
- **The business.** Bramwell Data, Larkspur Robotics, and every other detail are invented,
  consistent with Kestrel Compliance Group's existing fixture economics — the two discovery
  calls use Kestrel's already-declared SOC 2 Type I / Type II / questionnaire-sprint service
  lines and their already-declared typical values and durations.
- **All timestamps.** Authored in fixtures. The engine never reads a clock.

## Architecture reuse: what worked without changes

- **The Kestrel profile — zero changes.** Every parameter this system needed —
  `confidenceFloor`, `proposalAuthorityCeiling`, the service-line catalog as the approved
  rate card, role authority ceilings — was already declared, in `proposalAuthorityCeiling`'s
  case specifically anticipating this system during Lead Rescue's original design pass.
  Confirmed by actually building the handler against it, not assumed in advance.
- **`lib/model/system.ts`, `lib/model/profile.ts`, `lib/model/provenance.ts` — zero schema
  changes.** The Call-to-Proposal system definition authored during the earlier design pass
  needed no new fields; only `maturity`, `fidelityNote`, four `failureModes[].verificationTest`
  entries, and two new `standards` entries changed.
- **`EngineState.facts` (`Record<string, string>`) — genuinely reusable, unmodified.** The
  structured commercial record, the claim list, and the proposal artifact are each carried
  as one JSON-serialised fact rather than forcing the shared state shape wider for a form
  only this system needs. This is the deliberate small-change choice; see "What did not
  generalize" for why widening `EngineState` itself was rejected.
- **`DecisionProvider` — genuinely not used by this system, and that is a finding, not a
  gap.** Call-to-Proposal's canon lists `BOUNDED_AI_JUDGMENT` only for the extraction
  transition; there is no closed-set classification anywhere in its declared lifecycle.
- **The `Simulator` and badge components — zero changes.** The claim-admission decision
  panel, showing every claim's source, citation, and the one refused field by name, renders
  through the existing generic `deterministicFacts` / `evidenceRefs` rendering. The
  provenance chain the brief asked to be inspectable (source conversation → commercial fact
  → scope/term → proposal claim) is visible on the existing dossier and simulator pages with
  no new UI component.
- **`app/page.tsx`, `app/systems/[slug]/page.tsx`, `lib/engine/registry.ts`'s consumers —
  zero changes beyond the registry entry itself.** Adding the system, its handlers, its
  profile, and its scenarios to `RUNNABLE_SYSTEMS` was sufficient for the portfolio index,
  the dossier, and the simulator to pick it up.

## What did not generalize, and the one place the engine core genuinely grew

Unlike the Dormant Pipeline Recovery pass — which needed zero lines changed in
`lib/engine/reducer.ts`, `run.ts`, or `types.ts` — this system's bounded judgment does not
fit `DecisionProvider`'s contract. A single `classification: string` cannot honestly carry
many structured, independently-cited fields; forcing it through would mean smuggling
structured data through a field designed to carry a label, which is exactly the kind of
seam this portfolio exists to keep honest rather than paper over.

The fix is a second, symmetric port — `lib/ports/extraction-provider.ts` — and the smallest
plumbing to resolve it in the same pre-pass phase `DecisionProvider` already uses:

- `lib/engine/types.ts`: **+8 lines.** `HandlerContext` gained one new field,
  `extractions: ReadonlyMap<string, ResolvedExtraction>`.
- `lib/engine/reducer.ts`: **+6 lines.** `applyEvent` threads an optional `extractions` map
  through to the handler call, defaulting to an empty map exactly like `executionOutcomes`
  already does.
- `lib/engine/run.ts`: **+76 lines**, almost all of it the new `resolveExtractions()` phase
  and its payload schema — genuinely new code, but additive and optional, following the
  exact shape `resolveExecutionAttempts()` already established for `SideEffectExecutor`.

**124 lines added, 3 removed, across the entire shared engine surface, and every one of
those three removed lines was a single call-site line replaced by a multi-line one, not a
behavioural change.** Lead Rescue's and Dormant Pipeline Recovery's own tests were re-run
unmodified against every one of these files and all 203 of them still pass unchanged — the
addition is provably optional, not merely claimed to be. This is the actual falsification
result: the engine core is not perfectly system-agnostic in its *port* surface — a second
judgment shape needed a second port — but it *is* agnostic in a stronger sense than that
sounds, because accommodating the second port cost a bounded, additive, zero-regression
change to three files rather than a rewrite of any of them. "Small shared execution kernel
plus domain-specific operating logic" held; it just turned out the kernel's port surface,
not only its reducer, had a boundary worth finding.

Everything else stayed exactly as domain-specific as Lead Rescue's and Dormant Pipeline
Recovery's own handlers:

- **The commercial-truth model (`Claim`, `ClaimSource`, `admitClaim`, `ProposalArtifact`) is
  entirely local to `lib/engine/handlers/call-to-proposal.ts`.** Not lifted into
  `lib/model/runtime.ts`, deliberately. Nothing about buyer facts, seller terms, or claim
  admission is a Lead-Rescue- or Dormant-Pipeline-Recovery-shaped concept; making it shared
  now would be designing for a fourth system that does not exist yet.
- **`readJudgmentId`-style duplication continues.** Payload schemas, state-name string
  literals, and idempotency-key conventions are Call-to-Proposal-specific, matching the
  existing two handlers' own choice to stay dependency-light on engine orchestration.
- **The revision cycle (`cp-t13`/`cp-t15`) and the approval-timeout edge (`cp-t08`) remain
  declared but unexercised**, the same kind of honestly-scoped gap Dormant Pipeline
  Recovery's cadence-retry loop left behind. See "Known fidelity gaps."

## Verification

```
npm run verify     # typecheck + lint + 240 tests
npm run build      # 19 pages prerender; the engine executes at build time
npm run docs       # regenerate canon from the model
```

All passing. Visual inspection performed at desktop and mobile widths, in both colour
schemes, on the portfolio index, the Call-to-Proposal dossier, and both new scenario pages;
no horizontal overflow, and every claim's source/citation renders through the existing
decision-panel component unchanged.

## Known fidelity gaps

1. **Three systems do not run.** Canon exists for Client Onboarding, Receivables, and Owner
   Revenue Intelligence; no scenario replays through the engine for any of them.
2. **Two Lead Rescue and three Dormant Pipeline Recovery failure classes remain modelled
   only**, unchanged by this pass.
3. **Two Call-to-Proposal transitions are declared but unexercised**: the revision cycle
   (`cp-t13` reviewer-requested-revision → `cp-t15` revision-applied → `DRAFT_PREPARED`) has
   no `proposal.revision.applied` event handler yet, and the clarification-window timeout
   (`cp-t08`) has no event driving it. Both would need a small addition to the existing
   handler, not a redesign — the transitions and their guards are already declared and
   already schema-valid.
4. **The scope-derivation rule is singular.** `deriveTimelineFeasibility()` is the one
   DERIVED-fact computation this pass built. A real system would need several such rules;
   this pass proves the pattern (claims in, a named rule, a claim out, subject to the same
   admission gate as everything else) rather than building a rule library.
5. **No reliability/evidence view.** Unchanged from the prior two passes.
6. **The simulator steps a completed run**, not a true step-execute, for all three systems.
7. **No persistence.** Unchanged; still why none of the three running systems is close to
   `PARTIALLY_LIVE`.

## Single recommended next fidelity gap

Three comparable options, now with a third data point on how the architecture behaves under
load:

**Close the revision-cycle gap in Call-to-Proposal** (a `proposal.revision.applied` event
plus its handler, exercising `cp-t13`/`cp-t15` and giving the approval-validity invariant a
scenario-level demonstration rather than only a pure-function one), **widen to a fourth
system's first scenario**, or **deepen Dormant Pipeline Recovery's still-open cadence-retry
loop**, which has been the recommended-but-deferred option for two passes running.

Widening to a fourth system has the strongest argument this time: three systems across two
materially different problem shapes (lifecycle-gating and artifact-generation) is a more
persuasive portfolio claim than a third pass deepening problem shapes already proven twice
each. It would also be the first test of whether Client Onboarding's idempotent-provisioning
problem (a third shape again — "create infrastructure exactly once," not "gate an action" or
"admit a claim") finds a third seam in the port surface, or confirms the current two-port
shape is actually sufficient for the whole portfolio.

**Do not begin real n8n implementation yet.** The next fidelity gap should continue to be
selected from evidence the build produces, not assumed in advance.
