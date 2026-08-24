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
  it('equal-authority candidates with no semantic tie-break in canon resolve as ambiguous, never silently picked by alphabetical role id', () => {
    // Precondition, checked directly rather than assumed: two roles genuinely tie at
    // ceiling 3 in the real profile (head-of-delivery, client-partner). `authorityCeiling`
    // is documented on RoleSchema itself as an execution CAP ("Caps what automation may do
    // on their behalf"), never an ordering — and nothing else in this repository ranks one
    // above the other for escalation purposes (checked directly: no role carries a rank/
    // priority/hierarchy field, and no canon text declares an order). Silently picking the
    // alphabetically-first role would be exactly the "incidental array order" failure this
    // function is required not to repeat, applied to string sorting instead.
    const tiedAtThree = KESTREL.roles.filter((r) => r.authorityCeiling === 3);
    expect(tiedAtThree.map((r) => r.id).sort()).toEqual(['client-partner', 'head-of-delivery']);

    const resolution = resolveEscalationOwner(KESTREL, 3);
    expect(resolution.status).toBe('UNRESOLVED_AMBIGUOUS_OWNER');
    expect(resolution.role).toBeUndefined();
    // The tied candidates are named for inspectability, but neither is EVER selected as
    // "the" resolved target — that would misrepresent an unresolved choice as a decision.
    expect(resolution.candidates?.map((r) => r.id).sort()).toEqual(['client-partner', 'head-of-delivery']);
    expect(resolution.target).not.toBe('Client Partner');
    expect(resolution.target).not.toBe('Head of Delivery');
  });

  it('ambiguity is order-independent: reordering profile.roles cannot alter the semantic outcome', () => {
    const reordered = { ...KESTREL, roles: [...KESTREL.roles].reverse() };
    const forward = resolveEscalationOwner(KESTREL, 3);
    const reversed = resolveEscalationOwner(reordered, 3);
    expect(reversed.status).toBe(forward.status);
    expect(reversed.candidates?.map((r) => r.id).sort()).toEqual(forward.candidates?.map((r) => r.id).sort());
    expect(reversed.target).toBe(forward.target);
  });

  it('resolves normally when the qualifying role at a required authority is genuinely unique', () => {
    // authorityCeiling 4 is uniquely held by founder — proves a genuinely unique candidate
    // still resolves cleanly, distinct from the tier-3 tie above, and is never itself
    // reported as ambiguous merely because a DIFFERENT tier happens to be ambiguous.
    const resolution = resolveEscalationOwner(KESTREL, 4);
    expect(resolution.status).toBe('RESOLVED');
    expect(resolution.role?.id).toBe('founder');
    expect(resolution.target).toBe('Managing Principal (founder)');
    expect(resolution.target).not.toBe(resolveEscalationOwner(KESTREL, 3).target);
  });

  it('fails safe, without fabricating a person, when no configured role meets the required authority', () => {
    const restricted = { ...KESTREL, roles: [{ id: 'junior', name: 'Junior Analyst', responsibilities: 'Triage only.', authorityCeiling: 1 as const }] };
    const resolution = resolveEscalationOwner(restricted, 3);
    expect(resolution.status).toBe('UNRESOLVED_NO_QUALIFYING_ROLE');
    expect(resolution.role).toBeUndefined();
    expect(resolution.candidates).toBeUndefined();
    // Never a real-looking name, and never the literal simulation placeholder it replaces.
    expect(restricted.roles.map((r) => r.name)).not.toContain(resolution.target);
    expect(resolution.target).not.toBe('Named owner');
    expect(resolution.target.length).toBeGreaterThan(0);
  });

  it('the two unresolved reasons are genuinely distinguishable, not the same fallback string reused', () => {
    const restricted = { ...KESTREL, roles: [{ id: 'junior', name: 'Junior Analyst', responsibilities: 'Triage only.', authorityCeiling: 1 as const }] };
    const noQualifying = resolveEscalationOwner(restricted, 3);
    const ambiguous = resolveEscalationOwner(KESTREL, 3);
    expect(noQualifying.status).not.toBe(ambiguous.status);
    expect(noQualifying.target).not.toBe(ambiguous.target);
  });

  it('is a pure, deterministic function: identical input always produces identical output', () => {
    const a = resolveEscalationOwner(KESTREL, 2);
    const b = resolveEscalationOwner(KESTREL, 2);
    expect(a).toEqual(b);
    // Also true of the ambiguous case specifically — ambiguity itself must be stable, not
    // re-derived differently call to call.
    const ambiguousA = resolveEscalationOwner(KESTREL, 3);
    const ambiguousB = resolveEscalationOwner(KESTREL, 3);
    expect(ambiguousA).toEqual(ambiguousB);
  });
});
