import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DECISION_PROVIDER_MODE_ENV_VAR,
  LIVE_AI_EVAL_ENV_VAR,
  resolveDecisionProviderSelection,
  resolveIngressDecisionProvider,
  resolveLiveEvalGate,
} from '@/lib/config/decision-provider-config';
import { ClaudeDecisionProvider } from '@/lib/ports/claude-decision-provider';
import { JudgmentUnavailableError } from '@/lib/ports/decision-provider';

/**
 * FALSIFYING TESTS for the provider-activation defect: credential presence alone was
 * selecting the real `ClaudeDecisionProvider` (in `app/api/lead-rescue/ingress/route.ts`) and
 * was separately gating whether `tests/lead-rescue-claude-classifier-eval.test.ts` made a real
 * network call. Credentials are secrets, not feature flags — both decisions must require an
 * explicit opt-in IN ADDITION TO a usable credential, never the credential alone.
 */

describe('decision provider configuration — pure selection logic', () => {
  it('credential present, no explicit mode: selects fixture, never the real provider', () => {
    const selection = resolveDecisionProviderSelection({ ANTHROPIC_API_KEY: 'sk-ant-fake-value' });
    expect(selection.kind).toBe('FIXTURE');
  });

  it('explicit claude mode + usable credential: selects the real provider', () => {
    const selection = resolveDecisionProviderSelection({
      [DECISION_PROVIDER_MODE_ENV_VAR]: 'claude',
      ANTHROPIC_API_KEY: 'sk-ant-fake-value',
    });
    expect(selection.kind).toBe('CLAUDE');
  });

  it('explicit claude mode + no usable credential: fails safe, never silently falls back to fixture', () => {
    const selection = resolveDecisionProviderSelection({ [DECISION_PROVIDER_MODE_ENV_VAR]: 'claude' });
    expect(selection.kind).toBe('CLAUDE_MISSING_CREDENTIAL');
    if (selection.kind === 'CLAUDE_MISSING_CREDENTIAL') {
      expect(selection.reason.length).toBeGreaterThan(0);
    }
  });

  it('an unrecognized mode value is treated as fixture, never as an implicit real selection', () => {
    const selection = resolveDecisionProviderSelection({
      [DECISION_PROVIDER_MODE_ENV_VAR]: 'nonsense',
      ANTHROPIC_API_KEY: 'sk-ant-fake-value',
    });
    expect(selection.kind).toBe('FIXTURE');
  });

  it('ANTHROPIC_AUTH_TOKEN alone is also a usable credential for explicit claude mode', () => {
    const selection = resolveDecisionProviderSelection({
      [DECISION_PROVIDER_MODE_ENV_VAR]: 'claude',
      ANTHROPIC_AUTH_TOKEN: 'fake-token-value',
    });
    expect(selection.kind).toBe('CLAUDE');
  });

  it('fixture selection is unaffected by which credential env vars are set — deterministic either way', () => {
    const withCredential = resolveDecisionProviderSelection({ ANTHROPIC_API_KEY: 'sk-ant-fake-value' });
    const withoutCredential = resolveDecisionProviderSelection({});
    expect(withCredential.kind).toBe('FIXTURE');
    expect(withoutCredential.kind).toBe('FIXTURE');
  });

  it('never echoes a credential value anywhere in the resolved selection', () => {
    const secret = 'sk-ant-should-never-appear-anywhere';
    const selection = resolveDecisionProviderSelection({
      [DECISION_PROVIDER_MODE_ENV_VAR]: 'claude',
      ANTHROPIC_API_KEY: secret,
    });
    expect(JSON.stringify(selection)).not.toContain(secret);
  });
});

describe('decision provider configuration — ingress composition root', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('fixture mode + no credential: undefined provider, honest fixture provenance', () => {
    const resolution = resolveIngressDecisionProvider({});
    expect(resolution.provider).toBeUndefined();
    expect(resolution.classifierProvider).toBe('fixture-decision-provider');
  });

  it('fixture mode + credential present: STILL undefined provider — credential alone changes nothing', () => {
    const resolution = resolveIngressDecisionProvider({ ANTHROPIC_API_KEY: 'sk-ant-fake-value' });
    expect(resolution.provider).toBeUndefined();
    expect(resolution.classifierProvider).toBe('fixture-decision-provider');
  });

  it('real mode + credential: constructs the real ClaudeDecisionProvider', () => {
    // ClaudeDecisionProvider's own constructor builds a real Anthropic SDK client, which reads
    // credentials from the process's real env (not the injected `env` param) — stubbing this one
    // value is the minimal environment mutation needed to prove wiring without a network call.
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-ant-fake-value-not-real');
    const resolution = resolveIngressDecisionProvider({
      [DECISION_PROVIDER_MODE_ENV_VAR]: 'claude',
      ANTHROPIC_API_KEY: 'sk-ant-fake-value-not-real',
    });
    expect(resolution.provider).toBeInstanceOf(ClaudeDecisionProvider);
    expect(resolution.classifierProvider).toBe('claude-decision-provider');
  });

  it('real mode + no credential: fails safe — a provider is present but refuses to classify, never fixture', async () => {
    const resolution = resolveIngressDecisionProvider({ [DECISION_PROVIDER_MODE_ENV_VAR]: 'claude' });

    expect(resolution.provider).toBeDefined();
    expect(resolution.provider).not.toBeInstanceOf(ClaudeDecisionProvider);
    expect(resolution.classifierProvider).not.toBe('fixture-decision-provider');
    expect(resolution.classifierProvider).not.toBe('claude-decision-provider');

    await expect(
      resolution.provider!.classify({
        judgmentId: 'j-1',
        correlationId: 'corr-1',
        objective: 'test',
        input: 'test',
        permittedClassifications: ['A'],
        requiredFields: [],
      }),
    ).rejects.toBeInstanceOf(JudgmentUnavailableError);
  });
});

describe('live AI evaluation gate', () => {
  it('credential present, opt-in flag absent: gate stays disabled — no network call is authorized', () => {
    const gate = resolveLiveEvalGate({ ANTHROPIC_API_KEY: 'sk-ant-fake-value' });
    expect(gate.kind).toBe('DISABLED');
  });

  it('opt-in flag present + usable credential: gate is ready', () => {
    const gate = resolveLiveEvalGate({ [LIVE_AI_EVAL_ENV_VAR]: '1', ANTHROPIC_API_KEY: 'sk-ant-fake-value' });
    expect(gate.kind).toBe('READY');
  });

  it('opt-in flag present, no usable credential: gate reports the missing credential, never READY', () => {
    const gate = resolveLiveEvalGate({ [LIVE_AI_EVAL_ENV_VAR]: '1' });
    expect(gate.kind).toBe('MISSING_CREDENTIAL');
  });

  it('opt-in flag absent even with credential: gate never reaches READY by credential alone', () => {
    const gate = resolveLiveEvalGate({ ANTHROPIC_API_KEY: 'sk-ant-fake-value', ANTHROPIC_AUTH_TOKEN: 'also-fake' });
    expect(gate.kind).not.toBe('READY');
  });
});
