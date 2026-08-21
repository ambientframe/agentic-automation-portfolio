import { describe, expect, it } from 'vitest';
import { ALL_SYSTEMS, LEAD_RESCUE } from '@/data/systems';
import { KESTREL } from '@/data/profiles/kestrel/profile';
import { LEAD_RESCUE_HANDLERS } from '@/lib/engine/handlers/lead-rescue';
import { EventLedger, ExecutionLedger, SideEffectLedger } from '@/lib/engine/ledger';
import { applyEvent, authorityOutcome, type ExecutionOutcomes } from '@/lib/engine/reducer';
import { initialState, type HandlerOutcome, type SystemHandlers } from '@/lib/engine/types';
import { isTerminal } from '@/lib/model/system';
import type { CanonicalEvent } from '@/lib/model/runtime';

function event(overrides: Partial<CanonicalEvent> = {}): CanonicalEvent {
  return {
    eventId: 'evt-test-1',
    correlationId: 'corr-1',
    entityId: 'entity-1',
    type: 'test.event',
    source: 'test-source',
    sourceEventId: 'src-1',
    occurredAt: '2026-08-01T10:00:00Z',
    receivedAt: '2026-08-01T10:00:00Z',
    schemaVersion: '2026-08-01',
    actor: 'SYSTEM',
    payload: {},
    executionMode: 'SIMULATED',
    ...overrides,
  };
}

function harness(outcome: HandlerOutcome): {
  handlers: SystemHandlers;
  internals: { effects: SideEffectLedger; events: EventLedger; executions: ExecutionLedger };
} {
  return {
    handlers: {
      systemId: 'lead-rescue',
      initialState: 'NEW',
      handlers: { 'test.event': () => outcome },
    },
    internals: { effects: new SideEffectLedger(), events: new EventLedger(), executions: new ExecutionLedger() },
  };
}

const baseStep = {
  id: 'step-1',
  label: 'Test step',
  atOffsetSeconds: 0,
  decisions: [],
  effects: [],
  verifications: [],
  summary: 'test',
};

describe('engine core guarantees', () => {
  describe('transition legality', () => {
    it('rejects an undeclared transition and does not move the state', () => {
      const { handlers, internals } = harness({
        steps: [{ ...baseStep, transitionTo: 'BOOKED' }],
      });

      const result = applyEvent(initialState('NEW'), event(), {
        system: LEAD_RESCUE,
        profile: KESTREL,
        handlers,
        judgments: new Map(),
        internals,
      });

      expect(result.state.lifecycleState).toBe('NEW');
      const transition = result.entries[0]?.transitions[0];
      expect(transition?.accepted).toBe(false);
      expect(transition?.rejectionReason).toContain('No declared transition permits NEW -> BOOKED');
    });

    it('accepts a declared transition and records the rule that authorised it', () => {
      const { handlers, internals } = harness({
        steps: [{ ...baseStep, transitionTo: 'NORMALIZED' }],
      });

      const result = applyEvent(initialState('NEW'), event(), {
        system: LEAD_RESCUE,
        profile: KESTREL,
        handlers,
        judgments: new Map(),
        internals,
      });

      expect(result.state.lifecycleState).toBe('NORMALIZED');
      const transition = result.entries[0]?.transitions[0];
      expect(transition?.accepted).toBe(true);
      expect(transition?.ruleId).toBe('lr-t01');
    });

    it('cannot leave a terminal state in any system, so a post-completion replay is inert', () => {
      for (const system of ALL_SYSTEMS) {
        const terminalIds = system.lifecycle.states
          .filter((s) => isTerminal(s.kind))
          .map((s) => s.id);

        for (const id of terminalIds) {
          const outgoing = system.lifecycle.transitions.filter((t) => t.from === id);
          expect(outgoing, `${system.slug}: terminal state ${id} has an exit`).toEqual([]);
        }
      }
    });
  });

  describe('authority gate', () => {
    it('maps the ladder to execution rights uniformly', () => {
      expect(authorityOutcome(0)).toBe('NO_EXTERNAL_ACTION');
      expect(authorityOutcome(1)).toBe('NO_EXTERNAL_ACTION');
      expect(authorityOutcome(2)).toBe('AWAITING_APPROVAL');
      expect(authorityOutcome(3)).toBe('MAY_EXECUTE');
      expect(authorityOutcome(4)).toBe('MAY_EXECUTE');
    });

    it('holds a level-2 action for approval instead of executing it', () => {
      const { handlers, internals } = harness({
        steps: [
          {
            ...baseStep,
            effects: [
              {
                id: 'eff-1',
                kind: 'MESSAGE_SEND',
                description: 'A message requiring approval',
                target: 'prospect',
                idempotencyKey: 'k-1',
                authority: 2,
                policyPermits: true,
              },
            ],
          },
        ],
      });

      const result = applyEvent(initialState('NEW'), event(), {
        system: LEAD_RESCUE,
        profile: KESTREL,
        handlers,
        judgments: new Map(),
        internals,
      });

      expect(result.entries[0]?.sideEffects[0]?.status).toBe('AWAITING_APPROVAL');
      // Critically, it must not have claimed the key — an unapproved action is not done.
      expect(internals.effects.has('k-1')).toBe(false);
    });

    it('refuses to act at level 1 no matter what the handler wants', () => {
      const { handlers, internals } = harness({
        steps: [
          {
            ...baseStep,
            effects: [
              {
                id: 'eff-1',
                kind: 'MESSAGE_SEND',
                description: 'A recommendation trying to act',
                target: 'prospect',
                idempotencyKey: 'k-1',
                authority: 1,
                policyPermits: true,
              },
            ],
          },
        ],
      });

      const result = applyEvent(initialState('NEW'), event(), {
        system: LEAD_RESCUE,
        profile: KESTREL,
        handlers,
        judgments: new Map(),
        internals,
      });

      expect(result.entries[0]?.sideEffects[0]?.status).toBe('BLOCKED_BY_POLICY');
    });

    it('blocks an effect whose policy gate is closed, before authority is considered', () => {
      const { handlers, internals } = harness({
        steps: [
          {
            ...baseStep,
            effects: [
              {
                id: 'eff-1',
                kind: 'MESSAGE_SEND',
                description: 'A message to a suppressed contact',
                target: 'prospect',
                idempotencyKey: 'k-1',
                authority: 4,
                policyPermits: false,
                policyReason: 'Contact is suppressed.',
              },
            ],
          },
        ],
      });

      const result = applyEvent(initialState('NEW'), event(), {
        system: LEAD_RESCUE,
        profile: KESTREL,
        handlers,
        judgments: new Map(),
        internals,
      });

      const effect = result.entries[0]?.sideEffects[0];
      expect(effect?.status).toBe('BLOCKED_BY_POLICY');
      expect(effect?.detail).toBe('Contact is suppressed.');
      expect(internals.effects.has('k-1')).toBe(false);
    });
  });

  describe('idempotency ledger', () => {
    it('grants the first claim and refuses every later one', () => {
      const ledger = new SideEffectLedger();
      expect(ledger.claim('k', 'eff-1', 'evt-1').outcome).toBe('FIRST');

      const second = ledger.claim('k', 'eff-2', 'evt-2');
      expect(second.outcome).toBe('DUPLICATE');
      if (second.outcome === 'DUPLICATE') {
        expect(second.original.sideEffectId).toBe('eff-1');
        expect(second.original.eventId).toBe('evt-1');
      }
      expect(ledger.size).toBe(1);
    });

    it('distinguishes a repeated delivery from a novel event', () => {
      const ledger = new EventLedger();
      expect(ledger.observe('web', 'src-1', 'evt-1')).toBe('FIRST');
      expect(ledger.observe('web', 'src-1', 'evt-2')).toBe('DUPLICATE');
      expect(ledger.observe('web', 'src-2', 'evt-3')).toBe('FIRST');
      // Same id on a different source is a different business event.
      expect(ledger.observe('inbox', 'src-1', 'evt-4')).toBe('FIRST');
    });
  });

  describe('execution ledger — retry safety', () => {
    it('permits the first attempt on a fresh key', () => {
      const ledger = new ExecutionLedger();
      const claim = ledger.evaluate('k', false);
      expect(claim.decision).toBe('ATTEMPT_PERMITTED');
      if (claim.decision === 'ATTEMPT_PERMITTED') expect(claim.attempt).toBe(1);
    });

    it('never permits a retry once a key is confirmed succeeded', () => {
      const ledger = new ExecutionLedger();
      ledger.record('k', { attempt: 1, outcome: { kind: 'SUCCEEDED' }, sideEffectId: 'eff-1', eventId: 'evt-1' });

      const claim = ledger.evaluate('k', false);
      expect(claim.decision).toBe('ALREADY_SUCCEEDED');
    });

    it('permits an immediate retry after a definite pre-effect failure — nothing happened, so nothing to duplicate', () => {
      const ledger = new ExecutionLedger();
      ledger.record('k', {
        attempt: 1,
        outcome: { kind: 'FAILED_BEFORE_EFFECT', reason: 'invalid recipient' },
        sideEffectId: 'eff-1',
        eventId: 'evt-1',
      });

      const claim = ledger.evaluate('k', false);
      expect(claim.decision).toBe('ATTEMPT_PERMITTED');
      if (claim.decision === 'ATTEMPT_PERMITTED') expect(claim.attempt).toBe(2);
    });

    it('permits an immediate retry after rate limiting, for the same reason', () => {
      const ledger = new ExecutionLedger();
      ledger.record('k', {
        attempt: 1,
        outcome: { kind: 'RATE_LIMITED', reason: 'throttled', retryAfterSeconds: 30 },
        sideEffectId: 'eff-1',
        eventId: 'evt-1',
      });

      expect(ledger.evaluate('k', false).decision).toBe('ATTEMPT_PERMITTED');
    });

    it('refuses a naive retry after an unknown outcome — does not blindly risk a duplicate send', () => {
      const ledger = new ExecutionLedger();
      ledger.record('k', {
        attempt: 1,
        outcome: { kind: 'OUTCOME_UNKNOWN', reason: 'no confirmation received' },
        sideEffectId: 'eff-1',
        eventId: 'evt-1',
      });

      const claim = ledger.evaluate('k', false);
      expect(claim.decision).toBe('BLOCKED_PENDING_VERIFICATION');
    });

    it('permits an unknown-outcome retry immediately when the provider itself honours the idempotency key', () => {
      const ledger = new ExecutionLedger();
      ledger.record('k', {
        attempt: 1,
        outcome: { kind: 'OUTCOME_UNKNOWN', reason: 'no confirmation received' },
        sideEffectId: 'eff-1',
        eventId: 'evt-1',
      });

      // Same unresolved history, but this provider is known to dedupe by key — no
      // independent verification is required. Tested separately from the non-idempotent
      // case above precisely because the two must not share a code path by accident.
      const claim = ledger.evaluate('k', true);
      expect(claim.decision).toBe('ATTEMPT_PERMITTED');
    });

    it('unblocks a retry once independent verification confirms non-execution', () => {
      const ledger = new ExecutionLedger();
      ledger.record('k', {
        attempt: 1,
        outcome: { kind: 'OUTCOME_UNKNOWN', reason: 'no confirmation received' },
        sideEffectId: 'eff-1',
        eventId: 'evt-1',
      });
      expect(ledger.evaluate('k', false).decision).toBe('BLOCKED_PENDING_VERIFICATION');

      ledger.verify('k', 'NOT_EXECUTED');

      const claim = ledger.evaluate('k', false);
      expect(claim.decision).toBe('ATTEMPT_PERMITTED');
      expect(ledger.verificationStatusFor('k')).toBe('CONFIRMED_NOT_EXECUTED');
    });

    it('treats a verified-executed unknown outcome as already succeeded, not as permitting a retry', () => {
      const ledger = new ExecutionLedger();
      ledger.record('k', {
        attempt: 1,
        outcome: { kind: 'OUTCOME_UNKNOWN', reason: 'no confirmation received' },
        sideEffectId: 'eff-1',
        eventId: 'evt-1',
      });
      ledger.verify('k', 'EXECUTED');

      expect(ledger.evaluate('k', false).decision).toBe('ALREADY_SUCCEEDED');
      expect(ledger.verificationStatusFor('k')).toBe('CONFIRMED_EXECUTED');
    });

    it('leaves an unknown outcome exactly as unresolved when a check learns nothing new', () => {
      const ledger = new ExecutionLedger();
      ledger.record('k', {
        attempt: 1,
        outcome: { kind: 'OUTCOME_UNKNOWN', reason: 'no confirmation received' },
        sideEffectId: 'eff-1',
        eventId: 'evt-1',
      });
      // A STILL_UNKNOWN check result never calls verify() — simulated directly here by
      // simply not calling it, matching what resolveVerifyEffect does for that outcome.
      expect(ledger.verificationStatusFor('k')).toBe('PENDING');
      expect(ledger.evaluate('k', false).decision).toBe('BLOCKED_PENDING_VERIFICATION');
    });
  });

  describe('execution outcomes — reducer integration', () => {
    function sendHarness(outcome: HandlerOutcome, executionOutcomes: ExecutionOutcomes) {
      return {
        handlers: {
          systemId: 'lead-rescue',
          initialState: 'NEW',
          handlers: { 'test.event': () => outcome },
        } satisfies SystemHandlers,
        internals: {
          effects: new SideEffectLedger(),
          events: new EventLedger(),
          executions: new ExecutionLedger(),
        },
        executionOutcomes,
      };
    }

    it('never touches the execution ledger when the policy gate is already closed', () => {
      const { handlers, internals, executionOutcomes } = sendHarness(
        {
          steps: [
            {
              ...baseStep,
              effects: [
                {
                  id: 'eff-1',
                  kind: 'MESSAGE_SEND',
                  description: 'A send blocked before it ever reaches the provider',
                  target: 'prospect',
                  idempotencyKey: 'k-1',
                  authority: 3,
                  policyPermits: false,
                  policyReason: 'blocked upstream',
                  execution: { kind: 'SEND', attemptId: 'send-1', honorsIdempotencyKey: false },
                },
              ],
            },
          ],
        },
        { send: new Map(), verify: new Map() },
      );

      const result = applyEvent(initialState('NEW'), event(), {
        system: LEAD_RESCUE,
        profile: KESTREL,
        handlers,
        judgments: new Map(),
        internals,
        executionOutcomes,
      });

      expect(result.entries[0]?.sideEffects[0]?.status).toBe('BLOCKED_BY_POLICY');
      expect(internals.executions.historyFor('k-1')).toEqual([]);
    });

    it('records an uncertain send outcome as OUTCOME_UNKNOWN and blocks a naive retry', () => {
      const step = (attemptId: string) => ({
        ...baseStep,
        effects: [
          {
            id: `eff-${attemptId}`,
            kind: 'MESSAGE_SEND' as const,
            description: 'Acknowledgement send',
            target: 'prospect',
            idempotencyKey: 'ack-1',
            authority: 3 as const,
            policyPermits: true,
            execution: { kind: 'SEND' as const, attemptId, honorsIdempotencyKey: false },
          },
        ],
      });

      const { handlers, internals, executionOutcomes } = sendHarness(
        { steps: [step('send-1')] },
        {
          send: new Map([
            ['send-1', { status: 'OK', result: { kind: 'OUTCOME_UNKNOWN', reason: 'no confirmation received' } }],
          ]),
          verify: new Map(),
        },
      );

      const first = applyEvent(initialState('NEW'), event(), {
        system: LEAD_RESCUE,
        profile: KESTREL,
        handlers,
        judgments: new Map(),
        internals,
        executionOutcomes,
      });

      expect(first.entries[0]?.sideEffects[0]?.status).toBe('OUTCOME_UNKNOWN');
      expect(first.entries[0]?.sideEffects[0]?.technical?.retrySafety).toBe('UNSAFE');

      // A second, naive attempt on the SAME key — no verification happened in between.
      const second = applyEvent(first.state, event({ eventId: 'evt-test-2' }), {
        system: LEAD_RESCUE,
        profile: KESTREL,
        handlers: {
          systemId: 'lead-rescue',
          initialState: 'NEW',
          handlers: { 'test.event': () => ({ steps: [step('send-2')] }) },
        },
        judgments: new Map(),
        internals,
        executionOutcomes: {
          send: new Map([
            ['send-2', { status: 'OK', result: { kind: 'SUCCEEDED', externalId: 'msg_would_dupe' } }],
          ]),
          verify: new Map(),
        },
      });

      // Even though send-2's own fixture says SUCCEEDED, the ledger must never let it run,
      // because nothing yet proved the first attempt did not already reach the customer.
      expect(second.entries[0]?.sideEffects[0]?.status).toBe('OUTCOME_UNKNOWN');
      const executed = [...first.entries, ...second.entries]
        .flatMap((e) => e.sideEffects)
        .filter((s) => s.status === 'EXECUTED');
      expect(executed).toHaveLength(0);
    });

    it('permits exactly one send after independent verification confirms non-execution, never two', () => {
      const attemptStep = {
        ...baseStep,
        id: 'attempt',
        effects: [
          {
            id: 'eff-attempt',
            kind: 'MESSAGE_SEND' as const,
            description: 'Acknowledgement send',
            target: 'prospect',
            idempotencyKey: 'ack-1',
            authority: 3 as const,
            policyPermits: true,
            execution: { kind: 'SEND' as const, attemptId: 'send-1', honorsIdempotencyKey: false },
          },
        ],
      };
      const reconcileSteps = [
        {
          ...baseStep,
          id: 'verify',
          effects: [
            {
              id: 'eff-verify',
              kind: 'VERIFICATION_CHECK' as const,
              description: 'Query provider delivery status',
              target: 'prospect',
              idempotencyKey: 'verify:ack-1',
              authority: 3 as const,
              policyPermits: true,
              execution: { kind: 'VERIFY' as const, attemptId: 'verify-1', targetIdempotencyKey: 'ack-1' },
            },
          ],
        },
        {
          ...baseStep,
          id: 'retry',
          effects: [
            {
              id: 'eff-retry',
              kind: 'MESSAGE_SEND' as const,
              description: 'Retry acknowledgement send',
              target: 'prospect',
              idempotencyKey: 'ack-1',
              authority: 3 as const,
              policyPermits: true,
              execution: { kind: 'SEND' as const, attemptId: 'send-2', honorsIdempotencyKey: false },
            },
          ],
        },
      ];

      const internals = {
        effects: new SideEffectLedger(),
        events: new EventLedger(),
        executions: new ExecutionLedger(),
      };

      const first = applyEvent(
        initialState('NEW'),
        event(),
        {
          system: LEAD_RESCUE,
          profile: KESTREL,
          handlers: {
            systemId: 'lead-rescue',
            initialState: 'NEW',
            handlers: { 'test.event': () => ({ steps: [attemptStep] }) },
          },
          judgments: new Map(),
          internals,
          executionOutcomes: {
            send: new Map([
              ['send-1', { status: 'OK', result: { kind: 'OUTCOME_UNKNOWN', reason: 'connection reset' } }],
            ]),
            verify: new Map(),
          },
        },
      );
      expect(first.entries[0]?.sideEffects[0]?.status).toBe('OUTCOME_UNKNOWN');

      const second = applyEvent(
        first.state,
        event({ eventId: 'evt-test-2', type: 'reconcile.event' }),
        {
          system: LEAD_RESCUE,
          profile: KESTREL,
          handlers: {
            systemId: 'lead-rescue',
            initialState: 'NEW',
            handlers: { 'reconcile.event': () => ({ steps: reconcileSteps }) },
          },
          judgments: new Map(),
          internals,
          executionOutcomes: {
            send: new Map([
              ['send-2', { status: 'OK', result: { kind: 'SUCCEEDED', externalId: 'msg_final' } }],
            ]),
            verify: new Map([
              ['verify-1', { status: 'OK', result: { kind: 'CONFIRMED_NOT_EXECUTED', reason: 'provider log: not sent' } }],
            ]),
          },
        },
      );

      const allEffects = [...first.entries, ...second.entries].flatMap((e) => e.sideEffects);
      const executed = allEffects.filter((s) => s.status === 'EXECUTED' && s.kind === 'MESSAGE_SEND');
      // Exactly one customer-facing send ever succeeded across the whole run.
      expect(executed).toHaveLength(1);
      expect(executed[0]?.technical?.externalId).toBe('msg_final');

      const verifyEffect = second.entries.flatMap((e) => e.sideEffects).find((s) => s.kind === 'VERIFICATION_CHECK');
      expect(verifyEffect?.technical?.verificationStatus).toBe('CONFIRMED_NOT_EXECUTED');
    });
  });

  describe('unmodelled input', () => {
    it('records an unhandled event type instead of silently dropping it', () => {
      const result = applyEvent(initialState('NEW'), event({ type: 'nothing.handles.this' }), {
        system: LEAD_RESCUE,
        profile: KESTREL,
        handlers: LEAD_RESCUE_HANDLERS,
        judgments: new Map(),
        internals: { effects: new SideEffectLedger(), events: new EventLedger(), executions: new ExecutionLedger() },
      });

      expect(result.entries).toHaveLength(1);
      expect(result.entries[0]?.stepLabel).toBe('Unhandled event');
      expect(result.entries[0]?.decisions[0]?.escalationReason).toContain('No operating logic');
      expect(result.state.lifecycleState).toBe('NEW');
    });
  });
});
