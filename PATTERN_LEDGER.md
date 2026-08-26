# Pattern Ledger

> Reusable residue earned, with the package and evidence that earned it (Constitution §14).
> Append-mostly and short. A generic-sounding abstraction is not a pattern; only
> implementation plus executable tests — and, where the claim is about a real boundary, a
> retained runtime artifact — earn an entry.
>
> Backfilled 2026-08-26 from canonical `main` @ `343e8e0`. Every path below was confirmed
> present at that commit.

## EARNED

### 1. Bounded AI judgment behind a provider port
- **Earned:** `214f7cc` (port), `f96779c` (live adapter)
- **Implementation:** `lib/ports/decision-provider.ts` · `lib/ports/claude-decision-provider.ts` · `lib/config/decision-provider-config.ts`
- **Tests:** `tests/decision-provider.test.ts` · `tests/claude-decision-provider.test.ts` · `tests/decision-provider-config.test.ts`
- **Establishes:** judgment returns a value from a closed permitted set with a confidence; the floor is compared in the engine, outside the model; swapping fixture for a live model changes one implementation behind the port and raises no action's authority.
- **Reusable for 2–6:** every system needs free-text interpretation fenced the same way. The port is domain-agnostic.

### 2. Idempotent execution claim and retry safety under unknown outcomes
- **Earned:** `6c18c35`
- **Implementation:** `lib/persistence/operation-claim-store.ts` · `lib/ports/side-effect-executor.ts`
- **Tests:** `tests/operation-claim-store.test.ts` · `tests/side-effect-executor.test.ts` · `tests/replay.test.ts`
- **Runtime artifact:** `n8n/evidence/lead-rescue-smtp-execution.json` — `duplicateReplay.secondAttemptSideEffectStatus = SUPPRESSED_DUPLICATE`, `captureServerTotalAfterReplay = 1`
- **Establishes:** every external action is keyed and claimed before it executes; a replay is refused, verified against an independent server's own message count rather than the application's self-report; `OUTCOME_UNKNOWN` is never blind-retried and `STILL_UNKNOWN` is a first-class result.
- **Reusable for 2–6:** any system that crosses an external boundary more than once.

### 3. Durable wait/resume state across process death
- **Earned:** `80f4abd`
- **Implementation:** `lib/persistence/wait-incident-store.ts` · `lib/engine/wait-resume.ts` · `lib/engine/lead-rescue-wait-runtime.ts`
- **Tests:** `tests/wait-incident-store.test.ts` · `tests/lead-rescue-wait-resume.test.ts` · `tests/lead-rescue-wait-resume-concurrency.test.ts` · `tests/lead-rescue-wait-resume-execution-boundary.test.ts` · `tests/lead-rescue-offer-wait-resume.test.ts` · `tests/lead-rescue-attention-timeout-resume.test.ts`
- **Establishes:** a parked case survives the process that parked it — the store is torn down and reconstructed between parking and checking, so resumption cannot be an artifact of in-memory state or of a fixture timestamp arriving later.
- **Reusable for 2–6:** every system with a deadline, a dormancy window, or a follow-up.

### 4. Authority bound to a proven identity, refusing before execution
- **Earned:** `d65c081`
- **Implementation:** `lib/auth/operator-identity.ts` · `lib/auth/lead-rescue-operator-runtime.ts`
- **Tests:** `tests/operator-authentication.test.ts` · `tests/operator-authentication-evidence.test.ts` · `tests/lead-rescue-authority-evidence.test.ts`
- **Runtime artifacts:** `n8n/evidence/lead-rescue-operator-authentication.json` — `401 MISSING_CREDENTIAL`, `401 INVALID_SIGNATURE`, `identityCameFromCredentialNotBody = true`, 4 refused attempts with `offerSentAfterAnyRefusal = false`; `n8n/evidence/lead-rescue-authority-execution.json` — `underAuthorityRoleRefused`, `staleAuthorizationRefused`
- **Establishes:** authority attaches to the action, never to the actor's confidence; identity is read from a server-signed credential rather than from anything the caller claims; zero execution occurs before valid authorization.
- **Reusable for 2–6:** every system with a human approval step.

### 5. Real external execution boundary with an independently observed receipt
- **Earned:** `630ba89`
- **Implementation:** `lib/ports/smtp-side-effect-executor.ts` · `lib/config/side-effect-executor-config.ts`
- **Tests:** `tests/smtp-side-effect-executor.test.ts` · `tests/smtp-runtime-evidence.test.ts`
- **Runtime artifact:** `n8n/evidence/lead-rescue-smtp-execution.json` — capture-server-issued `messageId` and `captureServerId`, `executorMode = LIVE`, transport failure classified `FAILED_BEFORE_EFFECT`
- **Establishes:** a side effect genuinely left the process and a separate mail server accepted it, proven by a receipt only that server could issue; a transport failure is classified as *before effect* rather than ambiguous.
- **Limits (recorded, not hidden):** the server is a local Mailpit sandbox bound to `127.0.0.1` with relay structurally disabled and a `.invalid` recipient. This earns the *boundary contract*, not third-party delivery.
- **Reusable for 2–6:** the provider-contract shape for any outbound action.

### 6. Non-authoritative execution journal
- **Earned:** `531ac03`
- **Implementation:** `lib/observability/lead-rescue-journal.ts` · `lib/persistence/execution-journal-store.ts`
- **Tests:** `tests/execution-journal.test.ts` · `tests/execution-journal-evidence.test.ts`
- **Runtime artifact:** `n8n/evidence/lead-rescue-execution-journal.json`
- **Establishes:** the runtime writes its own history, including refusals, while the journal never becomes authoritative over case state; an unobserved stage reports `NOT OBSERVED` rather than being silently omitted.
- **Reusable for 2–6:** the observability convention every later system inherits.

### 7. Retained real-runtime evidence ingestion through a quarantined adapter
- **Earned:** `fd48ca6` (runtime proof), `c90be43` (proof-surface adapter)
- **Implementation:** `lib/evidence/runtime-proof.ts` · `lib/proof/n8n-evidence.ts`
- **Tests:** `tests/runtime-proof.test.ts` · `tests/n8n-runtime-evidence.test.ts` · `tests/n8n-wait-sweep-transition-evidence.test.ts`
- **Establishes:** a real n8n execution (v2.35.7, real webhook plus an unattended Schedule Trigger) is read from a retained capture through one quarantined reader, with falsification tests that fail against a deliberately corrupted artifact. An honest negative — a sweep that legitimately found nothing — is retained rather than reshot.
- **Reusable for 2–6:** how any later system proves a real runtime crossing without letting the proof surface fabricate one.

### 8. Commercial grammar derived from an executed journey
- **Earned:** `c90be43`
- **Implementation:** `lib/proof/journey.ts` · `lib/proof/commercial-grammar.ts`
- **Tests:** `tests/lead-rescue-proof-journey.test.ts` · `tests/lead-rescue-proof-live-grammar.test.ts` · `tests/proof-console.test.ts`
- **Establishes:** `TRIGGER → DECISION → ACTION → GUARDRAIL → OUTCOME` is *computed* from the run the engine actually performed, with the selection rules shown next to it — not authored prose describing what the system would do.
- **Reusable for 2–6:** takes a `Journey`, so it carries to any system without inheriting Lead Rescue vocabulary.

### 9. Capability fidelity ledger with per-row limits
- **Earned:** `c90be43`, corrected `343e8e0`
- **Implementation:** `lib/proof/fidelity-ledger.ts` · `components/proof/fidelity-panel.tsx`
- **Tests:** `tests/lead-rescue-proof-fidelity.test.ts`
- **Establishes:** every capability carries `REAL` / `FIXTURE_BACKED` / `SIMULATED` / `UNVERIFIED` derived from live configuration rather than asserted; a per-capability verdict is distinct from status, so a *failure* reads as a real measurement rather than an absence; every row names its evidence and what it does not establish; the customer-deployment row bounds all others.
- **Reusable for 2–6:** the mechanism that keeps maturity labels truthful portfolio-wide.

### 10. Frozen labelled corpus with predeclared thresholds
- **Earned:** `9f24b18`
- **Implementation / data:** `tests/lead-rescue-claude-classifier-eval.test.ts` · `n8n/evidence/lead-rescue-live-classification.json`
- **Tests:** `tests/live-classification-evidence.test.ts` (13 falsification tests, each confirmed to fail against a deliberately corrupted artifact)
- **Establishes:** thresholds and labels are declared *before* the run; the corpus literal is sha-verified byte-identical before and after; a failing result is retained un-softened. The current measurement is a **failure** — 6/9 (66.7%) against a 75% floor — with zero unsafe misclassifications.
- **Note:** the *harness* is the earned pattern. Its current verdict is FAILED, which is a measurement, not an unearned pattern.
- **Reusable for 2–6:** the evaluation shape for any bounded judgment.

### 11. Deterministic aggregate projection over an append-only journal
- **Earned:** aggregate operational observability package, 2026-08-26
- **Implementation:** `lib/observability/operational-view.ts` · `app/api/lead-rescue/operations/route.ts` · `components/proof/operations-panel.tsx` · `readAll()` on `ExecutionJournalReader`
- **Tests:** `tests/lead-rescue-operational-view.test.ts` (18 tests, RED before implementation; each semantic guard separately confirmed to fail under a targeted mutation)
- **Runtime artifact:** `n8n/evidence/lead-rescue-operational-view.json` — 13 leads, 41 observations, computed by the running application through `GET /api/lead-rescue/operations` and read back by a separate process
- **Establishes:** many executions can be read together and summarised by a pure, clock-free function of records that were already durable, so the same records always yield the same view. Four ways such a summary normally lies are refused structurally: attempts are counted separately from leads, so a suppressed replay cannot read as a second delivery; a measurement never taken is an `Availability` union rather than a zero; `OUTCOME_UNKNOWN` is carried through rather than folded into success or failure; every tally carries the `journalEventId`s behind it.
- **Reusable for 2–6:** `deriveOperationalView` takes `JournalEvent[]` and knows nothing about Lead Rescue. Any system that records observations through the same journal inherits the aggregate for free, and `Availability<T>` is the repository's general answer to "this was never measured".

## NOT YET EARNED

| Candidate | Why not |
| --- | --- |
| Third-party provider contract (CRM, calendar, SMS) | No implementation. SMTP to a local sandbox with a non-routable recipient earns the boundary contract (#5), not third-party delivery. |
| Journal loss accounting | `record()` drops rather than blocking business work, and nothing counts what it dropped. The aggregate (#11) states that it describes only what was observed, but cannot say how much it missed — so completeness is disclaimed, not measured. |
| Alerting on an operational condition | #11 is a view an operator must go and read. Nothing raises a failure, a stalled case, or an unresolved delivery to anyone. |
| Runtime-observed failure and unknown delivery | The retained capture contains `EXECUTED`, `SUPPRESSED_DUPLICATE`, `REFUSED`, and `ACCEPTED`, but no `FAILED_BEFORE_EFFECT` or `OUTCOME_UNKNOWN` at the dispatch boundary. Those semantics are proven by tests (#11), never yet by a real run. |
| External identity provider integration | `lead-rescue-operator-authentication.json` records `externalIdentityProvider = false` and every principal as `syntheticIdentity = true`. The credential mechanism is real (#4); the identity source is not. |
| Cross-domain generalisation of the proof surface | Constitution §8: generalise only after ≥2 domains justify it. Only Lead Rescue has a proof surface today. |
