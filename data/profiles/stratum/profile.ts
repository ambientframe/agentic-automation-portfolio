import { BusinessProfileSchema, type BusinessProfile } from '@/lib/model/profile';

/**
 * STRATUM REVENUE SYSTEMS — a fictional CRM / RevOps implementation consultancy.
 *
 * EVERY FIGURE AND FACT BELOW IS SYNTHETIC. No real firm is described here, and the schema
 * pins `provenance` to the FIXTURE literal so nothing here can be read as a researched
 * benchmark about an actual business.
 *
 * Synthetic is not arbitrary. The vocabulary, the money, the failure modes, and the tool
 * split are calibrated against published partner-programme documentation, professional-
 * services benchmarks, and practitioner pages, cited from `data/profiles/index.ts` and
 * retained with their source material in `docs/evidence/grounding-captures.json`. Those
 * sources establish facts about an industry; they verify nothing about this firm.
 *
 * WHERE THE GROUNDING IS THINNEST, AND IT IS WORTH SAYING SO HERE.
 * This trade publishes a dense vocabulary for identity and delivery — Solutions Partner,
 * accreditation, technical blueprint, change order, RACI, go-live, enablement — and almost
 * no published operating clocks. Of the seventeen thresholds below, four trace to a
 * retrievable page and thirteen are choices made to be coherent with what the research did
 * establish. The policy prose says which is which; a reader should treat the clocks as this
 * fictional firm's risk tolerance, never as a convention of the trade.
 *
 * The figures are deliberately reconcilable rather than precise:
 *   44 engagements x $45,000            = $1.98M project revenue      (70% of mix)
 *   10 retainers x $7,000 x 12          = $0.84M recurring revenue    (30% of mix)
 *   320 leads x 30% qualified x 45% won = 43.2 engagements            (funnel closes)
 *   $2.8M / 18 people                   = $156k per head              (plausible band)
 *
 * `validateProfileConsistency` enforces all of this, so a careless edit to one figure fails
 * a test rather than quietly producing contradictory KPIs across the six systems.
 *
 * SCOPE OF THE FICTION: Stratum builds on one CRM platform. It migrates other platforms
 * into it and integrates around it, but does not implement them, and it does not run
 * marketing on the system it builds. That boundary is not colour — it is why several
 * guardrails exist, and it is stated in `explicitlyNot`.
 */

const RAW = {
  id: 'stratum',
  name: 'Stratum Revenue Systems',
  tagline: 'CRM implementation, data migration, and revenue-operations redesign for B2B companies outgrowing the system they have.',

  provenance: 'FIXTURE',
  fictionalDisclosure:
    'Stratum Revenue Systems is a fictional firm created for this portfolio. Its clients, figures, staff, and incidents are invented. Nothing here describes a real company, a real partner firm, or a real result.',

  company: {
    headcount: 18,
    approximateAnnualRevenue: 2_800_000,
    foundedYear: 2018,
    operatingModel:
      'A certified Solutions Partner practice. Two architects own blueprints and scope, five engineers build, three engagement leads carry named retainer accounts, and the managing partner still runs most discovery calls. Work is sold as a fixed-scope engagement against a written blueprint; anything outside it is a change order.',
    explicitlyNot: [
      'Does not implement competing CRM platforms. It migrates clients off them and integrates with them, and will assess platform fit, but will not deliver the other vendor\u2019s implementation.',
      'Does not sell advice without delivery. Stratum does not produce a recommendation deck and hand the build to somebody else.',
      'Does not run marketing campaigns, paid media, or content production on the system it builds.',
      'Does not decide which of two conflicting client records is correct. That is a business rule only the client can set, and Stratum will not set it on their behalf.',
      'Does not sign off its own phase gates. Every gate is approved by a named person on the client side.',
    ],
  },

  serviceLines: [
    {
      id: 'crm-implementation',
      name: 'CRM Implementation',
      description:
        'Discovery and technical blueprint, then portal build, then user acceptance testing and managed go-live, then enablement. Value shown is total engagement value.',
      deliveryModel: 'PROJECT',
      typicalValue: 42_000,
      typicalDurationWeeks: 8,
    },
    {
      id: 'data-migration',
      name: 'Data Migration',
      description:
        'Field mapping, deduplication rules agreed with the client, staged loads into a sandbox, reconciliation, then cutover. Runs as a defined workstream, often concurrent with a build. Value shown is total engagement value.',
      deliveryModel: 'PROJECT',
      typicalValue: 38_000,
      typicalDurationWeeks: 12,
    },
    {
      id: 'revops-transformation',
      name: 'RevOps Transformation',
      description:
        'Lifecycle stages, pipeline definitions, routing, forecasting, and reporting rebuilt across marketing, sales, and service. The largest engagement the firm sells. Value shown is total engagement value.',
      deliveryModel: 'PROJECT',
      typicalValue: 85_000,
      typicalDurationWeeks: 20,
    },
    {
      id: 'custom-integration',
      name: 'Custom Integration',
      description:
        'Purpose-built connections between the CRM and finance, product, or delivery systems, with monitoring, alerting, and retry behaviour specified in the blueprint. Value shown is total engagement value.',
      deliveryModel: 'PROJECT',
      typicalValue: 24_000,
      typicalDurationWeeks: 6,
    },
    {
      id: 'revenue-diagnostic',
      name: 'Revenue Diagnostic',
      description:
        'A paid audit of the existing system, data, and revenue process, sold ahead of a large engagement so the scope is written from findings rather than assumptions. Frequently the entry point. Value shown is total engagement value.',
      deliveryModel: 'PROJECT',
      typicalValue: 9_000,
      typicalDurationWeeks: 3,
    },
    {
      id: 'managed-revops',
      name: 'Managed RevOps',
      description:
        'Ongoing administration, new workflows, reporting, and a named strategist against agreed revenue outcomes after go-live. Value shown is the monthly retainer fee.',
      deliveryModel: 'RECURRING',
      typicalValue: 7_000,
    },
  ],

  revenueMix: { projectPct: 70, recurringPct: 30 },

  derivedEconomics: {
    newProjectEngagementsPerYear: 44,
    averageProjectValue: 45_000,
    activeRetainerClients: 10,
    averageRetainerMonthlyFee: 7_000,
    leadsPerYear: 320,
    qualifiedRatePct: 30,
    closeRatePct: 45,
  },

  clientProfile: {
    segment:
      'B2B companies with a real sales motion whose CRM no longer matches how they sell — either running on a system chosen when they were half the size, or carrying years of unreconciled records nobody trusts.',
    typicalClientSize: '50\u2013500 employees, usually with a first RevOps hire but no internal implementation capability.',
    typicalContacts: [
      'RevOps lead or Head of Revenue Operations (usually the day-to-day owner)',
      'VP Sales or Sales Manager (owns pipeline definitions and approves automation)',
      'Marketing lead (owns lifecycle stages and the top of the funnel)',
      'CFO or COO where budget approval is separated from system ownership',
      'IT or Security, on access, single sign-on, and integration credentials',
    ],
    buyingTriggers: [
      'A platform renewal or a price increase has forced a migrate-or-stay decision with a date on it.',
      'Forecasting broke — the pipeline report and the finance number no longer agree.',
      'A previous implementation was completed and nobody uses it, so the rebuild is now on the table.',
      'Two systems were inherited through an acquisition and neither is the source of truth.',
      'A new revenue leader arrived and will not run the quarter on the current setup.',
      'An integration a partner or customer depends on has started failing silently.',
    ],
  },

  roles: [
    {
      id: 'managing-partner',
      name: 'Managing Partner (founder)',
      responsibilities:
        'Runs discovery calls, owns the rate card, signs every statement of work and change order, holds the platform-partner relationship, and is the final escalation point.',
      authorityCeiling: 4,
    },
    {
      id: 'solutions-architect',
      name: 'Solutions Architect',
      responsibilities:
        'Owns the technical blueprint and data map, sizes the engagement, prepares statements of work and change orders for signature, and adjudicates technical scope disputes during a build.',
      authorityCeiling: 3,
    },
    {
      id: 'engagement-lead',
      name: 'Engagement Lead',
      responsibilities:
        'The named strategist on retainer accounts and the client-facing owner during delivery. Runs phase gates, chases client decisions, and drafts commercial documents for approval. Cannot vary price or scope.',
      authorityCeiling: 2,
    },
    {
      id: 'integration-engineer',
      name: 'Integration Engineer',
      responsibilities:
        'Configures objects, properties, pipelines, and automation, builds and monitors integrations, and executes migration loads. Does not communicate commercial terms and does not decide data rules.',
      authorityCeiling: 1,
    },
    {
      id: 'delivery-coordinator',
      name: 'Delivery Coordinator',
      responsibilities:
        'Schedules discovery and UAT sessions, tracks the access and credential checklist, keeps the RACI current, and prepares invoices for review.',
      authorityCeiling: 1,
    },
  ],

  leadSources: [
    {
      id: 'website-enquiry',
      name: 'Website enquiry form',
      channel: 'Web form',
      approxMonthlyVolume: 8,
      qualityNote:
        'Highest volume and widest quality spread. Buyers here are usually contacting three or four partner firms at once, so time to a useful answer — not to an auto-reply — decides most of them.',
      impliesContactConsent: true,
    },
    {
      id: 'partner-directory',
      name: 'Platform partner directory listing',
      channel: 'Vendor directory',
      approxMonthlyVolume: 6,
      qualityNote:
        'Pre-qualified on platform and tier, so the buyer has usually already decided what they are buying. Frequently arrives with a renewal date already fixed.',
      impliesContactConsent: true,
    },
    {
      id: 'vendor-referral',
      name: 'Platform vendor referral',
      channel: 'Vendor introduction',
      approxMonthlyVolume: 5,
      qualityNote:
        'The vendor owns the customer relationship and invites the firm in to deliver. Highest close rate, lowest pricing latitude, and the vendor\u2019s reporting on it lags by a day.',
      impliesContactConsent: true,
    },
    {
      id: 'client-expansion',
      name: 'Existing-client expansion request',
      channel: 'Engagement lead',
      approxMonthlyVolume: 5,
      qualityNote:
        'A new business unit or a second phase inside a current account. Already a customer, and must never be treated as a cold lead or entered into prospecting sequences.',
      impliesContactConsent: true,
    },
    {
      id: 'peer-referral',
      name: 'Peer and agency referral',
      channel: 'Referral',
      approxMonthlyVolume: 3,
      qualityNote:
        'Overflow from marketing agencies and other partner firms who do not build. Warm but slow, and consent is often assumed by the referrer rather than given by the buyer.',
      impliesContactConsent: false,
    },
  ],

  pipelineStages: [
    {
      id: 'enquiry',
      name: 'Enquiry received',
      exitCriteria: 'Contactable party, current platform known, and inside the served segment.',
    },
    {
      id: 'discovery',
      name: 'Discovery call held',
      exitCriteria:
        'Current system, record volume, integration surface, internal owner, and any external date are known.',
    },
    {
      id: 'scoped',
      name: 'Blueprint scoped',
      exitCriteria:
        'A written technical blueprint and data map exist, with every unknown explicitly marked as unknown.',
    },
    {
      id: 'proposed',
      name: 'Statement of work issued',
      exitCriteria: 'Signed-off blueprint priced, approved internally, and issued to the client.',
    },
    {
      id: 'signed',
      name: 'Signed',
      exitCriteria: 'Countersigned statement of work, or a recorded loss reason.',
    },
    {
      id: 'onboarding',
      name: 'Onboarding',
      exitCriteria: 'RACI agreed, sandbox and system access granted, and kickoff held.',
    },
    {
      id: 'delivering',
      name: 'Delivering',
      exitCriteria: 'UAT passed, go-live completed, and enablement delivered.',
    },
  ],

  salesCycle: {
    typicalDaysToClose: 45,
    typicalTouches: 6,
    commonObjections: [
      'The platform vendor quoted a far lower onboarding fee to do it directly.',
      'A cheaper firm has quoted half the price, on a scope that was never written down.',
      'We think our RevOps hire can configure this internally.',
      'We are waiting on the platform renewal date before committing.',
      'The last partner delivered something nobody used, so the appetite for another build is low.',
      'Nobody internally will own the decision about which records survive the migration.',
    ],
  },

  onboardingRequirements: [
    {
      id: 'signed-sow',
      item: 'Countersigned statement of work with the technical blueprint attached',
      why: 'The blueprint is the scope. Work that starts before it is signed becomes a change-order argument at invoice time.',
      sensitive: false,
    },
    {
      id: 'raci',
      item: 'Agreed RACI with one named approver per phase gate',
      why: 'Ambiguity about who approves a go or no-go is the failure that stalls builds; naming the approver per gate is what prevents it.',
      sensitive: false,
    },
    {
      id: 'sandbox-access',
      item: 'Sandbox and production portal access with the correct permission set',
      why: 'Nothing is built or tested without it, and a permission set granted at the wrong level is the most common week-one blocker.',
      sensitive: true,
    },
    {
      id: 'sso-admin',
      item: 'Single sign-on or admin provisioning for the delivery team',
      why: 'Access provisioned per-person through the client\u2019s own identity process, rather than by sharing a login, is the only version of this that survives an audit.',
      sensitive: true,
    },
    {
      id: 'integration-credentials',
      item: 'API credentials for each system in the integration scope',
      why: 'Every connection in the blueprint needs its own credential, and each is issued by a different owner inside the client.',
      sensitive: true,
    },
    {
      id: 'source-export',
      item: 'Full export from the outgoing system with record counts',
      why: 'Sets the true size of the migration. Counts agreed up front are what stop "bring everything over" from landing far more records than anyone expected.',
      sensitive: true,
    },
    {
      id: 'merge-rules',
      item: 'Written rules for which record wins when two conflict',
      why: 'Only the business can decide which duplicate is correct. Without the rule in writing, legacy data problems are carried straight into the new system.',
      sensitive: false,
    },
    {
      id: 'field-authority',
      item: 'Named source of truth for each synced field, and the sync direction',
      why: 'A two-way sync with no declared authority per field silently overwrites whichever side wrote last.',
      sensitive: false,
    },
    {
      id: 'golive-date',
      item: 'Target go-live date and the business events around it',
      why: 'The whole schedule is worked backwards from it, and quarter-end or a launch will veto a cutover weekend.',
      sensitive: false,
    },
  ],

  sourceSystems: [
    {
      id: 'crm',
      name: 'Internal CRM',
      systemOfRecordFor: [
        'lead and contact identity',
        'deal stage and value',
        'contact consent and suppression state',
      ],
    },
    {
      id: 'shared-inbox',
      name: 'Shared enquiry inbox',
      systemOfRecordFor: ['inbound enquiry receipt', 'prospect replies'],
    },
    {
      id: 'delivery-workspace',
      name: 'Delivery project workspace',
      systemOfRecordFor: [
        'engagement tasks and phase state',
        'task ownership',
        'time recorded against the engagement',
        'the onboarding and access checklist',
      ],
    },
    {
      id: 'accounting',
      name: 'Accounting package',
      systemOfRecordFor: [
        'invoice identity',
        'invoice amount',
        'due date',
        'outstanding balance',
        'payment status',
      ],
    },
    {
      id: 'document-store',
      name: 'Shared document store',
      systemOfRecordFor: [
        'signed statements of work',
        'technical blueprints and data maps',
        'change orders',
        'phase sign-off records',
      ],
    },
    {
      id: 'client-portal',
      name: 'Client platform portal',
      systemOfRecordFor: ['delivered configuration', 'migrated record counts', 'integration run status'],
    },
    {
      id: 'calendar',
      name: 'Scheduling calendar',
      systemOfRecordFor: ['discovery and UAT sessions', 'cutover and go-live windows'],
    },
  ],

  invoicing: {
    terms:
      'Net 30 from invoice date. Project work bills 40% on signature, 40% at UAT sign-off, and 20% at go-live. Change orders bill on approval. Retainers bill monthly in advance.',
    netDays: 30,
    cadence: 'Retainers on the 1st of each month; project milestones on trigger.',
    typicalInvoiceValue: 15_000,
    commonDisputeReasons: [
      'Work outside the blueprint was delivered without a written change order first',
      'UAT sign-off milestone disputed because the named approver never tested',
      'Migration billed on a record count higher than the client expected to move',
      'Purchase-order number missing, so the invoice never entered the client approval queue',
      'Retainer billed for a month the client believed was paused after go-live',
    ],
  },

  referralPartners: {
    description:
      'The platform vendor itself, plus marketing agencies and other partner firms that sell the platform but do not build on it. The vendor relationship is formal and tiered; the agency ones are reciprocal and informal.',
    shareOfPipelinePct: 25,
    concentrationNote:
      'The vendor directory and vendor-introduced work together account for most referred pipeline, and both depend on holding partner tier. A tier downgrade would remove roughly a quarter of qualified pipeline within two quarters, which is why tier standing is a tracked business exception rather than a badge.',
  },

  renewals: {
    term: '12-month managed RevOps agreements renewing on the anniversary of go-live, with a 60-day notice period.',
    typicalRenewalRatePct: 74,
    churnDrivers: [
      'The client hires a permanent RevOps team and brings administration in-house',
      'Support tailed off after go-live and the relationship never recovered',
      'The project sponsor left and their successor re-tenders on price',
      'The system was delivered correctly but adoption never happened, and the retainer is blamed for it',
      'A funding round or acquisition consolidates onto the acquirer\u2019s platform',
    ],
  },

  operatingConstraints: [
    'Delivery capacity is the binding constraint. Five engineers and two architects carry roughly a dozen concurrent engagements, so won work that cannot be staffed is a real cost rather than a win.',
    'Nothing is built or migrated without client-granted access, which Stratum does not control and must not model as though it did.',
    'Data cleansing is the largest hidden cost in a migration and is routinely under-scoped by clients who expect the partner to have absorbed it.',
    'Cutover windows cluster at quarter ends, and salaried capacity does not.',
    'Client credentials and access tokens are held per engagement and must never be persisted into general workflow state, tickets, or logs.',
    'Client record data is confidential. It is never aggregated across clients and never used in marketing.',
    'Vendor-introduced work carries the vendor\u2019s commercial terms, so pricing latitude on it is close to zero.',
  ],

  policies: [
    {
      id: 'stratum-ack-window',
      statement:
        'Every inbound enquiry receives an acknowledgement within 5 minutes of receipt, and the acknowledgement asks the one question needed to route it rather than merely confirming arrival.',
      provenance: 'CLIENT_POLICY',
      verification: 'NOT_APPLICABLE',
      sourceIds: [],
      appliesTo:
        'Acknowledgement timing. Calibrated against an adjacent professional-services intake pattern that qualifies and books inside the first five minutes, and against the observed failure of this segment — a firm whose first useful reply took 41 hours lost buyers to whoever answered first. This trade publishes no acknowledgement SLA of its own; five minutes is this fictional firm\u2019s choice, not a convention.',
    },
    {
      id: 'stratum-routing-window',
      statement:
        'A qualified enquiry reaches a named architect or the managing partner within 60 minutes during business hours, after at most two clarifying questions.',
      provenance: 'CLIENT_POLICY',
      verification: 'NOT_APPLICABLE',
      sourceIds: [],
      appliesTo:
        'Routing latency and the number of clarifying questions asked before a person takes over. The two-question limit follows an adjacent intake pattern that classifies an enquiry and asks one or two qualifying questions in the same channel; the 60-minute figure is chosen, because no minutes-based routing convention is published for this trade.',
    },
    {
      id: 'stratum-scope-confidence-floor',
      statement:
        'An automated interpretation of scope may only act on its own conclusion at 0.80 confidence or above. Below that, an architect decides.',
      provenance: 'CLIENT_POLICY',
      verification: 'NOT_APPLICABLE',
      sourceIds: [],
      appliesTo:
        'Bounded AI judgement in enquiry classification and scope interpretation. No published confidence gate exists for this work; the number is chosen and the reasoning is the cost of being wrong — a mis-scoped implementation is not a slow reply, it is a portal nobody trusts and a rebuild that costs more than doing it right the first time, in budget and in the trust needed to re-engage the team.',
    },
    {
      id: 'stratum-reply-wait-window',
      statement:
        'An awaited client answer is escalated to a person after 48 hours rather than left waiting.',
      provenance: 'CLIENT_POLICY',
      verification: 'NOT_APPLICABLE',
      sourceIds: [],
      appliesTo:
        'Wait-and-resume behaviour on an outstanding client response. Chosen, not found. Reasoned from two things the research did establish: a useful answer in this market is measured in a 24-to-72 hour window, and the build phase deliberately asks the client for under half an hour a week — so a two-day silence is normal enough to wait through once and abnormal enough to raise after that.',
    },
    {
      id: 'stratum-booking-offer-window',
      statement: 'An unaccepted discovery-call offer is escalated after 72 hours.',
      provenance: 'CLIENT_POLICY',
      verification: 'NOT_APPLICABLE',
      sourceIds: [],
      appliesTo:
        'Discovery-call scheduling offers that go unanswered. Chosen: no convention for an unaccepted invitation was found anywhere in this trade. Set longer than the reply-wait window because accepting a call requires coordinating several internal stakeholders, which answering a question does not.',
    },
    {
      id: 'stratum-review-timeout-window',
      statement:
        'Work parked for human review is surfaced as overdue after 24 hours. The case is never auto-decided.',
      provenance: 'CLIENT_POLICY',
      verification: 'NOT_APPLICABLE',
      sourceIds: [],
      appliesTo:
        'Attention timeouts on any state awaiting a person. Chosen. Client-side review in this business is a scheduled multi-week phase against a written test script, so no external timer applies; this window governs Stratum\u2019s own queue, where a case sitting a full working day unlooked-at is the thing that quietly consumes a delivery week.',
    },
    {
      id: 'stratum-dispatch-timeout-window',
      statement: 'A prepared but undespatched action is surfaced as overdue after 8 hours.',
      provenance: 'CLIENT_POLICY',
      verification: 'NOT_APPLICABLE',
      sourceIds: [],
      appliesTo:
        'Ready-but-unsent outbound actions. Chosen; no published convention exists. Deliberately shorter than the review window, because the decision has already been made by this point and only despatch remains, which should not wait a working day.',
    },
    {
      id: 'stratum-reactivation-cadence',
      statement:
        'A dormant account receives at most three reactivation attempts across a 45-day window, after which it is left alone.',
      provenance: 'CLIENT_POLICY',
      verification: 'NOT_APPLICABLE',
      sourceIds: [],
      appliesTo:
        'Reactivation attempt limits and sequence duration. Both numbers chosen: this trade publishes no reactivation convention, and email-list win-back is a different job. The window is set to 45 days because the trigger that revives this kind of opportunity — a renewal date, a quarter boundary, a new revenue leader — moves on a budget cycle rather than a weekly one.',
    },
    {
      id: 'stratum-record-merge-authority',
      statement:
        'Two records are treated as the same client only at 0.97 confidence or above. Anything below that is a question for a person, and the rule for which record wins is always the client\u2019s to set.',
      provenance: 'CLIENT_POLICY',
      verification: 'NOT_APPLICABLE',
      sourceIds: [],
      appliesTo:
        'Identity resolution before any commercial evaluation. The threshold is deliberately close to absolute rather than tuned, because the research established that automatic deduplication by email or domain cannot decide a business rule, and a firm that sells migrations cannot be the one guessing which duplicate survives. The specific number is chosen; the refusal it encodes is grounded.',
    },
    {
      id: 'stratum-collection-cadence',
      statement: 'An invoice 30 days past due is escalated to the managing partner.',
      provenance: 'CLIENT_POLICY',
      verification: 'NOT_APPLICABLE',
      sourceIds: [],
      appliesTo:
        'Receivables escalation timing. Chosen. The closest published figure for firms of this size is a days-sales-outstanding average in the low forties, which describes how long cash actually takes rather than when a firm should intervene; escalating at 30 days past due is this firm\u2019s attempt to sit ahead of that average rather than inside it.',
    },
    {
      id: 'stratum-commercial-authority',
      statement:
        'No statement of work, change order, or price may leave the firm without approval from an architect or the managing partner. Nobody below that may vary scope or price, however confident the draft.',
      provenance: 'CLIENT_POLICY',
      verification: 'NOT_APPLICABLE',
      sourceIds: [],
      appliesTo:
        'The authority ceiling on outbound commercial documents, and who is accountable for approving one. Grounded in the practice that scope outside the agreed blueprint must be documented, costed, and approved by both parties before work begins — which requires a signer on this side who can commit the firm.',
    },
    {
      id: 'stratum-sow-approval-window',
      statement:
        'A statement of work awaiting internal approval is surfaced as overdue after 96 hours and escalated to the managing partner.',
      provenance: 'CLIENT_POLICY',
      verification: 'NOT_APPLICABLE',
      sourceIds: [],
      appliesTo:
        'Approval attention timeouts on commercial documents. Chosen. No hour-level approval SLA is published for this trade; the four days is derived from what practitioners promise buyers instead — a real number within the week of a scoped call — which only holds if internal approval clears well inside that week.',
    },
    {
      id: 'stratum-reporting-freshness',
      statement: 'Owner reporting may not draw on operational data older than 48 hours.',
      provenance: 'CLIENT_POLICY',
      verification: 'NOT_APPLICABLE',
      sourceIds: [],
      appliesTo:
        'Input staleness tolerance for periodic analysis. Reasoned from a hard fact about this firm\u2019s own dependencies: the vendor partner dashboard it draws referral and managed-client data from refreshes once every 24 hours, so nothing here can ever be fresher than a day. Two refresh cycles is the point at which a missed refresh, rather than normal lag, is the likelier explanation. The tolerance is chosen; the 24-hour refresh interval behind it is not.',
    },
    {
      id: 'stratum-overrun-materiality',
      statement:
        'A variance of 10 percent or more against plan is treated as an exception worth the managing partner\u2019s attention.',
      provenance: 'CLIENT_POLICY',
      verification: 'NOT_APPLICABLE',
      sourceIds: [],
      appliesTo:
        'Exception-candidate materiality thresholds. This is the one threshold here with a directly published anchor: professional-services benchmarking treats project overrun above ten percent as the point where it starts to damage client relationships, margins, and future bookings. Adopting it as the general variance threshold is an extension of that finding beyond overrun, and that extension is a choice.',
    },
    {
      id: 'stratum-malformed-intake',
      statement:
        'A malformed intake payload is retried twice, then handed to a person with the raw payload attached. It is never discarded and never retried indefinitely.',
      provenance: 'CLIENT_POLICY',
      verification: 'NOT_APPLICABLE',
      sourceIds: [],
      appliesTo:
        'Retry budget on unparseable inbound payloads. The count is chosen. The discipline is not: this firm builds monitoring, alerting, and retry logic into every integration it delivers, and a bounded retry that ends at a person rather than in silence is the same standard applied to its own intake. A malformed payload here usually means a broken form integration, so the demand behind it is real and someone is waiting.',
    },
    {
      id: 'stratum-change-order-discipline',
      statement:
        'Any requirement outside the agreed technical blueprint is written down, costed for timeline and budget impact, and approved by both parties before the work begins. Scope is never absorbed silently and billed later.',
      provenance: 'CLIENT_POLICY',
      verification: 'NOT_APPLICABLE',
      sourceIds: [],
      appliesTo:
        'Every scope conversation during delivery, and the language permitted in any client-facing message about additional work. This is the firm\u2019s single most load-bearing commercial rule: undocumented change is the failure mode that turns a cheap quote into a disputed invoice.',
    },
    {
      id: 'stratum-client-decision-boundary',
      statement:
        'Stratum does not alter live client data without written direction, and never decides which of two conflicting records is the source of truth. The client owns lifecycle definitions, record survivorship, integration access, and adoption.',
      provenance: 'CLIENT_POLICY',
      verification: 'NOT_APPLICABLE',
      sourceIds: [],
      appliesTo:
        'Migration and onboarding behaviour across every system. Directly encodes the division of ownership this trade recognises — the partner owns the build; the client owns the decisions only the business can make — and is the reason several data steps here escalate rather than resolve.',
    },
    {
      id: 'stratum-phase-gate-signoff',
      statement:
        'Each phase gate is signed off by one named person on the client side, and the signer is not always the same person for every gate.',
      provenance: 'CLIENT_POLICY',
      verification: 'NOT_APPLICABLE',
      sourceIds: [],
      appliesTo:
        'Phase progression and go-live authorisation. Ambiguity about who approves a go or no-go is the most common failure point in this delivery model, so the approver is named per gate in the RACI before kickoff rather than assumed.',
    },
    {
      id: 'stratum-credential-handling',
      statement:
        'Client credentials, API keys, and portal access are requested through the client\u2019s own provisioning process and are never captured in workflow state, tickets, email, or logs.',
      provenance: 'CLIENT_POLICY',
      verification: 'NOT_APPLICABLE',
      sourceIds: [],
      appliesTo:
        'Access provisioning during onboarding, and what any system here is permitted to persist about it. Follows from the client owning access and credentials rather than the partner holding them.',
    },
  ],

  operatingParameters: [
    { key: 'acknowledgementTargetSeconds', label: 'Acknowledgement target', value: 300, unit: 'seconds', policyId: 'stratum-ack-window' },
    { key: 'routingTargetMinutes', label: 'Routing target, business hours', value: 60, unit: 'minutes', policyId: 'stratum-routing-window' },
    { key: 'maxInformationQuestions', label: 'Maximum clarifying questions before human review', value: 2, unit: 'questions', policyId: 'stratum-routing-window' },
    { key: 'confidenceFloor', label: 'Minimum confidence to act on a scope interpretation', value: 0.8, unit: 'probability', policyId: 'stratum-scope-confidence-floor' },
    { key: 'replyWaitWindowHours', label: 'Reply wait window before escalation', value: 48, unit: 'hours', policyId: 'stratum-reply-wait-window' },
    { key: 'bookingOfferWindowHours', label: 'Discovery-call offer wait window', value: 72, unit: 'hours', policyId: 'stratum-booking-offer-window' },
    { key: 'humanReviewTimeoutHours', label: 'Human review attention timeout', value: 24, unit: 'hours', policyId: 'stratum-review-timeout-window' },
    { key: 'dispatchTimeoutHours', label: 'Ready-but-undespatched attention timeout', value: 8, unit: 'hours', policyId: 'stratum-dispatch-timeout-window' },
    { key: 'dormantMaxAttempts', label: 'Maximum reactivation attempts', value: 3, unit: 'attempts', policyId: 'stratum-reactivation-cadence' },
    { key: 'dormantWindowDays', label: 'Reactivation sequence window', value: 45, unit: 'days', policyId: 'stratum-reactivation-cadence' },
    { key: 'entityMatchThreshold', label: 'Minimum confidence to accept an entity match', value: 0.97, unit: 'probability', policyId: 'stratum-record-merge-authority' },
    { key: 'collectionEscalationDays', label: 'Escalation to the managing partner past due', value: 30, unit: 'days past due', policyId: 'stratum-collection-cadence' },
    { key: 'proposalAuthorityCeiling', label: 'Maximum authority for outbound commercial documents', value: 3, unit: 'authority level', policyId: 'stratum-commercial-authority' },
    { key: 'proposalApprovalTimeoutHours', label: 'Statement-of-work approval attention timeout', value: 96, unit: 'hours', policyId: 'stratum-sow-approval-window' },
    { key: 'inputStalenessToleranceHours', label: 'Analysis input staleness tolerance', value: 48, unit: 'hours', policyId: 'stratum-reporting-freshness' },
    { key: 'exceptionVarianceThresholdPct', label: 'Exception-candidate variance threshold', value: 10, unit: 'percent', policyId: 'stratum-overrun-materiality' },
    { key: 'malformedRetryBudget', label: 'Attempts on a malformed intake payload before a person is asked', value: 2, unit: 'attempts', policyId: 'stratum-malformed-intake' },
  ],

  /**
   * Whose desk a commercial document lands on, and whose desk it goes to next.
   *
   * Asking by authority alone would answer this one correctly, since the Solutions Architect
   * is the only role at ceiling 3. It is declared anyway, because the fact being recorded is
   * that the architect owns the blueprint the price is built from — not that the architect
   * happens to sit at the right level. If a second role were ever added at ceiling 3, the
   * authority answer would go ambiguous and this one would not.
   *
   * It grants nobody anything. The architect's ceiling stays 3, and
   * `stratum-commercial-authority` still requires that level for despatch regardless of who
   * is accountable for deciding.
   */
  accountabilities: [
    {
      action: 'PROPOSAL_APPROVAL',
      roleId: 'solutions-architect',
      escalatesToRoleId: 'managing-partner',
      policyId: 'stratum-commercial-authority',
    },
  ],
} satisfies Parameters<typeof BusinessProfileSchema.parse>[0];

export const STRATUM: BusinessProfile = BusinessProfileSchema.parse(RAW);
