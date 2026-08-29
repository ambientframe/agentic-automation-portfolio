import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * "THE SUITE IS GREEN" IS THE ONE CLAIM ON THIS ARTIFACT THAT ONLY ITS AUTHOR COULD CHECK.
 *
 * Every other claim here was built to be verified by a stranger: the canon documents are
 * generated from the typed model, the runtime artifacts fail against a corrupted copy, the
 * walkthrough's figures are recomputed from `data/`. But the gate those all sit behind —
 * `npm run verify` passing — was evidenced by nothing except a line in `CHECKPOINT.md` written
 * by the person who ran it. `COMMERCIAL_THESIS.md` §7 ranks converting an asserted claim into a
 * checkable one as the highest-value work available, and this was the last assertion of that
 * kind on the surface.
 *
 * A workflow file is prose with no compiler, which in this repository is the part that rots —
 * so three things are pinned here, and they fail for three different reasons:
 *
 *   1. IT RUNS THE REAL GATES. A workflow that runs a narrower command than the one the README
 *      tells a reader to run is a green badge for a check nobody made.
 *   2. IT OPENS NO SPEND OR BLAST-RADIUS GATE. `CLAUDE.md` names three environment variables
 *      that bill money or send real mail. A push-triggered workflow that set one would do it on
 *      every commit, unattended, which is the worst place in this repository for that mistake.
 *   3. THE BADGE AND THE WORKFLOW CANNOT DRIFT APART. A badge pointing at a workflow file that
 *      no longer exists renders as a broken image, and a badge pointing at a *different*
 *      workflow renders green for the wrong reason.
 */

const REPO = process.cwd();
const WORKFLOW_FILE = '.github/workflows/verify.yml';
const WORKFLOW_PATH = join(REPO, WORKFLOW_FILE);
const README_PATH = join(REPO, 'README.md');

/** Every gate `CLAUDE.md` forbids setting without the owner's explicit, in-session go-ahead. */
const SPEND_GATES = [
  'LEAD_RESCUE_DECISION_PROVIDER',
  'RUN_LIVE_AI_EVAL',
  'LEAD_RESCUE_SIDE_EFFECT_EXECUTOR',
] as const;

function workflow(): string {
  return readFileSync(WORKFLOW_PATH, 'utf8');
}

/**
 * The workflow with its comments removed.
 *
 * The gate assertion below is about what the workflow SETS, not about what it mentions: the
 * file explains in prose why it sets none of them, and naming them there is how the next
 * person editing it learns the rule. Scanning the raw text failed on its own documentation.
 */
function workflowInstructions(): string {
  return workflow()
    .split('\n')
    .map((line) => line.replace(/#.*$/, ''))
    .join('\n');
}

describe('continuous verification', () => {
  it('is committed, because a check that lives on one laptop is not a check a stranger can make', () => {
    expect(existsSync(WORKFLOW_PATH), `${WORKFLOW_FILE} is missing.`).toBe(true);
  });

  it('runs the same gates the README tells a reader to run', () => {
    const source = workflow();
    expect(source).toContain('npm run verify');
    expect(source).toContain('npm run build');
  });

  it('installs from the lockfile, so the run is the repository rather than the registry today', () => {
    expect(workflow()).toContain('npm ci');
  });

  it('runs on a push to main and on pull requests, not on demand only', () => {
    const source = workflow();
    expect(source).toMatch(/\bpush:/);
    expect(source).toMatch(/\bpull_request:/);
    expect(source).toContain('main');
  });

  it('opens no spend or blast-radius gate on a trigger that fires unattended', () => {
    const instructions = workflowInstructions();
    for (const gate of SPEND_GATES) {
      expect(instructions, `${WORKFLOW_FILE} sets ${gate}, which bills or sends on every push.`).not.toContain(gate);
    }
  });

  it('asks for no more repository permission than reading it', () => {
    // A workflow with the default token can write to the repository it runs in. This one only
    // ever reads, and says so, because the blast radius of a compromised action is whatever
    // the token was granted.
    expect(workflow()).toMatch(/permissions:\s*\n\s*contents:\s*read/);
  });

  it('is what the README badge points at, so the two cannot drift apart', () => {
    const readme = readFileSync(README_PATH, 'utf8');
    expect(readme, 'README.md carries no status badge for the verification workflow.').toContain(
      'workflows/verify.yml/badge.svg',
    );
  });

  describe('the gate has to pass in a checkout that has never been built', () => {
    /**
     * THE FIRST CI RUN FAILED, AND IT WAS RIGHT.
     *
     * `LayoutProps` and `PageProps` are globals Next generates into `.next/types`, which is
     * gitignored. `npm run verify` therefore passed on this machine only because an earlier
     * build had left them behind — and failed with five TS2304 errors on a clean checkout,
     * which is precisely what the README tells a stranger to make. The claim "the suite is
     * green" was false for everyone except the person who had already run it (GitHub Actions
     * run 33239467523, the first push after the workflow landed).
     *
     * Fixed by generating the types as part of the gate rather than relying on a directory
     * that may or may not exist. The wrong fix, guarded against below, is committing the
     * generated types: a checked-in generated file goes stale silently, and `.gitignore` is
     * what stops that.
     */
    it('generates the route types before typechecking, rather than assuming a previous build left them', () => {
      const scripts = JSON.parse(readFileSync(join(REPO, 'package.json'), 'utf8')).scripts as Record<string, string>;
      expect(scripts.typecheck, 'npm run typecheck assumes .next/types already exists.').toContain('next typegen');
      expect(scripts.typecheck).toContain('tsc --noEmit');
    });

    it('keeps the generated types out of version control, so they cannot go stale in the tree', () => {
      expect(readFileSync(join(REPO, '.gitignore'), 'utf8')).toMatch(/^\/?\.next/m);
    });

    it('checks out the full history the evidence tests need to resolve a recorded commit', () => {
      // The second CI failure, and also right: a default depth-1 checkout has no history, so
      // `git cat-file` cannot confirm that a retained artifact's `gitHead` is a commit that
      // exists. Tolerating a shallow clone would have meant deleting the assertion that an
      // artifact cannot cite a run that never happened, which is the assertion worth keeping.
      expect(workflowInstructions(), 'The workflow clones shallow; evidence tests need history.').toMatch(
        /fetch-depth:\s*0/,
      );
    });
  });

  it('states that a passing run is not an operational claim', () => {
    // The one way a badge could mislead here: green means the gates passed, and this project
    // draws a hard line between proof maturity and operational maturity. The badge sits beside
    // a sentence that says which of the two it reports.
    const readme = readFileSync(README_PATH, 'utf8');
    expect(readme).toMatch(/badge[\s\S]{0,600}?(not|never)[\s\S]{0,80}?(live|customer|operation)/i);
  });
});
