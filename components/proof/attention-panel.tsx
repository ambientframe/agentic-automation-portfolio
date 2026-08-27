import type { AttentionView } from '@/lib/proof/attention-view';

/**
 * WHERE A CASE CAN BE PARKED AND NOBODY IS OBLIGED TO COME BACK FOR IT.
 *
 * Dumb by design, like the rest of the proof chrome: everything arrives computed.
 *
 * The companion to the coverage panel, and deliberately the less flattering of the two.
 * Coverage asks how much of the map a visitor can watch. This asks where the map stops
 * promising anything — which is the question a buyer actually has after being told that
 * anything past the system's authority ends with a person holding the case. "A person holds it"
 * is only reassuring if something happens when that person does not.
 *
 * Colour follows the repository's rule: reserved for provenance and runtime state. An exposed
 * state is marked with `--warn` because it IS a state of the model, not because a list is
 * alarming.
 */
export function AttentionPanel({ view }: { readonly view: AttentionView }) {
  return (
    <div className="border rule rounded-sm overflow-hidden" style={{ background: 'var(--panel)' }}>
      <div className="p-5 sm:p-6 space-y-5 border-b rule">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <span className="display text-3xl" style={{ color: view.clean ? undefined : 'var(--warn)' }}>
            {view.abandonable.length}
            <span style={{ color: 'var(--ink-faint)' }}> / {view.parked}</span>
          </span>
          <span className="label" style={{ color: 'var(--ink-muted)' }}>
            parked states with nothing declared about being abandoned
          </span>
        </div>

        <p className="text-base leading-relaxed prose-measure">{view.headline}</p>
      </div>

      {view.abandonable.length > 0 && (
        <div className="px-5 sm:px-6 py-5 sm:py-6 border-b rule">
          <ul className="grid gap-px border rule rounded-sm overflow-hidden" style={{ background: 'var(--rule)' }}>
            {view.abandonable.map((row) => (
              <li key={row.stateId} className="p-3.5 space-y-1.5" style={{ background: 'var(--paper-raised)' }}>
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                  <span className="instrument shrink-0" style={{ color: 'var(--ink-faint)' }}>
                    {row.stateId}
                  </span>
                  <span className="text-[0.9375rem]">{row.stateLabel}</span>
                </div>
                <p className="instrument leading-relaxed" style={{ color: 'var(--ink-muted)' }}>
                  {row.exits.length === 1 ? 'Its only way out needs a person: ' : 'Every way out needs a person: '}
                  {row.exits.map((exit) => `${exit.id} → ${exit.to}`).join(', ')}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="p-5 sm:p-6 space-y-2.5">
        <p className="label" style={{ color: 'var(--ink-faint)' }}>
          What this does and does not mean
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
