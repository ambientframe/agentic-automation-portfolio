import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ALL_RUNNABLE_SCENARIOS, findRunnableScenario } from '@/lib/engine/registry';
import { runScenario } from '@/lib/engine/run';
import { FixtureDecisionProvider } from '@/lib/ports/decision-provider';
import { FixtureSideEffectExecutor } from '@/lib/ports/side-effect-executor';
import { FixtureExtractionProvider } from '@/lib/ports/extraction-provider';
import { FixtureResourceProvisioner } from '@/lib/ports/resource-provisioner';
import { Simulator } from '@/components/simulator';

export function generateStaticParams() {
  return ALL_RUNNABLE_SCENARIOS.map((s) => ({ slug: s.slug }));
}

export default async function SimulatorPage({ params }: PageProps<'/simulator/[slug]'>) {
  const { slug } = await params;
  const found = findRunnableScenario(slug);
  if (found === undefined) notFound();
  const { runnable, scenario } = found;

  // The real engine, running now, on this request. Not a recording.
  const run = await runScenario(scenario, {
    system: runnable.system,
    profile: runnable.profile,
    handlers: runnable.handlers,
    provider: new FixtureDecisionProvider(scenario.judgments),
    ...(runnable.sendOutcomes === undefined
      ? {}
      : { executor: new FixtureSideEffectExecutor(runnable.sendOutcomes, runnable.verifyOutcomes ?? {}) }),
    ...(runnable.extractions === undefined
      ? {}
      : { extractionProvider: new FixtureExtractionProvider(runnable.extractions) }),
    // Harmless for every system that never declares a `provisionAttempts` request — the
    // pre-pass only ever touches this when a scenario actually asks for one. Unlike the
    // other two ports, it needs no per-scenario fixture data: it reconciles for real.
    provisioner: new FixtureResourceProvisioner(),
  });

  const matchedExpectation = run.finalState.lifecycleState === scenario.expectedFinalState;

  return (
    <div className="mx-auto max-w-6xl px-6 py-12 space-y-10">
      <nav className="instrument flex flex-wrap gap-4">
        <Link href="/" style={{ color: 'var(--ink-muted)' }} className="hover:opacity-70">
          ← All systems
        </Link>
        <Link
          href={`/systems/${runnable.system.slug}`}
          style={{ color: 'var(--ink-muted)' }}
          className="hover:opacity-70"
        >
          {runnable.system.name} dossier
        </Link>
      </nav>

      <header className="space-y-5">
        <span className="label">{runnable.system.name} · incident replay</span>
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
          <div className="space-y-2">
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
              <li>· Retry-safety gating for effects with an uncertain execution outcome</li>
            </ul>
          </div>
          <div className="space-y-2">
            <p className="instrument font-medium" style={{ color: 'var(--warn)' }}>
              Simulated
            </p>
            <ul className="instrument space-y-1" style={{ color: 'var(--ink-muted)' }}>
              <li>· Free-text interpretation, replayed from authored fixtures</li>
              <li>· Provider send/verify outcomes, replayed from authored fixtures</li>
              <li>· Every side effect — nothing left this process</li>
              <li>· The business, its clients, and this incident</li>
              <li>· All timestamps, which are authored rather than observed</li>
            </ul>
            <p className="instrument pt-1" style={{ color: 'var(--ink-faint)' }}>
              The judgment provider and the side-effect executor are both typed ports. Replacing
              either with a live model or a real provider changes one implementation and nothing
              else on this page.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
