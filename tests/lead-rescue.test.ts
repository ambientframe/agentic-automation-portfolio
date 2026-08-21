import { describe, expect, it } from 'vitest';
import { LEAD_RESCUE_SCENARIOS, leadRescueScenarioBySlug } from '@/data/profiles/kestrel/scenarios/lead-rescue';
import { runLeadRescue } from './helpers';

function scenario(slug: string) {
  const found = leadRescueScenarioBySlug(slug);
  if (found === undefined) throw new Error(`scenario "${slug}" not found`);
  return found;
}

describe('Lead Rescue scenarios', () => {
  it('provides the three scenarios the brief requires, plus the two reliability-closure scenarios', () => {
    expect(LEAD_RESCUE_SCENARIOS.map((s) => s.slug)).toEqual([
      'after-hours-enquiry',
      'duplicate-delivery',
      'ambiguous-high-risk',
      'restricted-contact-review',
      'uncertain-downstream-outcome',
    ]);
  });

  it('reaches the expected final state in every scenario', async () => {
    for (const s of LEAD_RESCUE_SCENARIOS) {
      const run = await runLeadRescue(s);
      expect(run.finalState.lifecycleState, `${s.slug}`).toBe(s.expectedFinalState);
    }
  });

  it('never executes a side effect outside simulation', async () => {
    for (const s of LEAD_RESCUE_SCENARIOS) {
      const run = await runLeadRescue(s);
      for (const effect of run.sideEffects) {
        expect(effect.executionMode, `${s.slug}/${effect.id}`).toBe('SIMULATED');
      }
    }
  });

  // -------------------------------------------------------------------------
  // Scenario 1
  // -------------------------------------------------------------------------
  describe('after-hours enquiry', () => {
    it('computes the missing set as the intersection of policy and judgment, not from either alone', async () => {
      const run = await runLeadRescue(scenario('after-hours-enquiry'));
      const completeness = run.decisions.find((d) => d.id.endsWith('d-completeness'));

      expect(completeness).toBeDefined();
      expect(completeness?.mechanism).toBe('DETERMINISTIC_RULE');
      // 'framework' is policy-required but WAS established by the text, so it must not be asked for.
      expect(completeness?.missingInformation).toEqual(['target_audit_window', 'headcount']);
      expect(completeness?.missingInformation).not.toContain('framework');
    });

    it('asks only for the computed missing fields', async () => {
      const run = await runLeadRescue(scenario('after-hours-enquiry'));
      const question = run.sideEffects.find((e) => e.idempotencyKey.startsWith('question:'));

      expect(question?.status).toBe('EXECUTED');
      expect(question?.description).toContain('target_audit_window');
      expect(question?.description).toContain('headcount');
      expect(question?.description).not.toContain('framework');
    });

    it('screens consent before it interprets commercial intent', async () => {
      const run = await runLeadRescue(scenario('after-hours-enquiry'));
      const order = run.timeline.map((e) => e.stepLabel);
      expect(order.indexOf('Consent screen')).toBeLessThan(order.indexOf('Bounded interpretation'));
    });

    it('parks in a waiting state rather than closing or stalling', async () => {
      const run = await runLeadRescue(scenario('after-hours-enquiry'));
      const states = run.timeline.map((e) => e.stateAfter);
      expect(states).toContain('WAITING_FOR_REPLY');
    });

    it('verifies the deciding role actually holds the authority it used', async () => {
      const run = await runLeadRescue(scenario('after-hours-enquiry'));
      const authorityChecks = run.verifications.filter((v) => v.check.includes('authority'));
      expect(authorityChecks.length).toBeGreaterThan(0);
      for (const check of authorityChecks) expect(check.result).toBe('PASS');
    });
  });

  // -------------------------------------------------------------------------
  // Scenario 2 — the reliability claim the portfolio rests on
  // -------------------------------------------------------------------------
  describe('duplicate delivery', () => {
    it('receives the same business event twice', async () => {
      const s = scenario('duplicate-delivery');
      const ids = s.events.map((e) => e.sourceEventId);
      expect(ids[0]).toBe(ids[1]);
      expect(s.events[0]?.eventId).not.toBe(s.events[1]?.eventId);
    });

    it('produces ZERO duplicate external actions', async () => {
      const run = await runLeadRescue(scenario('duplicate-delivery'));

      const executed = run.sideEffects.filter((e) => e.status === 'EXECUTED');
      const keys = executed.map((e) => e.idempotencyKey);
      expect(new Set(keys).size, 'an idempotency key was executed more than once').toBe(keys.length);
    });

    it('suppresses the second acknowledgement rather than re-sending it', async () => {
      const run = await runLeadRescue(scenario('duplicate-delivery'));
      const acks = run.sideEffects.filter((e) => e.idempotencyKey.startsWith('ack:'));

      expect(acks).toHaveLength(2);
      expect(acks[0]?.status).toBe('EXECUTED');
      expect(acks[1]?.status).toBe('SUPPRESSED_DUPLICATE');
      expect(acks[1]?.detail).toContain('already claimed');
    });

    it('suppresses the second owner notification too', async () => {
      const run = await runLeadRescue(scenario('duplicate-delivery'));
      const notifications = run.sideEffects.filter((e) => e.idempotencyKey.startsWith('notify:'));

      expect(notifications).toHaveLength(2);
      expect(notifications.filter((n) => n.status === 'EXECUTED')).toHaveLength(1);
      expect(notifications.filter((n) => n.status === 'SUPPRESSED_DUPLICATE')).toHaveLength(1);
    });

    it('refuses to move the lifecycle backwards on replay', async () => {
      const run = await runLeadRescue(scenario('duplicate-delivery'));
      const rejected = run.transitions.filter((t) => !t.accepted);

      expect(rejected.length).toBeGreaterThan(0);
      expect(rejected.some((t) => t.to === 'NORMALIZED')).toBe(true);
      expect(rejected[0]?.rejectionReason).toContain('did not move');
    });

    it('ends in the state the first delivery produced, unchanged by the replay', async () => {
      const run = await runLeadRescue(scenario('duplicate-delivery'));
      expect(run.finalState.lifecycleState).toBe('BOOKING_READY');
    });

    it('records the duplicate on the timeline rather than hiding it', async () => {
      const run = await runLeadRescue(scenario('duplicate-delivery'));
      const dedupeSteps = run.timeline.filter((e) => e.stepLabel === 'Duplicate check');
      expect(dedupeSteps).toHaveLength(2);
      expect(dedupeSteps[1]?.summary).toContain('already observed');
    });
  });

  // -------------------------------------------------------------------------
  // Scenario 3
  // -------------------------------------------------------------------------
  describe('ambiguous high-risk enquiry', () => {
    it('escalates to human review on low confidence', async () => {
      const run = await runLeadRescue(scenario('ambiguous-high-risk'));
      const states = run.timeline.map((e) => e.stateAfter);
      expect(states).toContain('NEEDS_HUMAN');
    });

    it('compares confidence against the floor deterministically, outside the judgment', async () => {
      const run = await runLeadRescue(scenario('ambiguous-high-risk'));
      const floorCheck = run.decisions.find((d) => d.id.endsWith('d-floor'));

      expect(floorCheck).toBeDefined();
      expect(floorCheck?.mechanism).toBe('DETERMINISTIC_RULE');
      expect(floorCheck?.confidence).toBeUndefined();
      expect(floorCheck?.escalationReason).toContain('below floor');
    });

    it('sends absolutely nothing to the enquirer', async () => {
      const run = await runLeadRescue(scenario('ambiguous-high-risk'));
      const messages = run.sideEffects.filter((e) => e.kind === 'MESSAGE_SEND');
      expect(messages).toHaveLength(0);
    });

    it('surfaces what the judgment declined to infer rather than a confident summary', async () => {
      const run = await runLeadRescue(scenario('ambiguous-high-risk'));
      const judgment = run.decisions.find((d) => d.mechanism === 'BOUNDED_AI_JUDGMENT');

      expect(judgment?.evaluatorResult).toContain('Declined to infer');
      expect(judgment?.evaluatorResult).toContain('reportable');
    });

    it('never lets the judgment select an action', async () => {
      const run = await runLeadRescue(scenario('ambiguous-high-risk'));
      for (const d of run.decisions.filter((x) => x.mechanism === 'BOUNDED_AI_JUDGMENT')) {
        expect(d.selectedAction).toBe('return_classification');
        expect(d.authority).toBeLessThanOrEqual(1);
        expect(d.forbiddenActions).toContain('send_message');
      }
    });

    it('resolves through a person whose authority is checked, not assumed', async () => {
      const run = await runLeadRescue(scenario('ambiguous-high-risk'));
      const humanDecision = run.decisions.find((d) => d.mechanism === 'HUMAN_DECISION');

      expect(humanDecision).toBeDefined();
      expect(humanDecision?.deterministicFacts.some((f) => f.label.includes('Authority ceiling'))).toBe(true);
      expect(run.verifications.some((v) => v.check.includes('authority') && v.result === 'PASS')).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Scenario 4 — suppression / authority gate
  // -------------------------------------------------------------------------
  describe('restricted contact review', () => {
    it('genuinely executes the full pipeline before policy is evaluated', async () => {
      const run = await runLeadRescue(scenario('restricted-contact-review'));
      const order = run.timeline.map((e) => e.stepLabel);

      expect(order).toEqual([
        'Validation',
        'Normalisation',
        'Duplicate check',
        'Consent screen',
        'Bounded interpretation',
        'Completeness check',
        'Policy evaluation',
        'Human decision',
      ]);
    });

    it('classifies at high confidence, and the classification does not bypass the policy gate', async () => {
      const run = await runLeadRescue(scenario('restricted-contact-review'));
      const judgment = run.decisions.find((d) => d.mechanism === 'BOUNDED_AI_JUDGMENT');

      expect(judgment?.classification).toBe('QUALIFIED_ENQUIRY');
      expect(judgment?.confidence).toBeGreaterThanOrEqual(0.85);

      const policyDecision = run.decisions.find((d) => d.id.endsWith('d-policy-review'));
      expect(policyDecision?.mechanism).toBe('DETERMINISTIC_RULE');
      expect(policyDecision?.forbiddenActions).toContain('act_on_classification_confidence_alone');
    });

    it('computes the candidate action and blocks it by policy — never silently skips it', async () => {
      const run = await runLeadRescue(scenario('restricted-contact-review'));
      const candidate = run.sideEffects.find((e) => e.id.endsWith('effect:ack-candidate'));

      expect(candidate).toBeDefined();
      expect(candidate?.status).toBe('BLOCKED_BY_POLICY');
      expect(candidate?.detail).toContain('kestrel-restricted-contact-review');
    });

    it('names the applicable CLIENT_POLICY on the blocking decision, inspectably', async () => {
      const run = await runLeadRescue(scenario('restricted-contact-review'));
      const policyDecision = run.decisions.find((d) => d.id.endsWith('d-policy-review'));

      expect(policyDecision?.applicablePolicy.join(' ')).toContain('kestrel-restricted-contact-review');
      expect(policyDecision?.escalationReason).toContain('RESTRICTED_PENDING_REVIEW');
      expect(policyDecision?.authority).toBe(2);
    });

    it('routes to SUPPRESSION_REVIEW — distinct from DO_NOT_CONTACT, an open question rather than a closed one', async () => {
      const run = await runLeadRescue(scenario('restricted-contact-review'));
      const states = run.timeline.map((e) => e.stateAfter);
      expect(states).toContain('SUPPRESSION_REVIEW');
      expect(states).not.toContain('DO_NOT_CONTACT');
    });

    it('sends zero prohibited outbound effects — no MESSAGE_SEND ever reaches EXECUTED', async () => {
      const run = await runLeadRescue(scenario('restricted-contact-review'));
      const sends = run.sideEffects.filter((e) => e.kind === 'MESSAGE_SEND');
      expect(sends.every((e) => e.status !== 'EXECUTED')).toBe(true);
    });

    it('verifies the resolving role holds sufficient authority, rather than assuming it', async () => {
      const run = await runLeadRescue(scenario('restricted-contact-review'));
      const authorityCheck = run.verifications.find((v) => v.check.includes('authority'));
      expect(authorityCheck?.result).toBe('PASS');
    });

    it('produces a valid, inspectable disposition after human review', async () => {
      const run = await runLeadRescue(scenario('restricted-contact-review'));
      expect(run.finalState.lifecycleState).toBe('BOOKING_READY');

      const humanTransition = run.transitions.find((t) => t.from === 'SUPPRESSION_REVIEW');
      expect(humanTransition?.accepted).toBe(true);
      expect(humanTransition?.mechanism).toBe('HUMAN_DECISION');
    });

    it('replay produces the identical outcome — no accidental message on a second run', async () => {
      const s = scenario('restricted-contact-review');
      const first = await runLeadRescue(s);
      const second = await runLeadRescue(s);

      expect(JSON.stringify(second)).toBe(JSON.stringify(first));
      const sends = second.sideEffects.filter((e) => e.kind === 'MESSAGE_SEND');
      expect(sends.every((e) => e.status !== 'EXECUTED')).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Scenario 5 — uncertain downstream side effect
  // -------------------------------------------------------------------------
  describe('uncertain downstream outcome', () => {
    it('genuinely attempts the send through the executor, rather than narrating a timeout', async () => {
      const run = await runLeadRescue(scenario('uncertain-downstream-outcome'));
      const firstAck = run.sideEffects.find((e) => e.idempotencyKey === 'ack:lead-loom');

      expect(firstAck?.status).toBe('OUTCOME_UNKNOWN');
      expect(firstAck?.technical?.outcomeKind).toBe('OUTCOME_UNKNOWN');
      expect(firstAck?.technical?.provider).toBe('transactional-email');
    });

    it('is not automatically treated as a failure — distinct status from FAILED', async () => {
      const run = await runLeadRescue(scenario('uncertain-downstream-outcome'));
      const firstAck = run.sideEffects.find((e) => e.idempotencyKey === 'ack:lead-loom' && e.technical?.attempt === 1);

      expect(firstAck?.status).not.toBe('FAILED');
      expect(firstAck?.status).toBe('OUTCOME_UNKNOWN');
      expect(firstAck?.technical?.retrySafety).toBe('UNSAFE');
    });

    it('leaves the business lifecycle unaffected by the technical uncertainty', async () => {
      const run = await runLeadRescue(scenario('uncertain-downstream-outcome'));
      // The lead reaches BOOKING_READY on the strength of classification and completeness
      // alone — the acknowledgement's uncertain outcome never blocked or altered it.
      const dispositionTransition = run.transitions.find((t) => t.to === 'BOOKING_READY');
      expect(dispositionTransition?.accepted).toBe(true);
      expect(run.finalState.lifecycleState).toBe('BOOKING_READY');
    });

    it('runs a genuine verification check that narrows the uncertainty', async () => {
      const run = await runLeadRescue(scenario('uncertain-downstream-outcome'));
      const check = run.sideEffects.find((e) => e.kind === 'VERIFICATION_CHECK');

      expect(check?.status).toBe('EXECUTED');
      expect(check?.technical?.verificationStatus).toBe('CONFIRMED_NOT_EXECUTED');
    });

    it('permits the retry only after verification, and the retry succeeds with a real external id', async () => {
      const run = await runLeadRescue(scenario('uncertain-downstream-outcome'));
      const retry = run.sideEffects.find((e) => e.idempotencyKey === 'ack:lead-loom' && e.technical?.attempt === 2);

      expect(retry?.status).toBe('EXECUTED');
      expect(retry?.technical?.externalId).toBe('msg_7f2ac91d');
    });

    it('sends the customer-facing acknowledgement exactly once across the whole run', async () => {
      const run = await runLeadRescue(scenario('uncertain-downstream-outcome'));
      const executedAcks = run.sideEffects.filter(
        (e) => e.idempotencyKey === 'ack:lead-loom' && e.status === 'EXECUTED',
      );
      expect(executedAcks).toHaveLength(1);
    });

    it('never fabricates an external id — only the confirmed attempt carries one', async () => {
      const run = await runLeadRescue(scenario('uncertain-downstream-outcome'));
      const ackEffects = run.sideEffects.filter((e) => e.idempotencyKey === 'ack:lead-loom');

      for (const effect of ackEffects) {
        if (effect.status === 'EXECUTED') {
          expect(effect.technical?.externalId).toBeDefined();
        } else {
          expect(effect.technical?.externalId).toBeUndefined();
        }
      }
    });

    it('a naive retry with no verification and no provider guarantee is refused by the core', async () => {
      // Direct engine-level check, independent of this scenario's own (correct) fixture
      // sequencing — proves the guarantee holds even if a future scenario gets it wrong.
      const { ExecutionLedger } = await import('@/lib/engine/ledger');
      const ledger = new ExecutionLedger();
      ledger.record('k', {
        attempt: 1,
        outcome: { kind: 'OUTCOME_UNKNOWN', reason: 'no confirmation' },
        sideEffectId: 'eff-1',
        eventId: 'evt-1',
      });
      expect(ledger.evaluate('k', false).decision).toBe('BLOCKED_PENDING_VERIFICATION');
    });

    it('deterministic replay remains identical, including the retry’s external id', async () => {
      const s = scenario('uncertain-downstream-outcome');
      const first = await runLeadRescue(s);
      const second = await runLeadRescue(s);
      expect(JSON.stringify(second)).toBe(JSON.stringify(first));
    });
  });

  // -------------------------------------------------------------------------
  // Cross-cutting: unsupported inference
  // -------------------------------------------------------------------------
  it('never promotes a declined inference into engine facts', async () => {
    for (const s of LEAD_RESCUE_SCENARIOS) {
      const run = await runLeadRescue(s);
      const declined = Object.values(s.judgments).flatMap((j) => j.declinedToInfer);
      const factValues = Object.values(run.finalState.facts).join(' | ').toLowerCase();

      for (const item of declined) {
        // A declined inference must not appear as an established fact value.
        expect(factValues, `${s.slug}: declined inference leaked into facts`).not.toContain(
          item.toLowerCase(),
        );
      }
    }
  });

  it('leaves every scenario in a state that accounts for the work', async () => {
    for (const s of LEAD_RESCUE_SCENARIOS) {
      const run = await runLeadRescue(s);
      // Terminal, waiting, or with a person. Never mid-flight.
      expect(
        [
          'BOOKED',
          'BOOKING_READY',
          'WAITING_FOR_REPLY',
          'NEEDS_HUMAN',
          'ESCALATED',
          'CLOSED_BAD_FIT',
          'CLOSED_SPAM',
          'DO_NOT_CONTACT',
          'DUPLICATE',
          'SUPPRESSION_REVIEW',
        ],
        `${s.slug} ended at ${run.finalState.lifecycleState}`,
      ).toContain(run.finalState.lifecycleState);
    }
  });
});
