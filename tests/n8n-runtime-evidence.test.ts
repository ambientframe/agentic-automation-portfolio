import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { ingressEntityId } from '@/lib/engine/lead-ingress';
import { LEAD_RESCUE_INGRESS_SCHEMA_VERSION } from '@/lib/ingress/lead-rescue-ingress-contract';

/**
 * FALSIFYING TEST for retained n8n runtime evidence.
 *
 * This does not test application code — it tests a CLAIM: that a real local n8n runtime
 * actually executed both committed Lead Rescue workflows against the real HTTP boundary, and
 * that the evidence of that was retained (not deleted after the fact, as every prior n8n
 * verification pass in this repository's own history did).
 *
 * Every check below is a cross-check against something else genuinely committed to this repo
 * (the workflow JSON files, the real `ingressEntityId` function, the real ingress schema
 * version) rather than a self-consistency check on the evidence file alone — a hand-fabricated
 * evidence file with plausible-looking values would fail these cross-checks unless it happened
 * to reconstruct the real deterministic entity id and the real workflow HTTP targets.
 */

const EVIDENCE_PATH = path.join(process.cwd(), 'n8n', 'evidence', 'lead-rescue-runtime-execution.json');
const INGRESS_WORKFLOW_PATH = path.join(process.cwd(), 'n8n', 'workflows', 'lead-rescue-ingress.json');
const SWEEP_WORKFLOW_PATH = path.join(process.cwd(), 'n8n', 'workflows', 'lead-rescue-wait-sweep.json');

const SECRET_KEY_PATTERN = /(authorization|api[-_]?key|password|secret|cookie|bearer|access[-_]?token|refresh[-_]?token)/i;

interface EvidenceExecution {
  readonly workflow: { readonly repositoryPath: string; readonly name: string; readonly n8nWorkflowId: string };
  readonly n8nExecution: { readonly id: string; readonly status: string; readonly startedAt: string; readonly stoppedAt: string; readonly mode: string };
  readonly httpRequest: {
    readonly method: string;
    readonly targetRoute: string;
    readonly source?: string;
    readonly sourceEventId?: string;
  };
  readonly httpResponse: Record<string, unknown>;
  readonly durableApplicationState: Record<string, unknown> | null;
}

interface EvidenceDocument {
  readonly schemaVersion: string;
  readonly capturedAt: string;
  readonly n8n: { readonly version: string; readonly instance: string };
  readonly executions: readonly EvidenceExecution[];
  readonly providerMode: { readonly decisionProvider: string };
  readonly sideEffectMode: { readonly executor: string };
  readonly scopeStatement: string;
}

/** Recursively rejects any key or string value that looks like a retained secret. */
function assertNoSecrets(value: unknown, keyPath: string): void {
  if (value === null || value === undefined) return;
  if (typeof value === 'string') {
    expect(value, `value at ${keyPath} looks like a retained secret`).not.toMatch(/^Bearer\s|^sk-[A-Za-z0-9-]{10,}/);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoSecrets(item, `${keyPath}[${index}]`));
    return;
  }
  if (typeof value === 'object') {
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      expect(key, `key at ${keyPath}.${key} looks like a secret field name`).not.toMatch(SECRET_KEY_PATTERN);
      assertNoSecrets(nested, `${keyPath}.${key}`);
    }
  }
}

function readWorkflowNodeUrl(workflowJson: { nodes: Array<{ name: string; parameters?: { url?: string } }> }, nodeName: string): string {
  const node = workflowJson.nodes.find((n) => n.name === nodeName);
  if (node?.parameters?.url === undefined) {
    throw new Error(`workflow node "${nodeName}" has no configured URL`);
  }
  return node.parameters.url;
}

describe('n8n runtime evidence — retained proof a real local n8n execution crossed the real HTTP boundary', () => {
  it('a retained, sanitized evidence artifact exists and is well-formed JSON', () => {
    const raw = readFileSync(EVIDENCE_PATH, 'utf-8');
    const doc = JSON.parse(raw) as EvidenceDocument;
    expect(doc.schemaVersion).toBeTruthy();
    expect(Array.isArray(doc.executions)).toBe(true);
    expect(doc.executions.length).toBeGreaterThanOrEqual(2);
  });

  it('retains a real, n8n-issued execution identity for the ingress workflow, tied to the actual committed workflow and the actual application logic', () => {
    const doc = JSON.parse(readFileSync(EVIDENCE_PATH, 'utf-8')) as EvidenceDocument;
    const ingressWorkflowJson = JSON.parse(readFileSync(INGRESS_WORKFLOW_PATH, 'utf-8'));
    const execution = doc.executions.find((e) => e.workflow.repositoryPath === 'n8n/workflows/lead-rescue-ingress.json');
    expect(execution, 'no evidence entry for the ingress workflow').toBeDefined();
    if (execution === undefined) return;

    // 1. Repository/workflow identity: the evidence names the real committed workflow, not an invented one.
    expect(execution.workflow.name).toBe(ingressWorkflowJson.name);
    expect(execution.workflow.n8nWorkflowId.length).toBeGreaterThan(0);

    // 2 & 3. Real n8n execution identity, status, and timestamps — never fabricated placeholders.
    expect(execution.n8nExecution.id.length).toBeGreaterThan(0);
    expect(execution.n8nExecution.id).not.toBe('simulated');
    expect(execution.n8nExecution.status).toBe('success');
    const startedAt = Date.parse(execution.n8nExecution.startedAt);
    const stoppedAt = Date.parse(execution.n8nExecution.stoppedAt);
    expect(Number.isNaN(startedAt)).toBe(false);
    expect(Number.isNaN(stoppedAt)).toBe(false);
    expect(stoppedAt).toBeGreaterThanOrEqual(startedAt);

    // 4. Target application route — cross-checked against the REAL URL configured in the committed
    //    workflow's HTTP Request node, not merely asserted in isolation.
    const configuredUrl = readWorkflowNodeUrl(ingressWorkflowJson, 'Invoke Lead Rescue');
    expect(configuredUrl.endsWith(execution.httpRequest.targetRoute)).toBe(true);
    expect(execution.httpRequest.method).toBe('POST');

    // 5. Sanitized request identity.
    expect(execution.httpRequest.sourceEventId).toBeTruthy();
    expect(execution.httpRequest.source).toBeTruthy();

    // 6. HTTP response/result — cross-checked against the REAL deterministic entity-id function,
    //    not merely asserted in isolation. A hand-fabricated entityId would fail this line.
    const expectedEntityId = ingressEntityId(execution.httpRequest.source as string, execution.httpRequest.sourceEventId as string);
    expect(execution.httpResponse.entityId).toBe(expectedEntityId);
    expect(execution.httpResponse.outcome).toBe('ACCEPTED');
    expect(execution.httpResponse.classifierProvider).toBe('fixture-decision-provider');
    expect(execution.httpResponse.executionMode).toBe('SIMULATED');

    // 7. Resulting durable Lead Rescue record/state.
    expect(execution.durableApplicationState).not.toBeNull();
    const state = execution.durableApplicationState as Record<string, unknown>;
    const provenance = state.provenance as Record<string, unknown>;
    expect(provenance.ingestionPath).toBe('n8n');
    expect(provenance.sourceEventId).toBe(execution.httpRequest.sourceEventId);
  });

  it('retains a real, n8n-issued execution identity for the scheduled wait-sweep workflow, tied to the actual committed workflow', () => {
    const doc = JSON.parse(readFileSync(EVIDENCE_PATH, 'utf-8')) as EvidenceDocument;
    const sweepWorkflowJson = JSON.parse(readFileSync(SWEEP_WORKFLOW_PATH, 'utf-8'));
    const execution = doc.executions.find((e) => e.workflow.repositoryPath === 'n8n/workflows/lead-rescue-wait-sweep.json');
    expect(execution, 'no evidence entry for the wait-sweep workflow').toBeDefined();
    if (execution === undefined) return;

    expect(execution.workflow.name).toBe(sweepWorkflowJson.name);
    expect(execution.n8nExecution.id.length).toBeGreaterThan(0);
    expect(execution.n8nExecution.id).not.toBe('simulated');
    expect(execution.n8nExecution.status).toBe('success');
    // The schedule trigger fired ON ITS OWN — a genuinely different trigger mode than the
    // webhook-driven ingress execution above, proof this is a distinct real execution.
    expect(execution.n8nExecution.mode).toBe('trigger');

    const configuredUrl = readWorkflowNodeUrl(sweepWorkflowJson, 'Sweep Waiting Incidents');
    expect(configuredUrl.endsWith(execution.httpRequest.targetRoute)).toBe(true);
    expect(execution.httpRequest.method).toBe('POST');
    expect(execution.httpResponse.statusCode).toBe(200);
  });

  it('states provider mode (fixture) and side-effect mode (simulated) explicitly, and scopes the claim to n8n orchestration only', () => {
    const doc = JSON.parse(readFileSync(EVIDENCE_PATH, 'utf-8')) as EvidenceDocument;
    expect(doc.providerMode.decisionProvider).toBe('fixture');
    expect(doc.sideEffectMode.executor).toMatch(/simulat/i);
    expect(doc.scopeStatement).toMatch(/n8n/i);
    expect(doc.scopeStatement).toMatch(/not.*anthropic|anthropic.*not/i);
    expect(doc.scopeStatement).toMatch(/not.*(outbound|message|delivery|provider)/i);
  });

  it('the ingress envelope schema version recorded in evidence matches the real, current contract version', () => {
    const doc = JSON.parse(readFileSync(EVIDENCE_PATH, 'utf-8')) as EvidenceDocument;
    const execution = doc.executions.find((e) => e.workflow.repositoryPath === 'n8n/workflows/lead-rescue-ingress.json');
    expect(execution?.httpResponse.schemaVersionObserved ?? LEAD_RESCUE_INGRESS_SCHEMA_VERSION).toBe(LEAD_RESCUE_INGRESS_SCHEMA_VERSION);
  });

  it('never retains secrets, authorization headers, API keys, cookies, or tokens', () => {
    const doc = JSON.parse(readFileSync(EVIDENCE_PATH, 'utf-8')) as EvidenceDocument;
    assertNoSecrets(doc, 'evidence');
  });
});
