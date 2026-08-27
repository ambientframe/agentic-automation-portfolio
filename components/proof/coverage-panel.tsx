import type { CoverageView } from '@/lib/proof/coverage-view';

/**
 * HOW MUCH OF THE DECLARED LIFECYCLE A VISITOR CAN ACTUALLY WATCH.
 *
 * Dumb by design, like the rest of the proof chrome: everything here arrives computed.
 *
 * The uncovered moves are listed rather than tallied, and that is the whole point of the
 * component. A number alone ("15 of 37") asks to be trusted. A named list of the other 22, each
 * readable without decoding an id, asks to be checked — and a page that hands a sceptic the
 * means to check it is making a different kind of claim than one that does not.
 */
export function CoveragePanel({ view }: { readonly view: CoverageView }) {
  const marks = Array.from({ length: view.declared }, (_, i) => i < view.exercised);

  return (
    <div className="border rule rounded-sm overflow-hidden" style={{ background: 'var(--panel)' }}>
      <div className="p-5 sm:p-6 space-y-5 border-b rule">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <span className="display text-3xl">
            {view.exercised}
            <span style={{ color: 'var(--ink-faint)' }}> / {view.declared}</span>
          </span>
          <span className="label" style={{ color: 'var(--ink-muted)' }}>
            declared moves you can watch · {view.percentage}%
          </span>
        </div>

        <p className="text-base leading-relaxed prose-measure">{view.headline}</p>

        {/* One mark per declared transition. Filled means a scenario genuinely drives it. */}
        <div className="flex flex-wrap gap-1" aria-hidden="true">
          {marks.map((exercised, i) => (
            <span
              key={i}
              className="state-mark"
              style={{
                background: exercised ? 'var(--ok)' : 'transparent',
                border: `1px solid ${exercised ? 'transparent' : 'var(--rule-strong)'}`,
              }}
            />
          ))}
        </div>
      </div>

      {view.unexercised.length > 0 && (
        <details className="border-b rule">
          <summary className="label cursor-pointer select-none p-5 sm:p-6 hover:opacity-70">
            The {view.unexercised.length} moves no scenario drives yet — named, not summarised
          </summary>
          <div className="px-5 sm:px-6 pb-5 sm:pb-6">
            <ul className="grid gap-px border rule rounded-sm overflow-hidden" style={{ background: 'var(--rule)' }}>
              {view.unexercised.map((row) => (
                <li key={row.id} className="p-3.5 space-y-1" style={{ background: 'var(--paper-raised)' }}>
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                    <span className="instrument shrink-0" style={{ color: 'var(--ink-faint)' }}>
                      {row.id}
                    </span>
                    <span className="text-[0.9375rem]">
                      {row.from} <span style={{ color: 'var(--ink-faint)' }}>→</span> {row.to}
                    </span>
                  </div>
                  <p className="instrument leading-relaxed" style={{ color: 'var(--ink-muted)' }}>
                    {row.trigger}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </details>
      )}

      <div className="p-5 sm:p-6 space-y-2.5">
        <p className="label" style={{ color: 'var(--ink-faint)' }}>
          What this number does and does not mean
        </p>
        {view.caveats.map((caveat) => (
          <p key={caveat} className="instrument leading-relaxed prose-measure" style={{ color: 'var(--ink-muted)' }}>
            {caveat}
          </p>
        ))}
      </div>
    </div>
  );
}
