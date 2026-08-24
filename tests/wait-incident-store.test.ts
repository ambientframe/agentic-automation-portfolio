import { describe, expect, it, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  FileWaitIncidentStore,
  InMemoryWaitIncidentStore,
  MalformedWaitRecordError,
  type WaitIncidentRecord,
} from '@/lib/persistence/wait-incident-store';

function sampleRecord(overrides: Partial<Omit<WaitIncidentRecord, 'revision'>> = {}) {
  return {
    incidentId: 'lead-test-001',
    systemId: 'lead-rescue',
    correlationId: 'inc-test-001',
    engineState: {
      lifecycleState: 'WAITING_FOR_REPLY',
      facts: { waitStartedAt: '2026-08-01T10:00:00-04:00' },
      suppressed: false,
      awaitingHuman: null,
      missingInformation: [],
    },
    ...overrides,
  };
}

const tempDirs: string[] = [];
function tempStorePath(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'wait-incident-store-test-'));
  tempDirs.push(dir);
  return path.join(dir, 'wait-incidents.json');
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir !== undefined) rmSync(dir, { recursive: true, force: true });
  }
});

describe.each([
  ['InMemoryWaitIncidentStore', () => new InMemoryWaitIncidentStore()],
  ['FileWaitIncidentStore', () => new FileWaitIncidentStore(tempStorePath())],
])('%s', (_name, makeStore) => {
  it('load() returns undefined for an incident that was never parked', async () => {
    const store = makeStore();
    expect(await store.load('never-parked')).toBeUndefined();
  });

  it('park() then load() returns the same record with revision 1', async () => {
    const store = makeStore();
    const parked = await store.park(sampleRecord());
    expect(parked.revision).toBe(1);

    const loaded = await store.load('lead-test-001');
    expect(loaded).toEqual(parked);
  });

  it('listWaiting() reflects every parked incident', async () => {
    const store = makeStore();
    await store.park(sampleRecord({ incidentId: 'lead-a' }));
    await store.park(sampleRecord({ incidentId: 'lead-b' }));

    const all = await store.listWaiting();
    expect(all.map((r) => r.incidentId).sort()).toEqual(['lead-a', 'lead-b']);
  });

  it('resolve() with the correct revision removes the record and returns RESOLVED', async () => {
    const store = makeStore();
    const parked = await store.park(sampleRecord());

    const outcome = await store.resolve('lead-test-001', parked.revision);
    expect(outcome).toBe('RESOLVED');
    expect(await store.load('lead-test-001')).toBeUndefined();
  });

  it('resolve() on a missing incident returns NOT_FOUND, not an error', async () => {
    const store = makeStore();
    expect(await store.resolve('never-parked', 1)).toBe('NOT_FOUND');
  });

  it('resolve() with a stale revision refuses and leaves the record in place', async () => {
    const store = makeStore();
    const parked = await store.park(sampleRecord());

    const outcome = await store.resolve('lead-test-001', parked.revision + 1);
    expect(outcome).toBe('STALE_REVISION');
    expect(await store.load('lead-test-001')).toEqual(parked);
  });

  it('a second resolve() after the first succeeds returns NOT_FOUND (duplicate resume is a safe no-op)', async () => {
    const store = makeStore();
    const parked = await store.park(sampleRecord());

    expect(await store.resolve('lead-test-001', parked.revision)).toBe('RESOLVED');
    expect(await store.resolve('lead-test-001', parked.revision)).toBe('NOT_FOUND');
  });

  it('re-parking an incident bumps the revision, invalidating a prior caller\'s expected revision', async () => {
    const store = makeStore();
    const first = await store.park(sampleRecord());
    const second = await store.park(sampleRecord());

    expect(second.revision).toBe(first.revision + 1);
    expect(await store.resolve('lead-test-001', first.revision)).toBe('STALE_REVISION');
  });

  it('revision survives a full resolve/delete/re-park cycle: the next wait cycle for the same incidentId never reuses a resolved cycle\'s revision', async () => {
    const store = makeStore();
    const first = await store.park(sampleRecord());
    expect(await store.resolve('lead-test-001', first.revision)).toBe('RESOLVED');
    expect(await store.load('lead-test-001')).toBeUndefined();

    // A genuinely new wait cycle for the SAME incidentId, reusing the exact same
    // waitStartedAt an application could legitimately reuse (e.g. an authored fixture
    // timestamp, or two occurrences a millisecond apart that round to the same second).
    const second = await store.park(sampleRecord());

    expect(second.revision).not.toBe(first.revision);
    expect(second.revision).toBeGreaterThan(first.revision);
  });

  it('the revision high-water mark keeps advancing across repeated resolve/re-park cycles, not just once', async () => {
    const store = makeStore();
    const revisions: number[] = [];
    for (let i = 0; i < 4; i += 1) {
      const parked = await store.park(sampleRecord());
      revisions.push(parked.revision);
      expect(await store.resolve('lead-test-001', parked.revision)).toBe('RESOLVED');
    }
    expect(revisions).toEqual([1, 2, 3, 4]);
    expect(new Set(revisions).size).toBe(4);
  });
});

describe('FileWaitIncidentStore durability across reconstruction', () => {
  it('a fresh store instance pointed at the same file recovers a parked incident', async () => {
    const filePath = tempStorePath();
    const first = new FileWaitIncidentStore(filePath);
    const parked = await first.park(sampleRecord());

    // Simulate a process restart: discard the object entirely and construct a new one
    // that has never seen `first` and holds no in-memory reference to it.
    const second = new FileWaitIncidentStore(filePath);
    const recovered = await second.load('lead-test-001');

    expect(recovered).toEqual(parked);
  });

  it('resolving through a reconstructed instance is visible to a third instance', async () => {
    const filePath = tempStorePath();
    const first = new FileWaitIncidentStore(filePath);
    const parked = await first.park(sampleRecord());

    const second = new FileWaitIncidentStore(filePath);
    expect(await second.resolve('lead-test-001', parked.revision)).toBe('RESOLVED');

    const third = new FileWaitIncidentStore(filePath);
    expect(await third.load('lead-test-001')).toBeUndefined();
  });

  it('the revision high-water mark survives resolve/delete and reconstruction, so a later re-park through a wholly new instance never reuses a resolved revision', async () => {
    const filePath = tempStorePath();
    const first = new FileWaitIncidentStore(filePath);
    const parked = await first.park(sampleRecord());
    expect(await first.resolve('lead-test-001', parked.revision)).toBe('RESOLVED');

    // A THIRD, wholly independent instance re-parks the same incidentId — simulating a
    // different process handling the second wait cycle entirely.
    const third = new FileWaitIncidentStore(filePath);
    const reparked = await third.park(sampleRecord());

    expect(reparked.revision).toBeGreaterThan(parked.revision);
  });

  it('load() throws MalformedWaitRecordError for a hand-corrupted record rather than crashing ambiguously', async () => {
    const filePath = tempStorePath();
    writeFileSync(
      filePath,
      JSON.stringify({
        'lead-corrupt': { incidentId: 'lead-corrupt', systemId: 'lead-rescue' /* missing required fields */ },
      }),
      'utf8',
    );

    const store = new FileWaitIncidentStore(filePath);
    await expect(store.load('lead-corrupt')).rejects.toBeInstanceOf(MalformedWaitRecordError);
  });

  it('a missing store file behaves as an empty store, not an error', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'wait-incident-store-test-'));
    tempDirs.push(dir);
    const store = new FileWaitIncidentStore(path.join(dir, 'does-not-exist-yet.json'));

    expect(await store.load('anything')).toBeUndefined();
    expect(await store.listWaiting()).toEqual([]);
  });
});
