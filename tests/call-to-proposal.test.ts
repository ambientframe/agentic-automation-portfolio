import { describe, expect, it } from 'vitest';
import { KESTREL } from '@/data/profiles/kestrel/profile';
import {
  CALL_TO_PROPOSAL_EXTRACTIONS,
  CALL_TO_PROPOSAL_SCENARIOS,
  callToProposalScenarioBySlug,
} from '@/data/profiles/kestrel/scenarios/call-to-proposal';
import { CALL_TO_PROPOSAL } from '@/data/systems';
import {
  CALL_TO_PROPOSAL_HANDLERS,
  CP_REQUIRED_FIELDS,
  admitClaim,
  approveProposalArtifact,
  canDeliver,
  createProposalArtifact,
  reviseProposalArtifact,
  type Claim,
} from '@/lib/engine/handlers/call-to-proposal';
import { runScenario } from '@/lib/engine/run';
import { ScenarioSchema, type CanonicalEvent } from '@/lib/model/runtime';
import { FixtureDecisionProvider } from '@/lib/ports/decision-provider';
import { FixtureExtractionProvider, type ExtractionResult } from '@/lib/ports/extraction-provider';
import { runCallToProposal } from './helpers';

function scenario(slug: string) {
  const found = callToProposalScenarioBySlug(slug);
  if (found === undefined) throw new Error(`scenario "${slug}" not found`);
  return found;
}

/** Reads the JSON-serialised claim list off final state, the way the handler stores it. */
function claimsFrom(facts: Readonly<Record<string, string>>): Claim[] {
  const raw = facts['commercialRecordClaimsJson'];
  return raw === undefined ? [] : (JSON.parse(raw) as Claim[]);
}

describe('Call-to-Proposal Revenue Agent scenarios', () => {
  it('provides the two scenarios this iteration requires', () => {
    expect(CALL_TO_PROPOSAL_SCENARIOS.map((s) => s.slug)).toEqual([
      'discovery-to-approved-proposal',
      'unsupported-scope-claim-blocked',
    ]);
  });

  it('reaches the expected final state in every scenario', async () => {
    for (const s of CALL_TO_PROPOSAL_SCENARIOS) {
      const run = await runCallToProposal(s);
      expect(run.finalState.lifecycleState, s.slug).toBe(s.expectedFinalState);
    }
  });

  it('never executes a side effect outside simulation', async () => {
    for (const s of CALL_TO_PROPOSAL_SCENARIOS) {
      const run = await runCallToProposal(s);
      for (const effect of run.sideEffects) {
        expect(effect.executionMode, `${s.slug}/${effect.id}`).toBe('SIMULATED');
      }
    }
  });

  // -------------------------------------------------------------------------
  // Scenario A — discovery call to approved proposal
  // -------------------------------------------------------------------------
  describe('discovery to approved proposal', () => {
    it('moves through extraction, coverage, claims review, drafting, and approval in the declared order', async () => {
      const run = await runCallToProposal(scenario('discovery-to-approved-proposal'));
      expect(run.timeline.map((e) => e.stepLabel)).toEqual([
        'Transcript received',
        'Extraction',
        'Required-field coverage',
        'Gap routing',
        'Claims review',
        'Draft assembled',
        'Routed for approval',
        'Human decision',
      ]);
    });

    it('extracts every buyer fact with at least one cited transcript segment', async () => {
      const run = await runCallToProposal(scenario('discovery-to-approved-proposal'));
      const claims = claimsFrom(run.finalState.facts);
      const buyerFacts = claims.filter((c) => c.source === 'TRANSCRIPT');

      expect(buyerFacts.length).toBeGreaterThan(0);
      for (const claim of buyerFacts) {
        expect(claim.evidenceRefs.length, `claim "${claim.field}" has no evidence`).toBeGreaterThan(0);
      }
    });

    it('sources the commercial term from the approved rate card, never from the transcript', async () => {
      const run = await runCallToProposal(scenario('discovery-to-approved-proposal'));
      const draftDecision = run.decisions.find((d) => d.id.endsWith('d-draft'));
      expect(draftDecision).toBeDefined();

      const artifactRaw = run.finalState.facts['proposalArtifactJson'];
      expect(artifactRaw).toBeDefined();
      const artifact = JSON.parse(artifactRaw as string) as { commercialTerms: Claim[] };
      const pricing = artifact.commercialTerms.find((c) => c.source === 'SELLER_POLICY');

      expect(pricing).toBeDefined();
      expect(pricing?.ruleId).toBe('questionnaire-sprint');
      expect(KESTREL.serviceLines.some((l) => l.id === pricing?.ruleId)).toBe(true);
    });

    it('computes a derived fact from a buyer claim and a seller claim through a named rule', async () => {
      const run = await runCallToProposal(scenario('discovery-to-approved-proposal'));
      const artifactRaw = run.finalState.facts['proposalArtifactJson'];
      const artifact = JSON.parse(artifactRaw as string) as { commercialTerms: Claim[] };
      const derived = artifact.commercialTerms.find((c) => c.source === 'DERIVED');

      expect(derived?.field).toBe('timelineFeasible');
      expect(derived?.value).toBe('true');
      expect(derived?.derivedFrom).toEqual(['serviceInterest', 'timing']);
      expect(derived?.ruleId).toBe('seller-catalog-duration-check');
    });

    it('leaves a non-material field genuinely unknown without blocking progress', async () => {
      const run = await runCallToProposal(scenario('discovery-to-approved-proposal'));
      expect(run.finalState.missingInformation).toContain('budgetDiscussed');
      expect(run.finalState.lifecycleState).toBe('APPROVED_SENT');
    });

    it('never lets the bounded extraction admit its own claims, select an action, or despatch anything', async () => {
      const run = await runCallToProposal(scenario('discovery-to-approved-proposal'));
      const extraction = run.decisions.find((d) => d.mechanism === 'BOUNDED_AI_JUDGMENT');

      expect(extraction).toBeDefined();
      expect(extraction?.selectedAction).toBe('return_extracted_fields');
      expect(extraction?.authority).toBeLessThanOrEqual(1);
      expect(extraction?.forbiddenActions).toContain('despatch_anything');
    });

    it('approval names the specific artifact version and despatches exactly one message', async () => {
      const run = await runCallToProposal(scenario('discovery-to-approved-proposal'));
      const sends = run.sideEffects.filter((e) => e.kind === 'MESSAGE_SEND');

      expect(sends).toHaveLength(1);
      expect(sends[0]?.status).toBe('EXECUTED');
      expect(sends[0]?.idempotencyKey).toBe('proposal:opp-bramwell:v1:despatch');

      const artifactRaw = run.finalState.facts['proposalArtifactJson'];
      const artifact = JSON.parse(artifactRaw as string) as { version: number; approval: { approvedVersion: number } };
      expect(artifact.approval.approvedVersion).toBe(artifact.version);
    });

    it('replays byte-identical', async () => {
      const s = scenario('discovery-to-approved-proposal');
      const first = await runCallToProposal(s);
      const second = await runCallToProposal(s);
      expect(JSON.stringify(second)).toBe(JSON.stringify(first));
    });
  });

  // -------------------------------------------------------------------------
  // Scenario B — unsupported scope claim blocked
  // -------------------------------------------------------------------------
  describe('unsupported scope claim blocked', () => {
    it('produces zero side effects and reaches no draft or approval state', async () => {
      const run = await runCallToProposal(scenario('unsupported-scope-claim-blocked'));

      expect(run.sideEffects).toHaveLength(0);
      const states = run.timeline.map((e) => e.stateAfter);
      expect(states).not.toContain('DRAFT_PREPARED');
      expect(states).not.toContain('AWAITING_APPROVAL');
      expect(states).not.toContain('APPROVED_SENT');
    });

    it('names the specific offending claim and reason rather than a generic rejection', async () => {
      const run = await runCallToProposal(scenario('unsupported-scope-claim-blocked'));
      const claimsReview = run.decisions.find((d) => d.id.endsWith('d-claims-review'));

      expect(claimsReview?.escalationReason).toContain('proposedScope');
      expect(claimsReview?.escalationReason).toContain('zero transcript evidence');
    });

    it('extraction confidence on the offending field does not override the missing citation', async () => {
      const fixture = CALL_TO_PROPOSAL_EXTRACTIONS['jud-cp-larkspur-extract'];
      const offending = fixture?.extracted.find((f) => f.field === 'proposedScope');
      expect(offending?.confidence).toBeGreaterThan(0.5);
      expect(offending?.evidenceRefs).toHaveLength(0);

      const run = await runCallToProposal(scenario('unsupported-scope-claim-blocked'));
      expect(run.finalState.lifecycleState).toBe('NEEDS_HUMAN');
    });

    it('replays byte-identical', async () => {
      const s = scenario('unsupported-scope-claim-blocked');
      const first = await runCallToProposal(s);
      const second = await runCallToProposal(s);
      expect(JSON.stringify(second)).toBe(JSON.stringify(first));
    });
  });

  // -------------------------------------------------------------------------
  // The claim-admission gate — direct, deterministic, executable
  // -------------------------------------------------------------------------
  describe('claim admission gate', () => {
    it('admits a transcript claim only when it cites at least one evidence reference', () => {
      expect(admitClaim({ field: 'x', value: 'v', source: 'TRANSCRIPT', evidenceRefs: [] }, KESTREL).admitted).toBe(false);
      expect(admitClaim({ field: 'x', value: 'v', source: 'TRANSCRIPT', evidenceRefs: ['seg-1'] }, KESTREL).admitted).toBe(true);
    });

    it('admits a seller-policy claim only when its rule id resolves to a service line the profile actually declares', () => {
      expect(
        admitClaim({ field: 'x', value: 'v', source: 'SELLER_POLICY', evidenceRefs: [], ruleId: 'not-a-real-service-line' }, KESTREL).admitted,
      ).toBe(false);
      expect(
        admitClaim({ field: 'x', value: 'v', source: 'SELLER_POLICY', evidenceRefs: [], ruleId: 'soc2-type1' }, KESTREL).admitted,
      ).toBe(true);
    });

    it('admits a derived claim only when it names both its input claims and the computing rule', () => {
      expect(admitClaim({ field: 'x', value: 'v', source: 'DERIVED', evidenceRefs: [] }, KESTREL).admitted).toBe(false);
      expect(
        admitClaim({ field: 'x', value: 'v', source: 'DERIVED', evidenceRefs: [], derivedFrom: ['a'], ruleId: 'r' }, KESTREL).admitted,
      ).toBe(true);
    });

    it('admits a human-supplied claim only when it names the supplying person', () => {
      expect(admitClaim({ field: 'x', value: 'v', source: 'HUMAN_SUPPLIED', evidenceRefs: [] }, KESTREL).admitted).toBe(false);
      expect(
        admitClaim({ field: 'x', value: 'v', source: 'HUMAN_SUPPLIED', evidenceRefs: [], suppliedBy: 'founder' }, KESTREL).admitted,
      ).toBe(true);
    });

    it('blocks any claim whose value states a prohibited commitment, regardless of source or citation', () => {
      const claim: Claim = { field: 'x', value: 'We guarantee you will pass the audit', source: 'TRANSCRIPT', evidenceRefs: ['seg-1'] };
      const result = admitClaim(claim, KESTREL);
      expect(result.admitted).toBe(false);
      expect(result.reason).toContain('guarantee');
      expect(result.reason).toContain('kestrel-attestation-language');
    });
  });

  // -------------------------------------------------------------------------
  // Proposal artifact versioning and approval authority — the artifact mutation test
  // -------------------------------------------------------------------------
  describe('proposal artifact versioning', () => {
    it('a stale approval does not authorise a revised artifact', () => {
      const claimA: Claim = { field: 'scope', value: 'Sprint', source: 'SELLER_POLICY', evidenceRefs: [], ruleId: 'questionnaire-sprint' };
      let artifact = createProposalArtifact('opp-test', '2026-01-01T00:00:00-04:00', [claimA], [], KESTREL);

      expect(artifact.version).toBe(1);
      expect(canDeliver(artifact)).toBe(false);

      artifact = approveProposalArtifact(artifact, 'founder', '2026-01-01T01:00:00-04:00');
      expect(canDeliver(artifact)).toBe(true);
      expect(artifact.approval?.approvedVersion).toBe(1);

      const claimB: Claim = { field: 'scope', value: 'Type II program', source: 'SELLER_POLICY', evidenceRefs: [], ruleId: 'soc2-type2' };
      artifact = reviseProposalArtifact(artifact, [claimB], [], KESTREL);

      expect(artifact.version).toBe(2);
      expect(artifact.approval?.approvedVersion).toBe(1);
      expect(canDeliver(artifact)).toBe(false);

      artifact = approveProposalArtifact(artifact, 'founder', '2026-01-01T02:00:00-04:00');
      expect(artifact.approval?.approvedVersion).toBe(2);
      expect(canDeliver(artifact)).toBe(true);
    });

    it('an artifact carrying an unsupported claim can never be delivered, even once "approved"', () => {
      const unsupported: Claim = { field: 'proposedScope', value: 'Extra scope', source: 'TRANSCRIPT', evidenceRefs: [] };
      let artifact = createProposalArtifact('opp-test-2', '2026-01-01T00:00:00-04:00', [unsupported], [], KESTREL);

      expect(artifact.claimStatus).toBe('UNSUPPORTED_CLAIM_PRESENT');
      artifact = approveProposalArtifact(artifact, 'founder', '2026-01-01T01:00:00-04:00');
      expect(artifact.approval?.approvedVersion).toBe(artifact.version);
      expect(canDeliver(artifact)).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Gap-to-clarification path (cp-t05 / cp-t07), not exercised by either named scenario
  // -------------------------------------------------------------------------
  describe('material gap routed to a person and closed by clarification', () => {
    const WINDWARD_SEGMENTS = [
      { id: 'seg-01', speaker: 'Jordan Cole (Ops Lead)', text: "We're Windward Fleet Logistics, we run about eighty delivery vehicles. Our insurance broker is asking for a SOC 2 report before renewing our software vendor coverage." },
      { id: 'seg-02', speaker: 'Marcus (Kestrel)', text: "Got it — and what's driving the timing on this?" },
      { id: 'seg-03', speaker: 'Jordan Cole (Ops Lead)', text: "Renewal is in about six weeks, so I'd like this moving well before then. I'll be running point on this from our side." },
      { id: 'seg-04', speaker: 'Marcus (Kestrel)', text: "Understood. Given where you're starting, I'd scope the SOC 2 Type I readiness engagement first." },
      { id: 'seg-05', speaker: 'Marcus (Kestrel)', text: "I've actually got to jump to another call in two minutes — let's pick up next steps when I follow up." },
    ];

    const WINDWARD_EXTRACTION: ExtractionResult = {
      judgmentId: 'jud-cp-windward-test',
      extracted: [
        { field: 'buyerCompanyName', value: 'Windward Fleet Logistics', evidenceRefs: ['seg-01'], confidence: 0.96 },
        { field: 'primaryContact', value: 'Jordan Cole — Ops Lead', evidenceRefs: ['seg-01'], confidence: 0.93 },
        { field: 'currentSituation', value: 'An insurance broker requires a SOC 2 report before renewing software vendor coverage.', evidenceRefs: ['seg-01'], confidence: 0.92 },
        { field: 'desiredOutcome', value: "Satisfy the broker's SOC 2 requirement before the insurance renewal.", evidenceRefs: ['seg-01', 'seg-03'], confidence: 0.9 },
        { field: 'timing', value: '6 weeks', evidenceRefs: ['seg-03'], confidence: 0.88 },
        { field: 'serviceInterest', value: 'soc2-type1', evidenceRefs: ['seg-04'], confidence: 0.85 },
        { field: 'nextStepOwner', value: 'Jordan Cole', evidenceRefs: ['seg-03'], confidence: 0.9 },
      ],
      missingFields: ['agreedNextStep', 'budgetDiscussed'],
      declinedToInfer: ['Next step — the call ended before one was confirmed; not invented.'],
      overallConfidence: 0.89,
      rationaleSummary: 'Every material field is established except the agreed next step, which the call genuinely did not reach.',
    };

    function windwardScenario(events: CanonicalEvent[]) {
      return ScenarioSchema.parse({
        id: 'cp-scenario-windward-test',
        slug: 'windward-test',
        systemId: 'call-to-proposal',
        title: 'Material gap test',
        summary: 'A call missing exactly one material field, closed by a human clarification.',
        demonstrates: ['material gap routing', 'human-supplied fact provenance'],
        events,
        judgments: {},
        expectedFinalState: 'AWAITING_CLARIFICATION',
      });
    }

    async function runWindward(events: CanonicalEvent[]) {
      return runScenario(windwardScenario(events), {
        system: CALL_TO_PROPOSAL,
        profile: KESTREL,
        handlers: CALL_TO_PROPOSAL_HANDLERS,
        provider: new FixtureDecisionProvider({}),
        extractionProvider: new FixtureExtractionProvider({
          ...CALL_TO_PROPOSAL_EXTRACTIONS,
          [WINDWARD_EXTRACTION.judgmentId]: WINDWARD_EXTRACTION,
        }),
      });
    }

    const transcriptEvent: CanonicalEvent = {
      eventId: 'evt-cp-windward-001',
      correlationId: 'inc-cp-windward',
      entityId: 'opp-windward',
      type: 'sales.call.transcript.received',
      source: 'call-recording-system',
      sourceEventId: 'call-2026-08-13-windward',
      occurredAt: '2026-08-13T10:00:00-04:00',
      receivedAt: '2026-08-13T10:05:00-04:00',
      schemaVersion: '2026-08-01',
      actor: 'SYSTEM',
      executionMode: 'SIMULATED',
      payload: {
        extraction: {
          judgmentId: 'jud-cp-windward-test',
          objective: 'Map the discovery call transcript onto the structured commercial record.',
          sourceArtifactId: 'transcript-windward-2026-08-13',
          segments: WINDWARD_SEGMENTS,
          requiredFields: [...CP_REQUIRED_FIELDS],
        },
      },
    };

    it('routes to AWAITING_CLARIFICATION naming exactly the one missing material field', async () => {
      const run = await runWindward([transcriptEvent]);
      expect(run.finalState.lifecycleState).toBe('AWAITING_CLARIFICATION');

      const gapRouting = run.decisions.find((d) => d.id.endsWith('d-gap-routing'));
      expect(gapRouting?.missingInformation).toEqual(['agreedNextStep']);
    });

    it('records the clarification as human-supplied, distinct from transcript-derived facts, and proceeds to approval routing', async () => {
      const clarification: CanonicalEvent = {
        eventId: 'evt-cp-windward-002',
        correlationId: 'inc-cp-windward',
        entityId: 'opp-windward',
        type: 'human.clarification.supplied',
        source: 'operator-console',
        sourceEventId: 'console-2026-08-13-1100',
        occurredAt: '2026-08-13T11:00:00-04:00',
        receivedAt: '2026-08-13T11:00:00-04:00',
        schemaVersion: '2026-08-01',
        actor: 'HUMAN',
        executionMode: 'SIMULATED',
        payload: {
          suppliedBy: 'client-partner',
          field: 'agreedNextStep',
          value: 'Kestrel to send a proposal for the readiness assessment once Marcus follows up.',
        },
      };

      const run = await runWindward([transcriptEvent, clarification]);
      expect(run.finalState.lifecycleState).toBe('AWAITING_APPROVAL');

      const claims = claimsFrom(run.finalState.facts);
      const supplied = claims.find((c) => c.field === 'agreedNextStep');
      expect(supplied?.source).toBe('HUMAN_SUPPLIED');
      expect(supplied?.suppliedBy).toBe('client-partner');
      expect(supplied?.evidenceRefs).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // Reliability and payload-validation guarantees
  // -------------------------------------------------------------------------
  describe('reliability and payload validation', () => {
    it('rejects a malformed transcript payload without computing a record or attempting extraction', async () => {
      const malformed = ScenarioSchema.parse({
        id: 'cp-scenario-malformed-test',
        slug: 'malformed-test',
        systemId: 'call-to-proposal',
        title: 'Malformed transcript payload test',
        summary: 'A transcript-received event missing the required extraction payload.',
        demonstrates: ['malformed payload safety'],
        events: [
          {
            eventId: 'evt-cp-malformed-001',
            correlationId: 'inc-cp-malformed',
            entityId: 'opp-malformed',
            type: 'sales.call.transcript.received',
            source: 'call-recording-system',
            sourceEventId: 'call-2026-08-14-malformed',
            occurredAt: '2026-08-14T10:00:00-04:00',
            receivedAt: '2026-08-14T10:00:00-04:00',
            schemaVersion: '2026-08-01',
            actor: 'SYSTEM',
            executionMode: 'SIMULATED',
            payload: { note: 'no extraction field at all' },
          },
        ],
        judgments: {},
        expectedFinalState: 'TRANSCRIPT_RECEIVED',
      });

      const run = await runCallToProposal(malformed);
      expect(run.finalState.lifecycleState).toBe('TRANSCRIPT_RECEIVED');
      expect(run.sideEffects).toHaveLength(0);
      expect(run.transitions).toHaveLength(0);
    });

    it('routes to NEEDS_HUMAN when the extraction is unavailable rather than proceeding without a record', async () => {
      const noExtraction = ScenarioSchema.parse({
        id: 'cp-scenario-no-extraction-test',
        slug: 'no-extraction-test',
        systemId: 'call-to-proposal',
        title: 'Unavailable extraction test',
        summary: 'A transcript event whose extraction judgment has no authored fixture.',
        demonstrates: ['unavailable extraction routes to a person'],
        events: [
          {
            eventId: 'evt-cp-noext-001',
            correlationId: 'inc-cp-noext',
            entityId: 'opp-noext',
            type: 'sales.call.transcript.received',
            source: 'call-recording-system',
            sourceEventId: 'call-2026-08-15-noext',
            occurredAt: '2026-08-15T10:00:00-04:00',
            receivedAt: '2026-08-15T10:00:00-04:00',
            schemaVersion: '2026-08-01',
            actor: 'SYSTEM',
            executionMode: 'SIMULATED',
            payload: {
              extraction: {
                judgmentId: 'jud-cp-unauthored',
                objective: 'Map the transcript onto the record.',
                sourceArtifactId: 'transcript-noext',
                segments: [
                  { id: 'seg-01', speaker: 'Buyer', text: 'Hello.' },
                  { id: 'seg-02', speaker: 'Seller', text: 'Hi there.' },
                  { id: 'seg-03', speaker: 'Buyer', text: 'We need a report.' },
                ],
                requiredFields: [...CP_REQUIRED_FIELDS],
              },
            },
          },
        ],
        judgments: {},
        expectedFinalState: 'NEEDS_HUMAN',
      });

      const run = await runScenario(noExtraction, {
        system: CALL_TO_PROPOSAL,
        profile: KESTREL,
        handlers: CALL_TO_PROPOSAL_HANDLERS,
        provider: new FixtureDecisionProvider({}),
        extractionProvider: new FixtureExtractionProvider({}),
      });

      expect(run.finalState.lifecycleState).toBe('NEEDS_HUMAN');
      expect(run.sideEffects).toHaveLength(0);
    });

    it('strips an unrecognised payload field rather than letting it silently become trusted state', async () => {
      const base = scenario('discovery-to-approved-proposal');
      const firstEvent = base.events[0];
      if (firstEvent === undefined) throw new Error('expected a first event');

      const withExtraField = ScenarioSchema.parse({
        id: 'cp-scenario-unknown-field-test',
        slug: 'unknown-field-test',
        systemId: 'call-to-proposal',
        title: 'Unknown payload field test',
        summary: 'A transcript payload carrying a field the handler does not declare.',
        demonstrates: ['payload-schema watchpoint: unknown fields do not become trusted state'],
        events: [
          {
            ...firstEvent,
            payload: {
              ...firstEvent.payload,
              internalSalesNote: 'do-not-share-with-buyer-secret-margin-note',
            },
          },
        ],
        judgments: {},
        expectedFinalState: 'AWAITING_APPROVAL',
      });

      const run = await runCallToProposal(withExtraField);
      expect(run.finalState.lifecycleState).toBe('AWAITING_APPROVAL');
      const computed = JSON.stringify({
        facts: run.finalState.facts,
        decisions: run.decisions,
        sideEffects: run.sideEffects,
      });
      expect(computed).not.toContain('do-not-share-with-buyer-secret-margin-note');
    });

    it('redelivering the approval event after despatch produces zero additional external sends', async () => {
      const base = scenario('discovery-to-approved-proposal');
      const secondEvent = base.events[1];
      if (secondEvent === undefined) throw new Error('expected a second event');

      const redelivered: CanonicalEvent = {
        ...secondEvent,
        eventId: 'evt-cp-bramwell-002-redelivered',
        receivedAt: '2026-08-11T09:05:00-04:00',
      };

      const extended = ScenarioSchema.parse({
        ...base,
        id: 'cp-scenario-approved-redelivery-test',
        slug: 'approved-redelivery-test',
        events: [...base.events, redelivered],
      });

      const run = await runCallToProposal(extended);

      const despatches = run.sideEffects.filter((e) => e.idempotencyKey === 'proposal:opp-bramwell:v1:despatch');
      expect(despatches).toHaveLength(2);
      expect(despatches.filter((e) => e.status === 'EXECUTED')).toHaveLength(1);
      expect(despatches.filter((e) => e.status === 'SUPPRESSED_DUPLICATE')).toHaveLength(1);

      // The redelivered decision requests the same target the record already holds, so the
      // core treats it as a no-op rather than an illegal move — no second external effect
      // occurs either way, which is the guarantee that actually matters here.
      expect(run.finalState.lifecycleState).toBe('APPROVED_SENT');
    });

    it('a terminal disposition cannot be moved again by a contradictory later decision', async () => {
      const base = scenario('discovery-to-approved-proposal');
      const laterRejection: CanonicalEvent = {
        eventId: 'evt-cp-bramwell-003',
        correlationId: 'inc-cp-bramwell',
        entityId: 'opp-bramwell',
        type: 'human.decision.recorded',
        source: 'operator-console',
        sourceEventId: 'console-2026-08-12-0900',
        occurredAt: '2026-08-12T09:00:00-04:00',
        receivedAt: '2026-08-12T09:00:00-04:00',
        schemaVersion: '2026-08-01',
        actor: 'HUMAN',
        executionMode: 'SIMULATED',
        payload: {
          decidedBy: 'client-partner',
          decision: 'REJECT',
          rationale: 'Attempting to reject a proposal that was already approved and despatched.',
        },
      };

      const extended = ScenarioSchema.parse({
        ...base,
        id: 'cp-scenario-approved-contradiction-test',
        slug: 'approved-contradiction-test',
        events: [...base.events, laterRejection],
      });

      const run = await runCallToProposal(extended);

      const rejected = run.transitions.filter((t) => !t.accepted);
      expect(rejected.some((t) => t.from === 'APPROVED_SENT' && t.to === 'REJECTED')).toBe(true);
      expect(run.finalState.lifecycleState).toBe('APPROVED_SENT');
    });
  });
});
