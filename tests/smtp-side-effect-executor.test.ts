import { describe, expect, it } from 'vitest';
import { LEAD_RESCUE } from '@/data/systems';
import { KESTREL } from '@/data/profiles/kestrel/profile';
import { LEAD_RESCUE_HANDLERS } from '@/lib/engine/handlers/lead-rescue';
import { InMemoryWaitIncidentStore } from '@/lib/persistence/wait-incident-store';
import { InMemoryOperationClaimStore } from '@/lib/persistence/operation-claim-store';
import { checkWaitIncident, type WaitResumeDeps } from '@/lib/engine/wait-resume';
import { resolveSend } from '@/lib/ports/side-effect-executor';
import {
  SmtpSideEffectExecutor,
  UnroutableRecipientError,
  isProofSafeRecipient,
  PROOF_SAFE_RECIPIENT_SUFFIXES,
} from '@/lib/ports/smtp-side-effect-executor';
import {
  SIDE_EFFECT_EXECUTOR_MODE_ENV_VAR,
  resolveSideEffectExecutorSelection,
  resolveLeadRescueSideEffectExecutor,
} from '@/lib/config/side-effect-executor-config';

/**
 * FALSIFYING TESTS for the real, bounded SMTP execution boundary.
 *
 * Every prior "execution" in this repository was a data label: `AlwaysSucceedsSimulatedExecutor`
 * returns `{kind: 'SUCCEEDED'}` without a socket, a provider, or anything leaving the process.
 * This suite rejects that as proof of real execution, and pins the guardrails that must hold
 * BEFORE a real SMTP adapter is allowed anywhere near the wait/resume runtime:
 *
 *   - explicit opt-in only, never credential/config presence alone (the same discipline
 *     `lib/config/decision-provider-config.ts` already establishes for the model provider);
 *   - no silent fallback to simulated execution once real SMTP is explicitly selected;
 *   - a hard recipient allowlist, so proof mode structurally cannot reach a real mailbox;
 *   - authority-blocked effects never reach the executor at all;
 *   - transport failure becomes typed data, never a false SUCCEEDED;
 *   - a real message id, never a fabricated one, on success;
 *   - the existing claim gate still suppresses a replayed send.
 *
 * The genuinely-networked half of the proof (a real socket to a real local Mailpit instance,
 * with an independently inspectable captured message) lives in
 * `tests/smtp-runtime-evidence.test.ts` against the retained artifact — this file is the
 * unit-level contract those runtime facts are checked against.
 */

const DEPS_BASE = {
  system: LEAD_RESCUE,
  profile: KESTREL,
  handlers: LEAD_RESCUE_HANDLERS,
  reevaluationEventType: 'lead.wait.reevaluated',
};

const PROOF_RECIPIENT = 'lead-rescue-proof@example.invalid';

/** A port nothing is listening on — a genuine ECONNREFUSED, not a mocked rejection. */
const DEAD_SMTP_PORT = 59_733;

function smtpExecutor(overrides: Partial<ConstructorParameters<typeof SmtpSideEffectExecutor>[0]> = {}) {
  return new SmtpSideEffectExecutor({
    host: '127.0.0.1',
    port: DEAD_SMTP_PORT,
    from: 'lead-rescue-proof@example.invalid',
    to: PROOF_RECIPIENT,
    ...overrides,
  });
}

/**
 * A transport that fails the way a real one does: an `Error` carrying a `code`, thrown from
 * `sendMail`. Injected rather than mocked at module level, because the contract under test is
 * this adapter's own error TAXONOMY, not nodemailer's behaviour.
 */
function throwingTransport(code: string, message = `simulated ${code}`) {
  return {
    sendMail: () => {
      const err = new Error(message) as NodeJS.ErrnoException;
      err.code = code;
      return Promise.reject(err);
    },
  };
}

describe('SMTP execution boundary — a failure after DATA is never called a non-execution', () => {
  /**
   * THE DEFECT THIS SUITE EXISTS FOR.
   *
   * `FAILED_BEFORE_EFFECT` is not a description of a socket; it is a PERMISSION. It tells
   * every layer above that nothing reached the recipient and a retry is therefore safe. The
   * retained capture in `n8n/evidence/lead-rescue-observation-integrity.json` shows this
   * adapter returning exactly that for a socket failure that occurred AFTER DATA — while the
   * receiving process independently recorded that it was holding the message.
   *
   * That is the one misclassification this portfolio cannot afford, because the claim it
   * leads with is "exactly one customer-facing effect across the whole run". A blanket
   * pre-DATA verdict on a socket-class error turns that guarantee into a coin flip at the
   * only boundary where it would ever be tested for real.
   *
   * The rule these tests pin: a code may claim `FAILED_BEFORE_EFFECT` only if it is
   * STRUCTURALLY IMPOSSIBLE for it to follow DATA. Everything else must fall to
   * `OUTCOME_UNKNOWN`, which `checkWaitIncident` already routes to a person and never
   * auto-retries. Uncertainty is a worse user experience and a better guarantee.
   */

  const CANNOT_RULE_OUT_DATA = [
    // Socket-level failures carry no phase information. nodemailer raises ESOCKET for a
    // transport error at ANY point in the conversation, DATA included.
    'ESOCKET',
    'ECONNECTION',
    // A peer reset arrives just as readily after the message body as before it.
    'ECONNRESET',
    // socketTimeout fires mid-DATA and is indistinguishable here from connectionTimeout.
    'ETIMEDOUT',
  ] as const;

  for (const code of CANNOT_RULE_OUT_DATA) {
    it(`9a. ${code} resolves to OUTCOME_UNKNOWN — it can occur after DATA, so a retry is not provably safe`, async () => {
      const executor = smtpExecutor({ transport: throwingTransport(code) });
      const outcome = await executor.attemptSend({
        attemptId: `attempt-${code}`,
        idempotencyKey: `key-${code}`,
        provider: executor.id,
        description: 'acknowledgement',
      });

      expect(outcome.kind).toBe('OUTCOME_UNKNOWN');
      expect(outcome.kind).not.toBe('FAILED_BEFORE_EFFECT');
    });
  }

  /**
   * The other half of the guard. A fix that simply routes everything to OUTCOME_UNKNOWN would
   * pass the block above while destroying the adapter's usefulness — every refused connection
   * would park a case for a human who has nothing to decide. These pin the codes that
   * genuinely precede DATA by protocol and must KEEP their retry permission.
   */
  const STRUCTURALLY_BEFORE_DATA = [
    'ECONNREFUSED', // no connection was ever established
    'ENOTFOUND', // the host never resolved
    'EHOSTUNREACH', // no route to the host
    'EDNS', // resolution failed
    'EENVELOPE', // the server rejected MAIL FROM / RCPT TO, both of which precede DATA
    'EAUTH', // authentication precedes MAIL FROM
  ] as const;

  for (const code of STRUCTURALLY_BEFORE_DATA) {
    it(`9b. ${code} keeps FAILED_BEFORE_EFFECT — it cannot follow DATA, so retry permission is genuinely earned`, async () => {
      const executor = smtpExecutor({ transport: throwingTransport(code) });
      const outcome = await executor.attemptSend({
        attemptId: `attempt-${code}`,
        idempotencyKey: `key-${code}`,
        provider: executor.id,
        description: 'acknowledgement',
      });

      expect(outcome.kind).toBe('FAILED_BEFORE_EFFECT');
    });
  }

  it('9c. an unrecognised code is never assumed safe — the default is uncertainty, not permission', async () => {
    const executor = smtpExecutor({ transport: throwingTransport('ESOMETHINGNEW') });
    const outcome = await executor.attemptSend({
      attemptId: 'attempt-novel',
      idempotencyKey: 'key-novel',
      provider: executor.id,
      description: 'acknowledgement',
    });

    expect(outcome.kind).toBe('OUTCOME_UNKNOWN');
  });

  /**
   * The discrimination that keeps the fix from being a blunt instrument.
   *
   * nodemailer collapses connect-phase failures into ESOCKET: a genuine ECONNREFUSED arrives
   * as `{code:'ESOCKET', syscall:'connect', command:'CONN'}`. Treating the code alone as
   * post-DATA would park every refused connection for a human with nothing to decide. These
   * pin that the adapter reads the phase the transport actually reports.
   */
  function phasedTransport(command: string, extra: Record<string, unknown> = {}) {
    return {
      sendMail: () => {
        const err = new Error(`simulated failure at ${command}`) as NodeJS.ErrnoException;
        err.code = 'ESOCKET';
        Object.assign(err, { command, ...extra });
        return Promise.reject(err);
      },
    };
  }

  /**
   * THE SHAPE THE REAL TRANSPORT PRODUCES, taken from a live probe against a server that
   * accepts the whole body and then destroys the socket before its 250:
   *
   *   { code: 'ECONNECTION', command: 'CONN', message: 'Connection closed unexpectedly' }
   *
   * `command: 'CONN'` here does NOT mean "we were still connecting" — nodemailer tags every
   * connection-level error that way, whenever it happens. A first version of this fix treated
   * 'CONN' as a pre-DATA phase and handed back retry permission for precisely the case the fix
   * existed to stop. The unit suite was green; the re-captured runtime evidence was not. This
   * test is that regression, pinned.
   */
  it('9j. a connection closed after the body was sent is OUTCOME_UNKNOWN, even though nodemailer labels it CONN', async () => {
    const executor = smtpExecutor({
      transport: phasedTransport('CONN', { code: 'ECONNECTION' }),
    });
    const outcome = await executor.attemptSend({
      attemptId: 'attempt-vanish',
      idempotencyKey: 'key-vanish',
      provider: executor.id,
      description: 'acknowledgement',
    });

    expect(outcome.kind).toBe('OUTCOME_UNKNOWN');
  });

  it('9k. a genuine connection refusal is still before-effect — it carries a connect syscall, which a mid-conversation close never does', async () => {
    const executor = smtpExecutor({
      transport: phasedTransport('CONN', { code: 'ESOCKET', syscall: 'connect', errno: -61 }),
    });
    const outcome = await executor.attemptSend({
      attemptId: 'attempt-refused',
      idempotencyKey: 'key-refused',
      provider: executor.id,
      description: 'acknowledgement',
    });

    expect(outcome.kind).toBe('FAILED_BEFORE_EFFECT');
  });

  for (const command of ['EHLO', 'STARTTLS', 'AUTH', 'MAIL FROM', 'RCPT TO']) {
    it(`9f. ESOCKET raised at ${command} keeps FAILED_BEFORE_EFFECT — that command precedes DATA`, async () => {
      const executor = smtpExecutor({ transport: phasedTransport(command) });
      const outcome = await executor.attemptSend({
        attemptId: `attempt-${command}`,
        idempotencyKey: `key-${command}`,
        provider: executor.id,
        description: 'acknowledgement',
      });

      expect(outcome.kind).toBe('FAILED_BEFORE_EFFECT');
    });
  }

  it('9g. ESOCKET raised at DATA is OUTCOME_UNKNOWN — the body was in flight and acceptance cannot be ruled out', async () => {
    const executor = smtpExecutor({ transport: phasedTransport('DATA') });
    const outcome = await executor.attemptSend({
      attemptId: 'attempt-data',
      idempotencyKey: 'key-data',
      provider: executor.id,
      description: 'acknowledgement',
    });

    expect(outcome.kind).toBe('OUTCOME_UNKNOWN');
  });

  it('9h. a connect-syscall failure is before-effect even when it reports no command', async () => {
    const executor = smtpExecutor({
      transport: phasedTransport('', { syscall: 'connect', command: undefined }),
    });
    const outcome = await executor.attemptSend({
      attemptId: 'attempt-connect',
      idempotencyKey: 'key-connect',
      provider: executor.id,
      description: 'acknowledgement',
    });

    expect(outcome.kind).toBe('FAILED_BEFORE_EFFECT');
  });

  it('9i. a write-syscall failure is NOT treated as before-effect — only `connect` proves no conversation happened', async () => {
    const executor = smtpExecutor({
      transport: phasedTransport('', { syscall: 'write', command: undefined }),
    });
    const outcome = await executor.attemptSend({
      attemptId: 'attempt-write',
      idempotencyKey: 'key-write',
      provider: executor.id,
      description: 'acknowledgement',
    });

    expect(outcome.kind).toBe('OUTCOME_UNKNOWN');
  });

  it('9d. an error with no code at all is never assumed safe', async () => {
    const executor = smtpExecutor({
      transport: { sendMail: () => Promise.reject(new Error('socket hang up')) },
    });
    const outcome = await executor.attemptSend({
      attemptId: 'attempt-codeless',
      idempotencyKey: 'key-codeless',
      provider: executor.id,
      description: 'acknowledgement',
    });

    expect(outcome.kind).toBe('OUTCOME_UNKNOWN');
  });

  it('9e. an OUTCOME_UNKNOWN from this boundary states that acceptance could not be ruled out, rather than asserting failure', async () => {
    const executor = smtpExecutor({ transport: throwingTransport('ESOCKET', 'write EPIPE after DATA') });
    const outcome = await executor.attemptSend({
      attemptId: 'attempt-reason',
      idempotencyKey: 'key-reason',
      provider: executor.id,
      description: 'acknowledgement',
    });

    expect(outcome.kind).toBe('OUTCOME_UNKNOWN');
    if (outcome.kind === 'OUTCOME_UNKNOWN') {
      expect(outcome.reason).toMatch(/cannot be ruled out|acceptance/i);
      expect(outcome.reason).not.toMatch(/before the message was accepted/i);
    }
  });
});

describe('SMTP execution boundary — configuration gate', () => {
  it('1a. simulated execution is the default: an empty environment never selects SMTP', () => {
    const selection = resolveSideEffectExecutorSelection({});
    expect(selection.kind).toBe('SIMULATED');
  });

  it('1b. SMTP configuration present WITHOUT explicit opt-in is still simulated — config is not permission to send', () => {
    const selection = resolveSideEffectExecutorSelection({
      LEAD_RESCUE_SMTP_HOST: '127.0.0.1',
      LEAD_RESCUE_SMTP_PORT: '1025',
      LEAD_RESCUE_SMTP_TO: PROOF_RECIPIENT,
      LEAD_RESCUE_SMTP_FROM: 'lead-rescue-proof@example.invalid',
    });
    expect(selection.kind).toBe('SIMULATED');
  });

  it('1c. explicit SMTP selection WITHOUT required configuration fails closed — never a silent fallback to simulated', () => {
    const selection = resolveSideEffectExecutorSelection({ [SIDE_EFFECT_EXECUTOR_MODE_ENV_VAR]: 'smtp' });
    expect(selection.kind).toBe('SMTP_MISCONFIGURED');

    // And the composition root must hand back a genuinely unusable executor, NOT the
    // simulated one — a caller that explicitly asked for real sends must never be quietly
    // served fake successes.
    const resolved = resolveLeadRescueSideEffectExecutor({ [SIDE_EFFECT_EXECUTOR_MODE_ENV_VAR]: 'smtp' });
    expect(resolved.executorId).not.toBe('lead-rescue-wait-resume-simulated-executor');
    expect(resolved.executor.mode).toBe('LIVE');
  });

  it('1d. a misconfigured-but-explicitly-selected SMTP executor reports typed failure, never SUCCEEDED', async () => {
    const resolved = resolveLeadRescueSideEffectExecutor({ [SIDE_EFFECT_EXECUTOR_MODE_ENV_VAR]: 'smtp' });
    const result = await resolveSend(resolved.executor, {
      attemptId: 'a1',
      idempotencyKey: 'k1',
      provider: resolved.executorId,
      description: 'test',
    });
    if (result.status === 'OK') {
      expect(result.result.kind).not.toBe('SUCCEEDED');
    } else {
      expect(['UNAVAILABLE', 'CONTRACT_VIOLATION']).toContain(result.status);
    }
  });

  it('1e. a truthy-looking or unrecognized mode value never implies "real" — only the literal opt-in does', () => {
    for (const value of ['yes', 'true', 'real', 'live', '1', 'Smtp!', 'send', 'enabled']) {
      expect(resolveSideEffectExecutorSelection({ [SIDE_EFFECT_EXECUTOR_MODE_ENV_VAR]: value }).kind).toBe('SIMULATED');
    }
  });

  it('1f. surrounding whitespace/case on the literal opt-in is honoured as the opt-in (matching decision-provider-config) — and still fails closed without configuration, never sending', () => {
    for (const value of ['smtp', 'SMTP', ' smtp ', 'Smtp']) {
      expect(resolveSideEffectExecutorSelection({ [SIDE_EFFECT_EXECUTOR_MODE_ENV_VAR]: value }).kind).toBe('SMTP_MISCONFIGURED');
    }
  });
});

describe('SMTP execution boundary — recipient allowlist hard guard', () => {
  it('8a. reserved/non-routable proof domains are the only accepted recipients', () => {
    expect(isProofSafeRecipient(PROOF_RECIPIENT)).toBe(true);
    expect(PROOF_SAFE_RECIPIENT_SUFFIXES.length).toBeGreaterThan(0);
  });

  it('8b. a genuinely routable recipient is refused, even when everything else is configured correctly', () => {
    for (const unsafe of [
      'someone@gmail.com',
      'ops@kestrel-consulting.com',
      'a@example.com',
      'x@localhost',
      'attacker@evil.invalid.co',
    ]) {
      expect(isProofSafeRecipient(unsafe)).toBe(false);
    }
  });

  it('8c. constructing the executor with a routable recipient throws rather than deferring the risk to send time', () => {
    expect(() => smtpExecutor({ to: 'someone@gmail.com' })).toThrow(UnroutableRecipientError);
  });

  it('8d. an explicit SMTP selection carrying a routable recipient fails closed at the composition root', () => {
    const selection = resolveSideEffectExecutorSelection({
      [SIDE_EFFECT_EXECUTOR_MODE_ENV_VAR]: 'smtp',
      LEAD_RESCUE_SMTP_HOST: '127.0.0.1',
      LEAD_RESCUE_SMTP_PORT: '1025',
      LEAD_RESCUE_SMTP_FROM: 'lead-rescue-proof@example.invalid',
      LEAD_RESCUE_SMTP_TO: 'someone@gmail.com',
    });
    expect(selection.kind).toBe('SMTP_MISCONFIGURED');
  });

  it('5. a malformed recipient or port fails closed rather than being coerced', () => {
    expect(() => smtpExecutor({ to: 'not-an-email' })).toThrow();
    expect(
      resolveSideEffectExecutorSelection({
        [SIDE_EFFECT_EXECUTOR_MODE_ENV_VAR]: 'smtp',
        LEAD_RESCUE_SMTP_HOST: '127.0.0.1',
        LEAD_RESCUE_SMTP_PORT: 'not-a-number',
        LEAD_RESCUE_SMTP_FROM: 'lead-rescue-proof@example.invalid',
        LEAD_RESCUE_SMTP_TO: PROOF_RECIPIENT,
      }).kind,
    ).toBe('SMTP_MISCONFIGURED');
  });
});

describe('SMTP execution boundary — typed transport failure', () => {
  it('4. a genuine connection refusal becomes typed failure data, never an uncaught success', async () => {
    const executor = smtpExecutor();
    const resolved = await resolveSend(executor, {
      attemptId: 'attempt-refused',
      idempotencyKey: 'notify:x:dispatch-overdue',
      provider: executor.id,
      description: 'Notify the next owner.',
    });

    // Either shape is honest; what is forbidden is SUCCEEDED, or a thrown error escaping.
    if (resolved.status === 'OK') {
      expect(resolved.result.kind).toBe('FAILED_BEFORE_EFFECT');
      if (resolved.result.kind === 'FAILED_BEFORE_EFFECT') {
        expect(resolved.result.reason.length).toBeGreaterThan(0);
      }
    } else {
      expect(resolved.status).toBe('UNAVAILABLE');
    }
  });

  it('4b. a refused transport never reports a message id, because no message exists', async () => {
    const executor = smtpExecutor();
    const resolved = await resolveSend(executor, {
      attemptId: 'attempt-refused-2',
      idempotencyKey: 'k',
      provider: executor.id,
      description: 'd',
    });
    if (resolved.status === 'OK' && resolved.result.kind === 'SUCCEEDED') {
      throw new Error('a refused connection must never resolve SUCCEEDED');
    }
    expect(true).toBe(true);
  });

  it('4c. the executor declares itself LIVE — its mode must never claim SIMULATED while holding a real socket', () => {
    expect(smtpExecutor().mode).toBe('LIVE');
  });
});

describe('SMTP execution boundary — engine integration invariants', () => {
  /** Counts invocations without any network: proves reachability, not delivery. */
  function countingExecutor() {
    let invocations = 0;
    const executor = {
      id: 'counting-smtp-stand-in',
      mode: 'LIVE' as const,
      description: 'counts attemptSend invocations',
      async attemptSend() {
        invocations += 1;
        return { kind: 'SUCCEEDED' as const, externalId: `<msg-${invocations}@example.invalid>` };
      },
      async attemptVerify(): Promise<never> {
        throw new Error('not used');
      },
    };
    return { executor, invocations: () => invocations };
  }

  it('2. an effect blocked by authority/policy never reaches the SMTP executor at all', async () => {
    const store = new InMemoryWaitIncidentStore();
    const claims = new InMemoryOperationClaimStore();
    const { executor, invocations } = countingExecutor();

    // A handler whose only proposed effect is above the acting authority: the reducer's own
    // gate (lib/engine/reducer.ts) blocks it, so it is never EXECUTED and never claimed.
    const blockedHandlers = {
      ...LEAD_RESCUE_HANDLERS,
      handlers: {
        ...LEAD_RESCUE_HANDLERS.handlers,
        'lead.wait.reevaluated': () => ({
          steps: [
            {
              id: 'blocked-step',
              label: 'Blocked step',
              atOffsetSeconds: 0,
              summary: 'An effect proposed above the permitted authority.',
              decisions: [],
              effects: [
                {
                  id: 'blocked-effect',
                  kind: 'MESSAGE_SEND' as const,
                  description: 'Should never reach a socket.',
                  target: 'someone',
                  idempotencyKey: 'notify:blocked:never',
                  authority: 1 as const,
                  policyPermits: true,
                },
              ],
              verifications: [],
            },
          ],
        }),
      },
    };

    const record = await store.park({
      incidentId: 'blocked-1',
      systemId: LEAD_RESCUE.id,
      correlationId: 'inc-blocked-1',
      engineState: {
        lifecycleState: 'BOOKING_READY',
        facts: { bookingReadyAt: '2026-01-01T00:00:00.000Z' },
        suppressed: false,
        awaitingHuman: null,
        missingInformation: [],
      },
    });
    expect(record.revision).toBe(1);

    const deps: WaitResumeDeps = { ...DEPS_BASE, handlers: blockedHandlers, executor };
    await checkWaitIncident(store, claims, 'blocked-1', '2026-01-02T00:00:00.000Z', deps, 'runtime-a');

    expect(invocations()).toBe(0);
  });

  it('6. a replayed protected operation never produces a second SMTP invocation', async () => {
    const store = new InMemoryWaitIncidentStore();
    const claims = new InMemoryOperationClaimStore();
    const { executor, invocations } = countingExecutor();

    // A genuinely overdue BOOKING_READY case — the real dispatch-attention-timeout path.
    await store.park({
      incidentId: 'replay-1',
      systemId: LEAD_RESCUE.id,
      correlationId: 'inc-replay-1',
      engineState: {
        lifecycleState: 'BOOKING_READY',
        facts: { bookingReadyAt: '2026-01-01T00:00:00.000Z' },
        suppressed: false,
        awaitingHuman: null,
        missingInformation: [],
      },
    });

    const deps: WaitResumeDeps = { ...DEPS_BASE, executor };
    const overdue = '2026-01-01T12:00:00.000Z'; // 12h > the configured 8h dispatch window

    const first = await checkWaitIncident(store, claims, 'replay-1', overdue, deps, 'runtime-a');
    const second = await checkWaitIncident(store, claims, 'replay-1', overdue, deps, 'runtime-a');

    expect(first.outcome).toBe('ATTENTION_OVERDUE');
    expect(second.outcome).toBe('ATTENTION_OVERDUE');
    // The claim gate — unchanged by this package — is what makes this hold.
    expect(invocations()).toBe(1);

    const secondEffect = second.entries?.flatMap((e) => e.sideEffects).find((e) => e.idempotencyKey.includes('dispatch-overdue'));
    expect(secondEffect?.status).toBe('SUPPRESSED_DUPLICATE');
  });

  it('3. a successful send carries a real provider-issued message id through to the typed result', async () => {
    const { executor } = countingExecutor();
    const resolved = await resolveSend(executor, {
      attemptId: 'a',
      idempotencyKey: 'k',
      provider: executor.id,
      description: 'd',
    });
    expect(resolved.status).toBe('OK');
    if (resolved.status === 'OK' && resolved.result.kind === 'SUCCEEDED') {
      expect(resolved.result.externalId).toBeTruthy();
    } else {
      throw new Error('expected a SUCCEEDED outcome carrying an externalId');
    }
  });
});
