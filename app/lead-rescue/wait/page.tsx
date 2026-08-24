'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';

interface IncidentSummary {
  readonly incidentId: string;
  readonly correlationId: string;
  readonly lifecycleState: string;
  readonly kind: 'reply' | 'offer' | null;
  readonly waitStartedAt: string | null;
  readonly windowHours: number | null;
  readonly deadlineAt: string | null;
  readonly revision: number;
}

const KIND_LABEL: Record<'reply' | 'offer', string> = {
  reply: 'reply (lr-t14)',
  offer: 'offer (lr-t22)',
};

export default function LeadRescueWaitPage() {
  const [incidents, setIncidents] = useState<readonly IncidentSummary[]>([]);
  const [windows, setWindows] = useState<{ reply: number; offer: number } | null>(null);
  const [lastResult, setLastResult] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const res = await fetch('/api/lead-rescue/wait-incidents');
    const data: { incidents: readonly IncidentSummary[]; windows: { reply: number; offer: number } } = await res.json();
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
    async (kind: 'reply' | 'offer') => {
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

  return (
    <div className="mx-auto max-w-4xl px-6 py-12 space-y-8">
      <nav className="instrument">
        <Link href="/systems/lead-rescue" style={{ color: 'var(--ink-muted)' }} className="hover:opacity-70">
          ← Lead Rescue dossier
        </Link>
      </nav>

      <header className="space-y-4">
        <span className="label">Lead Rescue · wait/resume, live</span>
        <h1 className="display text-3xl sm:text-4xl">A persisted wait, checked for real</h1>
        <p className="lede prose-measure">
          Every scenario in the simulator replays a deterministic run from authored fixture
          events. This page does not: parking an incident here writes a real record to a JSON
          file on disk, and checking it reads the real server clock, loads that record back off
          disk, and applies the same deterministic rule through the same engine —
          independently of whatever process parked it. Two waiting categories share this one
          durable runtime: a reply wait (lr-t14, WAITING_FOR_REPLY) and a booking-offer wait
          (lr-t22, BOOKING_READY) — the same <code>WaitIncidentStore</code>,{' '}
          <code>checkWaitIncident</code>, and durable claim, never a second mechanism built to
          match.
        </p>
      </header>

      <section className="border rule rounded-sm p-4 space-y-4" style={{ background: 'var(--panel)' }}>
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => parkDemoIncident('reply')}
            disabled={busy}
            className="badge"
            style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}
          >
            Park a demo incident (reply, lr-t14)
          </button>
          <button
            onClick={() => parkDemoIncident('offer')}
            disabled={busy}
            className="badge"
            style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}
          >
            Park a demo incident (offer, lr-t22)
          </button>
          <button onClick={() => checkNow()} disabled={busy} className="badge" style={{ borderColor: 'var(--rule-strong)' }}>
            Check all now (real clock)
          </button>
          <span className="instrument" style={{ color: 'var(--ink-faint)' }}>
            Configured windows: reply {windows?.reply ?? '…'}h (kestrel-reply-wait-window) · offer{' '}
            {windows?.offer ?? '…'}h (kestrel-booking-offer-window)
          </span>
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
              {incidents.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-3" style={{ color: 'var(--ink-faint)' }}>
                    No incidents currently waiting.
                  </td>
                </tr>
              )}
              {incidents.map((incident) => (
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
          <h2 className="label">Last check result</h2>
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
              <li>· Either &ldquo;Park a demo incident&rdquo; button runs the real engine — the same handler and reducer the simulator uses — to reach WAITING_FOR_REPLY or BOOKING_READY, then writes the resulting state to a real file. For the offer kind this replays two real events, not one: the enquiry (readiness) and the fixture&apos;s own explicit offer-despatch event — reaching BOOKING_READY alone is never enough to start this clock.</li>
              <li>· &ldquo;Check&rdquo; reads the real server clock once and applies exactly one lead.wait.reevaluated event against the record loaded back off disk — the SAME event type for both kinds; which rule (lr-t14 or lr-t22) applies is read off the incident&apos;s own current lifecycle state, not a label this page supplies.</li>
              <li>· A check before the deadline is a genuine no-op: no transition, no side effect, the record untouched.</li>
              <li>· A check after the deadline fires the matching rule through the ordinary authority and idempotency gates, same as any other transition.</li>
              <li>· Restarting the dev server does not lose a waiting incident — the file on disk is the only place this state lives.</li>
              <li>· The notification itself is durably claimed before it is trusted: two overlapping checks on the same incident can never both report it EXECUTED. A claim that is recorded but never confirmed (e.g. a crash mid-check) surfaces as an <code>UNCERTAIN</code> result rather than being silently retried — visible in the raw result below as <code>outcome: &quot;UNCERTAIN&quot;</code>.</li>
            </ul>
          </div>
          <div className="space-y-2">
            <p className="instrument font-medium" style={{ color: 'var(--warn)' }}>
              Simulated / demo-only
            </p>
            <ul className="instrument space-y-1" style={{ color: 'var(--ink-muted)' }}>
              <li>· &ldquo;Simulate past deadline &amp; check&rdquo; is the one control that does not use the real clock — it supplies a timestamp just past the deadline instead, through the identical check path a genuine hours-later check would take.</li>
              <li>· The notification effect on escalation is simulated — nothing leaves this process.</li>
              <li>· This demo store is a single JSON file, adequate for a prototype; a production deployment on an ephemeral filesystem would need a persistent volume behind the same `WaitIncidentStore` interface, unchanged.</li>
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}
