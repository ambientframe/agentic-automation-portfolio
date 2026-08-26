import { NextResponse } from 'next/server';
import { decideAsOperator, DecideRequestSchema } from '@/lib/service/operator-decision';
import { leadRescueWaitStore, leadRescueClaimStore, LEAD_RESCUE_WAIT_DEPS, LEAD_RESCUE_WAIT_RUNTIME_ID } from '@/lib/engine/lead-rescue-wait-runtime';
import { LEAD_RESCUE_OPERATOR_AUTH } from '@/lib/auth/lead-rescue-operator-runtime';
import { MalformedWaitRecordError } from '@/lib/persistence/wait-incident-store';

/**
 * The human-decision step of the reviewed-offer operator journey
 * (`app/lead-rescue/wait/page.tsx`), now IDENTITY-BOUND.
 *
 * What changed and why it matters: this route used to accept `decidedBy` in the request body.
 * The engine then enforced that role's authority ceiling faithfully — against an identity
 * nobody had verified, which meant anyone who could reach the endpoint could grant themselves
 * founder authority by typing it. `decidedBy` is no longer part of the wire contract at all
 * (`DecideRequestSchema` is a `strictObject`), and the role is resolved from the signed
 * operator credential instead. See `lib/service/operator-decision.ts` for the ordering
 * guarantee and `lib/auth/operator-identity.ts` for what the credential actually proves.
 *
 * FOUR DISTINCT STATUSES, because they are four genuinely different problems:
 *   400 — the body is malformed, or tried to name its own identity.
 *   401 — no usable credential. We do not know who is asking.
 *   403 — we know exactly who is asking, and they may not do this.
 *   200 — a real business outcome, including a refusal the ENGINE made (STALE_REVISION,
 *         NOT_UNDER_REVIEW, REJECTED). Those are not authentication problems and must not be
 *         reported as though they were.
 *   503 — the runtime's signing key is misconfigured, so nobody can be authenticated at all.
 *         Fails closed rather than quietly authenticating with a weak or absent key.
 */
export const dynamic = 'force-dynamic';

export { DecideRequestSchema };

export async function POST(request: Request): Promise<NextResponse> {
  if (LEAD_RESCUE_OPERATOR_AUTH.mode === 'MISCONFIGURED') {
    return NextResponse.json({ error: LEAD_RESCUE_OPERATOR_AUTH.reason }, { status: 503 });
  }

  const rawBody: unknown = await request.json().catch(() => ({}));
  const parsedBody = DecideRequestSchema.safeParse(rawBody);
  if (!parsedBody.success) {
    return NextResponse.json(
      {
        error: 'invalid request body',
        detail: 'Operator identity is never caller-supplied; it is read from the signed operator credential.',
        issues: parsedBody.error.issues,
      },
      { status: 400 },
    );
  }

  const nowIso = new Date().toISOString();

  try {
    const outcome = await decideAsOperator(
      { ...parsedBody.data, authorizationHeader: request.headers.get('authorization'), nowIso },
      {
        store: leadRescueWaitStore,
        claimStore: leadRescueClaimStore,
        wait: LEAD_RESCUE_WAIT_DEPS,
        signingKey: LEAD_RESCUE_OPERATOR_AUTH.signingKey,
        runtimeId: LEAD_RESCUE_WAIT_RUNTIME_ID,
      },
    );

    if (outcome.kind === 'AUTHENTICATION_REFUSED') {
      return NextResponse.json({ now: nowIso, error: 'operator not authenticated', reason: outcome.reason, detail: outcome.detail }, { status: 401 });
    }
    if (outcome.kind === 'AUTHORIZATION_REFUSED') {
      return NextResponse.json(
        {
          now: nowIso,
          error: 'insufficient authority',
          detail: outcome.detail,
          // Non-secret identity only. Never the credential.
          principal: { principalId: outcome.principal.principalId, roleId: outcome.principal.roleId },
        },
        { status: 403 },
      );
    }
    if (outcome.kind !== 'DECIDED') {
      return NextResponse.json({ now: nowIso, error: 'unexpected outcome for a decision' }, { status: 500 });
    }

    return NextResponse.json({
      now: nowIso,
      principal: {
        principalId: outcome.principal.principalId,
        displayName: outcome.principal.displayName,
        roleId: outcome.principal.roleId,
        authorityCeiling: outcome.principal.authorityCeiling,
      },
      result: outcome.result,
    });
  } catch (error) {
    if (error instanceof MalformedWaitRecordError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    throw error;
  }
}
