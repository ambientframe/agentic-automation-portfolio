import { describe, expect, it } from 'vitest';
import {
  DORMANT_PIPELINE_RECOVERY_SCENARIOS,
  dormantPipelineRecoveryScenarioBySlug,
} from '@/data/profiles/kestrel/scenarios/dormant-pipeline-recovery';
import { ScenarioSchema, type CanonicalEvent } from '@/lib/model/runtime';
import { runDormantPipelineRecovery } from './helpers';

function scenario(slug: string) {
  const found = dormantPipelineRecoveryScenarioBySlug(slug);
  if (found === undefined) throw new Error(`scenario "${slug}" not found`);
  return found;
}

describe('Dormant Pipeline Recovery scenarios', () => {
  it('provides the three scenarios this iteration requires', () => {
    expect(DORMANT_PIPELINE_RECOVERY_SCENARIOS.map((s) => s.slug)).toEqual([
      'eligible-reactivation',
      'suppressed-recovery',
      'ambiguous-entity-match',
    ]);
  });

  it('reaches the expected final state in every scenario', async () => {
    for (const s of DORMANT_PIPELINE_RECOVERY_SCENARIOS) {
      const run = await runDormantPipelineRecovery(s);
      expect(run.finalState.lifecycleState, s.slug).toBe(s.expectedFinalState);
    }
  });

  it('never executes a side effect outside simulation', async () => {
    for (const s of DORMANT_PIPELINE_RECOVERY_SCENARIOS) {
      const run = await runDormantPipelineRecovery(s);
      for (const effect of run.sideEffects) {
        expect(effect.executionMode, `${s.slug}/${effect.id}`).toBe('SIMULATED');
      }
    }
  });

  // -------------------------------------------------------------------------
  // Scenario A — eligible reactivation
  // -------------------------------------------------------------------------
  describe('eligible reactivation', () => {
    it('runs consent and active-account checks before the re-entry reason is ever evaluated', async () => {
      const run = await runDormantPipelineRecovery(scenario('eligible-reactivation'));
      const order = run.timeline.map((e) => e.stepLabel);

      expect(order).toEqual([
        'Eligibility review opened',
        'Consent check',
        'Active-account exclusion',
        'Re-entry reason check',
        'Attempt budget & consent re-check',
        'Reactivation attempt',
        'Attempt logged',
        'Reply received',
        'Reply interpretation',
        'Disposition',
        'Human decision',
      ]);
    });

    it('computes the re-entry reason from a genuine date comparison, not a narrated yes', async () => {
      const run = await runDormantPipelineRecovery(scenario('eligible-reactivation'));
      const reentry = run.decisions.find((d) => d.id.endsWith('d-reentry'));

      expect(reentry?.mechanism).toBe('DETERMINISTIC_RULE');
      expect(reentry?.deterministicFacts.find((f) => f.label === 'Re-entry reason')?.value).toBe(
        'OBJECTION_EXPIRED',
      );
    });

    it('re-checks consent immediately before despatch rather than trusting the earlier check alone', async () => {
      const run = await runDormantPipelineRecovery(scenario('eligible-reactivation'));
      const budget = run.decisions.find((d) => d.id.endsWith('d-budget'));

      expect(budget?.deterministicFacts.some((f) => f.label === 'Consent re-check')).toBe(true);
    });

    it('despatches exactly one simulated contact attempt', async () => {
      const run = await runDormantPipelineRecovery(scenario('eligible-reactivation'));
      const sends = run.sideEffects.filter((e) => e.kind === 'MESSAGE_SEND');

      expect(sends).toHaveLength(1);
      expect(sends[0]?.status).toBe('EXECUTED');
      expect(sends[0]?.idempotencyKey).toBe('outreach:opp-ferro:1');
    });

    it('never lets the bounded judgment select an action or raise its own authority', async () => {
      const run = await runDormantPipelineRecovery(scenario('eligible-reactivation'));
      const judgments = run.decisions.filter((d) => d.mechanism === 'BOUNDED_AI_JUDGMENT');

      expect(judgments).toHaveLength(1);
      for (const d of judgments) {
        expect(d.selectedAction).toBe('return_classification');
        expect(d.authority).toBeLessThanOrEqual(1);
      }
    });

    it('holds for a named human acceptance rather than reopening on judgment confidence alone', async () => {
      const run = await runDormantPipelineRecovery(scenario('eligible-reactivation'));
      const states = run.timeline.map((e) => e.stateAfter);

      expect(states).toContain('POSITIVE_RESPONSE');
      const humanDecision = run.decisions.find((d) => d.mechanism === 'HUMAN_DECISION');
      expect(humanDecision?.selectedAction).toBe('transition_to_REOPENED');
    });

    it('verifies the deciding role actually holds the authority it used', async () => {
      const run = await runDormantPipelineRecovery(scenario('eligible-reactivation'));
      const authorityChecks = run.verifications.filter((v) => v.check.includes('authority'));
      expect(authorityChecks.length).toBeGreaterThan(0);
      for (const check of authorityChecks) expect(check.result).toBe('PASS');
    });

    it('writes the reopened disposition back to the system of record, with a verification record', async () => {
      const run = await runDormantPipelineRecovery(scenario('eligible-reactivation'));
      const write = run.sideEffects.find((e) => e.kind === 'RECORD_WRITE');

      expect(write?.status).toBe('EXECUTED');
      const verification = run.verifications.find((v) => v.sideEffectId === write?.id);
      expect(verification?.result).toBe('PASS');
    });

    it('replays byte-identical', async () => {
      const s = scenario('eligible-reactivation');
      const first = await runDormantPipelineRecovery(s);
      const second = await runDormantPipelineRecovery(s);
      expect(JSON.stringify(second)).toBe(JSON.stringify(first));
    });
  });

  // -------------------------------------------------------------------------
  // Scenario B — suppressed recovery
  // -------------------------------------------------------------------------
  describe('suppressed recovery', () => {
    it('evaluates consent before any re-entry reason and produces zero side effects', async () => {
      const run = await runDormantPipelineRecovery(scenario('suppressed-recovery'));

      expect(run.sideEffects).toHaveLength(0);
      expect(run.timeline.map((e) => e.stepLabel)).toEqual(['Eligibility review opened', 'Consent check']);
    });

    it('never consults a bounded AI judgment — the block is a deterministic gate, not a policy check on a computed action', async () => {
      const run = await runDormantPipelineRecovery(scenario('suppressed-recovery'));
      expect(run.decisions.filter((d) => d.mechanism === 'BOUNDED_AI_JUDGMENT')).toHaveLength(0);
    });

    it('names the candidate re-entry reason that would otherwise have qualified, and the policy that overrides it', async () => {
      const run = await runDormantPipelineRecovery(scenario('suppressed-recovery'));
      const consent = run.decisions.find((d) => d.id.endsWith('d-consent'));

      expect(
        consent?.deterministicFacts.find((f) => f.label === 'Candidate re-entry reason (not consulted)')?.value,
      ).toBe('RECYCLE_DATE_REACHED');
      expect(consent?.applicablePolicy.join(' ')).toContain('kestrel-suppression-immediate');
    });

    it('produces an explicit terminal disposition rather than disappearing from the workflow', async () => {
      const run = await runDormantPipelineRecovery(scenario('suppressed-recovery'));
      expect(run.finalState.lifecycleState).toBe('SUPPRESSED');
    });

    it('replays byte-identical', async () => {
      const s = scenario('suppressed-recovery');
      const first = await runDormantPipelineRecovery(s);
      const second = await runDormantPipelineRecovery(s);
      expect(JSON.stringify(second)).toBe(JSON.stringify(first));
    });
  });

  // -------------------------------------------------------------------------
  // Reliability guarantees inherited from Lead Rescue's proven architecture
  // -------------------------------------------------------------------------
  describe('reliability guarantees', () => {
    it('redelivering the same triggering event produces zero additional customer-facing outreach', async () => {
      const base = scenario('eligible-reactivation');
      const firstEvent = base.events[0];
      if (firstEvent === undefined) throw new Error('expected a first event');

      // Same sourceEventId, a different eventId: the same business event, delivered twice.
      const redelivered: CanonicalEvent = {
        ...firstEvent,
        eventId: 'evt-ferro-001-redelivered',
        receivedAt: '2026-08-18T09:04:00-04:00',
      };

      const duplicateRun = ScenarioSchema.parse({
        id: 'dp-scenario-eligible-reactivation-duplicate-test',
        slug: 'eligible-reactivation-duplicate-test',
        systemId: 'dormant-pipeline-recovery',
        title: 'Redelivery test',
        summary: 'Redelivers the first event of the eligible-reactivation scenario to test idempotency.',
        demonstrates: ['duplicate suppression'],
        events: [firstEvent, redelivered],
        judgments: {},
        expectedFinalState: 'AWAITING_RESPONSE',
      });

      const run = await runDormantPipelineRecovery(duplicateRun);

      const outreach = run.sideEffects.filter((e) => e.idempotencyKey === 'outreach:opp-ferro:1');
      expect(outreach).toHaveLength(2);
      expect(outreach.filter((e) => e.status === 'EXECUTED')).toHaveLength(1);
      expect(outreach.filter((e) => e.status === 'SUPPRESSED_DUPLICATE')).toHaveLength(1);
      // The lifecycle graph legitimately declares a cadence-retry edge back onto
      // REACTIVATION_ATTEMPTED from AWAITING_RESPONSE (dp-t10), so the redelivered event's
      // requested transitions are structurally legal even though they are a coincidental
      // replay rather than a genuine cadence-due retry. Transition legality alone does not
      // guarantee replay produces the SAME reasoning path — only the idempotency ledger on
      // the side effect itself guarantees no second customer-facing consequence. That is
      // the guarantee this test actually asserts.
      expect(run.finalState.lifecycleState).toBe('AWAITING_RESPONSE');
    });

    it('a terminal disposition cannot be moved again by a later human decision', async () => {
      const base = scenario('eligible-reactivation');
      const secondAttempt: CanonicalEvent = {
        eventId: 'evt-ferro-004',
        correlationId: 'inc-dp-ferro',
        entityId: 'opp-ferro',
        type: 'human.decision.recorded',
        source: 'operator-console',
        sourceEventId: 'console-2026-08-20-0900',
        occurredAt: '2026-08-20T09:00:00-04:00',
        receivedAt: '2026-08-20T09:00:00-04:00',
        schemaVersion: '2026-08-01',
        actor: 'HUMAN',
        executionMode: 'SIMULATED',
        payload: {
          decidedBy: 'client-partner',
          decision: 'CLOSE_ARCHIVED',
          rationale: 'Attempting to archive an opportunity that was already reopened.',
        },
      };

      const extended = ScenarioSchema.parse({
        ...base,
        id: 'dp-scenario-eligible-reactivation-terminal-test',
        slug: 'eligible-reactivation-terminal-test',
        events: [...base.events, secondAttempt],
      });

      const run = await runDormantPipelineRecovery(extended);

      const rejected = run.transitions.filter((t) => !t.accepted);
      expect(rejected.some((t) => t.from === 'REOPENED' && t.to === 'ARCHIVED')).toBe(true);
      expect(run.finalState.lifecycleState).toBe('REOPENED');
    });

    it('excludes an account that is already active elsewhere, before any re-entry reason is considered', async () => {
      const activeElsewhere = ScenarioSchema.parse({
        id: 'dp-scenario-active-elsewhere-test',
        slug: 'active-elsewhere-test',
        systemId: 'dormant-pipeline-recovery',
        title: 'Active-elsewhere test',
        summary: 'A dormant record whose account is already active elsewhere.',
        demonstrates: ['active-account exclusion'],
        events: [
          {
            eventId: 'evt-active-001',
            correlationId: 'inc-dp-active',
            entityId: 'opp-active',
            type: 'pipeline.dormant.evaluation.triggered',
            source: 'dormant-pipeline-job',
            sourceEventId: 'cycle-2026-08-21-0001',
            occurredAt: '2026-08-21T09:00:00-04:00',
            receivedAt: '2026-08-21T09:00:00-04:00',
            schemaVersion: '2026-08-01',
            actor: 'SYSTEM',
            executionMode: 'SIMULATED',
            payload: {
              accountName: 'Test Account',
              serviceInterest: 'soc2-type1',
              estimatedDealValue: 24_000,
              priorPipelineStage: 'scoping',
              recycleDate: '2026-08-01',
              accountStatus: 'ACTIVE_ELSEWHERE',
              consentState: 'PERMITTED',
              attemptsToDate: 0,
              ownerRoleId: 'client-partner',
            },
          },
        ],
        judgments: {},
        expectedFinalState: 'ARCHIVED',
      });

      const run = await runDormantPipelineRecovery(activeElsewhere);
      expect(run.finalState.lifecycleState).toBe('ARCHIVED');
      expect(run.sideEffects).toHaveLength(0);
    });

    it('archives a record with no declared re-entry reason rather than treating elapsed time as one', async () => {
      const noReason = ScenarioSchema.parse({
        id: 'dp-scenario-no-reason-test',
        slug: 'no-reason-test',
        systemId: 'dormant-pipeline-recovery',
        title: 'No re-entry reason test',
        summary: 'A dormant record with no configured recycle date or objection expiry.',
        demonstrates: ['inactivity alone is not a reason'],
        events: [
          {
            eventId: 'evt-noreason-001',
            correlationId: 'inc-dp-noreason',
            entityId: 'opp-noreason',
            type: 'pipeline.dormant.evaluation.triggered',
            source: 'dormant-pipeline-job',
            sourceEventId: 'cycle-2026-08-21-0002',
            occurredAt: '2026-08-21T09:00:00-04:00',
            receivedAt: '2026-08-21T09:00:00-04:00',
            schemaVersion: '2026-08-01',
            actor: 'SYSTEM',
            executionMode: 'SIMULATED',
            payload: {
              accountName: 'Quiet Account',
              serviceInterest: 'soc2-type1',
              estimatedDealValue: 24_000,
              priorPipelineStage: 'qualified',
              accountStatus: 'INACTIVE',
              consentState: 'PERMITTED',
              attemptsToDate: 0,
              ownerRoleId: 'client-partner',
            },
          },
        ],
        judgments: {},
        expectedFinalState: 'ARCHIVED',
      });

      const run = await runDormantPipelineRecovery(noReason);
      expect(run.finalState.lifecycleState).toBe('ARCHIVED');
      expect(run.sideEffects).toHaveLength(0);
      const reentry = run.decisions.find((d) => d.id.endsWith('d-reentry'));
      expect(reentry?.forbiddenActions).toContain('treat_elapsed_time_as_a_reason');
    });

    it('rejects a malformed evaluation payload without computing a disposition or side effect', async () => {
      const malformed = ScenarioSchema.parse({
        id: 'dp-scenario-malformed-test',
        slug: 'malformed-test',
        systemId: 'dormant-pipeline-recovery',
        title: 'Malformed payload test',
        summary: 'A malformed evaluation payload missing required fields.',
        demonstrates: ['malformed payload safety'],
        events: [
          {
            eventId: 'evt-malformed-001',
            correlationId: 'inc-dp-malformed',
            entityId: 'opp-malformed',
            type: 'pipeline.dormant.evaluation.triggered',
            source: 'dormant-pipeline-job',
            sourceEventId: 'cycle-2026-08-21-0004',
            occurredAt: '2026-08-21T09:00:00-04:00',
            receivedAt: '2026-08-21T09:00:00-04:00',
            schemaVersion: '2026-08-01',
            actor: 'SYSTEM',
            executionMode: 'SIMULATED',
            payload: { accountName: 'Incomplete Record' },
          },
        ],
        judgments: {},
        expectedFinalState: 'DORMANT',
      });

      const run = await runDormantPipelineRecovery(malformed);
      expect(run.finalState.lifecycleState).toBe('DORMANT');
      expect(run.sideEffects).toHaveLength(0);
      expect(run.transitions).toHaveLength(0);
    });

    it('strips an unrecognised payload field rather than letting it silently become trusted state', async () => {
      const base = scenario('eligible-reactivation');
      const firstEvent = base.events[0];
      if (firstEvent === undefined) throw new Error('expected a first event');

      const withExtraField = ScenarioSchema.parse({
        id: 'dp-scenario-unknown-field-test',
        slug: 'unknown-field-test',
        systemId: 'dormant-pipeline-recovery',
        title: 'Unknown payload field test',
        summary: 'An evaluation payload carrying a field the handler does not declare.',
        demonstrates: ['payload-schema watchpoint: unknown fields do not become trusted state'],
        events: [
          {
            ...firstEvent,
            payload: {
              ...firstEvent.payload,
              internalOpsNote: 'do-not-batch-with-autumn-campaign',
            },
          },
        ],
        judgments: {},
        expectedFinalState: 'AWAITING_RESPONSE',
      });

      const run = await runDormantPipelineRecovery(withExtraField);
      expect(run.finalState.lifecycleState).toBe('AWAITING_RESPONSE');
      // The raw event log legitimately retains the field verbatim — that is honest
      // inspectability, not a leak. What must never happen is the handler reading or
      // acting on it: it must not appear in anything the handler itself computed.
      const computed = JSON.stringify({
        facts: run.finalState.facts,
        decisions: run.decisions,
        sideEffects: run.sideEffects,
      });
      expect(computed).not.toContain('do-not-batch-with-autumn-campaign');
    });
  });
});

/**
 * FALSIFYING TESTS for dp-fm-wrong-entity — the WRONG_ENTITY_MATCH failure mode.
 *
 * The declared business impact is not an inconvenience: "Confidential commercial history is
 * disclosed to the wrong party." Reactivation outreach quotes the prior objection and the
 * original service interest back to whoever receives it, so matching the wrong person does not
 * send a merely irrelevant message — it hands one company's commercial history to another.
 *
 * That is why the guard sits BEFORE the consent screen rather than alongside the other
 * eligibility checks. Consent, active-account status, and the re-entry reason are all questions
 * about a SPECIFIC party; screening them against an identity nobody has established yet is
 * meaningless work that reads as diligence. Identity is not one eligibility check among several,
 * it is the precondition for all of them.
 */
describe('Dormant Pipeline Recovery — ambiguous entity match (dp-fm-wrong-entity)', () => {
  const AMBIGUOUS = 'ambiguous-entity-match';

  it('1. the scenario exists and ends in NEEDS_HUMAN rather than resolving to a candidate', async () => {
    const run = await runDormantPipelineRecovery(scenario(AMBIGUOUS));
    expect(run.finalState.lifecycleState).toBe('NEEDS_HUMAN');
  });

  it('2. zero side effects — nothing reaches any candidate while identity is unresolved', async () => {
    const run = await runDormantPipelineRecovery(scenario(AMBIGUOUS));
    expect(run.sideEffects).toHaveLength(0);
  });

  it('3. identity is resolved BEFORE consent is screened, not alongside the other eligibility checks', async () => {
    const run = await runDormantPipelineRecovery(scenario(AMBIGUOUS));
    const order = run.timeline.map((e) => e.stepLabel);
    const identity = order.indexOf('Entity resolution');
    const consent = order.indexOf('Consent check');

    expect(identity, 'no entity-resolution step ran at all').toBeGreaterThanOrEqual(0);
    // Consent may legitimately never run — the case stops at the ambiguity. What is forbidden
    // is consent running FIRST, which would be screening a party nobody had identified.
    if (consent >= 0) expect(identity).toBeLessThan(consent);
  });

  it('4. every candidate is attached to the decision, not just the closest one', async () => {
    const run = await runDormantPipelineRecovery(scenario(AMBIGUOUS));
    const identity = run.decisions.find((d) => d.id.endsWith('d-identity'));
    expect(identity, 'no identity decision was recorded').toBeDefined();

    const attached = (identity?.deterministicFacts ?? []).filter((f) => /candidate/i.test(f.label));
    expect(attached.length, 'fewer than two candidates attached to an ambiguous match').toBeGreaterThanOrEqual(2);
  });

  it('5. the decision is deterministic — no bounded judgment is consulted to break the tie', async () => {
    const run = await runDormantPipelineRecovery(scenario(AMBIGUOUS));
    const identity = run.decisions.find((d) => d.id.endsWith('d-identity'));
    expect(identity?.mechanism).toBe('DETERMINISTIC_RULE');
    expect(run.decisions.some((d) => d.mechanism === 'BOUNDED_AI_JUDGMENT')).toBe(false);
  });

  it('6. resolving to the closest candidate is named as forbidden, not merely omitted', async () => {
    const run = await runDormantPipelineRecovery(scenario(AMBIGUOUS));
    const identity = run.decisions.find((d) => d.id.endsWith('d-identity'));
    expect(identity?.forbiddenActions.join(' ')).toMatch(/closest|highest|best.?match/i);
  });

  it('7. the guard does not fire on the unambiguous scenarios — it is a discriminator, not a blanket halt', async () => {
    for (const slug of ['eligible-reactivation', 'suppressed-recovery']) {
      const run = await runDormantPipelineRecovery(scenario(slug));
      expect(
        run.timeline.map((e) => e.stepLabel),
        `entity resolution fired on ${slug}, which supplies no competing candidates`,
      ).not.toContain('Entity resolution');
    }
  });

  it('8. replays byte-identical', async () => {
    const a = await runDormantPipelineRecovery(scenario(AMBIGUOUS));
    const b = await runDormantPipelineRecovery(scenario(AMBIGUOUS));
    expect(JSON.stringify(a)).toEqual(JSON.stringify(b));
  });
});
