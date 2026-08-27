import Link from 'next/link';
import type { Metadata } from 'next';
import { LEAD_RESCUE } from '@/data/systems';
import { KESTREL } from '@/data/profiles/kestrel/profile';
import { LEAD_RESCUE_SCENARIOS, LEAD_RESCUE_SEND_OUTCOMES, LEAD_RESCUE_VERIFY_OUTCOMES } from '@/data/profiles/kestrel/scenarios/lead-rescue';
import { LEAD_RESCUE_HANDLERS } from '@/lib/engine/handlers/lead-rescue';
import { runScenario } from '@/lib/engine/run';
import { FixtureDecisionProvider } from '@/lib/ports/decision-provider';
import { FixtureSideEffectExecutor } from '@/lib/ports/side-effect-executor';
import { numberParam } from '@/lib/model/profile';
import { AUTHORITY_LABELS, type AuthorityLevel } from '@/lib/model/system';
import { deriveJourney, type Journey } from '@/lib/proof/journey';
import {
  deriveCommercialGrammar,
  toScenarioIndexEntry,
  type CommercialGrammar,
  type ScenarioIndexEntry,
} from '@/lib/proof/commercial-grammar';
import { deriveFailureRegister, deriveFidelityLedger } from '@/lib/proof/fidelity-ledger';
import {
  readEvaluationEvidence,
  readObservationIntegrityEvidence,
  readOperationalViewEvidence,
  readRuntimeEvidence,
} from '@/lib/proof/n8n-evidence';
import { JourneyConsole } from '@/components/proof/journey-console';
import { OperatorConsole } from '@/components/proof/operator-console';
import { FailureRegister, FidelityPanel } from '@/components/proof/fidelity-panel';
import { OperationsPanel } from '@/components/proof/operations-panel';
import { ObservationPanel } from '@/components/proof/observation-panel';
import { ActHeading, HeaderStat, ProblemCard } from '@/components/proof/proof-chrome';
import { CoveragePanel } from '@/components/proof/coverage-panel';
import { computeScenarioTransitionCoverage } from '@/lib/proof/transition-coverage';
import { deriveCoverageView } from '@/lib/proof/coverage-view';

/**
 * THE LEAD RESCUE PROOF EXPERIENCE.
 *
 * One route, four layers, in the order a buyer's questions actually arrive:
 *
 *   A  What expensive thing does this prevent?      — the problem, in their words
 *   B  What happened to one specific lead?          — eight real runs, inspectable
 *   C  What can an operator actually do?            — live, against real routes
 *   D  Which parts of this are real?                — capability by capability
 *
 * They are one page rather than four because the questions are not independent: "what
 * happened" is worthless without "how much of that was real", and a fidelity ledger read
 * before the story is just a disclaimer. Ordering them is most of the design.
 *
 * WHAT THIS ROUTE OWNS: presentation only. It runs the existing engine over the existing
 * scenarios, derives read-only views through `lib/proof/**`, and renders. It adds no
 * lifecycle state, no handler, no persistence, and no API. Everything factual on the page can
 * be traced to `data/`, `lib/engine/`, or a committed evidence artefact.
 *
 * WHY THE ENGINE RUNS AT BUILD TIME: this page is statically prerendered, so the eight runs
 * execute during `npm run build` and a divergence between a run and its declared expectation
 * shows up as a visible "Diverged" mark in the built page. Layer C is the deliberate
 * exception — it is a client component that calls live routes on every interaction.
 */

export const metadata: Metadata = {
  title: 'Lead Rescue — interactive proof',
  description:
    'Follow a single inbound enquiry through Lead Rescue: what triggered it, what the system decided, what it did or refused to do, and exactly which parts of it are real.',
};

const CONFIDENCE_FLOOR = numberParam(KESTREL, 'confidenceFloor');
const ACK_TARGET_SECONDS = numberParam(KESTREL, 'acknowledgementTargetSeconds');
const ROUTING_TARGET_MINUTES = numberParam(KESTREL, 'routingTargetMinutes');

async function buildJourneys(): Promise<readonly Journey[]> {
  const journeys: Journey[] = [];
  for (const scenario of LEAD_RESCUE_SCENARIOS) {
    const run = await runScenario(scenario, {
      system: LEAD_RESCUE,
      profile: KESTREL,
      handlers: LEAD_RESCUE_HANDLERS,
      provider: new FixtureDecisionProvider(scenario.judgments),
      executor: new FixtureSideEffectExecutor(LEAD_RESCUE_SEND_OUTCOMES, LEAD_RESCUE_VERIFY_OUTCOMES),
    });
    journeys.push(deriveJourney(LEAD_RESCUE, run, scenario));
  }
  return journeys;
}

export default async function LeadRescueProofPage() {
  const journeys = await buildJourneys();

  const grammars: Record<string, CommercialGrammar> = {};
  const index: ScenarioIndexEntry[] = [];
  for (const journey of journeys) {
    grammars[journey.scenarioSlug] = deriveCommercialGrammar(journey);
    index.push(toScenarioIndexEntry(journey));
  }

  const [evidence, evaluation, operations, observation] = await Promise.all([
    readRuntimeEvidence(),
    readEvaluationEvidence(),
    readOperationalViewEvidence(),
    readObservationIntegrityEvidence(),
  ]);
  // KESTREL explicitly, because this page depicts Kestrel. The ledger quotes the confidence
  // floor and review window into its prose, so it must be handed the firm actually on screen.
  const ledger = deriveFidelityLedger({ evidence, evaluation, observation, profile: KESTREL });
  const failures = deriveFailureRegister();

  // Measured by replaying this system's scenarios at build time, never by reading the handlers.
  const [leadRescueCoverage] = await computeScenarioTransitionCoverage([LEAD_RESCUE.id]);
  if (leadRescueCoverage === undefined) throw new Error('Lead Rescue is not a runnable system');
  const coverage = deriveCoverageView(LEAD_RESCUE, leadRescueCoverage);

  /**
   * The headline claims every enquiry ends somewhere you can point at, so the stat beneath it
   * has to be the check on exactly that claim: does each run finish in a state the system
   * declared in advance?
   *
   * An earlier version counted state KINDS instead, treating only waiting, human-review, and
   * terminal states as accountable. That reported "4 of 8", because four runs end in
   * BOOKING_READY — an ACTIVE state, but a named and owned one ("enough is known to offer a
   * next commercial step") that an operator then dispatches from. Excluding it implied four
   * incidents had gone missing, directly contradicting the headline. Declared-vs-undeclared is
   * the distinction the claim is actually about.
   */
  const declaredStates = new Set(LEAD_RESCUE.lifecycle.states.map((state) => state.id));
  const inDeclaredState = journeys.filter((journey) => declaredStates.has(journey.outcome.finalState)).length;
  const diverged = journeys.filter((journey) => !journey.outcome.matchedExpectation).length;
  const withAPerson = journeys.filter(
    (journey) => journey.outcome.awaitingHuman !== null || journey.outcome.personInvolved,
  ).length;

  return (
    <div className="mx-auto max-w-[78rem] px-5 sm:px-8 py-10 sm:py-14 space-y-20 sm:space-y-24">
      <nav className="instrument flex flex-wrap gap-x-5 gap-y-2">
        <Link href="/" className="hover:opacity-70" style={{ color: 'var(--ink-muted)' }}>
          ← All systems
        </Link>
        <Link href="/systems/lead-rescue" className="hover:opacity-70" style={{ color: 'var(--ink-muted)' }}>
          Technical dossier
        </Link>
        <Link href="/lead-rescue/wait" className="hover:opacity-70" style={{ color: 'var(--ink-muted)' }}>
          Raw operator console
        </Link>
      </nav>

      {/* ================================================================== */}
      {/* A · THE PROBLEM                                                     */}
      {/* ================================================================== */}
      <header className="space-y-8">
        <div className="space-y-5">
          <span className="label">{LEAD_RESCUE.name} · interactive proof</span>
          <h1 className="display text-4xl sm:text-5xl lg:text-6xl max-w-4xl">
            Every enquiry ends somewhere you can point at.
          </h1>
          <p className="lede prose-measure">
            {LEAD_RESCUE.buyerOutcome}
          </p>
        </div>

        <div className="grid gap-px border rule rounded-sm overflow-hidden lg:grid-cols-3" style={{ background: 'var(--rule)' }}>
          <ProblemCard
            eyebrow="What goes wrong today"
            body={LEAD_RESCUE.businessProblem}
            tint="var(--blocked)"
          />
          <ProblemCard
            eyebrow="Why it costs real money"
            body={LEAD_RESCUE.economicLeakage}
            tint="var(--warn)"
          />
          <ProblemCard
            eyebrow="What this replaces it with"
            body="Every enquiry holds a named position: finished, parked with a deadline, or owned by a specific person. There is no fourth option, and no case can quietly occupy one."
            tint="var(--ok)"
          />
        </div>

        <p className="instrument leading-relaxed prose-measure" style={{ color: 'var(--ink-faint)' }}>
          No figures on this page describe an industry, a market, or a result achieved for a
          customer. Every number is either a policy this operator configured, or a count taken from
          the runs below. Where an outside claim is cited, it is cited with its weaknesses attached
          in the <Link href="/systems/lead-rescue" className="underline hover:opacity-70">technical dossier</Link>.
        </p>

        <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-4 border-t rule pt-6">
          <HeaderStat label="Incidents you can run" value={String(journeys.length)} />
          <HeaderStat
            label="Ended in a declared state"
            value={`${inDeclaredState} of ${journeys.length}`}
            note={`Every run finishes in one of the ${LEAD_RESCUE.lifecycle.states.length} states this system declares in advance. None ends nowhere.`}
            tint={inDeclaredState < journeys.length ? 'var(--blocked)' : undefined}
          />
          <HeaderStat
            label="Diverged from expectation"
            value={String(diverged)}
            note="Each run is checked against the end state its scenario declared."
            tint={diverged > 0 ? 'var(--blocked)' : undefined}
          />
          <HeaderStat
            label="Confidence floor in force"
            value={String(CONFIDENCE_FLOOR)}
            note="Below this, a judgment routes to a person instead of acting."
          />
        </dl>
      </header>

      {/* ================================================================== */}
      {/* B · THE JOURNEY                                                     */}
      {/* ================================================================== */}
      <section className="space-y-10">
        <ActHeading
          act="Two"
          title="What happened to one specific lead"
          body={`Pick an incident. The engine runs it, and every state, decision, action, and refusal below is what it recorded — not an illustration of what it would do. Start with the five-cell strip, then open any cell to see the step behind it. ${withAPerson} of the ${journeys.length} finish with a person holding the case: that is the designed outcome for anything past the system's authority, not a failure to automate.`}
        />
        <JourneyConsole journeys={journeys} grammars={grammars} index={index} />
      </section>

      {/* ================================================================== */}
      {/* B.1 · HOW MUCH OF THE MAP THOSE RUNS COVER                          */}
      {/* ================================================================== */}
      <section className="space-y-8">
        <ActHeading
          act="Two · b"
          title="How much of the map those runs actually cover"
          body="A sharp reader forms this question the moment the shelf above is counted: eight incidents, out of how many possible paths? This is the answer, measured by replaying every scenario rather than estimated — and the moves nothing drives yet are listed by name rather than summarised, because a number asks to be trusted and a list asks to be checked."
        />
        <CoveragePanel view={coverage} />
      </section>

      {/* ================================================================== */}
      {/* B.2 · WHERE JUDGMENT IS AND IS NOT ALLOWED                          */}
      {/* ================================================================== */}
      <section className="space-y-8">
        <ActHeading
          act="Two · c"
          title="Where a model is allowed to have an opinion"
          body="Almost every decision in the runs above is a fixed rule. Interpretation of free text is the exception, and it is fenced in three ways: a closed set of answers, a confidence floor compared outside the model, and a list of things it may never do regardless of how certain it sounds."
        />

        <div className="grid gap-6 lg:grid-cols-2">
          <BoundaryCard
            title="What judgment is used for"
            tone="var(--prov-lab)"
            items={LEAD_RESCUE.aiJudgments}
            footnote={`Each one returns a value from a closed set with a confidence. Anything below ${CONFIDENCE_FLOOR} goes to a person — the comparison happens in the engine, not in the model.`}
          />
          <BoundaryCard
            title="What it may never do"
            tone="var(--blocked)"
            items={LEAD_RESCUE.aiBoundary}
            footnote="These are refused structurally, not discouraged by a prompt. Confidence cannot buy any of them."
          />
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <BoundaryCard
            title="Only a person may do these"
            tone="var(--prov-fixture)"
            items={LEAD_RESCUE.humanOnlyActions}
          />
          <BoundaryCard
            title="Guardrails carried by every run"
            tone="var(--ok)"
            items={LEAD_RESCUE.guardrails}
          />
        </div>

        <div className="border rule rounded-sm p-5 space-y-4" style={{ background: 'var(--panel)' }}>
          <h4 className="label">The authority ladder, and where this system sits on it</h4>
          <p className="instrument leading-relaxed prose-measure" style={{ color: 'var(--ink-muted)' }}>
            Authority is attached to each action, never to the thing taking it. A confident
            classifier and an uncertain one have exactly the same standing.
          </p>
          <ol className="space-y-1.5">
            {([0, 1, 2, 3, 4] as AuthorityLevel[]).map((level) => (
              <li key={level} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                <span className="flex items-center gap-1 shrink-0" aria-hidden="true">
                  {[0, 1, 2, 3, 4].map((step) => (
                    <span
                      key={step}
                      className="state-mark"
                      style={{
                        background: step <= level ? (level >= 3 ? 'var(--ok)' : 'var(--prov-fixture)') : 'transparent',
                        border: `1px solid ${step <= level ? 'transparent' : 'var(--rule-strong)'}`,
                      }}
                    />
                  ))}
                </span>
                <span className="instrument font-medium shrink-0">Authority {level}</span>
                <span className="instrument" style={{ color: 'var(--ink-muted)' }}>
                  {AUTHORITY_LABELS[level]}
                </span>
              </li>
            ))}
          </ol>
          <p className="instrument leading-relaxed prose-measure" style={{ color: 'var(--ink-faint)' }}>
            Acknowledgement target {ACK_TARGET_SECONDS}s and routing target{' '}
            {ROUTING_TARGET_MINUTES} minutes are this operator&rsquo;s configured policy, not an
            industry benchmark and not a measured result.
          </p>
        </div>
      </section>

      {/* ================================================================== */}
      {/* C · OPERATOR CONTROL                                                */}
      {/* ================================================================== */}
      <section className="space-y-10">
        <ActHeading
          act="Three"
          title="What the person on the other side actually does"
          body="The runs above are deterministic replays. This section is not: it drives the same engine through real HTTP routes against a case stored on disk. Create one, decide it, send the offer, and watch a deadline start."
        />
        <OperatorConsole />
      </section>

      {/* ================================================================== */}
      {/* C.2 · FAILURE HANDLING                                              */}
      {/* ================================================================== */}
      <section className="space-y-8">
        <ActHeading
          act="Three · b"
          title="What happens when something breaks"
          body="Duplicate deliveries, unconfirmed sends, malformed payloads, approvals nobody actions. Each one has a named recovery and a state the case ends up in. The ones a test genuinely exercises are marked separately from the ones that are only designed."
        />
        <FailureRegister entries={failures} />
      </section>

      {/* ================================================================== */}
      {/* C.3 · ACROSS EVERY RUN                                              */}
      {/* ================================================================== */}
      <section className="space-y-8">
        <ActHeading
          act="Three · c"
          title="What it looks like across every run, not one"
          body="The same journal the case above is read from, read across every case the runtime retained. Leads and execution attempts are counted separately so a suppressed replay cannot read as a second delivery, and any interval that was never measured says so rather than showing zero."
        />
        <OperationsPanel evidence={operations} />
      </section>

      {/* ================================================================== */}
      {/* C.4 · WHETHER THE RECORD ITSELF HOLDS UP                            */}
      {/* ================================================================== */}
      <section className="space-y-8">
        <ActHeading
          act="Three · d"
          title="Whether that record can be trusted, and what it raises"
          body="Every figure above counts something the system wrote down, so the next question is whether it wrote all of it. This section answers that, raises the few conditions that need a person rather than leaving them to be found, and shows what happened on the two occasions an outbound action genuinely went wrong — each checked against a second process that recorded the same exchange."
        />
        <ObservationPanel evidence={observation} />
      </section>

      {/* ================================================================== */}
      {/* D · WHAT IS REAL                                                    */}
      {/* ================================================================== */}
      <section className="space-y-10">
        <ActHeading
          act="Four"
          title="Which parts of this are real"
          body="One label per capability, so nothing borrows credibility from anything next to it. Read the last row first if you are deciding whether to trust the rest."
        />
        <FidelityPanel ledger={ledger} evidence={evidence} evaluation={evaluation} />
      </section>

      <footer className="border-t rule pt-8 space-y-3">
        <p className="instrument leading-relaxed prose-measure" style={{ color: 'var(--ink-muted)' }}>
          {KESTREL.name} is a fictional business built to exercise this system. Every contact,
          company, enquiry, and timestamp in the incidents above was authored for the
          demonstration. No real person has ever been contacted from this build.
        </p>
        <p className="instrument" style={{ color: 'var(--ink-faint)' }}>
          The eight runs on this page executed when it was built. The operator section runs live.
        </p>
      </footer>
    </div>
  );
}

// ---------------------------------------------------------------------------




function BoundaryCard({
  title,
  tone,
  items,
  footnote,
}: {
  readonly title: string;
  readonly tone: string;
  readonly items: readonly string[];
  readonly footnote?: string;
}) {
  return (
    <section
      className="border rule rounded-sm p-5 space-y-3"
      style={{ background: 'var(--paper-raised)', borderBlockStartWidth: '2px', borderBlockStartColor: tone }}
    >
      <h4 className="label" style={{ color: tone }}>
        {title}
      </h4>
      <ul className="space-y-2">
        {items.map((item) => (
          <li key={item} className="text-[0.9375rem] leading-relaxed pl-4 relative">
            <span className="absolute left-0" style={{ color: tone }} aria-hidden="true">
              ·
            </span>
            {item}
          </li>
        ))}
      </ul>
      {footnote !== undefined && (
        <p className="instrument leading-relaxed pt-1" style={{ color: 'var(--ink-faint)' }}>
          {footnote}
        </p>
      )}
    </section>
  );
}
