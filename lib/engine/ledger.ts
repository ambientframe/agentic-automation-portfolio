/**
 * THE IDEMPOTENCY LEDGER.
 *
 * At-least-once delivery is a normal property of webhooks and message queues, not an
 * exceptional one. The same business event will legitimately arrive more than once, and
 * the system's obligation is to produce the intended external action exactly once.
 *
 * This ledger is the mechanism that makes that true. It is deliberately boring: a
 * keyed set with a first-writer-wins rule. Scenario 2 of Lead Rescue does not *depict*
 * duplicate suppression — it genuinely re-enters this ledger and is refused.
 */

import type { SendOutcome } from '@/lib/model/runtime';

export interface LedgerEntry {
  readonly idempotencyKey: string;
  readonly sideEffectId: string;
  readonly eventId: string;
}

export type LedgerAttempt =
  | { readonly outcome: 'FIRST'; readonly key: string }
  | { readonly outcome: 'DUPLICATE'; readonly key: string; readonly original: LedgerEntry };

export class SideEffectLedger {
  private readonly entries = new Map<string, LedgerEntry>();

  /**
   * Claims a key. The first caller wins and may execute; every later caller is told it
   * is a duplicate and must not.
   */
  claim(idempotencyKey: string, sideEffectId: string, eventId: string): LedgerAttempt {
    const existing = this.entries.get(idempotencyKey);
    if (existing !== undefined) {
      return { outcome: 'DUPLICATE', key: idempotencyKey, original: existing };
    }
    const entry: LedgerEntry = { idempotencyKey, sideEffectId, eventId };
    this.entries.set(idempotencyKey, entry);
    return { outcome: 'FIRST', key: idempotencyKey };
  }

  has(idempotencyKey: string): boolean {
    return this.entries.has(idempotencyKey);
  }

  get size(): number {
    return this.entries.size;
  }

  /** Insertion-ordered snapshot. Used by tests and by the reliability view. */
  list(): readonly LedgerEntry[] {
    return [...this.entries.values()];
  }
}

/**
 * Event-level deduplication, distinct from side-effect deduplication.
 *
 * Both are needed: this one recognises that the *event* was seen before (so the
 * timeline can say so honestly), while the side-effect ledger guarantees that even a
 * novel event cannot re-trigger an action that already happened.
 */
export class EventLedger {
  private readonly seen = new Map<string, string>();

  /** Keyed on `source:sourceEventId` — the identity the SOURCE system asserts. */
  static key(source: string, sourceEventId: string): string {
    return `${source}:${sourceEventId}`;
  }

  observe(source: string, sourceEventId: string, eventId: string): 'FIRST' | 'DUPLICATE' {
    const key = EventLedger.key(source, sourceEventId);
    if (this.seen.has(key)) return 'DUPLICATE';
    this.seen.set(key, eventId);
    return 'FIRST';
  }

  firstEventIdFor(source: string, sourceEventId: string): string | undefined {
    return this.seen.get(EventLedger.key(source, sourceEventId));
  }
}

// ---------------------------------------------------------------------------
// Execution ledger — retry safety for uncertain external outcomes
// ---------------------------------------------------------------------------

export interface ExecutionAttemptRecord {
  readonly attempt: number;
  readonly outcome: SendOutcome;
  readonly sideEffectId: string;
  readonly eventId: string;
}

export type ExecutionClaim =
  | { readonly decision: 'ATTEMPT_PERMITTED'; readonly attempt: number }
  /** A prior attempt on this key is already confirmed to have succeeded. Never retry. */
  | { readonly decision: 'ALREADY_SUCCEEDED'; readonly history: readonly ExecutionAttemptRecord[] }
  /**
   * A prior attempt's outcome is unknown, unverified, and the provider does not honour
   * idempotency keys. A second attempt here would risk a duplicate customer-facing effect,
   * so it is refused. This is the state the whole port exists to prevent skipping past.
   */
  | { readonly decision: 'BLOCKED_PENDING_VERIFICATION'; readonly history: readonly ExecutionAttemptRecord[] };

/**
 * THE RETRY-SAFETY LEDGER.
 *
 * Retry safety is not a property of the ATTEMPT — it is a property of what is actually
 * KNOWN about the attempt's outcome. This ledger is the single place that knowledge lives,
 * so the same question — "is it safe to try this key again?" — always gets the same answer
 * regardless of which step or event is asking.
 *
 *   SUCCEEDED                              -> never retry, permanently.
 *   FAILED_BEFORE_EFFECT / RATE_LIMITED    -> retry is safe immediately (nothing happened).
 *   OUTCOME_UNKNOWN, provider honours keys -> retry is safe (the provider itself dedupes).
 *   OUTCOME_UNKNOWN, no such guarantee      -> blocked until an independent check resolves it.
 *
 * `verify` is how that independent check resolves the ambiguity. It never causes a send;
 * it only narrows an unknown outcome toward one of the two definite answers, or leaves it
 * exactly as unresolved as it was. See `VerifyOutcomeSchema` for why that asymmetry matters.
 */
export class ExecutionLedger {
  private readonly history = new Map<string, ExecutionAttemptRecord[]>();
  private readonly verified = new Map<string, 'NOT_EXECUTED' | 'EXECUTED'>();

  evaluate(key: string, honorsIdempotencyKey: boolean): ExecutionClaim {
    const past = this.history.get(key) ?? [];
    const last = past[past.length - 1];

    if (last === undefined) return { decision: 'ATTEMPT_PERMITTED', attempt: 1 };
    if (last.outcome.kind === 'SUCCEEDED') return { decision: 'ALREADY_SUCCEEDED', history: past };
    if (last.outcome.kind === 'FAILED_BEFORE_EFFECT' || last.outcome.kind === 'RATE_LIMITED') {
      return { decision: 'ATTEMPT_PERMITTED', attempt: past.length + 1 };
    }

    // last.outcome.kind === 'OUTCOME_UNKNOWN'
    if (honorsIdempotencyKey) return { decision: 'ATTEMPT_PERMITTED', attempt: past.length + 1 };

    const resolved = this.verified.get(key);
    if (resolved === 'EXECUTED') return { decision: 'ALREADY_SUCCEEDED', history: past };
    if (resolved === 'NOT_EXECUTED') return { decision: 'ATTEMPT_PERMITTED', attempt: past.length + 1 };
    return { decision: 'BLOCKED_PENDING_VERIFICATION', history: past };
  }

  record(key: string, entry: ExecutionAttemptRecord): void {
    this.history.set(key, [...(this.history.get(key) ?? []), entry]);
  }

  /** Called only when an independent check produced a definite answer. `STILL_UNKNOWN` calls this never. */
  verify(key: string, result: 'NOT_EXECUTED' | 'EXECUTED'): void {
    this.verified.set(key, result);
  }

  historyFor(key: string): readonly ExecutionAttemptRecord[] {
    return this.history.get(key) ?? [];
  }

  verificationStatusFor(key: string): 'PENDING' | 'CONFIRMED_NOT_EXECUTED' | 'CONFIRMED_EXECUTED' {
    const resolved = this.verified.get(key);
    if (resolved === 'EXECUTED') return 'CONFIRMED_EXECUTED';
    if (resolved === 'NOT_EXECUTED') return 'CONFIRMED_NOT_EXECUTED';
    return 'PENDING';
  }
}
