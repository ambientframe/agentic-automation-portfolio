import type { BusinessProfile } from '@/lib/model/profile';
import type { Scenario } from '@/lib/model/runtime';
import type { SendOutcome, VerifyOutcome } from '@/lib/model/runtime';
import type { SystemDefinition } from '@/lib/model/system';
import { KESTREL } from '@/data/profiles/kestrel/profile';
import {
  LEAD_RESCUE_SCENARIOS,
  LEAD_RESCUE_SEND_OUTCOMES,
  LEAD_RESCUE_VERIFY_OUTCOMES,
} from '@/data/profiles/kestrel/scenarios/lead-rescue';
import { DORMANT_PIPELINE_RECOVERY_SCENARIOS } from '@/data/profiles/kestrel/scenarios/dormant-pipeline-recovery';
import {
  CALL_TO_PROPOSAL_EXTRACTIONS,
  CALL_TO_PROPOSAL_SCENARIOS,
} from '@/data/profiles/kestrel/scenarios/call-to-proposal';
import { LEAD_RESCUE, DORMANT_PIPELINE_RECOVERY, CALL_TO_PROPOSAL } from '@/data/systems';
import { LEAD_RESCUE_HANDLERS } from '@/lib/engine/handlers/lead-rescue';
import { DORMANT_PIPELINE_RECOVERY_HANDLERS } from '@/lib/engine/handlers/dormant-pipeline-recovery';
import { CALL_TO_PROPOSAL_HANDLERS } from '@/lib/engine/handlers/call-to-proposal';
import type { ExtractionResult } from '@/lib/ports/extraction-provider';
import type { SystemHandlers } from './types';

/**
 * THE RUNNABLE-SYSTEM REGISTRY.
 *
 * Introduced when Dormant Pipeline Recovery became the second system with executable
 * scenarios. Before this, `app/simulator/[slug]/page.tsx` imported Lead Rescue's system,
 * handlers, profile, and fixture outcomes directly by name — correct for one runnable
 * system, wrong the moment a second one exists, since a slug alone no longer tells you
 * which system, handlers, or fixture outcomes to wire up.
 *
 * This is a small correction, not a framework: a flat array plus a lookup function. It
 * does not become a generic multi-tenant workflow engine, and it does not touch
 * `lib/engine/reducer.ts` or `lib/engine/run.ts` at all — those were already fully
 * generic over `SystemDefinition` + `BusinessProfile` + `SystemHandlers` and needed no
 * change to support a second system. Only the UI's own hardcoded wiring needed this.
 */
export interface RunnableSystem {
  readonly system: SystemDefinition;
  readonly handlers: SystemHandlers;
  readonly profile: BusinessProfile;
  readonly scenarios: readonly Scenario[];
  /** Present only for systems whose scenarios opt effects into execution-outcome tracking. */
  readonly sendOutcomes?: Readonly<Record<string, SendOutcome>>;
  readonly verifyOutcomes?: Readonly<Record<string, VerifyOutcome>>;
  /** Present only for systems whose scenarios opt into the `ExtractionProvider` port. Today, only Call-to-Proposal. */
  readonly extractions?: Readonly<Record<string, ExtractionResult>>;
}

export const RUNNABLE_SYSTEMS: readonly RunnableSystem[] = [
  {
    system: LEAD_RESCUE,
    handlers: LEAD_RESCUE_HANDLERS,
    profile: KESTREL,
    scenarios: LEAD_RESCUE_SCENARIOS,
    sendOutcomes: LEAD_RESCUE_SEND_OUTCOMES,
    verifyOutcomes: LEAD_RESCUE_VERIFY_OUTCOMES,
  },
  {
    system: DORMANT_PIPELINE_RECOVERY,
    handlers: DORMANT_PIPELINE_RECOVERY_HANDLERS,
    profile: KESTREL,
    scenarios: DORMANT_PIPELINE_RECOVERY_SCENARIOS,
  },
  {
    system: CALL_TO_PROPOSAL,
    handlers: CALL_TO_PROPOSAL_HANDLERS,
    profile: KESTREL,
    scenarios: CALL_TO_PROPOSAL_SCENARIOS,
    extractions: CALL_TO_PROPOSAL_EXTRACTIONS,
  },
];

export const ALL_RUNNABLE_SCENARIOS: readonly Scenario[] = RUNNABLE_SYSTEMS.flatMap((r) => r.scenarios);

export function findRunnableScenario(
  slug: string,
): { readonly runnable: RunnableSystem; readonly scenario: Scenario } | undefined {
  for (const runnable of RUNNABLE_SYSTEMS) {
    const scenario = runnable.scenarios.find((s) => s.slug === slug);
    if (scenario !== undefined) return { runnable, scenario };
  }
  return undefined;
}
