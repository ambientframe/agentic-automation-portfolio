import { resolveOperatorAuth, type OperatorAuthResolution } from '@/lib/config/operator-auth-config';

/**
 * THE OPERATOR AUTHENTICATION COMPOSITION ROOT.
 *
 * Resolved ONCE at module load, exactly like `leadRescueWaitStore` and the executor
 * resolution, and for the same reason: route handlers are stateless functions invoked fresh
 * per request, so there is no per-request decision to make about which mode this runtime is in.
 *
 * In `EPHEMERAL_KEY` mode the key is generated here and never leaves this process — it is not
 * written to disk, not logged, and not returned by any route. That is what makes the mode
 * honest: tokens are unforgeable for as long as the process lives, and worthless the moment it
 * restarts, which is exactly the guarantee a local prototype can actually make.
 *
 * `LEAD_RESCUE_OPERATOR_AUTH.signingKey` is a secret and is only ever read by
 * `authenticateOperator` and `mintOperatorToken`. Nothing serialises it.
 */
export const LEAD_RESCUE_OPERATOR_AUTH: OperatorAuthResolution = resolveOperatorAuth(process.env);

/** Non-secret, safe to report anywhere: which mode, never the key. */
export const LEAD_RESCUE_OPERATOR_AUTH_MODE = LEAD_RESCUE_OPERATOR_AUTH.mode;
