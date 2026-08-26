'use client';

import { useCallback, useState } from 'react';

/**
 * THE RUN HISTORY — "what happened to this lead?", answered without reading source.
 *
 * Two readers at once, which is the whole design constraint: a business owner who needs the
 * operating meaning of each step in a sentence, and a technical reviewer who needs the
 * canonical identifiers to falsify it. The sentence is always visible; the identifiers are one
 * disclosure away. Neither reader is made to scroll past the other's material, and nothing is
 * presented as a JSON dump.
 *
 * NOT A DASHBOARD, deliberately. There are no aggregate metrics and no charts here. A count of
 * events per hour would look like observability while answering none of the questions an
 * operator actually has; a chronological sequence of what was observed answers all of them.
 *
 * Colour follows the portfolio's existing runtime/provenance semantics rather than inventing a
 * scale: `--ok` for something that genuinely happened, `--suppressed` for a correctly refused
 * duplicate, `--blocked` for a refusal, `--warn` for genuine uncertainty.
 */

export type JournalStage = 'TRIGGER' | 'DECISION' | 'AUTHORITY' | 'ACTION' | 'OUTCOME';

export interface RunHistoryEvent {
  readonly journalEventId: string;
  readonly recordedAt: string;
  readonly incidentId: string;
  readonly correlationId: string;
  readonly revision?: number;
  readonly stage: JournalStage;
  readonly type: string;
  readonly mechanism?: string;
  readonly outcome: string;
  readonly failureClass?: string;
  readonly executionMode?: 'SIMULATED' | 'LIVE';
  readonly actorId?: string;
  readonly operationClaimId?: string;
  readonly ruleId?: string;
  readonly provenance?: { readonly source: string; readonly sourceEventId: string; readonly ingestionPath: string };
  readonly detail?: string;
}

/** Operating meaning, per outcome. Never a restatement of the token itself. */
const OUTCOME_MEANING: Record<string, string> = {
  ACCEPTED: 'Accepted',
  REJECTED: 'Rejected by the rules',
  REFUSED: 'Refused — not permitted',
  SUPPRESSED_DUPLICATE: 'Duplicate — nothing ran twice',
  EXECUTED: 'Carried out',
  FAILED_BEFORE_EFFECT: 'Failed — nothing was sent',
  OUTCOME_UNKNOWN: 'Unresolved — may have happened',
  NO_ACTION: 'Nothing to do yet',
  ESCALATED: 'Raised to the next owner',
  RESOLVED: 'Window elapsed — case moved on',
  NOT_FOUND: 'No such case',
};

const OUTCOME_COLOUR: Record<string, string> = {
  ACCEPTED: 'var(--ok)',
  EXECUTED: 'var(--ok)',
  RESOLVED: 'var(--ok)',
  SUPPRESSED_DUPLICATE: 'var(--suppressed)',
  REJECTED: 'var(--blocked)',
  REFUSED: 'var(--blocked)',
  NOT_FOUND: 'var(--blocked)',
  FAILED_BEFORE_EFFECT: 'var(--warn)',
  OUTCOME_UNKNOWN: 'var(--warn)',
  ESCALATED: 'var(--warn)',
  NO_ACTION: 'var(--waiting)',
};

/** What the step WAS, in an owner's words. The stage supplies the grammar. */
const STAGE_MEANING: Record<JournalStage, string> = {
  TRIGGER: 'A lead arrived',
  DECISION: 'The system evaluated the case',
  AUTHORITY: 'A person decided',
  ACTION: 'An outbound action was attempted',
  OUTCOME: 'Outcome',
};

/** Who was responsible — the distinction a buyer most often asks about. */
const MECHANISM_MEANING: Record<string, string> = {
  DETERMINISTIC_RULE: 'fixed rule',
  BOUNDED_AI_JUDGMENT: 'bounded AI judgment',
  HUMAN_DECISION: 'human decision',
  EXECUTION: 'execution',
};

function formatTime(iso: string): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return iso;
  return new Date(ms).toISOString().replace('T', ' ').replace('.000Z', 'Z');
}

function Identifier({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="flex flex-wrap gap-x-2 gap-y-0.5">
      <dt className="label shrink-0">{label}</dt>
      <dd className="instrument min-w-0" style={{ color: 'var(--ink-muted)' }}>
        {value}
      </dd>
    </div>
  );
}

function HistoryRow({ event }: { readonly event: RunHistoryEvent }) {
  const colour = OUTCOME_COLOUR[event.outcome] ?? 'var(--ink-muted)';
  const identifiers: Array<[string, string]> = [
    ['Recorded at', event.recordedAt],
    ['Observation id', event.journalEventId],
    ...(event.revision === undefined ? [] : ([['Case revision', String(event.revision)]] as Array<[string, string]>)),
    ...(event.ruleId === undefined ? [] : ([['Rule', event.ruleId]] as Array<[string, string]>)),
    ...(event.operationClaimId === undefined ? [] : ([['Operation claim', event.operationClaimId]] as Array<[string, string]>)),
    ...(event.actorId === undefined ? [] : ([['Actor', event.actorId]] as Array<[string, string]>)),
    ...(event.failureClass === undefined ? [] : ([['Failure class', event.failureClass]] as Array<[string, string]>)),
    ...(event.provenance === undefined
      ? []
      : ([
          ['Source', `${event.provenance.source} via ${event.provenance.ingestionPath}`],
          ['Source event id', event.provenance.sourceEventId],
        ] as Array<[string, string]>)),
    ['Correlation', event.correlationId],
  ];

  return (
    <li className="border-b rule py-3 space-y-2 last:border-b-0">
      <div className="flex flex-wrap items-center gap-2">
        <span className="badge self-start" style={{ borderColor: 'var(--rule-strong)', color: 'var(--ink-faint)' }}>
          {event.stage}
        </span>
        <span className="badge self-start" style={{ borderColor: colour, color: colour }}>
          {OUTCOME_MEANING[event.outcome] ?? event.outcome}
        </span>
        {event.executionMode === undefined ? null : (
          <span
            className="badge self-start"
            style={
              event.executionMode === 'LIVE'
                ? { borderColor: 'var(--prov-evidence)', color: 'var(--prov-evidence)', background: 'var(--prov-evidence-bg)' }
                : { borderColor: 'var(--prov-fixture)', color: 'var(--prov-fixture)', background: 'var(--prov-fixture-bg)' }
            }
            title={
              event.executionMode === 'LIVE'
                ? 'A real executor ran and something genuinely left this process.'
                : 'A simulated executor ran. Nothing left this process.'
            }
          >
            {event.executionMode === 'LIVE' ? 'real execution' : 'simulated'}
          </span>
        )}
        <span className="instrument ml-auto shrink-0" style={{ color: 'var(--ink-faint)' }}>
          {formatTime(event.recordedAt)}
        </span>
      </div>

      <p className="text-sm leading-relaxed">
        <span style={{ color: 'var(--ink)' }}>{STAGE_MEANING[event.stage]}</span>
        {event.mechanism === undefined ? null : (
          <span style={{ color: 'var(--ink-faint)' }}> · {MECHANISM_MEANING[event.mechanism] ?? event.mechanism}</span>
        )}
        {event.detail === undefined ? null : <span style={{ color: 'var(--ink-muted)' }}> — {event.detail}</span>}
      </p>

      <details className="group">
        <summary className="label cursor-pointer select-none" style={{ color: 'var(--ink-faint)' }}>
          Identifiers
        </summary>
        <dl className="mt-2 space-y-1 pl-3 border-l rule">
          {identifiers.map(([label, value]) => (
            <Identifier key={label} label={label} value={value} />
          ))}
        </dl>
      </details>
    </li>
  );
}

/**
 * Every loaded state carries the case it belongs to. A result is rendered only when it still
 * matches the case being displayed, so history can never be shown under the wrong lead — a
 * cheaper and more reliable guarantee than resetting state from an effect.
 */
type State =
  | { readonly kind: 'IDLE' }
  | { readonly kind: 'LOADING'; readonly forIncidentId: string }
  | { readonly kind: 'READY'; readonly forIncidentId: string; readonly events: readonly RunHistoryEvent[] }
  | { readonly kind: 'ERROR'; readonly forIncidentId: string; readonly message: string };

/**
 * Fetches and renders one case's retained history. `IDLE` is genuinely distinct from an empty
 * `READY` — "not looked yet" must never render like "nothing ever happened".
 */
export function RunHistory({ incidentId }: { readonly incidentId: string }) {
  const [loaded, setState] = useState<State>({ kind: 'IDLE' });
  const state: State = loaded.kind === 'IDLE' || loaded.forIncidentId === incidentId ? loaded : { kind: 'IDLE' };

  const load = useCallback(async () => {
    setState({ kind: 'LOADING', forIncidentId: incidentId });
    try {
      const response = await fetch(`/api/lead-rescue/journal?incidentId=${encodeURIComponent(incidentId)}`, {
        cache: 'no-store',
      });
      const body: unknown = await response.json();
      if (!response.ok) {
        const message =
          typeof body === 'object' && body !== null && 'error' in body && typeof (body as { error: unknown }).error === 'string'
            ? (body as { error: string }).error
            : `request failed with status ${response.status}`;
        setState({ kind: 'ERROR', forIncidentId: incidentId, message });
        return;
      }
      const events = (body as { events?: readonly RunHistoryEvent[] }).events ?? [];
      setState({ kind: 'READY', forIncidentId: incidentId, events });
    } catch (error) {
      setState({
        kind: 'ERROR',
        forIncidentId: incidentId,
        message: error instanceof Error ? error.message : 'could not reach the journal',
      });
    }
  }, [incidentId]);

  return (
    <section className="mt-3 border-t rule pt-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="label" style={{ color: 'var(--ink-faint)' }}>
          Run history
        </h4>
        <button
          type="button"
          onClick={() => void load()}
          className="badge self-start"
          style={{ borderColor: 'var(--rule-strong)', color: 'var(--ink-muted)', cursor: 'pointer' }}
        >
          {state.kind === 'LOADING' ? 'loading…' : state.kind === 'IDLE' ? 'show what happened' : 'refresh'}
        </button>
      </div>

      {state.kind === 'IDLE' ? (
        <p className="instrument" style={{ color: 'var(--ink-faint)' }}>
          Retained observations for this case, read back from disk. Not loaded yet.
        </p>
      ) : null}

      {state.kind === 'ERROR' ? (
        <p className="instrument" style={{ color: 'var(--warn)' }}>
          History could not be read: {state.message}. This is not an empty history — treat it as unknown.
        </p>
      ) : null}

      {state.kind === 'READY' && state.events.length === 0 ? (
        <p className="instrument" style={{ color: 'var(--ink-muted)' }}>
          No observations were recorded for this case. Nothing consequential has happened to it yet — this is an
          empty history, not a completed run.
        </p>
      ) : null}

      {state.kind === 'READY' && state.events.length > 0 ? (
        <>
          <ol className="border-t rule">
            {state.events.map((event) => (
              <HistoryRow key={event.journalEventId} event={event} />
            ))}
          </ol>
          <p className="instrument" style={{ color: 'var(--ink-faint)' }}>
            Observability only. This history records what was observed; it is never consulted to decide anything,
            and evaluations that changed nothing are deliberately not recorded.
          </p>
        </>
      ) : null}
    </section>
  );
}
