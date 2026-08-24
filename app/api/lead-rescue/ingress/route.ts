import { NextResponse } from 'next/server';
import { ingestExternalLead } from '@/lib/engine/lead-ingress';
import { LeadRescueIngressEnvelopeSchema } from '@/lib/ingress/lead-rescue-ingress-contract';
import { leadRescueWaitStore, leadRescueClaimStore, LEAD_RESCUE_WAIT_DEPS, LEAD_RESCUE_WAIT_RUNTIME_ID } from '@/lib/engine/lead-rescue-wait-runtime';
import { MalformedWaitRecordError } from '@/lib/persistence/wait-incident-store';
import { MalformedOperationClaimError } from '@/lib/persistence/operation-claim-store';
import { resolveIngressDecisionProvider } from '@/lib/config/decision-provider-config';

/**
 * THE CANONICAL LEAD RESCUE INGRESS ENDPOINT — the seam n8n's "Invoke Lead Rescue" node
 * calls. Everything downstream of this route is the SAME durable engine, store, and claim
 * primitives every other live Lead Rescue path in this codebase already uses; nothing here is
 * a parallel model or a second dedupe mechanism. See `lib/engine/lead-ingress.ts`'s own
 * module docstring for the full authority boundary this route is the thin HTTP face of.
 *
 * TRANSPORT failure vs BUSINESS outcome, made structural rather than narrated:
 *   400 — the envelope itself is malformed. n8n's own error-output branch, never the engine.
 *   409 — the durable claim is UNCERTAIN (a concurrent delivery is still mid-flight, or a
 *         process crashed between claiming and confirming). Genuinely ambiguous; n8n should
 *         not treat this as either success or a reason to retry blindly.
 *   200 — ANY valid business outcome, including ACCEPTED-into-NEEDS_HUMAN, ACCEPTED-into-
 *         BOOKING_READY, or DUPLICATE. A case parked for human review is not a failure; a
 *         recognised replay is not a failure. `body.outcome` and `body.duplicate` carry that
 *         distinction — n8n reads them, never infers policy from the HTTP status alone.
 */
export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<NextResponse> {
  const rawBody: unknown = await request.json().catch(() => null);
  if (rawBody === null) {
    return NextResponse.json({ error: 'request body is not valid JSON' }, { status: 400 });
  }

  const parsed = LeadRescueIngressEnvelopeSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'envelope failed schema validation', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const nowIso = new Date().toISOString();
  // See `lib/config/decision-provider-config.ts` — activation requires an explicit
  // `LEAD_RESCUE_DECISION_PROVIDER=claude` selection, never a credential alone.
  const { provider, classifierProvider } = resolveIngressDecisionProvider();

  try {
    const result = await ingestExternalLead(
      leadRescueWaitStore,
      leadRescueClaimStore,
      parsed.data,
      { ...LEAD_RESCUE_WAIT_DEPS, provider },
      nowIso,
      LEAD_RESCUE_WAIT_RUNTIME_ID,
    );

    if (result.outcome === 'UNCERTAIN') {
      return NextResponse.json(
        {
          now: nowIso,
          outcome: result.outcome,
          duplicate: false,
          entityId: result.entityId,
          correlationId: result.correlationId,
          source: result.source,
          sourceEventId: result.sourceEventId,
          ingestionPath: 'n8n',
          classifierProvider,
          detail: 'A prior delivery of this source event is claimed but not yet durably confirmed. Refusing to guess; retry later.',
        },
        { status: 409 },
      );
    }

    return NextResponse.json({
      now: nowIso,
      outcome: result.outcome,
      duplicate: result.outcome === 'DUPLICATE',
      entityId: result.entityId,
      correlationId: result.correlationId,
      source: result.source,
      sourceEventId: result.sourceEventId,
      classifierProvider,
      ingestionPath: 'n8n',
      lifecycleState: result.record?.engineState.lifecycleState ?? null,
      revision: result.record?.revision ?? null,
      decisionRuleId: result.decisionRuleId ?? null,
      executionMode: 'SIMULATED',
    });
  } catch (error) {
    if (error instanceof MalformedWaitRecordError || error instanceof MalformedOperationClaimError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    throw error;
  }
}
