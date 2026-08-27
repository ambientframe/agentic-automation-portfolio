import { readFileSync, readdirSync, statSync } from 'node:fs';
import { builtinModules } from 'node:module';
import { extname, join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * EVERY MODULE THIS REPOSITORY IMPORTS MUST BE ONE IT DECLARES.
 *
 * Written after a production deployment failed on `TS2307: Cannot find module 'playwright'`.
 * `scripts/capture-walkthrough.ts` imported Playwright, which had been installed with
 * `npm install --no-save` so it would not tax a stranger's `npm install`. The package sat in
 * local `node_modules` and in no manifest, so `npm run build` passed on the machine that wrote
 * it and failed on the first machine that had not — which is the definition of a build that
 * proves nothing.
 *
 * `next build` type-checks the whole repository, so this is not a scripts-only concern: one
 * undeclared import anywhere fails the deployment, and it fails it AFTER the local gates have
 * gone green. That is the worst place to find out.
 *
 * The rule is deliberately about DECLARED intent, not about what happens to be installed.
 * A dynamic import behind a runtime guard is exempt because its specifier is a variable —
 * TypeScript cannot resolve it, so it cannot break a build — and `capture-walkthrough.ts`
 * loads Playwright exactly that way now, degrading with an instruction when it is absent.
 */

const REPO = process.cwd();
const SCANNED = ['app', 'components', 'data', 'lib', 'scripts', 'tests'];
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.mts', '.cts']);

function sourceFiles(dir: string): string[] {
  const found: string[] = [];
  const absolute = join(REPO, dir);
  const walk = (current: string) => {
    for (const entry of readdirSync(current)) {
      if (entry === 'node_modules' || entry.startsWith('.')) continue;
      const full = join(current, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (SOURCE_EXTENSIONS.has(extname(entry))) found.push(full);
    }
  };
  walk(absolute);
  return found;
}

/** `next/link` -> `next`; `@anthropic-ai/sdk/foo` -> `@anthropic-ai/sdk`. */
function packageName(specifier: string): string {
  const parts = specifier.split('/');
  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : (parts[0] ?? specifier);
}

function declaredPackages(): Set<string> {
  const manifest = JSON.parse(readFileSync(join(REPO, 'package.json'), 'utf8')) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  return new Set([
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.devDependencies ?? {}),
  ]);
}

const BUILTINS = new Set([...builtinModules, ...builtinModules.map((m) => `node:${m}`)]);

/**
 * Comments are stripped before scanning, and the patterns require real import syntax rather
 * than a bare `from '…'`. Both matter: this repository's comments quote bad patterns as
 * examples (including in this very file), and its prose says things like
 * `different from "the interval was zero"`. A scanner that reads those as imports reports
 * twelve offenders and zero defects, which is worse than no scanner.
 */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/** Static `import … from '…'`, side-effect imports, dynamic `import('…')`, and `require('…')`. */
function importedSpecifiers(source: string): string[] {
  const code = stripComments(source);
  const found: string[] = [];
  const patterns = [
    /^\s*(?:import|export)\b[^;'"]*?\bfrom\s*['"]([^'"]+)['"]/gm,
    /^\s*import\s+['"]([^'"]+)['"]/gm,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  for (const pattern of patterns) {
    for (const match of code.matchAll(pattern)) {
      const specifier = match[1];
      if (specifier !== undefined) found.push(specifier);
    }
  }
  return found;
}

describe('every imported module is a declared one', () => {
  const declared = declaredPackages();
  const files = SCANNED.flatMap(sourceFiles);

  it('scans a non-trivial number of source files, so a broken walk cannot pass silently', () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it.each(SCANNED)('finds source files under %s', (dir) => {
    expect(sourceFiles(dir).length).toBeGreaterThan(0);
  });

  it('imports nothing that package.json does not declare', () => {
    const offenders: string[] = [];

    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      for (const specifier of importedSpecifiers(source)) {
        // Relative paths and the `@/` alias resolve inside this repository.
        if (specifier.startsWith('.') || specifier.startsWith('@/') || specifier.startsWith('/')) continue;
        if (BUILTINS.has(specifier) || BUILTINS.has(packageName(specifier))) continue;
        if (declared.has(packageName(specifier))) continue;
        offenders.push(`${relative(REPO, file)} imports "${specifier}"`);
      }
    }

    expect(
      offenders,
      'These modules are imported but not declared in package.json. A build passes only on a ' +
        'machine that happens to have them installed. Declare the dependency, or load it ' +
        'through a variable specifier behind a runtime guard.',
    ).toEqual([]);
  });

  /**
   * The specific regression. `capture-walkthrough.ts` is allowed to use Playwright and is NOT
   * allowed to make the repository need it — so the exemption it relies on is pinned here
   * rather than left as a convention somebody re-breaks.
   */
  it('keeps Playwright out of the manifest and out of any resolvable import', () => {
    expect(declared.has('playwright')).toBe(false);
    const script = readFileSync(join(REPO, 'scripts/capture-walkthrough.ts'), 'utf8');
    expect(script).toContain('playwright');

    const code = stripComments(script);
    expect(
      importedSpecifiers(script),
      'capture-walkthrough.ts must load Playwright through a variable specifier, so TypeScript ' +
        'never resolves it and the deployment build cannot fail on it.',
    ).not.toContain('playwright');
    expect(code).not.toMatch(/import\s+type\s+[^;]*from\s*['"]playwright['"]/);
    expect(code).not.toMatch(/typeof\s+import\(\s*['"]playwright['"]\s*\)/);
  });
});
