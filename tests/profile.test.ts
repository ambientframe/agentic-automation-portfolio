import { describe, expect, it } from 'vitest';
import { KESTREL } from '@/data/profiles/kestrel/profile';
import { resolveEscalationOwner, validateProfileConsistency } from '@/lib/model/profile';

describe('Kestrel business profile', () => {
  it('parses against the profile schema', () => {
    expect(KESTREL.id).toBe('kestrel');
    expect(KESTREL.name).toBe('Kestrel Compliance Group');
  });

  it('declares FIXTURE provenance so invented figures cannot read as researched benchmarks', () => {
    expect(KESTREL.provenance).toBe('FIXTURE');
    expect(KESTREL.fictionalDisclosure.length).toBeGreaterThan(40);
  });

  it('is internally consistent: revenue, funnel, and headcount describe one business', () => {
    const issues = validateProfileConsistency(KESTREL);
    expect(issues).toEqual([]);
  });

  it('carries only CLIENT_POLICY standards, never evidence claims', () => {
    for (const policy of KESTREL.policies) {
      expect(policy.provenance).toBe('CLIENT_POLICY');
      expect(policy.verification).toBe('NOT_APPLICABLE');
      expect(policy.sourceIds).toEqual([]);
    }
  });

  it('states what the firm is not, so guardrails have a factual basis', () => {
    const notList = KESTREL.company.explicitlyNot.join(' ').toLowerCase();
    expect(notList).toContain('certification body');
    expect(notList).toContain('auditor');
  });

  it('flags access-granting onboarding requirements as sensitive', () => {
    const sensitive = KESTREL.onboardingRequirements.filter((r) => r.sensitive);
    expect(sensitive.length).toBeGreaterThanOrEqual(3);
    // Every sensitive requirement must be an access grant, not merely confidential paperwork.
    for (const requirement of sensitive) {
      expect(requirement.item.toLowerCase()).toContain('access');
    }
  });

  it('names exactly one authoritative system for financial truth', () => {
    const financeOwners = KESTREL.sourceSystems.filter((s) =>
      s.systemOfRecordFor.some((f) => f.includes('payment status')),
    );
    expect(financeOwners).toHaveLength(1);
    expect(financeOwners[0]?.id).toBe('accounting');
  });
});

describe('resolveEscalationOwner — deterministic authority resolution', () => {
  it('resolves a configured qualifying role by closest-fit authority ceiling, never a fabricated person', () => {
    // Precondition, checked directly rather than assumed: two roles genuinely tie at
    // ceiling 3 in the real profile (head-of-delivery, client-partner), so this exercises
    // the tie-break, not merely "the only candidate."
    const tiedAtThree = KESTREL.roles.filter((r) => r.authorityCeiling === 3);
    expect(tiedAtThree.map((r) => r.id).sort()).toEqual(['client-partner', 'head-of-delivery']);

    const resolution = resolveEscalationOwner(KESTREL, 3);
    expect(resolution.status).toBe('RESOLVED');
    expect(resolution.role?.id).toBe('client-partner');
    expect(resolution.target).toBe('Client Partner');
    // The resolved name must be a real role name from the profile, never invented.
    expect(KESTREL.roles.map((r) => r.name)).toContain(resolution.target);
  });

  it('breaks ties between equal-ceiling roles deterministically, independent of declared array order', () => {
    const reordered = { ...KESTREL, roles: [...KESTREL.roles].reverse() };
    const forward = resolveEscalationOwner(KESTREL, 3);
    const reversed = resolveEscalationOwner(reordered, 3);
    expect(reversed.role?.id).toBe(forward.role?.id);
  });

  it('resolves the single role at a strictly higher required authority, distinct from the tied tier below it', () => {
    // authorityCeiling 4 is uniquely held by founder — proves a genuinely higher tier
    // resolves to a genuinely different owner than the tier-3 tie above.
    const resolution = resolveEscalationOwner(KESTREL, 4);
    expect(resolution.status).toBe('RESOLVED');
    expect(resolution.role?.id).toBe('founder');
    expect(resolution.target).not.toBe(resolveEscalationOwner(KESTREL, 3).target);
  });

  it('fails safe, without fabricating a person, when no configured role meets the required authority', () => {
    const restricted = { ...KESTREL, roles: [{ id: 'junior', name: 'Junior Analyst', responsibilities: 'Triage only.', authorityCeiling: 1 as const }] };
    const resolution = resolveEscalationOwner(restricted, 3);
    expect(resolution.status).toBe('UNRESOLVED');
    expect(resolution.role).toBeUndefined();
    // Never a real-looking name, and never the literal simulation placeholder it replaces.
    expect(restricted.roles.map((r) => r.name)).not.toContain(resolution.target);
    expect(resolution.target).not.toBe('Named owner');
    expect(resolution.target.length).toBeGreaterThan(0);
  });

  it('is a pure, deterministic function: identical input always produces identical output', () => {
    const a = resolveEscalationOwner(KESTREL, 2);
    const b = resolveEscalationOwner(KESTREL, 2);
    expect(a).toEqual(b);
  });
});
