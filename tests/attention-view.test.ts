import { describe, expect, it } from 'vitest';
import { ALL_SYSTEMS } from '@/data/systems';
import { LEAD_RESCUE, CALL_TO_PROPOSAL, CLIENT_ONBOARDING } from '@/data/systems';
import { deriveAttentionView } from '@/lib/proof/attention-view';
import type { SystemDefinition } from '@/lib/model/system';

/**
 * THE BUYER-FACING HALF of the parked-state audit, on the same terms as the coverage panel:
 * the derivation computes everything, the component renders it, and the numbers in the prose
 * are computed from the counts so a sentence cannot drift away from the figure beside it.
 *
 * The zero case carries the weight here. A system with nothing on its list has NOT been proven
 * safe — it has declared, for every state work parks in, what happens when nobody acts. That is
 * a statement about what canon says, and the headline has to say so in those words. Writing
 * "fully covered" or "complete" would be the exact move `docs/STATUS.md`'s integrity rule
 * forbids: absence of a finding rendered as evidence of absence.
 */

describe('parked-state attention view', () => {
  it('computes the headline from the counts, so prose cannot drift from the figure', () => {
    for (const system of ALL_SYSTEMS) {
      const view = deriveAttentionView(system);
      if (view.abandonable.length > 0) {
        expect(view.headline, system.id).toContain(String(view.abandonable.length));
      }
      expect(view.headline, system.id).toContain(String(view.parked));
    }
  });

  it('states the zero case as a declaration made, never as a system proven safe', () => {
    const view = deriveAttentionView(LEAD_RESCUE);
    expect(view.abandonable).toEqual([]);
    expect(view.clean).toBe(true);
    // The words that would turn "nothing found" into "nothing there".
    const headline = view.headline.toLowerCase();
    for (const forbidden of ['complete', 'fully covered', 'no risk', 'safe']) {
      expect(headline, `headline must not claim "${forbidden}"`).not.toContain(forbidden);
    }
    expect(headline).toContain('declares');
  });

  it('names each exposed state with its label and its exits, so a row can be checked', () => {
    const view = deriveAttentionView(CLIENT_ONBOARDING);
    const row = view.abandonable.find((r) => r.stateId === 'NEEDS_HUMAN');
    expect(row).toBeDefined();
    expect(row?.stateLabel).toBe('Needs human');
    expect(row?.exits.length).toBeGreaterThan(0);
    for (const exit of row?.exits ?? []) {
      expect(exit.mechanism).toBe('HUMAN_DECISION');
    }
  });

  it('counts every parked state, not only the exposed ones, so the ratio is honest', () => {
    const view = deriveAttentionView(CALL_TO_PROPOSAL);
    // AWAITING_CLARIFICATION, AWAITING_APPROVAL, NEEDS_HUMAN — one of which is exposed.
    expect(view.parked).toBe(3);
    expect(view.abandonable.map((r) => r.stateId)).toEqual(['NEEDS_HUMAN']);
  });

  it('carries the limit that makes the panel honest, in the panel itself', () => {
    const caveats = deriveAttentionView(CALL_TO_PROPOSAL).caveats.join(' ').toLowerCase();
    // Load-bearing: this audits declarations, not implementations. A panel that omits this
    // reads as a correctness guarantee, which it is not.
    expect(caveats).toContain('declares');
    expect(caveats).toContain('not');
  });

  it('renders a stable order regardless of how states were declared', () => {
    // No system currently exposes more than one state, so ordering is unreachable from the
    // real model and a mutation removing the sort survived the first suite. Driven directly
    // here rather than left untested — the panel's row order must not encode the incidental
    // order somebody happened to type the lifecycle in.
    const base = ALL_SYSTEMS[0];
    if (base === undefined) throw new Error('no systems registered');
    const twoExposed: SystemDefinition = {
      ...base,
      id: 'fixture-two-exposed',
      lifecycle: {
        states: [
          { id: 'START', label: 'Start', kind: 'INITIAL', description: 'Start.' },
          { id: 'ZED_PARKED', label: 'Zed parked', kind: 'HUMAN_REVIEW', description: 'Held.' },
          { id: 'ALPHA_PARKED', label: 'Alpha parked', kind: 'WAITING', description: 'Held.' },
          { id: 'DONE', label: 'Done', kind: 'TERMINAL_SUCCESS', description: 'Done.' },
        ],
        transitions: [
          { id: 'fx-t01', from: 'START', to: 'ZED_PARKED', trigger: 'Held', mechanism: 'DETERMINISTIC_RULE', guard: 'Always.', authority: 3 },
          { id: 'fx-t02', from: 'ZED_PARKED', to: 'ALPHA_PARKED', trigger: 'Human decision', mechanism: 'HUMAN_DECISION', guard: 'A person acted.', authority: 2 },
          { id: 'fx-t03', from: 'ALPHA_PARKED', to: 'DONE', trigger: 'Human decision', mechanism: 'HUMAN_DECISION', guard: 'A person acted.', authority: 2 },
        ],
      },
      failureModes: [],
    };
    expect(deriveAttentionView(twoExposed).abandonable.map((r) => r.stateId)).toEqual([
      'ALPHA_PARKED',
      'ZED_PARKED',
    ]);

    for (const system of ALL_SYSTEMS) {
      const ids = deriveAttentionView(system).abandonable.map((r) => r.stateId);
      expect(ids, system.id).toEqual([...ids].sort((a, b) => a.localeCompare(b)));
    }
  });
});
