import { createHash } from 'node:crypto';
import {
  cp,
  mkdir,
  readFile,
  readdir,
  stat,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';

export const O1_BUNDLE_RELATIVE_PATH = path.join('docs', 'evidence', 'o1');

const RUNTIME_SOURCES = [
  {
    label: 'execution journal',
    source: 'lead-rescue-execution-journal',
    destination: 'execution-journal',
    required: true,
  },
  {
    label: 'wait incident store',
    source: 'lead-rescue-wait-incidents.json',
    destination: 'wait-incidents.json',
    required: true,
  },
  {
    label: 'operation claims',
    source: 'lead-rescue-operation-claims',
    destination: 'operation-claims',
    required: false,
  },
  {
    label: 'observation intents',
    source: 'lead-rescue-observation-intents',
    destination: 'observation-intents',
    required: false,
  },
] as const;

export interface PrepareO1BundleOptions {
  readonly bundleRoot: string;
  readonly preparedAt: string;
}

export interface SnapshotO1RuntimeOptions {
  readonly bundleRoot: string;
  readonly dataRoot: string;
  readonly capturedAt: string;
}

export interface O1RuntimeSnapshot {
  readonly schemaVersion: 1;
  readonly capturedAt: string;
  readonly dataRoot: string;
  readonly copiedFiles: readonly {
    readonly path: string;
    readonly sha256: string;
  }[];
  readonly missingOptionalSources: readonly string[];
}

function assertIso(value: string, label: string): void {
  if (Number.isNaN(Date.parse(value))) {
    throw new Error(`${label} must be an ISO timestamp, got "${value}"`);
  }
}

async function exists(target: string): Promise<boolean> {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
}

async function filesBelow(root: string, relative = ''): Promise<readonly string[]> {
  const directory = path.join(root, relative);
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const next = path.join(relative, entry.name);
      return entry.isDirectory() ? filesBelow(root, next) : [next];
    }),
  );
  return nested.flat().sort();
}

async function sha256(target: string): Promise<string> {
  return createHash('sha256').update(await readFile(target)).digest('hex');
}

export async function prepareO1EvidenceBundle(
  options: PrepareO1BundleOptions,
): Promise<void> {
  assertIso(options.preparedAt, 'preparedAt');
  if (await exists(options.bundleRoot)) {
    throw new Error(`O1 evidence bundle already exists at ${options.bundleRoot}; refusing to overwrite it.`);
  }

  await mkdir(path.join(options.bundleRoot, 'screenshots'), { recursive: true });
  await mkdir(path.join(options.bundleRoot, 'records'), { recursive: true });
  await writeFile(
    path.join(options.bundleRoot, 'NOTES.md'),
    [
      '# O1/O2 session notes',
      '',
      'Status: **AWAITING_EVIDENCE**',
      '',
      `Prepared: ${options.preparedAt}`,
      '',
      'Append only while the session is running. Use one timestamped line per observation:',
      '',
      '`YYYY-MM-DDTHH:mm:ss.sssZ [OPERATING] <what happened and the immediate reaction>`',
      '',
      '`YYYY-MM-DDTHH:mm:ss.sssZ [CONTROL] <declaration, action, result, or reaction>`',
      '',
      'Do not replace confusion, repetition, or a quiet run with a cleaner retrospective.',
      '',
    ].join('\n'),
  );
  await writeFile(
    path.join(options.bundleRoot, 'MANIFEST.md'),
    [
      '# O1/O2 evidence manifest',
      '',
      'Status: **AWAITING_EVIDENCE**',
      '',
      'This file is replaced from captured files by `npm run evidence:o1 -- snapshot`.',
      'No session artifact exists merely because this structure was prepared.',
      '',
    ].join('\n'),
  );
}

export async function snapshotO1RuntimeEvidence(
  options: SnapshotO1RuntimeOptions,
): Promise<O1RuntimeSnapshot> {
  assertIso(options.capturedAt, 'capturedAt');
  const recordsRoot = path.join(options.bundleRoot, 'records');
  if (!(await exists(path.join(options.bundleRoot, 'NOTES.md'))) || !(await exists(recordsRoot))) {
    throw new Error('Prepare the O1 evidence bundle before snapshotting runtime evidence.');
  }
  if ((await filesBelow(recordsRoot)).length > 0) {
    throw new Error('The O1 records directory already contains a snapshot; refusing to overwrite first-take evidence.');
  }

  const availability = await Promise.all(
    RUNTIME_SOURCES.map(async (source) => ({
      ...source,
      present: await exists(path.join(options.dataRoot, source.source)),
    })),
  );
  const missingRequired = availability.filter((source) => source.required && !source.present);
  if (missingRequired.length > 0) {
    throw new Error(
      `Cannot capture O1 runtime evidence: missing ${missingRequired.map((source) => source.label).join(' and ')}.`,
    );
  }

  for (const source of availability.filter((candidate) => candidate.present)) {
    await cp(
      path.join(options.dataRoot, source.source),
      path.join(recordsRoot, source.destination),
      { recursive: true, errorOnExist: true },
    );
  }

  const copiedPaths = await filesBelow(recordsRoot);
  const copiedFiles = await Promise.all(
    copiedPaths.map(async (relative) => ({
      path: path.join('records', relative),
      sha256: await sha256(path.join(recordsRoot, relative)),
    })),
  );
  const snapshot: O1RuntimeSnapshot = {
    schemaVersion: 1,
    capturedAt: options.capturedAt,
    dataRoot: options.dataRoot,
    copiedFiles,
    missingOptionalSources: availability
      .filter((source) => !source.required && !source.present)
      .map((source) => source.label),
  };
  await writeFile(
    path.join(recordsRoot, 'runtime-snapshot.json'),
    `${JSON.stringify(snapshot, null, 2)}\n`,
  );

  const screenshots = await filesBelow(path.join(options.bundleRoot, 'screenshots'));
  const recordFiles = await filesBelow(recordsRoot);
  const rows = [
    '| Artifact | Session | What it evidences |',
    '|---|---|---|',
    '| `NOTES.md` | OPERATING + CONTROL | Contemporaneous notes, preserved in session order. |',
    ...screenshots.map((relative) => {
      const session = relative.startsWith('a-')
        ? 'OPERATING'
        : relative.startsWith('b-')
          ? 'CONTROL'
          : 'UNCLASSIFIED';
      return `| \`screenshots/${relative}\` | ${session} | Screenshot captured in numbered session order. |`;
    }),
    ...recordFiles.map(
      (relative) =>
        `| \`records/${relative}\` | OPERATING + CONTROL | Raw runtime state retained after the two sessions. |`,
    ),
  ];
  await writeFile(
    path.join(options.bundleRoot, 'MANIFEST.md'),
    [
      '# O1/O2 evidence manifest',
      '',
      `Runtime snapshot captured: ${options.capturedAt}`,
      '',
      ...rows,
      '',
    ].join('\n'),
  );
  return snapshot;
}

export async function verifyO1EvidenceBundle(
  bundleRoot: string,
): Promise<{ readonly ok: boolean; readonly issues: readonly string[] }> {
  const issues: string[] = [];
  const notes = await readFile(path.join(bundleRoot, 'NOTES.md'), 'utf8').catch(() => '');
  const manifest = await readFile(path.join(bundleRoot, 'MANIFEST.md'), 'utf8').catch(() => '');

  if (!/^\d{4}-\d{2}-\d{2}T\S+Z \[OPERATING\] .+/m.test(notes)) {
    issues.push('NOTES.md has no timestamped OPERATING entry.');
  }
  if (!/^\d{4}-\d{2}-\d{2}T\S+Z \[CONTROL\] .+/m.test(notes)) {
    issues.push('NOTES.md has no timestamped CONTROL entry.');
  }

  const screenshots = await filesBelow(path.join(bundleRoot, 'screenshots')).catch(() => []);
  if (!screenshots.some((name) => name.startsWith('a-'))) {
    issues.push('No a-* OPERATING screenshot is present.');
  }
  if (!screenshots.some((name) => name.startsWith('b-'))) {
    issues.push('No b-* CONTROL screenshot is present.');
  }

  const snapshotPath = path.join(bundleRoot, 'records', 'runtime-snapshot.json');
  const snapshot = await readFile(snapshotPath, 'utf8')
    .then((value) => JSON.parse(value) as O1RuntimeSnapshot)
    .catch(() => null);
  if (snapshot === null || snapshot.copiedFiles.length === 0) {
    issues.push('No readable runtime snapshot with copied records is present.');
  }

  const artifacts = await filesBelow(bundleRoot).catch(() => []);
  for (const artifact of artifacts.filter((name) => name !== 'MANIFEST.md')) {
    if (!manifest.includes(`\`${artifact}\``)) {
      issues.push(`MANIFEST.md does not cite ${artifact}.`);
    }
  }
  if (manifest.includes('AWAITING_EVIDENCE')) {
    issues.push('MANIFEST.md still reports AWAITING_EVIDENCE after snapshot.');
  }

  return { ok: issues.length === 0, issues };
}
