import type { BusinessProfile } from '@/lib/model/profile';
import { FORMWORK } from './formwork/profile';
import { KESTREL } from './kestrel/profile';
import { LEDGERLINE } from './ledgerline/profile';
import { MERIDIAN } from './meridian/profile';
import { STRATUM } from './stratum/profile';

/**
 * THE PROFILE REGISTER.
 *
 * Introduced when a second profile existed. Before it, `tests/profile-seam-swap.test.ts`
 * named Kestrel and Meridian in a literal array, which is correct for two profiles and wrong
 * the moment a third is authored: a profile nobody remembered to add to that array would be
 * held to no standard at all, and would fail silently by never being checked.
 *
 * This is a small correction, not a framework. It does not select an active profile, and it
 * does not make the portfolio multi-tenant. `RUNNABLE_SYSTEMS` still wires Kestrel explicitly,
 * because which business the rendered simulator depicts is a canon decision and not a lookup.
 *
 * WHAT THE `role` FIELD IS FOR.
 *
 * `COMMERCIAL_THESIS.md` §6 requires that any profile a visitor is shown be grounded in how
 * that industry actually operates — a practitioner should recognise their own operation, and a
 * model's guess about an industry will not clear that bar. That requirement was prose, and
 * prose is not checkable. Splitting the register by role makes it enforceable:
 *
 *   STRUCTURAL_FIXTURE — exists to falsify the seam. Never rendered, never grounded, and
 *     required to carry no grounding sources, so it cannot be quietly promoted into a
 *     demonstration by someone adding citations to it later.
 *   DEMONSTRATION — may be shown to a visitor, and must cite what grounds it.
 *
 * `tests/profile-register.test.ts` enforces both directions. A profile authored without
 * grounding cannot be registered as a demonstration, whoever or whatever authored it.
 */
export type ProfileRole = 'STRUCTURAL_FIXTURE' | 'DEMONSTRATION';

export interface GroundingSource {
  /** Where the claim came from. Must be retrievable by a reader, not a private note. */
  readonly url: string;
  /**
   * What we take this source to establish about the vertical. THIS IS INTERPRETATION, and it is
   * the one part of a grounding source that nothing can mechanically check. A capture can show
   * that a page said something at a moment in time; it cannot show that our reading of it is
   * right. Keep the two separable so a reader can disagree with the reading without having to
   * doubt the retrieval.
   */
  readonly establishes: string;
  /**
   * A VERBATIM excerpt from the source, chosen to be the material the claim above rests on.
   *
   * This is the half that IS checkable. `scripts/capture-grounding.ts` fetches the URL and
   * refuses to write a capture unless this exact string appears in the retrieved text, so a
   * fabricated citation dies at capture time rather than living in the register looking
   * plausible. Keep it long enough to be distinctive and short enough to be a quotation.
   */
  readonly quote: string;
}

/**
 * THE RECORD THAT A TRADING NAME WAS CHECKED AGAINST REAL FIRMS.
 *
 * `formwork` was authored as "Formwork Architecture + Engineering" and was one merge away from
 * being shown to visitors under the trading name of real practices in four countries. The
 * author was not careless — `docs/PROFILE_AUTHORING_PACKET.md` §11 asserted the assigned names
 * were "deliberately not real firms", which was false for two of the three.
 *
 * WHAT THIS CAN AND CANNOT DO. It cannot establish that a name is unused: no offline test
 * reaches a company register, and a web search is not a trademark search. It records what was
 * looked for, when, and what came back — and `tests/profile-register.test.ts` enforces the one
 * property that actually broke, which is that **the name checked must be the name shipped.**
 * Renaming a firm after clearing it, or clearing one variant and shipping another, fails there.
 */
export interface NameCheck {
  /**
   * The trading name searched. Pinned to `profile.name` by test, because the failure mode is
   * not forgetting to search — it is searching one string and shipping a different one.
   */
  readonly searchedFor: string;
  /** ISO date of the search. A check has a shelf life; a reader should see how old it is. */
  readonly checkedOn: string;
  /** What came back, including near-misses. A bare "nothing found" hides the interesting part. */
  readonly finding: string;
}

export interface RegisteredProfile {
  readonly profile: BusinessProfile;
  readonly role: ProfileRole;
  /** Why this profile exists at all. */
  readonly note: string;
  /** Required for DEMONSTRATION, forbidden for STRUCTURAL_FIXTURE. */
  readonly groundingSources: readonly GroundingSource[];
  /**
   * Required for DEMONSTRATION. Optional here rather than mandatory because a structural
   * fixture is never rendered and so cannot wear a real firm's name in front of anyone; the
   * role rule lives in the test, alongside the grounding rule it mirrors.
   */
  readonly nameCheck?: NameCheck;
}

/** The minimum a DEMONSTRATION profile must cite. Low, and a floor rather than a target. */
export const MINIMUM_GROUNDING_SOURCES = 3;

/**
 * How much a name check has to actually say. A floor, like the one above.
 *
 * It exists because a mutation proved the first version of this rule worthless: the test asked
 * only that a finding be non-empty, and "Nothing was found at all." passed it. That is a shrug
 * wearing the costume of a check, and it is exactly what a hurried author would write. A real
 * search reports what it looked at and what came near — `tests/profile-register.test.ts` also
 * requires the findings to differ from one another, because the realistic way this degrades is
 * one generic negative pasted across every profile.
 */
export const MINIMUM_NAME_CHECK_FINDING_CHARS = 120;

/**
 * DEMONSTRATION PROFILES THAT DO NOT MEET THE GROUNDING FLOOR.
 *
 * **Empty, and it was not empty when it was written.** Kestrel was on it — the profile every
 * rendered surface depicts, authored from the retained brief in `docs/source/` rather than from
 * research, and predating the requirement it failed. It has since been grounded against three
 * published 2026 benchmarks and removed.
 *
 * Grounded means its figures are SYNTHETIC ASSUMPTIONS CALIBRATED against retrievable evidence.
 * It never means a source verified a figure about Kestrel — no source can, because Kestrel does
 * not exist. Each grounding note therefore separates the industry fact from our calibration, and
 * says which is which.
 *
 * Two figures sat comfortably inside their published ranges from the start. The third did not:
 * the vCISO retainer sat at the very floor of its band while the profile claimed a mid-market
 * segment, spread across an implausible number of concurrent relationships for the headcount.
 * That was published as a divergence for a day and then fixed on 2026-08-28, once it was clear
 * the blast radius was one equation rather than every scenario. Publishing a gap is not a
 * substitute for closing one that is cheap to close.
 *
 * `tests/profile-register.test.ts` pins this list. It may shrink; it has. Growing it means an
 * ungrounded business was shown to a visitor, which is a deliberate act that should require
 * editing a test that says out loud what it is.
 */
export const UNGROUNDED_DEMONSTRATIONS: readonly string[] = [];

export const REGISTERED_PROFILES: readonly RegisteredProfile[] = [
  {
    profile: KESTREL,
    role: 'DEMONSTRATION',
    note:
      'The reference business. Every rendered surface depicts this firm, and the six systems were built against its lifecycle. ' +
      'Originally derived from the retained brief in docs/source/ rather than from research, and calibrated afterwards ' +
      'against published 2026 benchmarks whose source material is retained in docs/evidence/grounding-captures.json. ' +
      'Every figure below is a synthetic assumption; the sources describe the industry and verify nothing about this ' +
      'firm. Retainer economics were recalibrated on 2026-08-28 from 33 clients at $3,200/month to 20 at $5,000. ' +
      'GROUNDING EXTENDED 2026-08-28: the three original sources all priced the trade and none of them touched the '  +
      'two weakest parts of this profile — the explicitlyNot boundaries and the vocabulary. Both are now cited. The '  +
      'boundaries turn out to be real professional rules rather than modesty: a SOC 2 report may be issued only by a '  +
      'licensed CPA firm, the opinion is signed by a CPA partner, and services central to a control environment '  +
      'threaten independence when the same entity audits it. The vocabulary is cited from the standards body itself, '  +
      'which was retrievable here where the architecture profile’s equivalent was not.',
    nameCheck: {
      searchedFor: 'Kestrel Compliance Group',
      checkedOn: '2026-08-28',
      finding:
        'No company trades under this name. The nearest neighbour is Kestrel Labs, a Denver building-code compliance platform inside BIM — a different name in a different trade, recorded here because a reader should see the near-miss rather than a bare negative. This is the firm on every rendered surface and its name had never been checked until now. A web search, NOT a company-register or trademark search. `[unverified — verify by: a formal register and trademark search]`',
    },
    groundingSources: [
      {
        url: 'https://www.rocketlane.com/blogs/professional-services-maturity-index-2026',
        quote: 'Revenue per employee climbed 6% to $168k',
        establishes:
          'INDUSTRY FACT: the 2026 SPI Professional Services Maturity Benchmark reports $168k revenue per employee across surveyed professional-services organisations. OUR CALIBRATION: Kestrel’s synthetic $228.6k per head sits above that all-staff figure, which we take to be a defensible assumption for a 14-person firm carrying little non-billable overhead. The source says nothing about Kestrel, which does not exist.',
      },
      {
        url: 'https://www.brightdefense.com/resources/soc-2-certification-cost/',
        quote:
          'A readiness assessment helps organizations pinpoint weaknesses, usually costing $5,000 to $20,000. Policy development and documentation may add another $5,000 to $15,000 if outsourced.',
        establishes:
          'INDUSTRY FACT: a SOC 2 readiness assessment runs $5k–$20k and policy development adds $5k–$15k when outsourced. OUR CALIBRATION: Kestrel’s synthetic $32k average engagement is assumed to bundle readiness, policy authoring and remediation, which the quoted components plus remediation would plausibly total. The source prices components, not Kestrel’s engagement.',
      },
      {
        url: 'https://sidechannel.com/blog/the-ultimate-guide-to-vciso-pricing-everything-you-need-to-know/',
        quote: 'For most mid-market companies, vCISO pricing runs $3,000 to $12,000 per month.',
        establishes:
          'INDUSTRY FACT: mid-market vCISO retainers run $3,000–$12,000 per month. OUR CALIBRATION: Kestrel’s synthetic average retainer of $5,000/month across 20 clients is an assumption chosen to sit inside that band rather than at its floor. It was $3,200 across 33 clients until 2026-08-28, which put the rate at the band’s edge and the relationship count implausibly high for 14 staff. The source describes an industry; it verifies nothing about this firm, which does not exist.',
      },
      {
        url: 'https://legalclarity.org/who-performs-a-soc-2-audit-cpa-requirements-explained/',
        quote:
          'SOC 2 reports can only be issued by licensed CPA firms.',
        establishes:
          'INDUSTRY FACT: a SOC 2 report may be issued only by a licensed CPA firm, so a readiness consultancy structurally cannot produce the artefact its clients are buying. OUR CALIBRATION: this is the source of the first entry in Kestrel’s explicitlyNot — not a certification body, issues no certificates or attestations — and it is why no service line in this profile terminates in a report. It is a constraint on what the fictional firm may be modelled as selling, not a figure about it.',
      },
      {
        url: 'https://legalclarity.org/who-performs-a-soc-2-audit-cpa-requirements-explained/',
        quote:
          'A licensed CPA partner reviews everything, applies professional judgment about whether the evidence supports the conclusions, and signs the final document in the firm’s name.',
        establishes:
          'INDUSTRY FACT: the professional judgment about whether evidence supports the conclusions, and the signature on the report, belong to a licensed CPA partner at the audit firm. OUR CALIBRATION: Kestrel’s explicitlyNot states it does not perform the audit or issue the opinion, and works alongside an audit firm the client engages separately. This quote is why that boundary is a rule rather than a modesty. A second passage from the same page, citable only because captures are keyed by quote as well as URL.',
      },
      {
        url: 'https://sensiba.com/resources/insights/aicpa-emphasizes-auditor-independence-in-the-soc-2-industry/',
        quote:
          'All of those services are central to the control environment, and thus represent a threat to independence if such services are delivered by the same entity responsible for auditing the client’s environment.',
        establishes:
          'INDUSTRY FACT: services central to a client’s control environment threaten auditor independence when delivered by the entity that also audits that environment — the AICPA’s 2022 SOC 2 Guide revision put the emphasis there specifically. OUR CALIBRATION: this grounds the third explicitlyNot entry, that Kestrel is never in a position to promise an audit outcome or timeline, and it is the reason a firm doing readiness work is modelled as permanently outside the attestation. LIMIT: this is a CPA firm’s commentary on the guidance, not the guidance itself; the AICPA Guide is a paid publication and is not retrievable here.',
      },
      {
        url: 'https://www.aicpa-cima.com/resources/landing/system-and-organization-controls-soc-suite-of-services',
        quote:
          'SOC 2® Reporting on an Examination of Controls at a Service Organization Relevant to Security, Availability, Processing Integrity, Confidentiality, or Privacy',
        establishes:
          'INDUSTRY FACT: the standards body’s own publication title names the subject matter of a SOC 2 examination and, with it, the five trust services categories — security, availability, processing integrity, confidentiality, privacy. OUR CALIBRATION: this is the vocabulary Kestrel’s service lines and scenario language are built from, taken from the institute that defines it rather than from a vendor restatement. Worth recording that this was retrievable at all: the equivalent trade-institute grounding for the architecture profile could not be captured, because every aia.org page refuses automated retrieval.',
      },
    ],
  },
  {
    profile: STRATUM,
    role: 'DEMONSTRATION',
    note:
      'A fictional 18-person CRM / RevOps implementation consultancy — the transformation-selling ' +
      'archetype, whose own delivery lifecycle is proposal-heavy and whose worst break is a signed ' +
      'deal that never becomes a project. It is in the register to test whether the six systems ' +
      'hold up against a business that sells the same category of work they automate. Every figure ' +
      'is a synthetic assumption calibrated against the sources below; those sources describe an ' +
      'industry and verify nothing about this firm, which does not exist. Of its seventeen ' +
      'thresholds, four trace to a cited page and thirteen are choices, which the policy prose says. NAMING: the author ' +
      'stated plainly that "Stratum Revenue Systems" was invented and never checked. It was checked at registration and ' +
      'no firm of that name was found, which is why this profile keeps both its slug and its trading name. That was a ' +
      'web search, NOT a company-register or trademark search — `[unverified — verify by: a formal register and ' +
      'trademark search]` still stands for the stronger claim.',
    nameCheck: {
      searchedFor: 'Stratum Revenue Systems',
      checkedOn: '2026-08-28',
      finding:
        'No company trades under this name. The author stated plainly that the name was invented and never checked; the check was run at registration and cleared it. A web search, NOT a company-register or trademark search. `[unverified — verify by: a formal register and trademark search]`',
    },
    groundingSources: [
      {
        url: 'https://www.hubspot.com/partners/faqs',
        quote:
          'The HubSpot Solutions Partner Program is designed for customer-centric agencies and resellers that want to learn, grow their business, and use the best technology.',
        establishes:
          'INDUSTRY FACT: firms in this trade hold a formal vendor partner status — "Solutions Partner" is a programme name, not a self-description — and the programme is aimed at agencies and resellers rather than at software buyers. OUR CALIBRATION: Stratum is modelled as a certified partner practice whose pipeline depends on directory listing and vendor-introduced work, and whose partner tier is treated as a tracked business exception. The source describes a vendor programme; it says nothing about this firm.',
      },
      {
        url: 'https://www.deltek.com/resources/articles/professional-services-benchmarks/',
        quote:
          'There is an encouraging counter-trend, however: revenue per billable consultant rose to $210K in 2025, up 6% from $199K in 2024, while revenue per employee climbed to $168K, also up 6%.',
        establishes:
          'INDUSTRY FACT: the 2026 SPI professional-services benchmark reports $168K revenue per employee and $210K per billable consultant across surveyed firms, figures weighted by large organisations. OUR CALIBRATION: Stratum’s synthetic $155.6k per head ($2.8M across 18 people) is set deliberately below that industry-wide print, because the same research family reports smaller firms earning less per head than the weighted average. The narrower 10–30-employee figure the Stage A brief cites sits in a PDF this repository’s capture script cannot read, so it is not offered as grounding here.',
      },
      {
        url: 'https://www.mergeyourdata.com/b2b-library/revops-agency-pricing',
        quote:
          'RevOps agency pricing ranges from $3,000 to $27,000 per month for retainer engagements and $10,000 to $150,000+ for project-based work.',
        establishes:
          'INDUSTRY FACT: RevOps consultancies price retainers between $3,000 and $27,000 per month and projects between $10,000 and $150,000+. OUR CALIBRATION: Stratum’s synthetic $7,000 average retainer sits in the lower-middle of that band, consistent with a firm selling to 50–500-employee clients rather than enterprises, and its $45,000 average project value sits inside the project band across a service menu spanning a $9,000 diagnostic and an $85,000 transformation. The source prices an industry, not this firm.',
      },
      {
        url: 'https://www.zenpilot.com/blog/clickup-hubspot-integration/',
        quote:
          'The way to think about it: pre-sales and marketing live in HubSpot. Post-sales servicing and tracking live in ClickUp.',
        establishes:
          'INDUSTRY FACT: firms in this trade split their own operations across two systems of record — the CRM is authoritative before the deal closes, the delivery workspace after it — and the same source names the resulting handoff, a closed deal arriving as a chat message, as the break that costs them onboarding. OUR CALIBRATION: Stratum’s sourceSystems encode exactly that split, with the CRM authoritative for deal stage and the delivery workspace authoritative for phase state and time. Which specific products a firm uses is not what this establishes; the division of authority is.',
      },
      {
        url: 'https://www.growthoperationsfirm.com/blog/who-owns-what-hubspot-crm-implementation-client-vs-partner-raci',
        quote: 'Unclear ownership, not the software, is what stalls timelines and budgets.',
        establishes:
          'INDUSTRY FACT: practitioners locate the dominant delivery failure in ownership ambiguity rather than in the technology, and the same source names the specific case — nobody having decided which of two conflicting records wins. OUR CALIBRATION: this is why Stratum declares a RACI and a named per-gate approver as onboarding requirements, refuses record survivorship as a client decision in explicitlyNot, and sets an entity-match threshold near absolute so a merge escalates rather than resolves. The source describes a pattern; the thresholds Stratum sets against it are chosen.',
      },
      {
        url: 'https://raiontech.io/blog/professional-services-enquiry-conversion-gap',
        quote: 'The average time from enquiry to first useful reply was 41 hours.',
        establishes:
          'INDUSTRY FACT: in an adjacent professional-services firm with the same shared-inbox intake shape, the measured lag from enquiry to a genuinely useful answer was 41 hours, and buyers left for whoever answered first. ADJACENCY: this is tax and accounting practice, not CRM implementation, and is offered as the intake pattern rather than as a figure for this trade. OUR CALIBRATION: Stratum’s 5-minute acknowledgement and 60-minute routing targets are chosen against that failure, not found in any published SLA for CRM partners — the research established plainly that no such SLA exists.',
      },
      {
        url: 'https://integrateiq.com/services/hubspot-onboarding/',
        quote:
          'Integration scope is defined in writing before the build begins and any changes require a formal change order.',
        establishes:
          'INDUSTRY FACT: scope in this trade is fixed in a written technical blueprint before build, and departures from it are handled as formal change orders approved by both parties rather than absorbed. OUR CALIBRATION: Stratum’s pipeline stages, its change-order policy, its commercial-authority ceiling, and the first entry in its list of invoice disputes all follow from that practice. The source describes one firm’s stated method; Stratum’s specific approval window and authority level are chosen.',
      },
    ],
  },
  {
    profile: LEDGERLINE,
    role: 'DEMONSTRATION',
    note:
      'A 22-person US accounting, bookkeeping and client advisory services firm — the vertical where recurring deadlines, ' +
      'expensive credentialed labour, and heavy inbound client-request routing meet a regulator that has already written ' +
      'the rules on what may not be automated. Registered because it stresses the model differently from the reference ' +
      'business: its binding clock is the month rather than the hour, and its binding gate is a signature rather than a ' +
      'timeout. Every figure is a synthetic assumption calibrated against the sources below, which describe an industry ' +
      'and verify nothing about this firm, because this firm does not exist. NAMING: the slug is `ledgerline`, and ' +
      '"Ledgerline" is the trading name of at least three real accounting practices — a Canadian CPA firm, an Omaha ' +
      'bookkeeping practice, and a virtual accounting service. The author caught this and set the trading name to the ' +
      'invented `Ashcombe CPAs & Advisors`; the slug was kept because it is an internal key that reaches no rendered ' +
      'surface and every document here refers to this profile by it. Nothing a visitor reads carries the real name.',
    nameCheck: {
      searchedFor: 'Ashcombe CPAs & Advisors',
      checkedOn: '2026-08-28',
      finding:
        'No US accounting firm trades under this name; the only "Ashcombe" in finance is a UK corporate-finance advisory. Chosen BECAUSE the assigned slug collides: "Ledgerline" is a Canadian CPA practice, an Omaha bookkeeping firm, and a virtual accounting service. The author found that collision and renamed the firm rather than the slug. A web search, NOT a company-register or trademark search. `[unverified — verify by: a formal register and trademark search]`',
    },
    groundingSources: [
      {
        url: 'https://www.intuit.com/blog/innovative-thinking/client-accounting-services/',
        quote:
          'Client accounting services (CAS) is a bundled offering where an accounting firm handles a business’s day-to-day finances and provides ongoing strategic guidance. Some firms call it CAAS, or client accounting and advisory services.',
        establishes:
          'INDUSTRY FACT: the recurring half of this trade is named and sold as a bundled ongoing offering — client accounting services, or CAS — not as hourly bookkeeping. OUR CALIBRATION: the profile’s two RECURRING service lines are modelled as one subscription bundle rather than as billable tasks, and the vocabulary throughout (close, controller review, advisory) follows the profession’s own naming rather than a generic "back office" framing.',
      },
      {
        url: 'https://getskillability.com/revenue-per-professional-cpa-firms/',
        quote:
          'The 2025 National MAP Survey reported median net client fees per full-time professional employee of $208,128, up 9.7 percent from $189,695 in the 2023 survey.',
        establishes:
          'INDUSTRY FACT: median net client fees per full-time professional employee is $208,128, and the denominator is professional staff rather than total headcount. OUR CALIBRATION: the synthetic firm carries $3,750,000 across 18 professional employees (three partners plus fifteen professional staff, with four administrative outside the denominator), which is $208,333 per professional — 0.1% above the published median, chosen deliberately to sit on it. Revenue per total head is $170,455 and is a different measure that no source here endorses.',
      },
      {
        url: 'https://www.journalofaccountancy.com/news/2024/dec/growth-in-client-advisory-services-set-to-continue-rapid-increase/',
        quote:
          'Practices with a formal written CAS business plan report $27,761 in median average annual client revenue — nearly $10,000 more than all respondents.',
        establishes:
          'INDUSTRY FACT: a deliberately-run advisory practice earns a median $27,761 a year from the average client, roughly $2,313 a month. OUR CALIBRATION: the synthetic average subscription is $2,500 a month across 75 clients, about 8% above that annualised figure and below the $3,000 median monthly fee reported in the same survey family. The source prices an industry median; it verifies no fee charged by this firm.',
      },
      {
        url: 'https://www.cpa.com/news/aicpa-and-cpacom-benchmark-survey-client-advisory-services-cas-practices-report-17-growth',
        quote:
          'Additionally, median CAS net client fees per professional (NCFPP) rose to $156,250 for all respondents, an increase of 29% over the 2022 survey.',
        establishes:
          'INDUSTRY FACT: the advisory desk earns a median $156,250 per professional, materially below the whole-firm figure, and the published denominator includes outsourced and offshored staff. OUR CALIBRATION: $2,250,000 of recurring revenue over roughly 14 advisory full-time equivalents — nine employees plus about five contracted offshore preparers — is $160,714, within 3% of the median. That contracted pod is why the profile carries a written offshore-disclosure consent as an onboarding requirement rather than treating capacity as a purely internal matter.',
      },
      {
        url: 'https://www.accountingtoday.com/opinion/closing-accounting-firms-client-readiness-gap',
        quote:
          'The likelihood that a client will respond correctly and completely to any one of those individual requests the first time is less than 40%.',
        establishes:
          'INDUSTRY FACT: a client’s first response to any single information request is complete and correct less than 40% of the time, and the resulting wait is the named cause of engagements running late and over budget. OUR CALIBRATION: this is why the profile’s reply-wait window is 48 hours and its review-queue timeout 24 hours — both tighter than its acknowledgement target — and why the firm’s stated constraint is that the client portal records what arrived but cannot establish whether it is complete.',
      },
      {
        url: 'https://www.cpapracticeadvisor.com/2026/07/02/the-2026-accountant-technology-survey-turning-data-revelations-into-a-firm-of-the-future/185807/',
        quote:
          'The data showed that the average accounting firm now runs on about 10 different apps and software programs, with one in three firms juggling 11 or more.',
        establishes:
          'INDUSTRY FACT: a firm of this size runs roughly ten separate applications, and the same survey attributes about five hours a week per accountant to moving data between them. OUR CALIBRATION: the profile declares six source systems with explicitly separated systems of record, which is a simplification of the published count and is stated as such — the point carried across is that no single system is authoritative for the whole engagement.',
      },
      {
        url: 'https://www.rightworks.com/products/rightworks-cloud-protect/',
        quote:
          'One secure login for all firm and client SaaS apps—including QuickBooks Online, Xero, ADP, Canopy, TaxDome, Intuit Tax Online, Dext, Bill.com, Expensify, and more',
        establishes:
          'INDUSTRY FACT: a vendor selling into this exact segment names the live stack — a cloud general ledger, a payroll platform, a practice-management system, document-capture and payables tools, and client bank credentials sitting outside all of them. OUR CALIBRATION: the profile’s source systems are the generic shape of that list rather than named products, and the requirement for a named read-only ledger user exists because shared logins are the failure this vendor is selling against.',
      },
      {
        url: 'https://content.govdelivery.com/accounts/USIRS/bulletins/41d6e70',
        quote:
          'Practitioners cannot rely solely on AI; human scrutiny and editing are essential to ensure correctness and compliance with IRS expectations.',
        establishes:
          'INDUSTRY FACT: the regulator governing this trade has ruled that machine output may not be relied on alone and that human review is required before anything reaches a client or the tax authority. OUR CALIBRATION: this is the reason the confidence floor is 0.95 rather than a commercially convenient number, and the reason the profile states an absolute carve-out — no tax position, filing, or disclosure is decided by automation at any confidence. The threshold is an approximation of a rule that is actually categorical.',
      },
      {
        url: 'https://www.thetaxadviser.com/issues/2025/nov/practitioner-engagement-letters-strategies-for-increasing-compliance/',
        quote: 'No work without a signed letter.',
        establishes:
          'INDUSTRY FACT: the profession’s own stated discipline is that no work begins before a signed engagement letter exists. OUR CALIBRATION: the profile makes this an operating constraint and a pipeline exit criterion rather than a preference, and sets the authority required to release an engagement letter at level 3, so a letter may be drafted automatically but is issued only by a credentialed signer.',
      },
      {
        url: 'https://www.journalofaccountancy.com/issues/2026/apr/tips-for-writing-cas-engagement-letters/',
        quote:
          'Remember, while the firm may provide high-level strategic advice and services to the client, the client always has the fundamental and ultimate responsibility for managing their business. This is a duty that can never be outsourced.',
        establishes:
          'INDUSTRY FACT: however far an advisory engagement extends, management responsibility stays with the client and cannot be transferred to the firm. OUR CALIBRATION: this is stated directly in the profile’s explicitlyNot list, and is the boundary that keeps a CFO-advisory service line from being modelled as the firm running the client’s business.',
      },
    ],
  },
  {
    profile: FORMWORK,
    role: 'DEMONSTRATION',
    note:
      'A design-led architecture and engineering practice: high project values, long unpaid qualifications-based ' +
      'pursuits, phased delivery under an owner–architect agreement, and approvals that bottleneck on a principal who ' +
      'is also selling and designing. Registered because it stresses the six systems where the reference business does ' +
      'not — public work is ranked on competence and the fee is then negotiated with the top-ranked firm only, so no ' +
      'stage of its pipeline is a competitive fee bid. Every figure is a synthetic assumption; the sources describe the ' +
      'industry and verify nothing about this practice, which does not exist. One body of research it leans on is ' +
      'deliberately absent below: the trade institute publishes the five Basic Services phase names, the term ' +
      'Instruments of Service, the conduct rule against misleading a prospective client about achievable results, and ' +
      'the position definitions that put proposal preparation with a project manager — and every one of its pages ' +
      'answers HTTP 403 to automated retrieval, so none of it can be captured. The profile docstring names that gap ' +
      'rather than passing the material off as evidenced. NAMING: authored as "Formwork Architecture + Engineering" and ' +
      'renamed to `Wrenfield` at registration, because "Formwork Architecture" is the trading name of several real ' +
      'practices in this exact trade — St. Louis, Barbados, London, and Australia among them. The author did not check ' +
      'the name and did not claim to have; the check was run here and it failed. As with `ledgerline`, the slug stays ' +
      'because it is an internal key that reaches no rendered surface.',
    nameCheck: {
      searchedFor: 'Wrenfield Architecture + Engineering',
      checkedOn: '2026-08-28',
      finding:
        'No design practice trades under this name. Renamed at registration from "Formwork Architecture + Engineering", which IS the trading name of real practices in St. Louis, Barbados, London, and Australia — the collision this field exists to stop. A web search, NOT a company-register or trademark search. `[unverified — verify by: a formal register and trademark search]`',
    },
    groundingSources: [
      {
        url: 'https://monograph.com/blog/architecture-business-benchmarks-understanding-and-increasing-net-revenue-per-full-time-equivalent',
        quote:
          'The average net revenue per FTE is $190K for baseline firms, rising to $210K for firms investing in AI tools which is a $20K gap that compounds quickly at any firm size.',
        establishes:
          'INDUSTRY FACT: a 2026 benchmarking study of A&E firms puts average net revenue per full-time equivalent at $190K, with a published median of $177K. OUR CALIBRATION: Wrenfield’s synthetic $180,000 per head (28 staff against $5.04M) is an assumption placed between that median and that average rather than at either edge. The source describes a survey population; it verifies nothing about this practice, which does not exist.',
      },
      {
        url: 'https://www.enr.com/articles/63497-new-aec-data-show-proposal-activity-holding-up-as-construction-spending-slows',
        quote:
          'Net revenue per employee increased 3% to $195,224, while operating profit per employee rose 13% to $38,881.',
        establishes:
          'INDUSTRY FACT: a second, independent 2026 survey of AEC firms reports net revenue per employee of $195,224, from a different sample than the study above. OUR CALIBRATION: two unrelated surveys landing at $190K and $195K is what makes $180,000 per head defensible as a modelling assumption for a 28-person design-led practice rather than a figure chosen because it was convenient. LIMIT: these surveys do not measure the same object — net billings, net service revenue, and net revenue per employee differ by definition and must not be collapsed into a single benchmark.',
      },
      {
        url: 'https://resources.finalsite.net/images/v1654016667/simsbury/k5iqa9y8ozs3zbuwzr3t/SampleAgreementB101-2017.pdf',
        quote:
          'The Architect shall perform its services consistent with the professional skill and care ordinarily provided by architects practicing in the same or similar locality under the same or similar circumstances.',
        establishes:
          'INDUSTRY FACT: the standard owner–architect agreement defines the architect’s obligation as the professional skill and care ordinarily provided by architects practising in the same or similar locality — a comparative professional standard, not a guarantee of outcome and not a numeric score. OUR CALIBRATION: this is why formwork-confidence-floor sits at 0.90 rather than at a level a lower-stakes business would accept. A machine being usually right does not discharge a standard of care, so the floor is set where escalation to a person is the default rather than the exception. LIMIT: a publicly posted sample copy of the form, cited for its language; it is not evidence that any particular practice signed it.',
      },
      {
        url: 'https://resources.finalsite.net/images/v1654016667/simsbury/k5iqa9y8ozs3zbuwzr3t/SampleAgreementB101-2017.pdf',
        quote:
          'The Architect shall not have control over, charge of, or responsibility for the construction means, methods, techniques, sequences or procedures, or for safety precautions and programs in connection with the Work, nor shall the Architect be responsible for the Contractor’s failure to perform the Work in accordance with the requirements of the Contract Documents.',
        establishes:
          'INDUSTRY FACT: under the standard agreement the architect disclaims control over construction means, methods, techniques, sequences, and procedures, and over site safety. OUR CALIBRATION: two entries in Wrenfield’s explicitlyNot restate this boundary, and it is the reason the practice administers construction rather than delivering it. A generic professional-services model that let this business promise site outcomes would be describing a contractor. LIMIT: establishes what the form says, not how any court has applied it.',
      },
      {
        url: 'https://resources.finalsite.net/images/v1654016667/simsbury/k5iqa9y8ozs3zbuwzr3t/SampleAgreementB101-2017.pdf',
        quote:
          'Accordingly, the Architect cannot and does not warrant or represent that bids or negotiated prices will not vary from the Owner’s budget for the Cost of the Work, or from any estimate of the Cost of the Work, or evaluation, prepared or agreed to by the Architect.',
        establishes:
          'INDUSTRY FACT: the standard agreement states the architect neither warrants nor represents that bids or negotiated prices will match the owner’s budget or any estimate the architect prepared. OUR CALIBRATION: this grounds the explicitlyNot entry refusing to warrant construction cost, and it grounds a sales objection the profile carries verbatim in shape — owners do ask for the cost to be warranted, and the agreement is why the answer is no. It also bounds outbound text across all six systems: no generated message may imply a cost guarantee. LIMIT: form language, cited as characteristic of the trade rather than as universal contract terms.',
      },
      {
        url: 'https://www.basebuilders.com/subjects/cash-flow',
        quote: 'At 45 days past due: a phone call from the principal or project manager.',
        establishes:
          'INDUSTRY FACT: a collections ladder written for architecture and engineering practices places a phone call from the principal or project manager at 45 days past due. OUR CALIBRATION: collectionEscalationDays is set to exactly 45 and escalates to the Managing Principal, adopting the published rung directly rather than choosing a round number. LIMIT: this is vendor-published practice guidance, not an association standard, and it is deliberately NOT the same quantity as days-sales-outstanding, which industry surveys put near 72 days for the median firm.',
      },
      {
        url: 'https://www.basebuilders.com/articles/accounts-receivable-management-for-ae-firms',
        quote:
          'These require escalation: principal-to-principal communication, formal written correspondence, and a clear statement of the outstanding obligation.',
        establishes:
          'INDUSTRY FACT: the same body of A/E practice guidance holds that invoices aged beyond 90 days require principal-to-principal communication and formal written correspondence. OUR CALIBRATION: the second rung of formwork-collection-cadence takes its 90-day principal-to-principal step from this. It also bounds what the receivables system may do — escalation ends in a principal conversation and never in an automated threat of litigation, because the research behind this profile found a fee dispute to be a leading precursor of a professional-liability claim.',
      },
      {
        url: 'https://www.basebuilders.com/articles/wip-management-for-architecture-engineering-firms',
        quote: 'Monthly WIP reviews are too infrequent for active project portfolios.',
        establishes:
          'INDUSTRY FACT: A/E practice-management guidance rejects monthly work-in-progress review as too infrequent for an active project portfolio, and the cadence it recommends instead is weekly. OUR CALIBRATION: inputStalenessToleranceHours is 168 hours — the age at which that recommended weekly rhythm would already have replaced the figure — and humanReviewTimeoutHours is set tighter at 72 hours, because a review queue is not a reporting cycle. Neither number is published anywhere; only the rhythm they are set against is.',
      },
      {
        url: 'https://monograph.com/blog/budget-variance-guide-ae-firms',
        quote:
          'See the threshold guidance for when variances move from routine (under 5%) to documented (5-10%) to immediate management review (above 10%).',
        establishes:
          'INDUSTRY FACT: a published variance ladder for A/E practices treats variance under 5% as routine, 5–10% as requiring documentation, and above 10% as requiring immediate management review. OUR CALIBRATION: exceptionVarianceThresholdPct is 10, adopting the ladder’s top rung as this practice’s exception trigger. NOTE ON THE QUOTE: it is a verbatim sub-span beginning after the sentence’s bolded lead-in. The words before it are wrapped in markup, and stripping the tag leaves a space ahead of the colon, so the fuller sentence as a reader sees it never matches the extracted text.',
      },
      {
        url: 'https://app.leg.wa.gov/wac/default.aspx?cite=308-12-081',
        quote:
          'By signing and sealing technical submissions, you become the architect of record and are responsible to the same extent as if you prepared the technical submissions yourself.',
        establishes:
          'INDUSTRY FACT: a state licensing board rule states that signing and sealing a technical submission makes the signer the architect of record, responsible as though they had prepared it personally. OUR CALIBRATION: this is why Wrenfield carries a Technical Principal and Architect of Record as a role distinct from the Managing Principal, why sealing work prepared outside the practice appears in explicitlyNot, and why no automation in this profile may assemble a submission for sealing. LIMIT: one state board binds one state; this is cited as characteristic of US practice, not as a national rule.',
      },
      {
        url: 'https://cavignac.com/blog/signing-stamping-and-sealing-others-designs/',
        quote:
          'Simply reviewing a completed set of plans created by other designers without your significant involvement is insufficient to meet NCARB’s Rules of Conduct.',
        establishes:
          'INDUSTRY FACT: professional-liability guidance for design practices holds that reviewing a completed set prepared by other designers, without significant involvement, does not satisfy the conduct rules governing responsible control. OUR CALIBRATION: this is the sharper half of the sealing boundary — it establishes that after-the-fact review is not a shortcut to responsible control, which is why Wrenfield’s Technical Principal may seal only submissions prepared under their own control and why the practice declines to seal outside work at all. LIMIT: insurer-published guidance summarising a conduct rule, not the rule itself.',
      },
      {
        url: 'https://legalclarity.org/architectural-fee-proposal-template-what-to-include/',
        quote:
          'Once the template is filled, reviewed internally, and approved by the firm’s principal, delivery matters more than most people think.',
        establishes:
          'INDUSTRY FACT: published guidance on architectural fee proposals treats final approval by the firm’s principal, after internal review, as the normal last step before a proposal is delivered. OUR CALIBRATION: proposalAuthorityCeiling is 4, the top of this repository’s authority ladder, so a fee proposal can be prepared by a project manager but released only by the Managing Principal — and because only one role holds that ceiling, the assignment resolves to exactly one desk. The uncomfortable consequence is deliberate: the single most likely place for a pursuit to stall is the person who is also selling and designing. LIMIT: practice commentary rather than an association rule; the trade institute’s own position definitions would be the stronger source and cannot be retrieved.',
      },
      {
        url: 'https://foveate.com/blog/architecture-proposal-follow-up/',
        quote: 'The timing should match the client\'s actual review behavior, not an arbitrary schedule.',
        establishes:
          'INDUSTRY FACT: architecture-specific writing on proposal follow-up holds that timing should track the client’s actual review behaviour rather than a fixed schedule. OUR CALIBRATION: this is the source that establishes an ABSENCE, and it is the most load-bearing citation here for that reason. It is why replyWaitWindowHours (120), bookingOfferWindowHours (168), dormantMaxAttempts (3) and dormantWindowDays (120) are declared in this profile as chosen risk tolerances rather than industry findings. Inventing a convention where the trade publishes none is the exact failure this register exists to catch.',
      },
      {
        url: 'https://foveate.com/blog/architecture-proposal-follow-up/',
        quote: 'There\'s no universal number.',
        establishes:
          'INDUSTRY FACT: the same page states plainly that there is no universal number of follow-ups after submitting a proposal. OUR CALIBRATION: dormantMaxAttempts is 3 and is published as a choice, not a benchmark. This entry exists separately from the one above because it is the cleanest statement of the absence found anywhere in the research, and because a second passage from the same page can only be cited at all since captures began being keyed by quote as well as URL. LIMIT: a practitioner-facing marketing blog; it is good evidence that no convention is published and weak evidence about what firms actually do.',
      },
    ],
  },
  {
    profile: MERIDIAN,
    role: 'STRUCTURAL_FIXTURE',
    note: 'Authored to falsify the retargetability claim. Runs the six systems in tests and appears on no rendered surface.',
    groundingSources: [],
  },
];

export function registeredProfile(id: string): RegisteredProfile | undefined {
  return REGISTERED_PROFILES.find((r) => r.profile.id === id);
}

/** Profiles a visitor may be shown. */
export const DEMONSTRATION_PROFILES: readonly BusinessProfile[] = REGISTERED_PROFILES.filter(
  (r) => r.role === 'DEMONSTRATION',
).map((r) => r.profile);

/** Every registered profile, whatever its role. What the contract and swap tests iterate. */
export const ALL_PROFILES: readonly BusinessProfile[] = REGISTERED_PROFILES.map((r) => r.profile);
