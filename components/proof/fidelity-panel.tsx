import type { CSSProperties } from 'react';
import {
  FIDELITY_STATUSES,
  FIDELITY_STATUS_LABEL,
  FIDELITY_STATUS_MEANING,
  type FailureRegisterEntry,
  type FidelityLedger,
  type FidelityStatus,
} from '@/lib/proof/fidelity-ledger';
import type { RuntimeEvidence } from '@/lib/proof/n8n-evidence';

/**
 * LAYER D — the fidelity panel.
 *
 * Four labels, applied capability by capability. The visual weight is deliberately EQUAL
 * across all four: an `UNVERIFIED` row is not greyed out or tucked into a footnote, because
 * the whole purpose of the panel is that a sceptical reader finds the honest rows without
 * hunting. A ledger that renders its weaknesses quietly is a marketing page with extra steps.
 *
 * No status is computed in this file. Every value comes from `lib/proof/fidelity-ledger.ts`,
 * which derives what it can from the running configuration and retained evidence.
 */

const STATUS_STYLE: Record<FidelityStatus, CSSProperties> = {
  REAL: { color: 'var(--ok)', background: 'var(--prov-evidence-bg)', borderColor: 'var(--ok)' },
  FIXTURE_BACKED: { color: 'var(--prov-fixture)', background: 'var(--prov-fixture-bg)', borderColor: 'var(--prov-fixture)' },
  SIMULATED: { color: 'var(--warn)', background: 'var(--warn-bg)', borderColor: 'var(--warn)' },
  UNVERIFIED: { color: 'var(--ink-muted)', borderColor: 'var(--rule-strong)' },
};

export function FidelityStatusBadge({ status }: { readonly status: FidelityStatus }) {
  return (
    <span className="badge" style={STATUS_STYLE[status]}>
      {FIDELITY_STATUS_LABEL[status]}
    </span>
  );
}

export function FidelityPanel({
  ledger,
  evidence,
}: {
  readonly ledger: FidelityLedger;
  readonly evidence: RuntimeEvidence;
}) {
  return (
    <div className="space-y-8">
      {/* --- Legend ------------------------------------------------------- */}
      <div className="grid gap-px border rule rounded-sm overflow-hidden sm:grid-cols-2 xl:grid-cols-4" style={{ background: 'var(--rule)' }}>
        {FIDELITY_STATUSES.map((status) => (
          <div key={status} className="p-4 space-y-2" style={{ background: 'var(--paper-raised)' }}>
            <div className="flex items-center gap-2">
              <FidelityStatusBadge status={status} />
              <span className="instrument tabular-nums" style={{ color: 'var(--ink-faint)' }}>
                {ledger.counts[status]}
              </span>
            </div>
            <p className="instrument leading-relaxed" style={{ color: 'var(--ink-muted)' }}>
              {FIDELITY_STATUS_MEANING[status]}
            </p>
          </div>
        ))}
      </div>

      {/* --- Rows --------------------------------------------------------- */}
      <ul className="border rule rounded-sm overflow-hidden" style={{ background: 'var(--paper-raised)' }}>
        {ledger.rows.map((row) => (
          <li key={row.id} className="border-b rule last:border-b-0 p-4 space-y-2.5">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-2">
              <FidelityStatusBadge status={row.status} />
              <h4 className="text-[0.9375rem] font-medium min-w-0">{row.capability}</h4>
            </div>

            <p className="text-[0.9375rem] leading-relaxed prose-measure">{row.whatIsTrue}</p>

            <p className="instrument leading-relaxed prose-measure" style={{ color: 'var(--ink-muted)' }}>
              <span className="label">Does not establish</span> {row.limit}
            </p>

            <p className="instrument" style={{ color: 'var(--ink-faint)', overflowWrap: 'anywhere' }}>
              <span className="label">Check it at</span> {row.basis}
            </p>
          </li>
        ))}
      </ul>

      {/* --- Declared maturity, verbatim ---------------------------------- */}
      <div className="border rule rounded-sm p-4 space-y-3" style={{ background: 'var(--panel)' }}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="label">The system&rsquo;s own declared maturity</span>
          <span className="badge" style={{ color: 'var(--ink-muted)', borderColor: 'var(--rule-strong)' }}>
            {ledger.declaredMaturity.replace(/_/g, ' ')}
          </span>
        </div>
        <details>
          <summary className="label cursor-pointer hover:opacity-70">
            Read the unedited fidelity note
          </summary>
          <p
            className="instrument mt-3 leading-relaxed border-l-2 pl-4"
            style={{ color: 'var(--ink-muted)', borderColor: 'var(--rule-strong)' }}
          >
            {ledger.fidelityNote}
          </p>
        </details>
      </div>

      {/* --- Orchestration evidence slot ---------------------------------- */}
      <OrchestrationSlot evidence={evidence} />
    </div>
  );
}

/**
 * The integration-proof slot. Reads only through `lib/proof/n8n-evidence.ts`, which is the
 * single point of coupling to an evidence artefact owned elsewhere and still being worked on.
 * Absence renders as an explicit negative result — never as a blank space, and never as a
 * success-shaped card built from nothing.
 */
function OrchestrationSlot({ evidence }: { readonly evidence: RuntimeEvidence }) {
  if (evidence.kind !== 'PRESENT') {
    return (
      <div className="border rule rounded-sm p-4 space-y-2" style={{ background: 'var(--paper-raised)' }}>
        <div className="flex flex-wrap items-center gap-2">
          <FidelityStatusBadge status="UNVERIFIED" />
          <h4 className="text-[0.9375rem] font-medium">Orchestration evidence</h4>
        </div>
        <p className="instrument leading-relaxed prose-measure" style={{ color: 'var(--ink-muted)' }}>
          {evidence.detail}
        </p>
      </div>
    );
  }

  if (evidence.unrecognisedShape) {
    return (
      <div className="border rule rounded-sm p-4 space-y-2" style={{ background: 'var(--paper-raised)' }}>
        <div className="flex flex-wrap items-center gap-2">
          <FidelityStatusBadge status="UNVERIFIED" />
          <h4 className="text-[0.9375rem] font-medium">Orchestration evidence</h4>
        </div>
        <p className="instrument leading-relaxed prose-measure" style={{ color: 'var(--ink-muted)' }}>
          A capture was found and parsed, but it contained no execution record this page knows how
          to read. Reported as unverified rather than partially interpreted — the reader for this
          artefact needs updating, not the claim.
        </p>
      </div>
    );
  }

  return (
    <div className="border rule rounded-sm overflow-hidden" style={{ background: 'var(--paper-raised)' }}>
      <div className="px-4 py-2.5 border-b rule flex flex-wrap items-center gap-2">
        <FidelityStatusBadge status="REAL" />
        <h4 className="text-[0.9375rem] font-medium">Orchestration evidence</h4>
        {evidence.runtime !== null && (
          <span className="badge" style={{ color: 'var(--ink-muted)', borderColor: 'var(--rule-strong)' }}>
            n8n {evidence.runtime}
          </span>
        )}
      </div>

      <div className="p-4 space-y-4">
        <p className="text-[0.9375rem] leading-relaxed prose-measure">
          A separate automation process drove this application over HTTP and recorded its own
          execution identifiers. These are that record, read straight out of the retained capture.
        </p>

        <ul className="space-y-3">
          {evidence.executions.map((execution, position) => (
            <li key={`${execution.executionId ?? execution.label}-${position}`} className="space-y-1">
              <p className="instrument font-medium" style={{ overflowWrap: 'anywhere' }}>
                {execution.label}
              </p>
              <dl className="instrument grid gap-x-6 gap-y-0.5 sm:grid-cols-2" style={{ color: 'var(--ink-muted)' }}>
                {execution.executionId !== null && <Pair label="Execution" value={execution.executionId} />}
                {execution.status !== null && <Pair label="Status" value={execution.status} />}
                {execution.mode !== null && <Pair label="Triggered by" value={execution.mode} />}
                {execution.startedAt !== null && <Pair label="Started" value={execution.startedAt} />}
                {execution.targetRoute !== null && <Pair label="Called" value={execution.targetRoute} />}
                {execution.statusCode !== null && <Pair label="Responded" value={String(execution.statusCode)} />}
                {execution.workflowPath !== null && <Pair label="Definition" value={execution.workflowPath} />}
              </dl>
              {execution.durableStateNote !== null && (
                <p className="instrument leading-relaxed" style={{ color: 'var(--ink-faint)' }}>
                  {execution.durableStateNote}
                </p>
              )}
            </li>
          ))}
        </ul>

        {evidence.scopeStatement !== null && (
          <p
            className="instrument leading-relaxed border-l-2 pl-3 py-1"
            style={{ color: 'var(--warn)', borderColor: 'var(--warn)' }}
          >
            <span className="label" style={{ color: 'var(--warn)' }}>
              Scope of this capture
            </span>{' '}
            {evidence.scopeStatement}
          </p>
        )}

        <p className="instrument" style={{ color: 'var(--ink-faint)' }}>
          {evidence.capturedAt === null ? 'Capture date not recorded.' : `Captured ${evidence.capturedAt}.`}{' '}
          Read from a committed artefact, not from a live connection to anything.
        </p>
      </div>
    </div>
  );
}

function Pair({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="flex gap-2 min-w-0">
      <dt className="label shrink-0">{label}</dt>
      <dd className="min-w-0" style={{ overflowWrap: 'anywhere' }}>
        {value}
      </dd>
    </div>
  );
}

// ---------------------------------------------------------------------------

/**
 * The failure register, split by whether a test genuinely exercises the handling.
 *
 * The split is derived from each entry's own `verificationTest` string in
 * `data/systems/lead-rescue.ts`. Two of the declared modes are authored but unexercised, and
 * showing all of them in one undifferentiated list would let those two borrow the credibility
 * of the twelve that a test actually proves.
 */
export function FailureRegister({ entries }: { readonly entries: readonly FailureRegisterEntry[] }) {
  const exercised = entries.filter((entry) => entry.exercised);
  const authored = entries.filter((entry) => !entry.exercised);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <span className="flex items-center gap-2">
          <span className="badge" style={{ color: 'var(--ok)', borderColor: 'var(--ok)' }}>
            Proven by a test
          </span>
          <span className="instrument tabular-nums" style={{ color: 'var(--ink-faint)' }}>
            {exercised.length}
          </span>
        </span>
        <span className="flex items-center gap-2">
          <span className="badge" style={{ color: 'var(--ink-muted)', borderColor: 'var(--rule-strong)' }}>
            Designed, not yet exercised
          </span>
          <span className="instrument tabular-nums" style={{ color: 'var(--ink-faint)' }}>
            {authored.length}
          </span>
        </span>
      </div>

      <ul className="border rule rounded-sm overflow-hidden" style={{ background: 'var(--paper-raised)' }}>
        {[...exercised, ...authored].map((entry) => (
          <li key={entry.id} className="border-b rule last:border-b-0">
            <details>
              <summary className="px-4 py-3 cursor-pointer hover:opacity-80 flex flex-wrap items-baseline gap-x-3 gap-y-1.5">
                <span
                  className="badge"
                  style={
                    entry.exercised
                      ? { color: 'var(--ok)', borderColor: 'var(--ok)' }
                      : { color: 'var(--ink-muted)', borderColor: 'var(--rule-strong)' }
                  }
                >
                  {entry.exercised ? 'Proven' : 'Designed'}
                </span>
                <span className="text-[0.9375rem] leading-snug min-w-0">{entry.failure}</span>
              </summary>

              <div className="px-4 pb-4 space-y-3 border-l-2 ml-4" style={{ borderColor: 'var(--rule-strong)' }}>
                <Detail label="What it would cost the business" body={entry.businessImpact} tint="var(--warn)" />
                <Detail label="What stops it" body={entry.prevention} />
                <Detail label="How it recovers" body={entry.recovery} />
                {entry.retryPolicy !== null && <Detail label="Retry policy" body={entry.retryPolicy} />}
                <Detail label="Where the case ends up" body={entry.terminalState} />
                <Detail
                  label={entry.exercised ? 'Proven by' : 'Not yet exercised'}
                  body={entry.verificationTest}
                  tint={entry.exercised ? undefined : 'var(--ink-faint)'}
                />
              </div>
            </details>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Detail({
  label,
  body,
  tint,
}: {
  readonly label: string;
  readonly body: string;
  readonly tint?: string;
}) {
  return (
    <div className="space-y-0.5 pl-4">
      <p className="label">{label}</p>
      <p
        className="instrument leading-relaxed prose-measure"
        style={{ color: tint ?? 'var(--ink-muted)' }}
      >
        {body}
      </p>
    </div>
  );
}
