import path from 'node:path';

/**
 * THE ONE PLACE THE RUNTIME STORE ROOT IS DECIDED.
 *
 * Every durable store — wait incidents, operation claims, the execution journal, observation
 * intents — used to compute its own `path.join(process.cwd(), '.data', …)`. Four copies of the
 * same assumption: that the working directory is writable. On the deployed serverless runtime
 * it is not, so every write path the demo page invites a visitor to exercise returned a bare
 * 500 (verified against the live instance, 2026-08-28) while the read paths served whatever
 * state had been bundled into the deployment.
 *
 * The root now resolves here, once. Unconfigured, it is exactly what it always was:
 * `<cwd>/.data`, gitignored runtime state. A host whose working directory is read-only sets
 * `PORTFOLIO_DATA_ROOT` to writable platform storage (for the hosted demo, `/tmp/.data` —
 * which is EPHEMERAL: state survives requests and processes on a warm instance, not platform
 * recycling, and every surface describing hosted persistence must say so).
 *
 * Same discipline as the other `lib/config` resolvers: the resolution is PURE — no
 * `process.env` read, no filesystem touch — so it is unit-testable without mutating the
 * environment, and the selection is exported so a surface can report which mode it is
 * actually in rather than assuming the default. A relative value fails closed at composition
 * time: resolving it against the working directory would silently re-create the exact defect
 * this module exists to end.
 */

export type Env = Readonly<Record<string, string | undefined>>;

export const DATA_ROOT_ENV_VAR = 'PORTFOLIO_DATA_ROOT';

export interface DataRootSelection {
  /** Absolute directory every runtime store resolves its own location under. */
  readonly root: string;
  /** Where the root came from, so a surface can state it rather than guess it. */
  readonly source: 'DEFAULT_WORKING_DIRECTORY' | 'CONFIGURED';
}

export function resolveDataRootSelection(env: Env, workingDirectory: string): DataRootSelection {
  const configured = env[DATA_ROOT_ENV_VAR];
  if (configured === undefined || configured.trim() === '') {
    return { root: path.join(workingDirectory, '.data'), source: 'DEFAULT_WORKING_DIRECTORY' };
  }
  if (!path.isAbsolute(configured)) {
    throw new Error(
      `${DATA_ROOT_ENV_VAR} must be an absolute path, got "${configured}" — a relative root ` +
        'would silently resolve against whatever working directory the process happens to have.',
    );
  }
  return { root: configured, source: 'CONFIGURED' };
}

/** Resolved once at module load, like every other composition-root selection. */
export const DATA_ROOT_SELECTION: DataRootSelection = resolveDataRootSelection(process.env, process.cwd());

export const DATA_ROOT: string = DATA_ROOT_SELECTION.root;
