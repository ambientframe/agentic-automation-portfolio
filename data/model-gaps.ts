/**
 * WHAT THE SIX SYSTEMS CANNOT EXPRESS — found by authors who did not build them.
 *
 * `docs/PROFILE_AUTHORING_PACKET.md` asks every profile author to report what the model could
 * not express about their trade. Three separate authoring runs did exactly that, each working
 * from the packet and its own research brief rather than from this repository's reasoning, and
 * each hit real boundaries and argued them precisely. **Those findings then lived nowhere.**
 * They arrived inside handback documents, were summarised in one line of a checkpoint, and were
 * otherwise lost.
 *
 * How far the independence claim goes, and where it stops, is recorded on `GapDiscovery` —
 * including the part that weakens it. Read that before citing this register as independent
 * evidence.
 *
 * That is a bad place for them, because under `COMMERCIAL_THESIS.md` §3 a retained negative
 * result is a commercial asset. An artifact that publishes only what it can do gives a stranger
 * no way to distinguish it from one that is lying. **A limit found by somebody who had no stake
 * in the answer is the strongest form of that evidence available here**, and it was being thrown
 * away for want of a file to put it in.
 *
 * WHAT THIS IS NOT. It is not a backlog, a roadmap, or a promise. Nothing here is scheduled, and
 * `CLAUDE.md` scope discipline is explicit that the running system must produce the need before
 * a capability is added — several of these may never be built, and saying so is the point. It is
 * a record of where the model was found wanting, by whom, and against what concrete case.
 *
 * WHY EACH ENTRY CARRIES AN EXAMPLE. A gap stated abstractly ("the model lacks nuance") is
 * unfalsifiable and unfixable. A gap stated as an instance — a completed tax return that may not
 * legally be sent — can be checked by a practitioner and either fixed or refused on the merits.
 * `tests/model-gaps.test.ts` requires the example.
 */

export type GapGenerality = 'ONE_TRADE' | 'GENERALISES';

/**
 * WHAT THE INDEPENDENCE CLAIM RESTS ON, AND WHERE IT STOPS.
 *
 * The value of this register is that the limits were found by authors with no stake in the
 * answer. That claim needs to be auditable rather than asserted, so each gap records who
 * reported it, when, and what they were working from.
 *
 * **The honest limit, recorded because it weakens the claim.** The three Stage B runs were
 * separate agent sessions each working from `docs/PROFILE_AUTHORING_PACKET.md` and its own
 * Stage A research brief — but they ran **in the same working tree**, sequentially, and could
 * in principle have read one another's profile files. One of them reported exactly that
 * interference ("sibling agents are active in this same working tree, and it showed twice").
 * So this is independence of *authorship and brief*, not isolation. Separate worktrees would
 * be needed for the stronger claim, and the packet now says so.
 *
 * The raw handbacks are held outside the repository. They are referenced rather than copied in:
 * a verbatim dump would be archival theatre, and the structured record is what an auditor
 * actually needs.
 */
export interface GapDiscovery {
  /** The authoring run that reported it. Distinctness across runs is what "independent" means here. */
  readonly reportedBy: string;
  readonly reportedOn: string;
  /** What that author had access to — the basis of the independence claim. */
  readonly workingFrom: string;
  /** Where the original handback is held. Outside the repository, deliberately. */
  readonly handbackHeld: string;
}

export interface ModelGap {
  readonly id: string;
  readonly title: string;
  /**
   * The registered profile whose author found it. Pinned to the register by test, so a gap
   * cannot be attributed to a business that does not exist — including one we later renamed.
   */
  readonly foundBy: string;
  /** Who reported it, when, and from what. See `GapDiscovery` for the limit on this. */
  readonly discovery: GapDiscovery;
  /** A concrete case from that trade. Required: see the module docstring. */
  readonly example: string;
  /** What the model does today in place of the missing distinction. */
  readonly modelDoesInstead: string;
  /** The shape a fix would have to take. A statement of shape, never a plan. */
  readonly aFixWouldNeed: string;
  readonly generality: GapGenerality;
  /**
   * Set ONLY when a gap has actually been closed, and deliberately not removed from the register
   * when it is. Deleting a closed gap would erase the evidence that an outside author found a
   * real limit, which is the thing this file exists to keep. Most gaps will never carry this:
   * a discovered limitation earns implementation when it materially improves fidelity,
   * reliability, learning, reuse or commercial value, and otherwise it stays a recorded finding.
   */
  readonly addressed?: {
    readonly on: string;
    readonly what: string;
    /** What the fix does NOT do. Required, because a closed gap is still a bounded claim. */
    readonly limit: string;
  };
}

export const MODEL_GAPS: readonly ModelGap[] = [
  {
    id: 'blocked-is-not-overdue',
    title: 'Blocked is not the same as overdue, and the model has only overdue',
    foundBy: 'ashcombe',
    discovery: {
      reportedBy: 'Cursor Stage B run, accounting / CAS profile (handed back as `ledgerline`, renamed at registration)',
      reportedOn: '2026-08-28',
      workingFrom: 'docs/PROFILE_AUTHORING_PACKET.md and its own Stage A research brief. No access to CHECKPOINT.md, PATTERN_LEDGER.md, or this repository\'s reasoning.',
      handbackHeld: 'Held outside the repository as the original handback export; referenced rather than copied in.',
    },
    example:
      'A completed tax return waiting on a signed Form 8879 is legally forbidden to send. The firm is obeying a rule, not dropping a ball, and no amount of waiting makes the return sendable — only the signature does.',
    modelDoesInstead:
      '`dispatchTimeoutHours` flags any prepared-but-unsent action as late once its window elapses. The clock runs regardless of whether proceeding is even permitted, so a firm behaving correctly is reported as behind.',
    aFixWouldNeed:
      'A way to declare that an action is gated on an external precondition, so the engine can hold it in a state distinct from overdue and not start the clock until the gate clears. The distinction has to reach the operational view, or a person still sees "late".',
    generality: 'GENERALISES',
    addressed: {
      on: '2026-08-28',
      what:
        'Profiles declare `externalGates`, each naming what is blocked, the fact that releases it, the event that satisfies it, who owns the dependency, what release authorizes, and the rule it rests on. `checkWaitIncident` returns a distinct ATTENTION_BLOCKED outcome, derived from the handler’s own recorded decision rather than re-derived at the boundary. The action SLA never starts while a gate is closed — nothing is suspended — and the dependency carries its own follow-up window on the same anchor, so chasing a missing signature and being late on a despatch stay two separate facts.',
      limit:
        'One action is wired so far (`DISPATCH`, in Lead Rescue). The primitive is vertical-agnostic and every profile may declare gates, but no other handler consults them yet, so a gate on any other action would be declared and unread. Gate evaluation is presence-of-fact only: it cannot judge whether the evidence recorded is genuine, and bounded AI judgment may propose the fact but never waive the gate.',
    },
  },
  {
    id: 'confidence-floor-cannot-say-never',
    title: 'A confidence floor cannot express "never"',
    foundBy: 'ashcombe',
    discovery: {
      reportedBy: 'Cursor Stage B run, accounting / CAS profile (handed back as `ledgerline`, renamed at registration)',
      reportedOn: '2026-08-28',
      workingFrom: 'docs/PROFILE_AUTHORING_PACKET.md and its own Stage A research brief. No access to CHECKPOINT.md, PATTERN_LEDGER.md, or this repository\'s reasoning.',
      handbackHeld: 'Held outside the repository as the original handback export; referenced rather than copied in.',
    },
    example:
      'The regulator’s rule is categorical: a machine may not decide a tax position at any confidence. The profile can only approximate that with 0.95, which still says "at 0.96, go ahead."',
    modelDoesInstead:
      'A single scalar `confidenceFloor` per profile. The absolute carve-out is stated in policy prose, and the engine reads the number rather than the sentence.',
    aFixWouldNeed:
      'A per-decision-class prohibition that is not a threshold at all — a list of judgments no confidence may authorise, checked before the floor is consulted.',
    generality: 'GENERALISES',
  },
  {
    id: 'entity-match-conflates-confidence-with-permission',
    title: '`entityMatchThreshold` conflates confidence with permission',
    foundBy: 'ashcombe',
    discovery: {
      reportedBy: 'Cursor Stage B run, accounting / CAS profile (handed back as `ledgerline`, renamed at registration)',
      reportedOn: '2026-08-28',
      workingFrom: 'docs/PROFILE_AUTHORING_PACKET.md and its own Stage A research brief. No access to CHECKPOINT.md, PATTERN_LEDGER.md, or this repository\'s reasoning.',
      handbackHeld: 'Held outside the repository as the original handback export; referenced rather than copied in.',
    },
    example:
      'The trade’s rule is not "be very sure before merging". It is "do not auto-merge, because combining two records that each carry a Social Security number is a disclosure decision with criminal exposure."',
    modelDoesInstead:
      'The threshold is set to 1 as the closest available encoding. It works, and it reads as extreme caution rather than as a prohibition.',
    aFixWouldNeed:
      'A separation between how confident a match is and whether merging is permitted at all. They are different questions and one number answers both.',
    generality: 'GENERALISES',
  },
  {
    id: 'client-side-approver-has-no-home',
    title: 'The client is a required actor, and the model has no way to say so',
    foundBy: 'stratum',
    discovery: {
      reportedBy: 'Cursor Stage B run, RevOps / CRM implementation profile',
      reportedOn: '2026-08-27',
      workingFrom: 'docs/PROFILE_AUTHORING_PACKET.md and its own Stage A research brief. No access to CHECKPOINT.md, PATTERN_LEDGER.md, or this repository\'s reasoning.',
      handbackHeld: 'Held outside the repository as the original handback export; referenced rather than copied in.',
    },
    example:
      'In a CRM implementation, which duplicate record wins, which field is authoritative, and whether a phase gate passes all belong to a named person at the client — not to anyone on the delivering firm’s staff.',
    modelDoesInstead:
      '`authorityCeiling` describes only the firm’s own roles, and `accountabilities.escalatesToRoleId` must resolve to a role the profile declares. The best-evidenced fact in that brief could only be encoded as prose.',
    aFixWouldNeed:
      'An external-approver concept: a party who holds authority over a decision without being an employee of the business the profile describes.',
    generality: 'GENERALISES',
  },
  {
    id: 'change-order-has-no-second-path',
    title: 'A change order is a second commercial document, and there is one proposal path',
    foundBy: 'stratum',
    discovery: {
      reportedBy: 'Cursor Stage B run, RevOps / CRM implementation profile',
      reportedOn: '2026-08-27',
      workingFrom: 'docs/PROFILE_AUTHORING_PACKET.md and its own Stage A research brief. No access to CHECKPOINT.md, PATTERN_LEDGER.md, or this repository\'s reasoning.',
      handbackHeld: 'Held outside the repository as the original handback export; referenced rather than copied in.',
    },
    example:
      'A change order is smaller than the original SOW, raised mid-delivery, urgent, approved by both parties — and skipping it is the exact thing that becomes a disputed invoice.',
    modelDoesInstead:
      '`proposalAuthorityCeiling` and `proposalApprovalTimeoutHours` describe the initial SOW only. The change order is folded under the same commercial-authority policy.',
    aFixWouldNeed:
      'A second commercial-document path with its own authority level and its own clock, rather than one path serving two instruments with different economics.',
    generality: 'ONE_TRADE',
  },
  {
    id: 'project-then-retainer-unlinked',
    title: 'A project-then-retainer sequence is modelled as two unrelated numbers',
    foundBy: 'stratum',
    discovery: {
      reportedBy: 'Cursor Stage B run, RevOps / CRM implementation profile',
      reportedOn: '2026-08-27',
      workingFrom: 'docs/PROFILE_AUTHORING_PACKET.md and its own Stage A research brief. No access to CHECKPOINT.md, PATTERN_LEDGER.md, or this repository\'s reasoning.',
      handbackHeld: 'Held outside the repository as the original handback export; referenced rather than copied in.',
    },
    example:
      'Most retainer clients are the same clients continuing after go-live. That relationship is what makes the churn driver "support tailed off after go-live" a revenue event rather than a satisfaction one.',
    modelDoesInstead:
      '`derivedEconomics` holds `newProjectEngagementsPerYear` and `activeRetainerClients` with nothing connecting them.',
    aFixWouldNeed:
      'A way to state that one population converts into the other, so a system can reason about the transition rather than about two independent counts.',
    generality: 'ONE_TRADE',
  },
  {
    id: 'reactivation-assumed-time-driven',
    title: 'Reactivation is assumed to be time-driven when it is event-driven',
    foundBy: 'stratum',
    discovery: {
      reportedBy: 'Cursor Stage B run, RevOps / CRM implementation profile',
      reportedOn: '2026-08-27',
      workingFrom: 'docs/PROFILE_AUTHORING_PACKET.md and its own Stage A research brief. No access to CHECKPOINT.md, PATTERN_LEDGER.md, or this repository\'s reasoning.',
      handbackHeld: 'Held outside the repository as the original handback export; referenced rather than copied in.',
    },
    example:
      'In this trade a dormant account reopens on a renewal date, a new revenue leader, or an acquisition. A firm would rather wait indefinitely and act on a trigger than run three touches over 45 days.',
    modelDoesInstead:
      '`dormantMaxAttempts` and `dormantWindowDays` describe a fixed cadence. The event-driven shape can only be approximated by stretching the window.',
    aFixWouldNeed:
      'A trigger concept for reactivation, so waiting for a known event is a modelled state rather than a long timeout.',
    generality: 'GENERALISES',
  },
  {
    id: 'no-escalation-above-the-top',
    title: 'A stalled approval at the top of the firm reads as an omission, not a risk',
    foundBy: 'wrenfield',
    discovery: {
      reportedBy: 'Cursor Stage B run, architecture / engineering profile (handed back as `formwork`, renamed at registration)',
      reportedOn: '2026-08-28',
      workingFrom: 'docs/PROFILE_AUTHORING_PACKET.md and its own Stage A research brief. No access to CHECKPOINT.md, PATTERN_LEDGER.md, or this repository\'s reasoning. Its Stage A brief\'s tool-stack citations were not supplied to it, which it reported.',
      handbackHeld: 'Held outside the repository as the original handback export; referenced rather than copied in.',
    },
    example:
      'In an architecture practice the fee-proposal approver is the managing principal — the top of the ladder. The brief identifies that person as the practice’s defining operational bottleneck.',
    modelDoesInstead:
      '`validateProfileConsistency` requires `escalatesToRoleId` to hold strictly higher authority, so the profile correctly declares no escalation. The honest consequence — a pursuit dying quietly on the one desk that can release it — becomes invisible to the model rather than modelled.',
    aFixWouldNeed:
      'A way to express that a decision has no one above it, and that this is a named risk rather than a missing field.',
    generality: 'GENERALISES',
  },
  {
    id: 'pursuit-cost-has-nowhere-to-live',
    title: 'Pursuit cost has nowhere to live',
    foundBy: 'wrenfield',
    discovery: {
      reportedBy: 'Cursor Stage B run, architecture / engineering profile (handed back as `formwork`, renamed at registration)',
      reportedOn: '2026-08-28',
      workingFrom: 'docs/PROFILE_AUTHORING_PACKET.md and its own Stage A research brief. No access to CHECKPOINT.md, PATTERN_LEDGER.md, or this repository\'s reasoning. Its Stage A brief\'s tool-stack citations were not supplied to it, which it reported.',
      handbackHeld: 'Held outside the repository as the original handback export; referenced rather than copied in.',
    },
    example:
      'Unpaid qualifications submissions, interviews, and fee negotiation are real, principal-priced, and written off entirely when a pursuit is lost.',
    modelDoesInstead:
      'The practice can describe this in `operatingConstraints`. No field carries it as a quantity, so no system can compute the cost of a lost pursuit.',
    aFixWouldNeed:
      'A cost-of-pursuit quantity attached to the pipeline, so a loss has a price the owner-intelligence system could report.',
    generality: 'ONE_TRADE',
  },
  {
    id: 'qualifications-based-selection-unmodelled',
    title: 'Rank-then-negotiate-with-one is not a pipeline the model recognises',
    foundBy: 'wrenfield',
    discovery: {
      reportedBy: 'Cursor Stage B run, architecture / engineering profile (handed back as `formwork`, renamed at registration)',
      reportedOn: '2026-08-28',
      workingFrom: 'docs/PROFILE_AUTHORING_PACKET.md and its own Stage A research brief. No access to CHECKPOINT.md, PATTERN_LEDGER.md, or this repository\'s reasoning. Its Stage A brief\'s tool-stack citations were not supplied to it, which it reported.',
      handbackHeld: 'Held outside the repository as the original handback export; referenced rather than copied in.',
    },
    example:
      'Public architecture work is ranked on competence, and the fee is then negotiated with the top-ranked firm only. No stage of that pipeline is a competitive fee bid.',
    modelDoesInstead:
      '`pipelineStages` express it as prose exit criteria. The model has no concept of the selection shape, and nothing prevents a reader assuming competitive bidding.',
    aFixWouldNeed:
      'Pipeline stages that can declare their selection mechanism, so a generic professional-services assumption cannot silently misread how the business wins work.',
    generality: 'ONE_TRADE',
  },
  {
    id: 'recurring-assumes-guaranteed-revenue',
    title: '"Recurring" assumes guaranteed revenue that an on-call agreement does not provide',
    foundBy: 'wrenfield',
    discovery: {
      reportedBy: 'Cursor Stage B run, architecture / engineering profile (handed back as `formwork`, renamed at registration)',
      reportedOn: '2026-08-28',
      workingFrom: 'docs/PROFILE_AUTHORING_PACKET.md and its own Stage A research brief. No access to CHECKPOINT.md, PATTERN_LEDGER.md, or this repository\'s reasoning. Its Stage A brief\'s tool-stack citations were not supplied to it, which it reported.',
      handbackHeld: 'Held outside the repository as the original handback export; referenced rather than copied in.',
    },
    example:
      'An on-call or IDIQ appointment guarantees nothing. It is a term appointment against which task orders may or may not be issued.',
    modelDoesInstead:
      '`activeRetainerClients × averageRetainerMonthlyFee × 12` models guaranteed monthly revenue. The arithmetic reconciles while describing a retainer the trade does not have.',
    aFixWouldNeed:
      'A recurring-revenue shape that can express an appointment without a guarantee, distinct from a subscription.',
    generality: 'ONE_TRADE',
  },
  {
    id: 'seasonality-is-not-expressible',
    title: 'Recurring revenue has no notion of a seasonal peak',
    foundBy: 'ashcombe',
    discovery: {
      reportedBy: 'Cursor Stage B run, accounting / CAS profile (handed back as `ledgerline`, renamed at registration)',
      reportedOn: '2026-08-28',
      workingFrom: 'docs/PROFILE_AUTHORING_PACKET.md and its own Stage A research brief. No access to CHECKPOINT.md, PATTERN_LEDGER.md, or this repository\'s reasoning.',
      handbackHeld: 'Held outside the repository as the original handback export; referenced rather than copied in.',
    },
    example:
      'Between January and April this firm’s capacity is fixed and its inbound roughly triples. The same SLA means something different in February than in August.',
    modelDoesInstead:
      '`derivedEconomics` is annual and flat. The constraint is recorded in `operatingConstraints`, where nothing reads it.',
    aFixWouldNeed:
      'A seasonal shape on demand or capacity, so a threshold can mean the same thing all year or deliberately not.',
    generality: 'GENERALISES',
  },
  {
    id: 'consent-is-typed-not-boolean',
    title: 'Consent is typed, and the model has one boolean',
    foundBy: 'ashcombe',
    discovery: {
      reportedBy: 'Cursor Stage B run, accounting / CAS profile (handed back as `ledgerline`, renamed at registration)',
      reportedOn: '2026-08-28',
      workingFrom: 'docs/PROFILE_AUTHORING_PACKET.md and its own Stage A research brief. No access to CHECKPOINT.md, PATTERN_LEDGER.md, or this repository\'s reasoning.',
      handbackHeld: 'Held outside the repository as the original handback export; referenced rather than copied in.',
    },
    example:
      'Consent to be contacted commercially is a different object from the written §7216 consent required before return information may be disclosed to an offshore preparer.',
    modelDoesInstead:
      '`leadSources[].impliesContactConsent` is a boolean. The second consent is modelled as an onboarding requirement, which works and is not the same thing.',
    aFixWouldNeed:
      'Consent as a typed permission with a scope, rather than a single flag meaning "may we contact them".',
    generality: 'GENERALISES',
  },
];
