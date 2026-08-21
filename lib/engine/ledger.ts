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
