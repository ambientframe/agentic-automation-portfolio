import { NextResponse } from 'next/server';
import { leadRescueJournalReader } from '@/lib/observability/lead-rescue-journal';
import { MalformedJournalRecordError, STAGE_FOR_EVENT_TYPE } from '@/lib/persistence/execution-journal-store';

/**
 * THE READ-ONLY OPERATOR QUERY SURFACE for the execution journal.
 *
 * GET only, and structurally so: this route imports `leadRescueJournalReader`, a value typed
 * as `ExecutionJournalReader`, which has no `record` method. The journal cannot be written
 * through the operator surface any more than it can be read from the engine — the two halves
 * meet nowhere.
 *
 * `?incidentId=` answers "what happened to this lead?"; `?correlationId=` answers the same
 * question for a correlated run spanning more than one case. Never statically generated: the
 * whole point is that it re-reads what a genuinely separate process last wrote to disk.
 *
 * HONEST FAILURE, THREE DISTINCT ANSWERS — an operator must never be shown the same thing for
 * "nothing happened" and "history is unreadable":
 *   200 + `empty: true`  — this case genuinely has no recorded history.
 *   200 + events         — this is the retained history, in full.
 *   409                  — a persisted record is corrupt. NOT an empty history, NOT a partial
 *                          one silently presented as complete. `MalformedJournalRecordError`
 *                          propagates from the reader precisely so this case cannot be
 *                          quietly rendered as a shorter, successful-looking run.
 */
export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const incidentId = url.searchParams.get('incidentId')?.trim();
  const correlationId = url.searchParams.get('correlationId')?.trim();

  if ((incidentId === undefined || incidentId === '') && (correlationId === undefined || correlationId === '')) {
    return NextResponse.json({ error: 'one of incidentId or correlationId is required' }, { status: 400 });
  }

  try {
    const events =
      incidentId !== undefined && incidentId !== ''
        ? await leadRescueJournalReader.readIncident(incidentId)
        : await leadRescueJournalReader.readCorrelation(correlationId as string);

    return NextResponse.json({
      query: incidentId !== undefined && incidentId !== '' ? { incidentId } : { correlationId },
      // Explicit rather than inferred from `events.length` by every caller independently.
      empty: events.length === 0,
      count: events.length,
      // The operator grammar, derived here so no stored record can disagree with its own stage.
      events: events.map((event) => ({ ...event, stage: STAGE_FOR_EVENT_TYPE[event.type] })),
    });
  } catch (error) {
    if (error instanceof MalformedJournalRecordError) {
      return NextResponse.json(
        { error: error.message, detail: 'Retained history is unreadable. This is NOT an empty history.' },
        { status: 409 },
      );
    }
    throw error;
  }
}
