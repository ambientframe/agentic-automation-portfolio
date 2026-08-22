import { describe, expect, it } from 'vitest';
import {
  FixtureExtractionProvider,
  resolveExtraction,
  type ExtractionRequest,
  type ExtractionResult,
} from '@/lib/ports/extraction-provider';

const VALID: ExtractionResult = {
  judgmentId: 'j-1',
  extracted: [{ field: 'buyerCompanyName', value: 'Acme Robotics', evidenceRefs: ['seg-01'], confidence: 0.9 }],
  missingFields: ['budgetDiscussed'],
  declinedToInfer: ['budget — not discussed'],
  overallConfidence: 0.9,
  rationaleSummary: 'Clear buyer identity established early in the call.',
};

function request(overrides: Partial<ExtractionRequest> = {}): ExtractionRequest {
  return {
    judgmentId: 'j-1',
    correlationId: 'corr-1',
    objective: 'Extract the structured commercial record.',
    sourceArtifactId: 'transcript-1',
    segments: [{ id: 'seg-01', speaker: 'Buyer', text: "We're Acme Robotics." }],
    requiredFields: ['buyerCompanyName'],
    ...overrides,
  };
}

describe('ExtractionProvider port', () => {
  it('declares itself simulated, so the UI can never present it as live', () => {
    const provider = new FixtureExtractionProvider({ 'j-1': VALID });
    expect(provider.mode).toBe('SIMULATED');
    expect(provider.description).toContain('No model is invoked');
  });

  it('returns a fixture extraction that satisfies its contract', async () => {
    const provider = new FixtureExtractionProvider({ 'j-1': VALID });
    const resolved = await resolveExtraction(provider, request());

    expect(resolved.status).toBe('OK');
    if (resolved.status === 'OK') {
      expect(resolved.result.extracted[0]?.field).toBe('buyerCompanyName');
    }
  });

  it('refuses output that fails its schema', async () => {
    const provider = new FixtureExtractionProvider({
      // Confidence outside [0,1] is not a usable probability.
      'j-1': { ...VALID, overallConfidence: 4 } as ExtractionResult,
    });
    const resolved = await resolveExtraction(provider, request());

    expect(resolved.status).toBe('CONTRACT_VIOLATION');
  });

  it('a malformed evidence reference cannot silently validate a buyer claim', async () => {
    const provider = new FixtureExtractionProvider({
      'j-1': {
        ...VALID,
        extracted: [
          { field: 'buyerCompanyName', value: 'Acme Robotics', evidenceRefs: ['seg-99'], confidence: 0.9 },
        ],
      },
    });
    const resolved = await resolveExtraction(provider, request());

    expect(resolved.status).toBe('CONTRACT_VIOLATION');
    if (resolved.status === 'CONTRACT_VIOLATION') {
      expect(resolved.reason).toContain('seg-99');
      expect(resolved.reason).toContain('not a segment id present');
    }
  });

  it('permits a field asserted with zero evidence references — that is the claim-admission gate’s job, not this port’s', async () => {
    const provider = new FixtureExtractionProvider({
      'j-1': {
        ...VALID,
        extracted: [{ field: 'proposedScope', value: 'Expanded scope', evidenceRefs: [], confidence: 0.6 }],
      },
    });
    const resolved = await resolveExtraction(provider, request());
    expect(resolved.status).toBe('OK');
  });

  it('reports an unauthored extraction as unavailable rather than inventing one', async () => {
    const provider = new FixtureExtractionProvider({});
    const resolved = await resolveExtraction(provider, request());

    expect(resolved.status).toBe('UNAVAILABLE');
    if (resolved.status === 'UNAVAILABLE') {
      expect(resolved.reason).toContain('no fixture extraction authored');
    }
  });

  it('converts every provider failure into data rather than throwing at the caller', async () => {
    const throwing = {
      id: 'broken',
      mode: 'SIMULATED' as const,
      description: 'always throws',
      extract: async () => {
        throw new Error('network exploded');
      },
    };

    const resolved = await resolveExtraction(throwing, request());
    expect(resolved.status).toBe('UNAVAILABLE');
    if (resolved.status === 'UNAVAILABLE') {
      expect(resolved.reason).toBe('network exploded');
    }
  });

  it('keeps the port asynchronous, so a live provider can satisfy it unchanged', () => {
    const provider = new FixtureExtractionProvider({ 'j-1': VALID });
    expect(provider.extract(request())).toBeInstanceOf(Promise);
  });
});
