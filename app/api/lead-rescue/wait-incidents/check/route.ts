import { NextResponse } from 'next/server';
import { z } from 'zod';
import { KESTREL } from '@/data/profiles/kestrel/profile';
import { numberParam } from '@/lib/model/profile';
import { checkAllWaitingIncidents, checkWaitIncident } from '@/lib/engine/wait-resume';
import {
  leadRescueWaitStore,
  leadRescueClaimStore,
  LEAD_RESCUE_WAIT_DEPS,
  LEAD_RESCUE_WAIT_RUNTIME_ID,
} from '@/lib/engine/lead-rescue-wait-runtime';
import { MalformedWaitRecordError } from '@/lib/persistence/wait-incident-store';
import { MalformedOperationClaimError } from '@/lib/persistence/operation-claim-store';

export const dynamic = 'force-dynamic';

const CheckRequestSchema = z.object({
  incidentId: z.string().min(1).optional(),
  /**
   * The one demo affordance in this route that does not use the real clock: instead of
   * `new Date()`, it supplies a timestamp just past the configured deadline, through the
   * IDENTICAL `checkWaitIncident` path a real, hours-later check would take. Labelled
   * clearly in the UI. Real invocations (and the default with this omitted) always use the
   * genuine server clock.
   */
  advancePastDeadline: z.boolean().optional(),
});

export async function POST(request: Request): Promise<NextResponse> {
  const rawBody: unknown = await request.json().catch(() => ({}));
  const parsedBody = CheckRequestSchema.safeParse(rawBody);
  if (!parsedBody.success) {
    return NextResponse.json({ error: 'invalid request body' }, { status: 400 });
  }
  const { incidentId, advancePastDeadline } = parsedBody.data;

  try {
    if (incidentId !== undefined) {
      const now = await resolveNow(incidentId, advancePastDeadline === true);
      const result = await checkWaitIncident(
        leadRescueWaitStore,
        leadRescueClaimStore,
        incidentId,
        now,
        LEAD_RESCUE_WAIT_DEPS,
        LEAD_RESCUE_WAIT_RUNTIME_ID,
      );
      return NextResponse.json({ now, result });
    }

    const now = new Date().toISOString();
    const results = await checkAllWaitingIncidents(
      leadRescueWaitStore,
      leadRescueClaimStore,
      now,
      LEAD_RESCUE_WAIT_DEPS,
      LEAD_RESCUE_WAIT_RUNTIME_ID,
    );
    return NextResponse.json({ now, results });
  } catch (error) {
    if (error instanceof MalformedWaitRecordError || error instanceof MalformedOperationClaimError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    throw error;
  }
}

/**
 * Which waiting category a persisted record belongs to is read off whichever start-of-wait
 * fact is actually present — the same authoritative discriminant
 * `handleWaitReevaluation` itself dispatches on, never a separately tracked label this route
 * could drift out of sync with. Two categories today (lr-t14's `waitStartedAt`, lr-t22's
 * `bookingReadyAt`); adding a third here would mean adding one more entry, not restructuring
 * this function.
 */
const WAIT_START_FACTS = [
  { fact: 'waitStartedAt', windowParam: 'replyWaitWindowHours' },
  { fact: 'bookingReadyAt', windowParam: 'bookingOfferWindowHours' },
] as const;

async function resolveNow(incidentId: string, advancePastDeadline: boolean): Promise<string> {
  if (!advancePastDeadline) return new Date().toISOString();

  const record = await leadRescueWaitStore.load(incidentId);
  if (record === undefined) return new Date().toISOString();

  for (const { fact, windowParam } of WAIT_START_FACTS) {
    const waitStartedAt = record.engineState.facts[fact];
    if (waitStartedAt === undefined) continue;
    const windowHours = numberParam(KESTREL, windowParam);
    return new Date(Date.parse(waitStartedAt) + (windowHours + 1) * 3_600_000).toISOString();
  }

  return new Date().toISOString();
}
