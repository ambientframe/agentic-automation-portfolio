import { describe, expect, it } from 'vitest';
import {
  FixtureDecisionProvider,
  resolveJudgment,
  type ClassificationRequest,
} from '@/lib/ports/decision-provider';
import type { ClassificationResult } from '@/lib/model/runtime';

const VALID: ClassificationResult = {
  judgmentId: 'j-1',
  classification: 'QUALIFIED_ENQUIRY',
  confidence: 0.9,
  missingInformation: [],
  evidenceRefs: ['"we need a report"'],
  declinedToInfer: ['budget'],
  rationaleSummary: 'Clear commercial trigger.',
};

function request(overrides: Partial<ClassificationRequest> = {}): ClassificationRequest {
  return {
    judgmentId: 'j-1',
    correlationId: 'corr-1',
    objective: 'Classify the enquiry.',
    input: 'we need a report',
    permittedClassifications: ['QUALIFIED_ENQUIRY', 'NOT_AN_ENQUIRY'],
    requiredFields: [],
    ...overrides,
  };
}

describe('DecisionProvider port', () => {
  it('declares itself simulated, so the UI can never present it as live', () => {
    const provider = new FixtureDecisionProvider({ 'j-1': VALID });
    expect(provider.mode).toBe('SIMULATED');
    expect(provider.description).toContain('No model is invoked');
  });

  it('returns a fixture judgment that satisfies its contract', async () => {
    const provider = new FixtureDecisionProvider({ 'j-1': VALID });
    const resolved = await resolveJudgment(provider, request());

    expect(resolved.status).toBe('OK');
    if (resolved.status === 'OK') {
      expect(resolved.result.classification).toBe('QUALIFIED_ENQUIRY');
    }
  });

  it('refuses a classification outside the permitted set rather than coercing it', async () => {
    const provider = new FixtureDecisionProvider({
      'j-1': { ...VALID, classification: 'SOMETHING_INVENTED' },
    });
    const resolved = await resolveJudgment(provider, request());

    expect(resolved.status).toBe('CONTRACT_VIOLATION');
    if (resolved.status === 'CONTRACT_VIOLATION') {
      expect(resolved.reason).toContain('outside the permitted set');
    }
  });

  it('refuses output that fails its schema', async () => {
    const provider = new FixtureDecisionProvider({
      // Confidence outside [0,1] is not a usable probability.
      'j-1': { ...VALID, confidence: 4 } as ClassificationResult,
    });
    const resolved = await resolveJudgment(provider, request());

    expect(resolved.status).toBe('CONTRACT_VIOLATION');
  });

  it('reports an unauthored judgment as unavailable rather than inventing one', async () => {
    const provider = new FixtureDecisionProvider({});
    const resolved = await resolveJudgment(provider, request());

    expect(resolved.status).toBe('UNAVAILABLE');
    if (resolved.status === 'UNAVAILABLE') {
      expect(resolved.reason).toContain('no fixture judgment authored');
    }
  });

  it('converts every provider failure into data rather than throwing at the caller', async () => {
    const throwing = {
      id: 'broken',
      mode: 'SIMULATED' as const,
      description: 'always throws',
      classify: async () => {
        throw new Error('network exploded');
      },
    };

    const resolved = await resolveJudgment(throwing, request());
    expect(resolved.status).toBe('UNAVAILABLE');
    if (resolved.status === 'UNAVAILABLE') {
      expect(resolved.reason).toBe('network exploded');
    }
  });

  it('keeps the port asynchronous, so a live provider can satisfy it unchanged', () => {
    const provider = new FixtureDecisionProvider({ 'j-1': VALID });
    expect(provider.classify(request())).toBeInstanceOf(Promise);
  });
});
