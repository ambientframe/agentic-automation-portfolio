import { KESTREL } from '@/data/profiles/kestrel/profile';
import {
  LEAD_RESCUE_SEND_OUTCOMES,
  LEAD_RESCUE_VERIFY_OUTCOMES,
} from '@/data/profiles/kestrel/scenarios/lead-rescue';
import { CALL_TO_PROPOSAL_EXTRACTIONS } from '@/data/profiles/kestrel/scenarios/call-to-proposal';
import { RECEIVABLES_RECOVERY_EXTRACTIONS } from '@/data/profiles/kestrel/scenarios/receivables-recovery';
import { LEAD_RESCUE, DORMANT_PIPELINE_RECOVERY, CALL_TO_PROPOSAL, CLIENT_ONBOARDING, RECEIVABLES_RECOVERY } from '@/data/systems';
import { LEAD_RESCUE_HANDLERS } from '@/lib/engine/handlers/lead-rescue';
import { DORMANT_PIPELINE_RECOVERY_HANDLERS } from '@/lib/engine/handlers/dormant-pipeline-recovery';
import { CALL_TO_PROPOSAL_HANDLERS } from '@/lib/engine/handlers/call-to-proposal';
import { CLIENT_ONBOARDING_HANDLERS } from '@/lib/engine/handlers/client-onboarding';
import { RECEIVABLES_RECOVERY_HANDLERS } from '@/lib/engine/handlers/receivables-recovery';
import { runScenario } from '@/lib/engine/run';
import type { EngineRun } from '@/lib/engine/types';
import type { Scenario } from '@/lib/model/runtime';
import { FixtureDecisionProvider } from '@/lib/ports/decision-provider';
import { FixtureSideEffectExecutor } from '@/lib/ports/side-effect-executor';
import { FixtureExtractionProvider } from '@/lib/ports/extraction-provider';
import { FixtureResourceProvisioner, type ResourceProvisioner } from '@/lib/ports/resource-provisioner';

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

/** Runs a Call-to-Proposal scenario exactly as the application does. */
export async function runCallToProposal(scenario: Scenario): Promise<EngineRun> {
  return runScenario(scenario, {
    system: CALL_TO_PROPOSAL,
    profile: KESTREL,
    handlers: CALL_TO_PROPOSAL_HANDLERS,
    provider: new FixtureDecisionProvider(scenario.judgments),
    extractionProvider: new FixtureExtractionProvider(CALL_TO_PROPOSAL_EXTRACTIONS),
  });
}

/**
 * Runs a Client Onboarding scenario exactly as the application does. `provisioner`
 * defaults to a fresh `FixtureResourceProvisioner` per call, matching `app/simulator`'s
 * unconditional wiring; tests that need to seed pre-existing resources or force a
 * failure/unknown outcome pass their own instance.
 */
export async function runClientOnboarding(
  scenario: Scenario,
  provisioner: ResourceProvisioner = new FixtureResourceProvisioner(),
): Promise<EngineRun> {
  return runScenario(scenario, {
    system: CLIENT_ONBOARDING,
    profile: KESTREL,
    handlers: CLIENT_ONBOARDING_HANDLERS,
    provider: new FixtureDecisionProvider(scenario.judgments),
    provisioner,
  });
}

/** Runs a Receivables / Invoice Recovery scenario exactly as the application does. */
export async function runReceivablesRecovery(scenario: Scenario): Promise<EngineRun> {
  return runScenario(scenario, {
    system: RECEIVABLES_RECOVERY,
    profile: KESTREL,
    handlers: RECEIVABLES_RECOVERY_HANDLERS,
    provider: new FixtureDecisionProvider(scenario.judgments),
    extractionProvider: new FixtureExtractionProvider(RECEIVABLES_RECOVERY_EXTRACTIONS),
  });
}
