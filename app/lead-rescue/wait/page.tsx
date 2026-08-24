'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';

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
  /** The operational-attention timeout (lr-fm-approval-timeout) — review/ready stages only. */
  readonly reviewStartedAt: string | null;
  readonly attentionWindowHours: number | null;
  readonly attentionDeadlineAt: string | null;
  readonly attentionOverdue: boolean;
}

const KIND_LABEL: Record<'reply' | 'offer', string> = {
  reply: 'reply (lr-t14)',
  offer: 'offer (lr-t22)',
};

/** Two roles, deliberately spanning the authority gate: one passes it, one does not. */
const DECIDER_OPTIONS = [
  { id: 'client-partner', label: 'Client partner — authority 3 (sufficient)' },
  { id: 'analyst', label: 'Analyst — authority 1 (insufficient; will be rejected)' },
];

const DECISION_OPTIONS = [
  { value: 'CLEARED_TO_PROCEED', label: 'Clear to proceed' },
  { value: 'CLOSED_BAD_FIT', label: 'Close — not a fit' },
  { value: 'ESCALATE', label: 'Escalate for a second opinion' },
];

/**
 * The operational-attention timeout, shown wherever a case can sit unattended
 * (lr-fm-approval-timeout): what the system is waiting for, its authoritative anchor and
 * deadline, whether it is still within policy or overdue, what action is permitted next, and —
 * explicitly — what the timeout does NOT do. Crossing the deadline never moves the case out of
 * this section; it only raises a durably-recorded attention condition, checkable the same way
 * as the prospect-response waits below.
 */
function AttentionTimeoutPanel({
  label,
  waitingFor,
  anchorLabel,
  anchorAt,
  deadlineAt,
  windowHours,
  overdue,
  permitted,
  notDone,
  busy,
  onCheck,
  onSimulate,
}: {
  readonly label: string;
  readonly waitingFor: string;
  readonly anchorLabel: string;
  readonly anchorAt: string | null;
  readonly deadlineAt: string | null;
  readonly windowHours: number | null;
  readonly overdue: boolean;
  readonly permitted: string;
  readonly notDone: string;
  readonly busy: boolean;
  readonly onCheck: () => void;
  readonly onSimulate: () => void;
}) {
  return (
    <div className="border rule rounded-sm p-2 space-y-1" style={{ background: 'var(--paper)' }}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="instrument text-sm" style={{ color: 'var(--ink-muted)' }}>
          {label} — waiting on: {waitingFor}
        </span>
        <span
          className="badge text-xs"
          style={overdue ? { color: 'var(--warn)', borderColor: 'var(--warn)' } : { borderColor: 'var(--rule-strong)' }}
        >
          {overdue ? 'OVERDUE — not yet escalated by a check' : 'within policy'}
        </span>
      </div>
      <p className="instrument text-xs" style={{ color: 'var(--ink-faint)' }}>
        Anchor ({anchorLabel}): {anchorAt ?? '—'} · window: {windowHours ?? '…'}h · deadline: {deadlineAt ?? '—'}
      </p>
      <p className="instrument text-xs" style={{ color: 'var(--ink-faint)' }}>
        If overdue: permitted next action is &ldquo;{permitted}&rdquo;. {notDone}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={onCheck} disabled={busy} className="badge text-xs">
          Check attention timeout
        </button>
        <button
          type="button"
          onClick={onSimulate}
          disabled={busy}
          className="badge text-xs"
          style={{ color: 'var(--warn)', borderColor: 'var(--warn)' }}
        >
          Simulate past deadline &amp; check
        </button>
      </div>
    </div>
  );
}

export default function LeadRescueWaitPage() {
  const [incidents, setIncidents] = useState<readonly IncidentSummary[]>([]);
  const [windows, setWindows] = useState<{ reply: number; offer: number; review: number; dispatch: number } | null>(null);
  const [lastResult, setLastResult] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const res = await fetch('/api/lead-rescue/wait-incidents');
    const data: {
      incidents: readonly IncidentSummary[];
      windows: { reply: number; offer: number; review: number; dispatch: number };
    } = await res.json();
    setIncidents(data.incidents);
    setWindows(data.windows);
  }, []);

  useEffect(() => {
    // Fetch-on-mount. No data-fetching library is in this project's dependency set
    // (see docs/FIDELITY_ASSESSMENT.md's package.json constraint), so this stays a plain
    // effect rather than reaching for one just to satisfy the lint rule below.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh]);

  const parkDemoIncident = useCallback(
    async (kind: 'reply' | 'offer' | 'review') => {
      setBusy(true);
      try {
        await fetch('/api/lead-rescue/wait-incidents', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ kind }),
        });
        await refresh();
      } finally {
        setBusy(false);
      }
    },
    [refresh],
  );

  const checkNow = useCallback(
    async (incidentId?: string, advancePastDeadline = false) => {
      setBusy(true);
      try {
        const res = await fetch('/api/lead-rescue/wait-incidents/check', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ incidentId, advancePastDeadline }),
        });
        const data: unknown = await res.json();
        setLastResult(data);
        await refresh();
      } finally {
        setBusy(false);
      }
    },
    [refresh],
  );

  const submitDecision = useCallback(
    async (incidentId: string, expectedRevision: number, form: HTMLFormElement) => {
      const data = new FormData(form);
      setBusy(true);
      try {
        const res = await fetch('/api/lead-rescue/wait-incidents/decide', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            incidentId,
            expectedRevision,
            decidedBy: data.get('decidedBy'),
            decision: data.get('decision'),
            rationale: data.get('rationale'),
          }),
        });
        const result: unknown = await res.json();
        setLastResult(result);
        await refresh();
      } finally {
        setBusy(false);
      }
    },
    [refresh],
  );

  const submitDispatch = useCallback(
    async (incidentId: string, expectedRevision: number, form: HTMLFormElement) => {
      const data = new FormData(form);
      setBusy(true);
      try {
        const res = await fetch('/api/lead-rescue/wait-incidents/dispatch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            incidentId,
            expectedRevision,
            decidedBy: data.get('decidedBy'),
            target: data.get('target'),
            offerSummary: data.get('offerSummary'),
          }),
        });
        const result: unknown = await res.json();
        setLastResult(result);
        await refresh();
      } finally {
        setBusy(false);
      }
    },
    [refresh],
  );

  const reviewIncidents = incidents.filter((i) => i.stage === 'review');
  const readyIncidents = incidents.filter((i) => i.stage === 'ready');
  const waitingIncidents = incidents.filter((i) => i.stage === 'waiting');

  return (
    <div className="mx-auto max-w-4xl px-6 py-12 space-y-8">
      <nav className="instrument">
        <Link href="/systems/lead-rescue" style={{ color: 'var(--ink-muted)' }} className="hover:opacity-70">
          ← Lead Rescue dossier
        </Link>
      </nav>

      <header className="space-y-4">
        <span className="label">Lead Rescue · wait/resume, live</span>
        <h1 className="display text-3xl sm:text-4xl">A reviewed offer, followed end to end</h1>
        <p className="lede prose-measure">
          Every scenario in the simulator replays a deterministic run from authored fixture
          events. This page does not: every action below writes a real record to a JSON file
          on disk and reads the real server clock. Follow one case through the full journey —
          a person reviews why automation stopped, decides what happens next, a genuinely
          separate action despatches a simulated offer to the prospect, and only THAT starts
          the durable countdown to escalation.
        </p>
      </header>

      {/* ------------------------------------------------------------------ */}
      {/* Stage 1: park a demo case */}
      {/* ------------------------------------------------------------------ */}
      <section className="border rule rounded-sm p-4 space-y-3" style={{ background: 'var(--panel)' }}>
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => parkDemoIncident('review')}
            disabled={busy}
            className="badge"
            style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}
          >
            Start a case needing human review (lr-t11 → lr-t24)
          </button>
          <button
            onClick={() => parkDemoIncident('reply')}
            disabled={busy}
            className="badge"
          >
            Park a demo incident (reply, lr-t14)
          </button>
          <button
            onClick={() => parkDemoIncident('offer')}
            disabled={busy}
            className="badge"
          >
            Park a demo incident (direct offer, lr-t22)
          </button>
          <button onClick={() => checkNow()} disabled={busy} className="badge" style={{ borderColor: 'var(--rule-strong)' }}>
            Check all waiting now (real clock)
          </button>
        </div>
        <p className="instrument" style={{ color: 'var(--ink-faint)' }}>
          Prospect-response windows: reply {windows?.reply ?? '…'}h (kestrel-reply-wait-window) · offer{' '}
          {windows?.offer ?? '…'}h (kestrel-booking-offer-window)
          <br />
          Operator-attention windows: review {windows?.review ?? '…'}h (kestrel-review-timeout-window) ·
          dispatch {windows?.dispatch ?? '…'}h (kestrel-dispatch-timeout-window)
        </p>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Stage 2: cases under human review */}
      {/* ------------------------------------------------------------------ */}
      <section className="border rule rounded-sm p-4 space-y-4" style={{ background: 'var(--panel)' }}>
        <div>
          <h2 className="label">Cases under human review</h2>
          <p className="instrument" style={{ color: 'var(--ink-muted)' }}>
            Automation stopped on purpose. No message has gone anywhere. A named person decides what happens next.
          </p>
        </div>
        {reviewIncidents.length === 0 && (
          <p className="instrument" style={{ color: 'var(--ink-faint)' }}>
            No cases currently under review.
          </p>
        )}
        <div className="space-y-4">
          {reviewIncidents.map((incident) => (
            <form
              key={incident.incidentId}
              className="border rule rounded-sm p-3 space-y-2"
              onSubmit={(e) => {
                e.preventDefault();
                submitDecision(incident.incidentId, incident.revision, e.currentTarget);
              }}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="instrument font-medium">{incident.incidentId}</span>
                <span className="badge" style={{ borderColor: 'var(--rule-strong)' }}>{incident.lifecycleState}</span>
              </div>
              {(incident.contactName ?? incident.company) !== null && (
                <p className="instrument" style={{ color: 'var(--ink-muted)' }}>
                  {incident.contactName} · {incident.company}
                </p>
              )}
              <p className="instrument">
                <strong>Why this needs a person:</strong> {incident.awaitingHuman ?? '—'}
              </p>
              {incident.missingInformation.length > 0 && (
                <p className="instrument" style={{ color: 'var(--ink-muted)' }}>
                  Still unresolved: {incident.missingInformation.join(', ')}
                </p>
              )}
              <AttentionTimeoutPanel
                label="Review attention"
                waitingFor="a named person to record a decision"
                anchorLabel="entered human review"
                anchorAt={incident.reviewStartedAt}
                deadlineAt={incident.attentionDeadlineAt}
                windowHours={incident.attentionWindowHours}
                overdue={incident.attentionOverdue}
                permitted="Escalate the attention condition to the next owner in the authority chain."
                notDone="Never decides the case, closes it, or clears it to BOOKING_READY on its own."
                busy={busy}
                onCheck={() => checkNow(incident.incidentId, false)}
                onSimulate={() => checkNow(incident.incidentId, true)}
              />
              <div className="flex flex-wrap items-center gap-2">
                <label className="instrument" style={{ color: 'var(--ink-muted)' }}>
                  Decide as
                  <select name="decidedBy" defaultValue="client-partner" className="ml-2 border rule rounded-sm px-1 py-0.5">
                    {DECIDER_OPTIONS.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="instrument" style={{ color: 'var(--ink-muted)' }}>
                  Decision
                  <select name="decision" defaultValue="CLEARED_TO_PROCEED" className="ml-2 border rule rounded-sm px-1 py-0.5">
                    {DECISION_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <input
                name="rationale"
                defaultValue="Reviewed the case personally and confirmed there is no blocker to proceeding."
                className="w-full border rule rounded-sm px-2 py-1 instrument text-sm"
                aria-label="Rationale"
              />
              <button type="submit" disabled={busy} className="badge" style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}>
                Submit decision
              </button>
            </form>
          ))}
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Stage 3: ready, offer not yet despatched */}
      {/* ------------------------------------------------------------------ */}
      <section className="border rule rounded-sm p-4 space-y-4" style={{ background: 'var(--panel)' }}>
        <div>
          <h2 className="label">Ready — no offer sent yet</h2>
          <p className="instrument" style={{ color: 'var(--ink-muted)' }}>
            Enough is known to offer a next commercial step. That is readiness, not delivery — nothing has
            reached the prospect and no clock is running until someone explicitly sends it.
          </p>
        </div>
        {readyIncidents.length === 0 && (
          <p className="instrument" style={{ color: 'var(--ink-faint)' }}>
            No cases currently ready and un-offered.
          </p>
        )}
        <div className="space-y-4">
          {readyIncidents.map((incident) => (
            <form
              key={incident.incidentId}
              className="border rule rounded-sm p-3 space-y-2"
              onSubmit={(e) => {
                e.preventDefault();
                submitDispatch(incident.incidentId, incident.revision, e.currentTarget);
              }}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="instrument font-medium">{incident.incidentId}</span>
                <span className="badge" style={{ borderColor: 'var(--rule-strong)' }}>BOOKING_READY · ready since {incident.bookingReadyAt}</span>
              </div>
              <AttentionTimeoutPanel
                label="Dispatch attention"
                waitingFor="a named person to despatch the offer"
                anchorLabel="became ready"
                anchorAt={incident.bookingReadyAt}
                deadlineAt={incident.attentionDeadlineAt}
                windowHours={incident.attentionWindowHours}
                overdue={incident.attentionOverdue}
                permitted="Escalate the attention condition to the next owner in the authority chain."
                notDone="Never despatches the offer itself, and never writes offerSentAt."
                busy={busy}
                onCheck={() => checkNow(incident.incidentId, false)}
                onSimulate={() => checkNow(incident.incidentId, true)}
              />
              <label className="instrument block" style={{ color: 'var(--ink-muted)' }}>
                Sending to (the prospect, never the owner)
                <input
                  name="target"
                  defaultValue={incident.contactName !== null ? `${incident.contactName} (on file for this enquiry)` : 'the prospect on file'}
                  className="mt-1 w-full border rule rounded-sm px-2 py-1 instrument text-sm"
                />
              </label>
              <label className="instrument block" style={{ color: 'var(--ink-muted)' }}>
                Offer content
                <input
                  name="offerSummary"
                  defaultValue="Offered a 30-minute scoping call for next Wednesday 10:00 or Thursday 14:00. No pricing or commitment stated."
                  className="mt-1 w-full border rule rounded-sm px-2 py-1 instrument text-sm"
                />
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <label className="instrument" style={{ color: 'var(--ink-muted)' }}>
                  Authorize as
                  <select name="decidedBy" defaultValue="client-partner" className="ml-2 border rule rounded-sm px-1 py-0.5">
                    {DECIDER_OPTIONS.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="submit"
                  disabled={busy}
                  className="badge"
                  style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}
                >
                  Despatch offer (simulated)
                </button>
              </div>
            </form>
          ))}
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Stage 4: genuinely waiting on a timer */}
      {/* ------------------------------------------------------------------ */}
      <section className="border rule rounded-sm p-4 space-y-4" style={{ background: 'var(--panel)' }}>
        <div>
          <h2 className="label">Waiting for a response</h2>
          <p className="instrument" style={{ color: 'var(--ink-muted)' }}>
            A real clock is running: a question was asked, or an offer was actually despatched. Two waiting
            categories share this one durable runtime — the same <code>WaitIncidentStore</code>,{' '}
            <code>checkWaitIncident</code>, and durable claim.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full instrument text-sm" style={{ minWidth: '640px' }}>
            <thead>
              <tr style={{ color: 'var(--ink-muted)' }}>
                <th className="text-left font-normal pb-2">Incident</th>
                <th className="text-left font-normal pb-2">Kind</th>
                <th className="text-left font-normal pb-2">Waiting since</th>
                <th className="text-left font-normal pb-2">Deadline</th>
                <th className="text-left font-normal pb-2">Rev</th>
                <th className="pb-2"></th>
              </tr>
            </thead>
            <tbody>
              {waitingIncidents.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-3" style={{ color: 'var(--ink-faint)' }}>
                    No incidents currently waiting.
                  </td>
                </tr>
              )}
              {waitingIncidents.map((incident) => (
                <tr key={incident.incidentId} className="border-t rule">
                  <td className="py-2 pr-2">{incident.incidentId}</td>
                  <td className="pr-2">{incident.kind === null ? '—' : KIND_LABEL[incident.kind]}</td>
                  <td className="pr-2">{incident.waitStartedAt}</td>
                  <td className="pr-2">{incident.deadlineAt}</td>
                  <td className="pr-2">{incident.revision}</td>
                  <td className="text-right space-x-2 whitespace-nowrap">
                    <button onClick={() => checkNow(incident.incidentId, false)} disabled={busy} className="badge">
                      Check
                    </button>
                    <button
                      onClick={() => checkNow(incident.incidentId, true)}
                      disabled={busy}
                      className="badge"
                      style={{ color: 'var(--warn)', borderColor: 'var(--warn)' }}
                    >
                      Simulate past deadline &amp; check
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {lastResult !== null && (
        <section className="border rule rounded-sm p-4 space-y-2" style={{ background: 'var(--panel)' }}>
          <h2 className="label">Last action result</h2>
          <pre className="instrument text-xs overflow-x-auto" style={{ color: 'var(--ink-muted)' }}>
            {JSON.stringify(lastResult, null, 2)}
          </pre>
        </section>
      )}

      <section className="border rule rounded-sm p-5 space-y-3" style={{ background: 'var(--panel)' }}>
        <h2 className="label">What is real here, and what is not</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <p className="instrument font-medium" style={{ color: 'var(--ok)' }}>
              Genuinely executing
            </p>
            <ul className="instrument space-y-1" style={{ color: 'var(--ink-muted)' }}>
              <li>· &ldquo;Start a case needing human review&rdquo; runs the real engine to a genuine NEEDS_HUMAN (lr-t11), then writes it to a real file. Nothing autonomous has happened to this case.</li>
              <li>· &ldquo;Submit decision&rdquo; applies a real human.decision.recorded event through the actual canonical handler (handleHumanDecision) and the engine&apos;s own transition-legality gate. An insufficiently authorized or stale/out-of-order decision is refused and the record is left untouched — try the &ldquo;Analyst&rdquo; option to see it happen.</li>
              <li>· A cleared case reaching BOOKING_READY writes only readiness evidence (bookingReadyAt) — never offer-sent evidence. lr-t22 never fires without a genuinely despatched offer, no matter how long the case sits.</li>
              <li>· &ldquo;Despatch offer&rdquo; applies a real lead.offer.despatched event through a durable claim, then a genuinely awaited (simulated) send — the SAME claim-then-invoke ordering already proven for the wait-elapsed notification. Only a CONFIRMED result durably records the offer-sent timestamp and starts the 48-hour window; a rejected or uncertain attempt changes nothing.</li>
              <li>· &ldquo;Check&rdquo; and &ldquo;Check attention timeout&rdquo; both read the real server clock once and apply exactly one lead.wait.reevaluated event against the record loaded back off disk. A check before the deadline is a genuine no-op; a check after it fires the applicable rule through the ordinary authority and idempotency gates.</li>
              <li>· A case parked under review, or ready but undespatched, that sits unattended past its configured window is genuinely flagged overdue by a real check — lr-fm-approval-timeout, closed this pass. The check never approves, rejects, despatches, or otherwise decides the case on a person&apos;s behalf: it only durably records that a human has not acted, addressed to the next owner in the authority chain. The lifecycle state never moves — the badge above each form updates from &ldquo;within policy&rdquo; to &ldquo;OVERDUE&rdquo; but the case stays exactly where it was, waiting for the actual decision or despatch.</li>
              <li>· The review-attention clock (reviewStartedAt) is written once, at genuine entry into human review, and survives escalating within review (lr-t23/lr-t37) unchanged — raising a case to a second opinion is not a new review and does not buy a fresh window. Completing the human decision, or confirming the dispatch, resolves the corresponding attention condition — a stale re-check afterward is a genuine no-op.</li>
              <li>· Restarting the dev server loses nothing at any stage — review, ready, or waiting — the file on disk is the only place this state lives.</li>
              <li>· Every despatch and every escalation (prospect-response or attention) is durably claimed before it is trusted: two overlapping attempts on the same case can never both report success. A claim recorded but never confirmed surfaces as <code>UNCERTAIN</code> rather than being silently retried.</li>
            </ul>
          </div>
          <div className="space-y-2">
            <p className="instrument font-medium" style={{ color: 'var(--warn)' }}>
              Simulated / demo-only
            </p>
            <ul className="instrument space-y-1" style={{ color: 'var(--ink-muted)' }}>
              <li>· &ldquo;Simulate past deadline &amp; check&rdquo; is the one control that does not use the real clock — it supplies a timestamp just past the deadline instead, through the identical check path a genuine hours-later check would take. The &ldquo;OVERDUE&rdquo; badge itself IS the real clock, compared against the real deadline, on every page load.</li>
              <li>· The offer despatch and every escalation notification (prospect-response or attention) are simulated sends — a deterministic, always-succeeds stand-in. Nothing leaves this process, and no real prospect, owner, or provider is involved.</li>
              <li>· No scheduler exists anywhere in this build — an overdue condition is only ever detected when a check is explicitly run (a button click here, or a script hitting the same route). A production deployment would run the identical check on a real interval; this demo does not simulate that interval, only the check itself.</li>
              <li>· This demo store is a single JSON file, adequate for a prototype; a production deployment on an ephemeral filesystem would need a persistent volume behind the same `WaitIncidentStore` interface, unchanged.</li>
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}
