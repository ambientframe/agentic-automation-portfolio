import {
  STAGE_FOR_EVENT_TYPE,
  type JournalEvent,
  type JournalStage,
  type ObservableOutcome,
} from '@/lib/persistence/execution-journal-store';
import type { FailureClass } from '@/lib/model/system';

/**
 * THE AGGREGATE OPERATIONAL VIEW — a pure projection over retained observations.
 *
 * The journal answers "what happened to THIS lead?". This module answers "what has this
 * system been doing?" without becoming a second state system: it holds nothing, persists
 * nothing, and reads nothing. It is a total function from a list of already-recorded
 * observations to a summary of them, which is what makes an aggregate reproducible — the same
 * records always produce the same view, in this process or any other.
 *
 * NO CLOCK AND NO RANDOMNESS, for the same reason the reducer has neither. Every duration
 * here is a difference between two timestamps that were genuinely recorded at two boundaries.
 * Nothing is measured against "now", so a view derived today and the same view derived next
 * year are byte-identical. That also means this module cannot report how long something has
 * been pending — and it says so rather than reaching for a clock to find out.
 *
 * WHAT THIS DELIBERATELY IS NOT. It is not a metrics pipeline, a time-series store, or a
 * telemetry abstraction. There is no sampling, no rollup window, no retention policy, and no
 * vendor seam. Those would all be infrastructure for a scale this project does not have, and
 * §2 of the constitution rejects architecture for hypothetical scale.
 *
 * THE FOUR WAYS AN OPERATIONAL SUMMARY LIES, each refused structurally here:
 *
 *   1. Counting attempts as outcomes. Three dispatch attempts against one lead is one lead,
 *      and `incidentsWithConfirmedDelivery` counts leads while `attempts` counts attempts.
 *      Both are reported, and neither is allowed to stand in for the other.
 *   2. Substituting a convenient zero for a measurement never taken. Every duration is an
 *      `Availability`, so "no interval was observed" is a distinct value from "the interval
 *      was zero" and cannot be summed, averaged, or rendered as though it were the latter.
 *   3. Collapsing uncertainty into a success/failure binary. `OUTCOME_UNKNOWN` is carried all
 *      the way through to the surface, never folded into either neighbour.
 *   4. Presenting a total no one can check. Every tally carries the `journalEventId`s that
 *      produced it, so any number on any surface can be opened back to its records.
 *
 * COMPLETENESS IS BOUNDED BY THE JOURNAL, AND THAT BOUND IS REPORTED. `record()` is lossy by
 * design — it drops rather than blocking business work — so this view describes what was
 * OBSERVED, never what occurred. A summary that quietly implied otherwise would be the more
 * dangerous artifact.
 */

export const OPERATIONAL_VIEW_SCHEMA_VERSION = 'lead-rescue-operational-view-1';

/**
 * A measurement that may genuinely not exist. The union is the point: there is no numeric
 * sentinel, so a caller cannot accidentally arithmetic its way past a missing value.
 */
export type Availability<T> =
  | { readonly kind: 'AVAILABLE'; readonly value: T }
  | { readonly kind: 'UNAVAILABLE'; readonly reason: string };

export interface OutcomeTally {
  readonly outcome: ObservableOutcome;
  readonly count: number;
  /** The exact records behind the count. `count` always equals this length. */
  readonly journalEventIds: readonly string[];
}

export interface FailureTally {
  readonly failureClass: FailureClass;
  readonly count: number;
  readonly journalEventIds: readonly string[];
}

export interface StageTransitionTally {
  readonly from: JournalStage;
  readonly to: JournalStage;
  readonly count: number;
  /** Summed real deltas between consecutive observations. Never an estimate. */
  readonly totalMs: number;
  readonly incidentIds: readonly string[];
}

export interface IncidentSummary {
  readonly incidentId: string;
  readonly correlationIds: readonly string[];
  readonly eventCount: number;
  readonly firstObservedAt: string;
  readonly lastObservedAt: string;
  /**
   * Wall-clock between the first and last observation of this case. NOT "processing time":
   * a case parked against a reply window carries that window inside this number, which is
   * why it is named for what it is.
   */
  readonly observedIntervalMs: Availability<number>;
  readonly outcomes: readonly ObservableOutcome[];
  readonly stages: readonly JournalStage[];
  readonly hadConfirmedDelivery: boolean;
  readonly hadUnresolvedDelivery: boolean;
  readonly hadOperatorIntervention: boolean;
  readonly failureClasses: readonly FailureClass[];
  readonly journalEventIds: readonly string[];
}

export interface DispatchSummary {
  /** Execution attempts at the action boundary. Attempts, not leads. */
  readonly attempts: number;
  readonly executed: number;
  readonly suppressedDuplicate: number;
  readonly failedBeforeEffect: number;
  readonly outcomeUnknown: number;
  /** Refused, rejected, or otherwise never reaching an execution verdict. */
  readonly otherOutcomes: number;
  /** Business-level. Distinct cases with at least one EXECUTED dispatch. */
  readonly incidentsWithConfirmedDelivery: number;
  /** Distinct cases whose delivery is genuinely unresolved and was never later confirmed. */
  readonly incidentsWithUnresolvedDelivery: number;
}

export interface TimingSummary {
  readonly observedIntervals: Availability<{
    readonly incidentsMeasured: number;
    readonly minMs: number;
    /** The lower median — an interval that was actually observed, never an average of two. */
    readonly medianMs: number;
    readonly maxMs: number;
  }>;
  readonly stageTransitions: readonly StageTransitionTally[];
  /** Cases whose interval could not be measured, each with the reason it could not. */
  readonly unmeasurableIncidents: readonly { readonly incidentId: string; readonly reason: string }[];
}

export interface InterventionSummary {
  readonly humanDecisions: number;
  readonly authenticationRefusals: number;
  /** Refused at a consequential boundary having already proven identity. A different problem. */
  readonly authorityRefusals: number;
  readonly incidentsWithIntervention: number;
  readonly journalEventIds: readonly string[];
}

export interface OperationalView {
  readonly schemaVersion: typeof OPERATIONAL_VIEW_SCHEMA_VERSION;
  readonly observationCount: number;
  readonly incidentCount: number;
  readonly correlationCount: number;
  readonly incidents: readonly IncidentSummary[];
  readonly outcomes: readonly OutcomeTally[];
  readonly dispatch: DispatchSummary;
  readonly timing: TimingSummary;
  readonly failures: readonly FailureTally[];
  readonly intervention: InterventionSummary;
  readonly completeness: {
    readonly basis: string;
    readonly incidentsWithSingleObservation: number;
  };
}

const UNMEASURABLE_SINGLE_OBSERVATION = 'a single observation has no interval to measure';

function millisBetween(earlier: string, later: string): number {
  return Date.parse(later) - Date.parse(earlier);
}

/**
 * Total and deterministic, matching the journal's own ordering rule so a view derived from a
 * cross-incident read and one derived from concatenated per-case reads cannot disagree.
 */
function chronological(events: readonly JournalEvent[]): JournalEvent[] {
  return [...events].sort((a, b) => {
    const byTime = Date.parse(a.recordedAt) - Date.parse(b.recordedAt);
    return byTime !== 0 ? byTime : a.journalEventId.localeCompare(b.journalEventId);
  });
}

function summariseIncident(incidentId: string, events: readonly JournalEvent[]): IncidentSummary {
  const ordered = chronological(events);
  const first = ordered[0] as JournalEvent;
  const last = ordered[ordered.length - 1] as JournalEvent;

  const dispatches = ordered.filter((e) => e.type === 'DISPATCH_ATTEMPTED');
  const hadConfirmedDelivery = dispatches.some((e) => e.outcome === 'EXECUTED');

  return {
    incidentId,
    correlationIds: [...new Set(ordered.map((e) => e.correlationId))].sort(),
    eventCount: ordered.length,
    firstObservedAt: first.recordedAt,
    lastObservedAt: last.recordedAt,
    observedIntervalMs:
      ordered.length < 2
        ? { kind: 'UNAVAILABLE', reason: UNMEASURABLE_SINGLE_OBSERVATION }
        : { kind: 'AVAILABLE', value: millisBetween(first.recordedAt, last.recordedAt) },
    outcomes: [...new Set(ordered.map((e) => e.outcome))],
    stages: [...new Set(ordered.map((e) => STAGE_FOR_EVENT_TYPE[e.type]))],
    hadConfirmedDelivery,
    // Unresolved ONLY while nothing later confirmed it. A recovery is not an open question.
    hadUnresolvedDelivery: !hadConfirmedDelivery && dispatches.some((e) => e.outcome === 'OUTCOME_UNKNOWN'),
    hadOperatorIntervention: ordered.some((e) => e.type === 'HUMAN_DECISION_RECORDED'),
    failureClasses: [...new Set(ordered.flatMap((e) => (e.failureClass === undefined ? [] : [e.failureClass])))],
    journalEventIds: ordered.map((e) => e.journalEventId),
  };
}

function tallyOutcomes(events: readonly JournalEvent[]): readonly OutcomeTally[] {
  const byOutcome = new Map<ObservableOutcome, string[]>();
  for (const event of events) {
    const ids = byOutcome.get(event.outcome) ?? [];
    ids.push(event.journalEventId);
    byOutcome.set(event.outcome, ids);
  }
  return [...byOutcome.entries()]
    .map(([outcome, journalEventIds]) => ({ outcome, count: journalEventIds.length, journalEventIds }))
    .sort((a, b) => b.count - a.count || a.outcome.localeCompare(b.outcome));
}

function tallyFailures(events: readonly JournalEvent[]): readonly FailureTally[] {
  const byClass = new Map<FailureClass, string[]>();
  for (const event of events) {
    if (event.failureClass === undefined) continue;
    const ids = byClass.get(event.failureClass) ?? [];
    ids.push(event.journalEventId);
    byClass.set(event.failureClass, ids);
  }
  return [...byClass.entries()]
    .map(([failureClass, journalEventIds]) => ({ failureClass, count: journalEventIds.length, journalEventIds }))
    .sort((a, b) => b.count - a.count || a.failureClass.localeCompare(b.failureClass));
}

/**
 * Elapsed time attributed to the transition between two CONSECUTIVE observations of one case.
 * Only genuinely adjacent observations are paired, so this never claims to know what happened
 * during a gap it did not observe — it reports the gap it did.
 */
function tallyStageTransitions(byIncident: ReadonlyMap<string, readonly JournalEvent[]>): readonly StageTransitionTally[] {
  const key = (from: JournalStage, to: JournalStage) => `${from}>${to}`;
  const accumulated = new Map<string, { from: JournalStage; to: JournalStage; count: number; totalMs: number; incidentIds: Set<string> }>();

  for (const [incidentId, events] of byIncident) {
    const ordered = chronological(events);
    for (let index = 1; index < ordered.length; index += 1) {
      const previous = ordered[index - 1] as JournalEvent;
      const current = ordered[index] as JournalEvent;
      const from = STAGE_FOR_EVENT_TYPE[previous.type];
      const to = STAGE_FOR_EVENT_TYPE[current.type];
      const entry = accumulated.get(key(from, to)) ?? { from, to, count: 0, totalMs: 0, incidentIds: new Set<string>() };
      entry.count += 1;
      entry.totalMs += millisBetween(previous.recordedAt, current.recordedAt);
      entry.incidentIds.add(incidentId);
      accumulated.set(key(from, to), entry);
    }
  }

  return [...accumulated.values()]
    .map((entry) => ({
      from: entry.from,
      to: entry.to,
      count: entry.count,
      totalMs: entry.totalMs,
      incidentIds: [...entry.incidentIds].sort(),
    }))
    .sort((a, b) => b.totalMs - a.totalMs || a.from.localeCompare(b.from));
}

function summariseTiming(incidents: readonly IncidentSummary[]): TimingSummary {
  const measured = incidents
    .flatMap((incident) => (incident.observedIntervalMs.kind === 'AVAILABLE' ? [incident.observedIntervalMs.value] : []))
    .sort((a, b) => a - b);

  const unmeasurableIncidents = incidents
    .filter((incident) => incident.observedIntervalMs.kind === 'UNAVAILABLE')
    .map((incident) => ({
      incidentId: incident.incidentId,
      reason: (incident.observedIntervalMs as { kind: 'UNAVAILABLE'; reason: string }).reason,
    }));

  return {
    observedIntervals:
      measured.length === 0
        ? {
            kind: 'UNAVAILABLE',
            reason: 'no case has two or more observations, so no interval has been measured',
          }
        : {
            kind: 'AVAILABLE',
            value: {
              incidentsMeasured: measured.length,
              minMs: measured[0] as number,
              // Lower median: a value that was genuinely observed, rather than a synthesised mean.
              medianMs: measured[Math.floor((measured.length - 1) / 2)] as number,
              maxMs: measured[measured.length - 1] as number,
            },
          },
    stageTransitions: [],
    unmeasurableIncidents,
  };
}

/** The one entry point. Pure, total, and stable for a given set of observations. */
export function deriveOperationalView(events: readonly JournalEvent[]): OperationalView {
  const ordered = chronological(events);

  const byIncident = new Map<string, JournalEvent[]>();
  for (const event of ordered) {
    const bucket = byIncident.get(event.incidentId) ?? [];
    bucket.push(event);
    byIncident.set(event.incidentId, bucket);
  }

  const incidents = [...byIncident.entries()]
    .map(([incidentId, incidentEvents]) => summariseIncident(incidentId, incidentEvents))
    .sort((a, b) => a.incidentId.localeCompare(b.incidentId));

  const dispatches = ordered.filter((e) => e.type === 'DISPATCH_ATTEMPTED');
  const countDispatch = (outcome: ObservableOutcome) => dispatches.filter((e) => e.outcome === outcome).length;
  const executed = countDispatch('EXECUTED');
  const suppressedDuplicate = countDispatch('SUPPRESSED_DUPLICATE');
  const failedBeforeEffect = countDispatch('FAILED_BEFORE_EFFECT');
  const outcomeUnknown = countDispatch('OUTCOME_UNKNOWN');

  const interventionEvents = ordered.filter(
    (e) => e.type === 'HUMAN_DECISION_RECORDED' || e.type === 'OPERATOR_AUTHENTICATION',
  );

  const timing = summariseTiming(incidents);

  return {
    schemaVersion: OPERATIONAL_VIEW_SCHEMA_VERSION,
    observationCount: ordered.length,
    incidentCount: byIncident.size,
    correlationCount: new Set(ordered.map((e) => e.correlationId)).size,
    incidents,
    outcomes: tallyOutcomes(ordered),
    dispatch: {
      attempts: dispatches.length,
      executed,
      suppressedDuplicate,
      failedBeforeEffect,
      outcomeUnknown,
      otherOutcomes: dispatches.length - executed - suppressedDuplicate - failedBeforeEffect - outcomeUnknown,
      incidentsWithConfirmedDelivery: incidents.filter((i) => i.hadConfirmedDelivery).length,
      incidentsWithUnresolvedDelivery: incidents.filter((i) => i.hadUnresolvedDelivery).length,
    },
    timing: { ...timing, stageTransitions: tallyStageTransitions(byIncident) },
    failures: tallyFailures(ordered),
    intervention: {
      humanDecisions: ordered.filter((e) => e.type === 'HUMAN_DECISION_RECORDED').length,
      authenticationRefusals: ordered.filter((e) => e.type === 'OPERATOR_AUTHENTICATION' && e.outcome === 'REFUSED')
        .length,
      authorityRefusals: ordered.filter((e) => e.type === 'HUMAN_DECISION_RECORDED' && e.outcome === 'REFUSED').length,
      incidentsWithIntervention: incidents.filter((i) => i.hadOperatorIntervention).length,
      journalEventIds: interventionEvents.map((e) => e.journalEventId),
    },
    completeness: {
      basis:
        'Derived only from observations the journal retained. The journal drops rather than blocking business work, so this describes what was observed, never everything that occurred.',
      incidentsWithSingleObservation: incidents.filter((i) => i.eventCount === 1).length,
    },
  };
}
