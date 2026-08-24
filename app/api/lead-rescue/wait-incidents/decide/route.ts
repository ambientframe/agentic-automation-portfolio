import { NextResponse } from 'next/server';
import { z } from 'zod';
import { applyHumanDecision } from '@/lib/engine/wait-resume';
import { leadRescueWaitStore, LEAD_RESCUE_WAIT_DEPS } from '@/lib/engine/lead-rescue-wait-runtime';
import { MalformedWaitRecordError } from '@/lib/persistence/wait-incident-store';
import type { CanonicalEvent } from '@/lib/model/runtime';

/**
 * The human-decision step of the reviewed-offer operator journey
 * (`app/lead-rescue/wait/page.tsx`): applies exactly one `human.decision.recorded` event
 * against a case currently parked under review (NEEDS_HUMAN / ESCALATED /
 * SUPPRESSION_REVIEW), through `applyHumanDecision` (`lib/engine/wait-resume.ts`) — the same
 * `handleHumanDecision` canonical handler every scenario and test already uses, with no
 * change to it. `expectedRevision` must match the incident's current revision or the request
 * is refused as stale — the same discipline `WaitIncidentStore.resolve()` already applies to
 * a duplicate or racing resume, extended here to a duplicate or out-of-order decision
 * resubmission.
 */
export const dynamic = 'force-dynamic';

const DecideRequestSchema = z.object({
  incidentId: z.string().min(1),
  expectedRevision: z.number().int().positive(),
  decidedBy: z.string().min(1),
  decision: z.enum(['CLEARED_TO_PROCEED', 'CLOSED_BAD_FIT', 'SUPPRESS', 'ESCALATE', 'BOOKED']),
  rationale: z.string().min(1),
});

export async function POST(request: Request): Promise<NextResponse> {
  const rawBody: unknown = await request.json().catch(() => ({}));
  const parsedBody = DecideRequestSchema.safeParse(rawBody);
  if (!parsedBody.success) {
    return NextResponse.json({ error: 'invalid request body', issues: parsedBody.error.issues }, { status: 400 });
  }
  const { incidentId, expectedRevision, decidedBy, decision, rationale } = parsedBody.data;
  const nowIso = new Date().toISOString();

  const event: CanonicalEvent = {
    eventId: `${incidentId}:decide:${nowIso}`,
    correlationId: `inc-${incidentId}`,
    entityId: incidentId,
    type: 'human.decision.recorded',
    source: 'operator-console',
    sourceEventId: `decide:${incidentId}:${nowIso}`,
    occurredAt: nowIso,
    receivedAt: nowIso,
    schemaVersion: 'wait-resume-1',
    actor: 'HUMAN',
    executionMode: 'SIMULATED',
    payload: { decidedBy, decision, rationale },
  };

  try {
    const result = await applyHumanDecision(leadRescueWaitStore, incidentId, expectedRevision, event, LEAD_RESCUE_WAIT_DEPS);
    return NextResponse.json({ now: nowIso, result });
  } catch (error) {
    if (error instanceof MalformedWaitRecordError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    throw error;
  }
}
