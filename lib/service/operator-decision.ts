import { z } from 'zod';
import type { CanonicalEvent } from '@/lib/model/runtime';
import type { WaitIncidentStore } from '@/lib/persistence/wait-incident-store';
import type { OperationClaimStore } from '@/lib/persistence/operation-claim-store';
import {
  EXECUTION_JOURNAL_SCHEMA_VERSION,
  recordSafely,
  type JournalEvent,
} from '@/lib/persistence/execution-journal-store';
import {
  applyHumanDecision,
  dispatchAuthorizedOffer,
  type DecisionResult,
  type DispatchResult,
  type WaitResumeDeps,
} from '@/lib/engine/wait-resume';
import {
  authenticateOperator,
  requireAuthenticatedPrincipal,
  type AuthenticatedPrincipal,
  type AuthenticationFailureReason,
  type OperatorPrincipalRecord,
} from '@/lib/auth/operator-identity';

/**
 * THE OPERATOR ACTION BOUNDARY — where a proven identity becomes an authorized action.
 *
 * The ORDER in this file is the whole guarantee, and it is the same in both functions:
 *
 *   1. authenticate      — who is this? A refusal ends the call here.
 *   2. bind              — the engine event's `decidedBy` is set from the authenticated
 *                          principal's canonical role id. There is no other source for it.
 *   3. delegate          — the engine decides. Review state, revision binding, role ceilings,
 *                          claim-before-execute: all unchanged, all still the engine's job.
 *
 * Step 1 completing before step 3 is what makes "authentication failure produces zero
 * execution attempts" a structural fact rather than a hope: the executor lives behind
 * `dispatchAuthorizedOffer`, which is only reachable from step 3.
 *
 * THE WIRE CONTRACT HAS NO IDENTITY FIELD. `DecideRequestSchema` and `DispatchRequestSchema`
 * are `strictObject`s without `decidedBy`, so a body that tries to name its own role is
 * rejected before a handler ever runs — not silently ignored, which would leave a reader
 * unable to tell whether the field still mattered. Identity is a function of the token alone.
 *
 * THIS MODULE MAKES NO POLICY. It never compares an authority ceiling to a requirement, and it
 * contains no threshold. It maps the engine's own `UNAUTHORIZED` outcome onto a distinct
 * result kind so a caller can tell "we do not know who you are" from "we know exactly who you
 * are, and you may not do this" — which are different problems for an operator, and different
 * HTTP statuses. The judgment behind both remains the engine's.
 */

// ---------------------------------------------------------------------------
// Wire contracts — identity is deliberately absent from both.
// ---------------------------------------------------------------------------

export const DECISION_KINDS = ['CLEARED_TO_PROCEED', 'CLOSED_BAD_FIT', 'SUPPRESS', 'ESCALATE', 'BOOKED'] as const;

/** `strictObject`: an unknown key — `decidedBy` above all — is a hard rejection, never ignored. */
export const DecideRequestSchema = z.strictObject({
  incidentId: z.string().min(1),
  expectedRevision: z.number().int().positive(),
  decision: z.enum(DECISION_KINDS),
  rationale: z.string().min(1),
});

export const DispatchRequestSchema = z.strictObject({
  incidentId: z.string().min(1),
  expectedRevision: z.number().int().positive(),
  target: z.string().min(1),
  offerSummary: z.string().min(1),
});

// ---------------------------------------------------------------------------

export interface OperatorActionDeps {
  readonly store: WaitIncidentStore;
  readonly claimStore: OperationClaimStore;
  readonly wait: WaitResumeDeps;
  readonly signingKey: string;
  readonly registry?: readonly OperatorPrincipalRecord[];
  readonly runtimeId: string;
}

export type OperatorActionResult =
  /** Nobody could be identified. Nothing downstream ran. */
  | { readonly kind: 'AUTHENTICATION_REFUSED'; readonly reason: AuthenticationFailureReason; readonly detail: string }
  /** Identified, and not permitted. Nothing downstream ran. */
  | { readonly kind: 'AUTHORIZATION_REFUSED'; readonly principal: AuthenticatedPrincipal; readonly detail: string }
  | { readonly kind: 'DECIDED'; readonly principal: AuthenticatedPrincipal; readonly result: DecisionResult }
  | { readonly kind: 'DISPATCHED'; readonly principal: AuthenticatedPrincipal; readonly result: DispatchResult };

export interface DecideAsOperatorInput {
  readonly authorizationHeader: string | null | undefined;
  readonly incidentId: string;
  readonly expectedRevision: number;
  readonly decision: (typeof DECISION_KINDS)[number];
  readonly rationale: string;
  readonly nowIso: string;
}

export interface DispatchAsOperatorInput {
  readonly authorizationHeader: string | null | undefined;
  readonly incidentId: string;
  readonly expectedRevision: number;
  readonly target: string;
  readonly offerSummary: string;
  readonly nowIso: string;
}

/**
 * Records an authentication refusal against the case it was aimed at.
 *
 * NEVER records the presented credential, the claimed principal, or any part of the
 * `Authorization` header — only the typed reason. Everything a failed authentication carries
 * is attacker-controlled by definition, and the reason class is the only part of it this
 * application actually established for itself. `actorId` is deliberately absent: at this point
 * nobody has been identified, and naming an unverified claimant would be the same mistake the
 * whole package exists to fix, moved into the journal.
 *
 * Skipped entirely when the case does not exist — there is then no `correlationId` or
 * `systemId` that could be read rather than invented.
 */
async function observeAuthenticationRefusal(
  deps: OperatorActionDeps,
  incidentId: string,
  nowIso: string,
  reason: AuthenticationFailureReason,
): Promise<void> {
  const record = await deps.store.load(incidentId);
  if (record === undefined) return;
  const event: Omit<JournalEvent, 'schemaVersion'> = {
    journalEventId: `${incidentId}:OPERATOR_AUTHENTICATION:REFUSED:${reason}:${nowIso}`,
    recordedAt: nowIso,
    systemId: record.systemId,
    incidentId,
    correlationId: record.correlationId,
    revision: record.revision,
    type: 'OPERATOR_AUTHENTICATION',
    mechanism: 'AUTHENTICATION',
    outcome: 'REFUSED',
    failureClass: 'POLICY_VIOLATION',
    detail: `Operator credential refused (${reason}). No identity was established, so nothing was decided or executed.`,
  };
  await recordSafely(deps.wait.journal, { ...event, schemaVersion: EXECUTION_JOURNAL_SCHEMA_VERSION });
}

/**
 * Authenticate, or end the call. Shared by both actions so the ordering guarantee cannot drift
 * apart between them.
 */
async function identify(
  deps: OperatorActionDeps,
  authorizationHeader: string | null | undefined,
  incidentId: string,
  nowIso: string,
): Promise<{ ok: true; principal: AuthenticatedPrincipal } | { ok: false; refusal: OperatorActionResult }> {
  const authentication = await authenticateOperator(
    authorizationHeader,
    deps.signingKey,
    nowIso,
    deps.wait.profile,
    deps.registry,
  );

  if (authentication.kind === 'REFUSED') {
    await observeAuthenticationRefusal(deps, incidentId, nowIso, authentication.reason);
    return {
      ok: false,
      refusal: { kind: 'AUTHENTICATION_REFUSED', reason: authentication.reason, detail: authentication.detail },
    };
  }

  // Belt and braces: prove at runtime that what we are about to bind authority to was minted
  // by the authentication boundary, not assembled by some later refactor.
  return { ok: true, principal: requireAuthenticatedPrincipal(authentication.principal) };
}

/**
 * One `human.decision.recorded` event, whose `decidedBy` comes from the authenticated
 * principal's canonical role id and from nowhere else.
 */
export async function decideAsOperator(input: DecideAsOperatorInput, deps: OperatorActionDeps): Promise<OperatorActionResult> {
  const identified = await identify(deps, input.authorizationHeader, input.incidentId, input.nowIso);
  if (!identified.ok) return identified.refusal;
  const { principal } = identified;

  const event: CanonicalEvent = {
    eventId: `${input.incidentId}:decide:${input.nowIso}`,
    correlationId: `inc-${input.incidentId}`,
    entityId: input.incidentId,
    type: 'human.decision.recorded',
    source: 'operator-console',
    sourceEventId: `decide:${input.incidentId}:${principal.principalId}:${input.nowIso}`,
    occurredAt: input.nowIso,
    receivedAt: input.nowIso,
    schemaVersion: 'wait-resume-1',
    actor: 'HUMAN',
    executionMode: 'SIMULATED',
    payload: {
      // THE BINDING. Canonical role id, resolved from the registry at authentication time.
      decidedBy: principal.roleId,
      // Who the role was exercised BY — recorded for attribution, never read for authority.
      decidedByPrincipalId: principal.principalId,
      decision: input.decision,
      rationale: input.rationale,
    },
  };

  const result = await applyHumanDecision(deps.store, input.incidentId, input.expectedRevision, event, deps.wait);

  if (result.outcome === 'UNAUTHORIZED') {
    return {
      kind: 'AUTHORIZATION_REFUSED',
      principal,
      detail: `${principal.displayName} is authenticated, but the role "${principal.roleId}" does not hold sufficient authority for this decision.`,
    };
  }

  return { kind: 'DECIDED', principal, result };
}

/**
 * One `lead.offer.despatched` event, bound the same way. Authenticated for the same reason the
 * decision is: an unauthenticated despatch would let a caller skip the decision entirely and go
 * straight to the only step that actually reaches a prospect, which would make the whole
 * authority chain decorative.
 */
export async function dispatchAsOperator(input: DispatchAsOperatorInput, deps: OperatorActionDeps): Promise<OperatorActionResult> {
  const identified = await identify(deps, input.authorizationHeader, input.incidentId, input.nowIso);
  if (!identified.ok) return identified.refusal;
  const { principal } = identified;

  const event: CanonicalEvent = {
    eventId: `${input.incidentId}:despatch:${input.nowIso}`,
    correlationId: `inc-${input.incidentId}`,
    entityId: input.incidentId,
    type: 'lead.offer.despatched',
    source: 'operator-console',
    sourceEventId: `despatch:${input.incidentId}:${principal.principalId}:${input.nowIso}`,
    occurredAt: input.nowIso,
    receivedAt: input.nowIso,
    schemaVersion: 'wait-resume-1',
    actor: 'HUMAN',
    executionMode: 'SIMULATED',
    payload: {
      decidedBy: principal.roleId,
      decidedByPrincipalId: principal.principalId,
      target: input.target,
      offerSummary: input.offerSummary,
    },
  };

  const result = await dispatchAuthorizedOffer(
    deps.store,
    deps.claimStore,
    input.incidentId,
    input.expectedRevision,
    event,
    deps.wait,
    deps.runtimeId,
  );

  if (result.outcome === 'UNAUTHORIZED') {
    return {
      kind: 'AUTHORIZATION_REFUSED',
      principal,
      detail: `${principal.displayName} is authenticated, but the role "${principal.roleId}" does not hold sufficient authority to despatch an offer.`,
    };
  }

  return { kind: 'DISPATCHED', principal, result };
}
