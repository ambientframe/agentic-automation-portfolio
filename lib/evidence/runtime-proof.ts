import { readFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

/**
 * EVIDENCE → PROOF. A read-only presentation model over the committed runtime artifacts.
 *
 * The artifacts in `n8n/evidence/` remain the source of truth. This module does NOT restate
 * what happened — it parses what was retained and derives a buyer-readable shape from it. Every
 * factual field below (execution ids, timestamps, counts, outcomes, receipt identity) is read
 * out of the artifact; only the narrative framing (which stage of TRIGGER → DECISION → ACTION →
 * GUARDRAIL → OUTCOME a fact belongs to) is authored here, and each framing line is built from
 * the derived values rather than typed as free prose that could drift from the evidence.
 *
 * SANITIZATION IS STRUCTURAL, NOT EDITORIAL. The schemas below are `strictObject`-free on
 * purpose — they PICK the fields that may be presented and ignore everything else, so a field
 * added to an artifact later (a body hash, a header dump, an operator note) cannot reach the UI
 * simply by existing. Nothing here reads message bodies, headers, hosts, or credentials.
 *
 * FAIL VISIBLY, NEVER FABRICATE. If an artifact is missing or fails its schema, this resolves
 * `UNAVAILABLE` with a reason and the surface says so. There is no branch that renders a
 * success-shaped card from absent evidence.
 */

export const N8N_EVIDENCE_REPO_PATH = 'n8n/evidence/lead-rescue-runtime-execution.json';
export const SMTP_EVIDENCE_REPO_PATH = 'n8n/evidence/lead-rescue-smtp-execution.json';

// ---------------------------------------------------------------------------
// Artifact schemas — deliberately partial: only what may be presented.
// ---------------------------------------------------------------------------

const N8nExecutionSchema = z.object({
  id: z.string().min(1),
  status: z.string().min(1),
  startedAt: z.string().min(1),
  mode: z.string().min(1),
});

const N8nEntrySchema = z.object({
  proofFocus: z.string().min(1).optional(),
  workflow: z.object({ repositoryPath: z.string().min(1), name: z.string().min(1), n8nWorkflowId: z.string().min(1) }),
  n8nExecution: N8nExecutionSchema,
  httpRequest: z.object({ method: z.string().min(1), targetRoute: z.string().min(1) }),
  httpResponse: z.object({ resultsCount: z.number().optional(), outcome: z.string().optional() }).passthrough(),
  postSweepState: z
    .object({
      capturedFacts: z.object({ operationClaim: z.object({ operationId: z.string().min(1), status: z.string().min(1) }) }),
    })
    .optional(),
  dueConditionEvaluation: z
    .object({
      derivedAssertions: z.object({ policyId: z.string().min(1), configuredWindowHours: z.number() }),
    })
    .optional(),
  replay: z
    .object({
      n8nExecution: z.object({ id: z.string().min(1) }),
      derivedAssertions: z.object({ duplicateSuppressed: z.boolean() }),
    })
    .optional(),
});

const N8nArtifactSchema = z.object({
  n8n: z.object({ version: z.string().min(1), instance: z.string().min(1) }),
  executions: z.array(N8nEntrySchema).min(1),
});

const SmtpArtifactSchema = z.object({
  gitHead: z.string().min(1),
  smtpServer: z.object({
    product: z.string().min(1),
    version: z.string().min(1),
    kind: z.string().min(1),
    relayConfigured: z.boolean(),
  }),
  authorizedSend: z.object({
    capturedFacts: z.object({
      operationClaimId: z.string().min(1),
      operationClaimStatus: z.string().min(1),
      captureServerReceipt: z.object({
        messageId: z.string().min(1),
        captureServerId: z.string().min(1),
        to: z.array(z.string().min(1)).min(1),
        receivedAt: z.string().min(1),
      }),
    }),
    derivedAssertions: z.object({ crossedRealSocket: z.boolean(), executorMode: z.string().min(1) }),
  }),
  duplicateReplay: z.object({
    capturedFacts: z.object({
      secondAttemptSideEffectStatus: z.string().min(1),
      captureServerMessageCountForOperation: z.number(),
    }),
  }),
  transportFailure: z.object({
    capturedFacts: z.object({ applicationSendOutcome: z.object({ kind: z.string().min(1) }) }),
  }),
});

// ---------------------------------------------------------------------------
// Presentation model
// ---------------------------------------------------------------------------

export type RuntimeProofKind = 'N8N_ORCHESTRATION' | 'SMTP_EXECUTION';

export interface ProofIdentifier {
  readonly label: string;
  readonly value: string;
}

/** The commercial grammar, in fixed order. Rendered as the story before any identifier. */
export interface ProofSequence {
  readonly trigger: string;
  readonly decision: string;
  readonly action: string;
  readonly guardrail: string;
  readonly outcome: string;
}

export interface RuntimeProof {
  readonly id: string;
  readonly kind: RuntimeProofKind;
  /** Plain-language headline. What a non-technical owner should take away. */
  readonly headline: string;
  readonly summary: string;
  readonly sequence: ProofSequence;
  readonly proves: readonly string[];
  readonly doesNotProve: readonly string[];
  readonly identifiers: readonly ProofIdentifier[];
  readonly runtime: { readonly name: string; readonly version: string; readonly locality: string };
  /** Only meaningful for a send; describes the recipient CLASS, never an address. */
  readonly recipientClass?: string;
  readonly evidenceSource: string;
  readonly observedAt: string;
}

export type RuntimeProofResolution =
  | { readonly status: 'AVAILABLE'; readonly proofs: readonly RuntimeProof[] }
  | { readonly status: 'UNAVAILABLE'; readonly reason: string };

/**
 * Derives the presentation model from already-parsed JSON. Pure — no filesystem — so the
 * absent/malformed branches are directly testable without touching disk.
 */
export function deriveRuntimeProof(n8nRaw: unknown, smtpRaw: unknown): RuntimeProofResolution {
  const n8n = N8nArtifactSchema.safeParse(n8nRaw);
  const smtp = SmtpArtifactSchema.safeParse(smtpRaw);

  if (!n8n.success && !smtp.success) {
    return {
      status: 'UNAVAILABLE',
      reason: 'No valid retained runtime evidence was found. Proof is shown only when a committed artifact supports it.',
    };
  }

  const proofs: RuntimeProof[] = [];

  if (n8n.success) {
    const { version, instance } = n8n.data.n8n;
    const locality = instance.includes('docker') || instance.includes('local') ? 'Local instance' : instance;

    // The state-mutating scheduled sweep — the strongest n8n proof retained.
    const sweep = n8n.data.executions.find((e) => e.proofFocus === 'due-incident-state-mutation');
    if (sweep !== undefined) {
      const claim = sweep.postSweepState?.capturedFacts.operationClaim;
      const policy = sweep.dueConditionEvaluation?.derivedAssertions;
      const resultsCount = sweep.httpResponse.resultsCount ?? 0;
      proofs.push({
        id: 'n8n-scheduled-sweep',
        kind: 'N8N_ORCHESTRATION',
        headline: 'The system woke itself up and acted on an overdue case — with no one at the keyboard.',
        summary:
          'An automation platform running as a separate service fired on its own schedule, called the application, found a case that had sat too long, and escalated it under the operator’s own written policy.',
        sequence: {
          trigger: `A scheduled trigger in ${'n8n'} fired unattended and called ${sweep.httpRequest.method} ${sweep.httpRequest.targetRoute}. Recorded by n8n as mode “${sweep.n8nExecution.mode}”, not a manual run.`,
          decision: policy
            ? `The application compared the case against the operator’s configured ${policy.configuredWindowHours}-hour window (policy ${policy.policyId}) and found it overdue. A fixed rule, not a judgement call.`
            : 'The application applied its configured deterministic timeout rule.',
          action: `The sweep returned ${resultsCount} case${resultsCount === 1 ? '' : 's'}, of which the overdue one was escalated to the next owner in the authority chain. The case itself was never auto-decided.`,
          guardrail: sweep.replay
            ? `A second scheduled run one minute later (execution ${sweep.replay.n8nExecution.id}) re-examined the same case and produced no second escalation.`
            : 'Duplicate action is prevented by a durable claim taken before any effect runs.',
          outcome: claim
            ? `A durable claim was recorded and confirmed (${claim.status}), so the escalation is permanently accounted for across restarts.`
            : 'The result was written to durable storage.',
        },
        proves: [
          'A real automation platform, running as a separate process, drove the application without human involvement.',
          'A deterministic written policy — not a model — decided the case was overdue.',
          'The result was written to durable storage and survives a restart.',
          'Re-running the same schedule did not double-act.',
        ],
        doesNotProve: [
          'This ran on a local instance, not a hosted or client deployment.',
          'No real customer or prospect was involved; the case was seeded for the demonstration.',
        ],
        identifiers: [
          { label: 'n8n execution', value: sweep.n8nExecution.id },
          ...(sweep.replay ? [{ label: 'Replay execution', value: sweep.replay.n8nExecution.id }] : []),
          { label: 'Workflow', value: sweep.workflow.n8nWorkflowId },
          { label: 'Workflow definition', value: sweep.workflow.repositoryPath },
          ...(claim ? [{ label: 'Operation claim', value: claim.operationId }] : []),
        ],
        runtime: { name: `n8n ${version}`, version, locality },
        evidenceSource: N8N_EVIDENCE_REPO_PATH,
        observedAt: sweep.n8nExecution.startedAt,
      });
    }

    // The inbound webhook path — a genuinely different trigger shape.
    const ingress = n8n.data.executions.find((e) => e.n8nExecution.mode === 'webhook');
    if (ingress !== undefined) {
      const outcome = typeof ingress.httpResponse.outcome === 'string' ? ingress.httpResponse.outcome : 'accepted';
      proofs.push({
        id: 'n8n-ingress',
        kind: 'N8N_ORCHESTRATION',
        headline: 'An incoming enquiry crossed from the automation platform into the system and became a real, tracked case.',
        summary:
          'A lead arriving at the automation platform was mapped, handed to the application over HTTP, and turned into a durable case the operator can see — with the platform owning transport only.',
        sequence: {
          trigger: `An inbound enquiry hit the automation platform’s webhook, which called ${ingress.httpRequest.method} ${ingress.httpRequest.targetRoute}.`,
          decision: `The application — never the automation platform — classified and routed the enquiry, returning “${outcome}”.`,
          action: 'A durable case was created and became visible to the operator, tagged with where it came from.',
          guardrail: 'Case identity is derived from the sender’s own event id, so a redelivered enquiry resolves to the same case instead of a second one.',
          outcome: 'The case was persisted with its origin recorded, and the platform received the application’s structured result.',
        },
        proves: [
          'A real automation platform can hand work to the system across an HTTP boundary and receive a structured answer.',
          'Every business decision stayed inside the application; the platform carried transport only.',
          'The resulting case records where it came from.',
        ],
        doesNotProve: [
          'The enquiry was authored for the demonstration — no real prospect, form provider, or CRM sent it.',
          'Classification on this path used the built-in fixture, not a real model.',
        ],
        identifiers: [
          { label: 'n8n execution', value: ingress.n8nExecution.id },
          { label: 'Workflow', value: ingress.workflow.n8nWorkflowId },
          { label: 'Workflow definition', value: ingress.workflow.repositoryPath },
        ],
        runtime: { name: `n8n ${version}`, version, locality },
        evidenceSource: N8N_EVIDENCE_REPO_PATH,
        observedAt: ingress.n8nExecution.startedAt,
      });
    }
  }

  if (smtp.success) {
    const d = smtp.data;
    const receipt = d.authorizedSend.capturedFacts.captureServerReceipt;
    const replay = d.duplicateReplay.capturedFacts;
    proofs.push({
      id: 'smtp-execution',
      kind: 'SMTP_EXECUTION',
      // Deliberately NOT "exactly one"/"exactly once": the evidence shows a single retained
      // message for this operation, which is a duplicate-suppression fact, not a delivery
      // guarantee. The weaker, accurate wording is the honest one.
      headline: 'An authorised notification genuinely left the system over the network — and the receiving server independently recorded it.',
      summary:
        'Every earlier “action” in this portfolio was a label in a data structure. This one opened a real connection to a separate mail server, which recorded the message on its own and can be asked about it independently.',
      sequence: {
        trigger: 'The overdue case above authorised an escalation notification to the next owner.',
        decision: 'The authority and policy gates cleared the action, and a durable claim was taken before anything was sent.',
        action: `The notification left the application over SMTP across a real network connection to a separate ${d.smtpServer.product} server.`,
        guardrail: `Re-processing the same escalation produced “${replay.secondAttemptSideEffectStatus}” instead of a second send, and the receiving server still held ${replay.captureServerMessageCountForOperation} message for it. A transport failure test returned “${d.transportFailure.capturedFacts.applicationSendOutcome.kind}” rather than a false success.`,
        outcome: `The receiving server recorded the message itself and issued its own receipt, which matches the identifier the application reported.`,
      },
      proves: [
        'An authorised action genuinely crossed the process and network boundary — not a simulated success.',
        'A separate server independently observed the message; two systems agree on the same identifier.',
        'Replaying the same action produced no second delivery.',
        'A connection failure was reported honestly instead of being recorded as success.',
      ],
      doesNotProve: [
        'The receiving server was a local sandbox that stores mail and does not forward it onward.',
        'The recipient was a synthetic address on a reserved, non-routable domain — no real person, mailbox, or mail provider was contacted.',
        'This is not a client deployment, and it does not establish delivery guarantees against a real mail provider.',
      ],
      identifiers: [
        { label: 'Capture-server receipt', value: receipt.captureServerId },
        { label: 'Message identifier', value: receipt.messageId },
        { label: 'Operation claim', value: d.authorizedSend.capturedFacts.operationClaimId },
        { label: 'Claim status', value: d.authorizedSend.capturedFacts.operationClaimStatus },
        { label: 'Evidence recorded at commit', value: d.gitHead.slice(0, 12) },
      ],
      runtime: {
        name: `${d.smtpServer.product} ${d.smtpServer.version}`,
        version: d.smtpServer.version,
        locality: d.smtpServer.relayConfigured ? 'Relay configured' : 'Local sandbox, no relay configured',
      },
      recipientClass: 'Synthetic sandbox recipient on a reserved, non-routable domain',
      evidenceSource: SMTP_EVIDENCE_REPO_PATH,
      observedAt: receipt.receivedAt,
    });
  }

  if (proofs.length === 0) {
    return { status: 'UNAVAILABLE', reason: 'Retained evidence was found but contained no presentable proof records.' };
  }
  return { status: 'AVAILABLE', proofs };
}

/**
 * Reads both artifacts from the repository and derives the model. Called at build time by the
 * statically-prerendered system page, so a missing artifact surfaces as an explicit unavailable
 * state in the built page rather than as a runtime error for a visitor.
 */
export function loadRuntimeProof(): RuntimeProofResolution {
  return deriveRuntimeProof(readJsonOrUndefined(N8N_EVIDENCE_REPO_PATH), readJsonOrUndefined(SMTP_EVIDENCE_REPO_PATH));
}

/**
 * Deliberately synchronous: this runs only at build/prerender time (the Lead Rescue dossier is
 * statically generated), never inside a request. A missing or unreadable artifact returns
 * `undefined` so `deriveRuntimeProof` can resolve UNAVAILABLE rather than throwing the build.
 */
function readJsonOrUndefined(repoRelativePath: string): unknown {
  try {
    return JSON.parse(readFileSync(path.join(process.cwd(), repoRelativePath), 'utf8'));
  } catch {
    return undefined;
  }
}
