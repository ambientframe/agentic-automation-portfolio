import type { SystemDefinition } from '@/lib/model/system';
import type { SystemTransitionCoverage } from '@/lib/proof/transition-coverage';

/**
 * THE COVERAGE MEASUREMENT, TURNED INTO SOMETHING A BUYER CAN READ.
 *
 * Derivation only — no rendering, no system-specific prose. The panel that displays this is
 * dumb by design, which is what lets one component serve a system with an operator console and
 * a system without one.
 *
 * The design decision that matters: the uncovered transitions are NAMED, with their state
 * labels and their trigger. "22 of 37 are not replayable" asks to be trusted; a list of exactly
 * which 22, each readable without opening the dossier, asks to be checked. This portfolio's
 * whole argument is that the second is more persuasive than the first.
 */

export interface UnexercisedTransitionRow {
  readonly id: string;
  /** Human-readable state labels, so the row means something without decoding ids. */
  readonly from: string;
  readonly to: string;
  readonly trigger: string;
}

export interface CoverageView {
  readonly systemId: string;
  readonly systemName: string;
  readonly declared: number;
  readonly exercised: number;
  readonly unexercised: readonly UnexercisedTransitionRow[];
  readonly percentage: number;
  readonly complete: boolean;
  /** Computed from the counts, never authored, so the sentence cannot drift from the numbers. */
  readonly headline: string;
  readonly caveats: readonly string[];
}

export function deriveCoverageView(
  system: SystemDefinition,
  coverage: SystemTransitionCoverage,
): CoverageView {
  const label = (id: string) => system.lifecycle.states.find((s) => s.id === id)?.label ?? id;

  const unexercised: UnexercisedTransitionRow[] = coverage.unexercised
    .map((id) => {
      const rule = system.lifecycle.transitions.find((t) => t.id === id);
      return {
        id,
        from: label(rule?.from ?? id),
        to: label(rule?.to ?? id),
        trigger: rule?.trigger ?? 'Unknown trigger',
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));

  const exercised = coverage.exercised.length;
  const declared = coverage.declared;

  return {
    systemId: coverage.systemId,
    systemName: system.name,
    declared,
    exercised,
    unexercised,
    percentage: Math.round((exercised / declared) * 100),
    complete: unexercised.length === 0,
    headline: `${exercised} of this system's ${declared} declared moves can be watched end to end.`,
    caveats: [
      'Measured by replaying every scenario and counting only the moves the engine actually accepted. A move the engine refused is recorded as a refusal, never as a demonstration of the thing it refused.',
      'A move not listed here is not a defect and usually not broken — most are simply unauthored, and several are proven correct by a unit test. What this measures is narrower and harder: whether somebody can open the simulator and watch it happen.',
      'Being covered by a unit test is not the same as being replayable, and this counts only the second. It therefore understates how much of this system works, and states accurately how much of it you can check for yourself.',
    ],
  };
}
