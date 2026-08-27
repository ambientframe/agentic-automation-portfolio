# Agentic Automation Portfolio — Flight Simulator

Six small-business operating systems, modelled so that a visitor can watch a real business
incident move through state, decisions, policy, bounded AI judgment, human authority,
actions, verification, and recovery — and then open it up and check the wiring.

**Live: [agentic-automation-portfolio.vercel.app](https://agentic-automation-portfolio.vercel.app)**
— no install required.

**Start here: [`/lead-rescue`](https://agentic-automation-portfolio.vercel.app/lead-rescue).** It
is the reference implementation and the only one built to full depth. It answers a buyer's four questions in
the order they actually arrive: what expensive thing does this prevent, what happened to one
specific lead, what can an operator actually do, and which parts of this are real. That last
one is a capability-by-capability ledger that states its own limits — including the ones
that are still unproven.

## What is and is not real

Maturity is descriptive, never aspirational. Nothing here is live, deployed, or
customer-proven; every input is synthetic and the demonstration business is fictional.

| | |
| --- | --- |
| Lead Rescue | `INTERACTIVE_PROTOTYPE` — 8 scenarios, 8 HTTP routes, durable persistence, an execution journal, HMAC operator authentication, 2 real n8n workflows, and a genuine `claude-opus-5` classification that has executed through the real ingress path |
| The other five | `SIMULATED` — 2 scenarios each, executing the same shared engine against authored fixtures |

Lead Rescue's live classification evaluation is a **retained negative result**: all 9 frozen
corpus cases ran against the real model and scored **6/9 (66.7%)** against a declared floor
of 75%. No label, threshold, prompt, or model setting was altered to soften it. Every miss
routed to a person rather than to an action, so the failure is one of accuracy and never of
safety. See [STATUS.md](docs/STATUS.md).

## Run it

```bash
npm install
npm run dev
```

Then open the printed URL. **18 incidents across 6 systems** replay through the engine. Each
one executes the real engine — same input, same result, every time.

**Lead Rescue (8)** — `/simulator/after-hours-enquiry` · `duplicate-delivery` ·
`ambiguous-high-risk` · `restricted-contact-review` · `uncertain-downstream-outcome`, plus
three wait/resume incidents reachable from `/lead-rescue`.

**The other five (2 each)** — `eligible-reactivation` · `suppressed-recovery` ·
`discovery-to-approved-proposal` · `unsupported-scope-claim-blocked` ·
`signed-client-to-first-value` · `duplicate-provisioning-reconciled` ·
`overdue-reply-changes-policy` · `dispute-halts-cadence` · plus two owner-revenue paths.

## Verify it

```bash
npm run verify     # typecheck + lint + 836 tests across 54 files
npm run build      # 30 pages prerender — the engine executes at build time
npm run docs       # regenerate the canon documents from the typed model
```

The interesting tests are not smoke tests:

| Test | Asserts |
| --- | --- |
| `tests/lead-rescue.test.ts` | A replayed duplicate produces **zero** duplicate external actions; a low-confidence judgment sends **nothing**; a restricted contact's candidate action is blocked regardless of classification confidence; an uncertain send outcome permits exactly **one** customer-facing effect across the whole run |
| `tests/live-classification-evidence.test.ts` | The retained real-model run is intact — 13 tests, each confirmed to fail against a deliberately corrupted artifact |
| `tests/observation-integrity-evidence.test.ts` | The system can say what it failed to write down — 20 tests over a capture containing a real `EACCES` drop, a real `550` refusal, and a real process kill mid-send |
| `tests/lead-rescue-wait-resume-execution-boundary.test.ts` | The durable claim gates the actual observable execution boundary, not merely a status label |
| `tests/operator-authentication.test.ts` | Authority is bound to a verified identity; a body naming its own role is rejected outright |
| `tests/handoff-boundary.test.ts` | The System 3 → 4 handoff reproduces exactly the fixture Client Onboarding consumes when re-run live against Call-to-Proposal's own scenario |
| `tests/engine.test.ts` | An undeclared transition is rejected and the state does not move; no transition can leave a terminal state; a naive retry on an unresolved uncertain outcome is refused by the core |
| `tests/replay.test.ts` | Two runs of the same scenario are byte-identical, and every timestamp traces to an authored fixture |
| `tests/seam.test.ts` | No business vocabulary has leaked into a vertical-agnostic system definition |
| `tests/provenance.test.ts` | An uncited evidence claim fails validation; an unverified claim can never render as settled fact |
| `tests/docs.test.ts` | The canon documents are not stale relative to the model |

## How it is put together

```
docs/           canon (normative) + source/ (historical inputs, byte-preserved)
lib/model/      provenance, system, runtime, profile — the typed vocabulary
lib/engine/     pure reducer, idempotency + event + execution ledgers, two-phase runner
lib/ports/      DecisionProvider + SideEffectExecutor + ExtractionProvider + ResourceProvisioner
lib/persistence/ durable wait incidents, operation claims, execution journal
lib/proof/      the buyer-facing proof surface — journey, grammar, fidelity ledger
lib/observability/ aggregate operational view, observation integrity, alerting
data/systems/   the six systems — vertical-agnostic, no business vocabulary
data/profiles/  Kestrel Compliance Group — the swappable fictional business
n8n/workflows/  2 real Lead Rescue workflows
n8n/evidence/   9 retained runtime artifacts, each guarded by a falsification suite
app/            portfolio index, system dossiers, flight simulator, Lead Rescue proof surface
tokens.css      OKLCH design tokens, contrast-verified
```

### Two seams carry the architecture

**Profile ↔ system.** `data/systems/**` holds structure: states, transitions, decision
types, authority levels, failure modes, metric definitions. `data/profiles/**` holds
values and narrative. The invariant that makes this swappable rather than aspirational:
*no system definition may contain a business-specific string.* `tests/seam.test.ts` scans
the source and fails if one does.

**Adapter ↔ engine.** Fixtures do not drive the UI. They produce `CanonicalEvent`s, which
feed a pure synchronous reducer:

```
adapter → CanonicalEvent[] → reduce(state, event, judgments) → TimelineEntry[] → UI
```

The reducer reads no clock and no random source, so replay is exact. Lead Rescue has now
demonstrated the payoff: a real `claude-opus-5` provider replaced the fixture one behind
`DecisionProvider` with no change to the business model or the portfolio experience.

### What actually executes

Everything labelled **deterministic rule** in the UI genuinely computes: validation,
normalisation, identity resolution, consent screening, the confidence-floor comparison,
missing-field computation, disposition mapping, transition legality, idempotency, and the
authority gate. Three of those live in the engine core rather than in per-system handlers,
so no handler can opt out of them.

Only **bounded AI judgment** — interpretation of free text — is replayed from fixtures,
through a typed port whose contract validates the returned classification against a closed
permitted set. In Lead Rescue that port has been driven by a real provider; everywhere else
it is still fixture-backed.

### A credential is not an activation

Real providers are reached only by an explicit environment opt-in, **never by credential
presence alone**, and each boundary has its own switch:

| Boundary | Opt-in | Default |
| --- | --- | --- |
| Model classification | `LEAD_RESCUE_DECISION_PROVIDER=claude` | fixture |
| Outbound messaging | `LEAD_RESCUE_SIDE_EFFECT_EXECUTOR=smtp` | simulated |

Both fail **closed**, not silently: an explicitly requested real path that is misconfigured
raises the same typed failure a genuine transport error produces, rather than quietly
substituting a fake success.

### How to read a claim

Two independent dimensions travel with every operating standard:

- **Provenance** — `EVIDENCE` · `CLIENT_POLICY` · `LAB_TARGET` · `FIXTURE`
- **Verification** — `VERIFIED` · `PENDING_VERIFICATION` · `DISPUTED_OR_WEAK` ·
  `SUPERSEDED` · `NOT_APPLICABLE`

An `EVIDENCE` claim is not automatically true. Only `EVIDENCE` + `VERIFIED` may be stated
as settled external fact; everything else renders with its caveat attached, and the schema
makes an uncited evidence claim a validation failure rather than a style problem.

## Canon

| Document | What it is |
| --- | --- |
| [NORTH_STAR_CANON.md](docs/NORTH_STAR_CANON.md) | The normative definition of all six systems. Generated from the model. |
| [FAILURE_MODE_REGISTER.md](docs/FAILURE_MODE_REGISTER.md) | Every known failure class, its prevention, detection, recovery, and test. Generated. |
| [RESEARCH_LEDGER.md](docs/RESEARCH_LEDGER.md) | Every claim, its provenance, its verification state, and every source's limitations. Generated. |
| [STATUS.md](docs/STATUS.md) | What is real, what is simulated, what is unverified, and the next fidelity gap. |
| [CANON_DIVERGENCES.md](docs/CANON_DIVERGENCES.md) | Where the canon deliberately departs from the original brief, and why. |
| [AGENTS.md](AGENTS.md) | Operating guidance for agents working in this repository. |

The first three are **rendered from the typed model**, so the definitions are the canon and
the documents cannot drift from them. `docs/source/` holds the original project inputs
byte-for-byte; they are provenance, not instruction.

## Not built yet

Deliberately, and stated precisely — this section is easy to leave stale, so it names only
what is genuinely absent as of the current `STATUS.md`.

- **No customer deployment.** The site is hosted so a visitor can reach it without a clone, but
  that is a demonstration, not operation. Nothing has run for a paying customer, no live trigger
  is connected to a real channel, there is no production scheduler, and there is no client data
  of any kind. The hosted instance carries no runtime store, so its operator console starts
  empty and fills only from use of the demo itself.
- **No real outbound customer messaging.** SMTP execution has run only against a
  purpose-built receiver bound to loopback with no relay. Wiring a routable provider is the
  highest-stakes remaining boundary and requires an explicit decision, not a config change.
- **No production credentials, no database, no vector store, no multi-agent orchestration,
  no graph framework.**
- **No live fidelity beyond Lead Rescue.** Systems 2–6 have no HTTP surface, no persistence,
  no n8n workflows, and no retained runtime artifacts. They share the engine, not the depth.

The next fidelity gap should be chosen from evidence this build produced rather than assumed
in advance. See [STATUS.md](docs/STATUS.md).
