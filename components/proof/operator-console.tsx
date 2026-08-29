'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  LIVE_SELECTION_RULES,
  deriveLiveGrammar,
  type JournalWireEvent,
  type LiveGrammar,
  type LiveGrammarCell,
} from '@/lib/proof/live-grammar';

/**
 * LAYER C — the operator control room.
 *
 * Everything in this component talks to the real route handlers under
 * `app/api/lead-rescue/wait-incidents/`. No backend behaviour is reimplemented here and no
 * outcome is invented: each control posts once, and the panel renders the engine's OWN
 * outcome token together with a plain-language gloss.
 *
 * THE ONE THING THIS COMPONENT MUST NEVER DO is make a simulated send look live. The
 * dispatch control is labelled at the point of action, not in a footnote, because a buyer
 * clicking a button called "Send" has already been told something untrue by the time they
 * read the caveat.
 *
 * REFUSALS ARE THE PRODUCT. The role selector deliberately offers a role whose authority
 * ceiling is below the level this action requires. Choosing it produces a real refusal from
 * the real authority gate — which is the single most convincing thing this page can show,
 * and the reason the control exists at all.
 */

type Stage = 'review' | 'ready' | 'waiting';

interface IncidentSummary {
  readonly incidentId: string;
  readonly correlationId: string;
  readonly lifecycleState: string;
  readonly stage: Stage;
  readonly kind: 'reply' | 'offer' | null;
  readonly waitStartedAt: string | null;
  readonly windowHours: number | null;
  readonly deadlineAt: string | null;
  readonly revision: number;
  readonly awaitingHuman: string | null;
  readonly missingInformation: readonly string[];
  readonly bookingReadyAt: string | null;
  readonly contactName: string | null;
  readonly company: string | null;
  readonly reviewStartedAt: string | null;
  readonly attentionWindowHours: number | null;
  readonly attentionDeadlineAt: string | null;
  readonly attentionOverdue: boolean;
  readonly provenance: {
    readonly source: string;
    readonly sourceEventId: string;
    readonly ingestionPath: string;
  } | null;
}

interface Windows {
  readonly reply: number;
  readonly offer: number;
  readonly review: number;
  readonly dispatch: number;
}

/** Tone drives colour. `REFUSED` is deliberately not an error tone — a refusal is correct behaviour. */
type OutcomeTone = 'ACTED' | 'REFUSED' | 'HELD' | 'UNCERTAIN' | 'NEUTRAL';

interface OutcomeReading {
  readonly tone: OutcomeTone;
  readonly headline: string;
  readonly meaning: string;
}

/**
 * The engine's outcome tokens, glossed. Every key is a member of `DecisionOutcome`,
 * `DispatchOutcome`, or `WaitCheckOutcome` in `lib/engine/wait-resume.ts`. An unrecognised
 * token falls through to a labelled unknown rather than being silently prettified.
 */
const OUTCOME_READINGS: Readonly<Record<string, OutcomeReading>> = {
  ACCEPTED: {
    tone: 'ACTED',
    headline: 'Decision accepted',
    meaning:
      'The role had sufficient authority and the move was legal, so the case advanced. A new revision was written to disk.',
  },
  UNAUTHORIZED: {
    tone: 'REFUSED',
    headline: 'Refused — not enough authority',
    meaning:
      'The chosen role\u2019s authority ceiling is below the level this action requires. The case was left exactly as it was. This is the authority gate doing its job, not an error.',
  },
  REJECTED: {
    tone: 'REFUSED',
    headline: 'Refused — no declared transition permits this',
    meaning:
      'The requested move is not in the lifecycle graph from the case\u2019s current state, so it was refused and recorded. State did not change.',
  },
  STALE_REVISION: {
    tone: 'REFUSED',
    headline: 'Refused — the case moved on',
    meaning:
      'This submission was bound to an earlier revision of the record. Something else changed it first, so the stale instruction was refused rather than applied to a case it was not written for.',
  },
  NOT_UNDER_REVIEW: {
    tone: 'REFUSED',
    headline: 'Refused — not under review',
    meaning: 'The case is not in a state where a human decision applies.',
  },
  NOT_READY: {
    tone: 'REFUSED',
    headline: 'Refused — not ready to send',
    meaning: 'The case has not reached a state where an offer may be dispatched.',
  },
  ALREADY_DISPATCHED: {
    tone: 'HELD',
    headline: 'Refused — already dispatched',
    meaning:
      'A durable claim for this exact action was already confirmed, so a second send was refused. Nobody received it twice.',
  },
  CONFIRMED: {
    tone: 'ACTED',
    headline: 'Dispatched, and the clock started',
    meaning:
      'The claim was won, the executor confirmed, and only then was the sent-at timestamp durably recorded. The reply deadline now genuinely runs.',
  },
  UNCERTAIN: {
    tone: 'UNCERTAIN',
    headline: 'Outcome unknown — left unresolved',
    meaning:
      'A durable claim was recorded but never confirmed. This may or may not have gone out, so it is not retried on an assumption and not reported as sent. A person decides what happened.',
  },
  STILL_WAITING: {
    tone: 'NEUTRAL',
    headline: 'Still within the window',
    meaning:
      'The real clock was read and compared against the real deadline. Nothing was due, so this check was a genuine no-op.',
  },
  ELAPSED: {
    tone: 'ACTED',
    headline: 'Window elapsed — escalated',
    meaning:
      'The deadline had genuinely passed, so the case moved to a person through the ordinary authority and idempotency gates.',
  },
  ATTENTION_OVERDUE: {
    tone: 'HELD',
    headline: 'Nobody has acted — flagged, not decided',
    meaning:
      'The case has sat past its attention window, so that fact was durably recorded and addressed to the next owner. The check never decides, closes, or dispatches on a person\u2019s behalf, so the lifecycle state is unchanged.',
  },
  NOT_FOUND: {
    tone: 'NEUTRAL',
    headline: 'No such case',
    meaning: 'No record with that identifier exists in the store.',
  },
};

const UNKNOWN_OUTCOME: OutcomeReading = {
  tone: 'NEUTRAL',
  headline: 'Unrecognised outcome',
  meaning:
    'The route returned an outcome this panel does not have a gloss for. The raw response is below, unmodified.',
};

const TONE_COLOUR: Record<OutcomeTone, string> = {
  ACTED: 'var(--ok)',
  REFUSED: 'var(--blocked)',
  HELD: 'var(--warn)',
  UNCERTAIN: 'var(--prov-lab)',
  NEUTRAL: 'var(--ink-muted)',
};

/**
 * The live strip reuses Part Two's tone vocabulary rather than this panel's, because it is
 * literally the same five cells and a reader who learned the colours upstairs must not have
 * to relearn them here. `PERSON` is the one tone the action log has no use for.
 */
const GRAMMAR_TONE_COLOUR: Record<LiveGrammarCell['tone'], string> = {
  NEUTRAL: 'var(--ink-muted)',
  ACTED: 'var(--ok)',
  HELD: 'var(--blocked)',
  UNCERTAIN: 'var(--prov-lab)',
  PERSON: 'var(--prov-fixture)',
};

/**
 * The lane a case sits in, glossed for the outcome cell. Deliberately the same distinction the
 * lane headings below already make, so the strip cannot describe a case differently from the
 * section it is standing in.
 */
const STAGE_MEANING: Record<Stage, string> = {
  review: 'A named person owns this case and nothing is running against a clock.',
  ready: 'Enough is known to offer a next step. That is readiness, not delivery — nothing has been sent.',
  waiting: 'Parked deliberately against a real deadline that is genuinely running.',
};

const JOURNAL_ROUTE = '/api/lead-rescue/journal';

/**
 * Four states, because the journal has four genuinely different answers and an operator must
 * never be shown the same thing for "nothing happened" and "history is unreadable". The route
 * returns 409 for the latter precisely so a corrupt record cannot be rendered as a shorter,
 * successful-looking history.
 */
type JournalState =
  | { readonly kind: 'IDLE' }
  | { readonly kind: 'LOADING'; readonly incidentId: string }
  | { readonly kind: 'READY'; readonly incidentId: string; readonly events: readonly JournalWireEvent[] }
  | { readonly kind: 'UNREADABLE'; readonly incidentId: string; readonly detail: string };

/**
 * IDENTITY IS PROVEN, NOT CLAIMED, AND THIS PANEL HAS NO OTHER MODE.
 *
 * `DecideRequestSchema` and `DispatchRequestSchema` are `strictObject`s with no `decidedBy`
 * field, so a body that names its own role is rejected before a handler runs. Every action
 * below therefore exchanges the chosen principal for a credential this server signed and sends
 * that instead; the role is resolved from the credential by
 * `lib/service/operator-decision.ts` and never from anything this page sends.
 *
 * The roster comes from `GET /operator-session` rather than being authored here, because a
 * hard-coded ceiling that drifted from `data/profiles/kestrel/profile.ts` would mislabel the
 * one control this section exists for: choosing an operator who cannot clear the gate and
 * watching the gate refuse them.
 */
interface Principal {
  readonly principalId: string;
  readonly displayName: string;
  readonly roleId: string;
  readonly roleName: string | null;
  readonly authorityCeiling: number | null;
}

interface IdentityRuntime {
  readonly mode: string;
  /** False on a runtime holding a durable signing key: it issues no credentials of its own. */
  readonly sessionIssuerEnabled: boolean;
  readonly principals: readonly Principal[];
}

/**
 * Three states, because they are three genuinely different situations for a reader and only
 * one of them means the controls work. Collapsing "still asking" into "cannot act" would show
 * a refusal notice for a fraction of a second on every load; collapsing "cannot act" into
 * "still asking" would leave the controls looking available on a runtime that will refuse them.
 */
type IdentityState =
  | { readonly kind: 'LOADING' }
  | { readonly kind: 'READY'; readonly runtime: IdentityRuntime }
  | { readonly kind: 'UNAVAILABLE'; readonly detail: string };

const SESSION_ROUTE = '/api/lead-rescue/operator-session';

const DECISIONS = [
  { value: 'CLEARED_TO_PROCEED', label: 'Clear it to proceed' },
  { value: 'CLOSED_BAD_FIT', label: 'Close it — not a fit' },
  { value: 'ESCALATE', label: 'Escalate for a second opinion' },
];

// ---------------------------------------------------------------------------

interface ActionLog {
  readonly action: string;
  readonly outcome: string;
  readonly reading: OutcomeReading;
  readonly at: string;
  readonly raw: unknown;
}

export function readOutcome(payload: unknown): { outcome: string; reading: OutcomeReading } {
  const record = typeof payload === 'object' && payload !== null ? (payload as Record<string, unknown>) : {};

  if (typeof record['error'] === 'string') {
    const detail = typeof record['detail'] === 'string' ? record['detail'] : record['error'];

    /**
     * An authority refusal under the authenticated contract arrives as a top-level error rather
     * than as an outcome token, and it must not read as a malfunctioning route — it is the gate
     * working, and the most convincing thing this panel can show.
     *
     * `principal` is the discriminator because that boundary returns one only once it has proven
     * who is asking and never on a doubt. So its presence separates "we know who you are and you
     * may not do this" from "we could not establish who you are", which are different events and
     * would be a lie to merge: the first proves the authority model, the second proves nothing.
     */
    if (record['principal'] !== undefined) {
      return {
        outcome: 'UNAUTHORIZED',
        reading: {
          tone: 'REFUSED',
          headline: 'Refused — not enough authority',
          meaning: `${detail} The case was left exactly as it was. This is the authority gate doing its job, not an error.`,
        },
      };
    }

    return {
      outcome: 'ERROR',
      reading: {
        tone: 'REFUSED',
        headline: 'The route refused the request',
        meaning: detail,
      },
    };
  }

  // `check` returns either one `result` or an array of `results`; decide/dispatch return one.
  const single = record['result'];
  const many = record['results'];
  const first = Array.isArray(many) ? many[0] : single;
  const token =
    typeof first === 'object' && first !== null && typeof (first as Record<string, unknown>)['outcome'] === 'string'
      ? ((first as Record<string, unknown>)['outcome'] as string)
      : null;

  if (token === null) {
    if (record['parked'] !== undefined) {
      return {
        outcome: 'PARKED',
        reading: {
          tone: 'ACTED',
          headline: 'Case created and written to disk',
          meaning:
            'The real engine ran to a genuine human-review state, and the result was persisted. Nothing autonomous has happened to this case and nothing has gone out.',
        },
      };
    }
    return { outcome: 'UNKNOWN', reading: UNKNOWN_OUTCOME };
  }

  return { outcome: token, reading: OUTCOME_READINGS[token] ?? UNKNOWN_OUTCOME };
}

export function OperatorConsole() {
  const [incidents, setIncidents] = useState<readonly IncidentSummary[]>([]);
  const [windows, setWindows] = useState<Windows | null>(null);
  const [log, setLog] = useState<readonly ActionLog[]>([]);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [identity, setIdentity] = useState<IdentityState>({ kind: 'LOADING' });
  const [journal, setJournal] = useState<JournalState>({ kind: 'IDLE' });

  const readJournal = useCallback(async (incidentId: string) => {
    setJournal({ kind: 'LOADING', incidentId });
    try {
      const response = await fetch(`${JOURNAL_ROUTE}?incidentId=${encodeURIComponent(incidentId)}`);
      const payload: unknown = await response.json().catch(() => ({}));
      const record = typeof payload === 'object' && payload !== null ? (payload as Record<string, unknown>) : {};

      if (!response.ok) {
        setJournal({
          kind: 'UNREADABLE',
          incidentId,
          detail: typeof record['error'] === 'string' ? record['error'] : `the journal returned ${response.status}`,
        });
        return;
      }
      setJournal({
        kind: 'READY',
        incidentId,
        events: Array.isArray(record['events']) ? (record['events'] as readonly JournalWireEvent[]) : [],
      });
    } catch (error) {
      setJournal({
        kind: 'UNREADABLE',
        incidentId,
        detail: error instanceof Error ? error.message : 'the journal could not be reached',
      });
    }
  }, []);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch('/api/lead-rescue/wait-incidents');
      if (!response.ok) throw new Error(`the case list returned ${response.status}`);
      const data: { incidents: readonly IncidentSummary[]; windows: Windows } = await response.json();
      setIncidents(data.incidents);
      setWindows(data.windows);
      setFailure(null);
    } catch (error) {
      setFailure(error instanceof Error ? error.message : 'the case list could not be reached');
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    // Plain effect on purpose: this project deliberately carries no data-fetching library.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh]);

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch(SESSION_ROUTE);
        if (!response.ok) {
          setIdentity({ kind: 'UNAVAILABLE', detail: `the operator session route returned ${response.status}` });
          return;
        }
        setIdentity({ kind: 'READY', runtime: (await response.json()) as IdentityRuntime });
      } catch (error) {
        setIdentity({
          kind: 'UNAVAILABLE',
          detail: error instanceof Error ? error.message : 'the operator session route could not be reached',
        });
      }
    })();
  }, []);

  const post = useCallback(
    async (action: string, url: string, body: unknown, actor?: string) => {
      setBusy(true);
      try {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };

        if (actor !== undefined) {
          // Exchange the chosen principal for a credential this runtime minted, and let the
          // route resolve the role from it. The body is never touched: its schema is strict and
          // would refuse a role field outright.
          const minted = await fetch(SESSION_ROUTE, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ principalId: actor }),
          });
          const issued: unknown = await minted.json().catch(() => ({}));
          const token =
            typeof issued === 'object' && issued !== null && typeof (issued as Record<string, unknown>)['token'] === 'string'
              ? ((issued as Record<string, unknown>)['token'] as string)
              : null;

          if (token === null) {
            // Report this refusal rather than sending an unauthenticated request, which would be
            // refused for a second, unrelated reason and read as though the gate were broken.
            const { outcome, reading } = readOutcome(issued);
            setLog((entries) =>
              [{ action, outcome, reading, at: new Date().toISOString(), raw: issued }, ...entries].slice(0, 6),
            );
            return;
          }
          headers['Authorization'] = `Bearer ${token}`;
        }

        const response = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
        });
        const payload: unknown = await response.json().catch(() => ({}));
        const { outcome, reading } = readOutcome(payload);
        setLog((entries) =>
          [{ action, outcome, reading, at: new Date().toISOString(), raw: payload }, ...entries].slice(0, 6),
        );
        setFailure(null);
        await refresh();

        // Follow the case the operator just acted on, so the strip below is always about the
        // thing they last touched rather than whatever happened to be first in the list.
        const touched = incidentIdFrom(body, payload);
        if (touched !== null) await readJournal(touched);
      } catch (error) {
        setFailure(error instanceof Error ? error.message : 'the request could not be completed');
      } finally {
        setBusy(false);
      }
    },
    [refresh, readJournal],
  );

  useEffect(() => {
    // Open on a case rather than on an empty frame. Only ever runs while nothing is selected,
    // so it can never pull focus away from the case an operator is working on.
    if (journal.kind !== 'IDLE') return;
    const first = incidents[0];
    if (first === undefined) return;
    // Plain effect on purpose, as with `refresh` above: this project deliberately carries no
    // data-fetching library, and the guard above makes this run at most once per mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void readJournal(first.incidentId);
  }, [incidents, journal.kind, readJournal]);

  const review = incidents.filter((incident) => incident.stage === 'review');
  const ready = incidents.filter((incident) => incident.stage === 'ready');
  const waiting = incidents.filter((incident) => incident.stage === 'waiting');

  /**
   * Derived at render from the CURRENT case list rather than captured when the journal was
   * fetched, so the outcome cell cannot report a lifecycle state the store has since moved past.
   */
  const focusId = journal.kind === 'IDLE' ? null : journal.incidentId;
  const focus = incidents.find((incident) => incident.incidentId === focusId) ?? null;
  const grammar: LiveGrammar | null =
    journal.kind === 'READY'
      ? deriveLiveGrammar({
          incidentId: journal.incidentId,
          events: journal.events,
          lifecycleState: focus?.lifecycleState ?? null,
          lifecycleMeaning: focus === null ? null : STAGE_MEANING[focus.stage],
        })
      : null;

  return (
    <div className="space-y-6">
      {/* --- Honesty banner, before any control -------------------------- */}
      <div
        className="border rule rounded-sm p-4 space-y-2"
        style={{ background: 'var(--panel)', borderBlockStartWidth: '2px', borderBlockStartColor: 'var(--ok)' }}
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="badge" style={{ color: 'var(--ok)', borderColor: 'var(--ok)' }}>
            Real
          </span>
          <span className="instrument font-medium">
            These controls write to disk and read the real clock.
          </span>
        </div>
        <p className="instrument leading-relaxed prose-measure" style={{ color: 'var(--ink-muted)' }}>
          Unlike the incidents above, nothing here is a replay. Each button calls a route handler
          that re-reads the persisted case, applies exactly one event through the same engine, and
          returns its own outcome — including refusals. No process holds this state: the store on
          disk is the only place it lives, so its lifetime is that disk&apos;s lifetime — durable in
          a local checkout, ephemeral platform storage on the hosted demo.
        </p>
        <p className="instrument leading-relaxed prose-measure" style={{ color: 'var(--warn)' }}>
          One exception, stated up front: the outbound message itself is a stand-in. Nothing leaves
          this process and no recipient exists. The claim, the authority check, and the duplicate
          refusal around it are all real.
        </p>
        <p className="instrument leading-relaxed prose-measure" style={{ color: 'var(--ink-muted)' }}>
          <span className="label">Identity is proven, not claimed</span> This runtime refuses a
          request that names its own role. Each action below first obtains a credential this
          server signed, and the gate reads the operator&rsquo;s authority from the business
          profile rather than from anything this page sends.
          {identity.kind === 'READY' && !identity.runtime.sessionIssuerEnabled && (
            <>
              {' '}
              This particular runtime holds a durable signing key and issues no credentials of its
              own, so the controls below cannot act until a token is supplied out of band — and
              they will say so rather than appear to work.
            </>
          )}
          {identity.kind === 'UNAVAILABLE' && (
            <>
              {' '}
              The operator roster could not be read from this runtime ({identity.detail}), so no
              action can be attempted. Nothing below is disabled to hide a failure — there is
              simply no identity to act as.
            </>
          )}
        </p>
      </div>

      {failure !== null && (
        <p
          className="instrument border-l-2 pl-3 py-2 leading-relaxed"
          style={{ color: 'var(--blocked)', borderColor: 'var(--blocked)' }}
        >
          <span className="label" style={{ color: 'var(--blocked)' }}>
            Could not reach the operator routes
          </span>{' '}
          {failure}. This panel needs the dev or production server running; a statically exported
          copy of this page cannot drive it.
        </p>
      )}

      {/* --- Controls ---------------------------------------------------- */}
      <div className="border rule rounded-sm p-4 space-y-3" style={{ background: 'var(--paper-raised)' }}>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => post('Create a case needing a person', '/api/lead-rescue/wait-incidents', { kind: 'review' })}
            disabled={busy}
            className="badge disabled:opacity-40"
            style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}
          >
            Create a case that needs a person
          </button>
          <button
            type="button"
            onClick={() => post('Check every waiting case', '/api/lead-rescue/wait-incidents/check', {})}
            disabled={busy}
            className="badge disabled:opacity-40"
            style={{ borderColor: 'var(--rule-strong)' }}
          >
            Check every deadline now
          </button>
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={busy}
            className="badge disabled:opacity-40"
            style={{ borderColor: 'var(--rule-strong)' }}
          >
            Refresh
          </button>
        </div>

        <p className="instrument leading-relaxed" style={{ color: 'var(--ink-faint)' }}>
          Windows in force, read from the operator&rsquo;s own configured policy: reply{' '}
          {windows?.reply ?? '…'}h · offer {windows?.offer ?? '…'}h · review attention{' '}
          {windows?.review ?? '…'}h · unsent-but-ready attention {windows?.dispatch ?? '…'}h.
        </p>
      </div>

      {/* --- The same five cells, for a live case -------------------------- */}
      <LiveGrammarStrip
        journal={journal}
        grammar={grammar}
        incidents={incidents}
        contactName={focus?.contactName ?? null}
        onReload={readJournal}
        busy={busy}
      />

      {/* --- Action log --------------------------------------------------- */}
      {log.length > 0 && (
        <div className="border rule rounded-sm" style={{ background: 'var(--paper-raised)' }}>
          <h4 className="label px-4 py-2.5 border-b rule">What just happened</h4>
          <ul className="divide-y" style={{ borderColor: 'var(--rule)' }}>
            {log.map((entry, position) => (
              <li key={`${entry.at}-${position}`} className="p-4 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className="badge"
                    style={{ color: TONE_COLOUR[entry.reading.tone], borderColor: TONE_COLOUR[entry.reading.tone] }}
                  >
                    {entry.outcome.replace(/_/g, ' ')}
                  </span>
                  <span className="instrument font-medium">{entry.reading.headline}</span>
                  <span className="instrument ml-auto shrink-0" style={{ color: 'var(--ink-faint)' }}>
                    {entry.action}
                  </span>
                </div>
                <p className="instrument leading-relaxed" style={{ color: 'var(--ink-muted)' }}>
                  {entry.reading.meaning}
                </p>
                <details>
                  <summary className="label cursor-pointer hover:opacity-70">
                    The route&rsquo;s unmodified response
                  </summary>
                  <pre
                    className="instrument mt-2 overflow-x-auto border-l-2 pl-3"
                    style={{ color: 'var(--ink-faint)', borderColor: 'var(--rule-strong)' }}
                  >
                    {JSON.stringify(entry.raw, null, 2)}
                  </pre>
                </details>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* --- Lanes -------------------------------------------------------- */}
      <Lane
        title="A person owns these"
        blurb="Automation stopped on purpose. Nothing has gone anywhere, and no clock is running. A named person decides what happens next."
        count={review.length}
        loaded={loaded}
        empty="No case is currently under review. Create one above."
      >
        {review.map((incident) => (
          <ReviewCard key={incident.incidentId} incident={incident} busy={busy} post={post} identity={identity} />
        ))}
      </Lane>

      <Lane
        title="Ready to send — nothing sent yet"
        blurb="Enough is known to offer a next step. That is readiness, not delivery: no message has reached the prospect and no deadline is running until someone explicitly sends it."
        count={ready.length}
        loaded={loaded}
        empty="No case is currently ready and unsent."
      >
        {ready.map((incident) => (
          <DispatchCard key={incident.incidentId} incident={incident} busy={busy} post={post} identity={identity} />
        ))}
      </Lane>

      <Lane
        title="Waiting on a real deadline"
        blurb="A question was asked or an offer was genuinely dispatched, so a real clock is running against a real deadline."
        count={waiting.length}
        loaded={loaded}
        empty="No case is currently waiting."
      >
        {waiting.map((incident) => (
          <WaitingCard key={incident.incidentId} incident={incident} busy={busy} post={post} />
        ))}
      </Lane>
    </div>
  );
}

// ---------------------------------------------------------------------------

type Post = (action: string, url: string, body: unknown, actor?: string) => Promise<void>;

/**
 * The case an action was about. Read from the request body where the caller named one, and
 * otherwise from the record the route returned — which is the only way to follow a case that
 * did not exist when the button was pressed.
 */
function incidentIdFrom(body: unknown, payload: unknown): string | null {
  const fromBody = typeof body === 'object' && body !== null ? (body as Record<string, unknown>)['incidentId'] : undefined;
  if (typeof fromBody === 'string' && fromBody.length > 0) return fromBody;

  const record = typeof payload === 'object' && payload !== null ? (payload as Record<string, unknown>) : {};
  const parked = record['parked'];
  const fromParked = typeof parked === 'object' && parked !== null ? (parked as Record<string, unknown>)['incidentId'] : undefined;
  return typeof fromParked === 'string' && fromParked.length > 0 ? fromParked : null;
}

/**
 * THE SAME FIVE CELLS AS PART TWO, FOR A CASE THAT IS GENUINELY RUNNING.
 *
 * Everything rendered here was derived by `lib/proof/live-grammar.ts` from the execution
 * journal — the history the runtime writes about itself and re-reads from disk — never from
 * the HTTP responses in the log below. A cell the runtime did not write is drawn as absent
 * and says which of "not observed" and "did not happen" it is claiming, because the journal
 * is deliberately lossy and only the first of those is ever provable from it.
 */
function LiveGrammarStrip({
  journal,
  grammar,
  incidents,
  contactName,
  onReload,
  busy,
}: {
  readonly journal: JournalState;
  readonly grammar: LiveGrammar | null;
  readonly incidents: readonly IncidentSummary[];
  readonly contactName: string | null;
  readonly onReload: (incidentId: string) => Promise<void>;
  readonly busy: boolean;
}) {
  if (journal.kind === 'IDLE') {
    return (
      <div className="border rule rounded-sm p-4" style={{ background: 'var(--paper-raised)' }}>
        <h4 className="label">The runtime&rsquo;s own record</h4>
        <p className="instrument leading-relaxed prose-measure mt-2" style={{ color: 'var(--ink-muted)' }}>
          Create or act on a case above and its recorded history appears here, in the same five
          cells the incidents further up the page use.
        </p>
      </div>
    );
  }

  if (journal.kind === 'UNREADABLE') {
    return (
      <div
        className="border rule rounded-sm p-4 space-y-2"
        style={{ background: 'var(--panel)', borderBlockStartWidth: '2px', borderBlockStartColor: 'var(--blocked)' }}
      >
        <h4 className="label" style={{ color: 'var(--blocked)' }}>
          Retained history is unreadable
        </h4>
        <p className="instrument leading-relaxed prose-measure" style={{ color: 'var(--ink-muted)' }}>
          {journal.detail}. This is deliberately not shown as an empty history: a corrupt record
          rendered as a shorter, successful-looking run would be a fabricated history in the only
          sense that matters here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 space-y-1">
          <h4 className="label">The runtime&rsquo;s own record of this case</h4>
          <p className="instrument" style={{ color: 'var(--ink-faint)', overflowWrap: 'anywhere' }}>
            {contactName === null ? journal.incidentId : `${contactName} · ${journal.incidentId}`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {grammar !== null && (
            <span className="badge" style={{ borderColor: 'var(--rule-strong)', color: 'var(--ink-muted)' }}>
              {grammar.recordCount} record{grammar.recordCount === 1 ? '' : 's'} ·{' '}
              {grammar.observedStages} of 5 stages observed
            </span>
          )}
          {incidents.length > 1 && (
            <select
              aria-label="Case to read the record of"
              value={journal.incidentId}
              onChange={(event) => void onReload(event.target.value)}
              disabled={busy}
              className="proof-input"
              style={{ inlineSize: 'auto' }}
            >
              {incidents.map((incident) => (
                <option key={incident.incidentId} value={incident.incidentId}>
                  {incident.contactName ?? incident.incidentId}
                </option>
              ))}
            </select>
          )}
          <button
            type="button"
            onClick={() => void onReload(journal.incidentId)}
            disabled={busy || journal.kind === 'LOADING'}
            className="badge disabled:opacity-40"
            style={{ borderColor: 'var(--rule-strong)' }}
          >
            Re-read from disk
          </button>
        </div>
      </div>

      {grammar === null ? (
        <p className="instrument" style={{ color: 'var(--ink-faint)' }}>
          Reading the journal…
        </p>
      ) : (
        <>
          <ol
            className="grid gap-px border rule rounded-sm overflow-hidden lg:grid-cols-5"
            style={{ background: 'var(--rule)' }}
          >
            {grammar.cells.map((cell, position) => {
              const colour = GRAMMAR_TONE_COLOUR[cell.tone];
              const absent = cell.status === 'NOT_OBSERVED';
              return (
                <li
                  key={cell.stage}
                  className="min-w-0 p-4 space-y-2"
                  style={{
                    background: 'var(--paper-raised)',
                    borderBlockStart: `2px solid ${absent ? 'var(--rule-strong)' : colour}`,
                    opacity: absent ? 0.72 : 1,
                  }}
                >
                  <span className="flex items-center gap-2">
                    <span className="label" style={{ color: 'var(--ink-faint)' }}>
                      {position + 1}
                    </span>
                    <span className="label" style={{ color: absent ? 'var(--ink-faint)' : colour }}>
                      {cell.heading}
                    </span>
                  </span>
                  <span className="block text-[0.9375rem] leading-snug font-medium" style={{ overflowWrap: 'anywhere' }}>
                    {cell.headline}
                  </span>
                  {cell.technicalName !== null && (
                    <span
                      className="instrument block truncate"
                      style={{ color: 'var(--ink-faint)' }}
                      title={cell.technicalName}
                    >
                      {cell.technicalName}
                    </span>
                  )}
                  <span className="instrument block leading-relaxed" style={{ color: 'var(--ink-muted)' }}>
                    {cell.detail}
                  </span>
                  <span className="flex flex-wrap items-center gap-1.5">
                    <SourceBadge status={cell.status} />
                    {cell.executionMode !== null && (
                      <span
                        className="badge"
                        style={
                          cell.executionMode === 'LIVE'
                            ? { borderColor: 'var(--ok)', color: 'var(--ok)' }
                            : { borderColor: 'var(--warn)', color: 'var(--warn)' }
                        }
                        title="Read from the record the executor itself wrote, never inferred by this page."
                      >
                        {cell.executionMode === 'LIVE' ? 'Left the process' : 'Simulated transport'}
                      </span>
                    )}
                  </span>
                </li>
              );
            })}
          </ol>

          <details>
            <summary className="label cursor-pointer hover:opacity-70">
              How these five were chosen, and every record behind them
            </summary>
            <div className="mt-3 border-l-2 pl-4 space-y-4" style={{ borderColor: 'var(--rule-strong)' }}>
              <p className="instrument leading-relaxed prose-measure" style={{ color: 'var(--ink-muted)' }}>
                One fixed rule per cell, applied to every case. The journal is non-authoritative
                and never retries a failed write, so an absent record means the runtime did not
                observe that stage — never that it did not occur.
              </p>
              <dl className="instrument space-y-1.5">
                {LIVE_SELECTION_RULES.map((rule) => (
                  <div key={rule.stage} className="flex flex-col sm:flex-row sm:gap-3">
                    <dt className="label shrink-0 sm:w-24">{rule.stage}</dt>
                    <dd style={{ color: 'var(--ink-muted)' }}>{rule.rule}</dd>
                  </div>
                ))}
              </dl>
              {journal.kind === 'READY' && (
                <pre className="instrument overflow-x-auto" style={{ color: 'var(--ink-faint)' }}>
                  {JSON.stringify(journal.events, null, 2)}
                </pre>
              )}
            </div>
          </details>
        </>
      )}
    </div>
  );
}

function SourceBadge({ status }: { readonly status: LiveGrammarCell['status'] }) {
  if (status === 'OBSERVED') {
    return (
      <span
        className="badge"
        style={{ borderColor: 'var(--prov-evidence)', color: 'var(--prov-evidence)' }}
        title="Backed by a record the runtime durably wrote and re-read from disk."
      >
        Journal record
      </span>
    );
  }
  if (status === 'FROM_CASE_RECORD') {
    return (
      <span
        className="badge"
        style={{ borderColor: 'var(--rule-strong)', color: 'var(--ink-muted)' }}
        title="Read from the persisted case record. No journal event type produces an outcome record."
      >
        Case record on disk
      </span>
    );
  }
  return (
    <span
      className="badge"
      style={{ borderColor: 'var(--rule-strong)', color: 'var(--ink-faint)' }}
      title="The runtime wrote nothing here. That is a statement about what was observed, not about what happened."
    >
      Not observed
    </span>
  );
}

/**
 * The actor picker. The roster is the runtime's own and each ceiling is read from the business
 * profile server-side, so the numbers cannot drift from the policy the gate actually enforces.
 * It deliberately offers low-authority operators: choosing one produces a real refusal, which
 * is the point of the control.
 */
function ActorField({ label, identity }: { readonly label: string; readonly identity: IdentityState }) {
  if (identity.kind !== 'READY') {
    return (
      <Field label={label}>
        <select name="actor" disabled className="proof-input">
          <option>{identity.kind === 'LOADING' ? 'Reading the operator roster…' : 'No roster available'}</option>
        </select>
      </Field>
    );
  }

  const ranked = [...identity.runtime.principals].sort((a, b) => (b.authorityCeiling ?? 0) - (a.authorityCeiling ?? 0));
  const highest = ranked[0];

  return (
    <Field label={label}>
      <select name="actor" defaultValue={highest?.principalId} className="proof-input">
        {ranked.map((principal) => (
          <option key={principal.principalId} value={principal.principalId}>
            {principal.displayName} — {principal.roleName ?? principal.roleId}
            {principal.authorityCeiling === null ? '' : `, authority ${principal.authorityCeiling}`}
          </option>
        ))}
      </select>
    </Field>
  );
}

function Lane({
  title,
  blurb,
  count,
  loaded,
  empty,
  children,
}: {
  readonly title: string;
  readonly blurb: string;
  readonly count: number;
  readonly loaded: boolean;
  readonly empty: string;
  readonly children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="space-y-1">
        <div className="flex flex-wrap items-baseline gap-x-3">
          <h4 className="label">{title}</h4>
          <span className="instrument tabular-nums" style={{ color: 'var(--ink-faint)' }}>
            {count}
          </span>
        </div>
        <p className="instrument leading-relaxed prose-measure" style={{ color: 'var(--ink-muted)' }}>
          {blurb}
        </p>
      </div>
      {count === 0 ? (
        <p className="instrument" style={{ color: 'var(--ink-faint)' }}>
          {loaded ? empty : 'Loading…'}
        </p>
      ) : (
        <div className="space-y-4">{children}</div>
      )}
    </section>
  );
}

function CaseHeader({ incident }: { readonly incident: IncidentSummary }) {
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="instrument font-medium min-w-0" style={{ overflowWrap: 'anywhere' }}>
          {incident.contactName ?? incident.incidentId}
          {incident.company !== null && (
            <span style={{ color: 'var(--ink-muted)' }}> · {incident.company}</span>
          )}
        </span>
        <span className="flex flex-wrap items-center gap-2">
          {incident.provenance !== null && (
            <span
              className="badge"
              style={{ borderColor: 'var(--prov-evidence)', color: 'var(--prov-evidence)' }}
              title={`Source event id: ${incident.provenance.sourceEventId}`}
            >
              via {incident.provenance.ingestionPath}
            </span>
          )}
          <span className="badge" style={{ borderColor: 'var(--rule-strong)', color: 'var(--ink-muted)' }}>
            {incident.lifecycleState.replace(/_/g, ' ')}
          </span>
          <span className="badge" style={{ borderColor: 'var(--rule-strong)', color: 'var(--ink-faint)' }}>
            rev {incident.revision}
          </span>
        </span>
      </div>
      <p className="instrument" style={{ color: 'var(--ink-faint)', overflowWrap: 'anywhere' }}>
        {incident.incidentId}
      </p>
    </div>
  );
}

function AttentionRow({
  incident,
  anchorLabel,
  anchorAt,
  busy,
  post,
}: {
  readonly incident: IncidentSummary;
  readonly anchorLabel: string;
  readonly anchorAt: string | null;
  readonly busy: boolean;
  readonly post: Post;
}) {
  return (
    <div className="border rule rounded-sm p-3 space-y-2" style={{ background: 'var(--paper)' }}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="instrument" style={{ color: 'var(--ink-muted)' }}>
          Has anyone acted on it?
        </span>
        <span
          className="badge"
          style={
            incident.attentionOverdue
              ? { color: 'var(--warn)', background: 'var(--warn-bg)', borderColor: 'var(--warn)' }
              : { borderColor: 'var(--rule-strong)', color: 'var(--ink-muted)' }
          }
        >
          {incident.attentionOverdue ? 'Overdue' : 'Within policy'}
        </span>
      </div>
      <p className="instrument" style={{ color: 'var(--ink-faint)', overflowWrap: 'anywhere' }}>
        {anchorLabel} {anchorAt ?? '—'} · window {incident.attentionWindowHours ?? '…'}h · due{' '}
        {incident.attentionDeadlineAt ?? '—'}
      </p>
      <p className="instrument leading-relaxed" style={{ color: 'var(--ink-faint)' }}>
        Going overdue records that fact for the next owner. It never decides the case, closes it,
        or sends anything.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() =>
            post('Check this case (real clock)', '/api/lead-rescue/wait-incidents/check', {
              incidentId: incident.incidentId,
              advancePastDeadline: false,
            })
          }
          disabled={busy}
          className="badge disabled:opacity-40"
          style={{ borderColor: 'var(--rule-strong)' }}
        >
          Check now
        </button>
        <button
          type="button"
          onClick={() =>
            post('Check as if past the deadline', '/api/lead-rescue/wait-incidents/check', {
              incidentId: incident.incidentId,
              advancePastDeadline: true,
            })
          }
          disabled={busy}
          className="badge disabled:opacity-40"
          style={{ color: 'var(--warn)', borderColor: 'var(--warn)' }}
        >
          Jump past the deadline
        </button>
      </div>
      <p className="instrument" style={{ color: 'var(--ink-faint)' }}>
        &ldquo;Jump past the deadline&rdquo; is the one control here that does not use the real
        clock — it supplies a timestamp just past the deadline, through the identical code path a
        genuine hours-later check would take.
      </p>
    </div>
  );
}

function ReviewCard({
  incident,
  busy,
  post,
  identity,
}: {
  readonly incident: IncidentSummary;
  readonly busy: boolean;
  readonly post: Post;
  readonly identity: IdentityState;
}) {
  return (
    <form
      className="border rule rounded-sm p-4 space-y-3"
      style={{ background: 'var(--paper-raised)' }}
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        void post(
          'Record a human decision',
          '/api/lead-rescue/wait-incidents/decide',
          {
            incidentId: incident.incidentId,
            expectedRevision: incident.revision,
            decision: data.get('decision'),
            rationale: data.get('rationale'),
          },
          String(data.get('actor')),
        );
      }}
    >
      <CaseHeader incident={incident} />

      <p className="text-[0.9375rem] leading-relaxed">
        <span className="label">Why automation stopped</span> {incident.awaitingHuman ?? '—'}
      </p>

      {incident.missingInformation.length > 0 && (
        <p className="instrument leading-relaxed" style={{ color: 'var(--warn)' }}>
          <span className="label" style={{ color: 'var(--warn)' }}>
            Still unknown
          </span>{' '}
          {incident.missingInformation.join(', ')}
        </p>
      )}

      <AttentionRow
        incident={incident}
        anchorLabel="Under review since"
        anchorAt={incident.reviewStartedAt}
        busy={busy}
        post={post}
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <ActorField label="Decide as" identity={identity} />
        <Field label="Decision">
          <select name="decision" defaultValue="CLEARED_TO_PROCEED" className="proof-input">
            {DECISIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="Rationale, recorded with the decision">
        <input
          name="rationale"
          defaultValue="Reviewed the case personally and confirmed there is no blocker to proceeding."
          className="proof-input"
        />
      </Field>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={busy}
          className="badge disabled:opacity-40"
          style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}
        >
          Record the decision
        </button>
        <span className="instrument" style={{ color: 'var(--ink-faint)' }}>
          Choose an operator whose authority is below what this action requires to watch the gate
          refuse it.
        </span>
      </div>
    </form>
  );
}

function DispatchCard({
  incident,
  busy,
  post,
  identity,
}: {
  readonly incident: IncidentSummary;
  readonly busy: boolean;
  readonly post: Post;
  readonly identity: IdentityState;
}) {
  return (
    <form
      className="border rule rounded-sm p-4 space-y-3"
      style={{ background: 'var(--paper-raised)' }}
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        void post(
          'Dispatch the offer (simulated transport)',
          '/api/lead-rescue/wait-incidents/dispatch',
          {
            incidentId: incident.incidentId,
            expectedRevision: incident.revision,
            target: data.get('target'),
            offerSummary: data.get('offerSummary'),
          },
          String(data.get('actor')),
        );
      }}
    >
      <CaseHeader incident={incident} />

      <p className="instrument leading-relaxed" style={{ color: 'var(--ink-muted)' }}>
        Ready since {incident.bookingReadyAt ?? '—'}. No offer has been sent, so no reply deadline
        exists yet.
      </p>

      <AttentionRow
        incident={incident}
        anchorLabel="Ready since"
        anchorAt={incident.bookingReadyAt}
        busy={busy}
        post={post}
      />

      <Field label="Going to the prospect, never the owner">
        <input
          name="target"
          defaultValue={
            incident.contactName === null
              ? 'the prospect on file'
              : `${incident.contactName} (on file for this enquiry)`
          }
          className="proof-input"
        />
      </Field>

      <Field label="What the offer says">
        <input
          name="offerSummary"
          defaultValue="Offered a 30-minute scoping call for next Wednesday 10:00 or Thursday 14:00. No pricing or commitment stated."
          className="proof-input"
        />
      </Field>

      <div className="grid gap-3 sm:grid-cols-2">
        <ActorField label="Authorise as" identity={identity} />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={busy}
          className="badge disabled:opacity-40"
          style={{ borderColor: 'var(--warn)', color: 'var(--warn)' }}
        >
          Dispatch — simulated transport
        </button>
        <span className="instrument" style={{ color: 'var(--ink-faint)' }}>
          The claim and the authority check are real. The message itself goes nowhere.
        </span>
      </div>
    </form>
  );
}

function WaitingCard({
  incident,
  busy,
  post,
}: {
  readonly incident: IncidentSummary;
  readonly busy: boolean;
  readonly post: Post;
}) {
  return (
    <div className="border rule rounded-sm p-4 space-y-3" style={{ background: 'var(--paper-raised)' }}>
      <CaseHeader incident={incident} />

      <dl className="instrument grid gap-x-6 gap-y-1 sm:grid-cols-2">
        <div className="flex gap-2 min-w-0">
          <dt className="label shrink-0">Waiting on</dt>
          <dd>{incident.kind === 'reply' ? 'a reply from the prospect' : 'an answer to the offer'}</dd>
        </div>
        <div className="flex gap-2 min-w-0">
          <dt className="label shrink-0">Window</dt>
          <dd>{incident.windowHours ?? '…'}h</dd>
        </div>
        <div className="flex gap-2 min-w-0">
          <dt className="label shrink-0">Since</dt>
          <dd style={{ overflowWrap: 'anywhere' }}>{incident.waitStartedAt ?? '—'}</dd>
        </div>
        <div className="flex gap-2 min-w-0">
          <dt className="label shrink-0">Due</dt>
          <dd style={{ overflowWrap: 'anywhere' }}>{incident.deadlineAt ?? '—'}</dd>
        </div>
      </dl>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() =>
            post('Check this case (real clock)', '/api/lead-rescue/wait-incidents/check', {
              incidentId: incident.incidentId,
              advancePastDeadline: false,
            })
          }
          disabled={busy}
          className="badge disabled:opacity-40"
          style={{ borderColor: 'var(--rule-strong)' }}
        >
          Check now
        </button>
        <button
          type="button"
          onClick={() =>
            post('Check as if past the deadline', '/api/lead-rescue/wait-incidents/check', {
              incidentId: incident.incidentId,
              advancePastDeadline: true,
            })
          }
          disabled={busy}
          className="badge disabled:opacity-40"
          style={{ color: 'var(--warn)', borderColor: 'var(--warn)' }}
        >
          Jump past the deadline
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { readonly label: string; readonly children: React.ReactNode }) {
  return (
    <label className="block space-y-1 min-w-0">
      <span className="label">{label}</span>
      {children}
    </label>
  );
}
