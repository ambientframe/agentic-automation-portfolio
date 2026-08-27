import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { RUNNABLE_SYSTEMS } from '@/lib/engine/registry';
import { runScenario } from '@/lib/engine/run';
import { FixtureDecisionProvider } from '@/lib/ports/decision-provider';
import { FixtureSideEffectExecutor } from '@/lib/ports/side-effect-executor';
import { FixtureExtractionProvider } from '@/lib/ports/extraction-provider';
import { FixtureResourceProvisioner } from '@/lib/ports/resource-provisioner';
import { deriveJourney, type Journey } from '@/lib/proof/journey';
import {
  deriveCommercialGrammar,
  toScenarioIndexEntry,
  type CommercialGrammar,
  type ScenarioIndexEntry,
} from '@/lib/proof/commercial-grammar';
import { JourneyConsole } from '@/components/proof/journey-console';
import { ActHeading, HeaderStat, ProblemCard } from '@/components/proof/proof-chrome';
import { MaturityBadge } from '@/components/badges';

/**
 * THE BUYER-FACING PROOF ROUTE, for every system that is not Lead Rescue.
 *
 * WHY THIS EXISTS. Lead Rescue had `/lead-rescue` — a page written in the register a buyer
 * reads. The other five had only `/systems/<slug>`, a technical dossier that opens with
 * paragraphs of engineering prose. A visitor comparing them concluded, correctly, that one
 * system was real and five were write-ups; `PORTFOLIO_PM_CONSTITUTION.md` §1 names that exact
 * outcome as failure. The engine layer never diverged — all six share one reducer and one port
 * set — so what was missing was never capability. It was register.
 *
 * WHAT IT DELIBERATELY DOES NOT CLAIM. Lead Rescue's page has four layers; this has two.
 * Layer C (a live operator console against real HTTP routes) and layer D (a capability fidelity
 * ledger) are absent because these systems genuinely have neither — no HTTP surface, no durable
 * persistence, no retained runtime artifacts. Rendering an empty ledger, or one that inferred
 * REAL from the same fixtures every system shares, would be exactly the borrowed credibility
 * this portfolio exists to refuse. A system earns those layers by acquiring the capability, not
 * by acquiring the component.
 *
 * Every figure below is COMPUTED from the run the engine just performed, or counted off the
 * system's own declared lifecycle. Nothing on this page is authored prose describing what the
 * system would do — with one exception, `fidelityNote`, which is rendered verbatim precisely
 * because it is the system's own statement of what is not real.
 */

/** Lead Rescue is excluded: it has its own richer page, and two competing routes would confuse. */
const PROOF_SYSTEMS = RUNNABLE_SYSTEMS.filter((r) => r.system.slug !== 'lead-rescue');

export function generateStaticParams() {
  return PROOF_SYSTEMS.map((r) => ({ slug: r.system.slug }));
}

export async function generateMetadata({ params }: PageProps<'/proof/[slug]'>): Promise<Metadata> {
  const { slug } = await params;
  const runnable = PROOF_SYSTEMS.find((r) => r.system.slug === slug);
  if (runnable === undefined) return { title: 'Not found' };
  return {
    title: `${runnable.system.name} — interactive proof`,
    description: runnable.system.buyerOutcome,
  };
}

export default async function SystemProofPage({ params }: PageProps<'/proof/[slug]'>) {
  const { slug } = await params;
  const runnable = PROOF_SYSTEMS.find((r) => r.system.slug === slug);
  if (runnable === undefined) notFound();

  const { system, profile, handlers, scenarios } = runnable;

  // The real engine, running now, at build time. Same wiring the simulator route uses.
  const journeys: Journey[] = [];
  for (const scenario of scenarios) {
    const run = await runScenario(scenario, {
      system,
      profile,
      handlers,
      provider: new FixtureDecisionProvider(scenario.judgments),
      ...(runnable.sendOutcomes === undefined
        ? {}
        : { executor: new FixtureSideEffectExecutor(runnable.sendOutcomes, runnable.verifyOutcomes ?? {}) }),
      ...(runnable.extractions === undefined
        ? {}
        : { extractionProvider: new FixtureExtractionProvider(runnable.extractions) }),
      provisioner: new FixtureResourceProvisioner(),
    });
    journeys.push(deriveJourney(system, run, scenario));
  }

  const grammars: Record<string, CommercialGrammar> = {};
  const index: ScenarioIndexEntry[] = [];
  for (const journey of journeys) {
    grammars[journey.scenarioSlug] = deriveCommercialGrammar(journey);
    index.push(toScenarioIndexEntry(journey));
  }

  const declaredStates = new Set(system.lifecycle.states.map((state) => state.id));
  const inDeclaredState = journeys.filter((j) => declaredStates.has(j.outcome.finalState)).length;
  const diverged = journeys.filter((j) => !j.outcome.matchedExpectation).length;
  const withAPerson = journeys.filter(
    (j) => j.outcome.awaitingHuman !== null || j.outcome.personInvolved,
  ).length;

  /**
   * The third problem card on Lead Rescue's page is authored prose. Here it is derived from the
   * lifecycle instead — a stronger claim, because a reader can check it against the dossier and
   * it cannot drift from the model the way a sentence can.
   */
  const structuralPromise =
    `Every case occupies one of the ${system.lifecycle.states.length} positions this system declares in advance, ` +
    `and can arrive there only by one of its ${system.lifecycle.transitions.length} declared moves. ` +
    `There is no other position, and no other way to reach one.`;

  return (
    <div className="mx-auto max-w-[78rem] px-5 sm:px-8 py-10 sm:py-14 space-y-20 sm:space-y-24">
      <nav className="instrument flex flex-wrap gap-x-5 gap-y-2">
        <Link href="/" className="hover:opacity-70" style={{ color: 'var(--ink-muted)' }}>
          ← All systems
        </Link>
        <Link href={`/systems/${system.slug}`} className="hover:opacity-70" style={{ color: 'var(--ink-muted)' }}>
          Technical dossier
        </Link>
        <Link href="/lead-rescue" className="hover:opacity-70" style={{ color: 'var(--ink-muted)' }}>
          Lead Rescue — the reference implementation
        </Link>
      </nav>

      {/* ================================================================== */}
      {/* A · THE PROBLEM                                                     */}
      {/* ================================================================== */}
      <header className="space-y-8">
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-3">
            <span className="label">{system.name} · interactive proof</span>
            <MaturityBadge level={system.maturity} />
          </div>
          {/*
            Set at statement scale, not headline scale. `buyerOutcome` is a full declarative
            sentence — Lead Rescue's page pairs a short authored headline with it as the lede,
            but authoring six such headlines would put words in each system's mouth that the
            model does not contain. Rendering the system's own promise, sized so a long sentence
            reads as editorial rather than as a shout, keeps the register without inventing copy.
          */}
          <h1 className="display text-2xl sm:text-3xl lg:text-4xl max-w-4xl leading-snug">
            {system.buyerOutcome}
          </h1>
        </div>

        <div
          className="grid gap-px border rule rounded-sm overflow-hidden lg:grid-cols-3"
          style={{ background: 'var(--rule)' }}
        >
          <ProblemCard eyebrow="What goes wrong today" body={system.businessProblem} tint="var(--blocked)" />
          <ProblemCard eyebrow="Why it costs real money" body={system.economicLeakage} tint="var(--warn)" />
          <ProblemCard eyebrow="What this replaces it with" body={structuralPromise} tint="var(--ok)" />
        </div>

        <p className="instrument leading-relaxed prose-measure" style={{ color: 'var(--ink-faint)' }}>
          No figures on this page describe an industry, a market, or a result achieved for a
          customer. Every number is either a policy this operator configured, or a count taken
          from the runs below. Where an outside claim is cited, it is cited with its weaknesses
          attached in the{' '}
          <Link href={`/systems/${system.slug}`} className="underline hover:opacity-70">
            technical dossier
          </Link>
          .
        </p>

        <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-4 border-t rule pt-6">
          <HeaderStat label="Incidents you can run" value={String(journeys.length)} />
          <HeaderStat
            label="Ended in a declared state"
            value={`${inDeclaredState} of ${journeys.length}`}
            note={`Every run finishes in one of the ${system.lifecycle.states.length} states this system declares in advance. None ends nowhere.`}
            tint={inDeclaredState < journeys.length ? 'var(--blocked)' : undefined}
          />
          <HeaderStat
            label="Diverged from expectation"
            value={String(diverged)}
            note="Each run is checked against the end state its scenario declared."
            tint={diverged > 0 ? 'var(--blocked)' : undefined}
          />
          <HeaderStat
            label="Declared moves"
            value={String(system.lifecycle.transitions.length)}
            note="Any move outside this set is refused by the engine core, not by this system's own rules."
          />
        </dl>
      </header>

      {/* ================================================================== */}
      {/* B · THE JOURNEY                                                     */}
      {/* ================================================================== */}
      <section className="space-y-10">
        <ActHeading
          act="Two"
          title="What happened to one specific case"
          body={
            `Pick an incident. The engine runs it, and every state, decision, action, and refusal ` +
            `below is what it recorded — not an illustration of what it would do. Start with the ` +
            `five-cell strip, then open any cell to see the step behind it. ` +
            `${withAPerson} of the ${journeys.length} finish with a person holding the case: that is ` +
            `the designed outcome for anything past the system's authority, not a failure to automate.`
          }
        />
        <JourneyConsole journeys={journeys} grammars={grammars} index={index} />
      </section>

      {/* ================================================================== */}
      {/* C · WHAT IS NOT REAL HERE                                           */}
      {/* ================================================================== */}
      <section className="space-y-6">
        <ActHeading
          act="Three"
          title="Which parts of this are real"
          body="Read this before deciding what the runs above prove. It is the system's own statement of its limits, not a summary of them."
        />

        <div
          className="border rule rounded-sm p-6 space-y-4"
          style={{ background: 'var(--paper-raised)' }}
        >
          <p className="text-[0.9375rem] leading-relaxed prose-measure">{system.fidelityNote}</p>
        </div>

        <div className="grid gap-px border rule rounded-sm overflow-hidden lg:grid-cols-2" style={{ background: 'var(--rule)' }}>
          <ProblemCard
            eyebrow="What genuinely executed"
            body={
              `The lifecycle engine, the authority gate, duplicate suppression, and every ` +
              `deterministic rule above ran for real, just now, to produce this page. The same ` +
              `engine core runs all six systems in this portfolio.`
            }
            tint="var(--ok)"
          />
          <ProblemCard
            eyebrow="What this system has not earned"
            body={
              `No HTTP surface, no durable storage, no real provider, and no retained runtime ` +
              `evidence — so this page carries no capability ledger and no operator console. ` +
              `Lead Rescue has those because it built them; this system would have to do the same.`
            }
            tint="var(--warn)"
          />
        </div>

        <p className="instrument leading-relaxed prose-measure" style={{ color: 'var(--ink-faint)' }}>
          To see what the next fidelity level looks like once a system earns it, open{' '}
          <Link href="/lead-rescue" className="underline hover:opacity-70">
            Lead Rescue
          </Link>
          , which adds a live operator console and a capability-by-capability ledger — including
          the rows it still cannot claim.
        </p>
      </section>
    </div>
  );
}
