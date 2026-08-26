import type { BusinessProfile } from '@/lib/model/profile';
import type { SystemDefinition } from '@/lib/model/system';
import type { CanonicalEvent, ClassificationResult, TimelineEntry } from '@/lib/model/runtime';
import type { WaitIncidentRecord, WaitIncidentStore } from '@/lib/persistence/wait-incident-store';
import type { OperationClaimStore } from '@/lib/persistence/operation-claim-store';
import {
  EXECUTION_JOURNAL_SCHEMA_VERSION,
  recordSafely,
  type ExecutionJournalRecorder,
  type ObservableOutcome,
} from '@/lib/persistence/execution-journal-store';
import { FixtureDecisionProvider, resolveJudgment, type DecisionProvider, type ResolvedJudgment } from '@/lib/ports/decision-provider';
import { extractJudgmentRequest } from './run';
import { applyEvent } from './reducer';
import { EventLedger, ExecutionLedger, SideEffectLedger } from './ledger';
import { initialState, type SystemHandlers } from './types';
import { ENQUIRY_CLASSES } from './handlers/lead-rescue';
import {
  LEAD_RESCUE_INGRESS_SCHEMA_VERSION,
  type LeadRescueIngressEnvelope,
} from '@/lib/ingress/lead-rescue-ingress-contract';

/**
 * THE N8N INTEGRATION SEAM.
 *
 * `n8n` (orchestration/runtime) may accept a trigger, map an external payload into
 * `LeadRescueIngressEnvelope`, and call this. It owns none of what happens once this function
 * is called: this file is the sole authority on lifecycle transitions, policy, classification
 * routing, and idempotency. Reuses the exact durable-claim-before-trust ordering
 * `lib/engine/wait-resume.ts` already established for wait/resume and offer despatch — the
 * SAME `OperationClaimStore` primitive, asked a new question: not "has this side effect
 * already executed" but "has a case already been durably created for this external event."
 *
 * **The identity.** `sourceEventId` (`CanonicalEvent`'s own documented "natural idempotency
 * anchor") combined with `source` is the ONLY input to both the claim identity and the case's
 * own `entityId` — deterministic, not random, so a genuine redelivery always resolves to the
 * SAME case rather than a fresh one. `EventLedger` (`lib/engine/ledger.ts`) is explicitly NOT
 * reused here: it is a per-call, in-memory ledger with zero memory across HTTP requests,
 * exactly the property `checkWaitIncident`'s own module docstring already identified as
 * insufficient for cross-process exclusivity. `OperationClaimStore` is durable and
 * cross-process-exclusive by construction (`fs.open(path, 'wx')`) — the same reason it was
 * built for wait/resume applies unchanged here.
 *
 * **The bounded judgment.** `deps.provider`, when supplied, is asked to classify whatever the
 * request's own `judgment` payload names — see `lib/ports/claude-decision-provider.ts` for the
 * live implementation `app/api/lead-rescue/ingress/route.ts` wires in when a model credential is
 * configured. Absent (every caller before this pass, and every scenario/demo path), this
 * function falls back to the ONE realistic, fully-authored lead shape it has always
 * demonstrated: `FixtureDecisionProvider`, constructed fresh per call with exactly one
 * pre-authored judgment keyed to this ingress contract's own fixture — the SAME SIMULATED
 * provider every scenario in this portfolio already uses. A message that does not match the
 * authored fixture's judgmentId resolves `UNAVAILABLE` and the handler's own existing "no
 * judgment resolved" rule correctly routes it to `NEEDS_HUMAN` — fails safe, never coerced,
 * true of the fixture path and the live path alike.
 */

const INGRESS_REQUIRED_FIELDS = ['framework', 'target_audit_window', 'headcount'] as const;

/** Deterministic, never random — a genuine redelivery must resolve to the SAME identity. */
function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

/**
 * A cheap, stable (never `Math.random`, never a clock) string hash — djb2 — used ONLY to
 * derive a judgment identity from message CONTENT, so the one authored fixture judgment below
 * applies exactly when its own authored message is genuinely resubmitted, and never leaks onto
 * content it was never authored for. Not a security or collision-resistance primitive; a
 * content-addressed lookup key, the same role every scenario's own hand-typed `judgmentId`
 * already plays, just computed instead of typed by hand.
 */
function contentHash(input: string): string {
  let hash = 5381;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 33) ^ input.charCodeAt(index);
  }
  return (hash >>> 0).toString(36);
}

function judgmentIdFor(message: string): string {
  return `lead-rescue-ingress-v1:${contentHash(message.trim().toLowerCase())}`;
}

/**
 * The ONE authored external lead shape this ingress path demonstrates — a genuinely realistic,
 * qualified, complete SOC 2 readiness enquiry. Exported so tests reuse this verbatim rather
 * than risking a hand-typed duplicate drifting out of sync with the fixture judgment below,
 * which is keyed to this EXACT string's content hash. Any other message content resolves to a
 * genuinely different `judgmentId`, which `FixtureDecisionProvider` correctly reports as
 * `UNAVAILABLE` — the existing "bounded judgment was unavailable" rule in
 * `handleEnquiry` then routes it to `NEEDS_HUMAN`, never a guess. Fails safe by construction,
 * not by a special case this file adds.
 */
export const INGRESS_FIXTURE_LEAD_MESSAGE =
  'We need SOC 2 Type II support. Targeting our audit window for Q2 2027 and we have about 45 employees in scope.';

const INGRESS_FIXTURE_JUDGMENT_ID = judgmentIdFor(INGRESS_FIXTURE_LEAD_MESSAGE);

const INGRESS_FIXTURE_JUDGMENT: ClassificationResult = {
  judgmentId: INGRESS_FIXTURE_JUDGMENT_ID,
  classification: 'QUALIFIED_ENQUIRY',
  confidence: 0.93,
  missingInformation: [],
  evidenceRefs: [
    'lead.message: framework, target audit window, and headcount are each stated explicitly',
  ],
  declinedToInfer: ['Whether the target audit window is externally committed or internally aspirational'],
  rationaleSummary:
    'The enquiry names a specific compliance framework, a target audit window, and a headcount — the three fields this engagement type requires to route without further questions.',
};

export function ingressEntityId(source: string, sourceEventId: string): string {
  return `lead-${slug(source)}-${slug(sourceEventId)}`;
}

/**
 * Deliberately a DIFFERENT string than `ingressEntityId`, in a namespace
 * (`OperationClaimStore`) entirely separate from `WaitIncidentStore` — no collision is
 * possible, but the prefix keeps a claims-directory listing self-explanatory for an operator.
 */
export function ingressClaimId(source: string, sourceEventId: string): string {
  return `ingress:${ingressEntityId(source, sourceEventId)}`;
}

export type IngressOutcome = 'ACCEPTED' | 'DUPLICATE' | 'UNCERTAIN';

export interface IngressResult {
  readonly outcome: IngressOutcome;
  readonly entityId: string;
  readonly correlationId: string;
  readonly source: string;
  readonly sourceEventId: string;
  /** Present for ACCEPTED (freshly created) and DUPLICATE (the pre-existing case, if still parked). */
  readonly record?: WaitIncidentRecord;
  /** Present only for ACCEPTED — the full timeline of the genuine, one-time engine run. */
  readonly entries?: readonly TimelineEntry[];
  /** The last accepted lifecycle transition's declared rule id, if any (e.g. "lr-t10"). */
  readonly decisionRuleId?: string | null;
}

export interface LeadIngressDeps {
  readonly system: SystemDefinition;
  readonly profile: BusinessProfile;
  readonly handlers: SystemHandlers;
  /**
   * Optional. Absent (every caller before this pass, and every existing test) falls back to
   * the single-fixture `FixtureDecisionProvider` this file has always constructed inline — zero
   * behavior change for any caller that doesn't pass one. A caller that DOES supply a provider
   * (e.g. a live `ClaudeDecisionProvider`, wired in `app/api/lead-rescue/ingress/route.ts` when
   * a model credential is configured) genuinely classifies whatever the request's own `judgment`
   * payload names — this is the existing orchestration seam, not a parallel code path.
   */
  readonly provider?: DecisionProvider;
  /**
   * Optional, write-only observability. Absent (every caller before this pass, and every
   * existing test) records nothing and changes nothing — the same optional-dependency shape
   * `provider` above already uses. Present, every ingress outcome becomes an operator-visible
   * observation. This is deliberately the RECORDER type and never the reader: nothing in this
   * file can read history back, so history can never become an input to a routing decision.
   */
  readonly journal?: ExecutionJournalRecorder;
}

function buildIngressEvent(
  envelope: LeadRescueIngressEnvelope,
  entityId: string,
  correlationId: string,
  nowIso: string,
): CanonicalEvent {
  const occurredAt = envelope.receivedAt ?? nowIso;
  return {
    eventId: `${entityId}:ingress:${envelope.sourceEventId}`,
    correlationId,
    entityId,
    type: 'inbound.enquiry.received',
    source: envelope.source,
    sourceEventId: envelope.sourceEventId,
    occurredAt,
    receivedAt: nowIso,
    schemaVersion: LEAD_RESCUE_INGRESS_SCHEMA_VERSION,
    actor: 'EXTERNAL_PARTY',
    executionMode: 'SIMULATED',
    payload: {
      contactName: envelope.lead.contactName,
      contactEmail: envelope.lead.contactEmail,
      company: envelope.lead.company,
      message: envelope.lead.message,
      channel: envelope.lead.channel,
      // Normalization the canonical application performs, never the transport layer — see
      // the module docstring. A fresh external enquiry carries no known suppression
      // relationship; a real identity-resolution service is out of scope for this pass (see
      // `docs/STATUS.md`), the same simulated boundary every existing scenario already
      // accepts by authoring `consentState` directly rather than resolving it live.
      consentState: 'PERMITTED',
      // Kestrel's own standard SOC 2 qualification field set — the identical constant every
      // scenario in `data/profiles/kestrel/scenarios/lead-rescue.ts` already authors, not an
      // invented default.
      requiredFields: [...INGRESS_REQUIRED_FIELDS],
      judgment: {
        judgmentId: judgmentIdFor(envelope.lead.message),
        objective: 'Classify an inbound external lead enquiry into the permitted enquiry-class set.',
        input: envelope.lead.message,
        permittedClassifications: ENQUIRY_CLASSES,
        requiredFields: [...INGRESS_REQUIRED_FIELDS],
      },
    },
  };
}

/**
 * The n8n integration seam's sole entry point. Durably, exclusively idempotent on
 * `(source, sourceEventId)`: the first genuine delivery runs the real engine and persists the
 * result; every redelivery — sequential, concurrent, or after a full process restart — is
 * recognised without a second engine execution or a second case.
 */
export async function ingestExternalLead(
  store: WaitIncidentStore,
  claimStore: OperationClaimStore,
  envelope: LeadRescueIngressEnvelope,
  deps: LeadIngressDeps,
  nowIso: string,
  runtimeId: string,
): Promise<IngressResult> {
  const entityId = ingressEntityId(envelope.source, envelope.sourceEventId);
  const claimId = ingressClaimId(envelope.source, envelope.sourceEventId);
  const correlationId = `inc-${entityId}`;
  const base = { entityId, correlationId, source: envelope.source, sourceEventId: envelope.sourceEventId };

  const provenance = { source: envelope.source, sourceEventId: envelope.sourceEventId, ingestionPath: 'n8n' };

  /**
   * One observation per ingress outcome. `journalEventId` is derived from identities that
   * already exist rather than from a clock alone, so the single genuine ACCEPTANCE is
   * recorded exactly once no matter how many times the same event is redelivered, while each
   * redelivery is still visible as its own distinct SUPPRESSED_DUPLICATE observation — an
   * operator asking "did this lead arrive twice?" needs both facts.
   *
   * Awaited, but its result is deliberately discarded: a dropped observation must never
   * change what this function returns. See `recordSafely`.
   */
  async function observe(outcome: ObservableOutcome, idSuffix: string, detail: string, ruleId?: string): Promise<void> {
    await recordSafely(deps.journal, {
      journalEventId: `${entityId}:INGRESS_RECEIVED:${idSuffix}`,
      schemaVersion: EXECUTION_JOURNAL_SCHEMA_VERSION,
      recordedAt: nowIso,
      systemId: deps.system.id,
      incidentId: entityId,
      correlationId,
      type: 'INGRESS_RECEIVED',
      mechanism: 'DETERMINISTIC_RULE',
      outcome,
      operationClaimId: claimId,
      provenance,
      detail,
      ...(ruleId === null || ruleId === undefined ? {} : { ruleId }),
    });
  }

  const attempt = await claimStore.claim(claimId, runtimeId, nowIso);

  if (attempt.decision === 'ALREADY_CONFIRMED') {
    // A genuinely new case is never created twice for the same identity. The durable case
    // MAY have since moved on (e.g. a later lr-t14 elapse resolves and removes a
    // WAITING_FOR_REPLY record) — that is an existing, unrelated property of the wait/resume
    // machinery, not something this path re-derives; `record` is simply absent then.
    const existing = await store.load(entityId);
    await observe(
      'SUPPRESSED_DUPLICATE',
      `duplicate:${nowIso}`,
      'Redelivery of an already-confirmed external event. No second case and no second engine run.',
    );
    return { ...base, outcome: 'DUPLICATE', record: existing };
  }

  if (attempt.decision === 'UNCERTAIN') {
    // A concurrent delivery is still mid-flight, or a process crashed between claiming and
    // confirming. Either way: never guess, never execute, never report success.
    await observe(
      'OUTCOME_UNKNOWN',
      `uncertain:${nowIso}`,
      'A prior claim on this external event exists but was never confirmed. Whether a case was created is genuinely unknown from here.',
    );
    return { ...base, outcome: 'UNCERTAIN' };
  }

  // CLAIMED — the one genuine delivery. Run the real engine, exactly once.
  const event = buildIngressEvent(envelope, entityId, correlationId, nowIso);
  const request = extractJudgmentRequest(event);
  const judgments = new Map<string, ResolvedJudgment>();
  if (request !== null) {
    const provider =
      deps.provider ?? new FixtureDecisionProvider({ [INGRESS_FIXTURE_JUDGMENT_ID]: INGRESS_FIXTURE_JUDGMENT });
    judgments.set(request.judgmentId, await resolveJudgment(provider, request));
  }

  const internals = { effects: new SideEffectLedger(), events: new EventLedger(), executions: new ExecutionLedger() };
  const result = applyEvent(initialState(deps.handlers.initialState), event, {
    system: deps.system,
    profile: deps.profile,
    handlers: deps.handlers,
    judgments,
    internals,
  });

  const parked = await store.park({
    incidentId: entityId,
    systemId: deps.system.id,
    correlationId,
    engineState: {
      lifecycleState: result.state.lifecycleState,
      facts: { ...result.state.facts },
      suppressed: result.state.suppressed,
      awaitingHuman: result.state.awaitingHuman,
      missingInformation: [...result.state.missingInformation],
    },
    provenance: { source: envelope.source, sourceEventId: envelope.sourceEventId, ingestionPath: 'n8n' },
  });

  await claimStore.confirm(claimId, nowIso);

  const decisionRuleId =
    result.entries
      .flatMap((e) => e.transitions)
      .filter((t) => t.accepted)
      .at(-1)?.ruleId ?? null;

  await observe(
    'ACCEPTED',
    'accepted',
    `Case created and parked in ${result.state.lifecycleState}.`,
    decisionRuleId ?? undefined,
  );

  return { ...base, outcome: 'ACCEPTED', record: parked, entries: result.entries, decisionRuleId };
}
