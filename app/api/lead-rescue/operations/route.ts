import { NextResponse } from 'next/server';
import { leadRescueJournalReader, leadRescueObservationIntents } from '@/lib/observability/lead-rescue-journal';
import { MalformedJournalRecordError } from '@/lib/persistence/execution-journal-store';
import { deriveOperationalView } from '@/lib/observability/operational-view';
import { deriveObservationIntegrity } from '@/lib/observability/observation-integrity';
import { deriveOperationalAlerts } from '@/lib/observability/operational-alerts';

/**
 * THE READ-ONLY AGGREGATE OPERATOR SURFACE.
 *
 * The sibling route, `/api/lead-rescue/journal`, answers "what happened to THIS lead?". This
 * one answers "what has Lead Rescue been doing?" — and it is a separate route rather than a
 * parameter on that one because they have genuinely different shapes: one returns records, this
 * returns a projection over records.
 *
 * SAME STRUCTURAL GUARANTEE. It imports `leadRescueJournalReader`, typed as
 * `ExecutionJournalReader`, which has no `record` method. Aggregation cannot write, and the
 * engine still cannot read: `deriveOperationalView` is a pure function of records that were
 * already durable before this route was called.
 *
 * NEVER STATICALLY GENERATED. The entire claim is that this re-reads what a separate process
 * last wrote to disk. A cached aggregate would be a rendered memory of the journal, not a read
 * of it.
 *
 * HONEST FAILURE, THREE DISTINCT ANSWERS, matching the per-case route exactly:
 *   200 + `empty: true`  — nothing has ever been observed. Not "zero activity happened".
 *   200 + view           — the projection, with every tally traceable to its records.
 *   409                  — a persisted record is unreadable. A summary computed over the
 *                          records that DID parse would be a confident number derived from a
 *                          knowingly partial history, which is the one thing an operational
 *                          view must never present. `MalformedJournalRecordError` propagates.
 *
 * THREE ANSWERS IN ONE RESPONSE, and the order matters. `integrity` says whether the records
 * underneath the view can be trusted to be all of them; `view` is the projection over whatever
 * survived; `alerts` are the few conditions in it that need a person rather than a reader. A
 * caller that rendered `view` without `integrity` would be publishing totals with no stated
 * bound, which is precisely the gap these two fields exist to close — so both are always
 * present, never optional, and `integrity` is computed even when the aggregate is empty.
 */
export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  try {
    const events = await leadRescueJournalReader.readAll();
    const view = deriveOperationalView(events);
    const integrity = await deriveObservationIntegrity(leadRescueObservationIntents, leadRescueJournalReader);

    return NextResponse.json({
      empty: events.length === 0,
      integrity,
      alerts: deriveOperationalAlerts(view, integrity),
      view,
    });
  } catch (error) {
    if (error instanceof MalformedJournalRecordError) {
      return NextResponse.json(
        {
          error: error.message,
          detail:
            'Retained history is unreadable, so no aggregate is reported. This is NOT an empty history and NOT zero activity.',
        },
        { status: 409 },
      );
    }
    throw error;
  }
}
