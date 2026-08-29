/**
 * THE ONE PLACE THIS ARTIFACT'S SOURCE IS NAMED.
 *
 * `COMMERCIAL_THESIS.md` §9 states the whole claim in one sentence: "the work is open, its
 * limits are published, and you can check it yourself." Until this module existed, the site
 * made that impossible — the repository URL appeared in no file in this repository, so a
 * stranger who arrived at the deployed URL, which is the only surface most of them will ever
 * see, had no path to the source, the walkthrough, or the published limits. The README pointed
 * at the site; nothing pointed back.
 *
 * The second half is the part that is easy to get wrong. Linking `main` implies that the tip of
 * `main` is what produced the page being read. That is a claim, and when the host did not say
 * which commit it built, it is a claim the artifact cannot support — so it states that instead.
 * A `main` link with no such sentence is how absence of evidence quietly reads as evidence of
 * absence, one layer below anything a reader would think to check.
 *
 * Same discipline as `lib/config/data-root.ts`: the resolution is PURE — no `process.env` read,
 * no filesystem touch — so it is unit-testable without mutating the environment, and it reports
 * WHERE the answer came from so a surface can state its grade rather than flatten it. A commit
 * that is present but malformed fails closed at composition time, because the alternative is a
 * published link that resolves to nothing on the one surface whose entire purpose is "go and
 * check".
 *
 * The strongest alternative, rejected: deriving the repository from `VERCEL_GIT_REPO_OWNER` /
 * `VERCEL_GIT_REPO_SLUG`. It reports whatever was deployed rather than what this project
 * publishes, and it is absent on exactly the deploy path currently in use. The declared
 * constant is checked against this checkout's own remote in `tests/source-provenance.test.ts`,
 * which makes it falsifiable rather than asserted.
 */

export type Env = Readonly<Record<string, string | undefined>>;

/** Public, unauthenticated, and verified reachable by a stranger (2026-08-28). */
export const REPOSITORY_URL = 'https://github.com/ambientframe/agentic-automation-portfolio';

/** Where a link points when the build cannot name its own commit. */
export const DEFAULT_BRANCH = 'main';

export const COMMIT_ENV_VARS = {
  /** Set by the platform, derived from the commit it actually deployed. */
  host: 'VERCEL_GIT_COMMIT_SHA',
  /**
   * Set by an operator deploying a tree that carries no git metadata. Lower grade on purpose:
   * a value a human typed and a value the platform observed are different kinds of evidence,
   * and `CLAUDE.md` keeps provenance and verification as separate dimensions.
   */
  declared: 'PORTFOLIO_SOURCE_COMMIT',
} as const;

const SHA = /^[0-9a-f]{7,40}$/i;

export type CommitOrigin = 'HOST_GIT_METADATA' | 'DECLARED';

export type SourceCommit =
  | { readonly kind: 'RECORDED'; readonly origin: CommitOrigin; readonly sha: string; readonly short: string }
  | { readonly kind: 'UNRECORDED' };

export interface SourceProvenance {
  readonly repositoryUrl: string;
  /** The git ref every source link is pinned to — a commit when there is one, else the branch. */
  readonly ref: string;
  readonly commit: SourceCommit;
}

function readCommit(env: Env, variable: string, origin: CommitOrigin): SourceCommit | undefined {
  const raw = env[variable];
  if (raw === undefined || raw.trim() === '') return undefined;
  const value = raw.trim();
  if (!SHA.test(value)) {
    throw new Error(
      `${variable} must be a git commit id of 7 to 40 hexadecimal characters, got "${value}" — a link ` +
        'pinned to it would resolve to nothing while reading as though this build knows its own source.',
    );
  }
  const sha = value.toLowerCase();
  return { kind: 'RECORDED', origin, sha, short: sha.slice(0, 7) };
}

export function resolveSourceProvenance(env: Env): SourceProvenance {
  const commit =
    readCommit(env, COMMIT_ENV_VARS.host, 'HOST_GIT_METADATA') ??
    readCommit(env, COMMIT_ENV_VARS.declared, 'DECLARED') ??
    ({ kind: 'UNRECORDED' } as const);

  return {
    repositoryUrl: REPOSITORY_URL,
    ref: commit.kind === 'RECORDED' ? commit.sha : DEFAULT_BRANCH,
    commit,
  };
}

/** A repository-relative path, or `''` for the repository itself. */
export function sourceUrl(provenance: SourceProvenance, path: string): string {
  if (path === '') return provenance.repositoryUrl;
  return `${provenance.repositoryUrl}/blob/${provenance.ref}/${path}`;
}

export interface SourceReference {
  readonly label: string;
  /** What is in it, so the link is a reason rather than a dare. */
  readonly says: string;
  /** Repository-relative, or `''` for the repository itself. Existence is a test. */
  readonly path: string;
  readonly href: string;
}

/**
 * Ordered by what a stranger wants next, not by what this project is proudest of: the source
 * itself, then the version for someone who will not clone, then the two documents that state
 * the limits, then the commands that reproduce the build.
 */
const REFERENCES: readonly Omit<SourceReference, 'href'>[] = [
  {
    label: 'The repository',
    says: 'Every file behind this site, including the suite that has to pass before any of it changes.',
    path: '',
  },
  {
    label: 'The 90-second walkthrough',
    says: 'One enquiry from arrival to a labelled ledger, in captured frames — for reading rather than clicking.',
    path: 'docs/WALKTHROUGH.md',
  },
  {
    label: 'What is real, simulated, or unverified',
    says: 'Every capability graded, including the live evaluation that missed its declared floor and was kept.',
    path: 'docs/STATUS.md',
  },
  {
    label: 'What these systems cannot express',
    says: 'Limits found by independent authors working from a packet alone, published open rather than quietly closed.',
    path: 'docs/MODEL_GAPS.md',
  },
  {
    label: 'Run it cold',
    says: 'Four commands that reproduce this build, the test suite, and the canon documents on your own machine.',
    path: 'README.md',
  },
];

export interface SourceHandover {
  readonly provenance: SourceProvenance;
  readonly references: readonly SourceReference[];
  /** Names the commit this build came from, or says plainly that it was never recorded. */
  readonly commitStatement: string;
  readonly doesNotProve: string;
}

function commitStatement(provenance: SourceProvenance): string {
  const commit = provenance.commit;
  if (commit.kind === 'UNRECORDED') {
    return (
      `This build does not record which commit it came from, so the links above point at ` +
      `${DEFAULT_BRANCH}, which may have moved since. The deploy that produced this page carried no ` +
      'git metadata.'
    );
  }
  return commit.origin === 'HOST_GIT_METADATA'
    ? `Built from commit ${commit.short}, recorded by the host that deployed it. Every link above points at that commit.`
    : `Built from commit ${commit.short} — declared at build time, not observed by the host, because this deploy carried no git metadata. Every link above points at that commit.`;
}

export function deriveSourceHandover(env: Env): SourceHandover {
  const provenance = resolveSourceProvenance(env);
  return {
    provenance,
    references: REFERENCES.map((reference) => ({ ...reference, href: sourceUrl(provenance, reference.path) })),
    commitStatement: commitStatement(provenance),
    doesNotProve:
      'A commit id records which source was built. It does not prove the bundle served to you was built from ' +
      'it — that would need a reproducible build, which this project does not have.',
  };
}
