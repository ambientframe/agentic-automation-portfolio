import { describe, expect, it } from 'vitest';
import { KESTREL } from '@/data/profiles/kestrel/profile';
import { validateProfileConsistency } from '@/lib/model/profile';

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
