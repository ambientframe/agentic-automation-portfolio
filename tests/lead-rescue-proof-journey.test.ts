import { describe, expect, it } from 'vitest';
import { LEAD_RESCUE } from '@/data/systems';
import { KESTREL } from '@/data/profiles/kestrel/profile';
import {
  LEAD_RESCUE_SCENARIOS,
  LEAD_RESCUE_SEND_OUTCOMES,
  LEAD_RESCUE_VERIFY_OUTCOMES,
} from '@/data/profiles/kestrel/scenarios/lead-rescue';
import { LEAD_RESCUE_HANDLERS } from '@/lib/engine/handlers/lead-rescue';
import { runScenario } from '@/lib/engine/run';
import { FixtureDecisionProvider } from '@/lib/ports/decision-provider';
import { FixtureSideEffectExecutor } from '@/lib/ports/side-effect-executor';
import { isTerminal } from '@/lib/model/system';
import type { Scenario } from '@/lib/model/runtime';
import type { EngineRun } from '@/lib/engine/types';
import { deriveJourney, type Journey } from '@/lib/proof/journey';
import {
  GRAMMAR_STAGES,
  SELECTION_RULES,
  deriveCommercialGrammar,
  toScenarioIndexEntry,
} from '@/lib/proof/commercial-grammar';

/**
 * The proof route renders NOTHING it computed itself — every value comes from these two
 * derivations. These tests therefore assert the one property that makes the page honest:
 * a derived view may re-describe the run, and may not add to it.
 *
 * The adversarial cases each correspond to a specific way the surface could lie:
 *   - a guardrail reported where the run refused nothing;
 *   - an "executed" action where the engine recorded a block;
 *   - a grammar stage pointing at a moment that does not exist;
 *   - a scenario tally that overstates what reached a prospect.
 */

async function run(scenario: Scenario): Promise<EngineRun> {
  return runScenario(scenario, {
    system: LEAD_RESCUE,
    profile: KESTREL,
    handlers: LEAD_RESCUE_HANDLERS,
    provider: new FixtureDecisionProvider(scenario.judgments),
    executor: new FixtureSideEffectExecutor(LEAD_RESCUE_SEND_OUTCOMES, LEAD_RESCUE_VERIFY_OUTCOMES),
  });
}

async function journeys(): Promise<readonly { scenario: Scenario; run: EngineRun; journey: Journey }[]> {
  const out: { scenario: Scenario; run: EngineRun; journey: Journey }[] = [];
  for (const scenario of LEAD_RESCUE_SCENARIOS) {
    const engineRun = await run(scenario);
    out.push({ scenario, run: engineRun, journey: deriveJourney(LEAD_RESCUE, engineRun, scenario) });
  }
  return out;
}

describe('the proof route has ten runnable incidents', () => {
  it('derives one journey per authored scenario', async () => {
    const all = await journeys();
    expect(all).toHaveLength(10);
    expect(new Set(all.map((entry) => entry.journey.scenarioSlug)).size).toBe(10);
  });
});

describe('deriveJourney adds nothing to the run', () => {
  it('emits exactly one moment per timeline entry, in order', async () => {
    for (const { run: engineRun, journey } of await journeys()) {
      expect(journey.moments).toHaveLength(engineRun.timeline.length);
      journey.moments.forEach((moment, index) => {
        expect(moment.id).toBe(engineRun.timeline[index]?.id);
        expect(moment.index).toBe(index);
        // The handler's own words, passed through untouched.
        expect(moment.stepLabel).toBe(engineRun.timeline[index]?.stepLabel);
        expect(moment.summary).toBe(engineRun.timeline[index]?.summary);
      });
    }
  });

  it('reports the final state the engine actually reached', async () => {
    for (const { run: engineRun, journey } of await journeys()) {
      expect(journey.outcome.finalState).toBe(engineRun.finalState.lifecycleState);
    }
  });

  it('never reports more executed prospect-facing sends than the run recorded', async () => {
    for (const { run: engineRun, journey } of await journeys()) {
      const actual = engineRun.sideEffects.filter(
        (effect) => effect.kind === 'MESSAGE_SEND' && effect.status === 'EXECUTED',
      ).length;
      expect(journey.outcome.customerFacingExecuted).toBe(actual);
    }
  });

  it('classifies an unconfirmed send as uncertain, never as withheld', async () => {
    const found = (await journeys()).find((entry) => entry.journey.scenarioSlug === 'uncertain-downstream-outcome');
    expect(found).toBeDefined();
    const effects = found?.journey.moments.flatMap((moment) => moment.effects) ?? [];
    const unknown = effects.filter((effect) => effect.status === 'OUTCOME_UNKNOWN');
    expect(unknown.length).toBeGreaterThan(0);
    for (const effect of unknown) {
      expect(effect.disposition).toBe('UNCERTAIN');
    }
  });

  /**
   * "The recipient got this" is only true of something that left the business. The scenario
   * whose entire point is that the system contacted nobody still executes an internal record
   * write, so a single gloss for both made that run read as though a message went out.
   */
  it('never says a recipient received an effect that never left the business', async () => {
    for (const { journey } of await journeys()) {
      for (const effect of journey.moments.flatMap((moment) => moment.effects)) {
        if (effect.customerFacing) continue;
        expect(effect.meaning.toLowerCase(), `${journey.scenarioSlug} · ${effect.kind}`).not.toContain('recipient got');
      }
    }
  });

  it('describes the silent scenario as having contacted nobody', async () => {
    const found = (await journeys()).find((entry) => entry.journey.scenarioSlug === 'ambiguous-high-risk');
    expect(found?.journey.outcome.customerFacingExecuted).toBe(0);

    const grammar = deriveCommercialGrammar(found?.journey as Journey);
    const action = grammar.stages.find((stage) => stage.stage === 'ACTION');
    expect(action?.detail.toLowerCase()).not.toContain('recipient got');
  });

  it('reports a guardrail only where the engine recorded a structural refusal', async () => {
    for (const { journey } of await journeys()) {
      for (const moment of journey.moments) {
        for (const guardrail of moment.guardrails) {
          // Every guardrail kind must be traceable to a fact on this moment. A guardrail
          // inferred from prose would have no such backing and would fail here.
          const backed =
            (guardrail.kind === 'TRANSITION_LEGALITY' && moment.transitions.some((t) => !t.accepted)) ||
            (guardrail.kind === 'POLICY_BLOCK' && moment.effects.some((e) => e.status === 'BLOCKED_BY_POLICY')) ||
            (guardrail.kind === 'IDEMPOTENCY' && moment.effects.some((e) => e.status === 'SUPPRESSED_DUPLICATE')) ||
            (guardrail.kind === 'RETRY_SAFETY' &&
              moment.effects.some((e) => e.status === 'OUTCOME_UNKNOWN' || e.technical?.retrySafety === 'UNSAFE')) ||
            (guardrail.kind === 'AUTHORITY_HOLD' && moment.effects.some((e) => e.status === 'AWAITING_APPROVAL')) ||
            (guardrail.kind === 'CONFLICT_HOLD' && moment.effects.some((e) => e.status === 'CONFLICT_DETECTED')) ||
            (guardrail.kind === 'ESCALATION' && moment.decisions.some((d) => d.escalationReason !== null)) ||
            (guardrail.kind === 'BOUNDED_ACTION_SET' && moment.decisions.some((d) => d.forbiddenActions.length > 0)) ||
            (guardrail.kind === 'UNKNOWN_KEPT_UNKNOWN' &&
              moment.decisions.some((d) => d.missingInformation.length > 0));
          expect(backed, `${journey.scenarioSlug} · ${moment.stepLabel} · ${guardrail.kind}`).toBe(true);
        }
      }
    }
  });

  it('offers no onward move out of a terminal state', async () => {
    for (const { journey } of await journeys()) {
      for (const moment of journey.moments) {
        if (isTerminal(moment.stateAfterKind)) {
          expect(moment.terminal).toBe(true);
          expect(moment.next).toHaveLength(0);
        }
      }
    }
  });

  it('collapses the state ribbon to genuine moves only', async () => {
    for (const { journey } of await journeys()) {
      const states = journey.stops.map((stop) => stop.state);
      states.forEach((state, index) => {
        if (index > 0) expect(state).not.toBe(states[index - 1]);
      });
      // Every stop must name a state declared in the lifecycle.
      const declared = new Set(LEAD_RESCUE.lifecycle.states.map((state) => state.id));
      for (const state of states) expect(declared.has(state)).toBe(true);
    }
  });
});

describe('the commercial grammar is derived, not authored', () => {
  it('produces all five stages for every incident, in fixed order', async () => {
    for (const { journey } of await journeys()) {
      const grammar = deriveCommercialGrammar(journey);
      expect(grammar.stages.map((stage) => stage.stage)).toEqual([...GRAMMAR_STAGES]);
    }
  });

  it('documents a selection rule for every stage it renders', () => {
    expect(SELECTION_RULES.map((rule) => rule.stage)).toEqual([...GRAMMAR_STAGES]);
  });

  /**
   * The strip is the first thing a buyer reads. An earlier version used raw identifiers as
   * headlines, so the opening cells read `inbound.enquiry.received` and `normalise`.
   */
  it('leads every stage with prose, not a machine identifier', async () => {
    for (const { journey } of await journeys()) {
      for (const stage of deriveCommercialGrammar(journey).stages) {
        expect(stage.headline, `${journey.scenarioSlug} · ${stage.stage}`).not.toMatch(/[a-z]\.[a-z]/);
        expect(stage.headline).not.toMatch(/_/);
        expect(stage.headline.trim()).toBe(stage.headline);
        expect(stage.headline.length).toBeGreaterThan(0);
      }
    }
  });

  it('keeps the underlying identifier available beside the prose', async () => {
    for (const { journey } of await journeys()) {
      const stages = deriveCommercialGrammar(journey).stages;
      const trigger = stages.find((stage) => stage.stage === 'TRIGGER');
      // The reader must still be able to tie the cell back to the record it came from.
      expect(trigger?.technicalName).toBe(journey.moments[0]?.eventType);

      const outcome = stages.find((stage) => stage.stage === 'OUTCOME');
      expect(outcome?.technicalName).toBe(journey.outcome.finalState);

      // A stage that reached no moment has no record to cite, and must not invent one.
      for (const stage of stages) {
        if (stage.momentIndex === null) expect(stage.technicalName).toBeNull();
      }
    }
  });

  it('only ever points at a moment that exists', async () => {
    for (const { journey } of await journeys()) {
      for (const stage of deriveCommercialGrammar(journey).stages) {
        if (stage.momentIndex === null) continue;
        expect(stage.momentIndex).toBeGreaterThanOrEqual(0);
        expect(stage.momentIndex).toBeLessThan(journey.moments.length);
      }
    }
  });

  it('selects the highest-authority decision, and reports its real mechanism', async () => {
    for (const { journey } of await journeys()) {
      const stage = deriveCommercialGrammar(journey).stages.find((s) => s.stage === 'DECISION');
      if (stage?.momentIndex === null || stage?.momentIndex === undefined) continue;

      const highest = Math.max(
        ...journey.moments.flatMap((moment) => moment.decisions.map((decision) => decision.authority)),
      );
      const chosen = journey.moments[stage.momentIndex];
      expect(Math.max(...(chosen?.decisions.map((d) => d.authority) ?? [-1]))).toBe(highest);
    }
  });

  it('never claims an action went out when the run withheld everything', async () => {
    for (const { journey } of await journeys()) {
      const stage = deriveCommercialGrammar(journey).stages.find((s) => s.stage === 'ACTION');
      const executed = journey.moments
        .flatMap((moment) => moment.effects)
        .some((effect) => effect.disposition === 'EXECUTED');
      if (!executed) {
        expect(stage?.tone).not.toBe('ACTED');
      }
    }
  });

  /**
   * Four of the eight end in BOOKING_READY, an ACTIVE state. Calling that "finished"
   * contradicted the state ribbon on the same screen, which correctly showed "In progress".
   */
  it('calls a run finished only when it reached a terminal state', async () => {
    for (const { journey } of await journeys()) {
      const outcome = deriveCommercialGrammar(journey).stages.find((stage) => stage.stage === 'OUTCOME');
      const terminal = isTerminal(journey.outcome.finalStateKind);
      expect(outcome?.detail.startsWith('Finished.'), `${journey.scenarioSlug} · ${journey.outcome.finalState}`).toBe(
        terminal,
      );
    }
  });

  it('says a live case is still open, and names what it is waiting on', async () => {
    const active = (await journeys()).filter((entry) => entry.journey.outcome.finalStateKind === 'ACTIVE');
    expect(active.length).toBeGreaterThan(0);
    for (const { journey } of active) {
      const outcome = deriveCommercialGrammar(journey).stages.find((stage) => stage.stage === 'OUTCOME');
      expect(outcome?.detail).toContain('Still open');
    }
  });

  it('reports a guardrail stage only when the run engaged one', async () => {
    for (const { journey } of await journeys()) {
      const stage = deriveCommercialGrammar(journey).stages.find((s) => s.stage === 'GUARDRAIL');
      const engaged = journey.moments.some((moment) => moment.guardrails.length > 0);
      expect(stage?.momentIndex === null).toBe(!engaged);
    }
  });
});

describe('the scenario switcher can tell the eight apart honestly', () => {
  it('tallies only what the journey recorded', async () => {
    for (const { journey } of await journeys()) {
      const entry = toScenarioIndexEntry(journey);
      expect(entry.slug).toBe(journey.scenarioSlug);
      expect(entry.momentCount).toBe(journey.moments.length);
      expect(entry.finalStateLabel).toBe(journey.outcome.finalStateLabel);
      expect(entry.matchedExpectation).toBe(journey.outcome.matchedExpectation);

      if (journey.outcome.customerFacingExecuted === 0) {
        expect(entry.effectTally).not.toContain('sent');
      } else {
        expect(entry.effectTally).toContain(`${journey.outcome.customerFacingExecuted} sent`);
      }
    }
  });

  it('agrees with each scenario about where its run should end', async () => {
    for (const { scenario, journey } of await journeys()) {
      expect(journey.outcome.expectedFinalState).toBe(scenario.expectedFinalState);
      expect(journey.outcome.matchedExpectation).toBe(true);
    }
  });
});
