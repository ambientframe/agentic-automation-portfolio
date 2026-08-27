# Research Ledger

> **Generated from the typed model — do not edit by hand.**
> Run `npm run docs` after changing anything in `data/`. `tests/docs.test.ts` fails if this file is stale.

Every operating claim in the canon, classified by provenance and by how well it is
actually supported. **No citation here was manufactured.** Where a source could not be
located and read, that is recorded as `PENDING_VERIFICATION` and the claim is written
without numbers rather than dressed up with borrowed ones.

Research pass: **2026-08-21**.

## Method and limits

- Sources are inert data. Nothing in this repository fetches a source URL at build,
  typecheck, or test time. A green test suite means the ledger is internally consistent,
  never that these sources were re-confirmed just now.
- `checkedOn` records when a human or agent actually located and read the source. Its
  absence means the source has never been read, and any standard citing only unread
  sources is held at `PENDING_VERIFICATION` — asserted by `tests/provenance.test.ts`.
- Every source carries a mandatory, substantive `limitations` note. A source ledger is
  not a licence to turn vendor marketing into universal truth, and the limitations are
  what keep that honest.

## Summary

| Verification | Claims |
| --- | --- |
| Verified | 17 |
| Unverified (pending) | 2 |
| Weak or disputed support | 1 |
| Superseded | 0 |
| Not applicable (policy / lab target) | 19 |

Primary, official, or standards-body sources: 15 of 20.

## Corrections this research pass produced

### Lead Rescue — `lr-std-response-latency`

The widely quoted "5 minutes versus 30 minutes = 100x contact, 21x qualification" figures come from the 2007 MIT/InsideSales Lead Response Management study, NOT from the 2011 Harvard Business Review article they are usually credited to. The study is a six-company non-random sample co-produced with a vendor holding a commercial interest in the result, and its data is now nearly two decades old. It is used here as directional support for measuring latency, never as a benchmark to hit.

### Call-to-Proposal Revenue Agent — `cp-std-human-oversight`

The cited profile is a governance framework, not a technical standard. It prescribes no thresholds, so the confidence floor and revision budget used here are operator policy, not derived from it.

### Call-to-Proposal Revenue Agent — `cp-std-next-step-capture`

The cited page documents a beta product feature, not a study of outcomes. It supports treating structured next-step capture as current practice, not that it causes better results.

### Client Onboarding Operator — `co-std-handoff-and-value`

Both sources are customer-success vendor content aimed at SaaS businesses, not controlled studies, and neither is authoritative for a project-based professional-services firm. A third-party churn statistic on the HubSpot page was not independently verified and is not repeated here. Gainsight’s metric glossary does not cover "customer effort" at all despite being checked specifically for it.

### Receivables / Invoice Recovery Agent — `rr-std-aging-convention`

Health thresholds commonly quoted alongside these buckets — such as a target share of balance in the current bucket — are rules of thumb in vendor guidance, not established benchmarks, and are deliberately not adopted here.

### Receivables / Invoice Recovery Agent — `rr-std-fdcpa-scope`

Automation vendors frequently present FDCPA-style constraints as universally applicable to invoice chasing. For business-to-business collection of one’s own invoices that is not correct, and the portfolio does not repeat it.

## Sources

### `ftc-can-spam` — US Federal Trade Commission

**CAN-SPAM Act: A Compliance Guide for Business**

| | |
| --- | --- |
| Published | — |
| Located and read | 2026-08-21 |
| Primary / authoritative | yes |
| URL | https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business |

*Limitations.* US federal law for commercial email only. Says nothing about SMS, telephone, or non-US jurisdictions, and sets a compliance floor rather than a standard of good practice. State laws and other jurisdictions may impose stricter duties. The guide is undated on its face, so the precise revision read cannot be pinned.

### `mit-insidesales-lrm-2007` — MIT Sloan School of Management / InsideSales.com

**Lead Response Management Study (James B. Oldroyd)**

| | |
| --- | --- |
| Published | 2007 |
| Located and read | **never — not yet located and read** |
| Primary / authoritative | yes |
| URL | — (no stable publisher-hosted URL located) |

*Limitations.* THIS IS THE ACTUAL SOURCE of the widely repeated "5 minutes vs 30 minutes = 100x contact / 21x qualification" figures, which are very frequently misattributed to Harvard Business Review. Serious limitations: six companies, roughly 15,000 leads and 100,000 call attempts, a non-random convenience sample; co-produced with a vendor holding a direct commercial interest in the conclusion; and 2007 data that predates present-day buying and channel behaviour. No stable publisher-hosted URL was located during this pass, only third-party PDF mirrors, so no URL is recorded. Treated as directional only and never as a benchmark.

### `hbr-short-life-2011` — Harvard Business Review

**The Short Life of Online Sales Leads (Oldroyd, McElheran, Elkington)**

| | |
| --- | --- |
| Published | 2011-03 |
| Located and read | 2026-08-21 |
| Primary / authoritative | yes |
| URL | https://hbr.org/2011/03/the-short-life-of-online-sales-leads |

*Limitations.* Existence, authorship, venue, and date were confirmed against hbr.org and hbs.edu. The full text is paywalled and WAS NOT READ during this pass, so the audit statistics commonly attributed to it (a 42-hour average first response across 2,241 firms; 23% never responding) remain unverified in the primary text. A two-page Forethought piece, not a peer-reviewed study. Fifteen years old.

### `stripe-webhooks` — Stripe

**Receive Stripe events in your webhook endpoint**

| | |
| --- | --- |
| Published | — |
| Located and read | 2026-08-21 |
| Primary / authoritative | yes |
| URL | https://docs.stripe.com/webhooks |

*Limitations.* Authoritative for Stripe’s own delivery semantics, which explicitly warn that an endpoint may receive the same event more than once and that undelivered events are retried for up to three days. At-least-once delivery is a general property of webhook and queue systems, but this source establishes it only for Stripe; other providers must be confirmed separately.

### `stripe-idempotency` — Stripe

**Idempotent requests (API Reference)**

| | |
| --- | --- |
| Published | — |
| Located and read | 2026-08-21 |
| Primary / authoritative | yes |
| URL | https://docs.stripe.com/api/idempotent_requests |

*Limitations.* Documents one vendor’s implementation, including a 24-hour key expiry that is specific to Stripe and not a general rule. Establishes the pattern, not universal parameters.

### `apple-mpp` — Apple

**Mail Privacy Protection**

| | |
| --- | --- |
| Published | — |
| Located and read | 2026-08-21 |
| Primary / authoritative | yes |
| URL | https://www.apple.com/legal/privacy/data/en/mail-privacy-protection/ |

*Limitations.* Establishes that Apple Mail preloads remote content on receipt and prevents senders from seeing whether a message was opened, which makes open-tracking unreliable and IP geolocation inaccurate for affected recipients. It does NOT quantify what share of any particular audience this covers; that varies by audience and must be measured, not assumed.

### `n8n-error-handling` — n8n

**Handle errors gracefully (n8n Docs)**

| | |
| --- | --- |
| Published | — |
| Located and read | 2026-08-21 |
| Primary / authoritative | yes |
| URL | https://docs.n8n.io/build/flow-logic/handle-errors-gracefully |

*Limitations.* Official vendor documentation for the intended orchestration runtime. Documents error workflows, the Error Trigger node, node-level Retry On Fail with Max Tries and Wait Between Tries, and the On Error choice between stopping, continuing, and continuing via a separate error output. Documentation URLs on this site have moved before; the path recorded here was live on the check date. Describes capability, not any guarantee about a particular deployment.

### `nist-ai-600-1` — US National Institute of Standards and Technology

**AI Risk Management Framework: Generative AI Profile (NIST AI 600-1)**

| | |
| --- | --- |
| Published | 2024-07-26 |
| Located and read | 2026-08-21 |
| Primary / authoritative | yes |
| URL | https://nvlpubs.nist.gov/nistpubs/ai/NIST.AI.600-1.pdf |

*Limitations.* Names confabulation (hallucination) as a primary risk category and organises suggested actions around governance, content provenance, pre-deployment testing, and incident disclosure. It is a governance-level risk profile, NOT a technical standard: it prescribes no implementation and sets no acceptance thresholds. Published counts of risks and actions differ between the NIST press release and the AIRC knowledge base. AI RMF 1.0 is under revision, so currency should be re-checked.

### `owasp-secrets` — OWASP

**Secrets Management Cheat Sheet (OWASP Cheat Sheet Series)**

| | |
| --- | --- |
| Published | — |
| Located and read | 2026-08-21 |
| Primary / authoritative | yes |
| URL | https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html |

*Limitations.* Community-maintained security guidance, widely accepted but not a certifiable standard and not versioned in a way that supports precise citation of a revision. States that secrets must not be hardcoded in source or littered through configuration files, that secrets appearing in logs require a removal process, that least privilege applies to secret access, and that secrets management must be centralised with defined creation, rotation, revocation, and expiry.

### `owasp-authorization` — OWASP

**Authorization Cheat Sheet (OWASP Cheat Sheet Series)**

| | |
| --- | --- |
| Published | — |
| Located and read | 2026-08-22 |
| Primary / authoritative | yes |
| URL | https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html |

*Limitations.* Community-maintained security guidance, same status as the Secrets Management Cheat Sheet above: widely accepted, not a certifiable standard, not precisely versioned. States least privilege as assigning users only the minimum privileges necessary for their function, applied both horizontally (peers should not all get the same broad access) and vertically (by role), and recommends periodic review against privilege creep. Does NOT itself specify time-boxed or expiring access grants in its least-privilege guidance; that expectation is carried instead by `owasp-secrets`, cited alongside it here.

### `hubspot-customer-onboarding` — HubSpot

**Customer Onboarding: Definition, Best Practices, and Key Metrics**

| | |
| --- | --- |
| Published | — |
| Located and read | 2026-08-22 |
| Primary / authoritative | no |
| URL | https://blog.hubspot.com/service/customer-onboarding |

*Limitations.* Vendor blog content aimed at SaaS/customer-success teams, not a controlled study. Directly supports two general principles used here: passing sales-established context forward so the customer does not repeat themselves, and defining onboarding goals around the customer’s own outcome rather than a checklist of steps. The page also cites a third-party churn statistic from a 2025 Rocketlane report; that statistic was NOT independently located or verified and is deliberately not repeated in this canon. Kestrel is a project-based B2B professional-services firm, not a SaaS company, so transfer is for the general principle only, never for any onboarding-duration or churn benchmark.

### `gainsight-onboarding-metrics` — Gainsight

**Customer Onboarding Metrics (Glossary)**

| | |
| --- | --- |
| Published | — |
| Located and read | 2026-08-22 |
| Primary / authoritative | no |
| URL | https://www.gainsight.com/glossary/entry/customer-onboarding-metrics/ |

*Limitations.* Vendor glossary content from a customer-success software company, explicitly written for SaaS onboarding. Corroborates time-to-value and onboarding-completion-rate as conventional onboarding metrics, independently of HubSpot. Notably does NOT cover "customer effort" as a metric at all among the seven it lists — checked specifically for this and absent, so this canon does not cite it as evidence for measuring customer effort. Not an authority on professional-services onboarding.

### `stripe-ar-aging` — Stripe

**Accounts receivable aging explained**

| | |
| --- | --- |
| Published | — |
| Located and read | 2026-08-21 |
| Primary / authoritative | no |
| URL | https://stripe.com/resources/more/accounts-receivable-aging-explained-what-it-is-how-it-works-and-how-to-calculate-it |

*Limitations.* Vendor educational content, not an accounting standard. Useful for confirming that the current / 1-30 / 31-60 / 61-90 / 90+ bucket convention is conventional, but bucket boundaries vary between systems (Stripe’s own report extends to 91-120 and over 120). Health thresholds quoted in such guides are rules of thumb, not established benchmarks.

### `xero-ar-aging` — Xero

**Accounts receivable aging report**

| | |
| --- | --- |
| Published | — |
| Located and read | 2026-08-21 |
| Primary / authoritative | no |
| URL | https://www.xero.com/us/guides/accounts-receivable-aging-report/ |

*Limitations.* Vendor educational content. Corroborates the aging bucket convention and the DSO formulation independently of Stripe, which is why both are cited. Not an authority on collection practice, and its guidance is aimed at small business generally rather than B2B professional services.

### `cfpb-reg-f` — US Consumer Financial Protection Bureau

**Regulation F, 12 CFR 1006.2 Definitions; FDCPA examination procedures**

| | |
| --- | --- |
| Published | — |
| Located and read | 2026-08-21 |
| Primary / authoritative | yes |
| URL | https://www.consumerfinance.gov/rules-policy/regulations/1006/2/ |

*Limitations.* CRITICAL SCOPE LIMIT, and the reason this source is cited at all: the FDCPA covers debts incurred by a natural person primarily for personal, family, or household purposes. CFPB examination procedures state that it does not apply to corporate debt or debt owed for business purposes. It therefore does NOT govern a B2B firm collecting its own invoices, and must not be presented as if it did.

### `ftc-fdcpa-alias` — US Federal Trade Commission

**Think your company's not covered by the FDCPA? You may want to think again.**

| | |
| --- | --- |
| Published | 2015-12 |
| Located and read | 2026-08-21 |
| Primary / authoritative | yes |
| URL | https://www.ftc.gov/business-guidance/blog/2015/12/think-your-companys-not-covered-fdcpa-you-may-want-think-again |

*Limitations.* An FTC business blog post, which is guidance rather than regulation. Records the exception that matters here: a creditor collecting its own debts under a name other than its own, implying a third party is collecting, can itself become a debt collector under FDCPA section 803(6). Also notes that conduct outside FDCPA scope remains subject to the FTC Act section 5 prohibition on deceptive or unfair practices, and that some state laws reach original creditors. A 2015 post; current status not re-confirmed against the statute.

### `hubspot-next-steps` — HubSpot

**Review recommended next steps for deals**

| | |
| --- | --- |
| Published | 2026-08-04 |
| Located and read | 2026-08-21 |
| Primary / authoritative | yes |
| URL | https://knowledge.hubspot.com/meetings-tool/review-recommended-next-steps-for-deals |

*Limitations.* Product documentation for a beta feature (Super Admin opt-in, gated behind Sales/Service Hub Professional/Enterprise), not a research study. It describes HOW to use structured next-step capture, not evidence that using it improves outcomes — the rationale is inferred from the vendor building and gating the feature this way, not stated as a finding. Clear vendor commercial interest in the product being documented.

### `salesforce-pipeline-exit-criteria` — Salesforce

**Sales Pipeline Management: A Complete Guide and the Best Tools in 2026**

| | |
| --- | --- |
| Published | 2026-04-06 |
| Located and read | 2026-08-21 |
| Primary / authoritative | yes |
| URL | https://www.salesforce.com/sales/pipeline/management/ |

*Limitations.* Staff-authored guidance on salesforce.com, editorial/marketing-adjacent (the same page also promotes Sales Cloud and lists competitor CRMs), not formal product documentation or a controlled study. States a best practice — defining measurable exit criteria per stage — rather than measured evidence that doing so improves outcomes. A companion page (salesforce.com/sales/pipeline/stages/) was checked first and did NOT contain this guidance; it was located on this page instead, not assumed from a search snippet.

### `iso-8000` — International Organization for Standardization

**ISO 8000 series - Data quality (ISO/TC 184/SC 4), with ISO/IEC 25012**

| | |
| --- | --- |
| Published | — |
| Located and read | **never — not yet located and read** |
| Primary / authoritative | yes |
| URL | — (no stable publisher-hosted URL located) |

*Limitations.* NOT READ IN PRIMARY TEXT during this pass: the standards are paywalled, and scope was established only from secondary descriptions. Any standard citing this must remain PENDING_VERIFICATION until the normative text is obtained. Understood to define data quality characteristics and requirements for verification and exchange, with ISO/IEC 25012 defining which characteristics exist and ISO 8000 defining how to verify them.

### `dama-dmbok` — DAMA International

**DAMA-DMBOK: Data Management Body of Knowledge**

| | |
| --- | --- |
| Published | 2009 (first edition) |
| Located and read | **never — not yet located and read** |
| Primary / authoritative | no |
| URL | — (no stable publisher-hosted URL located) |

*Limitations.* NOT READ IN PRIMARY TEXT during this pass. A vendor-neutral knowledge framework rather than a prescriptive standard, commonly cited for the data quality dimensions of accuracy, completeness, consistency, timeliness, uniqueness, and validity. Cited here only as corroboration that these dimensions are conventionally codified, not as an authority on any threshold.

## Every claim

| System | Claim | Provenance | Verification | Sources |
| --- | --- | --- | --- | --- |
| Lead Rescue | Delay between an inbound enquiry and a first meaningful response is associated with materially lower odds of making contact and of qualifying the lead. | EVIDENCE | DISPUTED_OR_WEAK | mit-insidesales-lrm-2007 |
| Lead Rescue | Typical organisational first-response times to inbound enquiries are substantially slower than the window in which response appears to matter most. | EVIDENCE | PENDING_VERIFICATION | hbr-short-life-2011 |
| Lead Rescue | Commercial email carries legal obligations: accurate header information, a non-deceptive subject line, identification as an advertisement, a valid physical postal address, and a working opt-out mechanism honoured within 10 business days. | EVIDENCE | VERIFIED | ftc-can-spam |
| Lead Rescue | Event delivery to an endpoint is at-least-once: the same business event can legitimately arrive more than once, and retries of undelivered events compound this. Consumers must therefore key and deduplicate the external actions they take. | EVIDENCE | VERIFIED | stripe-webhooks, stripe-idempotency |
| Lead Rescue | The intended orchestration runtime provides node-level retry with bounded attempts, a separate error output branch, and dedicated error workflows. Failure handling is an explicit design responsibility, not an automatic property of the runtime. | EVIDENCE | VERIFIED | n8n-error-handling |
| Lead Rescue | Every valid inbound event finishes the observation window in a terminal state, a waiting state, or human review. Silent disappearance counts as a defect. | LAB_TARGET | NOT_APPLICABLE | — |
| Lead Rescue | Replayed duplicate events produce zero duplicate external actions. | LAB_TARGET | NOT_APPLICABLE | — |
| Lead Rescue | Every low-confidence or policy-sensitive case has a safe path to a person, and takes it rather than acting. | LAB_TARGET | NOT_APPLICABLE | — |
| Lead Rescue | The simulated acknowledgement and routing paths are designed around a configurable speed-to-lead objective. The specific interval is a client policy value and is not asserted as a universal benchmark. | LAB_TARGET | NOT_APPLICABLE | — |
| Lead Rescue | A side effect whose outcome is unknown is retried only after independent verification proves it did not occur, or when the provider itself guarantees idempotent processing of the same key. It is never retried on the strength of an assumption. | LAB_TARGET | NOT_APPLICABLE | — |
| Dormant Pipeline Recovery | Commercial email requires a working opt-out honoured within 10 business days, and addresses that have opted out may not be sold or transferred. Permission is a property of the contact, not of the campaign. | EVIDENCE | VERIFIED | ftc-can-spam |
| Dormant Pipeline Recovery | Email open tracking is unreliable as a signal of recipient attention. Apple Mail preloads remote content on receipt rather than on open and prevents senders from seeing whether a message was opened, so tracking pixels fire regardless of whether anyone read the message. | EVIDENCE | VERIFIED | apple-mpp |
| Dormant Pipeline Recovery | Event and job delivery is at-least-once, so a reactivation attempt can be triggered more than once for the same record unless external actions are keyed and deduplicated. | EVIDENCE | VERIFIED | stripe-webhooks |
| Dormant Pipeline Recovery | No record may enter outreach without an explicit re-entry reason drawn from the declared set. Elapsed inactivity is not a reason. | LAB_TARGET | NOT_APPLICABLE | — |
| Dormant Pipeline Recovery | Every sequence declares entry criteria, cadence, maximum attempts, exit conditions, suppression conditions, and re-entry conditions before it is permitted to run. | LAB_TARGET | NOT_APPLICABLE | — |
| Call-to-Proposal Revenue Agent | Generative models produce fluent output that is not grounded in their input. Confabulation is a named primary risk category requiring managed controls, not an occasional defect to be tuned away. | EVIDENCE | VERIFIED | nist-ai-600-1 |
| Call-to-Proposal Revenue Agent | Human oversight and intervention are governance-level controls in recognised AI risk management practice, alongside content provenance and pre-deployment testing. | EVIDENCE | VERIFIED | nist-ai-600-1 |
| Call-to-Proposal Revenue Agent | Current CRM practice treats a call's recommended next step as a structured, reviewable output distinct from freeform notes, gated by objective capture criteria. | EVIDENCE | VERIFIED | hubspot-next-steps |
| Call-to-Proposal Revenue Agent | Current pipeline-management guidance holds that a deal should only advance to the next stage when defined, measurable exit criteria for the current stage are actually met, not on rep judgment or activity alone. | EVIDENCE | VERIFIED | salesforce-pipeline-exit-criteria |
| Call-to-Proposal Revenue Agent | A package containing any claim that resolves to no cited passage and no human-supplied fact does not reach a reviewer. | LAB_TARGET | NOT_APPLICABLE | — |
| Call-to-Proposal Revenue Agent | Information the conversation did not establish remains marked unknown through the whole pipeline and is never replaced by a plausible default. | LAB_TARGET | NOT_APPLICABLE | — |
| Call-to-Proposal Revenue Agent | Facts supplied by a person during clarification are recorded with that person as their source, distinguishable from facts derived from the transcript. | LAB_TARGET | NOT_APPLICABLE | — |
| Client Onboarding Operator | Secrets must not be hardcoded in source or scattered through configuration, must not be left in logs without a removal process, must be held in a centralised store under least privilege, and must have defined creation, rotation, revocation, and expiry. | EVIDENCE | VERIFIED | owasp-secrets |
| Client Onboarding Operator | Operations that create resources must be idempotent, because delivery and retry semantics guarantee that a creation instruction can be received more than once. The established pattern is a caller-supplied key recorded before the operation. | EVIDENCE | VERIFIED | stripe-idempotency, stripe-webhooks |
| Client Onboarding Operator | Access must be scoped to the minimum privilege necessary for the requesting role’s function, applied both horizontally and vertically, with periodic review against privilege creep. | EVIDENCE | VERIFIED | owasp-authorization |
| Client Onboarding Operator | Current customer-onboarding practice passes sales-established context forward so the customer is not asked to start from scratch, and treats a defined value milestone — not checklist completion — as the onboarding success criterion. | EVIDENCE | VERIFIED | hubspot-customer-onboarding, gainsight-onboarding-metrics |
| Client Onboarding Operator | Information already held in the record is never requested from the customer again without a recorded reason. | LAB_TARGET | NOT_APPLICABLE | — |
| Client Onboarding Operator | Onboarding is complete when declared value criteria are satisfied, not when a checklist is exhausted. | LAB_TARGET | NOT_APPLICABLE | — |
| Client Onboarding Operator | Missing information and contradictory information are distinct conditions with distinct paths. Contradiction requires a person; absence does not. | LAB_TARGET | NOT_APPLICABLE | — |
| Receivables / Invoice Recovery Agent | Receivables are conventionally aged into current, 1–30, 31–60, 61–90, and 90+ day buckets, where days past due is the evaluation date minus the due date. Bucket boundaries beyond 90 days vary between systems. | EVIDENCE | VERIFIED | stripe-ar-aging, xero-ar-aging |
| Receivables / Invoice Recovery Agent | The US Fair Debt Collection Practices Act governs debts incurred by a natural person primarily for personal, family, or household purposes, and applies principally to third parties collecting debts owed to another. It does not govern a business collecting its own commercial invoices from another business. | EVIDENCE | VERIFIED | cfpb-reg-f, ftc-fdcpa-alias |
| Receivables / Invoice Recovery Agent | The accounting system is the sole authority for invoice identity, amount, due date, balance, and payment status. This system reads that truth and never writes or contradicts it. | LAB_TARGET | NOT_APPLICABLE | — |
| Receivables / Invoice Recovery Agent | Payment, dispute, an accepted promise to pay, and an approved payment plan each halt the normal collection cadence immediately. | LAB_TARGET | NOT_APPLICABLE | — |
| Receivables / Invoice Recovery Agent | No automated message may reference legal consequences, threaten action, or characterise contractual rights. Such communications are human-authored and human-approved. | LAB_TARGET | NOT_APPLICABLE | — |
| Owner Revenue Intelligence Agent | Generative models produce fluent explanations that are not grounded in their inputs, and confabulation is a named primary risk requiring managed controls. Narrative explanation of a metric movement is exactly the shape of output most prone to it. | EVIDENCE | VERIFIED | nist-ai-600-1 |
| Owner Revenue Intelligence Agent | Data quality is conventionally decomposed into named dimensions including accuracy, completeness, consistency, and timeliness, and these are codified in international standards and industry bodies of knowledge. | EVIDENCE | PENDING_VERIFICATION | iso-8000, dama-dmbok |
| Owner Revenue Intelligence Agent | No figure is surfaced without a registered definition, a named source record, and a freshness timestamp. | LAB_TARGET | NOT_APPLICABLE | — |
| Owner Revenue Intelligence Agent | No causal explanation is asserted. Contributing factors are presented as candidates with their supporting evidence, and the absence of a determined cause is stated. | LAB_TARGET | NOT_APPLICABLE | — |
| Owner Revenue Intelligence Agent | This system observes and recommends. It holds no authority above level 1 for any action, regardless of confidence or corroboration. | LAB_TARGET | NOT_APPLICABLE | — |

## Client policy values

These are Kestrel Compliance Group's own operating parameters. They are **not** evidence and not
benchmarks — a different operator could rationally choose differently. Each threshold the
engine actually compares against is linked to the policy it implements.

| Parameter | Value | Unit | Implements |
| --- | --- | --- | --- |
| Bounded judgment confidence floor | 0.7 | probability | `kestrel-confidence-floor` |
| Acknowledgement target | 300 | seconds | `kestrel-ack-window` |
| Routing target, business hours | 30 | minutes | `kestrel-routing-window` |
| Maximum clarifying questions before human review | 2 | questions | `kestrel-routing-window` |
| Reply wait window before escalation | 24 | hours | `kestrel-reply-wait-window` |
| Booking offer wait window before escalation | 48 | hours | `kestrel-booking-offer-window` |
| Human review attention timeout | 24 | hours | `kestrel-review-timeout-window` |
| Ready-but-undespatched attention timeout | 8 | hours | `kestrel-dispatch-timeout-window` |
| Maximum reactivation attempts | 3 | attempts | `kestrel-outreach-cadence` |
| Reactivation sequence window | 21 | days | `kestrel-outreach-cadence` |
| Cooling-off before re-entry | 90 | days | `kestrel-outreach-cadence` |
| Minimum confidence to accept an entity match | 0.9 | probability | `kestrel-entity-resolution` |
| Escalation to founder past due | 45 | days past due | `kestrel-collection-cadence` |
| Maximum authority for outbound commercial documents | 2 | authority level | `kestrel-proposal-authority` |
| Analysis input staleness tolerance | 96 | hours | `kestrel-analysis-freshness` |
| Exception-candidate variance threshold | 12 | percent | `kestrel-exception-materiality` |
