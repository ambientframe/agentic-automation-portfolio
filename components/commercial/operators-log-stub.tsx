import { COMMERCIAL_ROUTES, OPERATOR_LOG } from '@/lib/commercial/outward-copy';
import { sourceUrl, type SourceProvenance } from '@/lib/config/source-provenance';
import { CopyGradeNote, DraftMark, Sentence } from '@/components/commercial/copy-chrome';

/**
 * CP1 STUB ONLY.
 *
 * The front door links “I run a firm” here, so the route must exist as an explicit
 * awaiting-evidence page rather than a 404. Full CP2 apparatus (sections, capture) is
 * not this package. Do not compose session prose.
 */
export function OperatorsLogStub({ provenance }: { readonly provenance: SourceProvenance }) {
  const runbookHref = sourceUrl(provenance, 'docs/O1_OPERATOR_RUNBOOK.md');

  return (
    <div className="mx-auto max-w-6xl px-6 py-14 space-y-10">
      <header className="prose-measure space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="label">{OPERATOR_LOG.status.text}</span>
          <DraftMark />
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
        <CopyGradeNote />
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

      <p className="text-sm prose-measure" style={{ color: 'var(--ink-muted)' }}>
        The hireable offer is already specified:{' '}
        <a href={COMMERCIAL_ROUTES.engagement} className="hover:opacity-70" style={{ color: 'var(--accent)' }}>
          Revenue Leak Audit
        </a>
        . The log body (CP2b) is composed only from{' '}
        <span className="instrument">docs/evidence/o1/</span> after a real operating run.
      </p>
    </div>
  );
}
