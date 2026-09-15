import {
  FRONT_DOOR,
  HONESTY,
  ROUTES,
  COMMERCIAL_ROUTES,
} from '@/lib/commercial/outward-copy';
import type { CommercialDeclaration } from '@/lib/config/commercial-declaration';
import type { SourceProvenance } from '@/lib/config/source-provenance';
import { AuthorStrip } from '@/components/commercial/author-strip';
import { CopyGradeNote, DraftMark, Sentence } from '@/components/commercial/copy-chrome';

/**
 * BUSINESS-FIRST TOP OF THE FRONT DOOR.
 *
 * Problem, author, honesty inversion, two routes. The existing homepage index stays below
 * this block as the evaluator layer — this component does not replace it.
 */
export function FrontDoor({
  declaration,
  provenance,
}: {
  readonly declaration: CommercialDeclaration;
  readonly provenance: SourceProvenance;
}) {
  return (
    <div className="space-y-10">
      <section className="prose-measure space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="label">{FRONT_DOOR.kicker.text}</span>
          <DraftMark />
        </div>
        <h1 className="display text-3xl sm:text-4xl">{FRONT_DOOR.headline.text}</h1>
        <Sentence
          sentence={FRONT_DOOR.problem}
          provenance={provenance}
          className="text-[0.9375rem] leading-relaxed"
          style={{ color: 'var(--ink-muted)' }}
        />
        <Sentence
          sentence={FRONT_DOOR.positioning}
          provenance={provenance}
          className="text-[0.9375rem] leading-relaxed"
          style={{ color: 'var(--ink-muted)' }}
        />
        <CopyGradeNote />
      </section>

      <AuthorStrip declaration={declaration} provenance={provenance} />

      <section className="space-y-4" aria-label="What is real, simulated, or unclaimed">
        <span className="label">Honesty inversion</span>
        <div
          className="grid gap-px border rule rounded-sm overflow-hidden lg:grid-cols-3"
          style={{ background: 'var(--rule)' }}
        >
          <HonestyCell sentence={HONESTY.real} provenance={provenance} />
          <HonestyCell sentence={HONESTY.simulated} provenance={provenance} />
          <HonestyCell sentence={HONESTY.unclaimed} provenance={provenance} />
        </div>
      </section>

      <section className="space-y-3" aria-label="Choose a route">
        <span className="label">Two routes</span>
        <div className="grid gap-px border rule rounded-sm overflow-hidden sm:grid-cols-2" style={{ background: 'var(--rule)' }}>
          <a
            href={COMMERCIAL_ROUTES.operatorLog}
            className="index-row block p-5 space-y-2"
            style={{ background: 'var(--paper-raised)' }}
          >
            <h2 className="display text-xl">{ROUTES.firmLabel.text}</h2>
            <p className="text-sm leading-relaxed" style={{ color: 'var(--ink-muted)' }}>
              {ROUTES.firmHint.text}
            </p>
            <p className="instrument" style={{ color: 'var(--accent)' }}>
              Operator’s log → {COMMERCIAL_ROUTES.operatorLog}
            </p>
            <p className="instrument" style={{ color: 'var(--ink-faint)' }}>
              Offer → {COMMERCIAL_ROUTES.engagement}
            </p>
          </a>
          <a
            href={COMMERCIAL_ROUTES.evaluator}
            className="index-row block p-5 space-y-2"
            style={{ background: 'var(--paper-raised)' }}
          >
            <h2 className="display text-xl">{ROUTES.evaluateLabel.text}</h2>
            <p className="text-sm leading-relaxed" style={{ color: 'var(--ink-muted)' }}>
              {ROUTES.evaluateHint.text}
            </p>
            <p className="instrument" style={{ color: 'var(--accent)' }}>
              Evaluator layer ↓
            </p>
          </a>
        </div>
        <p className="instrument" style={{ color: 'var(--ink-faint)' }}>
          The firm route also leads to{' '}
          <a href={COMMERCIAL_ROUTES.engagement} className="hover:opacity-70" style={{ color: 'var(--accent)' }}>
            the Revenue Leak Audit
          </a>
          . The log is a reserved slot until a recorded operating session exists.
        </p>
      </section>
    </div>
  );
}

function HonestyCell({
  sentence,
  provenance,
}: {
  readonly sentence: (typeof HONESTY)[keyof typeof HONESTY];
  readonly provenance: SourceProvenance;
}) {
  return (
    <div className="p-5" style={{ background: 'var(--paper-raised)' }}>
      <Sentence
        sentence={sentence}
        provenance={provenance}
        className="text-sm leading-relaxed"
        style={{ color: 'var(--ink-muted)' }}
      />
    </div>
  );
}
