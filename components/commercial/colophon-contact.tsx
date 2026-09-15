import { COLOPHON_COPY, COMMERCIAL_ROUTES, ENGAGEMENT_OFFER_NAME } from '@/lib/commercial/outward-copy';
import { presentDeclaration, type CommercialDeclaration } from '@/lib/config/commercial-declaration';
import type { SourceProvenance } from '@/lib/config/source-provenance';
import { Sentence, UnsetFieldView } from '@/components/commercial/copy-chrome';

/**
 * COLOPHON CONTACT — identity, offer, fee, and conversion, on every page.
 *
 * Gate condition 3: name, offer, and fee reachable from any page in ≤2 clicks.
 * Until CD1, the unset state is the reachable thing.
 */
export function ColophonContact({
  declaration,
  provenance,
}: {
  readonly declaration: CommercialDeclaration;
  readonly provenance: SourceProvenance;
}) {
  const presented = presentDeclaration(declaration);

  return (
    <section className="border-t rule pt-5 space-y-3" aria-label="Operator and offer">
      <span className="label">Operator and offer</span>
      <dl className="instrument space-y-2">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <dt className="label">Name</dt>
          <dd>
            <UnsetFieldView field={presented.publicName} />
          </dd>
        </div>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <dt className="label">Identity</dt>
          <dd>
            <Sentence sentence={COLOPHON_COPY.identity} provenance={provenance} as="span" />
          </dd>
        </div>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <dt className="label">Offer</dt>
          <dd>
            <a href={COMMERCIAL_ROUTES.engagement} className="hover:opacity-70" style={{ color: 'var(--accent)' }}>
              {ENGAGEMENT_OFFER_NAME}
            </a>
            <span className="ml-2" style={{ color: 'var(--ink-faint)' }}>
              {COLOPHON_COPY.offer.text}
            </span>
          </dd>
        </div>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <dt className="label">Fee</dt>
          <dd>
            <UnsetFieldView field={presented.engagementFee} />
          </dd>
        </div>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <dt className="label">Write</dt>
          <dd>
            <UnsetFieldView field={presented.contactEmail} />
          </dd>
        </div>
      </dl>
    </section>
  );
}

export function CommercialNav() {
  return (
    <nav className="instrument mt-4 flex flex-wrap items-center justify-center gap-x-5 gap-y-2" aria-label="Commercial">
      <a href={COMMERCIAL_ROUTES.engagement} className="hover:opacity-70" style={{ color: 'var(--ink-muted)' }}>
        {ENGAGEMENT_OFFER_NAME}
      </a>
      <a href={COMMERCIAL_ROUTES.operatorLog} className="hover:opacity-70" style={{ color: 'var(--ink-muted)' }}>
        Operator’s log
      </a>
      <a href={COMMERCIAL_ROUTES.evaluator} className="hover:opacity-70" style={{ color: 'var(--ink-muted)' }}>
        I evaluate systems
      </a>
    </nav>
  );
}
