import type {
  CanonicalEvent,
  DecisionRecord,
  SideEffect,
  SideEffectStatus,
  StateTransition,
  TechnicalExecution,
  TimelineEntry,
  VerificationRecord,
} from '@/lib/model/runtime';
import type { AuthorityLevel, SystemDefinition } from '@/lib/model/system';
import type { BusinessProfile } from '@/lib/model/profile';
import type { ResolvedJudgment } from '@/lib/ports/decision-provider';
import type { ResolvedExtraction } from '@/lib/ports/extraction-provider';
import type { ResolvedSend, ResolvedVerify } from '@/lib/ports/side-effect-executor';
import type {
  EngineInternals,
  EngineState,
  HandlerStep,
  ProposedEffect,
  SystemHandlers,
} from './types';

/**
 * THE PURE CORE.
 *
 * `applyEvent` is synchronous, total, and free of clocks and randomness. Given the same
 * state, event, and resolved judgments it produces byte-identical output forever.
 *
 * Four guarantees live HERE rather than in per-system handlers, so all six systems
 * inherit them and no handler can opt out:
 *
 *   1. TRANSITION LEGALITY — a handler may *request* a lifecycle move; only a declared
 *      TransitionRule can authorise one. Illegal requests are recorded as rejected
 *      transitions and the state does not move.
 *   2. IDEMPOTENCY — every side effect claims a key. A second claim is refused and
 *      recorded as SUPPRESSED_DUPLICATE.
 *   3. AUTHORITY — the ladder is enforced uniformly. Levels 0-1 never act externally,
 *      level 2 parks for approval, levels 3-4 may execute.
 *   4. RETRY SAFETY — an effect opted into execution tracking (`execution.kind === 'SEND'`)
 *      whose outcome came back OUTCOME_UNKNOWN cannot be retried by a later attempt on
 *      the same key unless an independent VERIFY attempt proved non-execution, or the
 *      provider itself is known to honour the idempotency key. See `ExecutionLedger`.
 *
 * A handler cannot bypass any of the four, which is what makes the reliability claims
 * structural rather than decorative.
 */

export interface ExecutionOutcomes {
  readonly send: ReadonlyMap<string, ResolvedSend>;
  readonly verify: ReadonlyMap<string, ResolvedVerify>;
}

export interface StepDeps {
  readonly system: SystemDefinition;
  readonly profile: BusinessProfile;
  readonly handlers: SystemHandlers;
  readonly judgments: ReadonlyMap<string, ResolvedJudgment>;
  /** Optional: only Call-to-Proposal's handler reads this. See `HandlerContext.extractions`. */
  readonly extractions?: ReadonlyMap<string, ResolvedExtraction>;
  readonly internals: EngineInternals;
  /**
   * Pre-resolved send/verify outcomes, keyed by attemptId. Resolved async, before this
   * runs. Optional: most call sites propose no execution-tracked effects and never need it.
   */
  readonly executionOutcomes?: ExecutionOutcomes;
}

const EMPTY_EXECUTION_OUTCOMES: ExecutionOutcomes = { send: new Map(), verify: new Map() };
const EMPTY_EXTRACTIONS: ReadonlyMap<string, ResolvedExtraction> = new Map();

export interface ApplyResult {
  readonly state: EngineState;
  readonly entries: readonly TimelineEntry[];
}

type AuthorityOutcome = 'NO_EXTERNAL_ACTION' | 'AWAITING_APPROVAL' | 'MAY_EXECUTE';

/** Reasoning capability never raises this. Only the assigned level matters. */
export function authorityOutcome(level: AuthorityLevel): AuthorityOutcome {
  if (level <= 1) return 'NO_EXTERNAL_ACTION';
  if (level === 2) return 'AWAITING_APPROVAL';
  return 'MAY_EXECUTE';
}

export function applyEvent(
  state: EngineState,
  event: CanonicalEvent,
  deps: StepDeps,
): ApplyResult {
  const { system, profile, handlers, judgments, internals } = deps;
  const executionOutcomes = deps.executionOutcomes ?? EMPTY_EXECUTION_OUTCOMES;
  const extractions = deps.extractions ?? EMPTY_EXTRACTIONS;

  const observation = internals.events.observe(event.source, event.sourceEventId, event.eventId);
  const isDuplicateEvent = observation === 'DUPLICATE';

  const handler = handlers.handlers[event.type];
  if (handler === undefined) {
    return { state, entries: [unhandledEntry(state, event, handlers)] };
  }

  const outcome = handler({
    event,
    state,
    system,
    profile,
    judgments,
    extractions,
    ledger: { has: (key: string) => internals.effects.has(key) },
    isDuplicateEvent,
  });

  const entries: TimelineEntry[] = [];
  let current = state;

  for (const handlerStep of outcome.steps) {
    const result = applyStep(current, event, handlerStep, system, internals, executionOutcomes);
    current = result.state;
    entries.push(result.entry);
  }

  return { state: current, entries };
}

function applyStep(
  state: EngineState,
  event: CanonicalEvent,
  handlerStep: HandlerStep,
  system: SystemDefinition,
  internals: EngineInternals,
  executionOutcomes: ExecutionOutcomes,
): { state: EngineState; entry: TimelineEntry } {
  // --- Side effects: policy gate, then authority gate, then ledger admission ---
  const sideEffects: SideEffect[] = [];
  const verifications: VerificationRecord[] = [...handlerStep.verifications];

  for (const proposed of handlerStep.effects) {
    const { status, detail, technical } = resolveEffect(proposed, event, internals, executionOutcomes);
    sideEffects.push({
      id: proposed.id,
      eventId: event.eventId,
      kind: proposed.kind,
      description: proposed.description,
      target: proposed.target,
      idempotencyKey: proposed.idempotencyKey,
      status,
      authority: proposed.authority,
      // Nothing in this build leaves the process. Asserted in tests/engine.test.ts.
      executionMode: 'SIMULATED',
      ...(detail === undefined ? {} : { detail }),
      ...(technical === undefined ? {} : { technical }),
    });

    if (proposed.verification !== undefined) {
      verifications.push({
        id: `${proposed.id}:verify`,
        eventId: event.eventId,
        sideEffectId: proposed.id,
        check: proposed.verification.check,
        result: status === 'EXECUTED' ? 'PASS' : 'NOT_APPLICABLE',
        detail:
          status === 'EXECUTED'
            ? proposed.verification.expect
            : `Not evaluated: the side effect resolved as ${status}.`,
      });
    }
  }

  // --- Lifecycle transition: only a declared rule may move the state ---
  const transitions: StateTransition[] = [];
  let nextLifecycleState = state.lifecycleState;

  if (handlerStep.transitionTo !== undefined && handlerStep.transitionTo !== state.lifecycleState) {
    const rule = system.lifecycle.transitions.find(
      (t) => t.from === state.lifecycleState && t.to === handlerStep.transitionTo,
    );

    if (rule === undefined) {
      transitions.push({
        id: `${handlerStep.id}:transition`,
        eventId: event.eventId,
        from: state.lifecycleState,
        to: handlerStep.transitionTo,
        mechanism: 'DETERMINISTIC_RULE',
        accepted: false,
        rejectionReason: `No declared transition permits ${state.lifecycleState} -> ${handlerStep.transitionTo}. The state did not move.`,
      });
    } else {
      transitions.push({
        id: `${handlerStep.id}:transition`,
        eventId: event.eventId,
        from: state.lifecycleState,
        to: handlerStep.transitionTo,
        ruleId: rule.id,
        mechanism: rule.mechanism,
        accepted: true,
      });
      nextLifecycleState = handlerStep.transitionTo;
    }
  }

  const patch = handlerStep.statePatch ?? {};
  const nextState: EngineState = {
    lifecycleState: nextLifecycleState,
    facts: patch.facts === undefined ? state.facts : { ...state.facts, ...patch.facts },
    suppressed: patch.suppressed ?? state.suppressed,
    awaitingHuman: patch.awaitingHuman === undefined ? state.awaitingHuman : patch.awaitingHuman,
    missingInformation: patch.missingInformation ?? state.missingInformation,
  };

  return {
    state: nextState,
    entry: {
      id: handlerStep.id,
      event,
      stepLabel: handlerStep.label,
      atOffsetSeconds: handlerStep.atOffsetSeconds,
      transitions,
      decisions: handlerStep.decisions,
      sideEffects,
      verifications,
      stateAfter: nextState.lifecycleState,
      summary: handlerStep.summary,
    },
  };
}

interface EffectResolution {
  readonly status: SideEffectStatus;
  readonly detail?: string;
  readonly technical?: TechnicalExecution;
}

function resolveEffect(
  proposed: ProposedEffect,
  event: CanonicalEvent,
  internals: EngineInternals,
  executionOutcomes: ExecutionOutcomes,
): EffectResolution {
  if (!proposed.policyPermits) {
    return { status: 'BLOCKED_BY_POLICY', detail: proposed.policyReason ?? 'Blocked by policy.' };
  }

  const gate = authorityOutcome(proposed.authority);
  if (gate === 'NO_EXTERNAL_ACTION') {
    return {
      status: 'BLOCKED_BY_POLICY',
      detail: `Authority level ${proposed.authority} permits observation or recommendation only; no action was taken.`,
    };
  }
  if (gate === 'AWAITING_APPROVAL') {
    return {
      status: 'AWAITING_APPROVAL',
      detail: 'Authority level 2: prepared and held for human approval. Nothing was sent.',
    };
  }

  // No execution-tracking requested: the existing always-succeeds path, unchanged.
  if (proposed.execution === undefined) {
    const attempt = internals.effects.claim(proposed.idempotencyKey, proposed.id, event.eventId);
    if (attempt.outcome === 'DUPLICATE') {
      return {
        status: 'SUPPRESSED_DUPLICATE',
        detail: `Idempotency key "${proposed.idempotencyKey}" was already claimed by side effect ${attempt.original.sideEffectId} on event ${attempt.original.eventId}. No second action was taken.`,
      };
    }
    return { status: 'EXECUTED' };
  }

  if (proposed.execution.kind === 'VERIFY') {
    return resolveVerifyEffect(proposed, event, internals, executionOutcomes.verify);
  }

  return resolveSendEffect(proposed, event, internals, executionOutcomes.send);
}

function resolveSendEffect(
  proposed: ProposedEffect,
  event: CanonicalEvent,
  internals: EngineInternals,
  sendOutcomes: ReadonlyMap<string, ResolvedSend>,
): EffectResolution {
  const execution = proposed.execution;
  if (execution === undefined || execution.kind !== 'SEND') {
    throw new Error(`resolveSendEffect called on effect "${proposed.id}" without a SEND execution`);
  }

  const claim = internals.executions.evaluate(proposed.idempotencyKey, execution.honorsIdempotencyKey);

  if (claim.decision === 'ALREADY_SUCCEEDED') {
    const last = claim.history[claim.history.length - 1];
    return {
      status: 'SUPPRESSED_DUPLICATE',
      detail: `A prior attempt on idempotency key "${proposed.idempotencyKey}" already confirmed success${last?.outcome.kind === 'SUCCEEDED' && last.outcome.externalId !== undefined ? ` (external id ${last.outcome.externalId})` : ''}. No second attempt was made.`,
    };
  }

  if (claim.decision === 'BLOCKED_PENDING_VERIFICATION') {
    return {
      status: 'OUTCOME_UNKNOWN',
      detail: `A prior attempt on idempotency key "${proposed.idempotencyKey}" returned no confirmation, and the provider does not guarantee idempotent processing of this key. Retrying blindly could duplicate a customer-facing effect, so this attempt was refused pending independent verification.`,
      technical: {
        attempt: claim.history.length,
        provider: 'unknown — attempt refused before a provider was contacted',
        attemptedAt: event.occurredAt,
        outcomeKind: 'RETRY_BLOCKED_PENDING_VERIFICATION',
        retrySafety: 'UNSAFE',
        verificationStatus: internals.executions.verificationStatusFor(proposed.idempotencyKey),
      },
    };
  }

  const resolved = sendOutcomes.get(execution.attemptId);
  if (resolved === undefined || resolved.status !== 'OK') {
    const reason =
      resolved === undefined ? 'No send outcome was resolved for this attempt.' : resolved.reason;
    return {
      status: 'FAILED',
      detail: `Send attempt contract violation or unavailable outcome: ${reason}`,
      technical: {
        attempt: claim.attempt,
        provider: 'unknown',
        attemptedAt: event.occurredAt,
        outcomeKind: 'CONTRACT_VIOLATION',
        retrySafety: 'SAFE',
        verificationStatus: 'NOT_APPLICABLE',
      },
    };
  }

  const outcome = resolved.result;
  internals.executions.record(proposed.idempotencyKey, {
    attempt: claim.attempt,
    outcome,
    sideEffectId: proposed.id,
    eventId: event.eventId,
  });

  const baseTechnical = {
    attempt: claim.attempt,
    attemptedAt: event.occurredAt,
  };

  switch (outcome.kind) {
    case 'SUCCEEDED':
      return {
        status: 'EXECUTED',
        detail:
          outcome.externalId === undefined
            ? undefined
            : `Provider confirmed receipt. External id: ${outcome.externalId}.`,
        technical: {
          ...baseTechnical,
          provider: execution.provider,
          outcomeKind: 'SUCCEEDED',
          ...(outcome.externalId === undefined ? {} : { externalId: outcome.externalId }),
          retrySafety: 'NOT_APPLICABLE',
          verificationStatus: 'NOT_APPLICABLE',
        },
      };
    case 'FAILED_BEFORE_EFFECT':
      return {
        status: 'FAILED',
        detail: outcome.reason,
        technical: {
          ...baseTechnical,
          provider: execution.provider,
          outcomeKind: 'FAILED_BEFORE_EFFECT',
          retrySafety: 'SAFE',
          verificationStatus: 'NOT_APPLICABLE',
        },
      };
    case 'RATE_LIMITED':
      return {
        status: 'RATE_LIMITED',
        detail: `${outcome.reason} Retry after ${outcome.retryAfterSeconds}s.`,
        technical: {
          ...baseTechnical,
          provider: execution.provider,
          outcomeKind: 'RATE_LIMITED',
          retrySafety: 'SAFE',
          verificationStatus: 'NOT_APPLICABLE',
        },
      };
    case 'OUTCOME_UNKNOWN':
      return {
        status: 'OUTCOME_UNKNOWN',
        detail: outcome.reason,
        technical: {
          ...baseTechnical,
          provider: execution.provider,
          outcomeKind: 'OUTCOME_UNKNOWN',
          retrySafety: execution.honorsIdempotencyKey ? 'SAFE' : 'UNSAFE',
          verificationStatus: execution.honorsIdempotencyKey ? 'NOT_APPLICABLE' : 'PENDING',
        },
      };
  }
}

function resolveVerifyEffect(
  proposed: ProposedEffect,
  event: CanonicalEvent,
  internals: EngineInternals,
  verifyOutcomes: ReadonlyMap<string, ResolvedVerify>,
): EffectResolution {
  const execution = proposed.execution;
  if (execution === undefined || execution.kind !== 'VERIFY') {
    throw new Error(`resolveVerifyEffect called on effect "${proposed.id}" without a VERIFY execution`);
  }

  const resolved = verifyOutcomes.get(execution.attemptId);
  if (resolved === undefined || resolved.status !== 'OK') {
    const reason =
      resolved === undefined ? 'No verify outcome was resolved for this attempt.' : resolved.reason;
    return { status: 'FAILED', detail: `Verification attempt unavailable: ${reason}` };
  }

  const outcome = resolved.result;
  const baseTechnical = {
    attempt: 1,
    provider: execution.provider,
    attemptedAt: event.occurredAt,
    retrySafety: 'NOT_APPLICABLE' as const,
  };

  switch (outcome.kind) {
    case 'CONFIRMED_NOT_EXECUTED':
      internals.executions.verify(execution.targetIdempotencyKey, 'NOT_EXECUTED');
      return {
        status: 'EXECUTED',
        detail: outcome.reason,
        technical: {
          ...baseTechnical,
          outcomeKind: 'CONFIRMED_NOT_EXECUTED',
          verificationStatus: 'CONFIRMED_NOT_EXECUTED',
        },
      };
    case 'CONFIRMED_EXECUTED':
      internals.executions.verify(execution.targetIdempotencyKey, 'EXECUTED');
      return {
        status: 'EXECUTED',
        detail: outcome.reason,
        technical: {
          ...baseTechnical,
          outcomeKind: 'CONFIRMED_EXECUTED',
          ...(outcome.externalId === undefined ? {} : { externalId: outcome.externalId }),
          verificationStatus: 'CONFIRMED_EXECUTED',
        },
      };
    case 'STILL_UNKNOWN':
      // Deliberately does not call internals.executions.verify() — leaves the target key
      // exactly as unresolved as it was. A check that learns nothing changes nothing.
      return {
        status: 'OUTCOME_UNKNOWN',
        detail: outcome.reason,
        technical: {
          ...baseTechnical,
          outcomeKind: 'STILL_UNKNOWN',
          verificationStatus: 'PENDING',
        },
      };
  }
}

/** An event type with no operating logic is recorded honestly rather than ignored. */
function unhandledEntry(
  state: EngineState,
  event: CanonicalEvent,
  handlers: SystemHandlers,
): TimelineEntry {
  const decision: DecisionRecord = {
    id: `${event.eventId}:unhandled`,
    eventId: event.eventId,
    mechanism: 'DETERMINISTIC_RULE',
    objective: 'Determine whether this system has operating logic for the received event type.',
    relevantState: state.lifecycleState,
    evidenceRefs: [`event.type=${event.type}`],
    deterministicFacts: [
      { label: 'Event type', value: event.type },
      { label: 'Registered handlers', value: Object.keys(handlers.handlers).join(', ') || 'none' },
    ],
    missingInformation: [],
    permittedActions: ['record_unhandled_event'],
    forbiddenActions: ['guess_intent', 'apply_unrelated_handler'],
    selectedAction: 'record_unhandled_event',
    applicablePolicy: ['Unmodelled event types are recorded, never inferred.'],
    escalationReason: 'No operating logic is defined for this event type in this system.',
    authority: 0,
  };

  return {
    id: `${event.eventId}:unhandled`,
    event,
    stepLabel: 'Unhandled event',
    atOffsetSeconds: 0,
    transitions: [],
    decisions: [decision],
    sideEffects: [],
    verifications: [],
    stateAfter: state.lifecycleState,
    summary: `Unhandled event type "${event.type}" recorded without action.`,
  };
}
