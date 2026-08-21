import type { CSSProperties } from 'react';
import {
  evidenceDisplay,
  type OperatingStandard,
  type ProvenanceType,
  type VerificationStatus,
} from '@/lib/model/provenance';
import { isLive, type MaturityLevel } from '@/lib/model/system';
import type { SideEffectStatus } from '@/lib/model/runtime';

/**
 * Provenance and verification render as SEPARATE marks, because they are separate
 * questions. A claim can be evidence-backed and still unverified, and the reader has to
 * be able to see both at once.
 */

const PROVENANCE_STYLE: Record<ProvenanceType, CSSProperties> = {
  EVIDENCE: { color: 'var(--prov-evidence)', background: 'var(--prov-evidence-bg)', borderColor: 'var(--prov-evidence)' },
  CLIENT_POLICY: { color: 'var(--prov-policy)', background: 'var(--prov-policy-bg)', borderColor: 'var(--prov-policy)' },
  LAB_TARGET: { color: 'var(--prov-lab)', background: 'var(--prov-lab-bg)', borderColor: 'var(--prov-lab)' },
  FIXTURE: { color: 'var(--prov-fixture)', background: 'var(--prov-fixture-bg)', borderColor: 'var(--prov-fixture)' },
};

const PROVENANCE_LABEL: Record<ProvenanceType, string> = {
  EVIDENCE: 'Evidence',
  CLIENT_POLICY: 'Client policy',
  LAB_TARGET: 'Lab target',
  FIXTURE: 'Fixture',
};

export function ProvenanceBadge({ type }: { type: ProvenanceType }) {
  return (
    <span className="badge" style={PROVENANCE_STYLE[type]}>
      {PROVENANCE_LABEL[type]}
    </span>
  );
}

const VERIFICATION_LABEL: Record<VerificationStatus, string> = {
  VERIFIED: 'Verified',
  PENDING_VERIFICATION: 'Unverified',
  DISPUTED_OR_WEAK: 'Weak support',
  SUPERSEDED: 'Superseded',
  NOT_APPLICABLE: '',
};

export function VerificationBadge({ status }: { status: VerificationStatus }) {
  if (status === 'NOT_APPLICABLE') return null;

  const settled = status === 'VERIFIED';
  return (
    <span
      className="badge"
      style={
        settled
          ? { color: 'var(--prov-evidence)', borderColor: 'var(--prov-evidence)' }
          : { color: 'var(--warn)', background: 'var(--warn-bg)', borderColor: 'var(--warn)' }
      }
    >
      {VERIFICATION_LABEL[status]}
    </span>
  );
}

/**
 * A standard rendered with its qualifier attached.
 *
 * The qualifier is NOT optional decoration. `tests/provenance.test.ts` asserts that
 * every non-settled claim carries one, and this component is why that assertion has
 * teeth: an unverified claim physically cannot render here as bare prose.
 */
export function StandardCard({ standard }: { standard: OperatingStandard }) {
  const display = evidenceDisplay(standard);

  return (
    <article className="border rule rounded-sm p-4 space-y-3" style={{ background: 'var(--paper-raised)' }}>
      <div className="flex flex-wrap items-center gap-2">
        <ProvenanceBadge type={standard.provenance} />
        <VerificationBadge status={standard.verification} />
      </div>

      <p className="text-[0.9375rem] leading-relaxed">{standard.statement}</p>

      {display.qualifier !== null && (
        <p
          className="instrument border-l-2 pl-3 py-1"
          style={{ color: 'var(--warn)', borderColor: 'var(--warn)' }}
        >
          {display.qualifier}
        </p>
      )}

      {standard.correction !== undefined && (
        <details className="group">
          <summary className="label cursor-pointer hover:opacity-70">
            Correction on the common retelling
          </summary>
          <p className="instrument mt-2 leading-relaxed" style={{ color: 'var(--ink-muted)' }}>
            {standard.correction}
          </p>
        </details>
      )}

      <p className="instrument" style={{ color: 'var(--ink-faint)' }}>
        <span className="label">Applies to</span> {standard.appliesTo}
      </p>
    </article>
  );
}

// ---------------------------------------------------------------------------

/**
 * Three tiers, because three distinctions matter to a reader:
 * live (really running), simulated (runs, but nothing leaves the process), and
 * concept (does not run at all). The badge carries the signal so the fidelity note
 * beneath it can stay neutral prose rather than a paragraph of alarm colour.
 */
export function MaturityBadge({ level }: { level: MaturityLevel }) {
  const style: CSSProperties = isLive(level)
    ? { color: 'var(--ok)', background: 'var(--prov-evidence-bg)', borderColor: 'var(--ok)' }
    : level === 'CONCEPT'
      ? { color: 'var(--warn)', background: 'var(--warn-bg)', borderColor: 'var(--warn)' }
      : { color: 'var(--ink-muted)', borderColor: 'var(--rule-strong)' };

  return (
    <span className="badge" style={style}>
      {level.replace(/_/g, ' ')}
    </span>
  );
}

// ---------------------------------------------------------------------------

const EFFECT_STYLE: Record<SideEffectStatus, CSSProperties> = {
  EXECUTED: { color: 'var(--ok)', borderColor: 'var(--ok)' },
  SUPPRESSED_DUPLICATE: { color: 'var(--suppressed)', background: 'var(--warn-bg)', borderColor: 'var(--suppressed)' },
  BLOCKED_BY_POLICY: { color: 'var(--blocked)', borderColor: 'var(--blocked)' },
  AWAITING_APPROVAL: { color: 'var(--waiting)', borderColor: 'var(--waiting)' },
  FAILED: { color: 'var(--blocked)', borderColor: 'var(--blocked)' },
};

export function EffectStatusBadge({ status }: { status: SideEffectStatus }) {
  return (
    <span className="badge" style={EFFECT_STYLE[status]}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}

const MECHANISM_STYLE: Record<string, CSSProperties> = {
  DETERMINISTIC_RULE: { color: 'var(--prov-policy)', background: 'var(--prov-policy-bg)', borderColor: 'var(--prov-policy)' },
  BOUNDED_AI_JUDGMENT: { color: 'var(--prov-lab)', background: 'var(--prov-lab-bg)', borderColor: 'var(--prov-lab)' },
  HUMAN_DECISION: { color: 'var(--prov-fixture)', background: 'var(--prov-fixture-bg)', borderColor: 'var(--prov-fixture)' },
};

const MECHANISM_LABEL: Record<string, string> = {
  DETERMINISTIC_RULE: 'Deterministic rule',
  BOUNDED_AI_JUDGMENT: 'Bounded AI judgment',
  HUMAN_DECISION: 'Human decision',
};

export function MechanismBadge({ mechanism }: { mechanism: string }) {
  return (
    <span className="badge" style={MECHANISM_STYLE[mechanism] ?? {}}>
      {MECHANISM_LABEL[mechanism] ?? mechanism}
    </span>
  );
}

export function AuthorityBadge({ level, label }: { level: number; label: string }) {
  return (
    <span className="badge" style={{ color: 'var(--ink-muted)', borderColor: 'var(--rule-strong)' }}>
      Authority {level} · {label}
    </span>
  );
}
