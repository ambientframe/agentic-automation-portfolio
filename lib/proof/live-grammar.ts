import { GRAMMAR_STAGES, type GrammarStageId, type GrammarTone } from './commercial-grammar';
import type {
  JournalEventType,
  JournalMechanism,
  JournalStage,
  ObservableOutcome,
} from '@/lib/persistence/execution-journal-store';

/**
 * LIVE CASE → THE SAME COMMERCIAL GRAMMAR, FROM THE RUNTIME'S OWN RECORD.
 *
 * Part Two of the proof page teaches a reader five words —
 * TRIGGER → DECISION → ACTION → GUARDRAIL → OUTCOME — and then Part Three, the only section
 * that genuinely executes, used to answer in a different vocabulary entirely: raw outcome
 * tokens in an action log. A reader had to translate the convincing part themselves. This
 * module removes that translation by deriving the identical five cells for one live case.
 *
 * WHERE THE FACTS COME FROM, AND WHY IT IS NOT THE HTTP RESPONSE. Everything here is read
 * from `GET /api/lead-rescue/journal`, the execution journal the runtime writes about itself
 * and re-reads from disk. That matters: an HTTP response is what a route said about a request
 * it was handling, whereas the journal is what the process durably recorded, survives a
 * restart, and can be read by something that never saw the request. Deriving the buyer-facing
 * strip from the second means the strip cannot claim a step the runtime did not write down.
 *
 * THE JOURNAL IS NON-AUTHORITATIVE AND LOSSY BY DESIGN (`record()` never throws and reports
 * `DROPPED` rather than retrying). So an absent record means "this was not observed", NEVER
 * "this did not happen", and every cell below says which of those it is asserting. A strip
 * that quietly rendered a dropped observation as a completed stage would be worse than no
 * strip at all.
 *
 * FIVE FIXED RULES, ONE PER CELL, APPLIED TO EVERY CASE. They are exported as
 * `LIVE_SELECTION_RULES` and rendered beside the strip, for the same reason Part Two exports
 * its own: a derived headline whose derivation is hidden is indistinguishable from copy.
 *
 * CLIENT-SAFE ON PURPOSE. The persistence module is imported for TYPES ONLY, so none of its
 * file-system code reaches the browser bundle. `tests/lead-rescue-proof-live-grammar.test.ts`
 * imports the real constants and asserts this module's vocabulary still matches them exactly,
 * so the erased import cannot drift into a private second taxonomy.
 */

// ---------------------------------------------------------------------------
// The wire shape, exactly as `app/api/lead-rescue/journal/route.ts` serialises it.
// ---------------------------------------------------------------------------

export interface JournalWireEvent {
  readonly journalEventId: string;
  readonly recordedAt: string;
  readonly incidentId: string;
  readonly correlationId: string;
  readonly revision?: number;
  readonly type: JournalEventType;
  /** Derived by the route from `STAGE_FOR_EVENT_TYPE`, never stored on the record. */
  readonly stage: JournalStage;
  readonly mechanism?: JournalMechanism;
  readonly outcome: ObservableOutcome;
  readonly failureClass?: string;
  readonly executionMode?: 'SIMULATED' | 'LIVE';
  readonly actorId?: string;
  readonly operationClaimId?: string;
  readonly ruleId?: string;
  readonly detail?: string;
}

/**
 * The two journal mechanisms that are not decision mechanisms. Kept as a list rather than as
 * a `!== 'DETERMINISTIC_RULE'` style test so that adding a genuine fourth decision mechanism
 * to the canonical vocabulary makes it a decision here automatically, while adding another
 * non-decision boundary has to be named deliberately.
 */
export const NON_DECISION_MECHANISMS: readonly JournalMechanism[] = ['EXECUTION', 'AUTHENTICATION'];

/**
 * Refusal outcomes, strongest first. "Strongest" means most informative about the system
 * holding a line: something was attempted and stopped outranks something that was never
 * allowed to start, which outranks a duplicate that was absorbed, which outranks an
 * attention condition raised to a person.
 */
export const GUARDRAIL_PRECEDENCE: readonly ObservableOutcome[] = [
  'REFUSED',
  'REJECTED',
  'SUPPRESSED_DUPLICATE',
  'ESCALATED',
];

// ---------------------------------------------------------------------------

export type LiveCellStatus =
  /** At least one journal record backs this cell. `evidence` lists the record ids. */
  | 'OBSERVED'
  /** No record. The runtime did not observe this stage for this case — not a claim it never occurred. */
  | 'NOT_OBSERVED'
  /** Not journalled at all by design. Read from the persisted case record instead, and labelled so. */
  | 'FROM_CASE_RECORD';

export interface LiveGrammarCell {
  readonly stage: GrammarStageId;
  readonly heading: string;
  readonly status: LiveCellStatus;
  readonly headline: string;
  readonly detail: string;
  /** The runtime's own identifier behind the headline. Null where the cell has no record. */
  readonly technicalName: string | null;
  readonly tone: GrammarTone;
  /** `journalEventId`s a sceptic can fetch back. Empty unless `status` is `OBSERVED`. */
  readonly evidence: readonly string[];
  /** How many records the rule considered, not how many it displayed. */
  readonly recordCount: number;
  readonly lastRecordedAt: string | null;
  /** Read from the record, never assumed. Null where the boundary reported none. */
  readonly executionMode: 'SIMULATED' | 'LIVE' | null;
}

export interface LiveGrammar {
  readonly incidentId: string;
  readonly cells: readonly LiveGrammarCell[];
  /** Total records the journal returned for this case. */
  readonly recordCount: number;
  /** How many of the five cells the runtime actually wrote something for. */
  readonly observedStages: number;
}

export interface LiveGrammarInput {
  readonly incidentId: string;
  /** Chronological, as returned by the journal route. */
  readonly events: readonly JournalWireEvent[];
  /** From the persisted case record. Null when the case is not in the store. */
  readonly lifecycleState: string | null;
  /** Plain-language gloss for the lifecycle state, supplied by the caller that has the record. */
  readonly lifecycleMeaning: string | null;
}

export const LIVE_SELECTION_RULES: readonly { readonly stage: GrammarStageId; readonly rule: string }[] = [
  {
    stage: 'TRIGGER',
    rule: 'The earliest record the runtime wrote at the ingress boundary. A case opened directly on this page never entered through that seam, so it correctly has none.',
  },
  {
    stage: 'DECISION',
    rule: 'The most recent record carrying a decision mechanism — a fixed rule, a bounded judgment, or a person — that was not itself refused.',
  },
  {
    stage: 'ACTION',
    rule: 'The most recent record written at the execution boundary, with the execution mode the executor reported.',
  },
  {
    stage: 'GUARDRAIL',
    rule: 'The strongest refusal recorded anywhere in this case\u2019s history, ordered refused \u2192 rejected \u2192 duplicate suppressed \u2192 escalated.',
  },
  {
    stage: 'OUTCOME',
    rule: 'The case\u2019s current lifecycle state, read from the persisted record. No journal event type produces an OUTCOME record, so this cell is never sourced from history.',
  },
];

// ---------------------------------------------------------------------------
// Glosses. Every key is a member of the runtime's own vocabulary.
// ---------------------------------------------------------------------------

interface OutcomeGloss {
  readonly label: string;
  readonly tone: GrammarTone;
  readonly meaning: string;
}

export const OUTCOME_GLOSS: Readonly<Record<ObservableOutcome, OutcomeGloss>> = {
  ACCEPTED: {
    label: 'Accepted',
    tone: 'ACTED',
    meaning: 'The boundary allowed it and the case moved on.',
  },
  REJECTED: {
    label: 'Rejected by the rules',
    tone: 'HELD',
    meaning: 'No declared transition permitted this from the state the case was in.',
  },
  REFUSED: {
    label: 'Refused by a guard',
    tone: 'HELD',
    meaning:
      'Insufficient authority, a stale revision, or the wrong lifecycle state. The case was left exactly as it was.',
  },
  SUPPRESSED_DUPLICATE: {
    label: 'Duplicate suppressed',
    tone: 'HELD',
    meaning: 'A prior confirmed claim already covered this, so nothing ran a second time.',
  },
  EXECUTED: {
    label: 'Carried out',
    tone: 'ACTED',
    meaning: 'The action ran through the execution boundary and was confirmed.',
  },
  FAILED_BEFORE_EFFECT: {
    label: 'Failed before any effect',
    tone: 'HELD',
    meaning: 'Confirmed non-execution. Nothing reached anyone.',
  },
  OUTCOME_UNKNOWN: {
    label: 'Outcome genuinely unknown',
    tone: 'UNCERTAIN',
    meaning:
      'A claim was recorded but never confirmed. It may or may not have happened, so it is neither retried on an assumption nor reported as done.',
  },
  NO_ACTION: {
    label: 'Evaluated, nothing due',
    tone: 'NEUTRAL',
    meaning: 'The window was compared against the clock and had not elapsed. A genuine no-op.',
  },
  ESCALATED: {
    label: 'Raised to a person',
    tone: 'PERSON',
    meaning: 'An attention condition was durably recorded and addressed to the next owner.',
  },
  RESOLVED: {
    label: 'Wait elapsed, case moved on',
    tone: 'ACTED',
    meaning: 'The deadline genuinely passed and the case advanced through the ordinary gates.',
  },
  NOT_FOUND: {
    label: 'No such case',
    tone: 'NEUTRAL',
    meaning: 'The boundary was asked about a record that does not exist.',
  },
};

/** What each boundary is, in a buyer's words. One entry per instrumented boundary. */
export const EVENT_SUBJECT: Readonly<Record<JournalEventType, string>> = {
  INGRESS_RECEIVED: 'A lead arrived through the external ingress seam',
  OPERATOR_AUTHENTICATION: 'An operator credential was checked before anything was decided',
  WAIT_EVALUATED: 'A parked case was re-evaluated against its configured window',
  HUMAN_DECISION_RECORDED: 'A person submitted a decision against a case under review',
  DISPATCH_ATTEMPTED: 'An authorised outbound action was attempted',
};

export const MECHANISM_GLOSS: Readonly<Record<JournalMechanism, string>> = {
  DETERMINISTIC_RULE: 'a fixed rule, reproducible and with no model involved',
  BOUNDED_AI_JUDGMENT: 'a bounded judgment choosing only from a closed set',
  HUMAN_DECISION: 'a person, entering the system as an explicit human event',
  EXECUTION: 'the execution boundary carrying out a decision already made',
  AUTHENTICATION: 'an identity check, before anything was decided at all',
};

// ---------------------------------------------------------------------------

function cellFrom(
  stage: GrammarStageId,
  heading: string,
  event: JournalWireEvent,
  considered: readonly JournalWireEvent[],
): LiveGrammarCell {
  const gloss = OUTCOME_GLOSS[event.outcome];
  const mechanism = event.mechanism === undefined ? null : MECHANISM_GLOSS[event.mechanism];
  const subject = EVENT_SUBJECT[event.type];

  return {
    stage,
    heading,
    status: 'OBSERVED',
    headline: gloss.label,
    detail: `${subject}${mechanism === null ? '' : ` — ${mechanism}`}. ${event.detail ?? gloss.meaning}`,
    technicalName: `${event.type} · ${event.outcome}`,
    tone: gloss.tone,
    evidence: [event.journalEventId],
    recordCount: considered.length,
    lastRecordedAt: event.recordedAt,
    executionMode: event.executionMode ?? null,
  };
}

function unobserved(stage: GrammarStageId, heading: string, detail: string): LiveGrammarCell {
  return {
    stage,
    heading,
    status: 'NOT_OBSERVED',
    headline: 'Not recorded for this case',
    detail,
    technicalName: null,
    tone: 'NEUTRAL',
    evidence: [],
    recordCount: 0,
    lastRecordedAt: null,
    executionMode: null,
  };
}

export function deriveLiveGrammar({
  incidentId,
  events,
  lifecycleState,
  lifecycleMeaning,
}: LiveGrammarInput): LiveGrammar {
  const triggers = events.filter((event) => event.stage === 'TRIGGER');
  const decisions = events.filter(
    (event) =>
      event.mechanism !== undefined &&
      !NON_DECISION_MECHANISMS.includes(event.mechanism) &&
      !GUARDRAIL_PRECEDENCE.includes(event.outcome),
  );
  const actions = events.filter((event) => event.stage === 'ACTION');
  const refusals = events.filter((event) => GUARDRAIL_PRECEDENCE.includes(event.outcome));

  const strongestRefusal = GUARDRAIL_PRECEDENCE.flatMap((outcome) =>
    refusals.filter((event) => event.outcome === outcome),
  ).at(0);

  const cells: LiveGrammarCell[] = [
    triggers[0] === undefined
      ? unobserved(
          'TRIGGER',
          'Trigger',
          'Nothing was recorded at the ingress boundary. A case opened from the controls above did not enter through it, which is the expected reading rather than a gap.',
        )
      : cellFrom('TRIGGER', 'Trigger', triggers[0], triggers),
    decisions.at(-1) === undefined
      ? unobserved(
          'DECISION',
          'Decision',
          'No accepted decision has been recorded against this case yet. Nothing has been evaluated, cleared, or closed.',
        )
      : cellFrom('DECISION', 'Decision', decisions.at(-1) as JournalWireEvent, decisions),
    actions.at(-1) === undefined
      ? unobserved(
          'ACTION',
          'Action',
          'Nothing has been attempted at the execution boundary. No offer has been despatched, so nothing could have reached anyone.',
        )
      : cellFrom('ACTION', 'Action', actions.at(-1) as JournalWireEvent, actions),
    strongestRefusal === undefined
      ? {
          ...unobserved('GUARDRAIL', 'Guardrail', ''),
          headline: 'Nothing has been refused',
          detail:
            'No refusal, rejection, duplicate suppression, or escalation appears in this case\u2019s recorded history. That is a statement about what was observed, not a guarantee none occurred.',
        }
      : cellFrom('GUARDRAIL', 'Guardrail', strongestRefusal, refusals),
    lifecycleState === null
      ? unobserved(
          'OUTCOME',
          'Outcome',
          'This case is not in the persisted store, so it has no current state to report.',
        )
      : {
          stage: 'OUTCOME',
          heading: 'Outcome',
          status: 'FROM_CASE_RECORD',
          headline: lifecycleState.replace(/_/g, ' '),
          detail: `${lifecycleMeaning ?? 'The state the persisted record currently holds.'} Read from the case record on disk, not from history — no journal event type produces an outcome record.`,
          technicalName: lifecycleState,
          tone: 'NEUTRAL',
          evidence: [],
          recordCount: 0,
          lastRecordedAt: null,
          executionMode: null,
        },
  ];

  // Order defensively rather than trusting the literal above to stay in grammar order.
  const ordered = GRAMMAR_STAGES.map((stage) => cells.find((cell) => cell.stage === stage)).filter(
    (cell): cell is LiveGrammarCell => cell !== undefined,
  );

  return {
    incidentId,
    cells: ordered,
    recordCount: events.length,
    observedStages: ordered.filter((cell) => cell.status === 'OBSERVED').length,
  };
}
