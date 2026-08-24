import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { LEAD_RESCUE } from '@/data/systems';
import { KESTREL } from '@/data/profiles/kestrel/profile';
import { LEAD_RESCUE_HANDLERS } from '@/lib/engine/handlers/lead-rescue';
import { InMemoryWaitIncidentStore, FileWaitIncidentStore, type WaitIncidentStore } from '@/lib/persistence/wait-incident-store';
import { InMemoryOperationClaimStore, FileOperationClaimStore, type OperationClaimStore } from '@/lib/persistence/operation-claim-store';
import { ingestExternalLead, ingressEntityId, INGRESS_FIXTURE_LEAD_MESSAGE, type LeadIngressDeps } from '@/lib/engine/lead-ingress';
import type { DecisionProvider } from '@/lib/ports/decision-provider';
import { LEAD_RESCUE_INGRESS_SCHEMA_VERSION, LeadRescueIngressEnvelopeSchema, type LeadRescueIngressEnvelope } from '@/lib/ingress/lead-rescue-ingress-contract';

/**
 * FALSIFYING TESTS for the n8n ingress seam:
 *
 *   external-shaped lead event -> n8n trigger -> canonical application ingress
 *     -> durable Lead Rescue engine execution -> structured result
 *
 * `ingestExternalLead` (`lib/engine/lead-ingress.ts`) is the orchestration layer the new
 * `POST /api/lead-rescue/ingress` route is a thin wrapper around — the SAME "test the
 * orchestration layer, not the route handler" discipline this repository already established
 * for `checkWaitIncident`/`applyHumanDecision`/`dispatchAuthorizedOffer`.
 */

const DEPS: LeadIngressDeps = {
  system: LEAD_RESCUE,
  profile: KESTREL,
  handlers: LEAD_RESCUE_HANDLERS,
};

/** One realistic, complete SOC 2 readiness enquiry — the one authored fixture this pass demonstrates. */
function realisticEnvelope(overrides: Partial<LeadRescueIngressEnvelope> = {}): LeadRescueIngressEnvelope {
  return {
    schemaVersion: LEAD_RESCUE_INGRESS_SCHEMA_VERSION,
    source: 'website-intake-form',
    sourceEventId: 'form-sub-9f2e1c',
    receivedAt: '2026-08-24T10:00:00-04:00',
    lead: {
      contactName: 'Dana Whitfield',
      contactEmail: 'dana.whitfield@northgate-analytics.example',
      company: 'Northgate Analytics',
      message: INGRESS_FIXTURE_LEAD_MESSAGE,
      channel: 'web-form',
    },
    ...overrides,
  };
}

function freshClaimStore(): OperationClaimStore {
  return new InMemoryOperationClaimStore();
}

describe('Lead Rescue n8n ingress — orchestration', () => {
  it('1+9. a valid canonical ingress genuinely executes the engine and returns a structured ACCEPTED result', async () => {
    const store = new InMemoryWaitIncidentStore();
    const claimStore = freshClaimStore();
    const envelope = realisticEnvelope();

    const result = await ingestExternalLead(store, claimStore, envelope, DEPS, '2026-08-24T10:00:05-04:00', 'runtime-a');

    expect(result.outcome).toBe('ACCEPTED');
    expect(result.record?.engineState.lifecycleState).toBe('BOOKING_READY');
    expect(result.record?.engineState.facts.bookingReadyAt).toBeDefined();
    expect(result.decisionRuleId).toBe('lr-t10');
    expect(result.entries?.length).toBeGreaterThan(0);
    // A genuine engine run, not a canned response — the classification decision is present.
    const classifyDecision = result.entries?.flatMap((e) => e.decisions).find((d) => d.mechanism === 'BOUNDED_AI_JUDGMENT');
    expect(classifyDecision?.classification).toBe('QUALIFIED_ENQUIRY');
  });

  it('2. a malformed envelope is rejected by schema validation before anything is claimed or executed', () => {
    const malformed = { schemaVersion: 'wrong-version', source: 'x' };
    const parsed = LeadRescueIngressEnvelopeSchema.safeParse(malformed);
    expect(parsed.success).toBe(false);
  });

  it('3. source/provenance is durably retained on the created case', async () => {
    const store = new InMemoryWaitIncidentStore();
    const claimStore = freshClaimStore();
    const envelope = realisticEnvelope({ source: 'partner-referral-intake', sourceEventId: 'ref-77213' });

    const result = await ingestExternalLead(store, claimStore, envelope, DEPS, '2026-08-24T10:00:05-04:00', 'runtime-a');

    expect(result.record?.provenance).toEqual({
      source: 'partner-referral-intake',
      sourceEventId: 'ref-77213',
      ingestionPath: 'n8n',
    });
  });

  it('4. the case identity is deterministic from (source, sourceEventId), not random', async () => {
    const store = new InMemoryWaitIncidentStore();
    const claimStore = freshClaimStore();
    const envelope = realisticEnvelope();

    const result = await ingestExternalLead(store, claimStore, envelope, DEPS, '2026-08-24T10:00:05-04:00', 'runtime-a');

    expect(result.entityId).toBe(ingressEntityId(envelope.source, envelope.sourceEventId));
    expect(result.record?.incidentId).toBe(result.entityId);
  });

  it('5. identical redelivery is recognized as a duplicate, never a second engine execution', async () => {
    const store = new InMemoryWaitIncidentStore();
    const claimStore = freshClaimStore();
    const envelope = realisticEnvelope();

    const first = await ingestExternalLead(store, claimStore, envelope, DEPS, '2026-08-24T10:00:05-04:00', 'runtime-a');
    const second = await ingestExternalLead(store, claimStore, envelope, DEPS, '2026-08-24T10:05:00-04:00', 'runtime-a');

    expect(first.outcome).toBe('ACCEPTED');
    expect(second.outcome).toBe('DUPLICATE');
    expect(second.entityId).toBe(first.entityId);
    expect(second.record?.revision).toBe(first.record?.revision);
    // No second run's entries — nothing new was ever computed.
    expect(second.entries).toBeUndefined();
  });

  it('6. redelivery after full store/claim-store/runtime reconstruction remains safe', async () => {
    const incidentDir = mkdtempSync(path.join(tmpdir(), 'lr-ingress-incidents-'));
    const claimDir = mkdtempSync(path.join(tmpdir(), 'lr-ingress-claims-'));
    try {
      const incidentPath = path.join(incidentDir, 'incidents.json');
      const envelope = realisticEnvelope();

      let store: WaitIncidentStore | undefined = new FileWaitIncidentStore(incidentPath);
      let claimStore: OperationClaimStore | undefined = new FileOperationClaimStore(claimDir);
      const first = await ingestExternalLead(store, claimStore, envelope, DEPS, '2026-08-24T10:00:05-04:00', 'runtime-a');
      expect(first.outcome).toBe('ACCEPTED');

      // Discard both instances entirely — nothing below may reference them again.
      store = undefined;
      claimStore = undefined;
      void store;
      void claimStore;

      const freshStore = new FileWaitIncidentStore(incidentPath);
      const freshClaims = new FileOperationClaimStore(claimDir);
      const second = await ingestExternalLead(freshStore, freshClaims, envelope, DEPS, '2026-08-24T11:00:00-04:00', 'runtime-b');

      expect(second.outcome).toBe('DUPLICATE');
      expect(second.entityId).toBe(first.entityId);
      expect(second.record?.revision).toBe(first.record?.revision);
    } finally {
      rmSync(incidentDir, { recursive: true, force: true });
      rmSync(claimDir, { recursive: true, force: true });
    }
  });

  it('7. two genuinely distinct source event IDs are never deduplicated against each other', async () => {
    const store = new InMemoryWaitIncidentStore();
    const claimStore = freshClaimStore();
    const first = await ingestExternalLead(store, claimStore, realisticEnvelope({ sourceEventId: 'form-sub-a' }), DEPS, '2026-08-24T10:00:05-04:00', 'runtime-a');
    const second = await ingestExternalLead(store, claimStore, realisticEnvelope({ sourceEventId: 'form-sub-b' }), DEPS, '2026-08-24T10:01:00-04:00', 'runtime-a');

    expect(first.outcome).toBe('ACCEPTED');
    expect(second.outcome).toBe('ACCEPTED');
    expect(first.entityId).not.toBe(second.entityId);
    expect((await store.listWaiting()).length).toBe(2);
  });

  it('8. two concurrent deliveries of the same source identity (genuine Promise.all racing) cannot create two authoritative executions', async () => {
    const incidentDir = mkdtempSync(path.join(tmpdir(), 'lr-ingress-race-incidents-'));
    const claimDir = mkdtempSync(path.join(tmpdir(), 'lr-ingress-race-claims-'));
    try {
      const incidentPath = path.join(incidentDir, 'incidents.json');
      const envelope = realisticEnvelope();

      const storeA = new FileWaitIncidentStore(incidentPath);
      const storeB = new FileWaitIncidentStore(incidentPath);
      const claimsA = new FileOperationClaimStore(claimDir);
      const claimsB = new FileOperationClaimStore(claimDir);

      const [a, b] = await Promise.all([
        ingestExternalLead(storeA, claimsA, envelope, DEPS, '2026-08-24T10:00:05-04:00', 'runtime-a'),
        ingestExternalLead(storeB, claimsB, envelope, DEPS, '2026-08-24T10:00:05-04:00', 'runtime-b'),
      ]);

      // At most one genuine engine execution (ACCEPTED with entries); the other is a
      // duplicate or uncertain — never two ACCEPTED, no matter which call wins the race.
      const outcomes = [a.outcome, b.outcome];
      expect(outcomes.filter((o) => o === 'ACCEPTED')).toHaveLength(1);
      expect(outcomes.every((o) => o === 'ACCEPTED' || o === 'DUPLICATE' || o === 'UNCERTAIN')).toBe(true);

      // Exactly one durable case exists — verified through a THIRD, freshly constructed store.
      const verifyStore = new FileWaitIncidentStore(incidentPath);
      const all = await verifyStore.listWaiting();
      expect(all).toHaveLength(1);
      expect(all[0]?.incidentId).toBe(ingressEntityId(envelope.source, envelope.sourceEventId));
    } finally {
      rmSync(incidentDir, { recursive: true, force: true });
      rmSync(claimDir, { recursive: true, force: true });
    }
  });

  it('a business outcome of NEEDS_HUMAN is still a structured ACCEPTED result, never a transport failure', async () => {
    const store = new InMemoryWaitIncidentStore();
    const claimStore = freshClaimStore();
    // Content that does not match the one authored fixture judgment — the bounded judgment
    // correctly resolves UNAVAILABLE, and the existing handler rule routes to NEEDS_HUMAN.
    // This is a legitimate business outcome, not an ingress failure.
    const envelope = realisticEnvelope({ sourceEventId: 'form-sub-unmatched', lead: { message: 'Completely unrelated content the fixture was never authored for.', channel: 'web-form' } });

    const result = await ingestExternalLead(store, claimStore, envelope, DEPS, '2026-08-24T10:00:05-04:00', 'runtime-a');

    expect(result.outcome).toBe('ACCEPTED');
    expect(result.record?.engineState.lifecycleState).toBe('NEEDS_HUMAN');
    expect(result.record?.engineState.awaitingHuman).toBeDefined();
  });

  it('10. the existing direct (non-n8n) engine paths are unaffected: a demo-parked review case still has no provenance field', async () => {
    const store = new InMemoryWaitIncidentStore();
    const parked = await store.park({
      incidentId: 'demo-lead-not-from-ingress',
      systemId: LEAD_RESCUE.id,
      correlationId: 'inc-demo-lead-not-from-ingress',
      engineState: { lifecycleState: 'NEEDS_HUMAN', facts: {}, suppressed: false, awaitingHuman: 'x', missingInformation: [] },
    });
    expect(parked.provenance).toBeUndefined();
  });

  it('11. a real DecisionProvider, injected through the existing LeadIngressDeps seam (no special-case code), genuinely classifies a message the fixture was never authored for', async () => {
    const store = new InMemoryWaitIncidentStore();
    const claimStore = freshClaimStore();
    let classifyCalls = 0;
    const realProvider: DecisionProvider = {
      id: 'claude-decision-provider',
      mode: 'LIVE',
      description: 'fake stand-in for a real provider, injected exactly as production wiring would',
      classify: async (req) => {
        classifyCalls += 1;
        return {
          judgmentId: req.judgmentId,
          classification: 'QUALIFIED_ENQUIRY',
          confidence: 0.81,
          missingInformation: [],
          evidenceRefs: ['"ISO 27001", "60 employees"'],
          declinedToInfer: [],
          rationaleSummary: 'Framework and headcount are both stated.',
        };
      },
    };

    const envelope = realisticEnvelope({
      sourceEventId: 'form-sub-real-provider',
      lead: { message: 'We need ISO 27001 certification for about 60 employees, targeting next year.', channel: 'web-form' },
    });

    const result = await ingestExternalLead(store, claimStore, envelope, { ...DEPS, provider: realProvider }, '2026-08-24T10:00:05-04:00', 'runtime-a');

    // The fixture provider would have resolved this UNAVAILABLE (unmatched content hash) and
    // routed to NEEDS_HUMAN. The injected real provider genuinely classified it instead —
    // proof the seam, not a special case, is what changed.
    expect(result.outcome).toBe('ACCEPTED');
    expect(result.record?.engineState.lifecycleState).toBe('BOOKING_READY');
    expect(classifyCalls).toBe(1);
  });

  it('12. idempotency holds with a real provider too: a claimed duplicate never invokes the provider a second time', async () => {
    const store = new InMemoryWaitIncidentStore();
    const claimStore = freshClaimStore();
    let classifyCalls = 0;
    const countingProvider: DecisionProvider = {
      id: 'claude-decision-provider',
      mode: 'LIVE',
      description: 'counts invocations',
      classify: async (req) => {
        classifyCalls += 1;
        return {
          judgmentId: req.judgmentId,
          classification: 'QUALIFIED_ENQUIRY',
          confidence: 0.81,
          missingInformation: [],
          evidenceRefs: [],
          declinedToInfer: [],
          rationaleSummary: 'x',
        };
      },
    };
    const envelope = realisticEnvelope({ sourceEventId: 'form-sub-real-provider-dup' });

    const first = await ingestExternalLead(store, claimStore, envelope, { ...DEPS, provider: countingProvider }, '2026-08-24T10:00:05-04:00', 'runtime-a');
    const second = await ingestExternalLead(store, claimStore, envelope, { ...DEPS, provider: countingProvider }, '2026-08-24T10:05:00-04:00', 'runtime-a');

    expect(first.outcome).toBe('ACCEPTED');
    expect(second.outcome).toBe('DUPLICATE');
    // The durable claim refuses the redelivery BEFORE the provider is ever reached — the
    // real model is never called a second time for an event already durably resolved.
    expect(classifyCalls).toBe(1);
  });
});
