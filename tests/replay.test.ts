import { describe, expect, it } from 'vitest';
import { LEAD_RESCUE_SCENARIOS } from '@/data/profiles/kestrel/scenarios/lead-rescue';
import { runLeadRescue } from './helpers';

/**
 * Deterministic replay is the property every other claim rests on.
 *
 * If a run were not reproducible, the duplicate-suppression and escalation tests would
 * prove nothing about the next run, and "replay the scenario" in the UI would be a
 * re-animation rather than a re-execution.
 */
describe('deterministic replay', () => {
  it('produces byte-identical output across repeated runs', async () => {
    for (const scenario of LEAD_RESCUE_SCENARIOS) {
      const first = await runLeadRescue(scenario);
      const second = await runLeadRescue(scenario);

      expect(JSON.stringify(second), `${scenario.slug} is not reproducible`).toBe(
        JSON.stringify(first),
      );
    }
  });

  it('produces identical output when runs are interleaved, so no state leaks between them', async () => {
    const [a, b] = [LEAD_RESCUE_SCENARIOS[0], LEAD_RESCUE_SCENARIOS[1]];
    if (a === undefined || b === undefined) throw new Error('expected two scenarios');

    const aAlone = await runLeadRescue(a);
    const bAlone = await runLeadRescue(b);

    // Interleave: each run must construct its own ledgers.
    const aAgain = await runLeadRescue(a);
    const bAgain = await runLeadRescue(b);

    expect(JSON.stringify(aAgain)).toBe(JSON.stringify(aAlone));
    expect(JSON.stringify(bAgain)).toBe(JSON.stringify(bAlone));
  });

  it('contains no wall-clock or random values in engine output', async () => {
    // Every timestamp in the output must trace back to an authored fixture value.
    for (const scenario of LEAD_RESCUE_SCENARIOS) {
      const run = await runLeadRescue(scenario);
      const authored = new Set(
        scenario.events.flatMap((e) => [e.occurredAt, e.receivedAt]),
      );

      for (const entry of run.timeline) {
        expect(authored.has(entry.event.occurredAt)).toBe(true);
        expect(authored.has(entry.event.receivedAt)).toBe(true);
        expect(Number.isInteger(entry.atOffsetSeconds)).toBe(true);
      }
    }
  });

  it('orders the timeline by event then by authored offset', async () => {
    for (const scenario of LEAD_RESCUE_SCENARIOS) {
      const run = await runLeadRescue(scenario);
      const byEvent = new Map<string, number[]>();

      for (const entry of run.timeline) {
        byEvent.set(entry.event.eventId, [
          ...(byEvent.get(entry.event.eventId) ?? []),
          entry.atOffsetSeconds,
        ]);
      }

      for (const [eventId, offsets] of byEvent) {
        const sorted = [...offsets].sort((x, y) => x - y);
        expect(offsets, `${scenario.slug}/${eventId} steps are out of order`).toEqual(sorted);
      }
    }
  });
});
