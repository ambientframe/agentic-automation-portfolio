import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  LEAD_RESCUE_SCENARIOS,
  leadRescueScenarioBySlug,
} from '@/data/profiles/kestrel/scenarios/lead-rescue';
import { KESTREL } from '@/data/profiles/kestrel/profile';
import { LEAD_RESCUE } from '@/data/systems';
import { LEAD_RESCUE_HANDLERS } from '@/lib/engine/handlers/lead-rescue';
import { runScenario } from '@/lib/engine/run';
import { FixtureDecisionProvider } from '@/lib/ports/decision-provider';
import { Simulator } from '@/components/simulator';

export function generateStaticParams() {
  return LEAD_RESCUE_SCENARIOS.map((s) => ({ slug: s.slug }));
}

export default async function SimulatorPage({ params }: PageProps<'/simulator/[slug]'>) {
  const { slug } = await params;
  const scenario = leadRescueScenarioBySlug(slug);
  if (scenario === undefined) notFound();

  // The real engine, running now, on this request. Not a recording.
  const run = await runScenario(scenario, {
    system: LEAD_RESCUE,
    profile: KESTREL,
    handlers: LEAD_RESCUE_HANDLERS,
    provider: new FixtureDecisionProvider(scenario.judgments),
  });

  const matchedExpectation = run.finalState.lifecycleState === scenario.expectedFinalState;

  return (
    <div className="mx-auto max-w-6xl px-6 py-12 space-y-10">
      <nav className="instrument flex flex-wrap gap-4">
        <Link href="/" style={{ color: 'var(--ink-muted)' }} className="hover:opacity-70">
          ← All systems
        </Link>
        <Link
          href={`/systems/${LEAD_RESCUE.slug}`}
          style={{ color: 'var(--ink-muted)' }}
          className="hover:opacity-70"
        >
          Lead Rescue dossier
        </Link>
      </nav>

      <header className="space-y-5">
        <span className="label">{LEAD_RESCUE.name} · incident replay</span>
        <h1 className="display text-3xl sm:text-4xl">{scenario.title}</h1>
        <p className="lede prose-measure">{scenario.summary}</p>

        <ul className="grid gap-2 sm:grid-cols-2 pt-2">
          {scenario.demonstrates.map((item) => (
            <li
              key={item}
              className="instrument leading-relaxed pl-4 relative"
              style={{ color: 'var(--ink-muted)' }}
            >
              <span className="absolute left-0" style={{ color: 'var(--accent)' }}>
                ·
              </span>
              {item}
            </li>
          ))}
        </ul>
      </header>

      <div
        className="border rule rounded-sm p-4 flex flex-wrap items-center gap-x-6 gap-y-2"
        style={{ background: 'var(--panel)' }}
      >
        <span className="label">Run status</span>
        <span
          className="badge"
          style={
            matchedExpectation
              ? { color: 'var(--ok)', borderColor: 'var(--ok)' }
              : { color: 'var(--blocked)', borderColor: 'var(--blocked)' }
          }
        >
          {matchedExpectation ? 'Matched expectation' : 'Diverged from expectation'}
        </span>
        <span className="instrument" style={{ color: 'var(--ink-muted)' }}>
          Executed on this request by the engine. Deterministic — reloading produces an identical
          run.
        </span>
      </div>

      <Simulator run={run} expectedFinalState={scenario.expectedFinalState} />

      <section className="border rule rounded-sm p-5 space-y-3" style={{ background: 'var(--panel)' }}>
        <h2 className="label">What is real here, and what is not</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <p className="instrument font-medium" style={{ color: 'var(--ok)' }}>
              Genuinely executing
            </p>
            <ul className="instrument space-y-1" style={{ color: 'var(--ink-muted)' }}>
              <li>· Schema validation and normalisation</li>
              <li>· Duplicate event and entity detection</li>
              <li>· Consent screening, ahead of commercial intent</li>
              <li>· Confidence-floor comparison against client policy</li>
              <li>· Missing-field computation</li>
              <li>· Lifecycle transition legality</li>
              <li>· Idempotency ledger and duplicate suppression</li>
              <li>· Authority gate on every side effect</li>
            </ul>
          </div>
          <div className="space-y-1.5">
            <p className="instrument font-medium" style={{ color: 'var(--warn)' }}>
              Simulated
            </p>
            <ul className="instrument space-y-1" style={{ color: 'var(--ink-muted)' }}>
              <li>· Free-text interpretation, replayed from authored fixtures</li>
              <li>· Every side effect — nothing left this process</li>
              <li>· The business, its clients, and this incident</li>
              <li>· All timestamps, which are authored rather than observed</li>
            </ul>
            <p className="instrument pt-1" style={{ color: 'var(--ink-faint)' }}>
              The judgment provider is a typed port. Replacing it with a live model changes one
              implementation and nothing else on this page.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
