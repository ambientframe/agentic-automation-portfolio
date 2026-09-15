import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

type QueueEvidence = {
  readonly packages: Readonly<Record<string, { readonly result: string }>>;
  readonly verification: readonly {
    readonly command: string;
    readonly result: string;
    readonly detail: string;
  }[];
  readonly cd1: Readonly<Record<string, string>>;
  readonly doesNotProve: readonly string[];
};

const evidence = JSON.parse(
  readFileSync(
    path.join(process.cwd(), 'docs', 'evidence', 'commercial-queue-verification.json'),
    'utf8',
  ),
) as QueueEvidence;

function issues(record: QueueEvidence): readonly string[] {
  const found: string[] = [];
  for (const name of ['CP2', 'D1', 'P2']) {
    if (record.packages[name]?.result !== 'PASS') found.push(name);
  }
  if (record.verification.length < 4) found.push('verification coverage');
  if (record.verification.some((entry) => entry.result !== 'PASS' && entry.result !== 'CAUGHT')) {
    found.push('verification result');
  }
  if (Object.values(record.cd1).some((value) => value !== 'UNSET')) found.push('CD1 drift');
  if (record.doesNotProve.length === 0) found.push('doesNotProve');
  return found;
}

describe('retained CP2/D1/P2 verification evidence', () => {
  it('records completed packages and keeps every CD1 field unset', () => {
    expect(issues(evidence)).toEqual([]);
  });

  it('fails if a package is promoted or a CD1 value appears silently', () => {
    const corrupted: QueueEvidence = {
      ...evidence,
      packages: { ...evidence.packages, CP2: { result: 'UNVERIFIED' } },
      cd1: { ...evidence.cd1, contactEmail: 'DECLARED' },
    };
    expect(issues(corrupted)).toContain('CP2');
    expect(issues(corrupted)).toContain('CD1 drift');
  });
});
