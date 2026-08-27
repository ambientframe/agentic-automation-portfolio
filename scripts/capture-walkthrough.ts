/**
 * CAPTURE THE WALKTHROUGH FRAMES.
 *
 * The frames in `docs/walkthrough/` exist so the portfolio survives two readers it cannot
 * otherwise reach: one whose link is dead, and one who will not click. That only works if the
 * frames are re-cuttable rather than re-imagined, so they are captured by this script against
 * a real running build — never cropped by hand, never touched up, never assembled from a
 * design tool.
 *
 * Deliberately NOT a dependency of the app. Playwright is heavy and this repository's own
 * README promises a stranger that `npm install` is cheap, so it is installed on demand:
 *
 *   npm install --no-save playwright && npx playwright install chromium
 *   npm run build && npx next start -p 3100
 *   npx tsx scripts/capture-walkthrough.ts
 *
 * Point it somewhere else with WALKTHROUGH_BASE_URL. Frames are written at a fixed viewport
 * and a fixed device scale so two captures of an unchanged page differ only where the page
 * differs — a frame that moves is telling you something.
 *
 * WHAT THIS SCRIPT MAY NOT DO: compose, annotate, or retouch. A frame is what the page
 * rendered. If a frame is unconvincing, the fix is in the page.
 */

import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const BASE_URL = process.env.WALKTHROUGH_BASE_URL ?? 'http://localhost:3100';
const OUT_DIR = join(process.cwd(), 'docs/walkthrough');

/** 1440×900 at 2× — a laptop, at the density a buyer's screen actually has. */
const VIEWPORT = { width: 1440, height: 900 } as const;
const SCALE = 2;

interface Frame {
  readonly file: string;
  /** Route to capture from, relative to the base URL. */
  readonly route: string;
  /** Heading the frame opens on. It is scrolled just under the top of the viewport. */
  readonly anchor?: string;
  /** Extra scroll past the anchor, for beats whose substance sits below their heading. */
  readonly offset?: number;
  /** Capture the top of the page instead of anchoring to a heading. */
  readonly top?: true;
}

/**
 * Every frame is a VIEWPORT, not a section. Sections on this page run to ten thousand pixels
 * and a frame that tall is a document, not a beat — nobody reads it and no reviewer can tell
 * what changed between two of them. A viewport is also the honest unit: it is what a visitor
 * has actually got in front of them at that second of the walkthrough.
 *
 * Two of these frames exist for truthfulness rather than for the pitch, and neither is
 * optional. The first is the page top, because the standing "nothing here is connected to a
 * live system" banner is the first thing a visitor sees and would otherwise be the one thing
 * a screenshot tour quietly cropped out. The last is the `Customer deployment` row, which the
 * ledger itself tells you to read first — a tour that ends on ten REAL badges and omits the
 * row bounding all of them would be a lie assembled entirely from true frames.
 */
const FRAMES: readonly Frame[] = [
  { file: '01-banner.png', route: '/lead-rescue', top: true },
  { file: '02-claim.png', route: '/lead-rescue', anchor: 'Every enquiry ends somewhere you can point at.' },
  { file: '03-incidents.png', route: '/lead-rescue', anchor: 'What happened to one specific lead' },
  { file: '04-step.png', route: '/lead-rescue', anchor: 'Inspect any single moment', offset: 300 },
  { file: '05-boundary.png', route: '/lead-rescue', anchor: 'Where a model is allowed to have an opinion' },
  { file: '06-operator.png', route: '/lead-rescue', anchor: 'What the person on the other side actually does' },
  { file: '07-ledger.png', route: '/lead-rescue', anchor: 'Which parts of this are real' },
  { file: '08-unverified.png', route: '/lead-rescue', anchor: 'Customer deployment', offset: -560 },
];

/**
 * THE SLICE OF PLAYWRIGHT THIS SCRIPT USES, DECLARED LOCALLY.
 *
 * Playwright is deliberately not a dependency of this project, so any type-level reference to
 * it — `import type`, `typeof import('playwright')`, even inside a `try` — fails to compile on
 * every machine that does not happen to have it installed. `next build` type-checks this whole
 * repository, so that includes CI and the deployment build.
 *
 * This was not theoretical: the first version of this script used
 * `typeof import('playwright').chromium`, passed `npm run build` locally because the package
 * was sitting in node_modules from an unsaved install, and failed the production deployment
 * with TS2307. Green on one laptop, red everywhere else — the exact defect shape this
 * repository keeps paying for.
 *
 * Declaring the surface here keeps the script fully type-checked against what it actually
 * calls, on a machine that has the package and on one that never will. The specifier below is
 * a variable for the same reason: a literal would make TypeScript resolve the module.
 */
interface CaptureLocator {
  first(): CaptureLocator;
  waitFor(options?: { state?: 'attached' | 'detached' | 'visible' | 'hidden'; timeout?: number }): Promise<void>;
  evaluate<R>(fn: (element: Element) => R): Promise<R>;
}

interface CapturePage {
  goto(url: string, options?: { waitUntil?: 'load' | 'domcontentloaded' | 'networkidle' }): Promise<unknown>;
  getByText(text: string): CaptureLocator;
  getByRole(role: string, options?: { name?: string; exact?: boolean }): CaptureLocator;
  evaluate<A, R>(fn: (arg: A) => R, arg: A): Promise<R>;
  waitForTimeout(ms: number): Promise<void>;
  screenshot(options: { path: string; fullPage?: boolean }): Promise<unknown>;
}

interface CaptureBrowser {
  newContext(options: {
    viewport: { width: number; height: number };
    deviceScaleFactor: number;
    colorScheme: 'light' | 'dark';
    reducedMotion: 'reduce' | 'no-preference';
  }): Promise<{ newPage(): Promise<CapturePage> }>;
  close(): Promise<void>;
}

interface CaptureChromium {
  launch(): Promise<CaptureBrowser>;
}

const PLAYWRIGHT_SPECIFIER = 'playwright';

async function main(): Promise<void> {
  let chromium: CaptureChromium;
  try {
    const loaded = (await import(PLAYWRIGHT_SPECIFIER)) as { chromium: CaptureChromium };
    chromium = loaded.chromium;
  } catch {
    console.error(
      'playwright is not installed. This script is deliberately not a dependency of the app.\n' +
        '  npm install --no-save playwright && npx playwright install chromium',
    );
    process.exitCode = 1;
    return;
  }

  const probe = await fetch(`${BASE_URL}/lead-rescue`).catch(() => null);
  if (probe === null || !probe.ok) {
    console.error(
      `No build is serving ${BASE_URL}/lead-rescue.\n` + '  npm run build && npx next start -p 3100',
    );
    process.exitCode = 1;
    return;
  }

  rmSync(OUT_DIR, { recursive: true, force: true });
  mkdirSync(OUT_DIR, { recursive: true });

  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: SCALE,
    // Pin the scheme. A frame that flips theme between captures is noise, not information.
    colorScheme: 'dark',
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();

  for (const frame of FRAMES) {
    await page.goto(`${BASE_URL}${frame.route}`, { waitUntil: 'networkidle' });

    // Layer C is a client component that calls live routes; it renders "Loading…" first.
    // Capturing that would be a frame of a spinner presented as a product.
    await page
      .getByText('Loading…')
      .first()
      .waitFor({ state: 'detached', timeout: 15_000 })
      .catch(() => undefined);

    let y = 0;
    if (frame.top !== true) {
      const heading = page.getByRole('heading', { name: frame.anchor, exact: false }).first();
      await heading.waitFor({ timeout: 15_000 });
      // Put the heading a little under the top edge rather than flush against it, so the frame
      // reads as a page someone is looking at and not as a crop that starts mid-sentence.
      const anchorTop = await heading.evaluate((element) => element.getBoundingClientRect().top + window.scrollY);
      y = Math.max(0, anchorTop - 48 + (frame.offset ?? 0));
    }

    await page.evaluate((top) => window.scrollTo({ top, behavior: 'instant' as ScrollBehavior }), y);
    await page.waitForTimeout(250);
    await page.screenshot({ path: join(OUT_DIR, frame.file) });

    console.log(`captured ${frame.file}  ← ${frame.route} · ${frame.anchor ?? 'page top'}`);
  }

  await browser.close();
  console.log(`\n${FRAMES.length} frames written to docs/walkthrough/`);
}

void main();
