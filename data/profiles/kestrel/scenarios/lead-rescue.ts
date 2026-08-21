import { ScenarioSchema, type Scenario } from '@/lib/model/runtime';
import { ENQUIRY_CLASSES, REPLY_CLASSES } from '@/lib/engine/handlers/lead-rescue';

/**
 * LEAD RESCUE SCENARIOS — Kestrel Compliance Group.
 *
 * Business vocabulary is expected HERE. Scenarios belong to the profile layer, which is
 * the swappable one; the vertical-agnostic constraint applies to `data/systems/**` only.
 *
 * Every timestamp is authored. The engine never reads a clock, so these runs replay
 * identically forever — which is what `tests/replay.test.ts` asserts.
 *
 * All contacts, companies, and messages are fictional.
 */

const SCHEMA_VERSION = '2026-08-01';

// ===========================================================================
// Scenario 1 — After-hours legitimate enquiry
// ===========================================================================

const AFTER_HOURS = {
  id: 'lr-scenario-after-hours',
  slug: 'after-hours-enquiry',
  systemId: 'lead-rescue',
  title: 'After-hours enquiry with missing scope',
  summary:
    'A genuine enquiry arrives at 20:47 on a Wednesday, well outside working hours, from a company whose enterprise deal is blocked. The message is real but incomplete: it names the framework and nothing else. The system acknowledges immediately, works out precisely which two facts are missing, asks for exactly those, waits, interprets the reply, and hands a complete enquiry to a named owner.',
  demonstrates: [
    'Deterministic validation, normalisation, identity resolution, and consent screening all execute before any interpretation',
    'Consent is screened before commercial intent, not after',
    'Bounded judgment interprets the free text; deterministic policy then decides what happens',
    'The missing set is computed as an intersection of policy-required fields and what the judgment reported absent',
    'Facts the enquiry did not establish stay marked unknown rather than being assumed',
    'A bounded wait is a legitimate state, not a stall',
  ],
  expectedFinalState: 'BOOKED',

  judgments: {
    'jd-halcyon-intake': {
      judgmentId: 'jd-halcyon-intake',
      classification: 'QUALIFIED_ENQUIRY',
      confidence: 0.88,
      missingInformation: ['target_audit_window', 'headcount'],
      evidenceRefs: [
        '"our biggest prospect just told us they can\'t sign without a SOC 2 report"',
        '"we\'ve never done one before"',
        '"we\'re on AWS, everything in one account"',
      ],
      declinedToInfer: [
        'Whether a Type I or Type II report is required — the enquiry says "SOC 2 report" without specifying',
        'Which trust service criteria are in scope',
        'Budget, which was not mentioned at all',
        'The deadline, which is implied to be urgent but never stated',
      ],
      rationaleSummary:
        'Names a concrete commercial trigger, an identifiable buyer role, and a technical environment. In segment. Two policy-required facts are absent from the text.',
    },
    'jd-halcyon-reply': {
      judgmentId: 'jd-halcyon-reply',
      classification: 'SUPPLIES_INFORMATION',
      confidence: 0.93,
      missingInformation: [],
      evidenceRefs: ['"we need it done before our renewal in March"', '"we\'re 62 people, 20 of those engineering"'],
      declinedToInfer: [
        'Whether March is a hard contractual deadline or a preference',
        'Whether the audit firm has already been selected',
      ],
      rationaleSummary: 'Directly answers both questions asked. No new commitments requested.',
    },
  },

  events: [
    {
      eventId: 'evt-halcyon-001',
      correlationId: 'inc-lr-halcyon',
      entityId: 'lead-halcyon',
      type: 'inbound.enquiry.received',
      source: 'website-form',
      sourceEventId: 'wf-2026-08-19-8841',
      occurredAt: '2026-08-19T20:47:02-04:00',
      receivedAt: '2026-08-19T20:47:02-04:00',
      schemaVersion: SCHEMA_VERSION,
      actor: 'EXTERNAL_PARTY',
      executionMode: 'SIMULATED',
      payload: {
        contactName: 'Priya Raman',
        contactEmail: 'p.raman@halcyonfreight.example',
        company: 'Halcyon Freight Systems',
        channel: 'website-form',
        consentState: 'PERMITTED',
        requiredFields: ['framework', 'target_audit_window', 'headcount'],
        message:
          "Hi — our biggest prospect just told us they can't sign without a SOC 2 report and we've never done one before. We're on AWS, everything in one account, about 20 engineers. Trying to work out how long this actually takes and what it costs. Can someone walk us through it?",
        judgment: {
          judgmentId: 'jd-halcyon-intake',
          objective:
            'Classify an inbound enquiry into the permitted set and report which policy-required facts the text does not establish.',
          input:
            "Hi — our biggest prospect just told us they can't sign without a SOC 2 report and we've never done one before. We're on AWS, everything in one account, about 20 engineers. Trying to work out how long this actually takes and what it costs. Can someone walk us through it?",
          permittedClassifications: [...ENQUIRY_CLASSES],
          requiredFields: ['framework', 'target_audit_window', 'headcount'],
        },
      },
    },
    {
      eventId: 'evt-halcyon-002',
      correlationId: 'inc-lr-halcyon',
      entityId: 'lead-halcyon',
      type: 'prospect.replied',
      source: 'shared-inbox',
      sourceEventId: 'inbox-2026-08-19-4417',
      occurredAt: '2026-08-19T20:51:42-04:00',
      receivedAt: '2026-08-19T20:51:42-04:00',
      schemaVersion: SCHEMA_VERSION,
      actor: 'EXTERNAL_PARTY',
      executionMode: 'SIMULATED',
      payload: {
        message:
          "That was fast, thanks. We need it done before our renewal in March. And we're 62 people, 20 of those engineering.",
        resolvesFields: ['target_audit_window', 'headcount'],
        judgment: {
          judgmentId: 'jd-halcyon-reply',
          objective: 'Interpret the intent of a free-text reply to a missing-information question.',
          input:
            "That was fast, thanks. We need it done before our renewal in March. And we're 62 people, 20 of those engineering.",
          permittedClassifications: [...REPLY_CLASSES],
          requiredFields: ['target_audit_window', 'headcount'],
        },
      },
    },
    {
      eventId: 'evt-halcyon-003',
      correlationId: 'inc-lr-halcyon',
      entityId: 'lead-halcyon',
      type: 'human.decision.recorded',
      source: 'operator-console',
      sourceEventId: 'console-2026-08-20-0912',
      occurredAt: '2026-08-20T09:12:00-04:00',
      receivedAt: '2026-08-20T09:12:00-04:00',
      schemaVersion: SCHEMA_VERSION,
      actor: 'HUMAN',
      executionMode: 'SIMULATED',
      payload: {
        decidedBy: 'client-partner',
        decision: 'BOOKED',
        rationale:
          'Scoping call booked for Thursday 09:00. March renewal is the real constraint, so Type I first with Type II observation running afterwards is the shape to discuss. No commitment made on the audit outcome.',
      },
    },
  ],
} satisfies Parameters<typeof ScenarioSchema.parse>[0];

// ===========================================================================
// Scenario 2 — Replayed duplicate delivery
// ===========================================================================

const DUPLICATE_DELIVERY = {
  id: 'lr-scenario-duplicate',
  slug: 'duplicate-delivery',
  systemId: 'lead-rescue',
  title: 'The same enquiry delivered twice',
  summary:
    'A form provider does not receive an acknowledgement quickly enough and redelivers the identical submission four minutes later. The business event is the same event; the delivery is the second one. Nothing about the second delivery reaches the prospect, and the lead does not reopen.',
  demonstrates: [
    'At-least-once delivery is normal, so the second delivery is expected rather than exceptional',
    'The idempotency ledger refuses the already-claimed key: the acknowledgement and the owner notification are suppressed, not re-sent',
    'The lifecycle refuses to move backwards — a replay cannot reopen a lead that has progressed',
    'Both refusals are recorded on the timeline rather than hidden, so the run is auditable',
  ],
  expectedFinalState: 'BOOKING_READY',

  judgments: {
    'jd-vantage-intake': {
      judgmentId: 'jd-vantage-intake',
      classification: 'QUALIFIED_ENQUIRY',
      confidence: 0.91,
      missingInformation: [],
      evidenceRefs: [
        '"ISO 27001 — we\'re expanding into the UK and our bank partners are asking"',
        '"targeting the certification audit in Q1 next year"',
        '"we\'re 140 people"',
      ],
      declinedToInfer: [
        'Whether an ISMS already exists in any form',
        'Whether the bank partners named a specific deadline',
      ],
      rationaleSummary:
        'Names framework, timing, and headcount explicitly. Every policy-required field is established by the text.',
    },
  },

  events: [
    {
      eventId: 'evt-vantage-001',
      correlationId: 'inc-lr-vantage',
      entityId: 'lead-vantage',
      type: 'inbound.enquiry.received',
      source: 'website-form',
      sourceEventId: 'wf-2026-08-11-7702',
      occurredAt: '2026-08-11T14:22:10-04:00',
      receivedAt: '2026-08-11T14:22:10-04:00',
      schemaVersion: SCHEMA_VERSION,
      actor: 'EXTERNAL_PARTY',
      executionMode: 'SIMULATED',
      payload: {
        contactName: 'Daniel Okafor',
        contactEmail: 'd.okafor@vantageledger.example',
        company: 'Vantage Ledger',
        channel: 'website-form',
        consentState: 'PERMITTED',
        requiredFields: ['framework', 'target_audit_window', 'headcount'],
        message:
          "We need ISO 27001 — we're expanding into the UK and our bank partners are asking. We're 140 people and targeting the certification audit in Q1 next year. Who should we talk to about readiness support?",
        judgment: {
          judgmentId: 'jd-vantage-intake',
          objective:
            'Classify an inbound enquiry into the permitted set and report which policy-required facts the text does not establish.',
          input:
            "We need ISO 27001 — we're expanding into the UK and our bank partners are asking. We're 140 people and targeting the certification audit in Q1 next year. Who should we talk to about readiness support?",
          permittedClassifications: [...ENQUIRY_CLASSES],
          requiredFields: ['framework', 'target_audit_window', 'headcount'],
        },
      },
    },
    {
      // Identical sourceEventId. A different eventId, because this is a different
      // DELIVERY of the same business event — which is exactly the distinction the
      // event ledger exists to make.
      eventId: 'evt-vantage-002',
      correlationId: 'inc-lr-vantage',
      entityId: 'lead-vantage',
      type: 'inbound.enquiry.received',
      source: 'website-form',
      sourceEventId: 'wf-2026-08-11-7702',
      occurredAt: '2026-08-11T14:22:10-04:00',
      receivedAt: '2026-08-11T14:26:31-04:00',
      schemaVersion: SCHEMA_VERSION,
      actor: 'EXTERNAL_PARTY',
      executionMode: 'SIMULATED',
      payload: {
        contactName: 'Daniel Okafor',
        contactEmail: 'd.okafor@vantageledger.example',
        company: 'Vantage Ledger',
        channel: 'website-form',
        consentState: 'PERMITTED',
        requiredFields: ['framework', 'target_audit_window', 'headcount'],
        message:
          "We need ISO 27001 — we're expanding into the UK and our bank partners are asking. We're 140 people and targeting the certification audit in Q1 next year. Who should we talk to about readiness support?",
        judgment: {
          judgmentId: 'jd-vantage-intake',
          objective:
            'Classify an inbound enquiry into the permitted set and report which policy-required facts the text does not establish.',
          input:
            "We need ISO 27001 — we're expanding into the UK and our bank partners are asking. We're 140 people and targeting the certification audit in Q1 next year. Who should we talk to about readiness support?",
          permittedClassifications: [...ENQUIRY_CLASSES],
          requiredFields: ['framework', 'target_audit_window', 'headcount'],
        },
      },
    },
  ],
} satisfies Parameters<typeof ScenarioSchema.parse>[0];

// ===========================================================================
// Scenario 3 — Ambiguous, policy-sensitive enquiry
// ===========================================================================

const AMBIGUOUS_HIGH_RISK = {
  id: 'lr-scenario-ambiguous',
  slug: 'ambiguous-high-risk',
  systemId: 'lead-rescue',
  title: 'An enquiry the system should not answer',
  summary:
    'An enquiry asks for a guarantee the firm cannot give, references a live security incident, and hints at a regulator. Interpretation comes back at 0.52 confidence — below the configured floor. The system stops, sends nothing at all, and routes the case to a person with everything it knows attached.',
  demonstrates: [
    'The confidence floor is compared by the engine, outside the judgment, and it fires before any disposition is chosen',
    'Below the floor, no acknowledgement is sent — not a cautious one, none',
    'The judgment records what it declined to infer, so a person sees the ambiguity rather than a confident summary of it',
    'Human review is a lifecycle state with a named owner, not an error path',
    'A person with sufficient authority resolves it, and the authority is verified rather than assumed',
  ],
  expectedFinalState: 'BOOKING_READY',

  judgments: {
    'jd-northwind-intake': {
      judgmentId: 'jd-northwind-intake',
      classification: 'POLICY_SENSITIVE',
      confidence: 0.52,
      missingInformation: ['framework', 'target_audit_window', 'headcount'],
      evidenceRefs: [
        '"can you guarantee we pass"',
        '"we had an incident last month that we\'re still working through"',
        '"our counsel wants to know what our exposure looks like"',
      ],
      declinedToInfer: [
        'Whether the incident is reportable, which determines almost everything about this enquiry',
        'Whether "counsel" indicates active litigation or routine review',
        'Which framework is being asked about — none is named',
        'Whether the guarantee request is literal or conversational shorthand',
      ],
      rationaleSummary:
        'The enquiry mixes a request for an outcome guarantee, an unresolved security incident, and a reference to legal counsel. Each individually would warrant care; together the intent is genuinely unclear and every routing fact is absent.',
    },
  },

  events: [
    {
      eventId: 'evt-northwind-001',
      correlationId: 'inc-lr-northwind',
      entityId: 'lead-northwind',
      type: 'inbound.enquiry.received',
      source: 'shared-inbox',
      sourceEventId: 'inbox-2026-08-14-9903',
      occurredAt: '2026-08-14T11:03:27-04:00',
      receivedAt: '2026-08-14T11:03:27-04:00',
      schemaVersion: SCHEMA_VERSION,
      actor: 'EXTERNAL_PARTY',
      executionMode: 'SIMULATED',
      payload: {
        contactName: 'Marcus Vela',
        contactEmail: 'm.vela@northwindclinical.example',
        company: 'Northwind Clinical',
        channel: 'shared-inbox',
        consentState: 'PERMITTED',
        requiredFields: ['framework', 'target_audit_window', 'headcount'],
        message:
          "We're under pressure to show customers we're secure. If we engage you, can you guarantee we pass? We had an incident last month that we're still working through and our counsel wants to know what our exposure looks like before we commit to anything. Need to move quickly on this.",
        judgment: {
          judgmentId: 'jd-northwind-intake',
          objective:
            'Classify an inbound enquiry into the permitted set and report which policy-required facts the text does not establish.',
          input:
            "We're under pressure to show customers we're secure. If we engage you, can you guarantee we pass? We had an incident last month that we're still working through and our counsel wants to know what our exposure looks like before we commit to anything. Need to move quickly on this.",
          permittedClassifications: [...ENQUIRY_CLASSES],
          requiredFields: ['framework', 'target_audit_window', 'headcount'],
        },
      },
    },
    {
      eventId: 'evt-northwind-002',
      correlationId: 'inc-lr-northwind',
      entityId: 'lead-northwind',
      type: 'human.decision.recorded',
      source: 'operator-console',
      sourceEventId: 'console-2026-08-14-1140',
      occurredAt: '2026-08-14T11:40:00-04:00',
      receivedAt: '2026-08-14T11:40:00-04:00',
      schemaVersion: SCHEMA_VERSION,
      actor: 'HUMAN',
      executionMode: 'SIMULATED',
      payload: {
        decidedBy: 'founder',
        decision: 'CLEARED_TO_PROCEED',
        rationale:
          'I replied personally. Made explicit in writing that we are not the auditor and cannot guarantee any audit outcome, and that we do not advise on incident disclosure or legal exposure — they should take that to their counsel. Offered a scoping call on readiness only. Cleared to proceed on that basis.',
      },
    },
  ],
} satisfies Parameters<typeof ScenarioSchema.parse>[0];

// ===========================================================================

export const LEAD_RESCUE_SCENARIOS: readonly Scenario[] = [
  ScenarioSchema.parse(AFTER_HOURS),
  ScenarioSchema.parse(DUPLICATE_DELIVERY),
  ScenarioSchema.parse(AMBIGUOUS_HIGH_RISK),
];

export function leadRescueScenarioBySlug(slug: string): Scenario | undefined {
  return LEAD_RESCUE_SCENARIOS.find((s) => s.slug === slug);
}
