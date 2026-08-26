import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { KESTREL } from '@/data/profiles/kestrel/profile';
import { ENQUIRY_CLASSES, REPLY_CLASSES } from '@/lib/engine/handlers/lead-rescue';
import { CLAUDE_DECISION_PROVIDER_DEFAULT_MODEL } from '@/lib/ports/claude-decision-provider';

/**
 * FALSIFYING TESTS OVER THE RETAINED LIVE-CLASSIFICATION EVIDENCE.
 *
 * This artifact is the only place in the repository that claims a genuine `claude-opus-5`
 * judgment ever executed. That makes it the highest-value place for a false claim to hide, so
 * every assertion below is written to FAIL on a plausible lie rather than to restate the file.
 *
 * Nothing here mirrors a constant for its own sake. Each check either recomputes an aggregate
 * from the artifact's own per-case records, cross-checks a value against the REAL repository
 * source it claims to describe, or proves a negative the artifact must not overclaim.
 *
 * THE CENTRAL LESSON THIS ARTIFACT ENCODES. An earlier run in the same package read
 * `classifierProvider: "claude-decision-provider"` on a request whose API call returned 401 and
 * produced NO judgment at all. Provider SELECTION is not proof of inference. Case 3 below is the
 * test that would have caught that run, and it is the reason a returned classification value —
 * not a provider label — is what this evidence rests on.
 */

const ARTIFACT_REPO_PATH = 'n8n/evidence/lead-rescue-live-classification.json';
const EVAL_SUITE_REPO_PATH = 'tests/lead-rescue-claude-classifier-eval.test.ts';
const REPO_ROOT = path.resolve(__dirname, '..');

/** Only the fields these tests actually read — deliberately not a mirror of the whole file. */
interface LiveClassificationArtifact {
  readonly gitHead: string;
  readonly syntheticInputs: boolean;
  readonly provider: { readonly providerId: string; readonly model: string };
  readonly runtimeHalf: {
    readonly capturedFacts: {
      readonly httpResponse: { readonly decisionRuleId: string | null; readonly outcome: string };
      readonly adapterProvenanceLogLine: string;
      readonly returnedClassification: string;
      readonly returnedConfidence: number;
    };
    readonly fixtureDistinguishability: {
      readonly fixtureConfidence: number;
      readonly distinguishable: boolean;
      readonly whyClassifierProviderAloneIsInsufficient: string;
    };
  };
  readonly evaluationHalf: {
    readonly corpusIntegrity: { readonly corpusSha1: string };
    readonly cases: readonly EvalCase[];
    readonly aggregate: {
      readonly completedCaseCount: number;
      readonly correctCount: number;
      readonly accuracy: number;
      readonly canonSensitiveCases: number;
      readonly canonSensitiveAllCorrect: boolean;
      readonly adversarialCorrect: boolean;
      readonly adversarialConfidence: number;
    };
    readonly declaredThresholds: readonly { readonly id: string; readonly declared: string; readonly passed: boolean }[];
    readonly overallPassed: boolean;
  };
  readonly independentCorroboration: { readonly available: boolean; readonly reason: string };
  readonly doesNotProve: readonly string[];
}

const artifact = JSON.parse(
  readFileSync(path.join(REPO_ROOT, ARTIFACT_REPO_PATH), 'utf8'),
) as LiveClassificationArtifact;

interface EvalCase {
  caseId: string;
  category: string;
  expectedClassification: string | null;
  acceptableClassifications: string[] | null;
  returnedClassification: string;
  confidence: number;
  correct: boolean;
  model: string;
  belowConfiguredConfidenceFloor: boolean;
}

const cases: readonly EvalCase[] = artifact.evaluationHalf.cases;
const aggregate = artifact.evaluationHalf.aggregate;

describe('retained live-classification evidence', () => {
  it('1. gitHead names a commit that genuinely exists in this repository', () => {
    const head = artifact.gitHead as string;
    expect(head).toMatch(/^[0-9a-f]{40}$/);
    // Throws if the object is unknown here — a fabricated sha cannot survive this.
    const type = execFileSync('git', ['cat-file', '-t', head], { encoding: 'utf8', cwd: REPO_ROOT }).trim();
    expect(type).toBe('commit');
  });

  it('2. the model and provider named are the REAL ones this repository would have used', () => {
    // Cross-checked against the adapter's own exported constant, not a copy.
    expect(artifact.provider.model).toBe(CLAUDE_DECISION_PROVIDER_DEFAULT_MODEL);
    expect(artifact.provider.providerId).toBe('claude-decision-provider');
    // The fail-closed stand-ins must never be presented as a genuine provider.
    expect(artifact.provider.providerId).not.toBe('fixture-decision-provider');
    expect(artifact.provider.providerId).not.toBe('claude-decision-provider-unavailable');
    for (const c of cases) {
      expect(c.model).toBe(CLAUDE_DECISION_PROVIDER_DEFAULT_MODEL);
    }
  });

  it('3. the runtime claim rests on a RETURNED JUDGMENT, not merely on provider selection', () => {
    const rt = artifact.runtimeHalf.capturedFacts;
    // A returned classification is the thing a 401 run could not have produced.
    expect(typeof rt.returnedClassification).toBe('string');
    expect(rt.returnedClassification.length).toBeGreaterThan(0);
    expect(typeof rt.returnedConfidence).toBe('number');
    // The adapter only logs this line AFTER schema validation and the permitted-set check pass.
    expect(rt.adapterProvenanceLogLine).toContain('[claude-decision-provider]');
    expect(rt.adapterProvenanceLogLine).toContain(`model=${CLAUDE_DECISION_PROVIDER_DEFAULT_MODEL}`);
    expect(rt.adapterProvenanceLogLine).toContain(`classification=${rt.returnedClassification}`);
    expect(rt.adapterProvenanceLogLine).toContain(`confidence=${rt.returnedConfidence.toFixed(2)}`);
    // A judgment that never happened would have routed to lr-t06/NEEDS_HUMAN, as the 401 run did.
    expect(rt.httpResponse.decisionRuleId).not.toBe('lr-t06');
    expect(rt.httpResponse.outcome).toBe('ACCEPTED');
    // The artifact must keep saying WHY the provider label alone is insufficient.
    expect(artifact.runtimeHalf.fixtureDistinguishability.whyClassifierProviderAloneIsInsufficient).toMatch(/401|selection/i);
  });

  it('4. the live result is genuinely distinguishable from the pinned fixture judgment', () => {
    // The fixture's confidence is read out of the REAL source, never copied into this test.
    const ingressSrc = readFileSync(path.join(REPO_ROOT, 'lib/engine/lead-ingress.ts'), 'utf8');
    const fixtureBlock = /const INGRESS_FIXTURE_JUDGMENT: ClassificationResult = \{([\s\S]*?)\n\};/.exec(ingressSrc);
    expect(fixtureBlock).not.toBeNull();
    const fixtureConfidence = Number(/confidence:\s*([\d.]+)/.exec(fixtureBlock![1] as string)![1]);

    expect(artifact.runtimeHalf.fixtureDistinguishability.fixtureConfidence).toBe(fixtureConfidence);
    expect(artifact.runtimeHalf.capturedFacts.returnedConfidence).not.toBe(fixtureConfidence);
    expect(artifact.runtimeHalf.fixtureDistinguishability.distinguishable).toBe(true);
  });

  it('5. all 9 frozen corpus cases are present, and the corpus itself is unaltered', () => {
    expect(cases).toHaveLength(9);
    expect(aggregate.completedCaseCount).toBe(9);
    expect(new Set(cases.map((c) => c.caseId)).size).toBe(9);

    // Recompute the corpus literal's hash from the CURRENT suite file. If anyone edits a label,
    // an example, or an expectation, this artifact's integrity claim becomes false and fails here.
    const suite = readFileSync(path.join(REPO_ROOT, EVAL_SUITE_REPO_PATH), 'utf8').split('\n');
    const start = suite.findIndex((l) => l.startsWith('export const CLASSIFIER_EVAL_CORPUS'));
    const end = suite.findIndex((l, i) => i > start && l === '];');
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const literal = suite.slice(start, end + 1).join('\n') + '\n';
    const sha = createHash('sha1').update(literal).digest('hex');
    expect(artifact.evaluationHalf.corpusIntegrity.corpusSha1).toBe(sha);
  });

  it('6. every returned classification is inside the closed set its case was permitted', () => {
    // Cross-checked against the handler's own exported sets — a value outside them would mean
    // the adapter's permitted-set gate had been bypassed.
    for (const c of cases) {
      const permitted = c.caseId.startsWith('rejection-') || c.caseId.startsWith('supplies-') ? REPLY_CLASSES : ENQUIRY_CLASSES;
      expect(permitted).toContain(c.returnedClassification);
    }
  });

  it('7. aggregate values agree with the underlying per-case records', () => {
    const recomputedCorrect = cases.filter((c) => c.correct).length;
    expect(aggregate.correctCount).toBe(recomputedCorrect);
    expect(aggregate.accuracy).toBeCloseTo(recomputedCorrect / cases.length, 10);

    const canon = cases.filter((c) => c.category === 'affirmative_canon' || c.category === 'policy_sensitive_canon');
    expect(aggregate.canonSensitiveCases).toBe(canon.length);
    expect(aggregate.canonSensitiveAllCorrect).toBe(canon.every((c) => c.correct));

    const adversarial = cases.find((c) => c.category === 'adversarial');
    expect(adversarial).toBeDefined();
    expect(aggregate.adversarialCorrect).toBe(adversarial!.correct);
    expect(aggregate.adversarialConfidence).toBe(adversarial!.confidence);

    // Each per-case `correct` must follow from that case's own frozen expectation.
    for (const c of cases) {
      const expected =
        c.expectedClassification !== null
          ? c.returnedClassification === c.expectedClassification
          : (c.acceptableClassifications ?? []).includes(c.returnedClassification);
      expect(c.correct).toBe(expected);
    }
  });

  it('8. the confidence-floor flag on each case matches the REAL configured floor', () => {
    const floor = KESTREL.operatingParameters.find((p) => p.key === 'confidenceFloor')?.value as number;
    expect(typeof floor).toBe('number');
    for (const c of cases) {
      expect(c.belowConfiguredConfidenceFloor).toBe(c.confidence < floor);
    }
  });

  it('9. no declared threshold is reported as passing unless it genuinely passes', () => {
    const thresholds = artifact.evaluationHalf.declaredThresholds;
    const by = (id: string) => thresholds.find((t) => t.id === id)!;

    const canon = cases.filter((c) => c.category === 'affirmative_canon' || c.category === 'policy_sensitive_canon');
    const adversarial = cases.find((c) => c.category === 'adversarial')!;
    const accuracy = cases.filter((c) => c.correct).length / cases.length;

    expect(by('canon-sourced-all-correct').passed).toBe(canon.every((c) => c.correct));
    expect(by('adversarial-correct').passed).toBe(adversarial.correct);
    expect(by('adversarial-confidence-below-one').passed).toBe(adversarial.confidence < 1.0);
    expect(by('overall-accuracy').passed).toBe(accuracy >= 0.75);

    // The headline verdict may never be more generous than the individual thresholds.
    expect(artifact.evaluationHalf.overallPassed).toBe(thresholds.every((t) => t.passed));
  });

  it('10. the accuracy threshold value is read from the suite, not invented by the artifact', () => {
    // If someone lowers the bar in the suite, or the artifact quotes a bar the suite never
    // declared, these two numbers stop agreeing.
    const suite = readFileSync(path.join(REPO_ROOT, EVAL_SUITE_REPO_PATH), 'utf8');
    const declaredInSuite = Number(/toBeGreaterThanOrEqual\(([\d.]+)\)/.exec(suite)![1]);
    const row = artifact.evaluationHalf.declaredThresholds.find((t) => t.id === 'overall-accuracy')!;
    const quotedInArtifact = Number(/([\d.]+)/.exec(row.declared)![1]);
    expect(quotedInArtifact).toBe(declaredInSuite);
  });

  it('11. the artifact refuses the overclaims this run cannot support', () => {
    const doesNotProve = (artifact.doesNotProve as string[]).join(' ').toLowerCase();
    for (const forbidden of ['production traffic', 'production deployment', 'live customer use', 'n8n', 'outbound', 'customer-proven']) {
      expect(doesNotProve).toContain(forbidden);
    }
    expect(artifact.syntheticInputs).toBe(true);

    // A failed evaluation must never be narrated as a passed one anywhere in the file.
    const whole = JSON.stringify(artifact).toLowerCase();
    if (artifact.evaluationHalf.overallPassed === false) {
      expect(whole).not.toContain('thresholds passed');
      expect(whole).not.toContain('evaluation earned');
    }

    // Nothing may assert a real recipient, a real send, or a real orchestration run.
    expect(whole).not.toContain('smtp message sent');
    expect(whole).not.toContain('n8nexecution');
  });

  it('12. no credential, token, or signature material appears anywhere in the artifact', () => {
    const whole = JSON.stringify(artifact);
    expect(whole).not.toMatch(/sk-ant-/);
    expect(whole).not.toMatch(/ANTHROPIC_API_KEY\s*[=:]\s*\S/);
    expect(whole).not.toMatch(/ANTHROPIC_AUTH_TOKEN\s*[=:]\s*\S/);
    expect(whole).not.toMatch(/Bearer\s+[A-Za-z0-9._-]{20,}/);
    // No long opaque blob that could be a key smuggled into a free-text field.
    expect(whole).not.toMatch(/[A-Za-z0-9_-]{60,}/);
  });

  it('13. independent corroboration is honestly reported as unavailable, never fabricated', () => {
    expect(artifact.independentCorroboration.available).toBe(false);
    expect(String(artifact.independentCorroboration.reason)).toMatch(/console|usage/i);
    // If it is unavailable, no usage or request-id figures may be present to imply otherwise.
    const whole = JSON.stringify(artifact).toLowerCase();
    expect(whole).not.toContain('"inputtokens"');
    expect(whole).not.toContain('"outputtokens"');
    expect(whole).not.toContain('"requestid"');
  });
});
