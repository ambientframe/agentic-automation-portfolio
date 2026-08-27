import type { ExecutionMode, SendOutcome, VerifyOutcome } from '@/lib/model/runtime';
import { AttemptUnavailableError, type SendRequest, type SideEffectExecutor, type VerifyRequest } from '@/lib/ports/side-effect-executor';
import { SmtpSideEffectExecutor, isProofSafeRecipient } from '@/lib/ports/smtp-side-effect-executor';
import { WebhookSideEffectExecutor, isRemoteProofSafeEndpoint } from '@/lib/ports/webhook-side-effect-executor';

/**
 * THE ONE PLACE REAL OUTBOUND EXECUTION IS TURNED ON.
 *
 * Deliberately the same shape as `lib/config/decision-provider-config.ts`, for the same
 * reason and with the same two-key discipline: **configuration is not permission.** SMTP host
 * and recipient variables being present must NEVER, by themselves, cause a real message to
 * leave this process — a developer or CI runner with them exported for an unrelated reason
 * must get byte-for-byte the same SIMULATED behavior as one with nothing configured at all.
 * Selecting real SMTP requires a SEPARATE, explicit opt-in
 * (`LEAD_RESCUE_SIDE_EFFECT_EXECUTOR=smtp`) IN ADDITION TO complete, valid configuration.
 *
 * `resolveSideEffectExecutorSelection` is PURE — no `process.env` read, no transport
 * construction, no socket — so the activation decision is unit-testable without mutating the
 * environment or touching the network. `resolveLeadRescueSideEffectExecutor` is the thin,
 * non-pure composition-root wrapper the wait runtime actually calls.
 *
 * FAIL-CLOSED, NOT SILENT FALLBACK: if `smtp` is explicitly selected but the configuration is
 * absent, malformed, or names a routable recipient, this does NOT quietly return the simulated
 * executor. Doing so would substitute fake successes for an explicitly requested real send
 * while reporting it as though the request had been honoured — the exact dishonesty this
 * portfolio's maturity labels exist to prevent. Instead it returns an executor whose
 * `attemptSend` always throws the SAME typed error a genuine transport failure produces, which
 * `resolveSend` (`lib/ports/side-effect-executor.ts`) converts into `UNAVAILABLE`, which
 * `checkWaitIncident` already routes to its existing UNCERTAIN path. Misconfiguration fails
 * exactly like a network failure, with zero new handling anywhere downstream.
 */

export type Env = Readonly<Record<string, string | undefined>>;

export const SIDE_EFFECT_EXECUTOR_MODE_ENV_VAR = 'LEAD_RESCUE_SIDE_EFFECT_EXECUTOR';
export const SMTP_HOST_ENV_VAR = 'LEAD_RESCUE_SMTP_HOST';
export const SMTP_PORT_ENV_VAR = 'LEAD_RESCUE_SMTP_PORT';
export const SMTP_FROM_ENV_VAR = 'LEAD_RESCUE_SMTP_FROM';
export const SMTP_TO_ENV_VAR = 'LEAD_RESCUE_SMTP_TO';
export const WEBHOOK_ENDPOINT_ENV_VAR = 'LEAD_RESCUE_WEBHOOK_ENDPOINT';
/**
 * Optional. Its absence is a working configuration, not a broken one: without it
 * `attemptVerify` refuses and an `OUTCOME_UNKNOWN` simply stays unknown, which is where the
 * boundary stood before a lookup existed at all. Set, it must clear the same endpoint guard as
 * the send endpoint — a lookup this machine could answer for itself would make a confirmation
 * worthless, and a misconfigured one fails the whole selection closed rather than silently
 * degrading to unverifiable sends.
 */
export const WEBHOOK_LOOKUP_ENDPOINT_ENV_VAR = 'LEAD_RESCUE_WEBHOOK_LOOKUP_ENDPOINT';

export const SIDE_EFFECT_EXECUTOR_MODES = ['simulated', 'smtp', 'webhook'] as const;
export type SideEffectExecutorMode = (typeof SIDE_EFFECT_EXECUTOR_MODES)[number];

/**
 * Only an exact, recognised literal selects a real executor. Anything else — a typo, an empty
 * string, a value meant for a different tool — is simulated. An unrecognised value must never
 * imply "real", which is why this matches rather than parses.
 */
function resolveMode(env: Env): SideEffectExecutorMode {
  const raw = env[SIDE_EFFECT_EXECUTOR_MODE_ENV_VAR]?.trim().toLowerCase();
  if (raw === 'smtp') return 'smtp';
  if (raw === 'webhook') return 'webhook';
  return 'simulated';
}

export interface SmtpSettings {
  readonly host: string;
  readonly port: number;
  readonly from: string;
  readonly to: string;
}

export interface WebhookSettings {
  readonly endpoint: string;
  /** Absent means verification is unavailable and says so, never that it silently passes. */
  readonly lookupEndpoint?: string;
}

export type SideEffectExecutorSelection =
  | { readonly kind: 'SIMULATED' }
  | { readonly kind: 'SMTP'; readonly settings: SmtpSettings }
  | { readonly kind: 'SMTP_MISCONFIGURED'; readonly reason: string }
  | { readonly kind: 'WEBHOOK'; readonly settings: WebhookSettings }
  | { readonly kind: 'WEBHOOK_MISCONFIGURED'; readonly reason: string };

/** Pure: decides WHICH executor should run and validates its settings, never constructs one. */
export function resolveSideEffectExecutorSelection(env: Env): SideEffectExecutorSelection {
  const mode = resolveMode(env);
  if (mode === 'simulated') return { kind: 'SIMULATED' };

  if (mode === 'webhook') {
    const endpoint = env[WEBHOOK_ENDPOINT_ENV_VAR]?.trim();
    if (endpoint === undefined || endpoint.length === 0) {
      return {
        kind: 'WEBHOOK_MISCONFIGURED',
        reason: `${SIDE_EFFECT_EXECUTOR_MODE_ENV_VAR}=webhook was set but required configuration is missing: ${WEBHOOK_ENDPOINT_ENV_VAR}`,
      };
    }
    // The blast-radius guard, enforced at selection time so an endpoint on this machine can
    // never reach executor construction. The inverse of the SMTP recipient guard, and for the
    // mirror-image reason — see `isRemoteProofSafeEndpoint`.
    if (!isRemoteProofSafeEndpoint(endpoint)) {
      return {
        kind: 'WEBHOOK_MISCONFIGURED',
        reason: `${WEBHOOK_ENDPOINT_ENV_VAR}="${endpoint}" is not a public HTTPS endpoint. Remote execution proof mode refuses loopback, private-range, credentialled, and plaintext endpoints — an executor that can be pointed at this machine cannot be evidence that anything left it.`,
      };
    }
    // Optional, but not optionally validated. A lookup endpoint that is set and unsafe fails the
    // selection rather than being dropped: quietly discarding it would leave sends running with
    // verification the operator believes is configured and which is not there.
    const lookupEndpoint = env[WEBHOOK_LOOKUP_ENDPOINT_ENV_VAR]?.trim();
    if (lookupEndpoint !== undefined && lookupEndpoint.length > 0) {
      if (!isRemoteProofSafeEndpoint(lookupEndpoint)) {
        return {
          kind: 'WEBHOOK_MISCONFIGURED',
          reason: `${WEBHOOK_LOOKUP_ENDPOINT_ENV_VAR}="${lookupEndpoint}" is not a public HTTPS endpoint. A verification lookup this machine could answer for itself would make a confirmation worthless.`,
        };
      }
      return { kind: 'WEBHOOK', settings: { endpoint, lookupEndpoint } };
    }

    return { kind: 'WEBHOOK', settings: { endpoint } };
  }

  const host = env[SMTP_HOST_ENV_VAR]?.trim();
  const rawPort = env[SMTP_PORT_ENV_VAR]?.trim();
  const from = env[SMTP_FROM_ENV_VAR]?.trim();
  const to = env[SMTP_TO_ENV_VAR]?.trim();

  const missing = [
    host === undefined || host.length === 0 ? SMTP_HOST_ENV_VAR : undefined,
    rawPort === undefined || rawPort.length === 0 ? SMTP_PORT_ENV_VAR : undefined,
    from === undefined || from.length === 0 ? SMTP_FROM_ENV_VAR : undefined,
    to === undefined || to.length === 0 ? SMTP_TO_ENV_VAR : undefined,
  ].filter((v): v is string => v !== undefined);

  if (missing.length > 0) {
    return {
      kind: 'SMTP_MISCONFIGURED',
      reason: `${SIDE_EFFECT_EXECUTOR_MODE_ENV_VAR}=smtp was set but required configuration is missing: ${missing.join(', ')}`,
    };
  }

  const port = Number(rawPort);
  if (!Number.isInteger(port) || port <= 0 || port > 65_535) {
    return { kind: 'SMTP_MISCONFIGURED', reason: `${SMTP_PORT_ENV_VAR}="${rawPort}" is not a valid TCP port.` };
  }

  // The hard blast-radius guard, enforced at selection time so a routable recipient can never
  // even reach executor construction. See `PROOF_SAFE_RECIPIENT_SUFFIXES`.
  if (!isProofSafeRecipient(to as string)) {
    return {
      kind: 'SMTP_MISCONFIGURED',
      reason: `${SMTP_TO_ENV_VAR}="${to}" is not a reserved, non-routable proof address. Local SMTP proof mode refuses to address anything that could reach a real mailbox.`,
    };
  }

  return { kind: 'SMTP', settings: { host: host as string, port, from: from as string, to: to as string } };
}

/**
 * A composition-root-only guard value, not a third execution strategy — it sends nothing. It
 * exists solely to turn "smtp was explicitly selected but is unusable" into the same
 * `UNAVAILABLE` resolution any other executor failure already produces, instead of silently
 * reusing simulated output.
 */
function createUnavailableExecutor(mode: 'smtp' | 'webhook', reason: string): SideEffectExecutor {
  const description = `real execution was explicitly selected (${SIDE_EFFECT_EXECUTOR_MODE_ENV_VAR}=${mode}) but is unavailable: ${reason}`;
  return {
    id: mode === 'smtp' ? 'lead-rescue-local-smtp-executor-unavailable' : 'lead-rescue-remote-webhook-executor-unavailable',
    // Deliberately LIVE: this instance stands in for an explicitly requested REAL executor.
    // Reporting SIMULATED here would let a misconfigured real-send request be mistaken for a
    // legitimate simulated run — precisely the confusion this module exists to prevent.
    mode: 'LIVE' as ExecutionMode,
    description,
    async attemptSend(request: SendRequest): Promise<SendOutcome> {
      throw new AttemptUnavailableError(request.attemptId, description);
    },
    async attemptVerify(request: VerifyRequest): Promise<VerifyOutcome> {
      throw new AttemptUnavailableError(request.attemptId, description);
    },
  };
}

export interface SideEffectExecutorResolution {
  readonly executor: SideEffectExecutor;
  /** Non-secret provenance only — the executor's own id, never a host or address value. */
  readonly executorId: string;
  readonly selectionKind: SideEffectExecutorSelection['kind'];
}

/**
 * THE WAIT-RUNTIME COMPOSITION ROOT. Defaults `env` to `process.env` for the real runtime;
 * tests inject a fake `env` object directly, so no branch here needs to mutate the real
 * environment or open a socket to be exercised.
 *
 * `simulatedExecutor` is injected rather than imported to keep this module free of a cycle
 * with `lib/engine/lead-rescue-wait-runtime.ts`, which owns that instance.
 */
export function resolveLeadRescueSideEffectExecutor(
  env: Env = process.env,
  simulatedExecutor?: SideEffectExecutor,
): SideEffectExecutorResolution {
  const selection = resolveSideEffectExecutorSelection(env);

  switch (selection.kind) {
    case 'SIMULATED': {
      if (simulatedExecutor === undefined) {
        // Only reachable from a test that asked for the simulated branch without supplying
        // the instance; never from the real runtime, which always passes one.
        const reason = 'no simulated executor was supplied to the composition root';
        return { executor: createUnavailableExecutor('smtp', reason), executorId: 'lead-rescue-local-smtp-executor-unavailable', selectionKind: selection.kind };
      }
      return { executor: simulatedExecutor, executorId: simulatedExecutor.id, selectionKind: selection.kind };
    }
    case 'SMTP': {
      const executor = new SmtpSideEffectExecutor(selection.settings);
      return { executor, executorId: executor.id, selectionKind: selection.kind };
    }
    case 'SMTP_MISCONFIGURED': {
      const executor = createUnavailableExecutor('smtp', selection.reason);
      return { executor, executorId: executor.id, selectionKind: selection.kind };
    }
    case 'WEBHOOK': {
      const { endpoint, lookupEndpoint } = selection.settings;
      const executor = new WebhookSideEffectExecutor({
        endpoint,
        ...(lookupEndpoint === undefined ? {} : { lookupEndpoint }),
      });
      return { executor, executorId: executor.id, selectionKind: selection.kind };
    }
    case 'WEBHOOK_MISCONFIGURED': {
      const executor = createUnavailableExecutor('webhook', selection.reason);
      return { executor, executorId: executor.id, selectionKind: selection.kind };
    }
  }
}
