import { describe, expect, it } from 'vitest';
import { attachExecutionReceipt, downgradeEffect } from '@/lib/engine/wait-resume';
import type { SideEffect, TimelineEntry } from '@/lib/model/runtime';

/**
 * A RECEIPT YOU OBTAINED AND THREW AWAY IS A RECEIPT YOU DO NOT HAVE.
 *
 * When the remote execution boundary succeeds, the receiver returns its OWN identifier for
 * what it recorded — the single value that lets anyone later point at the counterparty's
 * record and check this delivery against a log this application does not own. Until this
 * function existed, `checkWaitIncident` obtained that identifier and dropped it on the floor:
 * the durable claim was confirmed, the effect was marked EXECUTED, and the only link between
 * our record and theirs was discarded. The first remote capture is what surfaced it —
 * `receiverReportedExecutionId` came back `null` from a send that had genuinely succeeded.
 *
 * WHY IT IS A SEPARATE FUNCTION FROM `downgradeEffect`, AND NOT A FLAG ON IT.
 *
 * `downgradeEffect` carries an explicit, load-bearing invariant: it is "strictly a downgrade
 * path, never an upgrade, so nothing here can make an effect look MORE executed than the pure
 * core actually computed". Attaching provenance is a different operation with a different
 * risk, and folding it into that function would put an upgrade-shaped branch inside the one
 * place documented as unable to contain one. So this attaches provenance and NOTHING else, and
 * the tests below pin that it cannot alter status even when asked to.
 */

function effect(overrides: Partial<SideEffect> = {}): SideEffect {
  return {
    id: 'eff-1',
    eventId: 'evt-1',
    kind: 'NOTIFICATION',
    description: 'Notify the next owner that a case is overdue.',
    target: 'Managing Principal (founder)',
    idempotencyKey: 'notify:lead-1:dispatch-overdue',
    status: 'EXECUTED',
    authority: 3,
    executionMode: 'LIVE',
    ...overrides,
  };
}

const EVENT = {
  eventId: 'evt-1',
  correlationId: 'inc-1',
  entityId: 'lead-1',
  type: 'lead.wait.reevaluated',
  source: 'scheduler',
  sourceEventId: 'check-1',
  occurredAt: '2026-08-27T12:00:00.000Z',
  receivedAt: '2026-08-27T12:00:00.000Z',
  schemaVersion: '2026-08-01',
  actor: 'SYSTEM' as const,
  payload: {},
  executionMode: 'LIVE' as const,
};

function entries(...effects: SideEffect[]): TimelineEntry[] {
  return [
    {
      id: 'entry-1',
      event: EVENT,
      stepLabel: 'Dispatch attention overdue',
      atOffsetSeconds: 0,
      transitions: [],
      decisions: [],
      sideEffects: effects,
      verifications: [],
      stateAfter: 'BOOKING_READY',
      summary: 'Escalated.',
    },
  ];
}

const RECEIPT = {
  provider: 'lead-rescue-remote-webhook-executor',
  attemptedAt: '2026-08-27T12:00:01.000Z',
  externalId: '42',
};

describe('retaining the receiver’s own identifier', () => {
  it('records the external id against the effect that earned it', () => {
    const result = attachExecutionReceipt(entries(effect()), 'notify:lead-1:dispatch-overdue', RECEIPT);
    const [first] = result[0]?.sideEffects ?? [];
    expect(first?.technical?.externalId).toBe('42');
    expect(first?.technical?.provider).toBe(RECEIPT.provider);
    expect(first?.technical?.outcomeKind).toBe('SUCCEEDED');
  });

  it('leaves every other effect untouched', () => {
    const other = effect({ id: 'eff-2', idempotencyKey: 'notify:lead-1:something-else' });
    const result = attachExecutionReceipt(entries(effect(), other), 'notify:lead-1:dispatch-overdue', RECEIPT);
    expect(result[0]?.sideEffects[1]?.technical).toBeUndefined();
  });

  it('records a success with no id as a success with no id, never inventing one', () => {
    const result = attachExecutionReceipt(entries(effect()), 'notify:lead-1:dispatch-overdue', {
      provider: RECEIPT.provider,
      attemptedAt: RECEIPT.attemptedAt,
    });
    const [first] = result[0]?.sideEffects ?? [];
    expect(first?.technical).toBeDefined();
    expect(first?.technical?.externalId).toBeUndefined();
  });

  it('cannot change an effect’s status — provenance is not a promotion', () => {
    for (const status of ['SUPPRESSED_DUPLICATE', 'OUTCOME_UNKNOWN', 'BLOCKED_BY_POLICY', 'FAILED'] as const) {
      const result = attachExecutionReceipt(entries(effect({ status })), 'notify:lead-1:dispatch-overdue', RECEIPT);
      expect(result[0]?.sideEffects[0]?.status, status).toBe(status);
    }
  });

  it('only ever annotates an effect the core actually marked EXECUTED', () => {
    // A receipt against something that did not execute would be evidence of the wrong thing.
    const result = attachExecutionReceipt(
      entries(effect({ status: 'SUPPRESSED_DUPLICATE' })),
      'notify:lead-1:dispatch-overdue',
      RECEIPT,
    );
    expect(result[0]?.sideEffects[0]?.technical).toBeUndefined();
  });

  it('does not disturb the downgrade path it deliberately sits beside', () => {
    const annotated = attachExecutionReceipt(entries(effect()), 'notify:lead-1:dispatch-overdue', RECEIPT);
    const downgraded = downgradeEffect(annotated, 'notify:lead-1:dispatch-overdue', 'OUTCOME_UNKNOWN', 'unconfirmed');
    const [first] = downgraded[0]?.sideEffects ?? [];
    expect(first?.status).toBe('OUTCOME_UNKNOWN');
    // The receipt survives the downgrade: what the receiver said happened is a fact about the
    // attempt, not a claim about the verdict.
    expect(first?.technical?.externalId).toBe('42');
  });
});
