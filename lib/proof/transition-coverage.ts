import { RUNNABLE_SYSTEMS } from '@/lib/engine/registry';
import { runScenario } from '@/lib/engine/run';
import { FixtureDecisionProvider } from '@/lib/ports/decision-provider';
import { FixtureSideEffectExecutor } from '@/lib/ports/side-effect-executor';
import { FixtureExtractionProvider } from '@/lib/ports/extraction-provider';
import { FixtureResourceProvisioner } from '@/lib/ports/resource-provisioner';

/**
 * WHICH DECLARED TRANSITIONS A VISITOR CAN ACTUALLY WATCH.
 *
 * `validateLifecycle` answers whether a declared movement is BUILDABLE. This answers whether
 * anything ever performs it — a different question, and the one `lr-fm-malformed` sat inside
 * for months: every exit from `FAILED_RECOVERABLE` was buildable and none was built.
 *
 * SCENARIOS, not tests, and the distinction is the point. A transition covered by a unit test
 * is proven to work. A transition covered by a scenario is one someone can open in the
 * simulator and watch happen. This portfolio's claim is inspectability, so the second number is
 * the commercially meaningful one — and it is the smaller, less flattering one.
 *
 * Derived by RUNNING the scenarios, never by reading the handlers. A transition counts only
 * when the engine actually accepted it, so a handler that requests an undeclared move is not
 * credited for it.
 */

export interface SystemTransitionCoverage {
  readonly systemId: string;
  readonly declared: number;
  /** Transition rule ids the engine genuinely accepted while replaying this system's scenarios. */
  readonly exercised: readonly string[];
  readonly unexercised: readonly string[];
}

/**
 * The credit rule, extracted so it can be tested on its own.
 *
 * `accepted` is checked as well as `ruleId` even though every rejection observed across the
 * current scenarios carries no `ruleId` — rejection today means "no declared rule matched".
 * The two conditions are not the same claim, though: a move that matches a rule and is refused
 * for another reason would carry a rule id and must still not count. Crediting the engine's own
 * refusal as a demonstration of the transition would invert what coverage means.
 *
 * A guard that cannot be reached through a scenario is a guard nothing tests, so it lives here
 * rather than inline. `tests/transition-coverage.test.ts` drives it with a synthetic
 * matched-but-rejected transition.
 */
export function creditedRuleIds(
  transitions: readonly { readonly accepted: boolean; readonly ruleId?: string }[],
): ReadonlySet<string> {
  const credited = new Set<string>();
  for (const transition of transitions) {
    if (transition.accepted && transition.ruleId !== undefined) credited.add(transition.ruleId);
  }
  return credited;
}

/**
 * @param systemIds restrict the measurement to these systems. A page rendering one system's
 *   coverage has no reason to replay the other five's scenarios at build time; the tests pass
 *   nothing and measure everything.
 */
export async function computeScenarioTransitionCoverage(
  systemIds?: readonly string[],
): Promise<readonly SystemTransitionCoverage[]> {
  const report: SystemTransitionCoverage[] = [];
  const wanted = systemIds === undefined ? undefined : new Set(systemIds);

  for (const runnable of RUNNABLE_SYSTEMS) {
    if (wanted !== undefined && !wanted.has(runnable.system.id)) continue;
    const fired = new Set<string>();

    for (const scenario of runnable.scenarios) {
      const run = await runScenario(scenario, {
        system: runnable.system,
        profile: runnable.profile,
        handlers: runnable.handlers,
        provider: new FixtureDecisionProvider(scenario.judgments),
        executor: new FixtureSideEffectExecutor(
          runnable.sendOutcomes ?? {},
          runnable.verifyOutcomes ?? {},
        ),
        extractionProvider: new FixtureExtractionProvider(runnable.extractions ?? {}),
        provisioner: new FixtureResourceProvisioner(),
      });

      for (const ruleId of creditedRuleIds(run.transitions)) fired.add(ruleId);
    }

    const declared = runnable.system.lifecycle.transitions.map((t) => t.id);
    report.push({
      systemId: runnable.system.id,
      declared: declared.length,
      exercised: declared.filter((id) => fired.has(id)),
      unexercised: declared.filter((id) => !fired.has(id)),
    });
  }

  return report;
}
