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

const ConsentState = z.enum(['PERMITTED', 'SUPPRESSED']);

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

  steps.push({
    id: id('consent'),
    label: 'Consent screen',
    atOffsetSeconds: 3,
    summary: 'Contact permitted. No suppression or opt-out state on the resolved entity.',
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
        permittedActions: ['classify'],
        forbiddenActions: ['contact_before_consent_check'],
        selectedAction: 'classify',
        applicablePolicy: ['Suppression is evaluated before commercial intent, never after.'],
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
      statePatch: { awaitingHuman: 'Interpretation unavailable' },
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

  // --- Step 7: disposition (DETERMINISTIC mapping of class to lifecycle) ---
  const target = dispositionFor(judgment.classification, missing.length > 0);

  steps.push({
    id: id('disposition'),
    label: 'Disposition',
    atOffsetSeconds: 8,
    transitionTo: target.state,
    summary: target.summary,
    ...(target.state === 'NEEDS_HUMAN'
      ? { statePatch: { awaitingHuman: target.summary } }
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
  steps.push({
    id: id('acknowledge'),
    label: 'Acknowledgement',
    atOffsetSeconds: 9,
    summary: isDuplicateEvent
      ? 'Acknowledgement attempted and refused by the idempotency ledger. Nothing was sent.'
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
        verification: {
          check: 'Confirm exactly one acknowledgement exists for this entity.',
          expect: 'One acknowledgement recorded against the entity.',
        },
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
      statePatch: { awaitingHuman: 'Reply interpretation below confidence floor' },
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

function readJudgmentId(payload: Readonly<Record<string, unknown>>): string | null {
  const raw = payload['judgment'];
  if (typeof raw !== 'object' || raw === null) return null;
  const candidate = (raw as Record<string, unknown>)['judgmentId'];
  return typeof candidate === 'string' ? candidate : null;
}

export const LEAD_RESCUE_HANDLERS: SystemHandlers = {
  systemId: 'lead-rescue',
  initialState: 'NEW',
  handlers: {
    'inbound.enquiry.received': handleEnquiry,
    'prospect.replied': handleReply,
    'human.decision.recorded': handleHumanDecision,
  },
};
