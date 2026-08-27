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
- **Runtime artifact (added 2026-08-26):** `n8n/evidence/lead-rescue-observation-integrity.json` — the `OUTCOME_UNKNOWN` half is no longer test-only. A real process was killed inside its send with the claim already taken; a freshly started process asked to despatch the same case reported `OUTCOME_UNKNOWN` and opened no further connection to the receiver (`connectionsAfterRecovery === connectionsBeforeRecovery`), so refusing to guess was observed rather than asserted.
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
- **Establishes:** a side effect genuinely left the process and a separate mail server accepted it, proven by a receipt only that server could issue; a transport failure becomes typed data rather than an exception or a false success.
- **Limits (recorded, not hidden):** the server is a local Mailpit sandbox bound to `127.0.0.1` with relay structurally disabled and a `.invalid` recipient. This earns the *boundary contract*, not third-party delivery.
- **Qualified by #14 (2026-08-26):** this entry originally read "classified as *before effect* rather than ambiguous," which was true of the captured connection refusal and over-broad as a general claim. Only failures that provably precede DATA earn that verdict; the retained capture's refusal still does.
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
- **Runtime artifact:** `n8n/evidence/lead-rescue-operational-view.json` — computed by the running application through `GET /api/lead-rescue/operations` and read back by a separate process. **Recaptured 2026-08-26** by the observation-integrity package: the original capture (13 leads, 41 observations, retained in git history at `fb41367`) had accumulated across many demo sessions, and the surface would have shown an aggregate that could not account for the abnormal despatches #12/#13 raise alerts about. The current capture is 7 leads / 15 observations against a deliberately cleared runtime store. The claim is unchanged and the mechanism is untouched; only the records it was run over are newer.
- **Establishes:** many executions can be read together and summarised by a pure, clock-free function of records that were already durable, so the same records always yield the same view. Four ways such a summary normally lies are refused structurally: attempts are counted separately from leads, so a suppressed replay cannot read as a second delivery; a measurement never taken is an `Availability` union rather than a zero; `OUTCOME_UNKNOWN` is carried through rather than folded into success or failure; every tally carries the `journalEventId`s behind it.
- **Reusable for 2–6:** `deriveOperationalView` takes `JournalEvent[]` and knows nothing about Lead Rescue. Any system that records observations through the same journal inherits the aggregate for free, and `Availability<T>` is the repository's general answer to "this was never measured".

### 12. Durable write-ahead observation accounting, reconciled rather than counted
- **Earned:** observation integrity package, 2026-08-26
- **Implementation:** `lib/persistence/observation-intent-store.ts` · `lib/observability/observation-integrity.ts` · `lib/observability/lead-rescue-journal.ts` (composition root)
- **Tests:** `tests/lead-rescue-observation-integrity.test.ts` (20 tests, RED before implementation; 8 targeted mutations each separately confirmed to fail it) · `tests/observation-integrity-evidence.test.ts` (20 tests, each confirmed to fail against a deliberately corrupted artifact)
- **Runtime artifact:** `n8n/evidence/lead-rescue-observation-integrity.json` — the journal directory was made unwritable for exactly one real HTTP ingress; the business path returned `200 ACCEPTED` and durably parked the case, the observation was genuinely lost, and the runtime named it: `CONFIRMED_DROP`, with the recorder's own `EACCES: permission denied, mkdir …` as the reason.
- **Establishes:** a lossy recorder can be held to account without becoming blocking. A marker naming the intended observation is written BEFORE the record, removed after a success, and annotated-and-left after a reported drop; a marker still outstanding is reconciled against the journal by `journalEventId`, so a crash in the cleanup window is not mistaken for data loss and a genuinely missing record cannot hide. The three answers stay distinct — `NO_KNOWN_LOSS`, `KNOWN_LOSS`, `UNAVAILABLE` — and an unreadable ledger or an unreadable journal both fail into the third rather than into the flattering first.
- **Why not a counter:** a process-local tally dies in exactly the crash it would need to survive, and reports a clean instrument at the moment the instrument is least trustworthy. The marker is durable, so the accounting outlives the process; `tests/lead-rescue-observation-integrity.test.ts` proves an unresolved intent survives a genuinely reconstructed store.
- **Limits (recorded, not hidden):** an observation whose marker ALSO failed to be written is invisible. That is why the clean answer is named `NO_KNOWN_LOSS` and never `COMPLETE`, why no completeness rate exists anywhere in the payload, and why the bound travels with every answer including the clean one. The `UNRESOLVED_INTENT` kind is test-proven; the retained capture exercises `CONFIRMED_DROP`.
- **Reusable for 2–6:** `withObservationIntegrity` decorates any `ExecutionJournalRecorder` and `deriveObservationIntegrity` reads any `ExecutionJournalReader`. Neither knows what a lead is.

### 13. Deterministic operator alerting with a defended noise floor
- **Earned:** observation integrity package, 2026-08-26
- **Implementation:** `lib/observability/operational-alerts.ts` · `app/api/lead-rescue/operations/route.ts` · `components/proof/observation-panel.tsx`
- **Tests:** `tests/lead-rescue-operational-alerts.test.ts` (19 tests; 8 targeted mutations each separately confirmed to fail it, including one that initially SURVIVED and forced a real test repair — see below)
- **Runtime artifact:** `n8n/evidence/lead-rescue-observation-integrity.json` — four conditions raised from a real run: one `CRITICAL UNRESOLVED_DELIVERY`, two `ATTENTION FAILED_DELIVERY`, one `ATTENTION OBSERVATION_LOSS`, each naming its case and the exact `journalEventId`s behind it.
- **Establishes:** the restraint IS the capability. Five conditions are raised and everything else is deliberately not: an authority refusal, a suppressed duplicate, and a correctly parked case are all abnormal-looking and all evidence of the system working, so raising them would train an operator to ignore the list. Every alert is a pure function of authoritative records — no clock, no stored state, no model — which means identity is stable as evidence accumulates, resolution is derived (`RESOLVED_BY_LATER_EVIDENCE`) rather than acknowledged away, and a condition cannot be dismissed while it is still true.
- **Why not a variant of #11:** #11 computes what happened. This decides what demands a person, which is a different question with different failure modes — over-raising, unstable identity, and evidence that cannot be opened. It shares #11's input and none of its logic.
- **Limits (recorded, not hidden):** it raises conditions on a surface, not into a channel. There is no pager, inbox, or webhook in this build, so a condition still waits for somebody to open the page. And an alert can be no more accurate than the observation under it — the retained capture contains one case where the execution boundary's own classification was contradicted by an independent receiver, and the alert faithfully repeats the executor's claim.
- **Reusable for 2–6:** `deriveOperationalAlerts` takes an `OperationalView` and an `ObservationIntegrity`. A test scans its source for Lead Rescue vocabulary and for anything that can act, persist, or read a clock, and fails on any of them.

### 14. A failure verdict that grants permission is earned structurally, never inferred from an error code
- **Earned:** execution-boundary classification package, 2026-08-26
- **Implementation:** `lib/ports/smtp-side-effect-executor.ts` — `SMTP_COMMANDS_BEFORE_DATA` plus the phase read in `attemptSend`'s catch
- **Tests:** `tests/smtp-side-effect-executor.test.ts` (39 tests, up from 17; 5 RED before implementation, and 5 targeted mutations of the shipped fix each separately confirmed to fail it — re-admitting the socket codes, adding `DATA` to the pre-DATA set, widening the syscall check, forcing the phase test true, and inverting the default)
- **Establishes:** `FAILED_BEFORE_EFFECT` is not a description of a socket, it is a **permission** — every layer above reads it as "nothing reached the recipient, a retry is safe." A permission may therefore only be issued where non-delivery is structural: a code that cannot follow DATA by protocol, a `connect` syscall, or an error raised against an SMTP command that precedes DATA. Everything else, including every unrecognised code and every error carrying no code at all, resolves to `OUTCOME_UNKNOWN` and parks for a person. The asymmetry is the point: a false uncertainty costs an operator one decision, a false certainty costs the customer a duplicate.
- **Why not a wider blocklist:** the first attempt routed every socket-class code to uncertainty. It was sound and it broke a genuine connection-refusal test, because nodemailer collapses connect-phase failures into `ESOCKET` — a real `ECONNREFUSED` arrives as `{code: 'ESOCKET', syscall: 'connect', command: 'CONN'}`. A blocklist that parks every refused connection trains an operator to clear a queue of decisions that were never theirs to make. Reading the phase the transport already reports is both sounder and more precise than either blanket rule.
- **The trap, recorded because it cost a full cycle:** a phase field is not necessarily a phase. nodemailer's `command: 'CONN'` marks a *connection-level* error whenever it occurs, not the connect phase — a server that takes the whole body and then destroys the socket reports `{code:'ECONNECTION', command:'CONN'}`, indistinguishable in shape from a greeting failure. Trusting it re-issued retry permission for exactly the case this pattern exists to stop, and 39 green unit tests did not notice. The re-captured runtime evidence did, on the first run. Before trusting any provider's phase field, probe it against the failure you actually fear.
- **Runtime artifact:** `n8n/evidence/lead-rescue-observation-integrity.json` — case D: the receiver holds 979 bytes and a stored message id, and the application records `OUTCOME_UNKNOWN` with verdict `DECLINED_TO_CLAIM`, parking the case rather than authorising a retry. Guarded by test 9b in `tests/observation-integrity-evidence.test.ts`, which ties each verdict to the bytes the receiver observed; 4 targeted corruptions each confirmed to fail it.
- **Limits (recorded, not hidden):** the phase is only as good as the transport's own reporting, *and* only as good as your understanding of what that reporting means. An adapter whose provider surfaces no trustworthy equivalent must fall back to the conservative rule and accept the extra uncertainty; it may not invent a phase.
- **Reusable for 2–6:** the shape generalises to every `SideEffectExecutor` any system adds. The question "does this failure prove non-execution, or merely suggest it?" is the same for a CRM write, an SMS gateway, and a calendar invite; only the phase evidence differs.

### 15. A buyer-facing proof route derived from any system definition
- **Earned:** proof-surface generalisation package, 2026-08-26
- **Implementation:** `app/proof/[slug]/page.tsx` · `components/proof/proof-chrome.tsx` (shared primitives extracted from Lead Rescue) · `proofHref` in `app/page.tsx`
- **Establishes:** the commercial register is not a Lead Rescue asset, it is a projection of any `SystemDefinition` plus a real engine run. One route serves the other five systems: `deriveJourney` and `deriveCommercialGrammar` were already generic over `SystemDefinition`, `JourneyConsole` already took derived data, and `businessProblem` / `economicLeakage` / `buyerOutcome` / `fidelityNote` are required on every system. The portfolio index now sends every one of the six to a buyer-facing page rather than to an engineering dossier.
- **Nothing is authored per system.** The third problem card — hand-written prose on Lead Rescue's own page — is computed here from the lifecycle ("one of the 11 positions this system declares in advance, reachable only by one of its 17 declared moves"). A reader can check that against the dossier; a sentence cannot drift from a model it is derived from.
- **What it deliberately refuses to render:** no capability ledger and no operator console. Those systems have no HTTP surface, no durable storage, no real provider, and no retained runtime evidence, so an empty ledger — or one inferring REAL from the fixtures all six share — would be borrowed credibility. The page states that absence explicitly instead, and links to Lead Rescue as what the next fidelity level looks like once earned. **A system earns a layer by acquiring the capability, not the component.**
- **Limits (recorded, not hidden):** layers A and B only. Lead Rescue keeps its own richer route and is excluded from this one, so two page implementations exist until the remaining systems earn layers C and D. That duplication is deliberate and bounded, not an oversight.
- **Cost, for the record:** the audit that preceded this estimated the port as expensive and gated it behind freezing Lead Rescue. It was neither — the generic layer already existed and had simply never been pointed at a second system. Measure coupling before sequencing around it.

### 16. Identity resolution is the precondition for every policy check, not one check among them
- **Earned:** dp-fm-wrong-entity package, 2026-08-26
- **Implementation:** `lib/engine/handlers/dormant-pipeline-recovery.ts` Step 1b · `entityMatchThreshold` + `kestrel-entity-resolution` in `data/profiles/kestrel/profile.ts`
- **Tests:** `tests/dormant-pipeline-recovery.test.ts` (31 in that file, up from 23; 7 RED before implementation, and 5 targeted mutations of the shipped guard each separately confirmed to fail it — accepting the closest candidate, disabling the guard, dropping the attached candidates, removing the forbidden actions, redirecting the transition)
- **Establishes:** consent, account status, and commercial eligibility are all questions about a SPECIFIC party. Asking them against an identity nobody has established is meaningless work that reads as diligence, so identity resolves first and the handler returns immediately when it cannot. A match is accepted only on exactly one candidate at or above the configured threshold: two or more is the declared ambiguity, and zero is the same failure wearing a different face, because resolving it means taking the closest available match.
- **Refusal is recorded, not implied.** `resolve_to_closest_candidate` and `resolve_to_highest_confidence_match` are named forbidden actions rather than merely unselected ones, so the run shows the system declining a choice it was capable of making. Every candidate travels with the escalation, so the person deciding sees what the system saw.
- **Why it is a confidentiality guard:** the outreach quotes the prior objection and original service interest back to its recipient, so a wrong match does not send an irrelevant message — it discloses one company’s commercial history to another.
- **Limits (recorded, not hidden):** the guard only runs when the cycle supplies competing candidates. A record resolved upstream on a stable identifier has no ambiguity to decide, and manufacturing a decision for it would pad every run with a step that never chose anything — so a WRONG upstream resolution is invisible here. This bounds a match, it does not audit one.
- **Reusable for 2–6:** every system that matches an inbound artifact to an account has this shape — Lead Rescue on contact identity, Receivables on invoice identity, Client Onboarding on the signed party. Only the identifier differs.

## NOT YET EARNED

| Candidate | Why not |
| --- | --- |
| Third-party provider contract (CRM, calendar, SMS) | No implementation. SMTP to a local sandbox with a non-routable recipient earns the boundary contract (#5), not third-party delivery. |
| Alert delivery into a channel | #13 raises conditions on a surface a person must still open. No pager, inbox, webhook, or escalation path exists, so "somebody is told" remains untrue. |
| Third-party corroboration of an execution outcome | The receiver in #12/#13's capture is a purpose-built local SMTP fault server. It is an independent observer of the socket and it genuinely contradicted the application once; it is not a vendor contract, and `lead-rescue-smtp-execution.json` remains the only capture where a third-party product (Mailpit) issued the receipt. |
| External identity provider integration | `lead-rescue-operator-authentication.json` records `externalIdentityProvider = false` and every principal as `syntheticIdentity = true`. The credential mechanism is real (#4); the identity source is not. |
