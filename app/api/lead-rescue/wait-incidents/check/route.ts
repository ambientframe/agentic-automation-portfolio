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
 * Which of the (now four) waiting/attention categories a persisted record belongs to is read
 * off `lifecycleState` FIRST, never off "whichever fact happens to be present" — a record can
 * legitimately carry more than one start-of-wait fact at once (e.g. a case that lr-t14-elapsed
 * into NEEDS_HUMAN still carries its now-stale `waitStartedAt` alongside a fresh
 * `reviewStartedAt`), so checking facts in isolation would risk reading the wrong one. This is
 * the SAME authoritative discriminant `handleWaitReevaluation`
 * (`lib/engine/handlers/lead-rescue.ts`) itself dispatches on — never a separately tracked
 * label this route could drift out of sync with.
 */
const REVIEW_STATES = ['NEEDS_HUMAN', 'ESCALATED', 'SUPPRESSION_REVIEW'];

async function resolveNow(incidentId: string, advancePastDeadline: boolean): Promise<string> {
  if (!advancePastDeadline) return new Date().toISOString();

  const record = await leadRescueWaitStore.load(incidentId);
  if (record === undefined) return new Date().toISOString();

  const { lifecycleState, facts } = record.engineState;
  const pastDeadline = (anchorAt: string | undefined, windowParam: string): string | undefined => {
    if (anchorAt === undefined) return undefined;
    const windowHours = numberParam(KESTREL, windowParam);
    return new Date(Date.parse(anchorAt) + (windowHours + 1) * 3_600_000).toISOString();
  };

  if (REVIEW_STATES.includes(lifecycleState)) {
    return pastDeadline(facts['reviewStartedAt'], 'humanReviewTimeoutHours') ?? new Date().toISOString();
  }
  if (lifecycleState === 'BOOKING_READY' && facts['offerSentAt'] === undefined) {
    return pastDeadline(facts['bookingReadyAt'], 'dispatchTimeoutHours') ?? new Date().toISOString();
  }
  if (lifecycleState === 'BOOKING_READY') {
    return pastDeadline(facts['offerSentAt'], 'bookingOfferWindowHours') ?? new Date().toISOString();
  }
  return pastDeadline(facts['waitStartedAt'], 'replyWaitWindowHours') ?? new Date().toISOString();
}
