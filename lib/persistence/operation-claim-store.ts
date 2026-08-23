import { z } from 'zod';

/**
 * THE DURABLE OPERATION-CLAIM STORE.
 *
 * `WaitIncidentStore.resolve()`'s revision guard protects exactly one thing: which caller
 * gets to remove a waiting-incident record. It was never a guard on the SIDE EFFECT a
 * wait-elapsed transition proposes — `checkWaitIncident` (`lib/engine/wait-resume.ts`)
 * computes that proposal by calling `applyEvent` with a brand-new `SideEffectLedger` /
 * `ExecutionLedger` PER CALL (`EngineInternals`, `lib/engine/types.ts`), so those in-memory
 * ledgers give zero protection across two overlapping `checkWaitIncident` calls — even
 * within a single process, let alone two genuinely independent ones. Worse, the revision
 * check in `resolve()` runs AFTER `applyEvent` has already computed `EXECUTED` for the
 * notification, and `resolve()`'s own read-check-write is not atomic across two independent
 * OS processes either: two `FileWaitIncidentStore` instances can both read the same
 * unresolved revision before either writes, and both then believe they alone resolved it.
 * `tests/lead-rescue-wait-resume-concurrency.test.ts` falsifies both of these directly.
 *
 * This store closes that gap: an exclusive, durable claim on the STABLE identity a proposed
 * side effect already carries — its own `idempotencyKey`, the same key `SideEffectLedger`
 * already uses for single-call idempotency, made durable and made cross-process-exclusive.
 * Scoped narrowly to whoever calls it — today, only `checkWaitIncident`'s post-`applyEvent`
 * gate for Lead Rescue's wait-elapsed notification (`lr-t14`).
 *
 * State model — deliberately the smallest one that distinguishes what matters:
 *   no record          -> not started. Safe to claim.
 *   CLAIMED             -> in flight, or a crash occurred between "the effect was computed as
 *                          EXECUTED" and "success was durably recorded." This build has no
 *                          external delivery receipt or provider-honoured idempotency key to
 *                          check against, so a CLAIMED-but-unconfirmed record is genuinely
 *                          ambiguous, not merely pessimistic bookkeeping. Refusing to treat it
 *                          as safe to retry is the only honest choice available here — see
 *                          `ClaimAttempt`'s `UNCERTAIN` case.
 *   CONFIRMED           -> durably completed. Never claimable again, permanently — the same
 *                          rule `ExecutionLedger.ALREADY_SUCCEEDED` already applies in-memory
 *                          within one call, made durable here.
 *
 * `claim()` is the one operation that must be genuinely exclusive across independent
 * processes on a local filesystem. The file-backed implementation uses
 * `fs.open(path, 'wx')` — POSIX `O_CREAT | O_EXCL` — which the kernel guarantees atomic: at
 * most one caller's open can succeed for a given path, full stop, no read-then-write window
 * to race. (This guarantee holds for a local disk or the usual container/VM filesystem this
 * prototype runs on; it does not hold on every network filesystem, e.g. classic NFS < v3 —
 * explicitly out of scope for a single-machine prototype.)
 */

export const OperationClaimRecordSchema = z.strictObject({
  operationId: z.string().min(1),
  status: z.enum(['CLAIMED', 'CONFIRMED']),
  claimedBy: z.string().min(1),
  claimedAt: z.string().min(1),
  confirmedAt: z.string().min(1).optional(),
});

export type OperationClaimRecord = z.infer<typeof OperationClaimRecordSchema>;

/** Thrown when a persisted claim record exists but does not conform to `OperationClaimRecordSchema`. */
export class MalformedOperationClaimError extends Error {
  constructor(
    readonly operationId: string,
    readonly detail: string,
  ) {
    super(`Operation claim record for "${operationId}" is malformed: ${detail}`);
    this.name = 'MalformedOperationClaimError';
  }
}

export type ClaimAttempt =
  /** This caller is the exclusive, durable owner of this operation. Safe to execute, then `confirm()`. */
  | { readonly decision: 'CLAIMED' }
  /**
   * A prior caller already confirmed this exact operation. This caller must not execute it
   * again — never retry, permanently.
   */
  | { readonly decision: 'ALREADY_CONFIRMED'; readonly record: OperationClaimRecord }
  /**
   * A prior caller claimed this operation but the record was never confirmed — either a
   * concurrent caller is still mid-flight (a transient, self-resolving case: a later check
   * will see CONFIRMED once the winner finishes) or a process genuinely crashed in that
   * window. From here the two are indistinguishable, so both are treated identically: this
   * caller must not execute the operation, must not assume success or failure, and must
   * surface the ambiguity rather than resolve it by guessing.
   */
  | { readonly decision: 'UNCERTAIN'; readonly record: OperationClaimRecord };

export interface OperationClaimStore {
  /** Attempts to durably and exclusively claim `operationId`. See `ClaimAttempt`. */
  claim(operationId: string, claimedBy: string, claimedAt: string): Promise<ClaimAttempt>;

  /**
   * Marks a `CLAIMED` operation `CONFIRMED`. Only the caller that received
   * `{ decision: 'CLAIMED' }` for this `operationId` may call this — calling it for an
   * operation this caller does not own would durably confirm someone else's claim.
   */
  confirm(operationId: string, confirmedAt: string): Promise<void>;

  /** Loads the current record, or `undefined` if this operation was never claimed. */
  load(operationId: string): Promise<OperationClaimRecord | undefined>;
}

// ---------------------------------------------------------------------------
// In-memory implementation — fast, single-process, deliberately NOT durable.
// ---------------------------------------------------------------------------

/**
 * Correct for testing the claim LOGIC (exclusivity within one process, confirm, the
 * already-confirmed/uncertain distinction) without file I/O. Never a valid stand-in for
 * proving cross-process exclusivity — see `FileOperationClaimStore`.
 */
export class InMemoryOperationClaimStore implements OperationClaimStore {
  private readonly records = new Map<string, OperationClaimRecord>();

  async claim(operationId: string, claimedBy: string, claimedAt: string): Promise<ClaimAttempt> {
    const existing = this.records.get(operationId);
    if (existing !== undefined) {
      return existing.status === 'CONFIRMED'
        ? { decision: 'ALREADY_CONFIRMED', record: existing }
        : { decision: 'UNCERTAIN', record: existing };
    }
    this.records.set(operationId, { operationId, status: 'CLAIMED', claimedBy, claimedAt });
    return { decision: 'CLAIMED' };
  }

  async confirm(operationId: string, confirmedAt: string): Promise<void> {
    const existing = this.records.get(operationId);
    if (existing === undefined) {
      throw new Error(`Cannot confirm unclaimed operation "${operationId}".`);
    }
    this.records.set(operationId, { ...existing, status: 'CONFIRMED', confirmedAt });
  }

  async load(operationId: string): Promise<OperationClaimRecord | undefined> {
    return this.records.get(operationId);
  }
}

// ---------------------------------------------------------------------------
// File-backed implementation — genuinely exclusive across independent processes.
// ---------------------------------------------------------------------------

/**
 * One file per operation, named by its (URI-encoded) `operationId` so an operator can `ls`
 * the claims directory and recognise which business operation each file names without
 * decoding a hash. `claim()`'s exclusivity comes entirely from `fs.open(path, 'wx')` — see
 * the module docstring. `confirm()` only ever runs after this caller's own successful claim,
 * so it uses the same temp-file-then-rename pattern `FileWaitIncidentStore` already
 * establishes: a process killed mid-write leaves the prior (CLAIMED) file in place rather
 * than a torn one, which is exactly the crash this store exists to survive correctly.
 */
export class FileOperationClaimStore implements OperationClaimStore {
  constructor(private readonly dir: string) {}

  private pathFor(operationId: string): string {
    return `${this.dir}/${encodeURIComponent(operationId)}.json`;
  }

  private async readRecord(operationId: string): Promise<OperationClaimRecord | undefined> {
    const fs = await import('node:fs/promises');
    let raw: string;
    try {
      raw = await fs.readFile(this.pathFor(operationId), 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
      throw error;
    }
    const parsed = OperationClaimRecordSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      throw new MalformedOperationClaimError(
        operationId,
        parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
      );
    }
    return parsed.data;
  }

  async claim(operationId: string, claimedBy: string, claimedAt: string): Promise<ClaimAttempt> {
    const fs = await import('node:fs/promises');
    await fs.mkdir(this.dir, { recursive: true });
    const record: OperationClaimRecord = { operationId, status: 'CLAIMED', claimedBy, claimedAt };
    try {
      // 'wx': O_CREAT | O_EXCL. Fails atomically, at the kernel level, if the file already
      // exists — no separate check then write for another process to land inside of.
      const handle = await fs.open(this.pathFor(operationId), 'wx');
      try {
        await handle.writeFile(JSON.stringify(record, null, 2), 'utf8');
      } finally {
        await handle.close();
      }
      return { decision: 'CLAIMED' };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      const existing = await this.readRecord(operationId);
      if (existing === undefined) {
        // The claim file existed at open() but was gone by the time it was read back —
        // some other process resolved a genuinely conflicting write. Fail closed rather
        // than silently re-claiming a value we cannot corroborate.
        throw new Error(
          `Operation claim race for "${operationId}": the claim file existed at open() but could not be read back.`,
        );
      }
      return existing.status === 'CONFIRMED'
        ? { decision: 'ALREADY_CONFIRMED', record: existing }
        : { decision: 'UNCERTAIN', record: existing };
    }
  }

  async confirm(operationId: string, confirmedAt: string): Promise<void> {
    const fs = await import('node:fs/promises');
    const existing = await this.readRecord(operationId);
    if (existing === undefined) {
      throw new Error(`Cannot confirm unclaimed operation "${operationId}".`);
    }
    const updated: OperationClaimRecord = { ...existing, status: 'CONFIRMED', confirmedAt };
    const finalPath = this.pathFor(operationId);
    const tmpPath = `${finalPath}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
    await fs.writeFile(tmpPath, JSON.stringify(updated, null, 2), 'utf8');
    await fs.rename(tmpPath, finalPath);
  }

  async load(operationId: string): Promise<OperationClaimRecord | undefined> {
    return this.readRecord(operationId);
  }
}
