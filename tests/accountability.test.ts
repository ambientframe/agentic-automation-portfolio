import { describe, expect, it } from 'vitest';
import { KESTREL } from '@/data/profiles/kestrel/profile';
import {
  resolveAccountableRole,
  validateProfileConsistency,
  type BusinessProfile,
} from '@/lib/model/profile';

/**
 * WHO IS ACCOUNTABLE FOR AN ACTION IS A FACT ABOUT A BUSINESS, NOT AN INFERENCE FROM RANK.
 *
 * `resolveEscalationOwner` answers "which role has enough authority for this?" and refuses to
 * break a tie between equally-qualified roles — deliberately, and its own docstring explains
 * why an invented tie-break would be the same category of mistake this codebase already
 * rejected once. That refusal is correct and stays.
 *
 * But it left a real question unanswerable. Kestrel's Operations Coordinator and Finance both
 * cap at authority 2, so asking "who approves a proposal?" by authority alone returns an honest
 * ambiguity — and neither of them approves proposals. The profile's own prose already says who
 * does: the Client Partner "owns named accounts through qualification, scoping, and proposal",
 * escalating to the founder who "approves all commercial commitments". That was prose, and a
 * validator cannot check a sentence.
 *
 * `accountabilities` makes it data. It is NOT a tie-break dressed as configuration — it does
 * not rank roles against each other, and it changes nothing about what authority permits. It
 * records one thing a real business genuinely knows and this model could not previously
 * express: whose desk a specific action lands on, and whose desk it goes to next.
 *
 * The guards below are what keep it from becoming a rubber stamp: an accountability naming a
 * role that does not exist, or escalating to somebody who is not actually above the accountable
 * role, is a defect the build refuses rather than a preference it honours.
 */

function withAccountabilities(entries: unknown[]): BusinessProfile {
  return { ...KESTREL, accountabilities: entries } as unknown as BusinessProfile;
}

describe('declared accountability', () => {
  describe('resolution', () => {
    it('names the role Kestrel actually holds accountable for approving a proposal', () => {
      const resolved = resolveAccountableRole(KESTREL, 'PROPOSAL_APPROVAL');
      expect(resolved?.accountable.id).toBe('client-partner');
      expect(resolved?.escalatesTo?.id).toBe('founder');
    });

    it('returns undefined for an action nobody is declared accountable for', () => {
      expect(resolveAccountableRole(KESTREL, 'FEEDING_THE_OFFICE_CAT')).toBeUndefined();
    });

    it('resolves a dangling role reference to nobody, never to a plausible stand-in', () => {
      // A dangling reference is a profile defect `validateProfileConsistency` reports. Quietly
      // resolving it to whichever role happens to be first would hide the defect behind an
      // answer that looks like it worked — and would name a person nobody chose.
      const broken = withAccountabilities([
        { action: 'PROPOSAL_APPROVAL', roleId: 'nobody-here', policyId: 'kestrel-proposal-authority' },
      ]);
      expect(resolveAccountableRole(broken, 'PROPOSAL_APPROVAL')).toBeUndefined();
    });

    it('resolves a dangling escalation reference to no escalation, keeping the accountable role', () => {
      const broken = withAccountabilities([
        {
          action: 'PROPOSAL_APPROVAL',
          roleId: 'client-partner',
          escalatesToRoleId: 'nobody-here',
          policyId: 'kestrel-proposal-authority',
        },
      ]);
      const resolved = resolveAccountableRole(broken, 'PROPOSAL_APPROVAL');
      expect(resolved?.accountable.id).toBe('client-partner');
      expect(resolved?.escalatesTo).toBeUndefined();
    });

    it('does not invent an escalation target when none is declared', () => {
      const profile = withAccountabilities([
        { action: 'SOLO_ACTION', roleId: 'founder', policyId: 'kestrel-proposal-authority' },
      ]);
      const resolved = resolveAccountableRole(profile, 'SOLO_ACTION');
      expect(resolved?.accountable.id).toBe('founder');
      expect(resolved?.escalatesTo).toBeUndefined();
    });
  });

  describe('the guards that stop it becoming a rubber stamp', () => {
    it('refuses an accountability naming a role that does not exist', () => {
      const issues = validateProfileConsistency(
        withAccountabilities([
          { action: 'PROPOSAL_APPROVAL', roleId: 'nobody-here', policyId: 'kestrel-proposal-authority' },
        ]),
      );
      expect(issues.map((i) => i.kind)).toContain('ACCOUNTABILITY_ROLE_REF');
    });

    it('refuses an escalation target that does not exist', () => {
      const issues = validateProfileConsistency(
        withAccountabilities([
          {
            action: 'PROPOSAL_APPROVAL',
            roleId: 'client-partner',
            escalatesToRoleId: 'nobody-here',
            policyId: 'kestrel-proposal-authority',
          },
        ]),
      );
      expect(issues.map((i) => i.kind)).toContain('ACCOUNTABILITY_ESCALATION_REF');
    });

    it('refuses a sideways "escalation" to someone at the same authority', () => {
      // Head of Delivery and Client Partner both cap at 3. Handing an unactioned case from one
      // to the other is a transfer, not an escalation, and calling it one would let a timeout
      // report progress it did not make.
      const issues = validateProfileConsistency(
        withAccountabilities([
          {
            action: 'PROPOSAL_APPROVAL',
            roleId: 'client-partner',
            escalatesToRoleId: 'head-of-delivery',
            policyId: 'kestrel-proposal-authority',
          },
        ]),
      );
      expect(issues.map((i) => i.kind)).toContain('ACCOUNTABILITY_ESCALATION_NOT_UPWARD');
    });

    it('refuses an escalation to somebody with less authority', () => {
      const issues = validateProfileConsistency(
        withAccountabilities([
          {
            action: 'PROPOSAL_APPROVAL',
            roleId: 'founder',
            escalatesToRoleId: 'analyst',
            policyId: 'kestrel-proposal-authority',
          },
        ]),
      );
      expect(issues.map((i) => i.kind)).toContain('ACCOUNTABILITY_ESCALATION_NOT_UPWARD');
    });

    it('refuses an accountability with no stated policy behind it', () => {
      const issues = validateProfileConsistency(
        withAccountabilities([
          { action: 'PROPOSAL_APPROVAL', roleId: 'client-partner', policyId: 'no-such-policy' },
        ]),
      );
      expect(issues.map((i) => i.kind)).toContain('ACCOUNTABILITY_POLICY_REF');
    });

    it('refuses two accountabilities for the same action', () => {
      const issues = validateProfileConsistency(
        withAccountabilities([
          { action: 'PROPOSAL_APPROVAL', roleId: 'client-partner', policyId: 'kestrel-proposal-authority' },
          { action: 'PROPOSAL_APPROVAL', roleId: 'founder', policyId: 'kestrel-proposal-authority' },
        ]),
      );
      expect(issues.map((i) => i.kind)).toContain('ACCOUNTABILITY_DUPLICATE');
    });
  });

  it('leaves the real profile internally consistent', () => {
    expect(validateProfileConsistency(KESTREL)).toEqual([]);
  });

  it('changes nothing about what authority permits', () => {
    // Accountability says whose desk an action lands on. It must not quietly become a way to
    // grant somebody authority they do not have.
    const clientPartner = KESTREL.roles.find((r) => r.id === 'client-partner');
    expect(clientPartner?.authorityCeiling).toBe(3);
    const resolved = resolveAccountableRole(KESTREL, 'PROPOSAL_APPROVAL');
    expect(resolved?.accountable.authorityCeiling).toBe(3);
  });
});
