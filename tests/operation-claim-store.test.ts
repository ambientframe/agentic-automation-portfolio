import { describe, expect, it, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  FileOperationClaimStore,
  InMemoryOperationClaimStore,
  MalformedOperationClaimError,
} from '@/lib/persistence/operation-claim-store';

const tempDirs: string[] = [];
function tempClaimDir(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'operation-claim-store-test-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir !== undefined) rmSync(dir, { recursive: true, force: true });
  }
});

describe.each([
  ['InMemoryOperationClaimStore', () => new InMemoryOperationClaimStore()],
  ['FileOperationClaimStore', () => new FileOperationClaimStore(tempClaimDir())],
])('%s', (_name, makeStore) => {
  it('load() returns undefined for an operation that was never claimed', async () => {
    const store = makeStore();
    expect(await store.load('op-never-claimed')).toBeUndefined();
  });

  it('claim() on an unclaimed operation succeeds and durably records CLAIMED', async () => {
    const store = makeStore();
    const attempt = await store.claim('op-1', 'runtime-a', '2026-08-12T00:00:00Z');
    expect(attempt.decision).toBe('CLAIMED');

    const loaded = await store.load('op-1');
    expect(loaded?.status).toBe('CLAIMED');
    expect(loaded?.claimedBy).toBe('runtime-a');
    expect(loaded?.claimedAt).toBe('2026-08-12T00:00:00Z');
  });

  it('a second claim() on the same operation before confirm() is UNCERTAIN, not CLAIMED', async () => {
    const store = makeStore();
    await store.claim('op-1', 'runtime-a', '2026-08-12T00:00:00Z');

    const second = await store.claim('op-1', 'runtime-b', '2026-08-12T00:00:01Z');
    expect(second.decision).toBe('UNCERTAIN');
    expect(second.decision === 'UNCERTAIN' && second.record.claimedBy).toBe('runtime-a');
  });

  it('confirm() moves a CLAIMED operation to CONFIRMED, and every later claim() sees ALREADY_CONFIRMED', async () => {
    const store = makeStore();
    await store.claim('op-1', 'runtime-a', '2026-08-12T00:00:00Z');
    await store.confirm('op-1', '2026-08-12T00:00:01Z');

    const loaded = await store.load('op-1');
    expect(loaded?.status).toBe('CONFIRMED');
    expect(loaded?.confirmedAt).toBe('2026-08-12T00:00:01Z');

    const later = await store.claim('op-1', 'runtime-b', '2026-08-13T00:00:00Z');
    expect(later.decision).toBe('ALREADY_CONFIRMED');
  });

  it('confirm() on an operation that was never claimed throws rather than fabricating a record', async () => {
    const store = makeStore();
    await expect(store.confirm('op-never-claimed', '2026-08-12T00:00:00Z')).rejects.toThrow();
  });

  it('distinct operation ids never interact', async () => {
    const store = makeStore();
    await store.claim('op-a', 'runtime-a', '2026-08-12T00:00:00Z');
    await store.confirm('op-a', '2026-08-12T00:00:01Z');

    const attempt = await store.claim('op-b', 'runtime-b', '2026-08-12T00:00:02Z');
    expect(attempt.decision).toBe('CLAIMED');
  });
});

describe('FileOperationClaimStore durability and cross-process exclusivity', () => {
  it('a fresh store instance pointed at the same directory sees a confirmed claim from a discarded instance', async () => {
    const dir = tempClaimDir();
    const first = new FileOperationClaimStore(dir);
    await first.claim('op-1', 'runtime-a', '2026-08-12T00:00:00Z');
    await first.confirm('op-1', '2026-08-12T00:00:01Z');

    // `first` is deliberately never referenced again — only the file on disk carries the
    // confirmation forward, exactly what a real process restart would leave behind.
    const second = new FileOperationClaimStore(dir);
    const attempt = await second.claim('op-1', 'runtime-b', '2026-08-13T00:00:00Z');
    expect(attempt.decision).toBe('ALREADY_CONFIRMED');
  });

  it('two independently constructed store instances racing to claim the same operationId: exactly one wins CLAIMED', async () => {
    const dir = tempClaimDir();
    const storeA = new FileOperationClaimStore(dir);
    const storeB = new FileOperationClaimStore(dir);

    const [a, b] = await Promise.all([
      storeA.claim('op-race', 'runtime-a', '2026-08-12T00:00:00Z'),
      storeB.claim('op-race', 'runtime-b', '2026-08-12T00:00:00Z'),
    ]);

    const decisions = [a.decision, b.decision].sort();
    // fs.open(path, 'wx') is atomic at the kernel level: no interleaving of these two
    // independent store instances' claim() calls can produce two CLAIMED winners.
    expect(decisions).toEqual(['CLAIMED', 'UNCERTAIN'].sort());
  });

  it('load() throws MalformedOperationClaimError for a hand-corrupted record rather than a silent wrong answer', async () => {
    const dir = tempClaimDir();
    writeFileSync(path.join(dir, `${encodeURIComponent('op-corrupt')}.json`), JSON.stringify({ status: 'not-a-real-status' }), 'utf8');

    const store = new FileOperationClaimStore(dir);
    await expect(store.load('op-corrupt')).rejects.toBeInstanceOf(MalformedOperationClaimError);
  });

  it('claim() on a corrupted record also fails closed, rather than silently overwriting or silently proceeding', async () => {
    const dir = tempClaimDir();
    writeFileSync(path.join(dir, `${encodeURIComponent('op-corrupt')}.json`), JSON.stringify({ status: 'not-a-real-status' }), 'utf8');

    const store = new FileOperationClaimStore(dir);
    await expect(store.claim('op-corrupt', 'runtime-a', '2026-08-12T00:00:00Z')).rejects.toBeInstanceOf(
      MalformedOperationClaimError,
    );
  });

  it('a missing claims directory behaves as an empty store, not an error', async () => {
    const parent = mkdtempSync(path.join(tmpdir(), 'operation-claim-store-test-'));
    tempDirs.push(parent);
    const store = new FileOperationClaimStore(path.join(parent, 'does-not-exist-yet'));

    expect(await store.load('anything')).toBeUndefined();
  });

  it('operationId is used verbatim (URI-encoded) as the on-disk filename, so an operator can inspect claims without decoding a hash', async () => {
    const dir = tempClaimDir();
    mkdirSync(dir, { recursive: true });
    const store = new FileOperationClaimStore(dir);
    await store.claim('notify:lead-inspect:wait-elapsed@rev1', 'runtime-a', '2026-08-12T00:00:00Z');

    const fs = await import('node:fs/promises');
    const files = await fs.readdir(dir);
    expect(files).toContain(`${encodeURIComponent('notify:lead-inspect:wait-elapsed@rev1')}.json`);
  });
});
