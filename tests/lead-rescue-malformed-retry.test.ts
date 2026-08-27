import { describe, expect, it } from 'vitest';
import { LEAD_RESCUE } from '@/data/systems';
import { KESTREL } from '@/data/profiles/kestrel/profile';
import { LEAD_RESCUE_HANDLERS } from '@/lib/engine/handlers/lead-rescue';
import { runScenario } from '@/lib/engine/run';
import { FixtureDecisionProvider } from '@/lib/ports/decision-provider';
import { FixtureSideEffectExecutor } from '@/lib/ports/side-effect-executor';
import { numberParam } from '@/lib/model/profile';
import type { CanonicalEvent, Scenario } from '@/lib/model/runtime';

/**
 * FALSIFYING TESTS for `lr-fm-malformed` — the last `Pending` standard on Lead Rescue that was
 * genuinely buildable rather than blocked by a canon defect.
 *
 * The entry into `FAILED_RECOVERABLE` has existed since the system was written: a payload that
 * fails schema validation is retained rather than dropped. What never existed is everything
 * AFTER that. `lr-t30` (back to `NORMALIZED` on a corrected redelivery), `lr-t32` (to
 * `NEEDS_HUMAN` on exhaustion) and `lr-t31` (to `FAILED_TERMINAL`) were declared in canon with
 * no code, no event, and no test — so "retained and retried" was half a sentence: the system
 * retained, and nothing ever retried.
 *
 * That is a worse failure than it sounds. A case parked in `FAILED_RECOVERABLE` with no exit is
 * indistinguishable, from the outside, from a case being patiently retried. It reads as
 * handling.
 *
 * THE BUDGET IS THE POINT. An unbounded retry against a payload that will never validate is not
 * resilience, it is a loop; and a system that gives up without telling anyone has dropped the
 * lead it promised never to drop. So the budget is a configured policy
 * (`malformedRetryBudget`), compared in the engine, and exhausting it reaches a PERSON rather
 * than a terminal failure the system chose on its own.
 */

const BUDGET = numberParam(KESTREL, 'malformedRetryBudget');

const VALID_PAYLOAD = {
  contactName: 'Dara Whelan',
  contactEmail: 'dara.whelan@example-invalid.test',
  company: 'Whelan Compliance Partners',
  message: 'We need help preparing for an ISO 27001 surveillance audit in the autumn.',
  channel: 'website-form',
  consentState: 'PERMITTED',
  requiredFields: [],
} as const;

/** Missing every required field. Retried verbatim, this can never become valid. */
const MALFORMED_PAYLOAD = { note: 'sent by a misconfigured integration' } as const;

function enquiry(n: number, payload: Record<string, unknown>, offsetSeconds: number): CanonicalEvent {
  return {
    eventId: `malformed-retry-e${n}`,
    correlationId: 'malformed-retry',
    entityId: 'lead-malformed-retry',
    type: 'inbound.enquiry.received',
    source: 'website-form',
    sourceEventId: `malformed-retry-src-${n}`,
    occurredAt: new Date(Date.UTC(2026, 7, 27, 9, 0, offsetSeconds)).toISOString(),
    receivedAt: new Date(Date.UTC(2026, 7, 27, 9, 0, offsetSeconds)).toISOString(),
    schemaVersion: '1.0.0',
    actor: 'SYSTEM',
    payload,
    executionMode: 'SIMULATED',
  };
}

function scenarioOf(events: readonly CanonicalEvent[], expectedFinalState: string): Scenario {
  return {
    id: 'malformed-retry-probe',
    slug: 'malformed-retry-probe',
    systemId: 'lead-rescue',
    title: 'Malformed payload retry probe',
    summary: 'Drives the FAILED_RECOVERABLE retry budget directly.',
    demonstrates: ['A malformed payload is retained and retried within a configured budget.'],
    events: [...events],
    judgments: {},
    expectedFinalState,
  };
}

async function run(events: readonly CanonicalEvent[], expectedFinalState: string) {
  return runScenario(scenarioOf(events, expectedFinalState), {
    system: LEAD_RESCUE,
    profile: KESTREL,
    handlers: LEAD_RESCUE_HANDLERS,
    provider: new FixtureDecisionProvider({}),
    executor: new FixtureSideEffectExecutor({}, {}),
  });
}

describe('a malformed payload is retained and retried, never dropped', () => {
  it('declares the retry budget as a policy-linked operating parameter, not a number in a handler', () => {
    const parameter = KESTREL.operatingParameters.find((p) => p.key === 'malformedRetryBudget');
    expect(parameter, 'malformedRetryBudget is not declared in the profile').toBeDefined();
    expect(BUDGET).toBeGreaterThan(0);

    // Not merely "links to a policy that exists" — that passes when the budget is relinked to
    // an unrelated cadence policy, which a mutation proved. It must link to the policy that
    // actually states this rule, and that policy must still say what the rule is.
    expect(parameter?.policyId).toBe('kestrel-malformed-intake');
    const policy = KESTREL.policies.find((p) => p.id === parameter?.policyId);
    expect(policy, 'the linked policy does not exist').toBeDefined();
    expect(policy?.statement).toContain('retained and retried a bounded number of times');
    expect(policy?.statement).toContain('never retried indefinitely');
  });

  it('enters FAILED_RECOVERABLE on the first malformed payload and executes nothing', async () => {
    const result = await run([enquiry(1, MALFORMED_PAYLOAD, 0)], 'FAILED_RECOVERABLE');
    expect(result.finalState.lifecycleState).toBe('FAILED_RECOVERABLE');
    expect(result.sideEffects.filter((e) => e.status === 'EXECUTED')).toHaveLength(0);
  });

  it('records the attempt count as a fact rather than inferring it from history', async () => {
    const result = await run([enquiry(1, MALFORMED_PAYLOAD, 0)], 'FAILED_RECOVERABLE');
    expect(result.finalState.facts.malformedAttempts).toBe('1');
  });

  it('returns to NORMALIZED when a corrected payload is redelivered (lr-t30)', async () => {
    const result = await run(
      [enquiry(1, MALFORMED_PAYLOAD, 0), enquiry(2, VALID_PAYLOAD, 30)],
      'NEEDS_HUMAN',
    );
    const states = result.timeline.map((entry) => entry.stateAfter);
    expect(states).toContain('FAILED_RECOVERABLE');
    expect(states).toContain('NORMALIZED');
    expect(result.finalState.lifecycleState).not.toBe('FAILED_RECOVERABLE');
  });

  it('stays in FAILED_RECOVERABLE while the budget still permits another attempt', async () => {
    const events = [enquiry(1, MALFORMED_PAYLOAD, 0)];
    for (let n = 2; n <= BUDGET; n += 1) events.push(enquiry(n, MALFORMED_PAYLOAD, n * 30));
    const result = await run(events, 'FAILED_RECOVERABLE');
    expect(result.finalState.lifecycleState).toBe('FAILED_RECOVERABLE');
    expect(result.finalState.facts.malformedAttempts).toBe(String(BUDGET));
  });

  it('reaches a person when the budget is exhausted, never a terminal state of its own choosing (lr-t32)', async () => {
    const events = [];
    for (let n = 1; n <= BUDGET + 1; n += 1) events.push(enquiry(n, MALFORMED_PAYLOAD, n * 30));
    const result = await run(events, 'NEEDS_HUMAN');
    expect(result.finalState.lifecycleState).toBe('NEEDS_HUMAN');
    expect(result.finalState.awaitingHuman).toBeTruthy();
  });

  it('hands the person the validation errors and the attempt count, not just a failure', async () => {
    const events = [];
    for (let n = 1; n <= BUDGET + 1; n += 1) events.push(enquiry(n, MALFORMED_PAYLOAD, n * 30));
    const result = await run(events, 'NEEDS_HUMAN');
    const decisions = result.timeline.flatMap((entry) => entry.decisions);
    const escalation = decisions.find((d) => d.selectedAction === 'route_to_human_after_retry_budget');
    expect(escalation, 'no decision records the budget being exhausted').toBeDefined();
    // Assert on the ERRORS FIELD specifically, not on the serialised record. A mutation that
    // redacted the errors survived the loose version, because the same field names also appear
    // in `missingInformation` — so the record looked informative while the diagnosis was gone.
    const errorsFact = escalation?.deterministicFacts.find((f) => f.label === 'Validation errors');
    expect(errorsFact, 'the escalation carries no validation errors').toBeDefined();
    expect(errorsFact?.value).toContain('consentState');
    expect(errorsFact?.value).toContain('message');
    expect(errorsFact?.value.length, 'the errors are present but say nothing').toBeGreaterThan(30);

    const attemptFact = escalation?.deterministicFacts.find((f) => f.label === 'Attempt');
    expect(attemptFact?.value).toContain(String(BUDGET));
    expect(escalation?.forbiddenActions).toContain('infer_missing_fields');
  });

  it('executes nothing customer-facing across the entire exhausted run', async () => {
    const events = [];
    for (let n = 1; n <= BUDGET + 1; n += 1) events.push(enquiry(n, MALFORMED_PAYLOAD, n * 30));
    const result = await run(events, 'NEEDS_HUMAN');
    expect(result.sideEffects.filter((e) => e.status === 'EXECUTED')).toHaveLength(0);
  });

  /**
   * The budget must be READ, not remembered. If the handler hard-codes the number, raising the
   * configured budget changes nothing and this test still sees an escalation at the old count.
   */
  it('escalates on the configured budget rather than on a number compiled into the handler', async () => {
    const raised = {
      ...KESTREL,
      operatingParameters: KESTREL.operatingParameters.map((p) =>
        p.key === 'malformedRetryBudget' ? { ...p, value: BUDGET + 2 } : p,
      ),
    };
    const events = [];
    for (let n = 1; n <= BUDGET + 1; n += 1) events.push(enquiry(n, MALFORMED_PAYLOAD, n * 30));
    const result = await runScenario(scenarioOf(events, 'FAILED_RECOVERABLE'), {
      system: LEAD_RESCUE,
      profile: raised,
      handlers: LEAD_RESCUE_HANDLERS,
      provider: new FixtureDecisionProvider({}),
      executor: new FixtureSideEffectExecutor({}, {}),
    });
    expect(
      result.finalState.lifecycleState,
      'raising the configured budget did not delay the escalation, so the number is hard-coded',
    ).toBe('FAILED_RECOVERABLE');
  });

  it('closes the canon standard rather than leaving it Pending', () => {
    const mode = LEAD_RESCUE.failureModes.find((m) => m.id === 'lr-fm-malformed');
    expect(mode).toBeDefined();
    expect(mode?.verificationTest.startsWith('Pending')).toBe(false);
    expect(mode?.verificationTest).toContain('lead-rescue-malformed-retry');
  });
});
