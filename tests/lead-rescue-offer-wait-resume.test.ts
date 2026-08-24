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
  MalformedWaitRecordError,
  type WaitIncidentRecord,
  type WaitIncidentStore,
} from '@/lib/persistence/wait-incident-store';
import { FileOperationClaimStore, InMemoryOperationClaimStore } from '@/lib/persistence/operation-claim-store';
import { checkWaitIncident, parkWaitingIncident, type WaitResumeDeps } from '@/lib/engine/wait-resume';
import type { Scenario, SendOutcome, VerifyOutcome, ExecutionMode } from '@/lib/model/runtime';
import type { SendRequest, VerifyRequest, SideEffectExecutor } from '@/lib/ports/side-effect-executor';
import { writeFileSync } from 'node:fs';

/**
 * PERSISTENCE, CLAIM, AND EXECUTION-BOUNDARY FALSIFYING TESTS for lr-t22, proving the
 * generic wait/resume runtime — `WaitIncidentStore`, `OperationClaimStore`,
 * `checkWaitIncident`'s claim-then-invoke ordering — genuinely generalises to a SECOND,
 * materially different waiting condition (BOOKING_READY / lr-t22) without any change to
 * those primitives, alongside the FIRST (WAITING_FOR_REPLY / lr-t14) they were built for.
 *
 * Deliberately not a full re-run of every test in `tests/lead-rescue-wait-resume-concurrency.test.ts`
 * / `tests/lead-rescue-wait-resume-execution-boundary.test.ts` — that machinery is already
 * proven generically there (it operates on ANY effect's idempotencyKey and revision,
 * uninterested in which transition produced it). What's new and needs its OWN proof here is
 * that the SECOND category actually exercises the same guarantees end to end, not a second,
 * parallel implementation of them.
 */

const DEPS: WaitResumeDeps = {
  system: LEAD_RESCUE,
  profile: KESTREL,
  handlers: LEAD_RESCUE_HANDLERS,
  reevaluationEventType: 'lead.wait.reevaluated',
};

const FOUND_SCENARIO = leadRescueScenarioBySlug('offer-window-elapses');
if (FOUND_SCENARIO === undefined) throw new Error('fixture scenario "offer-window-elapses" not found');
const FULL_SCENARIO: Scenario = FOUND_SCENARIO;

async function parkOfferIncident(store: WaitIncidentStore, incidentId = 'lead-northgate'): Promise<WaitIncidentRecord> {
  const enquiryEvent = FULL_SCENARIO.events[0];
  if (enquiryEvent === undefined) throw new Error('fixture scenario has no events');
  const enquiryOnly: Scenario = {
    ...FULL_SCENARIO,
    events: [{ ...enquiryEvent, entityId: incidentId, eventId: `${incidentId}:evt-001` }],
  };
  const run = await runScenario(enquiryOnly, {
    system: LEAD_RESCUE,
    profile: KESTREL,
    handlers: LEAD_RESCUE_HANDLERS,
    provider: new FixtureDecisionProvider(enquiryOnly.judgments),
  });
  expect(run.finalState.lifecycleState).toBe('BOOKING_READY');
  return parkWaitingIncident(store, LEAD_RESCUE, {
    incidentId,
    correlationId: `inc-${incidentId}`,
    engineState: run.finalState,
  });
}

function hoursAfter(iso: string, hours: number): string {
  return new Date(Date.parse(iso) + hours * 60 * 60 * 1000).toISOString();
}

interface RecordedInvocation {
  readonly request: SendRequest;
}

class RecordingSideEffectExecutor implements SideEffectExecutor {
  readonly mode: ExecutionMode = 'SIMULATED';
  readonly description = 'Test-only observable sink for the lr-t22 execution-boundary proofs.';

  constructor(
    readonly id: string,
    private readonly invocations: RecordedInvocation[],
    private readonly outcome: () => Promise<SendOutcome> | SendOutcome,
  ) {}

  async attemptSend(request: SendRequest): Promise<SendOutcome> {
    this.invocations.push({ request });
    return this.outcome();
  }

  async attemptVerify(request: VerifyRequest): Promise<VerifyOutcome> {
    void request;
    throw new Error('RecordingSideEffectExecutor.attemptVerify is not exercised by these tests');
  }
}

const ALWAYS_SUCCEEDS = (): SendOutcome => ({ kind: 'SUCCEEDED' });
const ALWAYS_UNKNOWN = (): SendOutcome => ({ kind: 'OUTCOME_UNKNOWN', reason: 'simulated crash mid-send' });

describe('Lead Rescue lr-t22 — durable persistence and claim-gated execution', () => {
  it('2. the offer-wait incident is durably parked with the correct snapshot and a stable, revision-scoped identity', async () => {
    const store = new InMemoryWaitIncidentStore();
    const parked = await parkOfferIncident(store);

    expect(parked.incidentId).toBe('lead-northgate');
    expect(parked.systemId).toBe(LEAD_RESCUE.id);
    expect(parked.revision).toBe(1);
    expect(parked.engineState.lifecycleState).toBe('BOOKING_READY');
    expect(parked.engineState.facts.bookingReadyAt).toBeDefined();

    const loaded = await store.load('lead-northgate');
    expect(loaded).toEqual(parked);
  });

  it('10. runtime reconstruction preserves the durably parked offer incident, and reaches the same outcome as an uninterrupted replay', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'lr-offer-restart-'));
    try {
      const filePath = path.join(dir, 'incidents.json');
      const firstProcessStore = new FileWaitIncidentStore(filePath);
      const parked = await parkOfferIncident(firstProcessStore);

      const secondProcessStore = new FileWaitIncidentStore(filePath);
      const wellPastDeadline = hoursAfter(parked.engineState.facts.bookingReadyAt ?? '', 60);
      const resumed = await checkWaitIncident(
        secondProcessStore,
        new InMemoryOperationClaimStore(),
        'lead-northgate',
        wellPastDeadline,
        DEPS,
        'runtime-b',
      );

      expect(resumed.outcome).toBe('ELAPSED');
      expect(resumed.state?.lifecycleState).toBe('NEEDS_HUMAN');

      const uninterrupted = await runScenario(FULL_SCENARIO, {
        system: LEAD_RESCUE,
        profile: KESTREL,
        handlers: LEAD_RESCUE_HANDLERS,
        provider: new FixtureDecisionProvider(FULL_SCENARIO.judgments),
      });
      expect(resumed.state?.lifecycleState).toBe(uninterrupted.finalState.lifecycleState);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('13. a full resolve/delete/re-park cycle for an offer incident executes a genuinely new authorized notification without colliding with the earlier confirmed claim', async () => {
    const store = new InMemoryWaitIncidentStore();
    const claimStore = new InMemoryOperationClaimStore();

    const firstPark = await parkOfferIncident(store);
    const firstElapsed = await checkWaitIncident(
      store,
      claimStore,
      'lead-northgate',
      hoursAfter(firstPark.engineState.facts.bookingReadyAt ?? '', 60),
      DEPS,
      'runtime-a',
    );
    expect(firstElapsed.outcome).toBe('ELAPSED');
    expect(await store.load('lead-northgate')).toBeUndefined();

    const secondPark = await parkOfferIncident(store);
    expect(secondPark.revision).toBeGreaterThan(firstPark.revision);

    const secondElapsed = await checkWaitIncident(
      store,
      claimStore,
      'lead-northgate',
      hoursAfter(secondPark.engineState.facts.bookingReadyAt ?? '', 60),
      DEPS,
      'runtime-a',
    );

    expect(secondElapsed.outcome).toBe('ELAPSED');
    const notify = secondElapsed.entries?.flatMap((e) => e.sideEffects).find((s) => s.idempotencyKey === 'notify:lead-northgate:offer-unanswered');
    expect(notify?.status).toBe('EXECUTED');
  });

  it('8. sequential duplicate reevaluations of an elapsed offer incident do not duplicate observable execution', async () => {
    const store = new InMemoryWaitIncidentStore();
    const claimStore = new InMemoryOperationClaimStore();
    const parked = await parkOfferIncident(store);
    const wellPastDeadline = hoursAfter(parked.engineState.facts.bookingReadyAt ?? '', 60);

    const first = await checkWaitIncident(store, claimStore, 'lead-northgate', wellPastDeadline, DEPS, 'runtime-a');
    expect(first.outcome).toBe('ELAPSED');

    const second = await checkWaitIncident(store, claimStore, 'lead-northgate', wellPastDeadline, DEPS, 'runtime-a');
    expect(second.outcome).toBe('NOT_FOUND');
  });

  it('7,9. two independently constructed runtimes racing on the same elapsed offer incident: the observable sink is invoked at most once', async () => {
    const incidentDir = mkdtempSync(path.join(tmpdir(), 'lr-offer-race-incidents-'));
    const claimDir = mkdtempSync(path.join(tmpdir(), 'lr-offer-race-claims-'));
    try {
      const incidentPath = path.join(incidentDir, 'incidents.json');
      const parkingStore = new FileWaitIncidentStore(incidentPath);
      const parked = await parkOfferIncident(parkingStore);
      const wellPastDeadline = hoursAfter(parked.engineState.facts.bookingReadyAt ?? '', 60);

      const runtimeAStore = new FileWaitIncidentStore(incidentPath);
      const runtimeBStore = new FileWaitIncidentStore(incidentPath);
      const claimStoreA = new FileOperationClaimStore(claimDir);
      const claimStoreB = new FileOperationClaimStore(claimDir);

      const sharedInvocations: RecordedInvocation[] = [];
      const executorA = new RecordingSideEffectExecutor('runtime-a-executor', sharedInvocations, ALWAYS_SUCCEEDS);
      const executorB = new RecordingSideEffectExecutor('runtime-b-executor', sharedInvocations, ALWAYS_SUCCEEDS);

      const [a, b] = await Promise.all([
        checkWaitIncident(runtimeAStore, claimStoreA, 'lead-northgate', wellPastDeadline, { ...DEPS, executor: executorA }, 'runtime-a'),
        checkWaitIncident(runtimeBStore, claimStoreB, 'lead-northgate', wellPastDeadline, { ...DEPS, executor: executorB }, 'runtime-b'),
      ]);

      expect(sharedInvocations).toHaveLength(1);
      expect([a.outcome, b.outcome]).toContain('ELAPSED');

      const verifyClaimStore = new FileOperationClaimStore(claimDir);
      const claimed = await verifyClaimStore.load(`notify:lead-northgate:offer-unanswered@rev${parked.revision}`);
      expect(claimed?.status).toBe('CONFIRMED');
    } finally {
      rmSync(incidentDir, { recursive: true, force: true });
      rmSync(claimDir, { recursive: true, force: true });
    }
  });

  it('11. a crash after invoking the executor but before confirmation yields UNCERTAIN and a freshly reconstructed runtime never replays the notification', async () => {
    const incidentDir = mkdtempSync(path.join(tmpdir(), 'lr-offer-crash-incidents-'));
    const claimDir = mkdtempSync(path.join(tmpdir(), 'lr-offer-crash-claims-'));
    try {
      const incidentPath = path.join(incidentDir, 'incidents.json');
      const parkingStore = new FileWaitIncidentStore(incidentPath);
      const parked = await parkOfferIncident(parkingStore);
      const wellPastDeadline = hoursAfter(parked.engineState.facts.bookingReadyAt ?? '', 60);

      const sharedInvocations: RecordedInvocation[] = [];
      const firstStore = new FileWaitIncidentStore(incidentPath);
      const firstClaimStore = new FileOperationClaimStore(claimDir);
      const firstExecutor = new RecordingSideEffectExecutor('first-executor', sharedInvocations, ALWAYS_UNKNOWN);

      const first = await checkWaitIncident(
        firstStore,
        firstClaimStore,
        'lead-northgate',
        wellPastDeadline,
        { ...DEPS, executor: firstExecutor },
        'runtime-a',
      );

      expect(first.outcome).toBe('UNCERTAIN');
      expect(sharedInvocations).toHaveLength(1);
      const notify = first.entries?.flatMap((e) => e.sideEffects).find((s) => s.idempotencyKey === 'notify:lead-northgate:offer-unanswered');
      expect(notify?.status).toBe('OUTCOME_UNKNOWN');

      const stillParked = await new FileWaitIncidentStore(incidentPath).load('lead-northgate');
      expect(stillParked).toBeDefined();

      const secondStore = new FileWaitIncidentStore(incidentPath);
      const secondClaimStore = new FileOperationClaimStore(claimDir);
      const secondExecutor = new RecordingSideEffectExecutor('recovery-executor', sharedInvocations, ALWAYS_SUCCEEDS);

      const second = await checkWaitIncident(
        secondStore,
        secondClaimStore,
        'lead-northgate',
        wellPastDeadline,
        { ...DEPS, executor: secondExecutor },
        'recovery-runtime',
      );

      expect(second.outcome).toBe('UNCERTAIN');
      expect(sharedInvocations).toHaveLength(1);
    } finally {
      rmSync(incidentDir, { recursive: true, force: true });
      rmSync(claimDir, { recursive: true, force: true });
    }
  });

  it('17. a malformed persisted offer-wait record fails closed with MalformedWaitRecordError', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'lr-offer-malformed-'));
    try {
      const filePath = path.join(dir, 'incidents.json');
      writeFileSync(
        filePath,
        JSON.stringify({ 'lead-corrupt': { incidentId: 'lead-corrupt', systemId: 'lead-rescue' } }),
        'utf8',
      );
      const store = new FileWaitIncidentStore(filePath);

      await expect(
        checkWaitIncident(store, new InMemoryOperationClaimStore(), 'lead-corrupt', '2026-08-20T00:00:00-04:00', DEPS, 'runtime-a'),
      ).rejects.toBeInstanceOf(MalformedWaitRecordError);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
