import { describe, expect, it } from 'vitest';
import { ALL_SYSTEMS, systemBySlug } from '@/data/systems';
import { SOURCE_BY_ID } from '@/data/research/sources';
import { isSettledEvidence, evidenceDisplay } from '@/lib/model/provenance';
import { isAccountedFor, isTerminal, validateLifecycle } from '@/lib/model/system';

describe('system definitions', () => {
  it('loads all six systems', () => {
    expect(ALL_SYSTEMS).toHaveLength(6);
    const slugs = ALL_SYSTEMS.map((s) => s.slug);
    expect(new Set(slugs).size).toBe(6);
  });

  it('orders systems uniquely from 1 to 6', () => {
    const orders = ALL_SYSTEMS.map((s) => s.order).sort((a, b) => a - b);
    expect(orders).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('is retrievable by slug', () => {
    expect(systemBySlug('lead-rescue')?.name).toBe('Lead Rescue');
    expect(systemBySlug('does-not-exist')).toBeUndefined();
  });

  describe.each(ALL_SYSTEMS.map((s) => [s.slug, s] as const))('%s', (_slug, system) => {
    it('has a coherent lifecycle graph', () => {
      expect(validateLifecycle(system)).toEqual([]);
    });

    it('can always reach a state that accounts for the work', () => {
      const accounted = system.lifecycle.states.filter((s) => isAccountedFor(s.kind));
      expect(accounted.length).toBeGreaterThan(0);
    });

    it('declares no outgoing transition from any terminal state', () => {
      const terminalIds = new Set(
        system.lifecycle.states.filter((s) => isTerminal(s.kind)).map((s) => s.id),
      );
      const leaks = system.lifecycle.transitions.filter((t) => terminalIds.has(t.from));
      expect(leaks).toEqual([]);
    });

    it('cites only sources that exist in the ledger', () => {
      for (const standard of system.standards) {
        for (const id of standard.sourceIds) {
          expect(SOURCE_BY_ID.has(id), `${system.slug}: unknown source "${id}"`).toBe(true);
        }
      }
    });

    it('has at least one primary or authoritative source across its evidence', () => {
      const evidence = system.standards.filter((s) => s.provenance === 'EVIDENCE');
      expect(evidence.length, `${system.slug} has no EVIDENCE standards`).toBeGreaterThan(0);

      const cited = evidence.flatMap((s) => s.sourceIds).map((id) => SOURCE_BY_ID.get(id));
      expect(cited.some((s) => s?.primary === true)).toBe(true);
    });

    it('gives every metric an explicit definition and a named system of record', () => {
      for (const metric of system.metrics) {
        expect(metric.definition.length).toBeGreaterThan(20);
        expect(metric.sourceOfTruth.length).toBeGreaterThan(0);
      }
    });

    it('resolves every failure mode into a named state, never a generic error', () => {
      for (const mode of system.failureModes) {
        expect(mode.terminalState.toLowerCase()).not.toBe('error');
        expect(mode.terminalState.length).toBeGreaterThan(4);
        expect(mode.detection.length).toBeGreaterThan(10);
        expect(mode.recovery.length).toBeGreaterThan(10);
      }
    });

    it('never presents an unverified claim as settled evidence', () => {
      for (const standard of system.standards) {
        const display = evidenceDisplay(standard);
        if (standard.verification !== 'VERIFIED' && standard.verification !== 'NOT_APPLICABLE') {
          expect(display.settled).toBe(false);
          expect(display.qualifier).not.toBeNull();
        }
        if (isSettledEvidence(standard)) {
          expect(standard.provenance).toBe('EVIDENCE');
          expect(standard.verification).toBe('VERIFIED');
          expect(standard.sourceIds.length).toBeGreaterThan(0);
        }
      }
    });
  });
});
