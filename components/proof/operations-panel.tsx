import type { OperationalViewEvidence } from '@/lib/proof/n8n-evidence';
import type { Availability, IncidentSummary, OperationalView } from '@/lib/observability/operational-view';

/**
 * THE AGGREGATE OPERATIONAL PANEL.
 *
 * Everything above it on this page is one case at a time. This is the same evidence read
 * across every case the runtime retained, and it is deliberately the plainest section on the
 * page: an operational summary earns trust by being checkable, not by being attractive.
 *
 * THREE RULES IT FOLLOWS, because each corresponds to a way this kind of panel normally lies:
 *
 *   1. A number that was never measured is rendered as the words "not measured", never as a
 *      dash that could be mistaken for zero and never as zero itself.
 *   2. Attempts and leads are shown in separate columns with separate labels, so a suppressed
 *      replay can never read as a second delivery.
 *   3. Every headline figure has the per-case table underneath it, and every case row carries
 *      its own observation count, so any total can be added back up by hand.
 */

function millis(value: number): string {
  if (value < 1000) return `${value}ms`;
  if (value < 60_000) return `${(value / 1000).toFixed(1)}s`;
  if (value < 3_600_000) return `${Math.round(value / 60_000)}m`;
  return `${(value / 3_600_000).toFixed(1)}h`;
}

/** The only place an unavailable measurement is turned into text. Never a dash, never a zero. */
function Measured({ value }: { readonly value: Availability<number> }) {
  if (value.kind === 'UNAVAILABLE') {
    return (
      <span className="instrument" style={{ color: 'var(--waiting)' }} title={value.reason}>
        not measured
      </span>
    );
  }
  return <span className="instrument">{millis(value.value)}</span>;
}

function Figure({
  value,
  label,
  note,
  tone = 'ink',
}: {
  readonly value: string;
  readonly label: string;
  readonly note: string;
  readonly tone?: 'ink' | 'ok' | 'warn' | 'waiting';
}) {
  const color =
    tone === 'ok' ? 'var(--ok)' : tone === 'warn' ? 'var(--warn)' : tone === 'waiting' ? 'var(--waiting)' : 'var(--ink)';
  return (
    <div className="space-y-1 min-w-0">
      <p className="text-2xl leading-none" style={{ color }}>
        {value}
      </p>
      <p className="label">{label}</p>
      <p className="instrument leading-relaxed" style={{ color: 'var(--ink-muted)' }}>
        {note}
      </p>
    </div>
  );
}

function IncidentRow({ incident }: { readonly incident: IncidentSummary }) {
  return (
    <tr className="border-t rule align-top">
      <td className="py-2 pr-4">
        <p className="instrument break-all">{incident.incidentId}</p>
        <p className="instrument" style={{ color: 'var(--ink-muted)' }}>
          {incident.stages.join(' · ')}
        </p>
      </td>
      <td className="py-2 pr-4 instrument tabular-nums">{incident.eventCount}</td>
      <td className="py-2 pr-4">
        <Measured value={incident.observedIntervalMs} />
      </td>
      <td className="py-2 pr-4">
        <div className="flex flex-wrap gap-1">
          {incident.outcomes.map((outcome) => (
            <span
              key={outcome}
              className="badge"
              style={{
                color:
                  outcome === 'EXECUTED'
                    ? 'var(--ok)'
                    : outcome === 'REFUSED' || outcome === 'REJECTED'
                      ? 'var(--warn)'
                      : outcome === 'OUTCOME_UNKNOWN'
                        ? 'var(--waiting)'
                        : 'var(--ink-muted)',
                borderColor: 'var(--rule-strong)',
              }}
            >
              {outcome}
            </span>
          ))}
        </div>
      </td>
      <td className="py-2 instrument" style={{ color: 'var(--ink-muted)' }}>
        {incident.hadOperatorIntervention ? 'yes' : '—'}
      </td>
    </tr>
  );
}

function ViewBody({ view }: { readonly view: OperationalView }) {
  const intervals = view.timing.observedIntervals;

  return (
    <div className="space-y-6">
      {/* Headline figures. Leads and attempts are never mixed in one column. */}
      <div
        className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4 border rule rounded-sm p-4"
        style={{ background: 'var(--panel)' }}
      >
        <Figure
          value={String(view.incidentCount)}
          label="Leads observed"
          note={`${view.observationCount} recorded observations across them.`}
        />
        <Figure
          value={String(view.dispatch.incidentsWithConfirmedDelivery)}
          label="Leads delivered to"
          note={`From ${view.dispatch.attempts} execution attempts. Attempts are not deliveries.`}
          tone="ok"
        />
        <Figure
          value={String(view.intervention.incidentsWithIntervention)}
          label="Leads a person touched"
          note={`${view.intervention.humanDecisions} decisions, ${view.intervention.authenticationRefusals} identity refusals.`}
        />
        <Figure
          value={intervals.kind === 'AVAILABLE' ? millis(intervals.value.medianMs) : 'not measured'}
          label="Median observed interval"
          note={
            intervals.kind === 'AVAILABLE'
              ? `Across ${intervals.value.incidentsMeasured} measurable leads. Longest ${millis(intervals.value.maxMs)}.`
              : intervals.reason
          }
          tone={intervals.kind === 'AVAILABLE' ? 'ink' : 'waiting'}
        />
      </div>

      {/* The execution boundary, with the four verdicts kept apart. */}
      <div className="space-y-2">
        <p className="label">What happened at the execution boundary</p>
        <div className="grid gap-3 sm:grid-cols-4 border rule rounded-sm p-3" style={{ background: 'var(--paper-raised)' }}>
          {(
            [
              ['Executed', view.dispatch.executed, 'ok', 'The action was carried out.'],
              [
                'Suppressed duplicate',
                view.dispatch.suppressedDuplicate,
                'ink',
                'A prior claim already covered it. Nothing ran twice.',
              ],
              [
                'Failed before effect',
                view.dispatch.failedBeforeEffect,
                'warn',
                'Confirmed non-execution. Nothing reached anyone.',
              ],
              [
                'Outcome unknown',
                view.dispatch.outcomeUnknown,
                'waiting',
                'Genuinely unresolved. Never retried blindly, never counted as either.',
              ],
            ] as const
          ).map(([label, count, tone, gloss]) => (
            <div key={label} className="space-y-1">
              <p
                className="text-lg leading-none tabular-nums"
                style={{
                  color:
                    tone === 'ok'
                      ? 'var(--ok)'
                      : tone === 'warn'
                        ? 'var(--warn)'
                        : tone === 'waiting'
                          ? 'var(--waiting)'
                          : 'var(--ink)',
                }}
              >
                {count}
              </p>
              <p className="label">{label}</p>
              <p className="instrument leading-relaxed" style={{ color: 'var(--ink-muted)' }}>
                {gloss}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Where time actually went, from real deltas only. */}
      {view.timing.stageTransitions.length > 0 && (
        <div className="space-y-2">
          <p className="label">Where the observed time went</p>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr>
                  <th className="label pb-2 pr-4">Transition</th>
                  <th className="label pb-2 pr-4">Observed</th>
                  <th className="label pb-2 pr-4">Total elapsed</th>
                  <th className="label pb-2">Leads</th>
                </tr>
              </thead>
              <tbody>
                {view.timing.stageTransitions.map((transition) => (
                  <tr key={`${transition.from}>${transition.to}`} className="border-t rule">
                    <td className="py-2 pr-4 instrument">
                      {transition.from} → {transition.to}
                    </td>
                    <td className="py-2 pr-4 instrument tabular-nums">{transition.count}×</td>
                    <td className="py-2 pr-4 instrument tabular-nums">{millis(transition.totalMs)}</td>
                    <td className="py-2 instrument tabular-nums">{transition.incidentIds.length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="instrument leading-relaxed prose-measure" style={{ color: 'var(--ink-muted)' }}>
            Every figure here is the difference between two timestamps the runtime genuinely
            recorded at two boundaries. Nothing is estimated, and a gap between observations is
            reported as elapsed time, not as processing time — a parked case carries its whole
            waiting window inside it.
          </p>
        </div>
      )}

      {/* Failures, by the canonical vocabulary — never a second taxonomy. */}
      {view.failures.length > 0 && (
        <div className="space-y-2">
          <p className="label">Failure classes recorded</p>
          <div className="flex flex-wrap gap-2">
            {view.failures.map((failure) => (
              <span key={failure.failureClass} className="badge" style={{ color: 'var(--warn)', borderColor: 'var(--warn)' }}>
                {failure.failureClass} · {failure.count}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* The drill-down every headline figure reconciles to. */}
      <div className="space-y-2">
        <p className="label">Every lead behind those totals</p>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr>
                <th className="label pb-2 pr-4">Lead</th>
                <th className="label pb-2 pr-4">Observations</th>
                <th className="label pb-2 pr-4">Interval</th>
                <th className="label pb-2 pr-4">Outcomes observed</th>
                <th className="label pb-2">Person</th>
              </tr>
            </thead>
            <tbody>
              {view.incidents.map((incident) => (
                <IncidentRow key={incident.incidentId} incident={incident} />
              ))}
            </tbody>
          </table>
        </div>
        <p className="instrument leading-relaxed prose-measure" style={{ color: 'var(--ink-muted)' }}>
          The observation counts in this table sum to {view.observationCount}, the figure quoted
          above. {view.completeness.incidentsWithSingleObservation} of these leads have a single
          observation, so no interval exists for them and none is shown.
        </p>
      </div>

      <p className="instrument leading-relaxed prose-measure" style={{ color: 'var(--ink-muted)' }}>
        {view.completeness.basis}
      </p>
    </div>
  );
}

export function OperationsPanel({ evidence }: { readonly evidence: OperationalViewEvidence }) {
  if (evidence.kind !== 'PRESENT') {
    return (
      <div className="border rule rounded-sm p-4 space-y-2" style={{ background: 'var(--panel)' }}>
        <p className="label" style={{ color: 'var(--waiting)' }}>
          No aggregate claimed
        </p>
        <p className="instrument leading-relaxed prose-measure" style={{ color: 'var(--ink-muted)' }}>
          {evidence.detail}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="badge" style={{ color: 'var(--ok)', borderColor: 'var(--ok)' }}>
          RETAINED RUNTIME EVIDENCE
        </span>
        <span className="instrument" style={{ color: 'var(--ink-muted)' }}>
          Computed by the running application from its own journal
          {evidence.gitHead === null ? '' : ` at ${evidence.gitHead.slice(0, 7)}`}
          {evidence.capturedAt === null ? '' : `, captured ${evidence.capturedAt}`}.
        </span>
      </div>

      {evidence.scope !== null && (
        <p className="instrument leading-relaxed prose-measure" style={{ color: 'var(--ink-muted)' }}>
          {evidence.scope}
        </p>
      )}

      <ViewBody view={evidence.view} />

      {evidence.doesNotProve.length > 0 && (
        <div className="border rule rounded-sm p-3 space-y-2" style={{ background: 'var(--paper-raised)' }}>
          <p className="label">What this does not establish</p>
          <ul className="space-y-1">
            {evidence.doesNotProve.map((limit) => (
              <li key={limit} className="instrument leading-relaxed" style={{ color: 'var(--ink-muted)' }}>
                · {limit}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
