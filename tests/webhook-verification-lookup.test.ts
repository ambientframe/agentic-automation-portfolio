import { describe, expect, it } from 'vitest';
import {
  WebhookSideEffectExecutor,
  UnsafeWebhookEndpointError,
} from '@/lib/ports/webhook-side-effect-executor';
import { AttemptUnavailableError, type VerifyRequest } from '@/lib/ports/side-effect-executor';
import { VerifyOutcomeSchema } from '@/lib/model/runtime';
import {
  resolveSideEffectExecutorSelection,
  resolveLeadRescueSideEffectExecutor,
  SIDE_EFFECT_EXECUTOR_MODE_ENV_VAR,
  WEBHOOK_ENDPOINT_ENV_VAR,
  WEBHOOK_LOOKUP_ENDPOINT_ENV_VAR,
} from '@/lib/config/side-effect-executor-config';

/**
 * FALSIFYING TESTS for narrowing an `OUTCOME_UNKNOWN` against the receiver's own record.
 *
 * `attemptSend` already refuses to grant retry permission it has not earned: over HTTP a
 * receiver can act on a request it never answers, so anything short of proof that the request
 * never left is `OUTCOME_UNKNOWN`. That is correct and it leaves a hole. Until now the executor
 * had no way to ever CLOSE one of those, because the receiver recorded deliveries in its own
 * execution log and exposed no way to ask about a specific operation. `attemptVerify` threw,
 * which was honest and useless in equal measure.
 *
 * THE ASYMMETRY IS THE WHOLE DESIGN, AND IT IS DELIBERATE.
 *
 *   found     → CONFIRMED_EXECUTED. The receiver holds a record of this exact key.
 *   not found → STILL_UNKNOWN. Always. Never CONFIRMED_NOT_EXECUTED.
 *
 * A receiver cannot prove it never received something. A request can be accepted at the socket
 * and die before the first write to the log, which is precisely the failure that produced the
 * `OUTCOME_UNKNOWN` being investigated. So an empty answer narrows nothing, and this executor
 * will not let it pretend otherwise — `CLAUDE.md` states the rule directly: absence of evidence
 * never renders as evidence of absence.
 *
 * That still fixes the case that matters. The dangerous error is sending twice; confirming an
 * effect DID happen prevents it. Confirming one did not merely permits a retry, and a retry
 * left unpermitted is safe.
 */

const SAFE_ENDPOINT = 'https://example.app.n8n.cloud/webhook/lead-rescue-notification-sink';
const SAFE_LOOKUP = 'https://example.app.n8n.cloud/webhook/lead-rescue-delivery-lookup';

const REQUEST: VerifyRequest = {
  attemptId: 'attempt-1',
  targetIdempotencyKey: 'lead-7:acknowledgement:1',
  provider: 'n8n',
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/** Records what the executor asked for, so the read-only contract can be asserted. */
function recordingFetch(response: () => Response | Promise<Response>) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const impl = (async (url: string | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return response();
  }) as unknown as typeof fetch;
  return { impl, calls };
}

function executor(fetchImpl: typeof fetch, lookupEndpoint: string = SAFE_LOOKUP) {
  return new WebhookSideEffectExecutor({ endpoint: SAFE_ENDPOINT, lookupEndpoint, fetchImpl });
}

/**
 * Deliberately a separate constructor rather than passing `undefined` to the helper above.
 * Passing `undefined` to a defaulted parameter selects the default, so that call would have
 * quietly built an executor WITH a lookup channel and asserted nothing — which is exactly what
 * it did before this helper existed.
 */
function executorWithoutLookup(fetchImpl: typeof fetch) {
  return new WebhookSideEffectExecutor({ endpoint: SAFE_ENDPOINT, fetchImpl });
}

describe('with no lookup endpoint configured', () => {
  it('still refuses rather than guessing', async () => {
    const { impl } = recordingFetch(() => jsonResponse({}));
    await expect(executorWithoutLookup(impl).attemptVerify(REQUEST)).rejects.toBeInstanceOf(
      AttemptUnavailableError,
    );
  });

  it('does not reach the network to find that out', async () => {
    const { impl, calls } = recordingFetch(() => jsonResponse({}));
    await expect(executorWithoutLookup(impl).attemptVerify(REQUEST)).rejects.toThrow();
    expect(calls, 'a missing lookup channel is a configuration fact, not a request').toEqual([]);
  });
});

describe('the lookup endpoint is held to the same guard as the send endpoint', () => {
  it.each([
    ['http://example.app.n8n.cloud/webhook/lookup', 'plaintext'],
    ['https://localhost/webhook/lookup', 'loopback by name'],
    ['https://127.0.0.1/webhook/lookup', 'loopback by address'],
    ['https://192.168.1.10/webhook/lookup', 'private range'],
    ['https://user:pw@example.app.n8n.cloud/webhook/lookup', 'credentialled'],
  ])('refuses %s (%s)', (lookup) => {
    const { impl } = recordingFetch(() => jsonResponse({}));
    expect(() => executor(impl, lookup)).toThrow(UnsafeWebhookEndpointError);
  });
});

describe('the query is read-only', () => {
  it('uses GET and never puts the key in the URL', async () => {
    const { impl, calls } = recordingFetch(() =>
      jsonResponse({ idempotencyKey: REQUEST.targetIdempotencyKey, found: false }),
    );
    await executor(impl).attemptVerify(REQUEST);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.init?.method, 'a verification may never be a write').toBe('GET');
    expect(calls[0]?.init?.body, 'GET carries no body').toBeUndefined();
    expect(
      calls[0]?.url,
      'the key travels in a header, never in a query string that lands in access logs',
    ).toBe(SAFE_LOOKUP);
  });

  it('names the key it is asking about', async () => {
    const { impl, calls } = recordingFetch(() =>
      jsonResponse({ idempotencyKey: REQUEST.targetIdempotencyKey, found: false }),
    );
    await executor(impl).attemptVerify(REQUEST);
    const headers = new Headers(calls[0]?.init?.headers);
    expect(headers.get('idempotency-key')).toBe(REQUEST.targetIdempotencyKey);
  });
});

describe('a record that exists closes the unknown', () => {
  it('confirms execution', async () => {
    const { impl } = recordingFetch(() =>
      jsonResponse({
        idempotencyKey: REQUEST.targetIdempotencyKey,
        found: true,
        recordedAt: '2026-08-27T10:00:00.000Z',
      }),
    );
    const outcome = await executor(impl).attemptVerify(REQUEST);
    expect(outcome.kind).toBe('CONFIRMED_EXECUTED');
    expect(VerifyOutcomeSchema.safeParse(outcome).success).toBe(true);
  });

  it('carries the receiver’s own id when it offers one', async () => {
    const { impl } = recordingFetch(() =>
      jsonResponse({
        idempotencyKey: REQUEST.targetIdempotencyKey,
        found: true,
        n8nExecutionId: 'exec-4821',
      }),
    );
    const outcome = await executor(impl).attemptVerify(REQUEST);
    expect(outcome).toMatchObject({ kind: 'CONFIRMED_EXECUTED', externalId: 'exec-4821' });
  });

  it('never invents an id the receiver did not give', async () => {
    const { impl } = recordingFetch(() =>
      jsonResponse({ idempotencyKey: REQUEST.targetIdempotencyKey, found: true }),
    );
    const outcome = await executor(impl).attemptVerify(REQUEST);
    expect(outcome.kind).toBe('CONFIRMED_EXECUTED');
    expect(outcome).not.toHaveProperty('externalId');
  });
});

describe('an empty answer narrows nothing', () => {
  it('reports STILL_UNKNOWN rather than confirming a negative', async () => {
    const { impl } = recordingFetch(() =>
      jsonResponse({ idempotencyKey: REQUEST.targetIdempotencyKey, found: false }),
    );
    const outcome = await executor(impl).attemptVerify(REQUEST);
    expect(outcome.kind).toBe('STILL_UNKNOWN');
  });

  it('refuses even when the receiver volunteers that its log is complete', async () => {
    // A receiver may claim anything. It cannot observe a request that died before its first
    // write, so this claim is not evidence and is deliberately not honoured.
    const { impl } = recordingFetch(() =>
      jsonResponse({
        idempotencyKey: REQUEST.targetIdempotencyKey,
        found: false,
        logComplete: true,
        assertion: 'no gap in this log',
      }),
    );
    const outcome = await executor(impl).attemptVerify(REQUEST);
    expect(outcome.kind).toBe('STILL_UNKNOWN');
  });
});

describe('an answer about a different operation is not an answer', () => {
  it('rejects a mismatched key rather than accepting a confirmation', async () => {
    const { impl } = recordingFetch(() =>
      jsonResponse({ idempotencyKey: 'lead-9:acknowledgement:1', found: true }),
    );
    const outcome = await executor(impl).attemptVerify(REQUEST);
    expect(
      outcome.kind,
      'confirming delivery of a different operation is worse than confirming nothing',
    ).toBe('STILL_UNKNOWN');
  });

  it('rejects a missing key just as firmly', async () => {
    const { impl } = recordingFetch(() => jsonResponse({ found: true }));
    expect((await executor(impl).attemptVerify(REQUEST)).kind).toBe('STILL_UNKNOWN');
  });
});

describe('an unusable answer is inconclusive, never a confirmation', () => {
  it.each([
    ['a body that is not an object', '"a string"'],
    ['a body that is not JSON at all', '<html>gateway</html>'],
    ['an empty body', ''],
  ])('%s', async (_label, raw) => {
    const { impl } = recordingFetch(
      () => new Response(raw, { status: 200, headers: { 'content-type': 'application/json' } }),
    );
    expect((await executor(impl).attemptVerify(REQUEST)).kind).toBe('STILL_UNKNOWN');
  });

  it('treats a non-boolean `found` as unusable', async () => {
    const { impl } = recordingFetch(() =>
      jsonResponse({ idempotencyKey: REQUEST.targetIdempotencyKey, found: 'yes' }),
    );
    expect((await executor(impl).attemptVerify(REQUEST)).kind).toBe('STILL_UNKNOWN');
  });

  it('treats 404 as inconclusive, because a missing route and a missing record look alike', async () => {
    const { impl } = recordingFetch(() => jsonResponse({ found: false }, 404));
    expect((await executor(impl).attemptVerify(REQUEST)).kind).toBe('STILL_UNKNOWN');
  });
});

describe('a lookup that could not run is UNAVAILABLE, not an inconclusive result', () => {
  it.each([500, 502, 503])('throws on HTTP %s', async (status) => {
    const { impl } = recordingFetch(() => jsonResponse({}, status));
    await expect(executor(impl).attemptVerify(REQUEST)).rejects.toBeInstanceOf(
      AttemptUnavailableError,
    );
  });

  it('throws when the transport fails', async () => {
    const impl = (async () => {
      throw Object.assign(new Error('connect ECONNREFUSED'), { cause: { code: 'ECONNREFUSED' } });
    }) as unknown as typeof fetch;
    await expect(executor(impl).attemptVerify(REQUEST)).rejects.toBeInstanceOf(
      AttemptUnavailableError,
    );
  });
});

describe('the standing guarantee', () => {
  it('never returns CONFIRMED_NOT_EXECUTED, whatever the receiver says', async () => {
    const bodies: unknown[] = [
      { idempotencyKey: REQUEST.targetIdempotencyKey, found: false },
      { idempotencyKey: REQUEST.targetIdempotencyKey, found: false, logComplete: true },
      { idempotencyKey: REQUEST.targetIdempotencyKey, found: false, confirmedNotExecuted: true },
      { idempotencyKey: REQUEST.targetIdempotencyKey, kind: 'CONFIRMED_NOT_EXECUTED' },
      { idempotencyKey: REQUEST.targetIdempotencyKey, found: null },
    ];

    for (const body of bodies) {
      const { impl } = recordingFetch(() => jsonResponse(body));
      const outcome = await executor(impl).attemptVerify(REQUEST);
      expect(
        outcome.kind,
        `receiver body ${JSON.stringify(body)} produced a confirmed negative`,
      ).not.toBe('CONFIRMED_NOT_EXECUTED');
    }
  });
});

// ---------------------------------------------------------------------------
// Selecting the lookup channel from the environment
// ---------------------------------------------------------------------------

describe('configuring the lookup channel', () => {
  const base = {
    [SIDE_EFFECT_EXECUTOR_MODE_ENV_VAR]: 'webhook',
    [WEBHOOK_ENDPOINT_ENV_VAR]: SAFE_ENDPOINT,
  };

  it('carries a safe lookup endpoint through to the executor', () => {
    const selection = resolveSideEffectExecutorSelection({
      ...base,
      [WEBHOOK_LOOKUP_ENDPOINT_ENV_VAR]: SAFE_LOOKUP,
    });
    expect(selection).toMatchObject({
      kind: 'WEBHOOK',
      settings: { endpoint: SAFE_ENDPOINT, lookupEndpoint: SAFE_LOOKUP },
    });

    const resolved = resolveLeadRescueSideEffectExecutor({
      ...base,
      [WEBHOOK_LOOKUP_ENDPOINT_ENV_VAR]: SAFE_LOOKUP,
    });
    expect((resolved.executor as WebhookSideEffectExecutor).lookupEndpoint).toBe(SAFE_LOOKUP);
  });

  it('treats an absent lookup endpoint as a working configuration', () => {
    const selection = resolveSideEffectExecutorSelection(base);
    expect(selection.kind, 'sends must still work without a verification channel').toBe('WEBHOOK');
    expect((resolveLeadRescueSideEffectExecutor(base).executor as WebhookSideEffectExecutor).lookupEndpoint).toBeUndefined();
  });

  it.each([
    ['http://example.app.n8n.cloud/webhook/lookup', 'plaintext'],
    ['https://127.0.0.1/webhook/lookup', 'loopback'],
    ['https://10.0.0.4/webhook/lookup', 'private range'],
    ['https://user:pw@example.app.n8n.cloud/lookup', 'credentialled'],
  ])('fails the whole selection closed on an unsafe lookup: %s (%s)', (lookup) => {
    const selection = resolveSideEffectExecutorSelection({
      ...base,
      [WEBHOOK_LOOKUP_ENDPOINT_ENV_VAR]: lookup,
    });
    expect(
      selection.kind,
      'dropping the bad value would leave sends running with verification the operator believes exists',
    ).toBe('WEBHOOK_MISCONFIGURED');
  });

  it('does not send at all when the lookup endpoint is unsafe', async () => {
    const resolved = resolveLeadRescueSideEffectExecutor({
      ...base,
      [WEBHOOK_LOOKUP_ENDPOINT_ENV_VAR]: 'https://127.0.0.1/webhook/lookup',
    });
    await expect(
      resolved.executor.attemptSend({
        attemptId: 'a1',
        idempotencyKey: 'k1',
        provider: 'n8n',
        description: 'test',
      }),
    ).rejects.toBeInstanceOf(AttemptUnavailableError);
  });
});
