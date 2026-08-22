import { ScenarioSchema, type Scenario } from '@/lib/model/runtime';
import { DPR_REPLY_CLASSES } from '@/lib/engine/handlers/dormant-pipeline-recovery';

/**
 * DORMANT PIPELINE RECOVERY SCENARIOS — Kestrel Compliance Group.
 *
 * Business vocabulary is expected HERE. Scenarios belong to the profile layer, which is
 * the swappable one; the vertical-agnostic constraint applies to `data/systems/**` only.
 *
 * Every timestamp is authored. The engine never reads a clock, so these runs replay
 * identically forever — which is what `tests/dormant-pipeline-recovery.test.ts` asserts.
 *
 * All contacts, companies, and messages are fictional.
 */

const SCHEMA_VERSION = '2026-08-01';

// ===========================================================================
// Scenario A — Eligible reactivation: a timing objection expires
// ===========================================================================

const ELIGIBLE_REACTIVATION = {
  id: 'dp-scenario-eligible-reactivation',
  slug: 'eligible-reactivation',
  systemId: 'dormant-pipeline-recovery',
  title: 'A timing objection expires and the opportunity reopens',
  summary:
    'Ferro Analytics discussed SOC 2 Type II readiness in May and got as far as a proposal, then went quiet — not a bad-fit loss, a stated timing objection: budget would not land until the next quarter. That quarter has now started, the account is not active elsewhere, no suppression exists, and the three-attempt budget has not been touched. The scheduled evaluation cycle recognises the objection has expired, despatches exactly one reactivation approach referencing it, and forty-one minutes later a reply confirms renewed interest. A named owner accepts the opportunity back into the active pipeline.',
  demonstrates: [
    'A configured re-entry condition is a genuine date comparison, not a narrated "yes"',
    'Consent and active-account status are both cleared before the re-entry reason is ever evaluated',
    'Consent is re-checked immediately before despatch, not trusted from the earlier check',
    'Exactly one simulated contact attempt is made, keyed so a replay cannot duplicate it',
    'Bounded judgment interprets the reply; a deterministic floor comparison decides what happens next',
    'Bounded judgment and its confidence floor never themselves reopen the opportunity — only a named human acceptance does',
    'The deciding role’s authority is verified, not assumed',
  ],
  expectedFinalState: 'REOPENED',

  judgments: {
    'jd-ferro-reply': {
      judgmentId: 'jd-ferro-reply',
      classification: 'RENEWED_INTEREST',
      confidence: 0.85,
      missingInformation: [],
      evidenceRefs: [
        '"actually yes — the budget cleared this week, let\'s revisit it"',
        '"can we pick up roughly where we left off"',
      ],
      declinedToInfer: ['Whether the full scope discussed in May is still intact or will need re-scoping'],
      rationaleSummary:
        'Directly confirms renewed interest and names the resolution of the exact objection that caused dormancy. Nothing in the reply is ambiguous.',
    },
  },

  events: [
    {
      eventId: 'evt-ferro-001',
      correlationId: 'inc-dp-ferro',
      entityId: 'opp-ferro',
      type: 'pipeline.dormant.evaluation.triggered',
      source: 'dormant-pipeline-job',
      sourceEventId: 'cycle-2026-08-18-0142',
      occurredAt: '2026-08-18T09:00:00-04:00',
      receivedAt: '2026-08-18T09:00:00-04:00',
      schemaVersion: SCHEMA_VERSION,
      actor: 'SYSTEM',
      executionMode: 'SIMULATED',
      payload: {
        accountName: 'Ferro Analytics',
        contactName: 'Devrim Aslan',
        contactEmail: 'd.aslan@ferroanalytics.example',
        serviceInterest: 'soc2-type2',
        estimatedDealValue: 38_000,
        priorPipelineStage: 'proposal',
        priorObjection: 'Budget does not land until next quarter',
        objectionExpiresOn: '2026-08-01',
        accountStatus: 'INACTIVE',
        consentState: 'PERMITTED',
        attemptsToDate: 0,
        ownerRoleId: 'client-partner',
        sourceId: 'referral-partner',
        qualificationNote:
          'Framework, headcount, and budget authority were already established in the original scoping call; timing was the only open question.',
      },
    },
    {
      eventId: 'evt-ferro-002',
      correlationId: 'inc-dp-ferro',
      entityId: 'opp-ferro',
      type: 'dormant.prospect.replied',
      source: 'shared-inbox',
      sourceEventId: 'inbox-2026-08-19-2201',
      occurredAt: '2026-08-19T10:41:00-04:00',
      receivedAt: '2026-08-19T10:41:00-04:00',
      schemaVersion: SCHEMA_VERSION,
      actor: 'EXTERNAL_PARTY',
      executionMode: 'SIMULATED',
      payload: {
        message: "Actually yes — the budget cleared this week, let's revisit it. Can we pick up roughly where we left off?",
        judgment: {
          judgmentId: 'jd-ferro-reply',
          objective: 'Interpret the intent of a free-text reply to a reactivation attempt.',
          input: "Actually yes — the budget cleared this week, let's revisit it. Can we pick up roughly where we left off?",
          permittedClassifications: [...DPR_REPLY_CLASSES],
          requiredFields: [],
        },
      },
    },
    {
      eventId: 'evt-ferro-003',
      correlationId: 'inc-dp-ferro',
      entityId: 'opp-ferro',
      type: 'human.decision.recorded',
      source: 'operator-console',
      sourceEventId: 'console-2026-08-19-1105',
      occurredAt: '2026-08-19T14:05:00-04:00',
      receivedAt: '2026-08-19T14:05:00-04:00',
      schemaVersion: SCHEMA_VERSION,
      actor: 'HUMAN',
      executionMode: 'SIMULATED',
      payload: {
        decidedBy: 'client-partner',
        decision: 'ACCEPT_REOPEN',
        rationale:
          'Called Devrim directly. Budget is confirmed released for this quarter and the original scope still holds. Accepting this back into active pipeline at the proposal stage rather than restarting qualification.',
      },
    },
  ],
} satisfies Parameters<typeof ScenarioSchema.parse>[0];

// ===========================================================================
// Scenario B — Ineligible: suppression overrides a textbook re-entry trigger
// ===========================================================================

const SUPPRESSED_RECOVERY = {
  id: 'dp-scenario-suppressed-recovery',
  slug: 'suppressed-recovery',
  systemId: 'dormant-pipeline-recovery',
  title: 'A recycle date arrives for a contact who opted out',
  summary:
    'Solmark Insurance Services went dormant in April after preferring to keep working with a fractional security officer. A recycle check-in date was configured for mid-August, and it has now arrived — on paper, a textbook re-entry trigger. But in June the contact explicitly asked, in writing, for no further contact of any kind. The evaluation cycle checks consent before it ever asks whether a re-entry reason applies, finds suppression on file, and ends the record there. No message is prepared, no candidate action is computed, and no bounded judgment is ever consulted.',
  demonstrates: [
    'Dormancy alone, however textbook the recycle trigger, never grants outreach authority once suppression is on file',
    'Consent is evaluated before the re-entry reason is ever computed — not after, and not weighed against it',
    'The system still produces an explicit, inspectable disposition; "no action" is not disappearance from the workflow',
    'No bounded AI judgment is ever consulted — the block is a deterministic gate, not a policy check on a computed candidate action',
    'Zero side effects are proposed, so none can be leaked, retried, or executed by mistake',
  ],
  expectedFinalState: 'SUPPRESSED',

  judgments: {},

  events: [
    {
      eventId: 'evt-solmark-001',
      correlationId: 'inc-dp-solmark',
      entityId: 'opp-solmark',
      type: 'pipeline.dormant.evaluation.triggered',
      source: 'dormant-pipeline-job',
      sourceEventId: 'cycle-2026-08-20-0288',
      occurredAt: '2026-08-20T09:00:00-04:00',
      receivedAt: '2026-08-20T09:00:00-04:00',
      schemaVersion: SCHEMA_VERSION,
      actor: 'SYSTEM',
      executionMode: 'SIMULATED',
      payload: {
        accountName: 'Solmark Insurance Services',
        contactName: 'Renee Falkner',
        contactEmail: 'r.falkner@solmarkinsurance.example',
        serviceInterest: 'soc2-type1',
        estimatedDealValue: 24_000,
        priorPipelineStage: 'scoping',
        priorObjection: 'We already work with a fractional security officer',
        recycleDate: '2026-08-15',
        accountStatus: 'INACTIVE',
        consentState: 'SUPPRESSED',
        attemptsToDate: 1,
        ownerRoleId: 'client-partner',
        sourceId: 'website-form',
        qualificationNote:
          'Contact requested no further contact of any kind, in writing, on 2026-06-30 — unrelated to any specific campaign or list.',
      },
    },
  ],
} satisfies Parameters<typeof ScenarioSchema.parse>[0];

// ===========================================================================

export const DORMANT_PIPELINE_RECOVERY_SCENARIOS: readonly Scenario[] = [
  ScenarioSchema.parse(ELIGIBLE_REACTIVATION),
  ScenarioSchema.parse(SUPPRESSED_RECOVERY),
];

export function dormantPipelineRecoveryScenarioBySlug(slug: string): Scenario | undefined {
  return DORMANT_PIPELINE_RECOVERY_SCENARIOS.find((s) => s.slug === slug);
}
