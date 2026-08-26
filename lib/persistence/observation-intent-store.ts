import { z } from 'zod';
import {
  JournalEventTypeSchema,
  ObservableOutcomeSchema,
  recordFileNameFor,
  type JournalEvent,
} from './execution-journal-store';

/**
 * THE OBSERVATION-INTENT LEDGER — the smallest durable thing that can tell an operator whether
 * the journal lost anything.
 *
 * THE PROBLEM IT EXISTS FOR. `ExecutionJournalRecorder.record()` is deliberately lossy: it
 * reports `DROPPED` and never blocks business work, because an observability outage must not be
 * able to stop real work. That trade is correct and stays. What was NOT acceptable is its
 * consequence — every total derived from the journal was bounded by a sentence ("this describes
 * what was observed") instead of by a measurement, so nobody could tell a quiet system from a
 * broken recorder.
 *
 * WHY A WRITE-AHEAD MARKER AND NOT A COUNTER. A process-local "drops so far" counter is the
 * obvious mechanism and the wrong one: it dies in exactly the crash it would need to survive,
 * and a counter that resets to zero on restart reports a clean instrument at precisely the
 * moment the instrument is least trustworthy. That would overstate certainty, which is worse
 * than saying nothing. So the mechanism is durable and reconciled instead:
 *
 *   1. BEFORE the journal write, a marker naming the intended observation is written here.
 *   2. On a successful journal write, the marker is removed.
 *   3. On a reported drop, the marker is annotated with the recorder's own reason and LEFT.
 *
 * A marker still present afterwards is therefore either a confirmed drop (it carries the
 * reason) or an intent whose process never reported an outcome at all (it does not) — and the
 * two are genuinely different operational facts, so they are reported as different kinds.
 *
 * RECONCILIATION, NOT ACCUSATION. A marker is only evidence of loss if the journal does not in
 * fact hold that `journalEventId`. A crash in the window between publishing the record and
 * removing the marker leaves a marker for a record that survived perfectly well; counting it as
 * data loss would manufacture an incident out of a successful write. `journalEventId` is
 * deterministic and content-addressed, which is what makes that check cheap and exact — see
 * `deriveObservationIntegrity` in `lib/observability/observation-integrity.ts`.
 *
 * WHAT THIS STILL CANNOT SEE, stated here rather than discovered later: an observation whose
 * MARKER also failed to be written is invisible to this ledger. The failure that takes out the
 * journal directory can take out this one too. That is why the read model's clean answer is
 * named `NO_KNOWN_LOSS` and never `COMPLETE`.
 *
 * NO BUSINESS VOCABULARY, and none possible: the marker carries the same identity/type/outcome
 * fields the journal event already declares, with no payload, body, or free text of its own
 * beyond the recorder's mechanical drop reason.
 */

export const OBSERVATION_INTENT_SCHEMA_VERSION = 'observation-intent-1';

export const ObservationIntentSchema = z.strictObject({
  schemaVersion: z.literal(OBSERVATION_INTENT_SCHEMA_VERSION),
  /** The identity of the observation this marker is standing in for. The reconciliation key. */
  journalEventId: z.string().min(1),
  incidentId: z.string().min(1),
  correlationId: z.string().min(1),
  systemId: z.string().min(1),
  type: JournalEventTypeSchema,
  outcome: ObservableOutcomeSchema,
  /** The observation's own `recordedAt`. Copied, never re-derived from a clock. */
  intendedAt: z.string().min(1),
  /**
   * The recorder's own words for why the write failed. PRESENT means the boundary lived long
   * enough to report a failure; ABSENT means nothing ever came back, which is a different and
   * strictly less informative situation.
   */
  dropReason: z.string().min(1).optional(),
});

export type ObservationIntent = z.infer<typeof ObservationIntentSchema>;

/** Thrown when a marker exists but is not a valid intent. Never swallowed — see the read model. */
export class MalformedObservationIntentError extends Error {
  constructor(
    readonly location: string,
    readonly detail: string,
  ) {
    super(`Observation intent marker at "${location}" is malformed: ${detail}`);
    this.name = 'MalformedObservationIntentError';
  }
}

/**
 * Derives the marker for an observation. Total and pure: every field is one the journal event
 * already carries, so a marker can never describe an observation that was never attempted.
 */
export function intentFor(event: JournalEvent): ObservationIntent {
  return {
    schemaVersion: OBSERVATION_INTENT_SCHEMA_VERSION,
    journalEventId: event.journalEventId,
    incidentId: event.incidentId,
    correlationId: event.correlationId,
    systemId: event.systemId,
    type: event.type,
    outcome: event.outcome,
    intendedAt: event.recordedAt,
  };
}

export interface ObservationIntentStore {
  /** Write-ahead. `NOT_OPENED` means this observation is unmonitored — never that it succeeded. */
  open(intent: ObservationIntent): Promise<'OPENED' | 'NOT_OPENED'>;
  /** The journal write succeeded; there is nothing left to reconcile. */
  close(journalEventId: string): Promise<void>;
  /**
   * The journal write failed and said why. Upserts deliberately: a drop whose marker was never
   * opened is still a drop we know about, and refusing to record it would lose the one fact the
   * boundary did manage to establish.
   */
  markDropped(intent: ObservationIntent, reason: string): Promise<void>;
  /** Every marker still outstanding, ordered by identity. Raises on a corrupt marker. */
  list(): Promise<readonly ObservationIntent[]>;
}

function ordered(intents: readonly ObservationIntent[]): ObservationIntent[] {
  return [...intents].sort((a, b) => a.journalEventId.localeCompare(b.journalEventId));
}

// ---------------------------------------------------------------------------

/** For tests and for exercising ledger LOGIC. Never a stand-in for the durability claim. */
export class InMemoryObservationIntentStore implements ObservationIntentStore {
  private readonly markers = new Map<string, ObservationIntent>();

  async open(intent: ObservationIntent): Promise<'OPENED' | 'NOT_OPENED'> {
    if (!this.markers.has(intent.journalEventId)) this.markers.set(intent.journalEventId, intent);
    return 'OPENED';
  }

  async close(journalEventId: string): Promise<void> {
    this.markers.delete(journalEventId);
  }

  async markDropped(intent: ObservationIntent, reason: string): Promise<void> {
    this.markers.set(intent.journalEventId, { ...intent, dropReason: reason });
  }

  async list(): Promise<readonly ObservationIntent[]> {
    return ordered([...this.markers.values()]);
  }
}

// ---------------------------------------------------------------------------

/**
 * ONE FILE PER OUTSTANDING OBSERVATION, in one flat directory — deliberately NOT sharded by
 * case the way the journal is. The journal shards because a case's history is read as a unit;
 * this ledger is only ever read whole, and a flat directory makes "is anything outstanding?"
 * a single `readdir` rather than a walk.
 *
 * `open` publishes with write-temp-then-`link`, so a repeated open of the same identity is
 * idempotent by kernel refusal rather than by a read-then-write window — the same guarantee
 * and the same reason as the journal's own publication step. `markDropped` uses
 * temp-then-`rename` because it must genuinely replace an existing marker.
 *
 * DIRECTORY LIVES UNDER `.data/` and is gitignored: runtime accounting, never a fixture.
 */
export class FileObservationIntentStore implements ObservationIntentStore {
  private tempCounter = 0;

  constructor(private readonly dir: string) {}

  private pathFor(journalEventId: string): string {
    return `${this.dir}/${recordFileNameFor(journalEventId)}`;
  }

  private async writeTemp(intent: ObservationIntent): Promise<{ tempPath: string }> {
    const fs = await import('node:fs/promises');
    await fs.mkdir(this.dir, { recursive: true });
    this.tempCounter += 1;
    const tempPath = `${this.dir}/.${process.pid}-${this.tempCounter}.tmp`;
    await fs.writeFile(tempPath, JSON.stringify(intent, null, 2), 'utf8');
    return { tempPath };
  }

  async open(intent: ObservationIntent): Promise<'OPENED' | 'NOT_OPENED'> {
    try {
      const fs = await import('node:fs/promises');
      const { tempPath } = await this.writeTemp(intent);
      try {
        await fs.link(tempPath, this.pathFor(intent.journalEventId));
      } catch (error) {
        // EEXIST: this identity is already outstanding. Idempotent, not an error.
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      } finally {
        await fs.unlink(tempPath).catch(() => undefined);
      }
      return 'OPENED';
    } catch {
      // The accounting mechanism itself is unavailable. Reported as unmonitored, never as fine.
      return 'NOT_OPENED';
    }
  }

  async close(journalEventId: string): Promise<void> {
    const fs = await import('node:fs/promises');
    await fs.unlink(this.pathFor(journalEventId)).catch(() => undefined);
  }

  async markDropped(intent: ObservationIntent, reason: string): Promise<void> {
    const fs = await import('node:fs/promises');
    const { tempPath } = await this.writeTemp({ ...intent, dropReason: reason });
    await fs.rename(tempPath, this.pathFor(intent.journalEventId));
  }

  async list(): Promise<readonly ObservationIntent[]> {
    const fs = await import('node:fs/promises');

    let names: string[];
    try {
      names = await fs.readdir(this.dir);
    } catch (error) {
      // A ledger directory that has never been written holds no outstanding markers. That is a
      // genuine empty, distinct from an unreadable one, which propagates below.
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    }

    const intents: ObservationIntent[] = [];
    for (const name of names.filter((n) => n.endsWith('.json')).sort()) {
      const location = `${this.dir}/${name}`;
      const raw = await fs.readFile(location, 'utf8');
      let json: unknown;
      try {
        json = JSON.parse(raw);
      } catch (error) {
        throw new MalformedObservationIntentError(location, error instanceof Error ? error.message : 'unparseable JSON');
      }
      const parsed = ObservationIntentSchema.safeParse(json);
      if (!parsed.success) {
        throw new MalformedObservationIntentError(
          location,
          parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
        );
      }
      intents.push(parsed.data);
    }
    return ordered(intents);
  }
}
