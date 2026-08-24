import { ClaudeDecisionProvider } from '@/lib/ports/claude-decision-provider';
import { JudgmentUnavailableError, type ClassificationRequest, type DecisionProvider } from '@/lib/ports/decision-provider';
import type { ClassificationResult, ExecutionMode } from '@/lib/model/runtime';

/**
 * THE ONE PLACE RUNTIME PROVIDER ACTIVATION IS DECIDED.
 *
 * Credentials are secrets, not feature flags. `ANTHROPIC_API_KEY`/`ANTHROPIC_AUTH_TOKEN` being
 * present must NEVER, by itself, select the real `ClaudeDecisionProvider` or authorize a live
 * network call — a developer or CI runner with a credential exported for an unrelated reason
 * (a shared shell profile, a copied `.env`) must get byte-for-byte the same SIMULATED behavior
 * as one with no credential at all. Selecting the real provider requires a SEPARATE, explicit
 * opt-in (`LEAD_RESCUE_DECISION_PROVIDER=claude`) in addition to a usable credential. The same
 * split applies to the live evaluation corpus: `RUN_LIVE_AI_EVAL=1` in addition to a credential,
 * never the credential alone — see `resolveLiveEvalGate`.
 *
 * `resolveDecisionProviderSelection` and `resolveLiveEvalGate` are PURE — no `process.env`
 * read, no SDK construction — so the activation decision itself is unit-testable without
 * mutating the environment or touching the network. `resolveIngressDecisionProvider` is the
 * thin, non-pure composition-root wrapper the ingress route actually calls: it defaults its
 * `env` parameter to `process.env`, and is the only place in this module that constructs a
 * real `ClaudeDecisionProvider` (which itself builds a live Anthropic SDK client).
 *
 * FAIL-SAFE, not silent fallback: if `claude` mode is explicitly selected but no credential is
 * usable, `resolveIngressDecisionProvider` does NOT fall back to fixture output — that would
 * silently substitute simulated classification for an explicitly requested real one while
 * reporting it as though the request had been honoured. Instead it returns a provider whose
 * `classify()` always throws `JudgmentUnavailableError`, the SAME typed error
 * `ClaudeDecisionProvider` itself throws on a genuine network failure. `resolveJudgment`
 * (`lib/ports/decision-provider.ts`) converts that into the existing `UNAVAILABLE` outcome,
 * which every Lead Rescue handler already routes to `NEEDS_HUMAN` — misconfiguration fails
 * exactly like a live network failure would, with zero new handling anywhere downstream.
 */

export type Env = Readonly<Record<string, string | undefined>>;

export const DECISION_PROVIDER_MODE_ENV_VAR = 'LEAD_RESCUE_DECISION_PROVIDER';
export const LIVE_AI_EVAL_ENV_VAR = 'RUN_LIVE_AI_EVAL';

export const DECISION_PROVIDER_MODES = ['fixture', 'claude'] as const;
export type DecisionProviderMode = (typeof DECISION_PROVIDER_MODES)[number];

/** Presence only is ever inspected — never a credential's value. */
function hasUsableAnthropicCredential(env: Env): boolean {
  return Boolean(env['ANTHROPIC_API_KEY']?.trim()) || Boolean(env['ANTHROPIC_AUTH_TOKEN']?.trim());
}

/** Any value other than the literal `claude` is fixture — an unrecognized value never implies "real". */
function resolveDecisionProviderMode(env: Env): DecisionProviderMode {
  return env[DECISION_PROVIDER_MODE_ENV_VAR]?.trim().toLowerCase() === 'claude' ? 'claude' : 'fixture';
}

export type DecisionProviderSelection =
  | { readonly kind: 'FIXTURE' }
  | { readonly kind: 'CLAUDE' }
  | { readonly kind: 'CLAUDE_MISSING_CREDENTIAL'; readonly reason: string };

/** Pure: decides WHICH provider should run, never constructs one. Safe to unit-test directly. */
export function resolveDecisionProviderSelection(env: Env): DecisionProviderSelection {
  if (resolveDecisionProviderMode(env) === 'fixture') {
    return { kind: 'FIXTURE' };
  }
  if (hasUsableAnthropicCredential(env)) {
    return { kind: 'CLAUDE' };
  }
  return {
    kind: 'CLAUDE_MISSING_CREDENTIAL',
    reason: `${DECISION_PROVIDER_MODE_ENV_VAR}=claude was set but neither ANTHROPIC_API_KEY nor ANTHROPIC_AUTH_TOKEN is configured`,
  };
}

/**
 * A composition-root-only guard value, not a third classification strategy — it classifies
 * nothing; it exists solely to turn "claude was explicitly selected but is unusable" into the
 * same `UNAVAILABLE` outcome any other provider failure already produces, instead of silently
 * reusing fixture output. See `lib/ports/decision-provider.ts`'s own "resist a third
 * implementation" guidance, which is about classification strategies, not this.
 */
function createUnavailableClaudeDecisionProvider(reason: string): DecisionProvider {
  const description = `claude-decision-provider was explicitly selected (${DECISION_PROVIDER_MODE_ENV_VAR}=claude) but is unavailable: ${reason}`;
  return {
    id: 'claude-decision-provider-unavailable',
    mode: 'LIVE' as ExecutionMode,
    description,
    async classify(request: ClassificationRequest): Promise<ClassificationResult> {
      throw new JudgmentUnavailableError(request.judgmentId, description);
    },
  };
}

export interface DecisionProviderResolution {
  /** `undefined` in fixture mode — the existing `LeadIngressDeps.provider` fallback applies unchanged. */
  readonly provider: DecisionProvider | undefined;
  /** Non-secret provenance only — the provider's own id, never a credential value. */
  readonly classifierProvider: string;
}

/**
 * THE INGRESS COMPOSITION ROOT. Defaults `env` to `process.env` for the real route; tests
 * inject a fake `env` object directly, so the fixture and missing-credential branches never
 * need to mutate the real environment at all.
 */
export function resolveIngressDecisionProvider(env: Env = process.env): DecisionProviderResolution {
  const selection = resolveDecisionProviderSelection(env);
  switch (selection.kind) {
    case 'FIXTURE':
      return { provider: undefined, classifierProvider: 'fixture-decision-provider' };
    case 'CLAUDE':
      return { provider: new ClaudeDecisionProvider(), classifierProvider: 'claude-decision-provider' };
    case 'CLAUDE_MISSING_CREDENTIAL':
      return {
        provider: createUnavailableClaudeDecisionProvider(selection.reason),
        classifierProvider: 'claude-decision-provider-unavailable',
      };
  }
}

export type LiveEvalGate =
  | { readonly kind: 'READY' }
  | { readonly kind: 'DISABLED' }
  | { readonly kind: 'MISSING_CREDENTIAL' };

/**
 * Gates `tests/lead-rescue-claude-classifier-eval.test.ts`'s live suite. `RUN_LIVE_AI_EVAL=1`
 * is required IN ADDITION TO a usable credential — a credential alone must never cause a real
 * network request during ordinary `npm test` / `npm run verify` / CI execution.
 */
export function resolveLiveEvalGate(env: Env): LiveEvalGate {
  if (env[LIVE_AI_EVAL_ENV_VAR] !== '1') {
    return { kind: 'DISABLED' };
  }
  return hasUsableAnthropicCredential(env) ? { kind: 'READY' } : { kind: 'MISSING_CREDENTIAL' };
}
