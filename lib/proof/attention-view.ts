import type { SystemDefinition } from '@/lib/model/system';
import { auditParkedStates, type ParkedStateExit } from '@/lib/proof/parked-state-attention';

/**
 * THE PARKED-STATE AUDIT, TURNED INTO SOMETHING A BUYER CAN READ.
 *
 * Derivation only — no rendering, no system-specific prose, on the same terms as
 * `coverage-view.ts`. The headline is computed from the counts rather than authored, so the
 * sentence cannot drift away from the figure printed beside it.
 *
 * THE ZERO CASE IS THE DELICATE ONE. A system with an empty list has not been shown to be safe.
 * It has DECLARED, for every state work parks in, what happens when nobody acts — a statement
 * about canon, not about behaviour. Calling that "complete" or "fully covered" would be exactly
 * the move this repository's integrity rule forbids: absence of a finding rendered as evidence
 * of absence. The headline therefore says what was declared, and the caveats say what declaring
 * it does not prove.
 */

export interface ExposedParkedState {
  readonly stateId: string;
  readonly stateLabel: string;
  readonly exits: readonly ParkedStateExit[];
}

export interface AttentionView {
  readonly systemId: string;
  readonly systemName: string;
  /** Every state work parks in — the denominator, so the ratio is not flattering by omission. */
  readonly parked: number;
  /** Parked states with no self-driven exit AND nothing declared about being abandoned. */
  readonly abandonable: readonly ExposedParkedState[];
  readonly clean: boolean;
  /** Computed from the counts, never authored. */
  readonly headline: string;
  readonly caveats: readonly string[];
}

export function deriveAttentionView(system: SystemDefinition): AttentionView {
  const rows = auditParkedStates(system);
  const exposed = rows
    .filter((row) => row.abandonable)
    .map((row) => ({ stateId: row.stateId, stateLabel: row.stateLabel, exits: row.exits }))
    .sort((a, b) => a.stateId.localeCompare(b.stateId));

  const parked = rows.length;
  const clean = exposed.length === 0;

  return {
    systemId: system.id,
    systemName: system.name,
    parked,
    abandonable: exposed,
    clean,
    headline: clean
      ? `This system declares what happens when nobody acts, for all ${parked} of the states work parks in.`
      : `Of the ${parked} states work parks in, ${exposed.length} can only be left by the person the case is already waiting on, and this system declares nothing about what happens if they never act.`,
    caveats: [
      'This reads what the system declares about itself, not what its code does. A system could declare an attention mechanism and implement none of it, and this panel would still show the state as covered — it is a check on the map, never on the territory.',
      'A state listed here is not broken. Its exits work; they simply all require the person who is, by definition, not acting. What is missing is any statement of what happens when that goes on indefinitely.',
      'An empty list means every parked state has such a statement. It does not mean cases cannot be neglected — only that neglect has somewhere declared to go.',
    ],
  };
}
