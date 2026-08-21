import { describe, expect, it } from 'vitest';
import {
  FixtureSideEffectExecutor,
  resolveSend,
  resolveVerify,
  type SendRequest,
  type VerifyRequest,
} from '@/lib/ports/side-effect-executor';
import type { SendOutcome, VerifyOutcome } from '@/lib/model/runtime';

const SUCCEEDED: SendOutcome = { kind: 'SUCCEEDED', externalId: 'msg_abc123' };
const UNKNOWN: SendOutcome = { kind: 'OUTCOME_UNKNOWN', reason: 'connection reset after submission' };

function sendRequest(overrides: Partial<SendRequest> = {}): SendRequest {
  return {
    attemptId: 'send-1',
    idempotencyKey: 'ack:entity-1',
    provider: 'transactional-email',
    description: 'Acknowledgement email',
    ...overrides,
  };
}

function verifyRequest(overrides: Partial<VerifyRequest> = {}): VerifyRequest {
  return {
    attemptId: 'verify-1',
    targetIdempotencyKey: 'ack:entity-1',
    provider: 'transactional-email',
    ...overrides,
  };
}

describe('SideEffectExecutor port', () => {
  it('declares itself simulated, so the UI can never present it as live', () => {
    const executor = new FixtureSideEffectExecutor({ 'send-1': SUCCEEDED }, {});
    expect(executor.mode).toBe('SIMULATED');
    expect(executor.description).toContain('No provider is invoked');
  });

  it('returns a fixture send outcome that satisfies its schema', async () => {
    const executor = new FixtureSideEffectExecutor({ 'send-1': SUCCEEDED }, {});
    const resolved = await resolveSend(executor, sendRequest());

    expect(resolved.status).toBe('OK');
    if (resolved.status === 'OK') {
      expect(resolved.result.kind).toBe('SUCCEEDED');
    }
  });

  it('never fabricates an external id the fixture did not supply', async () => {
    const executor = new FixtureSideEffectExecutor(
      { 'send-1': { kind: 'SUCCEEDED' } },
      {},
    );
    const resolved = await resolveSend(executor, sendRequest());

    expect(resolved.status).toBe('OK');
    if (resolved.status === 'OK' && resolved.result.kind === 'SUCCEEDED') {
      expect(resolved.result.externalId).toBeUndefined();
    }
  });

  it('surfaces OUTCOME_UNKNOWN as data, not as a thrown error or a disguised failure', async () => {
    const executor = new FixtureSideEffectExecutor({ 'send-1': UNKNOWN }, {});
    const resolved = await resolveSend(executor, sendRequest());

    expect(resolved.status).toBe('OK');
    if (resolved.status === 'OK') {
      expect(resolved.result.kind).toBe('OUTCOME_UNKNOWN');
    }
  });

  it('refuses a send outcome that fails its schema', async () => {
    const executor = new FixtureSideEffectExecutor(
      // RATE_LIMITED requires retryAfterSeconds; this fixture omits it.
      { 'send-1': { kind: 'RATE_LIMITED', reason: 'throttled' } as unknown as SendOutcome },
      {},
    );
    const resolved = await resolveSend(executor, sendRequest());
    expect(resolved.status).toBe('CONTRACT_VIOLATION');
  });

  it('reports an unauthored send attempt as unavailable rather than inventing one', async () => {
    const executor = new FixtureSideEffectExecutor({}, {});
    const resolved = await resolveSend(executor, sendRequest());

    expect(resolved.status).toBe('UNAVAILABLE');
    if (resolved.status === 'UNAVAILABLE') {
      expect(resolved.reason).toContain('no fixture send outcome authored');
    }
  });

  it('resolves a verify outcome independently of send outcomes', async () => {
    const confirmed: VerifyOutcome = { kind: 'CONFIRMED_NOT_EXECUTED', reason: 'provider log shows no send' };
    const executor = new FixtureSideEffectExecutor({}, { 'verify-1': confirmed });
    const resolved = await resolveVerify(executor, verifyRequest());

    expect(resolved.status).toBe('OK');
    if (resolved.status === 'OK') {
      expect(resolved.result.kind).toBe('CONFIRMED_NOT_EXECUTED');
    }
  });

  it('reports an unauthored verify attempt as unavailable rather than inventing one', async () => {
    const executor = new FixtureSideEffectExecutor({}, {});
    const resolved = await resolveVerify(executor, verifyRequest());

    expect(resolved.status).toBe('UNAVAILABLE');
    if (resolved.status === 'UNAVAILABLE') {
      expect(resolved.reason).toContain('no fixture verify outcome authored');
    }
  });

  it('converts every provider failure into data rather than throwing at the caller', async () => {
    const throwing = {
      id: 'broken',
      mode: 'SIMULATED' as const,
      description: 'always throws',
      attemptSend: async () => {
        throw new Error('provider unreachable');
      },
      attemptVerify: async () => {
        throw new Error('status API unreachable');
      },
    };

    const sendResolved = await resolveSend(throwing, sendRequest());
    expect(sendResolved.status).toBe('UNAVAILABLE');
    if (sendResolved.status === 'UNAVAILABLE') expect(sendResolved.reason).toBe('provider unreachable');

    const verifyResolved = await resolveVerify(throwing, verifyRequest());
    expect(verifyResolved.status).toBe('UNAVAILABLE');
    if (verifyResolved.status === 'UNAVAILABLE') expect(verifyResolved.reason).toBe('status API unreachable');
  });

  it('keeps both port methods asynchronous, so a live executor can satisfy them unchanged', () => {
    const executor = new FixtureSideEffectExecutor({ 'send-1': SUCCEEDED }, {});
    expect(executor.attemptSend(sendRequest())).toBeInstanceOf(Promise);
  });
});
