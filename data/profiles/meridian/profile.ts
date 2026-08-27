import { BusinessProfileSchema, type BusinessProfile } from '@/lib/model/profile';

/**
 * MERIDIAN LOCALISATION — A STRUCTURAL FIXTURE.
 *
 * This profile exists to falsify one claim: that retargeting the portfolio to a different
 * business is a matter of authoring a second profile rather than editing systems, handlers,
 * or the engine. `lib/model/profile.ts` asserted that from the beginning, and
 * `tests/seam.test.ts` guarded it with a blacklist of remembered Kestrel vocabulary — which
 * can only ever show that the terms somebody thought of are absent. It cannot show that a
 * second profile is possible. Only a second profile can.
 *
 * IT IS NOT A DEMONSTRATION BUSINESS. It is deliberately absent from `RUNNABLE_SYSTEMS`,
 * from the simulator, and from every rendered surface. Nothing here has been grounded in how
 * localisation firms actually operate, and `COMMERCIAL_THESIS.md` §6 requires that grounding
 * of any profile a visitor is shown — a practitioner should recognise their own operation,
 * and a model's guess about an industry will not clear that bar. Presenting this one would
 * be exactly the overclaim the maturity labels exist to prevent.
 *
 * The vertical was chosen for distance. A second compliance consultancy would pass every
 * assertion in the swap test while proving almost nothing, because the vocabulary, the
 * economics, and the failure modes would be the ones the systems were built against.
 * Localisation shares none of them.
 *
 * EVERYTHING HERE IS FICTIONAL. The figures are invented, and the schema pins `provenance`
 * to `FIXTURE` so they cannot be read as researched benchmarks. They are, however,
 * reconcilable: `validateProfileConsistency` checks that revenue, engagement values, client
 * counts, and lead volume describe one coherent firm, and this profile is required to pass
 * it exactly as Kestrel is.
 */
export const MERIDIAN: BusinessProfile = BusinessProfileSchema.parse({
  id: 'meridian',
  name: 'Meridian Localisation',
  tagline: 'Multilingual content operations for software and life-sciences teams shipping into regulated markets.',

  provenance: 'FIXTURE',
  fictionalDisclosure:
    'Meridian Localisation is a fictional firm authored as a structural test fixture. It has no clients, no revenue, and no existence outside this repository. Every figure below is invented and reconcilable, never researched.',

  company: {
    headcount: 24,
    approximateAnnualRevenue: 4_200_000,
    foundedYear: 2014,
    operatingModel:
      'A project-managed vendor network. Twenty-four staff run scoping, terminology, quality assurance, and delivery engineering; translation itself is performed by contracted linguists assigned per locale and subject area.',
    explicitlyNot: [
      'Does not certify or notarise translations, and does not employ sworn translators.',
      'Does not provide legal, medical, or regulatory advice on the content it translates.',
      'Does not accept liability for source-text accuracy; it renders what the client supplies.',
      'Does not perform live simultaneous interpreting.',
    ],
  },

  serviceLines: [
    {
      id: 'product-localisation',
      name: 'Product & UI Localisation',
      description:
        'String extraction, translation, in-context review, and pseudo-locale testing for application interfaces across a defined locale set.',
      deliveryModel: 'PROJECT',
      typicalValue: 48_000,
      typicalDurationWeeks: 10,
    },
    {
      id: 'regulated-documentation',
      name: 'Regulated Documentation',
      description:
        'Instructions for use, labelling, and safety documentation prepared to a client-supplied terminology standard with a second-linguist review pass.',
      deliveryModel: 'PROJECT',
      typicalValue: 36_000,
      typicalDurationWeeks: 8,
    },
    {
      id: 'continuous-content',
      name: 'Continuous Content Operations',
      description:
        'Rolling monthly throughput against a maintained translation memory and glossary, with agreed turnaround bands by content class.',
      deliveryModel: 'RECURRING',
      typicalValue: 7_000,
    },
  ],

  revenueMix: { projectPct: 60, recurringPct: 40 },

  derivedEconomics: {
    newProjectEngagementsPerYear: 60,
    averageProjectValue: 42_000,
    activeRetainerClients: 20,
    averageRetainerMonthlyFee: 7_000,
    leadsPerYear: 720,
    qualifiedRatePct: 42,
    closeRatePct: 20,
  },

  clientProfile: {
    segment:
      'Mid-market software and medical-device companies expanding into European and East Asian markets, typically with a first in-house localisation hire but no vendor management function.',
    typicalClientSize: '80–600 employees',
    typicalContacts: [
      'Localisation Manager',
      'Head of Product',
      'Regulatory Affairs Lead',
      'Technical Documentation Manager',
    ],
    buyingTriggers: [
      'A market launch date has been committed and the locale set has grown beyond what one internal hire can manage.',
      'A regulator or distributor has rejected documentation on language grounds.',
      'An incumbent vendor has missed a release window.',
      'Translation memory has been left to rot and terminology is drifting between releases.',
    ],
  },

  roles: [
    {
      id: 'principal',
      name: 'Managing Director (founder)',
      responsibilities:
        'Owns pricing, approves all commercial commitments and scope changes above a defined value, holds the vendor-network relationships, and is the final escalation point.',
      authorityCeiling: 4,
    },
    {
      id: 'delivery-lead',
      name: 'Head of Delivery',
      responsibilities:
        'Owns locale staffing, turnaround commitments, and release-window handover. Approves scope changes up to a defined value and signs off quality escalations.',
      authorityCeiling: 3,
    },
    {
      id: 'account-manager',
      name: 'Account Manager',
      responsibilities:
        'Runs scoping conversations, prepares quotes for approval, and owns day-to-day client communication across the retainer accounts.',
      authorityCeiling: 2,
    },
    {
      id: 'terminology-lead',
      name: 'Terminology & Quality Lead',
      responsibilities:
        'Maintains glossaries and translation memory, defines the quality standard per content class, and adjudicates linguistic disputes.',
      authorityCeiling: 2,
    },
    {
      id: 'coordinator',
      name: 'Project Coordinator',
      responsibilities:
        'Schedules linguist assignments, chases file handoffs, tracks turnaround against commitment, and prepares invoices for review.',
      authorityCeiling: 1,
    },
  ],

  leadSources: [
    {
      id: 'partner-referral',
      name: 'Systems integrator referrals',
      channel: 'Referral',
      approxMonthlyVolume: 14,
      qualityNote:
        'Highest close rate. Arrives with a launch date already fixed, which compresses scoping but raises urgency.',
      impliesContactConsent: true,
    },
    {
      id: 'site-enquiry',
      name: 'Website enquiry form',
      channel: 'Web form',
      approxMonthlyVolume: 22,
      qualityNote:
        'Highest volume, widest quality range. A material share are students and job seekers rather than buyers.',
      impliesContactConsent: true,
    },
    {
      id: 'procurement-portal',
      name: 'Procurement portal invitations',
      channel: 'RFP portal',
      approxMonthlyVolume: 9,
      qualityNote:
        'Structured and slow. Frequently price-led, and often issued to satisfy a three-quote requirement.',
      impliesContactConsent: true,
    },
    {
      id: 'conference',
      name: 'Industry conference contacts',
      channel: 'Event',
      approxMonthlyVolume: 6,
      qualityNote:
        'Relationship-led and slow to convert. Consent is given verbally at the stand and recorded by hand.',
      impliesContactConsent: false,
    },
    {
      id: 'account-expansion',
      name: 'Existing-client new business units',
      channel: 'Account expansion',
      approxMonthlyVolume: 9,
      qualityNote:
        'A new department inside an existing client. Commercially warm, but the terminology baseline rarely transfers.',
      impliesContactConsent: true,
    },
  ],

  pipelineStages: [
    { id: 'enquiry', name: 'Enquiry', exitCriteria: 'Locale set, content class, and target date are known.' },
    { id: 'scoping', name: 'Scoping', exitCriteria: 'Source volume counted and a sample assessed for complexity.' },
    { id: 'quoted', name: 'Quoted', exitCriteria: 'Rate card applied, quote approved internally, and issued.' },
    { id: 'won', name: 'Won', exitCriteria: 'Order confirmed and the delivery window agreed in writing.' },
    { id: 'onboarding', name: 'Onboarding', exitCriteria: 'Glossary, style guide, and repository access in place.' },
    { id: 'delivering', name: 'Delivering', exitCriteria: 'All committed locales delivered and accepted.' },
  ],

  salesCycle: {
    typicalDaysToClose: 38,
    typicalTouches: 6,
    commonObjections: [
      'A per-word price from an offshore competitor is roughly half.',
      'Machine translation is claimed to be sufficient for this content class.',
      'The incumbent vendor already holds the translation memory.',
      'Nobody internally can commit to a terminology standard before the deadline.',
    ],
  },

  onboardingRequirements: [
    {
      id: 'glossary',
      item: 'Approved terminology glossary, or written agreement to build one',
      why: 'Without an agreed glossary, terminology drifts between releases and every review cycle relitigates the same words.',
      sensitive: false,
    },
    {
      id: 'style-guide',
      item: 'Brand style guide and tone-of-voice reference per market',
      why: 'Register decisions made per-linguist rather than per-brand are the single most common cause of rejected review passes.',
      sensitive: false,
    },
    {
      id: 'repo-access',
      item: 'Repository or CMS access token for string extraction',
      why: 'String extraction runs directly against the client system; without access, files arrive by email and version drift begins immediately.',
      sensitive: true,
    },
    {
      id: 'reviewer',
      item: 'Named in-market reviewer per locale, with committed review hours',
      why: 'An unnamed reviewer means review never happens, and the delivery is accepted by silence rather than by judgement.',
      sensitive: false,
    },
    {
      id: 'tm-handover',
      item: 'Existing translation memory export from the outgoing vendor',
      why: 'Rebuilding memory from scratch discards prior spend and reintroduces terminology the client already settled.',
      sensitive: false,
    },
  ],

  sourceSystems: [
    {
      id: 'tms',
      name: 'Translation management platform',
      systemOfRecordFor: ['job state', 'linguist assignment', 'turnaround clock', 'translation memory'],
    },
    {
      id: 'crm',
      name: 'Sales pipeline tool',
      systemOfRecordFor: ['opportunity stage', 'quote value', 'contact ownership'],
    },
    {
      id: 'ledger',
      name: 'Accounting package',
      systemOfRecordFor: ['invoice status', 'payment receipt', 'credit notes'],
    },
    {
      id: 'drive',
      name: 'Shared document store',
      systemOfRecordFor: ['style guides', 'signed orders', 'reviewer sign-off records'],
    },
  ],

  invoicing: {
    terms: 'Net 30 from delivery of the final accepted locale, with milestone billing above a defined project value.',
    netDays: 30,
    cadence: 'Monthly on the first working day, plus milestone invoices on acceptance.',
    typicalInvoiceValue: 14_000,
    commonDisputeReasons: [
      'Word count disputed after the client edited source text mid-project.',
      'Rush surcharge applied without written pre-approval.',
      'A locale was invoiced before the in-market reviewer signed off.',
      'Purchase-order number missing, so the invoice never entered the client approval queue.',
    ],
  },

  referralPartners: {
    description:
      'Systems integrators and product agencies who encounter localisation needs during a client launch and have no language capability of their own.',
    shareOfPipelinePct: 23,
    concentrationNote:
      'Two integrators account for the majority of referral volume. Losing either would remove roughly a fifth of qualified pipeline within a quarter.',
  },

  renewals: {
    term: 'Twelve-month continuous-content agreements with a ninety-day notice period.',
    typicalRenewalRatePct: 78,
    churnDrivers: [
      'The client hires an in-house localisation team and brings throughput inside.',
      'A product launch concludes and rolling volume falls below the agreement minimum.',
      'Procurement re-tenders on price at renewal regardless of delivery record.',
      'The named in-market reviewer leaves and quality complaints follow.',
    ],
  },

  operatingConstraints: [
    'Linguist capacity per locale is finite and cannot be surged on short notice for low-resource languages.',
    'Turnaround commitments assume source text is final; mid-project source edits reset the clock.',
    'Repository access tokens are held per client and must never be persisted into general workflow state.',
    'No locale may be marked delivered before the in-market reviewer has signed off.',
    'Machine translation may draft, but never ships to a regulated content class without a full human pass.',
  ],

  policies: [
    {
      id: 'meridian-ack-window',
      statement: 'Every inbound enquiry receives an acknowledgement within 15 minutes during published hours.',
      provenance: 'CLIENT_POLICY',
      verification: 'NOT_APPLICABLE',
      sourceIds: [],
      appliesTo:
        'Acknowledgement timing. This fictional firm sells on delivery record rather than response speed, so it commits to a slower window than a firm competing on first response would.',
    },
    {
      id: 'meridian-routing-window',
      statement: 'A qualified enquiry reaches a named account manager within two hours during published hours.',
      provenance: 'CLIENT_POLICY',
      verification: 'NOT_APPLICABLE',
      sourceIds: [],
      appliesTo: 'Routing and the number of clarifying questions asked before a person takes over.',
    },
    {
      id: 'meridian-confidence-floor',
      statement:
        'Automated interpretation of an enquiry may only act on its own conclusion when confidence is at or above 0.85; below that a person decides.',
      provenance: 'CLIENT_POLICY',
      verification: 'NOT_APPLICABLE',
      sourceIds: [],
      appliesTo:
        'Bounded AI judgement. Set deliberately high because a misrouted regulated-documentation enquiry costs more than a slow one.',
    },
    {
      id: 'meridian-reply-wait-window',
      statement: 'An awaited client reply is escalated to a person after three working days.',
      provenance: 'CLIENT_POLICY',
      verification: 'NOT_APPLICABLE',
      sourceIds: [],
      appliesTo: 'Wait-and-resume behaviour on an outstanding client response.',
    },
    {
      id: 'meridian-booking-offer-window',
      statement: 'An unaccepted scoping-call offer is escalated after four days.',
      provenance: 'CLIENT_POLICY',
      verification: 'NOT_APPLICABLE',
      sourceIds: [],
      appliesTo: 'Scoping-call scheduling offers that go unanswered.',
    },
    {
      id: 'meridian-review-timeout-window',
      statement: 'Work parked for human review is surfaced as overdue after two working days.',
      provenance: 'CLIENT_POLICY',
      verification: 'NOT_APPLICABLE',
      sourceIds: [],
      appliesTo: 'Attention timeouts on any state awaiting a person.',
    },
    {
      id: 'meridian-dispatch-timeout-window',
      statement: 'A prepared but undespatched action is surfaced as overdue after twelve hours.',
      provenance: 'CLIENT_POLICY',
      verification: 'NOT_APPLICABLE',
      sourceIds: [],
      appliesTo: 'Ready-but-unsent outbound actions.',
    },
    {
      id: 'meridian-outreach-cadence',
      statement:
        'A dormant account receives at most two reactivation attempts across a thirty-day window before it is left alone.',
      provenance: 'CLIENT_POLICY',
      verification: 'NOT_APPLICABLE',
      sourceIds: [],
      appliesTo: 'Reactivation attempt limits and sequence duration.',
    },
    {
      id: 'meridian-entity-resolution',
      statement:
        'Two records are treated as the same client only at 0.95 confidence or above; below that a person confirms.',
      provenance: 'CLIENT_POLICY',
      verification: 'NOT_APPLICABLE',
      sourceIds: [],
      appliesTo:
        'Identity resolution. Set high because clients frequently operate several near-identically named legal entities per market.',
    },
    {
      id: 'meridian-collection-cadence',
      statement: 'An invoice thirty days past due is escalated to the Managing Director.',
      provenance: 'CLIENT_POLICY',
      verification: 'NOT_APPLICABLE',
      sourceIds: [],
      appliesTo: 'Receivables escalation timing.',
    },
    {
      id: 'meridian-proposal-authority',
      statement:
        'A quote may be prepared automatically but issued only by a person holding delivery authority or above.',
      provenance: 'CLIENT_POLICY',
      verification: 'NOT_APPLICABLE',
      sourceIds: [],
      appliesTo: 'The authority ceiling on outbound commercial documents.',
    },
    {
      id: 'meridian-proposal-approval-window',
      statement: 'A quote awaiting internal approval is surfaced as overdue after three days.',
      provenance: 'CLIENT_POLICY',
      verification: 'NOT_APPLICABLE',
      sourceIds: [],
      appliesTo: 'Quote approval attention timeouts.',
    },
    {
      id: 'meridian-analysis-freshness',
      statement: 'Owner reporting may not draw on operational data older than one week.',
      provenance: 'CLIENT_POLICY',
      verification: 'NOT_APPLICABLE',
      sourceIds: [],
      appliesTo: 'Input staleness tolerance for periodic analysis.',
    },
    {
      id: 'meridian-exception-materiality',
      statement: 'A variance of eight percent or more against plan is treated as an exception worth an owner’s attention.',
      provenance: 'CLIENT_POLICY',
      verification: 'NOT_APPLICABLE',
      sourceIds: [],
      appliesTo: 'Exception-candidate materiality thresholds.',
    },
    {
      id: 'meridian-malformed-intake',
      statement: 'A malformed intake payload is retried twice before a person is asked to look at it.',
      provenance: 'CLIENT_POLICY',
      verification: 'NOT_APPLICABLE',
      sourceIds: [],
      appliesTo: 'Retry budget on unparseable inbound payloads.',
    },
  ],

  operatingParameters: [
    { key: 'acknowledgementTargetSeconds', label: 'Acknowledgement target', value: 900, unit: 'seconds', policyId: 'meridian-ack-window' },
    { key: 'routingTargetMinutes', label: 'Routing target, published hours', value: 120, unit: 'minutes', policyId: 'meridian-routing-window' },
    { key: 'maxInformationQuestions', label: 'Maximum clarifying questions before human review', value: 3, unit: 'questions', policyId: 'meridian-routing-window' },
    { key: 'confidenceFloor', label: 'Minimum confidence to act on an interpretation', value: 0.85, unit: 'probability', policyId: 'meridian-confidence-floor' },
    { key: 'replyWaitWindowHours', label: 'Reply wait window before escalation', value: 72, unit: 'hours', policyId: 'meridian-reply-wait-window' },
    { key: 'bookingOfferWindowHours', label: 'Scoping-call offer wait window', value: 96, unit: 'hours', policyId: 'meridian-booking-offer-window' },
    { key: 'humanReviewTimeoutHours', label: 'Human review attention timeout', value: 48, unit: 'hours', policyId: 'meridian-review-timeout-window' },
    { key: 'dispatchTimeoutHours', label: 'Ready-but-undespatched attention timeout', value: 12, unit: 'hours', policyId: 'meridian-dispatch-timeout-window' },
    { key: 'dormantMaxAttempts', label: 'Maximum reactivation attempts', value: 2, unit: 'attempts', policyId: 'meridian-outreach-cadence' },
    { key: 'dormantWindowDays', label: 'Reactivation sequence window', value: 30, unit: 'days', policyId: 'meridian-outreach-cadence' },
    { key: 'entityMatchThreshold', label: 'Minimum confidence to accept an entity match', value: 0.95, unit: 'probability', policyId: 'meridian-entity-resolution' },
    { key: 'collectionEscalationDays', label: 'Escalation to the Managing Director past due', value: 30, unit: 'days past due', policyId: 'meridian-collection-cadence' },
    { key: 'proposalAuthorityCeiling', label: 'Maximum authority for outbound commercial documents', value: 3, unit: 'authority level', policyId: 'meridian-proposal-authority' },
    { key: 'proposalApprovalTimeoutHours', label: 'Quote approval attention timeout', value: 72, unit: 'hours', policyId: 'meridian-proposal-approval-window' },
    { key: 'inputStalenessToleranceHours', label: 'Analysis input staleness tolerance', value: 168, unit: 'hours', policyId: 'meridian-analysis-freshness' },
    { key: 'exceptionVarianceThresholdPct', label: 'Exception-candidate variance threshold', value: 8, unit: 'percent', policyId: 'meridian-exception-materiality' },
    { key: 'malformedRetryBudget', label: 'Attempts on a malformed intake payload before a person is asked', value: 2, unit: 'attempts', policyId: 'meridian-malformed-intake' },
  ],

  accountabilities: [
    {
      action: 'PROPOSAL_APPROVAL',
      roleId: 'delivery-lead',
      escalatesToRoleId: 'principal',
      policyId: 'meridian-proposal-authority',
    },
  ],
});
