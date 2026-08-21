import { describe, expect, it } from 'vitest';
import { ALL_SYSTEMS, LEAD_RESCUE } from '@/data/systems';
import { KESTREL } from '@/data/profiles/kestrel/profile';
import { LEAD_RESCUE_HANDLERS } from '@/lib/engine/handlers/lead-rescue';
import { EventLedger, SideEffectLedger } from '@/lib/engine/ledger';
import { applyEvent, authorityOutcome } from '@/lib/engine/reducer';
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
  internals: { effects: SideEffectLedger; events: EventLedger };
} {
  return {
    handlers: {
      systemId: 'lead-rescue',
      initialState: 'NEW',
      handlers: { 'test.event': () => outcome },
    },
    internals: { effects: new SideEffectLedger(), events: new EventLedger() },
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

  describe('unmodelled input', () => {
    it('records an unhandled event type instead of silently dropping it', () => {
      const result = applyEvent(initialState('NEW'), event({ type: 'nothing.handles.this' }), {
        system: LEAD_RESCUE,
        profile: KESTREL,
        handlers: LEAD_RESCUE_HANDLERS,
        judgments: new Map(),
        internals: { effects: new SideEffectLedger(), events: new EventLedger() },
      });

      expect(result.entries).toHaveLength(1);
      expect(result.entries[0]?.stepLabel).toBe('Unhandled event');
      expect(result.entries[0]?.decisions[0]?.escalationReason).toContain('No operating logic');
      expect(result.state.lifecycleState).toBe('NEW');
    });
  });
});
