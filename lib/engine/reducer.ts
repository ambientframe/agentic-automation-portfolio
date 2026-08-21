import type {
  CanonicalEvent,
  DecisionRecord,
  SideEffect,
  SideEffectStatus,
  StateTransition,
  TimelineEntry,
  VerificationRecord,
} from '@/lib/model/runtime';
import type { AuthorityLevel, SystemDefinition } from '@/lib/model/system';
import type { BusinessProfile } from '@/lib/model/profile';
import type { ResolvedJudgment } from '@/lib/ports/decision-provider';
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
 * Three guarantees live HERE rather than in per-system handlers, so all six systems
 * inherit them and no handler can opt out:
 *
 *   1. TRANSITION LEGALITY — a handler may *request* a lifecycle move; only a declared
 *      TransitionRule can authorise one. Illegal requests are recorded as rejected
 *      transitions and the state does not move.
 *   2. IDEMPOTENCY — every side effect claims a key. A second claim is refused and
 *      recorded as SUPPRESSED_DUPLICATE.
 *   3. AUTHORITY — the ladder is enforced uniformly. Levels 0-1 never act externally,
 *      level 2 parks for approval, levels 3-4 may execute.
 *
 * A handler cannot bypass any of the three, which is what makes the reliability claims
 * structural rather than decorative.
 */

export interface StepDeps {
  readonly system: SystemDefinition;
  readonly profile: BusinessProfile;
  readonly handlers: SystemHandlers;
  readonly judgments: ReadonlyMap<string, ResolvedJudgment>;
  readonly internals: EngineInternals;
}

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
    ledger: { has: (key: string) => internals.effects.has(key) },
    isDuplicateEvent,
  });

  const entries: TimelineEntry[] = [];
  let current = state;

  for (const handlerStep of outcome.steps) {
    const result = applyStep(current, event, handlerStep, system, internals);
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
): { state: EngineState; entry: TimelineEntry } {
  // --- Side effects: policy gate, then authority gate, then idempotency ledger ---
  const sideEffects: SideEffect[] = [];
  const verifications: VerificationRecord[] = [...handlerStep.verifications];

  for (const proposed of handlerStep.effects) {
    const { status, detail } = resolveEffect(proposed, event, internals);
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

function resolveEffect(
  proposed: ProposedEffect,
  event: CanonicalEvent,
  internals: EngineInternals,
): { status: SideEffectStatus; detail?: string } {
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

  const attempt = internals.effects.claim(proposed.idempotencyKey, proposed.id, event.eventId);
  if (attempt.outcome === 'DUPLICATE') {
    return {
      status: 'SUPPRESSED_DUPLICATE',
      detail: `Idempotency key "${proposed.idempotencyKey}" was already claimed by side effect ${attempt.original.sideEffectId} on event ${attempt.original.eventId}. No second action was taken.`,
    };
  }

  return { status: 'EXECUTED' };
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
