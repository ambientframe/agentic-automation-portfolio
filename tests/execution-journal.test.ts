import { describe, expect, it } from 'vitest';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
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
import { applyHumanDecision, dispatchAuthorizedOffer, type WaitResumeDeps } from '@/lib/engine/wait-resume';
import { ingestExternalLead, ingressEntityId, INGRESS_FIXTURE_LEAD_MESSAGE, type LeadIngressDeps } from '@/lib/engine/lead-ingress';
import { LEAD_RESCUE_INGRESS_SCHEMA_VERSION, type LeadRescueIngressEnvelope } from '@/lib/ingress/lead-rescue-ingress-contract';
import type { CanonicalEvent, ExecutionMode, Scenario, SendOutcome, VerifyOutcome } from '@/lib/model/runtime';
import type { SendRequest, VerifyRequest, SideEffectExecutor } from '@/lib/ports/side-effect-executor';
import { DECISION_MECHANISMS } from '@/lib/model/system';
import {
  EXECUTION_JOURNAL_SCHEMA_VERSION,
  FileExecutionJournal,
  InMemoryExecutionJournal,
  JournalEventSchema,
  JOURNAL_EVENT_TYPES,
  JOURNAL_MECHANISMS,
  MalformedJournalRecordError,
  NULL_EXECUTION_JOURNAL,
  OBSERVABLE_OUTCOMES,
  STAGE_FOR_EVENT_TYPE,
  type ExecutionJournalRecorder,
  type JournalEvent,
  type JournalRecordOutcome,
} from '@/lib/persistence/execution-journal-store';

/**
 * FALSIFYING TESTS for the NON-AUTHORITATIVE EXECUTION JOURNAL.
 *
 * The claim under test: consequential Lead Rescue runtime activity AUTOMATICALLY produces a
 * durable, correlated observable history that survives reconstruction and can be queried,
 * WITHOUT the journal becoming business state, execution state, or an input to any decision.
 *
 * Every test below is written to FAIL if the implementation quietly weakens one of those
 * halves — either by failing to record something consequential, or by letting the recorded
 * history acquire authority it must never have. The most important tests here are 11 and 15:
 * an observability system that can change what the engine decides, or that renders an empty
 * history as a successful run, is worse than no observability at all.
 */

const WAIT_DEPS_BASE: WaitResumeDeps = {
  system: LEAD_RESCUE,
  profile: KESTREL,
  handlers: LEAD_RESCUE_HANDLERS,
  reevaluationEventType: 'lead.wait.reevaluated',
};

const INGRESS_DEPS_BASE: LeadIngressDeps = {
  system: LEAD_RESCUE,
  profile: KESTREL,
  handlers: LEAD_RESCUE_HANDLERS,
};

const FOUND_SCENARIO = leadRescueScenarioBySlug('reviewed-offer-elapses');
if (FOUND_SCENARIO === undefined) throw new Error('fixture scenario "reviewed-offer-elapses" not found');
const REVIEW_SCENARIO: Scenario = FOUND_SCENARIO;

function tempDir(prefix: string): string {
  return mkdtempSync(path.join(tmpdir(), prefix));
}

function realisticEnvelope(overrides: Partial<LeadRescueIngressEnvelope> = {}): LeadRescueIngressEnvelope {
  return {
    schemaVersion: LEAD_RESCUE_INGRESS_SCHEMA_VERSION,
    source: 'website-intake-form',
    sourceEventId: 'journal-falsifier-1',
    receivedAt: '2026-08-26T10:00:00-04:00',
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

/** Runs ONLY the enquiry event — reaches NEEDS_HUMAN with zero autonomous action (lr-t11). */
async function parkReviewCase(store: WaitIncidentStore, incidentId: string): Promise<WaitIncidentRecord> {
  const enquiryEvent = REVIEW_SCENARIO.events[0];
  if (enquiryEvent === undefined) throw new Error('fixture scenario has no events');
  const enquiryOnly: Scenario = {
    ...REVIEW_SCENARIO,
    events: [{ ...enquiryEvent, entityId: incidentId, eventId: `${incidentId}:evt-001` }],
  };
  const run = await runScenario(enquiryOnly, {
    system: LEAD_RESCUE,
    profile: KESTREL,
    handlers: LEAD_RESCUE_HANDLERS,
    provider: new FixtureDecisionProvider(enquiryOnly.judgments),
  });
  expect(run.finalState.lifecycleState).toBe('NEEDS_HUMAN');
  return store.park({
    incidentId,
    systemId: LEAD_RESCUE.id,
    correlationId: `inc-${incidentId}`,
    engineState: { ...run.finalState, missingInformation: [...run.finalState.missingInformation] },
  });
}

function decisionEvent(incidentId: string, decidedBy: string, occurredAt = '2026-08-26T12:00:00-04:00'): CanonicalEvent {
  return {
    eventId: `${incidentId}:decide:${occurredAt}`,
    correlationId: `inc-${incidentId}`,
    entityId: incidentId,
    type: 'human.decision.recorded',
    source: 'operator-console',
    sourceEventId: `decide:${incidentId}:${occurredAt}`,
    occurredAt,
    receivedAt: occurredAt,
    schemaVersion: 'wait-resume-1',
    actor: 'HUMAN',
    executionMode: 'SIMULATED',
    payload: { decidedBy, decision: 'CLEARED_TO_PROCEED', rationale: 'Scope and framework are clear enough to proceed.' },
  };
}

function despatchEvent(incidentId: string, occurredAt = '2026-08-26T13:00:00-04:00'): CanonicalEvent {
  return {
    eventId: `${incidentId}:despatch:${occurredAt}`,
    correlationId: `inc-${incidentId}`,
    entityId: incidentId,
    type: 'lead.offer.despatched',
    source: 'operator-console',
    sourceEventId: `despatch:${incidentId}:${occurredAt}`,
    occurredAt,
    receivedAt: occurredAt,
    schemaVersion: 'wait-resume-1',
    actor: 'HUMAN',
    executionMode: 'SIMULATED',
    payload: {
      decidedBy: 'client-partner',
      target: 'p.deshmukh@fenwickactuarial.example',
      offerSummary: 'Offer a 30-minute SOC 2 readiness scoping call.',
    },
  };
}

/** Drives a parked review case all the way to BOOKING_READY so a despatch can be attempted. */
async function clearForDespatch(
  store: WaitIncidentStore,
  incidentId: string,
  deps: Pick<WaitResumeDeps, 'system' | 'profile' | 'handlers' | 'journal'>,
): Promise<WaitIncidentRecord> {
  const parked = await parkReviewCase(store, incidentId);
  const decided = await applyHumanDecision(store, incidentId, parked.revision, decisionEvent(incidentId, 'client-partner'), deps);
  expect(decided.outcome).toBe('ACCEPTED');
  if (decided.record === undefined) throw new Error('expected a re-parked record');
  return decided.record;
}

class ConfigurableExecutor implements SideEffectExecutor {
  readonly mode: ExecutionMode = 'SIMULATED';
  readonly description = 'Test executor with a configurable send outcome.';
  constructor(
    readonly id: string,
    private readonly outcome: SendOutcome,
  ) {}
  async attemptSend(request: SendRequest): Promise<SendOutcome> {
    void request;
    return this.outcome;
  }
  async attemptVerify(request: VerifyRequest): Promise<VerifyOutcome> {
    void request;
    throw new Error('not used');
  }
}

/** Every write fails. Used to prove observability failure cannot alter business behaviour. */
class AlwaysFailingJournal implements ExecutionJournalRecorder {
  readonly attempted: JournalEvent[] = [];
  async record(event: JournalEvent): Promise<JournalRecordOutcome> {
    this.attempted.push(event);
    return { kind: 'DROPPED', reason: 'simulated journal persistence failure' };
  }
}

/** Every write throws, which the engine must survive without changing its own result. */
class ThrowingJournal implements ExecutionJournalRecorder {
  async record(): Promise<JournalRecordOutcome> {
    throw new Error('journal disk exploded');
  }
}

// ---------------------------------------------------------------------------

describe('execution journal — automatic emission at real runtime boundaries', () => {
  it('1. a real ingress event automatically creates an observable journal record — no manual write', async () => {
    const journal = new InMemoryExecutionJournal();
    const store = new InMemoryWaitIncidentStore();
    const claims = new InMemoryOperationClaimStore();
    const envelope = realisticEnvelope();

    const result = await ingestExternalLead(
      store,
      claims,
      envelope,
      { ...INGRESS_DEPS_BASE, journal },
      '2026-08-26T10:00:05-04:00',
      'runtime-a',
    );
    expect(result.outcome).toBe('ACCEPTED');

    const history = await journal.readIncident(result.entityId);
    expect(history.length, 'the ingress boundary recorded nothing').toBeGreaterThan(0);

    const trigger = history.find((e) => e.type === 'INGRESS_RECEIVED');
    expect(trigger, 'no INGRESS_RECEIVED event was journalled').toBeDefined();
    expect(trigger?.outcome).toBe('ACCEPTED');
    expect(trigger?.incidentId).toBe(result.entityId);
    expect(trigger?.correlationId).toBe(result.correlationId);
    expect(STAGE_FOR_EVENT_TYPE[trigger!.type]).toBe('TRIGGER');
    // Provenance is known at ingress and must be carried, never fabricated elsewhere.
    expect(trigger?.provenance).toEqual({
      source: envelope.source,
      sourceEventId: envelope.sourceEventId,
      ingestionPath: 'n8n',
    });
  });

  it('2. a duplicate ingress is journalled as a duplicate observation and never as a second acceptance', async () => {
    const journal = new InMemoryExecutionJournal();
    const store = new InMemoryWaitIncidentStore();
    const claims = new InMemoryOperationClaimStore();
    const envelope = realisticEnvelope({ sourceEventId: 'journal-falsifier-duplicate' });
    const deps = { ...INGRESS_DEPS_BASE, journal };

    const first = await ingestExternalLead(store, claims, envelope, deps, '2026-08-26T10:00:05-04:00', 'runtime-a');
    const second = await ingestExternalLead(store, claims, envelope, deps, '2026-08-26T10:00:09-04:00', 'runtime-a');
    expect(first.outcome).toBe('ACCEPTED');
    expect(second.outcome).toBe('DUPLICATE');

    const history = await journal.readIncident(ingressEntityId(envelope.source, envelope.sourceEventId));
    const accepted = history.filter((e) => e.type === 'INGRESS_RECEIVED' && e.outcome === 'ACCEPTED');
    const suppressed = history.filter((e) => e.type === 'INGRESS_RECEIVED' && e.outcome === 'SUPPRESSED_DUPLICATE');

    expect(accepted, 'a redelivery fabricated a second authoritative acceptance').toHaveLength(1);
    expect(suppressed, 'the redelivery was invisible to an operator').toHaveLength(1);
  });

  it('3. a refused human decision is journalled as an authority observation that grants no execution authority', async () => {
    const journal = new InMemoryExecutionJournal();
    const store = new InMemoryWaitIncidentStore();
    const incidentId = 'journal-unauthorized-1';
    const parked = await parkReviewCase(store, incidentId);

    // "analyst" carries authority ceiling 1 — below what this decision requires.
    const refused = await applyHumanDecision(store, incidentId, parked.revision, decisionEvent(incidentId, 'analyst'), {
      ...WAIT_DEPS_BASE,
      journal,
    });
    expect(refused.outcome).toBe('UNAUTHORIZED');

    const history = await journal.readIncident(incidentId);
    const authority = history.find((e) => e.type === 'HUMAN_DECISION_RECORDED');
    expect(authority, 'a refused human decision was not journalled at all').toBeDefined();
    expect(authority?.outcome).toBe('REFUSED');
    expect(authority?.mechanism).toBe('HUMAN_DECISION');
    expect(STAGE_FOR_EVENT_TYPE[authority!.type]).toBe('AUTHORITY');

    // The refusal is observable, and the business state is genuinely untouched.
    const after = await store.load(incidentId);
    expect(after?.revision).toBe(parked.revision);
    expect(after?.engineState.lifecycleState).toBe('NEEDS_HUMAN');
  });

  it('4. an execution attempt records execution mode and executor identity', async () => {
    const journal = new InMemoryExecutionJournal();
    const store = new InMemoryWaitIncidentStore();
    const claims = new InMemoryOperationClaimStore();
    const incidentId = 'journal-execution-1';
    const ready = await clearForDespatch(store, incidentId, { ...WAIT_DEPS_BASE, journal });

    const executor = new ConfigurableExecutor('journal-test-executor', { kind: 'SUCCEEDED' });
    const result = await dispatchAuthorizedOffer(
      store,
      claims,
      incidentId,
      ready.revision,
      despatchEvent(incidentId),
      { ...WAIT_DEPS_BASE, journal, executor },
      'runtime-a',
    );
    expect(result.outcome).toBe('CONFIRMED');

    const action = (await journal.readIncident(incidentId)).find((e) => e.type === 'DISPATCH_ATTEMPTED');
    expect(action, 'the execution attempt was not journalled').toBeDefined();
    expect(action?.outcome).toBe('EXECUTED');
    expect(action?.executionMode).toBe('SIMULATED');
    expect(action?.actorId).toBe('journal-test-executor');
    expect(action?.mechanism).toBe('EXECUTION');
    expect(STAGE_FOR_EVENT_TYPE[action!.type]).toBe('ACTION');
  });

  it('5. SUPPRESSED_DUPLICATE is a genuinely different observation from EXECUTED', async () => {
    const journal = new InMemoryExecutionJournal();
    const store = new InMemoryWaitIncidentStore();
    const claims = new InMemoryOperationClaimStore();
    const incidentId = 'journal-suppressed-1';
    const ready = await clearForDespatch(store, incidentId, { ...WAIT_DEPS_BASE, journal });

    const deps = { ...WAIT_DEPS_BASE, journal, executor: new ConfigurableExecutor('journal-test-executor', { kind: 'SUCCEEDED' }) };
    const first = await dispatchAuthorizedOffer(store, claims, incidentId, ready.revision, despatchEvent(incidentId), deps, 'runtime-a');
    expect(first.outcome).toBe('CONFIRMED');

    // The realistic duplicate: an operator submits the same despatch again against the case as
    // it now stands. The offer is already recorded as sent, so nothing is sent a second time.
    const after = await store.load(incidentId);
    if (after === undefined) throw new Error('expected the despatched case to still be parked');
    const second = await dispatchAuthorizedOffer(store, claims, incidentId, after.revision, despatchEvent(incidentId, '2026-08-26T14:00:00-04:00'), deps, 'runtime-b');
    expect(second.outcome).toBe('ALREADY_DISPATCHED');

    const actions = (await journal.readIncident(incidentId)).filter((e) => e.type === 'DISPATCH_ATTEMPTED');
    const outcomes = actions.map((e) => e.outcome);
    expect(outcomes).toContain('EXECUTED');
    expect(outcomes).toContain('SUPPRESSED_DUPLICATE');
    expect(outcomes.filter((o) => o === 'EXECUTED'), 'a suppressed duplicate was journalled as a second execution').toHaveLength(1);
  });

  it('6. FAILED_BEFORE_EFFECT and OUTCOME_UNKNOWN are distinguishable in the journal', async () => {
    const journal = new InMemoryExecutionJournal();
    const store = new InMemoryWaitIncidentStore();
    const claims = new InMemoryOperationClaimStore();

    const failedId = 'journal-failed-1';
    const readyFailed = await clearForDespatch(store, failedId, { ...WAIT_DEPS_BASE, journal });
    await dispatchAuthorizedOffer(
      store,
      claims,
      failedId,
      readyFailed.revision,
      despatchEvent(failedId),
      {
        ...WAIT_DEPS_BASE,
        journal,
        executor: new ConfigurableExecutor('journal-test-executor', { kind: 'FAILED_BEFORE_EFFECT', reason: 'connection refused' }),
      },
      'runtime-a',
    );

    const unknownId = 'journal-unknown-1';
    const readyUnknown = await clearForDespatch(store, unknownId, { ...WAIT_DEPS_BASE, journal });
    await dispatchAuthorizedOffer(
      store,
      claims,
      unknownId,
      readyUnknown.revision,
      despatchEvent(unknownId),
      {
        ...WAIT_DEPS_BASE,
        journal,
        executor: new ConfigurableExecutor('journal-test-executor', { kind: 'OUTCOME_UNKNOWN', reason: 'no confirmation received' }),
      },
      'runtime-a',
    );

    const failed = (await journal.readIncident(failedId)).find((e) => e.type === 'DISPATCH_ATTEMPTED');
    const unknown = (await journal.readIncident(unknownId)).find((e) => e.type === 'DISPATCH_ATTEMPTED');

    expect(failed?.outcome).toBe('FAILED_BEFORE_EFFECT');
    expect(unknown?.outcome).toBe('OUTCOME_UNKNOWN');
    expect(failed?.outcome).not.toBe(unknown?.outcome);
  });

  it('7. the governing operation-claim identity is retained on the execution observation', async () => {
    const journal = new InMemoryExecutionJournal();
    const store = new InMemoryWaitIncidentStore();
    const claims = new InMemoryOperationClaimStore();
    const incidentId = 'journal-claim-identity-1';
    const ready = await clearForDespatch(store, incidentId, { ...WAIT_DEPS_BASE, journal });

    await dispatchAuthorizedOffer(
      store,
      claims,
      incidentId,
      ready.revision,
      despatchEvent(incidentId),
      { ...WAIT_DEPS_BASE, journal, executor: new ConfigurableExecutor('journal-test-executor', { kind: 'SUCCEEDED' }) },
      'runtime-a',
    );

    const action = (await journal.readIncident(incidentId)).find((e) => e.type === 'DISPATCH_ATTEMPTED');
    expect(action?.operationClaimId, 'no operation-claim identity was correlated').toBeTruthy();
    // The journal must correlate to the EXISTING claim identity, never invent a competing one.
    const claimed = await claims.load(action!.operationClaimId!);
    expect(claimed, 'the journalled claim id does not name a real operation claim').toBeDefined();
    expect(claimed?.status).toBe('CONFIRMED');
  });
});

describe('execution journal — durability, isolation and honest failure', () => {
  it('8. journal records survive reconstruction of the journal instance', async () => {
    const dir = tempDir('journal-durability-');
    try {
      const writer = new FileExecutionJournal(path.join(dir, 'journal'));
      const store = new FileWaitIncidentStore(path.join(dir, 'incidents.json'));
      const claims = new FileOperationClaimStore(path.join(dir, 'claims'));
      const envelope = realisticEnvelope({ sourceEventId: 'journal-durability-1' });

      const result = await ingestExternalLead(
        store,
        claims,
        envelope,
        { ...INGRESS_DEPS_BASE, journal: writer },
        '2026-08-26T10:00:05-04:00',
        'runtime-a',
      );
      expect(result.outcome).toBe('ACCEPTED');

      // A genuinely new reader instance — the only thing shared is the directory on disk.
      const reader = new FileExecutionJournal(path.join(dir, 'journal'));
      const history = await reader.readIncident(result.entityId);
      expect(history.length, 'a reconstructed reader found no history').toBeGreaterThan(0);
      expect(history.some((e) => e.type === 'INGRESS_RECEIVED' && e.outcome === 'ACCEPTED')).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('9. records for two incidents never bleed into each other', async () => {
    const dir = tempDir('journal-isolation-');
    try {
      const journal = new FileExecutionJournal(path.join(dir, 'journal'));
      const store = new FileWaitIncidentStore(path.join(dir, 'incidents.json'));
      const claims = new FileOperationClaimStore(path.join(dir, 'claims'));
      const deps = { ...INGRESS_DEPS_BASE, journal };

      const a = await ingestExternalLead(store, claims, realisticEnvelope({ sourceEventId: 'iso-a' }), deps, '2026-08-26T10:00:05-04:00', 'runtime-a');
      const b = await ingestExternalLead(store, claims, realisticEnvelope({ sourceEventId: 'iso-b' }), deps, '2026-08-26T10:00:06-04:00', 'runtime-a');
      expect(a.entityId).not.toBe(b.entityId);

      const historyA = await journal.readIncident(a.entityId);
      const historyB = await journal.readIncident(b.entityId);

      expect(historyA.length).toBeGreaterThan(0);
      expect(historyB.length).toBeGreaterThan(0);
      expect(historyA.every((e) => e.incidentId === a.entityId), 'incident A history contains foreign records').toBe(true);
      expect(historyB.every((e) => e.incidentId === b.entityId), 'incident B history contains foreign records').toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('10. malformed persisted journal data fails explicitly rather than becoming a fabricated history', async () => {
    const dir = tempDir('journal-malformed-');
    try {
      const journal = new FileExecutionJournal(path.join(dir, 'journal'));
      const store = new InMemoryWaitIncidentStore();
      const claims = new InMemoryOperationClaimStore();
      const result = await ingestExternalLead(
        store,
        claims,
        realisticEnvelope({ sourceEventId: 'journal-malformed-1' }),
        { ...INGRESS_DEPS_BASE, journal },
        '2026-08-26T10:00:05-04:00',
        'runtime-a',
      );

      // Corrupt one persisted record in place, exactly as a partial write or a hand edit would.
      const incidentDir = path.join(dir, 'journal', encodeURIComponent(result.entityId));
      const files = readdirSync(incidentDir).filter((f) => f.endsWith('.json'));
      expect(files.length).toBeGreaterThan(0);
      writeFileSync(path.join(incidentDir, files[0] as string), JSON.stringify({ notAJournalEvent: true }), 'utf8');

      const reader = new FileExecutionJournal(path.join(dir, 'journal'));
      await expect(reader.readIncident(result.entityId)).rejects.toBeInstanceOf(MalformedJournalRecordError);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('11. the journal cannot become an authority or policy input — engine behaviour is byte-identical without it', async () => {
    // Two independent runs of the SAME business path: one fully journalled, one whose journal
    // fails every single write. If observability can change a decision, these will differ.
    async function run(journal: ExecutionJournalRecorder) {
      const store = new InMemoryWaitIncidentStore();
      const claims = new InMemoryOperationClaimStore();
      const incidentId = 'journal-nonauthoritative-1';
      const parked = await parkReviewCase(store, incidentId);
      const refused = await applyHumanDecision(store, incidentId, parked.revision, decisionEvent(incidentId, 'analyst'), {
        ...WAIT_DEPS_BASE,
        journal,
      });
      const decided = await applyHumanDecision(store, incidentId, parked.revision, decisionEvent(incidentId, 'client-partner'), {
        ...WAIT_DEPS_BASE,
        journal,
      });
      const ready = decided.record;
      if (ready === undefined) throw new Error('expected a re-parked record');
      const dispatched = await dispatchAuthorizedOffer(
        store,
        claims,
        incidentId,
        ready.revision,
        despatchEvent(incidentId),
        { ...WAIT_DEPS_BASE, journal, executor: new ConfigurableExecutor('journal-test-executor', { kind: 'SUCCEEDED' }) },
        'runtime-a',
      );
      return JSON.stringify({
        refused: refused.outcome,
        decided: decided.outcome,
        dispatched: dispatched.outcome,
        finalState: (await store.load(incidentId))?.engineState,
      });
    }

    const withJournal = await run(new InMemoryExecutionJournal());
    const withFailingJournal = await run(new AlwaysFailingJournal());
    const withThrowingJournal = await run(new ThrowingJournal());

    expect(withFailingJournal, 'a failing journal changed what the engine decided').toBe(withJournal);
    expect(withThrowingJournal, 'a throwing journal changed what the engine decided').toBe(withJournal);
  });

  it('11b. no engine or port module reads the journal — the query side is unreachable from decision code', () => {
    const READER_SYMBOLS = [
      'readIncident',
      'readCorrelation',
      'listIncidents',
      'readAll',
      'FileExecutionJournal',
      'InMemoryExecutionJournal',
    ];
    const roots = [path.join(process.cwd(), 'lib', 'engine'), path.join(process.cwd(), 'lib', 'ports')];

    const offenders: string[] = [];
    for (const root of roots) {
      const walk = (dir: string) => {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            walk(full);
            continue;
          }
          if (!entry.name.endsWith('.ts')) continue;
          const source = readFileSync(full, 'utf8');
          for (const symbol of READER_SYMBOLS) {
            if (source.includes(symbol)) offenders.push(`${path.relative(process.cwd(), full)} references ${symbol}`);
          }
        }
      };
      walk(root);
    }

    expect(offenders, 'decision code can read the journal, which makes observability an authority').toEqual([]);
  });

  it('12. raw credentials and secrets cannot be persisted through the supported event schema', () => {
    const base = {
      journalEventId: 'x:INGRESS_RECEIVED:accepted:y',
      schemaVersion: EXECUTION_JOURNAL_SCHEMA_VERSION,
      recordedAt: '2026-08-26T10:00:05.000Z',
      systemId: 'lead-rescue',
      incidentId: 'x',
      correlationId: 'inc-x',
      type: 'INGRESS_RECEIVED' as const,
      outcome: 'ACCEPTED' as const,
    };

    // No field exists to carry a credential...
    expect(JournalEventSchema.safeParse({ ...base, apiKey: 'sk-ant-abc1234567890' }).success).toBe(false);
    expect(JournalEventSchema.safeParse({ ...base, authorization: 'Bearer abc1234567890' }).success).toBe(false);
    expect(JournalEventSchema.safeParse({ ...base, payload: { password: 'hunter2' } }).success).toBe(false);

    // ...and the one free-text field refuses credential-shaped content rather than storing it.
    expect(JournalEventSchema.safeParse({ ...base, detail: 'Bearer eyJhbGciOiJIUzI1NiJ9.abc' }).success).toBe(false);
    expect(JournalEventSchema.safeParse({ ...base, detail: 'key sk-ant-api03-abcdefghijklmnop' }).success).toBe(false);
    expect(JournalEventSchema.safeParse({ ...base, detail: 'attemptSend returned SUCCEEDED.' }).success).toBe(true);
  });

  it('13. private chain-of-thought has no field in the schema', () => {
    const FORBIDDEN = ['reasoning', 'chainOfThought', 'thought', 'thinking', 'rationale', 'prompt', 'completion', 'modelOutput', 'payload', 'body', 'messageBody'];
    const shape = Object.keys(JournalEventSchema.shape);
    for (const forbidden of FORBIDDEN) {
      expect(shape, `the journal schema exposes a "${forbidden}" field`).not.toContain(forbidden);
    }
    // strictObject, so an unknown field is a hard parse failure rather than silently dropped.
    expect(
      JournalEventSchema.safeParse({
        journalEventId: 'x:INGRESS_RECEIVED:accepted:y',
        schemaVersion: EXECUTION_JOURNAL_SCHEMA_VERSION,
        recordedAt: '2026-08-26T10:00:05.000Z',
        systemId: 'lead-rescue',
        incidentId: 'x',
        correlationId: 'inc-x',
        type: 'INGRESS_RECEIVED',
        outcome: 'ACCEPTED',
        reasoning: 'first I considered, then I concluded',
      }).success,
    ).toBe(false);
  });

  it('14. querying by incident and by correlation returns chronologically coherent history', async () => {
    const dir = tempDir('journal-chronology-');
    try {
      const journal = new FileExecutionJournal(path.join(dir, 'journal'));
      const store = new FileWaitIncidentStore(path.join(dir, 'incidents.json'));
      const claims = new FileOperationClaimStore(path.join(dir, 'claims'));
      const incidentId = 'journal-chronology-1';
      const ready = await clearForDespatch(store, incidentId, { ...WAIT_DEPS_BASE, journal });
      await dispatchAuthorizedOffer(
        store,
        claims,
        incidentId,
        ready.revision,
        despatchEvent(incidentId),
        { ...WAIT_DEPS_BASE, journal, executor: new ConfigurableExecutor('journal-test-executor', { kind: 'SUCCEEDED' }) },
        'runtime-a',
      );

      const reader = new FileExecutionJournal(path.join(dir, 'journal'));
      const byIncident = await reader.readIncident(incidentId);
      expect(byIncident.length).toBeGreaterThanOrEqual(2);

      const times = byIncident.map((e) => Date.parse(e.recordedAt));
      expect(times, 'history is not returned in chronological order').toEqual([...times].sort((a, b) => a - b));

      const byCorrelation = await reader.readCorrelation(`inc-${incidentId}`);
      expect(byCorrelation.map((e) => e.journalEventId)).toEqual(byIncident.map((e) => e.journalEventId));

      // The operator grammar is reconstructible from what was recorded.
      const stages = byIncident.map((e) => STAGE_FOR_EVENT_TYPE[e.type]);
      expect(stages).toContain('AUTHORITY');
      expect(stages).toContain('ACTION');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('15. an empty history is represented honestly, never as a successful run', async () => {
    const dir = tempDir('journal-empty-');
    try {
      const reader = new FileExecutionJournal(path.join(dir, 'journal'));

      // An incident that never ran has no history — an empty list, not a fabricated success.
      const history = await reader.readIncident('never-existed');
      expect(history).toEqual([]);
      expect(await reader.listIncidents()).toEqual([]);

      // And the null recorder, used wherever no journal is configured, says so plainly rather
      // than reporting a successful write.
      const outcome = await NULL_EXECUTION_JOURNAL.record({
        journalEventId: 'x:INGRESS_RECEIVED:accepted:y',
        schemaVersion: EXECUTION_JOURNAL_SCHEMA_VERSION,
        recordedAt: '2026-08-26T10:00:05.000Z',
        systemId: 'lead-rescue',
        incidentId: 'x',
        correlationId: 'inc-x',
        type: 'INGRESS_RECEIVED',
        outcome: 'ACCEPTED',
      });
      expect(outcome.kind).toBe('DROPPED');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('execution journal — contract integrity', () => {
  it('16. recording the same journal event id twice is idempotent, never a doubled history', async () => {
    const dir = tempDir('journal-idempotent-');
    try {
      const journal = new FileExecutionJournal(path.join(dir, 'journal'));
      const event: JournalEvent = {
        journalEventId: 'dup:INGRESS_RECEIVED:accepted:1',
        schemaVersion: EXECUTION_JOURNAL_SCHEMA_VERSION,
        recordedAt: '2026-08-26T10:00:05.000Z',
        systemId: 'lead-rescue',
        incidentId: 'dup',
        correlationId: 'inc-dup',
        type: 'INGRESS_RECEIVED',
        outcome: 'ACCEPTED',
      };

      expect((await journal.record(event)).kind).toBe('RECORDED');
      expect((await journal.record(event)).kind).toBe('ALREADY_RECORDED');
      expect(await journal.readIncident('dup')).toHaveLength(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('17. the journal mechanism vocabulary is a superset of the canonical decision mechanisms', () => {
    for (const mechanism of DECISION_MECHANISMS) {
      expect(JOURNAL_MECHANISMS, `journal mechanism vocabulary dropped canonical "${mechanism}"`).toContain(mechanism);
    }
    // The one addition, deliberately named: an execution attempt is not a decision.
    expect(JOURNAL_MECHANISMS).toContain('EXECUTION');
  });

  it('18. every journal event type declares exactly one operator stage', () => {
    for (const type of JOURNAL_EVENT_TYPES) {
      expect(STAGE_FOR_EVENT_TYPE[type], `event type "${type}" has no stage`).toBeTruthy();
    }
    expect(Object.keys(STAGE_FOR_EVENT_TYPE).sort()).toEqual([...JOURNAL_EVENT_TYPES].sort());
  });

  it('19. the observable outcome vocabulary keeps the four states an operator must never confuse', () => {
    for (const outcome of ['EXECUTED', 'SUPPRESSED_DUPLICATE', 'FAILED_BEFORE_EFFECT', 'OUTCOME_UNKNOWN'] as const) {
      expect(OBSERVABLE_OUTCOMES).toContain(outcome);
    }
  });

  it('21. when journal persistence itself fails, the write is reported DROPPED and never raised', async () => {
    const dir = tempDir('journal-unwritable-');
    try {
      // A FILE where the journal's root directory should be: `mkdir` fails with ENOTDIR on
      // every platform, so this is a genuine, deterministic persistence failure rather than a
      // permissions test that a privileged runner could pass by accident.
      const blocked = path.join(dir, 'not-a-directory');
      writeFileSync(blocked, 'this is a file, not a journal directory', 'utf8');
      const journal = new FileExecutionJournal(blocked);

      const outcome = await journal.record({
        journalEventId: 'blocked:INGRESS_RECEIVED:accepted:1',
        schemaVersion: EXECUTION_JOURNAL_SCHEMA_VERSION,
        recordedAt: '2026-08-26T10:00:05.000Z',
        systemId: 'lead-rescue',
        incidentId: 'blocked',
        correlationId: 'inc-blocked',
        type: 'INGRESS_RECEIVED',
        outcome: 'ACCEPTED',
      });

      // The guarantee, exactly: reported, not thrown, and not silently reported as success.
      expect(outcome.kind).toBe('DROPPED');
      if (outcome.kind !== 'DROPPED') throw new Error('unreachable');
      expect(outcome.reason.length).toBeGreaterThan(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('20. a journal directory containing an unreadable incident shard is reported, not silently skipped', async () => {
    const dir = tempDir('journal-unreadable-');
    try {
      const root = path.join(dir, 'journal');
      const incidentDir = path.join(root, encodeURIComponent('broken-incident'));
      mkdirSync(incidentDir, { recursive: true });
      writeFileSync(path.join(incidentDir, 'not-json.json'), '{ this is not json', 'utf8');

      const reader = new FileExecutionJournal(root);
      await expect(reader.readIncident('broken-incident')).rejects.toBeInstanceOf(MalformedJournalRecordError);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
