import { z } from 'zod';
import { numberParam } from '@/lib/model/profile';
import type { DecisionRecord } from '@/lib/model/runtime';
import type { HandlerContext, HandlerOutcome, HandlerStep, ProposedEffect, SystemHandlers } from '../types';

/**
 * RECEIVABLES / INVOICE RECOVERY AGENT — operating logic.
 *
 * TRIGGER -> DECISION -> ACTION -> GUARDRAIL -> OUTCOME, concretely:
 *
 *   `receivables.aging.evaluated`   — a scheduled batch check. Computes days-past-due from
 *                                     the accounting system's own dueDate/balance (never a
 *                                     clock read — see `daysPastDue`), walks the invoice
 *                                     forward through however many ageing buckets that
 *                                     implies, and despatches a reminder only on the exact
 *                                     configured cadence day. NEVER regresses a bucket: a
 *                                     stale or out-of-order evaluation cannot un-age an
 *                                     invoice.
 *   `receivables.customer.replied`  — the one genuinely ambiguous input. A BOUNDED_AI_JUDGMENT
 *                                     (closed-set classification: DISPUTE / PROMISE_TO_PAY /
 *                                     NEITHER) decides intent; a SEPARATE bounded judgment
 *                                     through `ExtractionProvider` — reused exactly as
 *                                     Call-to-Proposal established it, not a new port —
 *                                     extracts a committed date, with citation, only when a
 *                                     promise needs one. Confidence-floor comparison and
 *                                     "was a date actually found" are both DETERMINISTIC
 *                                     checks outside the judgment itself.
 *   `receivables.payment.recorded`  — the accounting system's own settlement read. Full
 *                                     settlement halts everything, from any state, because
 *                                     canon declares a PAID edge from every non-terminal
 *                                     state. Partial settlement reduces the balance and
 *                                     changes nothing else.
 *   `human.decision.recorded`       — the one human-only action this pass drives: resolving
 *                                     a dispute in favour of the invoice as issued.
 *
 * Transition legality, idempotency, and the authority gate are NOT implemented here. They
 * live in the engine core so this handler cannot bypass them.
 */

// ---------------------------------------------------------------------------
// The ageing ladder
// ---------------------------------------------------------------------------

const AGEING_ORDER = ['CURRENT', 'DUE_SOON', 'PAST_DUE_1_30', 'PAST_DUE_31_60', 'PAST_DUE_61_90', 'PAST_DUE_90_PLUS'] as const;
type AgeingBucket = (typeof AGEING_ORDER)[number];

function isAgeingBucket(state: string): state is AgeingBucket {
  return (AGEING_ORDER as readonly string[]).includes(state);
}

/**
 * CLIENT_POLICY kestrel-collection-cadence: "Payment reminders issue 3 days before due
 * date and again on days 1, 8, 15 and 30 past due, with escalation to the founder at day
 * 45." The escalation figure has its own numeric operating parameter
 * (`collectionEscalationDays`) because it is the one value used in an arithmetic
 * comparison; the cadence day-list is not run through `operatingParameters` because that
 * schema's `value` is a single number or string, not a list — kept local and cited to the
 * policy instead, the same choice Call-to-Proposal's own `CP_REQUIRED_FIELDS` makes for a
 * list-shaped requirement.
 */
const PRE_DUE_WINDOW_DAYS = 3;
const REMINDER_CHECKPOINTS_DAYS_PAST_DUE = [-3, 1, 8, 15, 30] as const;

/** Pure date-string arithmetic — no clock read. Same inputs always produce the same output. */
export function daysPastDue(occurredAt: string, dueDate: string): number {
  const occurred = new Date(occurredAt).getTime();
  const due = new Date(`${dueDate}T00:00:00Z`).getTime();
  return Math.floor((occurred - due) / 86_400_000);
}

/**
 * EVIDENCE rr-std-aging-convention: current, 1-30, 31-60, 61-90, 90+, days past due =
 * evaluation date minus due date. Bucket boundaries are cross-vendor accounting
 * convention, not this client's own policy — kept as a local constant rather than an
 * `operatingParameters` entry for the same reason `MIN_TRANSCRIPT_SEGMENTS` is local to
 * Call-to-Proposal's handler: a structural constant, not a tunable business threshold.
 */
export function computeBucket(days: number): AgeingBucket {
  if (days < -PRE_DUE_WINDOW_DAYS) return 'CURRENT';
  if (days <= 0) return 'DUE_SOON';
  if (days <= 30) return 'PAST_DUE_1_30';
  if (days <= 60) return 'PAST_DUE_31_60';
  if (days <= 90) return 'PAST_DUE_61_90';
  return 'PAST_DUE_90_PLUS';
}

function reminderCheckpointFor(days: number): number | null {
  return (REMINDER_CHECKPOINTS_DAYS_PAST_DUE as readonly number[]).includes(days) ? days : null;
}

const ESCALATION_ELIGIBLE_BUCKETS: readonly AgeingBucket[] = ['PAST_DUE_31_60', 'PAST_DUE_61_90', 'PAST_DUE_90_PLUS'];
const DISPUTE_ELIGIBLE_BUCKETS: readonly AgeingBucket[] = ['DUE_SOON', 'PAST_DUE_1_30', 'PAST_DUE_31_60', 'PAST_DUE_61_90'];
const PROMISE_ELIGIBLE_BUCKETS: readonly AgeingBucket[] = ['PAST_DUE_1_30', 'PAST_DUE_31_60'];

// ---------------------------------------------------------------------------
// Reply interpretation
// ---------------------------------------------------------------------------

export const RR_REPLY_CLASSES = ['DISPUTE', 'PROMISE_TO_PAY', 'NEITHER'] as const;
export type ReplyClass = (typeof RR_REPLY_CLASSES)[number];

/**
 * A phrase this firm's collection policy prohibits, regardless of source. Deliberately
 * small and literal, mirroring Call-to-Proposal's `screenProhibitedLanguage` — reminder
 * text here is always template-composed from structured facts, never generated, so this
 * is defence in depth rather than the primary control, exactly as the canon guardrail
 * states: "No message may reference legal consequences ... without human authorship and
 * approval."
 */
const PROHIBITED_COLLECTION_PHRASES = ['legal action', 'lawsuit', 'collections agency', 'in court', 'garnish', 'sue you', 'our attorney', 'attorneys'];

export function screenProhibitedCollectionLanguage(text: string): string | null {
  const lowered = text.toLowerCase();
  const hit = PROHIBITED_COLLECTION_PHRASES.find((phrase) => lowered.includes(phrase));
  return hit === undefined ? null : hit;
}

// ---------------------------------------------------------------------------
// Serialisation into EngineState.facts
// ---------------------------------------------------------------------------

interface InvoiceRecord {
  readonly invoiceId: string;
  readonly customerId: string;
  readonly customerName: string;
  readonly amount: number;
  readonly balance: number;
  readonly dueDate: string;
}

interface PaymentPromise {
  readonly committedDate: string;
  readonly recordedAt: string;
  readonly evidenceRefs: readonly string[];
}

interface DisputeRecord {
  readonly reason: string;
  readonly raisedAt: string;
}

const INVOICE_FACT_KEY = 'invoiceRecordJson';
const PROMISE_FACT_KEY = 'paymentPromiseJson';
const DISPUTE_FACT_KEY = 'disputeJson';

function readInvoice(facts: Readonly<Record<string, string>>): InvoiceRecord | null {
  const raw = facts[INVOICE_FACT_KEY];
  return raw === undefined ? null : (JSON.parse(raw) as InvoiceRecord);
}

function writeInvoice(record: InvoiceRecord): Record<string, string> {
  return { [INVOICE_FACT_KEY]: JSON.stringify(record) };
}

function readPromise(facts: Readonly<Record<string, string>>): PaymentPromise | null {
  const raw = facts[PROMISE_FACT_KEY];
  return raw === undefined ? null : (JSON.parse(raw) as PaymentPromise);
}

// ---------------------------------------------------------------------------
// Payload contracts
// ---------------------------------------------------------------------------

const AgingEvaluationPayloadSchema = z.object({
  invoiceId: z.string().min(1),
  customerId: z.string().min(1),
  customerName: z.string().min(1),
  amount: z.number().positive(),
  /** Authoritative current balance, as read from the accounting system — never inferred. */
  balance: z.number().positive(),
  dueDate: z.string().min(1),
});

const PaymentRecordedPayloadSchema = z.object({
  invoiceId: z.string().min(1),
  amountPaid: z.number().positive(),
  /** Authoritative post-payment balance from the accounting system. Zero means fully settled. */
  newBalance: z.number().nonnegative(),
});

const ReplySegmentSchema = z.object({ id: z.string().min(1), speaker: z.string().min(1), text: z.string().min(1) });

const CustomerReplyPayloadSchema = z.object({
  invoiceId: z.string().min(1),
  judgment: z.object({
    judgmentId: z.string().min(1),
    objective: z.string().min(1),
    input: z.string().min(1),
    permittedClassifications: z.array(z.string().min(1)).min(2),
    requiredFields: z.array(z.string().min(1)),
  }),
  extraction: z.object({
    judgmentId: z.string().min(1),
    objective: z.string().min(1),
    sourceArtifactId: z.string().min(1),
    segments: z.array(ReplySegmentSchema).min(1),
    requiredFields: z.array(z.string().min(1)),
  }),
});

const HumanDecisionPayloadSchema = z.object({
  decidedBy: z.string().min(1),
  decision: z.enum(['RESOLVE_DISPUTE']),
  rationale: z.string().min(1),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function decision(partial: DecisionRecord): DecisionRecord {
  return partial;
}

function composeReminderDescription(invoice: InvoiceRecord, days: number): string {
  const timing = days < 0 ? `${Math.abs(days)} day(s) before due date` : `${days} day(s) past due`;
  return `Reminder for ${invoice.customerName}: invoice ${invoice.invoiceId}, $${invoice.balance.toLocaleString()} outstanding of $${invoice.amount.toLocaleString()} billed, due ${invoice.dueDate} (${timing}).`;
}

function reminderEffect(invoice: InvoiceRecord, days: number, eventId: string): ProposedEffect | { blocked: string } {
  const description = composeReminderDescription(invoice, days);
  const prohibited = screenProhibitedCollectionLanguage(description);
  if (prohibited !== null) return { blocked: prohibited };
  return {
    id: `${eventId}:effect:reminder:${days}`,
    kind: 'MESSAGE_SEND',
    description,
    target: invoice.customerId,
    idempotencyKey: `reminder:${invoice.invoiceId}:${days}`,
    authority: 3,
    policyPermits: true,
    verification: {
      check: 'Confirm exactly one reminder exists for this invoice at this cadence checkpoint.',
      expect: 'One reminder recorded against the invoice at this checkpoint.',
    },
  };
}

// ---------------------------------------------------------------------------
// receivables.aging.evaluated
// ---------------------------------------------------------------------------

function handleAgingEvaluation(ctx: HandlerContext): HandlerOutcome {
  const { event, state, profile } = ctx;
  const id = (suffix: string) => `${event.eventId}:${suffix}`;
  const steps: HandlerStep[] = [];

  const parsed = AgingEvaluationPayloadSchema.safeParse(event.payload);
  if (!parsed.success) {
    return {
      steps: [
        {
          id: id('validate-fail'),
          label: 'Ageing evaluation',
          atOffsetSeconds: 0,
          summary: 'Ageing evaluation payload failed schema validation. No bucket was recomputed.',
          decisions: [
            decision({
              id: id('d-validate-fail'),
              eventId: event.eventId,
              mechanism: 'DETERMINISTIC_RULE',
              objective: 'Confirm the inbound evaluation payload conforms to the declared schema before any bucket is recomputed.',
              relevantState: state.lifecycleState,
              evidenceRefs: ['event.payload'],
              deterministicFacts: [{ label: 'Validation errors', value: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') }],
              missingInformation: [],
              permittedActions: ['retain_raw_payload'],
              forbiddenActions: ['compute_bucket_on_invalid_input'],
              selectedAction: 'retain_raw_payload',
              applicablePolicy: ['A malformed evaluation payload never produces a bucket change or a reminder.'],
              escalationReason: 'Payload could not be validated against the declared schema.',
              authority: 0,
            }),
          ],
          effects: [],
          verifications: [],
        },
      ],
    };
  }

  const record = parsed.data;
  const invoice: InvoiceRecord = {
    invoiceId: record.invoiceId,
    customerId: record.customerId,
    customerName: record.customerName,
    amount: record.amount,
    balance: record.balance,
    dueDate: record.dueDate,
  };
  const factPatch = { facts: writeInvoice(invoice) };

  // --- rr-t23: a promise whose committed date has passed, unsettled, re-enters the ladder ---
  // The SAME evaluation event type drives both the ordinary ageing sweep and this check,
  // because both are genuinely "has a configured date arrived" questions over the same
  // authoritative dueDate/balance read — reusing the trigger rather than declaring a second one.
  if (state.lifecycleState === 'PAYMENT_PROMISED') {
    const promise = readPromise(state.facts);
    const elapsed = promise !== null && event.occurredAt >= promise.committedDate;
    if (!elapsed) {
      steps.push({
        id: id('promise-not-elapsed'),
        label: 'Ageing evaluation',
        atOffsetSeconds: 0,
        summary: promise === null ? 'No promise is on file; nothing to re-evaluate.' : `Committed date ${promise.committedDate} has not yet arrived. The cadence stays paused.`,
        decisions: [
          decision({
            id: id('d-promise-not-elapsed'),
            eventId: event.eventId,
            mechanism: 'DETERMINISTIC_RULE',
            objective: 'Confirm whether a recorded promise’s committed date has arrived before resuming the cadence.',
            relevantState: 'PAYMENT_PROMISED',
            evidenceRefs: promise === null ? [] : [`promise.committedDate=${promise.committedDate}`, `event.occurredAt=${event.occurredAt}`],
            deterministicFacts: promise === null ? [] : [{ label: 'Committed date', value: promise.committedDate }],
            missingInformation: [],
            permittedActions: ['record_authoritative_balance'],
            forbiddenActions: ['resume_cadence_before_committed_date'],
            selectedAction: 'record_authoritative_balance',
            applicablePolicy: ['A promise sets a dated resume condition; the cadence stays paused until that date genuinely arrives.'],
            authority: 3,
          }),
        ],
        effects: [],
        verifications: [],
        statePatch: factPatch,
      });
      return { steps };
    }

    steps.push({
      id: id('promise-broken'),
      label: 'Ageing evaluation',
      atOffsetSeconds: 0,
      transitionTo: 'PAST_DUE_31_60',
      summary: `Committed date ${promise!.committedDate} passed with the balance still outstanding. The invoice returns to its ageing bucket and the cadence resumes.`,
      decisions: [
        decision({
          id: id('d-promise-broken'),
          eventId: event.eventId,
          mechanism: 'DETERMINISTIC_RULE',
          objective: 'Return an invoice to the ageing ladder once its promised date has passed without settlement, rather than leaving it indefinitely parked.',
          relevantState: 'PAYMENT_PROMISED',
          evidenceRefs: [`promise.committedDate=${promise!.committedDate}`, `event.occurredAt=${event.occurredAt}`],
          deterministicFacts: [
            { label: 'Committed date', value: promise!.committedDate },
            { label: 'Balance still outstanding', value: String(invoice.balance) },
          ],
          missingInformation: [],
          permittedActions: ['resume_cadence'],
          forbiddenActions: ['leave_a_broken_promise_parked_indefinitely'],
          selectedAction: 'resume_cadence',
          applicablePolicy: ['A promise sets a dated resume condition rather than an indefinite pause.'],
          authority: 3,
        }),
      ],
      effects: [],
      verifications: [],
      statePatch: factPatch,
    });
    return { steps };
  }

  // --- Ageing evaluation only applies while the invoice is on the ageing ladder ---
  if (!isAgeingBucket(state.lifecycleState)) {
    steps.push({
      id: id('not-applicable'),
      label: 'Ageing evaluation',
      atOffsetSeconds: 0,
      summary: `The invoice is in ${state.lifecycleState}, which is outside the ageing ladder. The scheduled cadence does not apply while a person, a promise, or a plan already owns this invoice; the balance figure is still recorded.`,
      decisions: [
        decision({
          id: id('d-not-applicable'),
          eventId: event.eventId,
          mechanism: 'DETERMINISTIC_RULE',
          objective: 'Confirm the invoice is still on the ageing ladder before recomputing its bucket or considering a reminder.',
          relevantState: state.lifecycleState,
          evidenceRefs: [`state.lifecycleState=${state.lifecycleState}`],
          deterministicFacts: [{ label: 'Current state', value: state.lifecycleState }],
          missingInformation: [],
          permittedActions: ['record_authoritative_balance'],
          forbiddenActions: ['despatch_reminder_outside_ageing_ladder', 'recompute_bucket_while_a_person_owns_the_invoice'],
          selectedAction: 'record_authoritative_balance',
          applicablePolicy: [
            'CLIENT_POLICY kestrel-dispute-halt: a disputed invoice halts every automated collection action immediately.',
            'A human-review or waiting state is never silently re-entered into the automated cadence by a stale evaluation.',
          ],
          authority: 3,
        }),
      ],
      effects: [],
      verifications: [],
      statePatch: factPatch,
    });
    return { steps };
  }

  const currentBucket: AgeingBucket = state.lifecycleState;
  const days = daysPastDue(event.occurredAt, record.dueDate);
  const targetBucket = computeBucket(days);
  const currentIndex = AGEING_ORDER.indexOf(currentBucket);
  const targetIndex = AGEING_ORDER.indexOf(targetBucket);

  // --- Never regress: a stale or out-of-order evaluation cannot un-age an invoice ---
  if (targetIndex < currentIndex) {
    steps.push({
      id: id('stale'),
      label: 'Ageing evaluation',
      atOffsetSeconds: 0,
      summary: `This evaluation's own date computes bucket ${targetBucket} (${days} days past due), earlier than the invoice's currently recorded position (${currentBucket}). Treated as a stale or out-of-order evaluation; the invoice's position does not regress.`,
      decisions: [
        decision({
          id: id('d-stale'),
          eventId: event.eventId,
          mechanism: 'DETERMINISTIC_RULE',
          objective: 'Refuse to move an invoice backward along the ageing ladder from a stale or out-of-order evaluation.',
          relevantState: currentBucket,
          evidenceRefs: [`event.occurredAt=${event.occurredAt}`, `record.dueDate=${record.dueDate}`],
          deterministicFacts: [
            { label: 'Computed bucket for this event', value: targetBucket },
            { label: 'Currently recorded bucket', value: currentBucket },
            { label: 'Days past due (this event)', value: String(days) },
          ],
          missingInformation: [],
          permittedActions: ['record_authoritative_balance'],
          forbiddenActions: ['regress_ageing_bucket', 'despatch_reminder_for_a_stale_checkpoint'],
          selectedAction: 'record_authoritative_balance',
          applicablePolicy: ['A stale or out-of-order evaluation is absorbed without corrupting the invoice’s current position.'],
          authority: 3,
        }),
      ],
      effects: [],
      verifications: [],
      statePatch: factPatch,
    });
    return { steps };
  }

  // --- Walk forward, one declared transition per hop, until the target bucket is reached ---
  let bucket = currentBucket;
  let first = true;
  while (AGEING_ORDER.indexOf(bucket) < targetIndex) {
    const next = AGEING_ORDER[AGEING_ORDER.indexOf(bucket) + 1]!;
    steps.push({
      id: id(`bucket-${next.toLowerCase()}`),
      label: 'Ageing evaluation',
      atOffsetSeconds: steps.length,
      transitionTo: next,
      summary: `${bucket} -> ${next}: ${days} days past due as of ${event.occurredAt}, against a due date of ${record.dueDate}.`,
      decisions: [
        decision({
          id: id(`d-bucket-${next.toLowerCase()}`),
          eventId: event.eventId,
          mechanism: 'DETERMINISTIC_RULE',
          objective: 'Compute the ageing bucket from the due date and the evaluation date, read from the accounting system as authoritative.',
          relevantState: bucket,
          evidenceRefs: [`record.dueDate=${record.dueDate}`, `event.occurredAt=${event.occurredAt}`],
          deterministicFacts: [
            { label: 'Days past due', value: String(days) },
            { label: 'Computed bucket', value: targetBucket },
          ],
          missingInformation: [],
          permittedActions: ['advance_ageing_bucket'],
          forbiddenActions: ['skip_a_bucket_without_a_declared_transition', 'treat_a_reply_as_ageing_evidence'],
          selectedAction: 'advance_ageing_bucket',
          applicablePolicy: ['EVIDENCE rr-std-aging-convention: days past due is the evaluation date minus the due date.'],
          authority: 3,
        }),
      ],
      effects: [],
      verifications: [],
      statePatch: first ? factPatch : undefined,
    });
    bucket = next;
    first = false;
  }

  // --- Reminder, only on an exact configured cadence day ---
  const checkpoint = reminderCheckpointFor(days);
  if (checkpoint !== null) {
    const proposed = reminderEffect(invoice, checkpoint, event.eventId);
    if ('blocked' in proposed) {
      steps.push({
        id: id('reminder-blocked'),
        label: 'Reminder screened',
        atOffsetSeconds: steps.length,
        summary: `A composed reminder matched the prohibited-language screen ("${proposed.blocked}") and was not despatched.`,
        decisions: [
          decision({
            id: id('d-reminder-blocked'),
            eventId: event.eventId,
            mechanism: 'DETERMINISTIC_RULE',
            objective: 'Refuse to despatch any reminder whose composed text references legal consequences or threatens action.',
            relevantState: bucket,
            evidenceRefs: ['reminder.description'],
            deterministicFacts: [{ label: 'Prohibited phrase', value: proposed.blocked }],
            missingInformation: [],
            permittedActions: ['route_to_human'],
            forbiddenActions: ['despatch_prohibited_language'],
            selectedAction: 'route_to_human',
            applicablePolicy: ['CLIENT_POLICY kestrel-collection-cadence; guardrail: no automated message may reference legal consequences.'],
            escalationReason: `Composed reminder matched prohibited phrase "${proposed.blocked}".`,
            authority: 4,
          }),
        ],
        effects: [],
        verifications: [],
      });
    } else {
      steps.push({
        id: id('reminder'),
        label: 'Reminder despatched',
        atOffsetSeconds: steps.length,
        summary: `Cadence checkpoint ${checkpoint} reached. ${proposed.description}`,
        decisions: [
          decision({
            id: id('d-reminder'),
            eventId: event.eventId,
            mechanism: 'DETERMINISTIC_RULE',
            objective: 'Despatch the reminder for this cadence checkpoint, with financial figures injected from the authoritative record, never generated.',
            relevantState: bucket,
            evidenceRefs: [`invoice.balance=${invoice.balance}`, `invoice.dueDate=${invoice.dueDate}`],
            deterministicFacts: [
              { label: 'Cadence checkpoint (days past due)', value: String(checkpoint) },
              { label: 'Balance', value: String(invoice.balance) },
            ],
            missingInformation: [],
            permittedActions: ['despatch_reminder'],
            forbiddenActions: ['despatch_a_second_reminder_for_this_checkpoint', 'compose_a_figure_not_in_the_accounting_record'],
            selectedAction: 'despatch_reminder',
            applicablePolicy: ['CLIENT_POLICY kestrel-collection-cadence: reminders issue 3 days before due date and on days 1, 8, 15 and 30 past due.'],
            authority: 3,
          }),
        ],
        effects: [proposed],
        verifications: [],
      });
    }
  }

  // --- Escalation, only from the buckets canon declares an ESCALATED edge for ---
  if (ESCALATION_ELIGIBLE_BUCKETS.includes(bucket) && days >= numberParam(profile, 'collectionEscalationDays')) {
    steps.push({
      id: id('escalate'),
      label: 'Escalated',
      atOffsetSeconds: steps.length,
      transitionTo: 'ESCALATED',
      summary: `${days} days past due reaches the configured escalation threshold of ${numberParam(profile, 'collectionEscalationDays')} days. Escalated to the founder; automated collection stops here.`,
      decisions: [
        decision({
          id: id('d-escalate'),
          eventId: event.eventId,
          mechanism: 'DETERMINISTIC_RULE',
          objective: 'Escalate to a named owner once the configured age threshold is reached, rather than continuing the automated cadence indefinitely.',
          relevantState: bucket,
          evidenceRefs: [`operatingParameters.collectionEscalationDays`],
          deterministicFacts: [
            { label: 'Days past due', value: String(days) },
            { label: 'Escalation threshold', value: String(numberParam(profile, 'collectionEscalationDays')) },
          ],
          missingInformation: [],
          permittedActions: ['escalate_to_named_owner'],
          forbiddenActions: ['continue_automated_cadence_past_threshold'],
          selectedAction: 'escalate_to_named_owner',
          applicablePolicy: ['CLIENT_POLICY kestrel-collection-cadence: escalation to the founder at day 45.'],
          authority: 2,
        }),
      ],
      effects: [],
      verifications: [],
    });
  }

  return { steps };
}

// ---------------------------------------------------------------------------
// receivables.customer.replied
// ---------------------------------------------------------------------------

function handleCustomerReplied(ctx: HandlerContext): HandlerOutcome {
  const { event, state, judgments, extractions } = ctx;
  const id = (suffix: string) => `${event.eventId}:${suffix}`;
  const steps: HandlerStep[] = [];

  const parsed = CustomerReplyPayloadSchema.safeParse(event.payload);
  if (!parsed.success) {
    return {
      steps: [
        {
          id: id('validate-fail'),
          label: 'Customer reply',
          atOffsetSeconds: 0,
          summary: 'Reply payload failed schema validation. No interpretation was attempted.',
          decisions: [
            decision({
              id: id('d-validate-fail'),
              eventId: event.eventId,
              mechanism: 'DETERMINISTIC_RULE',
              objective: 'Confirm the inbound reply payload conforms to the declared schema before any interpretation is attempted.',
              relevantState: state.lifecycleState,
              evidenceRefs: ['event.payload'],
              deterministicFacts: [{ label: 'Validation errors', value: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') }],
              missingInformation: [],
              permittedActions: ['retain_raw_payload'],
              forbiddenActions: ['attempt_interpretation_on_invalid_input'],
              selectedAction: 'retain_raw_payload',
              applicablePolicy: ['A malformed reply payload never produces a disposition.'],
              escalationReason: 'Payload could not be validated against the declared schema.',
              authority: 0,
            }),
          ],
          effects: [],
          verifications: [],
        },
      ],
    };
  }

  const { judgment: judgmentReq, extraction: extractionReq } = parsed.data;
  const resolved = judgments.get(judgmentReq.judgmentId);

  if (resolved === undefined || resolved.status !== 'OK') {
    const reason = resolved === undefined ? 'No bounded judgment was resolved for this event.' : resolved.reason;
    return {
      steps: [
        {
          id: id('interpret-fail'),
          label: 'Reply interpretation',
          atOffsetSeconds: 0,
          summary: 'The bounded judgment was unavailable or violated its output contract. Held for a person; no disposition was recorded.',
          decisions: [
            decision({
              id: id('d-interpret-fail'),
              eventId: event.eventId,
              mechanism: 'DETERMINISTIC_RULE',
              objective: 'Decide what to do when reply interpretation is unavailable.',
              relevantState: state.lifecycleState,
              evidenceRefs: ['decision_provider.result'],
              deterministicFacts: [
                { label: 'Provider outcome', value: resolved?.status ?? 'MISSING' },
                { label: 'Reason', value: reason },
              ],
              missingInformation: ['reply classification'],
              permittedActions: ['route_to_human'],
              forbiddenActions: ['guess_reply_intent', 'record_a_disposition_without_interpretation'],
              selectedAction: 'route_to_human',
              applicablePolicy: ['An unavailable or contract-violating judgment routes to a person; it is never coerced into a usable value.'],
              escalationReason: reason,
              authority: 2,
            }),
          ],
          effects: [],
          verifications: [],
          statePatch: { awaitingHuman: 'Reply interpretation unavailable' },
        },
      ],
    };
  }

  const judgment = resolved.result;
  const floor = numberParam(ctx.profile, 'confidenceFloor');

  steps.push({
    id: id('interpret'),
    label: 'Reply interpretation',
    atOffsetSeconds: 0,
    summary: `Reply interpreted as ${judgment.classification} at confidence ${judgment.confidence.toFixed(2)}.`,
    decisions: [
      decision({
        id: id('d-interpret'),
        eventId: event.eventId,
        mechanism: 'BOUNDED_AI_JUDGMENT',
        objective: 'Interpret whether a free-text reply constitutes a dispute, a promise to pay, or neither.',
        relevantState: state.lifecycleState,
        evidenceRefs: judgment.evidenceRefs,
        deterministicFacts: [
          { label: 'Permitted classes', value: RR_REPLY_CLASSES.join(', ') },
          { label: 'Returned class', value: judgment.classification },
        ],
        classification: judgment.classification,
        confidence: judgment.confidence,
        missingInformation: judgment.missingInformation,
        permittedActions: ['return_classification_within_permitted_set'],
        forbiddenActions: ['assert_a_financial_fact', 'select_action', 'record_a_promise_or_dispute_itself'],
        selectedAction: 'return_classification',
        applicablePolicy: ['Bounded judgment interprets; it never itself records a financial fact or decides authority.'],
        evaluatorResult: `Declined to infer: ${judgment.declinedToInfer.length > 0 ? judgment.declinedToInfer.join('; ') : 'nothing'}`,
        authority: 1,
        providerId: 'fixture-decision-provider',
      }),
    ],
    effects: [],
    verifications: [],
  });

  if (judgment.confidence < floor) {
    steps.push({
      id: id('below-floor'),
      label: 'Disposition',
      atOffsetSeconds: 1,
      summary: `Confidence ${judgment.confidence.toFixed(2)} is below the configured floor of ${floor.toFixed(2)}. Held for a person; the invoice’s ageing position is unchanged and nothing was recorded as fact.`,
      decisions: [
        decision({
          id: id('d-below-floor'),
          eventId: event.eventId,
          mechanism: 'DETERMINISTIC_RULE',
          objective: 'Compare returned confidence against the configured floor, outside the judgment itself, before any disposition is recorded.',
          relevantState: state.lifecycleState,
          evidenceRefs: ['judgment.confidence'],
          deterministicFacts: [
            { label: 'Returned confidence', value: judgment.confidence.toFixed(2) },
            { label: 'Configured floor', value: floor.toFixed(2) },
          ],
          missingInformation: judgment.missingInformation,
          permittedActions: ['route_to_human'],
          forbiddenActions: ['record_dispute_or_promise_below_floor', 'default_to_a_disposition'],
          selectedAction: 'route_to_human',
          applicablePolicy: ['Ambiguous customer language below the confidence floor is never treated as an authoritative financial fact.'],
          escalationReason: `Confidence ${judgment.confidence.toFixed(2)} below floor ${floor.toFixed(2)}.`,
          authority: 2,
        }),
      ],
      effects: [],
      verifications: [],
      statePatch: { awaitingHuman: 'Reply interpretation below confidence floor' },
    });
    return { steps };
  }

  if (judgment.classification === 'NEITHER') {
    steps.push({
      id: id('neither'),
      label: 'Disposition',
      atOffsetSeconds: 1,
      summary: 'Reply is neither a dispute nor a promise to pay. Logged; no disposition change.',
      decisions: [
        decision({
          id: id('d-neither'),
          eventId: event.eventId,
          mechanism: 'DETERMINISTIC_RULE',
          objective: 'Map a reply carrying neither classification onto no disposition change.',
          relevantState: state.lifecycleState,
          evidenceRefs: ['judgment.classification'],
          deterministicFacts: [{ label: 'Classification', value: judgment.classification }],
          missingInformation: [],
          permittedActions: ['log_reply'],
          forbiddenActions: ['invent_a_disposition'],
          selectedAction: 'log_reply',
          applicablePolicy: ['A reply that is neither a dispute nor a promise does not change the invoice’s position.'],
          authority: 3,
        }),
      ],
      effects: [],
      verifications: [],
    });
    return { steps };
  }

  const currentBucket = isAgeingBucket(state.lifecycleState) ? state.lifecycleState : null;

  if (judgment.classification === 'DISPUTE') {
    if (currentBucket === null || !DISPUTE_ELIGIBLE_BUCKETS.includes(currentBucket)) {
      steps.push({
        id: id('dispute-ineligible'),
        label: 'Disposition',
        atOffsetSeconds: 1,
        summary: `A dispute cannot be recorded from ${state.lifecycleState}. Held for a person.`,
        decisions: [
          decision({
            id: id('d-dispute-ineligible'),
            eventId: event.eventId,
            mechanism: 'DETERMINISTIC_RULE',
            objective: 'Confirm the invoice is in a state that can legally accept a dispute before recording one.',
            relevantState: state.lifecycleState,
            evidenceRefs: [`state.lifecycleState=${state.lifecycleState}`],
            deterministicFacts: [{ label: 'Classification', value: judgment.classification }],
            missingInformation: [],
            permittedActions: ['route_to_human'],
            forbiddenActions: ['record_a_dispute_from_an_ineligible_state'],
            selectedAction: 'route_to_human',
            applicablePolicy: ['A dispute is recorded only from a state the declared lifecycle graph permits.'],
            escalationReason: `Reply classified DISPUTE while invoice is in ${state.lifecycleState}, which has no declared dispute transition.`,
            authority: 2,
          }),
        ],
        effects: [],
        verifications: [],
        statePatch: { awaitingHuman: 'Dispute reply received outside an ageing-bucket state' },
      });
      return { steps };
    }

    const disputeRecord: DisputeRecord = { reason: judgment.rationaleSummary, raisedAt: event.occurredAt };
    steps.push({
      id: id('dispute'),
      label: 'Disposition',
      atOffsetSeconds: 1,
      transitionTo: 'DISPUTED',
      summary: `Dispute recorded at confidence ${judgment.confidence.toFixed(2)}. Every automated collection action halts immediately.`,
      decisions: [
        decision({
          id: id('d-dispute'),
          eventId: event.eventId,
          mechanism: 'DETERMINISTIC_RULE',
          objective: 'Record a dispute and halt the collection cadence, per confirmed classification at or above the confidence floor.',
          relevantState: currentBucket,
          evidenceRefs: ['judgment.confidence', 'judgment.classification'],
          deterministicFacts: [
            { label: 'Returned confidence', value: judgment.confidence.toFixed(2) },
            { label: 'Configured floor', value: floor.toFixed(2) },
          ],
          missingInformation: [],
          permittedActions: ['halt_cadence_and_route_to_human'],
          forbiddenActions: ['continue_cadence_after_dispute'],
          selectedAction: 'halt_cadence_and_route_to_human',
          applicablePolicy: ['CLIENT_POLICY kestrel-dispute-halt: a disputed invoice halts every automated collection action immediately.'],
          authority: 3,
        }),
      ],
      effects: [],
      verifications: [],
      statePatch: { facts: { [DISPUTE_FACT_KEY]: JSON.stringify(disputeRecord) } },
    });
    return { steps };
  }

  // PROMISE_TO_PAY
  if (currentBucket === null || !PROMISE_ELIGIBLE_BUCKETS.includes(currentBucket)) {
    steps.push({
      id: id('promise-ineligible'),
      label: 'Disposition',
      atOffsetSeconds: 1,
      summary: `A promise to pay cannot be recorded from ${state.lifecycleState}. Held for a person.`,
      decisions: [
        decision({
          id: id('d-promise-ineligible'),
          eventId: event.eventId,
          mechanism: 'DETERMINISTIC_RULE',
          objective: 'Confirm the invoice is in a state that can legally accept a promise to pay before recording one.',
          relevantState: state.lifecycleState,
          evidenceRefs: [`state.lifecycleState=${state.lifecycleState}`],
          deterministicFacts: [{ label: 'Classification', value: judgment.classification }],
          missingInformation: [],
          permittedActions: ['route_to_human'],
          forbiddenActions: ['record_a_promise_from_an_ineligible_state'],
          selectedAction: 'route_to_human',
          applicablePolicy: ['A promise to pay is recorded only from a state the declared lifecycle graph permits.'],
          escalationReason: `Reply classified PROMISE_TO_PAY while invoice is in ${state.lifecycleState}, which has no declared promise transition.`,
          authority: 2,
        }),
      ],
      effects: [],
      verifications: [],
      statePatch: { awaitingHuman: 'Promise-to-pay reply received outside an eligible ageing-bucket state' },
    });
    return { steps };
  }

  const resolvedExtraction = extractions.get(extractionReq.judgmentId);
  const committedDateField =
    resolvedExtraction?.status === 'OK' ? resolvedExtraction.result.extracted.find((f) => f.field === 'committedDate') : undefined;

  if (resolvedExtraction === undefined || resolvedExtraction.status !== 'OK' || committedDateField === undefined) {
    const reason =
      resolvedExtraction === undefined
        ? 'No date extraction was resolved for this event.'
        : resolvedExtraction.status !== 'OK'
          ? resolvedExtraction.reason
          : 'The extraction ran but found no committed-date field in the reply.';
    steps.push({
      id: id('promise-no-date'),
      label: 'Disposition',
      atOffsetSeconds: 1,
      summary: 'Reply reads as a promise to pay, but no committed date could be established. The date stays unknown rather than defaulted; held for a person.',
      decisions: [
        decision({
          id: id('d-promise-no-date'),
          eventId: event.eventId,
          mechanism: 'DETERMINISTIC_RULE',
          objective: 'Refuse to record a promise to pay without a specific committed date, extracted with citation, rather than inventing one.',
          relevantState: currentBucket,
          evidenceRefs: ['extraction_provider.result'],
          deterministicFacts: [{ label: 'Reason', value: reason }],
          missingInformation: ['committedDate'],
          permittedActions: ['route_to_human'],
          forbiddenActions: ['default_a_committed_date', 'infer_a_plausible_date'],
          selectedAction: 'route_to_human',
          applicablePolicy: ['A promise without an extractable date is not recorded as one; the date remains unknown, never defaulted.'],
          escalationReason: reason,
          authority: 2,
        }),
      ],
      effects: [],
      verifications: [],
      statePatch: { awaitingHuman: 'Promise to pay reply with no extractable committed date' },
    });
    return { steps };
  }

  const promise: PaymentPromise = {
    committedDate: committedDateField.value,
    recordedAt: event.occurredAt,
    evidenceRefs: committedDateField.evidenceRefs,
  };

  steps.push({
    id: id('promise'),
    label: 'Disposition',
    atOffsetSeconds: 1,
    transitionTo: 'PAYMENT_PROMISED',
    summary: `Promise to pay recorded for ${promise.committedDate}, extracted from the reply with citation. The cadence pauses until that date.`,
    decisions: [
      decision({
        id: id('d-promise'),
        eventId: event.eventId,
        mechanism: 'BOUNDED_AI_JUDGMENT',
        objective: 'Extract the specific committed payment date from the reply, citing the passage it rests on.',
        relevantState: currentBucket,
        evidenceRefs: committedDateField.evidenceRefs,
        deterministicFacts: [{ label: 'Committed date', value: promise.committedDate }],
        confidence: committedDateField.confidence,
        missingInformation: [],
        permittedActions: ['record_committed_date'],
        forbiddenActions: ['assert_a_date_not_present_in_the_reply', 'select_action', 'halt_the_cadence_itself'],
        selectedAction: 'record_committed_date',
        applicablePolicy: ['Bounded judgment extracts the date; the deterministic rule below is what actually pauses the cadence.'],
        authority: 1,
        providerId: 'fixture-extraction-provider',
      }),
      decision({
        id: id('d-promise-pause'),
        eventId: event.eventId,
        mechanism: 'DETERMINISTIC_RULE',
        objective: 'Pause the collection cadence on a recorded promise to pay, per confirmed classification at or above the confidence floor.',
        relevantState: currentBucket,
        evidenceRefs: ['judgment.confidence'],
        deterministicFacts: [{ label: 'Returned confidence', value: judgment.confidence.toFixed(2) }],
        missingInformation: [],
        permittedActions: ['pause_cadence'],
        forbiddenActions: ['continue_cadence_after_promise'],
        selectedAction: 'pause_cadence',
        applicablePolicy: ['A recorded promise to pay pauses the cadence until the committed date.'],
        authority: 3,
      }),
    ],
    effects: [],
    verifications: [],
    statePatch: { facts: { [PROMISE_FACT_KEY]: JSON.stringify(promise) } },
  });
  return { steps };
}

// ---------------------------------------------------------------------------
// receivables.payment.recorded
// ---------------------------------------------------------------------------

function handlePaymentRecorded(ctx: HandlerContext): HandlerOutcome {
  const { event, state } = ctx;
  const id = (suffix: string) => `${event.eventId}:${suffix}`;

  const parsed = PaymentRecordedPayloadSchema.safeParse(event.payload);
  if (!parsed.success) {
    return {
      steps: [
        {
          id: id('validate-fail'),
          label: 'Payment recorded',
          atOffsetSeconds: 0,
          summary: 'Payment payload failed schema validation. No balance was updated.',
          decisions: [
            decision({
              id: id('d-validate-fail'),
              eventId: event.eventId,
              mechanism: 'DETERMINISTIC_RULE',
              objective: 'Confirm the inbound payment payload conforms to the declared schema before any balance is updated.',
              relevantState: state.lifecycleState,
              evidenceRefs: ['event.payload'],
              deterministicFacts: [{ label: 'Validation errors', value: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') }],
              missingInformation: [],
              permittedActions: ['retain_raw_payload'],
              forbiddenActions: ['update_balance_on_invalid_input'],
              selectedAction: 'retain_raw_payload',
              applicablePolicy: ['A malformed payment payload never produces a balance or state change.'],
              escalationReason: 'Payload could not be validated against the declared schema.',
              authority: 0,
            }),
          ],
          effects: [],
          verifications: [],
        },
      ],
    };
  }

  const { invoiceId, amountPaid, newBalance } = parsed.data;

  if (state.lifecycleState === 'PAID' || state.lifecycleState === 'WRITTEN_OFF') {
    return {
      steps: [
        {
          id: id('already-settled'),
          label: 'Payment recorded',
          atOffsetSeconds: 0,
          summary: `Invoice is already ${state.lifecycleState}. A further payment event does not reopen or re-settle it; recorded as informational only.`,
          decisions: [
            decision({
              id: id('d-already-settled'),
              eventId: event.eventId,
              mechanism: 'DETERMINISTIC_RULE',
              objective: 'Refuse to act on a payment event against an invoice that already reached a terminal state.',
              relevantState: state.lifecycleState,
              evidenceRefs: [`state.lifecycleState=${state.lifecycleState}`],
              deterministicFacts: [{ label: 'Amount paid (this event)', value: String(amountPaid) }],
              missingInformation: [],
              permittedActions: ['record_informational_only'],
              forbiddenActions: ['reopen_a_terminal_invoice', 'despatch_a_duplicate_settlement_effect'],
              selectedAction: 'record_informational_only',
              applicablePolicy: ['A stale or duplicate payment event cannot corrupt an invoice that already reached a terminal state.'],
              authority: 0,
            }),
          ],
          effects: [],
          verifications: [],
        },
      ],
    };
  }

  const existing = readInvoice(state.facts);
  const updated: Record<string, string> = existing !== null ? writeInvoice({ ...existing, balance: newBalance }) : {};

  if (newBalance > 0) {
    return {
      steps: [
        {
          id: id('partial'),
          label: 'Partial payment recorded',
          atOffsetSeconds: 0,
          summary: `Partial payment of $${amountPaid.toLocaleString()} recorded for invoice ${invoiceId}. $${newBalance.toLocaleString()} remains outstanding; the cadence continues.`,
          decisions: [
            decision({
              id: id('d-partial'),
              eventId: event.eventId,
              mechanism: 'DETERMINISTIC_RULE',
              objective: 'Record a partial settlement without treating it as full payment.',
              relevantState: state.lifecycleState,
              evidenceRefs: [`event.payload.newBalance=${newBalance}`],
              deterministicFacts: [
                { label: 'Amount paid', value: String(amountPaid) },
                { label: 'Remaining balance', value: String(newBalance) },
              ],
              missingInformation: [],
              permittedActions: ['record_partial_settlement'],
              forbiddenActions: ['treat_partial_payment_as_full_settlement', 'halt_cadence_on_partial_payment'],
              selectedAction: 'record_partial_settlement',
              applicablePolicy: ['Only a balance the accounting system reports as fully settled halts the cadence.'],
              authority: 3,
            }),
          ],
          effects: [],
          verifications: [],
          statePatch: { facts: updated },
        },
      ],
    };
  }

  // Full settlement, from any non-terminal state — canon declares a PAID edge from all of them.
  return {
    steps: [
      {
        id: id('paid'),
        label: 'Payment recorded',
        atOffsetSeconds: 0,
        transitionTo: 'PAID',
        summary: `The accounting system reports invoice ${invoiceId} fully settled ($${amountPaid.toLocaleString()} recorded). Every automated action halts.`,
        decisions: [
          decision({
            id: id('d-paid'),
            eventId: event.eventId,
            mechanism: 'DETERMINISTIC_RULE',
            objective: 'Confirm full settlement from the accounting system and halt every automated action.',
            relevantState: state.lifecycleState,
            evidenceRefs: [`event.payload.newBalance=${newBalance}`],
            deterministicFacts: [{ label: 'Amount paid', value: String(amountPaid) }],
            missingInformation: [],
            permittedActions: ['transition_to_paid'],
            forbiddenActions: ['continue_cadence_after_settlement', 'infer_settlement_from_a_customer_claim'],
            selectedAction: 'transition_to_paid',
            applicablePolicy: ['LAB_TARGET rr-lab-financial-authority: only the accounting system authorises a PAID transition.'],
            authority: 3,
          }),
        ],
        effects: [],
        verifications: [],
        statePatch: { facts: updated },
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// human.decision.recorded
// ---------------------------------------------------------------------------

function handleHumanDecision(ctx: HandlerContext): HandlerOutcome {
  const { event, state, profile } = ctx;
  const id = (suffix: string) => `${event.eventId}:${suffix}`;
  const parsed = HumanDecisionPayloadSchema.safeParse(event.payload);

  if (!parsed.success) {
    return {
      steps: [
        {
          id: id('validate-fail'),
          label: 'Human decision',
          atOffsetSeconds: 0,
          summary: 'Human decision payload failed validation. No state change.',
          decisions: [
            decision({
              id: id('d-validate-fail'),
              eventId: event.eventId,
              mechanism: 'DETERMINISTIC_RULE',
              objective: 'Validate a recorded human decision before applying it.',
              relevantState: state.lifecycleState,
              evidenceRefs: ['event.payload'],
              deterministicFacts: [{ label: 'Validation errors', value: parsed.error.issues.map((i) => i.message).join('; ') }],
              missingInformation: [],
              permittedActions: ['reject_decision'],
              forbiddenActions: ['apply_unvalidated_decision'],
              selectedAction: 'reject_decision',
              applicablePolicy: ['A decision is applied only when its record is complete.'],
              authority: 0,
            }),
          ],
          effects: [],
          verifications: [],
        },
      ],
    };
  }

  const humanDecision = parsed.data;
  const actor = profile.roles.find((r) => r.id === humanDecision.decidedBy);

  if (state.lifecycleState !== 'DISPUTED') {
    return {
      steps: [
        {
          id: id('not-disputed'),
          label: 'Human decision',
          atOffsetSeconds: 0,
          summary: `No dispute is open on this invoice (currently ${state.lifecycleState}). Nothing to resolve.`,
          decisions: [
            decision({
              id: id('d-not-disputed'),
              eventId: event.eventId,
              mechanism: 'DETERMINISTIC_RULE',
              objective: 'Refuse to resolve a dispute that is not currently open.',
              relevantState: state.lifecycleState,
              evidenceRefs: [`state.lifecycleState=${state.lifecycleState}`],
              deterministicFacts: [],
              missingInformation: [],
              permittedActions: ['reject_decision'],
              forbiddenActions: ['resolve_a_dispute_that_is_not_open'],
              selectedAction: 'reject_decision',
              applicablePolicy: ['A dispute resolution is applied only while a dispute is genuinely open.'],
              authority: 0,
            }),
          ],
          effects: [],
          verifications: [],
        },
      ],
    };
  }

  return {
    steps: [
      {
        id: id('resolved'),
        label: 'Human decision',
        atOffsetSeconds: 0,
        transitionTo: 'PAST_DUE_31_60',
        summary: `${actor?.name ?? humanDecision.decidedBy} resolved the dispute: invoice stands as issued. Returns to the ageing ladder.`,
        decisions: [
          decision({
            id: id('d-resolved'),
            eventId: event.eventId,
            mechanism: 'HUMAN_DECISION',
            objective: 'Record and apply a person’s resolution of an open dispute.',
            relevantState: 'DISPUTED',
            evidenceRefs: ['event.payload.rationale'],
            deterministicFacts: [
              { label: 'Decided by', value: actor?.name ?? humanDecision.decidedBy },
              { label: 'Authority ceiling of this role', value: String(actor?.authorityCeiling ?? 'unknown') },
              { label: 'Rationale', value: humanDecision.rationale },
            ],
            missingInformation: [],
            permittedActions: ['resolve_dispute'],
            forbiddenActions: ['automate_this_decision'],
            selectedAction: 'resolve_dispute',
            applicablePolicy: ['Resolving a dispute is a human-only action.'],
            authority: 2,
          }),
        ],
        effects: [],
        verifications: [
          {
            id: id('v-authority'),
            eventId: event.eventId,
            check: 'Confirm the deciding role holds sufficient authority to resolve a dispute.',
            result: (actor?.authorityCeiling ?? 0) >= 2 ? 'PASS' : 'FAIL',
            detail:
              (actor?.authorityCeiling ?? 0) >= 2
                ? `${actor?.name ?? 'Role'} holds authority level ${actor?.authorityCeiling}, which permits this decision.`
                : `${actor?.name ?? humanDecision.decidedBy} does not hold sufficient authority.`,
          },
        ],
      },
    ],
  };
}

export const RECEIVABLES_RECOVERY_HANDLERS: SystemHandlers = {
  systemId: 'receivables-recovery',
  initialState: 'CURRENT',
  handlers: {
    'receivables.aging.evaluated': handleAgingEvaluation,
    'receivables.customer.replied': handleCustomerReplied,
    'receivables.payment.recorded': handlePaymentRecorded,
    'human.decision.recorded': handleHumanDecision,
  },
};

export { readPromise };
