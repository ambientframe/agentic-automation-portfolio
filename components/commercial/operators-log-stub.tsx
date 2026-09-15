import type { ReactNode } from 'react';
import { COMMERCIAL_ROUTES, OPERATOR_LOG } from '@/lib/commercial/outward-copy';
import { sourceUrl, type SourceProvenance } from '@/lib/config/source-provenance';
import { Sentence } from '@/components/commercial/copy-chrome';
import { KESTREL } from '@/data/profiles/kestrel/profile';
import { OPERATOR_PRINCIPALS } from '@/lib/auth/operator-identity';

const PRINCIPAL_ROSTER = OPERATOR_PRINCIPALS.map((principal) => {
  const role = KESTREL.roles.find((candidate) => candidate.id === principal.roleId);
  return {
    ...principal,
    roleName: role?.name ?? 'Unresolved role',
    authorityCeiling: role?.authorityCeiling ?? null,
  };
});

/**
 * CP2 OPERATOR-LOG SKELETON.
 *
 * All seven pre-registered sections exist. Only the protocol-backed premise renders as
 * prose; every section that depends on O1 remains an explicit awaiting-evidence slot.
 */
export function OperatorsLogSkeleton({ provenance }: { readonly provenance: SourceProvenance }) {
  const runbookHref = sourceUrl(provenance, 'docs/O1_OPERATOR_RUNBOOK.md');

  return (
    <div className="mx-auto max-w-6xl px-6 py-14 space-y-10">
      <header className="prose-measure space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="label">{OPERATOR_LOG.status.text}</span>
          <span
            className="badge"
            style={{ color: 'var(--warn)', background: 'var(--warn-bg)', borderColor: 'var(--warn)' }}
          >
            Awaiting evidence
          </span>
        </div>
        <h1 className="display text-3xl sm:text-4xl">{OPERATOR_LOG.title.text}</h1>
        <Sentence
          sentence={OPERATOR_LOG.body}
          provenance={provenance}
          className="text-[0.9375rem] leading-relaxed"
          style={{ color: 'var(--ink-muted)' }}
        />
      </header>

      <section className="border rule rounded-sm p-5 space-y-3" style={{ background: 'var(--panel)' }}>
        <span className="label">Protocol, not a session</span>
        <Sentence
          sentence={OPERATOR_LOG.protocol}
          provenance={provenance}
          className="text-sm leading-relaxed prose-measure"
          style={{ color: 'var(--ink-muted)' }}
        />
        <p className="instrument">
          <a href={runbookHref} target="_blank" rel="noreferrer" className="hover:opacity-70" style={{ color: 'var(--accent)' }}>
            docs/O1_OPERATOR_RUNBOOK.md
          </a>
        </p>
      </section>

      <ol className="space-y-8">
        <LogSection number="01" title="Why I ran this">
          <Sentence
            sentence={OPERATOR_LOG.protocol}
            provenance={provenance}
            className="text-sm leading-relaxed prose-measure"
            style={{ color: 'var(--ink-muted)' }}
          />
        </LogSection>
        <LogSection number="02" title="What I ran">
          <AwaitingEvidence detail="Run-specific system, commit, fidelity summary, and fictional-business restatement." />
        </LogSection>
        <LogSection number="03" title="The operating session" evidenceKind="OPERATING">
          <AwaitingEvidence detail="Chronology, screenshots, journal records, actions, and reactions from Session A." />
        </LogSection>
        <LogSection number="04" title="The control challenge" evidenceKind="CONTROL">
          <AwaitingEvidence detail="The declared authority-ceiling challenge, refusal or failure, routing, and records from Session B." />
        </LogSection>
        <LogSection number="05" title="What surprised me" evidenceKind="OPERATING">
          <AwaitingEvidence detail="Contemporaneous friction, defects, tedium, and judgment from the recorded session." />
        </LogSection>
        <LogSection number="06" title="What this run does not prove">
          <AwaitingEvidence detail="The run-specific does-not-prove register and the still-empty customer-outcomes slot." />
        </LogSection>
        <LogSection number="07" title="If this were your firm">
          <AwaitingEvidence detail="Translation from retained run evidence to the Revenue Leak Audit handoff." />
        </LogSection>
      </ol>

      <section className="border rule rounded-sm p-5 space-y-3" style={{ background: 'var(--panel)' }}>
        <span className="label">Capture apparatus</span>
        <p className="instrument leading-relaxed prose-measure" style={{ color: 'var(--ink-muted)' }}>
          Prepare, snapshot, and verify the evidence bundle with{' '}
          <code>npm run evidence:o1 -- prepare|snapshot|verify</code>. Runtime records are copied
          once and never overwritten. The working surface is{' '}
          <a href="/lead-rescue/wait" className="hover:opacity-70" style={{ color: 'var(--accent)' }}>
            the operator console
          </a>
          .
        </p>
        <div className="border-t rule pt-3 space-y-2">
          <h2 className="label">Principal roster and authority ceilings</h2>
          <p className="instrument" style={{ color: 'var(--ink-faint)' }}>
            Derived from the same profile and identity registry used by the operator-session
            route. Displaying the roster grants no authority.
          </p>
          <ul className="grid gap-2 sm:grid-cols-2">
            {PRINCIPAL_ROSTER.map((principal) => (
              <li key={principal.principalId} className="instrument border rule rounded-sm p-2">
                <span className="block">{principal.displayName}</span>
                <span style={{ color: 'var(--ink-faint)' }}>
                  {principal.roleName} · authority ceiling{' '}
                  {principal.authorityCeiling ?? 'unresolved'}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <p className="text-sm prose-measure" style={{ color: 'var(--ink-muted)' }}>
        The hireable offer remains{' '}
        <a href={COMMERCIAL_ROUTES.engagement} className="hover:opacity-70" style={{ color: 'var(--accent)' }}>
          Revenue Leak Audit
        </a>
        . CP2b may replace these slots only from <span className="instrument">docs/evidence/o1/</span>.
      </p>
    </div>
  );
}

function LogSection({
  number,
  title,
  evidenceKind,
  children,
}: {
  readonly number: string;
  readonly title: string;
  readonly evidenceKind?: 'OPERATING' | 'CONTROL';
  readonly children: ReactNode;
}) {
  return (
    <li className="border-t rule pt-5 space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className="instrument" style={{ color: 'var(--ink-faint)' }}>
          {number}
        </span>
        <h2 className="display text-xl">{title}</h2>
        {evidenceKind !== undefined && <LogEvidenceBadge kind={evidenceKind} />}
      </div>
      {children}
    </li>
  );
}

function LogEvidenceBadge({ kind }: { readonly kind: 'OPERATING' | 'CONTROL' }) {
  return (
    <span
      className="badge"
      data-evidence-kind={kind}
      style={
        kind === 'OPERATING'
          ? { color: 'var(--prov-evidence)', borderColor: 'var(--prov-evidence)' }
          : { color: 'var(--prov-lab)', borderColor: 'var(--prov-lab)' }
      }
    >
      {kind}
    </span>
  );
}

function AwaitingEvidence({ detail }: { readonly detail: string }) {
  return (
    <div className="border rule rounded-sm p-4 space-y-2" style={{ background: 'var(--panel)' }}>
      <span
        className="badge"
        data-evidence-state="AWAITING_EVIDENCE"
        style={{ color: 'var(--warn)', background: 'var(--warn-bg)', borderColor: 'var(--warn)' }}
      >
        Awaiting evidence
      </span>
      <p className="instrument leading-relaxed" style={{ color: 'var(--ink-faint)' }}>
        {detail} Nothing is rendered here until the O1 bundle contains it.
      </p>
    </div>
  );
}
