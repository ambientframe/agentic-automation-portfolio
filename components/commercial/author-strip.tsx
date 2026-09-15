import { AUTHOR } from '@/lib/commercial/outward-copy';
import { presentDeclaration, type CommercialDeclaration } from '@/lib/config/commercial-declaration';
import type { SourceProvenance } from '@/lib/config/source-provenance';
import { DraftMark, Sentence, UnsetFieldView } from '@/components/commercial/copy-chrome';

/**
 * WHO IS ACCOUNTABLE — provenance, not a founder story.
 *
 * Identity is a CD1 slot. Until it is declared, the strip shows the unset state rather than
 * a name borrowed from git history or from internal documents' use of "Chris".
 */
export function AuthorStrip({
  declaration,
  provenance,
}: {
  readonly declaration: CommercialDeclaration;
  readonly provenance: SourceProvenance;
}) {
  const presented = presentDeclaration(declaration);

  return (
    <section className="border-t border-b rule py-5 space-y-3" aria-label="Author">
      <div className="flex flex-wrap items-center gap-2">
        <span className="label">Author</span>
        <DraftMark />
      </div>
      <p className="text-sm leading-relaxed">
        <span className="label mr-2">Public name</span>
        <UnsetFieldView field={presented.publicName} />
      </p>
      <Sentence
        sentence={AUTHOR.identity}
        provenance={provenance}
        className="text-sm leading-relaxed prose-measure"
        style={{ color: 'var(--ink-muted)' }}
      />
      <Sentence
        sentence={AUTHOR.provenance}
        provenance={provenance}
        className="text-sm leading-relaxed prose-measure"
        style={{ color: 'var(--ink-muted)' }}
      />
      <Sentence
        sentence={AUTHOR.namespace}
        provenance={provenance}
        className="instrument leading-relaxed prose-measure"
        style={{ color: 'var(--ink-faint)' }}
      />
    </section>
  );
}
