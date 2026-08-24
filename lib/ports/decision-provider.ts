import {
  ClassificationResultSchema,
  type ClassificationResult,
  type ExecutionMode,
} from '@/lib/model/runtime';

/**
 * THE BOUNDED-JUDGMENT PORT.
 *
 * This is a contract, not a framework. Two implementations exist: `FixtureDecisionProvider`
 * (below — SIMULATED, replays authored judgments) and `ClaudeDecisionProvider`
 * (`lib/ports/claude-decision-provider.ts` — LIVE, a real bounded model call). Resist adding
 * a third.
 *
 * `classify` is async because a real provider will be. Keeping the signature honest
 * now is the whole point of declaring the port early — a synchronous contract would
 * have to be broken the moment a live model appeared, and breaking it would ripple
 * into the engine and the UI.
 *
 * Purity is preserved by resolving judgments in a separate phase BEFORE the reducer
 * runs (see `lib/engine/run.ts`). The reducer itself stays synchronous and total, so
 * replay remains exact.
 */

export interface ClassificationRequest {
  readonly judgmentId: string;
  readonly correlationId: string;
  /** What this judgment is for, in one sentence. */
  readonly objective: string;
  /** The ambiguous input. Free text is exactly what deterministic code cannot handle. */
  readonly input: string;
  /**
   * The closed set of permitted classifications. A provider returning anything outside
   * this set has violated its contract; the engine treats that as AI_MALFORMED_OUTPUT
   * rather than trusting it.
   */
  readonly permittedClassifications: readonly string[];
  /** Fields the caller needs. Anything not present in the input must come back as missing. */
  readonly requiredFields: readonly string[];
}

export interface DecisionProvider {
  readonly id: string;
  readonly mode: ExecutionMode;
  readonly description: string;
  classify(request: ClassificationRequest): Promise<ClassificationResult>;
}

// ---------------------------------------------------------------------------
// Resolution outcomes
// ---------------------------------------------------------------------------

/**
 * Providers fail in ways the business must handle, so failure is modelled as data
 * rather than thrown. `CONTRACT_VIOLATION` and `UNAVAILABLE` map onto real entries in
 * the failure-mode register.
 */
export type ResolvedJudgment =
  | { readonly status: 'OK'; readonly result: ClassificationResult; readonly providerId: string }
  | { readonly status: 'CONTRACT_VIOLATION'; readonly judgmentId: string; readonly reason: string }
  | { readonly status: 'UNAVAILABLE'; readonly judgmentId: string; readonly reason: string };

// ---------------------------------------------------------------------------
// Fixture-backed implementation
// ---------------------------------------------------------------------------

/**
 * Replays pre-authored judgments. This is a SIMULATED provider: no model is called and
 * nothing leaves the process. Its output is still validated against the request
 * contract, because the validation is the part that must survive when a live provider
 * replaces it.
 */
export class FixtureDecisionProvider implements DecisionProvider {
  readonly id = 'fixture-decision-provider';
  readonly mode: ExecutionMode = 'SIMULATED';
  readonly description =
    'Replays pre-authored bounded judgments from scenario fixtures. No model is invoked.';

  constructor(private readonly judgments: Readonly<Record<string, ClassificationResult>>) {}

  async classify(request: ClassificationRequest): Promise<ClassificationResult> {
    const fixture = this.judgments[request.judgmentId];
    if (fixture === undefined) {
      throw new JudgmentUnavailableError(
        request.judgmentId,
        `no fixture judgment authored for "${request.judgmentId}"`,
      );
    }

    const parsed = ClassificationResultSchema.safeParse(fixture);
    if (!parsed.success) {
      throw new JudgmentContractError(
        request.judgmentId,
        `fixture judgment failed its output schema: ${parsed.error.issues.map((i) => i.message).join('; ')}`,
      );
    }

    if (!request.permittedClassifications.includes(parsed.data.classification)) {
      throw new JudgmentContractError(
        request.judgmentId,
        `classification "${parsed.data.classification}" is outside the permitted set [${request.permittedClassifications.join(', ')}]`,
      );
    }

    return parsed.data;
  }
}

export class JudgmentContractError extends Error {
  constructor(
    readonly judgmentId: string,
    message: string,
  ) {
    super(message);
    this.name = 'JudgmentContractError';
  }
}

export class JudgmentUnavailableError extends Error {
  constructor(
    readonly judgmentId: string,
    message: string,
  ) {
    super(message);
    this.name = 'JudgmentUnavailableError';
  }
}

/** Resolves one request into a structured outcome, converting provider failures into data. */
export async function resolveJudgment(
  provider: DecisionProvider,
  request: ClassificationRequest,
): Promise<ResolvedJudgment> {
  try {
    const result = await provider.classify(request);
    return { status: 'OK', result, providerId: provider.id };
  } catch (error) {
    if (error instanceof JudgmentContractError) {
      return { status: 'CONTRACT_VIOLATION', judgmentId: request.judgmentId, reason: error.message };
    }
    if (error instanceof JudgmentUnavailableError) {
      return { status: 'UNAVAILABLE', judgmentId: request.judgmentId, reason: error.message };
    }
    return {
      status: 'UNAVAILABLE',
      judgmentId: request.judgmentId,
      reason: error instanceof Error ? error.message : 'unknown provider failure',
    };
  }
}
