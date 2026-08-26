# Checkpoint

> One per accepted package (Constitution §14). Repository truth is authoritative; this file
> is an index, not a source. Append the new checkpoint above the previous one.

## Current — Observation integrity, deterministic alerting, abnormal-delivery evidence · 2026-08-26

**Verified state.** `main` clean. `npm run verify`: 54 files, 836 passed / 1 skipped.
`npm run build`: 30/30 pages, exit 0. Both new falsification suites were RED before
implementation; 16 targeted semantic mutations and 15 artifact corruptions were each confirmed
to fail them, one of which SURVIVED first and forced a real test repair.

**Proof claim earned.** Lead Rescue can now say whether its own record is complete, raises the
few conditions that need a person, and has observed the two abnormal delivery states it
declares. In one real run: the journal directory was made unwritable for exactly one HTTP
ingress — the business path returned `200 ACCEPTED` and durably parked the case, and the
runtime named the lost observation as a `CONFIRMED_DROP` with the recorder's own `EACCES`
reason; a despatch to a receiver that refused the envelope produced a genuine
`FAILED_BEFORE_EFFECT`, corroborated by that receiver recording zero bytes and nothing stored;
a process killed inside its send with its claim taken produced a genuine `OUTCOME_UNKNOWN`,
and the recovering process opened no further connection.

**Maturity.** Retained runtime evidence, local prototype. Proof `INTERACTIVE_PROTOTYPE`,
operational `NOT_LIVE` — unchanged. No provider crossed, $0 spent, no model invoked.

**Patterns earned.** Two: durable write-ahead observation accounting reconciled rather than
counted (#12), and deterministic operator alerting with a defended noise floor (#13).

**Finding retained, not fixed.** The same capture shows the execution boundary classifying a
socket failure AFTER DATA as `FAILED_BEFORE_EFFECT` while the receiver genuinely holds the
message. The journal recorded exactly what the executor reported; the unsound classification
belongs to `SmtpSideEffectExecutor`, which this package was scoped out of. Retained in
`executionClassificationCheckedAgainstTheReceiver` and rendered on the proof surface.

**Current bottleneck.** Observability moves **2 → 3**. Execution stays **2**: no side effect
has crossed to anything off this machine, and the post-DATA misclassification above is now
evidenced. That is Lead Rescue's only remaining reference-exit blocker.

**Next package.** NOT SELECTED — PM sequences from the §6 scorecard.

## Previous — Aggregate operational observability · 2026-08-26

**Verified state.** `main` clean. `npm run verify`: 51 files, 777 passed / 1 skipped.
`npm run build`: 30/30 pages, exit 0. Falsification suite was RED before implementation.

**Proof claim earned.** Lead Rescue produces an inspectable multi-execution view from its own
retained journal — 13 leads, 41 observations, delivery counted by lead and never by attempt,
intervals measured only from recorded timestamps with 3 leads explicitly unmeasurable, failure
classes and operator intervention tallied, every total traceable to its records.

**Maturity.** Retained runtime evidence, local prototype. Proof `INTERACTIVE_PROTOTYPE`,
operational `NOT_LIVE` — unchanged. No provider crossed, $0 spent.

**Pattern earned.** Deterministic aggregate projection over an append-only journal.

> **Superseded artifact, 2026-08-26.** The 13-lead / 41-observation capture this entry describes
> was recaptured by the next package against a cleared runtime store, so
> `lead-rescue-operational-view.json` now reports 7 leads / 15 observations. The original is
> retained in git history at `fb41367`. The claim above was true of that capture and the
> mechanism did not change.

**Current bottleneck.** Observability stays **2**, not 3: dropped observations are unmeasured,
nothing alerts, and the capture never exercised a failed or unknown dispatch.

**Next package.** NOT SELECTED — PM sequences from the §6 scorecard.

## Earlier — Governance reconciliation · 2026-08-26

**Verified state.** `main` @ `343e8e0`, clean, no remote. `npm run verify`: 50 files,
759 passed / 1 skipped. `npm run build`: 30/30 pages. `rescue/local-proof-surface-wip`
@ `aafebf0` stays preservation-only, not an ancestor of `main`.

**Proof claim earned.** The repository now carries the accepted PM process authority
(sha256 `32ca6f53…0d9304`) plus evidence-backed checkpoint and reusable-pattern indexes,
so proof work can be sequenced from governed §6 arithmetic rather than inferred. No Lead
Rescue behaviour changed.

**Maturity.** Unchanged — proof `INTERACTIVE_PROTOTYPE`, operational `NOT_LIVE`.

**Pattern earned.** None. Ten pre-existing patterns were indexed, not created.

**Current bottleneck.** Lowest §6 product is Provenance (3 × 1 = 3), saturated at score 3
— `SATURATED_NUMERIC_BOTTLENECK`. Lowest improvable product is 4: Reasoning, Integration,
Evaluation (each 2 × ×2).

**Next package.** NOT SELECTED. PM must recompute from the now-reachable §6 scorecard; the
§8 gate is unmet on dimensions 7 and 11.
