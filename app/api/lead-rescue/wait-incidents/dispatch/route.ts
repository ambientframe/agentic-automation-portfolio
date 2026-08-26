import { NextResponse } from 'next/server';
import { dispatchAsOperator, DispatchRequestSchema } from '@/lib/service/operator-decision';
import {
  leadRescueWaitStore,
  leadRescueClaimStore,
  LEAD_RESCUE_WAIT_DEPS,
  LEAD_RESCUE_WAIT_RUNTIME_ID,
} from '@/lib/engine/lead-rescue-wait-runtime';
import { LEAD_RESCUE_OPERATOR_AUTH } from '@/lib/auth/lead-rescue-operator-runtime';
import { MalformedWaitRecordError } from '@/lib/persistence/wait-incident-store';
import { MalformedOperationClaimError } from '@/lib/persistence/operation-claim-store';

/**
 * The offer-despatch step of the reviewed-offer operator journey, now IDENTITY-BOUND on the
 * same terms as `../decide`.
 *
 * WHY THIS ROUTE AND NOT ONLY THE DECISION. Despatch is the step that actually reaches a
 * prospect. Authenticating the decision while leaving despatch caller-asserted would have left
 * the entire authority chain skippable — a caller would simply not bother deciding and go
 * straight to the send. The claim this package earns depends on both being closed.
 *
 * Everything downstream is unchanged: `dispatchAuthorizedOffer` still claims durably before it
 * ever calls an executor, still confirms only on genuine success, and still leaves the case
 * untouched on anything short of CONFIRMED. What is new is that it now also enforces the
 * authority verification its own handler has always computed and this layer never read.
 */
export const dynamic = 'force-dynamic';

export { DispatchRequestSchema };

export async function POST(request: Request): Promise<NextResponse> {
  if (LEAD_RESCUE_OPERATOR_AUTH.mode === 'MISCONFIGURED') {
    return NextResponse.json({ error: LEAD_RESCUE_OPERATOR_AUTH.reason }, { status: 503 });
  }

  const rawBody: unknown = await request.json().catch(() => ({}));
  const parsedBody = DispatchRequestSchema.safeParse(rawBody);
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
    const outcome = await dispatchAsOperator(
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
          principal: { principalId: outcome.principal.principalId, roleId: outcome.principal.roleId },
        },
        { status: 403 },
      );
    }
    if (outcome.kind !== 'DISPATCHED') {
      return NextResponse.json({ now: nowIso, error: 'unexpected outcome for a despatch' }, { status: 500 });
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
    if (error instanceof MalformedWaitRecordError || error instanceof MalformedOperationClaimError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    throw error;
  }
}
