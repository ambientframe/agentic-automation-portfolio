import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

type ContrastResult = {
  readonly samples: number;
  readonly minimumRatio: number;
  readonly failures: number;
};

type D1Evidence = {
  readonly status: string;
  readonly routes: readonly string[];
  readonly responsive: {
    readonly viewports: readonly number[];
    readonly checks: number;
    readonly http200: number;
    readonly horizontalOverflowFailures: number;
  };
  readonly keyboardAndFocus: {
    readonly targetsChecked: number;
    readonly visibleTargets: number;
    readonly focusVisibleMatches: number;
    readonly solidOutlineTargets: number;
    readonly activation: { readonly result: string };
  };
  readonly contrast: {
    readonly threshold: number;
    readonly light: Readonly<Record<string, ContrastResult>>;
    readonly dark: Readonly<Record<string, ContrastResult>>;
  };
  readonly consoleErrors: number;
  readonly cd1: Readonly<Record<string, string>>;
  readonly doesNotProve: readonly string[];
};

const EVIDENCE_PATH = path.join(
  process.cwd(),
  'docs',
  'evidence',
  'd1',
  'accessibility-pass.json',
);

function issues(record: D1Evidence): readonly string[] {
  const found: string[] = [];
  if (record.status !== 'PASS') found.push('status');
  if (record.responsive.checks !== 9 || record.responsive.http200 !== 9) found.push('route checks');
  if (record.responsive.horizontalOverflowFailures !== 0) found.push('horizontal overflow');
  if (record.keyboardAndFocus.targetsChecked < 24) found.push('keyboard coverage');
  if (
    record.keyboardAndFocus.visibleTargets !== record.keyboardAndFocus.targetsChecked ||
    record.keyboardAndFocus.focusVisibleMatches !== record.keyboardAndFocus.targetsChecked ||
    record.keyboardAndFocus.solidOutlineTargets !== record.keyboardAndFocus.targetsChecked
  ) {
    found.push('focus visibility');
  }
  if (record.keyboardAndFocus.activation.result !== 'PASS') found.push('keyboard activation');
  for (const scheme of [record.contrast.light, record.contrast.dark]) {
    for (const result of Object.values(scheme)) {
      if (
        result.samples === 0 ||
        result.failures !== 0 ||
        result.minimumRatio < record.contrast.threshold
      ) {
        found.push('contrast');
      }
    }
  }
  if (record.consoleErrors !== 0) found.push('console errors');
  if (Object.values(record.cd1).some((status) => status !== 'UNSET')) found.push('CD1 drift');
  if (record.doesNotProve.length === 0) found.push('doesNotProve');
  return found;
}

describe('D1 retained commercial accessibility evidence', () => {
  const evidence = JSON.parse(readFileSync(EVIDENCE_PATH, 'utf8')) as D1Evidence;

  it('records every route at 375, 768, and 1440 pixels', () => {
    expect(evidence.routes).toEqual(['/', '/engagement', '/operator-log']);
    expect(evidence.responsive.viewports).toEqual([375, 768, 1440]);
    expect(issues(evidence)).toEqual([]);
  });

  it('fails against a corrupted overflow or contrast result', () => {
    const corrupted: D1Evidence = {
      ...evidence,
      responsive: { ...evidence.responsive, horizontalOverflowFailures: 1 },
      contrast: {
        ...evidence.contrast,
        light: {
          ...evidence.contrast.light,
          '/': { samples: 332, minimumRatio: 3.2, failures: 1 },
        },
      },
    };
    expect(issues(corrupted)).toContain('horizontal overflow');
    expect(issues(corrupted)).toContain('contrast');
  });
});
