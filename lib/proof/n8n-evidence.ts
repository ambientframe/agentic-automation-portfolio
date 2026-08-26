import { readFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * THE RUNTIME-EVIDENCE ADAPTER — deliberately the only file in this build that knows the
 * shape of an n8n evidence capture.
 *
 * The orchestration-proof artefact under `n8n/evidence/` is owned elsewhere and is still
 * being worked on. The proof experience must be able to *report* that evidence without
 * being coupled to its schema, so this module is the single quarantine point for that
 * coupling: it reads the file, extracts only the handful of fields a reader needs, and
 * degrades to a labelled negative result for anything it does not recognise.
 *
 * THREE RULES, and the reason for each:
 *
 *   1. It never throws. A missing, unreadable, renamed, or restructured file must render
 *      as UNVERIFIED, never as a 500. Absence of proof is a legitimate answer here and the
 *      UI is required to be able to say it.
 *   2. It never invents. Every field is either present in the file or `null`. There is no
 *      default execution id, no assumed status, no placeholder timestamp — a fabricated
 *      execution record would be a far worse defect than an empty panel.
 *   3. It reports its own recognition. `unrecognisedShape` is true when the file parsed as
 *      JSON but yielded no usable execution records, which is exactly the signal that the
 *      upstream schema moved and this adapter — not the UI — is what needs updating.
 *
 * Consequence: when the evidence schema changes, this file is the whole blast radius.
 */

export const RUNTIME_EVIDENCE_RELATIVE_PATH = 'n8n/evidence/lead-rescue-runtime-execution.json';

function evidencePath(): string {
  return path.join(process.cwd(), ...RUNTIME_EVIDENCE_RELATIVE_PATH.split('/'));
}

/** One orchestration run, reduced to what a reader can actually check. */
export interface RuntimeExecution {
  readonly label: string;
  readonly workflowPath: string | null;
  readonly executionId: string | null;
  readonly status: string | null;
  /** n8n's own record of what caused the run: `webhook`, `trigger`, `manual`. */
  readonly mode: string | null;
  readonly startedAt: string | null;
  readonly targetRoute: string | null;
  readonly statusCode: number | null;
  /** Whatever the capture recorded about durable state after the run, when it recorded any. */
  readonly durableStateNote: string | null;
}

export type RuntimeEvidence =
  | { readonly kind: 'ABSENT'; readonly detail: string }
  | { readonly kind: 'UNREADABLE'; readonly detail: string }
  | {
      readonly kind: 'PRESENT';
      readonly schemaVersion: string | null;
      readonly capturedAt: string | null;
      readonly runtime: string | null;
      readonly executions: readonly RuntimeExecution[];
      readonly scopeStatement: string | null;
      /** Parsed, but no execution records were recognisable. The adapter is stale. */
      readonly unrecognisedShape: boolean;
    };

// --- Safe readers ----------------------------------------------------------
// Every accessor below answers "is this field actually here, as the type I need?"
// and returns null otherwise. No coercion, no fallback values.

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function str(source: unknown, ...keys: readonly string[]): string | null {
  if (!isRecord(source)) return null;
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string' && value.trim() !== '') return value;
    if (typeof value === 'number') return String(value);
  }
  return null;
}

function num(source: unknown, key: string): number | null {
  if (!isRecord(source)) return null;
  const value = source[key];
  return typeof value === 'number' ? value : null;
}

function child(source: unknown, key: string): unknown {
  return isRecord(source) ? source[key] : undefined;
}

function toExecution(raw: unknown): RuntimeExecution | null {
  const workflow = child(raw, 'workflow');
  const execution = child(raw, 'n8nExecution');
  const request = child(raw, 'httpRequest');
  const response = child(raw, 'httpResponse');
  const durable = child(raw, 'durableApplicationState');

  const workflowPath = str(workflow, 'repositoryPath');
  const label = str(workflow, 'name') ?? workflowPath;
  const executionId = str(execution, 'id');

  // A record with neither an identity nor a workflow tells a reader nothing. Drop it
  // rather than rendering an empty row that looks like missing data in the UI.
  if (label === null && executionId === null) return null;

  return {
    label: label ?? `execution ${executionId ?? '—'}`,
    workflowPath,
    executionId,
    status: str(execution, 'status'),
    mode: str(execution, 'mode'),
    startedAt: str(execution, 'startedAt'),
    targetRoute: str(request, 'targetRoute'),
    statusCode: num(response, 'statusCode'),
    durableStateNote: str(durable, 'note', 'source'),
  };
}

/**
 * Reads the capture once, at request time. Not cached: the file is written by a separate
 * capture process, so a cached negative result would outlive the condition that caused it
 * and the panel would keep claiming UNVERIFIED after evidence landed.
 */
export async function readRuntimeEvidence(): Promise<RuntimeEvidence> {
  let text: string;
  try {
    text = await readFile(evidencePath(), 'utf8');
  } catch {
    return {
      kind: 'ABSENT',
      detail: `No capture found at ${RUNTIME_EVIDENCE_RELATIVE_PATH}. Orchestration is reported as unverified rather than assumed.`,
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return {
      kind: 'UNREADABLE',
      detail: `${RUNTIME_EVIDENCE_RELATIVE_PATH} exists but is not valid JSON. Reported as unverified rather than partially interpreted.`,
    };
  }

  const rawExecutions = child(parsed, 'executions');
  const executions = (Array.isArray(rawExecutions) ? rawExecutions : [])
    .map(toExecution)
    .filter((entry): entry is RuntimeExecution => entry !== null);

  return {
    kind: 'PRESENT',
    schemaVersion: str(parsed, 'schemaVersion'),
    capturedAt: str(parsed, 'capturedAt'),
    runtime: str(child(parsed, 'n8n'), 'version'),
    executions,
    scopeStatement: str(parsed, 'scopeStatement'),
    unrecognisedShape: executions.length === 0,
  };
}

/**
 * The single question the fidelity ledger asks of this module. Kept here so the ledger
 * never inspects evidence internals, and so "what counts as proven orchestration" has one
 * definition: a capture that parsed AND yielded at least one recognisable execution.
 */
export function evidenceProvesOrchestration(evidence: RuntimeEvidence): boolean {
  return evidence.kind === 'PRESENT' && evidence.executions.length > 0;
}

// --- The evaluation capture ------------------------------------------------
/**
 * A second artefact in the same directory, owned by the same upstream work, quarantined
 * behind the same three rules. It is kept in this file rather than a sibling so that
 * "when an evidence schema moves, this file is the whole blast radius" stays true.
 *
 * The reason the proof surface needs to read it at all: without it, the judgment-quality
 * row can only say the evaluation harness is gated off, which invites a reader to conclude
 * the classifier has never been measured. It has been, and it failed. A page that reports
 * a capability as merely unmeasured when a retained negative result exists is flattering
 * itself by omission, which is the failure mode this whole panel is built to prevent.
 *
 * Every figure below is read from the artefact. None is written here, so a corrected or
 * re-run capture moves the page and a deleted one silently returns it to claiming nothing.
 */

export const LIVE_CLASSIFICATION_EVIDENCE_RELATIVE_PATH =
  'n8n/evidence/lead-rescue-live-classification.json';

export type EvaluationEvidence =
  | { readonly kind: 'ABSENT'; readonly detail: string }
  | { readonly kind: 'UNREADABLE'; readonly detail: string }
  | {
      readonly kind: 'PRESENT';
      readonly model: string | null;
      readonly capturedAt: string | null;
      /** The commit the capture names as the code under test. */
      readonly gitHead: string | null;
      readonly completedCaseCount: number | null;
      readonly correctCount: number | null;
      /** The artefact's own verdict against its predeclared thresholds. */
      readonly overallPassed: boolean | null;
      readonly unsafeMisclassifiedCount: number | null;
      readonly safetyReading: string | null;
      /** The artefact's own bound on what the capture proves. Null if the field was absent. */
      readonly scopeStatement: string | null;
      /** The artefact's own "does not prove" list. Empty if the field was absent or unreadable. */
      readonly doesNotProve: readonly string[];
      /**
       * Parsed, but the aggregate a reader needs was not recognisable. As with
       * `unrecognisedShape` above, this is the signal that the adapter is stale.
       */
      readonly unrecognisedShape: boolean;
    };

function bool(source: unknown, key: string): boolean | null {
  if (!isRecord(source)) return null;
  const value = source[key];
  return typeof value === 'boolean' ? value : null;
}

function strings(source: unknown, key: string): readonly string[] {
  if (!isRecord(source)) return [];
  const value = source[key];
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.trim() !== '');
}

export async function readEvaluationEvidence(): Promise<EvaluationEvidence> {
  const file = path.join(process.cwd(), ...LIVE_CLASSIFICATION_EVIDENCE_RELATIVE_PATH.split('/'));

  let text: string;
  try {
    text = await readFile(file, 'utf8');
  } catch {
    return {
      kind: 'ABSENT',
      detail: `No capture found at ${LIVE_CLASSIFICATION_EVIDENCE_RELATIVE_PATH}. No evaluation result is claimed.`,
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return {
      kind: 'UNREADABLE',
      detail: `${LIVE_CLASSIFICATION_EVIDENCE_RELATIVE_PATH} exists but is not valid JSON. No evaluation result is claimed.`,
    };
  }

  const half = child(parsed, 'evaluationHalf');
  const aggregate = child(half, 'aggregate');

  const completedCaseCount = num(aggregate, 'completedCaseCount');
  const correctCount = num(aggregate, 'correctCount');
  const overallPassed = bool(half, 'overallPassed');

  return {
    kind: 'PRESENT',
    model: str(child(parsed, 'provider'), 'model'),
    capturedAt: str(parsed, 'capturedAt'),
    gitHead: str(parsed, 'gitHead'),
    completedCaseCount,
    correctCount,
    overallPassed,
    unsafeMisclassifiedCount: num(aggregate, 'unsafeMisclassifiedCount'),
    safetyReading: str(half, 'safetyReading'),
    scopeStatement: str(parsed, 'scopeStatement'),
    doesNotProve: strings(parsed, 'doesNotProve'),
    // A verdict with no case counts behind it is not a result a reader can check.
    unrecognisedShape: overallPassed === null || completedCaseCount === null || correctCount === null,
  };
}

/**
 * The single question the ledger asks. A capture only counts as a performed evaluation
 * when it parsed AND carries a checkable verdict — never merely because the file exists.
 */
export function evidenceRecordsEvaluation(
  evidence: EvaluationEvidence,
): evidence is Extract<EvaluationEvidence, { kind: 'PRESENT' }> {
  return evidence.kind === 'PRESENT' && !evidence.unrecognisedShape;
}
