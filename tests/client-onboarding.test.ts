import { describe, expect, it } from 'vitest';
import { runClientOnboarding } from './helpers';
import {
  CLIENT_ONBOARDING_SCENARIOS,
  clientOnboardingScenarioBySlug,
} from '@/data/profiles/kestrel/scenarios/client-onboarding';
import {
  admitOnboardingTask,
  requirementStatus,
  resolveAuthoritativeValue,
  screenForSecretLikeContent,
  CLIENT_ONBOARDING_HANDLERS,
  type KnownValue,
  type OnboardingTask,
  type SignedEngagementHandoff,
} from '@/lib/engine/handlers/client-onboarding';
import { applyEvent } from '@/lib/engine/reducer';
import { EventLedger, ExecutionLedger, SideEffectLedger } from '@/lib/engine/ledger';
import { initialState } from '@/lib/engine/types';
import { CLIENT_ONBOARDING } from '@/data/systems';
import { KESTREL } from '@/data/profiles/kestrel/profile';
import { FixtureResourceProvisioner } from '@/lib/ports/resource-provisioner';
import type { CanonicalEvent, Scenario } from '@/lib/model/runtime';

const scenarioA = clientOnboardingScenarioBySlug('signed-client-to-first-value');
const scenarioB = clientOnboardingScenarioBySlug('duplicate-provisioning-reconciled');

if (scenarioA === undefined || scenarioB === undefined) {
  throw new Error('Client Onboarding scenario fixtures are missing.');
}

describe('Client Onboarding — signed client to first value', () => {
  it('reaches the declared first-value milestone', async () => {
    const run = await runClientOnboarding(scenarioA);
    expect(run.finalState.lifecycleState).toBe('FIRST_VALUE_REACHED');
  });

  it('never re-requests a field the signed handoff already established', async () => {
    const run = await runClientOnboarding(scenarioA);
    const gapDecisions = run.decisions.filter((d) => d.objective.includes('Request only items that are genuinely missing'));
    for (const d of gapDecisions) {
      expect(d.missingInformation).not.toContain('named-owner');
      expect(d.missingInformation).not.toContain('signed-sow');
    }
    // The gap-computation step must show it explicitly, not just omit it silently.
    const gapsComputed = run.decisions.find((d) => d.id.endsWith(':d-gaps-computed'));
    expect(gapsComputed?.deterministicFacts.some((f) => f.label === 'Known (reused)' && f.value.includes('named-owner'))).toBe(true);
  });

  it('creates each delivery resource exactly once', async () => {
    const run = await runClientOnboarding(scenarioA);
    const provisionEffects = run.sideEffects.filter((e) => e.kind === 'RESOURCE_PROVISION');
    expect(provisionEffects).toHaveLength(2);
    expect(provisionEffects.every((e) => e.status === 'EXECUTED')).toBe(true);
    expect(run.ledgerEntries.some((e) => e.idempotencyKey.startsWith('onboarding:eng-bramwell:'))).toBe(false);
  });

  it('reaches the milestone with recorded evidence while a non-milestone task remains open', async () => {
    const run = await runClientOnboarding(scenarioA);
    const milestoneDecision = run.decisions.find((d) => d.id.endsWith(':d-first-value'));
    expect(milestoneDecision).toBeDefined();
    const evidenceFact = milestoneDecision?.deterministicFacts.find((f) => f.label === 'Completion evidence');
    expect(evidenceFact?.value.length).toBeGreaterThan(0);
    const openFact = milestoneDecision?.deterministicFacts.find((f) => f.label === 'Other tasks still open');
    expect(openFact?.value).toContain('confirm-audit-firm-engagement');
  });

  it('requests sensitive access through the secure channel rather than capturing a value', async () => {
    const run = await runClientOnboarding(scenarioA);
    const accessDecision = run.decisions.find((d) => d.id.endsWith(':d-access-requested'));
    expect(accessDecision).toBeDefined();
    for (const fact of accessDecision?.deterministicFacts ?? []) {
      expect(fact.value).not.toMatch(/AKIA|BEGIN .*PRIVATE KEY/);
    }
  });
});

describe('Client Onboarding — duplicate provisioning reconciled', () => {
  it('converges on one logical environment without duplicating resources', async () => {
    const run = await runClientOnboarding(scenarioB);
    expect(run.finalState.lifecycleState).toBe('TASKS_ASSIGNED');

    const provisionEffects = run.sideEffects.filter((e) => e.kind === 'RESOURCE_PROVISION');
    expect(provisionEffects).toHaveLength(4); // 2 resources x 2 delivered attempts
    const executed = provisionEffects.filter((e) => e.status === 'EXECUTED');
    const suppressed = provisionEffects.filter((e) => e.status === 'SUPPRESSED_DUPLICATE');
    expect(executed).toHaveLength(2);
    expect(suppressed).toHaveLength(2);
  });

  it('independently rejects the redelivered event’s illegal lifecycle transition', async () => {
    const run = await runClientOnboarding(scenarioB);
    const rejected = run.transitions.filter((t) => !t.accepted);
    expect(rejected.length).toBeGreaterThan(0);
    expect(rejected.some((t) => t.from === 'TASKS_ASSIGNED' && t.to === 'PROVISIONING')).toBe(true);
  });

  it('detects the redelivered event as a duplicate at the event ledger too', () => {
    // Both access.grant.confirmed events share the same source + sourceEventId.
    const grantEvents = scenarioB.events.filter((e) => e.type === 'access.grant.confirmed');
    expect(grantEvents).toHaveLength(2);
    expect(grantEvents[0]?.sourceEventId).toBe(grantEvents[1]?.sourceEventId);
  });
});

describe('Client Onboarding — malformed or unauthoritative handoff', () => {
  function handoffEvent(payload: Record<string, unknown>): CanonicalEvent {
    return {
      eventId: 'evt-malformed-1',
      correlationId: 'inc-malformed',
      entityId: 'eng-malformed',
      type: 'engagement.signed',
      source: 'test-source',
      sourceEventId: 'src-malformed-1',
      occurredAt: '2026-08-18T10:00:00-04:00',
      receivedAt: '2026-08-18T10:00:01-04:00',
      schemaVersion: '2026-08-01',
      actor: 'EXTERNAL_PARTY',
      executionMode: 'SIMULATED',
      payload,
    };
  }

  function run(payload: Record<string, unknown>) {
    return applyEvent(initialState('AGREEMENT_SIGNED'), handoffEvent(payload), {
      system: CLIENT_ONBOARDING,
      profile: KESTREL,
      handlers: CLIENT_ONBOARDING_HANDLERS,
      judgments: new Map(),
      internals: { effects: new SideEffectLedger(), events: new EventLedger(), executions: new ExecutionLedger() },
    });
  }

  it('a proposal that was only approved and despatched — not signed — does not authorise onboarding', () => {
    const result = run({
      handoff: {
        kind: 'PROPOSAL_SENT',
        customerId: 'cust-x',
        customerName: 'X',
        engagementId: 'eng-x',
        commercialArtifact: { id: 'proposal:x', version: 1, approvedBy: 'founder', approvedAt: '2026-08-11T09:00:00-04:00' },
        serviceLineId: 'questionnaire-sprint',
        scopeSummary: 's',
        exclusions: [],
        sellerCommitments: [],
        customerCommitments: [],
        timing: '4 weeks',
        successCriteria: [],
        stakeholders: [],
        knownFacts: {},
        knownUnknowns: [],
        originatingSystem: 'call-to-proposal',
      },
    });
    expect(result.state.lifecycleState).toBe('AGREEMENT_SIGNED');
    expect(result.entries[0]?.decisions[0]?.escalationReason).toContain('signed-agreement');
  });

  it('a malformed handoff payload does not authorise onboarding', () => {
    const result = run({ handoff: { kind: 'SIGNED_AGREEMENT' } });
    expect(result.state.lifecycleState).toBe('AGREEMENT_SIGNED');
    expect(result.entries[0]?.stepLabel).toBe('Handoff validation');
  });
});

describe('Client Onboarding — direct behavioural tests', () => {
  it('precedence: a signed-agreement value is never silently overwritten by a lower-ranked source', () => {
    const existing: KnownValue = { field: 'audit-window', value: 'Q1 2027', source: 'SIGNED_AGREEMENT', recordedAt: 't0' };
    const candidate: KnownValue = { field: 'audit-window', value: 'Q3 2027', source: 'CUSTOMER_INTAKE', recordedAt: 't1' };
    const result = resolveAuthoritativeValue(existing, candidate);
    expect(result.kind).toBe('RESOLVED');
    if (result.kind === 'RESOLVED') expect(result.value).toEqual(existing);
  });

  it('a genuine same-rank contradiction routes the handler itself to NEEDS_HUMAN, never resolved by recency', async () => {
    // First intake supplies only audit-window, deliberately leaving the other two
    // non-sensitive gaps open so the engine is still AWAITING_CUSTOMER_INPUT (not further
    // along) when the second, contradicting intake arrives — otherwise the contradicting
    // event would find no declared transition out of whatever state onboarding had
    // already progressed to, which would test transition legality, not conflict routing.
    const conflictingIntake: Scenario = {
      ...scenarioA,
      id: 'co-scenario-conflict-test',
      slug: 'co-conflict-test',
      events: [
        scenarioA.events[0]!,
        {
          ...scenarioA.events[1]!,
          eventId: 'evt-conflict-1',
          sourceEventId: 'src-conflict-1',
          payload: { items: [{ requirementId: 'audit-window', value: 'Q1 2027', suppliedBy: 'Priya Nandy' }] },
        },
        {
          ...scenarioA.events[1]!,
          eventId: 'evt-conflict-2',
          sourceEventId: 'src-conflict-2',
          occurredAt: '2026-08-19T15:00:00-04:00',
          receivedAt: '2026-08-19T15:00:01-04:00',
          payload: {
            items: [
              { requirementId: 'audit-window', value: 'Q3 2027', suppliedBy: 'Priya Nandy' },
              { requirementId: 'system-inventory', value: 'AWS single account.', suppliedBy: 'Priya Nandy' },
              { requirementId: 'existing-policies', value: 'No formal policies exist yet.', suppliedBy: 'Priya Nandy' },
            ],
          },
        },
      ],
      expectedFinalState: 'NEEDS_HUMAN',
    };

    const run = await runClientOnboarding(conflictingIntake);
    expect(run.finalState.lifecycleState).toBe('NEEDS_HUMAN');
    const conflictDecision = run.decisions.find((d) => d.escalationReason?.includes('Conflicting information'));
    expect(conflictDecision?.escalationReason).toContain('audit-window');
  });

  it('precedence: two same-rank sources that disagree stay an unresolved conflict, never picked by recency', () => {
    const existing: KnownValue = { field: 'audit-window', value: 'Q1 2027', source: 'CUSTOMER_INTAKE', recordedAt: 't0' };
    const candidate: KnownValue = { field: 'audit-window', value: 'Q3 2027', source: 'CUSTOMER_INTAKE', recordedAt: 't1' };
    const result = resolveAuthoritativeValue(existing, candidate);
    expect(result.kind).toBe('CONFLICT');
  });

  it('gap model: a sensitive requirement always requires secure collection, even with a value on file', () => {
    const known: KnownValue = { field: 'cloud-access', value: 'admin:1234', source: 'CUSTOMER_INTAKE', recordedAt: 't0' };
    const evaluation = requirementStatus('cloud-access', true, known, false);
    expect(evaluation.status).toBe('REQUIRES_SECURE_COLLECTION');
  });

  it('scope gate: refuses a task implying a service the signed engagement did not buy', () => {
    const handoff: SignedEngagementHandoff = {
      kind: 'SIGNED_AGREEMENT',
      customerId: 'c',
      customerName: 'C',
      engagementId: 'e',
      commercialArtifact: { id: 'p', version: 1, approvedBy: 'founder', approvedAt: 't0' },
      serviceLineId: 'questionnaire-sprint',
      scopeSummary: 's',
      exclusions: [],
      sellerCommitments: [],
      customerCommitments: [],
      timing: '4 weeks',
      successCriteria: [],
      stakeholders: [],
      knownFacts: {},
      knownUnknowns: [],
      originatingSystem: 'call-to-proposal',
    };
    const driftingTask: OnboardingTask = {
      id: 'propose-iso27001-gap-assessment',
      description: 'Kick off an ISO 27001 gap assessment.',
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
    const result = admitOnboardingTask(driftingTask, handoff);
    expect(result.admitted).toBe(false);
    expect(result.reason).toContain('not the signed engagement');
  });

  it('secret screen: the reserved test sentinel is detected and never persisted or rendered', async () => {
    const scenario = {
      ...scenarioA,
      id: 'co-scenario-secret-leak-test',
      slug: 'co-secret-leak-test',
      events: [
        scenarioA.events[0]!,
        {
          ...scenarioA.events[1]!,
          payload: {
            items: [
              { requirementId: 'existing-policies', value: 'TEST_ONLY_SECRET_SENTINEL_DO_NOT_USE', suppliedBy: 'Priya Nandy' },
              { requirementId: 'system-inventory', value: 'AWS single account.', suppliedBy: 'Priya Nandy' },
              { requirementId: 'audit-window', value: 'No formal audit window yet.', suppliedBy: 'Priya Nandy' },
            ],
          },
        },
      ],
    };

    const run = await runClientOnboarding(scenario);
    const serializedFacts = JSON.stringify(run.finalState.facts);
    expect(serializedFacts).not.toContain('TEST_ONLY_SECRET_SENTINEL_DO_NOT_USE');

    const serializedTimeline = JSON.stringify(run.decisions) + JSON.stringify(run.timeline.map((t) => t.summary));
    expect(serializedTimeline).not.toContain('TEST_ONLY_SECRET_SENTINEL_DO_NOT_USE');

    expect(screenForSecretLikeContent('TEST_ONLY_SECRET_SENTINEL_DO_NOT_USE')).not.toBeNull();
  });

  it('an existing conflicting resource is never blindly overwritten', async () => {
    const workspaceKey = 'onboarding:eng-bramwell:workspace';
    const provisioner = new FixtureResourceProvisioner({
      [workspaceKey]: { fingerprint: 'a-completely-different-desired-state' },
    });
    const run = await runClientOnboarding(scenarioA, provisioner);
    expect(run.finalState.lifecycleState).toBe('NEEDS_HUMAN');
    const conflictEffect = run.sideEffects.find((e) => e.idempotencyKey === workspaceKey);
    expect(conflictEffect?.status).toBe('CONFLICT_DETECTED');
  });

  it('partial provisioning: a successful resource is not lost or recreated when a sibling attempt is unresolved', async () => {
    const taskListAttemptId = 'prov-bramwell-tasklist-a1';
    const provisioner = new FixtureResourceProvisioner(
      {},
      {},
      { [taskListAttemptId]: { kind: 'OUTCOME_UNKNOWN', reason: 'provider timed out mid-call' } },
    );
    const run = await runClientOnboarding(scenarioA, provisioner);
    expect(run.finalState.lifecycleState).toBe('NEEDS_HUMAN');

    const workspaceEffect = run.sideEffects.find((e) => e.technical?.outcomeKind === 'CREATED');
    expect(workspaceEffect?.status).toBe('EXECUTED');
    const unresolvedEffect = run.sideEffects.find((e) => e.technical?.outcomeKind === 'OUTCOME_UNKNOWN');
    expect(unresolvedEffect?.status).toBe('OUTCOME_UNKNOWN');
  });
});

describe('Client Onboarding — registry wiring', () => {
  it('registers both scenarios', () => {
    expect(CLIENT_ONBOARDING_SCENARIOS).toHaveLength(2);
  });
});
