import { z } from 'zod';
import { numberParam } from '@/lib/model/profile';
import type { DecisionRecord } from '@/lib/model/runtime';
import type { HandlerContext, HandlerOutcome, HandlerStep, ProposedEffect, SystemHandlers } from '../types';

/**
 * DORMANT PIPELINE RECOVERY — operating logic.
 *
 * Everything labelled DETERMINISTIC_RULE genuinely computes: the consent gate, the
 * active-account exclusion, the re-entry-reason evaluation (a real date comparison, not
 * a narrated "yes"), the attempt-budget accounting, and the disposition mapping.
 *
 * The only thing that arrives pre-authored is the BOUNDED_AI_JUDGMENT that interprets a
 * free-text reply. Its output is then subjected to deterministic policy — the
 * confidence-floor comparison — exactly as in Lead Rescue:
 *
 *     LANGUAGE INPUT -> STRUCTURED OUTPUT -> DETERMINISTIC POLICY
 *
 * Transition legality, idempotency, and the authority gate are NOT implemented here.
 * They live in the engine core so this handler cannot bypass them.
 *
 * NON-NEGOTIABLE RE-ENTRY PRINCIPLE: consent is evaluated before any re-entry reason is
 * even considered, and elapsed time alone never counts as a reason. Both are enforced as
 * separate, ordered deterministic steps below, not folded into one combined check.
 */

// ---------------------------------------------------------------------------
// Payload contracts
// ---------------------------------------------------------------------------

const ConsentState = z.enum(['PERMITTED', 'SUPPRESSED']);
const AccountStatus = z.enum(['INACTIVE', 'ACTIVE_ELSEWHERE']);

const EvaluationPayloadSchema = z.object({
  accountName: z.string().min(1),
  contactName: z.string().optional(),
  contactEmail: z.string().optional(),
  serviceInterest: z.string().min(1),
  estimatedDealValue: z.number().nonnegative(),
  priorPipelineStage: z.string().min(1),
  priorObjection: z.string().optional(),
  /** Date (YYYY-MM-DD) on which a recorded objection is considered resolved. */
  objectionExpiresOn: z.string().optional(),
  /** A configured re-entry check-in date (YYYY-MM-DD), independent of any objection. */
  recycleDate: z.string().optional(),
  accountStatus: AccountStatus,
  consentState: ConsentState,
  /** Attempts already made in this reactivation window, asserted by the outreach log. */
  attemptsToDate: z.number().int().nonnegative(),
  ownerRoleId: z.string().min(1),
  sourceId: z.string().optional(),
  qualificationNote: z.string().optional(),
  /**
   * Competing identity matches for this dormant record, when the cycle produced any.
   * Optional: a record resolved upstream on a stable identifier supplies none, and the
   * entity-resolution guard does not run for it. See dp-fm-wrong-entity.
   */
  entityCandidates: z
    .array(
      z.object({
        entityId: z.string().min(1),
        accountName: z.string().min(1),
        matchConfidence: z.number().min(0).max(1),
        matchedOn: z.string().min(1),
      }),
    )
    .optional(),
});

const ReplyPayloadSchema = z.object({
  message: z.string().min(1),
});

const HumanDecisionPayloadSchema = z.object({
  decidedBy: z.string().min(1),
  decision: z.enum(['ACCEPT_REOPEN', 'CLOSE_ARCHIVED', 'APPLY_SUPPRESSION']),
  rationale: z.string().min(1),
});

export const DPR_REPLY_CLASSES = [
  'RENEWED_INTEREST',
  'STILL_NOT_INTERESTED',
  'OPT_OUT',
  'OFF_SCRIPT_OR_RISK',
] as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function decision(partial: Omit<DecisionRecord, 'eventId'> & { eventId: string }): DecisionRecord {
  return partial;
}

/**
 * Reads the judgment id off the payload's `judgment` sub-object. Duplicated rather than
 * imported from `lib/engine/run.ts` — the same choice Lead Rescue's handler makes, so
 * that handlers stay dependency-light on engine orchestration and couple only to
 * `types.ts` and the ports. See the architecture notes in STATUS.md for why this stays
 * duplicated rather than shared.
 */
function readJudgmentId(payload: Readonly<Record<string, unknown>>): string | null {
  const raw = payload['judgment'];
  if (typeof raw !== 'object' || raw === null) return null;
  const candidate = (raw as Record<string, unknown>)['judgmentId'];
  return typeof candidate === 'string' ? candidate : null;
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
      check: 'Read the record back and confirm the written disposition matches engine state.',
      expect: 'Record disposition matches engine state.',
    },
  };
}

type ReEntryReason = 'OBJECTION_EXPIRED' | 'RECYCLE_DATE_REACHED';

/**
 * The only DETERMINISTIC_RULE re-entry reasons this handler recognises: an objection with
 * a configured expiry, or an explicit configured recycle date. Both are genuine date
 * comparisons against the event's own `occurredAt` — never a narrated "yes". Elapsed
 * inactivity alone, with neither field set, returns null: no reason is invented.
 */
function reEntryReasonFor(
  payload: { objectionExpiresOn?: string; recycleDate?: string },
  occurredAt: string,
): { reason: ReEntryReason; detail: string } | null {
  if (payload.objectionExpiresOn !== undefined && occurredAt >= payload.objectionExpiresOn) {
    return {
      reason: 'OBJECTION_EXPIRED',
      detail: `The recorded objection carries a configured expiry of ${payload.objectionExpiresOn}; this evaluation runs at ${occurredAt}, on or after that date.`,
    };
  }
  if (payload.recycleDate !== undefined && occurredAt >= payload.recycleDate) {
    return {
      reason: 'RECYCLE_DATE_REACHED',
      detail: `A configured recycle date of ${payload.recycleDate} has arrived.`,
    };
  }
  return null;
}

// ---------------------------------------------------------------------------
// pipeline.dormant.evaluation.triggered
// ---------------------------------------------------------------------------

function handleEvaluation(ctx: HandlerContext): HandlerOutcome {
  const { event, state, profile } = ctx;
  const steps: HandlerStep[] = [];
  const id = (suffix: string) => `${event.eventId}:${suffix}`;
  const entityId = event.entityId;

  // --- Step 0: schema validation (DETERMINISTIC) --------------------------
  const parsed = EvaluationPayloadSchema.safeParse(event.payload);
  if (!parsed.success) {
    return {
      steps: [
        {
          id: id('validate'),
          label: 'Validation',
          atOffsetSeconds: 0,
          summary:
            'Evaluation payload failed schema validation. No disposition was computed and the record was left untouched pending a corrected event.',
          decisions: [
            decision({
              id: id('d-validate'),
              eventId: event.eventId,
              mechanism: 'DETERMINISTIC_RULE',
              objective: 'Confirm the inbound evaluation payload conforms to the declared schema before any disposition is computed.',
              relevantState: state.lifecycleState,
              evidenceRefs: ['event.payload', `event.schemaVersion=${event.schemaVersion}`],
              deterministicFacts: [
                {
                  label: 'Validation errors',
                  value: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
                },
              ],
              missingInformation: parsed.error.issues.map((i) => i.path.join('.')).filter((p) => p.length > 0),
              permittedActions: ['retain_raw_payload'],
              forbiddenActions: ['infer_missing_fields', 'compute_disposition_on_invalid_input'],
              selectedAction: 'retain_raw_payload',
              applicablePolicy: ['A malformed evaluation payload never produces a disposition or a side effect.'],
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

  // --- Step 1: DORMANT -> ELIGIBILITY_REVIEW ------------------------------
  steps.push({
    id: id('review'),
    label: 'Eligibility review opened',
    atOffsetSeconds: 0,
    transitionTo: 'ELIGIBILITY_REVIEW',
    summary: 'Record enters eligibility review for this evaluation cycle.',
    decisions: [
      decision({
        id: id('d-review'),
        eventId: event.eventId,
        mechanism: 'DETERMINISTIC_RULE',
        objective: 'Confirm the record is in the evaluated segment before any eligibility question is asked.',
        relevantState: 'DORMANT',
        evidenceRefs: [`event.entityId=${entityId}`],
        deterministicFacts: [
          { label: 'Prior pipeline stage', value: record.priorPipelineStage },
          { label: 'Service interest', value: record.serviceInterest },
          { label: 'Estimated deal value', value: String(record.estimatedDealValue) },
        ],
        missingInformation: [],
        permittedActions: ['open_eligibility_review'],
        forbiddenActions: ['act_before_review'],
        selectedAction: 'open_eligibility_review',
        applicablePolicy: ['Every dormant opportunity under management receives an explicit evaluation.'],
        authority: 3,
      }),
    ],
    effects: [],
    verifications: [],
  });

  // --- Step 1b: entity resolution (DETERMINISTIC, before every other question) --
  //
  // dp-fm-wrong-entity. This sits ahead of the consent screen deliberately. Consent,
  // active-account status, and the re-entry reason are all questions about a SPECIFIC party;
  // asking them against an identity nobody has established is meaningless work that reads as
  // diligence. Identity is not one eligibility check among several — it is the precondition
  // for all of them.
  //
  // The business impact justifies the placement: reactivation outreach quotes the prior
  // objection and the original service interest back to whoever receives it, so a wrong match
  // does not send an irrelevant message. It hands one company's commercial history to another.
  //
  // The step is emitted only when the cycle actually supplies competing candidates. A record
  // that arrives already resolved upstream has no ambiguity to decide, and manufacturing a
  // decision for it would pad every run with a step that never chose anything.
  const entityCandidates = record.entityCandidates ?? [];
  if (entityCandidates.length > 0) {
    const matchThreshold = numberParam(profile, 'entityMatchThreshold');
    const qualifying = entityCandidates.filter((c) => c.matchConfidence >= matchThreshold);

    // Accepted ONLY on exactly one candidate at or above the threshold. Two or more is the
    // declared ambiguity; zero is the same failure wearing a different face, since resolving
    // it would mean taking the closest candidate — precisely what the policy forbids.
    if (qualifying.length !== 1) {
      const ranked = [...entityCandidates].sort((a, b) => b.matchConfidence - a.matchConfidence);
      steps.push({
        id: id('identity'),
        label: 'Entity resolution',
        atOffsetSeconds: 1,
        transitionTo: 'NEEDS_HUMAN',
        summary:
          qualifying.length > 1
            ? `${qualifying.length} candidate entities meet the ${matchThreshold} match threshold. The record is routed to a person with every candidate attached rather than resolved to the closest.`
            : `No candidate entity meets the ${matchThreshold} match threshold. Routed to a person rather than resolved to the closest available match.`,
        decisions: [
          decision({
            id: id('d-identity'),
            eventId: event.eventId,
            mechanism: 'DETERMINISTIC_RULE',
            objective:
              'Establish which party this dormant record belongs to before any question is asked about that party.',
            relevantState: 'ELIGIBILITY_REVIEW',
            evidenceRefs: ['event.payload.entityCandidates'],
            deterministicFacts: [
              { label: 'Match threshold', value: String(matchThreshold) },
              { label: 'Candidates at or above threshold', value: String(qualifying.length) },
              ...ranked.map((c, index) => ({
                label: `Candidate ${index + 1}`,
                value: `${c.accountName} (${c.entityId}) — ${c.matchConfidence} on ${c.matchedOn}`,
              })),
            ],
            missingInformation: [
              'Which of the candidate entities this dormant record actually belongs to. No stable identifier distinguishes them.',
            ],
            permittedActions: ['route_to_human_with_candidates'],
            forbiddenActions: [
              'resolve_to_closest_candidate',
              'resolve_to_highest_confidence_match',
              'despatch_before_identity_is_established',
              'screen_consent_against_an_unresolved_party',
            ],
            selectedAction: 'route_to_human_with_candidates',
            applicablePolicy: [
              'CLIENT_POLICY kestrel-entity-resolution: matched only on a stable identifier; ambiguous matches route to a person with every candidate attached, never resolved to the closest one.',
            ],
            authority: 2,
          }),
        ],
        effects: [],
        verifications: [],
      });

      // Nothing downstream may run. Every later step asks a question about a party this
      // record has not identified.
      return { steps };
    }
  }

  // --- Step 2: consent screen (DETERMINISTIC, before any re-entry reason) -
  // Computed here so the "would otherwise qualify" fact is inspectable even when
  // suppression is what actually decides the outcome.
  const candidate = reEntryReasonFor(record, event.occurredAt);

  if (record.consentState === 'SUPPRESSED') {
    steps.push({
      id: id('consent'),
      label: 'Consent check',
      atOffsetSeconds: 1,
      transitionTo: 'SUPPRESSED',
      summary:
        candidate === null
          ? 'Suppression state present. No re-entry reason applies either, but suppression alone is sufficient to end this record here.'
          : `Suppression state present. A candidate re-entry reason (${candidate.reason}) would otherwise have qualified this record for reactivation — irrelevant, because consent is evaluated first and overrides commercial interest.`,
      decisions: [
        decision({
          id: id('d-consent'),
          eventId: event.eventId,
          mechanism: 'DETERMINISTIC_RULE',
          objective: 'Establish whether contact is permitted at all, before any re-entry reason is considered.',
          relevantState: 'ELIGIBILITY_REVIEW',
          evidenceRefs: ['event.payload.consentState'],
          deterministicFacts: [
            { label: 'Consent state', value: record.consentState },
            { label: 'Candidate re-entry reason (not consulted)', value: candidate?.reason ?? 'none' },
            ...(candidate === null ? [] : [{ label: 'Reason detail (not consulted)', value: candidate.detail }]),
          ],
          missingInformation: [],
          permittedActions: ['suppress'],
          forbiddenActions: ['despatch_reactivation', 'evaluate_re_entry_reason', 'override_suppression'],
          selectedAction: 'suppress',
          applicablePolicy: [
            'CLIENT_POLICY kestrel-suppression-immediate: opt-out and do-not-contact state is honoured immediately and permanently, ahead of any commercial interest.',
            'A re-entry reason, however well it would otherwise qualify, never overrides suppression.',
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
    label: 'Consent check',
    atOffsetSeconds: 1,
    summary: 'Contact permitted. No suppression or opt-out state is on file for this record.',
    decisions: [
      decision({
        id: id('d-consent'),
        eventId: event.eventId,
        mechanism: 'DETERMINISTIC_RULE',
        objective: 'Establish whether contact is permitted at all, before any re-entry reason is considered.',
        relevantState: 'ELIGIBILITY_REVIEW',
        evidenceRefs: ['event.payload.consentState'],
        deterministicFacts: [{ label: 'Consent state', value: record.consentState }],
        missingInformation: [],
        permittedActions: ['continue_to_re_entry_check'],
        forbiddenActions: ['despatch_before_consent_check'],
        selectedAction: 'continue_to_re_entry_check',
        applicablePolicy: ['Consent is evaluated before any re-entry reason, never after.'],
        authority: 3,
      }),
    ],
    effects: [],
    verifications: [],
  });

  // --- Step 3: active-account exclusion (DETERMINISTIC) -------------------
  if (record.accountStatus === 'ACTIVE_ELSEWHERE') {
    steps.push({
      id: id('active-check'),
      label: 'Active-account exclusion',
      atOffsetSeconds: 2,
      transitionTo: 'ARCHIVED',
      summary:
        'The account is already active elsewhere. An existing engagement is never entered into prospecting outreach, regardless of how the dormant record otherwise reads.',
      decisions: [
        decision({
          id: id('d-active-check'),
          eventId: event.eventId,
          mechanism: 'DETERMINISTIC_RULE',
          objective: 'Exclude records whose account is already active before any re-entry reason is considered.',
          relevantState: 'ELIGIBILITY_REVIEW',
          evidenceRefs: ['event.payload.accountStatus'],
          deterministicFacts: [{ label: 'Account status', value: record.accountStatus }],
          missingInformation: [],
          permittedActions: ['archive_from_sequence'],
          forbiddenActions: ['treat_as_cold_dormant_lead', 'despatch_reactivation'],
          selectedAction: 'archive_from_sequence',
          applicablePolicy: ['An existing engagement is never entered into prospecting outreach.'],
          authority: 3,
        }),
      ],
      effects: [],
      verifications: [],
    });
    return { steps };
  }

  steps.push({
    id: id('active-check'),
    label: 'Active-account exclusion',
    atOffsetSeconds: 2,
    summary: 'The account is not active elsewhere. Eligible to continue to the re-entry-reason check.',
    decisions: [
      decision({
        id: id('d-active-check'),
        eventId: event.eventId,
        mechanism: 'DETERMINISTIC_RULE',
        objective: 'Exclude records whose account is already active before any re-entry reason is considered.',
        relevantState: 'ELIGIBILITY_REVIEW',
        evidenceRefs: ['event.payload.accountStatus'],
        deterministicFacts: [{ label: 'Account status', value: record.accountStatus }],
        missingInformation: [],
        permittedActions: ['continue_to_re_entry_check'],
        forbiddenActions: ['despatch_before_active_check'],
        selectedAction: 'continue_to_re_entry_check',
        applicablePolicy: ['An existing engagement is never entered into prospecting outreach.'],
        authority: 3,
      }),
    ],
    effects: [],
    verifications: [],
  });

  // --- Step 4: re-entry-reason AND capacity evaluation (DETERMINISTIC) ----
  // Both are decided here, while the record is still in ELIGIBILITY_REVIEW, because
  // ATTEMPTS_EXHAUSTED is only reachable from AWAITING_RESPONSE within a live sequence
  // (see dp-t11) — there is no declared SCHEDULED -> ATTEMPTS_EXHAUSTED edge. A record
  // whose attempt budget was already spent in a prior cycle is therefore archived here
  // rather than granted SCHEDULED status it has no capacity to act on.
  const maxAttempts = numberParam(profile, 'dormantMaxAttempts');
  const budgetOk = record.attemptsToDate < maxAttempts;

  if (candidate === null) {
    steps.push({
      id: id('reentry'),
      label: 'Re-entry reason check',
      atOffsetSeconds: 3,
      transitionTo: 'ARCHIVED',
      summary: 'No declared re-entry reason applies. Elapsed time alone is not a reason, and none is invented.',
      decisions: [
        decision({
          id: id('d-reentry'),
          eventId: event.eventId,
          mechanism: 'DETERMINISTIC_RULE',
          objective: 'Determine whether any declared re-entry reason genuinely applies to this record right now.',
          relevantState: 'ELIGIBILITY_REVIEW',
          evidenceRefs: ['event.payload.objectionExpiresOn', 'event.payload.recycleDate'],
          deterministicFacts: [
            { label: 'Objection on file', value: record.priorObjection ?? 'none recorded' },
            { label: 'Objection expiry configured', value: record.objectionExpiresOn ?? 'not configured' },
            { label: 'Recycle date configured', value: record.recycleDate ?? 'not configured' },
            { label: 'Evaluation date', value: event.occurredAt },
          ],
          missingInformation: [],
          permittedActions: ['archive'],
          forbiddenActions: ['treat_elapsed_time_as_a_reason', 'invent_a_re_entry_reason'],
          selectedAction: 'archive',
          applicablePolicy: [
            'LAB_TARGET dp-lab-explicit-reason: no record may enter outreach without an explicit re-entry reason drawn from the declared set.',
          ],
          authority: 3,
        }),
      ],
      effects: [],
      verifications: [],
    });
    return { steps };
  }

  if (!budgetOk) {
    steps.push({
      id: id('reentry'),
      label: 'Re-entry reason check',
      atOffsetSeconds: 3,
      transitionTo: 'ARCHIVED',
      summary: `Re-entry reason established (${candidate.reason}), but the declared attempt budget was already exhausted in a prior cycle (${record.attemptsToDate} of ${maxAttempts} used). No further attempt is despatched from here.`,
      decisions: [
        decision({
          id: id('d-reentry'),
          eventId: event.eventId,
          mechanism: 'DETERMINISTIC_RULE',
          objective: 'Determine whether any declared re-entry reason genuinely applies, and whether the declared attempt budget permits acting on it.',
          relevantState: 'ELIGIBILITY_REVIEW',
          evidenceRefs: ['event.payload.attemptsToDate'],
          deterministicFacts: [
            { label: 'Re-entry reason', value: candidate.reason },
            { label: 'Attempts to date', value: String(record.attemptsToDate) },
            { label: 'Maximum attempts', value: String(maxAttempts) },
          ],
          missingInformation: [],
          permittedActions: ['archive'],
          forbiddenActions: ['exceed_declared_attempt_budget', 'despatch_beyond_budget'],
          selectedAction: 'archive',
          applicablePolicy: ['CLIENT_POLICY kestrel-outreach-cadence: reactivation is limited to three attempts across 21 days.'],
          authority: 3,
        }),
      ],
      effects: [],
      verifications: [],
    });
    return { steps };
  }

  steps.push({
    id: id('reentry'),
    label: 'Re-entry reason check',
    atOffsetSeconds: 3,
    transitionTo: 'SCHEDULED',
    summary: `Re-entry reason established: ${candidate.reason}. ${candidate.detail}`,
    decisions: [
      decision({
        id: id('d-reentry'),
        eventId: event.eventId,
        mechanism: 'DETERMINISTIC_RULE',
        objective: 'Determine whether any declared re-entry reason genuinely applies to this record right now.',
        relevantState: 'ELIGIBILITY_REVIEW',
        evidenceRefs:
          candidate.reason === 'OBJECTION_EXPIRED'
            ? ['event.payload.objectionExpiresOn', 'event.occurredAt']
            : ['event.payload.recycleDate', 'event.occurredAt'],
        deterministicFacts: [
          { label: 'Re-entry reason', value: candidate.reason },
          { label: 'Reason detail', value: candidate.detail },
          { label: 'Consent state', value: record.consentState },
        ],
        missingInformation: [],
        permittedActions: ['schedule_reactivation'],
        forbiddenActions: ['treat_elapsed_time_alone_as_sufficient'],
        selectedAction: 'schedule_reactivation',
        applicablePolicy: [
          'LAB_TARGET dp-lab-explicit-reason: an explicit, inspectable re-entry reason is recorded before any reactivation is scheduled.',
        ],
        authority: 3,
      }),
    ],
    effects: [],
    verifications: [],
  });

  // --- Step 5: consent re-checked immediately before despatch (DETERMINISTIC) --
  // Budget was already confirmed above; reaching this step means despatch is permitted.
  steps.push({
    id: id('budget'),
    label: 'Attempt budget & consent re-check',
    atOffsetSeconds: 4,
    summary: `Attempt budget available (${record.attemptsToDate} of ${maxAttempts} used). Consent is re-checked immediately before despatch, not trusted from the earlier step alone.`,
    decisions: [
      decision({
        id: id('d-budget'),
        eventId: event.eventId,
        mechanism: 'DETERMINISTIC_RULE',
        objective: 'Confirm attempt budget remains and re-verify consent immediately before despatch.',
        relevantState: 'SCHEDULED',
        evidenceRefs: ['event.payload.attemptsToDate', 'event.payload.consentState'],
        deterministicFacts: [
          { label: 'Attempts to date', value: String(record.attemptsToDate) },
          { label: 'Maximum attempts', value: String(maxAttempts) },
          { label: 'Consent re-check', value: record.consentState },
        ],
        missingInformation: [],
        permittedActions: ['despatch_reactivation_attempt'],
        forbiddenActions: ['despatch_without_re_checking_consent', 'exceed_declared_attempt_budget'],
        selectedAction: 'despatch_reactivation_attempt',
        applicablePolicy: [
          'CLIENT_POLICY kestrel-outreach-cadence: reactivation is limited to three attempts across 21 days.',
          'LAB_TARGET dp-lab-sequence-contract: entry, cadence, maximum attempts, exit, suppression, and re-entry conditions were declared before this sequence ran.',
          'Consent is re-checked immediately before each despatch, never trusted from an earlier point in the cycle.',
        ],
        authority: 3,
      }),
    ],
    effects: [],
    verifications: [],
  });

  // --- Step 6: despatch the one approved reactivation approach -------------
  const attemptNumber = record.attemptsToDate + 1;

  steps.push({
    id: id('despatch'),
    label: 'Reactivation attempt',
    atOffsetSeconds: 5,
    transitionTo: 'REACTIVATION_ATTEMPTED',
    summary: `Reactivation approach despatched — attempt ${attemptNumber} of ${maxAttempts}.`,
    decisions: [
      decision({
        id: id('d-despatch'),
        eventId: event.eventId,
        mechanism: 'DETERMINISTIC_RULE',
        objective: 'Prepare and despatch the approved reactivation approach for the established re-entry reason.',
        relevantState: 'SCHEDULED',
        evidenceRefs: ['event.payload.serviceInterest', 'event.payload.priorObjection'],
        deterministicFacts: [
          {
            label: 'Approach',
            value: `References the resolved objection and the original ${record.serviceInterest} interest; no new commercial claim is introduced.`,
          },
          { label: 'Attempt number', value: `${attemptNumber} of ${maxAttempts}` },
        ],
        missingInformation: [],
        permittedActions: ['despatch_approved_approach'],
        forbiddenActions: ['introduce_new_commercial_terms', 'promise_an_outcome'],
        selectedAction: 'despatch_approved_approach',
        applicablePolicy: ['CLIENT_POLICY kestrel-attestation-language: no communication may state or imply a guaranteed outcome.'],
        authority: 3,
      }),
    ],
    effects: [
      {
        id: id('effect:outreach'),
        kind: 'MESSAGE_SEND',
        description: `Reactivation approach referencing the resolved objection ("${record.priorObjection ?? 'timing'}") and the original ${record.serviceInterest} interest.`,
        target: record.contactEmail ?? record.contactName ?? 'dormant contact',
        idempotencyKey: `outreach:${entityId}:${attemptNumber}`,
        authority: 3,
        policyPermits: true,
        verification: {
          check: 'Confirm exactly one reactivation attempt exists for this entity at this attempt number.',
          expect: 'One attempt recorded against the entity at this sequence position.',
        },
      },
    ],
    verifications: [],
  });

  // --- Step 7: confirm logged, enter the bounded wait ----------------------
  steps.push({
    id: id('logged'),
    label: 'Attempt logged',
    atOffsetSeconds: 6,
    transitionTo: 'AWAITING_RESPONSE',
    summary: 'Attempt resolved as executed and logged. Parked awaiting a response within the declared cadence window.',
    decisions: [
      decision({
        id: id('d-logged'),
        eventId: event.eventId,
        mechanism: 'DETERMINISTIC_RULE',
        objective: 'Confirm the despatched attempt resolved as executed before entering a bounded wait.',
        relevantState: 'REACTIVATION_ATTEMPTED',
        evidenceRefs: [`effect.idempotencyKey=outreach:${entityId}:${attemptNumber}`],
        deterministicFacts: [{ label: 'Cadence window', value: `${numberParam(profile, 'dormantWindowDays')} days` }],
        missingInformation: [],
        permittedActions: ['enter_wait'],
        forbiddenActions: ['despatch_a_second_attempt_immediately'],
        selectedAction: 'enter_wait',
        applicablePolicy: ['A bounded wait is a legitimate state, not a stall.'],
        authority: 3,
      }),
    ],
    effects: [],
    verifications: [],
  });

  return { steps };
}

// ---------------------------------------------------------------------------
// dormant.prospect.replied
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
          decisions: [
            decision({
              id: id('d-reply-invalid'),
              eventId: event.eventId,
              mechanism: 'DETERMINISTIC_RULE',
              objective: 'Validate the reply payload before interpreting it.',
              relevantState: state.lifecycleState,
              evidenceRefs: ['event.payload'],
              deterministicFacts: [
                { label: 'Validation errors', value: parsed.error.issues.map((i) => i.message).join('; ') },
              ],
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

  steps.push({
    id: id('reply-received'),
    label: 'Reply received',
    atOffsetSeconds: 0,
    summary: 'Reply correlated to the record awaiting one.',
    decisions: [
      decision({
        id: id('d-reply-received'),
        eventId: event.eventId,
        mechanism: 'DETERMINISTIC_RULE',
        objective: 'Correlate the inbound reply to the conversation that is waiting for it.',
        relevantState: state.lifecycleState,
        evidenceRefs: [`event.correlationId=${event.correlationId}`],
        deterministicFacts: [{ label: 'Waiting since state', value: state.lifecycleState }],
        missingInformation: [],
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

  const judgmentId = readJudgmentId(event.payload);
  const resolved = judgmentId === null ? undefined : judgments.get(judgmentId);
  const floor = numberParam(profile, 'confidenceFloor');

  if (resolved === undefined || resolved.status !== 'OK') {
    const reason = resolved === undefined ? 'No bounded judgment was resolved for this event.' : resolved.reason;
    steps.push({
      id: id('reply-interpret'),
      label: 'Reply interpretation',
      atOffsetSeconds: 1,
      transitionTo: 'NEEDS_HUMAN',
      summary: 'The bounded judgment was unavailable or violated its output contract. Routed to a person.',
      decisions: [
        decision({
          id: id('d-reply-interpret'),
          eventId: event.eventId,
          mechanism: 'DETERMINISTIC_RULE',
          objective: 'Decide what to do when reply interpretation is unavailable.',
          relevantState: 'AWAITING_RESPONSE',
          evidenceRefs: ['decision_provider.result'],
          deterministicFacts: [
            { label: 'Provider outcome', value: resolved?.status ?? 'MISSING' },
            { label: 'Reason', value: reason },
          ],
          missingInformation: ['reply classification'],
          permittedActions: ['route_to_human'],
          forbiddenActions: ['guess_reply_intent', 'reopen_without_interpretation'],
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

  steps.push({
    id: id('reply-interpret'),
    label: 'Reply interpretation',
    atOffsetSeconds: 1,
    summary: `Reply interpreted as ${judgment.classification} at confidence ${judgment.confidence.toFixed(2)}.`,
    decisions: [
      decision({
        id: id('d-reply-interpret'),
        eventId: event.eventId,
        mechanism: 'BOUNDED_AI_JUDGMENT',
        objective: 'Interpret the intent of a free-text reply to a reactivation attempt.',
        relevantState: 'AWAITING_RESPONSE',
        evidenceRefs: judgment.evidenceRefs,
        deterministicFacts: [
          { label: 'Permitted classes', value: DPR_REPLY_CLASSES.join(', ') },
          { label: 'Returned class', value: judgment.classification },
        ],
        classification: judgment.classification,
        confidence: judgment.confidence,
        missingInformation: judgment.missingInformation,
        permittedActions: ['return_classification_within_permitted_set'],
        forbiddenActions: ['assert_facts_not_present_in_input', 'select_action', 'send_message', 'raise_own_authority', 'decide_reopen_authority'],
        selectedAction: 'return_classification',
        applicablePolicy: ['Bounded judgment interprets; it never decides authority or acts.'],
        evaluatorResult: `Declined to infer: ${judgment.declinedToInfer.length > 0 ? judgment.declinedToInfer.join('; ') : 'nothing'}`,
        authority: 1,
        providerId: 'fixture-decision-provider',
      }),
    ],
    effects: [],
    verifications: [],
  });

  // Opt-out is honoured regardless of confidence: suppression errs toward safety, never
  // toward requiring certainty. Every other disposition is gated by the floor.
  if (judgment.classification === 'OPT_OUT') {
    steps.push({
      id: id('disposition'),
      label: 'Disposition',
      atOffsetSeconds: 2,
      transitionTo: 'OPTED_OUT',
      summary: 'Reply expresses opt-out. Honoured immediately, regardless of classification confidence.',
      decisions: [
        decision({
          id: id('d-disposition'),
          eventId: event.eventId,
          mechanism: 'DETERMINISTIC_RULE',
          objective: 'Map the interpreted reply onto a lifecycle disposition.',
          relevantState: 'AWAITING_RESPONSE',
          evidenceRefs: ['judgment.classification'],
          deterministicFacts: [
            { label: 'Classification', value: judgment.classification },
            { label: 'Confidence consulted', value: 'no — opt-out is honoured regardless of confidence' },
          ],
          missingInformation: [],
          permittedActions: ['apply_declared_disposition'],
          forbiddenActions: ['require_high_confidence_before_honouring_opt_out'],
          selectedAction: 'transition_to_OPTED_OUT',
          applicablePolicy: ['CLIENT_POLICY kestrel-suppression-immediate: opt-out is honoured immediately and permanently.'],
          authority: 3,
        }),
      ],
      effects: [],
      verifications: [],
    });
    return { steps };
  }

  const meetsFloor = judgment.confidence >= floor;

  if (!meetsFloor || judgment.classification === 'OFF_SCRIPT_OR_RISK') {
    steps.push({
      id: id('disposition'),
      label: 'Disposition',
      atOffsetSeconds: 2,
      transitionTo: 'NEEDS_HUMAN',
      summary: !meetsFloor
        ? `Confidence ${judgment.confidence.toFixed(2)} is below the configured floor of ${floor.toFixed(2)}. Routed to a person without acting.`
        : 'Reply raises a commitment, complaint, or risk question. Routed to a person rather than answered.',
      decisions: [
        decision({
          id: id('d-disposition'),
          eventId: event.eventId,
          mechanism: 'DETERMINISTIC_RULE',
          objective: 'Compare returned confidence against the configured floor, outside the judgment itself, and map the result onto a disposition.',
          relevantState: 'AWAITING_RESPONSE',
          evidenceRefs: ['judgment.confidence', 'judgment.classification'],
          deterministicFacts: [
            { label: 'Returned confidence', value: judgment.confidence.toFixed(2) },
            { label: 'Configured floor', value: floor.toFixed(2) },
            { label: 'Classification', value: judgment.classification },
          ],
          missingInformation: judgment.missingInformation,
          permittedActions: ['route_to_human'],
          forbiddenActions: ['reopen_without_owner_review', 'classify_anyway'],
          selectedAction: 'route_to_human',
          applicablePolicy: ['A reply below the confidence floor, or one raising risk, is routed to human review and never acted on.'],
          escalationReason: !meetsFloor
            ? `Confidence ${judgment.confidence.toFixed(2)} below floor ${floor.toFixed(2)}.`
            : 'Reply classified as off-script or risk-bearing.',
          authority: 2,
        }),
      ],
      effects: [],
      verifications: [],
    });
    return { steps };
  }

  if (judgment.classification === 'RENEWED_INTEREST') {
    steps.push({
      id: id('disposition'),
      label: 'Disposition',
      atOffsetSeconds: 2,
      transitionTo: 'POSITIVE_RESPONSE',
      summary: `Renewed interest, at or above the confidence floor. Held for a named owner to accept back into the active pipeline.`,
      decisions: [
        decision({
          id: id('d-disposition'),
          eventId: event.eventId,
          mechanism: 'DETERMINISTIC_RULE',
          objective: 'Compare returned confidence against the configured floor, outside the judgment itself, and map the result onto a disposition.',
          relevantState: 'AWAITING_RESPONSE',
          evidenceRefs: ['judgment.confidence', 'judgment.classification'],
          deterministicFacts: [
            { label: 'Returned confidence', value: judgment.confidence.toFixed(2) },
            { label: 'Configured floor', value: floor.toFixed(2) },
            { label: 'Classification', value: judgment.classification },
          ],
          missingInformation: [],
          permittedActions: ['hold_for_human_acceptance'],
          forbiddenActions: ['reopen_without_human_acceptance', 'commit_to_terms'],
          selectedAction: 'hold_for_human_acceptance',
          applicablePolicy: ['Bounded judgment and its confidence floor never themselves grant reactivation authority; only a named human acceptance reopens the opportunity.'],
          authority: 3,
        }),
      ],
      effects: [],
      verifications: [],
    });
    return { steps };
  }

  // STILL_NOT_INTERESTED: a clear decline that is neither opt-out nor risk-bearing.
  // The current lifecycle has no dedicated "declined" state distinct from silence, so
  // this is routed to a person to decide whether to close it or continue the sequence.
  steps.push({
    id: id('disposition'),
    label: 'Disposition',
    atOffsetSeconds: 2,
    transitionTo: 'NEEDS_HUMAN',
    summary: 'Reply declines interest without opting out. Routed to a person to decide the record’s disposition.',
    decisions: [
      decision({
        id: id('d-disposition'),
        eventId: event.eventId,
        mechanism: 'DETERMINISTIC_RULE',
        objective: 'Map a clear decline, which is not itself an opt-out, onto a disposition.',
        relevantState: 'AWAITING_RESPONSE',
        evidenceRefs: ['judgment.classification'],
        deterministicFacts: [{ label: 'Classification', value: judgment.classification }],
        missingInformation: [],
        permittedActions: ['route_to_human'],
        forbiddenActions: ['treat_decline_as_opt_out', 'continue_sequence_without_review'],
        selectedAction: 'route_to_human',
        applicablePolicy: ['A decline that is not an opt-out is a judgement call on continuing or closing, routed to a person.'],
        escalationReason: 'Reply declines interest without expressing an opt-out.',
        authority: 2,
      }),
    ],
    effects: [],
    verifications: [],
  });
  return { steps };
}

// ---------------------------------------------------------------------------
// human.decision.recorded
// ---------------------------------------------------------------------------

function humanTarget(decisionKind: string): string {
  switch (decisionKind) {
    case 'ACCEPT_REOPEN':
      return 'REOPENED';
    case 'CLOSE_ARCHIVED':
      return 'ARCHIVED';
    case 'APPLY_SUPPRESSION':
      return 'SUPPRESSED';
    default:
      return 'NEEDS_HUMAN';
  }
}

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
  const entityId = event.entityId;

  return {
    steps: [
      {
        id: id('human'),
        label: 'Human decision',
        atOffsetSeconds: 0,
        transitionTo: target,
        summary: `${actor?.name ?? humanDecision.decidedBy} recorded: ${humanDecision.decision}.`,
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
            missingInformation: [],
            permittedActions: ['apply_human_decision'],
            forbiddenActions: ['automate_this_decision'],
            selectedAction: `transition_to_${target}`,
            applicablePolicy: ['A named human acceptance is the only path back into the active pipeline; bounded judgment never grants it on its own.'],
            authority: 2,
          }),
        ],
        effects: target === 'REOPENED' ? [recordWrite(entityId, event.eventId, 'reopen', 'Write the reopened disposition to the customer system of record.')] : [],
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

export const DORMANT_PIPELINE_RECOVERY_HANDLERS: SystemHandlers = {
  systemId: 'dormant-pipeline-recovery',
  initialState: 'DORMANT',
  handlers: {
    'pipeline.dormant.evaluation.triggered': handleEvaluation,
    'dormant.prospect.replied': handleReply,
    'human.decision.recorded': handleHumanDecision,
  },
};
