import { LEAD_RESCUE } from '@/data/systems';
import { KESTREL } from '@/data/profiles/kestrel/profile';
import { numberParam } from '@/lib/model/profile';
import { describeRecovery } from '@/lib/model/system';
import {
  resolveDecisionProviderSelection,
  resolveLiveEvalGate,
  type DecisionProviderSelection,
  type Env,
} from '@/lib/config/decision-provider-config';
import {
  resolveSideEffectExecutorSelection,
  type SideEffectExecutorSelection,
} from '@/lib/config/side-effect-executor-config';
import { resolveOperatorAuth, type OperatorAuthResolution } from '@/lib/config/operator-auth-config';
import {
  evidenceProvesOrchestration,
  evidenceRecordsEvaluation,
  LIVE_CLASSIFICATION_EVIDENCE_RELATIVE_PATH,
  OBSERVATION_INTEGRITY_EVIDENCE_RELATIVE_PATH,
  type EvaluationEvidence,
  type ObservationIntegrityEvidence,
  type RuntimeEvidence,
} from './n8n-evidence';

/**
 * THE FIDELITY LEDGER — the answer to "which parts of this are actually real?", asked
 * capability by capability rather than as one maturity word.
 *
 * `LEAD_RESCUE.maturity` is a single label for the whole system, which is correct for an
 * index page and useless to a buyer looking at a specific screen: it cannot distinguish a
 * persistence layer that genuinely writes to disk from an outbound send that genuinely does
 * nothing. This module splits that one judgement into per-capability rows.
 *
 * FOUR RULES, each present because its absence is a specific way to mislead:
 *
 *   1. DERIVED WHERE DERIVABLE. Provider and executor status are read from the process's own
 *      resolved configuration, so switching this build to a live model or a real SMTP
 *      transport changes these rows without anyone remembering to edit them. Orchestration
 *      status is read from retained evidence through `n8n-evidence.ts`.
 *   2. NO ROW MAY IMPROVE ITS OWN STATUS. `status` is only ever assigned from the four
 *      constants below; there is no branch that promotes a capability because the surface
 *      renders it well.
 *   3. EVERY ROW NAMES ITS BASIS. `basis` points at the file or test a sceptic can open. A
 *      row asserting REAL without one would be exactly the unfalsifiable claim this ledger
 *      exists to replace.
 *   4. EVERY ROW STATES ITS LIMIT. `limit` is what the row does NOT establish. A REAL status
 *      with no stated limit reads as "production ready", which none of these are.
 *
 * This module reports maturity. It never raises it.
 */

export const FIDELITY_STATUSES = ['REAL', 'FIXTURE_BACKED', 'SIMULATED', 'UNVERIFIED'] as const;
export type FidelityStatus = (typeof FIDELITY_STATUSES)[number];

export const FIDELITY_STATUS_LABEL: Record<FidelityStatus, string> = {
  REAL: 'Real',
  FIXTURE_BACKED: 'Fixture-backed',
  SIMULATED: 'Simulated',
  UNVERIFIED: 'Unverified',
};

/** What each label licenses a reader to believe. Rendered as the legend, verbatim. */
export const FIDELITY_STATUS_MEANING: Record<FidelityStatus, string> = {
  REAL: 'Genuinely executes. Something outside this page — a file on disk, a separate process, a network socket, the system clock — is involved and can be inspected independently.',
  FIXTURE_BACKED: 'Genuinely executes, but its input is a value authored in advance rather than produced by a model or a provider. The code path is real; the answer was written down.',
  SIMULATED: 'Runs as a stand-in. Nothing leaves this process. No recipient, provider, or external system is involved at all.',
  UNVERIFIED: 'Not demonstrated here. Either nothing exercises it yet, or the evidence needed to claim it has not been produced.',
};

/**
 * A retained measurement's own verdict, distinct from `status`. `REAL` on the evaluation
 * row means the measurement happened, never that it passed. Without this field a green
 * "Real" badge is the only thing a skimming reader would take from a failed capture.
 */
export interface FidelityVerdict {
  readonly label: string;
  readonly tone: 'NEGATIVE' | 'AFFIRMATIVE';
}

export interface FidelityRow {
  readonly id: string;
  readonly capability: string;
  readonly status: FidelityStatus;
  /** What is true today, stated so it could be falsified. */
  readonly whatIsTrue: string;
  /** Where a sceptic checks it. A path in this repository. */
  readonly basis: string;
  /** What this row does NOT establish. Never omitted. */
  readonly limit: string;
  readonly verdict?: FidelityVerdict;
}

export interface FidelityLedger {
  readonly rows: readonly FidelityRow[];
  /** `LEAD_RESCUE.maturity`, passed through. This module never recomputes it. */
  readonly declaredMaturity: string;
  /** `LEAD_RESCUE.fidelityNote`, rendered verbatim. */
  readonly fidelityNote: string;
  readonly counts: Readonly<Record<FidelityStatus, number>>;
}

// ---------------------------------------------------------------------------

/**
 * Both composition roots resolve to THREE states, not two: the selected implementation, the
 * default stand-in, and "the real one was explicitly asked for and cannot run". That third
 * state fails closed — the judgment becomes UNAVAILABLE and routes to a person; the send
 * becomes an unconfirmed attempt. Neither is fixture-backed or simulated behaviour, so
 * folding it into those rows with a `!== 'CLAUDE'` test would report a broken configuration
 * as a working one. These two helpers exhaust the union instead, which also means adding a
 * fourth state fails the typecheck rather than silently picking the flattering label.
 */
function classificationRow(
  provider: DecisionProviderSelection,
  floor: number,
): Pick<FidelityRow, 'status' | 'whatIsTrue'> {
  switch (provider.kind) {
    case 'CLAUDE':
      return {
        status: 'REAL',
        whatIsTrue: `This process is configured to call a live model through the DecisionProvider port. The port validates the response against the permitted action set and the ${floor} confidence floor before the engine is allowed to see it.`,
      };
    case 'FIXTURE':
      return {
        status: 'FIXTURE_BACKED',
        whatIsTrue: `Classifications on this route are replayed from values authored alongside each scenario. The port, its output contract, the permitted-set check, and the ${floor} confidence floor all execute for real — only the answer is pre-written.`,
      };
    case 'CLAUDE_MISSING_CREDENTIAL':
      return {
        status: 'UNVERIFIED',
        whatIsTrue: `A live model was explicitly selected for this process but no usable credential is configured, so classification is deliberately failing closed: every judgment raises the same unavailable error a network failure would, and each one routes to a person. It is not falling back to the fixture. Reason given: ${provider.reason}.`,
      };
  }
}

function outboundRow(executor: SideEffectExecutorSelection): Pick<FidelityRow, 'status' | 'whatIsTrue'> {
  switch (executor.kind) {
    case 'SMTP':
      return {
        status: 'REAL',
        whatIsTrue:
          'This process is configured to send over a real SMTP transport, so an authorised action genuinely crosses the process and network boundary and can be observed arriving in a local mailbox.',
      };
    case 'SIMULATED':
      return {
        status: 'SIMULATED',
        whatIsTrue:
          'Every send on this route is a deterministic stand-in. The claim-then-invoke ordering, the authority gate, and the duplicate refusal are all real; the transport is not. Nothing leaves this process and no recipient exists.',
      };
    case 'WEBHOOK':
      return {
        status: 'REAL',
        whatIsTrue:
          'This process is configured to deliver an authorised notification over HTTPS to a third-party automation platform that is not on this machine. The action genuinely leaves this computer, and the receiving system records it in an execution log this application cannot write to or edit — so the delivery can be checked against a record it does not own.',
      };
    case 'SMTP_MISCONFIGURED':
    case 'WEBHOOK_MISCONFIGURED':
      return {
        status: 'UNVERIFIED',
        whatIsTrue: `Real sending was explicitly selected for this process but its configuration is unusable, so outbound execution is failing closed rather than quietly reverting to the stand-in: each attempt raises the same error a transport failure would and is recorded as unconfirmed. Reason given: ${executor.reason}.`,
      };
  }
}

/**
 * The third composition root, resolved the same way and exhausted the same way. Its
 * MISCONFIGURED branch is the one that matters: a runtime whose signing key is unusable
 * authenticates nobody and answers every operator action with a 503, which is neither a
 * working authenticated boundary nor an unauthenticated one. Reporting it as REAL because a
 * key was configured would describe a guarantee this process cannot currently make.
 */
function operatorAuthenticationRow(auth: OperatorAuthResolution): Pick<FidelityRow, 'status' | 'whatIsTrue'> {
  switch (auth.mode) {
    case 'CONFIGURED_KEY':
      return {
        status: 'REAL',
        whatIsTrue:
          'Operator actions require a credential signed with a durable key this runtime was deliberately given, so a token survives a restart. In this mode the prototype principal selector refuses to issue anything at all: a runtime holding a real key must not also expose a faucet that hands an identity to whoever asks.',
      };
    case 'EPHEMERAL_KEY':
      return {
        status: 'REAL',
        whatIsTrue:
          'Operator actions require a credential signed with a key generated inside this process and never written to disk, logged, or returned by any route. A caller cannot mint one, and a request that names its own role is refused by the schema before a handler runs — the role is resolved from the credential instead. Tokens die with the process.',
      };
    case 'MISCONFIGURED':
      return {
        status: 'UNVERIFIED',
        whatIsTrue: `A signing key was configured for this runtime but is unusable, so it authenticates nobody: every operator action fails closed rather than quietly accepting a weak key or reverting to an unauthenticated path. Reason given: ${auth.reason}.`,
      };
  }
}

/**
 * The judgment-quality row, and the one place on this page where better evidence produces
 * a worse-sounding sentence.
 *
 * A retained capture that FAILED still moves this row to REAL, because the capability being
 * reported is "has the judgment actually been measured", not "did it score well". Reporting
 * a measured-and-failing classifier as UNVERIFIED would hide a negative result behind a word
 * that reads like an absence, which is the more flattering and therefore worse answer.
 *
 * Every figure is read from the artefact and recomputed from the case counts rather than
 * taken from its summary line, so a capture whose own arithmetic disagreed with its cases
 * could not state a number here that its cases do not support.
 */
function evaluationRow(
  evidence: EvaluationEvidence,
  gateOpen: boolean,
): Pick<FidelityRow, 'status' | 'whatIsTrue' | 'basis' | 'limit' | 'verdict'> {
  const harnessBasis =
    'tests/lead-rescue-claude-classifier-eval.test.ts · lib/config/decision-provider-config.ts';

  if (!evidenceRecordsEvaluation(evidence)) {
    return {
      status: 'UNVERIFIED',
      whatIsTrue: gateOpen
        ? 'The live evaluation gate is open in this process, so the classifier can be scored against its labelled cases on demand. No retained result is readable from this build, so no accuracy figure is claimed.'
        : 'An evaluation harness exists but is gated off by default and is not running in this process. No retained result is readable from this build, so no accuracy figure is claimed anywhere on this page.',
      basis: harnessBasis,
      limit:
        'Even when open, the evaluation covers a small authored set. It would not support a stated accuracy rate for a client\u2019s own traffic.',
    };
  }

  const { correctCount, completedCaseCount, unsafeMisclassifiedCount } = evidence;
  const score = `${correctCount} of ${completedCaseCount}`;
  const model = evidence.model ?? 'the configured model';

  /**
   * The safety sentence is only added when the artefact recorded the count that licenses it.
   * "No unsafe misclassification" is the most reassuring claim on this row and the one least
   * entitled to a default, so an artefact that omits the count gets silence, not reassurance.
   */
  const safety =
    unsafeMisclassifiedCount === 0
      ? ' Every incorrect case still routed to a person rather than to an action: the capture records no unsafe misclassification.'
      : unsafeMisclassifiedCount !== null && unsafeMisclassifiedCount > 0
        ? ` The capture records ${unsafeMisclassifiedCount} unsafe misclassification(s).`
        : '';

  return {
    status: 'REAL',
    whatIsTrue: evidence.overallPassed
      ? `The labelled corpus has been run against a genuine ${model} and met its predeclared thresholds, scoring ${score}. The result is retained as an artefact rather than asserted here.${safety}`
      : `The labelled corpus has been run against a genuine ${model} and FAILED its own predeclared thresholds, scoring ${score}. The failing result is retained rather than re-run, re-labelled, or removed, and is reported here for the same reason.${safety}`,
    basis: `${LIVE_CLASSIFICATION_EVIDENCE_RELATIVE_PATH} · tests/live-classification-evidence.test.ts · ${harnessBasis}`,
    limit: `A point-in-time capture of a small authored set${
      evidence.gitHead === null ? '' : ` against commit ${evidence.gitHead.slice(0, 7)}`
    }, not a continuously enforced gate. It does not support a stated accuracy rate for a client\u2019s own traffic, and this build reports the artefact rather than re-running it.`,
    verdict: evidence.overallPassed
      ? { label: 'Met its own thresholds', tone: 'AFFIRMATIVE' }
      : { label: 'Failed its own thresholds', tone: 'NEGATIVE' },
  };
}

/**
 * The observability row, and the second place on this page where better evidence produces a
 * more uncomfortable sentence.
 *
 * A capture that reports KNOWN_LOSS still makes this row REAL, for the same reason a failing
 * evaluation does: the capability being reported is "can this system tell you when its own
 * record is incomplete", not "was the record complete". Reporting a measured loss as anything
 * other than the capability working would be the flattering answer and the wrong one.
 *
 * Everything here is read from the artefact. A build with no capture says so and claims
 * nothing, rather than describing a mechanism the reader cannot check.
 */
function observabilityRow(
  observation: ObservationIntegrityEvidence | undefined,
): Pick<FidelityRow, 'status' | 'whatIsTrue' | 'basis' | 'limit'> {
  const limit =
    'Local prototype scale, and it raises conditions on a page rather than sending them anywhere. There is no pager, inbox, or external notification channel in this build, so a condition still waits for somebody to open this surface.';

  if (observation === undefined || observation.kind !== 'PRESENT') {
    return {
      status: 'UNVERIFIED',
      whatIsTrue:
        'An observation-integrity mechanism and an alert layer exist in the repository, but no retained capture is readable from this build, so neither is claimed here.',
      basis: 'lib/observability/observation-integrity.ts · lib/observability/operational-alerts.ts',
      limit,
    };
  }

  const raised = observation.alerts.filter((alert) => alert.status === 'ACTIVE').length;
  const verdict =
    observation.integrityKind === 'KNOWN_LOSS'
      ? `it reported ${observation.lossCount} observation(s) as genuinely missing, naming each one and why`
      : observation.integrityKind === 'UNAVAILABLE'
        ? 'it reported that it could not answer, rather than reporting a clean result it could not support'
        : 'it reported no known loss, bounded by what that answer cannot rule out';

  return {
    status: 'REAL',
    whatIsTrue: `Every observation is accounted for by a durable write-ahead marker reconciled against the journal, so a dropped record becomes a named measurement instead of a silent gap. In the retained run — where the journal directory was deliberately made unwritable for one ingress — ${verdict}, and ${raised} operational condition(s) were raised for a person rather than left to be found. The same run drove a real despatch to a confirmed non-execution and to a genuinely unresolved outcome, each checked against a receiving process that recorded the exchange independently.`,
    basis: `${OBSERVATION_INTEGRITY_EVIDENCE_RELATIVE_PATH} · lib/observability/observation-integrity.ts · lib/observability/operational-alerts.ts · tests/lead-rescue-observation-integrity.test.ts`,
    limit,
  };
}

export interface LedgerInputs {
  readonly evidence: RuntimeEvidence;
  /** The retained evaluation capture, read through the same quarantined adapter. */
  readonly evaluation: EvaluationEvidence;
  /**
   * The retained observation-integrity capture. Optional so every existing caller and test
   * keeps working unchanged; absent means the row claims nothing rather than assuming.
   */
  readonly observation?: ObservationIntegrityEvidence;
  /** Defaults to `process.env`. Injectable so tests can assert both configured states. */
  readonly env?: Env;
}

export function deriveFidelityLedger({
  evidence,
  evaluation,
  observation,
  env = process.env,
}: LedgerInputs): FidelityLedger {
  const provider = resolveDecisionProviderSelection(env);
  const executor = resolveSideEffectExecutorSelection(env);
  const evalGate = resolveLiveEvalGate(env);
  /**
   * The generator is overridden because this module must never hold a signing key, not even a
   * throwaway one: only `mode` and `sessionIssuerEnabled` are read here, and the real key lives
   * in `lib/auth/lead-rescue-operator-runtime.ts` where exactly two functions can reach it.
   */
  const operatorAuth = resolveOperatorAuth(env, () => 'the fidelity ledger never reads a signing key');
  const orchestrationProven = evidenceProvesOrchestration(evidence);
  const floor = numberParam(KESTREL, 'confidenceFloor');
  const reviewWindow = numberParam(KESTREL, 'humanReviewTimeoutHours');

  const rows: FidelityRow[] = [
    {
      id: 'deterministic-engine',
      capability: 'Deterministic decision engine',
      status: 'REAL',
      whatIsTrue:
        'Validation, identity resolution, consent screening, the confidence-floor comparison, missing-field computation, and transition legality all execute on every run. The reducer reads no clock and no random source, so replaying a run reproduces it exactly.',
      basis: 'lib/engine/reducer.ts · tests/replay.test.ts · tests/engine.test.ts',
      limit:
        'Executes against events authored as fixtures on this route. It does not establish behaviour against real inbound traffic volume or malformed live payloads.',
    },
    {
      id: 'authority-gate',
      capability: 'Authority gate',
      status: 'REAL',
      whatIsTrue:
        'Authority is attached to each action and checked before it runs. A decision recorded by a role whose ceiling is below the required level is refused and the record is left untouched, and an offer despatch is gated on the same check before any claim is taken or any transport is called.',
      basis: 'lib/engine/reducer.ts · lib/engine/wait-resume.ts · tests/lead-rescue-review-dispatch.test.ts',
      limit:
        'The ceiling comparison is the engine\u2019s and runs everywhere. Where the acting role comes from is not: on the scenario runs it is authored into the event, and only on the operator routes is it bound to an authenticated credential. Neither establishes which human is behind that role.',
    },
    {
      id: 'idempotency',
      capability: 'Duplicate suppression and retry safety',
      status: 'REAL',
      whatIsTrue:
        'Every external action claims an idempotency key before it runs, so a replayed event produces no second action. An action whose outcome the provider never confirmed is refused a retry until an independent check proves it did not happen.',
      basis: 'lib/engine/ledger.ts · tests/lead-rescue.test.ts · tests/operation-claim-store.test.ts',
      limit:
        'The ledger is in-process for scenario runs and file-backed for operator runs. Neither is a distributed lock; concurrent replicas would need shared storage behind the same interface.',
    },
    {
      id: 'persistence',
      capability: 'Durable persistence',
      status: 'REAL',
      whatIsTrue:
        'A case held for review, ready to dispatch, or waiting on a deadline is written to a real file on disk with a temp-then-rename write, and is loaded back by a process that did not park it. Restarting the server loses nothing.',
      basis: 'lib/persistence/wait-incident-store.ts · tests/wait-incident-store.test.ts · tests/lead-rescue-wait-resume.test.ts',
      limit:
        'A single JSON file, appropriate for a prototype. A deployment on an ephemeral filesystem would need a persistent volume behind the same interface.',
    },
    {
      id: 'http-operator-path',
      capability: 'HTTP operator path',
      status: 'REAL',
      whatIsTrue:
        'The operator controls on this page call real route handlers over HTTP. Each one re-reads the persisted store, applies exactly one canonical event through the ordinary handler, and returns the engine\u2019s own result — including refusals.',
      basis: 'app/api/lead-rescue/wait-incidents/**/route.ts',
      limit:
        'The two consequential routes — recording a decision and despatching an offer — require a signed operator credential. Listing cases and checking deadlines do not. All of them are meant for demonstration on a local instance and are not a production operator interface.',
    },
    {
      id: 'operator-authentication',
      capability: 'Operator identity and authentication',
      ...operatorAuthenticationRow(operatorAuth),
      basis:
        'lib/auth/operator-identity.ts · lib/service/operator-decision.ts · tests/operator-authentication.test.ts',
      limit:
        'The principal selector is not a login. It asks for no password, verifies no human, and contacts no identity provider — so this establishes that authority is bound to a credential only this runtime could have minted, never that a particular person proved who they were.',
    },
    {
      id: 'clock-and-timeout',
      capability: 'Real-clock waits and attention timeouts',
      status: 'REAL',
      whatIsTrue: `Deadlines are compared against the real server clock. A check before the deadline is a genuine no-op; a check after it escalates through the ordinary authority and idempotency gates. The ${reviewWindow}-hour review timeout raises an attention condition without ever deciding the case itself.`,
      basis: 'lib/engine/wait-resume.ts · tests/lead-rescue-attention-timeout.test.ts',
      limit:
        'No scheduler runs in this build. An overdue case is only detected when a check is explicitly invoked — by a button here, or by an external caller hitting the same route.',
    },
    {
      id: 'n8n-orchestration',
      capability: 'n8n orchestration',
      status: orchestrationProven ? 'REAL' : 'UNVERIFIED',
      whatIsTrue: orchestrationProven
        ? 'A retained capture records an n8n instance running as a separate process driving the application over HTTP, with its own execution identifiers.'
        : 'Workflow definitions exist in the repository, but no retained execution capture is readable from this build, so orchestration is reported as unverified rather than assumed.',
      basis: orchestrationProven
        ? 'n8n/workflows/*.json · n8n/evidence/lead-rescue-runtime-execution.json'
        : 'n8n/workflows/*.json (definitions only)',
      limit:
        'Any capture came from a local n8n instance driving a local application. It does not establish a hosted deployment or a client-connected trigger.',
    },
    {
      id: 'ai-classification',
      capability: 'Free-text classification (bounded AI judgment)',
      ...classificationRow(provider, floor),
      basis: 'lib/config/decision-provider-config.ts · lib/ports/decision-provider.ts · tests/decision-provider.test.ts',
      limit:
        'Swapping the fixture for a live model changes one implementation behind the port. It does not change the engine, and it does not raise the authority of any action.',
    },
    {
      id: 'reply-interpretation',
      capability: 'Reply interpretation',
      status: 'FIXTURE_BACKED',
      whatIsTrue:
        'Replies are interpreted through the same bounded-judgment port, against authored fixture values. An off-script or low-confidence reply routes to a person rather than producing a templated answer.',
      basis: 'lib/engine/handlers/lead-rescue.ts · tests/lead-rescue.test.ts',
      limit:
        'No real conversation has been interpreted. Robustness against genuine free-text replies is untested.',
    },
    {
      id: 'outbound-execution',
      capability: 'Outbound execution',
      ...outboundRow(executor),
      basis: 'lib/config/side-effect-executor-config.ts · lib/ports/side-effect-executor.ts · lib/ports/smtp-side-effect-executor.ts',
      limit:
        'Even in SMTP mode the recipient is a synthetic address on a reserved, non-routable domain and the receiving server is a local sandbox. No real person is ever contacted from this build.',
    },
    {
      id: 'evaluation',
      capability: 'Judgment-quality evaluation',
      ...evaluationRow(evaluation, evalGate.kind === 'READY'),
    },
    {
      id: 'observation-integrity',
      capability: 'Operational observability and alerting',
      ...observabilityRow(observation),
    },
    {
      id: 'customer-deployment',
      capability: 'Customer deployment',
      status: 'UNVERIFIED',
      whatIsTrue:
        'Nothing here has run for a paying customer. There is no live trigger connected to a real channel, no production scheduler, and no client data of any kind in this build.',
      basis: 'docs/STATUS.md',
      limit:
        'This is the row that bounds every other row on this page. Read the rest against it.',
    },
  ];

  const counts = FIDELITY_STATUSES.reduce<Record<FidelityStatus, number>>(
    (acc, status) => ({ ...acc, [status]: rows.filter((row) => row.status === status).length }),
    { REAL: 0, FIXTURE_BACKED: 0, SIMULATED: 0, UNVERIFIED: 0 },
  );

  return {
    rows,
    declaredMaturity: LEAD_RESCUE.maturity,
    fidelityNote: LEAD_RESCUE.fidelityNote,
    counts,
  };
}

// ---------------------------------------------------------------------------
// Failure register
// ---------------------------------------------------------------------------

/**
 * The declared failure modes, split by whether a test actually exercises the handling.
 *
 * `verificationTest` is authored prose in `data/systems/lead-rescue.ts`, and two of the
 * fourteen entries begin with "Pending". Rendering all fourteen as a uniform list would let
 * an unexercised failure mode borrow the credibility of a proven one, so the split is
 * derived from that prefix rather than left to the reader to notice.
 */
export interface FailureRegisterEntry {
  readonly id: string;
  readonly failureClass: string;
  readonly failure: string;
  readonly businessImpact: string;
  readonly prevention: string;
  readonly recovery: string;
  readonly retryPolicy: string | null;
  readonly terminalState: string;
  readonly verificationTest: string;
  readonly exercised: boolean;
}

const PENDING_PREFIX = 'Pending';

export function deriveFailureRegister(): readonly FailureRegisterEntry[] {
  return LEAD_RESCUE.failureModes.map((mode) => ({
    id: mode.id,
    failureClass: mode.class,
    failure: mode.failure,
    businessImpact: mode.businessImpact,
    prevention: mode.prevention,
    recovery: mode.recovery,
    retryPolicy: mode.retryPolicy ?? null,
    // Rendered from the structured recovery rather than stored as prose, so this line cannot
    // describe a movement the transition graph does not have. See `validateLifecycle`.
    terminalState: describeRecovery(LEAD_RESCUE, mode.recoveryPath),
    verificationTest: mode.verificationTest,
    exercised: !mode.verificationTest.startsWith(PENDING_PREFIX),
  }));
}
