import { NextResponse } from 'next/server';
import { z } from 'zod';
import { KESTREL } from '@/data/profiles/kestrel/profile';
import { numberParam } from '@/lib/model/profile';
import { checkAllWaitingIncidents, checkWaitIncident } from '@/lib/engine/wait-resume';
import { leadRescueWaitStore, LEAD_RESCUE_WAIT_DEPS } from '@/lib/engine/lead-rescue-wait-runtime';
import { MalformedWaitRecordError } from '@/lib/persistence/wait-incident-store';

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
      const result = await checkWaitIncident(leadRescueWaitStore, incidentId, now, LEAD_RESCUE_WAIT_DEPS);
      return NextResponse.json({ now, result });
    }

    const now = new Date().toISOString();
    const results = await checkAllWaitingIncidents(leadRescueWaitStore, now, LEAD_RESCUE_WAIT_DEPS);
    return NextResponse.json({ now, results });
  } catch (error) {
    if (error instanceof MalformedWaitRecordError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    throw error;
  }
}

async function resolveNow(incidentId: string, advancePastDeadline: boolean): Promise<string> {
  if (!advancePastDeadline) return new Date().toISOString();

  const record = await leadRescueWaitStore.load(incidentId);
  const waitStartedAt = record?.engineState.facts['waitStartedAt'];
  if (waitStartedAt === undefined) return new Date().toISOString();

  const windowHours = numberParam(KESTREL, 'replyWaitWindowHours');
  return new Date(Date.parse(waitStartedAt) + (windowHours + 1) * 3_600_000).toISOString();
}
