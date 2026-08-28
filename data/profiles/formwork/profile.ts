import { BusinessProfileSchema, type BusinessProfile } from '@/lib/model/profile';

/**
 * WRENFIELD ARCHITECTURE + ENGINEERING — a fictional demonstration business.
 *
 * NAMING. This profile was authored as "Formwork Architecture + Engineering" and renamed at
 * registration, because "Formwork Architecture" is the trading name of several real practices
 * in this exact trade — in St. Louis, Barbados, London, and Australia among others. The
 * authoring packet forbids a fictional business from carrying a real company's name, and a
 * search for "Wrenfield" returns no design practice. The directory, `id`, and exported const
 * remain `formwork`: those are internal keys that reach no rendered surface, and every
 * document in this repository refers to this profile by that slug.
 *
 * EVERY NUMBER AND FACT BELOW IS SYNTHETIC. No real practice is described here, and the
 * schema pins `provenance` to the FIXTURE literal so none of it can be read as a researched
 * benchmark about a real firm.
 *
 * Synthetic is not arbitrary. The authority model, the contractual boundaries, and five of the
 * seventeen operating thresholds are CALIBRATED against sources cited from
 * `data/profiles/index.ts` and retained in `docs/evidence/grounding-captures.json`. Those
 * sources establish facts about US architecture and engineering practice; they say nothing
 * about this firm, which does not exist.
 *
 * WHAT IS GROUNDED AND WHAT IS CHOSEN — stated here because the distinction is the whole
 * point, and because the research behind this profile found far less published convention
 * than a software model would like:
 *
 *   GROUNDED   revenue per head ($180k, inside the published $175k–$190k band for a
 *              design-led practice of this size); receivables escalation to a principal at
 *              45 days past due and principal-to-principal correspondence beyond 90; the 10%
 *              variance that demands immediate management review; the weekly work-in-progress
 *              rhythm the review and staleness windows are set against; final approval of an
 *              outbound fee proposal sitting with the principal; who may sign and seal a
 *              technical submission and what responsible control does not include; and every
 *              boundary in `explicitlyNot` that the owner–architect agreement itself states.
 *   CHOSEN     the project/recurring split, and twelve of the seventeen thresholds. No
 *              retrieved AIA, ACEC, Zweig, Deltek, or SMPS material publishes a
 *              seconds/minutes/hours SLA for enquiry handling, human review, dispatch,
 *              reactivation, or entity matching, and the one architecture-specific source on
 *              follow-up timing explicitly rejects a fixed calendar. Those values are this
 *              fictional firm's own risk tolerance, not an industry finding, and each says so
 *              in the policy it implements.
 *
 * A THIRD CATEGORY, AND IT MUST NOT BE READ AS THE FIRST. Some claims below rest on research
 * that is real but that this repository cannot retain, so it is absent from the register and
 * from `docs/evidence/grounding-captures.json`. After the grounding gate learned to decode
 * numeric character references and to parse PDFs properly, exactly one obstruction is left,
 * and it is a network refusal rather than a defect here:
 *
 *   - The five Basic Services phase names, the term `Instruments of Service`, the
 *     professional-conduct rule against misleading a prospective client about achievable
 *     results, and the position definitions that put proposal preparation with a project
 *     manager rather than approval, all come from the trade institute's own pages. Every one
 *     of them answers HTTP 403 to automated retrieval, so none can be captured.
 *
 * The vocabulary this profile is built on is therefore its least evidenced part, which is an
 * uncomfortable place for the gap to sit — `pipelineStages`, the phase language in
 * `serviceLines`, and the deliverable term all depend on it. The contractual boundaries in
 * `explicitlyNot` and the standard of care behind `formwork-confidence-floor` ARE captured,
 * from the standard owner–architect agreement itself.
 *
 * ONE FIGURE IS WEAKER THAN THE RESEARCH BEHIND IT LOOKED. `closeRatePct` is 45. The
 * retrievable evidence establishes a median win rate of 50.0% across a large A/E study; the
 * architecture-specific 45% the Stage A research reported was flagged unverified in that
 * research and could not be confirmed here. So 45 is a CHOICE seated below a verified median,
 * on the reasoning that a 28-person practice competing on qualifications against larger firms
 * should not be modelled as winning at the median of a population those firms dominate.
 *
 * The figures are deliberately reconcilable rather than precise:
 *   18 commissions x $230,000            = $4.14M project revenue     (82% of mix)
 *   9 on-call agreements x $8,400 x 12   = $0.91M recurring revenue   (18% of mix)
 *   132 enquiries x 30% qualified x 45% won = 17.8 commissions        (funnel closes)
 *   $5.04M / 28 people                   = $180k per head             (published band)
 *
 * The $230,000 average is a blend across the project lines, not any one of them: roughly two
 * feasibility studies, ten commercial commissions, and six civic ones a year.
 * `validateProfileConsistency` enforces the rest, so a careless edit to one figure fails a
 * test rather than quietly producing contradictory KPIs across the six systems.
 *
 * SCOPE OF THE FICTION: Wrenfield designs and administers. It does not construct, does not
 * warrant the Owner's construction cost, and does not control means, methods, or site safety.
 * That is not colour — under design-bid-build it is the boundary the standard of care is
 * measured against, and it is stated in `explicitlyNot`.
 */

const RAW = {
  id: 'formwork',
  name: 'Wrenfield Architecture + Engineering',
  tagline: 'Design-led architecture and in-house structural engineering for civic, institutional, and commercial owners.',

  provenance: 'FIXTURE',
  fictionalDisclosure:
    'Wrenfield Architecture + Engineering is a fictional practice created for this portfolio. Its owners, commissions, staff, figures, and incidents are invented. Nothing here describes a real practice, a real project, or a real result.',

  company: {
    headcount: 28,
    approximateAnnualRevenue: 5_040_000,
    foundedYear: 2007,
    operatingModel:
      'A principal-led seller-doer practice. Twenty-eight staff cover architecture and in-house structural engineering; mechanical, electrical, civil, and landscape are engaged as sub-consultants per commission. Two principals win almost all work personally, so pursuit capacity — not demand — is the binding constraint, and it competes directly with the design review time those same two people owe live projects.',
    explicitlyNot: [
      'Does not construct the work. Wrenfield is not the contractor and not a construction manager at risk.',
      'Does not warrant or represent that bids or negotiated prices will not vary from the Owner’s budget for the cost of the work, or from any estimate the practice prepared or agreed to.',
      'Does not have control over or responsibility for construction means, methods, techniques, sequences, or procedures, or for site safety precautions and programmes.',
      'Does not seal, or take responsible control of, technical submissions prepared outside the practice. Reviewing a completed set produced by others is not responsible control.',
      'Does not provide legal advice on the Owner’s contracts, entitlements, or disputes.',
      'Does not promise a permit, entitlement, or approval outcome, and never states that a result can be achieved by means the standard of care would not permit.',
    ],
  },

  serviceLines: [
    {
      id: 'feasibility-study',
      name: 'Feasibility and pre-design study',
      description:
        'Paid programming, site and code review, and order-of-magnitude cost banding, delivered before an owner commits to a capital project. Frequently the entry point that becomes a full commission. Value shown is total fee.',
      deliveryModel: 'PROJECT',
      typicalValue: 42_000,
      typicalDurationWeeks: 10,
    },
    {
      id: 'commercial-basic-services',
      name: 'Commercial Basic Services',
      description:
        'The five phases of Basic Services — schematic design, design development, construction documents, procurement, and construction administration — for private commercial and developer owners on negotiated appointments. Value shown is total fee.',
      deliveryModel: 'PROJECT',
      typicalValue: 195_000,
      typicalDurationWeeks: 64,
    },
    {
      id: 'civic-basic-services',
      name: 'Civic and institutional Basic Services',
      description:
        'The same five phases for public agencies and non-profit institutions, won on qualifications and delivered against a public procurement schedule with committee-level owner review. Value shown is total fee.',
      deliveryModel: 'PROJECT',
      typicalValue: 340_000,
      typicalDurationWeeks: 96,
    },
    {
      id: 'on-call-agreement',
      name: 'On-call and indefinite-delivery agreements',
      description:
        'A term appointment to an agency or institution against which task orders are issued as small works arise. Carries no guaranteed volume. Value shown is the average monthly billing across an active agreement.',
      deliveryModel: 'RECURRING',
      typicalValue: 8_400,
    },
  ],

  revenueMix: { projectPct: 82, recurringPct: 18 },

  derivedEconomics: {
    newProjectEngagementsPerYear: 18,
    averageProjectValue: 230_000,
    activeRetainerClients: 9,
    averageRetainerMonthlyFee: 8_400,
    leadsPerYear: 132,
    qualifiedRatePct: 30,
    closeRatePct: 45,
  },

  clientProfile: {
    segment:
      'Public agencies and non-profit institutions buying on qualifications — school districts, municipalities, transit and library authorities, independent schools, clinics, and cultural organisations — alongside private commercial owners and developers who negotiate an appointment directly.',
    typicalClientSize:
      'Owner organisations from a forty-person non-profit to a public agency with several thousand staff. Construction values roughly $3M–$25M per commission.',
    typicalContacts: [
      'Facilities or Capital Projects Director',
      'Owner’s Project Manager, where the owner has appointed one',
      'District business official or agency procurement officer',
      'Selection committee chair, on qualifications-based appointments',
      'Developer principal or asset manager, on negotiated private work',
    ],
    buyingTriggers: [
      'A bond measure passed or a capital appropriation was released, and the money must be committed within the fiscal year.',
      'A facility condition assessment identified a deficiency the owner is now obliged to address.',
      'Enrolment, caseload, or programme growth has outrun the existing building.',
      'A code, accessibility, or seismic deficiency was cited and a remedy has a deadline.',
      'An on-call or indefinite-delivery list is being re-advertised and the incumbent slots reopen.',
      'A previous architect’s project stalled and the owner is re-procuring the remaining phases.',
    ],
  },

  roles: [
    {
      id: 'managing-principal',
      name: 'Managing Principal (founding partner)',
      responsibilities:
        'Directs and authorises the practice’s major plans, standards, and procedures. Approves every fee proposal before it leaves, executes owner–architect agreements, decides go/no-go on pursuits, and is the final escalation point for receivables and disputes.',
      authorityCeiling: 4,
    },
    {
      id: 'technical-principal',
      name: 'Technical Principal, Architect of Record',
      responsibilities:
        'Licensed architect who signs and seals technical submissions, and only those prepared under their own responsible control. Sets the practice’s technical standards and adjudicates the standard-of-care questions inside a design. Holds no commercial authority.',
      authorityCeiling: 3,
    },
    {
      id: 'project-manager',
      name: 'Project Manager',
      responsibilities:
        'Carries full responsibility for managing all aspects of several small-to-midsize commissions at once. Prepares fee proposals and additional-services requests for the Managing Principal to approve, and owns the phase schedule and the owner relationship day to day. May not price or authorise additional services.',
      authorityCeiling: 2,
    },
    {
      id: 'practice-administrator',
      name: 'Practice Administrator',
      responsibilities:
        'Runs project accounting: timesheets, phase budgets, percentage-complete billing, work-in-progress review, and receivables ageing. Issues invoices and escalates the ageing to the Managing Principal. Does not set fees or write off time.',
      authorityCeiling: 2,
    },
    {
      id: 'job-captain',
      name: 'Job Captain',
      responsibilities:
        'Produces and coordinates the drawing set and the consultant package through each phase. Recommends, never commits: has no authority to sign, seal, price additional services, or write off time.',
      authorityCeiling: 1,
    },
    {
      id: 'pursuit-coordinator',
      name: 'Marketing and Pursuit Coordinator',
      responsibilities:
        'Assembles qualifications packages, project sheets, and interview material against a solicitation’s stated evaluation criteria, and tracks submission deadlines. Has no authority to price work or commit the practice.',
      authorityCeiling: 1,
    },
  ],

  leadSources: [
    {
      id: 'repeat-owner',
      name: 'Repeat owner and prior-client referral',
      channel: 'Direct approach',
      approxMonthlyVolume: 3,
      qualityNote:
        'Highest converting source and the only one that arrives already negotiated rather than competed. An owner who has been through construction administration once knows what the fee buys.',
      impliesContactConsent: true,
    },
    {
      id: 'public-solicitation',
      name: 'Public agency RFQ and RFP solicitations',
      channel: 'Procurement portal',
      approxMonthlyVolume: 3,
      qualityNote:
        'Structured, slow, and qualifications-based: the agency ranks firms on competence and then negotiates a fee with the highest-ranked firm only. Preparing a response is unpaid, and being ranked second earns nothing.',
      impliesContactConsent: true,
    },
    {
      id: 'consultant-network',
      name: 'Engineering and consultant network referral',
      channel: 'Email introduction',
      approxMonthlyVolume: 2,
      qualityNote:
        'Sub-consultants and owner’s representatives pass on commissions that need a lead designer. Commercially warm, but the scope description is second-hand and usually optimistic.',
      impliesContactConsent: true,
    },
    {
      id: 'website-enquiry',
      name: 'Website enquiry form',
      channel: 'Web form',
      approxMonthlyVolume: 2,
      qualityNote:
        'Widest quality spread. Carries genuine owners alongside residential enquiries outside the served segment, students, and product representatives.',
      impliesContactConsent: true,
    },
    {
      id: 'association-contact',
      name: 'Professional association and conference contact',
      channel: 'Event list',
      approxMonthlyVolume: 1,
      qualityNote:
        'Relationship-led and slow, often years ahead of a capital appropriation. Consent is given verbally at a stand or a chapter event and recorded by hand, so it is scoped to that context.',
      impliesContactConsent: false,
    },
  ],

  pipelineStages: [
    {
      id: 'enquiry',
      name: 'Enquiry or solicitation received',
      exitCriteria:
        'Owner, project type, site jurisdiction, funding source, and delivery method are known, and the submission deadline is recorded.',
    },
    {
      id: 'go-no-go',
      name: 'Go / no-go',
      exitCriteria:
        'A principal has committed unpaid pursuit hours to the submission, or the pursuit is declined and the reason recorded.',
    },
    {
      id: 'qualifications',
      name: 'Qualifications submitted',
      exitCriteria:
        'Statement of qualifications lodged before the solicitation deadline against the stated evaluation criteria, and receipt confirmed.',
    },
    {
      id: 'shortlist',
      name: 'Shortlisted and interviewed',
      exitCriteria: 'Interview held and the selection committee’s ranking published.',
    },
    {
      id: 'fee-negotiation',
      name: 'Fee negotiation',
      exitCriteria:
        'Scope of Basic Services, phase deliverables, and compensation agreed — reachable only by the highest-ranked firm on a qualifications-based appointment.',
    },
    {
      id: 'agreement',
      name: 'Agreement executed',
      exitCriteria:
        'Owner–architect agreement signed by a person of stated capacity and authority, with the effective date recorded, or a recorded loss reason.',
    },
  ],

  salesCycle: {
    typicalDaysToClose: 180,
    typicalTouches: 9,
    commonObjections: [
      'The fee is above the percentage of construction cost the owner had budgeted for design.',
      'A larger firm’s qualifications package shows more completed projects of this exact building type.',
      'Selection is qualifications-based, so the committee ranks on team experience the practice cannot change during the pursuit.',
      'The owner wants the construction cost warranted, which the agreement’s standard of care does not do.',
      'Procurement requires three responses and the solicitation was issued partly to satisfy that.',
      'The capital appropriation has not been released, so the schedule is indefinite and the pursuit may expire unpaid.',
    ],
  },

  onboardingRequirements: [
    {
      id: 'executed-agreement',
      item: 'Executed owner–architect agreement with its effective date recorded',
      why: 'Services must not begin before the effective date. Work performed ahead of it is unbilled at best and uninsured at worst.',
      sensitive: false,
    },
    {
      id: 'legal-parties',
      item: 'Both parties’ full legal names and legal status',
      why: 'The agreement requires it, and public owners frequently sign through a near-identically named authority, district, or single-purpose entity. The wrong one on the invoice stops payment.',
      sensitive: false,
    },
    {
      id: 'owner-programme',
      item: 'Owner-furnished programme, budget, and schedule',
      why: 'The practice designs to the owner’s stated programme and budget. Without them in writing, every later disagreement about scope is unresolvable.',
      sensitive: false,
    },
    {
      id: 'site-information',
      item: 'Owner-furnished survey and geotechnical report',
      why: 'The practice is entitled to rely on owner-furnished site information. Beginning documents without it means redesigning once it arrives.',
      sensitive: false,
    },
    {
      id: 'additional-services-authority',
      item: 'Named owner representative authorised to approve Additional Services in writing',
      why: 'Additional Services require the Owner’s written authorisation before they start. An unnamed approver is how out-of-scope work gets performed and then disputed.',
      sensitive: false,
    },
    {
      id: 'extranet-credentials',
      item: 'Credentials for the owner’s project extranet or document management site',
      why: 'Submittals and drawing issue run through the owner’s own platform. The credentials grant access to owner-designated confidential and business-proprietary material and must never be persisted into general workflow state.',
      sensitive: true,
    },
  ],

  sourceSystems: [
    {
      id: 'pursuit-crm',
      name: 'Pursuit and qualifications CRM',
      systemOfRecordFor: [
        'pursuit stage',
        'owner and selection-committee contacts',
        'go/no-go decision record',
        'submitted qualifications packages and deadlines',
      ],
    },
    {
      id: 'project-accounting',
      name: 'Project accounting and practice ERP',
      systemOfRecordFor: [
        'project number and phase budgets',
        'timesheet hours',
        'percentage complete',
        'invoice status',
        'work in progress',
        'receivables ageing',
      ],
    },
    {
      id: 'model-environment',
      name: 'Building model authoring environment',
      systemOfRecordFor: ['model geometry', 'drawing sheet set', 'Instruments of Service revisions'],
    },
    {
      id: 'project-extranet',
      name: 'Owner project extranet',
      systemOfRecordFor: ['submittals', 'requests for information', 'change orders', 'field observation reports'],
    },
    {
      id: 'record-store',
      name: 'Practice record store',
      systemOfRecordFor: [
        'executed agreements',
        'written Additional Services authorisations',
        'sealed record sets',
        'certificates of insurance',
      ],
    },
  ],

  invoicing: {
    terms:
      'Invoiced monthly in arrears on percentage complete by phase, against the compensation stated in the agreement — professional fee plus reimbursable expenses on negotiated work, stipulated sum where the owner requires a fixed design fee. The practice states Net 30; the agreement’s own default is payment due on presentation, and Net 30 as a majority contractual term across the trade was not established by research.',
    netDays: 30,
    cadence: 'Monthly, in arrears, with reimbursables billed in the period the backup arrives.',
    typicalInvoiceValue: 12_000,
    commonDisputeReasons: [
      'Additional Services performed without the Owner’s written authorisation, so the fee has no contractual basis to rest on.',
      'Percentage complete on a phase disputed by the owner’s project manager after the invoice was raised.',
      'Reimbursable expenses invoiced without the backup documentation the agreement requires.',
      'Sub-consultant mark-up questioned after the consultant billed the owner directly for part of the same scope.',
      'Purchase order or encumbrance number missing, so a public agency’s accounts payable never entered the invoice into its approval queue.',
      'Construction administration billed past the phase the owner believed the appointment ended at.',
    ],
  },

  referralPartners: {
    description:
      'Mechanical, electrical, and civil sub-consultants, owner’s representatives, and contractors on negotiated private work refer commissions that need a lead designer. The relationship is reciprocal and informal — the practice engages the same consultants on its own projects.',
    shareOfPipelinePct: 34,
    concentrationNote:
      'Two consultant relationships account for most of the referred pipeline, and repeat owners for most of the negotiated work. Losing either consultant would remove roughly a third of pipeline that never has to be competed, which is the most expensive kind to replace.',
  },

  renewals: {
    term:
      'Three-year on-call and indefinite-delivery agreements, re-advertised at expiry rather than renewed, with task orders issued against them and no guaranteed volume.',
    typicalRenewalRatePct: 65,
    churnDrivers: [
      'The on-call list is re-advertised and the practice is not re-ranked into the retained tier.',
      'The capital programme the agreement served is completed or defunded before the term ends.',
      'The agency contact who knew the practice’s work retires or moves, and institutional memory of it leaves with them.',
      'A task-order fee disagreement escalated to the agency’s procurement office and became a matter of record.',
      'The term expires with most capacity unused because no task orders were ever issued against it.',
    ],
  },

  operatingConstraints: [
    'Public work is awarded on qualifications, not price: the owner ranks firms on competence and negotiates a fee with the highest-ranked firm only. Nothing in a pursuit may be modelled as a competitive fee bid.',
    'Pursuit work is unpaid overhead. Every principal hour spent on qualifications, interviews, and fee negotiation is written off if the practice is not ranked first, and the principals are the same people who owe live projects their design review time.',
    'A fee dispute is a leading precursor to a professional-liability claim, because pursuing an owner for unpaid fees usually draws a negligence counterclaim. Receivables escalation must never default to litigation, and no automated collection step may threaten it.',
    'Only a licensed architect in responsible control may sign and seal a technical submission. Signing makes that person the architect of record, and reviewing a completed set prepared by others does not constitute responsible control — so no automation may assemble a submission for sealing.',
    'Services do not begin before the agreement’s effective date, and Additional Services do not begin before the Owner authorises them in writing. Principals are reluctant to reopen a signed agreement mid-project, which is exactly how scope slides unbilled.',
    'The model authoring environment and the project accounting system do not reconcile automatically. Hours, phase budgets, and drawing-set state are joined by a person, and that handoff — along with the one from pursuit CRM to project setup — is where scope creep and unbilled time accumulate.',
    'Handoffs between phases and between staff happen by email and memory. There is no single record of what was promised to the owner in a meeting, which is the practice’s most consequential operational gap.',
    'Owner-designated confidential and business-proprietary material is held under the agreement’s own terms. It must never be aggregated across owners, used in marketing, or persisted into general workflow state.',
  ],

  policies: [
    {
      id: 'formwork-ack-window',
      statement:
        'Every inbound enquiry or solicitation receives an acknowledgement within one hour during published office hours.',
      provenance: 'CLIENT_POLICY',
      verification: 'NOT_APPLICABLE',
      sourceIds: [],
      appliesTo:
        'Acknowledgement timing. CHOSEN, not found: no retrieved industry source publishes a seconds-scale acknowledgement convention for this trade. This practice competes on qualifications rather than on first response, and receives roughly eleven enquiries a month, so a person genuinely reads each one and an hour is generous rather than tight.',
    },
    {
      id: 'formwork-routing-window',
      statement:
        'A qualified enquiry reaches a named principal or project manager within half a working day, and no more than four clarifying questions are asked before a person takes over.',
      provenance: 'CLIENT_POLICY',
      verification: 'NOT_APPLICABLE',
      sourceIds: [],
      appliesTo:
        'Routing latency and the number of clarifying questions asked before handover. CHOSEN, not found. The window is long because the two people who can qualify a pursuit are in design reviews and on site; the question budget is higher than a lighter-weight business would need because a go/no-go decision requires project type, site jurisdiction, funding source, and schedule before a principal will commit unpaid pursuit hours.',
    },
    {
      id: 'formwork-confidence-floor',
      statement:
        'An automated interpretation of an enquiry may act on its own conclusion only at confidence 0.90 or above; below that a person decides.',
      provenance: 'CLIENT_POLICY',
      verification: 'NOT_APPLICABLE',
      sourceIds: [],
      appliesTo:
        'Bounded AI judgement. The NUMBER is chosen; the reason it sits this high is grounded. The owner–architect agreement measures performance against the professional skill and care ordinarily provided by architects practising in the same or similar locality — a comparative standard, not a score — and professional conduct rules separately forbid misleading a prospective client about the results achievable through the practice’s services. The first of those is captured; the second is the trade institute page that cannot be retrieved. Neither standard is satisfied by a machine being usually right, so the floor sits well above where a lower-stakes business would set it.',
    },
    {
      id: 'formwork-reply-wait-window',
      statement: 'An awaited owner reply is escalated to a person after five calendar days.',
      provenance: 'CLIENT_POLICY',
      verification: 'NOT_APPLICABLE',
      sourceIds: [],
      appliesTo:
        'Wait-and-resume behaviour on an outstanding owner response. CHOSEN, and the source consulted argues against ever fixing it: architecture-specific writing on pursuit follow-up holds that timing should match the client’s actual review behaviour rather than an arbitrary schedule, and that there is no universal number. Five days is this practice’s default for owners whose decisions route through committees and boards, not a convention.',
    },
    {
      id: 'formwork-booking-offer-window',
      statement: 'An unaccepted interview or site-walk offer is escalated after seven days.',
      provenance: 'CLIENT_POLICY',
      verification: 'NOT_APPLICABLE',
      sourceIds: [],
      appliesTo:
        'Scheduling offers that go unanswered. CHOSEN. Deliberately longer than the reply window: an owner arranging a shortlist interview or a site walk is coordinating several internal parties and often a selection committee, which takes longer than answering a question.',
    },
    {
      id: 'formwork-review-timeout-window',
      statement: 'Work parked for human review is surfaced as overdue after three days.',
      provenance: 'CLIENT_POLICY',
      verification: 'NOT_APPLICABLE',
      sourceIds: [],
      appliesTo:
        'Attention timeouts on any state awaiting a person. CHOSEN, calibrated against the nearest published rhythm rather than derived from it: practice-management guidance holds that monthly work-in-progress review is too infrequent for an active project portfolio, and the cadence such guidance recommends instead is weekly. Three days is deliberately tighter than that weekly rhythm, because a review queue is not a reporting cycle.',
    },
    {
      id: 'formwork-dispatch-timeout-window',
      statement: 'A prepared but undespatched action is surfaced as overdue after twenty-four hours.',
      provenance: 'CLIENT_POLICY',
      verification: 'NOT_APPLICABLE',
      sourceIds: [],
      appliesTo:
        'Ready-but-unsent outbound actions. CHOSEN. Shorter than the review window because the judgement has already been made by this point and only the mechanical act of despatch remains — and on a public solicitation the deadline does not move to accommodate it.',
    },
    {
      id: 'formwork-outreach-cadence',
      statement:
        'A dormant pursuit receives at most three reactivation attempts across a hundred-and-twenty-day window before it is left alone.',
      provenance: 'CLIENT_POLICY',
      verification: 'NOT_APPLICABLE',
      sourceIds: [],
      appliesTo:
        'Reactivation attempt limits and sequence duration. CHOSEN, and the window is the value most specific to this trade: a capital project that goes quiet is usually waiting on a fiscal-year appropriation or a bond timetable, so the practice spreads a small number of attempts across months rather than weeks. Follow-up writing in this field states plainly that there is no universal number of attempts.',
    },
    {
      id: 'formwork-entity-resolution',
      statement:
        'Two records are treated as the same owner only at 0.97 confidence or above; below that a person confirms, with every candidate attached.',
      provenance: 'CLIENT_POLICY',
      verification: 'NOT_APPLICABLE',
      sourceIds: [],
      appliesTo:
        'Identity resolution. The NUMBER is chosen. The reason it is near-certain rests on the standard owner–architect agreement, which requires each party’s full legal name and legal status; public owners routinely contract through near-identically named authorities, districts, and single-purpose entities. A confident near-match here does not merely misfile a record — it puts the wrong legal party on an agreement or an invoice.',
    },
    {
      id: 'formwork-collection-cadence',
      statement:
        'An invoice forty-five days past due is escalated to the Managing Principal for a direct call to the owner; beyond ninety days it becomes principal-to-principal correspondence.',
      provenance: 'CLIENT_POLICY',
      verification: 'NOT_APPLICABLE',
      sourceIds: [],
      appliesTo:
        'Receivables escalation timing. CALIBRATED against a published ladder for this trade, which places a phone call from the principal or project manager at forty-five days past due and principal-level correspondence beyond ninety. Note what this number is NOT: the practice’s days-sales-outstanding, which industry surveys put around seventy-two days for the median firm. Conflating a collection period with an escalation trigger would make the ladder look ineffective when it is simply measuring something else.',
    },
    {
      id: 'formwork-proposal-authority',
      statement:
        'A fee proposal may be prepared by a project manager but leaves the practice only when the Managing Principal has approved it.',
      provenance: 'CLIENT_POLICY',
      verification: 'NOT_APPLICABLE',
      sourceIds: [],
      appliesTo:
        'The authority required for outbound commercial documents, set at the top of the ladder. CALIBRATED: published guidance on architectural fee proposals treats final approval by the firm’s principal, after internal review, as the normal last step before delivery, and that source is captured. The corroborating half is not — the trade institute’s position definitions, which have a project manager PREPARING proposals rather than approving them, sit behind the HTTP 403 named in this file’s docstring. The consequence of the number is deliberate and uncomfortable: because only one role holds authority 4, there is exactly one desk a fee proposal can clear, and it belongs to a person who is also selling and designing.',
    },
    {
      id: 'formwork-proposal-approval-window',
      statement: 'A fee proposal awaiting the Managing Principal’s approval is surfaced as overdue after forty-eight hours.',
      provenance: 'CLIENT_POLICY',
      verification: 'NOT_APPLICABLE',
      sourceIds: [],
      appliesTo:
        'Proposal approval attention timeouts. CHOSEN: no retrieved source states an approval window in hours. Two days, because a fee proposal is usually running against a fixed solicitation deadline and the only person who can release it is the practice’s busiest.',
    },
    {
      id: 'formwork-analysis-freshness',
      statement: 'Principal reporting may not draw on operational data older than one week.',
      provenance: 'CLIENT_POLICY',
      verification: 'NOT_APPLICABLE',
      sourceIds: [],
      appliesTo:
        'Input staleness tolerance for periodic analysis. CHOSEN, aligned to the closest published cadence: practice-management guidance for this trade recommends weekly work-in-progress review over monthly, so a week is the age at which its own recommended rhythm would already have replaced the figure.',
    },
    {
      id: 'formwork-exception-materiality',
      statement:
        'A variance above ten percent against plan is treated as an exception requiring immediate principal attention rather than normal variation.',
      provenance: 'CLIENT_POLICY',
      verification: 'NOT_APPLICABLE',
      sourceIds: [],
      appliesTo:
        'Exception-candidate materiality thresholds. CALIBRATED against a published variance ladder for practices in this trade, which treats variance under five percent as routine, five to ten percent as requiring documentation, and above ten percent as requiring immediate management review. The practice adopts the top rung of that ladder as its exception trigger.',
    },
    {
      id: 'formwork-malformed-intake',
      statement:
        'A malformed intake payload is retried twice and then handed to a person with the raw payload attached, never discarded.',
      provenance: 'CLIENT_POLICY',
      verification: 'NOT_APPLICABLE',
      sourceIds: [],
      appliesTo:
        'Retry budget on unparseable inbound payloads. CHOSEN. Kept low because inbound volume is low and every enquiry is read by a person anyway: at eleven a month, asking a human early costs almost nothing, and a solicitation lost to a parsing failure costs an entire unpaid pursuit cycle.',
    },
  ],

  operatingParameters: [
    { key: 'acknowledgementTargetSeconds', label: 'Acknowledgement target, published hours', value: 3600, unit: 'seconds', policyId: 'formwork-ack-window' },
    { key: 'routingTargetMinutes', label: 'Routing target to a named principal or project manager', value: 240, unit: 'minutes', policyId: 'formwork-routing-window' },
    { key: 'maxInformationQuestions', label: 'Maximum clarifying questions before human review', value: 4, unit: 'questions', policyId: 'formwork-routing-window' },
    { key: 'confidenceFloor', label: 'Minimum confidence to act on an interpretation', value: 0.9, unit: 'probability', policyId: 'formwork-confidence-floor' },
    { key: 'replyWaitWindowHours', label: 'Owner reply wait window before escalation', value: 120, unit: 'hours', policyId: 'formwork-reply-wait-window' },
    { key: 'bookingOfferWindowHours', label: 'Interview and site-walk offer wait window', value: 168, unit: 'hours', policyId: 'formwork-booking-offer-window' },
    { key: 'humanReviewTimeoutHours', label: 'Human review attention timeout', value: 72, unit: 'hours', policyId: 'formwork-review-timeout-window' },
    { key: 'dispatchTimeoutHours', label: 'Ready-but-undespatched attention timeout', value: 24, unit: 'hours', policyId: 'formwork-dispatch-timeout-window' },
    { key: 'dormantMaxAttempts', label: 'Maximum reactivation attempts on a dormant pursuit', value: 3, unit: 'attempts', policyId: 'formwork-outreach-cadence' },
    { key: 'dormantWindowDays', label: 'Reactivation sequence window', value: 120, unit: 'days', policyId: 'formwork-outreach-cadence' },
    { key: 'entityMatchThreshold', label: 'Minimum confidence to accept an owner-identity match', value: 0.97, unit: 'probability', policyId: 'formwork-entity-resolution' },
    { key: 'collectionEscalationDays', label: 'Escalation to the Managing Principal past due', value: 45, unit: 'days past due', policyId: 'formwork-collection-cadence' },
    { key: 'proposalAuthorityCeiling', label: 'Authority required to release an outbound fee proposal', value: 4, unit: 'authority level', policyId: 'formwork-proposal-authority' },
    { key: 'proposalApprovalTimeoutHours', label: 'Fee proposal approval attention timeout', value: 48, unit: 'hours', policyId: 'formwork-proposal-approval-window' },
    { key: 'inputStalenessToleranceHours', label: 'Analysis input staleness tolerance', value: 168, unit: 'hours', policyId: 'formwork-analysis-freshness' },
    { key: 'exceptionVarianceThresholdPct', label: 'Exception-candidate variance threshold', value: 10, unit: 'percent', policyId: 'formwork-exception-materiality' },
    { key: 'malformedRetryBudget', label: 'Attempts on a malformed intake payload before a person is asked', value: 2, unit: 'attempts', policyId: 'formwork-malformed-intake' },
  ],

  /**
   * Whose desk a fee proposal lands on.
   *
   * Declared rather than inferred, because inferring it here would get it wrong: the Project
   * Manager and the Practice Administrator both cap at authority 2, and neither approves a fee
   * proposal. The practice's own role descriptions already say who does.
   *
   * NO ESCALATION IS DECLARED, and that absence is the honest answer rather than an omission.
   * The Managing Principal sits at the top of this practice's authority ladder, so a proposal
   * stalled on that desk has nowhere upward to go. `validateProfileConsistency` requires an
   * escalation target to hold STRICTLY higher authority, which correctly makes this
   * unexpressible — and the operational consequence is real: the single most likely place for
   * a pursuit to die quietly is waiting on the one person who can release it.
   */
  accountabilities: [
    {
      action: 'PROPOSAL_APPROVAL',
      roleId: 'managing-principal',
      policyId: 'formwork-proposal-authority',
    },
  ],
} satisfies Parameters<typeof BusinessProfileSchema.parse>[0];

export const FORMWORK: BusinessProfile = BusinessProfileSchema.parse(RAW);
