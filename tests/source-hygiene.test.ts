import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * NO SOURCE FILE MAY CONTAIN A RAW NUL BYTE.
 *
 * This exists because two files did, and nobody noticed for weeks.
 *
 * Both used a NUL as a composite-key delimiter — `` `${a}<NUL>${b}` `` — written as a raw byte
 * rather than as the `\u0000` escape. That is valid TypeScript and behaves identically at
 * runtime, which is exactly why it survived: every test passed, the build was green, and the
 * defect was invisible to the suite.
 *
 * What it broke was the tooling around the code. `grep`, `sed`, and anything else that classifies
 * files by content treat a file containing NUL as BINARY and silently produce no output. During
 * one session that cost several minutes of debugging a "flaky grep" on `lib/model/system.ts`
 * before the real cause surfaced, and it defeated three separate attempts to edit
 * `tests/grounding-capture-evidence.test.ts` — the editor reported no match on a string that was
 * visibly present, because the space it was matching was not a space.
 *
 * A defect the test suite cannot see and the toolchain reacts to by going quiet is worth one
 * cheap standing check. Write `\u0000` when a NUL delimiter is wanted; it is the same character
 * and it is legible.
 */

const ROOTS = ['app', 'components', 'data', 'docs', 'lib', 'n8n', 'scripts', 'tests'] as const;
const EXTENSIONS = ['.ts', '.tsx', '.mts', '.json', '.css', '.md'] as const;

/**
 * The governing documents live at the repository root rather than under a scanned directory, and
 * they are the files an agent reads FIRST. Markdown is included deliberately: prose is where a
 * stray NUL is most likely to be introduced and least likely to be noticed, because nothing
 * compiles it. Both were added after exactly that happened to CHECKPOINT.md and PATTERN_LEDGER.md
 * while this very test was being written.
 */
const ROOT_DOCUMENTS = [
  'AGENTS.md',
  'CHECKPOINT.md',
  'CLAUDE.md',
  'COMMERCIAL_THESIS.md',
  'PATTERN_LEDGER.md',
  'README.md',
] as const;

function sourceFiles(dir: string): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  return entries.flatMap((entry) => {
    if (entry === 'node_modules' || entry.startsWith('.')) return [];
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return EXTENSIONS.some((ext) => path.endsWith(ext)) ? [path] : [];
  });
}

const FILES = [
  ...ROOTS.flatMap((root) => sourceFiles(join(process.cwd(), root))),
  ...ROOT_DOCUMENTS.map((name) => join(process.cwd(), name)).filter((path) => {
    try {
      return statSync(path).isFile();
    } catch {
      return false;
    }
  }),
];

describe('source hygiene', () => {
  it('finds the files it claims to scan', () => {
    expect(FILES.length, 'the scan found nothing, so it asserts nothing').toBeGreaterThan(50);
  });

  it('no source file contains a raw NUL byte', () => {
    const offenders = FILES.filter((path) => readFileSync(path).includes(0)).map((path) =>
      path.replace(`${process.cwd()}/`, ''),
    );

    expect(
      offenders,
      'these files contain a raw NUL byte. Every line-oriented tool will treat them as binary and ' +
        'go silent — grep finds nothing, string edits fail to match text that is visibly there, and ' +
        'the test suite notices none of it. If a NUL delimiter is intended, write `\u0000` ' +
        'instead: it is the same character and it can be read.',
    ).toEqual([]);
  });
});
