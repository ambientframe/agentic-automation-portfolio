import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { LEAD_RESCUE } from '@/data/systems';
import { KESTREL } from '@/data/profiles/kestrel/profile';
import { LEAD_RESCUE_HANDLERS } from '@/lib/engine/handlers/lead-rescue';
import { leadRescueScenarioBySlug } from '@/data/profiles/kestrel/scenarios/lead-rescue';
import { runScenario } from '@/lib/engine/run';
import { FixtureDecisionProvider } from '@/lib/ports/decision-provider';
import {
  FileWaitIncidentStore,
  InMemoryWaitIncidentStore,
  type WaitIncidentRecord,
  type WaitIncidentStore,
} from '@/lib/persistence/wait-incident-store';
import { FileOperationClaimStore, InMemoryOperationClaimStore } from '@/lib/persistence/operation-claim-store';
import {
  applyHumanDecision,
  checkWaitIncident,
  dispatchAuthorizedOffer,
  type WaitResumeDeps,
} from '@/lib/engine/wait-resume';
import type { CanonicalEvent, ExecutionMode, SendOutcome, VerifyOutcome, Scenario } from '@/lib/model/runtime';
import type { SendRequest, VerifyRequest, SideEffectExecutor } from '@/lib/ports/side-effect-executor';

/**
 * FALSIFYING TESTS for the interactive reviewed-offer operator journey:
 *
 *   NEEDS_HUMAN -> (human.decision.recorded, lr-t24) -> BOOKING_READY
 *     -> (lead.offer.despatched, claim-gated) -> durable offer wait -> lr-t22 escalation
 *
 * `applyHumanDecision` and `dispatchAuthorizedOffer` (`lib/engine/wait-resume.ts`) are the
 * orchestration layer the new `/decide` and `/dispatch` API routes are thin wrappers around —
 * exactly the same split this portfolio already uses for `/check` and `checkWaitIncident`, so
 * these tests exercise the orchestration functions directly, the same way
 * `tests/lead-rescue-offer-wait-resume.test.ts` exercises `checkWaitIncident` directly rather
 * than through HTTP.
 */

const DEPS: WaitResumeDeps = {
  system: LEAD_RESCUE,
  profile: KESTREL,
  handlers: LEAD_RESCUE_HANDLERS,
  reevaluationEventType: 'lead.wait.reevaluated',
};

const FOUND_SCENARIO = leadRescueScenarioBySlug('reviewed-offer-elapses');
if (FOUND_SCENARIO === undefined) throw new Error('fixture scenario "reviewed-offer-elapses" not found');
const FULL_SCENARIO: Scenario = FOUND_SCENARIO;

function hoursAfter(iso: string, hours: number): string {
  return new Date(Date.parse(iso) + hours * 60 * 60 * 1000).toISOString();
}

/** Runs ONLY the enquiry event — reaches NEEDS_HUMAN with zero autonomous action (lr-t11). */
async function runReviewEnquiry(incidentId: string) {
  const enquiryEvent = FULL_SCENARIO.events[0];
  if (enquiryEvent === undefined) throw new Error('fixture scenario has no events');
  const enquiryOnly: Scenario = {
    ...FULL_SCENARIO,
    events: [{ ...enquiryEvent, entityId: incidentId, eventId: `${incidentId}:evt-001` }],
  };
  return runScenario(enquiryOnly, {
    system: LEAD_RESCUE,
    profile: KESTREL,
    handlers: LEAD_RESCUE_HANDLERS,
    provider: new FixtureDecisionProvider(enquiryOnly.judgments),
  });
}

/** Parks a review-stage case directly (not through `parkWaitingIncident` — not genuinely waiting). */
async function parkReviewCase(store: WaitIncidentStore, incidentId: string): Promise<WaitIncidentRecord> {
  const run = await runReviewEnquiry(incidentId);
  expect(run.finalState.lifecycleState).toBe('NEEDS_HUMAN');
  return store.park({
    incidentId,
    systemId: LEAD_RESCUE.id,
    correlationId: `inc-${incidentId}`,
    engineState: { ...run.finalState, missingInformation: [...run.finalState.missingInformation] },
  });
}

function decisionEvent(incidentId: string, overrides: Partial<Record<string, unknown>> = {}): CanonicalEvent {
  return {
    eventId: `${incidentId}:decide-001`,
    correlationId: `inc-${incidentId}`,
    entityId: incidentId,
    type: 'human.decision.recorded',
    source: 'operator-console',
    sourceEventId: `decide:${incidentId}`,
    occurredAt: '2026-08-06T09:00:00-04:00',
    receivedAt: '2026-08-06T09:00:00-04:00',
    schemaVersion: 'wait-resume-1',
    actor: 'HUMAN',
    executionMode: 'SIMULATED',
    payload: {
      decidedBy: 'client-partner',
      decision: 'CLEARED_TO_PROCEED',
      rationale: 'Legal question resolved out of band. Clearing to proceed.',
      ...overrides,
    },
  };
}

function despatchEvent(incidentId: string, occurredAt: string, overrides: Partial<Record<string, unknown>> = {}): CanonicalEvent {
  return {
    eventId: `${incidentId}:despatch-001`,
    correlationId: `inc-${incidentId}`,
    entityId: incidentId,
    type: 'lead.offer.despatched',
    source: 'operator-console',
    sourceEventId: `despatch:${incidentId}`,
    occurredAt,
    receivedAt: occurredAt,
    schemaVersion: 'wait-resume-1',
    actor: 'HUMAN',
    executionMode: 'SIMULATED',
    payload: {
      decidedBy: 'client-partner',
      target: 'p.deshmukh@fenwickactuarial.example',
      offerSummary: 'Offered a 30-minute scoping call for next Wednesday 10:00 or Thursday 14:00.',
      ...overrides,
    },
  };
}

class RecordingExecutor implements SideEffectExecutor {
  readonly mode: ExecutionMode = 'SIMULATED';
  readonly description = 'Test-only observable sink for the reviewed-offer dispatch proofs.';
  readonly invocations: SendRequest[] = [];

  constructor(
    readonly id: string,
    private readonly outcome: () => Promise<SendOutcome> | SendOutcome,
  ) {}

  async attemptSend(request: SendRequest): Promise<SendOutcome> {
    this.invocations.push(request);
    return this.outcome();
  }

  async attemptVerify(request: VerifyRequest): Promise<VerifyOutcome> {
    void request;
    throw new Error('RecordingExecutor.attemptVerify is not exercised by these tests');
  }
}

const ALWAYS_SUCCEEDS = (): SendOutcome => ({ kind: 'SUCCEEDED' });
const ALWAYS_UNKNOWN = (): SendOutcome => ({ kind: 'OUTCOME_UNKNOWN', reason: 'simulated crash mid-send' });

describe('Reviewed-offer operator journey — human decision', () => {
  it('1. a case reaches a legitimate canonical NEEDS_HUMAN state (lr-t11) with zero autonomous action', async () => {
    const store = new InMemoryWaitIncidentStore();
    const parked = await parkReviewCase(store, 'lead-review-1');
    expect(parked.engineState.lifecycleState).toBe('NEEDS_HUMAN');
    expect(parked.engineState.facts.bookingReadyAt).toBeUndefined();
    expect(parked.engineState.facts.offerSentAt).toBeUndefined();
  });

  it('2. the parked record exposes the escalation reason and missing information — the evidence a review screen needs', async () => {
    const store = new InMemoryWaitIncidentStore();
    const parked = await parkReviewCase(store, 'lead-review-2');
    expect(parked.engineState.awaitingHuman).toBeTruthy();
    expect(typeof parked.engineState.awaitingHuman).toBe('string');
    // Policy-sensitive: two fields genuinely remain unresolved, carried forward rather than guessed.
    expect(parked.engineState.missingInformation.length).toBeGreaterThan(0);
  });

  it('3. an authorized decision (sufficient authority) transitions to BOOKING_READY through the real lr-t24 transition', async () => {
    const store = new InMemoryWaitIncidentStore();
    const parked = await parkReviewCase(store, 'lead-review-3');

    const result = await applyHumanDecision(store, 'lead-review-3', parked.revision, decisionEvent('lead-review-3'), DEPS);

    expect(result.outcome).toBe('ACCEPTED');
    expect(result.record?.engineState.lifecycleState).toBe('BOOKING_READY');
    expect(result.record?.engineState.facts.bookingReadyAt).toBeDefined();
    expect(result.record?.engineState.facts.offerSentAt).toBeUndefined();
    expect(result.record?.revision).toBeGreaterThan(parked.revision);

    const transition = result.entries?.flatMap((e) => e.transitions).find((t) => t.accepted);
    expect(transition?.ruleId).toBe('lr-t24');
    expect(transition?.from).toBe('NEEDS_HUMAN');
    expect(transition?.to).toBe('BOOKING_READY');
  });

  it('4a. insufficient authority is rejected safely: no re-park, original record untouched', async () => {
    const store = new InMemoryWaitIncidentStore();
    const parked = await parkReviewCase(store, 'lead-review-4a');

    const result = await applyHumanDecision(
      store,
      'lead-review-4a',
      parked.revision,
      decisionEvent('lead-review-4a', { decidedBy: 'analyst' }),
      DEPS,
    );

    expect(result.outcome).toBe('UNAUTHORIZED');
    const stillParked = await store.load('lead-review-4a');
    expect(stillParked).toEqual(parked);
  });

  it('4b. a malformed decision payload is rejected safely: no transition, no re-park', async () => {
    const store = new InMemoryWaitIncidentStore();
    const parked = await parkReviewCase(store, 'lead-review-4b');

    const malformed = decisionEvent('lead-review-4b');
    delete (malformed.payload as Record<string, unknown>)['rationale'];

    const result = await applyHumanDecision(store, 'lead-review-4b', parked.revision, malformed, DEPS);

    expect(result.outcome).toBe('REJECTED');
    const stillParked = await store.load('lead-review-4b');
    expect(stillParked).toEqual(parked);
  });

  it('4c. a stale (duplicate/out-of-order) decision resubmission with an outdated revision is rejected', async () => {
    const store = new InMemoryWaitIncidentStore();
    const parked = await parkReviewCase(store, 'lead-review-4c');

    const first = await applyHumanDecision(store, 'lead-review-4c', parked.revision, decisionEvent('lead-review-4c'), DEPS);
    expect(first.outcome).toBe('ACCEPTED');

    // Resubmitted against the OLD (pre-decision) revision — a duplicate/out-of-order attempt.
    const stale = await applyHumanDecision(store, 'lead-review-4c', parked.revision, decisionEvent('lead-review-4c'), DEPS);
    expect(stale.outcome).toBe('STALE_REVISION');

    const current = await store.load('lead-review-4c');
    expect(current?.revision).toBe(first.record?.revision);
  });

  it('4d. a decision resubmitted with the CURRENT revision against an already-cleared (no-longer-under-review) case is rejected', async () => {
    const store = new InMemoryWaitIncidentStore();
    const parked = await parkReviewCase(store, 'lead-review-4d');

    const first = await applyHumanDecision(store, 'lead-review-4d', parked.revision, decisionEvent('lead-review-4d'), DEPS);
    expect(first.outcome).toBe('ACCEPTED');
    const currentRevision = first.record?.revision;
    if (currentRevision === undefined) throw new Error('expected a revision');

    // Same decision, resubmitted with the NOW-current revision — but the case is BOOKING_READY,
    // not under review. This is the self-loop trap: without the state allowlist, lr-t24's own
    // target state equals the current state and the engine's transition check is bypassed.
    const resubmitted = await applyHumanDecision(store, 'lead-review-4d', currentRevision, decisionEvent('lead-review-4d'), DEPS);
    expect(resubmitted.outcome).toBe('NOT_UNDER_REVIEW');

    const current = await store.load('lead-review-4d');
    // bookingReadyAt must NOT have been silently re-stamped by the resubmission.
    expect(current?.engineState.facts.bookingReadyAt).toBe(first.record?.engineState.facts.bookingReadyAt);
    expect(current?.revision).toBe(currentRevision);
  });

  it('4e. a decision against a nonexistent incident is NOT_FOUND', async () => {
    const store = new InMemoryWaitIncidentStore();
    const result = await applyHumanDecision(store, 'lead-does-not-exist', 1, decisionEvent('lead-does-not-exist'), DEPS);
    expect(result.outcome).toBe('NOT_FOUND');
  });

  it('15a. a decision against a terminal (CLOSED_BAD_FIT) case is rejected as not under review', async () => {
    const store = new InMemoryWaitIncidentStore();
    const parked = await parkReviewCase(store, 'lead-review-terminal');
    const closed = await store.park({
      incidentId: 'lead-review-terminal',
      systemId: LEAD_RESCUE.id,
      correlationId: parked.correlationId,
      engineState: { ...parked.engineState, lifecycleState: 'CLOSED_BAD_FIT' },
    });

    const result = await applyHumanDecision(
      store,
      'lead-review-terminal',
      closed.revision,
      decisionEvent('lead-review-terminal'),
      DEPS,
    );
    expect(result.outcome).toBe('NOT_UNDER_REVIEW');
  });
});

describe('Reviewed-offer operator journey — offer dispatch', () => {
  async function clearedToBookingReady(store: WaitIncidentStore, incidentId: string): Promise<WaitIncidentRecord> {
    const parked = await parkReviewCase(store, incidentId);
    const decided = await applyHumanDecision(store, incidentId, parked.revision, decisionEvent(incidentId), DEPS);
    if (decided.outcome !== 'ACCEPTED' || decided.record === undefined) {
      throw new Error(`expected ACCEPTED, got ${decided.outcome}`);
    }
    return decided.record;
  }

  it('5. BOOKING_READY (cleared, not yet dispatched) creates no offerSentAt and never fires lr-t22, even far in the future — only the ready-but-undespatched attention condition applies', async () => {
    const store = new InMemoryWaitIncidentStore();
    const claimStore = new InMemoryOperationClaimStore();
    const ready = await clearedToBookingReady(store, 'lead-dispatch-5');
    expect(ready.engineState.facts.offerSentAt).toBeUndefined();

    const farFuture = hoursAfter(ready.engineState.facts.bookingReadyAt ?? '', 10_000);
    const check = await checkWaitIncident(store, claimStore, 'lead-dispatch-5', farFuture, DEPS, 'runtime-a');
    // The ready-but-undespatched attention condition correctly fires (lr-fm-approval-timeout,
    // closed this pass) — but the lifecycle never moves and no offer-sent evidence is ever
    // fabricated. This is the operational-attention signal, never lr-t22 itself.
    expect(check.outcome).toBe('ATTENTION_OVERDUE');
    expect(check.state?.lifecycleState).toBe('BOOKING_READY');
    expect(check.state?.facts.offerSentAt).toBeUndefined();
    expect(check.entries?.flatMap((e) => e.transitions)).toEqual([]);
    const overdueNotify = check.entries?.flatMap((e) => e.sideEffects).find((s) => s.idempotencyKey.endsWith(':dispatch-overdue'));
    expect(overdueNotify?.status).toBe('EXECUTED');
    expect(check.entries?.flatMap((e) => e.sideEffects).some((s) => s.idempotencyKey.endsWith(':offer-unanswered'))).toBe(false);
  });

  it('6. explicit dispatch produces a prospect-facing MESSAGE_SEND, never a NOTIFICATION to the owner', async () => {
    const store = new InMemoryWaitIncidentStore();
    const claimStore = new InMemoryOperationClaimStore();
    const ready = await clearedToBookingReady(store, 'lead-dispatch-6');
    const executor = new RecordingExecutor('test-executor', ALWAYS_SUCCEEDS);

    const result = await dispatchAuthorizedOffer(
      store,
      claimStore,
      'lead-dispatch-6',
      ready.revision,
      despatchEvent('lead-dispatch-6', '2026-08-06T10:00:00-04:00'),
      { ...DEPS, executor },
      'runtime-a',
    );

    expect(result.outcome).toBe('CONFIRMED');
    const effect = result.entries?.flatMap((e) => e.sideEffects).find((s) => s.kind === 'MESSAGE_SEND');
    expect(effect).toBeDefined();
    expect(effect?.status).toBe('EXECUTED');
    expect(effect?.target).not.toBe('Named owner');
    expect(effect?.idempotencyKey.startsWith('offer:')).toBe(true);
    expect(effect?.executionMode).toBe('SIMULATED');
    expect(executor.invocations).toHaveLength(1);
  });

  it('7. confirmed dispatch creates authoritative offerSentAt and the 48h window genuinely governs the check', async () => {
    const store = new InMemoryWaitIncidentStore();
    const claimStore = new InMemoryOperationClaimStore();
    const ready = await clearedToBookingReady(store, 'lead-dispatch-7');
    const dispatchedAt = '2026-08-06T10:00:00-04:00';

    const dispatch = await dispatchAuthorizedOffer(
      store,
      claimStore,
      'lead-dispatch-7',
      ready.revision,
      despatchEvent('lead-dispatch-7', dispatchedAt),
      { ...DEPS, executor: new RecordingExecutor('test-executor', ALWAYS_SUCCEEDS) },
      'runtime-a',
    );
    expect(dispatch.outcome).toBe('CONFIRMED');
    expect(dispatch.record?.engineState.facts.offerSentAt).toBe(dispatchedAt);

    // Before 48h: untouched.
    const before = await checkWaitIncident(store, claimStore, 'lead-dispatch-7', hoursAfter(dispatchedAt, 47), DEPS, 'runtime-a');
    expect(before.outcome).toBe('STILL_WAITING');

    // At/after 48h: lr-t22 fires.
    const after = await checkWaitIncident(store, claimStore, 'lead-dispatch-7', hoursAfter(dispatchedAt, 48), DEPS, 'runtime-a');
    expect(after.outcome).toBe('ELAPSED');
    expect(after.state?.lifecycleState).toBe('NEEDS_HUMAN');
    const transition = after.entries?.flatMap((e) => e.transitions).find((t) => t.accepted);
    expect(transition?.ruleId).toBe('lr-t22');
  });

  it('8a. an uncertain dispatch does NOT falsely create confirmed offer-sent evidence — original record untouched', async () => {
    const store = new InMemoryWaitIncidentStore();
    const claimStore = new InMemoryOperationClaimStore();
    const ready = await clearedToBookingReady(store, 'lead-dispatch-8a');
    const executor = new RecordingExecutor('test-executor', ALWAYS_UNKNOWN);

    const result = await dispatchAuthorizedOffer(
      store,
      claimStore,
      'lead-dispatch-8a',
      ready.revision,
      despatchEvent('lead-dispatch-8a', '2026-08-06T10:00:00-04:00'),
      { ...DEPS, executor },
      'runtime-a',
    );

    expect(result.outcome).toBe('UNCERTAIN');
    expect(result.uncertainOperation?.status).toBe('CLAIMED');

    const stillParked = await store.load('lead-dispatch-8a');
    expect(stillParked).toEqual(ready);
    expect(stillParked?.engineState.facts.offerSentAt).toBeUndefined();

    // Never falsely reaches lr-t22 (which requires offerSentAt) — but the ready-but-undespatched
    // attention condition correctly fires past its own window, since no offer was ever
    // confirmed sent (the earlier claimed-but-unconfirmed attempt above does not count).
    const check = await checkWaitIncident(store, claimStore, 'lead-dispatch-8a', hoursAfter('2026-08-06T10:00:00-04:00', 1000), DEPS, 'runtime-a');
    expect(check.outcome).toBe('ATTENTION_OVERDUE');
    expect(check.state?.lifecycleState).toBe('BOOKING_READY');
    expect(check.state?.facts.offerSentAt).toBeUndefined();
  });

  it('8b. dispatch attempted outside BOOKING_READY (still under review) is rejected as NOT_READY, no offerSentAt', async () => {
    const store = new InMemoryWaitIncidentStore();
    const claimStore = new InMemoryOperationClaimStore();
    const parked = await parkReviewCase(store, 'lead-dispatch-8b');

    const result = await dispatchAuthorizedOffer(
      store,
      claimStore,
      'lead-dispatch-8b',
      parked.revision,
      despatchEvent('lead-dispatch-8b', '2026-08-06T10:00:00-04:00'),
      DEPS,
      'runtime-a',
    );
    expect(result.outcome).toBe('NOT_READY');
    expect((await store.load('lead-dispatch-8b'))?.engineState.facts.offerSentAt).toBeUndefined();
  });

  it('8c. re-dispatching an already-dispatched case is rejected as ALREADY_DISPATCHED, no second send attempted', async () => {
    const store = new InMemoryWaitIncidentStore();
    const claimStore = new InMemoryOperationClaimStore();
    const ready = await clearedToBookingReady(store, 'lead-dispatch-8c');
    const executor = new RecordingExecutor('test-executor', ALWAYS_SUCCEEDS);

    const first = await dispatchAuthorizedOffer(
      store,
      claimStore,
      'lead-dispatch-8c',
      ready.revision,
      despatchEvent('lead-dispatch-8c', '2026-08-06T10:00:00-04:00'),
      { ...DEPS, executor },
      'runtime-a',
    );
    expect(first.outcome).toBe('CONFIRMED');
    if (first.record === undefined) throw new Error('expected a record');

    const second = await dispatchAuthorizedOffer(
      store,
      claimStore,
      'lead-dispatch-8c',
      first.record.revision,
      despatchEvent('lead-dispatch-8c', '2026-08-07T10:00:00-04:00'),
      { ...DEPS, executor },
      'runtime-a',
    );
    expect(second.outcome).toBe('ALREADY_DISPATCHED');
    expect(executor.invocations).toHaveLength(1);
  });

  it('9. two concurrent dispatch attempts on the same cleared case invoke the observable executor at most once', async () => {
    const incidentDir = mkdtempSync(path.join(tmpdir(), 'lr-review-dispatch-race-incidents-'));
    const claimDir = mkdtempSync(path.join(tmpdir(), 'lr-review-dispatch-race-claims-'));
    try {
      const incidentPath = path.join(incidentDir, 'incidents.json');
      const parkingStore = new FileWaitIncidentStore(incidentPath);
      const ready = await clearedToBookingReady(parkingStore, 'lead-dispatch-9');

      const storeA = new FileWaitIncidentStore(incidentPath);
      const storeB = new FileWaitIncidentStore(incidentPath);
      const claimStoreA = new FileOperationClaimStore(claimDir);
      const claimStoreB = new FileOperationClaimStore(claimDir);
      const executorA = new RecordingExecutor('runtime-a-executor', ALWAYS_SUCCEEDS);
      const executorB = new RecordingExecutor('runtime-b-executor', ALWAYS_SUCCEEDS);

      const [a, b] = await Promise.all([
        dispatchAuthorizedOffer(
          storeA,
          claimStoreA,
          'lead-dispatch-9',
          ready.revision,
          despatchEvent('lead-dispatch-9', '2026-08-06T10:00:00-04:00'),
          { ...DEPS, executor: executorA },
          'runtime-a',
        ),
        dispatchAuthorizedOffer(
          storeB,
          claimStoreB,
          'lead-dispatch-9',
          ready.revision,
          despatchEvent('lead-dispatch-9', '2026-08-06T10:00:00-04:00'),
          { ...DEPS, executor: executorB },
          'runtime-b',
        ),
      ]);

      const totalInvocations = executorA.invocations.length + executorB.invocations.length;
      expect(totalInvocations).toBe(1);
      expect([a.outcome, b.outcome]).toContain('CONFIRMED');
      expect([a.outcome, b.outcome]).toEqual(expect.arrayContaining(['CONFIRMED']));
      // The loser must be UNCERTAIN or ALREADY_DISPATCHED — never a second CONFIRMED.
      const loserOutcome = a.outcome === 'CONFIRMED' ? b.outcome : a.outcome;
      expect(['UNCERTAIN', 'ALREADY_DISPATCHED']).toContain(loserOutcome);
    } finally {
      rmSync(incidentDir, { recursive: true, force: true });
      rmSync(claimDir, { recursive: true, force: true });
    }
  });

  it('10. a crash after execution but before confirmation yields UNCERTAIN, and a fresh recovery runtime never replays the send', async () => {
    const incidentDir = mkdtempSync(path.join(tmpdir(), 'lr-review-dispatch-crash-incidents-'));
    const claimDir = mkdtempSync(path.join(tmpdir(), 'lr-review-dispatch-crash-claims-'));
    try {
      const incidentPath = path.join(incidentDir, 'incidents.json');
      const parkingStore = new FileWaitIncidentStore(incidentPath);
      const ready = await clearedToBookingReady(parkingStore, 'lead-dispatch-10');

      const firstStore = new FileWaitIncidentStore(incidentPath);
      const firstClaimStore = new FileOperationClaimStore(claimDir);
      const firstExecutor = new RecordingExecutor('first-executor', ALWAYS_UNKNOWN);

      const first = await dispatchAuthorizedOffer(
        firstStore,
        firstClaimStore,
        'lead-dispatch-10',
        ready.revision,
        despatchEvent('lead-dispatch-10', '2026-08-06T10:00:00-04:00'),
        { ...DEPS, executor: firstExecutor },
        'runtime-a',
      );
      expect(first.outcome).toBe('UNCERTAIN');
      expect(firstExecutor.invocations).toHaveLength(1);

      const stillParked = await new FileWaitIncidentStore(incidentPath).load('lead-dispatch-10');
      expect(stillParked?.engineState.facts.offerSentAt).toBeUndefined();

      const secondStore = new FileWaitIncidentStore(incidentPath);
      const secondClaimStore = new FileOperationClaimStore(claimDir);
      const secondExecutor = new RecordingExecutor('recovery-executor', ALWAYS_SUCCEEDS);

      const second = await dispatchAuthorizedOffer(
        secondStore,
        secondClaimStore,
        'lead-dispatch-10',
        ready.revision,
        despatchEvent('lead-dispatch-10', '2026-08-06T10:00:00-04:00'),
        { ...DEPS, executor: secondExecutor },
        'recovery-runtime',
      );
      // Same identity (same bookingReadyAt, same revision) as the crashed attempt: the claim
      // is still CLAIMED-but-unconfirmed, so this must not silently retry.
      expect(second.outcome).toBe('UNCERTAIN');
      expect(secondExecutor.invocations).toHaveLength(0);
    } finally {
      rmSync(incidentDir, { recursive: true, force: true });
      rmSync(claimDir, { recursive: true, force: true });
    }
  });

  it('11. a fresh runtime reconstructs every stage of the journey — review, decision, dispatch, and elapse — across independent store instances', async () => {
    const incidentDir = mkdtempSync(path.join(tmpdir(), 'lr-review-full-journey-'));
    const claimDir = mkdtempSync(path.join(tmpdir(), 'lr-review-full-journey-claims-'));
    try {
      const incidentPath = path.join(incidentDir, 'incidents.json');

      const parked = await parkReviewCase(new FileWaitIncidentStore(incidentPath), 'lead-journey-11');
      expect(parked.engineState.lifecycleState).toBe('NEEDS_HUMAN');

      const decided = await applyHumanDecision(
        new FileWaitIncidentStore(incidentPath),
        'lead-journey-11',
        parked.revision,
        decisionEvent('lead-journey-11'),
        DEPS,
      );
      expect(decided.outcome).toBe('ACCEPTED');
      if (decided.record === undefined) throw new Error('expected a record');

      const dispatched = await dispatchAuthorizedOffer(
        new FileWaitIncidentStore(incidentPath),
        new FileOperationClaimStore(claimDir),
        'lead-journey-11',
        decided.record.revision,
        despatchEvent('lead-journey-11', '2026-08-06T10:00:00-04:00'),
        { ...DEPS, executor: new RecordingExecutor('journey-executor', ALWAYS_SUCCEEDS) },
        'runtime-journey',
      );
      expect(dispatched.outcome).toBe('CONFIRMED');

      const elapsed = await checkWaitIncident(
        new FileWaitIncidentStore(incidentPath),
        new FileOperationClaimStore(claimDir),
        'lead-journey-11',
        hoursAfter('2026-08-06T10:00:00-04:00', 60),
        DEPS,
        'runtime-journey-2',
      );
      expect(elapsed.outcome).toBe('ELAPSED');
      expect(elapsed.state?.lifecycleState).toBe('NEEDS_HUMAN');
    } finally {
      rmSync(incidentDir, { recursive: true, force: true });
      rmSync(claimDir, { recursive: true, force: true });
    }
  });

  it('17. the dispatch claim identity and the wait-elapsed notification claim identity are distinct and both independently confirmed', async () => {
    const store = new InMemoryWaitIncidentStore();
    const claimStore = new InMemoryOperationClaimStore();
    const ready = await clearedToBookingReady(store, 'lead-dispatch-17');
    const dispatchedAt = '2026-08-06T10:00:00-04:00';

    const dispatch = await dispatchAuthorizedOffer(
      store,
      claimStore,
      'lead-dispatch-17',
      ready.revision,
      despatchEvent('lead-dispatch-17', dispatchedAt),
      { ...DEPS, executor: new RecordingExecutor('test-executor', ALWAYS_SUCCEEDS) },
      'runtime-a',
    );
    expect(dispatch.outcome).toBe('CONFIRMED');
    if (dispatch.record === undefined) throw new Error('expected a record');

    const elapsed = await checkWaitIncident(
      store,
      claimStore,
      'lead-dispatch-17',
      hoursAfter(dispatchedAt, 60),
      DEPS,
      'runtime-a',
    );
    expect(elapsed.outcome).toBe('ELAPSED');

    const dispatchClaimId = `offer:lead-dispatch-17:${ready.engineState.facts.bookingReadyAt}@rev${ready.revision}`;
    const notifyClaimId = `notify:lead-dispatch-17:offer-unanswered@rev${dispatch.record.revision}`;
    expect(dispatchClaimId).not.toBe(notifyClaimId);

    const dispatchClaim = await claimStore.load(dispatchClaimId);
    const notifyClaim = await claimStore.load(notifyClaimId);
    expect(dispatchClaim?.status).toBe('CONFIRMED');
    expect(notifyClaim?.status).toBe('CONFIRMED');
  });
});
