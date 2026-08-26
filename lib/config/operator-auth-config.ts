import { randomBytes } from 'node:crypto';

/**
 * THE ONE PLACE THE OPERATOR SIGNING KEY IS DECIDED.
 *
 * Deliberately the same shape as `lib/config/decision-provider-config.ts` and
 * `lib/config/side-effect-executor-config.ts`, for the same reason: the decision about which
 * mode a runtime is in belongs in one pure, testable function, not scattered across route
 * handlers that can drift apart.
 *
 * THREE MODES, AND THE DIFFERENCE BETWEEN THEM IS HONESTY, NOT STRENGTH.
 *
 *   CONFIGURED_KEY — `LEAD_RESCUE_OPERATOR_SIGNING_KEY` is set and long enough. Tokens survive
 *                    a restart, and the prototype session route REFUSES TO ISSUE anything: a
 *                    runtime deliberately configured with a durable key must not also expose a
 *                    faucet that hands out an identity to whoever asks.
 *
 *   EPHEMERAL_KEY  — no key configured. A random 32-byte key is generated once per process.
 *                    Authentication is exactly as unforgeable as in the configured mode — the
 *                    caller still cannot mint a token — but tokens die with the process, and
 *                    the prototype session route is available so the local operator page works.
 *                    This is the DEFAULT and it is the safe default: the portfolio demonstrates
 *                    itself without anyone planting a key in source.
 *
 *   MISCONFIGURED  — a key was set but is too short to be worth anything. This does NOT fall
 *                    back to ephemeral. Silently substituting a working mode for a
 *                    deliberately-configured-but-broken one is exactly the "misconfiguration
 *                    reported as success" failure the other two config modules exist to
 *                    prevent. Authentication refuses everything until it is fixed.
 *
 * NO KEY IS EVER HARD-CODED HERE. The ephemeral key is generated, never authored, and no
 * default value exists anywhere in this repository.
 */

export type Env = Readonly<Record<string, string | undefined>>;

export const OPERATOR_SIGNING_KEY_ENV_VAR = 'LEAD_RESCUE_OPERATOR_SIGNING_KEY';

/**
 * 32 characters. Short enough not to be onerous, long enough that a key chosen by hand is not
 * trivially guessable. A key below this is treated as a mistake, never as a weaker key.
 */
export const MINIMUM_SIGNING_KEY_LENGTH = 32;

export type OperatorAuthMode = 'CONFIGURED_KEY' | 'EPHEMERAL_KEY' | 'MISCONFIGURED';

export type OperatorAuthResolution =
  | {
      readonly mode: 'CONFIGURED_KEY' | 'EPHEMERAL_KEY';
      readonly signingKey: string;
      /** Whether the prototype principal-selector route may issue tokens. */
      readonly sessionIssuerEnabled: boolean;
    }
  | { readonly mode: 'MISCONFIGURED'; readonly reason: string; readonly sessionIssuerEnabled: false };

/**
 * PURE apart from the injected key generator, so every branch is unit-testable without
 * mutating the real environment. `generateKey` defaults to real randomness; tests inject a
 * deterministic one.
 */
export function resolveOperatorAuth(
  env: Env,
  generateKey: () => string = () => randomBytes(32).toString('hex'),
): OperatorAuthResolution {
  const configured = env[OPERATOR_SIGNING_KEY_ENV_VAR]?.trim();

  if (configured === undefined || configured === '') {
    return { mode: 'EPHEMERAL_KEY', signingKey: generateKey(), sessionIssuerEnabled: true };
  }

  if (configured.length < MINIMUM_SIGNING_KEY_LENGTH) {
    return {
      mode: 'MISCONFIGURED',
      reason: `${OPERATOR_SIGNING_KEY_ENV_VAR} is shorter than the required ${MINIMUM_SIGNING_KEY_LENGTH} characters. Refusing to authenticate anyone rather than accepting a weak key.`,
      sessionIssuerEnabled: false,
    };
  }

  // A runtime with a durable key is one somebody configured on purpose. It gets no faucet.
  return { mode: 'CONFIGURED_KEY', signingKey: configured, sessionIssuerEnabled: false };
}
