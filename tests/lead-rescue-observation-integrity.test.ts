import { mkdtempSync, rmSync, chmodSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { readdirSync, readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import {
  EXECUTION_JOURNAL_SCHEMA_VERSION,
  FileExecutionJournal,
  InMemoryExecutionJournal,
  type ExecutionJournalRecorder,
  type JournalEvent,
  type JournalRecordOutcome,
} from '@/lib/persistence/execution-journal-store';
import {
  FileObservationIntentStore,
  InMemoryObservationIntentStore,
  OBSERVATION_INTENT_SCHEMA_VERSION,
  type ObservationIntentStore,
} from '@/lib/persistence/observation-intent-store';
import {
  deriveObservationIntegrity,
  withObservationIntegrity,
  type ObservationIntegrity,
} from '@/lib/observability/observation-integrity';

/**
 * FALSIFYING TESTS for OBSERVATION INTEGRITY.
 *
 * The journal has always been honest that `record()` may drop rather than block business work.
 * What it could never do is say WHETHER it dropped anything — so every total derived from it
 * was bounded by a disclaimer instead of by a measurement. These tests exist to falsify the
 * specific ways a "did we lose anything?" answer normally lies:
 *
 *   - by reporting "no loss" when the mechanism that would have noticed was itself broken;
 *   - by presenting "no KNOWN loss" as proof that nothing was lost;
 *   - by inventing a completeness percentage out of a denominator nobody has;
 *   - by counting a crash-orphaned marker as a loss when the record actually published;
 *   - by losing the accounting in the same process death it claims to survive;
 *   - by letting the accounting mechanism change what the business path returns.
 *
 * Every check below is written against those semantics. None of them passes for a module that
 * merely exists.
 */

const EVENT: JournalEvent = {
  journalEventId: 'case-1:INGRESS_RECEIVED:accepted',
  schemaVersion: EXECUTION_JOURNAL_SCHEMA_VERSION,
  recordedAt: '2026-08-26T10:00:00.000Z',
  systemId: 'lead-rescue',
  incidentId: 'case-1',
  correlationId: 'inc-case-1',
  type: 'INGRESS_RECEIVED',
  outcome: 'ACCEPTED',
};

function eventWith(overrides: Partial<JournalEvent>): JournalEvent {
  return { ...EVENT, ...overrides } as JournalEvent;
}

/** A journal that always fails the write, exactly as a full or unwritable disk would. */
class AlwaysDroppingJournal implements ExecutionJournalRecorder {
  async record(): Promise<JournalRecordOutcome> {
    return { kind: 'DROPPED', reason: 'ENOSPC: no space left on device' };
  }
}

/** A journal that throws rather than returning. `recordSafely` contains this; so must we. */
class ThrowingJournal implements ExecutionJournalRecorder {
  async record(): Promise<JournalRecordOutcome> {
    throw new Error('the journal exploded');
  }
}

/** An intent store whose every operation fails — the mechanism itself being broken. */
class BrokenIntentStore implements ObservationIntentStore {
  async open(): Promise<'OPENED' | 'NOT_OPENED'> {
    throw new Error('intent store unavailable');
  }
  async close(): Promise<void> {
    throw new Error('intent store unavailable');
  }
  async markDropped(): Promise<void> {
    throw new Error('intent store unavailable');
  }
  async list(): Promise<never> {
    throw new Error('intent store unavailable');
  }
}

const tempDirs: string[] = [];

function tempDir(prefix: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop() as string;
    try {
      chmodSync(dir, 0o700);
    } catch {
      /* best effort — the directory may already be gone */
    }
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------

describe('observation integrity — a completed observation leaves no residue', () => {
  it('reports NO_KNOWN_LOSS after a successful write, with the write-ahead marker cleaned up', async () => {
    const journal = new InMemoryExecutionJournal();
    const intents = new InMemoryObservationIntentStore();
    const recorder = withObservationIntegrity(journal, intents);

    expect(await recorder.record(EVENT)).toEqual({ kind: 'RECORDED' });

    expect(await intents.list(), 'a completed observation left a marker behind').toEqual([]);
    const integrity = await deriveObservationIntegrity(intents, journal);
    expect(integrity.kind).toBe('NO_KNOWN_LOSS');
  });

  it('treats a re-recorded (already durable) observation as complete, not as loss', async () => {
    const journal = new InMemoryExecutionJournal();
    const intents = new InMemoryObservationIntentStore();
    const recorder = withObservationIntegrity(journal, intents);

    await recorder.record(EVENT);
    expect(await recorder.record(EVENT)).toEqual({ kind: 'ALREADY_RECORDED' });

    const integrity = await deriveObservationIntegrity(intents, journal);
    expect(integrity.kind).toBe('NO_KNOWN_LOSS');
  });
});

describe('observation integrity — a dropped observation becomes a measurement', () => {
  it('reports a CONFIRMED_DROP carrying the recorder’s own reason, not a generic one', async () => {
    const journal = new AlwaysDroppingJournal();
    const intents = new InMemoryObservationIntentStore();
    const recorder = withObservationIntegrity(journal, intents);

    const outcome = await recorder.record(EVENT);
    expect(outcome.kind).toBe('DROPPED');

    const integrity = await deriveObservationIntegrity(intents, new InMemoryExecutionJournal());
    expect(integrity.kind).toBe('KNOWN_LOSS');
    if (integrity.kind !== 'KNOWN_LOSS') return;

    expect(integrity.losses).toHaveLength(1);
    const [loss] = integrity.losses;
    expect(loss?.kind).toBe('CONFIRMED_DROP');
    expect(loss?.reason, 'the loss did not carry the reason the recorder actually gave').toContain('ENOSPC');
  });

  it('carries enough provenance to inspect WHAT was lost, not merely that something was', async () => {
    const journal = new AlwaysDroppingJournal();
    const intents = new InMemoryObservationIntentStore();
    const recorder = withObservationIntegrity(journal, intents);

    await recorder.record(
      eventWith({
        journalEventId: 'case-9:DISPATCH_ATTEMPTED:EXECUTED:op-1',
        incidentId: 'case-9',
        correlationId: 'inc-case-9',
        type: 'DISPATCH_ATTEMPTED',
        outcome: 'EXECUTED',
        recordedAt: '2026-08-26T11:22:33.000Z',
      }),
    );

    const integrity = await deriveObservationIntegrity(intents, new InMemoryExecutionJournal());
    if (integrity.kind !== 'KNOWN_LOSS') throw new Error(`expected KNOWN_LOSS, got ${integrity.kind}`);
    const [loss] = integrity.losses;

    expect(loss?.journalEventId).toBe('case-9:DISPATCH_ATTEMPTED:EXECUTED:op-1');
    expect(loss?.incidentId).toBe('case-9');
    expect(loss?.correlationId).toBe('inc-case-9');
    expect(loss?.type).toBe('DISPATCH_ATTEMPTED');
    expect(loss?.outcome).toBe('EXECUTED');
    expect(loss?.intendedAt).toBe('2026-08-26T11:22:33.000Z');
  });

  it('reports a journal that THREW as a loss too — an exception is not a successful write', async () => {
    const intents = new InMemoryObservationIntentStore();
    const recorder = withObservationIntegrity(new ThrowingJournal(), intents);

    const outcome = await recorder.record(EVENT);
    expect(outcome.kind, 'a throwing journal was reported as anything but DROPPED').toBe('DROPPED');

    const integrity = await deriveObservationIntegrity(intents, new InMemoryExecutionJournal());
    expect(integrity.kind).toBe('KNOWN_LOSS');
  });
});

describe('observation integrity — process death is the failure mode it must survive', () => {
  it('reports an intent the process never resolved as UNRESOLVED_INTENT, distinct from a reported drop', async () => {
    const dir = tempDir('obs-intent-crash-');
    const intents = new FileObservationIntentStore(dir);

    // Exactly what a crash between the write-ahead marker and the journal write leaves behind:
    // the marker is open and no outcome was ever reported for it.
    await intents.open({
      schemaVersion: OBSERVATION_INTENT_SCHEMA_VERSION,
      journalEventId: EVENT.journalEventId,
      incidentId: EVENT.incidentId,
      correlationId: EVENT.correlationId,
      systemId: EVENT.systemId,
      type: EVENT.type,
      outcome: EVENT.outcome,
      intendedAt: EVENT.recordedAt,
    });

    // A GENUINELY separate store instance, as a restarted process would construct.
    const recovered = new FileObservationIntentStore(dir);
    const integrity = await deriveObservationIntegrity(recovered, new InMemoryExecutionJournal());

    expect(integrity.kind, 'process-local accounting did not survive reconstruction').toBe('KNOWN_LOSS');
    if (integrity.kind !== 'KNOWN_LOSS') return;
    expect(integrity.losses[0]?.kind).toBe('UNRESOLVED_INTENT');
    expect(integrity.losses[0]?.journalEventId).toBe(EVENT.journalEventId);
  });

  it('does NOT report a loss when the record actually published and only the cleanup was lost', async () => {
    const dir = tempDir('obs-intent-orphan-');
    const intents = new FileObservationIntentStore(dir);
    const journal = new InMemoryExecutionJournal();

    // The record genuinely reached the journal...
    await journal.record(EVENT);
    // ...and the marker was left behind by a crash in the window after publication.
    await intents.open({
      schemaVersion: OBSERVATION_INTENT_SCHEMA_VERSION,
      journalEventId: EVENT.journalEventId,
      incidentId: EVENT.incidentId,
      correlationId: EVENT.correlationId,
      systemId: EVENT.systemId,
      type: EVENT.type,
      outcome: EVENT.outcome,
      intendedAt: EVENT.recordedAt,
    });

    const integrity = await deriveObservationIntegrity(new FileObservationIntentStore(dir), journal);
    expect(integrity.kind, 'an orphaned marker was reported as data loss that did not happen').toBe('NO_KNOWN_LOSS');
    if (integrity.kind !== 'NO_KNOWN_LOSS') return;
    expect(integrity.intentsReconciled, 'the reconciliation was not counted').toBe(1);
  });

  it('reconciles against the journal by identity, so a DIFFERENT record does not excuse the missing one', async () => {
    const dir = tempDir('obs-intent-identity-');
    const intents = new FileObservationIntentStore(dir);
    const journal = new InMemoryExecutionJournal();

    await journal.record(eventWith({ journalEventId: 'some-other-event' }));
    await intents.open({
      schemaVersion: OBSERVATION_INTENT_SCHEMA_VERSION,
      journalEventId: EVENT.journalEventId,
      incidentId: EVENT.incidentId,
      correlationId: EVENT.correlationId,
      systemId: EVENT.systemId,
      type: EVENT.type,
      outcome: EVENT.outcome,
      intendedAt: EVENT.recordedAt,
    });

    const integrity = await deriveObservationIntegrity(new FileObservationIntentStore(dir), journal);
    expect(integrity.kind, 'an unrelated record was accepted as evidence the intended one survived').toBe('KNOWN_LOSS');
  });

  it('survives reconstruction for a reported drop as well, not only for an unresolved intent', async () => {
    const dir = tempDir('obs-intent-drop-durable-');
    const recorder = withObservationIntegrity(new AlwaysDroppingJournal(), new FileObservationIntentStore(dir));
    await recorder.record(EVENT);

    const integrity = await deriveObservationIntegrity(new FileObservationIntentStore(dir), new InMemoryExecutionJournal());
    expect(integrity.kind).toBe('KNOWN_LOSS');
    if (integrity.kind !== 'KNOWN_LOSS') return;
    expect(integrity.losses[0]?.kind).toBe('CONFIRMED_DROP');
    expect(integrity.losses[0]?.reason).toContain('ENOSPC');
  });
});

describe('observation integrity — absence of evidence is never evidence of absence', () => {
  it('reports UNAVAILABLE, never NO_KNOWN_LOSS, when the intent ledger itself cannot be read', async () => {
    const integrity = await deriveObservationIntegrity(new BrokenIntentStore(), new InMemoryExecutionJournal());
    expect(integrity.kind, 'a broken accounting mechanism reported a clean bill of health').toBe('UNAVAILABLE');
    if (integrity.kind !== 'UNAVAILABLE') return;
    expect(integrity.reason.length).toBeGreaterThan(0);
  });

  it('reports UNAVAILABLE when the JOURNAL cannot be read, because reconciliation is then impossible', async () => {
    const dir = tempDir('obs-journal-unreadable-');
    const journalDir = path.join(dir, 'journal');
    mkdirSync(path.join(journalDir, 'case-1'), { recursive: true });
    writeFileSync(path.join(journalDir, 'case-1', 'corrupt.json'), '{not json', 'utf8');

    const intents = new InMemoryObservationIntentStore();
    await intents.open({
      schemaVersion: OBSERVATION_INTENT_SCHEMA_VERSION,
      journalEventId: EVENT.journalEventId,
      incidentId: EVENT.incidentId,
      correlationId: EVENT.correlationId,
      systemId: EVENT.systemId,
      type: EVENT.type,
      outcome: EVENT.outcome,
      intendedAt: EVENT.recordedAt,
    });

    const integrity = await deriveObservationIntegrity(intents, new FileExecutionJournal(journalDir));
    expect(integrity.kind, 'an unreadable journal was reconciled against as though it were readable').toBe('UNAVAILABLE');
  });

  it('never states a completeness percentage or a total-observations denominator it does not have', async () => {
    const journal = new InMemoryExecutionJournal();
    const intents = new InMemoryObservationIntentStore();
    const recorder = withObservationIntegrity(journal, intents);
    await recorder.record(EVENT);

    const integrity = await deriveObservationIntegrity(intents, journal);
    const serialised = JSON.stringify(integrity);

    expect(serialised).not.toMatch(/completeness|percent|Pct|coverageRate/i);
    // The status word itself must not read as a guarantee.
    expect(Object.keys(integrity)).not.toContain('complete');
    expect(integrity.kind).toBe('NO_KNOWN_LOSS');
  });

  it('states the bound of its own claim — what a "no known loss" answer cannot rule out', async () => {
    const integrity = await deriveObservationIntegrity(new InMemoryObservationIntentStore(), new InMemoryExecutionJournal());
    expect(integrity.basis.length, 'the integrity report made a claim with no stated bound').toBeGreaterThan(40);
    expect(
      integrity.basis.toLowerCase(),
      'the bound does not say that an unrecorded intent is itself invisible',
    ).toContain('cannot');
  });
});

describe('observation integrity — business execution is never coupled to it', () => {
  it('returns the delegate’s own outcome unchanged, whatever the intent store does', async () => {
    const journal = new InMemoryExecutionJournal();
    const plain = await journal.record(eventWith({ journalEventId: 'plain-1' }));

    const wrapped = withObservationIntegrity(new InMemoryExecutionJournal(), new BrokenIntentStore());
    const decorated = await wrapped.record(eventWith({ journalEventId: 'plain-1' }));

    expect(decorated, 'a broken intent store changed what the recorder reported').toEqual(plain);
  });

  it('never throws, even when both the journal and the intent store throw', async () => {
    const recorder = withObservationIntegrity(new ThrowingJournal(), new BrokenIntentStore());
    await expect(recorder.record(EVENT)).resolves.toEqual(
      expect.objectContaining({ kind: 'DROPPED' }),
    );
  });

  it('is write-only at the type level: the recorder it returns exposes no way to read history', () => {
    const recorder = withObservationIntegrity(new InMemoryExecutionJournal(), new InMemoryObservationIntentStore());
    expect(Object.keys(recorder)).toEqual(['record']);
  });

  it('no engine or port module can reach the integrity read side', () => {
    const READER_SYMBOLS = [
      'deriveObservationIntegrity',
      'FileObservationIntentStore',
      'InMemoryObservationIntentStore',
      'observation-integrity',
      'observation-intent-store',
    ];
    const roots = [path.join(process.cwd(), 'lib', 'engine'), path.join(process.cwd(), 'lib', 'ports')];
    const offenders: string[] = [];

    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
          continue;
        }
        if (!entry.name.endsWith('.ts')) continue;
        const source = readFileSync(full, 'utf8');
        for (const symbol of READER_SYMBOLS) {
          if (source.includes(symbol)) offenders.push(`${path.relative(process.cwd(), full)} references ${symbol}`);
        }
      }
    };
    for (const root of roots) walk(root);

    expect(offenders, 'decision code can reach observation-integrity accounting').toEqual([]);
  });
});

describe('observation integrity — the file-backed ledger behaves like a ledger', () => {
  it('is idempotent per journalEventId: opening the same intent twice leaves one marker', async () => {
    const dir = tempDir('obs-intent-idem-');
    const intents = new FileObservationIntentStore(dir);
    const intent = {
      schemaVersion: OBSERVATION_INTENT_SCHEMA_VERSION,
      journalEventId: EVENT.journalEventId,
      incidentId: EVENT.incidentId,
      correlationId: EVENT.correlationId,
      systemId: EVENT.systemId,
      type: EVENT.type,
      outcome: EVENT.outcome,
      intendedAt: EVENT.recordedAt,
    } as const;

    await intents.open(intent);
    await intents.open(intent);

    expect(await intents.list()).toHaveLength(1);
  });

  it('fails closed on a corrupt marker rather than silently reporting fewer losses', async () => {
    const dir = tempDir('obs-intent-corrupt-');
    const intents = new FileObservationIntentStore(dir);
    await intents.open({
      schemaVersion: OBSERVATION_INTENT_SCHEMA_VERSION,
      journalEventId: EVENT.journalEventId,
      incidentId: EVENT.incidentId,
      correlationId: EVENT.correlationId,
      systemId: EVENT.systemId,
      type: EVENT.type,
      outcome: EVENT.outcome,
      intendedAt: EVENT.recordedAt,
    });
    const [name] = readdirSync(dir);
    writeFileSync(path.join(dir, name as string), 'not json at all', 'utf8');

    await expect(new FileObservationIntentStore(dir).list()).rejects.toThrow(/malformed/i);

    // And the read model turns that into UNAVAILABLE — never a shorter, cleaner-looking answer.
    const integrity: ObservationIntegrity = await deriveObservationIntegrity(
      new FileObservationIntentStore(dir),
      new InMemoryExecutionJournal(),
    );
    expect(integrity.kind).toBe('UNAVAILABLE');
  });

  it('returns losses in a deterministic order, so two readers never disagree', async () => {
    const dir = tempDir('obs-intent-order-');
    const intents = new FileObservationIntentStore(dir);
    for (const id of ['c:3', 'a:1', 'b:2']) {
      await intents.open({
        schemaVersion: OBSERVATION_INTENT_SCHEMA_VERSION,
        journalEventId: id,
        incidentId: id.split(':')[0] as string,
        correlationId: `inc-${id}`,
        systemId: 'lead-rescue',
        type: 'INGRESS_RECEIVED',
        outcome: 'ACCEPTED',
        intendedAt: '2026-08-26T10:00:00.000Z',
      });
    }

    const first = await deriveObservationIntegrity(new FileObservationIntentStore(dir), new InMemoryExecutionJournal());
    const second = await deriveObservationIntegrity(new FileObservationIntentStore(dir), new InMemoryExecutionJournal());
    expect(JSON.stringify(first)).toEqual(JSON.stringify(second));
    if (first.kind !== 'KNOWN_LOSS') throw new Error('expected KNOWN_LOSS');
    expect(first.losses.map((l) => l.journalEventId)).toEqual(['a:1', 'b:2', 'c:3']);
  });
});
