import {
  intentFor,
  type ObservationIntent,
  type ObservationIntentStore,
} from '@/lib/persistence/observation-intent-store';
import type {
  ExecutionJournalReader,
  ExecutionJournalRecorder,
  JournalEvent,
  JournalEventType,
  JournalRecordOutcome,
  ObservableOutcome,
} from '@/lib/persistence/execution-journal-store';

/**
 * OBSERVATION INTEGRITY — whether the instrument itself is trustworthy right now.
 *
 * Every number the aggregate view reports is a count of things the journal RETAINED. Until this
 * module existed, the difference between "nothing happened" and "we failed to write down what
 * happened" was a disclaimer in prose. This turns it into one of three answers an operator can
 * act on differently:
 *
 *   NO_KNOWN_LOSS  every write-ahead marker reconciled. Read the totals as written.
 *   KNOWN_LOSS     n observations are missing, each one named, with why it is missing.
 *   UNAVAILABLE    the question cannot be answered here. NOT the same as "no".
 *
 * THE THIRD ANSWER IS THE POINT. A read model that collapsed an unreadable ledger into the
 * clean answer would report a healthy instrument at exactly the moment the instrument is broken.
 * Both reads that could fail — the marker ledger and the journal it reconciles against — fail
 * into `UNAVAILABLE`, never into `NO_KNOWN_LOSS`.
 *
 * NO DENOMINATOR IS INVENTED. There is no "n% complete" here and there cannot be: the system
 * has no independent count of observations that SHOULD exist, so any rate would be a ratio over
 * a number nobody holds. What it reports instead is an exact count of losses it can name, plus
 * the standing bound that a loss whose marker was itself never written is invisible to it.
 *
 * TWO SEPARATE HALVES, matching the journal's own split:
 *   `withObservationIntegrity` is WRITE side. Engine boundaries receive it; it cannot read.
 *   `deriveObservationIntegrity` is READ side. The operator surface calls it; it cannot write.
 */

export type ObservationLossKind =
  /** The boundary reported a failure and said why. The journal write definitely did not happen. */
  | 'CONFIRMED_DROP'
  /**
   * A write was intended and no outcome was ever reported for it — a process that ended between
   * the marker and the journal write. Strictly less is known here than for a confirmed drop:
   * the write may have been in flight. It is still missing from the journal either way.
   */
  | 'UNRESOLVED_INTENT';

export interface ObservationLoss {
  readonly kind: ObservationLossKind;
  readonly journalEventId: string;
  readonly incidentId: string;
  readonly correlationId: string;
  readonly systemId: string;
  readonly type: JournalEventType;
  readonly outcome: ObservableOutcome;
  readonly intendedAt: string;
  /** Why this observation is missing. The recorder's own words where it managed to give them. */
  readonly reason: string;
}

/** The standing bound, attached to every answer including the clean one. */
const BASIS =
  'Derived by reconciling durable write-ahead observation markers against the journal itself. ' +
  'It cannot see a lost observation whose marker also failed to be written, so a clean answer ' +
  'means no loss is KNOWN, never that none occurred.';

export type ObservationIntegrity =
  | { readonly kind: 'NO_KNOWN_LOSS'; readonly intentsReconciled: number; readonly basis: string }
  | {
      readonly kind: 'KNOWN_LOSS';
      readonly losses: readonly ObservationLoss[];
      readonly intentsReconciled: number;
      readonly basis: string;
    }
  | { readonly kind: 'UNAVAILABLE'; readonly reason: string; readonly basis: string };

const UNREPORTED =
  'The boundary never reported an outcome for this observation, so the process almost certainly ' +
  'ended between the write-ahead marker and the journal write. The record is not in the journal.';

// ---------------------------------------------------------------------------
// WRITE SIDE
// ---------------------------------------------------------------------------

/**
 * Wraps a recorder so that every observation it attempts is accounted for durably.
 *
 * THREE PROPERTIES THIS MUST NEVER BREAK, because business work runs behind it:
 *
 *   1. It returns the delegate's own outcome, verbatim. It has no opinion to add.
 *   2. It never throws. A delegate that throws is converted to `DROPPED` here, exactly as
 *      `recordSafely` already does at the call sites.
 *   3. A broken intent ledger changes nothing about (1) or (2). The accounting failing must not
 *      be able to do what a journal outage is already forbidden from doing.
 *
 * The returned value is an `ExecutionJournalRecorder` and nothing more — no reader method is
 * exposed, so wrapping cannot become a way for decision code to reach history.
 */
export function withObservationIntegrity(
  delegate: ExecutionJournalRecorder,
  intents: ObservationIntentStore,
): ExecutionJournalRecorder {
  return {
    async record(event: JournalEvent): Promise<JournalRecordOutcome> {
      const intent: ObservationIntent = intentFor(event);

      // WRITE-AHEAD. A failure here means this one observation is unmonitored; it is deliberately
      // not counted anywhere, because a process-local tally of "writes I could not monitor" would
      // vanish in the same failure and overstate what is known.
      try {
        await intents.open(intent);
      } catch {
        /* unmonitored — see above */
      }

      let outcome: JournalRecordOutcome;
      try {
        outcome = await delegate.record(event);
      } catch (error) {
        outcome = { kind: 'DROPPED', reason: error instanceof Error ? error.message : String(error) };
      }

      try {
        if (outcome.kind === 'DROPPED') {
          await intents.markDropped(intent, outcome.reason);
        } else {
          await intents.close(event.journalEventId);
        }
      } catch {
        /* The marker stays as it is. Reconciliation still reports it; nothing is lost silently. */
      }

      return outcome;
    },
  };
}

// ---------------------------------------------------------------------------
// READ SIDE
// ---------------------------------------------------------------------------

function lossFrom(intent: ObservationIntent): ObservationLoss {
  return {
    kind: intent.dropReason === undefined ? 'UNRESOLVED_INTENT' : 'CONFIRMED_DROP',
    journalEventId: intent.journalEventId,
    incidentId: intent.incidentId,
    correlationId: intent.correlationId,
    systemId: intent.systemId,
    type: intent.type,
    outcome: intent.outcome,
    intendedAt: intent.intendedAt,
    reason: intent.dropReason ?? UNREPORTED,
  };
}

/**
 * Reconciles outstanding markers against the journal. Total: every failure mode of either read
 * resolves to `UNAVAILABLE` rather than to a cleaner-looking answer.
 *
 * With no outstanding markers there is nothing to reconcile, so the journal is not read at all —
 * its readability is genuinely irrelevant to the loss question in that case, and reading it
 * anyway would make an unrelated corrupt record look like an integrity problem.
 */
export async function deriveObservationIntegrity(
  intents: ObservationIntentStore,
  journal: ExecutionJournalReader,
): Promise<ObservationIntegrity> {
  let outstanding: readonly ObservationIntent[];
  try {
    outstanding = await intents.list();
  } catch (error) {
    return {
      kind: 'UNAVAILABLE',
      reason: `The observation marker ledger could not be read: ${error instanceof Error ? error.message : String(error)}`,
      basis: BASIS,
    };
  }

  if (outstanding.length === 0) {
    return { kind: 'NO_KNOWN_LOSS', intentsReconciled: 0, basis: BASIS };
  }

  let recorded: ReadonlySet<string>;
  try {
    recorded = new Set((await journal.readAll()).map((event) => event.journalEventId));
  } catch (error) {
    return {
      kind: 'UNAVAILABLE',
      reason: `Markers are outstanding but the journal could not be read to reconcile them: ${
        error instanceof Error ? error.message : String(error)
      }`,
      basis: BASIS,
    };
  }

  // A marker whose record IS in the journal is a crash in the cleanup window, not data loss.
  const losses = outstanding.filter((intent) => !recorded.has(intent.journalEventId)).map(lossFrom);
  const intentsReconciled = outstanding.length - losses.length;

  if (losses.length === 0) {
    return { kind: 'NO_KNOWN_LOSS', intentsReconciled, basis: BASIS };
  }
  return { kind: 'KNOWN_LOSS', losses, intentsReconciled, basis: BASIS };
}
