import Link from 'next/link';
import { ALL_SYSTEMS } from '@/data/systems';
import { KESTREL } from '@/data/profiles/kestrel/profile';
import { LEAD_RESCUE_SCENARIOS } from '@/data/profiles/kestrel/scenarios/lead-rescue';
import { MaturityBadge, ProvenanceBadge } from '@/components/badges';

/**
 * Index-First. The page IS the index — six systems, then the runnable incidents.
 * No feature cards, no CTA strip. Rows separated by hairline rules; the links are
 * the buttons. Column widths are deliberately unequal so the row never reads as a
 * three-up feature grid.
 */
export default function PortfolioPage() {
  const runnable = new Set(LEAD_RESCUE_SCENARIOS.map((s) => s.systemId));

  return (
    <div className="mx-auto max-w-6xl px-6 py-14 space-y-16">
      {/* --- Opener: short, then straight into the index -------------------- */}
      <section className="prose-measure space-y-4">
        <h1 className="display text-3xl sm:text-4xl">
          Six small-business operating systems, built to be inspected.
        </h1>
        <p className="text-[0.9375rem] leading-relaxed" style={{ color: 'var(--ink-muted)' }}>
          Each one models how a real business incident moves through state, decisions, policy,
          bounded AI judgment, human authority, actions, verification, and recovery. Open any of
          them and check the wiring. The business incident is the hero; the engineering is the
          proof.
        </p>
      </section>

      {/* --- Demonstration environment: a meta block, not a card ------------ */}
      <section className="border-t border-b rule py-5 space-y-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="label">Demonstration environment</span>
          <ProvenanceBadge type="FIXTURE" />
        </div>
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
          <h2 className="display text-lg">{KESTREL.name}</h2>
          <p className="text-sm" style={{ color: 'var(--ink-muted)' }}>
            {KESTREL.tagline}
          </p>
        </div>
        <dl className="instrument flex flex-wrap gap-x-8 gap-y-1">
          <Stat label="People" value={String(KESTREL.company.headcount)} />
          <Stat
            label="Revenue"
            value={`$${(KESTREL.company.approximateAnnualRevenue / 1_000_000).toFixed(1)}M`}
          />
          <Stat
            label="Mix"
            value={`${KESTREL.revenueMix.projectPct}/${KESTREL.revenueMix.recurringPct}`}
          />
          <Stat label="Leads / yr" value={String(KESTREL.derivedEconomics.leadsPerYear)} />
        </dl>
        <p className="instrument leading-relaxed prose-measure" style={{ color: 'var(--ink-faint)' }}>
          Every figure above is invented. System definitions carry no business vocabulary, so
          retargeting the portfolio to another vertical is a data change rather than a rewrite.
        </p>
      </section>

      {/* --- Index one: the six systems ------------------------------------- */}
      <section>
        <div className="flex flex-wrap items-baseline justify-between gap-4 border-b rule pb-3 mb-1">
          <h2 className="display text-xl">The six systems</h2>
          <p className="instrument" style={{ color: 'var(--ink-faint)' }}>
            Maturity is descriptive, not aspirational
          </p>
        </div>

        <ol>
          {ALL_SYSTEMS.map((system) => (
            <li key={system.id}>
              <Link href={`/systems/${system.slug}`} className="index-row group block py-6 px-2 -mx-2">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
                  <h3 className="display text-xl group-hover:opacity-70">
                    <span className="instrument mr-3" style={{ color: 'var(--ink-faint)' }}>
                      {String(system.order).padStart(2, '0')}
                    </span>
                    {system.name}
                  </h3>
                  <div className="flex flex-wrap items-center gap-2">
                    <MaturityBadge level={system.maturity} />
                    {runnable.has(system.id) && (
                      <span className="badge" style={{ color: 'var(--accent)', borderColor: 'var(--accent)' }}>
                        Runnable
                      </span>
                    )}
                  </div>
                </div>

                {/* Deliberately unequal tracks — never a three-up feature grid. */}
                <div className="mt-4 grid gap-x-8 gap-y-4 md:grid-cols-[1.5fr_1fr_1.1fr]">
                  <Field label="Business problem" value={system.businessProblem} />
                  <Field label="Economic leakage" value={system.economicLeakage} />
                  <Field label="Outcome" value={system.buyerOutcome} />
                </div>

                <p className="instrument mt-4 leading-relaxed" style={{ color: 'var(--ink-faint)' }}>
                  {system.fidelityNote}
                </p>
              </Link>
            </li>
          ))}
        </ol>
      </section>

      {/* --- Index two: runnable incidents ---------------------------------- */}
      <section>
        <div className="border-b rule pb-3 mb-1">
          <h2 className="display text-xl">Runnable incidents</h2>
          <p className="text-sm mt-2 prose-measure" style={{ color: 'var(--ink-muted)' }}>
            These replay through the engine on every page load. The state machine, the idempotency
            ledger, the confidence floor, and the authority gate all genuinely execute — nothing
            below is a recorded animation.
          </p>
        </div>

        <ol>
          {LEAD_RESCUE_SCENARIOS.map((scenario, index) => (
            <li key={scenario.id}>
              <Link
                href={`/simulator/${scenario.slug}`}
                className="index-row group block py-5 px-2 -mx-2"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
                  <h3 className="display text-lg group-hover:opacity-70">
                    <span className="instrument mr-3" style={{ color: 'var(--ink-faint)' }}>
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    {scenario.title}
                  </h3>
                  <span
                    className="badge"
                    style={{ color: 'var(--ink-muted)', borderColor: 'var(--rule-strong)' }}
                  >
                    ends {scenario.expectedFinalState.replace(/_/g, ' ').toLowerCase()}
                  </span>
                </div>
                <p className="instrument mt-2 leading-relaxed prose-measure" style={{ color: 'var(--ink-muted)' }}>
                  {scenario.summary}
                </p>
              </Link>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <dt className="label">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-2">
      <p className="label">{label}</p>
      <p className="text-sm leading-relaxed" style={{ color: 'var(--ink-muted)' }}>
        {value}
      </p>
    </div>
  );
}
