import { KESTREL } from '@/data/profiles/kestrel/profile';
import { LEAD_RESCUE } from '@/data/systems';
import { LEAD_RESCUE_HANDLERS } from '@/lib/engine/handlers/lead-rescue';
import { runScenario } from '@/lib/engine/run';
import type { EngineRun } from '@/lib/engine/types';
import type { Scenario } from '@/lib/model/runtime';
import { FixtureDecisionProvider } from '@/lib/ports/decision-provider';

/** Runs a Lead Rescue scenario exactly as the application does. */
export async function runLeadRescue(scenario: Scenario): Promise<EngineRun> {
  return runScenario(scenario, {
    system: LEAD_RESCUE,
    profile: KESTREL,
    handlers: LEAD_RESCUE_HANDLERS,
    provider: new FixtureDecisionProvider(scenario.judgments),
  });
}
