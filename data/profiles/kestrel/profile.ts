import { BusinessProfileSchema, type BusinessProfile } from '@/lib/model/profile';

/**
 * KESTREL COMPLIANCE GROUP — a fictional demonstration business.
 *
 * EVERY NUMBER AND FACT BELOW IS INVENTED. None of it is researched, benchmarked, or
 * drawn from a real company. The schema pins `provenance` to the FIXTURE literal so
 * this can never be confused with the evidence ledger.
 *
 * The figures are deliberately reconcilable rather than precise:
 *   60 engagements x $32,000            = $1.92M project revenue      (60% of mix)
 *   33 retainers x $3,200 x 12          = $1.27M recurring revenue    (40% of mix)
 *   720 leads x 38% qualified x 22% won = 60.2 engagements            (funnel closes)
 *   $3.2M / 14 people                   = $229k per head              (plausible band)
 *
 * `validateProfileConsistency` enforces all of this, so a careless edit to one figure
 * fails a test rather than quietly producing contradictory KPIs across the six systems.
 *
 * SCOPE OF THE FICTION: Kestrel is a readiness and advisory consultancy. It is not a
 * certification body and not an independent auditor. That distinction is not colour —
 * it is the reason several guardrails exist, and it is stated in `explicitlyNot`.
 */

const RAW = {
  id: 'kestrel',
  name: 'Kestrel Compliance Group',
  tagline: 'Security compliance readiness and managed programme operation for B2B SaaS.',

  provenance: 'FIXTURE',
  fictionalDisclosure:
    'Kestrel Compliance Group is a fictional business created for this portfolio. Its clients, figures, staff, and incidents are invented. Nothing here describes a real company or a real result.',

  company: {
    headcount: 14,
    approximateAnnualRevenue: 3_200_000,
    foundedYear: 2019,
    operatingModel:
      'A founder-led readiness practice. Six analysts deliver engagements, two client partners sell, and the founder still runs most discovery calls personally. Delivery capacity, not demand, is the binding constraint.',
    explicitlyNot: [
      'Not a certification body. Kestrel does not issue certificates or attestations.',
      'Not an independent auditor. Kestrel does not perform the audit or issue the opinion, and works alongside the audit firm the client engages separately.',
      'Not in control of audit outcomes or timelines, and therefore never in a position to promise them.',
      'Not a law firm. Kestrel does not give legal advice on regulatory obligations.',
    ],
  },

  serviceLines: [
    {
      id: 'soc2-type1',
      name: 'SOC 2 Type I readiness',
      description:
        'Control design, policy authoring, and evidence scaffolding up to the point of a Type I examination. Value shown is total engagement value.',
      deliveryModel: 'PROJECT',
      typicalValue: 24_000,
      typicalDurationWeeks: 10,
    },
    {
      id: 'soc2-type2',
      name: 'SOC 2 Type II readiness',
      description:
        'Type I scope plus operating-effectiveness preparation across the observation window. Value shown is total engagement value.',
      deliveryModel: 'PROJECT',
      typicalValue: 38_000,
      typicalDurationWeeks: 20,
    },
    {
      id: 'iso27001',
      name: 'ISO 27001 readiness',
      description:
        'ISMS design, risk treatment, Annex A control mapping, and internal audit preparation. Usually bought when a client enters UK or EU enterprise markets. Value shown is total engagement value.',
      deliveryModel: 'PROJECT',
      typicalValue: 45_000,
      typicalDurationWeeks: 24,
    },
    {
      id: 'questionnaire-sprint',
      name: 'Security questionnaire remediation sprint',
      description:
        'A short engagement to unblock a specific stalled enterprise deal. Frequently the entry point that later becomes a full readiness project. Value shown is total engagement value.',
      deliveryModel: 'PROJECT',
      typicalValue: 12_000,
      typicalDurationWeeks: 4,
    },
    {
      id: 'managed-compliance',
      name: 'Managed compliance',
      description:
        'Ongoing evidence collection, control monitoring, drift detection, and audit liaison. Value shown is the monthly retainer fee.',
      deliveryModel: 'RECURRING',
      typicalValue: 3_200,
    },
    {
      id: 'fractional-security-officer',
      name: 'Fractional security officer',
      description:
        'Named senior contact for customer security reviews, vendor assessments, and board reporting. Value shown is the monthly retainer fee.',
      deliveryModel: 'RECURRING',
      typicalValue: 2_400,
    },
  ],

  revenueMix: { projectPct: 60, recurringPct: 40 },

  derivedEconomics: {
    newProjectEngagementsPerYear: 60,
    averageProjectValue: 32_000,
    activeRetainerClients: 33,
    averageRetainerMonthlyFee: 3_200,
    leadsPerYear: 720,
    qualifiedRatePct: 38,
    closeRatePct: 22,
  },

  clientProfile: {
    segment:
      'Mid-market B2B SaaS companies selling into enterprise buyers who require a security attestation before signing.',
    typicalClientSize: '40-400 employees, roughly $5M-$60M ARR, usually without a dedicated compliance function.',
    typicalContacts: [
      'CTO or VP Engineering (usually the economic sponsor in smaller clients)',
      'Head of Security or the company’s first security hire',
      'CFO or COO where budget approval is separated from technical ownership',
      'General Counsel, occasionally, where contractual commitments are in play',
    ],
    buyingTriggers: [
      'An enterprise deal is blocked pending SOC 2 evidence',
      'A security questionnaire was returned late or failed',
      'An investor or board set an attestation requirement ahead of a raise',
      'An existing attestation is approaching its renewal window',
      'Entry into UK or EU markets where ISO 27001 is expected',
      'A customer-visible security incident forced the topic onto the roadmap',
    ],
  },

  roles: [
    {
      id: 'founder',
      name: 'Managing Principal (founder)',
      responsibilities:
        'Runs discovery calls, approves all commercial commitments, owns referral relationships, and is the final escalation point.',
      authorityCeiling: 4,
    },
    {
      id: 'head-of-delivery',
      name: 'Head of Delivery',
      responsibilities:
        'Owns engagement staffing, readiness sign-off, and audit-window handover. Approves scope changes up to a defined value.',
      authorityCeiling: 3,
    },
    {
      id: 'client-partner',
      name: 'Client Partner',
      responsibilities:
        'Owns named accounts through qualification, scoping, and proposal. Cannot approve pricing outside the standard rate card.',
      authorityCeiling: 3,
    },
    {
      id: 'analyst',
      name: 'Compliance Analyst',
      responsibilities:
        'Collects evidence, maps controls, drafts policies, and prepares client-facing status. Does not communicate commercial terms.',
      authorityCeiling: 1,
    },
    {
      id: 'ops-coordinator',
      name: 'Operations Coordinator',
      responsibilities:
        'Runs onboarding logistics, access requests, scheduling, and the onboarding checklist. Chases missing information.',
      authorityCeiling: 2,
    },
    {
      id: 'finance',
      name: 'Finance (fractional bookkeeper)',
      responsibilities:
        'Issues invoices, reconciles payments, and maintains the accounting system as the authoritative financial record. Two days a week.',
      authorityCeiling: 2,
    },
  ],

  leadSources: [
    {
      id: 'website-form',
      name: 'Website enquiry form',
      channel: 'Web form',
      approxMonthlyVolume: 18,
      qualityNote:
        'Highest volume and widest quality spread. Carries a mix of genuine buyers, students, competitors, and vendors pitching tooling.',
      impliesContactConsent: true,
    },
    {
      id: 'referral-partner',
      name: 'Referral partner introduction',
      channel: 'Email introduction',
      approxMonthlyVolume: 14,
      qualityNote:
        'Highest converting source. Audit firms and fractional security officers refer readiness work they cannot perform without impairing their own independence.',
      impliesContactConsent: true,
    },
    {
      id: 'shared-inbox',
      name: 'Direct email to the sales inbox',
      channel: 'Shared inbox',
      approxMonthlyVolume: 11,
      qualityNote:
        'Unstructured free text with no form fields, so scope drivers are almost always missing on first contact.',
      impliesContactConsent: true,
    },
    {
      id: 'marketplace-listing',
      name: 'Comparison and marketplace listing',
      channel: 'Third-party listing',
      approxMonthlyVolume: 9,
      qualityNote:
        'Buyers here are actively comparing three or four firms simultaneously, so response latency is competitively decisive.',
      impliesContactConsent: true,
    },
    {
      id: 'event-followup',
      name: 'Conference and webinar follow-up',
      channel: 'Event list',
      approxMonthlyVolume: 5,
      qualityNote:
        'Consent is scoped to the event context. Attendance is not a standing permission for unrelated commercial outreach.',
      impliesContactConsent: false,
    },
    {
      id: 'client-expansion',
      name: 'Existing client expansion enquiry',
      channel: 'Account manager',
      approxMonthlyVolume: 3,
      qualityNote:
        'Already a customer. Must never be treated as a cold lead or entered into prospecting sequences.',
      impliesContactConsent: true,
    },
  ],

  pipelineStages: [
    {
      id: 'enquiry',
      name: 'Enquiry received',
      exitCriteria: 'Contactable party, legitimate intent, and inside the served segment.',
    },
    {
      id: 'qualified',
      name: 'Qualified',
      exitCriteria:
        'Framework, approximate scope, headcount, cloud footprint, and any external deadline are known.',
    },
    {
      id: 'scoping',
      name: 'Scoping call held',
      exitCriteria:
        'A structured commercial record exists with every unknown explicitly marked as unknown.',
    },
    {
      id: 'proposal',
      name: 'Proposal issued',
      exitCriteria: 'Human-approved proposal delivered and acknowledged by the client.',
    },
    {
      id: 'verbal',
      name: 'Verbal commitment',
      exitCriteria: 'Client has agreed terms and a signature process has started.',
    },
    {
      id: 'closed',
      name: 'Closed',
      exitCriteria: 'Signed SOW, or a recorded loss reason.',
    },
  ],

  salesCycle: {
    typicalDaysToClose: 34,
    typicalTouches: 7,
    commonObjections: [
      'We think we can do this in-house with the team we have',
      'We are waiting on the auditor to quote before committing to readiness',
      'Budget does not land until next quarter',
      'Our prospect might accept a completed security questionnaire instead',
      'We already work with a fractional security officer',
      'We were quoted less by a platform that automates most of this',
    ],
  },

  onboardingRequirements: [
    {
      id: 'signed-sow',
      item: 'Signed SOW with confirmed scope and framework',
      why: 'Defines what is in scope. Ambiguity here becomes a billing dispute later.',
      sensitive: false,
    },
    {
      id: 'named-owner',
      item: 'Named client-side owner and escalation contact',
      why: 'Evidence collection stalls without a single accountable person on the client side.',
      sensitive: false,
    },
    {
      id: 'system-inventory',
      item: 'Inventory of in-scope systems and subprocessors',
      why: 'Determines control scope and the size of the evidence surface.',
      sensitive: false,
    },
    {
      id: 'cloud-access',
      item: 'Read-only access to the cloud infrastructure console',
      why: 'Required to observe configuration evidence directly rather than by assertion.',
      sensitive: true,
    },
    {
      id: 'idp-access',
      item: 'Read-only access to the identity provider',
      why: 'Access review evidence depends on it.',
      sensitive: true,
    },
    {
      id: 'scm-access',
      item: 'Read-only access to the source control organisation',
      why: 'Change management and code review evidence depends on it.',
      sensitive: true,
    },
    {
      id: 'existing-policies',
      item: 'Existing policy documents and any prior audit reports',
      why: 'Avoids re-authoring policies the client already has, and avoids re-asking for known facts.',
      sensitive: false,
    },
    {
      id: 'audit-window',
      item: 'Target audit window and the audit firm engaged',
      why: 'Sets the schedule the entire engagement works backwards from.',
      sensitive: false,
    },
  ],

  sourceSystems: [
    {
      id: 'crm',
      name: 'Client CRM',
      systemOfRecordFor: [
        'lead and contact identity',
        'opportunity stage and value',
        'contact consent and suppression state',
      ],
    },
    {
      id: 'shared-inbox',
      name: 'Shared sales inbox',
      systemOfRecordFor: ['inbound enquiry receipt', 'prospect replies'],
    },
    {
      id: 'accounting',
      name: 'Accounting system',
      systemOfRecordFor: [
        'invoice identity',
        'invoice amount',
        'due date',
        'outstanding balance',
        'payment status',
      ],
    },
    {
      id: 'workspace',
      name: 'Delivery workspace',
      systemOfRecordFor: ['engagement tasks', 'task ownership', 'onboarding checklist state'],
    },
    {
      id: 'evidence-platform',
      name: 'Evidence platform',
      systemOfRecordFor: ['control status', 'evidence artefacts', 'control drift signals'],
    },
    {
      id: 'calendar',
      name: 'Scheduling calendar',
      systemOfRecordFor: ['booked calls', 'audit window dates'],
    },
  ],

  invoicing: {
    terms:
      'Net 30 from invoice date. Project work bills 40% on signature, 40% at readiness sign-off, and 20% at audit-window handover. Retainers bill monthly in advance.',
    netDays: 30,
    cadence: 'Retainers on the 1st of each month; project milestones on trigger.',
    typicalInvoiceValue: 12_800,
    commonDisputeReasons: [
      'Scope-change work billed without a signed change order',
      'Readiness sign-off milestone disputed as not met',
      'Duplicate invoice raised after a milestone was re-dated',
      'Procurement requires a PO number that was never issued',
      'Retainer billed for a month the client believed was paused',
    ],
  },

  referralPartners: {
    description:
      'Independent audit firms and fractional security officers refer readiness work they cannot perform themselves without impairing their independence. The relationship is reciprocal but informal.',
    shareOfPipelinePct: 28,
    concentrationNote:
      'Two audit firms account for roughly two thirds of referred pipeline. Losing either would be a material revenue event, which is why partner concentration is a tracked business exception rather than a vanity metric.',
  },

  renewals: {
    term: '12-month managed compliance agreements renewing on the anniversary of the audit window.',
    typicalRenewalRatePct: 82,
    churnDrivers: [
      'Client hires an internal security lead and brings the work in-house',
      'Client is acquired and adopts the acquirer’s programme',
      'Attestation achieved and the client under-estimates the ongoing evidence burden',
      'Budget compression following a down round',
    ],
  },

  operatingConstraints: [
    'Delivery capacity is the binding constraint. Six analysts carry roughly 60 concurrent engagements at mixed intensity, so won work that cannot be staffed is a real cost, not a win.',
    'Audit windows cluster in Q4 and Q1. Demand is seasonal; salaried capacity is not.',
    'The founder runs most discovery calls, so sales throughput competes directly with delivery oversight and is the first thing to degrade under load.',
    'Evidence collection depends on client responsiveness, which Kestrel does not control and must not model as though it did.',
    'Client control and posture data is confidential and commercially sensitive. It cannot be aggregated across clients or used in marketing.',
    'Referral relationships depend on Kestrel never appearing to compete with the referring audit firm.',
  ],

  policies: [
    {
      id: 'kestrel-ack-window',
      statement:
        'Every inbound enquiry receives an acknowledgement within 5 minutes of receipt, at any hour of the day.',
      provenance: 'CLIENT_POLICY',
      verification: 'NOT_APPLICABLE',
      sourceIds: [],
      appliesTo:
        'Lead Rescue acknowledgement timing. Chosen by this fictional firm because its buyers routinely contact three or four firms at once; a different firm could rationally choose differently.',
    },
    {
      id: 'kestrel-routing-window',
      statement:
        'A qualified enquiry is routed to a named human owner within 30 minutes during business hours, or by 09:00 the next business day outside them.',
      provenance: 'CLIENT_POLICY',
      verification: 'NOT_APPLICABLE',
      sourceIds: [],
      appliesTo: 'Lead Rescue meaningful-response path and the routing latency metric.',
    },
    {
      id: 'kestrel-confidence-floor',
      statement:
        'A bounded classification returning confidence below 0.70 is routed to human review and never acted on autonomously.',
      provenance: 'CLIENT_POLICY',
      verification: 'NOT_APPLICABLE',
      sourceIds: [],
      appliesTo:
        'The escalation threshold in Lead Rescue and Call-to-Proposal. The specific number is this firm’s risk tolerance, not a general finding.',
    },
    {
      id: 'kestrel-outreach-cadence',
      statement:
        'Dormant reactivation is limited to three attempts across 21 days, followed by a 90-day cooling-off period before any re-entry.',
      provenance: 'CLIENT_POLICY',
      verification: 'NOT_APPLICABLE',
      sourceIds: [],
      appliesTo: 'Dormant Pipeline Recovery sequence limits and re-entry rules.',
    },
    {
      id: 'kestrel-suppression-immediate',
      statement:
        'Opt-out and do-not-contact state is honoured immediately on receipt and permanently thereafter, ahead of the statutory deadline.',
      provenance: 'CLIENT_POLICY',
      verification: 'NOT_APPLICABLE',
      sourceIds: [],
      appliesTo:
        'Suppression handling in Lead Rescue and Dormant Pipeline Recovery. This policy is stricter than the legal floor; the floor itself is recorded separately as evidence.',
    },
    {
      id: 'kestrel-restricted-contact-review',
      statement:
        'A new inbound inquiry from a contact who carries prior consent-withdrawal on file is never acted on autonomously. It is held for a named person to determine whether this specific inquiry may be answered, regardless of how the enquiry classifies or how confident that classification is.',
      provenance: 'CLIENT_POLICY',
      verification: 'NOT_APPLICABLE',
      sourceIds: [],
      appliesTo:
        'Lead Rescue policy evaluation ahead of the acknowledgement/routing action. This is a business risk-tolerance choice, not a legal determination: whether a prior marketing opt-out should extend to a separately-initiated business inquiry is genuinely a judgement call, and this policy routes that judgement to a person every time rather than encoding an answer either way.',
    },
    {
      id: 'kestrel-collection-cadence',
      statement:
        'Payment reminders issue 3 days before due date and again on days 1, 8, 15 and 30 past due, with escalation to the founder at day 45.',
      provenance: 'CLIENT_POLICY',
      verification: 'NOT_APPLICABLE',
      sourceIds: [],
      appliesTo: 'Receivables reminder cadence and escalation thresholds.',
    },
    {
      id: 'kestrel-dispute-halt',
      statement:
        'A disputed invoice halts every automated collection action immediately and enters the dispute path until a human resolves it.',
      provenance: 'CLIENT_POLICY',
      verification: 'NOT_APPLICABLE',
      sourceIds: [],
      appliesTo: 'Receivables dispute handling and the suppression of the normal collection cadence.',
    },
    {
      id: 'kestrel-proposal-authority',
      statement:
        'No proposal, quote, or commercial commitment leaves the firm without named human approval.',
      provenance: 'CLIENT_POLICY',
      verification: 'NOT_APPLICABLE',
      sourceIds: [],
      appliesTo:
        'Call-to-Proposal authority ceiling. Caps proposal despatch at authority level 2 regardless of model confidence.',
    },
    {
      id: 'kestrel-attestation-language',
      statement:
        'No communication may state or imply that Kestrel will deliver, guarantee, or accelerate a certification, attestation, or audit opinion.',
      provenance: 'CLIENT_POLICY',
      verification: 'NOT_APPLICABLE',
      sourceIds: [],
      appliesTo:
        'Every outbound message across all six systems. Follows directly from the firm not being a certification body or auditor, and is the commercially load-bearing guardrail on generated text.',
    },
    {
      id: 'kestrel-evidence-confidentiality',
      statement:
        'Client control and evidence data is never aggregated across clients and never used in marketing.',
      provenance: 'CLIENT_POLICY',
      verification: 'NOT_APPLICABLE',
      sourceIds: [],
      appliesTo: 'Owner Revenue Intelligence aggregation rules and any cross-client reporting.',
    },
    {
      id: 'kestrel-credential-handling',
      statement:
        'Access credentials are requested through the client’s own secret-sharing channel and are never captured in workflow state, tickets, email, or logs.',
      provenance: 'CLIENT_POLICY',
      verification: 'NOT_APPLICABLE',
      sourceIds: [],
      appliesTo:
        'Client Onboarding Operator access provisioning. Implements the secrets-handling evidence standard as a concrete firm rule.',
    },
  ],

  operatingParameters: [
    { key: 'confidenceFloor', label: 'Bounded judgment confidence floor', value: 0.7, unit: 'probability', policyId: 'kestrel-confidence-floor' },
    { key: 'acknowledgementTargetSeconds', label: 'Acknowledgement target', value: 300, unit: 'seconds', policyId: 'kestrel-ack-window' },
    { key: 'routingTargetMinutes', label: 'Routing target, business hours', value: 30, unit: 'minutes', policyId: 'kestrel-routing-window' },
    { key: 'maxInformationQuestions', label: 'Maximum clarifying questions before human review', value: 2, unit: 'questions', policyId: 'kestrel-routing-window' },
    { key: 'dormantMaxAttempts', label: 'Maximum reactivation attempts', value: 3, unit: 'attempts', policyId: 'kestrel-outreach-cadence' },
    { key: 'dormantWindowDays', label: 'Reactivation sequence window', value: 21, unit: 'days', policyId: 'kestrel-outreach-cadence' },
    { key: 'dormantCoolingOffDays', label: 'Cooling-off before re-entry', value: 90, unit: 'days', policyId: 'kestrel-outreach-cadence' },
    { key: 'collectionEscalationDays', label: 'Escalation to founder past due', value: 45, unit: 'days past due', policyId: 'kestrel-collection-cadence' },
    { key: 'proposalAuthorityCeiling', label: 'Maximum authority for outbound commercial documents', value: 2, unit: 'authority level', policyId: 'kestrel-proposal-authority' },
  ],
} satisfies Parameters<typeof BusinessProfileSchema.parse>[0];

export const KESTREL: BusinessProfile = BusinessProfileSchema.parse(RAW);
