import type { ExtractionResult } from '@/lib/ports/extraction-provider';
import { RR_REPLY_CLASSES } from '@/lib/engine/handlers/receivables-recovery';
import { ScenarioSchema, type Scenario } from '@/lib/model/runtime';

/**
 * RECEIVABLES / INVOICE RECOVERY AGENT — Kestrel scenarios.
 *
 * Two scenarios, per the same discipline as the first four systems: a complex path
 * proving decision quality on genuinely ambiguous language, and a guardrail path proving
 * a dispute halts the cadence and a stale event cannot corrupt state once it does.
 *
 * Both replies are deliberately messier than a database field: Halden Metrics' reply
 * explicitly mentions a dispute — about a DIFFERENT invoice — while committing to pay
 * THIS one, testing that the bounded judgment does not get fooled by the word "dispute"
 * appearing near an unrelated invoice. Corvid Fleet Services' reply is an unambiguous
 * dispute of specifically billed work.
 */

// ---------------------------------------------------------------------------
// Scenario A — overdue invoice, ambiguous reply, correctly read as a promise
// ---------------------------------------------------------------------------

const HALDEN_INVOICE = {
  invoiceId: 'inv-halden-0417',
  customerId: 'cust-halden',
  customerName: 'Halden Metrics',
  amount: 8500,
  dueDate: '2026-07-20',
};

const HALDEN_REPLY_TEXT =
  "Hi Marcus — good catch on this one. Just to be clear, we're not disputing this invoice at all — that was the other one from Q1, which we already sorted out with your finance team. Cash is just tight this month because a client of ours is late paying us. We're good for it — I can commit to paying this in full by August 5th.";

const HALDEN_CLASSIFICATION_JUDGMENT_ID = 'jud-rr-halden-reply';
const HALDEN_EXTRACTION_JUDGMENT_ID = 'jud-rr-halden-date-extract';

const HALDEN_EXTRACTION: ExtractionResult = {
  judgmentId: HALDEN_EXTRACTION_JUDGMENT_ID,
  extracted: [{ field: 'committedDate', value: '2026-08-05', evidenceRefs: ['reply-01'], confidence: 0.9 }],
  missingFields: [],
  declinedToInfer: [],
  overallConfidence: 0.9,
  rationaleSummary: 'The reply states a specific commitment, "in full by August 5th," in the context of the current year, resolved to 2026-08-05.',
};

const scenarioA: Scenario = ScenarioSchema.parse({
  id: 'rr-scenario-overdue-reply-changes-policy',
  slug: 'overdue-reply-changes-policy',
  systemId: 'receivables-recovery',
  title: 'Overdue invoice reply changes collection policy',
  summary:
    'An invoice ages from due-soon into its first past-due reminder, then the customer replies with a message that explicitly mentions a dispute — about a different, already-resolved invoice — while genuinely committing to a payment date for this one. The bounded judgment correctly reads it as a promise, not a dispute; a second, separate judgment extracts the committed date with citation; the cadence pauses; and payment on the committed date settles the invoice.',
  demonstrates: [
    'Reminders despatch only on the exact configured cadence day, with figures injected from the accounting record, never composed',
    'A reply that mentions "dispute" in passing is correctly read as a promise to pay, not a dispute, by the bounded judgment',
    'A committed date is extracted through a separate, citation-bearing judgment — reusing Call-to-Proposal’s ExtractionProvider port rather than a new one — and never defaulted',
    'A recorded promise pauses the cadence until the committed date',
    'A full settlement read from the accounting system halts everything and reaches PAID',
  ],
  events: [
    {
      eventId: 'evt-rr-halden-001',
      correlationId: 'inc-rr-halden',
      entityId: HALDEN_INVOICE.invoiceId,
      type: 'receivables.aging.evaluated',
      source: 'accounting-system',
      sourceEventId: 'aging-2026-07-17-halden',
      occurredAt: '2026-07-17T09:00:00-04:00',
      receivedAt: '2026-07-17T09:00:05-04:00',
      schemaVersion: '2026-08-01',
      actor: 'SYSTEM',
      executionMode: 'SIMULATED',
      payload: { ...HALDEN_INVOICE, balance: HALDEN_INVOICE.amount },
    },
    {
      eventId: 'evt-rr-halden-002',
      correlationId: 'inc-rr-halden',
      entityId: HALDEN_INVOICE.invoiceId,
      type: 'receivables.aging.evaluated',
      source: 'accounting-system',
      sourceEventId: 'aging-2026-07-21-halden',
      occurredAt: '2026-07-21T09:00:00-04:00',
      receivedAt: '2026-07-21T09:00:05-04:00',
      schemaVersion: '2026-08-01',
      actor: 'SYSTEM',
      executionMode: 'SIMULATED',
      payload: { ...HALDEN_INVOICE, balance: HALDEN_INVOICE.amount },
    },
    {
      eventId: 'evt-rr-halden-003',
      correlationId: 'inc-rr-halden',
      entityId: HALDEN_INVOICE.invoiceId,
      type: 'receivables.customer.replied',
      source: 'shared-inbox',
      sourceEventId: 'reply-2026-07-23-halden',
      occurredAt: '2026-07-23T14:00:00-04:00',
      receivedAt: '2026-07-23T14:00:10-04:00',
      schemaVersion: '2026-08-01',
      actor: 'EXTERNAL_PARTY',
      executionMode: 'SIMULATED',
      payload: {
        invoiceId: HALDEN_INVOICE.invoiceId,
        judgment: {
          judgmentId: HALDEN_CLASSIFICATION_JUDGMENT_ID,
          objective: 'Interpret whether this reply constitutes a dispute, a promise to pay, or neither.',
          input: HALDEN_REPLY_TEXT,
          permittedClassifications: [...RR_REPLY_CLASSES],
          requiredFields: [],
        },
        extraction: {
          judgmentId: HALDEN_EXTRACTION_JUDGMENT_ID,
          objective: 'Extract a specific committed payment date from the reply, if one is stated.',
          sourceArtifactId: 'reply-inv-halden-0417-2026-07-23',
          segments: [{ id: 'reply-01', speaker: 'Customer', text: HALDEN_REPLY_TEXT }],
          requiredFields: ['committedDate'],
        },
      },
    },
    {
      eventId: 'evt-rr-halden-004',
      correlationId: 'inc-rr-halden',
      entityId: HALDEN_INVOICE.invoiceId,
      type: 'receivables.payment.recorded',
      source: 'accounting-system',
      sourceEventId: 'payment-2026-08-05-halden',
      occurredAt: '2026-08-05T10:00:00-04:00',
      receivedAt: '2026-08-05T10:00:05-04:00',
      schemaVersion: '2026-08-01',
      actor: 'SYSTEM',
      executionMode: 'SIMULATED',
      payload: { invoiceId: HALDEN_INVOICE.invoiceId, amountPaid: HALDEN_INVOICE.amount, newBalance: 0 },
    },
  ],
  judgments: { [HALDEN_CLASSIFICATION_JUDGMENT_ID]: { judgmentId: HALDEN_CLASSIFICATION_JUDGMENT_ID, classification: 'PROMISE_TO_PAY', confidence: 0.88, missingInformation: [], evidenceRefs: ['reply-01'], declinedToInfer: ["Whether the Q1 dispute the customer references was actually resolved — that concerns a different invoice and is not verified here."], rationaleSummary: 'The customer explicitly disclaims disputing this invoice, attributes the delay to their own receivables, and states a specific date they will pay in full. Reads as a genuine promise to pay, not a dispute.' } },
  expectedFinalState: 'PAID',
});

// ---------------------------------------------------------------------------
// Scenario B — dispute halts the cadence; a stale evaluation cannot corrupt it
// ---------------------------------------------------------------------------

const CORVID_INVOICE = {
  invoiceId: 'inv-corvid-0298',
  customerId: 'cust-corvid',
  customerName: 'Corvid Fleet Services',
  amount: 15000,
  dueDate: '2026-06-01',
};

const CORVID_REPLY_TEXT =
  "We need to flag this invoice — it includes charges for a scope-change ticket (the extra evidence-mapping work) that nobody on our side approved or signed off on. We were never sent a change order for that piece. Please pull that line until we can confirm what happened.";

const CORVID_CLASSIFICATION_JUDGMENT_ID = 'jud-rr-corvid-reply';
const CORVID_EXTRACTION_JUDGMENT_ID = 'jud-rr-corvid-date-extract';

const CORVID_EXTRACTION: ExtractionResult = {
  judgmentId: CORVID_EXTRACTION_JUDGMENT_ID,
  extracted: [],
  missingFields: ['committedDate'],
  declinedToInfer: ['The reply disputes specific billed work rather than committing to a payment date; no date was stated.'],
  overallConfidence: 0.85,
  rationaleSummary: 'No committed payment date appears anywhere in the reply.',
};

const scenarioB: Scenario = ScenarioSchema.parse({
  id: 'rr-scenario-dispute-halts-cadence',
  slug: 'dispute-halts-cadence',
  systemId: 'receivables-recovery',
  title: 'Dispute halts the cadence',
  summary:
    'An invoice ages, unevaluated, straight to its 31-60 day bucket. The customer disputes a specific line item with a clear, unambiguous reply, which halts every automated collection action immediately. A stale, delayed evaluation then arrives for the same invoice — the handler recognises the invoice is no longer on the ageing ladder and takes no action, and the engine core independently has no declared transition to allow one. A person resolves the dispute in the invoice’s favour, and it returns to the ageing ladder.',
  demonstrates: [
    'A clear dispute halts the cadence immediately, regardless of how far the invoice had already aged',
    'A stale evaluation event, arriving after a dispute, is safely absorbed rather than corrupting state or despatching anything',
    'A human-review state can never produce a collection side effect',
    'Resolving a dispute is a human-only action that requires sufficient authority',
  ],
  events: [
    {
      eventId: 'evt-rr-corvid-001',
      correlationId: 'inc-rr-corvid',
      entityId: CORVID_INVOICE.invoiceId,
      type: 'receivables.aging.evaluated',
      source: 'accounting-system',
      sourceEventId: 'aging-2026-07-02-corvid',
      occurredAt: '2026-07-02T08:00:00-04:00',
      receivedAt: '2026-07-02T08:00:05-04:00',
      schemaVersion: '2026-08-01',
      actor: 'SYSTEM',
      executionMode: 'SIMULATED',
      payload: { ...CORVID_INVOICE, balance: CORVID_INVOICE.amount },
    },
    {
      eventId: 'evt-rr-corvid-002',
      correlationId: 'inc-rr-corvid',
      entityId: CORVID_INVOICE.invoiceId,
      type: 'receivables.customer.replied',
      source: 'shared-inbox',
      sourceEventId: 'reply-2026-07-04-corvid',
      occurredAt: '2026-07-04T11:00:00-04:00',
      receivedAt: '2026-07-04T11:00:10-04:00',
      schemaVersion: '2026-08-01',
      actor: 'EXTERNAL_PARTY',
      executionMode: 'SIMULATED',
      payload: {
        invoiceId: CORVID_INVOICE.invoiceId,
        judgment: {
          judgmentId: CORVID_CLASSIFICATION_JUDGMENT_ID,
          objective: 'Interpret whether this reply constitutes a dispute, a promise to pay, or neither.',
          input: CORVID_REPLY_TEXT,
          permittedClassifications: [...RR_REPLY_CLASSES],
          requiredFields: [],
        },
        extraction: {
          judgmentId: CORVID_EXTRACTION_JUDGMENT_ID,
          objective: 'Extract a specific committed payment date from the reply, if one is stated.',
          sourceArtifactId: 'reply-inv-corvid-0298-2026-07-04',
          segments: [{ id: 'reply-01', speaker: 'Customer', text: CORVID_REPLY_TEXT }],
          requiredFields: ['committedDate'],
        },
      },
    },
    {
      // A delayed batch run, unaware the dispute already happened — the same shape of
      // at-least-once/out-of-order delivery the other systems' duplicate scenarios exercise.
      eventId: 'evt-rr-corvid-003',
      correlationId: 'inc-rr-corvid',
      entityId: CORVID_INVOICE.invoiceId,
      type: 'receivables.aging.evaluated',
      source: 'accounting-system',
      sourceEventId: 'aging-2026-07-20-corvid-stale',
      occurredAt: '2026-07-20T08:00:00-04:00',
      receivedAt: '2026-07-20T08:00:05-04:00',
      schemaVersion: '2026-08-01',
      actor: 'SYSTEM',
      executionMode: 'SIMULATED',
      payload: { ...CORVID_INVOICE, balance: CORVID_INVOICE.amount },
    },
    {
      eventId: 'evt-rr-corvid-004',
      correlationId: 'inc-rr-corvid',
      entityId: CORVID_INVOICE.invoiceId,
      type: 'human.decision.recorded',
      source: 'operator-console',
      sourceEventId: 'console-2026-07-25-corvid',
      occurredAt: '2026-07-25T09:00:00-04:00',
      receivedAt: '2026-07-25T09:00:00-04:00',
      schemaVersion: '2026-08-01',
      actor: 'HUMAN',
      executionMode: 'SIMULATED',
      payload: {
        decidedBy: 'finance',
        decision: 'RESOLVE_DISPUTE',
        rationale: 'Confirmed with the delivery lead: a change order for the evidence-mapping work was on file after all, just not shared with the customer. Invoice stands as issued.',
      },
    },
  ],
  judgments: { [CORVID_CLASSIFICATION_JUDGMENT_ID]: { judgmentId: CORVID_CLASSIFICATION_JUDGMENT_ID, classification: 'DISPUTE', confidence: 0.93, missingInformation: [], evidenceRefs: ['reply-01'], declinedToInfer: [], rationaleSummary: 'Explicit contest of specific billed work, citing the absence of an approved change order. A clear dispute, not a delay or a promise.' } },
  expectedFinalState: 'PAST_DUE_31_60',
});

export const RECEIVABLES_RECOVERY_SCENARIOS: readonly Scenario[] = [scenarioA, scenarioB];

export const RECEIVABLES_RECOVERY_EXTRACTIONS: Readonly<Record<string, ExtractionResult>> = {
  [HALDEN_EXTRACTION.judgmentId]: HALDEN_EXTRACTION,
  [CORVID_EXTRACTION.judgmentId]: CORVID_EXTRACTION,
};

export function receivablesRecoveryScenarioBySlug(slug: string): Scenario | undefined {
  return RECEIVABLES_RECOVERY_SCENARIOS.find((s) => s.slug === slug);
}
