import { z } from 'zod';
import { DECISION_MECHANISMS, FailureClassSchema } from '@/lib/model/system';
import { ExecutionModeSchema } from '@/lib/model/runtime';

/**
 * THE NON-AUTHORITATIVE EXECUTION JOURNAL.
 *
 * Three concerns, three authorities, deliberately never merged:
 *
 *   business / lifecycle state  -> `WaitIncidentStore`      (what the case IS)
 *   execution / idempotency     -> `OperationClaimStore`    (what may HAPPEN, once)
 *   observability / history     -> this journal             (what was OBSERVED)
 *
 * The journal is the third one and ONLY the third one. It answers "what happened to this
 * lead?" — it never answers "what should happen next." Deleting this entire directory must
 * change nothing about what the engine decides; that is asserted directly in
 * `tests/execution-journal.test.ts` by running the same business path with a journal that
 * fails every write and one that throws on every write, and requiring byte-identical results.
 *
 * TWO INTERFACES, NOT ONE, AND THAT SPLIT IS THE POINT. `ExecutionJournalRecorder` is the
 * write side and the only side any engine or port module is permitted to see.
 * `ExecutionJournalReader` is the query side, reachable only from the operator surface. If
 * decision code could read history, history would become an input to decisions, and the
 * journal would silently have become a second state machine — the exact failure this module
 * exists to prevent. A structural test scans `lib/engine/**` and `lib/ports/**` for the
 * reader's symbols and fails if any of them appear.
 *
 * `record()` NEVER THROWS AND NEVER RETRIES. It reports `RECORDED`, `ALREADY_RECORDED`, or
 * `DROPPED` with a reason, and callers ignore the result. This is a deliberate, documented
 * trade: the journal is lossy under failure, and claiming otherwise would require the
 * business write and the journal write to share a transaction — which would make an
 * observability outage able to stop real work. Truthful degradation over false completeness.
 *
 * SANITIZATION IS STRUCTURAL. `JournalEventSchema` is a `strictObject` over a fixed field
 * list with no payload, body, message, or reasoning field of any kind, so private
 * chain-of-thought and customer message content have nowhere to go even if a future caller
 * tried. The single free-text field, `detail`, is length-bounded and refuses
 * credential-shaped content outright rather than storing and hoping.
 */

export const EXECUTION_JOURNAL_SCHEMA_VERSION = 'lead-rescue-execution-journal-1';

/**
 * The operator grammar. Derived from the event type rather than stored, so a record can
 * never disagree with its own stage.
 */
export const JOURNAL_STAGES = ['TRIGGER', 'DECISION', 'AUTHORITY', 'ACTION', 'OUTCOME'] as const;
export const JournalStageSchema = z.enum(JOURNAL_STAGES);
export type JournalStage = z.infer<typeof JournalStageSchema>;

/**
 * One type per instrumented runtime boundary — NOT one per function call. Each boundary
 * produces exactly one observation because each boundary has exactly one outcome; inventing
 * finer granularity would be narrating internals rather than recording observations.
 */
export const JOURNAL_EVENT_TYPES = [
  /** An external lead entered the system through the ingress seam. */
  'INGRESS_RECEIVED',
  /** A parked case was re-evaluated against its configured window by the deterministic engine. */
  'WAIT_EVALUATED',
  /** A person submitted a decision against a case under review. */
  'HUMAN_DECISION_RECORDED',
  /** An authorized outbound action was attempted through the execution boundary. */
  'DISPATCH_ATTEMPTED',
] as const;
export const JournalEventTypeSchema = z.enum(JOURNAL_EVENT_TYPES);
export type JournalEventType = z.infer<typeof JournalEventTypeSchema>;

export const STAGE_FOR_EVENT_TYPE: Record<JournalEventType, JournalStage> = {
  INGRESS_RECEIVED: 'TRIGGER',
  WAIT_EVALUATED: 'DECISION',
  HUMAN_DECISION_RECORDED: 'AUTHORITY',
  DISPATCH_ATTEMPTED: 'ACTION',
};

/**
 * The canonical `DECISION_MECHANISMS` plus exactly one addition. An execution attempt is not
 * a decision — it is the carrying out of one already made — and calling it `DETERMINISTIC_RULE`
 * would misreport who was responsible. `tests/execution-journal.test.ts` asserts this stays a
 * superset so the canonical vocabulary can never drift away underneath it.
 */
export const JOURNAL_MECHANISMS = [...DECISION_MECHANISMS, 'EXECUTION'] as const;
export const JournalMechanismSchema = z.enum(JOURNAL_MECHANISMS);
export type JournalMechanism = z.infer<typeof JournalMechanismSchema>;

/**
 * The normalized observable outcome. The four an operator must never confuse are kept
 * genuinely distinct, and they mean exactly what the engine's own `SideEffectStatus` and
 * `SendOutcome` vocabularies already mean:
 *
 *   EXECUTED             — the action was carried out.
 *   SUPPRESSED_DUPLICATE — a prior confirmed claim already covered it; nothing ran twice.
 *   FAILED_BEFORE_EFFECT — confirmed non-execution. Nothing reached anyone.
 *   OUTCOME_UNKNOWN      — genuinely unresolved. It MAY have happened. Never retried blindly.
 */
export const OBSERVABLE_OUTCOMES = [
  'ACCEPTED',
  /** Canonically rejected by the engine's own rules — not an authority refusal. */
  'REJECTED',
  /** Refused by a guard: insufficient authority, a stale revision, or a wrong lifecycle state. */
  'REFUSED',
  'SUPPRESSED_DUPLICATE',
  'EXECUTED',
  'FAILED_BEFORE_EFFECT',
  'OUTCOME_UNKNOWN',
  /** Evaluated, and correctly did nothing — the window has not elapsed. */
  'NO_ACTION',
  /** An attention condition was durably recorded and raised to the next owner. */
  'ESCALATED',
  /** A wait genuinely elapsed and the case moved on. */
  'RESOLVED',
  'NOT_FOUND',
] as const;
export const ObservableOutcomeSchema = z.enum(OBSERVABLE_OUTCOMES);
export type ObservableOutcome = z.infer<typeof ObservableOutcomeSchema>;

const MAX_DETAIL_LENGTH = 240;

/**
 * Credential-shaped content, refused rather than stored. Deliberately narrow and
 * exact-shaped: a bare substring match on words like "key" or "token" would reject the
 * engine's own legitimate detail strings ("Idempotency key … was already durably confirmed"),
 * which would push callers toward omitting detail entirely and make the journal less useful,
 * not safer.
 */
const CREDENTIAL_SHAPED =
  /(^|\s)(Bearer\s+[A-Za-z0-9._~+/-]{8,}|sk-[A-Za-z0-9-]{10,}|xox[baprs]-[A-Za-z0-9-]{10,})|(api[_-]?key|password|passwd|secret|access[_-]?token|auth[_-]?token)\s*[:=]\s*\S/i;

const DetailSchema = z
  .string()
  .min(1)
  .max(MAX_DETAIL_LENGTH)
  .refine((value) => !CREDENTIAL_SHAPED.test(value), {
    message: 'detail looks like it contains a credential; the journal refuses to persist it',
  });

const IsoInstantSchema = z
  .string()
  .min(1)
  .refine((value) => !Number.isNaN(Date.parse(value)), { message: 'must be a parseable ISO-8601 instant' });

/**
 * THE EVENT CONTRACT. Every field is one the runtime can truthfully populate at the moment of
 * observation — nothing here is inferred, and nothing optional is ever filled with a
 * placeholder. Absent means "not known at this boundary", which is itself information.
 */
export const JournalEventSchema = z.strictObject({
  /**
   * Stable identity for ONE observation. Recording the same id twice is idempotent, so a
   * redelivered or retried boundary call cannot double an operator's history. Call sites
   * derive it from identities that already exist (entity id, source event id, operation
   * claim id) — never from a clock alone, and never randomly.
   */
  journalEventId: z.string().min(1),
  schemaVersion: z.literal(EXECUTION_JOURNAL_SCHEMA_VERSION),
  /** When the boundary observed this. Supplied by the caller from the value it already holds. */
  recordedAt: IsoInstantSchema,
  systemId: z.string().min(1),
  /** The business case. Also the shard key — see `FileExecutionJournal`. */
  incidentId: z.string().min(1),
  /** Groups every observation belonging to one case across runtime instances. */
  correlationId: z.string().min(1),
  /** The business-state revision in force when observed, where the boundary knows it. */
  revision: z.number().int().positive().optional(),
  type: JournalEventTypeSchema,
  /** Who or what produced the outcome. Absent where no decision was involved. */
  mechanism: JournalMechanismSchema.optional(),
  outcome: ObservableOutcomeSchema,
  /** Canonical failure vocabulary, reused unchanged — never a second taxonomy. */
  failureClass: FailureClassSchema.optional(),
  /** SIMULATED or LIVE, read from the executor that actually ran. Never assumed. */
  executionMode: ExecutionModeSchema.optional(),
  /** The provider or executor identity that acted, e.g. `lead-rescue-local-smtp-executor`. */
  actorId: z.string().min(1).optional(),
  /** The durable claim that governed this action. A reference, never a copy. */
  operationClaimId: z.string().min(1).optional(),
  /** The declared transition rule that fired, e.g. `lr-t10`. */
  ruleId: z.string().min(1).optional(),
  /** How the case genuinely entered the system. Present only where a case actually has one. */
  provenance: z
    .strictObject({
      source: z.string().min(1),
      sourceEventId: z.string().min(1),
      ingestionPath: z.string().min(1),
    })
    .optional(),
  /** Bounded operator-facing note. Never a payload, a message body, or model reasoning. */
  detail: DetailSchema.optional(),
});

export type JournalEvent = z.infer<typeof JournalEventSchema>;

/** Thrown when persisted journal data exists but is not a valid record. Never swallowed. */
export class MalformedJournalRecordError extends Error {
  constructor(
    readonly location: string,
    readonly detail: string,
  ) {
    super(`Journal record at "${location}" is malformed: ${detail}`);
    this.name = 'MalformedJournalRecordError';
  }
}

export type JournalRecordOutcome =
  | { readonly kind: 'RECORDED' }
  /** This exact observation was already durably recorded. Not an error; not a second record. */
  | { readonly kind: 'ALREADY_RECORDED' }
  /** The observation was NOT recorded. History is now incomplete, and says so. */
  | { readonly kind: 'DROPPED'; readonly reason: string };

/** The write side. The ONLY side engine and port code may see. */
export interface ExecutionJournalRecorder {
  /** Never throws. A failure is reported as `DROPPED`, never raised into business code. */
  record(event: JournalEvent): Promise<JournalRecordOutcome>;
}

/** The query side. Reachable only from the operator surface — never from decision code. */
export interface ExecutionJournalReader {
  /** Chronological history for one case. Empty when nothing was ever observed. */
  readIncident(incidentId: string): Promise<readonly JournalEvent[]>;
  /** Chronological history for one correlated run, across cases that share it. */
  readCorrelation(correlationId: string): Promise<readonly JournalEvent[]>;
  /** Every case with any retained history. Empty when the journal has never been written. */
  listIncidents(): Promise<readonly string[]>;
}

export interface ExecutionJournal extends ExecutionJournalRecorder, ExecutionJournalReader {}

/**
 * Total, deterministic order: by observation time, then by identity. Two observations
 * recorded in the SAME millisecond by two independent writers are ordered by id rather than
 * by real time — deterministic and stable across readers, but not a claim to have captured
 * their true sequence. There is no global clock here and this module does not pretend one.
 */
function chronological(events: readonly JournalEvent[]): JournalEvent[] {
  return [...events].sort((a, b) => {
    const byTime = Date.parse(a.recordedAt) - Date.parse(b.recordedAt);
    return byTime !== 0 ? byTime : a.journalEventId.localeCompare(b.journalEventId);
  });
}

function validate(event: JournalEvent): { ok: true } | { ok: false; reason: string } {
  const parsed = JournalEventSchema.safeParse(event);
  if (parsed.success) return { ok: true };
  return { ok: false, reason: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') };
}

// ---------------------------------------------------------------------------
// In-memory implementation — for tests and for exercising journal LOGIC.
// ---------------------------------------------------------------------------

/**
 * Correct for proving emission, correlation, and outcome vocabulary. Never a valid stand-in
 * for the durability claim: nothing here survives the process, which is the entire point of
 * `FileExecutionJournal`.
 */
export class InMemoryExecutionJournal implements ExecutionJournal {
  private readonly events = new Map<string, JournalEvent>();

  async record(event: JournalEvent): Promise<JournalRecordOutcome> {
    const checked = validate(event);
    if (!checked.ok) return { kind: 'DROPPED', reason: checked.reason };
    if (this.events.has(event.journalEventId)) return { kind: 'ALREADY_RECORDED' };
    this.events.set(event.journalEventId, event);
    return { kind: 'RECORDED' };
  }

  async readIncident(incidentId: string): Promise<readonly JournalEvent[]> {
    return chronological([...this.events.values()].filter((e) => e.incidentId === incidentId));
  }

  async readCorrelation(correlationId: string): Promise<readonly JournalEvent[]> {
    return chronological([...this.events.values()].filter((e) => e.correlationId === correlationId));
  }

  async listIncidents(): Promise<readonly string[]> {
    return [...new Set([...this.events.values()].map((e) => e.incidentId))].sort();
  }
}

// ---------------------------------------------------------------------------
// File-backed implementation — durable, sharded, append-only.
// ---------------------------------------------------------------------------

/**
 * A cheap, stable string hash — djb2, the same one `lib/engine/lead-ingress.ts` already uses
 * for content-addressed identity. Used ONLY to keep a filename inside the platform's length
 * limit while remaining a deterministic function of the full id, so duplicate detection is
 * unaffected. Not a security primitive.
 */
function shortHash(input: string): string {
  let hash = 5381;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 33) ^ input.charCodeAt(index);
  }
  return (hash >>> 0).toString(36);
}

const MAX_BASENAME_LENGTH = 180;

function fileNameFor(journalEventId: string): string {
  const encoded = encodeURIComponent(journalEventId);
  if (encoded.length <= MAX_BASENAME_LENGTH) return `${encoded}.json`;
  return `${encoded.slice(0, MAX_BASENAME_LENGTH)}~${shortHash(journalEventId)}.json`;
}

/**
 * ONE DIRECTORY PER CASE, ONE FILE PER OBSERVATION. Deliberately NOT one shared append-only
 * file: two independent Next.js route invocations writing the same JSON file is precisely the
 * corruption this repository's own `FileWaitIncidentStore` docstring warns about, and an
 * append-only text file has no atomicity guarantee for writes larger than the platform's pipe
 * buffer. Sharding by `incidentId` also gives isolation for free — one case's history is
 * physically incapable of appearing in another's read.
 *
 * PUBLICATION IS ATOMIC AND EXCLUSIVE, via write-temp-then-`link`:
 *
 *   1. the full record is written to a temp file in the SAME directory (so `link` cannot
 *      cross a filesystem boundary);
 *   2. `fs.link(temp, final)` publishes it — atomic, and it fails with `EEXIST` if that
 *      `journalEventId` was already recorded, which is the duplicate rule enforced by the
 *      kernel rather than by a read-then-write window;
 *   3. the temp file is unlinked.
 *
 * A crash before step 2 leaves an orphaned `.tmp` file and NO partial record — readers only
 * ever see `.json` files, so a torn write cannot become a fabricated observation. Orphaned
 * temp files accumulate until cleaned up by hand; that is an accepted prototype cost, stated
 * rather than hidden.
 *
 * READS FAIL LOUDLY. A file that is not parseable JSON, or that does not satisfy
 * `JournalEventSchema`, raises `MalformedJournalRecordError`. It is never skipped: silently
 * omitting an unreadable record would present a SHORTER history as if it were the complete
 * one, which is a fabricated history in the only sense that matters to an operator.
 */
export class FileExecutionJournal implements ExecutionJournal {
  private tempCounter = 0;

  constructor(private readonly dir: string) {}

  private incidentDir(incidentId: string): string {
    return `${this.dir}/${encodeURIComponent(incidentId)}`;
  }

  async record(event: JournalEvent): Promise<JournalRecordOutcome> {
    const checked = validate(event);
    if (!checked.ok) return { kind: 'DROPPED', reason: checked.reason };

    try {
      const fs = await import('node:fs/promises');
      const dir = this.incidentDir(event.incidentId);
      await fs.mkdir(dir, { recursive: true });

      const finalPath = `${dir}/${fileNameFor(event.journalEventId)}`;
      this.tempCounter += 1;
      const tempPath = `${dir}/.${process.pid}-${this.tempCounter}.tmp`;

      await fs.writeFile(tempPath, JSON.stringify(event, null, 2), 'utf8');
      try {
        await fs.link(tempPath, finalPath);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'EEXIST') return { kind: 'ALREADY_RECORDED' };
        throw error;
      } finally {
        await fs.unlink(tempPath).catch(() => undefined);
      }
      return { kind: 'RECORDED' };
    } catch (error) {
      // The contract: a journal failure is reported, never raised into business code.
      return { kind: 'DROPPED', reason: error instanceof Error ? error.message : String(error) };
    }
  }

  private async readDir(incidentId: string): Promise<JournalEvent[]> {
    const fs = await import('node:fs/promises');
    const dir = this.incidentDir(incidentId);

    let names: string[];
    try {
      names = await fs.readdir(dir);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    }

    const events: JournalEvent[] = [];
    for (const name of names.filter((n) => n.endsWith('.json')).sort()) {
      const location = `${dir}/${name}`;
      const raw = await fs.readFile(location, 'utf8');
      let json: unknown;
      try {
        json = JSON.parse(raw);
      } catch (error) {
        throw new MalformedJournalRecordError(location, error instanceof Error ? error.message : 'unparseable JSON');
      }
      const parsed = JournalEventSchema.safeParse(json);
      if (!parsed.success) {
        throw new MalformedJournalRecordError(
          location,
          parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
        );
      }
      events.push(parsed.data);
    }
    return events;
  }

  async readIncident(incidentId: string): Promise<readonly JournalEvent[]> {
    return chronological(await this.readDir(incidentId));
  }

  async readCorrelation(correlationId: string): Promise<readonly JournalEvent[]> {
    const all: JournalEvent[] = [];
    for (const incidentId of await this.listIncidents()) {
      all.push(...(await this.readDir(incidentId)).filter((e) => e.correlationId === correlationId));
    }
    return chronological(all);
  }

  async listIncidents(): Promise<readonly string[]> {
    const fs = await import('node:fs/promises');
    try {
      const entries = await fs.readdir(this.dir, { withFileTypes: true });
      return entries
        .filter((e) => e.isDirectory())
        .map((e) => decodeURIComponent(e.name))
        .sort();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    }
  }
}

/**
 * The honest no-op. Used wherever no journal is configured: it reports `DROPPED` with a
 * reason rather than `RECORDED`, because reporting a successful write for a record that was
 * never written is the one thing an observability component must never do.
 */
export const NULL_EXECUTION_JOURNAL: ExecutionJournalRecorder = {
  async record(): Promise<JournalRecordOutcome> {
    return { kind: 'DROPPED', reason: 'no execution journal is configured for this runtime' };
  },
};

/**
 * The single call instrumentation uses. Absent recorder is a no-op; a recorder that throws is
 * contained here rather than at every call site. Callers do not await a decision from this —
 * they await only so a successful write is durable before the boundary returns.
 */
export async function recordSafely(
  journal: ExecutionJournalRecorder | undefined,
  event: JournalEvent,
): Promise<JournalRecordOutcome> {
  if (journal === undefined) return { kind: 'DROPPED', reason: 'no execution journal is configured for this runtime' };
  try {
    return await journal.record(event);
  } catch (error) {
    return { kind: 'DROPPED', reason: error instanceof Error ? error.message : String(error) };
  }
}
