import { BusinessProfileSchema, type BusinessProfile } from '@/lib/model/profile';

/**
 * A 22-PERSON US ACCOUNTING, BOOKKEEPING AND CLIENT ADVISORY SERVICES FIRM.
 *
 * Authored from a research brief on the trade, so the vocabulary, the shape of the money, and
 * the failure modes are the ones practitioners use rather than a model's guess at them. Where
 * the brief established a figure, the figure below is calibrated against it and the calibration
 * is stated in the register entry. Where the brief established that NO convention exists — and
 * for most of this profile's seventeen thresholds it established exactly that — the value here
 * was CHOSEN, and the policy it links to says on what reasoning.
 *
 * WHY THIS VERTICAL IS NOT A RENAMED CONSULTANCY. Three things about it are structural rather
 * than cosmetic, and each one moves a threshold:
 *
 *   1. The binding clock is the MONTH, not the hour. The profession sells a monthly close with
 *      controller-level oversight, so `inputStalenessToleranceHours` is 720 and not a working
 *      week. Owner reporting draws on a closed period or it draws on nothing.
 *   2. The binding gate is LEGAL, not temporal. A prepared return does not become sendable by
 *      waiting; it becomes sendable when a signed Form 8879 arrives. A regulator has already
 *      written this trade's automation policy, and it says final decisions rest with a
 *      credentialed person — hence a confidence floor of 0.95 and an identity threshold of 1.
 *   3. The expensive failure is INBOUND DOCUMENTS, not outbound sales. Engagements run late
 *      because the firm is waiting on a client, so the reply-wait and review windows are tight
 *      while the acknowledgement window is deliberately slack.
 *
 * EVERYTHING HERE IS FICTIONAL. `provenance` is pinned to `FIXTURE` so no figure below can be
 * read as a researched benchmark about a real firm. The figures are nonetheless reconcilable:
 * `validateProfileConsistency` checks that revenue, engagement values, client counts and lead
 * volume describe one coherent firm, and the funnel and both revenue streams reconstruct the
 * stated revenue exactly rather than within tolerance.
 *
 * ON THE NAME. The directory slug is the one this profile was assigned. The trading name is
 * not, because the assigned name matches at least two real accounting practices found while
 * researching — a Canadian CPA firm and a US LLC — and §11 of the authoring packet requires an
 * invented name in that case. `Ashcombe` was checked for the same collision and no US
 * accounting firm operates under it.
 */
export const ASHCOMBE: BusinessProfile = BusinessProfileSchema.parse({
  id: 'ashcombe',
  name: 'Ashcombe CPAs & Advisors',
  tagline:
    'Monthly close, controller review, and business tax compliance for owner-managed companies that have outgrown a part-time bookkeeper.',

  provenance: 'FIXTURE',
  fictionalDisclosure:
    'Ashcombe CPAs & Advisors is a fictional firm. It holds no licence, has no clients, no revenue, and no existence outside this repository, and nothing below describes a real practice. Every figure is a synthetic assumption calibrated against published accounting-industry benchmarks; the sources describe an industry and verify nothing about this firm, because there is no firm.',

  company: {
    headcount: 22,
    approximateAnnualRevenue: 3_750_000,
    foundedYear: 2009,
    operatingModel:
      'Twenty-two employees: three equity partners, fifteen professional staff split roughly ten to the client advisory desk and five to tax, and four administrative. Recurring close work is supplemented by a contracted offshore preparation pod of about five full-time equivalents who are not employees and to whom no return information is disclosed without prior written client consent. Whole-firm fees run to roughly $208,000 per professional employee; the advisory desk, counting the contracted preparers in its own denominator, runs materially lower per head, which is the ordinary shape of the trade rather than an underperformance.',
    explicitlyNot: [
      'Does not perform audits, reviews, or any other attest engagement, and never opines on financial statements the firm itself prepared.',
      'Does not give legal advice or draft legal instruments, and does not put an uncredentialed person in front of the IRS as a representative.',
      'Does not give investment advice, hold client funds, or take custody of a client bank account, and never directs a client refund into a firm-controlled account.',
      'Does not assume management responsibility for a client. The firm records and advises; the owner decides, and that duty cannot be outsourced to the firm.',
      'Does not sell bookkeeping-only or one-off cleanup as a standalone product. Cleanup is scoped as the first phase of a subscription or it is declined.',
    ],
  },

  serviceLines: [
    {
      id: 'monthly-close',
      name: 'Monthly Close & Controller Review',
      description:
        'Transaction coding, bank and credit-card reconciliation, accounts payable and receivable, payroll runs and the quarterly and annual payroll filings that follow them, closed monthly and reviewed at controller level against a standing reporting pack.',
      deliveryModel: 'RECURRING',
      typicalValue: 2_200,
    },
    {
      id: 'advisory-cfo',
      name: 'Business Insights & CFO Advisory',
      description:
        'A scheduled advisory conversation on top of a close that already works: budget and forecast maintenance, cash runway, owner compensation, and a profit-and-loss read against prior period and budget. Sold only to clients whose books the firm already keeps.',
      deliveryModel: 'RECURRING',
      typicalValue: 4_000,
    },
    {
      id: 'tax-compliance',
      name: 'Business & Owner Tax Compliance',
      description:
        'Entity return, state and multi-state filings, and the owners’ personal returns prepared as one set, priced as a fixed annual fee rather than by the hour. Reviewed and signed by a credentialed preparer and transmitted only against a signed e-file authorisation.',
      deliveryModel: 'PROJECT',
      typicalValue: 11_500,
      typicalDurationWeeks: 7,
    },
    {
      id: 'assessment-catchup',
      name: 'Client Assessment & Catch-Up',
      description:
        'A paid assessment of the books, open filings and prior-year positions, followed by the catch-up work it finds — commonly twelve to eighteen months of unreconciled ledger, missing payroll filings, and a chart of accounts nobody has owned. Time-bound, and the gateway to a subscription.',
      deliveryModel: 'PROJECT',
      typicalValue: 14_500,
      typicalDurationWeeks: 9,
    },
  ],

  revenueMix: { projectPct: 40, recurringPct: 60 },

  derivedEconomics: {
    newProjectEngagementsPerYear: 120,
    averageProjectValue: 12_500,
    activeRetainerClients: 75,
    averageRetainerMonthlyFee: 2_500,
    leadsPerYear: 600,
    qualifiedRatePct: 50,
    closeRatePct: 40,
  },

  clientProfile: {
    segment:
      'Owner-managed businesses between roughly $1M and $25M of revenue — trades, professional practices, franchisees, light manufacturing — usually multi-entity, usually with a bookkeeper rather than a controller, and usually arriving because the person who held the whole system in their head has left.',
    typicalClientSize: '$1M–$25M annual revenue, 5–120 employees',
    typicalContacts: [
      'Owner or founder, who signs the personal return',
      'Spouse or co-owner named on a joint return',
      'Office manager who currently keeps the books',
      'Operations lead who owns the payroll calendar',
    ],
    buyingTriggers: [
      'The bookkeeper who held the whole system in their head has resigned, and nobody else can close a month.',
      'A lender, franchisor or insurer has asked for financial statements the current books cannot produce.',
      'An extension has been filed twice and the prior preparer has stopped returning calls.',
      'A notice has arrived from the IRS or a state and nobody can reconstruct the position that caused it.',
      'The owner is being asked to sign a return they do not understand and has decided not to do that again.',
    ],
  },

  roles: [
    {
      id: 'managing-partner',
      name: 'Managing Partner (CPA)',
      responsibilities:
        'Holds principal authority for the firm’s tax practice and owns the procedures that go with it. Signs engagement letters above the delegated ceiling, is the Electronic Return Originator of record, owns the written information security plan, and is the final escalation on fees, collections and any decision to resign an engagement.',
      authorityCeiling: 4,
    },
    {
      id: 'tax-principal',
      name: 'Tax Principal (CPA)',
      responsibilities:
        'Signing preparer on business and owner returns. Decides tax positions, reviews every return before transmission, and approves engagement letters and fee quotes within a delegated ceiling. Anything outside that delegation goes to the Managing Partner rather than out of the door.',
      authorityCeiling: 3,
    },
    {
      id: 'cas-manager',
      name: 'Client Advisory Practice Manager (CPA)',
      responsibilities:
        'Owns the monthly close calendar and the controller-level review attached to it. Runs onboarding, decides day to day what sits inside subscription scope, and prepares scope variations and fee changes for partner approval rather than granting them.',
      authorityCeiling: 2,
    },
    {
      id: 'senior-accountant',
      name: 'Senior Accountant',
      responsibilities:
        'Prepares closes, reconciliations, working papers and draft returns, and recommends the treatment. Not a credentialed practitioner for representation purposes, so work prepared here is reviewed before it becomes advice and never leaves the firm on this person’s authority alone.',
      authorityCeiling: 1,
    },
    {
      id: 'client-coordinator',
      name: 'Client Service Coordinator',
      responsibilities:
        'Runs the document chase against the open request list, books review calls, tracks which filings are at risk, and keeps the due-date calendar honest. Unenrolled, so may assemble and observe but may not advise, sign, or represent — nothing may be executed on this person’s authority.',
      authorityCeiling: 0,
    },
  ],

  leadSources: [
    {
      id: 'client-referral',
      name: 'Existing client referrals',
      channel: 'Referral',
      approxMonthlyVolume: 14,
      qualityNote:
        'Highest close rate and the most forgiving on price. Arrives pre-sold on the relationship and frequently unprepared for a subscription fee, because the referring client quoted their own older rate.',
      impliesContactConsent: true,
    },
    {
      id: 'professional-referral',
      name: 'Banker, attorney and insurance broker referrals',
      channel: 'Professional network',
      approxMonthlyVolume: 9,
      qualityNote:
        'Usually urgent and usually a mess — a lender wants statements, or a transaction has exposed books nobody can defend. Well qualified on need, poorly qualified on willingness to pay for the cleanup that precedes it.',
      impliesContactConsent: true,
    },
    {
      id: 'site-enquiry',
      name: 'Website enquiry and pricing-page form',
      channel: 'Web form',
      approxMonthlyVolume: 13,
      qualityNote:
        'Highest volume, widest quality range, and sharply seasonal — volume roughly triples between January and April and much of it is a single overdue personal return the firm does not want.',
      impliesContactConsent: true,
    },
    {
      id: 'advisor-directory',
      name: 'Cloud-ledger advisor directory listings',
      channel: 'Directory',
      approxMonthlyVolume: 8,
      qualityNote:
        'Already on a supported ledger, which removes the worst onboarding friction. Frequently price-shopping across three listed firms in the same afternoon.',
      impliesContactConsent: true,
    },
    {
      id: 'community-events',
      name: 'Chamber and trade-association events',
      channel: 'Event',
      approxMonthlyVolume: 6,
      qualityNote:
        'Slow, relationship-led, and often years from buying. Consent is given verbally over a table and written on a card, so it is the one channel where the firm has no record it can point to.',
      impliesContactConsent: false,
    },
  ],

  pipelineStages: [
    {
      id: 'enquiry',
      name: 'Enquiry',
      exitCriteria: 'Entity type, the filings actually at risk, and who currently keeps the books are known.',
    },
    {
      id: 'assessment',
      name: 'Client assessment',
      exitCriteria:
        'A paid assessment is complete: condition of the ledger, open and late filings, and prior-year positions are documented.',
    },
    {
      id: 'engagement-letter',
      name: 'Engagement letter drafted',
      exitCriteria:
        'Scope, exclusions, fee and billing basis are drafted and approved by a CPA holding signing authority.',
    },
    {
      id: 'signed',
      name: 'Signed and funded',
      exitCriteria: 'Engagement letter signed and the first period paid. No period is worked before both.',
    },
    {
      id: 'onboarding',
      name: 'Onboarding',
      exitCriteria:
        'Ledger and bank-feed access granted, identity documents and prior returns received, and authorisation forms filed where representation is in scope.',
    },
    {
      id: 'in-service',
      name: 'In service',
      exitCriteria: 'First monthly close delivered, reviewed at controller level, and walked through with the owner.',
    },
  ],

  salesCycle: {
    typicalDaysToClose: 45,
    typicalTouches: 7,
    commonObjections: [
      'The incumbent preparer charges a third of this and has done the return for eleven years.',
      'The owner has priced bookkeeping as a commodity and is being quoted a subscription that includes judgement.',
      'The books are in a state the owner is embarrassed to show anyone, so the assessment itself is the objection.',
      'An offshore service has quoted per hour against a fixed fee, and the two numbers are not comparable.',
      'The client wants one firm to both keep the books and produce the audited statements their lender asked for.',
      'A catch-up fee is being charged for periods the client feels they already paid someone else to do.',
    ],
  },

  onboardingRequirements: [
    {
      id: 'signed-letter',
      item: 'Countersigned engagement letter naming scope, exclusions, fee and billing basis',
      why: 'No period is worked without one. The expensive claims in this trade are not bad advice — they are work performed with no record of what was and was not agreed.',
      sensitive: false,
    },
    {
      id: 'taxpayer-identifiers',
      item: 'EIN for each entity and SSN or ITIN for every filer, spouse and dependent on a return',
      why: 'Nothing can be filed or authorised without them, and they are the identifiers every downstream disclosure rule is written about.',
      sensitive: true,
    },
    {
      id: 'identity-documents',
      item: 'Government photo identification and date of birth for each person who will sign a return',
      why: 'Identity is confirmed before an electronic signature is accepted, and the signature record has to hold the identifying details it was checked against.',
      sensitive: true,
    },
    {
      id: 'prior-returns',
      item: 'Two to three years of filed federal and state returns for every entity and owner',
      why: 'Carryforwards, elections and depreciation basis live in prior returns. Without them the first return is a guess dressed as a filing.',
      sensitive: true,
    },
    {
      id: 'ledger-access',
      item: 'Named read-only user on the client’s cloud ledger, bank feeds and card feeds',
      why: 'The close runs against the client’s own system. Shared logins and emailed statements are how this firm ends up holding credentials it should never have had.',
      sensitive: true,
    },
    {
      id: 'authorisation-forms',
      item: 'Signed tax information authorisation, or power of attorney where representation is in scope',
      why: 'Without it the firm cannot obtain a transcript or speak to a revenue agency, and the first notice becomes a three-week detour.',
      sensitive: true,
    },
    {
      id: 'offshore-consent',
      item: 'Written consent to disclose return information to the contracted offshore preparation pod',
      why: 'Disclosure outside the United States is a decision the client makes in writing and in advance, never one the firm makes for them at capacity.',
      sensitive: false,
    },
  ],

  sourceSystems: [
    {
      id: 'ledger',
      name: 'Client cloud general ledger',
      systemOfRecordFor: ['chart of accounts', 'posted transactions', 'bank reconciliation', 'trial balance'],
    },
    {
      id: 'practice-management',
      name: 'Practice management and client request platform',
      systemOfRecordFor: ['engagement status', 'assigned preparer and reviewer', 'open client requests', 'due-date calendar'],
    },
    {
      id: 'tax-software',
      name: 'Tax preparation and e-file software',
      systemOfRecordFor: ['working papers', 'return positions', 'e-file acknowledgement', 'signed e-file authorisation'],
    },
    {
      id: 'portal',
      name: 'Client portal and document store',
      systemOfRecordFor: ['what was requested', 'what the client uploaded', 'signed engagement letters and consents'],
    },
    {
      id: 'payroll',
      name: 'Payroll platform',
      systemOfRecordFor: ['pay runs', 'payroll tax filings', 'year-end wage and contractor statements'],
    },
    {
      id: 'billing',
      name: 'Practice billing and subscription ledger',
      systemOfRecordFor: ['invoice status', 'subscription fee changes', 'payment receipt', 'write-offs'],
    },
  ],

  invoicing: {
    terms:
      'Subscription fees are billed in advance on the first of the month and are due before that month is worked. Project engagements are billed half on signature and half on delivery. Net 15.',
    netDays: 15,
    cadence: 'Monthly in advance on the first working day, plus project milestones on signature and on delivery.',
    typicalInvoiceValue: 2_500,
    commonDisputeReasons: [
      'Work the client believed was inside the fixed fee was billed as out of scope.',
      'A catch-up invoice covered periods the client thought the subscription already included.',
      'The subscription was billed in advance for a month in which the client sent nothing, so the client disputes that anything was delivered.',
      'A return was invoiced before the client signed the e-file authorisation, so from the client’s side the work is not finished.',
      'Two entities under one owner were invoiced separately and the owner expected a single bill.',
    ],
  },

  referralPartners: {
    description:
      'Commercial bankers, business attorneys, insurance brokers, and outgoing preparers handing on a client who has outgrown them. They refer at the moment a client fails to produce something, which is why the referred work is urgent and rarely clean.',
    shareOfPipelinePct: 18,
    concentrationNote:
      'Two relationship managers at one regional bank send roughly half of all professional referrals. Neither relationship is contractual and both would follow the individual rather than the institution, so a single job move removes close to a tenth of pipeline.',
  },

  renewals: {
    term:
      'Twelve-month subscription agreements renewing automatically, re-scoped and re-priced at each renewal, with sixty days’ notice either way.',
    typicalRenewalRatePct: 90,
    churnDrivers: [
      'The client hires a controller and brings the close in house.',
      'The business is sold and the acquirer’s existing firm absorbs the work.',
      'A re-price at renewal exposes how much out-of-scope work had been absorbed for free, and the increase reads as a penalty.',
      'The owner only ever wanted the tax return, and treated the subscription as the price of getting it.',
      'The relationship lived with one manager and left when they did.',
    ],
  },

  operatingConstraints: [
    'No engagement begins and no period is worked before a countersigned engagement letter is on file.',
    'A prepared return is not transmitted until the signed e-file authorisation is in hand. A finished return waiting on that signature is blocked by law, not running late.',
    'Identity is confirmed before an electronic signature is accepted, and after three failed knowledge-based authentication attempts the taxpayer must sign by hand.',
    'Taxpayer data never enters a public or unapproved AI tool, and any machine-drafted text is treated as a draft that a credentialed person must review before it leaves the firm.',
    'Return information is not disclosed to the contracted offshore preparation pod without prior written client consent, and consent is affirmative rather than assumed from silence.',
    'Client records are returned promptly on request even when fees are outstanding.',
    'The portal records what was requested and what arrived. It cannot establish whether what arrived is complete — only the working papers can, and that handoff is where engagements quietly go late.',
    'The firm either keeps a client’s books or reports on them. Never both for the same client.',
    'Multi-factor authentication is required of everyone with access to client information, and one named employee owns the firm’s written information security plan.',
    'Capacity between January and April is fixed and cannot be surged. Work accepted in season is accepted against a review queue, not against a preparer.',
  ],

  policies: [
    {
      id: 'ashcombe-ack-window',
      statement:
        'Every inbound enquiry is acknowledged within one hour during published hours, and answered by a person the same business day.',
      provenance: 'CLIENT_POLICY',
      verification: 'NOT_APPLICABLE',
      sourceIds: [],
      appliesTo:
        'Acknowledgement timing. Deliberately slack: this trade has no seconds-level convention, and the standing norm practitioners describe is a human reply within twenty-four hours. An hour is the firm’s own automated commitment inside that, not an industry benchmark.',
    },
    {
      id: 'ashcombe-routing-window',
      statement:
        'A qualified enquiry reaches a named credentialed professional within four business hours, and automated intake asks no more than four clarifying questions before it does.',
      provenance: 'CLIENT_POLICY',
      verification: 'NOT_APPLICABLE',
      sourceIds: [],
      appliesTo:
        'Routing, and the number of clarifying questions asked before a person takes over. The question budget is small on purpose: a real engagement generates hundreds of information requests, and that volume belongs inside a scoped engagement rather than in intake triage.',
    },
    {
      id: 'ashcombe-judgment-floor',
      statement:
        'Automated interpretation may act on its own conclusion only at 0.95 confidence or above, and never on a tax position, a filing, or a disclosure of return information regardless of confidence.',
      provenance: 'CLIENT_POLICY',
      verification: 'NOT_APPLICABLE',
      sourceIds: [],
      appliesTo:
        'Bounded AI judgement. Set close to the ceiling because the regulator governing this trade has already ruled that machine output augments rather than replaces professional judgement, and that a practitioner may not rely on it alone.',
    },
    {
      id: 'ashcombe-document-chase',
      statement: 'An outstanding client document request is escalated to a person after forty-eight hours.',
      provenance: 'CLIENT_POLICY',
      verification: 'NOT_APPLICABLE',
      sourceIds: [],
      appliesTo:
        'Wait-and-resume behaviour on an outstanding client response. Tight because waiting on client information — not capacity and not pricing — is what makes engagements in this trade run late and over budget.',
    },
    {
      id: 'ashcombe-meeting-offer',
      statement: 'An unaccepted review-call offer is escalated after seventy-two hours.',
      provenance: 'CLIENT_POLICY',
      verification: 'NOT_APPLICABLE',
      sourceIds: [],
      appliesTo:
        'Review and assessment call offers that go unanswered. No published convention exists for this; three days is the firm’s own choice, set wider than the document chase because a call is rescheduled and a filing deadline is not.',
    },
    {
      id: 'ashcombe-review-queue',
      statement: 'Work parked for review is surfaced as overdue after one business day.',
      provenance: 'CLIENT_POLICY',
      verification: 'NOT_APPLICABLE',
      sourceIds: [],
      appliesTo:
        'Attention timeouts on any state awaiting a person. Review is the firm’s binding constraint in filing season and every machine-assisted document has to pass through it, so a queue that ages is the firm’s most reliable early warning of a missed deadline.',
    },
    {
      id: 'ashcombe-dispatch-window',
      statement:
        'A prepared but unsent action is surfaced as overdue after eight hours, except where it is waiting on a signature the law requires before it may be sent at all.',
      provenance: 'CLIENT_POLICY',
      verification: 'NOT_APPLICABLE',
      sourceIds: [],
      appliesTo:
        'Ready-but-unsent outbound actions. The carve-out matters more than the number: a return held for a signed e-file authorisation is legally blocked, and reporting it as overdue would blame the firm for obeying a rule.',
    },
    {
      id: 'ashcombe-reactivation-cadence',
      statement:
        'A dormant client receives at most two reactivation approaches across a one-hundred-and-twenty-day window before being left alone.',
      provenance: 'CLIENT_POLICY',
      verification: 'NOT_APPLICABLE',
      sourceIds: [],
      appliesTo:
        'Reactivation attempt limits and sequence duration. The window is a quarter rather than a month because a lapsed client re-enters on the filing calendar, not on a marketing cadence, and a generic three-touch sequence borrowed from another trade would arrive at meaningless moments.',
    },
    {
      id: 'ashcombe-identity-resolution',
      statement:
        'Two records are treated as the same taxpayer only on an exact taxpayer-identifier match. Short of certainty, a person confirms.',
      provenance: 'CLIENT_POLICY',
      verification: 'NOT_APPLICABLE',
      sourceIds: [],
      appliesTo:
        'Identity resolution. Set at certainty rather than at a high probability because merging two records that each carry a Social Security number is a disclosure decision with criminal exposure attached, not a data-quality one — and because owner-managed clients routinely operate several near-identically named entities.',
    },
    {
      id: 'ashcombe-collection-ladder',
      statement:
        'An invoice fourteen days past due is escalated to the Managing Partner before the following month is worked.',
      provenance: 'CLIENT_POLICY',
      verification: 'NOT_APPLICABLE',
      sourceIds: [],
      appliesTo:
        'Receivables escalation timing. Short because the subscription is billed in advance: an invoice still unpaid at day fourteen means the firm is about to work a second month unpaid, which is the failure the advance-billing model exists to prevent.',
    },
    {
      id: 'ashcombe-engagement-authority',
      statement:
        'An engagement letter or fee quote may be prepared automatically but is released only by a CPA holding signing authority, and no period is worked before it is signed.',
      provenance: 'CLIENT_POLICY',
      verification: 'NOT_APPLICABLE',
      sourceIds: [],
      appliesTo:
        'The authority ceiling on outbound commercial documents, and whose desk approval lands on. The engagement letter is the document that defines what the firm did and did not promise, so it is the last thing in this business that should be issuable without a credentialed signature.',
    },
    {
      id: 'ashcombe-engagement-approval-window',
      statement: 'An engagement letter awaiting internal approval is surfaced as overdue after forty-eight hours.',
      provenance: 'CLIENT_POLICY',
      verification: 'NOT_APPLICABLE',
      sourceIds: [],
      appliesTo:
        'Approval attention timeouts on outbound commercial documents. Two days, because work does not start until the letter is signed, so an unapproved letter is a delivery delay before it is ever a sales delay.',
    },
    {
      id: 'ashcombe-reporting-freshness',
      statement: 'Owner reporting draws on the closed month. Operational data older than thirty days is not relied on.',
      provenance: 'CLIENT_POLICY',
      verification: 'NOT_APPLICABLE',
      sourceIds: [],
      appliesTo:
        'Input staleness tolerance for periodic analysis. This is the one threshold the trade itself sets rather than the firm: the product sold is a monthly close with monthly controller oversight, so the reporting clock is the month, not the hour or the week.',
    },
    {
      id: 'ashcombe-variance-materiality',
      statement:
        'A ten percent variance against the client’s budget comparative is treated as an exception worth the owner’s attention.',
      provenance: 'CLIENT_POLICY',
      verification: 'NOT_APPLICABLE',
      sourceIds: [],
      appliesTo:
        'Exception-candidate materiality thresholds. The comparison itself is standard — a profit-and-loss statement read against prior period and budget is a named deliverable of this service — but no published materiality percentage exists, so the ten is the firm’s own.',
    },
    {
      id: 'ashcombe-malformed-intake',
      statement: 'An unparseable inbound payload is retried once and then handed to a person.',
      provenance: 'CLIENT_POLICY',
      verification: 'NOT_APPLICABLE',
      sourceIds: [],
      appliesTo:
        'Retry budget on unparseable inbound payloads. One attempt only, because an inbound message to this firm may carry taxpayer data, and reprocessing something the system cannot read is not a free operation when the content is regulated.',
    },
  ],

  operatingParameters: [
    { key: 'acknowledgementTargetSeconds', label: 'Acknowledgement target', value: 3600, unit: 'seconds', policyId: 'ashcombe-ack-window' },
    { key: 'routingTargetMinutes', label: 'Routing target, published hours', value: 240, unit: 'minutes', policyId: 'ashcombe-routing-window' },
    { key: 'maxInformationQuestions', label: 'Maximum clarifying questions before a person takes over', value: 4, unit: 'questions', policyId: 'ashcombe-routing-window' },
    { key: 'confidenceFloor', label: 'Minimum confidence to act on an interpretation', value: 0.95, unit: 'probability', policyId: 'ashcombe-judgment-floor' },
    { key: 'replyWaitWindowHours', label: 'Document-chase wait window before escalation', value: 48, unit: 'hours', policyId: 'ashcombe-document-chase' },
    { key: 'bookingOfferWindowHours', label: 'Review-call offer wait window', value: 72, unit: 'hours', policyId: 'ashcombe-meeting-offer' },
    { key: 'humanReviewTimeoutHours', label: 'Review queue attention timeout', value: 24, unit: 'hours', policyId: 'ashcombe-review-queue' },
    { key: 'dispatchTimeoutHours', label: 'Ready-but-unsent attention timeout', value: 8, unit: 'hours', policyId: 'ashcombe-dispatch-window' },
    { key: 'dormantMaxAttempts', label: 'Maximum reactivation approaches', value: 2, unit: 'attempts', policyId: 'ashcombe-reactivation-cadence' },
    { key: 'dormantWindowDays', label: 'Reactivation sequence window', value: 120, unit: 'days', policyId: 'ashcombe-reactivation-cadence' },
    { key: 'entityMatchThreshold', label: 'Minimum confidence to accept an entity match', value: 1, unit: 'probability', policyId: 'ashcombe-identity-resolution' },
    { key: 'collectionEscalationDays', label: 'Escalation to the Managing Partner past due', value: 14, unit: 'days past due', policyId: 'ashcombe-collection-ladder' },
    { key: 'proposalAuthorityCeiling', label: 'Authority required to release an engagement letter', value: 3, unit: 'authority level', policyId: 'ashcombe-engagement-authority' },
    { key: 'proposalApprovalTimeoutHours', label: 'Engagement letter approval attention timeout', value: 48, unit: 'hours', policyId: 'ashcombe-engagement-approval-window' },
    { key: 'inputStalenessToleranceHours', label: 'Analysis input staleness tolerance', value: 720, unit: 'hours', policyId: 'ashcombe-reporting-freshness' },
    { key: 'exceptionVarianceThresholdPct', label: 'Exception-candidate variance threshold', value: 10, unit: 'percent', policyId: 'ashcombe-variance-materiality' },
    { key: 'malformedRetryBudget', label: 'Attempts on a malformed intake payload before a person is asked', value: 1, unit: 'attempts', policyId: 'ashcombe-malformed-intake' },
  ],

  accountabilities: [
    {
      action: 'PROPOSAL_APPROVAL',
      roleId: 'tax-principal',
      escalatesToRoleId: 'managing-partner',
      policyId: 'ashcombe-engagement-authority',
    },
  ],
});
