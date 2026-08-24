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
// Scenario 4 — Restricted contact, policy blocks the candidate action
// ===========================================================================

const RESTRICTED_CONTACT = {
  id: 'lr-scenario-restricted-contact',
  slug: 'restricted-contact-review',
  systemId: 'lead-rescue',
  title: 'A contact who unsubscribed, now writing directly',
  summary:
    'Eight months ago, Renata Kessler unsubscribed from the quarterly compliance-trends newsletter — a marketing opt-out, nothing more. Today she emails the shared inbox directly: her company has a live SOC 2 blocker. The enquiry classifies as clean and well-qualified at high confidence. None of that matters — restricted consent state on file means the acknowledgement is computed, then blocked at the policy gate, and the case goes to a person rather than resolving itself either way.',
  demonstrates: [
    'The full pipeline runs — validation, normalisation, consent load, classification, completeness — before policy is ever evaluated',
    'A high-confidence, well-qualified classification does not unlock the action; the policy gate does not consult confidence at all',
    'The candidate action is computed and shown as blocked, not silently skipped — inspectable, not hidden',
    'DO_NOT_CONTACT and SUPPRESSION_REVIEW are genuinely different states: one is a closed question, the other is an open one held for a person',
    'The system does not assert an answer to a genuinely ambiguous business question — it routes the question to a person instead',
    'Replay cannot accidentally produce a message: the blocked effect never claims the send ledger',
  ],
  expectedFinalState: 'BOOKING_READY',

  judgments: {
    'jd-solstice-intake': {
      judgmentId: 'jd-solstice-intake',
      classification: 'QUALIFIED_ENQUIRY',
      confidence: 0.9,
      missingInformation: [],
      evidenceRefs: [
        '"we need SOC 2 Type II before our enterprise renewal closes"',
        '"about 90 people, 30 of those engineering"',
        '"targeting the audit window for Q1"',
      ],
      declinedToInfer: [
        'Whether the renewal is contractually time-boxed or merely a soft target',
        'Who else at Solstice is aware of this outreach',
      ],
      rationaleSummary:
        'Names framework, headcount, and timing explicitly. Every policy-required field is established by the text. Nothing in the message itself is ambiguous.',
    },
  },

  events: [
    {
      eventId: 'evt-solstice-001',
      correlationId: 'inc-lr-solstice',
      entityId: 'lead-solstice',
      type: 'inbound.enquiry.received',
      source: 'shared-inbox',
      sourceEventId: 'inbox-2026-08-17-2214',
      occurredAt: '2026-08-17T13:12:04-04:00',
      receivedAt: '2026-08-17T13:12:04-04:00',
      schemaVersion: SCHEMA_VERSION,
      actor: 'EXTERNAL_PARTY',
      executionMode: 'SIMULATED',
      payload: {
        contactName: 'Renata Kessler',
        contactEmail: 'r.kessler@solsticeuw.example',
        company: 'Solstice Underwriting',
        channel: 'shared-inbox',
        consentState: 'RESTRICTED_PENDING_REVIEW',
        requiredFields: ['framework', 'target_audit_window', 'headcount'],
        message:
          "Hi — we need SOC 2 Type II before our enterprise renewal closes. About 90 people, 30 of those engineering, and we're targeting the audit window for Q1. Can we talk this week?",
        judgment: {
          judgmentId: 'jd-solstice-intake',
          objective:
            'Classify an inbound enquiry into the permitted set and report which policy-required facts the text does not establish.',
          input:
            "Hi — we need SOC 2 Type II before our enterprise renewal closes. About 90 people, 30 of those engineering, and we're targeting the audit window for Q1. Can we talk this week?",
          permittedClassifications: [...ENQUIRY_CLASSES],
          requiredFields: ['framework', 'target_audit_window', 'headcount'],
        },
      },
    },
    {
      eventId: 'evt-solstice-002',
      correlationId: 'inc-lr-solstice',
      entityId: 'lead-solstice',
      type: 'human.decision.recorded',
      source: 'operator-console',
      sourceEventId: 'console-2026-08-17-1350',
      occurredAt: '2026-08-17T13:50:00-04:00',
      receivedAt: '2026-08-17T13:50:00-04:00',
      schemaVersion: SCHEMA_VERSION,
      actor: 'HUMAN',
      executionMode: 'SIMULATED',
      payload: {
        decidedBy: 'client-partner',
        decision: 'CLEARED_TO_PROCEED',
        rationale:
          'Checked the CRM: Renata unsubscribed from the quarterly newsletter in January, a marketing-nurture opt-out — nothing about direct business contact. This is a separately-initiated enquiry with a real, time-boxed need. Replied to her personally, confirmed we can talk this week, and I am clearing this to proceed as a normal qualified enquiry. If a similar case comes in with any ambiguity about scope, it goes to a person again — this decision does not set a standing rule.',
      },
    },
  ],
} satisfies Parameters<typeof ScenarioSchema.parse>[0];

// ===========================================================================
// Scenario 5 — Uncertain downstream outcome
// ===========================================================================

const UNCERTAIN_OUTCOME = {
  id: 'lr-scenario-uncertain-outcome',
  slug: 'uncertain-downstream-outcome',
  systemId: 'lead-rescue',
  title: 'The acknowledgement provider went quiet',
  summary:
    'Loom Analytics writes in with a complete, qualified enquiry. The acknowledgement is submitted to the transactional email provider — and the connection drops before any delivery confirmation comes back. The provider may have sent it. It may not have. Forty minutes later an automated reconciliation pass queries the provider’s own status log, confirms nothing was ever delivered, and retries on the exact same idempotency key. Devon receives exactly one acknowledgement, not zero and not two.',
  demonstrates: [
    'An uncertain outcome is recorded as its own status, OUTCOME_UNKNOWN — never silently folded into FAILED or into EXECUTED',
    'The business lifecycle proceeds normally regardless — a lead is not stuck because ONE side effect is uncertain; the uncertainty lives on that side effect record, not on the business state',
    'A naive second attempt on the same key is refused by the engine core before it ever reaches a provider, whether or not the fixture would have made it succeed',
    'Verification is read-only: it can only narrow the uncertainty toward a definite answer, and it does — never causing a send itself',
    'Exactly one customer-facing send succeeds across the entire run, with one real external id — never a fabricated one, and never a second one',
    'The retry runs the same execution ledger check as any other attempt; nothing about this being "the reconciliation job" grants it a bypass',
  ],
  expectedFinalState: 'BOOKING_READY',

  judgments: {
    'jd-loom-intake': {
      judgmentId: 'jd-loom-intake',
      classification: 'QUALIFIED_ENQUIRY',
      confidence: 0.87,
      missingInformation: [],
      evidenceRefs: [
        '"we need ISO 27001 before we can close two UK deals sitting in procurement"',
        '"58 people, most of engineering"',
        '"hoping to have the audit booked by end of Q4"',
      ],
      declinedToInfer: ['Which two deals specifically, and their contract values'],
      rationaleSummary:
        'Framework, headcount, and timing are all stated plainly. A clean, complete, qualified enquiry with nothing ambiguous in the text itself.',
    },
  },

  events: [
    {
      eventId: 'evt-loom-001',
      correlationId: 'inc-lr-loom',
      entityId: 'lead-loom',
      type: 'inbound.enquiry.received',
      source: 'website-form',
      sourceEventId: 'wf-2026-08-19-3387',
      occurredAt: '2026-08-19T10:04:12-04:00',
      receivedAt: '2026-08-19T10:04:12-04:00',
      schemaVersion: SCHEMA_VERSION,
      actor: 'EXTERNAL_PARTY',
      executionMode: 'SIMULATED',
      payload: {
        contactName: 'Devon Achebe',
        contactEmail: 'd.achebe@loomanalytics.example',
        company: 'Loom Analytics',
        channel: 'website-form',
        consentState: 'PERMITTED',
        requiredFields: ['framework', 'target_audit_window', 'headcount'],
        message:
          "We need ISO 27001 before we can close two UK deals sitting in procurement. 58 people, most of engineering, hoping to have the audit booked by end of Q4. What's the fastest realistic path?",
        judgment: {
          judgmentId: 'jd-loom-intake',
          objective:
            'Classify an inbound enquiry into the permitted set and report which policy-required facts the text does not establish.',
          input:
            "We need ISO 27001 before we can close two UK deals sitting in procurement. 58 people, most of engineering, hoping to have the audit booked by end of Q4. What's the fastest realistic path?",
          permittedClassifications: [...ENQUIRY_CLASSES],
          requiredFields: ['framework', 'target_audit_window', 'headcount'],
        },
        // Opts the acknowledgement into execution-outcome tracking instead of the
        // always-succeeds path. Consumed two ways: the pre-pass resolves the outcome
        // via the executor (lib/engine/run.ts), and the handler reads attemptId +
        // honorsIdempotencyKey straight off this same entry to build the proposed effect.
        sendAttempts: [
          {
            attemptId: 'jd-loom-ack-attempt-1',
            idempotencyKey: 'ack:lead-loom',
            provider: 'transactional-email',
            description: 'Acknowledgement to the enquirer confirming receipt and naming the next step.',
            honorsIdempotencyKey: false,
          },
        ],
      },
    },
    {
      eventId: 'evt-loom-002',
      correlationId: 'inc-lr-loom',
      entityId: 'lead-loom',
      type: 'side_effect.reconciliation.attempted',
      source: 'reconciliation-job',
      sourceEventId: 'reconcile-2026-08-19-1044',
      occurredAt: '2026-08-19T10:44:12-04:00',
      receivedAt: '2026-08-19T10:44:12-04:00',
      schemaVersion: SCHEMA_VERSION,
      actor: 'SYSTEM',
      executionMode: 'SIMULATED',
      payload: {
        verifyAttempts: [
          {
            attemptId: 'jd-loom-verify-attempt-1',
            targetIdempotencyKey: 'ack:lead-loom',
            provider: 'transactional-email',
          },
        ],
        sendAttempts: [
          {
            attemptId: 'jd-loom-ack-attempt-2',
            idempotencyKey: 'ack:lead-loom',
            provider: 'transactional-email',
            description: 'Retry: acknowledgement to the enquirer confirming receipt and naming the next step.',
            target: 'd.achebe@loomanalytics.example',
            honorsIdempotencyKey: false,
          },
        ],
      },
    },
  ],
} satisfies Parameters<typeof ScenarioSchema.parse>[0];

// ===========================================================================
// Scenario 6 — Reply window elapses without a response
// ===========================================================================

/**
 * Demonstrates the DETERMINISTIC RULE behind lr-t14 (`handleWaitReevaluation` in
 * `lib/engine/handlers/lead-rescue.ts`): given a recorded wait start and a check time, the
 * handler correctly stays parked before the configured window and correctly escalates
 * after it. Like every other scenario in this file, every timestamp here is authored, so
 * this run replays byte-identical forever (`tests/replay.test.ts`).
 *
 * What this scenario does NOT demonstrate is genuine cross-process persistence — that is a
 * different claim, proven separately in `tests/lead-rescue-wait-resume.test.ts` by actually
 * tearing down and reconstructing a `FileWaitIncidentStore` between the park and the
 * check. This scenario only proves the RULE computes correctly; the resume tests prove the
 * incident survives independently of any one function call. See
 * `docs/FIDELITY_ASSESSMENT.md` section 6 for why that distinction is the whole point of
 * this work package.
 */
const WAIT_ELAPSED = {
  id: 'lr-scenario-wait-elapsed',
  slug: 'reply-window-elapses',
  systemId: 'lead-rescue',
  title: 'Reply window elapses without a response',
  summary:
    'A qualified enquiry is missing two required facts. The system asks for them and parks in WAITING_FOR_REPLY. A re-check one hour later finds the wait still within its configured window and takes no action. A second re-check, this time thirty hours after the question was sent, finds the window has genuinely elapsed and escalates to a named person — the wait-elapsed rule this system previously had no way to exercise at all.',
  demonstrates: [
    'A re-check before the configured window elapses leaves WAITING_FOR_REPLY untouched and proposes no side effect',
    'A re-check after the configured window elapses fires lr-t14 (WAITING_FOR_REPLY -> NEEDS_HUMAN) for real, computed from occurredAt against the recorded wait start — not from the next fixture event happening to arrive later',
    'The elapsed check reuses the same deterministic-rule/decision-record shape as every other transition in this handler, including a policy citation',
    'Escalation still reaches a named owner via the ordinary NOTIFICATION side effect, gated by the same policy and authority checks as any other effect',
  ],
  expectedFinalState: 'NEEDS_HUMAN',

  judgments: {
    'jd-solace-intake': {
      judgmentId: 'jd-solace-intake',
      classification: 'QUALIFIED_ENQUIRY',
      confidence: 0.85,
      missingInformation: ['framework', 'headcount'],
      evidenceRefs: [
        '"a customer contract now requires an independent compliance attestation"',
        '"we don\'t currently have anything in place"',
      ],
      declinedToInfer: [
        'Which specific framework the contract requires — the enquiry says "compliance attestation" without naming one',
        'Company size, which was not mentioned at all',
        'Timeline, which is implied to be contractual but never dated',
      ],
      rationaleSummary:
        'Names a concrete commercial trigger and an identifiable need. In segment. Two policy-required facts are absent from the text.',
    },
  },

  events: [
    {
      eventId: 'evt-solace-001',
      correlationId: 'inc-lr-solace',
      entityId: 'lead-solace',
      type: 'inbound.enquiry.received',
      source: 'website-form',
      sourceEventId: 'wf-2026-08-10-2201',
      occurredAt: '2026-08-10T09:00:00-04:00',
      receivedAt: '2026-08-10T09:00:00-04:00',
      schemaVersion: SCHEMA_VERSION,
      actor: 'EXTERNAL_PARTY',
      executionMode: 'SIMULATED',
      payload: {
        contactName: 'Jordan Vance',
        contactEmail: 'j.vance@solaceunderwriting.example',
        company: 'Solace Underwriting Group',
        channel: 'website-form',
        consentState: 'PERMITTED',
        requiredFields: ['framework', 'headcount'],
        message:
          "Hello — a customer contract now requires an independent compliance attestation and we don't currently have anything in place. Can you tell us what's involved?",
        judgment: {
          judgmentId: 'jd-solace-intake',
          objective:
            'Classify an inbound enquiry into the permitted set and report which policy-required facts the text does not establish.',
          input:
            "Hello — a customer contract now requires an independent compliance attestation and we don't currently have anything in place. Can you tell us what's involved?",
          permittedClassifications: [...ENQUIRY_CLASSES],
          requiredFields: ['framework', 'headcount'],
        },
      },
    },
    {
      eventId: 'evt-solace-002',
      correlationId: 'inc-lr-solace',
      entityId: 'lead-solace',
      type: 'lead.wait.reevaluated',
      source: 'wait-scheduler',
      sourceEventId: 'wait-check-2026-08-10-1000',
      occurredAt: '2026-08-10T10:00:00-04:00',
      receivedAt: '2026-08-10T10:00:00-04:00',
      schemaVersion: SCHEMA_VERSION,
      actor: 'SYSTEM',
      executionMode: 'SIMULATED',
      payload: {},
    },
    {
      eventId: 'evt-solace-003',
      correlationId: 'inc-lr-solace',
      entityId: 'lead-solace',
      type: 'lead.wait.reevaluated',
      source: 'wait-scheduler',
      sourceEventId: 'wait-check-2026-08-11-1500',
      occurredAt: '2026-08-11T15:00:00-04:00',
      receivedAt: '2026-08-11T15:00:00-04:00',
      schemaVersion: SCHEMA_VERSION,
      actor: 'SYSTEM',
      executionMode: 'SIMULATED',
      payload: {},
    },
  ],
} satisfies Parameters<typeof ScenarioSchema.parse>[0];

// ===========================================================================
// Scenario 7 — Booking offer goes unanswered (lr-t22)
// ===========================================================================

const OFFER_WAIT_ELAPSED = {
  id: 'lr-scenario-offer-elapsed',
  slug: 'offer-window-elapses',
  systemId: 'lead-rescue',
  title: 'Booking offer elapses without a response',
  summary:
    'A qualified enquiry arrives complete — every required field is already in the text, so the system reaches BOOKING_READY immediately and notifies the named owner that a next commercial step can be offered. A re-check twenty hours later finds the booking-offer window still open and takes no action. A second re-check, this time fifty hours after the case became booking-ready, finds the window has genuinely elapsed and escalates to a person — lr-t22, the sibling of lr-t14 on a different waiting state, driven by the same durable wait/resume mechanism rather than a second, separately invented one.',
  demonstrates: [
    'BOOKING_READY is reached directly (lr-t10) when a qualified enquiry already supplies every required field — no missing-information detour',
    'A re-check before the configured booking-offer window elapses leaves BOOKING_READY untouched and proposes no side effect',
    'A re-check after the window elapses fires lr-t22 (BOOKING_READY -> NEEDS_HUMAN) for real, computed from occurredAt against bookingReadyAt — a distinct fact from lr-t14’s waitStartedAt, so the two waiting categories cannot cross-trigger each other even though both currently escalate to the same NEEDS_HUMAN destination',
    'The elapsed check reuses the same deterministic-rule/decision-record shape as lr-t14 and every other transition in this handler, citing its own policy (kestrel-booking-offer-window) rather than reply-wait’s',
    'Escalation still reaches a named owner via the ordinary NOTIFICATION side effect, gated by the same policy, authority, and durable-claim checks as any other effect',
  ],
  expectedFinalState: 'NEEDS_HUMAN',

  judgments: {
    'jd-northgate-intake': {
      judgmentId: 'jd-northgate-intake',
      classification: 'QUALIFIED_ENQUIRY',
      confidence: 0.93,
      missingInformation: [],
      evidenceRefs: [
        '"we need SOC 2 Type II before our enterprise renewal in March"',
        '"we\'re 60 people, all engineering and support"',
        '"first audit window we\'re targeting is Q1"',
      ],
      declinedToInfer: [
        'Whether a prior SOC 1 or ISO engagement exists',
        'Which specific enterprise customer is driving the renewal deadline',
      ],
      rationaleSummary:
        'Names framework, headcount, and target audit window explicitly. Every policy-required field is established by the text — nothing to ask for.',
    },
  },

  events: [
    {
      eventId: 'evt-northgate-001',
      correlationId: 'inc-lr-northgate',
      entityId: 'lead-northgate',
      type: 'inbound.enquiry.received',
      source: 'website-form',
      sourceEventId: 'wf-2026-08-12-4410',
      occurredAt: '2026-08-12T13:00:00-04:00',
      receivedAt: '2026-08-12T13:00:00-04:00',
      schemaVersion: SCHEMA_VERSION,
      actor: 'EXTERNAL_PARTY',
      executionMode: 'SIMULATED',
      payload: {
        contactName: 'Priya Nathan',
        contactEmail: 'p.nathan@northgateanalytics.example',
        company: 'Northgate Analytics',
        channel: 'website-form',
        consentState: 'PERMITTED',
        requiredFields: ['framework', 'target_audit_window', 'headcount'],
        message:
          "Hi — we need SOC 2 Type II before our enterprise renewal in March. We're 60 people, all engineering and support, and the first audit window we're targeting is Q1. What would readiness support look like?",
        judgment: {
          judgmentId: 'jd-northgate-intake',
          objective:
            'Classify an inbound enquiry into the permitted set and report which policy-required facts the text does not establish.',
          input:
            "Hi — we need SOC 2 Type II before our enterprise renewal in March. We're 60 people, all engineering and support, and the first audit window we're targeting is Q1. What would readiness support look like?",
          permittedClassifications: [...ENQUIRY_CLASSES],
          requiredFields: ['framework', 'target_audit_window', 'headcount'],
        },
      },
    },
    {
      eventId: 'evt-northgate-002',
      correlationId: 'inc-lr-northgate',
      entityId: 'lead-northgate',
      type: 'lead.wait.reevaluated',
      source: 'wait-scheduler',
      sourceEventId: 'wait-check-2026-08-13-0900',
      occurredAt: '2026-08-13T09:00:00-04:00',
      receivedAt: '2026-08-13T09:00:00-04:00',
      schemaVersion: SCHEMA_VERSION,
      actor: 'SYSTEM',
      executionMode: 'SIMULATED',
      payload: {},
    },
    {
      eventId: 'evt-northgate-003',
      correlationId: 'inc-lr-northgate',
      entityId: 'lead-northgate',
      type: 'lead.wait.reevaluated',
      source: 'wait-scheduler',
      sourceEventId: 'wait-check-2026-08-14-1500',
      occurredAt: '2026-08-14T15:00:00-04:00',
      receivedAt: '2026-08-14T15:00:00-04:00',
      schemaVersion: SCHEMA_VERSION,
      actor: 'SYSTEM',
      executionMode: 'SIMULATED',
      payload: {},
    },
  ],
} satisfies Parameters<typeof ScenarioSchema.parse>[0];

// ===========================================================================

export const LEAD_RESCUE_SCENARIOS: readonly Scenario[] = [
  ScenarioSchema.parse(AFTER_HOURS),
  ScenarioSchema.parse(DUPLICATE_DELIVERY),
  ScenarioSchema.parse(AMBIGUOUS_HIGH_RISK),
  ScenarioSchema.parse(RESTRICTED_CONTACT),
  ScenarioSchema.parse(UNCERTAIN_OUTCOME),
  ScenarioSchema.parse(WAIT_ELAPSED),
  ScenarioSchema.parse(OFFER_WAIT_ELAPSED),
];

/**
 * Fixture-backed send/verify outcomes for scenarios that declare `sendAttempts` /
 * `verifyAttempts`. Only `uncertain-downstream-outcome` needs these today; every other
 * scenario's `runScenario` call omits an executor entirely, and the pre-pass never
 * touches it because it never finds an attempt to resolve.
 */
export const LEAD_RESCUE_SEND_OUTCOMES = {
  'jd-loom-ack-attempt-1': {
    kind: 'OUTCOME_UNKNOWN' as const,
    reason:
      'The request reached the transactional email provider, but the connection dropped before any delivery confirmation returned. The provider may or may not have processed it.',
  },
  'jd-loom-ack-attempt-2': {
    kind: 'SUCCEEDED' as const,
    externalId: 'msg_7f2ac91d',
  },
};

export const LEAD_RESCUE_VERIFY_OUTCOMES = {
  'jd-loom-verify-attempt-1': {
    kind: 'CONFIRMED_NOT_EXECUTED' as const,
    reason:
      'Provider delivery log for this idempotency key shows no record of an outbound send. The dropped connection means nothing ever left the provider’s outbound queue.',
  },
};

export function leadRescueScenarioBySlug(slug: string): Scenario | undefined {
  return LEAD_RESCUE_SCENARIOS.find((s) => s.slug === slug);
}
