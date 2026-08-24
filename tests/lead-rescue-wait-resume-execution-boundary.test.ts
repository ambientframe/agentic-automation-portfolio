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
import {
  FileOperationClaimStore,
  InMemoryOperationClaimStore,
  type OperationClaimRecord,
  type OperationClaimStore,
} from '@/lib/persistence/operation-claim-store';
import { checkWaitIncident, parkWaitingIncident, type WaitResumeDeps } from '@/lib/engine/wait-resume';
import type { SendRequest, VerifyRequest, SideEffectExecutor } from '@/lib/ports/side-effect-executor';
import type { ExecutionMode, SendOutcome, VerifyOutcome, Scenario } from '@/lib/model/runtime';
import type { HandlerOutcome, SystemHandlers } from '@/lib/engine/types';

/**
 * EXECUTION-BOUNDARY FALSIFYING TESTS.
 *
 * `tests/lead-rescue-wait-resume-concurrency.test.ts` proved that `checkWaitIncident` never
 * returns two genuine `EXECUTED` notifications by inspecting the resolved SideEffect status
 * — a data label. This file answers a sharper question the prior pass's own completion
 * report left ambiguous: is anything actually OBSERVABLE ever invoked, and if so, is that
 * invocation genuinely gated behind the durable claim, or could it happen before?
 *
 * `RecordingSideEffectExecutor` below is the observable sink: a real object with a real
 * `attemptSend` method, wired through `WaitResumeDeps.executor` (added this pass) and the
 * EXISTING `SideEffectExecutor` port every other live-send path in this codebase already
 * uses (`lib/ports/side-effect-executor.ts`) — not a new abstraction, not a hypothetical. Its
 * invocation count is incremented at the top of `attemptSend`, before anything about the
 * outcome is decided, so it is genuinely independent of any later relabeling
 * `checkWaitIncident` performs on the returned `SideEffect.status`. Every invocation also
 * records what the durable claim store showed for that exact operation id AT THE MOMENT of
 * invocation — direct, empirical proof of ordering, not an inference from reading the code.
 */

const DEPS: WaitResumeDeps = {
  system: LEAD_RESCUE,
  profile: KESTREL,
  handlers: LEAD_RESCUE_HANDLERS,
  reevaluationEventType: 'lead.wait.reevaluated',
};

const FOUND_SCENARIO = leadRescueScenarioBySlug('reply-window-elapses');
if (FOUND_SCENARIO === undefined) throw new Error('fixture scenario "reply-window-elapses" not found');
const FULL_SCENARIO: Scenario = FOUND_SCENARIO;

async function parkIncident(store: WaitIncidentStore, incidentId: string): Promise<WaitIncidentRecord> {
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
  expect(run.finalState.lifecycleState).toBe('WAITING_FOR_REPLY');
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
  readonly claimStateAtInvocation: OperationClaimRecord | undefined;
}

/**
 * The observable test-only sink. `invocations` is a plain array — pass the SAME array into
 * multiple instances to model "two independent runtimes' executor objects both ultimately
 * calling the same real external system," whose own log is what `invocations` stands in for.
 * Sharing this array is not sharing in-memory EXECUTION PROTECTION (nothing here suppresses a
 * second call) — it is the OBSERVATION channel a real falsifying test needs, exactly as a
 * shared durable file is the observation channel `WaitIncidentStore`/`OperationClaimStore`
 * tests already use.
 */
class RecordingSideEffectExecutor implements SideEffectExecutor {
  readonly mode: ExecutionMode = 'SIMULATED';
  readonly description =
    'Test-only observable sink: records every attemptSend invocation independently of any later relabeling.';

  constructor(
    readonly id: string,
    private readonly claimStore: OperationClaimStore,
    private readonly invocations: RecordedInvocation[],
    private readonly outcome: () => Promise<SendOutcome> | SendOutcome,
  ) {}

  async attemptSend(request: SendRequest): Promise<SendOutcome> {
    const claimStateAtInvocation = await this.claimStore.load(request.attemptId);
    this.invocations.push({ request, claimStateAtInvocation });
    return this.outcome();
  }

  async attemptVerify(request: VerifyRequest): Promise<VerifyOutcome> {
    void request;
    throw new Error('RecordingSideEffectExecutor.attemptVerify is not exercised by these tests');
  }
}

const ALWAYS_SUCCEEDS = (): SendOutcome => ({ kind: 'SUCCEEDED' });
const ALWAYS_UNKNOWN = (): SendOutcome => ({ kind: 'OUTCOME_UNKNOWN', reason: 'simulated crash mid-send' });

describe('Lead Rescue wait/resume — observable execution boundary', () => {
  it('1-4. two independently constructed runtimes racing on the same durable snapshot: the observable sink is invoked AT MOST ONCE, not merely reported EXECUTED at most once', async () => {
    const incidentDir = mkdtempSync(path.join(tmpdir(), 'lr-exec-incidents-'));
    const claimDir = mkdtempSync(path.join(tmpdir(), 'lr-exec-claims-'));
    try {
      const incidentPath = path.join(incidentDir, 'incidents.json');
      const parkingStore = new FileWaitIncidentStore(incidentPath);
      const parked = await parkIncident(parkingStore, 'lead-exec-race');
      const wellPastDeadline = hoursAfter(parked.engineState.facts.waitStartedAt ?? '', 30);

      const runtimeAStore = new FileWaitIncidentStore(incidentPath);
      const runtimeBStore = new FileWaitIncidentStore(incidentPath);
      const claimStoreA = new FileOperationClaimStore(claimDir);
      const claimStoreB = new FileOperationClaimStore(claimDir);

      // The shared observation channel: both runtimes' executors record into the SAME array,
      // modelling one real external system whose own log we can inspect.
      const sharedInvocations: RecordedInvocation[] = [];
      const executorA = new RecordingSideEffectExecutor('runtime-a-executor', claimStoreA, sharedInvocations, ALWAYS_SUCCEEDS);
      const executorB = new RecordingSideEffectExecutor('runtime-b-executor', claimStoreB, sharedInvocations, ALWAYS_SUCCEEDS);

      const [a, b] = await Promise.all([
        checkWaitIncident(runtimeAStore, claimStoreA, 'lead-exec-race', wellPastDeadline, { ...DEPS, executor: executorA }, 'runtime-a'),
        checkWaitIncident(runtimeBStore, claimStoreB, 'lead-exec-race', wellPastDeadline, { ...DEPS, executor: executorB }, 'runtime-b'),
      ]);

      // THE property this file exists to prove: the SINK saw at most one call, independent
      // of what either result's own entries/status say.
      expect(sharedInvocations).toHaveLength(1);

      // Item 5/7: was the earlier ordering (execute before claim) reachable? No — the sink's
      // OWN recorded observation shows a claim already existed at the moment it was invoked.
      expect(sharedInvocations[0]?.claimStateAtInvocation?.status).toBe('CLAIMED');
      expect(sharedInvocations[0]?.claimStateAtInvocation?.operationId).toBe(`notify:lead-exec-race:wait-elapsed@rev${parked.revision}`);

      // Item 10: the loser (whichever of a/b did not win) never invoked the sink and did not
      // merely relabel an already-executed effect — it structurally never reached the branch
      // that calls attemptSend at all.
      const outcomes = [a.outcome, b.outcome];
      expect(outcomes).toContain('ELAPSED');
      const winnerCount = outcomes.filter((o) => o === 'ELAPSED').length;
      expect(winnerCount).toBe(1);

      const verifyClaimStore = new FileOperationClaimStore(claimDir);
      const claimed = await verifyClaimStore.load(`notify:lead-exec-race:wait-elapsed@rev${parked.revision}`);
      expect(claimed?.status).toBe('CONFIRMED');
    } finally {
      rmSync(incidentDir, { recursive: true, force: true });
      rmSync(claimDir, { recursive: true, force: true });
    }
  });

  it('5-7. the earlier crash window (execute observed, but no durable claim yet) is not reachable: every recorded invocation is preceded by an existing claim', async () => {
    const sharedStore = new InMemoryWaitIncidentStore();
    const claimStore = new InMemoryOperationClaimStore();
    const parked = await parkIncident(sharedStore, 'lead-exec-ordering');
    const wellPastDeadline = hoursAfter(parked.engineState.facts.waitStartedAt ?? '', 30);

    const invocations: RecordedInvocation[] = [];
    const executor = new RecordingSideEffectExecutor('ordering-executor', claimStore, invocations, ALWAYS_SUCCEEDS);

    const result = await checkWaitIncident(
      sharedStore,
      claimStore,
      'lead-exec-ordering',
      wellPastDeadline,
      { ...DEPS, executor },
      'runtime-a',
    );

    expect(result.outcome).toBe('ELAPSED');
    expect(invocations).toHaveLength(1);
    // The claim existed (status CLAIMED, not yet CONFIRMED — confirm() runs strictly AFTER
    // attemptSend returns) at the exact moment the sink was called. There is no code path in
    // checkWaitIncident that reaches `resolveSend` other than inside the branch already
    // guarded by `attempt.decision === 'CLAIMED'` — this assertion is the empirical half of
    // that structural guarantee.
    expect(invocations[0]?.claimStateAtInvocation?.status).toBe('CLAIMED');
  });

  it('8-9a. crash after durable claim acquisition but before invocation: recovery finds the unconfirmed claim and never invokes the sink at all', async () => {
    const incidentDir = mkdtempSync(path.join(tmpdir(), 'lr-exec-claimonly-incidents-'));
    const claimDir = mkdtempSync(path.join(tmpdir(), 'lr-exec-claimonly-claims-'));
    try {
      const incidentPath = path.join(incidentDir, 'incidents.json');
      const parkingStore = new FileWaitIncidentStore(incidentPath);
      const parked = await parkIncident(parkingStore, 'lead-exec-claimonly');
      const wellPastDeadline = hoursAfter(parked.engineState.facts.waitStartedAt ?? '', 30);

      // Simulate a runtime that won the claim and then crashed before ever calling the
      // executor — constructed directly against the SAME durable identity checkWaitIncident
      // itself would derive.
      const crashedClaimStore = new FileOperationClaimStore(claimDir);
      const operationId = `notify:lead-exec-claimonly:wait-elapsed@rev${parked.revision}`;
      const crashAttempt = await crashedClaimStore.claim(operationId, 'crashed-runtime', wellPastDeadline);
      expect(crashAttempt.decision).toBe('CLAIMED');

      const recoveryInvocations: RecordedInvocation[] = [];
      const recoveryStore = new FileWaitIncidentStore(incidentPath);
      const recoveryClaimStore = new FileOperationClaimStore(claimDir);
      const recoveryExecutor = new RecordingSideEffectExecutor(
        'recovery-executor',
        recoveryClaimStore,
        recoveryInvocations,
        ALWAYS_SUCCEEDS,
      );

      const recovered = await checkWaitIncident(
        recoveryStore,
        recoveryClaimStore,
        'lead-exec-claimonly',
        wellPastDeadline,
        { ...DEPS, executor: recoveryExecutor },
        'recovery-runtime',
      );

      expect(recovered.outcome).toBe('UNCERTAIN');
      // The decisive assertion: recovery never even CALLED the sink. It is not that the sink
      // was called and its result discarded — it was structurally never invoked, because
      // recovery's claim() attempt itself returned UNCERTAIN, not CLAIMED.
      expect(recoveryInvocations).toHaveLength(0);
    } finally {
      rmSync(incidentDir, { recursive: true, force: true });
      rmSync(claimDir, { recursive: true, force: true });
    }
  });

  it('8-9b. crash after invocation but before confirmation: the sink is invoked exactly once, and a freshly reconstructed recovery runtime never invokes it again', async () => {
    const incidentDir = mkdtempSync(path.join(tmpdir(), 'lr-exec-postinvoke-incidents-'));
    const claimDir = mkdtempSync(path.join(tmpdir(), 'lr-exec-postinvoke-claims-'));
    try {
      const incidentPath = path.join(incidentDir, 'incidents.json');
      const parkingStore = new FileWaitIncidentStore(incidentPath);
      const parked = await parkIncident(parkingStore, 'lead-exec-postinvoke');
      const wellPastDeadline = hoursAfter(parked.engineState.facts.waitStartedAt ?? '', 30);

      const sharedInvocations: RecordedInvocation[] = [];
      const firstStore = new FileWaitIncidentStore(incidentPath);
      const firstClaimStore = new FileOperationClaimStore(claimDir);
      // This executor is invoked, and genuinely returns OUTCOME_UNKNOWN — the honest
      // simulation of "the request left our system; no confirmation came back," which is
      // exactly the outcome a real crash mid-send would leave a caller unable to distinguish
      // from. checkWaitIncident must therefore treat it as uncertain, not as failure.
      const firstExecutor = new RecordingSideEffectExecutor('first-executor', firstClaimStore, sharedInvocations, ALWAYS_UNKNOWN);

      const first = await checkWaitIncident(
        firstStore,
        firstClaimStore,
        'lead-exec-postinvoke',
        wellPastDeadline,
        { ...DEPS, executor: firstExecutor },
        'runtime-a',
      );

      expect(first.outcome).toBe('UNCERTAIN');
      expect(sharedInvocations).toHaveLength(1);

      const notify = first.entries?.flatMap((e) => e.sideEffects).find((s) => s.idempotencyKey === 'notify:lead-exec-postinvoke:wait-elapsed');
      expect(notify?.status).toBe('OUTCOME_UNKNOWN');

      // The incident stays visibly, durably parked — not silently marked resolved.
      const stillParked = await new FileWaitIncidentStore(incidentPath).load('lead-exec-postinvoke');
      expect(stillParked).toBeDefined();

      // A wholly independent "recovery runtime" — fresh store, fresh claim store, fresh
      // executor instance — must NOT invoke the sink a second time.
      const secondStore = new FileWaitIncidentStore(incidentPath);
      const secondClaimStore = new FileOperationClaimStore(claimDir);
      const secondExecutor = new RecordingSideEffectExecutor(
        'recovery-executor',
        secondClaimStore,
        sharedInvocations,
        ALWAYS_SUCCEEDS,
      );

      const second = await checkWaitIncident(
        secondStore,
        secondClaimStore,
        'lead-exec-postinvoke',
        wellPastDeadline,
        { ...DEPS, executor: secondExecutor },
        'recovery-runtime',
      );

      expect(second.outcome).toBe('UNCERTAIN');
      // Still exactly one invocation across BOTH attempts, on the shared channel.
      expect(sharedInvocations).toHaveLength(1);
    } finally {
      rmSync(incidentDir, { recursive: true, force: true });
      rmSync(claimDir, { recursive: true, force: true });
    }
  });

  it('11. authority-blocked effects never reach the executor: BLOCKED_BY_POLICY is not EXECUTED, so the claim loop skips it entirely', async () => {
    // A synthetic handler reusing the real, declared lr-t14 transition (WAITING_FOR_REPLY ->
    // NEEDS_HUMAN) but proposing the notification at authority 1 — below the "may execute"
    // floor `authorityOutcome` (lib/engine/reducer.ts) enforces structurally, the same gate
    // every other effect in this portfolio goes through. This proves the invariant through
    // the REAL checkWaitIncident code path, not by unit-testing a private filter function.
    const blockedHandlers: SystemHandlers = {
      systemId: LEAD_RESCUE_HANDLERS.systemId,
      initialState: LEAD_RESCUE_HANDLERS.initialState,
      handlers: {
        'lead.wait.reevaluated': (ctx): HandlerOutcome => ({
          steps: [
            {
              id: `${ctx.event.eventId}:blocked-wait-elapsed`,
              label: 'Wait elapsed (authority-blocked, test fixture)',
              atOffsetSeconds: 0,
              transitionTo: 'NEEDS_HUMAN',
              summary: 'Synthetic handler proposing a below-floor-authority notification.',
              decisions: [],
              effects: [
                {
                  id: `${ctx.event.eventId}:effect:blocked-notify`,
                  kind: 'NOTIFICATION',
                  description: 'Should never reach the executor: authority 1 is below the execute floor.',
                  target: 'Named owner',
                  idempotencyKey: `notify:${ctx.event.entityId}:wait-elapsed`,
                  authority: 1,
                  policyPermits: true,
                },
              ],
              verifications: [],
            },
          ],
        }),
      },
    };

    const sharedStore = new InMemoryWaitIncidentStore();
    const claimStore = new InMemoryOperationClaimStore();
    const parked = await parkIncident(sharedStore, 'lead-exec-blocked');
    const wellPastDeadline = hoursAfter(parked.engineState.facts.waitStartedAt ?? '', 30);

    const invocations: RecordedInvocation[] = [];
    const executor = new RecordingSideEffectExecutor('blocked-executor', claimStore, invocations, ALWAYS_SUCCEEDS);

    const result = await checkWaitIncident(
      sharedStore,
      claimStore,
      'lead-exec-blocked',
      wellPastDeadline,
      { ...DEPS, handlers: blockedHandlers, executor },
      'runtime-a',
    );

    // The transition itself is legal and accepted (lr-t14 is a real declared rule) — only
    // the effect is blocked.
    expect(result.state?.lifecycleState).toBe('NEEDS_HUMAN');
    const notify = result.entries?.flatMap((e) => e.sideEffects).find((s) => s.idempotencyKey.startsWith('notify:'));
    expect(notify?.status).toBe('BLOCKED_BY_POLICY');

    // The decisive assertion: the executor was never called, and no durable claim was ever
    // created for this operation — a blocked effect leaves no trace in the claim store.
    expect(invocations).toHaveLength(0);
    expect(await claimStore.load(`notify:lead-exec-blocked:wait-elapsed@rev${parked.revision}`)).toBeUndefined();

    // And since no effect needed a claim, the incident resolves normally — a policy block on
    // the SIDE EFFECT does not block the wait/resume boundary's own resolution.
    expect(result.outcome).toBe('ELAPSED');
  });

  it('12. successful completion remains protected across full runtime reconstruction, including the executor instance', async () => {
    const incidentDir = mkdtempSync(path.join(tmpdir(), 'lr-exec-durable-incidents-'));
    const claimDir = mkdtempSync(path.join(tmpdir(), 'lr-exec-durable-claims-'));
    try {
      const incidentPath = path.join(incidentDir, 'incidents.json');
      const parkingStore = new FileWaitIncidentStore(incidentPath);
      const parked = await parkIncident(parkingStore, 'lead-exec-durable');
      const wellPastDeadline = hoursAfter(parked.engineState.facts.waitStartedAt ?? '', 30);

      const invocations: RecordedInvocation[] = [];
      const firstStore = new FileWaitIncidentStore(incidentPath);
      const firstClaimStore = new FileOperationClaimStore(claimDir);
      const firstExecutor = new RecordingSideEffectExecutor('first-executor', firstClaimStore, invocations, ALWAYS_SUCCEEDS);

      const first = await checkWaitIncident(
        firstStore,
        firstClaimStore,
        'lead-exec-durable',
        wellPastDeadline,
        { ...DEPS, executor: firstExecutor },
        'runtime-a',
      );
      expect(first.outcome).toBe('ELAPSED');
      expect(invocations).toHaveLength(1);

      // A repeated resume attempt through wholly independent, freshly constructed
      // dependencies (including a fresh executor instance) — the incident is already
      // resolved, so this returns NOT_FOUND before ever consulting the claim store.
      const secondStore = new FileWaitIncidentStore(incidentPath);
      const secondClaimStore = new FileOperationClaimStore(claimDir);
      const secondExecutor = new RecordingSideEffectExecutor('second-executor', secondClaimStore, invocations, ALWAYS_SUCCEEDS);

      const second = await checkWaitIncident(
        secondStore,
        secondClaimStore,
        'lead-exec-durable',
        wellPastDeadline,
        { ...DEPS, executor: secondExecutor },
        'runtime-b',
      );

      expect(second.outcome).toBe('NOT_FOUND');
      expect(invocations).toHaveLength(1);

      const verifyClaimStore = new FileOperationClaimStore(claimDir);
      expect((await verifyClaimStore.load(`notify:lead-exec-durable:wait-elapsed@rev${parked.revision}`))?.status).toBe('CONFIRMED');
    } finally {
      rmSync(incidentDir, { recursive: true, force: true });
      rmSync(claimDir, { recursive: true, force: true });
    }
  });

  it('without a configured executor, the notification remains an honestly labelled pure plan: no sink exists, no invocation is attempted, and executionMode stays SIMULATED', async () => {
    const sharedStore = new InMemoryWaitIncidentStore();
    const claimStore = new InMemoryOperationClaimStore();
    const parked = await parkIncident(sharedStore, 'lead-exec-noexecutor');
    const wellPastDeadline = hoursAfter(parked.engineState.facts.waitStartedAt ?? '', 30);

    const result = await checkWaitIncident(
      sharedStore,
      claimStore,
      'lead-exec-noexecutor',
      wellPastDeadline,
      DEPS, // no `executor` field — the exact prior-pass behavior
      'runtime-a',
    );

    expect(result.outcome).toBe('ELAPSED');
    const notify = result.entries?.flatMap((e) => e.sideEffects).find((s) => s.idempotencyKey.startsWith('notify:'));
    expect(notify?.status).toBe('EXECUTED');
    expect(notify?.executionMode).toBe('SIMULATED');
  });
});
