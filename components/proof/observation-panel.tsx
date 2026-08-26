import type {
  AbnormalDeliveryCase,
  ObservationIntegrityEvidence,
  RetainedAlert,
} from '@/lib/proof/n8n-evidence';

/**
 * THE OBSERVATION PANEL — the section that answers "can I trust the numbers above this?"
 *
 * Everything else on this page reports what the system did. This reports whether the record of
 * what it did is complete, which conditions in it need a person, and what happened on the two
 * occasions the outbound boundary went genuinely wrong. It sits ABOVE the aggregate for the
 * same reason a masthead sits above a story: a total read without its bound is a claim, and a
 * condition nobody raised is a condition nobody handled.
 *
 * THREE THINGS IT IS CAREFUL ABOUT, each because the opposite is the normal way this kind of
 * panel misleads:
 *
 *   1. "No conditions raised" is never rendered as health. It is shown together with whether
 *      the instrument could answer at all, because a silent alert list from a blind instrument
 *      looks exactly like a quiet system.
 *   2. A clean integrity answer is labelled "no KNOWN loss" everywhere, never "complete". The
 *      standing bound travels with it in the runtime's own words.
 *   3. Where an independent observer disagreed with the application's own classification, the
 *      disagreement is shown, not reconciled. The point of having a second observer is that it
 *      is allowed to say something inconvenient.
 */

const SEVERITY_COLOR: Record<string, string> = {
  CRITICAL: 'var(--blocked)',
  ATTENTION: 'var(--warn)',
};

function AlertRow({ alert }: { readonly alert: RetainedAlert }) {
  const resolved = alert.status !== 'ACTIVE';
  return (
    <tr className="border-t rule align-top">
      <td className="py-2 pr-4 whitespace-nowrap">
        <span
          className="badge"
          style={{
            color: resolved ? 'var(--ink-muted)' : (SEVERITY_COLOR[alert.severity] ?? 'var(--warn)'),
            borderColor: resolved ? 'var(--rule-strong)' : (SEVERITY_COLOR[alert.severity] ?? 'var(--warn)'),
          }}
        >
          {alert.severity}
        </span>
      </td>
      <td className="py-2 pr-4">
        <p className="instrument">{alert.condition}</p>
        <p className="instrument break-all" style={{ color: 'var(--ink-muted)' }}>
          {alert.incidentId ?? 'the runtime as a whole'}
        </p>
      </td>
      <td className="py-2 pr-4 instrument leading-relaxed" style={{ color: 'var(--ink-muted)' }}>
        {alert.reason}
      </td>
      <td className="py-2 pr-4 instrument leading-relaxed">{alert.operatorAction}</td>
      <td className="py-2 instrument whitespace-nowrap" style={{ color: 'var(--ink-muted)' }}>
        {resolved ? 'resolved by later evidence' : `${alert.evidenceJournalEventIds.length} record(s)`}
      </td>
    </tr>
  );
}

/**
 * One deliberately-broken despatch, in the five words the rest of this page already uses. The
 * OUTCOME is whatever the application itself concluded; the line beneath it is what a different
 * process recorded about the same exchange, which is the only thing that makes the OUTCOME
 * checkable rather than merely stated.
 */
function AbnormalCase({
  title,
  lede,
  subject,
  tone,
}: {
  readonly title: string;
  readonly lede: string;
  readonly subject: AbnormalDeliveryCase | null;
  readonly tone: string;
}) {
  if (subject === null || subject.journalOutcome === null) return null;
  return (
    <div className="border rule rounded-sm p-3 space-y-3" style={{ background: 'var(--paper-raised)' }}>
      <div className="space-y-1">
        <p className="label" style={{ color: tone }}>
          {title}
        </p>
        <p className="instrument leading-relaxed" style={{ color: 'var(--ink-muted)' }}>
          {lede}
        </p>
      </div>

      <div className="flex flex-wrap gap-x-2 gap-y-1 items-center">
        {['ACTION', 'GUARDRAIL', 'OUTCOME'].map((word, index) => (
          <span key={word} className="flex items-center gap-2">
            {index > 0 && <span style={{ color: 'var(--ink-faint)' }}>→</span>}
            <span className="badge" style={{ color: 'var(--ink-muted)', borderColor: 'var(--rule-strong)' }}>
              {word}
            </span>
          </span>
        ))}
        <span className="badge" style={{ color: tone, borderColor: tone }}>
          {subject.journalOutcome}
        </span>
      </div>

      <dl className="space-y-2">
        <div>
          <dt className="label">What the system concluded</dt>
          <dd className="instrument leading-relaxed">{subject.journalDetail ?? '—'}</dd>
        </div>
        <div>
          <dt className="label">What the receiving server independently recorded</dt>
          {/*
           * Only rendered when there genuinely IS a second record. A card with no receiver
           * entry would otherwise print "0 bytes received · nothing stored" — a confident
           * negative manufactured out of a missing field, which is the same mistake as a
           * measurement that was never taken rendering as a zero.
           */}
          {subject.receiverNote === null ? (
            <dd className="instrument leading-relaxed" style={{ color: 'var(--waiting)' }}>
              No independent record was captured for this exchange, so nothing here corroborates
              or contradicts the conclusion above.
            </dd>
          ) : (
            <>
              <dd className="instrument leading-relaxed" style={{ color: 'var(--ink-muted)' }}>
                {subject.receiverNote}
              </dd>
              <dd className="instrument" style={{ color: 'var(--ink-muted)' }}>
                {subject.receiverBodyBytesReceived ?? 0} bytes of message body received ·{' '}
                {subject.receiverStoredMessageId === null
                  ? 'nothing stored'
                  : `stored as ${subject.receiverStoredMessageId}`}{' '}
                ·{' '}
                {subject.receiverAcknowledged === true
                  ? 'acknowledged to the sender'
                  : 'never acknowledged to the sender'}
              </dd>
            </>
          )}
        </div>
        <div>
          <dt className="label">Case</dt>
          <dd className="instrument break-all" style={{ color: 'var(--ink-muted)' }}>
            {subject.incidentId ?? '—'}
          </dd>
        </div>
      </dl>
    </div>
  );
}

export function ObservationPanel({ evidence }: { readonly evidence: ObservationIntegrityEvidence }) {
  if (evidence.kind !== 'PRESENT') {
    return (
      <div className="border rule rounded-sm p-4 space-y-2" style={{ background: 'var(--panel)' }}>
        <p className="label" style={{ color: 'var(--waiting)' }}>
          No integrity claim
        </p>
        <p className="instrument leading-relaxed prose-measure" style={{ color: 'var(--ink-muted)' }}>
          {evidence.detail}
        </p>
      </div>
    );
  }

  const active = evidence.alerts.filter((alert) => alert.status === 'ACTIVE');
  const critical = active.filter((alert) => alert.severity === 'CRITICAL');
  const known = evidence.integrityKind === 'KNOWN_LOSS';
  const unmeasurable = evidence.integrityKind === 'UNAVAILABLE';
  const contradicted = evidence.classificationChecks.filter((check) => check.agreement === 'CONTRADICTED');

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="badge" style={{ color: 'var(--ok)', borderColor: 'var(--ok)' }}>
          RETAINED RUNTIME EVIDENCE
        </span>
        <span className="instrument" style={{ color: 'var(--ink-muted)' }}>
          A run in which the outbound boundary and the journal were deliberately broken
          {evidence.gitHead === null ? '' : ` at ${evidence.gitHead.slice(0, 7)}`}
          {evidence.capturedAt === null ? '' : `, captured ${evidence.capturedAt}`}.
        </span>
      </div>

      {/* 1 — RAISED. Conditions arrive here rather than waiting to be found below. */}
      <div className="space-y-2">
        <p className="label">Conditions raised for a person</p>
        {active.length === 0 ? (
          <div className="border rule rounded-sm p-3 space-y-1" style={{ background: 'var(--paper-raised)' }}>
            <p className="instrument" style={{ color: unmeasurable ? 'var(--blocked)' : 'var(--ok)' }}>
              {unmeasurable
                ? 'Nothing can be raised: the instrument cannot currently say what it has seen.'
                : 'No conditions are open.'}
            </p>
            <p className="instrument leading-relaxed prose-measure" style={{ color: 'var(--ink-muted)' }}>
              An empty list only means something alongside the integrity answer below. A silent
              alert list from a blind instrument looks exactly like a quiet system, which is why
              the two are never shown apart.
            </p>
          </div>
        ) : (
          <>
            <p className="instrument leading-relaxed prose-measure" style={{ color: 'var(--ink-muted)' }}>
              {active.length} open, {critical.length} of them critical. Each is computed from
              retained records rather than stored, so none can be acknowledged away while the
              evidence for it still exists — it disappears when the underlying facts change and
              not before.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr>
                    <th className="label pb-2 pr-4">Severity</th>
                    <th className="label pb-2 pr-4">Condition</th>
                    <th className="label pb-2 pr-4">Why</th>
                    <th className="label pb-2 pr-4">What a person does</th>
                    <th className="label pb-2">Evidence</th>
                  </tr>
                </thead>
                <tbody>
                  {evidence.alerts.map((alert) => (
                    <AlertRow key={alert.alertId} alert={alert} />
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* 2 — Whether the record underneath everything else is complete. */}
      <div className="space-y-2">
        <p className="label">Is anything missing from the record?</p>
        <div className="border rule rounded-sm p-3 space-y-2" style={{ background: 'var(--panel)' }}>
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span
              className="text-lg leading-none"
              style={{ color: known ? 'var(--warn)' : unmeasurable ? 'var(--blocked)' : 'var(--ok)' }}
            >
              {evidence.integrityKind.replace(/_/g, ' ').toLowerCase()}
            </span>
            {known && (
              <span className="instrument" style={{ color: 'var(--ink-muted)' }}>
                {evidence.lossCount} observation(s) named as missing
              </span>
            )}
          </div>

          {evidence.observationLoss !== null && known && (
            <dl className="space-y-1">
              <div>
                <dt className="label">How it was lost</dt>
                <dd className="instrument leading-relaxed">{evidence.observationLoss.fault ?? '—'}</dd>
              </div>
              <div>
                <dt className="label">What the runtime said about it</dt>
                <dd className="instrument leading-relaxed" style={{ color: 'var(--ink-muted)' }}>
                  {evidence.observationLoss.lossKind ?? '—'} · {evidence.observationLoss.lossReason ?? '—'}
                </dd>
              </div>
              <div>
                <dt className="label">Did the business work still happen?</dt>
                <dd className="instrument leading-relaxed">
                  {evidence.observationLoss.businessWorkSucceeded === true
                    ? `Yes. The case was accepted and durably parked, and it holds ${evidence.observationLoss.journalRecordsForThatCase} journal records — the work succeeded and the record of it did not.`
                    : '—'}
                </dd>
              </div>
              <div>
                <dt className="label">Case</dt>
                <dd className="instrument break-all" style={{ color: 'var(--ink-muted)' }}>
                  {evidence.observationLoss.incidentId ?? '—'}
                </dd>
              </div>
            </dl>
          )}

          {evidence.integrityBasis !== null && (
            <p className="instrument leading-relaxed prose-measure" style={{ color: 'var(--ink-muted)' }}>
              {evidence.integrityBasis}
            </p>
          )}
        </div>
      </div>

      {/* 3 — The abnormal delivery states, each with a second observer's own record. */}
      <div className="space-y-2">
        <p className="label">What happened when the outbound boundary went wrong</p>
        <p className="instrument leading-relaxed prose-measure" style={{ color: 'var(--ink-muted)' }}>
          Three despatches against the same server, which was scripted to fail in three different
          ways. The system classified each one itself; the line beneath each is what the receiving
          process recorded, which is what makes the classification checkable rather than asserted.
          {evidence.receiverKind === null ? '' : ` Receiver: ${evidence.receiverKind}.`}
        </p>
        <div className="grid gap-3 lg:grid-cols-3">
          <AbnormalCase
            title="It was delivered"
            lede="The ordinary path, against the same server that misbehaves in the next two cards."
            subject={evidence.delivered}
            tone="var(--ok)"
          />
          <AbnormalCase
            title="It confirmably did not happen"
            lede="The receiver refused the envelope, so no message body ever reached it."
            subject={evidence.failedBeforeEffect}
            tone="var(--warn)"
          />
          <AbnormalCase
            title="Nobody knows whether it happened"
            lede="The receiver took the whole message and never answered; the sending process was killed with its claim already taken."
            subject={evidence.outcomeUnknown}
            tone="var(--waiting)"
          />
        </div>
      </div>

      {/* 4 — Where the second observer disagreed. Shown, not reconciled. */}
      {contradicted.length > 0 && (
        <div className="border rule rounded-sm p-3 space-y-2" style={{ background: 'var(--warn-bg)' }}>
          <p className="label" style={{ color: 'var(--warn)' }}>
            Where the receiver disagreed with the system
          </p>
          {contradicted.map((check) => (
            <div key={check.incidentId ?? check.subject ?? 'contradiction'} className="space-y-1">
              <p className="instrument">{check.subject ?? '—'}</p>
              {/* Named so a reader can match this to the row it explains in the alert table. */}
              <p className="instrument break-all" style={{ color: 'var(--ink-muted)' }}>
                {check.incidentId ?? '—'}
              </p>
              <p className="instrument leading-relaxed prose-measure" style={{ color: 'var(--ink-muted)' }}>
                {check.finding ?? '—'}
              </p>
            </div>
          ))}
          <p className="instrument leading-relaxed prose-measure" style={{ color: 'var(--ink-muted)' }}>
            This is retained rather than corrected because it is a finding about the execution
            boundary, not about the record. The journal reported exactly what the executor told
            it, and the disagreement is only visible because a second observer was present.
          </p>
        </div>
      )}

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
