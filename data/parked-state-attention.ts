/**
 * PARKED STATES WHERE WORK CAN BE ABANDONED AND CANON SAYS NOTHING.
 *
 * BUILD STATE, not canon — which is why it lives beside the systems rather than inside them,
 * for the same reason `data/transition-coverage.ts` does. `data/systems/**` describes what
 * each system IS; this describes a hole in what each system says about itself.
 *
 * A state qualifies when BOTH are true:
 *
 *   1. Every declared exit needs a `HUMAN_DECISION` — so the only thing that can move the case
 *      is the party the case is already waiting on. `validateLifecycle`'s `DEAD_END_STATE`
 *      check passes such a state cleanly; it has exits, they are simply all unreachable
 *      without the person who is not acting.
 *   2. No failure mode holds position over it. A `HUMAN_APPROVAL_TIMEOUT` naming a state in
 *      `recoveryPath.holdsAt` is canon admitting "nobody may act here, and here is what
 *      happens when nobody does". Its absence is canon saying nothing at all — which reads
 *      identically to the case being handled, which is why this had to be computed.
 *
 * `tests/parked-state-attention.test.ts` reconciles this against the model and fails in BOTH
 * directions — a state that quietly becomes abandonable, and an entry here for one now
 * attended. That second direction is what stops this becoming the next `Pending — scenario not
 * yet authored`: a marker nobody re-reads, describing a state of affairs that changed.
 *
 * Being on this list is not a claim that the system is broken. It is narrower and more
 * honest: a case can enter this state and nothing in canon says what happens if it is never
 * touched again. Lead Rescue and Call-to-Proposal are absent because they each ship an
 * attention mechanism that says so; every other system is here because it does not.
 *
 * To shorten it, declare a failure mode with an attention window and build it. Never edit an
 * entry away to make the list look shorter — the test fails in that direction on purpose.
 */
export const ABANDONABLE_PARKED_STATES: Readonly<Record<string, readonly string[]>> = {
  'lead-rescue': [],
  'dormant-pipeline-recovery': ['NEEDS_HUMAN'],
  'call-to-proposal': ['NEEDS_HUMAN'],
  'client-onboarding': ['NEEDS_HUMAN'],
  'receivables-recovery': [],
  'owner-revenue-intelligence': ['AWAITING_OWNER_DECISION'],
};
