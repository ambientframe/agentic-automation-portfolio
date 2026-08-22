import { describe, expect, it } from 'vitest';
import { runCallToProposal, runClientOnboarding } from './helpers';
import { callToProposalScenarioBySlug } from '@/data/profiles/kestrel/scenarios/call-to-proposal';
import { clientOnboardingScenarioBySlug } from '@/data/profiles/kestrel/scenarios/client-onboarding';
import {
  approveProposalArtifact,
  createProposalArtifact,
  readArtifact,
  readClaims,
  type Claim,
} from '@/lib/engine/handlers/call-to-proposal';
import { admitOnboardingTask, type OnboardingTask, type SignedEngagementHandoff } from '@/lib/engine/handlers/client-onboarding';
import { exportSignedEngagementHandoff } from '@/lib/engine/handoffs/proposal-to-onboarding-handoff';
import { KESTREL } from '@/data/profiles/kestrel/profile';

/**
 * THE SYSTEM 3 -> SYSTEM 4 BOUNDARY, EXERCISED DIRECTLY.
 *
 * `tests/call-to-proposal.test.ts` and `tests/client-onboarding.test.ts` prove each
 * system correct on its own terms. This file proves the SEAM between them: that
 * `exportSignedEngagementHandoff` produces exactly the handoff Client Onboarding's own
 * fixture consumes, that it refuses rather than fabricates when Call-to-Proposal's state
 * is not genuinely authoritative, and that a live-translated handoff drives Client
 * Onboarding to completion exactly as the pinned fixture does.
 */

const SIGNATURE = { customerId: 'cust-bramwell', engagementId: 'eng-bramwell' };

const cpScenarioA = callToProposalScenarioBySlug('discovery-to-approved-proposal');
const cpScenarioB = callToProposalScenarioBySlug('unsupported-scope-claim-blocked');
const coScenarioA = clientOnboardingScenarioBySlug('signed-client-to-first-value');

if (cpScenarioA === undefined || cpScenarioB === undefined || coScenarioA === undefined) {
  throw new Error('Fixture scenarios required for the handoff-boundary tests are missing.');
}

const pinnedBramwellHandoff = (coScenarioA.events[0]!.payload as { handoff: SignedEngagementHandoff }).handoff;

const MINIMAL_CLAIMS: Claim[] = [
  { field: 'buyerCompanyName', value: 'Acme', source: 'TRANSCRIPT', evidenceRefs: ['s1'] },
  { field: 'desiredOutcome', value: 'Unblock a stalled deal.', source: 'TRANSCRIPT', evidenceRefs: ['s1'] },
  { field: 'serviceInterest', value: 'questionnaire-sprint', source: 'TRANSCRIPT', evidenceRefs: ['s1'] },
  { field: 'timing', value: '4 weeks', source: 'TRANSCRIPT', evidenceRefs: ['s1'] },
  { field: 'nextStepOwner', value: 'Jane', source: 'TRANSCRIPT', evidenceRefs: ['s1'] },
  { field: 'primaryContact', value: 'Jane — CTO', source: 'TRANSCRIPT', evidenceRefs: ['s1'] },
];

describe('System 3 -> System 4 boundary — translation matches the live upstream run', () => {
  it('produces exactly the handoff Client Onboarding’s own fixture consumes', async () => {
    const cpRun = await runCallToProposal(cpScenarioA);
    expect(cpRun.finalState.lifecycleState).toBe('APPROVED_SENT');

    const result = exportSignedEngagementHandoff(
      readArtifact(cpRun.finalState.facts),
      readClaims(cpRun.finalState.facts),
      cpRun.finalState.missingInformation,
      KESTREL,
      SIGNATURE,
    );

    expect(result.kind).toBe('OK');
    if (result.kind === 'OK') expect(result.handoff).toEqual(pinnedBramwellHandoff);
  });

  it('is live-sensitive: a changed admitted claim changes the translated handoff, not just a fixture someone would need to remember to also edit', async () => {
    const cpRun = await runCallToProposal(cpScenarioA);
    const artifact = readArtifact(cpRun.finalState.facts);
    const mutatedClaims = readClaims(cpRun.finalState.facts).map((c) =>
      c.field === 'serviceInterest' ? { ...c, value: 'managed-compliance' } : c,
    );

    const result = exportSignedEngagementHandoff(artifact, mutatedClaims, cpRun.finalState.missingInformation, KESTREL, SIGNATURE);

    expect(result.kind).toBe('OK');
    if (result.kind === 'OK') {
      expect(result.handoff.serviceLineId).toBe('managed-compliance');
      expect(result.handoff.serviceLineId).not.toBe(pinnedBramwellHandoff.serviceLineId);
    }
  });

  it('the live-translated handoff genuinely authorises onboarding through to first value, not merely the pinned fixture', async () => {
    const cpRun = await runCallToProposal(cpScenarioA);
    const result = exportSignedEngagementHandoff(
      readArtifact(cpRun.finalState.facts),
      readClaims(cpRun.finalState.facts),
      cpRun.finalState.missingInformation,
      KESTREL,
      SIGNATURE,
    );
    expect(result.kind).toBe('OK');
    if (result.kind !== 'OK') return;

    const liveScenario = {
      ...coScenarioA,
      id: 'co-scenario-live-translated-handoff-test',
      slug: 'co-live-translated-handoff-test',
      events: [{ ...coScenarioA.events[0]!, payload: { handoff: result.handoff } }, ...coScenarioA.events.slice(1)],
    };
    const coRun = await runClientOnboarding(liveScenario);
    expect(coRun.finalState.lifecycleState).toBe('FIRST_VALUE_REACHED');
  });
});

describe('System 3 -> System 4 boundary — authority and corruption', () => {
  it('unsigned/draft: a proposal blocked at NEEDS_HUMAN for an unsupported claim produces no artifact and no handoff', async () => {
    const cpRun = await runCallToProposal(cpScenarioB);
    expect(cpRun.finalState.lifecycleState).toBe('NEEDS_HUMAN');

    const artifact = readArtifact(cpRun.finalState.facts);
    expect(artifact).toBeNull();

    const result = exportSignedEngagementHandoff(artifact, readClaims(cpRun.finalState.facts), cpRun.finalState.missingInformation, KESTREL, {
      customerId: 'cust-larkspur',
      engagementId: 'eng-larkspur',
    });
    expect(result.kind).toBe('REFUSED');
  });

  it('malformed source state: a revision after approval — approval names the old version — is refused, not translated with a stale approver', () => {
    let artifact = createProposalArtifact('opp-acme', 't0', MINIMAL_CLAIMS, [], KESTREL);
    artifact = approveProposalArtifact(artifact, 'founder', 't1');
    artifact = { ...artifact, version: artifact.version + 1 }; // a revision that was never re-approved

    const result = exportSignedEngagementHandoff(artifact, MINIMAL_CLAIMS, [], KESTREL, { customerId: 'c', engagementId: 'e' });
    expect(result.kind).toBe('REFUSED');
    if (result.kind === 'REFUSED') expect(result.reason).toContain('not deliverable');
  });

  it('malformed source state: an approved, deliverable artifact missing a claim field this translation needs is refused rather than defaulted', () => {
    const incompleteClaims = MINIMAL_CLAIMS.filter((c) => c.field !== 'nextStepOwner' && c.field !== 'primaryContact');
    let artifact = createProposalArtifact('opp-acme', 't0', incompleteClaims, [], KESTREL);
    artifact = approveProposalArtifact(artifact, 'founder', 't1');
    expect(artifact.claimStatus).toBe('ALL_SUPPORTED'); // every remaining claim is still individually admissible

    const result = exportSignedEngagementHandoff(artifact, incompleteClaims, [], KESTREL, { customerId: 'c', engagementId: 'e' });
    expect(result.kind).toBe('REFUSED');
    if (result.kind === 'REFUSED') {
      expect(result.reason).toContain('nextStepOwner');
      expect(result.reason).toContain('primaryContact');
    }
  });

  it('signed scope cannot expand during translation: serviceLineId is exactly what Call-to-Proposal admitted, and a task implying a different service is refused downstream', async () => {
    const cpRun = await runCallToProposal(cpScenarioA);
    const claims = readClaims(cpRun.finalState.facts);
    const result = exportSignedEngagementHandoff(readArtifact(cpRun.finalState.facts), claims, cpRun.finalState.missingInformation, KESTREL, SIGNATURE);
    expect(result.kind).toBe('OK');
    if (result.kind !== 'OK') return;

    expect(result.handoff.serviceLineId).toBe(claims.find((c) => c.field === 'serviceInterest')?.value);

    const driftingTask: OnboardingTask = {
      id: 'expand-to-iso27001',
      description: 'Kick off an ISO 27001 gap assessment nobody bought.',
      owner: 'client-partner',
      ownerType: 'KESTREL_ROLE',
      dependsOn: [],
      requiresInformation: [],
      completionCriterion: 'n/a',
      milestoneRelated: false,
      automationMayExecute: false,
      requiresCustomerAction: false,
      requiresSecureAccess: false,
      impliedServiceLineId: 'iso27001',
      status: 'READY',
    };
    const admission = admitOnboardingTask(driftingTask, result.handoff);
    expect(admission.admitted).toBe(false);
  });

  it('an unknown upstream fact (budgetDiscussed) stays a known-unknown downstream — it never becomes an inferred knownFact', async () => {
    const cpRun = await runCallToProposal(cpScenarioA);
    const result = exportSignedEngagementHandoff(
      readArtifact(cpRun.finalState.facts),
      readClaims(cpRun.finalState.facts),
      cpRun.finalState.missingInformation,
      KESTREL,
      SIGNATURE,
    );
    expect(result.kind).toBe('OK');
    if (result.kind !== 'OK') return;

    expect(result.handoff.knownUnknowns).toContain('budgetDiscussed');
    expect(Object.keys(result.handoff.knownFacts)).not.toContain('budgetDiscussed');
  });

  it('provenance survives translation: originatingSystem is always the literal call-to-proposal, not a caller-supplied value', async () => {
    const cpRun = await runCallToProposal(cpScenarioA);
    const result = exportSignedEngagementHandoff(
      readArtifact(cpRun.finalState.facts),
      readClaims(cpRun.finalState.facts),
      cpRun.finalState.missingInformation,
      KESTREL,
      SIGNATURE,
    );
    expect(result.kind).toBe('OK');
    if (result.kind === 'OK') expect(result.handoff.originatingSystem).toBe('call-to-proposal');
  });
});
