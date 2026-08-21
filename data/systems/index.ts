import type { SystemDefinition } from '@/lib/model/system';
import { LEAD_RESCUE } from './lead-rescue';
import { DORMANT_PIPELINE_RECOVERY } from './dormant-pipeline-recovery';
import { CALL_TO_PROPOSAL } from './call-to-proposal';
import { CLIENT_ONBOARDING } from './client-onboarding';
import { RECEIVABLES_RECOVERY } from './receivables-recovery';
import { OWNER_REVENUE_INTELLIGENCE } from './owner-revenue-intelligence';

/**
 * The six systems, in portfolio order.
 *
 * Every entry is vertical-agnostic. Business vocabulary belongs to the profile layer;
 * `tests/seam.test.ts` enforces the separation by scanning these source files.
 */
export const ALL_SYSTEMS: readonly SystemDefinition[] = [
  LEAD_RESCUE,
  DORMANT_PIPELINE_RECOVERY,
  CALL_TO_PROPOSAL,
  CLIENT_ONBOARDING,
  RECEIVABLES_RECOVERY,
  OWNER_REVENUE_INTELLIGENCE,
].sort((a, b) => a.order - b.order);

const BY_SLUG = new Map(ALL_SYSTEMS.map((s) => [s.slug, s]));

export function systemBySlug(slug: string): SystemDefinition | undefined {
  return BY_SLUG.get(slug);
}

export function systemById(id: string): SystemDefinition | undefined {
  return ALL_SYSTEMS.find((s) => s.id === id);
}

export {
  LEAD_RESCUE,
  DORMANT_PIPELINE_RECOVERY,
  CALL_TO_PROPOSAL,
  CLIENT_ONBOARDING,
  RECEIVABLES_RECOVERY,
  OWNER_REVENUE_INTELLIGENCE,
};
