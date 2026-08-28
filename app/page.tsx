import Link from 'next/link';
import { ALL_SYSTEMS } from '@/data/systems';
import type { SystemDefinition } from '@/lib/model/system';
import { KESTREL } from '@/data/profiles/kestrel/profile';
import { ALL_RUNNABLE_SCENARIOS, RUNNABLE_SYSTEMS } from '@/lib/engine/registry';
import { MaturityBadge, ProvenanceBadge } from '@/components/badges';
import { deriveRetargetingEvidence } from '@/lib/proof/retargeting-evidence';

/**
 * Index-First. The page IS the index — six systems, then the runnable incidents.
 * No feature cards, no CTA strip. Rows separated by hairline rules; the links are
 * the buttons. Column widths are deliberately unequal so the row never reads as a
 * three-up feature grid.
 */
export default function PortfolioPage() {
  const runnable = new Set(ALL_RUNNABLE_SCENARIOS.map((s) => s.systemId));
  const retargeting = deriveRetargetingEvidence();

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

        {/*
          The sentence above used to end the section, which left the artifact's central
          commercial claim asserted and unbackable — COMMERCIAL_THESIS.md §5. What follows is
          the evidence for it, derived from the register at build time so it cannot drift.
        */}
        <div className="border-t rule pt-4 space-y-3">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="label">That claim, checked</span>
            <p className="instrument" style={{ color: 'var(--ink-faint)' }}>
              {retargeting.businesses.length} businesses · {retargeting.contractKeyCount} contract
              keys each · {retargeting.authoredScenarioCount} scenarios under every one
            </p>
          </div>

          <p className="instrument leading-relaxed prose-measure" style={{ color: 'var(--ink-muted)' }}>
            Each business below declares the same {retargeting.contractKeyCount} operating
            parameters the engine reads, and the six systems run against it unchanged. Every
            authored scenario executes under each profile it was <em>not</em> written for, and
            each must reach different outcomes from the others in at least three of the six
            systems — a profile the handlers read and then ignored would fail that. Three of these
            were authored by separate agents working only from the written packet.
          </p>

          <ul className="instrument">
            {retargeting.businesses.map((business) => (
              <li
                key={business.id}
                className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b rule py-2"
              >
                <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span style={{ color: 'var(--ink)' }}>{business.name}</span>
                  <span style={{ color: 'var(--ink-faint)' }}>{business.trade}</span>
                </span>
                <span className="flex flex-wrap items-baseline gap-x-4 gap-y-1" style={{ color: 'var(--ink-faint)' }}>
                  <span>{business.headcount} people</span>
                  <span>${(business.approximateAnnualRevenue / 1_000_000).toFixed(2)}M</span>
                  <span>{business.groundingSourceCount} sources</span>
                  {business.isRendered && <span className="badge">Depicted above</span>}
                </span>
              </li>
            ))}
          </ul>

          <p className="instrument leading-relaxed prose-measure" style={{ color: 'var(--ink-faint)' }}>
            {retargeting.structuralFixtureCount === 1
              ? 'One further profile is a structural fixture: it is'
              : `A further ${retargeting.structuralFixtureCount} profiles are structural fixtures: they are`}{' '}
            deliberately ungrounded, {retargeting.structuralFixtureCount === 1 ? 'appears' : 'appear'}{' '}
            on no page as a business, and {retargeting.structuralFixtureCount === 1 ? 'exists' : 'exist'}{' '}
            only so the seam can be falsified rather than asserted. {retargeting.limit}
          </p>
        </div>
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
              <Link href={proofHref(system)} className="index-row group block py-6 px-2 -mx-2">
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
          {ALL_RUNNABLE_SCENARIOS.map((scenario, index) => (
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

/**
 * Where a system's row sends a visitor.
 *
 * This used to be `/systems/<slug>` for all six — the technical dossier. That made the
 * engineering register the default first impression for every system in the portfolio, which
 * is precisely backwards for the audience this is built for: the dossier answers "how is this
 * wired", and a buyer's first question is "what expensive thing does this prevent".
 *
 * The dossier is not hidden — every proof page links to it in its first line of navigation.
 * It is just no longer the front door.
 */
function proofHref(system: SystemDefinition): string {
  if (system.slug === 'lead-rescue') return '/lead-rescue';
  return RUNNABLE_SYSTEMS.some((r) => r.system.slug === system.slug)
    ? `/proof/${system.slug}`
    : `/systems/${system.slug}`;
}
