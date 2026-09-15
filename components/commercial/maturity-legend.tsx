import { ALL_SYSTEMS } from '@/data/systems';
import { MATURITY_INTRO } from '@/lib/commercial/outward-copy';
import { maturityLegendEntries } from '@/lib/commercial/maturity-legend';
import type { SourceProvenance } from '@/lib/config/source-provenance';
import { MaturityBadge } from '@/components/badges';
import { Sentence } from '@/components/commercial/copy-chrome';

/**
 * PLAIN-LANGUAGE LEGEND for every maturity label the model can emit.
 *
 * Rendered on surfaces that show those labels. Unused levels stay visible as unused
 * so a new badge cannot appear without a sentence.
 */
export function MaturityLegend({
  provenance,
  compact = false,
}: {
  readonly provenance: SourceProvenance;
  readonly compact?: boolean;
}) {
  const entries = maturityLegendEntries(ALL_SYSTEMS);

  if (compact) {
    return (
      <details className="text-left">
        <summary className="label cursor-pointer hover:opacity-70">
          What these maturity labels mean
        </summary>
        <LegendBody provenance={provenance} entries={entries} />
      </details>
    );
  }

  return (
    <section className="space-y-4" aria-label="Maturity legend">
      <div className="flex flex-wrap items-baseline justify-between gap-4 border-b rule pb-3">
        <h2 className="display text-xl">Maturity labels</h2>
        <p className="instrument" style={{ color: 'var(--ink-faint)' }}>
          Descriptive, not aspirational
        </p>
      </div>
      <LegendBody provenance={provenance} entries={entries} />
    </section>
  );
}

function LegendBody({
  provenance,
  entries,
}: {
  readonly provenance: SourceProvenance;
  readonly entries: ReturnType<typeof maturityLegendEntries>;
}) {
  return (
    <div className="space-y-3 pt-3">
      <Sentence
        sentence={MATURITY_INTRO}
        provenance={provenance}
        className="instrument leading-relaxed prose-measure"
        style={{ color: 'var(--ink-muted)' }}
      />
      <ul>
        {entries.map((entry) => (
          <li
            key={entry.level}
            className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b rule py-2"
          >
            <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <MaturityBadge level={entry.level} />
              {!entry.inUse && (
                <span className="instrument" style={{ color: 'var(--ink-faint)' }}>
                  Unused on this site
                </span>
              )}
            </span>
            <span className="instrument prose-measure" style={{ color: 'var(--ink-muted)' }}>
              {entry.plain}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
