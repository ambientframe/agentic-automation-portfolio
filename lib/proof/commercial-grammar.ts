import { GUARDRAIL_KINDS, type Journey, type JourneyMoment } from './journey';

/**
 * RUN → COMMERCIAL GRAMMAR. The five things a buyer asks, in the order they ask them.
 *
 * TRIGGER → DECISION → ACTION → GUARDRAIL → OUTCOME is the only narrative frame this
 * build imposes on a run, and it is imposed STRUCTURALLY: each stage is selected from the
 * run by one fixed rule that applies identically to all eight scenarios. Nothing here is
 * authored per scenario, so no scenario can be given a flattering story the run does not
 * support.
 *
 * The rules are exported as `SELECTION_RULES` and rendered next to the strip, because a
 * derived headline whose derivation is hidden is indistinguishable from marketing copy.
 *
 * WHY THIS IS NOT A SUMMARY. A summary would compress the run and lose the parts that
 * disqualify a vendor. Every stage below instead points at ONE moment (`momentIndex`) that
 * a reader can open in full, so the strip is an index into evidence rather than a
 * replacement for it.
 */

export const GRAMMAR_STAGES = ['TRIGGER', 'DECISION', 'ACTION', 'GUARDRAIL', 'OUTCOME'] as const;
export type GrammarStageId = (typeof GRAMMAR_STAGES)[number];

/**
 * How a stage should read, not how serious it is. `HELD` and `UNCERTAIN` exist so the
 * strip can look visibly different when the system withheld an action or could not confirm
 * one — the two cases a dashboard would quietly render as success.
 */
export type GrammarTone = 'NEUTRAL' | 'ACTED' | 'HELD' | 'UNCERTAIN' | 'PERSON';

export interface GrammarStage {
  readonly stage: GrammarStageId;
  readonly heading: string;
  /** Short answer, in words a buyer reads without a glossary. */
  readonly headline: string;
  /** One sentence of supporting fact, all of it lifted or computed from the run. */
  readonly detail: string;
  /**
   * The machine identifier behind the headline, when the headline is a readable rendering of
   * one. Rendered small and monospaced beneath it.
   *
   * This field exists because the first version of this strip used the identifiers themselves
   * as headlines — a buyer's first view of the system read `inbound.enquiry.received` and
   * `normalise`. Dropping them entirely would have been the opposite error: the identifier is
   * how a sceptic ties the cell to a specific record in the run. So both are shown, with the
   * readable one leading.
   */
  readonly technicalName: string | null;
  /** The moment a reader should open to check this stage. Null when the run had none. */
  readonly momentIndex: number | null;
  readonly tone: GrammarTone;
}

export interface CommercialGrammar {
  readonly stages: readonly GrammarStage[];
}

/** Rendered verbatim beside the strip. Changing a rule below means changing this text. */
export const SELECTION_RULES: readonly { readonly stage: GrammarStageId; readonly rule: string }[] = [
  { stage: 'TRIGGER', rule: 'The first processing step of the run.' },
  { stage: 'DECISION', rule: 'The decision that exercised the highest authority. Earliest one wins a tie.' },
  {
    stage: 'ACTION',
    rule: 'The most consequential effect, by fixed precedence: something a customer received, then something unconfirmed, then something withheld.',
  },
  { stage: 'GUARDRAIL', rule: 'The strongest guardrail the run structurally engaged, ordered policy block → conflict → legality → escalation → authority → retry → duplicate → bounded set → unknown-kept-unknown.' },
  { stage: 'OUTCOME', rule: "The run's final lifecycle state, checked against the state the scenario declared it expected." },
];

// ---------------------------------------------------------------------------

/**
 * Renders a dotted or hyphenated identifier as a sentence. Purely typographic — it inserts
 * spaces and adjusts case, and adds, removes, and reorders no words. `inbound.enquiry.received`
 * becomes "Inbound enquiry received", which a buyer can read and a sceptic can still match
 * against the raw identifier shown beside it.
 */
function humanise(identifier: string): string {
  const words = identifier.split(/[._-]+/).filter((word) => word.length > 0);
  if (words.length === 0) return identifier;
  const sentence = words.join(' ').toLowerCase();
  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}

function triggerStage(moments: readonly JourneyMoment[]): GrammarStage {
  const first = moments[0];
  if (first === undefined) {
    return {
      stage: 'TRIGGER',
      heading: 'Trigger',
      headline: 'Nothing arrived',
      detail: 'This run produced no processing steps at all.',
      technicalName: null,
      momentIndex: null,
      tone: 'NEUTRAL',
    };
  }
  return {
    stage: 'TRIGGER',
    heading: 'Trigger',
    headline: humanise(first.eventType),
    detail: `Arrived from ${humanise(first.eventSource).toLowerCase()} and entered the system as a tracked case.`,
    technicalName: first.eventType,
    momentIndex: first.index,
    tone: 'NEUTRAL',
  };
}

function decisionStage(moments: readonly JourneyMoment[]): GrammarStage {
  let best: { readonly moment: JourneyMoment; readonly authority: number; readonly index: number } | null = null;
  for (const moment of moments) {
    for (const decision of moment.decisions) {
      if (best === null || decision.authority > best.authority) {
        best = { moment, authority: decision.authority, index: moment.index };
      }
    }
  }

  if (best === null) {
    return {
      stage: 'DECISION',
      heading: 'Decision',
      headline: 'Nothing was decided',
      detail: 'No decision record was produced during this run.',
      technicalName: null,
      momentIndex: null,
      tone: 'NEUTRAL',
    };
  }

  const decision = [...best.moment.decisions].sort((a, b) => b.authority - a.authority)[0];
  if (decision === undefined) {
    return {
      stage: 'DECISION',
      heading: 'Decision',
      headline: 'Nothing was decided',
      detail: 'No decision record was produced during this run.',
      technicalName: null,
      momentIndex: null,
      tone: 'NEUTRAL',
    };
  }

  const how =
    decision.mechanism === 'DETERMINISTIC_RULE'
      ? 'A fixed rule computed this. No model was involved and it is reproducible.'
      : decision.mechanism === 'BOUNDED_AI_JUDGMENT'
        ? `A bounded judgment produced this${decision.confidence === null ? '' : ` at confidence ${decision.confidence.toFixed(2)}`}, choosing only from a closed set.`
        : 'A person decided this. It entered the system as an explicit human event.';

  return {
    stage: 'DECISION',
    heading: 'Decision',
    // `objective` is the decision's own statement of what it was deciding, authored in the
    // system definition as prose. `selectedAction` is the identifier of what it picked, which
    // reads as a bare verb on its own and belongs underneath.
    headline: decision.objective,
    detail: how,
    technicalName: decision.selectedAction,
    momentIndex: best.index,
    tone: decision.mechanism === 'HUMAN_DECISION' ? 'PERSON' : 'NEUTRAL',
  };
}

function actionStage(moments: readonly JourneyMoment[]): GrammarStage {
  const flat = moments.flatMap((moment) => moment.effects.map((effect) => ({ moment, effect })));

  const pick =
    flat.find((e) => e.effect.customerFacing && e.effect.disposition === 'EXECUTED') ??
    flat.find((e) => e.effect.disposition === 'EXECUTED') ??
    flat.find((e) => e.effect.disposition === 'UNCERTAIN') ??
    flat.find((e) => e.effect.disposition === 'WITHHELD');

  if (pick === undefined) {
    return {
      stage: 'ACTION',
      heading: 'Action',
      headline: 'Nothing was attempted',
      detail: 'This run proposed no external action of any kind.',
      technicalName: null,
      momentIndex: null,
      tone: 'HELD',
    };
  }

  const { effect, moment } = pick;
  const tone: GrammarTone =
    effect.disposition === 'EXECUTED' ? 'ACTED' : effect.disposition === 'UNCERTAIN' ? 'UNCERTAIN' : 'HELD';

  return {
    stage: 'ACTION',
    heading: 'Action',
    headline: effect.description,
    detail: effect.meaning,
    technicalName: effect.kind,
    momentIndex: moment.index,
    tone,
  };
}

function guardrailStage(moments: readonly JourneyMoment[]): GrammarStage {
  const strength = new Map(GUARDRAIL_KINDS.map((kind, index) => [kind, index]));
  let best: {
    readonly moment: JourneyMoment;
    readonly rank: number;
    readonly prevented: string;
    readonly label: string;
    readonly kind: string;
  } | null = null;

  for (const moment of moments) {
    for (const guardrail of moment.guardrails) {
      const rank = strength.get(guardrail.kind) ?? -1;
      if (best === null || rank > best.rank) {
        best = { moment, rank, prevented: guardrail.prevented, label: guardrail.label, kind: guardrail.kind };
      }
    }
  }

  if (best === null) {
    return {
      stage: 'GUARDRAIL',
      heading: 'Guardrail',
      headline: 'None engaged',
      detail: 'This run needed no guardrail: nothing was refused, held, deduplicated, or escalated.',
      technicalName: null,
      momentIndex: null,
      tone: 'NEUTRAL',
    };
  }

  return {
    stage: 'GUARDRAIL',
    heading: 'Guardrail',
    headline: best.label,
    detail: best.prevented,
    technicalName: best.kind,
    momentIndex: best.moment.index,
    tone: 'HELD',
  };
}

function outcomeStage(journey: Journey): GrammarStage {
  const { outcome, moments } = journey;
  const last = moments.at(-1);

  /**
   * Exhaustive over state KIND, because the two-branch version this replaces described any
   * non-waiting, non-review state as "Finished. No further move can leave this state." Four of
   * the eight runs end in BOOKING_READY, which is ACTIVE — so the strip called them finished
   * while the state ribbon directly above correctly showed them "In progress". An active state
   * is a live case awaiting its next event, and saying so is the whole claim of this section.
   */
  const accountedFor = ((): string => {
    switch (outcome.finalStateKind) {
      case 'WAITING':
        return 'Parked deliberately, with a deadline attached. Not lost.';
      case 'HUMAN_REVIEW':
        return 'Handed to a person, who now owns it. Not lost.';
      case 'TERMINAL_SUCCESS':
      case 'TERMINAL_NEUTRAL':
      case 'TERMINAL_FAILURE':
        return 'Finished. No further move can leave this state.';
      case 'INITIAL':
      case 'ACTIVE':
        return `Still open. The recorded events run out here, with the case live in this state and its next move${
          last === undefined || last.next.length === 0 ? ' not yet triggered' : ` waiting on ${last.next[0]?.trigger ?? 'its next trigger'}`
        }.`;
    }
  })();

  return {
    stage: 'OUTCOME',
    heading: 'Outcome',
    headline: outcome.finalStateLabel,
    detail: `${accountedFor}${outcome.matchedExpectation ? '' : ` The scenario expected ${outcome.expectedFinalState}, so this run diverged.`}`,
    technicalName: outcome.finalState,
    momentIndex: last?.index ?? null,
    tone: outcome.finalStateKind === 'HUMAN_REVIEW' ? 'PERSON' : outcome.finalStateKind === 'WAITING' ? 'HELD' : 'NEUTRAL',
  };
}

export function deriveCommercialGrammar(journey: Journey): CommercialGrammar {
  const { moments } = journey;
  return {
    stages: [
      triggerStage(moments),
      decisionStage(moments),
      actionStage(moments),
      guardrailStage(moments),
      outcomeStage(journey),
    ],
  };
}

// ---------------------------------------------------------------------------
// Scenario index
// ---------------------------------------------------------------------------

/**
 * The one-line answer to "why would I click this one?", for the scenario switcher.
 *
 * Deliberately built from run facts rather than from `scenario.summary`: the summary is
 * authored prose and every scenario's reads plausibly, so a switcher built from summaries
 * gives a reader no way to tell the eight apart on the axis they care about — whether
 * anything went out, and whether a person ended up holding it.
 */
export interface ScenarioIndexEntry {
  readonly slug: string;
  readonly title: string;
  readonly finalStateLabel: string;
  readonly finalStateKind: Journey['outcome']['finalStateKind'];
  readonly matchedExpectation: boolean;
  /** e.g. "1 sent · 2 held". Empty string when the run attempted nothing. */
  readonly effectTally: string;
  readonly personInvolved: boolean;
  readonly momentCount: number;
  readonly strongestGuardrail: string | null;
}

export function toScenarioIndexEntry(journey: Journey): ScenarioIndexEntry {
  const { outcome } = journey;
  const parts: string[] = [];
  if (outcome.customerFacingExecuted > 0) parts.push(`${outcome.customerFacingExecuted} sent`);
  if (outcome.uncertain > 0) parts.push(`${outcome.uncertain} unconfirmed`);
  if (outcome.withheld > 0) parts.push(`${outcome.withheld} held`);

  const guardrail = deriveCommercialGrammar(journey).stages.find((s) => s.stage === 'GUARDRAIL');

  return {
    slug: journey.scenarioSlug,
    title: journey.scenarioTitle,
    finalStateLabel: outcome.finalStateLabel,
    finalStateKind: outcome.finalStateKind,
    matchedExpectation: outcome.matchedExpectation,
    effectTally: parts.join(' · '),
    personInvolved: outcome.personInvolved,
    momentCount: journey.moments.length,
    strongestGuardrail: guardrail === undefined || guardrail.momentIndex === null ? null : guardrail.headline,
  };
}
