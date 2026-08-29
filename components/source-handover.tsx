import type { SourceHandover as Handover } from '@/lib/config/source-provenance';

/**
 * THE WAY OUT OF THE ARTIFACT, INTO THE EVIDENCE.
 *
 * `COMMERCIAL_THESIS.md` §9 is one sentence — "the work is open, its limits are published, and
 * you can check it yourself" — and until this existed a visitor could not. The repository URL
 * appeared in no file in this repository. The README linked the site; nothing linked back, so
 * the only surface most strangers will ever see was the one with no route to the evidence.
 *
 * It renders in the colophon rather than on the home page deliberately. A visitor arriving from
 * the README lands on `/lead-rescue`; one arriving from anywhere else lands wherever the link
 * pointed. The handover has to be wherever they are, so it is on every page.
 *
 * Presentational only, and given its handover rather than reading the environment, so the real
 * emitted markup is assertable — `tests/source-provenance.test.ts` renders this component and
 * checks the links it actually produces. The last line is not decoration: a `main` link with no
 * sentence about which commit produced the page is a claim this build usually cannot support.
 */
export function SourceHandover({ handover }: { handover: Handover }) {
  return (
    <section className="border-t rule pt-5 space-y-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="label">Check it yourself</span>
        <p className="instrument" style={{ color: 'var(--ink-faint)' }}>
          Nothing here asks to be believed
        </p>
      </div>

      <ul>
        {handover.references.map((reference) => (
          <li key={reference.path}>
            <a
              href={reference.href}
              target="_blank"
              rel="noreferrer"
              className="index-row group flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 py-3 px-2 -mx-2"
            >
              <span className="text-sm group-hover:opacity-70" style={{ color: 'var(--ink)' }}>
                {reference.label}
              </span>
              <span className="instrument prose-measure" style={{ color: 'var(--ink-muted)' }}>
                {reference.says}
              </span>
            </a>
          </li>
        ))}
      </ul>

      <p className="instrument leading-relaxed prose-measure" style={{ color: 'var(--ink-faint)' }}>
        {handover.commitStatement} {handover.doesNotProve}
      </p>
    </section>
  );
}
