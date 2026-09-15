import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO = process.cwd();

describe('CP2 runbook apparatus', () => {
  it('shows the principal roster and each authority ceiling on the operator console', () => {
    const skeleton = readFileSync(
      path.join(REPO, 'components', 'commercial', 'operators-log-stub.tsx'),
      'utf8',
    );
    expect(skeleton).toContain('Principal roster and authority ceilings');
    expect(skeleton).toContain('principal.authorityCeiling');
    expect(skeleton).toContain('OPERATOR_PRINCIPALS');
    expect(skeleton).toContain('KESTREL.roles');
  });

  it('replaces every CP2 marker with exact executable mechanics', () => {
    const runbook = readFileSync(path.join(REPO, 'docs', 'O1_OPERATOR_RUNBOOK.md'), 'utf8');
    expect(runbook).not.toContain('[apparatus: CP2');
    expect(runbook).toContain('npm run evidence:o1 -- prepare');
    expect(runbook).toContain('npm run evidence:o1 -- snapshot');
    expect(runbook).toContain('npm run evidence:o1 -- verify');
    expect(runbook).toContain('Start a case needing human review');
    expect(runbook).toContain('Despatch offer (simulated)');
    expect(runbook).toContain('ATTENTION_BLOCKED is not reachable');
    expect(runbook).toContain('Do not fabricate it');
  });

  it('exposes the capture command without adding a provider or external write', () => {
    const packageJson = JSON.parse(
      readFileSync(path.join(REPO, 'package.json'), 'utf8'),
    ) as { scripts?: Record<string, string> };
    expect(packageJson.scripts?.['evidence:o1']).toBe('tsx scripts/o1-evidence-capture.ts');
  });
});
