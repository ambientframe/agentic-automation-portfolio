import { describe, expect, it } from 'vitest';
import {
  WebhookSideEffectExecutor,
  UnsafeWebhookEndpointError,
  isRemoteProofSafeEndpoint,
} from '@/lib/ports/webhook-side-effect-executor';
import { AttemptUnavailableError, type SendRequest } from '@/lib/ports/side-effect-executor';
import {
  resolveSideEffectExecutorSelection,
  resolveLeadRescueSideEffectExecutor,
  SIDE_EFFECT_EXECUTOR_MODE_ENV_VAR,
  WEBHOOK_ENDPOINT_ENV_VAR,
} from '@/lib/config/side-effect-executor-config';

/**
 * FALSIFYING TESTS for the REMOTE execution boundary — the executor that carries an authorized
 * Lead Rescue notification off this machine, over the public internet, to a third-party system
 * that records it independently.
 *
 * `SmtpSideEffectExecutor` already proved a real socket, but only ever to loopback: a capture
 * server on 127.0.0.1 that the same machine started. Every claim this portfolio makes about
 * execution has therefore been bounded by "nothing left this computer". This executor exists to
 * remove that bound, and its guards are the inverse of SMTP's for exactly that reason:
 *
 *   SmtpSideEffectExecutor  refuses a ROUTABLE recipient — it must never reach a real person.
 *   WebhookSideEffectExecutor refuses a NON-ROUTABLE endpoint — it must never be satisfiable
 *                             by something on this machine, or the crossing it claims to prove
 *                             would be provable without ever making it.
 *
 * THE CLASSIFICATION RULE IS THE POINT. `FAILED_BEFORE_EFFECT` is a PERMISSION, not a
 * description: it tells every layer above that a retry is safe. Over HTTP the receiver may act
 * on a request it never manages to answer, so the default here is `OUTCOME_UNKNOWN`, and
 * `FAILED_BEFORE_EFFECT` is returned ONLY for failures that provably happened before the
 * request was written — a refused connection, an unresolvable name, a failed TLS handshake.
 * This is the same discipline the SMTP executor arrived at the hard way, applied from the start
 * rather than after a retained capture caught it.
 */

const SAFE_ENDPOINT = 'https://example.app.n8n.cloud/webhook/lead-rescue-notification-sink';

const REQUEST: SendRequest = {
  attemptId: 'attempt-1',
  idempotencyKey: 'notify:lead-1:review-overdue',
  provider: 'n8n-cloud-webhook',
  description: 'Notify the next owner that a case under review has exceeded its window.',
};

/** A fetch stand-in that returns a response, so classification is testable without a network. */
function respondingWith(status: number, body: unknown = {}, headers: Record<string, string> = {}) {
  return async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json', ...headers },
    });
}

/** A fetch stand-in that throws the way undici throws, with a `cause.code`. */
function failingWith(code: string) {
  return async () => {
    const error = new TypeError('fetch failed');
    (error as { cause?: unknown }).cause = { code };
    throw error;
  };
}

function executor(fetchImpl: typeof fetch, endpoint = SAFE_ENDPOINT) {
  return new WebhookSideEffectExecutor({ endpoint, fetchImpl: fetchImpl as typeof fetch });
}

describe('remote webhook execution boundary', () => {
  describe('the endpoint guard refuses anything that would not leave this machine', () => {
    it('accepts a public HTTPS endpoint', () => {
      expect(isRemoteProofSafeEndpoint(SAFE_ENDPOINT)).toBe(true);
    });

    it('refuses plaintext HTTP — a real crossing is not made in the clear', () => {
      expect(isRemoteProofSafeEndpoint('http://example.app.n8n.cloud/webhook/x')).toBe(false);
    });

    it.each([
      'https://localhost/webhook/x',
      'https://127.0.0.1/webhook/x',
      'https://[::1]/webhook/x',
      'https://10.1.2.3/webhook/x',
      'https://192.168.1.9/webhook/x',
      'https://172.16.4.4/webhook/x',
      'https://box.local/webhook/x',
    ])('refuses %s, which would make "it left this machine" satisfiable without leaving it', (url) => {
      expect(isRemoteProofSafeEndpoint(url)).toBe(false);
    });

    it('refuses credentials embedded in the URL', () => {
      expect(isRemoteProofSafeEndpoint('https://user:pass@example.app.n8n.cloud/webhook/x')).toBe(false);
    });

    it('refuses a value that is not a URL at all, rather than throwing', () => {
      expect(isRemoteProofSafeEndpoint('not a url')).toBe(false);
    });

    it('fails at construction, before any claim can be held against the instance', () => {
      expect(() => executor(respondingWith(200) as unknown as typeof fetch, 'https://127.0.0.1/webhook/x')).toThrow(
        UnsafeWebhookEndpointError,
      );
    });
  });

  describe('a receipt is only a success when the receiver actually confirms it', () => {
    it('returns SUCCEEDED carrying the receiver’s own execution id', async () => {
      const send = await executor(
        respondingWith(200, { n8nExecutionId: '42', receivedIdempotencyKey: REQUEST.idempotencyKey }) as unknown as typeof fetch,
      ).attemptSend(REQUEST);
      expect(send.kind).toBe('SUCCEEDED');
      expect(send.kind === 'SUCCEEDED' ? send.externalId : undefined).toBe('42');
    });

    it('still succeeds when the receiver returns no id, rather than inventing one', async () => {
      const send = await executor(respondingWith(200, {}) as unknown as typeof fetch).attemptSend(REQUEST);
      expect(send.kind).toBe('SUCCEEDED');
      expect(send.kind === 'SUCCEEDED' ? send.externalId : 'set').toBeUndefined();
    });
  });

  describe('the failure taxonomy defaults to unknown, and earns certainty', () => {
    it.each(['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'UND_ERR_CONNECT_TIMEOUT', 'CERT_HAS_EXPIRED'])(
      '%s is FAILED_BEFORE_EFFECT — the request provably never went out',
      async (code) => {
        const send = await executor(failingWith(code) as unknown as typeof fetch).attemptSend(REQUEST);
        expect(send.kind).toBe('FAILED_BEFORE_EFFECT');
      },
    );

    it.each(['ECONNRESET', 'EPIPE', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT', 'UND_ERR_SOCKET'])(
      '%s is OUTCOME_UNKNOWN — the receiver may be holding a request it never answered',
      async (code) => {
        const send = await executor(failingWith(code) as unknown as typeof fetch).attemptSend(REQUEST);
        expect(send.kind).toBe('OUTCOME_UNKNOWN');
      },
    );

    it('treats an unrecognised transport failure as unknown, never as retry permission', async () => {
      const send = await executor(failingWith('SOMETHING_NOBODY_HAS_SEEN') as unknown as typeof fetch).attemptSend(REQUEST);
      expect(send.kind).toBe('OUTCOME_UNKNOWN');
    });

    it('treats a 5xx as unknown — the receiver had the request and may have acted on it', async () => {
      const send = await executor(respondingWith(500) as unknown as typeof fetch).attemptSend(REQUEST);
      expect(send.kind).toBe('OUTCOME_UNKNOWN');
    });

    it('treats a 409 as unknown, because a conflict can mean "already done"', async () => {
      const send = await executor(respondingWith(409) as unknown as typeof fetch).attemptSend(REQUEST);
      expect(send.kind).toBe('OUTCOME_UNKNOWN');
    });

    it('treats a 4xx rejection as FAILED_BEFORE_EFFECT — refused on arrival, nothing done', async () => {
      const send = await executor(respondingWith(400) as unknown as typeof fetch).attemptSend(REQUEST);
      expect(send.kind).toBe('FAILED_BEFORE_EFFECT');
    });

    it('reports a 429 as RATE_LIMITED with the advertised backoff', async () => {
      const send = await executor(
        respondingWith(429, {}, { 'retry-after': '17' }) as unknown as typeof fetch,
      ).attemptSend(REQUEST);
      expect(send.kind).toBe('RATE_LIMITED');
      expect(send.kind === 'RATE_LIMITED' ? send.retryAfterSeconds : 0).toBe(17);
    });

    it('still reports RATE_LIMITED when no Retry-After is given, with a bounded default', async () => {
      const send = await executor(respondingWith(429) as unknown as typeof fetch).attemptSend(REQUEST);
      expect(send.kind).toBe('RATE_LIMITED');
      expect(send.kind === 'RATE_LIMITED' ? send.retryAfterSeconds : 0).toBeGreaterThan(0);
    });
  });

  describe('what it refuses to pretend', () => {
    it('throws rather than manufacturing a verification it cannot perform', async () => {
      await expect(
        executor(respondingWith(200) as unknown as typeof fetch).attemptVerify({
          attemptId: 'attempt-1',
          targetIdempotencyKey: REQUEST.idempotencyKey,
          provider: 'n8n-cloud-webhook',
        }),
      ).rejects.toBeInstanceOf(AttemptUnavailableError);
    });

    it('declares itself LIVE, so nothing can mistake it for a simulation', () => {
      expect(executor(respondingWith(200) as unknown as typeof fetch).mode).toBe('LIVE');
    });

    it('is never selected by configuration alone — an endpoint is not permission', () => {
      // The whole two-key discipline in one assertion: a developer with the endpoint exported
      // for an unrelated reason must get byte-for-byte simulated behaviour.
      const selection = resolveSideEffectExecutorSelection({ [WEBHOOK_ENDPOINT_ENV_VAR]: SAFE_ENDPOINT });
      expect(selection.kind).toBe('SIMULATED');
    });

    it('fails closed when webhook is selected without an endpoint, never falling back to simulated', () => {
      const selection = resolveSideEffectExecutorSelection({ [SIDE_EFFECT_EXECUTOR_MODE_ENV_VAR]: 'webhook' });
      expect(selection.kind).toBe('WEBHOOK_MISCONFIGURED');
    });

    it('fails closed when webhook is pointed at this machine', () => {
      const selection = resolveSideEffectExecutorSelection({
        [SIDE_EFFECT_EXECUTOR_MODE_ENV_VAR]: 'webhook',
        [WEBHOOK_ENDPOINT_ENV_VAR]: 'https://127.0.0.1/webhook/x',
      });
      expect(selection.kind).toBe('WEBHOOK_MISCONFIGURED');
    });

    it('selects the real executor only when both keys are turned', () => {
      const selection = resolveSideEffectExecutorSelection({
        [SIDE_EFFECT_EXECUTOR_MODE_ENV_VAR]: 'webhook',
        [WEBHOOK_ENDPOINT_ENV_VAR]: SAFE_ENDPOINT,
      });
      expect(selection.kind).toBe('WEBHOOK');
    });

    it('reports a misconfigured real request as LIVE and unavailable, not as a simulation', async () => {
      const { executor: resolved, selectionKind } = resolveLeadRescueSideEffectExecutor({
        [SIDE_EFFECT_EXECUTOR_MODE_ENV_VAR]: 'webhook',
        [WEBHOOK_ENDPOINT_ENV_VAR]: 'http://example.app.n8n.cloud/webhook/x',
      });
      expect(selectionKind).toBe('WEBHOOK_MISCONFIGURED');
      expect(resolved.mode).toBe('LIVE');
      await expect(resolved.attemptSend(REQUEST)).rejects.toBeInstanceOf(AttemptUnavailableError);
    });

    it('sends the idempotency key, so the receiver can be asked about it later', async () => {
      let seen: string | undefined;
      const capture = (async (_url: string, init?: RequestInit) => {
        seen = String(init?.body ?? '');
        return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
      }) as unknown as typeof fetch;
      await executor(capture).attemptSend(REQUEST);
      expect(seen).toContain(REQUEST.idempotencyKey);
      expect(seen).toContain(REQUEST.attemptId);
    });
  });
});
