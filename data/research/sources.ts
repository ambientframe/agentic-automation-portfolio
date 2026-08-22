import { SourceRefSchema, type SourceRef } from '@/lib/model/provenance';

/**
 * THE SOURCE LEDGER.
 *
 * Inert data. Nothing here is fetched at build, typecheck, or test time — see the
 * header of `lib/model/provenance.ts`. `checkedOn` records when a human or agent
 * actually located and read the source; its absence means the source has never been
 * read and any standard citing it must be PENDING_VERIFICATION.
 *
 * `limitations` is mandatory and must be substantive. A source whose limitations read
 * "none" is a source nobody examined properly.
 *
 * Research pass: 2026-08-21.
 */

const RAW: readonly SourceRef[] = [
  // -------------------------------------------------------------------------
  // Consent, permission, and commercial email
  // -------------------------------------------------------------------------
  {
    id: 'ftc-can-spam',
    organization: 'US Federal Trade Commission',
    title: 'CAN-SPAM Act: A Compliance Guide for Business',
    url: 'https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business',
    checkedOn: '2026-08-21',
    primary: true,
    limitations:
      'US federal law for commercial email only. Says nothing about SMS, telephone, or non-US jurisdictions, and sets a compliance floor rather than a standard of good practice. State laws and other jurisdictions may impose stricter duties. The guide is undated on its face, so the precise revision read cannot be pinned.',
  },

  // -------------------------------------------------------------------------
  // Response latency
  // -------------------------------------------------------------------------
  {
    id: 'mit-insidesales-lrm-2007',
    organization: 'MIT Sloan School of Management / InsideSales.com',
    title: 'Lead Response Management Study (James B. Oldroyd)',
    publishedOn: '2007',
    primary: true,
    limitations:
      'THIS IS THE ACTUAL SOURCE of the widely repeated "5 minutes vs 30 minutes = 100x contact / 21x qualification" figures, which are very frequently misattributed to Harvard Business Review. Serious limitations: six companies, roughly 15,000 leads and 100,000 call attempts, a non-random convenience sample; co-produced with a vendor holding a direct commercial interest in the conclusion; and 2007 data that predates present-day buying and channel behaviour. No stable publisher-hosted URL was located during this pass, only third-party PDF mirrors, so no URL is recorded. Treated as directional only and never as a benchmark.',
  },
  {
    id: 'hbr-short-life-2011',
    organization: 'Harvard Business Review',
    title: 'The Short Life of Online Sales Leads (Oldroyd, McElheran, Elkington)',
    url: 'https://hbr.org/2011/03/the-short-life-of-online-sales-leads',
    publishedOn: '2011-03',
    checkedOn: '2026-08-21',
    primary: true,
    limitations:
      'Existence, authorship, venue, and date were confirmed against hbr.org and hbs.edu. The full text is paywalled and WAS NOT READ during this pass, so the audit statistics commonly attributed to it (a 42-hour average first response across 2,241 firms; 23% never responding) remain unverified in the primary text. A two-page Forethought piece, not a peer-reviewed study. Fifteen years old.',
  },

  // -------------------------------------------------------------------------
  // Delivery semantics and idempotency
  // -------------------------------------------------------------------------
  {
    id: 'stripe-webhooks',
    organization: 'Stripe',
    title: 'Receive Stripe events in your webhook endpoint',
    url: 'https://docs.stripe.com/webhooks',
    checkedOn: '2026-08-21',
    primary: true,
    limitations:
      'Authoritative for Stripe’s own delivery semantics, which explicitly warn that an endpoint may receive the same event more than once and that undelivered events are retried for up to three days. At-least-once delivery is a general property of webhook and queue systems, but this source establishes it only for Stripe; other providers must be confirmed separately.',
  },
  {
    id: 'stripe-idempotency',
    organization: 'Stripe',
    title: 'Idempotent requests (API Reference)',
    url: 'https://docs.stripe.com/api/idempotent_requests',
    checkedOn: '2026-08-21',
    primary: true,
    limitations:
      'Documents one vendor’s implementation, including a 24-hour key expiry that is specific to Stripe and not a general rule. Establishes the pattern, not universal parameters.',
  },

  // -------------------------------------------------------------------------
  // Engagement measurement
  // -------------------------------------------------------------------------
  {
    id: 'apple-mpp',
    organization: 'Apple',
    title: 'Mail Privacy Protection',
    url: 'https://www.apple.com/legal/privacy/data/en/mail-privacy-protection/',
    checkedOn: '2026-08-21',
    primary: true,
    limitations:
      'Establishes that Apple Mail preloads remote content on receipt and prevents senders from seeing whether a message was opened, which makes open-tracking unreliable and IP geolocation inaccurate for affected recipients. It does NOT quantify what share of any particular audience this covers; that varies by audience and must be measured, not assumed.',
  },

  // -------------------------------------------------------------------------
  // Orchestration runtime behaviour
  // -------------------------------------------------------------------------
  {
    id: 'n8n-error-handling',
    organization: 'n8n',
    title: 'Handle errors gracefully (n8n Docs)',
    url: 'https://docs.n8n.io/build/flow-logic/handle-errors-gracefully',
    checkedOn: '2026-08-21',
    primary: true,
    limitations:
      'Official vendor documentation for the intended orchestration runtime. Documents error workflows, the Error Trigger node, node-level Retry On Fail with Max Tries and Wait Between Tries, and the On Error choice between stopping, continuing, and continuing via a separate error output. Documentation URLs on this site have moved before; the path recorded here was live on the check date. Describes capability, not any guarantee about a particular deployment.',
  },

  // -------------------------------------------------------------------------
  // AI risk
  // -------------------------------------------------------------------------
  {
    id: 'nist-ai-600-1',
    organization: 'US National Institute of Standards and Technology',
    title: 'AI Risk Management Framework: Generative AI Profile (NIST AI 600-1)',
    url: 'https://nvlpubs.nist.gov/nistpubs/ai/NIST.AI.600-1.pdf',
    publishedOn: '2024-07-26',
    checkedOn: '2026-08-21',
    primary: true,
    limitations:
      'Names confabulation (hallucination) as a primary risk category and organises suggested actions around governance, content provenance, pre-deployment testing, and incident disclosure. It is a governance-level risk profile, NOT a technical standard: it prescribes no implementation and sets no acceptance thresholds. Published counts of risks and actions differ between the NIST press release and the AIRC knowledge base. AI RMF 1.0 is under revision, so currency should be re-checked.',
  },

  // -------------------------------------------------------------------------
  // Secrets and access
  // -------------------------------------------------------------------------
  {
    id: 'owasp-secrets',
    organization: 'OWASP',
    title: 'Secrets Management Cheat Sheet (OWASP Cheat Sheet Series)',
    url: 'https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html',
    checkedOn: '2026-08-21',
    primary: true,
    limitations:
      'Community-maintained security guidance, widely accepted but not a certifiable standard and not versioned in a way that supports precise citation of a revision. States that secrets must not be hardcoded in source or littered through configuration files, that secrets appearing in logs require a removal process, that least privilege applies to secret access, and that secrets management must be centralised with defined creation, rotation, revocation, and expiry.',
  },
  {
    id: 'owasp-authorization',
    organization: 'OWASP',
    title: 'Authorization Cheat Sheet (OWASP Cheat Sheet Series)',
    url: 'https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html',
    checkedOn: '2026-08-22',
    primary: true,
    limitations:
      'Community-maintained security guidance, same status as the Secrets Management Cheat Sheet above: widely accepted, not a certifiable standard, not precisely versioned. States least privilege as assigning users only the minimum privileges necessary for their function, applied both horizontally (peers should not all get the same broad access) and vertically (by role), and recommends periodic review against privilege creep. Does NOT itself specify time-boxed or expiring access grants in its least-privilege guidance; that expectation is carried instead by `owasp-secrets`, cited alongside it here.',
  },

  // -------------------------------------------------------------------------
  // Customer onboarding practice
  // -------------------------------------------------------------------------
  {
    id: 'hubspot-customer-onboarding',
    organization: 'HubSpot',
    title: 'Customer Onboarding: Definition, Best Practices, and Key Metrics',
    url: 'https://blog.hubspot.com/service/customer-onboarding',
    checkedOn: '2026-08-22',
    primary: false,
    limitations:
      'Vendor blog content aimed at SaaS/customer-success teams, not a controlled study. Directly supports two general principles used here: passing sales-established context forward so the customer does not repeat themselves, and defining onboarding goals around the customer’s own outcome rather than a checklist of steps. The page also cites a third-party churn statistic from a 2025 Rocketlane report; that statistic was NOT independently located or verified and is deliberately not repeated in this canon. Kestrel is a project-based B2B professional-services firm, not a SaaS company, so transfer is for the general principle only, never for any onboarding-duration or churn benchmark.',
  },
  {
    id: 'gainsight-onboarding-metrics',
    organization: 'Gainsight',
    title: 'Customer Onboarding Metrics (Glossary)',
    url: 'https://www.gainsight.com/glossary/entry/customer-onboarding-metrics/',
    checkedOn: '2026-08-22',
    primary: false,
    limitations:
      'Vendor glossary content from a customer-success software company, explicitly written for SaaS onboarding. Corroborates time-to-value and onboarding-completion-rate as conventional onboarding metrics, independently of HubSpot. Notably does NOT cover "customer effort" as a metric at all among the seven it lists — checked specifically for this and absent, so this canon does not cite it as evidence for measuring customer effort. Not an authority on professional-services onboarding.',
  },

  // -------------------------------------------------------------------------
  // Receivables and collection
  // -------------------------------------------------------------------------
  {
    id: 'stripe-ar-aging',
    organization: 'Stripe',
    title: 'Accounts receivable aging explained',
    url: 'https://stripe.com/resources/more/accounts-receivable-aging-explained-what-it-is-how-it-works-and-how-to-calculate-it',
    checkedOn: '2026-08-21',
    primary: false,
    limitations:
      'Vendor educational content, not an accounting standard. Useful for confirming that the current / 1-30 / 31-60 / 61-90 / 90+ bucket convention is conventional, but bucket boundaries vary between systems (Stripe’s own report extends to 91-120 and over 120). Health thresholds quoted in such guides are rules of thumb, not established benchmarks.',
  },
  {
    id: 'xero-ar-aging',
    organization: 'Xero',
    title: 'Accounts receivable aging report',
    url: 'https://www.xero.com/us/guides/accounts-receivable-aging-report/',
    checkedOn: '2026-08-21',
    primary: false,
    limitations:
      'Vendor educational content. Corroborates the aging bucket convention and the DSO formulation independently of Stripe, which is why both are cited. Not an authority on collection practice, and its guidance is aimed at small business generally rather than B2B professional services.',
  },
  {
    id: 'cfpb-reg-f',
    organization: 'US Consumer Financial Protection Bureau',
    title: 'Regulation F, 12 CFR 1006.2 Definitions; FDCPA examination procedures',
    url: 'https://www.consumerfinance.gov/rules-policy/regulations/1006/2/',
    checkedOn: '2026-08-21',
    primary: true,
    limitations:
      'CRITICAL SCOPE LIMIT, and the reason this source is cited at all: the FDCPA covers debts incurred by a natural person primarily for personal, family, or household purposes. CFPB examination procedures state that it does not apply to corporate debt or debt owed for business purposes. It therefore does NOT govern a B2B firm collecting its own invoices, and must not be presented as if it did.',
  },
  {
    id: 'ftc-fdcpa-alias',
    organization: 'US Federal Trade Commission',
    title: "Think your company's not covered by the FDCPA? You may want to think again.",
    url: 'https://www.ftc.gov/business-guidance/blog/2015/12/think-your-companys-not-covered-fdcpa-you-may-want-think-again',
    publishedOn: '2015-12',
    checkedOn: '2026-08-21',
    primary: true,
    limitations:
      'An FTC business blog post, which is guidance rather than regulation. Records the exception that matters here: a creditor collecting its own debts under a name other than its own, implying a third party is collecting, can itself become a debt collector under FDCPA section 803(6). Also notes that conduct outside FDCPA scope remains subject to the FTC Act section 5 prohibition on deceptive or unfair practices, and that some state laws reach original creditors. A 2015 post; current status not re-confirmed against the statute.',
  },

  // -------------------------------------------------------------------------
  // Discovery-call capture and pipeline-stage integrity
  // -------------------------------------------------------------------------
  {
    id: 'hubspot-next-steps',
    organization: 'HubSpot',
    title: 'Review recommended next steps for deals',
    url: 'https://knowledge.hubspot.com/meetings-tool/review-recommended-next-steps-for-deals',
    publishedOn: '2026-08-04',
    checkedOn: '2026-08-21',
    primary: true,
    limitations:
      'Product documentation for a beta feature (Super Admin opt-in, gated behind Sales/Service Hub Professional/Enterprise), not a research study. It describes HOW to use structured next-step capture, not evidence that using it improves outcomes — the rationale is inferred from the vendor building and gating the feature this way, not stated as a finding. Clear vendor commercial interest in the product being documented.',
  },
  {
    id: 'salesforce-pipeline-exit-criteria',
    organization: 'Salesforce',
    title: 'Sales Pipeline Management: A Complete Guide and the Best Tools in 2026',
    url: 'https://www.salesforce.com/sales/pipeline/management/',
    publishedOn: '2026-04-06',
    checkedOn: '2026-08-21',
    primary: true,
    limitations:
      'Staff-authored guidance on salesforce.com, editorial/marketing-adjacent (the same page also promotes Sales Cloud and lists competitor CRMs), not formal product documentation or a controlled study. States a best practice — defining measurable exit criteria per stage — rather than measured evidence that doing so improves outcomes. A companion page (salesforce.com/sales/pipeline/stages/) was checked first and did NOT contain this guidance; it was located on this page instead, not assumed from a search snippet.',
  },

  // -------------------------------------------------------------------------
  // Data quality and metric governance
  // -------------------------------------------------------------------------
  {
    id: 'iso-8000',
    organization: 'International Organization for Standardization',
    title: 'ISO 8000 series - Data quality (ISO/TC 184/SC 4), with ISO/IEC 25012',
    primary: true,
    limitations:
      'NOT READ IN PRIMARY TEXT during this pass: the standards are paywalled, and scope was established only from secondary descriptions. Any standard citing this must remain PENDING_VERIFICATION until the normative text is obtained. Understood to define data quality characteristics and requirements for verification and exchange, with ISO/IEC 25012 defining which characteristics exist and ISO 8000 defining how to verify them.',
  },
  {
    id: 'dama-dmbok',
    organization: 'DAMA International',
    title: 'DAMA-DMBOK: Data Management Body of Knowledge',
    publishedOn: '2009 (first edition)',
    primary: false,
    limitations:
      'NOT READ IN PRIMARY TEXT during this pass. A vendor-neutral knowledge framework rather than a prescriptive standard, commonly cited for the data quality dimensions of accuracy, completeness, consistency, timeliness, uniqueness, and validity. Cited here only as corroboration that these dimensions are conventionally codified, not as an authority on any threshold.',
  },
];

/** Parsed at module load so a malformed source ref fails fast rather than at render time. */
export const SOURCES: readonly SourceRef[] = RAW.map((s) => SourceRefSchema.parse(s));

export const SOURCE_BY_ID: ReadonlyMap<string, SourceRef> = new Map(SOURCES.map((s) => [s.id, s]));

export function sourceById(id: string): SourceRef | undefined {
  return SOURCE_BY_ID.get(id);
}

/** True when the source has actually been located and read at some point. */
export function hasBeenRead(source: SourceRef): boolean {
  return source.checkedOn !== undefined;
}
