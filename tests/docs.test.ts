import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DOCUMENTS, render } from '@/scripts/generate-docs';
import { ALL_SYSTEMS } from '@/data/systems';

/**
 * The canon documents are a RENDERING of the typed model, not a second copy of it.
 * This test is what makes that true: if a definition changes and the docs are not
 * regenerated, the build fails instead of the canon quietly going stale.
 */
describe('canonical documents', () => {
  const docsDir = join(process.cwd(), 'docs');

  describe.each(Object.keys(DOCUMENTS))('%s', (name) => {
    it('is committed and up to date with the model', () => {
      const onDisk = readFileSync(join(docsDir, name), 'utf8');
      expect(
        onDisk,
        `docs/${name} is stale. Run \`npm run docs\` and commit the result.`,
      ).toBe(render(name));
    });

    it('declares itself generated so nobody hand-edits it', () => {
      expect(render(name)).toContain('Generated from the typed model');
    });
  });

  it('documents every system in the canon', () => {
    const canon = render('NORTH_STAR_CANON.md');
    for (const system of ALL_SYSTEMS) {
      expect(canon).toContain(system.name);
      expect(canon).toContain(system.businessProblem);
      expect(canon).toContain(system.buyerOutcome);
    }
  });

  it('carries every failure mode into the register', () => {
    const register = render('FAILURE_MODE_REGISTER.md');
    for (const system of ALL_SYSTEMS) {
      for (const mode of system.failureModes) {
        expect(register).toContain(mode.failure);
        expect(register).toContain(mode.detection);
      }
    }
  });

  it('records the misattribution correction in the ledger rather than repeating the myth', () => {
    const ledger = render('RESEARCH_LEDGER.md');
    expect(ledger).toContain('NOT from the 2011 Harvard Business Review');
    expect(ledger).toContain('Corrections this research pass produced');
  });

  it('never presents an unread source as verified in the ledger', () => {
    const ledger = render('RESEARCH_LEDGER.md');
    expect(ledger).toContain('never — not yet located and read');
  });
});
