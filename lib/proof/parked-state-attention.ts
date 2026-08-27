import type { DecisionMechanism, SystemDefinition } from '@/lib/model/system';

/**
 * WHERE CAN WORK BE PARKED AND NEVER FORCED OUT?
 *
 * `validateLifecycle`'s `DEAD_END_STATE` check refuses a non-terminal state with no outgoing
 * transition. This derivation is about the sibling condition that check passes cleanly: a
 * state with several declared exits, every one of which is a `HUMAN_DECISION`. On the graph it
 * is not a dead end. In practice it is, because the only thing that can move the case is the
 * party the case is already waiting on.
 *
 * That alone is not a defect — it is the normal shape of human review, and it is exactly the
 * shape Lead Rescue's NEEDS_HUMAN and Call-to-Proposal's AWAITING_APPROVAL have. What makes it
 * a defect is the PAIR:
 *
 *     no self-driven exit  AND  no declared attention mechanism
 *
 * A `HUMAN_APPROVAL_TIMEOUT` failure mode holding position over a state is canon admitting
 * "nobody may act here, and here is what happens when nobody does". Its absence over a
 * stranded state is canon saying nothing at all — which reads identically to the case being
 * handled, and is the reason this had to be computed rather than reviewed.
 *
 * DERIVATION ONLY. No rendering, no system-specific vocabulary, no judgement about whether a
 * given state SHOULD have an attention mechanism. It reports the structural fact and names the
 * states, because a list of exactly which states asks to be checked where a count asks to be
 * trusted.
 */

/** The state kinds where a case sits rather than progresses. Everything else is transient. */
const PARKED_KINDS = ['WAITING', 'HUMAN_REVIEW'] as const;

export interface ParkedStateExit {
  readonly id: string;
  readonly to: string;
  readonly mechanism: DecisionMechanism;
}

export interface ParkedStateAudit {
  readonly systemId: string;
  readonly stateId: string;
  readonly stateLabel: string;
  readonly kind: (typeof PARKED_KINDS)[number];
  /** Every declared exit, so a row is checkable without opening the dossier. */
  readonly exits: readonly ParkedStateExit[];
  /** Exits the system itself can take without the awaited party acting. */
  readonly selfDrivenExits: number;
  /** Failure-mode ids whose HOLDS_POSITION recovery names this state. Empty means nothing. */
  readonly attendedBy: readonly string[];
  /** Stranded AND unattended. The pair, never either half alone. */
  readonly abandonable: boolean;
}

export function auditParkedStates(system: SystemDefinition): readonly ParkedStateAudit[] {
  const parked = system.lifecycle.states.filter((state) =>
    PARKED_KINDS.some((kind) => kind === state.kind),
  );

  return parked.map((state) => {
    const exits: ParkedStateExit[] = system.lifecycle.transitions
      .filter((t) => t.from === state.id)
      .map((t) => ({ id: t.id, to: t.to, mechanism: t.mechanism }));

    // A DETERMINISTIC_RULE exit is one the engine can take on its own — an elapsed window, a
    // budget exhausted, a due date passed. BOUNDED_AI_JUDGMENT is deliberately NOT counted:
    // a judgment still has to be invoked by something, and this portfolio does not treat a
    // model call as a substitute for a person acting.
    const selfDrivenExits = exits.filter((e) => e.mechanism === 'DETERMINISTIC_RULE').length;

    const attendedBy = system.failureModes
      .filter(
        (mode) =>
          mode.recoveryPath.shape === 'HOLDS_POSITION' &&
          (mode.recoveryPath.holdsAt ?? []).includes(state.id),
      )
      .map((mode) => mode.id);

    return {
      systemId: system.id,
      stateId: state.id,
      stateLabel: state.label,
      kind: state.kind as (typeof PARKED_KINDS)[number],
      exits,
      selfDrivenExits,
      attendedBy,
      abandonable: selfDrivenExits === 0 && attendedBy.length === 0,
    };
  });
}

/** The abandonable state ids, sorted, so the snapshot is order-independent. */
export function abandonableStateIds(system: SystemDefinition): readonly string[] {
  return auditParkedStates(system)
    .filter((row) => row.abandonable)
    .map((row) => row.stateId)
    .sort((a, b) => a.localeCompare(b));
}
