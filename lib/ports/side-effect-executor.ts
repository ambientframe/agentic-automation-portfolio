import {
  SendOutcomeSchema,
  VerifyOutcomeSchema,
  type ExecutionMode,
  type SendOutcome,
  type VerifyOutcome,
} from '@/lib/model/runtime';

/**
 * THE EXECUTION PORT.
 *
 * A peer to `DecisionProvider` (`lib/ports/decision-provider.ts`), same shape of contract:
 * one interface, one fixture-backed implementation today, room for exactly one more later
 * — a live provider adapter — without the engine core changing at all.
 *
 * Two distinct capabilities, because they answer two distinct questions:
 *
 *   attemptSend    — try to perform a customer-facing action. May succeed, may definitely
 *                    fail before anything happened, may be throttled, or may leave the
 *                    outcome genuinely unknown (the request left our system; no
 *                    confirmation came back).
 *   attemptVerify  — a read-only query against the provider's own authoritative status,
 *                    used ONLY to narrow an existing OUTCOME_UNKNOWN toward a definite
 *                    answer. It can never itself cause a customer-facing effect, and it
 *                    can never manufacture certainty the provider didn't actually give it
 *                    — `STILL_UNKNOWN` is a first-class, honest result.
 *
 * Both methods are async because a live provider will be. The engine core resolves every
 * attempt in a pre-pass BEFORE the pure reducer runs (see `lib/engine/run.ts`), exactly
 * as it already does for bounded judgments — so the reducer never awaits anything and
 * replay stays exact.
 */

export interface SendRequest {
  readonly attemptId: string;
  readonly idempotencyKey: string;
  readonly provider: string;
  readonly description: string;
}

export interface VerifyRequest {
  readonly attemptId: string;
  readonly targetIdempotencyKey: string;
  readonly provider: string;
}

export interface SideEffectExecutor {
  readonly id: string;
  readonly mode: ExecutionMode;
  readonly description: string;
  attemptSend(request: SendRequest): Promise<SendOutcome>;
  attemptVerify(request: VerifyRequest): Promise<VerifyOutcome>;
}

// ---------------------------------------------------------------------------
// Resolution outcomes — provider failures become data, never a thrown surprise
// ---------------------------------------------------------------------------

export type ResolvedSend =
  | { readonly status: 'OK'; readonly result: SendOutcome }
  | { readonly status: 'CONTRACT_VIOLATION'; readonly attemptId: string; readonly reason: string }
  | { readonly status: 'UNAVAILABLE'; readonly attemptId: string; readonly reason: string };

export type ResolvedVerify =
  | { readonly status: 'OK'; readonly result: VerifyOutcome }
  | { readonly status: 'CONTRACT_VIOLATION'; readonly attemptId: string; readonly reason: string }
  | { readonly status: 'UNAVAILABLE'; readonly attemptId: string; readonly reason: string };

// ---------------------------------------------------------------------------
// Fixture-backed implementation
// ---------------------------------------------------------------------------

/**
 * Replays pre-authored send and verify outcomes. SIMULATED: no provider is called and
 * nothing leaves the process. Output is still validated against the schema, because that
 * validation is the part that must survive when a live executor replaces this one.
 */
export class FixtureSideEffectExecutor implements SideEffectExecutor {
  readonly id = 'fixture-side-effect-executor';
  readonly mode: ExecutionMode = 'SIMULATED';
  readonly description =
    'Replays pre-authored send and verification outcomes from scenario fixtures. No provider is invoked.';

  constructor(
    private readonly sendOutcomes: Readonly<Record<string, SendOutcome>>,
    private readonly verifyOutcomes: Readonly<Record<string, VerifyOutcome>>,
  ) {}

  async attemptSend(request: SendRequest): Promise<SendOutcome> {
    const fixture = this.sendOutcomes[request.attemptId];
    if (fixture === undefined) {
      throw new AttemptUnavailableError(
        request.attemptId,
        `no fixture send outcome authored for "${request.attemptId}"`,
      );
    }
    const parsed = SendOutcomeSchema.safeParse(fixture);
    if (!parsed.success) {
      throw new AttemptContractError(
        request.attemptId,
        `fixture send outcome failed its schema: ${parsed.error.issues.map((i) => i.message).join('; ')}`,
      );
    }
    return parsed.data;
  }

  async attemptVerify(request: VerifyRequest): Promise<VerifyOutcome> {
    const fixture = this.verifyOutcomes[request.attemptId];
    if (fixture === undefined) {
      throw new AttemptUnavailableError(
        request.attemptId,
        `no fixture verify outcome authored for "${request.attemptId}"`,
      );
    }
    const parsed = VerifyOutcomeSchema.safeParse(fixture);
    if (!parsed.success) {
      throw new AttemptContractError(
        request.attemptId,
        `fixture verify outcome failed its schema: ${parsed.error.issues.map((i) => i.message).join('; ')}`,
      );
    }
    return parsed.data;
  }
}

export class AttemptContractError extends Error {
  constructor(
    readonly attemptId: string,
    message: string,
  ) {
    super(message);
    this.name = 'AttemptContractError';
  }
}

export class AttemptUnavailableError extends Error {
  constructor(
    readonly attemptId: string,
    message: string,
  ) {
    super(message);
    this.name = 'AttemptUnavailableError';
  }
}

export async function resolveSend(
  executor: SideEffectExecutor,
  request: SendRequest,
): Promise<ResolvedSend> {
  try {
    const result = await executor.attemptSend(request);
    return { status: 'OK', result };
  } catch (error) {
    if (error instanceof AttemptContractError) {
      return { status: 'CONTRACT_VIOLATION', attemptId: request.attemptId, reason: error.message };
    }
    if (error instanceof AttemptUnavailableError) {
      return { status: 'UNAVAILABLE', attemptId: request.attemptId, reason: error.message };
    }
    return {
      status: 'UNAVAILABLE',
      attemptId: request.attemptId,
      reason: error instanceof Error ? error.message : 'unknown executor failure',
    };
  }
}

export async function resolveVerify(
  executor: SideEffectExecutor,
  request: VerifyRequest,
): Promise<ResolvedVerify> {
  try {
    const result = await executor.attemptVerify(request);
    return { status: 'OK', result };
  } catch (error) {
    if (error instanceof AttemptContractError) {
      return { status: 'CONTRACT_VIOLATION', attemptId: request.attemptId, reason: error.message };
    }
    if (error instanceof AttemptUnavailableError) {
      return { status: 'UNAVAILABLE', attemptId: request.attemptId, reason: error.message };
    }
    return {
      status: 'UNAVAILABLE',
      attemptId: request.attemptId,
      reason: error instanceof Error ? error.message : 'unknown executor failure',
    };
  }
}
