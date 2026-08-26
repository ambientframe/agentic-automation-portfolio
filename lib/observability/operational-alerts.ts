import type { IncidentSummary, OperationalView } from './operational-view';
import type { ObservationIntegrity } from './observation-integrity';

/**
 * DETERMINISTIC OPERATOR ALERTING — the difference between evidence being available and a
 * condition being raised.
 *
 * The aggregate view answers "what has this system been doing" to somebody who goes and looks.
 * That is a report, and a report is only as good as the discipline of the person reading it.
 * This module names the small number of conditions that genuinely require a person, so they
 * arrive rather than waiting to be found.
 *
 * FIVE CONDITIONS, AND THE RESTRAINT IS THE CAPABILITY. An alert layer that fires on everything
 * abnormal is a log with a red border, and the first thing an operator learns is to ignore it.
 * A refusal, a suppressed duplicate, and a case correctly parked are all abnormal-looking and
 * all evidence of the system working exactly as designed, so none of them is raised. What is
 * raised is confined to conditions where doing nothing has a cost:
 *
 *   OBSERVATION_UNMEASURABLE  the instrument cannot answer whether it lost anything. Every
 *                             other number on the surface is unbounded until this is fixed.
 *   UNRESOLVED_DELIVERY       an action may or may not have reached its recipient, and nothing
 *                             will ever retry it. Only a person can resolve it.
 *   OBSERVATION_LOSS          observations are known to be missing. Totals understate reality
 *                             by at least the named amount.
 *   FAILED_DELIVERY           an action confirmably did not happen and nothing re-sent it.
 *   ATTENTION_OVERDUE         a case's own attention window elapsed with nobody acting.
 *
 * EVERY CONDITION IS READ FROM AUTHORITATIVE DATA IT DID NOT DERIVE. `UNRESOLVED_DELIVERY` and
 * `FAILED_DELIVERY` come from what the execution boundary itself observed and the journal
 * retained; `ATTENTION_OVERDUE` comes from the escalation the deterministic engine already
 * raised, carrying the canonical failure class it assigned. Nothing here re-decides whether a
 * window elapsed, and nothing here reads a clock to guess: a condition this module cannot see
 * in the records is a condition it does not report.
 *
 * NO JUDGMENT, NO AUTHORITY, NO STATE. This is a pure, total function of a view and an integrity
 * report. It holds nothing, persists nothing, sends nothing, and cannot act. There is no model
 * anywhere near it: whether a known operational condition warrants attention is a rule, and a
 * rule that a model could soften is not a guardrail.
 *
 * DISMISSAL IS DELIBERATELY ABSENT. Because alerts are recomputed from evidence rather than
 * stored, a condition cannot be acknowledged away while it is still true — it disappears when
 * the evidence changes and not before. The one status that is not `ACTIVE` is derived the same
 * way: a delivery that failed and was later genuinely delivered is shown as resolved rather
 * than deleted, so a recovery stays visible instead of quietly erasing the incident.
 *
 * REUSABLE AS WRITTEN. It consumes `OperationalView` and `ObservationIntegrity` and knows
 * nothing about any particular business domain, so any system recording through the same
 * journal inherits it without adapting anything.
 */

export const ALERT_CONDITIONS = [
  'OBSERVATION_UNMEASURABLE',
  'UNRESOLVED_DELIVERY',
  'OBSERVATION_LOSS',
  'FAILED_DELIVERY',
  'ATTENTION_OVERDUE',
] as const;
export type AlertCondition = (typeof ALERT_CONDITIONS)[number];

/**
 * Two levels, not five. A severity scale finer than the number of distinct actions available is
 * decoration: here a condition either blocks trusting the surface or reaching a person, or it
 * needs somebody's attention in the ordinary course.
 */
export type AlertSeverity = 'CRITICAL' | 'ATTENTION';

export type AlertStatus =
  | 'ACTIVE'
  /** The condition occurred and later evidence shows it was overtaken. Retained, not erased. */
  | 'RESOLVED_BY_LATER_EVIDENCE';

export interface OperationalAlert {
  /** Stable across derivations: one condition per subject. Re-deriving cannot duplicate it. */
  readonly alertId: string;
  readonly condition: AlertCondition;
  readonly severity: AlertSeverity;
  /** The case this concerns, or `null` for a condition about the instrument as a whole. */
  readonly incidentId: string | null;
  readonly reason: string;
  /** What a person is expected to do. An alert nobody can act on is noise with a label. */
  readonly operatorAction: string;
  readonly status: AlertStatus;
  /** The exact records behind the claim, so any alert can be opened back to its evidence. */
  readonly evidenceJournalEventIds: readonly string[];
}

const SEVERITY_RANK: Record<AlertSeverity, number> = { CRITICAL: 0, ATTENTION: 1 };

const SEVERITY_FOR: Record<AlertCondition, AlertSeverity> = {
  OBSERVATION_UNMEASURABLE: 'CRITICAL',
  UNRESOLVED_DELIVERY: 'CRITICAL',
  OBSERVATION_LOSS: 'ATTENTION',
  FAILED_DELIVERY: 'ATTENTION',
  ATTENTION_OVERDUE: 'ATTENTION',
};

function alert(
  condition: AlertCondition,
  incidentId: string | null,
  reason: string,
  operatorAction: string,
  evidenceJournalEventIds: readonly string[],
  status: AlertStatus = 'ACTIVE',
): OperationalAlert {
  return {
    alertId: `${condition}:${incidentId ?? 'system'}`,
    condition,
    severity: SEVERITY_FOR[condition],
    incidentId,
    reason,
    operatorAction,
    status,
    evidenceJournalEventIds,
  };
}

/**
 * The records within ONE case that carry a given outcome. Obtained by intersecting the view's
 * own outcome tally with the case's own record list rather than by re-scanning events, so an
 * alert's evidence is guaranteed to be the same records the totals above it were built from.
 */
function evidenceForOutcome(view: OperationalView, incident: IncidentSummary, outcome: string): readonly string[] {
  const owned = new Set(incident.journalEventIds);
  return (view.outcomes.find((tally) => tally.outcome === outcome)?.journalEventIds ?? []).filter((id) => owned.has(id));
}

/** The same intersection against the canonical failure-class tally. */
function evidenceForFailure(view: OperationalView, incident: IncidentSummary, failureClass: string): readonly string[] {
  const owned = new Set(incident.journalEventIds);
  return (view.failures.find((tally) => tally.failureClass === failureClass)?.journalEventIds ?? []).filter((id) =>
    owned.has(id),
  );
}

/** The one entry point. Pure, total, and stable for a given view and integrity report. */
export function deriveOperationalAlerts(
  view: OperationalView,
  integrity: ObservationIntegrity,
): readonly OperationalAlert[] {
  const alerts: OperationalAlert[] = [];

  // --- The instrument itself, first: it bounds how much the rest can be trusted. -------------
  if (integrity.kind === 'UNAVAILABLE') {
    alerts.push(
      alert(
        'OBSERVATION_UNMEASURABLE',
        null,
        `Whether any observation was lost cannot currently be determined. ${integrity.reason}`,
        'Treat every total on this surface as unbounded until the marker ledger and the journal are both readable again, then re-derive.',
        [],
      ),
    );
  }

  if (integrity.kind === 'KNOWN_LOSS') {
    alerts.push(
      alert(
        'OBSERVATION_LOSS',
        null,
        `${integrity.losses.length} observation(s) were intended but are not in the journal, so every total below understates what happened by at least that much.`,
        'Open each named record to see what was lost and why, and re-run the affected boundary if the underlying work needs re-observing.',
        integrity.losses.map((loss) => loss.journalEventId),
      ),
    );
  }

  // --- Per-case conditions, from what the execution boundary itself observed. -----------------
  for (const incident of view.incidents) {
    if (incident.hadUnresolvedDelivery) {
      alerts.push(
        alert(
          'UNRESOLVED_DELIVERY',
          incident.incidentId,
          'An action was attempted and the executor never confirmed either way, so whether it reached its recipient is genuinely unknown. It will not be retried automatically.',
          'Check the receiving system directly to establish whether the action happened, then either clear the durable claim so it can be re-attempted or record it as delivered.',
          evidenceForOutcome(view, incident, 'OUTCOME_UNKNOWN'),
        ),
      );
    }

    if (incident.outcomes.includes('FAILED_BEFORE_EFFECT')) {
      const recovered = incident.hadConfirmedDelivery;
      alerts.push(
        alert(
          'FAILED_DELIVERY',
          incident.incidentId,
          recovered
            ? 'An action confirmably did not happen, and a later attempt on the same case did succeed.'
            : 'An action confirmably did not happen. Nothing reached the recipient and no later attempt on this case succeeded.',
          recovered
            ? 'No action required. Retained so a recovery is visible rather than erased by the attempt that worked.'
            : 'Re-attempt the action once the underlying transport failure is understood; confirmed non-execution means a retry is safe.',
          evidenceForOutcome(view, incident, 'FAILED_BEFORE_EFFECT'),
          recovered ? 'RESOLVED_BY_LATER_EVIDENCE' : 'ACTIVE',
        ),
      );
    }

    if (incident.failureClasses.includes('HUMAN_APPROVAL_TIMEOUT')) {
      alerts.push(
        alert(
          'ATTENTION_OVERDUE',
          incident.incidentId,
          'The configured attention window for this case elapsed with nobody acting, and the engine raised it to the next owner.',
          'Pick the case up or reassign it. The system has already done everything its authority permits.',
          evidenceForFailure(view, incident, 'HUMAN_APPROVAL_TIMEOUT'),
        ),
      );
    }
  }

  /**
   * Total ordering, so two readers of the same evidence never see a different list: severity,
   * then condition, then subject. No tie is possible — `alertId` is exactly that triple's first
   * two components plus the third.
   */
  return alerts.sort(
    (a, b) =>
      SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
      a.condition.localeCompare(b.condition) ||
      (a.incidentId ?? '').localeCompare(b.incidentId ?? ''),
  );
}

/** Convenience for surfaces that show a headline count: conditions still genuinely open. */
export function activeAlerts(alerts: readonly OperationalAlert[]): readonly OperationalAlert[] {
  return alerts.filter((candidate) => candidate.status === 'ACTIVE');
}
