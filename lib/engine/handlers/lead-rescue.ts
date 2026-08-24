import { z } from 'zod';
import { numberParam } from '@/lib/model/profile';
import type { DecisionRecord } from '@/lib/model/runtime';
import type { HandlerContext, HandlerOutcome, HandlerStep, ProposedEffect, SystemHandlers } from '../types';

/**
 * LEAD RESCUE — operating logic.
 *
 * Everything in this file that is labelled DETERMINISTIC_RULE genuinely computes.
 * Validation, identity resolution, consent screening, the confidence-floor comparison,
 * missing-field computation, and disposition mapping all run here from state, event,
 * and policy. None of it is narrated.
 *
 * The only thing that arrives pre-authored is the BOUNDED_AI_JUDGMENT: interpretation
 * of free text, which comes through the DecisionProvider port. Its output is then
 * subjected to deterministic policy — the floor comparison and the required-field
 * intersection — which is the whole point of the pattern:
 *
 *     LANGUAGE INPUT -> STRUCTURED OUTPUT -> DETERMINISTIC POLICY
 *
 * Transition legality, idempotency, and the authority gate are NOT implemented here.
 * They live in the engine core so this handler cannot bypass them.
 */

// ---------------------------------------------------------------------------
// Payload contracts
// ---------------------------------------------------------------------------

/**
 * PERMITTED and SUPPRESSED are the hard cases: nothing to decide, act accordingly.
 * RESTRICTED_PENDING_REVIEW is the interesting third state — the resolved entity carries
 * prior consent-withdrawal on file, but this is a NEW, separately-initiated inquiry, and
 * whether the withdrawal should extend to it is genuinely a judgement call. Classification
 * still runs (the case in `handleEnquiry` cares what the enquiry says), but no candidate
 * action may execute autonomously — see the policy-evaluation step below.
 */
const ConsentState = z.enum(['PERMITTED', 'SUPPRESSED', 'RESTRICTED_PENDING_REVIEW']);

const EnquiryPayloadSchema = z.object({
  contactName: z.string().optional(),
  contactEmail: z.string().optional(),
  company: z.string().optional(),
  message: z.string().min(1),
  channel: z.string().min(1),
  consentState: ConsentState,
  /** Set by identity resolution upstream when this maps to an entity already managed. */
  duplicateOfEntityId: z.string().optional(),
  /** Facts this enquiry type needs before it can be routed. Deterministic policy, not model output. */
  requiredFields: z.array(z.string()),
});

const ReplyPayloadSchema = z.object({
  message: z.string().min(1),
  /** Required fields this reply supplies, as determined by the bounded judgment. */
  resolvesFields: z.array(z.string()).default([]),
});

const HumanDecisionPayloadSchema = z.object({
  decidedBy: z.string().min(1),
  decision: z.enum(['CLEARED_TO_PROCEED', 'CLOSED_BAD_FIT', 'SUPPRESS', 'ESCALATE', 'BOOKED']),
  rationale: z.string().min(1),
});

/**
 * `lead.offer.despatched` — the ONLY event that may write `offerSentAt`. Deliberately
 * separate from `HumanDecisionPayloadSchema`/`human.decision.recorded`: a decision like
 * CLEARED_TO_PROCEED picks a lifecycle DISPOSITION (which state the case moves to); despatching
 * an offer does not move the case anywhere (it stays in BOOKING_READY) and instead records
 * that a prospect-facing message was authorized and sent. Folding the two into one event/
 * decision-kind risked exactly the conflation this whole correction exists to remove: a
 * generic "decision" mapped through `humanTarget()` could reach BOOKING_READY from ANY
 * originating state a declared transition permits, which is correct for clearing a case but
 * would be wrong for "the offer was sent" — that claim is meaningless unless the case was
 * ALREADY ready. `target` is the prospect's own contact reference, never the named owner —
 * `handleOfferDespatched` has no other way to know who receives the offer, since contact
 * details are not carried in `EngineState.facts`.
 */
const OfferDespatchPayloadSchema = z.object({
  decidedBy: z.string().min(1),
  target: z.string().min(1),
  offerSummary: z.string().min(1),
});

export const ENQUIRY_CLASSES = [
  'QUALIFIED_ENQUIRY',
  'NEEDS_MORE_INFORMATION',
  'OUT_OF_SEGMENT',
  'NOT_AN_ENQUIRY',
  'POLICY_SENSITIVE',
] as const;

export const REPLY_CLASSES = [
  'SUPPLIES_INFORMATION',
  'OPT_OUT',
  'OFF_SCRIPT_OR_RISK',
  'OUT_OF_SEGMENT',
] as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function decision(partial: Omit<DecisionRecord, 'eventId'> & { eventId: string }): DecisionRecord {
  return partial;
}

function recordWrite(
  entityId: string,
  eventId: string,
  suffix: string,
  description: string,
): ProposedEffect {
  return {
    id: `${eventId}:effect:${suffix}`,
    kind: 'RECORD_WRITE',
    description,
    target: 'Customer system of record',
    idempotencyKey: `record:${entityId}:${suffix}`,
    authority: 3,
    policyPermits: true,
    verification: {
      check: 'Read the record back and confirm the written lifecycle state matches engine state.',
      expect: 'Record state matches engine state.',
    },
  };
}

// ---------------------------------------------------------------------------
// inbound.enquiry.received
// ---------------------------------------------------------------------------

function handleEnquiry(ctx: HandlerContext): HandlerOutcome {
  const { event, state, profile, judgments, isDuplicateEvent } = ctx;
  const steps: HandlerStep[] = [];
  const id = (suffix: string) => `${event.eventId}:${suffix}`;

  // --- Step 1: schema and required-field validation (DETERMINISTIC) -------
  const parsed = EnquiryPayloadSchema.safeParse(event.payload);

  if (!parsed.success) {
    steps.push({
      id: id('validate'),
      label: 'Validation',
      atOffsetSeconds: 0,
      transitionTo: 'FAILED_RECOVERABLE',
      summary: 'Payload failed schema validation. Raw payload retained for retry.',
      decisions: [
        decision({
          id: id('d-validate'),
          eventId: event.eventId,
          mechanism: 'DETERMINISTIC_RULE',
          objective: 'Confirm the inbound payload conforms to the declared schema before anything acts on it.',
          relevantState: state.lifecycleState,
          evidenceRefs: [`event.payload`, `event.schemaVersion=${event.schemaVersion}`],
          deterministicFacts: [
            { label: 'Schema version', value: event.schemaVersion },
            { label: 'Validation errors', value: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') },
          ],
          missingInformation: parsed.error.issues.map((i) => i.path.join('.')).filter((p) => p.length > 0),
          permittedActions: ['retain_raw_payload', 'enter_failed_recoverable'],
          forbiddenActions: ['infer_missing_fields', 'discard_event'],
          selectedAction: 'enter_failed_recoverable',
          applicablePolicy: ['A malformed payload is retained and retried, never dropped.'],
          escalationReason: 'Payload could not be validated against the declared schema.',
          authority: 0,
        }),
      ],
      effects: [],
      verifications: [],
    });
    return { steps };
  }

  const enquiry = parsed.data;
  const entityId = event.entityId;

  steps.push({
    id: id('validate'),
    label: 'Validation',
    atOffsetSeconds: 0,
    summary: 'Required fields present and payload conforms to the declared schema.',
    decisions: [
      decision({
        id: id('d-validate'),
        eventId: event.eventId,
        mechanism: 'DETERMINISTIC_RULE',
        objective: 'Confirm the inbound payload conforms to the declared schema before anything acts on it.',
        relevantState: state.lifecycleState,
        evidenceRefs: ['event.payload.message', 'event.payload.channel', 'event.payload.consentState'],
        deterministicFacts: [
          { label: 'Schema version', value: event.schemaVersion },
          { label: 'Channel', value: enquiry.channel },
          { label: 'Required fields for this enquiry type', value: enquiry.requiredFields.join(', ') },
        ],
        missingInformation: [],
        permittedActions: ['normalise'],
        forbiddenActions: ['act_before_validation'],
        selectedAction: 'normalise',
        applicablePolicy: ['Validate at the boundary before any downstream step reads the payload.'],
        authority: 3,
      }),
    ],
    effects: [],
    verifications: [],
  });

  // --- Step 2: normalisation (DETERMINISTIC) ------------------------------
  steps.push({
    id: id('normalise'),
    label: 'Normalisation',
    atOffsetSeconds: 1,
    transitionTo: 'NORMALIZED',
    summary: 'Contact identity, channel, and timestamps mapped to canonical fields.',
    statePatch: {
      facts: {
        channel: enquiry.channel,
        ...(enquiry.company === undefined ? {} : { company: enquiry.company }),
        ...(enquiry.contactName === undefined ? {} : { contactName: enquiry.contactName }),
      },
    },
    decisions: [
      decision({
        id: id('d-normalise'),
        eventId: event.eventId,
        mechanism: 'DETERMINISTIC_RULE',
        objective: 'Map channel-specific input onto canonical entity fields.',
        relevantState: 'NEW',
        evidenceRefs: ['event.payload.contactEmail', 'event.payload.company', 'event.occurredAt'],
        deterministicFacts: [
          { label: 'Occurred at', value: event.occurredAt },
          { label: 'Received at', value: event.receivedAt },
          { label: 'Source event id', value: event.sourceEventId },
        ],
        missingInformation: [],
        permittedActions: ['write_normalised_record'],
        forbiddenActions: ['enrich_from_external_source'],
        selectedAction: 'write_normalised_record',
        applicablePolicy: ['Normalisation maps; it does not enrich or infer.'],
        authority: 3,
      }),
    ],
    effects: [recordWrite(entityId, event.eventId, 'normalise', 'Write the normalised lead record.')],
    verifications: [],
  });

  // --- Step 3: duplicate detection (DETERMINISTIC) ------------------------
  // Two distinct questions: was this EVENT seen before, and does this record refer to
  // an entity already under management? They have different consequences.
  const duplicateFacts = [
    { label: 'Source event identity', value: `${event.source}:${event.sourceEventId}` },
    { label: 'Event already observed', value: isDuplicateEvent ? 'yes' : 'no' },
    {
      label: 'Matches managed entity',
      value: enquiry.duplicateOfEntityId ?? 'no match',
    },
  ];

  if (enquiry.duplicateOfEntityId !== undefined) {
    steps.push({
      id: id('dedupe'),
      label: 'Duplicate check',
      atOffsetSeconds: 2,
      transitionTo: 'DUPLICATE',
      summary: `Record resolves to entity ${enquiry.duplicateOfEntityId}, already under management. Merged rather than worked twice.`,
      decisions: [
        decision({
          id: id('d-dedupe'),
          eventId: event.eventId,
          mechanism: 'DETERMINISTIC_RULE',
          objective: 'Determine whether this enquiry refers to an entity already under active management.',
          relevantState: 'NORMALIZED',
          evidenceRefs: ['event.payload.contactEmail', 'event.payload.company'],
          deterministicFacts: duplicateFacts,
          missingInformation: [],
          permittedActions: ['merge_into_existing_entity'],
          forbiddenActions: ['create_second_record', 'contact_separately'],
          selectedAction: 'merge_into_existing_entity',
          applicablePolicy: ['A second enquiry from a managed entity joins the existing conversation.'],
          authority: 3,
        }),
      ],
      effects: [],
      verifications: [],
    });
    return { steps };
  }

  steps.push({
    id: id('dedupe'),
    label: 'Duplicate check',
    atOffsetSeconds: 2,
    summary: isDuplicateEvent
      ? 'This exact source event was already observed. Processing continues, but every external action will be refused by the ledger.'
      : 'No prior delivery of this source event, and no match against a managed entity.',
    decisions: [
      decision({
        id: id('d-dedupe'),
        eventId: event.eventId,
        mechanism: 'DETERMINISTIC_RULE',
        objective: 'Determine whether this event, or this entity, has been seen before.',
        relevantState: 'NORMALIZED',
        evidenceRefs: [`event.source=${event.source}`, `event.sourceEventId=${event.sourceEventId}`],
        deterministicFacts: duplicateFacts,
        missingInformation: [],
        permittedActions: isDuplicateEvent ? ['continue_without_external_action'] : ['continue'],
        forbiddenActions: ['repeat_external_action'],
        selectedAction: isDuplicateEvent ? 'continue_without_external_action' : 'continue',
        applicablePolicy: [
          'Event delivery is at-least-once. External actions are keyed and claimed, so a replay cannot repeat them.',
        ],
        authority: 3,
      }),
    ],
    effects: [],
    verifications: [],
  });

  // --- Step 4: consent screen (DETERMINISTIC, before commercial intent) ----
  if (enquiry.consentState === 'SUPPRESSED') {
    steps.push({
      id: id('consent'),
      label: 'Consent screen',
      atOffsetSeconds: 3,
      transitionTo: 'DO_NOT_CONTACT',
      summary: 'Suppression state present. Commercial intent does not override it.',
      statePatch: { suppressed: true },
      decisions: [
        decision({
          id: id('d-consent'),
          eventId: event.eventId,
          mechanism: 'DETERMINISTIC_RULE',
          objective: 'Establish whether contact is permitted, before evaluating whether it is commercially desirable.',
          relevantState: 'NORMALIZED',
          evidenceRefs: ['event.payload.consentState'],
          deterministicFacts: [{ label: 'Consent state', value: enquiry.consentState }],
          missingInformation: [],
          permittedActions: ['suppress'],
          forbiddenActions: ['acknowledge', 'notify_owner', 'any_outbound_contact'],
          selectedAction: 'suppress',
          applicablePolicy: [
            'Suppression is evaluated before commercial intent, never after.',
            'Overriding suppression is a human-only action.',
          ],
          authority: 3,
        }),
      ],
      effects: [],
      verifications: [],
    });
    return { steps };
  }

  const restrictedReview = enquiry.consentState === 'RESTRICTED_PENDING_REVIEW';

  steps.push({
    id: id('consent'),
    label: 'Consent screen',
    atOffsetSeconds: 3,
    summary: restrictedReview
      ? 'Restricted consent state on file for this contact. Classification will still run, but no candidate action may execute without human determination.'
      : 'Contact permitted. No suppression or opt-out state on the resolved entity.',
    decisions: [
      decision({
        id: id('d-consent'),
        eventId: event.eventId,
        mechanism: 'DETERMINISTIC_RULE',
        objective: 'Establish whether contact is permitted, before evaluating whether it is commercially desirable.',
        relevantState: 'NORMALIZED',
        evidenceRefs: ['event.payload.consentState'],
        deterministicFacts: [{ label: 'Consent state', value: enquiry.consentState }],
        missingInformation: [],
        permittedActions: restrictedReview ? ['classify_but_hold_any_action'] : ['classify'],
        forbiddenActions: restrictedReview
          ? ['contact_before_consent_check', 'act_on_restricted_contact_without_review']
          : ['contact_before_consent_check'],
        selectedAction: restrictedReview ? 'classify_but_hold_any_action' : 'classify',
        applicablePolicy: [
          'Suppression is evaluated before commercial intent, never after.',
          ...(restrictedReview
            ? ['CLIENT_POLICY kestrel-restricted-contact-review: classification is permitted; autonomous action is not.']
            : []),
        ],
        authority: 3,
      }),
    ],
    effects: [],
    verifications: [],
  });

  // --- Step 5: bounded judgment + deterministic floor ---------------------
  const judgmentId = readJudgmentId(event.payload);
  const resolved = judgmentId === null ? undefined : judgments.get(judgmentId);
  const floor = numberParam(profile, 'confidenceFloor');

  if (resolved === undefined || resolved.status !== 'OK') {
    const reason =
      resolved === undefined
        ? 'No bounded judgment was resolved for this event.'
        : resolved.reason;
    steps.push({
      id: id('classify'),
      label: 'Bounded interpretation',
      atOffsetSeconds: 5,
      transitionTo: 'NEEDS_HUMAN',
      summary: 'The bounded judgment was unavailable or violated its output contract. Routed to a person.',
      // reviewStartedAt is the event's own occurredAt, never a clock read — the anchor a
      // later attention-timeout check compares itself against. See handleReviewAttentionTimeout.
      statePatch: { awaitingHuman: 'Interpretation unavailable', facts: { reviewStartedAt: event.occurredAt } },
      decisions: [
        decision({
          id: id('d-classify'),
          eventId: event.eventId,
          mechanism: 'DETERMINISTIC_RULE',
          objective: 'Decide what to do when interpretation of the free text is not available.',
          relevantState: 'NORMALIZED',
          evidenceRefs: ['decision_provider.result'],
          deterministicFacts: [
            { label: 'Provider outcome', value: resolved?.status ?? 'MISSING' },
            { label: 'Reason', value: reason },
          ],
          missingInformation: ['enquiry classification'],
          permittedActions: ['route_to_human'],
          forbiddenActions: ['guess_classification', 'coerce_to_nearest_permitted_value', 'acknowledge_with_assumed_intent'],
          selectedAction: 'route_to_human',
          applicablePolicy: ['An unavailable or contract-violating judgment routes to a person; it is never coerced into a usable value.'],
          escalationReason: reason,
          authority: 2,
        }),
      ],
      effects: [],
      verifications: [],
    });
    return { steps };
  }

  const judgment = resolved.result;
  const meetsFloor = judgment.confidence >= floor;

  steps.push({
    id: id('classify'),
    label: 'Bounded interpretation',
    atOffsetSeconds: 5,
    // Only a classification that clears the floor may enter CLASSIFIED. Below the
    // floor the state stays NORMALIZED and the next step routes to a person, which is
    // what the declared transitions lr-t05 and lr-t06 encode.
    ...(meetsFloor ? { transitionTo: 'CLASSIFIED' } : {}),
    summary: `Classified as ${judgment.classification} at confidence ${judgment.confidence.toFixed(2)}.`,
    decisions: [
      decision({
        id: id('d-classify'),
        eventId: event.eventId,
        mechanism: 'BOUNDED_AI_JUDGMENT',
        objective: 'Interpret ambiguous free text into a classification drawn from a closed permitted set.',
        relevantState: 'NORMALIZED',
        evidenceRefs: judgment.evidenceRefs,
        deterministicFacts: [
          { label: 'Permitted classes', value: ENQUIRY_CLASSES.join(', ') },
          { label: 'Returned class', value: judgment.classification },
        ],
        classification: judgment.classification,
        confidence: judgment.confidence,
        missingInformation: judgment.missingInformation,
        permittedActions: ['return_classification_within_permitted_set'],
        forbiddenActions: [
          'assert_facts_not_present_in_input',
          'select_action',
          'send_message',
          'raise_own_authority',
        ],
        selectedAction: 'return_classification',
        applicablePolicy: ['Bounded judgment interprets; it does not decide or act.'],
        evaluatorResult: `Declined to infer: ${judgment.declinedToInfer.length > 0 ? judgment.declinedToInfer.join('; ') : 'nothing'}`,
        authority: 1,
        providerId: 'fixture-decision-provider',
      }),
    ],
    effects: [],
    verifications: [],
  });

  if (!meetsFloor) {
    steps.push({
      id: id('floor'),
      label: 'Confidence floor',
      atOffsetSeconds: 6,
      transitionTo: 'NEEDS_HUMAN',
      summary: `Confidence ${judgment.confidence.toFixed(2)} is below the configured floor of ${floor.toFixed(2)}. Routed to a person without acting.`,
      statePatch: {
        awaitingHuman: 'Low-confidence classification',
        missingInformation: judgment.missingInformation,
        facts: { reviewStartedAt: event.occurredAt },
      },
      decisions: [
        decision({
          id: id('d-floor'),
          eventId: event.eventId,
          mechanism: 'DETERMINISTIC_RULE',
          objective: 'Compare returned confidence against the configured floor, outside the judgment itself.',
          relevantState: 'NORMALIZED',
          evidenceRefs: ['judgment.confidence'],
          deterministicFacts: [
            { label: 'Returned confidence', value: judgment.confidence.toFixed(2) },
            { label: 'Configured floor', value: floor.toFixed(2) },
            { label: 'Floor source', value: 'Client policy, not a universal threshold' },
          ],
          missingInformation: judgment.missingInformation,
          permittedActions: ['route_to_human'],
          forbiddenActions: ['acknowledge', 'classify_anyway', 'lower_the_floor'],
          selectedAction: 'route_to_human',
          applicablePolicy: ['Classification below the confidence floor is routed to human review and never acted on.'],
          escalationReason: `Confidence ${judgment.confidence.toFixed(2)} below floor ${floor.toFixed(2)}.`,
          authority: 2,
        }),
      ],
      effects: [],
      verifications: [],
    });
    return { steps };
  }

  // --- Step 6: missing-field computation (DETERMINISTIC over AI output) ----
  const missing = enquiry.requiredFields.filter((field) =>
    judgment.missingInformation.includes(field),
  );

  steps.push({
    id: id('completeness'),
    label: 'Completeness check',
    atOffsetSeconds: 7,
    summary:
      missing.length === 0
        ? 'Every required routing field is present.'
        : `${missing.length} required field(s) absent: ${missing.join(', ')}.`,
    statePatch: { missingInformation: missing },
    decisions: [
      decision({
        id: id('d-completeness'),
        eventId: event.eventId,
        mechanism: 'DETERMINISTIC_RULE',
        objective: 'Compute the minimum set of required facts the enquiry did not establish.',
        relevantState: 'CLASSIFIED',
        evidenceRefs: ['judgment.missingInformation', 'event.payload.requiredFields'],
        deterministicFacts: [
          { label: 'Required by policy', value: enquiry.requiredFields.join(', ') },
          { label: 'Reported absent by judgment', value: judgment.missingInformation.join(', ') || 'none' },
          { label: 'Intersection (must be asked)', value: missing.join(', ') || 'none' },
        ],
        missingInformation: missing,
        permittedActions: ['ask_minimum_missing_set'],
        forbiddenActions: ['ask_for_known_fields', 'infer_missing_values', 'default_missing_values'],
        selectedAction: missing.length === 0 ? 'proceed' : 'ask_minimum_missing_set',
        applicablePolicy: [
          'Ask only for what is genuinely missing.',
          'Facts the input did not establish are carried as missing, never filled in.',
        ],
        authority: 3,
      }),
    ],
    effects: [],
    verifications: [],
  });

  // --- Step 6b: policy evaluation for a restricted contact -----------------
  // The candidate action is computed exactly as it would be for a permitted contact, then
  // blocked at the policy gate rather than despatched. High classification confidence does
  // not shortcut this — the gate does not consult confidence at all.
  if (restrictedReview) {
    const wouldBe = dispositionFor(judgment.classification, missing.length > 0);
    const candidateAction =
      wouldBe.state === 'NEEDS_INFORMATION'
        ? 'send acknowledgement, ask for missing information'
        : 'send acknowledgement, route to owner';

    steps.push({
      id: id('policy-review'),
      label: 'Policy evaluation',
      atOffsetSeconds: 9,
      transitionTo: 'SUPPRESSION_REVIEW',
      summary: `Candidate action (${candidateAction}) blocked pending human determination of whether this contact may be answered.`,
      statePatch: {
        awaitingHuman: 'Restricted contact — human determination required before any outbound contact',
        facts: { reviewStartedAt: event.occurredAt },
      },
      decisions: [
        decision({
          id: id('d-policy-review'),
          eventId: event.eventId,
          mechanism: 'DETERMINISTIC_RULE',
          objective:
            'Evaluate whether the candidate action may proceed, given the restricted consent state loaded during the consent screen step.',
          relevantState: 'CLASSIFIED',
          evidenceRefs: ['event.payload.consentState', 'judgment.classification'],
          deterministicFacts: [
            { label: 'Candidate action', value: candidateAction },
            { label: 'Classification', value: judgment.classification },
            { label: 'Classification confidence', value: judgment.confidence.toFixed(2) },
            { label: 'Consent state', value: 'RESTRICTED_PENDING_REVIEW' },
          ],
          missingInformation: missing,
          permittedActions: ['hold_for_human_review'],
          forbiddenActions: [
            'send_acknowledgement',
            'notify_owner',
            'ask_question',
            'act_on_classification_confidence_alone',
          ],
          selectedAction: 'hold_for_human_review',
          applicablePolicy: [
            'CLIENT_POLICY kestrel-restricted-contact-review: a new inbound inquiry from a restricted contact is never acted on autonomously, regardless of classification or confidence.',
          ],
          escalationReason:
            'Authoritative consent state is RESTRICTED_PENDING_REVIEW. A person must determine whether this specific inquiry may be answered before any outbound contact is made.',
          authority: 2,
        }),
      ],
      effects: [
        {
          id: id('effect:ack-candidate'),
          kind: 'MESSAGE_SEND',
          description: 'Acknowledgement that would ordinarily despatch for this enquiry.',
          target: enquiry.contactEmail ?? 'enquirer',
          idempotencyKey: `ack:${entityId}`,
          authority: 3,
          policyPermits: false,
          policyReason:
            'CLIENT_POLICY kestrel-restricted-contact-review: outbound contact to a restricted contact requires human determination before despatch.',
        },
      ],
      verifications: [],
    });
    return { steps };
  }

  // --- Step 7: disposition (DETERMINISTIC mapping of class to lifecycle) ---
  const target = dispositionFor(judgment.classification, missing.length > 0);

  steps.push({
    id: id('disposition'),
    label: 'Disposition',
    atOffsetSeconds: 8,
    transitionTo: target.state,
    summary: target.summary,
    ...(target.state === 'NEEDS_HUMAN'
      ? {
          // reviewStartedAt: same anchor discipline as every other NEEDS_HUMAN entry point
          // in this file — see handleReviewAttentionTimeout.
          statePatch: { awaitingHuman: target.summary, facts: { reviewStartedAt: event.occurredAt } },
        }
      : target.state === 'BOOKING_READY'
        // bookingReadyAt is the event's own occurredAt, never a clock read. It records only
        // that the case became ready for a next commercial step — NOT that an offer reached
        // the prospect. The NOTIFICATION effect this same disposition proposes below is
        // addressed to the named owner, never the prospect, and is not offer evidence either.
        // lr-t22's clock is governed by a separate fact, offerSentAt, written only by
        // handleOfferDespatched once a person explicitly despatches a real offer — see there,
        // and see handleOfferWaitReevaluation below for why the two must never be conflated.
        ? { statePatch: { facts: { bookingReadyAt: event.occurredAt } } }
        : {}),
    decisions: [
      decision({
        id: id('d-disposition'),
        eventId: event.eventId,
        mechanism: 'DETERMINISTIC_RULE',
        objective: 'Map the classification and completeness result onto a lifecycle disposition.',
        relevantState: 'CLASSIFIED',
        evidenceRefs: ['judgment.classification', 'state.missingInformation'],
        deterministicFacts: [
          { label: 'Classification', value: judgment.classification },
          { label: 'Missing required fields', value: String(missing.length) },
          { label: 'Mapped disposition', value: target.state },
        ],
        missingInformation: missing,
        permittedActions: ['apply_declared_disposition'],
        forbiddenActions: ['choose_disposition_outside_declared_map'],
        selectedAction: `transition_to_${target.state}`,
        applicablePolicy: ['Disposition follows a declared map from classification to lifecycle state.'],
        ...(target.state === 'NEEDS_HUMAN' ? { escalationReason: target.summary } : {}),
        authority: target.state === 'NEEDS_HUMAN' ? 2 : 3,
      }),
    ],
    effects: [],
    verifications: [],
  });

  if (target.state === 'CLOSED_SPAM' || target.state === 'NEEDS_HUMAN') {
    return { steps };
  }

  // --- Step 8: acknowledgement (external action, keyed) -------------------
  // Most enquiries take the always-succeeds path. A scenario that needs to demonstrate
  // an uncertain provider outcome declares a `sendAttempts[0]` entry, which routes this
  // effect through the execution ledger instead — see `lr-fm-downstream-api`.
  const ackAttempt = readSendAttempt(event.payload);

  steps.push({
    id: id('acknowledge'),
    label: 'Acknowledgement',
    atOffsetSeconds: 9,
    summary: isDuplicateEvent
      ? 'Acknowledgement attempted and refused by the idempotency ledger. Nothing was sent.'
      : ackAttempt !== null
        ? 'Acknowledgement attempted through the execution-tracked send path.'
        : 'Acknowledgement despatched.',
    decisions: [
      decision({
        id: id('d-acknowledge'),
        eventId: event.eventId,
        mechanism: 'DETERMINISTIC_RULE',
        objective: 'Send a contextual acknowledgement within the configured target.',
        relevantState: target.state,
        evidenceRefs: ['policy.acknowledgementTargetSeconds'],
        deterministicFacts: [
          { label: 'Acknowledgement target', value: `${numberParam(profile, 'acknowledgementTargetSeconds')} seconds` },
          { label: 'Idempotency key', value: `ack:${entityId}` },
        ],
        missingInformation: missing,
        permittedActions: ['send_acknowledgement'],
        forbiddenActions: ['promise_outcome', 'quote_price', 'commit_to_timeline'],
        selectedAction: 'send_acknowledgement',
        applicablePolicy: [
          'Acknowledgement confirms receipt only. It makes no commitment.',
          'No communication may state or imply a guaranteed outcome.',
        ],
        authority: 3,
      }),
    ],
    effects: [
      {
        id: id('effect:ack'),
        kind: 'MESSAGE_SEND',
        description: 'Acknowledgement to the enquirer confirming receipt and naming the next step.',
        target: enquiry.contactEmail ?? 'enquirer',
        idempotencyKey: `ack:${entityId}`,
        authority: 3,
        policyPermits: true,
        ...(ackAttempt === null
          ? {
              verification: {
                check: 'Confirm exactly one acknowledgement exists for this entity.',
                expect: 'One acknowledgement recorded against the entity.',
              },
            }
          : {
              execution: {
                kind: 'SEND' as const,
                attemptId: ackAttempt.attemptId,
                provider: ackAttempt.provider,
                honorsIdempotencyKey: ackAttempt.honorsIdempotencyKey,
              },
            }),
      },
    ],
    verifications: [],
  });

  // --- Step 9: route or ask ----------------------------------------------
  if (target.state === 'NEEDS_INFORMATION') {
    steps.push({
      id: id('ask'),
      label: 'Missing-information question',
      atOffsetSeconds: 11,
      transitionTo: 'WAITING_FOR_REPLY',
      summary: `Asked for ${missing.length} missing field(s). Parked awaiting reply.`,
      // waitStartedAt is the event's own occurredAt, never a clock read. It is what a
      // later, genuinely separate `lead.wait.reevaluated` event compares itself against —
      // see handleWaitReevaluation below.
      statePatch: { facts: { waitStartedAt: event.occurredAt } },
      decisions: [
        decision({
          id: id('d-ask'),
          eventId: event.eventId,
          mechanism: 'DETERMINISTIC_RULE',
          objective: 'Ask for the minimum missing set and enter a bounded wait.',
          relevantState: 'NEEDS_INFORMATION',
          evidenceRefs: ['state.missingInformation'],
          deterministicFacts: [
            { label: 'Fields requested', value: missing.join(', ') },
            { label: 'Question budget', value: String(numberParam(profile, 'maxInformationQuestions')) },
          ],
          missingInformation: missing,
          permittedActions: ['ask_minimum_missing_set', 'enter_wait'],
          forbiddenActions: ['ask_everything', 'infer_answers'],
          selectedAction: 'ask_minimum_missing_set',
          applicablePolicy: ['Ask only for the minimum missing set, once, then wait.'],
          authority: 3,
        }),
      ],
      effects: [
        {
          id: id('effect:question'),
          kind: 'MESSAGE_SEND',
          description: `Question requesting: ${missing.join(', ')}.`,
          target: enquiry.contactEmail ?? 'enquirer',
          idempotencyKey: `question:${entityId}:1`,
          authority: 3,
          policyPermits: true,
          verification: {
            check: 'Confirm the question asks only for fields in the computed missing set.',
            expect: 'Question scope matches the missing set exactly.',
          },
        },
      ],
      verifications: [],
    });
    return { steps };
  }

  steps.push({
    id: id('route'),
    label: 'Owner routing',
    atOffsetSeconds: 11,
    summary: 'Named owner notified. This is the meaningful response, distinct from the acknowledgement.',
    decisions: [
      decision({
        id: id('d-route'),
        eventId: event.eventId,
        mechanism: 'DETERMINISTIC_RULE',
        objective: 'Route a complete, qualified enquiry to a named human owner.',
        relevantState: target.state,
        evidenceRefs: ['state.facts', 'judgment.classification'],
        deterministicFacts: [
          { label: 'Routing target', value: `${numberParam(profile, 'routingTargetMinutes')} minutes, business hours` },
          { label: 'Disposition', value: target.state },
        ],
        missingInformation: [],
        permittedActions: ['notify_owner'],
        forbiddenActions: ['negotiate', 'quote_price', 'book_without_owner'],
        selectedAction: 'notify_owner',
        applicablePolicy: ['A qualified enquiry reaches a named owner; the system does not sell on its behalf.'],
        authority: 3,
      }),
    ],
    effects: [
      {
        id: id('effect:notify'),
        kind: 'NOTIFICATION',
        description: 'Notify the named owner that a qualified enquiry is ready for a next step.',
        target: 'Named owner',
        idempotencyKey: `notify:${entityId}`,
        authority: 3,
        policyPermits: true,
        verification: {
          check: 'Confirm the notification reached a named owner rather than a shared queue.',
          expect: 'Notification addressed to a named owner.',
        },
      },
    ],
    verifications: [],
  });

  return { steps };
}

function dispositionFor(
  classification: string,
  hasMissing: boolean,
): { state: string; summary: string } {
  switch (classification) {
    case 'NOT_AN_ENQUIRY':
      return { state: 'CLOSED_SPAM', summary: 'Not a buying enquiry. Closed without contact.' };
    case 'OUT_OF_SEGMENT':
      return { state: 'CLOSED_BAD_FIT', summary: 'Genuine enquiry outside the served segment. Closed correctly.' };
    case 'POLICY_SENSITIVE':
      return {
        state: 'NEEDS_HUMAN',
        summary: 'Policy-sensitive content detected. Routed to a person rather than answered.',
      };
    case 'NEEDS_MORE_INFORMATION':
      return { state: 'NEEDS_INFORMATION', summary: 'Legitimate enquiry missing facts required to route it.' };
    case 'QUALIFIED_ENQUIRY':
      return hasMissing
        ? { state: 'NEEDS_INFORMATION', summary: 'Qualified, but required routing fields are absent.' }
        : { state: 'BOOKING_READY', summary: 'Qualified and complete. Ready for a next commercial step.' };
    default:
      return {
        state: 'NEEDS_HUMAN',
        summary: `Classification "${classification}" has no declared disposition. Routed to a person.`,
      };
  }
}

// ---------------------------------------------------------------------------
// prospect.replied
// ---------------------------------------------------------------------------

function handleReply(ctx: HandlerContext): HandlerOutcome {
  const { event, state, profile, judgments } = ctx;
  const steps: HandlerStep[] = [];
  const id = (suffix: string) => `${event.eventId}:${suffix}`;

  const parsed = ReplyPayloadSchema.safeParse(event.payload);
  if (!parsed.success) {
    return {
      steps: [
        {
          id: id('reply-invalid'),
          label: 'Reply validation',
          atOffsetSeconds: 0,
          transitionTo: 'NEEDS_HUMAN',
          summary: 'Reply payload failed validation. Routed to a person.',
          statePatch: { awaitingHuman: 'Unparseable reply' },
          decisions: [
            decision({
              id: id('d-reply-invalid'),
              eventId: event.eventId,
              mechanism: 'DETERMINISTIC_RULE',
              objective: 'Validate the reply payload before interpreting it.',
              relevantState: state.lifecycleState,
              evidenceRefs: ['event.payload'],
              deterministicFacts: [{ label: 'Validation errors', value: parsed.error.issues.map((i) => i.message).join('; ') }],
              missingInformation: [],
              permittedActions: ['route_to_human'],
              forbiddenActions: ['guess_reply_intent'],
              selectedAction: 'route_to_human',
              applicablePolicy: ['An unparseable reply reaches a person.'],
              escalationReason: 'Reply payload failed validation.',
              authority: 2,
            }),
          ],
          effects: [],
          verifications: [],
        },
      ],
    };
  }

  const reply = parsed.data;
  const judgmentId = readJudgmentId(event.payload);
  const resolved = judgmentId === null ? undefined : judgments.get(judgmentId);
  const floor = numberParam(profile, 'confidenceFloor');

  steps.push({
    id: id('reply-received'),
    label: 'Reply received',
    atOffsetSeconds: 0,
    transitionTo: 'REPLIED',
    summary: 'Reply correlated to the waiting conversation.',
    decisions: [
      decision({
        id: id('d-reply-received'),
        eventId: event.eventId,
        mechanism: 'DETERMINISTIC_RULE',
        objective: 'Correlate the inbound reply to the conversation that is waiting for it.',
        relevantState: state.lifecycleState,
        evidenceRefs: [`event.correlationId=${event.correlationId}`],
        deterministicFacts: [
          { label: 'Correlation id', value: event.correlationId },
          { label: 'Waiting since state', value: state.lifecycleState },
        ],
        missingInformation: [...state.missingInformation],
        permittedActions: ['interpret_reply'],
        forbiddenActions: ['act_before_interpretation'],
        selectedAction: 'interpret_reply',
        applicablePolicy: ['Replies are correlated by conversation, not matched by sender address alone.'],
        authority: 3,
      }),
    ],
    effects: [],
    verifications: [],
  });

  if (resolved === undefined || resolved.status !== 'OK' || resolved.result.confidence < floor) {
    const detail =
      resolved === undefined
        ? 'No judgment resolved'
        : resolved.status !== 'OK'
          ? resolved.reason
          : `Confidence ${resolved.result.confidence.toFixed(2)} below floor ${floor.toFixed(2)}`;

    steps.push({
      id: id('reply-interpret'),
      label: 'Reply interpretation',
      atOffsetSeconds: 2,
      transitionTo: 'NEEDS_HUMAN',
      summary: `Reply could not be safely interpreted. ${detail}. Routed to a person.`,
      statePatch: { awaitingHuman: 'Reply interpretation below confidence floor', facts: { reviewStartedAt: event.occurredAt } },
      decisions: [
        decision({
          id: id('d-reply-interpret'),
          eventId: event.eventId,
          mechanism: 'DETERMINISTIC_RULE',
          objective: 'Decide what to do when reply interpretation is unavailable or low confidence.',
          relevantState: 'REPLIED',
          evidenceRefs: ['decision_provider.result'],
          deterministicFacts: [
            { label: 'Outcome', value: resolved?.status ?? 'MISSING' },
            { label: 'Detail', value: detail },
          ],
          missingInformation: [...state.missingInformation],
          permittedActions: ['route_to_human'],
          forbiddenActions: ['send_templated_followup', 'assume_intent', 'close_case'],
          selectedAction: 'route_to_human',
          applicablePolicy: ['Reply interpretation may route to a person; it may not compose a commitment.'],
          escalationReason: detail,
          authority: 2,
        }),
      ],
      effects: [],
      verifications: [],
    });
    return { steps };
  }

  const judgment = resolved.result;

  steps.push({
    id: id('reply-interpret'),
    label: 'Reply interpretation',
    atOffsetSeconds: 2,
    summary: `Reply interpreted as ${judgment.classification} at confidence ${judgment.confidence.toFixed(2)}.`,
    decisions: [
      decision({
        id: id('d-reply-interpret'),
        eventId: event.eventId,
        mechanism: 'BOUNDED_AI_JUDGMENT',
        objective: 'Interpret the intent of a free-text reply.',
        relevantState: 'REPLIED',
        evidenceRefs: judgment.evidenceRefs,
        deterministicFacts: [
          { label: 'Permitted classes', value: REPLY_CLASSES.join(', ') },
          { label: 'Returned class', value: judgment.classification },
        ],
        classification: judgment.classification,
        confidence: judgment.confidence,
        missingInformation: judgment.missingInformation,
        permittedActions: ['return_classification_within_permitted_set'],
        forbiddenActions: ['send_message', 'make_commitment', 'override_suppression'],
        selectedAction: 'return_classification',
        applicablePolicy: ['Bounded judgment interprets; it does not decide or act.'],
        evaluatorResult: `Declined to infer: ${judgment.declinedToInfer.length > 0 ? judgment.declinedToInfer.join('; ') : 'nothing'}`,
        authority: 1,
        providerId: 'fixture-decision-provider',
      }),
    ],
    effects: [],
    verifications: [],
  });

  // Deterministic: what remains missing after this reply?
  const remaining = state.missingInformation.filter((f) => !reply.resolvesFields.includes(f));
  const outcome = replyDisposition(judgment.classification, remaining.length > 0);

  steps.push({
    id: id('reply-disposition'),
    label: 'State update',
    atOffsetSeconds: 4,
    transitionTo: outcome.state,
    summary: outcome.summary,
    statePatch: {
      missingInformation: remaining,
      ...(outcome.state === 'DO_NOT_CONTACT' ? { suppressed: true } : {}),
      ...(outcome.state === 'NEEDS_HUMAN' ? { awaitingHuman: outcome.summary } : {}),
      // Same bookingReadyAt fact the classification-time disposition step writes — this is
      // the OTHER legitimate path into BOOKING_READY (lr-t16, a reply that completes a
      // previously-incomplete enquiry), and needs the identical readiness evidence. It is
      // still only readiness evidence, not offer-sent evidence — see the comment on the
      // classification-time disposition step above.
      ...(outcome.state === 'BOOKING_READY' ? { facts: { bookingReadyAt: event.occurredAt } } : {}),
      // Same reviewStartedAt discipline as every other NEEDS_HUMAN entry point in this file.
      ...(outcome.state === 'NEEDS_HUMAN' ? { facts: { reviewStartedAt: event.occurredAt } } : {}),
    },
    decisions: [
      decision({
        id: id('d-reply-disposition'),
        eventId: event.eventId,
        mechanism: 'DETERMINISTIC_RULE',
        objective: 'Map the interpreted reply and remaining gaps onto a lifecycle disposition.',
        relevantState: 'REPLIED',
        evidenceRefs: ['judgment.classification', 'event.payload.resolvesFields'],
        deterministicFacts: [
          { label: 'Fields resolved by reply', value: reply.resolvesFields.join(', ') || 'none' },
          { label: 'Still missing', value: remaining.join(', ') || 'none' },
          { label: 'Mapped disposition', value: outcome.state },
        ],
        missingInformation: remaining,
        permittedActions: ['apply_declared_disposition'],
        forbiddenActions: ['mark_resolved_without_evidence'],
        selectedAction: `transition_to_${outcome.state}`,
        applicablePolicy: ['A field counts as resolved only when the reply actually supplied it.'],
        ...(outcome.state === 'NEEDS_HUMAN' ? { escalationReason: outcome.summary } : {}),
        authority: outcome.state === 'NEEDS_HUMAN' ? 2 : 3,
      }),
    ],
    effects:
      outcome.state === 'BOOKING_READY'
        ? [
            {
              id: id('effect:notify-owner'),
              kind: 'NOTIFICATION',
              description: 'Notify the named owner that the enquiry is complete and ready for a next step.',
              target: 'Named owner',
              idempotencyKey: `notify:${event.entityId}`,
              authority: 3,
              policyPermits: true,
              verification: {
                check: 'Confirm the notification reached a named owner.',
                expect: 'Notification addressed to a named owner.',
              },
            },
          ]
        : [],
    verifications: [],
  });

  return { steps };
}

function replyDisposition(
  classification: string,
  stillMissing: boolean,
): { state: string; summary: string } {
  switch (classification) {
    case 'OPT_OUT':
      return { state: 'DO_NOT_CONTACT', summary: 'Reply expresses opt-out. Suppression applied immediately and permanently.' };
    case 'OFF_SCRIPT_OR_RISK':
      return {
        state: 'NEEDS_HUMAN',
        summary: 'Reply raises a commitment, complaint, or risk question. Routed to a person rather than answered.',
      };
    case 'OUT_OF_SEGMENT':
      return { state: 'CLOSED_BAD_FIT', summary: 'Reply establishes the enquiry is outside the served segment.' };
    case 'SUPPLIES_INFORMATION':
      return stillMissing
        ? { state: 'NEEDS_INFORMATION', summary: 'Reply resolved some fields; others remain outstanding.' }
        : { state: 'BOOKING_READY', summary: 'Every required field is now present. Ready for a next commercial step.' };
    default:
      return {
        state: 'NEEDS_HUMAN',
        summary: `Reply class "${classification}" has no declared disposition. Routed to a person.`,
      };
  }
}

// ---------------------------------------------------------------------------
// lead.wait.reevaluated
// ---------------------------------------------------------------------------

/**
 * `lead.wait.reevaluated` is genuinely separate from `handleReply`: this event carries no
 * reply content at all, only `occurredAt` — the one place a real clock reading is permitted
 * to enter the system, and only as an ordinary event field the caller supplies, exactly like
 * every other event's `occurredAt`. Every function in this section remains synchronous,
 * total, and free of clocks, same as every other handler in this file.
 *
 * Who calls this, and when, is a persistence-layer question answered in
 * `lib/engine/wait-resume.ts`, not here.
 *
 * TWO Lead Rescue lifecycle states currently wait on an external response with no other
 * driving event: `WAITING_FOR_REPLY` (lr-t14, "wait elapsed") and `BOOKING_READY` (lr-t22,
 * "offer unanswered"). Both raise the SAME event type — a third, materially different
 * waiting condition would be the first real signal that a shared event type stops being the
 * right shape; two is not that signal, and inventing a second event type now would be
 * exactly the kind of speculative generalisation this pass exists to avoid. Instead, this
 * top-level handler dispatches on `state.lifecycleState` — already the authoritative,
 * engine-tracked discriminant, needing no new field — to exactly one of the two rules below.
 * A lifecycle state neither rule recognises (BOOKED, DO_NOT_CONTACT, CLOSED_BAD_FIT, or any
 * other state a case may have genuinely moved on to since it was parked) is a safe no-op,
 * never a guess: nothing here re-derives whether SOME OTHER wait might apply, and nothing
 * escalates without an evidenced, matching lifecycle state.
 */
/**
 * The three lifecycle states a case sits in while genuinely under human review — shared with
 * `UNDER_REVIEW_STATES` in `lib/engine/wait-resume.ts` and `app/api/lead-rescue/wait-incidents/route.ts`.
 * Kept as an independent local copy in each file rather than a shared export, matching this
 * codebase's own established convention for this exact set (the other two files already keep
 * their own copies, for the same reason: each file's own narrow concern, no cross-layer
 * coupling between the pure handler layer and the orchestration/UI layers that read it).
 */
const REVIEW_STATES = ['NEEDS_HUMAN', 'ESCALATED', 'SUPPRESSION_REVIEW'];

function handleWaitReevaluation(ctx: HandlerContext): HandlerOutcome {
  if (ctx.state.lifecycleState === 'WAITING_FOR_REPLY') return handleReplyWaitReevaluation(ctx);
  if (ctx.state.lifecycleState === 'BOOKING_READY') return handleOfferWaitReevaluation(ctx);
  if (REVIEW_STATES.includes(ctx.state.lifecycleState)) return handleReviewAttentionTimeout(ctx);

  const { event, state } = ctx;
  const id = (suffix: string) => `${event.eventId}:${suffix}`;
  return {
    steps: [
      {
        id: id('wait-check-not-waiting'),
        label: 'Wait re-evaluation',
        atOffsetSeconds: 0,
        summary: `Current lifecycle state (${state.lifecycleState}) has no declared wait-elapsed rule. No action taken.`,
        decisions: [
          decision({
            id: id('d-wait-check-not-waiting'),
            eventId: event.eventId,
            mechanism: 'DETERMINISTIC_RULE',
            objective: 'Determine whether this entity is currently in a lifecycle state a wait-elapsed rule applies to.',
            relevantState: state.lifecycleState,
            evidenceRefs: ['state.lifecycleState'],
            deterministicFacts: [{ label: 'Lifecycle state', value: state.lifecycleState }],
            missingInformation: [],
            permittedActions: ['record_unresolvable_check'],
            forbiddenActions: ['guess_wait_category', 'escalate_without_evidence'],
            selectedAction: 'record_unresolvable_check',
            applicablePolicy: [
              'A wait re-evaluation only applies to a lifecycle state that declares a wait-elapsed rule (WAITING_FOR_REPLY for lr-t14, BOOKING_READY for lr-t22). Any other state means the case has already moved on, and this is a safe no-op.',
            ],
            authority: 0,
          }),
        ],
        effects: [],
        verifications: [],
      },
    ],
  };
}

/**
 * The deterministic rule behind lr-t14. This handler only ever answers one question: given a
 * wait start and a check time, has the configured window elapsed?
 */
function handleReplyWaitReevaluation(ctx: HandlerContext): HandlerOutcome {
  const { event, state, profile } = ctx;
  const id = (suffix: string) => `${event.eventId}:${suffix}`;
  const windowHours = numberParam(profile, 'replyWaitWindowHours');
  const waitStartedAt = state.facts['waitStartedAt'];

  if (waitStartedAt === undefined) {
    return {
      steps: [
        {
          id: id('wait-check-invalid'),
          label: 'Wait re-evaluation',
          atOffsetSeconds: 0,
          summary: 'No recorded wait start on this entity. No action taken.',
          decisions: [
            decision({
              id: id('d-wait-check-invalid'),
              eventId: event.eventId,
              mechanism: 'DETERMINISTIC_RULE',
              objective: 'Determine whether the configured reply-wait window has elapsed.',
              relevantState: state.lifecycleState,
              evidenceRefs: ['state.facts.waitStartedAt'],
              deterministicFacts: [{ label: 'Wait started', value: 'not recorded' }],
              missingInformation: [],
              permittedActions: ['record_unresolvable_check'],
              forbiddenActions: ['guess_wait_start', 'escalate_without_evidence'],
              selectedAction: 'record_unresolvable_check',
              applicablePolicy: ['A wait re-evaluation with no recorded wait start cannot conclude anything and takes no action.'],
              authority: 0,
            }),
          ],
          effects: [],
          verifications: [],
        },
      ],
    };
  }

  const elapsedMs = Date.parse(event.occurredAt) - Date.parse(waitStartedAt);
  const windowMs = windowHours * 60 * 60 * 1000;
  const elapsed = elapsedMs >= windowMs;
  const elapsedHours = Math.round((elapsedMs / (60 * 60 * 1000)) * 10) / 10;

  if (!elapsed) {
    return {
      steps: [
        {
          id: id('wait-check'),
          label: 'Wait re-evaluation',
          atOffsetSeconds: 0,
          summary: `Checked ${elapsedHours}h into a ${windowHours}h window. Still within the configured wait — no action taken.`,
          decisions: [
            decision({
              id: id('d-wait-check'),
              eventId: event.eventId,
              mechanism: 'DETERMINISTIC_RULE',
              objective: 'Determine whether the configured reply-wait window has elapsed.',
              relevantState: 'WAITING_FOR_REPLY',
              evidenceRefs: ['state.facts.waitStartedAt', 'event.occurredAt'],
              deterministicFacts: [
                { label: 'Wait started', value: waitStartedAt },
                { label: 'Checked at', value: event.occurredAt },
                { label: 'Elapsed', value: `${elapsedHours} hours` },
                { label: 'Configured window', value: `${windowHours} hours` },
              ],
              missingInformation: [...state.missingInformation],
              permittedActions: ['remain_waiting'],
              forbiddenActions: ['escalate_before_window_elapses', 'guess_reply_intent'],
              selectedAction: 'remain_waiting',
              applicablePolicy: [
                'CLIENT_POLICY kestrel-reply-wait-window: escalation is eligible only once the configured wait window has genuinely elapsed.',
              ],
              authority: 3,
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
        id: id('wait-elapsed'),
        label: 'Wait elapsed',
        atOffsetSeconds: 0,
        transitionTo: 'NEEDS_HUMAN',
        summary: `No reply within the configured ${windowHours}-hour window (checked at ${elapsedHours}h). Escalated to a person.`,
        statePatch: { awaitingHuman: 'Reply window elapsed without a response', facts: { reviewStartedAt: event.occurredAt } },
        decisions: [
          decision({
            id: id('d-wait-elapsed'),
            eventId: event.eventId,
            mechanism: 'DETERMINISTIC_RULE',
            objective: 'Determine whether the configured reply-wait window has elapsed.',
            relevantState: 'WAITING_FOR_REPLY',
            evidenceRefs: ['state.facts.waitStartedAt', 'event.occurredAt'],
            deterministicFacts: [
              { label: 'Wait started', value: waitStartedAt },
              { label: 'Checked at', value: event.occurredAt },
              { label: 'Elapsed', value: `${elapsedHours} hours` },
              { label: 'Configured window', value: `${windowHours} hours` },
            ],
            missingInformation: [...state.missingInformation],
            permittedActions: ['escalate_to_human'],
            forbiddenActions: ['send_templated_followup', 'assume_intent', 'close_case'],
            selectedAction: 'escalate_to_human',
            applicablePolicy: [
              'CLIENT_POLICY kestrel-reply-wait-window: a missing-information question unanswered past the configured window is escalated to a named person.',
            ],
            escalationReason: `No reply within ${windowHours} hours of the question being sent.`,
            authority: 2,
          }),
        ],
        effects: [
          {
            id: id('effect:notify-wait-elapsed'),
            kind: 'NOTIFICATION',
            description: 'Notify the named owner that the reply window elapsed without a response.',
            target: 'Named owner',
            idempotencyKey: `notify:${event.entityId}:wait-elapsed`,
            authority: 3,
            policyPermits: true,
            verification: {
              check: 'Confirm the notification reached a named owner rather than a shared queue.',
              expect: 'Notification addressed to a named owner.',
            },
          },
        ],
        verifications: [],
      },
    ],
  };
}

/**
 * The deterministic rule behind lr-t22 — the sibling of `handleReplyWaitReevaluation` on a
 * different waiting state. Same shape deliberately: given a wait start and a check time, has
 * the configured booking-offer window elapsed?
 *
 * SEMANTIC-INTEGRITY CORRECTION: the wait start this rule reads is `offerSentAt`, never
 * `bookingReadyAt` and never `waitStartedAt`. `bookingReadyAt` (written at every BOOKING_READY
 * entry point — lr-t10, lr-t16, and the three HUMAN_DECISION re-entries lr-t24/lr-t27/lr-t34)
 * proves only that the case became ready for a next commercial step; it is never evidence a
 * prospect received anything, since every one of those paths fires at most an internal
 * NOTIFICATION to the named owner. `offerSentAt` is written in exactly one place —
 * `handleOfferDespatched`, below — when a person explicitly despatches a real, prospect-facing
 * offer. Reading `bookingReadyAt` here would mean escalating "the offer went unanswered" for a
 * case where no offer was ever sent, which is exactly the false-positive this correction closes.
 *
 * Nothing here is copied from `handleReplyWaitReevaluation` by reference — the duplication
 * between the two functions IS the architecture: two small, independently readable rules
 * rather than one parameterised over which fact/policy/idempotency-suffix to use, which would
 * obscure exactly the distinction (a different policy, a different fact, a different
 * notification identity) that matters here.
 */
function handleOfferWaitReevaluation(ctx: HandlerContext): HandlerOutcome {
  const { event, state, profile } = ctx;
  const id = (suffix: string) => `${event.eventId}:${suffix}`;
  const windowHours = numberParam(profile, 'bookingOfferWindowHours');
  const offerSentAt = state.facts['offerSentAt'];

  // No offer has ever been despatched for this cycle. This is NOT "no recognised waiting
  // condition" — it is the second half of lr-fm-approval-timeout's gap: a case can sit
  // approved/ready exactly as easily as it can sit unreviewed. `handleDispatchAttentionTimeout`
  // below governs this case on its OWN anchor (bookingReadyAt — readiness evidence, already
  // established) and its OWN window (dispatchTimeoutHours) — deliberately never offerSentAt,
  // which does not exist yet, and never lr-t22's rule or policy, which requires offerSentAt
  // by construction and is the ENTIRELY SEPARATE branch below this one.
  if (offerSentAt === undefined) {
    return handleDispatchAttentionTimeout(ctx);
  }

  const elapsedMs = Date.parse(event.occurredAt) - Date.parse(offerSentAt);
  const windowMs = windowHours * 60 * 60 * 1000;
  const elapsed = elapsedMs >= windowMs;
  const elapsedHours = Math.round((elapsedMs / (60 * 60 * 1000)) * 10) / 10;

  if (!elapsed) {
    return {
      steps: [
        {
          id: id('offer-check'),
          label: 'Offer re-evaluation',
          atOffsetSeconds: 0,
          summary: `Checked ${elapsedHours}h into a ${windowHours}h window since the offer was despatched. Still within the configured booking-offer wait — no action taken.`,
          decisions: [
            decision({
              id: id('d-offer-check'),
              eventId: event.eventId,
              mechanism: 'DETERMINISTIC_RULE',
              objective: 'Determine whether the configured booking-offer wait window has elapsed.',
              relevantState: 'BOOKING_READY',
              evidenceRefs: ['state.facts.offerSentAt', 'event.occurredAt'],
              deterministicFacts: [
                { label: 'Offer sent at', value: offerSentAt },
                { label: 'Checked at', value: event.occurredAt },
                { label: 'Elapsed', value: `${elapsedHours} hours` },
                { label: 'Configured window', value: `${windowHours} hours` },
              ],
              missingInformation: [...state.missingInformation],
              permittedActions: ['remain_waiting'],
              forbiddenActions: ['escalate_before_window_elapses', 'assume_offer_declined'],
              selectedAction: 'remain_waiting',
              applicablePolicy: [
                'CLIENT_POLICY kestrel-booking-offer-window: escalation is eligible only once the configured booking-offer wait window has genuinely elapsed.',
              ],
              authority: 3,
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
        id: id('offer-elapsed'),
        label: 'Offer elapsed',
        atOffsetSeconds: 0,
        transitionTo: 'NEEDS_HUMAN',
        summary: `No response to the offered next step within the configured ${windowHours}-hour window (checked at ${elapsedHours}h). Escalated to a person.`,
        statePatch: { awaitingHuman: 'Booking-offer window elapsed without a response', facts: { reviewStartedAt: event.occurredAt } },
        decisions: [
          decision({
            id: id('d-offer-elapsed'),
            eventId: event.eventId,
            mechanism: 'DETERMINISTIC_RULE',
            objective: 'Determine whether the configured booking-offer wait window has elapsed.',
            relevantState: 'BOOKING_READY',
            evidenceRefs: ['state.facts.offerSentAt', 'event.occurredAt'],
            deterministicFacts: [
              { label: 'Offer sent at', value: offerSentAt },
              { label: 'Checked at', value: event.occurredAt },
              { label: 'Elapsed', value: `${elapsedHours} hours` },
              { label: 'Configured window', value: `${windowHours} hours` },
            ],
            missingInformation: [...state.missingInformation],
            permittedActions: ['escalate_to_human'],
            forbiddenActions: ['assume_offer_declined', 'rebook_without_confirmation', 'close_case'],
            selectedAction: 'escalate_to_human',
            applicablePolicy: [
              'CLIENT_POLICY kestrel-booking-offer-window: an offered next step unanswered past the configured window is escalated to a named person.',
            ],
            escalationReason: `No response to the offered next step within ${windowHours} hours of the offer being despatched.`,
            authority: 2,
          }),
        ],
        effects: [
          {
            id: id('effect:notify-offer-unanswered'),
            kind: 'NOTIFICATION',
            description: 'Notify the named owner that the offered next step went unanswered.',
            target: 'Named owner',
            idempotencyKey: `notify:${event.entityId}:offer-unanswered`,
            authority: 3,
            policyPermits: true,
            verification: {
              check: 'Confirm the notification reached a named owner rather than a shared queue.',
              expect: 'Notification addressed to a named owner.',
            },
          },
        ],
        verifications: [],
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// ATTENTION TIMEOUT — lr-fm-approval-timeout ("HUMAN_APPROVAL_TIMEOUT")
// ---------------------------------------------------------------------------
//
// Two genuinely different waiting conditions, both driven by the SAME `lead.wait.reevaluated`
// event that already carries lr-t14/lr-t22 — no new event type, same reasoning documented
// above `handleWaitReevaluation` for why two is not yet the signal that would justify one.
// Both share ONE deliberate property that makes them different in kind from lr-t14/lr-t22,
// not merely in degree: NEITHER handler below ever sets `transitionTo`. This is not an
// oversight — it is the entire point. A case parked under review, or ready but undespatched,
// decaying unattended is an OPERATIONAL ATTENTION failure ("a human has not acted"), never a
// business decision this system is authorized to make on a person's behalf. Timeout here
// means "escalate the fact that nobody has acted" — never "approve", "reject", or "despatch"
// on their behalf. Because `transitionTo` is never set, the engine's own transition-legality
// gate (`lib/engine/reducer.ts`) is never even invoked for these steps: there is structurally
// no lifecycle move for it to authorise or refuse, not merely a promise that one won't happen.
// The NOTIFICATION effect each proposes still runs through the ordinary policy/authority/
// idempotency gates every other effect in this file does — an attention escalation is a real,
// once-only action, just never a lifecycle one.

/**
 * The deterministic rule behind the human-review half of lr-fm-approval-timeout. Anchored on
 * `reviewStartedAt`, a fact written once at every GENUINE entry into human review (every
 * NEEDS_HUMAN/SUPPRESSION_REVIEW entry point in `handleEnquiry`/`handleReply`, plus the two
 * elapsed-wait escalations above) and deliberately left untouched by `handleHumanDecision`'s
 * own review-to-review moves (lr-t23 NEEDS_HUMAN -> ESCALATED, lr-t37 SUPPRESSION_REVIEW ->
 * ESCALATED) — raising a case further up the authority chain is still the SAME unresolved
 * review, not a new one, so escalating it must never grant a fresh window.
 */
function handleReviewAttentionTimeout(ctx: HandlerContext): HandlerOutcome {
  const { event, state, profile } = ctx;
  const id = (suffix: string) => `${event.eventId}:${suffix}`;
  const windowHours = numberParam(profile, 'humanReviewTimeoutHours');
  const reviewStartedAt = state.facts['reviewStartedAt'];

  if (reviewStartedAt === undefined) {
    return {
      steps: [
        {
          id: id('review-check-invalid'),
          label: 'Review attention check',
          atOffsetSeconds: 0,
          summary: 'No recorded review-start timestamp on this entity. No action taken.',
          decisions: [
            decision({
              id: id('d-review-check-invalid'),
              eventId: event.eventId,
              mechanism: 'DETERMINISTIC_RULE',
              objective: 'Determine whether the configured human-review attention window has elapsed.',
              relevantState: state.lifecycleState,
              evidenceRefs: ['state.facts.reviewStartedAt'],
              deterministicFacts: [{ label: 'Review started', value: 'not recorded' }],
              missingInformation: [],
              permittedActions: ['record_unresolvable_check'],
              forbiddenActions: ['guess_review_start', 'escalate_without_evidence'],
              selectedAction: 'record_unresolvable_check',
              applicablePolicy: ['A review attention check with no recorded review start cannot conclude anything and takes no action.'],
              authority: 0,
            }),
          ],
          effects: [],
          verifications: [],
        },
      ],
    };
  }

  const elapsedMs = Date.parse(event.occurredAt) - Date.parse(reviewStartedAt);
  const windowMs = windowHours * 60 * 60 * 1000;
  const elapsed = elapsedMs >= windowMs;
  const elapsedHours = Math.round((elapsedMs / (60 * 60 * 1000)) * 10) / 10;

  if (!elapsed) {
    return {
      steps: [
        {
          id: id('review-check'),
          label: 'Review attention check',
          atOffsetSeconds: 0,
          summary: `Checked ${elapsedHours}h into a ${windowHours}h review window. Still within policy — no action taken.`,
          decisions: [
            decision({
              id: id('d-review-check'),
              eventId: event.eventId,
              mechanism: 'DETERMINISTIC_RULE',
              objective: 'Determine whether the configured human-review attention window has elapsed.',
              relevantState: state.lifecycleState,
              evidenceRefs: ['state.facts.reviewStartedAt', 'event.occurredAt'],
              deterministicFacts: [
                { label: 'Review started', value: reviewStartedAt },
                { label: 'Checked at', value: event.occurredAt },
                { label: 'Elapsed', value: `${elapsedHours} hours` },
                { label: 'Configured window', value: `${windowHours} hours` },
              ],
              missingInformation: [...state.missingInformation],
              permittedActions: ['remain_under_review'],
              forbiddenActions: ['escalate_before_window_elapses', 'synthesize_decision'],
              selectedAction: 'remain_under_review',
              applicablePolicy: [
                'CLIENT_POLICY kestrel-review-timeout-window: attention escalation is eligible only once the configured review window has genuinely elapsed.',
              ],
              authority: 3,
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
        id: id('review-overdue'),
        label: 'Review attention overdue',
        atOffsetSeconds: 0,
        // Deliberately NO transitionTo — see the section note above. The case remains exactly
        // where it was (NEEDS_HUMAN / ESCALATED / SUPPRESSION_REVIEW); only an operational
        // attention condition is recorded.
        summary: `No human decision within the configured ${windowHours}-hour review window (checked at ${elapsedHours}h). Escalated as an overdue attention condition to the next owner in the authority chain — the case remains ${state.lifecycleState}, pending an actual human decision.`,
        decisions: [
          decision({
            id: id('d-review-overdue'),
            eventId: event.eventId,
            mechanism: 'DETERMINISTIC_RULE',
            objective: 'Determine whether the configured human-review attention window has elapsed.',
            relevantState: state.lifecycleState,
            evidenceRefs: ['state.facts.reviewStartedAt', 'event.occurredAt'],
            deterministicFacts: [
              { label: 'Review started', value: reviewStartedAt },
              { label: 'Checked at', value: event.occurredAt },
              { label: 'Elapsed', value: `${elapsedHours} hours` },
              { label: 'Configured window', value: `${windowHours} hours` },
            ],
            missingInformation: [...state.missingInformation],
            permittedActions: ['escalate_attention_to_next_owner'],
            forbiddenActions: ['synthesize_decision', 'apply_default_disposition', 'transition_lifecycle_state'],
            selectedAction: 'escalate_attention_to_next_owner',
            applicablePolicy: [
              'CLIENT_POLICY kestrel-review-timeout-window: a case held for human review past the configured window is escalated to the next owner in the authority chain as an attention condition. The case itself is never auto-decided.',
            ],
            escalationReason: `No human decision recorded within ${windowHours} hours of entering human review.`,
            authority: 2,
          }),
        ],
        effects: [
          {
            id: id('effect:notify-review-overdue'),
            kind: 'NOTIFICATION',
            description: 'Notify the next owner in the authority chain that a case under human review has exceeded the configured review window.',
            target: 'Named owner',
            idempotencyKey: `notify:${event.entityId}:review-overdue`,
            authority: 3,
            policyPermits: true,
            verification: {
              check: 'Confirm the notification reached a named owner rather than a shared queue.',
              expect: 'Notification addressed to a named owner.',
            },
          },
        ],
        verifications: [],
      },
    ],
  };
}

/**
 * The deterministic rule behind the ready-but-undespatched half of lr-fm-approval-timeout.
 * Anchored on `bookingReadyAt` — the existing readiness fact, already written by every
 * BOOKING_READY entry point — deliberately never `offerSentAt`, which by construction does
 * not exist for a case this function is ever called for (see `handleOfferWaitReevaluation`'s
 * dispatch above this function).
 */
function handleDispatchAttentionTimeout(ctx: HandlerContext): HandlerOutcome {
  const { event, state, profile } = ctx;
  const id = (suffix: string) => `${event.eventId}:${suffix}`;
  const windowHours = numberParam(profile, 'dispatchTimeoutHours');
  const bookingReadyAt = state.facts['bookingReadyAt'];

  if (bookingReadyAt === undefined) {
    return {
      steps: [
        {
          id: id('dispatch-check-invalid'),
          label: 'Dispatch attention check',
          atOffsetSeconds: 0,
          summary: 'No recorded readiness timestamp on this entity. No action taken.',
          decisions: [
            decision({
              id: id('d-dispatch-check-invalid'),
              eventId: event.eventId,
              mechanism: 'DETERMINISTIC_RULE',
              objective: 'Determine whether the configured dispatch attention window has elapsed.',
              relevantState: state.lifecycleState,
              evidenceRefs: ['state.facts.bookingReadyAt'],
              deterministicFacts: [{ label: 'Booking ready at', value: 'not recorded' }],
              missingInformation: [],
              permittedActions: ['record_unresolvable_check'],
              forbiddenActions: ['guess_readiness_start', 'escalate_without_evidence'],
              selectedAction: 'record_unresolvable_check',
              applicablePolicy: ['A dispatch attention check with no recorded readiness timestamp cannot conclude anything and takes no action.'],
              authority: 0,
            }),
          ],
          effects: [],
          verifications: [],
        },
      ],
    };
  }

  const elapsedMs = Date.parse(event.occurredAt) - Date.parse(bookingReadyAt);
  const windowMs = windowHours * 60 * 60 * 1000;
  const elapsed = elapsedMs >= windowMs;
  const elapsedHours = Math.round((elapsedMs / (60 * 60 * 1000)) * 10) / 10;

  if (!elapsed) {
    return {
      steps: [
        {
          id: id('dispatch-check'),
          label: 'Dispatch attention check',
          atOffsetSeconds: 0,
          summary: `Checked ${elapsedHours}h into a ${windowHours}h dispatch window since the case became ready. Still within policy — no action taken.`,
          decisions: [
            decision({
              id: id('d-dispatch-check'),
              eventId: event.eventId,
              mechanism: 'DETERMINISTIC_RULE',
              objective: 'Determine whether the configured dispatch attention window has elapsed.',
              relevantState: state.lifecycleState,
              evidenceRefs: ['state.facts.bookingReadyAt', 'event.occurredAt'],
              deterministicFacts: [
                { label: 'Booking ready at', value: bookingReadyAt },
                { label: 'Checked at', value: event.occurredAt },
                { label: 'Elapsed', value: `${elapsedHours} hours` },
                { label: 'Configured window', value: `${windowHours} hours` },
              ],
              missingInformation: [...state.missingInformation],
              permittedActions: ['remain_ready_undespatched'],
              forbiddenActions: ['escalate_before_window_elapses', 'despatch_offer_automatically'],
              selectedAction: 'remain_ready_undespatched',
              applicablePolicy: [
                'CLIENT_POLICY kestrel-dispatch-timeout-window: attention escalation is eligible only once the configured dispatch window has genuinely elapsed.',
              ],
              authority: 3,
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
        id: id('dispatch-overdue'),
        label: 'Dispatch attention overdue',
        atOffsetSeconds: 0,
        // Deliberately NO transitionTo, and no offerSentAt write — see the section note above
        // handleReviewAttentionTimeout. The case remains BOOKING_READY, genuinely undespatched;
        // only an operational attention condition is recorded.
        summary: `Ready for a next commercial step but not despatched within the configured ${windowHours}-hour window (checked at ${elapsedHours}h). Escalated as an overdue attention condition — the case remains BOOKING_READY, and no offer was sent.`,
        decisions: [
          decision({
            id: id('d-dispatch-overdue'),
            eventId: event.eventId,
            mechanism: 'DETERMINISTIC_RULE',
            objective: 'Determine whether the configured dispatch attention window has elapsed.',
            relevantState: state.lifecycleState,
            evidenceRefs: ['state.facts.bookingReadyAt', 'event.occurredAt'],
            deterministicFacts: [
              { label: 'Booking ready at', value: bookingReadyAt },
              { label: 'Checked at', value: event.occurredAt },
              { label: 'Elapsed', value: `${elapsedHours} hours` },
              { label: 'Configured window', value: `${windowHours} hours` },
            ],
            missingInformation: [...state.missingInformation],
            permittedActions: ['escalate_attention_to_next_owner'],
            forbiddenActions: ['despatch_offer_automatically', 'fabricate_offer_sent_evidence', 'transition_lifecycle_state'],
            selectedAction: 'escalate_attention_to_next_owner',
            applicablePolicy: [
              'CLIENT_POLICY kestrel-dispatch-timeout-window: a case ready for a next commercial step but not despatched past the configured window is escalated as an attention condition. The offer is never auto-sent.',
            ],
            escalationReason: `No offer despatched within ${windowHours} hours of the case becoming ready.`,
            authority: 2,
          }),
        ],
        effects: [
          {
            id: id('effect:notify-dispatch-overdue'),
            kind: 'NOTIFICATION',
            description: 'Notify the next owner in the authority chain that a ready case has not had its offer despatched within the configured window.',
            target: 'Named owner',
            idempotencyKey: `notify:${event.entityId}:dispatch-overdue`,
            authority: 3,
            policyPermits: true,
            verification: {
              check: 'Confirm the notification reached a named owner rather than a shared queue.',
              expect: 'Notification addressed to a named owner.',
            },
          },
        ],
        verifications: [],
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
          id: id('human-invalid'),
          label: 'Human decision',
          atOffsetSeconds: 0,
          summary: 'Human decision payload failed validation. No state change.',
          decisions: [
            decision({
              id: id('d-human-invalid'),
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
  const target = humanTarget(humanDecision.decision);

  return {
    steps: [
      {
        id: id('human'),
        label: 'Human decision',
        atOffsetSeconds: 0,
        transitionTo: target,
        summary: `${actor?.name ?? humanDecision.decidedBy} recorded: ${humanDecision.decision}.`,
        statePatch: {
          awaitingHuman: null,
          ...(target === 'DO_NOT_CONTACT' ? { suppressed: true } : {}),
          // lr-t24/lr-t27/lr-t34: a person clearing NEEDS_HUMAN/ESCALATED/SUPPRESSION_REVIEW
          // back to BOOKING_READY is the SAME readiness evidence lr-t10/lr-t16 already write
          // on their own direct paths — never offer-sent evidence. Clearing a case is not
          // despatching an offer to it: lr-t22's clock does not start here. It starts only
          // when a genuinely separate `lead.offer.despatched` event later records
          // `offerSentAt` — see `handleOfferDespatched` below.
          ...(target === 'BOOKING_READY' ? { facts: { bookingReadyAt: event.occurredAt } } : {}),
        },
        decisions: [
          decision({
            id: id('d-human'),
            eventId: event.eventId,
            mechanism: 'HUMAN_DECISION',
            objective: 'Record and apply a decision made by a person.',
            relevantState: state.lifecycleState,
            evidenceRefs: ['event.payload.rationale'],
            deterministicFacts: [
              { label: 'Decided by', value: actor?.name ?? humanDecision.decidedBy },
              { label: 'Authority ceiling of this role', value: String(actor?.authorityCeiling ?? 'unknown') },
              { label: 'Rationale', value: humanDecision.rationale },
            ],
            missingInformation: [...state.missingInformation],
            permittedActions: ['apply_human_decision'],
            forbiddenActions: ['automate_this_decision'],
            selectedAction: `transition_to_${target}`,
            applicablePolicy: ['Human review is a valid lifecycle state, not a failure of autonomy.'],
            authority: 2,
          }),
        ],
        effects: [],
        verifications: [
          {
            id: id('v-human'),
            eventId: event.eventId,
            check: 'Confirm the deciding role holds sufficient authority for this decision.',
            result: (actor?.authorityCeiling ?? 0) >= 2 ? 'PASS' : 'FAIL',
            detail:
              (actor?.authorityCeiling ?? 0) >= 2
                ? `${actor?.name ?? 'Role'} holds authority level ${actor?.authorityCeiling}, which permits approving prepared actions.`
                : `${actor?.name ?? humanDecision.decidedBy} does not hold sufficient authority for this decision.`,
          },
        ],
      },
    ],
  };
}

function humanTarget(decisionKind: string): string {
  switch (decisionKind) {
    case 'CLEARED_TO_PROCEED':
      return 'BOOKING_READY';
    case 'CLOSED_BAD_FIT':
      return 'CLOSED_BAD_FIT';
    case 'SUPPRESS':
      return 'DO_NOT_CONTACT';
    case 'ESCALATE':
      return 'ESCALATED';
    case 'BOOKED':
      return 'BOOKED';
    default:
      return 'NEEDS_HUMAN';
  }
}

// ---------------------------------------------------------------------------
// lead.offer.despatched
// ---------------------------------------------------------------------------

/**
 * The ONLY place `offerSentAt` is written, and the only place a MESSAGE_SEND effect is ever
 * addressed to the prospect for a next commercial step (`possibleActions`' "Offer a next
 * commercial step", distinct from "Notify a named owner" — canon has always named these as
 * two different actions; this handler is what actually keeps them two different effects).
 *
 * Guarded to BOOKING_READY only, and a safe no-op everywhere else — the same "no recognised
 * condition, no guess" discipline `handleWaitReevaluation` already applies for the
 * re-evaluation event. Despatching an offer only means something once the case is genuinely
 * ready; it cannot itself clear a case out of human review (that is lr-t24/lr-t27/lr-t34's
 * job, via `human.decision.recorded`, above) or manufacture readiness that was never decided.
 *
 * `humanOnlyActions` in canon lists "Approving any message that makes or implies a
 * commitment" — this event's `decidedBy` and the authority verification below are that
 * approval, made explicit and checked, not assumed.
 */
function handleOfferDespatched(ctx: HandlerContext): HandlerOutcome {
  const { event, state, profile } = ctx;
  const id = (suffix: string) => `${event.eventId}:${suffix}`;

  if (state.lifecycleState !== 'BOOKING_READY') {
    return {
      steps: [
        {
          id: id('offer-despatch-not-ready'),
          label: 'Offer despatch',
          atOffsetSeconds: 0,
          summary: `Current lifecycle state (${state.lifecycleState}) is not BOOKING_READY. No offer despatched.`,
          decisions: [
            decision({
              id: id('d-offer-despatch-not-ready'),
              eventId: event.eventId,
              mechanism: 'DETERMINISTIC_RULE',
              objective: 'Confirm the case is genuinely ready for a next commercial step before despatching one.',
              relevantState: state.lifecycleState,
              evidenceRefs: ['state.lifecycleState'],
              deterministicFacts: [{ label: 'Lifecycle state', value: state.lifecycleState }],
              missingInformation: [],
              permittedActions: ['record_unresolvable_check'],
              forbiddenActions: ['despatch_offer_outside_booking_ready', 'manufacture_readiness'],
              selectedAction: 'record_unresolvable_check',
              applicablePolicy: ['An offer may be despatched only while the case is genuinely in BOOKING_READY.'],
              authority: 0,
            }),
          ],
          effects: [],
          verifications: [],
        },
      ],
    };
  }

  const parsed = OfferDespatchPayloadSchema.safeParse(event.payload);
  if (!parsed.success) {
    return {
      steps: [
        {
          id: id('offer-despatch-invalid'),
          label: 'Offer despatch',
          atOffsetSeconds: 0,
          summary: 'Offer-despatch payload failed validation. No offer sent, and no offer-sent evidence recorded.',
          decisions: [
            decision({
              id: id('d-offer-despatch-invalid'),
              eventId: event.eventId,
              mechanism: 'DETERMINISTIC_RULE',
              objective: 'Validate an offer-despatch record before treating it as evidence a prospect-facing offer was sent.',
              relevantState: state.lifecycleState,
              evidenceRefs: ['event.payload'],
              deterministicFacts: [{ label: 'Validation errors', value: parsed.error.issues.map((i) => i.message).join('; ') }],
              missingInformation: [],
              permittedActions: ['reject_event'],
              forbiddenActions: ['assume_offer_sent'],
              selectedAction: 'reject_event',
              applicablePolicy: ['An unvalidated despatch record is never treated as offer-sent evidence.'],
              authority: 0,
            }),
          ],
          effects: [],
          verifications: [],
        },
      ],
    };
  }

  const despatch = parsed.data;
  const actor = profile.roles.find((r) => r.id === despatch.decidedBy);
  const despatchAttempt = readSendAttempt(event.payload);

  return {
    steps: [
      {
        id: id('offer-despatch'),
        label: 'Offer despatched',
        atOffsetSeconds: 0,
        summary: `${actor?.name ?? despatch.decidedBy} despatched an offer of a next commercial step to the prospect.`,
        // The ONLY write of offerSentAt in this handler file. Unconditional on the proposed
        // effect's own eventual status (EXECUTED vs OUTCOME_UNKNOWN): this fact records that
        // the system authorized and attempted despatch, the same fidelity level every other
        // outbound effect in this portfolio (the acknowledgement, the missing-info question)
        // already commits to — the business lifecycle proceeds from what was AUTHORIZED, and
        // the side effect's own status separately, honestly records what the attempt resolved
        // to. See tests/lead-rescue-offer-wait.test.ts for the confirmed-vs-uncertain proof.
        statePatch: { facts: { offerSentAt: event.occurredAt } },
        decisions: [
          decision({
            id: id('d-offer-despatch'),
            eventId: event.eventId,
            mechanism: 'HUMAN_DECISION',
            objective:
              'Record the explicit despatch of a prospect-facing offer — genuinely distinct from the internal owner NOTIFICATION BOOKING_READY entry already fired.',
            relevantState: 'BOOKING_READY',
            evidenceRefs: ['event.payload.offerSummary', 'event.payload.decidedBy'],
            deterministicFacts: [
              { label: 'Despatched by', value: actor?.name ?? despatch.decidedBy },
              { label: 'Authority ceiling of this role', value: String(actor?.authorityCeiling ?? 'unknown') },
              { label: 'Offer summary', value: despatch.offerSummary },
            ],
            missingInformation: [],
            permittedActions: ['despatch_offer'],
            forbiddenActions: ['despatch_without_human_authorization', 'assert_delivery_confirmed_by_prospect'],
            selectedAction: 'despatch_offer',
            applicablePolicy: [
              'Approving a message that offers or implies a commercial commitment is a human-only action.',
              'A message offering a next commercial step is despatched only once a named person has authorized its specific content.',
            ],
            authority: 2,
          }),
        ],
        effects: [
          {
            id: id('effect:offer'),
            kind: 'MESSAGE_SEND',
            description: despatch.offerSummary,
            target: despatch.target,
            // Keyed on bookingReadyAt, NOT event.eventId: this must be the SAME identity for
            // every concurrent despatch attempt against the SAME BOOKING_READY cycle (two
            // overlapping requests racing to despatch), so a durable claim on it (see
            // `dispatchAuthorizedOffer` in lib/engine/wait-resume.ts) can actually detect the
            // race. bookingReadyAt is stable for the lifetime of one un-dispatched cycle and
            // changes only when the case genuinely leaves and re-enters BOOKING_READY — the
            // same "distinguishable waiting occurrence" identity lr-t14/lr-t22's own notification
            // keys already rely on `revision` for, exactly for this reason.
            idempotencyKey: `offer:${event.entityId}:${state.facts['bookingReadyAt'] ?? event.eventId}`,
            authority: 3,
            policyPermits: true,
            ...(despatchAttempt === null
              ? {
                  verification: {
                    check: 'Confirm the offer was addressed to the prospect, not the named owner.',
                    expect: 'Offer addressed to the prospect contact.',
                  },
                }
              : {
                  execution: {
                    kind: 'SEND' as const,
                    attemptId: despatchAttempt.attemptId,
                    provider: despatchAttempt.provider,
                    honorsIdempotencyKey: despatchAttempt.honorsIdempotencyKey,
                  },
                }),
          },
        ],
        verifications: [
          {
            id: id('v-offer-despatch'),
            eventId: event.eventId,
            check: 'Confirm the authorizing role holds sufficient authority to approve a commitment-adjacent message.',
            result: (actor?.authorityCeiling ?? 0) >= 2 ? 'PASS' : 'FAIL',
            detail:
              (actor?.authorityCeiling ?? 0) >= 2
                ? `${actor?.name ?? 'Role'} holds authority level ${actor?.authorityCeiling}, which permits authorizing a prospect-facing offer.`
                : `${actor?.name ?? despatch.decidedBy} does not hold sufficient authority to authorize this despatch.`,
          },
        ],
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// side_effect.reconciliation.attempted
// ---------------------------------------------------------------------------

/**
 * A single automated reconciliation pass: query the provider's own authoritative status
 * for an earlier uncertain send, and — only if that query resolves it — retry.
 *
 * Deliberately always proposes BOTH steps regardless of what the verify fixture says.
 * Whether the retry actually executes is decided by the engine core's execution ledger,
 * not by this handler pre-empting it. That is what makes the "does not blindly retry"
 * guarantee structural: a fixture authored with a still-inconclusive check would produce
 * the exact same two proposed steps, and the retry would come back OUTCOME_UNKNOWN again.
 */
const ReconciliationPayloadSchema = z.object({
  verifyAttempts: z
    .array(
      z.object({
        attemptId: z.string().min(1),
        targetIdempotencyKey: z.string().min(1),
        provider: z.string().min(1),
      }),
    )
    .min(1),
  sendAttempts: z
    .array(
      z.object({
        attemptId: z.string().min(1),
        idempotencyKey: z.string().min(1),
        provider: z.string().min(1),
        honorsIdempotencyKey: z.boolean(),
        description: z.string().min(1),
        target: z.string().min(1),
      }),
    )
    .min(1),
});

function handleReconciliation(ctx: HandlerContext): HandlerOutcome {
  const { event, state } = ctx;
  const id = (suffix: string) => `${event.eventId}:${suffix}`;
  const parsed = ReconciliationPayloadSchema.safeParse(event.payload);

  if (!parsed.success) {
    return {
      steps: [
        {
          id: id('reconcile-invalid'),
          label: 'Reconciliation',
          atOffsetSeconds: 0,
          summary: 'Reconciliation payload failed validation. No check or retry was attempted.',
          decisions: [
            decision({
              id: id('d-reconcile-invalid'),
              eventId: event.eventId,
              mechanism: 'DETERMINISTIC_RULE',
              objective: 'Validate the reconciliation payload before attempting any check or retry.',
              relevantState: state.lifecycleState,
              evidenceRefs: ['event.payload'],
              deterministicFacts: [
                { label: 'Validation errors', value: parsed.error.issues.map((i) => i.message).join('; ') },
              ],
              missingInformation: [],
              permittedActions: ['reject_event'],
              forbiddenActions: ['guess_target_key'],
              selectedAction: 'reject_event',
              applicablePolicy: ['A malformed reconciliation request takes no action.'],
              authority: 0,
            }),
          ],
          effects: [],
          verifications: [],
        },
      ],
    };
  }

  const verify = parsed.data.verifyAttempts[0];
  const retry = parsed.data.sendAttempts[0];
  if (verify === undefined || retry === undefined) {
    throw new Error('reconciliation payload passed validation but is missing its first entries');
  }

  return {
    steps: [
      {
        id: id('verify'),
        label: 'Verification check',
        atOffsetSeconds: 0,
        summary: 'Querying the provider’s authoritative delivery status for the earlier uncertain attempt.',
        decisions: [
          decision({
            id: id('d-verify'),
            eventId: event.eventId,
            mechanism: 'DETERMINISTIC_RULE',
            objective:
              'Independently resolve an earlier OUTCOME_UNKNOWN send by querying the provider’s own status record, rather than assuming an answer either way.',
            relevantState: state.lifecycleState,
            evidenceRefs: [`execution.idempotencyKey=${verify.targetIdempotencyKey}`],
            deterministicFacts: [{ label: 'Target idempotency key', value: verify.targetIdempotencyKey }],
            missingInformation: [],
            permittedActions: ['query_provider_status'],
            forbiddenActions: ['assume_outcome', 'retry_without_checking'],
            selectedAction: 'query_provider_status',
            applicablePolicy: [
              'A verification check can only narrow an unknown outcome toward a definite answer, or leave it unresolved. It can never itself act on the customer.',
            ],
            authority: 3,
          }),
        ],
        effects: [
          {
            id: id('effect:verify'),
            kind: 'VERIFICATION_CHECK',
            description: `Query delivery status for idempotency key "${verify.targetIdempotencyKey}".`,
            target: 'Provider status API',
            idempotencyKey: `verify:${verify.targetIdempotencyKey}`,
            authority: 3,
            policyPermits: true,
            execution: {
              kind: 'VERIFY',
              attemptId: verify.attemptId,
              targetIdempotencyKey: verify.targetIdempotencyKey,
              provider: verify.provider,
            },
          },
        ],
        verifications: [],
      },
      {
        id: id('retry'),
        label: 'Retry despatch',
        atOffsetSeconds: 1,
        summary:
          'Retry proposed on the original idempotency key. Whether it actually executes is decided by the execution ledger in the engine core, not by this handler.',
        decisions: [
          decision({
            id: id('d-retry'),
            eventId: event.eventId,
            mechanism: 'DETERMINISTIC_RULE',
            objective: 'Retry a send whose prior outcome was unknown, now that retry safety may have been established.',
            relevantState: state.lifecycleState,
            evidenceRefs: [`execution.idempotencyKey=${retry.idempotencyKey}`],
            deterministicFacts: [
              { label: 'Idempotency key', value: retry.idempotencyKey },
              { label: 'Provider honours idempotency key', value: String(retry.honorsIdempotencyKey) },
            ],
            missingInformation: [],
            permittedActions: ['propose_retry'],
            forbiddenActions: ['bypass_execution_ledger', 'assert_retry_is_safe'],
            selectedAction: 'propose_retry',
            applicablePolicy: [
              'This handler proposes the retry unconditionally; the execution ledger in the engine core is the sole authority on whether it is actually permitted.',
            ],
            authority: 3,
          }),
        ],
        effects: [
          {
            id: id('effect:retry'),
            kind: 'MESSAGE_SEND',
            description: retry.description,
            target: retry.target,
            idempotencyKey: retry.idempotencyKey,
            authority: 3,
            policyPermits: true,
            execution: {
              kind: 'SEND',
              attemptId: retry.attemptId,
              provider: retry.provider,
              honorsIdempotencyKey: retry.honorsIdempotencyKey,
            },
          },
        ],
        verifications: [],
      },
    ],
  };
}

// ---------------------------------------------------------------------------

function readJudgmentId(payload: Readonly<Record<string, unknown>>): string | null {
  const raw = payload['judgment'];
  if (typeof raw !== 'object' || raw === null) return null;
  const candidate = (raw as Record<string, unknown>)['judgmentId'];
  return typeof candidate === 'string' ? candidate : null;
}

/**
 * Reads just enough off the first `sendAttempts` entry to build a ProposedEffect's
 * `execution` field. The full entry (idempotencyKey, provider, description) is consumed
 * separately by the pre-pass in `lib/engine/run.ts` to resolve the outcome — this handler
 * never needs those, since it already knows the idempotency key and constructs the
 * description itself. Shared by the acknowledgement step above and `handleOfferDespatched`:
 * both are ordinary customer-facing MESSAGE_SEND effects that may opt into execution-outcome
 * tracking the same way, and neither needs anything the other doesn't.
 */
const SendAttemptSchema = z.object({
  attemptId: z.string().min(1),
  provider: z.string().min(1),
  honorsIdempotencyKey: z.boolean(),
});

function readSendAttempt(
  payload: Readonly<Record<string, unknown>>,
): { attemptId: string; provider: string; honorsIdempotencyKey: boolean } | null {
  const raw = payload['sendAttempts'];
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const parsed = SendAttemptSchema.safeParse(raw[0]);
  return parsed.success ? parsed.data : null;
}

export const LEAD_RESCUE_HANDLERS: SystemHandlers = {
  systemId: 'lead-rescue',
  initialState: 'NEW',
  handlers: {
    'inbound.enquiry.received': handleEnquiry,
    'prospect.replied': handleReply,
    'human.decision.recorded': handleHumanDecision,
    'side_effect.reconciliation.attempted': handleReconciliation,
    'lead.wait.reevaluated': handleWaitReevaluation,
    'lead.offer.despatched': handleOfferDespatched,
  },
};
