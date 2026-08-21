import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * THE SEAM TEST.
 *
 * The portfolio is only retargetable to another vertical if system definitions carry no
 * business vocabulary. That claim is cheap to make and easy to break silently, so it is
 * asserted here by scanning the source.
 *
 * If this fails, the seam has leaked: move the offending vocabulary into the business
 * profile and refer to it generically from the system definition.
 */

const SYSTEMS_DIR = join(process.cwd(), 'data', 'systems');

/** Vocabulary belonging to the Kestrel profile, which must never appear in a system definition. */
const FORBIDDEN = [
  'kestrel',
  'soc 2',
  'soc2',
  'iso 27001',
  'iso27001',
  'trust service',
  'attestation',
  'certification body',
  'halcyon',
  'vantage ledger',
  'northwind',
  'compliance readiness',
  'readiness engagement',
  'vciso',
  'penetration test',
];

function systemFiles(): string[] {
  return readdirSync(SYSTEMS_DIR)
    .filter((f) => f.endsWith('.ts'))
    .map((f) => join(SYSTEMS_DIR, f));
}

describe('profile / system seam', () => {
  it('finds the system definition files', () => {
    const files = systemFiles();
    // Six systems plus the index.
    expect(files.length).toBe(7);
  });

  describe.each(systemFiles().map((f) => [f.split('/').pop() ?? f, f] as const))(
    '%s',
    (name, path) => {
      it('contains no business-specific vocabulary', () => {
        const contents = readFileSync(path, 'utf8').toLowerCase();
        const found = FORBIDDEN.filter((term) => contents.includes(term));

        expect(
          found,
          `${name} leaks profile vocabulary: ${found.join(', ')}. Move it to the business profile and refer to it generically.`,
        ).toEqual([]);
      });

      it('does not import from the profile data directory', () => {
        const contents = readFileSync(path, 'utf8');
        expect(contents).not.toContain('data/profiles');
      });
    },
  );

  it('keeps the engine core free of business vocabulary too', () => {
    const enginePath = join(process.cwd(), 'lib', 'engine', 'reducer.ts');
    const contents = readFileSync(enginePath, 'utf8').toLowerCase();
    const found = FORBIDDEN.filter((term) => contents.includes(term));
    expect(found).toEqual([]);
  });
});
