import type { ExtractionResult } from '@/lib/ports/extraction-provider';
import { CP_REQUIRED_FIELDS } from '@/lib/engine/handlers/call-to-proposal';
import { ScenarioSchema, type Scenario } from '@/lib/model/runtime';

/**
 * CALL-TO-PROPOSAL REVENUE AGENT — Kestrel scenarios.
 *
 * Two scenarios, per the same discipline as Lead Rescue and Dormant Pipeline Recovery:
 * a normal path that reaches approved despatch, and a guardrail path proving the system
 * cannot hallucinate its way into a proposal. Both discovery calls are authored with
 * genuine conversational messiness — hedging, a deferred budget question, an explicit
 * refusal to promise an outcome — rather than a buyer reciting database fields.
 *
 * Extraction results are fixture data, exactly like Lead Rescue's classification fixtures
 * and Dormant Pipeline Recovery's reply-interpretation fixtures: authored here, replayed
 * through `FixtureExtractionProvider`, validated against the same contract a live
 * extraction model's output would have to satisfy.
 */

// ---------------------------------------------------------------------------
// Scenario A — discovery call to approved proposal
// ---------------------------------------------------------------------------

const BRAMWELL_SEGMENTS = [
  { id: 'seg-01', speaker: 'Priya Nandy (Head of Security)', text: "Thanks for jumping on so quickly. So — background, we're Bramwell Data, about forty-five people. We got a security questionnaire back from a big enterprise prospect last week and it basically stalled the deal. They flagged that we don't have any SOC 2 report at all." },
  { id: 'seg-02', speaker: 'Marcus (Kestrel)', text: 'Got it. And this is blocking a live deal, not just a nice-to-have for later?' },
  { id: 'seg-03', speaker: 'Priya Nandy (Head of Security)', text: "Yeah, exactly, it's blocking. We need to show them something concrete within about four weeks or the whole thing might just die in procurement. I'm the first security hire here, so this is very much a scramble." },
  { id: 'seg-04', speaker: 'Marcus (Kestrel)', text: "Okay — so the real goal right now isn't the full report, it's unblocking that specific deal fast." },
  { id: 'seg-05', speaker: 'Priya Nandy (Head of Security)', text: 'Right. Unblock the deal. Whatever gets us there fastest.' },
  { id: 'seg-06', speaker: 'Marcus (Kestrel)', text: "Given the four-week window, I wouldn't put you into a full SOC 2 program yet — that's a longer conversation. What actually fits that timeline is our questionnaire remediation sprint: we go through their specific questionnaire, shore up the gaps, and get you something credible to hand back to procurement. That's usually about four weeks on our side." },
  { id: 'seg-07', speaker: 'Priya Nandy (Head of Security)', text: 'That sounds like exactly what we need. What about budget — is that something we need to lock down today?' },
  { id: 'seg-08', speaker: 'Marcus (Kestrel)', text: "No, let's not hold this up on that. Go check with your CFO and we'll sort commercial terms in the proposal — I'd rather send you something concrete to react to than guess at a number on this call." },
  { id: 'seg-09', speaker: 'Priya Nandy (Head of Security)', text: 'Okay, that works. So — next step, you send us a written proposal?' },
  { id: 'seg-10', speaker: 'Marcus (Kestrel)', text: "Yes. I'll get you a written proposal for the sprint by Friday. You said you own bringing this to your CFO?" },
  { id: 'seg-11', speaker: 'Priya Nandy (Head of Security)', text: "Yes, that's on me." },
  { id: 'seg-12', speaker: 'Marcus (Kestrel)', text: "One thing I want to be upfront about — I can't speak to what the auditor's own schedule looks like once you're further down the road, and we're not the ones issuing any certificate. Our side of the sprint is typically four weeks; what happens after that depends on what you decide to do next." },
];

const BRAMWELL_EXTRACTION: ExtractionResult = {
  judgmentId: 'jud-cp-bramwell-extract',
  extracted: [
    { field: 'buyerCompanyName', value: 'Bramwell Data', evidenceRefs: ['seg-01'], confidence: 0.97 },
    { field: 'primaryContact', value: 'Priya Nandy — Head of Security, first security hire', evidenceRefs: ['seg-01', 'seg-03'], confidence: 0.93 },
    { field: 'currentSituation', value: "An enterprise prospect's security questionnaire flagged the absence of any SOC 2 report, stalling a live deal in procurement.", evidenceRefs: ['seg-01', 'seg-03'], confidence: 0.95 },
    { field: 'desiredOutcome', value: 'Unblock the stalled enterprise deal with something concrete to show procurement.', evidenceRefs: ['seg-04', 'seg-05'], confidence: 0.94 },
    { field: 'timing', value: '4 weeks', evidenceRefs: ['seg-03'], confidence: 0.9 },
    { field: 'serviceInterest', value: 'questionnaire-sprint', evidenceRefs: ['seg-06', 'seg-07'], confidence: 0.92 },
    { field: 'agreedNextStep', value: 'Kestrel sends a written proposal for the questionnaire sprint by Friday.', evidenceRefs: ['seg-09', 'seg-10'], confidence: 0.96 },
    { field: 'nextStepOwner', value: 'Priya Nandy', evidenceRefs: ['seg-11'], confidence: 0.95 },
    { field: 'employeeCount', value: '45', evidenceRefs: ['seg-01'], confidence: 0.85 },
  ],
  missingFields: ['budgetDiscussed'],
  declinedToInfer: [
    'Commercial terms/budget figure — buyer explicitly deferred this to a CFO check; no number was discussed on the call.',
    'Audit outcome or timeline guarantee beyond the sprint itself — seller explicitly declined to speak to the auditor’s own schedule or any certification outcome.',
  ],
  overallConfidence: 0.92,
  rationaleSummary:
    'A clear, time-boxed unblock scenario with an agreed next step and a named owner. Budget was explicitly deferred rather than discussed, and outcome guarantees were explicitly declined by the seller — both carried forward as declined inferences rather than filled in.',
};

const scenarioA: Scenario = ScenarioSchema.parse({
  id: 'cp-scenario-discovery-to-approved-proposal',
  slug: 'discovery-to-approved-proposal',
  systemId: 'call-to-proposal',
  title: 'Discovery call to approved proposal',
  summary:
    'A discovery call establishes every material commercial fact needed to scope and price an engagement, while budget genuinely stays unknown because it was never discussed. Extraction, gap-checking, claim admission, scope derivation, and a named approval all execute for real before a proposal despatches.',
  demonstrates: [
    'Buyer facts are extracted with cited evidence, never asserted from confidence alone',
    'A seller term is sourced from the approved rate card, never invented from the transcript',
    'A derived fact combines a buyer claim and a seller claim through a named rule',
    'A non-material unknown (budget) does not block progress',
    'Despatch requires a named human approval tied to a specific artifact version',
  ],
  events: [
    {
      eventId: 'evt-cp-bramwell-001',
      correlationId: 'inc-cp-bramwell',
      entityId: 'opp-bramwell',
      type: 'sales.call.transcript.received',
      source: 'call-recording-system',
      sourceEventId: 'call-2026-08-10-bramwell',
      occurredAt: '2026-08-10T15:35:00-04:00',
      receivedAt: '2026-08-10T15:40:00-04:00',
      schemaVersion: '2026-08-01',
      actor: 'SYSTEM',
      executionMode: 'SIMULATED',
      payload: {
        extraction: {
          judgmentId: 'jud-cp-bramwell-extract',
          objective: 'Map the discovery call transcript onto the structured commercial record, citing the passage supporting each populated field.',
          sourceArtifactId: 'transcript-bramwell-2026-08-10',
          segments: BRAMWELL_SEGMENTS,
          requiredFields: [...CP_REQUIRED_FIELDS],
        },
      },
    },
    {
      eventId: 'evt-cp-bramwell-002',
      correlationId: 'inc-cp-bramwell',
      entityId: 'opp-bramwell',
      type: 'human.decision.recorded',
      source: 'operator-console',
      sourceEventId: 'console-2026-08-11-0900',
      occurredAt: '2026-08-11T09:00:00-04:00',
      receivedAt: '2026-08-11T09:00:00-04:00',
      schemaVersion: '2026-08-01',
      actor: 'HUMAN',
      executionMode: 'SIMULATED',
      payload: {
        decidedBy: 'founder',
        decision: 'APPROVE',
        rationale: 'Scope and timeline hold together and nothing exceeds the standard rate card. Approved to send.',
      },
    },
  ],
  judgments: {},
  expectedFinalState: 'APPROVED_SENT',
});

// ---------------------------------------------------------------------------
// Scenario B — unsupported scope claim blocked
// ---------------------------------------------------------------------------

const LARKSPUR_SEGMENTS = [
  { id: 'seg-01', speaker: 'Devon Ashcroft (CTO)', text: "So we're Larkspur Robotics, we build fleet management software for warehouse robots. One of our biggest customers, an enterprise logistics company, is asking for a SOC 2 report before they'll expand the contract." },
  { id: 'seg-02', speaker: 'Marcus (Kestrel)', text: 'Got it. Where are you at with SOC 2 today — anything started?' },
  { id: 'seg-03', speaker: 'Devon Ashcroft (CTO)', text: 'Nothing yet. This is genuinely day one for us on this.' },
  { id: 'seg-04', speaker: 'Devon Ashcroft (CTO)', text: "There's no hard deadline from them yet, but our contract renewal conversation is in about ten weeks, so I'd like this moving well before then." },
  { id: 'seg-05', speaker: 'Marcus (Kestrel)', text: "Okay. And what's the actual ask from the customer right now — do they need a full report, or are they asking for something more like a completed questionnaire?" },
  { id: 'seg-06', speaker: 'Devon Ashcroft (CTO)', text: "Honestly it's a bit vague on their side — their procurement team just said 'SOC 2 compliance' in an email. We haven't nailed down exactly what they need yet." },
  { id: 'seg-07', speaker: 'Marcus (Kestrel)', text: "That's common. Given you're starting from zero, I'd want to scope a readiness assessment first — get control design and policy work in place — before we talk about anything past that. I don't want to commit you to a bigger program before we know what the customer actually needs." },
  { id: 'seg-08', speaker: 'Devon Ashcroft (CTO)', text: "That makes sense. Let's start small and see how it goes. Can you send something over for just that piece — the readiness assessment — so I can take it to our exec team?" },
  { id: 'seg-09', speaker: 'Marcus (Kestrel)', text: "Yes, I'll get you a proposal for the readiness assessment. You're the one bringing it to your exec team?" },
  { id: 'seg-10', speaker: 'Devon Ashcroft (CTO)', text: "Yes, that's me." },
  { id: 'seg-11', speaker: 'Marcus (Kestrel)', text: 'Great — expect that by early next week.' },
];

/**
 * The dangerous candidate: a `proposedScope` field asserting a materially larger,
 * longer-duration commitment than anything discussed, carrying zero evidence references.
 * Devon explicitly asked to "start small"; nobody discussed a Type II program or a
 * twelve-month observation window. This is fluent completion of a familiar upsell
 * pattern — exactly the confabulation risk `cp-std-confabulation` names — not a citation
 * error, since the port-level segment-existence check would not catch an empty ref list.
 * The claim-admission gate is what has to catch it, and this fixture exists to prove it does.
 */
const LARKSPUR_EXTRACTION: ExtractionResult = {
  judgmentId: 'jud-cp-larkspur-extract',
  extracted: [
    { field: 'buyerCompanyName', value: 'Larkspur Robotics', evidenceRefs: ['seg-01'], confidence: 0.97 },
    { field: 'primaryContact', value: 'Devon Ashcroft — CTO', evidenceRefs: ['seg-01'], confidence: 0.95 },
    { field: 'currentSituation', value: 'An enterprise logistics customer requires a SOC 2 report before expanding the contract; Larkspur has not started any SOC 2 work.', evidenceRefs: ['seg-01', 'seg-03'], confidence: 0.94 },
    { field: 'desiredOutcome', value: "Meet the customer's SOC 2 expectation to protect the contract expansion, starting with a scoped first step rather than a full program.", evidenceRefs: ['seg-01', 'seg-07', 'seg-08'], confidence: 0.9 },
    { field: 'timing', value: '10 weeks', evidenceRefs: ['seg-04'], confidence: 0.88 },
    { field: 'serviceInterest', value: 'soc2-type1', evidenceRefs: ['seg-07', 'seg-08'], confidence: 0.91 },
    { field: 'agreedNextStep', value: 'Kestrel sends a proposal for the readiness assessment.', evidenceRefs: ['seg-09', 'seg-11'], confidence: 0.95 },
    { field: 'nextStepOwner', value: 'Devon Ashcroft', evidenceRefs: ['seg-10'], confidence: 0.95 },
    {
      field: 'proposedScope',
      value: 'SOC 2 Type II readiness — twelve-month operating-effectiveness observation window included',
      evidenceRefs: [],
      confidence: 0.61,
    },
  ],
  missingFields: ['budgetDiscussed', 'employeeCount'],
  declinedToInfer: [
    "The customer's exact requirement (full report vs. a completed questionnaire) — buyer stated their procurement team has not specified this yet.",
  ],
  overallConfidence: 0.88,
  rationaleSummary:
    'Buyer wants a scoped first step and explicitly declined a larger commitment. One candidate field nonetheless proposes an expanded, longer-duration scope with no supporting passage — carried forward for the claim-admission gate to evaluate rather than silently included.',
};

const scenarioB: Scenario = ScenarioSchema.parse({
  id: 'cp-scenario-unsupported-scope-claim-blocked',
  slug: 'unsupported-scope-claim-blocked',
  systemId: 'call-to-proposal',
  title: 'Unsupported scope claim blocked',
  summary:
    'A candidate extraction expands a buyer’s explicitly scoped-down request into a materially larger, longer commitment with zero supporting evidence. The claim-admission gate refuses it before a draft can exist — no external proposal despatches, and the reason is inspectable.',
  demonstrates: [
    'A commercially dangerous but structurally valid-looking claim is refused for lacking citation',
    'High extraction confidence does not override missing evidence',
    'The package never reaches DRAFT_PREPARED or AWAITING_APPROVAL',
    'The specific offending field and reason are named, not a generic rejection',
  ],
  events: [
    {
      eventId: 'evt-cp-larkspur-001',
      correlationId: 'inc-cp-larkspur',
      entityId: 'opp-larkspur',
      type: 'sales.call.transcript.received',
      source: 'call-recording-system',
      sourceEventId: 'call-2026-08-12-larkspur',
      occurredAt: '2026-08-12T11:00:00-04:00',
      receivedAt: '2026-08-12T11:05:00-04:00',
      schemaVersion: '2026-08-01',
      actor: 'SYSTEM',
      executionMode: 'SIMULATED',
      payload: {
        extraction: {
          judgmentId: 'jud-cp-larkspur-extract',
          objective: 'Map the discovery call transcript onto the structured commercial record, citing the passage supporting each populated field.',
          sourceArtifactId: 'transcript-larkspur-2026-08-12',
          segments: LARKSPUR_SEGMENTS,
          requiredFields: [...CP_REQUIRED_FIELDS],
        },
      },
    },
  ],
  judgments: {},
  expectedFinalState: 'NEEDS_HUMAN',
});

export const CALL_TO_PROPOSAL_SCENARIOS: readonly Scenario[] = [scenarioA, scenarioB];

export const CALL_TO_PROPOSAL_EXTRACTIONS: Readonly<Record<string, ExtractionResult>> = {
  [BRAMWELL_EXTRACTION.judgmentId]: BRAMWELL_EXTRACTION,
  [LARKSPUR_EXTRACTION.judgmentId]: LARKSPUR_EXTRACTION,
};

export function callToProposalScenarioBySlug(slug: string): Scenario | undefined {
  return CALL_TO_PROPOSAL_SCENARIOS.find((s) => s.slug === slug);
}
