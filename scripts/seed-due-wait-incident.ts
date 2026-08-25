/**
 * TEST/EVIDENCE-ONLY HARNESS — not a production entry point, not an HTTP route, never
 * imported by `app/`. Run manually: `npx tsx scripts/seed-due-wait-incident.ts [incidentId] [overdueHours]`.
 *
 * WHY THIS EXISTS.
 *
 * Proving that n8n's real wait-sweep workflow genuinely discovers a due incident and drives
 * `handleDispatchAttentionTimeout` (the "ready-but-undespatched" half of lr-fm-approval-timeout,
 * `lib/engine/handlers/lead-rescue.ts`) requires a BOOKING_READY incident whose `bookingReadyAt`
 * is already more than `dispatchTimeoutHours` (8h, kestrel-dispatch-timeout-window) in the past
 * by the time the real n8n sweep calls `POST /api/lead-rescue/wait-incidents/check`. That route
 * always reads the genuine wall clock (`new Date()`) for the bulk sweep — by design, the
 * wait-sweep workflow never passes `incidentId`/`advancePastDeadline` (see
 * `n8n/workflows/lead-rescue-wait-sweep.json`'s own sticky note: "n8n owns scheduling only").
 * Waiting 8 real hours is not a reasonable way to produce evidence.
 *
 * WHAT THIS DOES NOT DO.
 *
 * This does not fabricate the transition. It calls `WaitIncidentStore.park()` — the exact same
 * production persistence method `ingestExternalLead`, `applyHumanDecision`, and
 * `dispatchAuthorizedOffer` already call (`lib/engine/lead-ingress.ts`, `lib/engine/wait-resume.ts`)
 * — to establish a PRECONDITION: a real, schema-valid `WaitIncidentRecord` with a backdated
 * `bookingReadyAt`. It never touches `.data/lead-rescue-wait-incidents.json`'s bytes directly,
 * never calls `handleDispatchAttentionTimeout` itself, and never writes an outcome. Whatever
 * happens after this script runs is decided entirely by the real n8n workflow and the real,
 * unmodified `checkAllWaitingIncidents` -> `checkWaitIncident` -> `handleDispatchAttentionTimeout`
 * chain, reading the genuine wall clock at the moment the real sweep actually runs.
 *
 * The resulting record deliberately carries no `provenance` — it did not arrive through n8n
 * ingress, and inventing a `source`/`sourceEventId` for it would misrepresent how it was
 * created. This is the same convention `tests/lead-rescue-ingress.test.ts` case 10 already
 * establishes for any case parked outside the n8n ingress path.
 */

import { leadRescueWaitStore } from '../lib/engine/lead-rescue-wait-runtime';
import { LEAD_RESCUE } from '../data/systems';

async function main(): Promise<void> {
  const incidentId = process.argv[2] ?? 'lead-evidence-harness-dispatch-timeout-1';
  const overdueHours = Number(process.argv[3] ?? '9');
  if (!Number.isFinite(overdueHours) || overdueHours <= 8) {
    throw new Error('overdueHours must be a finite number greater than the 8h dispatchTimeoutHours window.');
  }

  const bookingReadyAt = new Date(Date.now() - overdueHours * 60 * 60 * 1000).toISOString();
  const correlationId = `inc-${incidentId}`;

  const record = await leadRescueWaitStore.park({
    incidentId,
    systemId: LEAD_RESCUE.id,
    correlationId,
    engineState: {
      lifecycleState: 'BOOKING_READY',
      facts: {
        channel: 'web-form',
        company: 'Fenwright Data Services',
        contactName: 'Priya Anand',
        bookingReadyAt,
      },
      suppressed: false,
      awaitingHuman: null,
      missingInformation: [],
    },
    // Deliberately no `provenance` — see module docstring.
  });

  console.log(JSON.stringify({ seeded: true, bookingReadyAt, overdueHours, record }, null, 2));
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
