import { z } from 'zod';
import type { ExecutionMode } from '@/lib/model/runtime';

/**
 * THE EXTRACTION PORT.
 *
 * A peer to `DecisionProvider` (`lib/ports/decision-provider.ts`), not a replacement for
 * it. `DecisionProvider` fits a bounded judgment that returns ONE classification drawn
 * from a closed set — enquiry class, reply intent. Call-to-Proposal's transcript
 * extraction is a different shape: it returns MANY structured commercial-record fields
 * in a single pass, each citing the transcript segment(s) that support it. Forcing that
 * through `ClassificationResult`'s single `classification` string would mean smuggling
 * structured data through a field designed to carry a label, so this is a second, small
 * port with exactly the same philosophy as the first — one contract, one fixture
 * implementation today, room for exactly one live model adapter later — rather than a
 * generic "AIProvider" that means everything. Resist adding a third port; if a future
 * system's judgment does not fit either shape, that is itself a finding worth recording.
 *
 * Resolved in the same kind of pre-pass phase as `DecisionProvider` and
 * `SideEffectExecutor`, before the reducer runs (see `lib/engine/run.ts`), so the reducer
 * itself stays synchronous and replay stays exact.
 */

export interface TranscriptSegment {
  readonly id: string;
  readonly speaker: string;
  readonly text: string;
}

export interface ExtractionRequest {
  readonly judgmentId: string;
  readonly correlationId: string;
  /** What this extraction is for, in one sentence. */
  readonly objective: string;
  readonly sourceArtifactId: string;
  readonly segments: readonly TranscriptSegment[];
  /** Fields the caller needs. Anything the transcript did not establish must come back listed in `missingFields`, never guessed. */
  readonly requiredFields: readonly string[];
}

const FieldExtractionSchema = z.strictObject({
  field: z.string().min(1),
  value: z.string().min(1),
  /**
   * Segment ids from the request's `segments`. A provider MAY return zero — that is what
   * makes an unsupported claim structurally visible downstream rather than silently
   * dropped. The claim-admission gate, not this port, is what refuses a zero-citation
   * claim; this port only refuses a citation that points at input that was never given.
   */
  evidenceRefs: z.array(z.string().min(1)),
  confidence: z.number().min(0).max(1),
});

export const ExtractionResultSchema = z.strictObject({
  judgmentId: z.string().min(1),
  extracted: z.array(FieldExtractionSchema),
  /** Required fields the transcript did not establish. Must stay unknown downstream, never defaulted. */
  missingFields: z.array(z.string().min(1)),
  /** Claims the provider considered and declined to assert because the input did not support them. */
  declinedToInfer: z.array(z.string().min(1)),
  overallConfidence: z.number().min(0).max(1),
  rationaleSummary: z.string().min(1),
});

export type ExtractionResult = z.infer<typeof ExtractionResultSchema>;
export type FieldExtraction = z.infer<typeof FieldExtractionSchema>;

export interface ExtractionProvider {
  readonly id: string;
  readonly mode: ExecutionMode;
  readonly description: string;
  extract(request: ExtractionRequest): Promise<ExtractionResult>;
}

// ---------------------------------------------------------------------------
// Resolution outcomes
// ---------------------------------------------------------------------------

export type ResolvedExtraction =
  | { readonly status: 'OK'; readonly result: ExtractionResult }
  | { readonly status: 'CONTRACT_VIOLATION'; readonly judgmentId: string; readonly reason: string }
  | { readonly status: 'UNAVAILABLE'; readonly judgmentId: string; readonly reason: string };

// ---------------------------------------------------------------------------
// Fixture-backed implementation
// ---------------------------------------------------------------------------

/**
 * Replays pre-authored extractions. SIMULATED: no model is called and nothing leaves
 * this process. Output is still validated against the schema AND against the request's
 * own segment ids, because that validation is the part that must survive when a live
 * provider replaces this one — a malformed evidence reference must never silently
 * validate a buyer claim.
 */
export class FixtureExtractionProvider implements ExtractionProvider {
  readonly id = 'fixture-extraction-provider';
  readonly mode: ExecutionMode = 'SIMULATED';
  readonly description =
    'Replays pre-authored transcript extractions from scenario fixtures. No model is invoked.';

  constructor(private readonly extractions: Readonly<Record<string, ExtractionResult>>) {}

  async extract(request: ExtractionRequest): Promise<ExtractionResult> {
    const fixture = this.extractions[request.judgmentId];
    if (fixture === undefined) {
      throw new ExtractionUnavailableError(
        request.judgmentId,
        `no fixture extraction authored for "${request.judgmentId}"`,
      );
    }

    const parsed = ExtractionResultSchema.safeParse(fixture);
    if (!parsed.success) {
      throw new ExtractionContractError(
        request.judgmentId,
        `fixture extraction failed its output schema: ${parsed.error.issues.map((i) => i.message).join('; ')}`,
      );
    }

    const validSegmentIds = new Set(request.segments.map((s) => s.id));
    for (const field of parsed.data.extracted) {
      for (const ref of field.evidenceRefs) {
        if (!validSegmentIds.has(ref)) {
          throw new ExtractionContractError(
            request.judgmentId,
            `field "${field.field}" cites evidence ref "${ref}", which is not a segment id present in the source transcript supplied with this request. A citation must point at real input.`,
          );
        }
      }
    }

    return parsed.data;
  }
}

export class ExtractionContractError extends Error {
  constructor(
    readonly judgmentId: string,
    message: string,
  ) {
    super(message);
    this.name = 'ExtractionContractError';
  }
}

export class ExtractionUnavailableError extends Error {
  constructor(
    readonly judgmentId: string,
    message: string,
  ) {
    super(message);
    this.name = 'ExtractionUnavailableError';
  }
}

/** Resolves one request into a structured outcome, converting provider failures into data. */
export async function resolveExtraction(
  provider: ExtractionProvider,
  request: ExtractionRequest,
): Promise<ResolvedExtraction> {
  try {
    const result = await provider.extract(request);
    return { status: 'OK', result };
  } catch (error) {
    if (error instanceof ExtractionContractError) {
      return { status: 'CONTRACT_VIOLATION', judgmentId: request.judgmentId, reason: error.message };
    }
    if (error instanceof ExtractionUnavailableError) {
      return { status: 'UNAVAILABLE', judgmentId: request.judgmentId, reason: error.message };
    }
    return {
      status: 'UNAVAILABLE',
      judgmentId: request.judgmentId,
      reason: error instanceof Error ? error.message : 'unknown provider failure',
    };
  }
}
