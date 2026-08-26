import { describe, expect, it } from 'vitest';
import { LEAD_RESCUE } from '@/data/systems';
import { KESTREL } from '@/data/profiles/kestrel/profile';
import { LEAD_RESCUE_HANDLERS } from '@/lib/engine/handlers/lead-rescue';
import { leadRescueScenarioBySlug } from '@/data/profiles/kestrel/scenarios/lead-rescue';
import { runScenario } from '@/lib/engine/run';
import { FixtureDecisionProvider } from '@/lib/ports/decision-provider';
import { InMemoryWaitIncidentStore, type WaitIncidentRecord, type WaitIncidentStore } from '@/lib/persistence/wait-incident-store';
import { InMemoryOperationClaimStore } from '@/lib/persistence/operation-claim-store';
import { InMemoryExecutionJournal } from '@/lib/persistence/execution-journal-store';
import type { WaitResumeDeps } from '@/lib/engine/wait-resume';
import type { ExecutionMode, Scenario, SendOutcome, VerifyOutcome } from '@/lib/model/runtime';
import type { SendRequest, VerifyRequest, SideEffectExecutor } from '@/lib/ports/side-effect-executor';
import {
  OPERATOR_PRINCIPALS,
  authenticateOperator,
  isAuthenticatedPrincipal,
  mintOperatorToken,
  requireAuthenticatedPrincipal,
  type AuthenticatedPrincipal,
} from '@/lib/auth/operator-identity';
import {
  decideAsOperator,
  dispatchAsOperator,
  type OperatorActionDeps,
} from '@/lib/service/operator-decision';
import { DecideRequestSchema } from '@/app/api/lead-rescue/wait-incidents/decide/route';
import { DispatchRequestSchema } from '@/app/api/lead-rescue/wait-incidents/dispatch/route';

/**
 * FALSIFYING TESTS for AUTHENTICATED OPERATOR IDENTITY BOUND TO AUTHORITY.
 *
 * The weakness under test: until this pass, a caller chose its own authority by putting
 * `decidedBy: 'client-partner'` in a request body. Role ceilings were enforced faithfully —
 * against an identity nobody ever verified. Every test below is written to fail if identity
 * can be asserted rather than proven, or if a refusal happens anywhere other than BEFORE
 * consequential execution.
 *
 * IDENTITY AND AUTHORIZATION STAY SEPARATE, and the tests are separated the same way:
 * authentication answers only WHO (tests 1–4, 15), the profile answers WHAT THEY MAY DO
 * (tests 5–8), and the engine remains the sole authority on consequential policy (9–12).
 */

const SIGNING_KEY = 'test-signing-key-not-a-real-secret-0123456789abcdef';
const NOW = '2026-08-26T12:00:00.000Z';
const EXPIRES = '2026-08-26T13:00:00.000Z';

/** Two synthetic principals deliberately spanning the authority gate. */
const PARTNER = 'op-marisol-adeyemi';
const ANALYST = 'op-tobias-lindqvist';

const FOUND_SCENARIO = leadRescueScenarioBySlug('reviewed-offer-elapses');
if (FOUND_SCENARIO === undefined) throw new Error('fixture scenario "reviewed-offer-elapses" not found');
const REVIEW_SCENARIO: Scenario = FOUND_SCENARIO;

class CountingExecutor implements SideEffectExecutor {
  readonly id = 'operator-auth-test-executor';
  readonly mode: ExecutionMode = 'SIMULATED';
  readonly description = 'Counts every genuine execution attempt so "zero execution" is measured, not assumed.';
  invocations = 0;
  async attemptSend(request: SendRequest): Promise<SendOutcome> {
    void request;
    this.invocations += 1;
    return { kind: 'SUCCEEDED' };
  }
  async attemptVerify(request: VerifyRequest): Promise<VerifyOutcome> {
    void request;
    throw new Error('not used');
  }
}

function waitDeps(executor?: SideEffectExecutor, journal?: InMemoryExecutionJournal): WaitResumeDeps {
  return {
    system: LEAD_RESCUE,
    profile: KESTREL,
    handlers: LEAD_RESCUE_HANDLERS,
    reevaluationEventType: 'lead.wait.reevaluated',
    ...(executor === undefined ? {} : { executor }),
    ...(journal === undefined ? {} : { journal }),
  };
}

function deps(overrides: Partial<OperatorActionDeps> = {}): OperatorActionDeps {
  return {
    store: new InMemoryWaitIncidentStore(),
    claimStore: new InMemoryOperationClaimStore(),
    wait: waitDeps(),
    signingKey: SIGNING_KEY,
    runtimeId: 'test-runtime',
    ...overrides,
  };
}

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

function bearer(principalId: string, key = SIGNING_KEY): string {
  return `Bearer ${mintOperatorToken(principalId, key, NOW, EXPIRES)}`;
}

function decideInput(incidentId: string, expectedRevision: number, authorizationHeader: string | null) {
  return {
    authorizationHeader,
    incidentId,
    expectedRevision,
    decision: 'CLEARED_TO_PROCEED' as const,
    rationale: 'Reviewed personally; no blocker to proceeding.',
    nowIso: NOW,
  };
}

// ---------------------------------------------------------------------------

describe('operator authentication — identity is proven, never asserted', () => {
  it('1. a request body cannot choose its own authority: `decidedBy` is not an accepted field', () => {
    const withClaimedRole = {
      incidentId: 'x',
      expectedRevision: 1,
      decidedBy: 'client-partner',
      decision: 'CLEARED_TO_PROCEED',
      rationale: 'r',
    };
    expect(
      DecideRequestSchema.safeParse(withClaimedRole).success,
      'the decide body still accepts a caller-chosen identity',
    ).toBe(false);
    expect(
      DispatchRequestSchema.safeParse({
        incidentId: 'x',
        expectedRevision: 1,
        decidedBy: 'client-partner',
        target: 't',
        offerSummary: 'o',
      }).success,
      'the dispatch body still accepts a caller-chosen identity',
    ).toBe(false);

    // The same body WITHOUT the identity claim is otherwise well-formed, so the rejection
    // above is genuinely about identity and not about some unrelated schema failure.
    const clean: Record<string, unknown> = { ...withClaimedRole };
    delete clean['decidedBy'];
    expect(DecideRequestSchema.safeParse(clean).success).toBe(true);
  });

  it('2. missing authentication is rejected', async () => {
    const result = await authenticateOperator(null, SIGNING_KEY, NOW, KESTREL);
    expect(result.kind).toBe('REFUSED');
    if (result.kind !== 'REFUSED') throw new Error('unreachable');
    expect(result.reason).toBe('MISSING_CREDENTIAL');
  });

  it('3. malformed authentication is rejected', async () => {
    for (const header of ['Bearer', 'Bearer not-a-token', 'Basic abc', 'Bearer v1.only-two.parts.extra', bearer(PARTNER).slice(7)]) {
      const result = await authenticateOperator(header, SIGNING_KEY, NOW, KESTREL);
      expect(result.kind, `header "${header}" was accepted`).toBe('REFUSED');
      if (result.kind !== 'REFUSED') throw new Error('unreachable');
      expect(['MALFORMED_CREDENTIAL', 'INVALID_SIGNATURE']).toContain(result.reason);
    }
  });

  it('4. tampered authentication is rejected — payload edits and foreign keys both fail', async () => {
    // Swap the principal in the payload while keeping the original signature.
    const token = mintOperatorToken(ANALYST, SIGNING_KEY, NOW, EXPIRES);
    const [version, payload, signature] = token.split('.');
    const decoded = JSON.parse(Buffer.from(payload as string, 'base64url').toString('utf8')) as Record<string, unknown>;
    decoded['principalId'] = PARTNER;
    const forged = `${version}.${Buffer.from(JSON.stringify(decoded)).toString('base64url')}.${signature}`;

    const tampered = await authenticateOperator(`Bearer ${forged}`, SIGNING_KEY, NOW, KESTREL);
    expect(tampered.kind, 'a tampered payload authenticated').toBe('REFUSED');
    if (tampered.kind !== 'REFUSED') throw new Error('unreachable');
    expect(tampered.reason).toBe('INVALID_SIGNATURE');

    // A token minted with a different key must not authenticate against this one.
    const foreign = await authenticateOperator(bearer(PARTNER, 'a-completely-different-signing-key'), SIGNING_KEY, NOW, KESTREL);
    expect(foreign.kind, 'a foreign-key token authenticated').toBe('REFUSED');

    // An expired token is refused even though its signature is perfectly valid.
    const expired = await authenticateOperator(bearer(PARTNER), SIGNING_KEY, '2026-08-27T00:00:00.000Z', KESTREL);
    expect(expired.kind).toBe('REFUSED');
    if (expired.kind !== 'REFUSED') throw new Error('unreachable');
    expect(expired.reason).toBe('EXPIRED');

    // An unknown principal fails closed even with a perfectly valid signature.
    const unknown = await authenticateOperator(bearer('op-nobody-at-all'), SIGNING_KEY, NOW, KESTREL);
    expect(unknown.kind).toBe('REFUSED');
    if (unknown.kind !== 'REFUSED') throw new Error('unreachable');
    expect(unknown.reason).toBe('UNKNOWN_PRINCIPAL');
  });

  it('15. a hand-built plain object is not a principal — downstream code cannot manufacture authority', () => {
    const forged = {
      principalId: PARTNER,
      displayName: 'Totally Real Partner',
      roleId: 'founder',
      authorityCeiling: 4,
      authenticatedAt: NOW,
    } as unknown as AuthenticatedPrincipal;

    expect(isAuthenticatedPrincipal(forged), 'a plain object passed as an authenticated principal').toBe(false);
    expect(() => requireAuthenticatedPrincipal(forged)).toThrow();

    // A genuinely authenticated one does pass, so the check is not simply always-false.
    return authenticateOperator(bearer(PARTNER), SIGNING_KEY, NOW, KESTREL).then((result) => {
      expect(result.kind).toBe('AUTHENTICATED');
      if (result.kind !== 'AUTHENTICATED') throw new Error('unreachable');
      expect(isAuthenticatedPrincipal(result.principal)).toBe(true);
      expect(() => requireAuthenticatedPrincipal(result.principal)).not.toThrow();
    });
  });
});

describe('operator authorization — authority comes from the profile, bound to the authenticated identity', () => {
  it('5. an authenticated low-authority principal cannot approve', async () => {
    const d = deps();
    const incidentId = 'auth-low-authority-1';
    const parked = await parkReviewCase(d.store, incidentId);

    const result = await decideAsOperator(decideInput(incidentId, parked.revision, bearer(ANALYST)), d);
    expect(result.kind).toBe('AUTHORIZATION_REFUSED');

    const after = await d.store.load(incidentId);
    expect(after?.revision, 'a refused decision still moved business state').toBe(parked.revision);
    expect(after?.engineState.lifecycleState).toBe('NEEDS_HUMAN');
  });

  it('6. an authenticated sufficient-authority principal can approve', async () => {
    const d = deps();
    const incidentId = 'auth-sufficient-1';
    const parked = await parkReviewCase(d.store, incidentId);

    const result = await decideAsOperator(decideInput(incidentId, parked.revision, bearer(PARTNER)), d);
    expect(result.kind).toBe('DECIDED');
    if (result.kind !== 'DECIDED') throw new Error('unreachable');
    expect(result.result.outcome).toBe('ACCEPTED');
    expect((await d.store.load(incidentId))?.engineState.lifecycleState).toBe('BOOKING_READY');
  });

  it('7. the accepted decision records the canonical authenticated principal, not caller prose', async () => {
    const d = deps();
    const incidentId = 'auth-canonical-identity-1';
    const parked = await parkReviewCase(d.store, incidentId);

    const result = await decideAsOperator(decideInput(incidentId, parked.revision, bearer(PARTNER)), d);
    expect(result.kind).toBe('DECIDED');
    if (result.kind !== 'DECIDED') throw new Error('unreachable');

    const registered = OPERATOR_PRINCIPALS.find((p) => p.principalId === PARTNER);
    expect(registered).toBeDefined();
    expect(result.principal.principalId).toBe(PARTNER);
    expect(result.principal.roleId, 'the role was not resolved from trusted configuration').toBe(registered?.roleId);

    // The engine saw the canonical role id, resolved from the registry — never a caller string.
    const decidedByInEvent = result.result.entries
      ?.flatMap((e) => e.decisions)
      .flatMap((decision) => decision.deterministicFacts)
      .find((f) => f.label === 'Decided by');
    const role = KESTREL.roles.find((r) => r.id === registered?.roleId);
    expect(decidedByInEvent?.value).toBe(role?.name);
  });

  it('8. a body identity conflicting with the authenticated principal cannot override it', async () => {
    // Structurally impossible: the wire contract has no field for it, so a conflicting claim
    // is rejected before any handler runs rather than being silently preferred or ignored.
    expect(
      DecideRequestSchema.safeParse({
        incidentId: 'x',
        expectedRevision: 1,
        decision: 'CLEARED_TO_PROCEED',
        rationale: 'r',
        decidedBy: 'founder',
      }).success,
    ).toBe(false);
    expect(Object.keys(DecideRequestSchema.shape)).not.toContain('decidedBy');

    // And the service takes no identity parameter at all: authority is a function of the
    // token alone, so the same body under two different tokens gets two different answers.
    const low = deps();
    const lowId = 'auth-conflict-low-1';
    const lowParked = await parkReviewCase(low.store, lowId);
    const refused = await decideAsOperator(decideInput(lowId, lowParked.revision, bearer(ANALYST)), low);

    const high = deps();
    const highId = 'auth-conflict-high-1';
    const highParked = await parkReviewCase(high.store, highId);
    const accepted = await decideAsOperator(decideInput(highId, highParked.revision, bearer(PARTNER)), high);

    expect(refused.kind).toBe('AUTHORIZATION_REFUSED');
    expect(accepted.kind).toBe('DECIDED');
  });

  it('9. a stale revision still fails, even for a valid high-authority principal', async () => {
    const d = deps();
    const incidentId = 'auth-stale-revision-1';
    const parked = await parkReviewCase(d.store, incidentId);

    const result = await decideAsOperator(decideInput(incidentId, parked.revision + 7, bearer(PARTNER)), d);
    expect(result.kind).toBe('DECIDED');
    if (result.kind !== 'DECIDED') throw new Error('unreachable');
    expect(result.result.outcome, 'a valid identity bypassed revision binding').toBe('STALE_REVISION');
    expect((await d.store.load(incidentId))?.engineState.lifecycleState).toBe('NEEDS_HUMAN');
  });
});

describe('operator authentication — refusal happens before anything consequential', () => {
  it('10. authentication failure produces zero execution attempts', async () => {
    const executor = new CountingExecutor();
    const d = deps({ wait: waitDeps(executor) });
    const incidentId = 'auth-zero-exec-unauthenticated-1';
    const parked = await parkReviewCase(d.store, incidentId);
    // Move the case to BOOKING_READY so a despatch is genuinely possible but for the identity.
    const cleared = await decideAsOperator(decideInput(incidentId, parked.revision, bearer(PARTNER)), d);
    expect(cleared.kind).toBe('DECIDED');
    const ready = await d.store.load(incidentId);
    expect(ready?.engineState.lifecycleState).toBe('BOOKING_READY');
    expect(executor.invocations).toBe(0);

    for (const header of [null, 'Bearer garbage', bearer(PARTNER, 'wrong-key')]) {
      const result = await dispatchAsOperator(
        {
          authorizationHeader: header,
          incidentId,
          expectedRevision: ready?.revision ?? 1,
          target: 'prospect@example.invalid',
          offerSummary: 'A 30-minute scoping call.',
          nowIso: NOW,
        },
        d,
      );
      expect(result.kind, `header "${String(header)}" reached execution`).toBe('AUTHENTICATION_REFUSED');
    }

    expect(executor.invocations, 'an unauthenticated request reached the execution boundary').toBe(0);
    expect((await d.store.load(incidentId))?.engineState.facts['offerSentAt']).toBeUndefined();
  });

  it('11. authorization failure produces zero execution attempts', async () => {
    const executor = new CountingExecutor();
    const d = deps({ wait: waitDeps(executor) });
    const incidentId = 'auth-zero-exec-underauthority-1';
    const parked = await parkReviewCase(d.store, incidentId);
    const cleared = await decideAsOperator(decideInput(incidentId, parked.revision, bearer(PARTNER)), d);
    expect(cleared.kind).toBe('DECIDED');
    const ready = await d.store.load(incidentId);

    const result = await dispatchAsOperator(
      {
        authorizationHeader: bearer(ANALYST),
        incidentId,
        expectedRevision: ready?.revision ?? 1,
        target: 'prospect@example.invalid',
        offerSummary: 'A 30-minute scoping call.',
        nowIso: NOW,
      },
      d,
    );

    expect(result.kind, 'an under-authority principal reached execution').toBe('AUTHORIZATION_REFUSED');
    expect(executor.invocations, 'an under-authority request reached the execution boundary').toBe(0);
    expect((await d.store.load(incidentId))?.engineState.facts['offerSentAt']).toBeUndefined();
  });

  it('12. replay cannot turn a previously rejected request into an authorized one', async () => {
    const executor = new CountingExecutor();
    const d = deps({ wait: waitDeps(executor) });
    const incidentId = 'auth-replay-1';
    const parked = await parkReviewCase(d.store, incidentId);

    const first = await decideAsOperator(decideInput(incidentId, parked.revision, bearer(ANALYST)), d);
    expect(first.kind).toBe('AUTHORIZATION_REFUSED');

    // The identical request, replayed. Nothing about having been seen before may soften it.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const replayed = await decideAsOperator(decideInput(incidentId, parked.revision, bearer(ANALYST)), d);
      expect(replayed.kind, `replay ${attempt + 1} was upgraded to authorized`).toBe('AUTHORIZATION_REFUSED');
    }

    // An unauthenticated request replayed after a SUCCESSFUL one is still refused: nothing
    // about a prior valid session leaks into a later credential-less call.
    const accepted = await decideAsOperator(decideInput(incidentId, parked.revision, bearer(PARTNER)), d);
    expect(accepted.kind).toBe('DECIDED');
    const afterAccept = await d.store.load(incidentId);
    const anonymous = await decideAsOperator(decideInput(incidentId, afterAccept?.revision ?? 1, null), d);
    expect(anonymous.kind).toBe('AUTHENTICATION_REFUSED');

    expect(executor.invocations).toBe(0);
    expect((await d.store.load(incidentId))?.engineState.lifecycleState).toBe('BOOKING_READY');
  });
});

describe('operator authentication — observable, non-authoritative, and secret-free', () => {
  it('13. the journal distinguishes authentication refusal, authorization refusal, acceptance and execution', async () => {
    const journal = new InMemoryExecutionJournal();
    const executor = new CountingExecutor();
    const d = deps({ wait: waitDeps(executor, journal) });
    const incidentId = 'auth-journal-1';
    const parked = await parkReviewCase(d.store, incidentId);

    await decideAsOperator(decideInput(incidentId, parked.revision, null), d); // authentication refusal
    await decideAsOperator(decideInput(incidentId, parked.revision, bearer(ANALYST)), d); // authorization refusal
    await decideAsOperator(decideInput(incidentId, parked.revision, bearer(PARTNER)), d); // accepted
    const ready = await d.store.load(incidentId);
    await dispatchAsOperator(
      {
        authorizationHeader: bearer(PARTNER),
        incidentId,
        expectedRevision: ready?.revision ?? 1,
        target: 'prospect@example.invalid',
        offerSummary: 'A 30-minute scoping call.',
        nowIso: NOW,
      },
      d,
    );

    const history = await journal.readIncident(incidentId);
    const authnRefusal = history.find((e) => e.type === 'OPERATOR_AUTHENTICATION' && e.outcome === 'REFUSED');
    const authzRefusal = history.find((e) => e.type === 'HUMAN_DECISION_RECORDED' && e.outcome === 'REFUSED');
    const accepted = history.find((e) => e.type === 'HUMAN_DECISION_RECORDED' && e.outcome === 'ACCEPTED');
    const executed = history.find((e) => e.type === 'DISPATCH_ATTEMPTED' && e.outcome === 'EXECUTED');

    expect(authnRefusal, 'an authentication refusal was invisible to an operator').toBeDefined();
    expect(authzRefusal, 'an authorization refusal was invisible to an operator').toBeDefined();
    expect(accepted, 'the accepted decision was not journalled').toBeDefined();
    expect(executed, 'the execution was not journalled').toBeDefined();

    // All four are genuinely distinguishable, not four spellings of the same record.
    const signatures = new Set([authnRefusal, authzRefusal, accepted, executed].map((e) => `${e?.type}:${e?.outcome}`));
    expect(signatures.size).toBe(4);

    // The accepted decision names the canonical principal; the authentication refusal names
    // nobody, because at that point nobody had been identified.
    expect(accepted?.actorId).toBe(PARTNER);
    expect(authnRefusal?.actorId).toBeUndefined();
  });

  it('14. no token, signature, or authorization header is ever persisted', async () => {
    const journal = new InMemoryExecutionJournal();
    const d = deps({ wait: waitDeps(new CountingExecutor(), journal) });
    const incidentId = 'auth-no-secrets-1';
    const parked = await parkReviewCase(d.store, incidentId);

    const token = mintOperatorToken(PARTNER, SIGNING_KEY, NOW, EXPIRES);
    await decideAsOperator(decideInput(incidentId, parked.revision, `Bearer ${token}`), d);
    await decideAsOperator(decideInput(incidentId, parked.revision, 'Bearer forged.token.value'), d);

    const serialised = JSON.stringify(await journal.readIncident(incidentId));
    expect(serialised, 'the journal retained a token').not.toContain(token);
    expect(serialised, 'the journal retained a signing key').not.toContain(SIGNING_KEY);
    expect(serialised.toLowerCase(), 'the journal retained an authorization header').not.toContain('bearer ');
    const [, , signature] = token.split('.');
    expect(serialised).not.toContain(signature as string);
  });
});
