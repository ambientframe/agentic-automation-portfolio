import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { OperationalView } from '@/lib/observability/operational-view';

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

/**
 * Every artifact this module reads lives in `n8n/evidence`. Resolving against a LITERAL prefix
 * lets the bundler see that directory statically; joining a variable relative path onto
 * `process.cwd()` made it trace the whole project into the server bundle, which on a
 * deployment ships every source file and the public folder as server code.
 *
 * The prefix is asserted, not assumed — a path from outside that directory throws rather than
 * silently resolving somewhere unintended.
 */
const EVIDENCE_DIR_SEGMENTS = ['n8n', 'evidence'] as const;
const EVIDENCE_DIR_PREFIX = `${EVIDENCE_DIR_SEGMENTS.join('/')}/`;

function evidenceFilePath(repoRelativePath: string): string {
  if (!repoRelativePath.startsWith(EVIDENCE_DIR_PREFIX)) {
    throw new Error(
      `n8n-evidence reads only from ${EVIDENCE_DIR_PREFIX}; got "${repoRelativePath}". Widening this would restore whole-project bundle tracing.`,
    );
  }
  return path.join(process.cwd(), 'n8n', 'evidence', repoRelativePath.slice(EVIDENCE_DIR_PREFIX.length));
}

function evidencePath(): string {
  return evidenceFilePath(RUNTIME_EVIDENCE_RELATIVE_PATH);
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
  const file = evidenceFilePath(LIVE_CLASSIFICATION_EVIDENCE_RELATIVE_PATH);

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

// ---------------------------------------------------------------------------
// Retained AGGREGATE OPERATIONAL VIEW capture.
// ---------------------------------------------------------------------------

export const OPERATIONAL_VIEW_EVIDENCE_RELATIVE_PATH = 'n8n/evidence/lead-rescue-operational-view.json';

/**
 * The retained capture of a multi-execution view, read through the same quarantine as every
 * other artefact here.
 *
 * WHY THE PAGE READS A CAPTURE RATHER THAN THE LIVE JOURNAL. The live journal lives in
 * `.data/`, which is gitignored runtime state: on any machine that has not driven the system,
 * it is legitimately empty. Rendering the live view alone would mean the proof surface showed
 * nothing to a reviewer who just cloned the repository, and rendering a *fabricated* view
 * would be worse. The capture is the honest middle: a real aggregate the running application
 * genuinely computed, retained with the git head that produced it.
 *
 * The `view` is passed through verbatim rather than re-derived here. Re-deriving would let this
 * build disagree with the runtime that produced the capture — and the capture, not this module,
 * is the evidence.
 */
export type OperationalViewEvidence =
  | { readonly kind: 'ABSENT'; readonly detail: string }
  | { readonly kind: 'UNREADABLE'; readonly detail: string }
  | {
      readonly kind: 'PRESENT';
      readonly capturedAt: string | null;
      readonly gitHead: string | null;
      readonly scope: string | null;
      /** The view exactly as the running application computed it. */
      readonly view: OperationalView;
      readonly doesNotProve: readonly string[];
      readonly unrecognisedShape: boolean;
    };

export async function readOperationalViewEvidence(): Promise<OperationalViewEvidence> {
  const file = evidenceFilePath(OPERATIONAL_VIEW_EVIDENCE_RELATIVE_PATH);

  let text: string;
  try {
    text = await readFile(file, 'utf8');
  } catch {
    return {
      kind: 'ABSENT',
      detail: `No capture found at ${OPERATIONAL_VIEW_EVIDENCE_RELATIVE_PATH}. No aggregate is claimed.`,
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return {
      kind: 'UNREADABLE',
      detail: `${OPERATIONAL_VIEW_EVIDENCE_RELATIVE_PATH} exists but is not valid JSON. No aggregate is claimed.`,
    };
  }

  const view = child(parsed, 'view');
  // One structural question only: does it carry the incident list every tally traces back to?
  const recognised =
    view !== null && typeof view === 'object' && Array.isArray((view as Record<string, unknown>)['incidents']);

  if (!recognised) {
    return {
      kind: 'UNREADABLE',
      detail: `${OPERATIONAL_VIEW_EVIDENCE_RELATIVE_PATH} does not contain a recognisable operational view. No aggregate is claimed.`,
    };
  }

  const doesNotProve = child(parsed, 'doesNotProve');

  return {
    kind: 'PRESENT',
    capturedAt: str(parsed, 'capturedAt'),
    gitHead: str(parsed, 'gitHead'),
    scope: str(child(parsed, 'environment'), 'scope'),
    view: view as unknown as OperationalView,
    doesNotProve: Array.isArray(doesNotProve) ? doesNotProve.filter((v): v is string => typeof v === 'string') : [],
    unrecognisedShape: false,
  };
}

// ---------------------------------------------------------------------------
// Retained OBSERVATION INTEGRITY capture.
// ---------------------------------------------------------------------------

export const OBSERVATION_INTEGRITY_EVIDENCE_RELATIVE_PATH = 'n8n/evidence/lead-rescue-observation-integrity.json';

/**
 * The retained capture of a run that deliberately broke things: a refused envelope, a receiver
 * that took the message and vanished, a process killed mid-send, and an unwritable journal.
 *
 * WHY IT IS READ SEPARATELY from the aggregate capture. The aggregate answers "what has this
 * system been doing"; this answers "can the instrument be trusted, and what did it do when the
 * boundary went wrong". They are produced by different runs against the same journal, and
 * keeping them separate means neither has to be regenerated when the other changes.
 *
 * SAME QUARANTINE, SAME THREE RULES: never throws, never invents, reports its own recognition.
 * A capture whose shape this adapter does not recognise renders as an explicit negative, which
 * is the only honest thing to show for evidence that cannot be read.
 */

/** One deliberately-broken despatch, and what an observer other than the sender recorded. */
export interface AbnormalDeliveryCase {
  readonly incidentId: string | null;
  /** The outcome the application itself classified and retained. */
  readonly journalOutcome: string | null;
  readonly journalDetail: string | null;
  /** What the receiving server independently recorded about the same exchange. */
  readonly receiverNote: string | null;
  readonly receiverBodyBytesReceived: number | null;
  readonly receiverStoredMessageId: string | null;
  readonly receiverAcknowledged: boolean | null;
}

export interface ObservationLossCase {
  readonly incidentId: string | null;
  readonly fault: string | null;
  readonly businessWorkSucceeded: boolean | null;
  readonly lossKind: string | null;
  readonly lossReason: string | null;
  readonly journalRecordsForThatCase: number;
}

export interface ClassificationCheck {
  readonly subject: string | null;
  readonly incidentId: string | null;
  readonly agreement: string | null;
  readonly finding: string | null;
}

export interface RetainedAlert {
  readonly alertId: string;
  readonly condition: string;
  readonly severity: string;
  readonly incidentId: string | null;
  readonly reason: string;
  readonly operatorAction: string;
  readonly status: string;
  readonly evidenceJournalEventIds: readonly string[];
}

export type ObservationIntegrityEvidence =
  | { readonly kind: 'ABSENT'; readonly detail: string }
  | { readonly kind: 'UNREADABLE'; readonly detail: string }
  | {
      readonly kind: 'PRESENT';
      readonly capturedAt: string | null;
      readonly gitHead: string | null;
      /**
       * `NO_KNOWN_LOSS` / `KNOWN_LOSS` / `UNAVAILABLE`, exactly as the runtime reported it.
       * Never null on a PRESENT result: a capture with no integrity answer is UNREADABLE, so a
       * reader is never left to decide for itself what a missing verdict should mean.
       */
      readonly integrityKind: string;
      readonly integrityBasis: string | null;
      readonly lossCount: number;
      readonly alerts: readonly RetainedAlert[];
      readonly delivered: AbnormalDeliveryCase | null;
      readonly failedBeforeEffect: AbnormalDeliveryCase | null;
      readonly outcomeUnknown: AbnormalDeliveryCase | null;
      readonly vanishedAfterData: AbnormalDeliveryCase | null;
      readonly observationLoss: ObservationLossCase | null;
      readonly classificationChecks: readonly ClassificationCheck[];
      readonly receiverKind: string | null;
      readonly doesNotProve: readonly string[];
    };

function toAlert(raw: unknown): RetainedAlert | null {
  if (!isRecord(raw)) return null;
  const alertId = str(raw, 'alertId');
  const condition = str(raw, 'condition');
  const severity = str(raw, 'severity');
  const status = str(raw, 'status');
  const reason = str(raw, 'reason');
  const operatorAction = str(raw, 'operatorAction');
  if (alertId === null || condition === null || severity === null || status === null) return null;
  return {
    alertId,
    condition,
    severity,
    incidentId: str(raw, 'incidentId'),
    reason: reason ?? '',
    operatorAction: operatorAction ?? '',
    status,
    evidenceJournalEventIds: strings(raw, 'evidenceJournalEventIds'),
  };
}

/**
 * `journalRecord` and `journalRecords` are both accepted because one case in the capture
 * legitimately has more than one despatch record. Reading only the singular key would silently
 * drop the case whose evidence matters most.
 */
function toAbnormalCase(raw: unknown, receiverKey: string): AbnormalDeliveryCase | null {
  if (!isRecord(raw)) return null;
  const single = child(raw, 'journalRecord');
  const many = child(raw, 'journalRecords');
  const record = isRecord(single) ? single : Array.isArray(many) && isRecord(many[0]) ? many[0] : null;
  const receiver = child(raw, receiverKey);
  return {
    incidentId: str(raw, 'incidentId'),
    journalOutcome: str(record, 'outcome'),
    journalDetail: str(record, 'detail'),
    receiverNote: str(receiver, 'note'),
    receiverBodyBytesReceived: num(receiver, 'bodyBytesReceived'),
    receiverStoredMessageId: str(receiver, 'storedMessageId'),
    receiverAcknowledged: bool(receiver, 'acknowledgedToClient'),
  };
}

export async function readObservationIntegrityEvidence(): Promise<ObservationIntegrityEvidence> {
  const file = evidenceFilePath(OBSERVATION_INTEGRITY_EVIDENCE_RELATIVE_PATH);

  let text: string;
  try {
    text = await readFile(file, 'utf8');
  } catch {
    return {
      kind: 'ABSENT',
      detail: `No capture found at ${OBSERVATION_INTEGRITY_EVIDENCE_RELATIVE_PATH}. No claim is made about observation integrity or about abnormal delivery.`,
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return {
      kind: 'UNREADABLE',
      detail: `${OBSERVATION_INTEGRITY_EVIDENCE_RELATIVE_PATH} exists but is not valid JSON. No claim is made about observation integrity.`,
    };
  }

  const integrity = child(parsed, 'integrity');
  const integrityKind = str(integrity, 'kind');
  if (integrityKind === null) {
    return {
      kind: 'UNREADABLE',
      detail: `${OBSERVATION_INTEGRITY_EVIDENCE_RELATIVE_PATH} does not report an observation-integrity result. No claim is made.`,
    };
  }

  const losses = child(integrity, 'losses');
  const abnormal = child(parsed, 'abnormalDeliveryEvidence');
  const degradation = child(parsed, 'observationDegradationEvidence');
  const degradationLoss = child(degradation, 'integrityLoss');
  const degradationRecords = child(degradation, 'journalRecordsForThatCase');
  const rawAlerts = child(parsed, 'alerts');
  const rawChecks = child(parsed, 'executionClassificationCheckedAgainstTheReceiver');
  const doesNotProve = child(parsed, 'doesNotProve');

  return {
    kind: 'PRESENT',
    capturedAt: str(parsed, 'capturedAt'),
    gitHead: str(parsed, 'gitHead'),
    integrityKind,
    integrityBasis: str(integrity, 'basis'),
    lossCount: Array.isArray(losses) ? losses.length : 0,
    alerts: Array.isArray(rawAlerts) ? rawAlerts.map(toAlert).filter((a): a is RetainedAlert => a !== null) : [],
    delivered: toAbnormalCase(child(abnormal, 'delivered'), 'independentReceiverState'),
    failedBeforeEffect: toAbnormalCase(child(abnormal, 'failedBeforeEffect'), 'independentNonExecution'),
    outcomeUnknown: toAbnormalCase(child(abnormal, 'outcomeUnknownAfterCrash'), 'independentReceiverState'),
    vanishedAfterData: toAbnormalCase(child(abnormal, 'vanishedAfterData'), 'independentReceiverState'),
    observationLoss:
      degradation === null
        ? null
        : {
            incidentId: str(degradation, 'incidentId'),
            fault: str(degradation, 'fault'),
            businessWorkSucceeded: bool(degradation, 'businessWorkSucceeded'),
            lossKind: str(degradationLoss, 'kind'),
            lossReason: str(degradationLoss, 'reason'),
            journalRecordsForThatCase: Array.isArray(degradationRecords) ? degradationRecords.length : 0,
          },
    classificationChecks: Array.isArray(rawChecks)
      ? rawChecks.filter(isRecord).map((raw) => ({
          subject: str(raw, 'subject'),
          incidentId: str(raw, 'incidentId'),
          agreement: str(raw, 'agreement'),
          finding: str(raw, 'finding'),
        }))
      : [],
    receiverKind: str(child(child(parsed, 'environment'), 'smtpServer'), 'kind'),
    doesNotProve: Array.isArray(doesNotProve) ? doesNotProve.filter((v): v is string => typeof v === 'string') : [],
  };
}
