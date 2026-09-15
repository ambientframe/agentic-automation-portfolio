import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { OperatorsLogSkeleton } from '@/components/commercial/operators-log-stub';
import { resolveSourceProvenance } from '@/lib/config/source-provenance';

function visible(markup: string): string {
  return markup.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
}

describe('CP2 operator-log skeleton', () => {
  const markup = renderToStaticMarkup(
    createElement(OperatorsLogSkeleton, { provenance: resolveSourceProvenance({}) }),
  );
  const text = visible(markup);

  it('renders all seven pre-registered sections in order', () => {
    const headings = [
      'Why I ran this',
      'What I ran',
      'The operating session',
      'The control challenge',
      'What surprised me',
      'What this run does not prove',
      'If this were your firm',
    ];
    let cursor = -1;
    for (const heading of headings) {
      const next = text.indexOf(heading);
      expect(next, `missing ${heading}`).toBeGreaterThan(cursor);
      cursor = next;
    }
  });

  it('marks every evidence-dependent section as awaiting evidence', () => {
    expect((text.match(/Awaiting evidence/g) ?? []).length).toBeGreaterThanOrEqual(6);
    expect(text).toMatch(/has not happened yet/i);
    expect(text).not.toMatch(/\bI clicked\b/i);
    expect(text).not.toMatch(/\bthe system surprised me\b/i);
  });

  it('keeps OPERATING and CONTROL visibly distinct', () => {
    expect(text).toContain('OPERATING');
    expect(text).toContain('CONTROL');
    expect(markup).toContain('data-evidence-kind="OPERATING"');
    expect(markup).toContain('data-evidence-kind="CONTROL"');
  });
});
