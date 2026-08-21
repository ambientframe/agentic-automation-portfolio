import Link from 'next/link';
import { ALL_SYSTEMS } from '@/data/systems';
import { KESTREL } from '@/data/profiles/kestrel/profile';
import { LEAD_RESCUE_SCENARIOS } from '@/data/profiles/kestrel/scenarios/lead-rescue';
import { MaturityBadge, ProvenanceBadge } from '@/components/badges';
import { isLive } from '@/lib/model/system';

export default function PortfolioPage() {
  const runnable = new Set(LEAD_RESCUE_SCENARIOS.map((s) => s.systemId));

  return (
    <div className="mx-auto max-w-6xl px-6 py-16 space-y-20">
      {/* --- Editorial layer: the claim ------------------------------------ */}
      <section className="prose-measure space-y-6">
        <h1 className="display text-4xl sm:text-5xl">
          Six small-business operating systems, built to be inspected.
        </h1>
        <p className="lede">
          Not a gallery of workflow diagrams. Each system here models how a real business
          incident moves through state, decisions, policy, bounded AI judgment, human
          authority, actions, verification, and recovery — and lets you open it up and check
          the wiring.
        </p>
        <p className="text-[0.9375rem] leading-relaxed" style={{ color: 'var(--ink-muted)' }}>
          The business incident is the hero. The engineering is the proof.
        </p>
      </section>

      {/* --- The demonstration environment --------------------------------- */}
      <section
        className="border rule rounded-sm p-6 space-y-4"
        style={{ background: 'var(--panel)' }}
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="label">Demonstration environment</span>
          <ProvenanceBadge type="FIXTURE" />
        </div>
        <div className="flex flex-wrap gap-x-12 gap-y-4">
          <div>
            <h2 className="display text-xl">{KESTREL.name}</h2>
            <p className="text-sm mt-1" style={{ color: 'var(--ink-muted)' }}>
              {KESTREL.tagline}
            </p>
          </div>
          <dl className="instrument grid grid-cols-2 sm:grid-cols-4 gap-x-8 gap-y-2">
            <Stat label="People" value={String(KESTREL.company.headcount)} />
            <Stat
              label="Revenue"
              value={`$${(KESTREL.company.approximateAnnualRevenue / 1_000_000).toFixed(1)}M`}
            />
            <Stat
              label="Mix"
              value={`${KESTREL.revenueMix.projectPct}/${KESTREL.revenueMix.recurringPct} project/recurring`}
            />
            <Stat label="Leads / yr" value={String(KESTREL.derivedEconomics.leadsPerYear)} />
          </dl>
        </div>
        <p className="instrument leading-relaxed" style={{ color: 'var(--ink-muted)' }}>
          Every figure above is invented. The profile is deliberately swappable: system
          definitions carry no business vocabulary, so retargeting the portfolio to another
          vertical is a data change rather than a rewrite.
        </p>
      </section>

      {/* --- The six systems ------------------------------------------------ */}
      <section className="space-y-8">
        <div className="flex flex-wrap items-baseline justify-between gap-4 border-b rule pb-4">
          <h2 className="display text-2xl">The six systems</h2>
          <p className="instrument" style={{ color: 'var(--ink-faint)' }}>
            Maturity is descriptive, not aspirational.
          </p>
        </div>

        <ol className="space-y-px">
          {ALL_SYSTEMS.map((system) => (
            <li key={system.id}>
              <Link
                href={`/systems/${system.slug}`}
                className="group block border rule rounded-sm p-6 transition-colors hover:border-[var(--rule-strong)]"
                style={{ background: 'var(--paper-raised)' }}
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="flex items-baseline gap-4">
                    <span className="instrument tabular-nums" style={{ color: 'var(--ink-faint)' }}>
                      {String(system.order).padStart(2, '0')}
                    </span>
                    <h3 className="display text-xl group-hover:opacity-70 transition-opacity">
                      {system.name}
                    </h3>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <MaturityBadge level={system.maturity} />
                    {runnable.has(system.id) && (
                      <span
                        className="badge"
                        style={{ color: 'var(--accent)', borderColor: 'var(--accent)' }}
                      >
                        Runnable
                      </span>
                    )}
                  </div>
                </div>

                <div className="mt-4 grid gap-5 sm:grid-cols-3 sm:pl-11">
                  <Field label="Business problem" value={system.businessProblem} />
                  <Field label="Economic leakage" value={system.economicLeakage} />
                  <Field label="Outcome" value={system.buyerOutcome} />
                </div>

                <p
                  className="instrument mt-4 sm:pl-11 leading-relaxed"
                  style={{ color: isLive(system.maturity) ? 'var(--ink-muted)' : 'var(--warn)' }}
                >
                  {system.fidelityNote}
                </p>
              </Link>
            </li>
          ))}
        </ol>
      </section>

      {/* --- Runnable scenarios --------------------------------------------- */}
      <section className="space-y-6">
        <div className="border-b rule pb-4">
          <h2 className="display text-2xl">Runnable incidents</h2>
          <p className="text-sm mt-2 prose-measure" style={{ color: 'var(--ink-muted)' }}>
            These replay through the engine on every page load. The state machine, the
            idempotency ledger, the confidence floor, and the authority gate all genuinely
            execute — nothing below is a recorded animation.
          </p>
        </div>

        <div className="grid gap-px sm:grid-cols-3">
          {LEAD_RESCUE_SCENARIOS.map((scenario) => (
            <Link
              key={scenario.id}
              href={`/simulator/${scenario.slug}`}
              className="group block border rule rounded-sm p-5 h-full transition-colors hover:border-[var(--rule-strong)]"
              style={{ background: 'var(--paper-raised)' }}
            >
              <span className="label">Lead Rescue</span>
              <h3 className="display text-lg mt-2 group-hover:opacity-70 transition-opacity">
                {scenario.title}
              </h3>
              <p className="instrument mt-3 leading-relaxed" style={{ color: 'var(--ink-muted)' }}>
                {scenario.summary}
              </p>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="label">{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1.5">
      <p className="label">{label}</p>
      <p className="text-sm leading-relaxed" style={{ color: 'var(--ink-muted)' }}>
        {value}
      </p>
    </div>
  );
}
