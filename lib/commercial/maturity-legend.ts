import { MATURITY_LEVELS, type MaturityLevel } from '@/lib/model/system';

/**
 * PLAIN-LANGUAGE MATURITY LEGEND.
 *
 * Systems 2–6's pre-launch commercial job is a truthful maturity gradient plus a legend a
 * non-engineer can read. The labels themselves stay the model's; this module only says what
 * each one means in ordinary words. Unused levels stay listed so a badge cannot appear
 * without a sentence, and they are marked unused rather than implied as a roadmap.
 */

export const MATURITY_PLAIN: Record<MaturityLevel, string> = {
  CONCEPT: 'Written. It does not execute.',
  SIMULATED: 'The engine runs the incident here. Nothing leaves this process. The business is fictional.',
  INTERACTIVE_PROTOTYPE: 'Operable here. Still not connected to a real firm’s systems.',
  PARTIALLY_LIVE: 'Some paths can talk to a real provider under an explicit opt-in. Not a client deployment.',
  LIVE: 'A real-provider path exists. Not a claim that a client is running this in production.',
  AGENTIC: 'Agent-directed operation. Unused on this site.',
  LOOPED: 'Closed-loop operation. Unused on this site.',
  GRAPH_BASED: 'Graph-orchestrated operation. Unused on this site.',
  PRODUCTION_HARDENED: 'Production-hardened. Unused on this site.',
};

export type MaturityLegendEntry = {
  readonly level: MaturityLevel;
  readonly plain: string;
  readonly inUse: boolean;
};

export function maturityLegendEntries(
  systems: readonly { readonly maturity: MaturityLevel }[],
): readonly MaturityLegendEntry[] {
  const used = new Set(systems.map((system) => system.maturity));
  return MATURITY_LEVELS.map((level) => ({
    level,
    plain: MATURITY_PLAIN[level],
    inUse: used.has(level),
  }));
}
