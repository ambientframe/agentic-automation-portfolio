# Agentic Automation Portfolio — Flight Simulator

An interactive systems-engineering laboratory. Six small-business operating systems,
modelled so that a visitor can watch a real business incident move through state,
decisions, policy, bounded AI judgment, human authority, actions, verification, and
recovery — and then open it up and check the wiring.

**Everything here is simulated.** No model is called. No message, record write, or
notification leaves the process. The demonstration business is fictional. That claim is
enforced by the test suite, not just asserted in prose.

## Run it

```bash
npm install
npm run dev
```

Then open the printed URL. Five Lead Rescue incidents replay through the engine:

- `/simulator/after-hours-enquiry` — an incomplete enquiry at 20:47, worked to a booking
- `/simulator/duplicate-delivery` — the same event delivered twice, refused twice
- `/simulator/ambiguous-high-risk` — a 0.52-confidence case that reaches a person instead
  of an inbox
- `/simulator/restricted-contact-review` — a high-confidence, well-qualified enquiry, still
  blocked at the policy gate because the contact carries restricted consent state
- `/simulator/uncertain-downstream-outcome` — an acknowledgement whose outcome comes back
  unknown; a naive retry is refused, and exactly one send succeeds after verification

## Verify it

```bash
npm run verify
```

Typecheck, lint, and 180 tests. The interesting ones are not smoke tests:

| Test | Asserts |
| --- | --- |
| `tests/lead-rescue.test.ts` | A replayed duplicate produces **zero** duplicate external actions; a low-confidence judgment sends **nothing**; a restricted contact's candidate action is blocked regardless of classification confidence; an uncertain send outcome permits exactly **one** customer-facing effect across the whole run |
| `tests/engine.test.ts` | An undeclared transition is rejected and the state does not move; no transition can leave a terminal state; a naive retry on an unresolved uncertain outcome is refused by the core |
| `tests/side-effect-executor.test.ts` | The provider port never fabricates an external id, and converts every provider failure into data rather than throwing |
| `tests/replay.test.ts` | Two runs of the same scenario are byte-identical, and every timestamp traces to an authored fixture |
| `tests/seam.test.ts` | No business vocabulary has leaked into a vertical-agnostic system definition |
| `tests/provenance.test.ts` | An uncited evidence claim fails validation; an unverified claim can never render as settled fact |
| `tests/profile.test.ts` | The fictional business is internally coherent — revenue, funnel, and headcount reconcile |
| `tests/docs.test.ts` | The canon documents are not stale relative to the model |

Other commands:

```bash
npm run build      # 15 pages prerender — the engine executes at build time
npm run docs       # regenerate the canon documents from the typed model
```

## How it is put together

```
docs/           canon (normative) + source/ (historical inputs, byte-preserved)
lib/model/      provenance, system, runtime, profile — the typed vocabulary
lib/engine/     pure reducer, idempotency + event + execution ledgers, two-phase runner
lib/ports/      DecisionProvider + SideEffectExecutor contracts, fixture-backed
data/systems/   the six systems — vertical-agnostic, no business vocabulary
data/profiles/  Kestrel Compliance Group — the swappable fictional business
data/research/  the source ledger
app/            portfolio index, system dossiers, flight simulator
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

The reducer reads no clock and no random source, so replay is exact. Real integrations
replace simulation behind these contracts without the business model or the portfolio
experience being rewritten.

### What actually executes

Everything labelled **deterministic rule** in the UI genuinely computes: validation,
normalisation, identity resolution, consent screening, the confidence-floor comparison,
missing-field computation, disposition mapping, transition legality, idempotency, and the
authority gate. Three of those live in the engine core rather than in per-system handlers,
so no handler can opt out of them.

Only **bounded AI judgment** — interpretation of free text — is replayed from fixtures,
through a typed port whose contract validates the returned classification against a closed
permitted set. That validation is the part that must survive when a live provider replaces
the fixture one.

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

The first three are **rendered from the typed model**, so the definitions are the canon and
the documents cannot drift from them. `docs/source/` holds the original project inputs
byte-for-byte; they are provenance, not instruction.

## Not built yet, on purpose

No live integrations, no production credentials, no outbound communication, no database, no
vector store, no multi-agent orchestration, no graph framework, and no n8n workflows. Those
are later fidelity upgrades, and the next one should be chosen from evidence this build
produced rather than assumed in advance. See [STATUS.md](docs/STATUS.md).
