'use client';

import { useCallback, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import type { StateKind } from '@/lib/model/system';
import { AUTHORITY_LABELS, type AuthorityLevel } from '@/lib/model/system';
import type { Journey, JourneyMoment } from '@/lib/proof/journey';
import type { CommercialGrammar, GrammarStage, ScenarioIndexEntry } from '@/lib/proof/commercial-grammar';
import { SELECTION_RULES } from '@/lib/proof/commercial-grammar';

/**
 * THE PROOF CONSOLE — layers A and B in one control, deliberately not two.
 *
 * The business story and the technical journey are the same object at two magnifications:
 * every cell of the TRIGGER → DECISION → ACTION → GUARDRAIL → OUTCOME strip is a link into
 * the moment that produced it. That coupling is the whole design. A strip that could not be
 * opened would be a claim; a timeline with no strip above it would be an artefact only its
 * author can read.
 *
 * NOTHING IS COMPUTED HERE. Every value rendered below was derived on the server by
 * `lib/proof/journey.ts` and `lib/proof/commercial-grammar.ts` from a real engine run. This
 * component chooses what to reveal and in what order — it does not decide what is true.
 */

// ---------------------------------------------------------------------------
// State colour. The one place lifecycle kind becomes a colour.
// ---------------------------------------------------------------------------

const STATE_COLOUR: Record<StateKind, string> = {
  INITIAL: 'var(--ink-faint)',
  ACTIVE: 'var(--ink-muted)',
  WAITING: 'var(--waiting)',
  HUMAN_REVIEW: 'var(--prov-fixture)',
  TERMINAL_SUCCESS: 'var(--ok)',
  TERMINAL_NEUTRAL: 'var(--ink-faint)',
  TERMINAL_FAILURE: 'var(--blocked)',
};

/** Plain-language gloss on the lifecycle kind, so a reader never has to decode the enum. */
const STATE_KIND_MEANING: Record<StateKind, string> = {
  INITIAL: 'Just arrived',
  ACTIVE: 'In progress',
  WAITING: 'Parked, deadline running',
  HUMAN_REVIEW: 'A person owns it',
  TERMINAL_SUCCESS: 'Finished — won',
  TERMINAL_NEUTRAL: 'Finished — closed correctly',
  TERMINAL_FAILURE: 'Finished — recorded failure',
};

const DISPOSITION_COLOUR = {
  EXECUTED: 'var(--ok)',
  WITHHELD: 'var(--blocked)',
  UNCERTAIN: 'var(--prov-lab)',
} as const;

const DISPOSITION_LABEL = {
  EXECUTED: 'Went out',
  WITHHELD: 'Held back',
  UNCERTAIN: 'Unconfirmed',
} as const;

const TONE_COLOUR: Record<GrammarStage['tone'], string> = {
  NEUTRAL: 'var(--ink-muted)',
  ACTED: 'var(--ok)',
  HELD: 'var(--blocked)',
  UNCERTAIN: 'var(--prov-lab)',
  PERSON: 'var(--prov-fixture)',
};

function offsetLabel(seconds: number): string {
  if (seconds === 0) return 'on arrival';
  if (seconds < 90) return `+${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 90) return `+${minutes}m`;
  return `+${Math.round(minutes / 60)}h`;
}

// ---------------------------------------------------------------------------

export interface JourneyConsoleProps {
  readonly journeys: readonly Journey[];
  readonly grammars: Readonly<Record<string, CommercialGrammar>>;
  readonly index: readonly ScenarioIndexEntry[];
}

export function JourneyConsole({ journeys, grammars, index }: JourneyConsoleProps) {
  const first = journeys[0];
  const [slug, setSlug] = useState(first?.scenarioSlug ?? '');
  const [momentIndex, setMomentIndex] = useState(0);

  const journey = useMemo(
    () => journeys.find((j) => j.scenarioSlug === slug) ?? first,
    [journeys, slug, first],
  );

  const selectScenario = useCallback((next: string) => {
    setSlug(next);
    setMomentIndex(0);
  }, []);

  if (journey === undefined) {
    return (
      <p className="instrument" style={{ color: 'var(--ink-faint)' }}>
        No runnable Lead Rescue scenarios were found in this build.
      </p>
    );
  }

  const grammar = grammars[journey.scenarioSlug];
  const total = journey.moments.length;
  const safeIndex = Math.min(momentIndex, Math.max(0, total - 1));
  const moment = journey.moments[safeIndex];

  return (
    <div className="space-y-12">
      <ScenarioSwitcher entries={index} selected={journey.scenarioSlug} onSelect={selectScenario} />

      <div className="space-y-5">
        <SectionLead
          eyebrow="What happened, in one line each"
          title={journey.scenarioTitle}
          body={journey.scenarioSummary}
        />
        {grammar !== undefined && (
          <GrammarStrip grammar={grammar} activeMoment={safeIndex} onJump={setMomentIndex} />
        )}
      </div>

      <div className="space-y-5">
        <SectionLead
          eyebrow="The path this case actually took"
          title="Every state it passed through"
          body="Each chip is a lifecycle state the engine genuinely entered, in order. Nothing here is a diagram of what the system could do — it is where this one case went."
        />
        <StateRibbon journey={journey} activeMoment={safeIndex} onJump={setMomentIndex} />
      </div>

      <div className="space-y-5">
        <SectionLead
          eyebrow="Step through it"
          title="Inspect any single moment"
          body="Every field below is recorded by the engine as it runs. Open a drawer to see what a step read, what it was allowed to do, and what it refused."
        />

        <Stepper
          index={safeIndex}
          total={total}
          label={moment?.stepLabel ?? ''}
          onChange={setMomentIndex}
        />

        <div className="grid gap-6 lg:grid-cols-[minmax(0,19rem)_minmax(0,1fr)] items-start">
          <MomentRail moments={journey.moments} active={safeIndex} onSelect={setMomentIndex} />
          {moment === undefined ? (
            <p className="instrument" style={{ color: 'var(--ink-faint)' }}>
              This run produced no processing steps.
            </p>
          ) : (
            <MomentInspector key={`${journey.scenarioSlug}-${moment.id}`} moment={moment} />
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Scenario switcher
// ---------------------------------------------------------------------------

function ScenarioSwitcher({
  entries,
  selected,
  onSelect,
}: {
  readonly entries: readonly ScenarioIndexEntry[];
  readonly selected: string;
  readonly onSelect: (slug: string) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <span className="label">Choose an incident · {entries.length} runnable</span>
        <span className="instrument" style={{ color: 'var(--ink-faint)' }}>
          Each one executes the real engine. Same input, same result, every time.
        </span>
      </div>

      <ul className="grid gap-px border rule rounded-sm overflow-hidden sm:grid-cols-2 xl:grid-cols-4" style={{ background: 'var(--rule)' }}>
        {entries.map((entry) => {
          const active = entry.slug === selected;
          return (
            <li key={entry.slug} className="min-w-0">
              <button
                type="button"
                onClick={() => onSelect(entry.slug)}
                aria-pressed={active}
                className="w-full h-full text-left p-3 space-y-2"
                style={{
                  background: active ? 'var(--panel)' : 'var(--paper-raised)',
                  borderInlineStart: `2px solid ${active ? 'var(--accent)' : 'transparent'}`,
                  transition: 'background-color var(--dur-short) var(--ease-out)',
                }}
              >
                <span className="flex items-start gap-2">
                  <span
                    className="state-mark mt-1.5"
                    style={{ background: STATE_COLOUR[entry.finalStateKind] }}
                    aria-hidden="true"
                  />
                  <span className="text-[0.8125rem] leading-snug font-medium min-w-0">{entry.title}</span>
                </span>

                <span className="instrument block" style={{ color: 'var(--ink-muted)' }}>
                  Ends: {entry.finalStateLabel}
                </span>

                <span className="flex flex-wrap items-center gap-1.5">
                  {entry.effectTally === '' ? (
                    <span className="instrument" style={{ color: 'var(--ink-faint)' }}>
                      nothing attempted
                    </span>
                  ) : (
                    <span className="instrument" style={{ color: 'var(--ink-faint)' }}>
                      {entry.effectTally}
                    </span>
                  )}
                  {entry.personInvolved && (
                    <span className="badge" style={{ color: 'var(--prov-fixture)', borderColor: 'var(--prov-fixture)' }}>
                      Person decided
                    </span>
                  )}
                  {!entry.matchedExpectation && (
                    <span className="badge" style={{ color: 'var(--blocked)', borderColor: 'var(--blocked)' }}>
                      Diverged
                    </span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Commercial grammar strip
// ---------------------------------------------------------------------------

function GrammarStrip({
  grammar,
  activeMoment,
  onJump,
}: {
  readonly grammar: CommercialGrammar;
  readonly activeMoment: number;
  readonly onJump: (index: number) => void;
}) {
  return (
    <div className="space-y-3">
      <ol className="grid gap-px border rule rounded-sm overflow-hidden lg:grid-cols-5" style={{ background: 'var(--rule)' }}>
        {grammar.stages.map((stage, position) => {
          const reachable = stage.momentIndex !== null;
          const active = reachable && stage.momentIndex === activeMoment;
          const colour = TONE_COLOUR[stage.tone];

          const body = (
            <>
              <span className="flex items-center gap-2">
                <span className="label" style={{ color: 'var(--ink-faint)' }}>
                  {position + 1}
                </span>
                <span className="label" style={{ color: colour }}>
                  {stage.heading}
                </span>
              </span>
              <span
                className="block text-[0.9375rem] leading-snug font-medium"
                style={{ overflowWrap: 'anywhere' }}
              >
                {stage.headline}
              </span>
              {stage.technicalName !== null && (
                <span
                  className="instrument block truncate"
                  style={{ color: 'var(--ink-faint)' }}
                  title={stage.technicalName}
                >
                  {stage.technicalName}
                </span>
              )}
              <span className="instrument block" style={{ color: 'var(--ink-muted)' }}>
                {stage.detail}
              </span>
            </>
          );

          const shell: CSSProperties = {
            background: active ? 'var(--panel)' : 'var(--paper-raised)',
            borderBlockStart: `2px solid ${colour}`,
            transition: 'background-color var(--dur-short) var(--ease-out)',
          };

          return (
            <li key={stage.stage} className="min-w-0">
              {reachable ? (
                <button
                  type="button"
                  onClick={() => onJump(stage.momentIndex ?? 0)}
                  className="w-full h-full text-left p-4 space-y-2"
                  style={shell}
                  title="Open the moment this came from"
                >
                  {body}
                </button>
              ) : (
                <div className="h-full p-4 space-y-2" style={{ ...shell, opacity: 0.72 }}>
                  {body}
                </div>
              )}
            </li>
          );
        })}
      </ol>

      <details className="group">
        <summary className="label cursor-pointer hover:opacity-70">
          How these five were chosen
        </summary>
        <div className="mt-3 border-l-2 pl-4 space-y-2" style={{ borderColor: 'var(--rule-strong)' }}>
          <p className="instrument leading-relaxed" style={{ color: 'var(--ink-muted)' }}>
            One fixed rule per stage, applied identically to all eight incidents. No stage is
            written per scenario, so no incident can be given a story its run does not support.
          </p>
          <dl className="instrument space-y-1.5">
            {SELECTION_RULES.map((rule) => (
              <div key={rule.stage} className="flex flex-col sm:flex-row sm:gap-3">
                <dt className="label shrink-0 sm:w-24">{rule.stage}</dt>
                <dd style={{ color: 'var(--ink-muted)' }}>{rule.rule}</dd>
              </div>
            ))}
          </dl>
        </div>
      </details>
    </div>
  );
}

// ---------------------------------------------------------------------------
// State ribbon
// ---------------------------------------------------------------------------

function StateRibbon({
  journey,
  activeMoment,
  onJump,
}: {
  readonly journey: Journey;
  readonly activeMoment: number;
  readonly onJump: (index: number) => void;
}) {
  const { stops, outcome } = journey;

  return (
    <div className="space-y-4">
      <ol className="flex flex-wrap items-stretch gap-y-2">
        {stops.map((stop, position) => {
          const active = stop.momentIndex === activeMoment;
          const colour = STATE_COLOUR[stop.kind];
          return (
            <li key={`${stop.state}-${stop.momentIndex}`} className="flex items-stretch min-w-0">
              {position > 0 && (
                <span
                  aria-hidden="true"
                  className="instrument self-center px-2"
                  style={{ color: 'var(--ink-faint)' }}
                >
                  →
                </span>
              )}
              <button
                type="button"
                onClick={() => onJump(stop.momentIndex)}
                aria-pressed={active}
                className="border rule rounded-sm px-3 py-2 text-left min-w-0"
                style={{
                  background: active ? 'var(--panel)' : 'var(--paper-raised)',
                  borderColor: active ? colour : 'var(--rule)',
                  transition: 'background-color var(--dur-short) var(--ease-out), border-color var(--dur-short) var(--ease-out)',
                }}
              >
                <span className="flex items-center gap-2">
                  <span className="state-mark" style={{ background: colour }} aria-hidden="true" />
                  <span className="instrument font-medium">{stop.label}</span>
                </span>
                <span className="instrument block mt-0.5" style={{ color: 'var(--ink-faint)' }}>
                  {STATE_KIND_MEANING[stop.kind]}
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-4 border-t rule pt-4">
        <Tally label="Reached a person" value={outcome.personInvolved ? 'Yes' : 'No'} />
        <Tally
          label="Sent to the prospect"
          value={String(outcome.customerFacingExecuted)}
          tint={outcome.customerFacingExecuted > 0 ? 'var(--ok)' : undefined}
        />
        <Tally
          label="Actions held back"
          value={String(outcome.withheld)}
          tint={outcome.withheld > 0 ? 'var(--blocked)' : undefined}
        />
        <Tally
          label="Unconfirmed actions"
          value={String(outcome.uncertain)}
          tint={outcome.uncertain > 0 ? 'var(--prov-lab)' : undefined}
        />
        <Tally label="Fixed-rule decisions" value={String(outcome.deterministicDecisions)} />
        <Tally
          label="Bounded AI judgments"
          value={String(outcome.boundedJudgments)}
          tint={outcome.boundedJudgments > 0 ? 'var(--prov-lab)' : undefined}
        />
        <Tally
          label="Illegal moves refused"
          value={String(outcome.refusedTransitions)}
          tint={outcome.refusedTransitions > 0 ? 'var(--blocked)' : undefined}
        />
        <Tally
          label="Matched expectation"
          value={outcome.matchedExpectation ? `Yes — ${outcome.expectedFinalState}` : 'No'}
          tint={outcome.matchedExpectation ? undefined : 'var(--blocked)'}
        />
      </dl>

      {outcome.stillUnknown.length > 0 && (
        <p
          className="instrument border-l-2 pl-3 py-1 leading-relaxed"
          style={{ color: 'var(--warn)', borderColor: 'var(--warn)' }}
        >
          <span className="label" style={{ color: 'var(--warn)' }}>
            Still unknown
          </span>{' '}
          {outcome.stillUnknown.join(', ')} — carried as missing rather than guessed at.
        </p>
      )}

      {outcome.awaitingHuman !== null && (
        <p
          className="instrument border-l-2 pl-3 py-1 leading-relaxed"
          style={{ color: 'var(--prov-fixture)', borderColor: 'var(--prov-fixture)' }}
        >
          <span className="label" style={{ color: 'var(--prov-fixture)' }}>
            Waiting on a person
          </span>{' '}
          {outcome.awaitingHuman}
        </p>
      )}
    </div>
  );
}

function Tally({ label, value, tint }: { readonly label: string; readonly value: string; readonly tint?: string }) {
  return (
    <div className="min-w-0">
      <dt className="label">{label}</dt>
      <dd className="instrument font-medium" style={tint === undefined ? undefined : { color: tint }}>
        {value}
      </dd>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stepper + rail
// ---------------------------------------------------------------------------

function Stepper({
  index,
  total,
  label,
  onChange,
}: {
  readonly index: number;
  readonly total: number;
  readonly label: string;
  readonly onChange: (next: number) => void;
}) {
  return (
    <div
      className="border rule rounded-sm px-3 py-2 flex flex-wrap items-center gap-x-3 gap-y-2"
      style={{ background: 'var(--panel)' }}
    >
      <button
        type="button"
        onClick={() => onChange(Math.max(0, index - 1))}
        disabled={index === 0}
        className="badge disabled:opacity-35"
        style={{ borderColor: 'var(--rule-strong)', color: 'var(--ink)' }}
      >
        ← Previous
      </button>
      <button
        type="button"
        onClick={() => onChange(Math.min(total - 1, index + 1))}
        disabled={index >= total - 1}
        className="badge disabled:opacity-35"
        style={{ borderColor: 'var(--rule-strong)', color: 'var(--ink)' }}
      >
        Next →
      </button>
      <span className="instrument min-w-0 truncate" style={{ color: 'var(--ink-muted)' }} title={label}>
        {label}
      </span>
      <span className="instrument tabular-nums ml-auto shrink-0" style={{ color: 'var(--ink-faint)' }}>
        {index + 1} / {total}
      </span>
    </div>
  );
}

function MomentRail({
  moments,
  active,
  onSelect,
}: {
  readonly moments: readonly JourneyMoment[];
  readonly active: number;
  readonly onSelect: (index: number) => void;
}) {
  return (
    <ol
      className="border rule rounded-sm overflow-y-auto max-h-[22rem] lg:max-h-[40rem] lg:sticky lg:top-6"
      style={{ background: 'var(--paper-raised)' }}
    >
      {moments.map((item) => {
        const isActive = item.index === active;
        const colour = STATE_COLOUR[item.stateAfterKind];
        return (
          <li key={item.id} className="border-b rule last:border-b-0">
            <button
              type="button"
              onClick={() => onSelect(item.index)}
              aria-current={isActive ? 'step' : undefined}
              className="w-full text-left px-3 py-2.5"
              style={{
                background: isActive ? 'var(--panel)' : 'transparent',
                borderInlineStart: `2px solid ${isActive ? 'var(--accent)' : 'transparent'}`,
                transition: 'background-color var(--dur-short) var(--ease-out)',
              }}
            >
              <span className="flex items-baseline justify-between gap-2">
                <span className="instrument font-medium min-w-0">{item.stepLabel}</span>
                <span className="instrument tabular-nums shrink-0" style={{ color: 'var(--ink-faint)' }}>
                  {offsetLabel(item.atOffsetSeconds)}
                </span>
              </span>
              <span className="flex flex-wrap items-center gap-1.5 mt-1">
                <span className="state-mark" style={{ background: colour }} aria-hidden="true" />
                <span className="instrument" style={{ color: 'var(--ink-muted)' }}>
                  {item.stateAfterLabel}
                </span>
                {item.guardrails.length > 0 && (
                  <span className="instrument" style={{ color: 'var(--blocked)' }} title="A guardrail engaged here">
                    ● guardrail
                  </span>
                )}
                {item.mechanisms.includes('BOUNDED_AI_JUDGMENT') && (
                  <span className="instrument" style={{ color: 'var(--prov-lab)' }} title="Bounded AI judgment involved">
                    ● AI
                  </span>
                )}
                {item.mechanisms.includes('HUMAN_DECISION') && (
                  <span className="instrument" style={{ color: 'var(--prov-fixture)' }} title="A person decided here">
                    ● person
                  </span>
                )}
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

// ---------------------------------------------------------------------------
// Moment inspector
// ---------------------------------------------------------------------------

function MomentInspector({ moment }: { readonly moment: JourneyMoment }) {
  return (
    <div className="proof-reveal space-y-4 min-w-0">
      {/* --- What happened ------------------------------------------------ */}
      <Panel title={`Step ${moment.index + 1} · ${moment.stepLabel}`} accent="var(--accent)">
        <p className="text-[0.9375rem] leading-relaxed">{moment.summary}</p>

        <div className="flex flex-wrap items-center gap-2 mt-4">
          <StateChip label={moment.stateBefore} kind="ACTIVE" muted />
          <span className="instrument" style={{ color: 'var(--ink-faint)' }} aria-label="becomes">
            →
          </span>
          <StateChip label={moment.stateAfterLabel} kind={moment.stateAfterKind} />
          {!moment.stateChanged && (
            <span className="instrument" style={{ color: 'var(--ink-faint)' }}>
              no move — this step decided something without changing the case&rsquo;s position
            </span>
          )}
        </div>

        {moment.hasRefusedTransition && (
          <div className="mt-3 space-y-1">
            {moment.transitions
              .filter((transition) => !transition.accepted)
              .map((transition) => (
                <p
                  key={transition.id}
                  className="instrument border-l-2 pl-3 py-1 leading-relaxed"
                  style={{ color: 'var(--blocked)', borderColor: 'var(--blocked)' }}
                >
                  <span className="label" style={{ color: 'var(--blocked)' }}>
                    Move refused
                  </span>{' '}
                  {transition.from} → {transition.to}. {transition.rejectionReason ?? ''}
                </p>
              ))}
          </div>
        )}
      </Panel>

      {/* --- Decisions ---------------------------------------------------- */}
      {moment.decisions.length === 0 ? (
        <Panel title="Decision">
          <p className="instrument" style={{ color: 'var(--ink-faint)' }}>
            This step recorded no decision.
          </p>
        </Panel>
      ) : (
        moment.decisions.map((decision) => (
          <Panel
            key={decision.id}
            title="Decision"
            accent={
              decision.mechanism === 'BOUNDED_AI_JUDGMENT'
                ? 'var(--prov-lab)'
                : decision.mechanism === 'HUMAN_DECISION'
                  ? 'var(--prov-fixture)'
                  : 'var(--prov-policy)'
            }
          >
            <div className="flex flex-wrap items-center gap-2">
              <MechanismChip mechanism={decision.mechanism} />
              {decision.confidence !== null && (
                <span className="badge" style={{ color: 'var(--prov-lab)', borderColor: 'var(--prov-lab)' }}>
                  Confidence {decision.confidence.toFixed(2)}
                </span>
              )}
              {decision.classification !== null && (
                <span className="badge" style={{ color: 'var(--ink-muted)', borderColor: 'var(--rule-strong)' }}>
                  {decision.classification}
                </span>
              )}
            </div>

            <p className="text-[0.9375rem] leading-relaxed mt-3">{decision.objective}</p>

            <div className="mt-3">
              <p className="label">It chose</p>
              <p className="instrument font-medium">{decision.selectedAction}</p>
            </div>

            <div className="mt-4">
              <AuthorityMeter level={decision.authority} />
            </div>

            {decision.escalationReason !== null && (
              <p
                className="instrument border-l-2 pl-3 py-1 mt-3 leading-relaxed"
                style={{ color: 'var(--prov-fixture)', borderColor: 'var(--prov-fixture)' }}
              >
                <span className="label" style={{ color: 'var(--prov-fixture)' }}>
                  Handed to a person because
                </span>{' '}
                {decision.escalationReason}
              </p>
            )}

            {decision.missingInformation.length > 0 && (
              <p
                className="instrument border-l-2 pl-3 py-1 mt-3 leading-relaxed"
                style={{ color: 'var(--warn)', borderColor: 'var(--warn)' }}
              >
                <span className="label" style={{ color: 'var(--warn)' }}>
                  Left unknown on purpose
                </span>{' '}
                {decision.missingInformation.join(', ')}
              </p>
            )}

            <Drawer summary="What it was and was not allowed to do">
              <div className="grid gap-4 sm:grid-cols-2">
                <Group label="Could choose from">
                  <List items={decision.permittedActions} tint="var(--ink-muted)" />
                </Group>
                <Group label="Could not choose at all">
                  <List items={decision.forbiddenActions} tint="var(--blocked)" />
                </Group>
              </div>
              {decision.applicablePolicy.length > 0 && (
                <Group label="Policy in force">
                  <List items={decision.applicablePolicy} tint="var(--ink-muted)" />
                </Group>
              )}
              {decision.facts.length > 0 && (
                <Group label="Facts it read">
                  <dl className="instrument space-y-1">
                    {decision.facts.map((fact) => (
                      <div key={`${fact.label}-${fact.value}`} className="flex gap-2 min-w-0">
                        <dt className="shrink-0" style={{ color: 'var(--ink-faint)' }}>
                          {fact.label}
                        </dt>
                        <dd className="min-w-0">{fact.value}</dd>
                      </div>
                    ))}
                  </dl>
                </Group>
              )}
              {decision.evaluatorResult !== null && (
                <Group label="Evaluator">
                  <p className="instrument leading-relaxed" style={{ color: 'var(--ink-muted)' }}>
                    {decision.evaluatorResult}
                  </p>
                </Group>
              )}
            </Drawer>
          </Panel>
        ))
      )}

      {/* --- Effects ------------------------------------------------------ */}
      {moment.effects.length > 0 && (
        <Panel title="What the system did about it">
          <ul className="space-y-4">
            {moment.effects.map((effect) => (
              <li key={effect.id} className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className="badge"
                    style={{
                      color: DISPOSITION_COLOUR[effect.disposition],
                      borderColor: DISPOSITION_COLOUR[effect.disposition],
                    }}
                  >
                    {DISPOSITION_LABEL[effect.disposition]}
                  </span>
                  <span className="badge" style={{ color: 'var(--ink-faint)', borderColor: 'var(--rule-strong)' }}>
                    {effect.status.replace(/_/g, ' ')}
                  </span>
                  {effect.customerFacing && (
                    <span className="badge" style={{ color: 'var(--ink-muted)', borderColor: 'var(--rule-strong)' }}>
                      Prospect-facing
                    </span>
                  )}
                  {effect.executionMode === 'SIMULATED' && (
                    <span className="badge" style={{ color: 'var(--warn)', background: 'var(--warn-bg)', borderColor: 'var(--warn)' }}>
                      Simulated transport
                    </span>
                  )}
                </div>

                <p className="text-[0.9375rem] leading-relaxed">{effect.description}</p>
                <p className="instrument leading-relaxed" style={{ color: 'var(--ink-muted)' }}>
                  {effect.meaning}
                </p>
                {effect.detail !== null && (
                  <p className="instrument leading-relaxed" style={{ color: 'var(--ink-faint)' }}>
                    {effect.detail}
                  </p>
                )}

                <AuthorityMeter level={effect.authority} />

                <Drawer summary="Action identity and transport">
                  <dl className="instrument space-y-1">
                    <KeyValue label="Recipient" value={effect.target} />
                    <KeyValue label="Kind" value={effect.kind.replace(/_/g, ' ')} />
                    <KeyValue label="Idempotency key" value={effect.idempotencyKey} />
                    {effect.technical !== null && (
                      <>
                        <KeyValue label="Attempt" value={String(effect.technical.attempt)} />
                        <KeyValue label="Provider" value={effect.technical.provider} />
                        <KeyValue label="Provider outcome" value={effect.technical.outcomeKind} />
                        <KeyValue label="Retry safety" value={effect.technical.retrySafety} />
                        <KeyValue label="Verification" value={effect.technical.verificationStatus} />
                        {effect.technical.externalId !== undefined && (
                          <KeyValue label="External id" value={effect.technical.externalId} />
                        )}
                      </>
                    )}
                  </dl>
                </Drawer>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {/* --- Guardrails --------------------------------------------------- */}
      {moment.guardrails.length > 0 && (
        <Panel title="Guardrail that engaged" accent="var(--blocked)">
          <ul className="space-y-4">
            {moment.guardrails.map((guardrail) => (
              <li key={guardrail.kind} className="space-y-2">
                <span className="badge" style={{ color: 'var(--blocked)', borderColor: 'var(--blocked)' }}>
                  {guardrail.label}
                </span>
                <p className="text-[0.9375rem] leading-relaxed">{guardrail.prevented}</p>
                <Drawer summary="The lines in the run that prove it">
                  <List items={guardrail.evidence} tint="var(--ink-muted)" />
                </Drawer>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {/* --- Provenance --------------------------------------------------- */}
      <Panel title="Where this came from">
        <Drawer summary="Open the provenance record" defaultOpen={false}>
          <div className="space-y-4">
            {moment.provenance.map((group) => (
              <Group key={group.label} label={group.label}>
                <dl className="instrument space-y-1">
                  {group.entries.map((entry, position) => (
                    <KeyValue key={`${entry.label}-${position}`} label={entry.label} value={entry.value} />
                  ))}
                </dl>
              </Group>
            ))}
          </div>
        </Drawer>
      </Panel>

      {/* --- Next move ---------------------------------------------------- */}
      <Panel title={moment.terminal ? 'Nothing follows this' : 'What can happen next'}>
        {moment.terminal ? (
          <p className="instrument leading-relaxed" style={{ color: 'var(--ink-muted)' }}>
            This is a terminal state. No declared transition leaves it, so a late or replayed
            event cannot reopen the case and re-contact anyone.
          </p>
        ) : moment.next.length === 0 ? (
          <p className="instrument" style={{ color: 'var(--ink-faint)' }}>
            No declared transition leaves this state.
          </p>
        ) : (
          <ul className="space-y-3">
            {moment.next.map((next) => (
              <li key={next.ruleId} className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="instrument font-medium">→ {next.toLabel}</span>
                  <MechanismChip mechanism={next.mechanism} />
                  <span className="badge" style={{ color: 'var(--ink-faint)', borderColor: 'var(--rule-strong)' }}>
                    Authority {next.authority}
                  </span>
                </div>
                <p className="instrument leading-relaxed" style={{ color: 'var(--ink-muted)' }}>
                  <span className="label">When</span> {next.trigger} — {next.guard}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Small parts
// ---------------------------------------------------------------------------

/**
 * Authority as five segments, filled to the level. A number alone ("authority 2") requires
 * the reader to already know the ladder; a filled bar shows at a glance that this action sits
 * below the level at which the system may act alone.
 */
function AuthorityMeter({ level }: { readonly level: AuthorityLevel }) {
  const acts = level >= 3;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <span className="flex items-center gap-1" aria-hidden="true">
        {[0, 1, 2, 3, 4].map((step) => (
          <span
            key={step}
            className="state-mark"
            style={{
              background: step <= level ? (acts ? 'var(--ok)' : 'var(--prov-fixture)') : 'transparent',
              border: `1px solid ${step <= level ? 'transparent' : 'var(--rule-strong)'}`,
            }}
          />
        ))}
      </span>
      <span className="instrument" style={{ color: 'var(--ink-muted)' }}>
        Authority {level} · {AUTHORITY_LABELS[level]}
      </span>
    </div>
  );
}

const MECHANISM_STYLE: Record<string, CSSProperties> = {
  DETERMINISTIC_RULE: { color: 'var(--prov-policy)', background: 'var(--prov-policy-bg)', borderColor: 'var(--prov-policy)' },
  BOUNDED_AI_JUDGMENT: { color: 'var(--prov-lab)', background: 'var(--prov-lab-bg)', borderColor: 'var(--prov-lab)' },
  HUMAN_DECISION: { color: 'var(--prov-fixture)', background: 'var(--prov-fixture-bg)', borderColor: 'var(--prov-fixture)' },
};

const MECHANISM_LABEL: Record<string, string> = {
  DETERMINISTIC_RULE: 'Fixed rule',
  BOUNDED_AI_JUDGMENT: 'Bounded AI judgment',
  HUMAN_DECISION: 'A person decided',
};

function MechanismChip({ mechanism }: { readonly mechanism: string }) {
  return (
    <span className="badge" style={MECHANISM_STYLE[mechanism] ?? {}}>
      {MECHANISM_LABEL[mechanism] ?? mechanism}
    </span>
  );
}

function StateChip({
  label,
  kind,
  muted = false,
}: {
  readonly label: string;
  readonly kind: StateKind;
  readonly muted?: boolean;
}) {
  return (
    <span
      className="badge"
      style={{
        color: muted ? 'var(--ink-faint)' : 'var(--ink)',
        borderColor: muted ? 'var(--rule-strong)' : STATE_COLOUR[kind],
      }}
    >
      {!muted && <span className="state-mark" style={{ background: STATE_COLOUR[kind] }} aria-hidden="true" />}
      {label}
    </span>
  );
}

function Panel({
  title,
  accent,
  children,
}: {
  readonly title: string;
  readonly accent?: string;
  readonly children: React.ReactNode;
}) {
  return (
    <section
      className="border rule rounded-sm min-w-0"
      style={{
        background: 'var(--paper-raised)',
        ...(accent === undefined ? {} : { borderBlockStartWidth: '2px', borderBlockStartColor: accent }),
      }}
    >
      <h3 className="label px-4 py-2.5 border-b rule">{title}</h3>
      <div className="p-4">{children}</div>
    </section>
  );
}

function Drawer({
  summary,
  children,
  defaultOpen = false,
}: {
  readonly summary: string;
  readonly children: React.ReactNode;
  readonly defaultOpen?: boolean;
}) {
  return (
    <details className="mt-3" open={defaultOpen}>
      <summary className="label cursor-pointer hover:opacity-70">{summary}</summary>
      <div className="mt-3 border-l-2 pl-4 space-y-3" style={{ borderColor: 'var(--rule-strong)' }}>
        {children}
      </div>
    </details>
  );
}

function Group({ label, children }: { readonly label: string; readonly children: React.ReactNode }) {
  return (
    <div className="space-y-1 min-w-0">
      <p className="label">{label}</p>
      {children}
    </div>
  );
}

function List({ items, tint }: { readonly items: readonly string[]; readonly tint: string }) {
  if (items.length === 0) {
    return (
      <p className="instrument" style={{ color: 'var(--ink-faint)' }}>
        None.
      </p>
    );
  }
  return (
    <ul className="instrument space-y-1" style={{ color: tint }}>
      {items.map((item, position) => (
        <li key={`${item}-${position}`} className="pl-3 relative">
          <span className="absolute left-0" aria-hidden="true">
            ·
          </span>
          {item}
        </li>
      ))}
    </ul>
  );
}

function KeyValue({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="flex flex-col sm:flex-row sm:gap-2 min-w-0">
      <dt className="label shrink-0 sm:w-40">{label}</dt>
      <dd className="min-w-0" style={{ overflowWrap: 'anywhere' }}>
        {value}
      </dd>
    </div>
  );
}

// ---------------------------------------------------------------------------

function SectionLead({
  eyebrow,
  title,
  body,
}: {
  readonly eyebrow: string;
  readonly title: string;
  readonly body: string;
}) {
  return (
    <div className="space-y-2 prose-measure">
      <span className="label">{eyebrow}</span>
      <h3 className="display text-xl sm:text-2xl">{title}</h3>
      <p className="text-[0.9375rem] leading-relaxed" style={{ color: 'var(--ink-muted)' }}>
        {body}
      </p>
    </div>
  );
}
