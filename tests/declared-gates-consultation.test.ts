import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { ALL_PROFILES } from '@/data/profiles';

const REPO = process.cwd();
const PROFILE_MODEL = readFileSync(path.join(REPO, 'lib', 'model', 'profile.ts'), 'utf8');
const HANDLER_SOURCES = readdirSync(path.join(REPO, 'lib', 'engine', 'handlers'))
  .filter((name) => name.endsWith('.ts'))
  .map((name) => ({
    name,
    source: readFileSync(path.join(REPO, 'lib', 'engine', 'handlers', name), 'utf8'),
  }));

function escaped(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

describe('P2 — every declared external gate is consulted by a handler', () => {
  it('resolves each gatesAction to a named constant used in a closedGatesFor call', () => {
    const actions = [
      ...new Set(
        ALL_PROFILES.flatMap((profile) =>
          (profile.externalGates ?? []).map((gate) => gate.gatesAction),
        ),
      ),
    ];
    expect(actions.length).toBeGreaterThan(0);

    for (const action of actions) {
      const declaration = new RegExp(
        `export const (GATED_ACTION_[A-Z0-9_]+)\\s*=\\s*['"]${escaped(action)}['"]`,
      ).exec(PROFILE_MODEL);
      expect(declaration, `${action}: no named gate-action constant`).not.toBeNull();
      const constantName = declaration?.[1] as string;

      const consultedBy = HANDLER_SOURCES.filter(({ source }) =>
        new RegExp(`closedGatesFor\\([\\s\\S]{0,240}?${constantName}`).test(source),
      ).map(({ name }) => name);

      expect(
        consultedBy,
        `${action}: declared by a profile but consulted by no engine handler`,
      ).not.toEqual([]);
    }
  });
});
