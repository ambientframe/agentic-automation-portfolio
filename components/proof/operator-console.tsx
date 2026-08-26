'use client';

import { useCallback, useEffect, useState } from 'react';

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
 * Two roles that deliberately straddle the gate: one clears it, one cannot. Ids and
 * authority levels match `data/profiles/kestrel/profile.ts`; the route resolves the role
 * itself, so a mismatch here surfaces as a real refusal rather than a wrong label.
 *
 * ONLY USED WHERE THE RUNTIME STILL TAKES A CALLER-SUPPLIED ROLE. See `IdentityRuntime`.
 */
const ROLES = [
  { id: 'client-partner', label: 'Client Partner — authority 3', hint: 'clears the gate' },
  { id: 'analyst', label: 'Compliance Analyst — authority 1', hint: 'will be refused' },
];

/**
 * THE OPERATOR BOUNDARY HAS TWO CONTRACTS IN FLIGHT, and this panel drives whichever one the
 * runtime it is talking to actually implements.
 *
 * Older: the caller names its own role in the request body (`decidedBy`).
 * Newer: identity is proven. The caller presents a bearer credential minted by the runtime,
 * the body carries no role at all, and the schemas are strict — so sending `decidedBy` is
 * refused outright rather than ignored.
 *
 * The panel asks the runtime which it is (`GET /operator-session`) instead of assuming, because
 * assuming wrongly is not a degraded demo: under the newer contract every action would return a
 * schema error, and the authority refusal — the most convincing thing on this page — would be
 * replaced by a validation complaint that proves nothing.
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

function readOutcome(payload: unknown): { outcome: string; reading: OutcomeReading } {
  const record = typeof payload === 'object' && payload !== null ? (payload as Record<string, unknown>) : {};

  if (typeof record['error'] === 'string') {
    return {
      outcome: 'ERROR',
      reading: {
        tone: 'REFUSED',
        headline: 'The route refused the request',
        meaning: record['error'],
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
  const [identity, setIdentity] = useState<IdentityRuntime | null>(null);

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
    // A capability probe, not data. A 404 is the expected answer on a runtime that predates the
    // authenticated contract, so it is not surfaced as a failure — it selects the other branch.
    void (async () => {
      try {
        const response = await fetch(SESSION_ROUTE);
        if (!response.ok) return;
        setIdentity((await response.json()) as IdentityRuntime);
      } catch {
        /* Offline or route absent. The legacy branch is the correct fallback either way. */
      }
    })();
  }, []);

  const post = useCallback(
    async (action: string, url: string, body: unknown, actor?: string) => {
      setBusy(true);
      try {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        let sent = body;

        if (actor !== undefined) {
          if (identity === null) {
            // Legacy contract: the caller names its own role, and the route believes it.
            sent = { ...(body as object), decidedBy: actor };
          } else {
            // Authenticated contract: exchange the chosen principal for a credential this
            // runtime minted, and let the route resolve the role from it. The body stays clean
            // because its schema is strict and would refuse a role field outright.
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
              // Report the refusal rather than sending an unauthenticated request that would be
              // refused for a second, unrelated reason and read as though the gate were broken.
              const { outcome, reading } = readOutcome(issued);
              setLog((entries) =>
                [{ action, outcome, reading, at: new Date().toISOString(), raw: issued }, ...entries].slice(0, 6),
              );
              return;
            }
            headers['Authorization'] = `Bearer ${token}`;
          }
        }

        const response = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify(sent),
        });
        const payload: unknown = await response.json().catch(() => ({}));
        const { outcome, reading } = readOutcome(payload);
        setLog((entries) =>
          [{ action, outcome, reading, at: new Date().toISOString(), raw: payload }, ...entries].slice(0, 6),
        );
        setFailure(null);
        await refresh();
      } catch (error) {
        setFailure(error instanceof Error ? error.message : 'the request could not be completed');
      } finally {
        setBusy(false);
      }
    },
    [refresh, identity],
  );

  const review = incidents.filter((incident) => incident.stage === 'review');
  const ready = incidents.filter((incident) => incident.stage === 'ready');
  const waiting = incidents.filter((incident) => incident.stage === 'waiting');

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
          returns its own outcome — including refusals. Restarting the server changes nothing,
          because the file on disk is the only place this state lives.
        </p>
        <p className="instrument leading-relaxed prose-measure" style={{ color: 'var(--warn)' }}>
          One exception, stated up front: the outbound message itself is a stand-in. Nothing leaves
          this process and no recipient exists. The claim, the authority check, and the duplicate
          refusal around it are all real.
        </p>
        {identity !== null && (
          <p className="instrument leading-relaxed prose-measure" style={{ color: 'var(--ink-muted)' }}>
            <span className="label">Identity is proven, not claimed</span> This runtime refuses a
            request that names its own role. Each action below first obtains a credential this
            server signed, and the gate reads the operator&rsquo;s authority from the business
            profile rather than from anything this page sends.
            {!identity.sessionIssuerEnabled &&
              ' This particular runtime holds a durable signing key and issues no credentials of its own, so the controls below cannot act until a token is supplied out of band — and they will say so rather than appear to work.'}
          </p>
        )}
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
 * The actor picker. Under the authenticated contract the roster is the runtime's own, and each
 * ceiling is read from the business profile server-side — so the numbers cannot drift from the
 * policy the gate actually enforces. It deliberately offers low-authority operators: choosing
 * one produces a real refusal, which is the point of the control.
 */
function ActorField({ label, identity }: { readonly label: string; readonly identity: IdentityRuntime | null }) {
  if (identity === null) {
    return (
      <Field label={label}>
        <select name="actor" defaultValue="client-partner" className="proof-input">
          {ROLES.map((role) => (
            <option key={role.id} value={role.id}>
              {role.label} · {role.hint}
            </option>
          ))}
        </select>
      </Field>
    );
  }

  const ranked = [...identity.principals].sort((a, b) => (b.authorityCeiling ?? 0) - (a.authorityCeiling ?? 0));
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
  readonly identity: IdentityRuntime | null;
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
  readonly identity: IdentityRuntime | null;
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
