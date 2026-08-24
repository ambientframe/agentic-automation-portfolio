import { NextResponse } from 'next/server';
import { z } from 'zod';
import { dispatchAuthorizedOffer } from '@/lib/engine/wait-resume';
import {
  leadRescueWaitStore,
  leadRescueClaimStore,
  LEAD_RESCUE_WAIT_DEPS,
  LEAD_RESCUE_WAIT_RUNTIME_ID,
} from '@/lib/engine/lead-rescue-wait-runtime';
import { MalformedWaitRecordError } from '@/lib/persistence/wait-incident-store';
import { MalformedOperationClaimError } from '@/lib/persistence/operation-claim-store';
import type { CanonicalEvent } from '@/lib/model/runtime';

/**
 * The offer-despatch step of the reviewed-offer operator journey
 * (`app/lead-rescue/wait/page.tsx`): applies exactly one `lead.offer.despatched` event
 * against a BOOKING_READY case with no offer sent yet, through `dispatchAuthorizedOffer`
 * (`lib/engine/wait-resume.ts`) — the SAME claim-then-invoke ordering (durable claim before
 * the executor is ever called, confirm only on genuine success) `checkWaitIncident` already
 * established for lr-t14/lr-t22's own notification. A CONFIRMED result is the only path that
 * durably records `offerSentAt` and starts the offer-wait clock; a REJECTED, NOT_READY,
 * ALREADY_DISPATCHED, or UNCERTAIN result leaves the incident exactly as it was, never a
 * falsely-confirmed offer.
 */
export const dynamic = 'force-dynamic';

const DispatchRequestSchema = z.object({
  incidentId: z.string().min(1),
  expectedRevision: z.number().int().positive(),
  decidedBy: z.string().min(1),
  target: z.string().min(1),
  offerSummary: z.string().min(1),
});

export async function POST(request: Request): Promise<NextResponse> {
  const rawBody: unknown = await request.json().catch(() => ({}));
  const parsedBody = DispatchRequestSchema.safeParse(rawBody);
  if (!parsedBody.success) {
    return NextResponse.json({ error: 'invalid request body', issues: parsedBody.error.issues }, { status: 400 });
  }
  const { incidentId, expectedRevision, decidedBy, target, offerSummary } = parsedBody.data;
  const nowIso = new Date().toISOString();

  const event: CanonicalEvent = {
    eventId: `${incidentId}:despatch:${nowIso}`,
    correlationId: `inc-${incidentId}`,
    entityId: incidentId,
    type: 'lead.offer.despatched',
    source: 'operator-console',
    sourceEventId: `despatch:${incidentId}:${nowIso}`,
    occurredAt: nowIso,
    receivedAt: nowIso,
    schemaVersion: 'wait-resume-1',
    actor: 'HUMAN',
    executionMode: 'SIMULATED',
    payload: { decidedBy, target, offerSummary },
  };

  try {
    const result = await dispatchAuthorizedOffer(
      leadRescueWaitStore,
      leadRescueClaimStore,
      incidentId,
      expectedRevision,
      event,
      LEAD_RESCUE_WAIT_DEPS,
      LEAD_RESCUE_WAIT_RUNTIME_ID,
    );
    return NextResponse.json({ now: nowIso, result });
  } catch (error) {
    if (error instanceof MalformedWaitRecordError || error instanceof MalformedOperationClaimError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    throw error;
  }
}
