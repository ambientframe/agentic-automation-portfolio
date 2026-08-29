import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { SourceHandover } from '@/components/source-handover';
import {
  COMMIT_ENV_VARS,
  REPOSITORY_URL,
  deriveSourceHandover,
  resolveSourceProvenance,
  sourceUrl,
} from '@/lib/config/source-provenance';

/**
 * THE ARTIFACT'S CENTRAL CLAIM IS "CHECK IT YOURSELF", AND UNTIL NOW THE SITE HANDED A
 * STRANGER NO WAY TO DO SO.
 *
 * `COMMERCIAL_THESIS.md` §2 substitutes inspectable work for reputation, and §9 states it in
 * one sentence: "the work is open ... and you can check it yourself". A visitor who arrives at
 * the deployed URL — the only surface most of them will ever see — could reach no repository,
 * no walkthrough, and no published-limits document. The README linked the site; nothing linked
 * back. The repository URL appeared nowhere in this codebase at all.
 *
 * The second half is the part that is easy to get wrong. A link to `main` implies that the tip
 * of `main` is what produced the page being read, which is a claim the artifact cannot make
 * unless the host told it which commit it built. When it was not told, it must SAY it was not
 * told — `CLAUDE.md`: absence of evidence never renders as evidence of absence. So the
 * provenance is resolved the way every other composition-root selection here is resolved:
 * purely, from an injected environment, reporting where the answer came from, and failing
 * closed on a value that would produce a link resolving to nothing.
 */

const REPO = process.cwd();

describe('resolveSourceProvenance', () => {
  it('reports the commit as unrecorded, and pins links to main, when the host supplies no git metadata', () => {
    const provenance = resolveSourceProvenance({});
    expect(provenance.commit.kind).toBe('UNRECORDED');
    expect(provenance.ref).toBe('main');
  });

  it('never invents a commit id when none was supplied', () => {
    const provenance = resolveSourceProvenance({});
    expect(JSON.stringify(provenance)).not.toMatch(/[0-9a-f]{7,}/);
  });

  it('records the commit the platform built, and pins every link to it', () => {
    const sha = 'de7d95c260cb961ffba1a32f586634c2dbd8da2e';
    const provenance = resolveSourceProvenance({ [COMMIT_ENV_VARS.host]: sha });
    expect(provenance.commit).toEqual({ kind: 'RECORDED', origin: 'HOST_GIT_METADATA', sha, short: 'de7d95c' });
    expect(provenance.ref).toBe(sha);
  });

  it('accepts a commit declared by the operator, and marks it as declared rather than observed', () => {
    // The deploy path in use while git-linked deployments are blocked exports the tree without
    // git metadata, so the platform has no commit to report. An operator may still state which
    // commit the tree came from — but a value a human typed and a value the platform derived
    // from the deployed commit are different grades of evidence, and the surface says which.
    const sha = '3504338ab2c1d0e9f8a7b6c5d4e3f2a1b0c9d8e7';
    const provenance = resolveSourceProvenance({ [COMMIT_ENV_VARS.declared]: sha });
    expect(provenance.commit).toEqual({ kind: 'RECORDED', origin: 'DECLARED', sha, short: '3504338' });
  });

  it('prefers the platform commit over a declared one, because only the platform observed the deploy', () => {
    const host = 'de7d95c260cb961ffba1a32f586634c2dbd8da2e';
    const declared = '3504338ab2c1d0e9f8a7b6c5d4e3f2a1b0c9d8e7';
    const provenance = resolveSourceProvenance({
      [COMMIT_ENV_VARS.host]: host,
      [COMMIT_ENV_VARS.declared]: declared,
    });
    expect(provenance.commit).toMatchObject({ origin: 'HOST_GIT_METADATA', sha: host });
  });

  it('treats an empty or whitespace-only commit as absent, never as a ref', () => {
    // An empty ref would build `/tree//docs/MODEL_GAPS.md` — a link that resolves to nothing
    // while reading as though the artifact knows its own source.
    for (const value of ['', '   ']) {
      const provenance = resolveSourceProvenance({ [COMMIT_ENV_VARS.host]: value });
      expect(provenance.commit.kind).toBe('UNRECORDED');
      expect(provenance.ref).toBe('main');
    }
  });

  it('refuses a malformed commit rather than publishing a link that resolves to nothing', () => {
    for (const value of ['not-a-sha', 'de7d95', 'de7d95c260cb961ffba1a32f586634c2dbd8da2e0', 'zzzzzzz']) {
      expect(() => resolveSourceProvenance({ [COMMIT_ENV_VARS.host]: value })).toThrow(COMMIT_ENV_VARS.host);
    }
  });

  it('normalises an upper-case commit rather than shipping a ref that differs from the one it names', () => {
    const provenance = resolveSourceProvenance({
      [COMMIT_ENV_VARS.declared]: 'DE7D95C260CB961FFBA1A32F586634C2DBD8DA2E',
    });
    expect(provenance.commit).toMatchObject({ sha: 'de7d95c260cb961ffba1a32f586634c2dbd8da2e', short: 'de7d95c' });
  });
});

describe('sourceUrl', () => {
  const pinned = resolveSourceProvenance({ [COMMIT_ENV_VARS.host]: 'de7d95c260cb961ffba1a32f586634c2dbd8da2e' });
  const unpinned = resolveSourceProvenance({});

  it('addresses the repository itself without a stray path segment', () => {
    expect(sourceUrl(unpinned, '')).toBe(REPOSITORY_URL);
  });

  it('points a document at the exact commit the page was built from, when there is one', () => {
    expect(sourceUrl(pinned, 'docs/MODEL_GAPS.md')).toBe(
      `${REPOSITORY_URL}/blob/de7d95c260cb961ffba1a32f586634c2dbd8da2e/docs/MODEL_GAPS.md`,
    );
  });

  it('falls back to the branch when no commit was recorded', () => {
    expect(sourceUrl(unpinned, 'docs/MODEL_GAPS.md')).toBe(`${REPOSITORY_URL}/blob/main/docs/MODEL_GAPS.md`);
  });

  it('never emits a doubled or trailing slash', () => {
    for (const url of [sourceUrl(pinned, ''), sourceUrl(pinned, 'README.md'), sourceUrl(unpinned, '')]) {
      expect(url.replace('https://', '')).not.toContain('//');
      expect(url.endsWith('/')).toBe(false);
    }
  });
});

describe('the handover a visitor is actually given', () => {
  it('offers the repository itself, not only documents inside it', () => {
    const handover = deriveSourceHandover({});
    expect(handover.references.some((reference) => reference.href === REPOSITORY_URL)).toBe(true);
  });

  it('links only documents that exist in this repository', () => {
    // A dead link on the one surface whose whole purpose is "go and check" is worse than no
    // link: it is a checkable claim that fails when checked. Rename a document and this fails
    // here, today, rather than on a stranger's screen.
    for (const reference of deriveSourceHandover({}).references) {
      if (reference.path === '') continue;
      expect(existsSync(join(REPO, reference.path)), `Source handover links a missing file: ${reference.path}`).toBe(
        true,
      );
    }
  });

  it('says what each document holds, so a link is a reason rather than a dare', () => {
    for (const reference of deriveSourceHandover({}).references) {
      expect(reference.label.trim().length, `A source reference has no label: ${reference.path}`).toBeGreaterThan(0);
      expect(reference.says.trim().length, `A source reference says nothing: ${reference.path}`).toBeGreaterThan(0);
    }
  });

  it('hands over the two documents that state what the systems cannot do', () => {
    const paths = deriveSourceHandover({}).references.map((reference) => reference.path);
    expect(paths).toContain('docs/MODEL_GAPS.md');
    expect(paths).toContain('docs/STATUS.md');
  });

  it('hands over the walkthrough, which is what a visitor who will not clone reads instead', () => {
    expect(deriveSourceHandover({}).references.map((reference) => reference.path)).toContain('docs/WALKTHROUGH.md');
  });

  describe('the commit statement', () => {
    it('names the commit when the platform recorded one', () => {
      const handover = deriveSourceHandover({ [COMMIT_ENV_VARS.host]: 'de7d95c260cb961ffba1a32f586634c2dbd8da2e' });
      expect(handover.commitStatement).toContain('de7d95c');
    });

    it('states plainly that the commit is unrecorded rather than omitting the subject', () => {
      // Omission is how "absence of evidence" quietly becomes "evidence of absence": a page
      // that simply shows a `main` link reads as though `main` is what shipped.
      const handover = deriveSourceHandover({});
      expect(handover.commitStatement).toMatch(/not record|unrecorded/i);
      expect(handover.commitStatement).toMatch(/main/);
    });

    it('marks a declared commit as declared, never as observed', () => {
      const handover = deriveSourceHandover({
        [COMMIT_ENV_VARS.declared]: '3504338ab2c1d0e9f8a7b6c5d4e3f2a1b0c9d8e7',
      });
      expect(handover.commitStatement).toMatch(/declared/i);
      expect(handover.commitStatement).toContain('3504338');
    });
  });

  it('states what a commit id does not prove, because a build id is not an audit of the bundle', () => {
    const handover = deriveSourceHandover({ [COMMIT_ENV_VARS.host]: 'de7d95c260cb961ffba1a32f586634c2dbd8da2e' });
    expect(handover.doesNotProve.trim().length).toBeGreaterThan(0);
    expect(handover.doesNotProve).toMatch(/built|bundle|served/i);
  });
});

describe('the repository URL is declared once', () => {
  /**
   * The defect this repository has already paid for once: four copies of
   * `path.join(process.cwd(), '.data')`, a fact about one machine wearing the costume of a
   * constant, drifting apart in silence. A published URL is the same shape of fact. It is
   * declared in `lib/config/source-provenance.ts` and read from there.
   */
  const CODE_DIRECTORIES = ['app', 'components', 'lib', 'data', 'scripts'];
  const DECLARATION = join('lib', 'config', 'source-provenance.ts');

  function sourceFiles(directory: string): readonly string[] {
    const entries = readdirSync(join(REPO, directory));
    return entries.flatMap((entry) => {
      const relative = join(directory, entry);
      if (statSync(join(REPO, relative)).isDirectory()) return sourceFiles(relative);
      return /\.tsx?$/.test(entry) ? [relative] : [];
    });
  }

  it('appears in no source file but the module that declares it', () => {
    const offenders = CODE_DIRECTORIES.flatMap(sourceFiles).filter(
      (relative) => relative !== DECLARATION && readFileSync(join(REPO, relative), 'utf8').includes('github.com/'),
    );
    expect(offenders, `A repository URL is hard-coded outside ${DECLARATION}: ${offenders.join(', ')}`).toEqual([]);
  });

  it('names the remote this checkout actually pushes to', () => {
    // Checked against repository truth rather than asserted, whenever a remote is discoverable.
    // A checkout without one (an archive export, the deploy path currently in use) skips it
    // rather than failing for a reason that has nothing to do with the claim.
    let origin: string;
    try {
      origin = execFileSync('git', ['remote', 'get-url', 'origin'], { cwd: REPO, encoding: 'utf8' }).trim();
    } catch {
      return;
    }
    const normalise = (url: string) => url.replace(/^git@github\.com:/, 'https://github.com/').replace(/\.git$/, '');
    expect(normalise(origin)).toBe(REPOSITORY_URL);
  });
});

describe('the surface a stranger lands on', () => {
  /**
   * The first version of this asserted that `app/layout.tsx` mentioned `deriveSourceHandover`,
   * and the mutation pass killed it: deleting the element from the colophon left the function
   * definition — and therefore the name — in the file, so the site could lose the entire
   * handover with the suite still green. Rendering the real component closes the larger half.
   *
   * The remaining half cannot be rendered here: `app/layout.tsx` imports `next/font/google`,
   * which needs Next's own transform and throws under vitest. So the element's presence in the
   * colophon is asserted against the source as a USE — `<SourceHandover` — which is precisely
   * the mutation that survived. The end-to-end check that the deployed page carries these links
   * is a probe against the built site, recorded in the checkpoint rather than run here.
   */
  function render(env: Record<string, string | undefined>): string {
    return renderToStaticMarkup(createElement(SourceHandover, { handover: deriveSourceHandover(env) }));
  }

  it('emits a real link to the repository', () => {
    expect(render({})).toContain(`href="${REPOSITORY_URL}"`);
  });

  it('emits every reference it derived, label and reason both', () => {
    const html = render({});
    for (const reference of deriveSourceHandover({}).references) {
      expect(html).toContain(`href="${reference.href}"`);
      expect(html).toContain(reference.label);
    }
  });

  it('carries the commit statement into the markup, not only into the model', () => {
    const html = render({ [COMMIT_ENV_VARS.host]: 'de7d95c260cb961ffba1a32f586634c2dbd8da2e' });
    expect(html).toContain('de7d95c');
    expect(html).toMatch(/does not prove/i);
  });

  it('says the commit is unrecorded on a build that has none, rather than showing bare links', () => {
    expect(render({})).toMatch(/does not record which commit/i);
  });

  it('is rendered by the colophon, which is the part of the chrome every page carries', () => {
    // Not the home page: a visitor arriving from the README lands on `/lead-rescue`, and a
    // visitor from anywhere else lands wherever the link pointed.
    const layout = readFileSync(join(REPO, 'app/layout.tsx'), 'utf8');
    expect(layout, 'app/layout.tsx no longer renders <SourceHandover />.').toContain('<SourceHandover');
    expect(layout).toContain('deriveSourceHandover(process.env)');
  });
});
