import { z } from 'zod';

/**
 * THE WAIT-INCIDENT STORE.
 *
 * Named for the one property it owns: "which incidents are waiting, and what they need to
 * resume evaluation." Not a generalized repository, not a state store for all six systems —
 * see `docs/FIDELITY_ASSESSMENT.md` section 6 for why this is scoped exactly this narrowly.
 *
 * What is stored is the SMALLEST thing that survives a process boundary and lets
 * evaluation resume correctly: the entity's own `EngineState` at the moment it parked in a
 * waiting lifecycle state, plus enough identity to route a later re-check event back to it.
 * `waitStartedAt` is deliberately NOT a separate field — it already lives inside
 * `engineState.facts`, and duplicating it here would be exactly the kind of derived,
 * duplicative state the assessment warns against. The configured wait window is not stored
 * at all: it is read fresh from `profile.operatingParameters` at check time, so a policy
 * change takes effect on the next check rather than being frozen into old records.
 *
 * `revision` is the only concurrency primitive here. It exists to make `resolve()` safe
 * against two overlapping re-checks racing to resolve the same incident — not to support
 * true multi-process locking, which this prototype does not attempt (see
 * `lib/engine/wait-resume.ts` for the reasoning).
 *
 * `revision` is also, since the wait/resume reliability-closure pass, a genuinely
 * NEVER-REUSED identifier for one incidentId's entire history, not merely for its current
 * active record. An earlier version of this store computed revision from the ACTIVE record
 * alone (`existing?.revision ?? 0`), which meant a fully resolved-and-deleted incident's
 * revision counter silently reset to 0 — so a later, genuinely new wait cycle re-parked
 * under the SAME incidentId (a legitimate operation this store has always permitted; see
 * `park()`) could be assigned the exact same revision number an earlier, already-CONFIRMED
 * cycle used. Anything keying durable identity off `${incidentId, revision}` — which is
 * exactly what `lib/persistence/operation-claim-store.ts`'s claim identity does — would then
 * treat the new cycle's notification as an already-completed duplicate of the old one and
 * permanently suppress it. Each implementation below now persists a revision high-water
 * mark that survives `resolve()`, independently of the active record, so this collision is
 * structurally impossible: see `tests/wait-incident-store.test.ts`'s
 * "revision survives a full resolve/delete/re-park cycle" cases for the falsifying proof.
 */

export const WaitIncidentRecordSchema = z.strictObject({
  incidentId: z.string().min(1),
  systemId: z.string().min(1),
  correlationId: z.string().min(1),
  engineState: z.strictObject({
    lifecycleState: z.string().min(1),
    facts: z.record(z.string(), z.string()),
    suppressed: z.boolean(),
    awaitingHuman: z.string().nullable(),
    missingInformation: z.array(z.string()),
  }),
  revision: z.number().int().positive(),
});

export type WaitIncidentRecord = z.infer<typeof WaitIncidentRecordSchema>;

/** Thrown when a persisted record exists but does not conform to `WaitIncidentRecordSchema`. */
export class MalformedWaitRecordError extends Error {
  constructor(
    readonly incidentId: string,
    readonly detail: string,
  ) {
    super(`Wait incident record for "${incidentId}" is malformed: ${detail}`);
    this.name = 'MalformedWaitRecordError';
  }
}

export type ResolveOutcome = 'RESOLVED' | 'NOT_FOUND' | 'STALE_REVISION';

export interface WaitIncidentStore {
  /**
   * Creates or replaces the waiting record for `incidentId`. Returns the stored record,
   * with `revision` set to 1 for a new incident or the prior revision + 1 for a re-park —
   * a re-park is a legitimate operation (e.g. a corrected engine state), not an error, but
   * it does invalidate any `revision` a caller already holds for the old record.
   */
  park(record: Omit<WaitIncidentRecord, 'revision'>): Promise<WaitIncidentRecord>;

  /**
   * Loads the current record, or `undefined` if none exists — the common, non-exceptional
   * "already resolved, or never existed" case. Throws `MalformedWaitRecordError` only when
   * a record exists but fails schema validation.
   */
  load(incidentId: string): Promise<WaitIncidentRecord | undefined>;

  /**
   * Removes the record for `incidentId`, but only if its current revision matches
   * `expectedRevision`. This is the sole guard against a duplicate or racing resume: the
   * first caller to resolve wins and gets `RESOLVED`; every other caller — whether racing
   * concurrently or resuming an incident already resolved earlier — gets `NOT_FOUND` or
   * `STALE_REVISION` and must treat that as a safe no-op, never as a reason to retry.
   */
  resolve(incidentId: string, expectedRevision: number): Promise<ResolveOutcome>;

  /** Every currently-waiting incident. Used by the check-all pass and by the demo UI. */
  listWaiting(): Promise<readonly WaitIncidentRecord[]>;
}

// ---------------------------------------------------------------------------
// In-memory implementation — fast, single-process, deliberately NOT durable.
// ---------------------------------------------------------------------------

/**
 * A plain `Map` behind the same interface. Correct for testing the wait/resume LOGIC
 * (too-early, elapsed, duplicate-resume) without file I/O, but never a valid stand-in for
 * proving durability across a process boundary — an incident parked here is gone the
 * moment this object is. See `FileWaitIncidentStore` for the implementation that actually
 * survives reconstruction.
 */
export class InMemoryWaitIncidentStore implements WaitIncidentStore {
  private readonly records = new Map<string, WaitIncidentRecord>();
  /** Never deleted by `resolve()` — see the module docstring's revision note. */
  private readonly revisionHighWaterMarks = new Map<string, number>();

  async park(record: Omit<WaitIncidentRecord, 'revision'>): Promise<WaitIncidentRecord> {
    const nextRevision = (this.revisionHighWaterMarks.get(record.incidentId) ?? 0) + 1;
    this.revisionHighWaterMarks.set(record.incidentId, nextRevision);
    const stored: WaitIncidentRecord = { ...record, revision: nextRevision };
    this.records.set(record.incidentId, stored);
    return stored;
  }

  async load(incidentId: string): Promise<WaitIncidentRecord | undefined> {
    return this.records.get(incidentId);
  }

  async resolve(incidentId: string, expectedRevision: number): Promise<ResolveOutcome> {
    const existing = this.records.get(incidentId);
    if (existing === undefined) return 'NOT_FOUND';
    if (existing.revision !== expectedRevision) return 'STALE_REVISION';
    this.records.delete(incidentId);
    return 'RESOLVED';
  }

  async listWaiting(): Promise<readonly WaitIncidentRecord[]> {
    return [...this.records.values()];
  }
}

// ---------------------------------------------------------------------------
// File-backed implementation — the one that genuinely survives a process boundary.
// ---------------------------------------------------------------------------

/**
 * One JSON file holding every waiting incident as a map keyed by `incidentId`. This is the
 * whole durability mechanism: no directory listing, no per-incident file, no database. A
 * fresh `FileWaitIncidentStore` pointed at the same path reads exactly what an earlier,
 * now-discarded instance last wrote — that reconstruction, not anything about the class
 * itself, is what makes a waiting incident survive a simulated process restart.
 *
 * Writes go through a temp-file-then-rename so a process killed mid-write leaves the prior
 * good file in place rather than a torn, half-written one — the cheapest real durability
 * property available without a database, and directly relevant to the "malformed record"
 * failure mode this store is asked to handle gracefully rather than to prevent by
 * assumption.
 */
export class FileWaitIncidentStore implements WaitIncidentStore {
  constructor(private readonly filePath: string) {}

  /**
   * A sibling file, deliberately separate from the main incidents file rather than a
   * reserved key inside it: `load()`/`listWaiting()` parse every top-level entry of the main
   * file as a `WaitIncidentRecord`, so a reserved key sharing that file would either collide
   * with a real incidentId or need every read path to special-case skipping it. A separate
   * file needs no such carve-out and cannot be corrupted by, or confused with, incident data.
   */
  private get highWaterMarkPath(): string {
    return `${this.filePath}.revisions.json`;
  }

  private async readHighWaterMarks(): Promise<Record<string, number>> {
    const fs = await import('node:fs/promises');
    let raw: string;
    try {
      raw = await fs.readFile(this.highWaterMarkPath, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {};
      throw error;
    }
    if (raw.trim().length === 0) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new Error(`Wait incident revision file "${this.highWaterMarkPath}" does not contain a JSON object.`);
    }
    return parsed as Record<string, number>;
  }

  private async writeHighWaterMarks(marks: Record<string, number>): Promise<void> {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    await fs.mkdir(path.dirname(this.highWaterMarkPath), { recursive: true });
    const tmpPath = `${this.highWaterMarkPath}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
    await fs.writeFile(tmpPath, JSON.stringify(marks, null, 2), 'utf8');
    await fs.rename(tmpPath, this.highWaterMarkPath);
  }

  private async readAll(): Promise<Record<string, unknown>> {
    const fs = await import('node:fs/promises');
    let raw: string;
    try {
      raw = await fs.readFile(this.filePath, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {};
      throw error;
    }
    if (raw.trim().length === 0) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new Error(`Wait incident store file "${this.filePath}" does not contain a JSON object.`);
    }
    return parsed as Record<string, unknown>;
  }

  private async writeAll(all: Record<string, unknown>): Promise<void> {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    const tmpPath = `${this.filePath}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
    await fs.writeFile(tmpPath, JSON.stringify(all, null, 2), 'utf8');
    await fs.rename(tmpPath, this.filePath);
  }

  async park(record: Omit<WaitIncidentRecord, 'revision'>): Promise<WaitIncidentRecord> {
    // Reserve the next revision FIRST, durably, before the incident record itself is
    // written. A crash between these two writes only "burns" a revision number — safe,
    // since nothing ever claimed it — never reuses one, which is the unsafe direction (two
    // distinct wait cycles sharing an identity). See the module docstring.
    const marks = await this.readHighWaterMarks();
    const nextRevision = (marks[record.incidentId] ?? 0) + 1;
    marks[record.incidentId] = nextRevision;
    await this.writeHighWaterMarks(marks);

    const all = await this.readAll();
    const stored: WaitIncidentRecord = { ...record, revision: nextRevision };
    all[record.incidentId] = stored;
    await this.writeAll(all);
    return stored;
  }

  async load(incidentId: string): Promise<WaitIncidentRecord | undefined> {
    const all = await this.readAll();
    const raw = all[incidentId];
    if (raw === undefined) return undefined;
    const parsed = WaitIncidentRecordSchema.safeParse(raw);
    if (!parsed.success) {
      throw new MalformedWaitRecordError(incidentId, parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
    }
    return parsed.data;
  }

  async resolve(incidentId: string, expectedRevision: number): Promise<ResolveOutcome> {
    const all = await this.readAll();
    const raw = all[incidentId];
    if (raw === undefined) return 'NOT_FOUND';
    const parsed = WaitIncidentRecordSchema.safeParse(raw);
    if (!parsed.success) {
      throw new MalformedWaitRecordError(incidentId, parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
    }
    if (parsed.data.revision !== expectedRevision) return 'STALE_REVISION';
    delete all[incidentId];
    await this.writeAll(all);
    return 'RESOLVED';
  }

  async listWaiting(): Promise<readonly WaitIncidentRecord[]> {
    const all = await this.readAll();
    const records: WaitIncidentRecord[] = [];
    for (const [incidentId, raw] of Object.entries(all)) {
      const parsed = WaitIncidentRecordSchema.safeParse(raw);
      if (!parsed.success) {
        throw new MalformedWaitRecordError(incidentId, parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
      }
      records.push(parsed.data);
    }
    return records;
  }
}

