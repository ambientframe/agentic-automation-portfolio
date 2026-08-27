import type { ExecutionMode, SendOutcome, VerifyOutcome } from '@/lib/model/runtime';
import { AttemptUnavailableError, type SendRequest, type SideEffectExecutor, type VerifyRequest } from '@/lib/ports/side-effect-executor';

/**
 * THE REMOTE EXECUTION BOUNDARY.
 *
 * `SmtpSideEffectExecutor` proved a real socket, a real protocol, and a receipt read back from
 * a separate process — but always to `127.0.0.1`. Every execution claim this portfolio makes
 * has therefore carried the same unstated bound: nothing ever left this computer. This executor
 * removes that bound by POSTing an authorized notification over HTTPS to a third-party
 * automation platform, which records the delivery in its own execution log — a receipt this
 * application cannot write, cannot edit, and does not own.
 *
 * ITS GUARD IS THE INVERSE OF SMTP'S, DELIBERATELY.
 *
 *   `SmtpSideEffectExecutor` refuses a ROUTABLE recipient. It must never reach a real person.
 *   This one refuses a NON-ROUTABLE endpoint. If it could be pointed at loopback, then "the
 *   side effect left this machine" would be satisfiable without leaving it, and the only claim
 *   this class exists to support would be unfalsifiable.
 *
 * Each guard enforces the claim its own executor exists to make. Neither is a style preference.
 *
 * THE CLASSIFICATION RULE. `FAILED_BEFORE_EFFECT` is a PERMISSION, not a description: every
 * layer above reads it as "a retry is safe". Over HTTP a receiver can act on a request it never
 * manages to answer, so the default here is `OUTCOME_UNKNOWN` and certainty must be EARNED —
 * `FAILED_BEFORE_EFFECT` is returned only for failures that provably preceded the request
 * leaving this process. The SMTP executor reached the same rule the hard way, after a retained
 * capture caught it granting retry permission for a post-DATA socket close that 39 green unit
 * tests had missed. That lesson is applied here from the first line rather than after the fact.
 */

/** Codes that prove the request never went out. Everything else is treated as unknown. */
const PRE_REQUEST_FAILURE_CODES = new Set([
  // The connection was never established.
  'ECONNREFUSED',
  'ENOTFOUND',
  'EAI_AGAIN',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'UND_ERR_CONNECT_TIMEOUT',
  // TLS failed during the handshake, before any request bytes could be written.
  'CERT_HAS_EXPIRED',
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'SELF_SIGNED_CERT_IN_CHAIN',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'ERR_TLS_CERT_ALTNAME_INVALID',
]);

/** Applied when a 429 carries no parseable `Retry-After`. Bounded, never unbounded. */
const DEFAULT_RETRY_AFTER_SECONDS = 30;

const REQUEST_TIMEOUT_MS = 10_000;

export class UnsafeWebhookEndpointError extends Error {
  constructor(readonly endpoint: string) {
    super(
      `Webhook endpoint "${endpoint}" is not a public HTTPS URL. The remote execution boundary refuses ` +
        `loopback, private-range, and plaintext endpoints: an executor that can be pointed at this machine ` +
        `cannot be evidence that anything left it.`,
    );
    this.name = 'UnsafeWebhookEndpointError';
  }
}

/** Hostnames that are this machine, or a machine on its LAN. */
function isLocalHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) return true;
  if (host === '::1' || host === '0:0:0:0:0:0:0:1') return true;
  // IPv4 literals only; a public DNS name resolving privately is out of scope and is stated
  // as a limit on the evidence artifact rather than pretended away here.
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (v4 === null) return false;
  const [a, b] = [Number(v4[1]), Number(v4[2])];
  if (a === 127 || a === 0 || a === 10) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 169 && b === 254) return true;
  return false;
}

export function isRemoteProofSafeEndpoint(endpoint: string): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:') return false;
  if (url.username.length > 0 || url.password.length > 0) return false;
  return !isLocalHostname(url.hostname);
}

export interface WebhookExecutorConfig {
  readonly endpoint: string;
  /**
   * A read-only channel that answers "do you hold a record of this idempotency key?".
   *
   * Optional, and its absence is not a degraded mode: without it `attemptVerify` refuses
   * exactly as it always did, because a verification channel that does not exist must never be
   * simulated by one that guesses. Held to the same endpoint guard as `endpoint` — a lookup
   * this machine could answer for itself would make a confirmation meaningless.
   */
  readonly lookupEndpoint?: string;
  /** Injected in tests so the failure taxonomy is exercised without a network. */
  readonly fetchImpl?: typeof fetch;
}

function causeCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const cause = (error as { cause?: unknown }).cause;
  if (typeof cause === 'object' && cause !== null && typeof (cause as { code?: unknown }).code === 'string') {
    return (cause as { code: string }).code;
  }
  const direct = (error as { code?: unknown }).code;
  return typeof direct === 'string' ? direct : undefined;
}

export class WebhookSideEffectExecutor implements SideEffectExecutor {
  readonly id = 'lead-rescue-remote-webhook-executor';
  readonly mode: ExecutionMode = 'LIVE';
  readonly description: string;
  readonly endpoint: string;
  readonly lookupEndpoint: string | undefined;

  private readonly fetchImpl: typeof fetch;

  constructor(config: WebhookExecutorConfig) {
    // Fail closed at CONSTRUCTION, before any claim can be held against this instance —
    // the same discipline `SmtpSideEffectExecutor` applies to its recipient.
    if (!isRemoteProofSafeEndpoint(config.endpoint)) {
      throw new UnsafeWebhookEndpointError(config.endpoint);
    }
    if (config.lookupEndpoint !== undefined && !isRemoteProofSafeEndpoint(config.lookupEndpoint)) {
      throw new UnsafeWebhookEndpointError(config.lookupEndpoint);
    }
    this.endpoint = config.endpoint;
    this.lookupEndpoint = config.lookupEndpoint;
    this.fetchImpl = config.fetchImpl ?? fetch;
    this.description =
      `Real HTTPS delivery of an authorized notification to a third-party automation endpoint at ` +
      `${new URL(config.endpoint).origin}, which records the delivery in its own execution log. ` +
      `A genuine crossing off this machine; never a customer-facing message.`;
  }

  async attemptSend(request: SendRequest): Promise<SendOutcome> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    let response: Response;
    try {
      response = await this.fetchImpl(this.endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          // Carried as a header as well as in the body so a receiver that logs only headers
          // can still be asked about this specific operation afterwards.
          'idempotency-key': request.idempotencyKey,
        },
        body: JSON.stringify({
          attemptId: request.attemptId,
          idempotencyKey: request.idempotencyKey,
          provider: request.provider,
          description: request.description,
        }),
        signal: controller.signal,
      });
    } catch (error) {
      const code = causeCode(error);
      const detail = error instanceof Error ? error.message : String(error);
      if (code !== undefined && PRE_REQUEST_FAILURE_CODES.has(code)) {
        return {
          kind: 'FAILED_BEFORE_EFFECT',
          reason: `HTTPS transport failed before the request was written (${code}): ${detail}`,
        };
      }
      // The default. A reset, a timeout waiting for headers, an abort — in every one of these
      // the request may already be sitting in the receiver's queue. Granting retry permission
      // here is exactly the bug this taxonomy exists to prevent.
      return {
        kind: 'OUTCOME_UNKNOWN',
        reason: `HTTPS transport failed after the request may already have been written (${code ?? 'no code'}): ${detail}`,
      };
    } finally {
      clearTimeout(timer);
    }

    if (response.status === 429) {
      const header = response.headers.get('retry-after');
      const parsed = header === null ? Number.NaN : Number(header);
      return {
        kind: 'RATE_LIMITED',
        reason: `Receiver throttled the delivery (HTTP 429).`,
        retryAfterSeconds: Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_RETRY_AFTER_SECONDS,
      };
    }

    if (response.ok) {
      // The receiver's own identifier for what it recorded, when it offers one. Never
      // synthesised: an absent id is reported as absent, and the send is still a success
      // because the receiver confirmed it.
      const externalId = await this.readExternalId(response);
      return externalId === undefined ? { kind: 'SUCCEEDED' } : { kind: 'SUCCEEDED', externalId };
    }

    // A conflict can mean "already processed", which is the one 4xx that is not a clean refusal.
    if (response.status === 409) {
      return { kind: 'OUTCOME_UNKNOWN', reason: 'Receiver answered HTTP 409; a conflict may mean this operation was already recorded.' };
    }

    if (response.status >= 400 && response.status < 500) {
      return {
        kind: 'FAILED_BEFORE_EFFECT',
        reason: `Receiver refused the delivery on arrival (HTTP ${response.status}); nothing was recorded.`,
      };
    }

    // 5xx. The receiver had the request in hand and may have acted before failing.
    return {
      kind: 'OUTCOME_UNKNOWN',
      reason: `Receiver answered HTTP ${response.status}; it held the request and may have acted on it before failing.`,
    };
  }

  private async readExternalId(response: Response): Promise<string | undefined> {
    try {
      const body: unknown = await response.json();
      if (typeof body !== 'object' || body === null) return undefined;
      const id = (body as { n8nExecutionId?: unknown }).n8nExecutionId;
      return typeof id === 'string' && id.length > 0 ? id : undefined;
    } catch {
      // A confirmed 2xx with an unreadable body is still a confirmed delivery. The missing id
      // is reported as missing rather than invented.
      return undefined;
    }
  }

  /**
   * NARROWS AN OUTCOME_UNKNOWN AGAINST THE RECEIVER'S OWN RECORD — IN ONE DIRECTION ONLY.
   *
   *   a record exists → CONFIRMED_EXECUTED
   *   no record       → STILL_UNKNOWN. Always. Never CONFIRMED_NOT_EXECUTED.
   *
   * The asymmetry is the design, not a gap in it. A receiver cannot prove it never received
   * something: a request can be accepted at the socket and die before the first write to its
   * log, which is precisely the failure that produces the `OUTCOME_UNKNOWN` being investigated.
   * An empty answer is therefore consistent with both "never arrived" and "arrived and was
   * lost", and `CLAUDE.md` is explicit that absence of evidence never renders as evidence of
   * absence. A receiver volunteering that its log is complete does not change this — it cannot
   * observe what it failed to record, so the claim is not evidence and is not honoured.
   *
   * This is still the half worth having. The dangerous error is sending twice, and confirming
   * that an effect DID happen is what prevents it. Confirming one did not merely grants retry
   * permission, and a retry left unpermitted is safe.
   *
   * A lookup that could not RUN throws, exactly as before, because "the check failed" and "the
   * check was inconclusive" are different facts: `resolveVerify` turns the throw into
   * `UNAVAILABLE`, while `STILL_UNKNOWN` records that the receiver answered and the answer
   * settled nothing.
   */
  async attemptVerify(request: VerifyRequest): Promise<VerifyOutcome> {
    const lookup = this.lookupEndpoint;
    if (lookup === undefined) {
      throw new AttemptUnavailableError(
        request.attemptId,
        'No lookup endpoint is configured for this receiver, so no independent verification is available. An OUTCOME_UNKNOWN cannot be narrowed on this path.',
      );
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    let response: Response;
    try {
      response = await this.fetchImpl(lookup, {
        method: 'GET',
        headers: {
          accept: 'application/json',
          // In a header rather than the URL: a verification query should not deposit operation
          // identifiers into every proxy and access log between here and the receiver.
          'idempotency-key': request.targetIdempotencyKey,
        },
        signal: controller.signal,
      });
    } catch (error) {
      const code = causeCode(error);
      const detail = error instanceof Error ? error.message : String(error);
      throw new AttemptUnavailableError(
        request.attemptId,
        `The verification lookup could not be performed (${code ?? 'no code'}): ${detail}`,
      );
    } finally {
      clearTimeout(timer);
    }

    if (response.status >= 500) {
      throw new AttemptUnavailableError(
        request.attemptId,
        `The verification lookup answered HTTP ${response.status}; the receiver's record could not be read.`,
      );
    }

    if (!response.ok) {
      return {
        kind: 'STILL_UNKNOWN',
        reason: `Lookup answered HTTP ${response.status}. A missing route and a missing record are indistinguishable at this status, so nothing is concluded.`,
      };
    }

    const body = await this.readJsonObject(response);
    if (body === undefined) {
      return {
        kind: 'STILL_UNKNOWN',
        reason: 'The lookup returned a body that could not be read as a JSON object.',
      };
    }

    // An answer about another operation is worse than no answer: acting on it would confirm the
    // wrong send. Checked before `found`, so a mismatched key can never reach the confirming path.
    if (body.idempotencyKey !== request.targetIdempotencyKey) {
      return {
        kind: 'STILL_UNKNOWN',
        reason:
          typeof body.idempotencyKey === 'string'
            ? `The lookup answered about "${body.idempotencyKey}" rather than the operation asked about.`
            : 'The lookup did not state which operation it was answering about.',
      };
    }

    // Strict identity, not truthiness. "yes", 1, and a present-but-null field are all unusable,
    // and unusable resolves toward unknown rather than toward a confirmation.
    if (body.found !== true) {
      return {
        kind: 'STILL_UNKNOWN',
        reason:
          'The receiver holds no record of this operation. That is consistent with the request never arriving AND with it arriving and being lost before the record was written, so it is not evidence that nothing happened.',
      };
    }

    const externalId =
      typeof body.n8nExecutionId === 'string' && body.n8nExecutionId.length > 0
        ? body.n8nExecutionId
        : undefined;
    const reason = `The receiver holds a record of this operation in its own execution log${
      typeof body.recordedAt === 'string' ? `, recorded at ${body.recordedAt}` : ''
    }.`;

    return externalId === undefined
      ? { kind: 'CONFIRMED_EXECUTED', reason }
      : { kind: 'CONFIRMED_EXECUTED', reason, externalId };
  }

  /** A body that is not a readable JSON object is reported as unreadable, never as an empty one. */
  private async readJsonObject(
    response: Response,
  ): Promise<Record<string, unknown> | undefined> {
    try {
      const parsed: unknown = await response.json();
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return undefined;
      return parsed as Record<string, unknown>;
    } catch {
      return undefined;
    }
  }
}
