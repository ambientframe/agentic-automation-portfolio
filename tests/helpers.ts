import { KESTREL } from '@/data/profiles/kestrel/profile';
import {
  LEAD_RESCUE_SEND_OUTCOMES,
  LEAD_RESCUE_VERIFY_OUTCOMES,
} from '@/data/profiles/kestrel/scenarios/lead-rescue';
import { LEAD_RESCUE, DORMANT_PIPELINE_RECOVERY } from '@/data/systems';
import { LEAD_RESCUE_HANDLERS } from '@/lib/engine/handlers/lead-rescue';
import { DORMANT_PIPELINE_RECOVERY_HANDLERS } from '@/lib/engine/handlers/dormant-pipeline-recovery';
import { runScenario } from '@/lib/engine/run';
import type { EngineRun } from '@/lib/engine/types';
import type { Scenario } from '@/lib/model/runtime';
import { FixtureDecisionProvider } from '@/lib/ports/decision-provider';
import { FixtureSideEffectExecutor } from '@/lib/ports/side-effect-executor';

/** Runs a Lead Rescue scenario exactly as the application does. */
export async function runLeadRescue(scenario: Scenario): Promise<EngineRun> {
  return runScenario(scenario, {
    system: LEAD_RESCUE,
    profile: KESTREL,
    handlers: LEAD_RESCUE_HANDLERS,
    provider: new FixtureDecisionProvider(scenario.judgments),
    executor: new FixtureSideEffectExecutor(LEAD_RESCUE_SEND_OUTCOMES, LEAD_RESCUE_VERIFY_OUTCOMES),
  });
}

/** Runs a Dormant Pipeline Recovery scenario exactly as the application does. */
export async function runDormantPipelineRecovery(scenario: Scenario): Promise<EngineRun> {
  return runScenario(scenario, {
    system: DORMANT_PIPELINE_RECOVERY,
    profile: KESTREL,
    handlers: DORMANT_PIPELINE_RECOVERY_HANDLERS,
    provider: new FixtureDecisionProvider(scenario.judgments),
  });
}
