import {
  COLOPHON_COPY,
  COMMERCIAL_ROUTES,
  CONVERSION,
  ENGAGEMENT,
  ENGAGEMENT_ELEMENTS,
  ENGAGEMENT_NOT_CLAIMED,
  ENGAGEMENT_OFFER_NAME,
} from '@/lib/commercial/outward-copy';
import { presentDeclaration, type CommercialDeclaration } from '@/lib/config/commercial-declaration';
import type { SourceProvenance } from '@/lib/config/source-provenance';
import { AuthorStrip } from '@/components/commercial/author-strip';
import { Sentence, UnsetFieldView } from '@/components/commercial/copy-chrome';

/**
 * THE REVENUE LEAK AUDIT — all eight concreteness elements, the not-claimed list,
 * the after-email process, and the permission-based publication statement.
 *
 * Copy is operator-approved. CD1 slots remain visibly unset.
 */
export function EngagementSurface({
  declaration,
  provenance,
}: {
  readonly declaration: CommercialDeclaration;
  readonly provenance: SourceProvenance;
}) {
  const presented = presentDeclaration(declaration);

  return (
    <div className="mx-auto max-w-6xl px-6 py-14 space-y-14">
      <header className="prose-measure space-y-4">
        <span className="label">{ENGAGEMENT.kicker.text}</span>
        <h1 className="display text-3xl sm:text-4xl">{ENGAGEMENT.headline.text}</h1>
        <Sentence
          sentence={ENGAGEMENT.lede}
          provenance={provenance}
          className="lede"
        />
        <Sentence
          sentence={ENGAGEMENT.audience}
          provenance={provenance}
          className="text-[0.9375rem] leading-relaxed"
          style={{ color: 'var(--ink-muted)' }}
        />
      </header>

      <AuthorStrip declaration={declaration} provenance={provenance} />

      <section className="space-y-4" aria-label="Fee and contact">
        <div className="flex flex-wrap items-baseline justify-between gap-4 border-b rule pb-3">
          <h2 className="display text-xl">Fee, contact, domain</h2>
          <span className="instrument" style={{ color: 'var(--ink-faint)' }}>
            CD1 slots — visible unset until declared
          </span>
        </div>
        <dl className="space-y-3">
          <Slot label="Engagement fee" field={presented.engagementFee} />
          <Slot label="Contact" field={presented.contactEmail} />
          <Slot label="Public domain" field={presented.publicDomain} />
        </dl>
        <p className="instrument leading-relaxed prose-measure" style={{ color: 'var(--ink-faint)' }}>
          {presented.contactEmail.status === 'DECLARED'
            ? 'The address above is the conversion path.'
            : 'There is no mailto while contact is unset. A conversion address invented from git history would be a silent default.'}
        </p>
      </section>

      <section className="space-y-4" aria-label="What the audit is">
        <h2 className="display text-xl">What exactly can be hired</h2>
        <ol className="space-y-6">
          {ENGAGEMENT_ELEMENTS.map((element, index) => (
            <li key={element.id} className="border-b rule pb-6 last:border-b-0">
              <p className="instrument mb-2" style={{ color: 'var(--ink-faint)' }}>
                {String(index + 1).padStart(2, '0')} of {String(ENGAGEMENT_ELEMENTS.length).padStart(2, '0')}
              </p>
              <Sentence
                sentence={element}
                provenance={provenance}
                className="text-[0.9375rem] leading-relaxed prose-measure"
                style={{ color: 'var(--ink-muted)' }}
              />
            </li>
          ))}
        </ol>
      </section>

      <section className="space-y-4" aria-label="Not claimed">
        <h2 className="display text-xl">Deliberately not claimed</h2>
        <ul>
          {ENGAGEMENT_NOT_CLAIMED.map((item) => (
            <Sentence
              key={item.id}
              sentence={item}
              provenance={provenance}
              as="li"
              className="index-row py-3 text-sm"
              style={{ color: 'var(--ink-muted)' }}
            />
          ))}
        </ul>
      </section>

      <section className="space-y-4" aria-label="After you write">
        <h2 className="display text-xl">What happens after a message</h2>
        <Sentence
          sentence={CONVERSION.afterEmail}
          provenance={provenance}
          className="text-[0.9375rem] leading-relaxed prose-measure"
          style={{ color: 'var(--ink-muted)' }}
        />
      </section>

      <section className="space-y-4" aria-label="Publication permission">
        <h2 className="display text-xl">Measurement and publication</h2>
        <Sentence
          sentence={CONVERSION.publication}
          provenance={provenance}
          className="text-[0.9375rem] leading-relaxed prose-measure"
          style={{ color: 'var(--ink-muted)' }}
        />
        <div className="border rule rounded-sm p-4 space-y-2" style={{ background: 'var(--panel)' }}>
          <span className="label">Reserved slot</span>
          <Sentence
            sentence={CONVERSION.outcomesSlot}
            provenance={provenance}
            className="text-sm leading-relaxed prose-measure"
            style={{ color: 'var(--ink-muted)' }}
          />
        </div>
      </section>

      <p className="instrument" style={{ color: 'var(--ink-faint)' }}>
        {COLOPHON_COPY.offer.text} — {ENGAGEMENT_OFFER_NAME}.{' '}
        <a href={COMMERCIAL_ROUTES.operatorLog} className="hover:opacity-70" style={{ color: 'var(--accent)' }}>
          Operator’s log
        </a>
        {' · '}
        <a href={COMMERCIAL_ROUTES.evaluator} className="hover:opacity-70" style={{ color: 'var(--accent)' }}>
          Evaluator layer
        </a>
      </p>
    </div>
  );
}

function Slot({
  label,
  field,
}: {
  readonly label: string;
  readonly field: ReturnType<typeof presentDeclaration>['engagementFee'];
}) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
      <dt className="label">{label}</dt>
      <dd>
        <UnsetFieldView field={field} />
      </dd>
    </div>
  );
}
