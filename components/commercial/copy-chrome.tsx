import type { CSSProperties, ElementType } from 'react';
import type { OutwardSentence } from '@/lib/commercial/outward-copy';
import { COPY_GRADE_LABEL } from '@/lib/commercial/outward-copy';
import type { PresentedField } from '@/lib/config/commercial-declaration';
import { sourceUrl, type SourceProvenance } from '@/lib/config/source-provenance';

export function DraftMark() {
  return (
    <span
      className="badge"
      style={{ color: 'var(--warn)', background: 'var(--warn-bg)', borderColor: 'var(--warn)' }}
    >
      Draft copy
    </span>
  );
}

export function CopyGradeNote() {
  return (
    <p className="instrument leading-relaxed prose-measure" style={{ color: 'var(--warn)' }}>
      {COPY_GRADE_LABEL}. It is in the repository so it can be checked, not so it can be treated as final.
    </p>
  );
}

export function UnsetFieldView({ field }: { readonly field: PresentedField }) {
  if (field.status === 'DECLARED') {
    if (field.href !== null) {
      return (
        <a href={field.href} className="hover:opacity-70" style={{ color: 'var(--ink)' }}>
          {field.display}
        </a>
      );
    }
    return <span>{field.display}</span>;
  }

  return (
    <span className="inline-flex flex-wrap items-baseline gap-x-2 gap-y-1">
      <span
        className="badge"
        style={{ color: 'var(--warn)', background: 'var(--warn-bg)', borderColor: 'var(--warn)' }}
      >
        Unset
      </span>
      <span style={{ color: 'var(--ink-muted)' }}>{field.display}</span>
      {field.unsetReason !== null && (
        <span className="instrument" style={{ color: 'var(--ink-faint)' }}>
          {field.unsetReason}
        </span>
      )}
    </span>
  );
}

export function Sentence({
  sentence,
  provenance,
  as: Tag = 'p',
  className,
  style,
}: {
  readonly sentence: OutwardSentence;
  readonly provenance: SourceProvenance;
  readonly as?: ElementType;
  readonly className?: string;
  readonly style?: CSSProperties;
}) {
  const backing = sentence.backing;
  return (
    <Tag className={className} style={style}>
      {sentence.text}{' '}
      {backing.kind === 'ARTIFACT' ? (
        <a
          href={sourceUrl(provenance, backing.path)}
          target="_blank"
          rel="noreferrer"
          className="instrument hover:opacity-70"
          style={{ color: 'var(--accent)' }}
        >
          Check: {backing.path}
        </a>
      ) : (
        <span
          className="badge"
          style={{ color: 'var(--ink-muted)', borderColor: 'var(--rule-strong)' }}
        >
          {backing.label.replace(/_/g, ' ')}
        </span>
      )}
    </Tag>
  );
}
