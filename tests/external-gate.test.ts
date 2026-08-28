import { describe, expect, it } from 'vitest';

import { KESTREL } from '@/data/profiles/kestrel/profile';
import { ASHCOMBE } from '@/data/profiles/ashcombe/profile';
import {
  closedGatesFor,
  gateById,
  validateProfileConsistency,
  type BusinessProfile,
  type ExternalGate,
} from '@/lib/model/profile';

/**
 * BLOCKED IS NOT OVERDUE — the primitive, tested apart from any system that uses it.
 *
 * `docs/MODEL_GAPS.md` records this as the gap that generalises furthest: a completed tax return
 * waiting on a signed Form 8879 is legally forbidden to send, and the model had only "overdue".
 * A firm obeying a rule was reported as a firm behind on its work.
 *
 * The distinction these assertions defend:
 *
 *   OVERDUE           an AUTHORIZED obligation was not completed in time.
 *   ATTENTION_BLOCKED execution is not authorized, because a declared dependency is unsatisfied.
 *
 * Everything here is deterministic. A gate is closed because a named fact is absent — never
 * because a model judged it likely. Bounded AI judgment may propose that the fact be recorded,
 * through the ordinary provider port and with a decision on the record; it may not waive the
 * gate, and no confidence score reaches this code.
 */

const gateOf = (profile: BusinessProfile, id: string): ExternalGate => {
  const gate = gateById(profile, id);
  if (gate === undefined) throw new Error(`${profile.id} declares no gate "${id}"`);
  return gate;
};

describe('an external gate is open or closed on evidence, never on judgment', () => {
  it('reports no closed gates for a profile that declares none', () => {
    expect(closedGatesFor(KESTREL, 'NO_SUCH_ACTION', {})).toEqual([]);
  });

  it('is CLOSED while its releasing fact is absent', () => {
    const gate = gateOf(ASHCOMBE, 'ashcombe-signed-8879');
    expect(closedGatesFor(ASHCOMBE, gate.gatesAction, {}).map((g) => g.id)).toContain(gate.id);
  });

  it('is OPEN once the releasing fact is recorded, whatever its value', () => {
    const gate = gateOf(ASHCOMBE, 'ashcombe-signed-8879');
    const facts = { [gate.releasedByFact]: '2026-08-28T10:00:00.000Z' };
    expect(closedGatesFor(ASHCOMBE, gate.gatesAction, facts)).toEqual([]);
  });

  /**
   * A gate that applied to every action would make every timeout blocked, which is the failure
   * mode opposite to the one being fixed — and just as dishonest.
   */
  it('applies only to the action it declares it gates', () => {
    const gate = gateOf(ASHCOMBE, 'ashcombe-signed-8879');
    expect(closedGatesFor(ASHCOMBE, `${gate.gatesAction}_SOMETHING_ELSE`, {})).toEqual([]);
  });

  it('states all six things an operator needs to act on the block', () => {
    for (const profile of [KESTREL, ASHCOMBE]) {
      for (const gate of profile.externalGates ?? []) {
        const where = `${profile.id}/${gate.id}`;
        expect(gate.blocks.length, `${where}: does not say what is blocked`).toBeGreaterThan(20);
        expect(gate.basis.length, `${where}: does not say why the gate exists`).toBeGreaterThan(20);
        expect(gate.satisfiedBy.length, `${where}: does not say what releases it`).toBeGreaterThan(20);
        expect(gate.ownedBy.length, `${where}: does not say who owns the dependency`).toBeGreaterThan(5);
        expect(gate.authorizes.length, `${where}: does not say what release authorizes`).toBeGreaterThan(20);
        expect(gate.releasedByFact.length, `${where}: names no releasing fact`).toBeGreaterThan(3);
      }
    }
  });

  /**
   * The escape hatch Chris asked for, and the reason it is a per-gate boolean rather than an
   * absence: a profile whose business clock genuinely runs despite the dependency must say so
   * explicitly, so that "blocked" keeps one meaning everywhere else.
   */
  it('defaults to holding the action clock, and makes the exception explicit', () => {
    const gate = gateOf(ASHCOMBE, 'ashcombe-signed-8879');
    expect(gate.actionClockRunsWhileBlocked).toBe(false);
    expect(typeof gate.actionClockRunsWhileBlocked).toBe('boolean');
  });
});

describe('a declared gate is held to the same consistency rules as everything else', () => {
  it('accepts the profiles that declare gates today', () => {
    for (const profile of [KESTREL, ASHCOMBE]) {
      expect(validateProfileConsistency(profile), `${profile.id} contradicts itself`).toEqual([]);
    }
  });

  const mutate = (profile: BusinessProfile, change: (gate: ExternalGate) => ExternalGate): BusinessProfile => ({
    ...profile,
    externalGates: (profile.externalGates ?? []).map(change),
  });

  it('rejects a gate whose policy does not resolve', () => {
    const broken = mutate(ASHCOMBE, (gate) => ({ ...gate, policyId: 'no-such-policy' }));
    expect(validateProfileConsistency(broken).map((i) => i.detail).join(' ')).toContain('no-such-policy');
  });

  it('rejects a follow-up owner who is not a role in this firm', () => {
    const broken = mutate(ASHCOMBE, (gate) =>
      gate.followUp === undefined ? gate : { ...gate, followUp: { ...gate.followUp, roleId: 'nobody' } },
    );
    expect(validateProfileConsistency(broken).map((i) => i.detail).join(' ')).toContain('nobody');
  });

  it('rejects two gates sharing an id', () => {
    const gate = gateOf(ASHCOMBE, 'ashcombe-signed-8879');
    const broken: BusinessProfile = { ...ASHCOMBE, externalGates: [gate, gate] };
    expect(validateProfileConsistency(broken).map((i) => i.detail).join(' ')).toContain(gate.id);
  });
});
