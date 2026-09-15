import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  prepareO1EvidenceBundle,
  snapshotO1RuntimeEvidence,
  verifyO1EvidenceBundle,
} from '@/lib/evidence/o1-capture';

const roots: string[] = [];

async function temporaryRoots(): Promise<{ root: string; bundleRoot: string; dataRoot: string }> {
  const root = await mkdtemp(path.join(tmpdir(), 'o1-capture-'));
  roots.push(root);
  return {
    root,
    bundleRoot: path.join(root, 'docs', 'evidence', 'o1'),
    dataRoot: path.join(root, '.data'),
  };
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('O1 evidence capture apparatus', () => {
  it('prepares structure only, with explicit awaiting-evidence state and no invented session', async () => {
    const { bundleRoot } = await temporaryRoots();

    await prepareO1EvidenceBundle({
      bundleRoot,
      preparedAt: '2026-09-15T22:00:00.000Z',
    });

    const notes = await readFile(path.join(bundleRoot, 'NOTES.md'), 'utf8');
    const manifest = await readFile(path.join(bundleRoot, 'MANIFEST.md'), 'utf8');
    expect(notes).toContain('AWAITING_EVIDENCE');
    expect(notes).toContain('[OPERATING]');
    expect(notes).toContain('[CONTROL]');
    expect(notes).not.toMatch(/\d{4}-\d{2}-\d{2}T.* \[(OPERATING|CONTROL)\] (?!<)/);
    expect(manifest).toContain('AWAITING_EVIDENCE');
  });

  it('fails closed rather than snapshotting an empty or partial runtime', async () => {
    const { bundleRoot, dataRoot } = await temporaryRoots();
    await prepareO1EvidenceBundle({ bundleRoot, preparedAt: '2026-09-15T22:00:00.000Z' });
    await mkdir(dataRoot, { recursive: true });

    await expect(
      snapshotO1RuntimeEvidence({
        bundleRoot,
        dataRoot,
        capturedAt: '2026-09-15T23:00:00.000Z',
      }),
    ).rejects.toThrow(/execution journal|wait incident/i);
  });

  it('dry-runs prepare → capture → manifest → verify with citable artifacts end to end', async () => {
    const { bundleRoot, dataRoot } = await temporaryRoots();
    await prepareO1EvidenceBundle({ bundleRoot, preparedAt: '2026-09-15T22:00:00.000Z' });

    await writeFile(
      path.join(bundleRoot, 'NOTES.md'),
      [
        '# O1/O2 session notes',
        '',
        '2026-09-15T22:10:00.000Z [OPERATING] Dry-run operating note.',
        '2026-09-15T22:20:00.000Z [CONTROL] Dry-run control declaration.',
        '',
      ].join('\n'),
    );
    await writeFile(path.join(bundleRoot, 'screenshots', 'a-001-operating.png'), 'dry-run-a');
    await writeFile(path.join(bundleRoot, 'screenshots', 'b-001-control.png'), 'dry-run-b');

    await mkdir(path.join(dataRoot, 'lead-rescue-execution-journal'), { recursive: true });
    await writeFile(
      path.join(dataRoot, 'lead-rescue-execution-journal', 'dry-run.json'),
      JSON.stringify({ type: 'DRY_RUN_ONLY' }),
    );
    await writeFile(
      path.join(dataRoot, 'lead-rescue-wait-incidents.json'),
      JSON.stringify({ records: [{ incidentId: 'dry-run' }] }),
    );

    const snapshot = await snapshotO1RuntimeEvidence({
      bundleRoot,
      dataRoot,
      capturedAt: '2026-09-15T23:00:00.000Z',
    });
    const verification = await verifyO1EvidenceBundle(bundleRoot);

    expect(snapshot.copiedFiles.length).toBeGreaterThanOrEqual(2);
    expect(verification).toEqual({ ok: true, issues: [] });
    const manifest = await readFile(path.join(bundleRoot, 'MANIFEST.md'), 'utf8');
    expect(manifest).toContain('screenshots/a-001-operating.png');
    expect(manifest).toContain('screenshots/b-001-control.png');
    expect(manifest).toContain('records/runtime-snapshot.json');
    expect(manifest).toContain('OPERATING + CONTROL');
  });

  it('never overwrites an existing evidence bundle or runtime snapshot', async () => {
    const { bundleRoot, dataRoot } = await temporaryRoots();
    await prepareO1EvidenceBundle({ bundleRoot, preparedAt: '2026-09-15T22:00:00.000Z' });
    await expect(
      prepareO1EvidenceBundle({ bundleRoot, preparedAt: '2026-09-15T22:01:00.000Z' }),
    ).rejects.toThrow(/already exists/i);

    await mkdir(path.join(dataRoot, 'lead-rescue-execution-journal'), { recursive: true });
    await writeFile(path.join(dataRoot, 'lead-rescue-execution-journal', 'one.json'), '{}');
    await writeFile(path.join(dataRoot, 'lead-rescue-wait-incidents.json'), '{}');
    await snapshotO1RuntimeEvidence({
      bundleRoot,
      dataRoot,
      capturedAt: '2026-09-15T23:00:00.000Z',
    });
    await expect(
      snapshotO1RuntimeEvidence({
        bundleRoot,
        dataRoot,
        capturedAt: '2026-09-15T23:01:00.000Z',
      }),
    ).rejects.toThrow(/already contains/i);
  });
});
