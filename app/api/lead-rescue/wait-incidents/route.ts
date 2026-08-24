import { NextResponse } from 'next/server';
import { z } from 'zod';
import { LEAD_RESCUE } from '@/data/systems';
import { KESTREL } from '@/data/profiles/kestrel/profile';
import { numberParam } from '@/lib/model/profile';
import { leadRescueScenarioBySlug } from '@/data/profiles/kestrel/scenarios/lead-rescue';
import { runScenario } from '@/lib/engine/run';
import { LEAD_RESCUE_HANDLERS } from '@/lib/engine/handlers/lead-rescue';
import { FixtureDecisionProvider } from '@/lib/ports/decision-provider';
import { parkWaitingIncident } from '@/lib/engine/wait-resume';
import { leadRescueWaitStore } from '@/lib/engine/lead-rescue-wait-runtime';
import type { WaitIncidentRecord } from '@/lib/persistence/wait-incident-store';
import type { CanonicalEvent, Scenario } from '@/lib/model/runtime';

/**
 * The live park/list surface for the wait/resume demo (`app/lead-rescue/wait/page.tsx`).
 *
 * Never statically generated: every request genuinely re-reads the persisted store and, on
 * POST, genuinely re-runs the engine. This is the one page in the portfolio that can
 * honestly claim "executed on this request" without the SSG caveat `docs/STATUS.md`
 * records for `app/simulator/[slug]`.
 *
 * THREE stages share this one store, distinguished by `stageFor()` below reading the
 * incident's own current lifecycle state and facts — never a separately tracked label this
 * route could drift out of sync with:
 *   'review'  — NEEDS_HUMAN / ESCALATED / SUPPRESSION_REVIEW. Under human review; no clock
 *               runs. Resumed by `POST .../decide` (`applyHumanDecision`).
 *   'ready'   — BOOKING_READY, no offer despatched yet. Readiness only; still no clock.
 *               Resumed by `POST .../dispatch` (`dispatchAuthorizedOffer`).
 *   'waiting' — WAITING_FOR_REPLY, or BOOKING_READY with `offerSentAt` present. A genuine
 *               timer is running. Resumed by `POST .../check` (`checkWaitIncident`),
 *               unchanged from every prior pass.
 * A 'review' or 'ready' record is every bit as durable as a 'waiting' one — same file, same
 * temp-then-rename guarantee — it is simply not YET governed by a timer. See
 * `lib/engine/wait-resume.ts`'s own module-level note on `applyHumanDecision`/
 * `dispatchAuthorizedOffer` for why this does not stretch `WaitIncidentStore`'s contract.
 */
export const dynamic = 'force-dynamic';

const UNDER_REVIEW_STATES = ['NEEDS_HUMAN', 'ESCALATED', 'SUPPRESSION_REVIEW'];

function stageFor(record: WaitIncidentRecord): 'review' | 'ready' | 'waiting' {
  if (UNDER_REVIEW_STATES.includes(record.engineState.lifecycleState)) return 'review';
  if (record.engineState.lifecycleState === 'BOOKING_READY' && record.engineState.facts['offerSentAt'] === undefined) {
    return 'ready';
  }
  return 'waiting';
}

const WAIT_KINDS = {
  reply: {
    scenarioSlug: 'reply-window-elapses',
    expectedState: 'WAITING_FOR_REPLY',
    waitStartedFact: 'waitStartedAt' as const,
    windowParam: 'replyWaitWindowHours' as const,
    /** Every setup event up to (not including) the first event of this type. */
    stopBeforeType: 'lead.wait.reevaluated',
  },
  offer: {
    scenarioSlug: 'offer-window-elapses',
    expectedState: 'BOOKING_READY',
    // NOT bookingReadyAt: that fact only records readiness, never proof an offer reached
    // the prospect. The clock starts at offerSentAt, written once the fixture's own
    // lead.offer.despatched setup event is replayed below.
    waitStartedFact: 'offerSentAt' as const,
    windowParam: 'bookingOfferWindowHours' as const,
    stopBeforeType: 'lead.wait.reevaluated',
  },
  review: {
    scenarioSlug: 'reviewed-offer-elapses',
    expectedState: 'NEEDS_HUMAN',
    // No clock at all yet — this kind parks ONLY the enquiry. The operator, not a fixture,
    // supplies the human.decision.recorded and lead.offer.despatched events that follow, via
    // POST .../decide and POST .../dispatch.
    waitStartedFact: null,
    windowParam: null,
    stopBeforeType: 'human.decision.recorded',
  },
} as const;

type WaitKind = keyof typeof WAIT_KINDS;

const REPLY_WINDOW_HOURS = numberParam(KESTREL, 'replyWaitWindowHours');
const OFFER_WINDOW_HOURS = numberParam(KESTREL, 'bookingOfferWindowHours');
const REVIEW_WINDOW_HOURS = numberParam(KESTREL, 'humanReviewTimeoutHours');
const DISPATCH_WINDOW_HOURS = numberParam(KESTREL, 'dispatchTimeoutHours');

/**
 * Deadline + overdue for the two ATTENTION-timeout stages (`review`, `ready`) — informational
 * only, computed against the real clock at request time, exactly like `deadlineAt` already is
 * for the `waiting` stage below. This never performs a check, claims nothing, and fires no
 * notification: it answers "is this visibly overdue right now" for display, the same way a
 * person glancing at a wall clock does not thereby escalate anything themselves. The
 * AUTHORITATIVE, durably-recorded escalation only ever happens through `checkWaitIncident`
 * (`POST .../check`), never here.
 */
function attentionTimeout(anchorAt: string | null, windowHours: number, nowMs: number): { deadlineAt: string | null; overdue: boolean } {
  if (anchorAt === null) return { deadlineAt: null, overdue: false };
  const deadlineMs = Date.parse(anchorAt) + windowHours * 3_600_000;
  return { deadlineAt: new Date(deadlineMs).toISOString(), overdue: nowMs >= deadlineMs };
}

export async function GET(): Promise<NextResponse> {
  const all = await leadRescueWaitStore.listWaiting();
  const nowMs = Date.now();

  const incidents = all
    .map((record) => {
      const stage = stageFor(record);
      const waitStartedAt =
        stage !== 'waiting'
          ? null
          : (record.engineState.facts['waitStartedAt'] ?? record.engineState.facts['offerSentAt'] ?? null);
      const kind: WaitKind | null =
        stage !== 'waiting' ? null : record.engineState.facts['waitStartedAt'] !== undefined ? 'reply' : 'offer';
      const windowHours = kind === 'offer' ? OFFER_WINDOW_HOURS : kind === 'reply' ? REPLY_WINDOW_HOURS : null;
      const deadlineAt =
        waitStartedAt === null || windowHours === null
          ? null
          : new Date(Date.parse(waitStartedAt) + windowHours * 3_600_000).toISOString();

      const reviewStartedAt = stage === 'review' ? (record.engineState.facts['reviewStartedAt'] ?? null) : null;
      const bookingReadyAt = record.engineState.facts['bookingReadyAt'] ?? null;
      const attention =
        stage === 'review'
          ? attentionTimeout(reviewStartedAt, REVIEW_WINDOW_HOURS, nowMs)
          : stage === 'ready'
            ? attentionTimeout(bookingReadyAt, DISPATCH_WINDOW_HOURS, nowMs)
            : { deadlineAt: null, overdue: false };

      return {
        incidentId: record.incidentId,
        correlationId: record.correlationId,
        lifecycleState: record.engineState.lifecycleState,
        stage,
        kind,
        waitStartedAt,
        windowHours,
        deadlineAt,
        revision: record.revision,
        // Additive, present regardless of stage — what a review/ready screen needs to explain
        // itself: why automation stopped, what remains unresolved, and readiness evidence.
        awaitingHuman: record.engineState.awaitingHuman,
        missingInformation: record.engineState.missingInformation,
        bookingReadyAt,
        contactName: record.engineState.facts['contactName'] ?? null,
        company: record.engineState.facts['company'] ?? null,
        // The operational-attention timeout (lr-fm-approval-timeout) — a genuinely separate
        // concern from business `deadlineAt` above: this never moves lifecycleState, and
        // `attentionOverdue` is display-only, re-derived from the real clock on every request,
        // never a durable field the timeout write anywhere.
        reviewStartedAt,
        attentionWindowHours: stage === 'review' ? REVIEW_WINDOW_HOURS : stage === 'ready' ? DISPATCH_WINDOW_HOURS : null,
        attentionDeadlineAt: attention.deadlineAt,
        attentionOverdue: attention.overdue,
        // Present only for a case that genuinely entered through the n8n ingress seam
        // (`lib/engine/lead-ingress.ts`) — absent (null) for every scenario-fixture demo park,
        // exactly reflecting `WaitIncidentRecord.provenance`'s own optionality.
        provenance: record.provenance ?? null,
      };
    })
    .sort((a, b) => a.incidentId.localeCompare(b.incidentId));

  return NextResponse.json({
    incidents,
    windows: { reply: REPLY_WINDOW_HOURS, offer: OFFER_WINDOW_HOURS, review: REVIEW_WINDOW_HOURS, dispatch: DISPATCH_WINDOW_HOURS },
  });
}

const ParkRequestSchema = z.object({
  kind: z.enum(['reply', 'offer', 'review']).optional(),
});

/**
 * Parks one fresh demo incident, reusing the requested category's fixture scenario —
 * judgment and message content — but a freshly minted identity and the real current time as
 * its wait start. `kind` defaults to `'reply'`, preserving this route's exact prior
 * behaviour for any caller that doesn't specify one.
 *
 * Replays every SETUP event in the fixture — everything up to (not including) its
 * `stopBeforeType` event. For `reply` that is one event (the enquiry). For `offer` it is two
 * (the enquiry, then the fixture's own offer despatch). For `review` it is ALSO just one (the
 * enquiry) — deliberately stopping BEFORE the fixture's own human decision, so the operator
 * supplies that step themselves rather than having it pre-baked.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const rawBody: unknown = await request.json().catch(() => ({}));
  const parsedBody = ParkRequestSchema.safeParse(rawBody);
  if (!parsedBody.success) {
    return NextResponse.json({ error: 'invalid request body' }, { status: 400 });
  }
  const kind: WaitKind = parsedBody.data.kind ?? 'reply';
  const { scenarioSlug, expectedState, stopBeforeType } = WAIT_KINDS[kind];

  const found = leadRescueScenarioBySlug(scenarioSlug);
  if (found === undefined) {
    return NextResponse.json({ error: `fixture scenario "${scenarioSlug}" not found` }, { status: 500 });
  }
  const firstStopIndex = found.events.findIndex((e) => e.type === stopBeforeType);
  const setupEvents = firstStopIndex === -1 ? found.events : found.events.slice(0, firstStopIndex);
  if (setupEvents.length === 0) {
    return NextResponse.json({ error: 'fixture scenario has no setup events' }, { status: 500 });
  }

  const nowIso = new Date().toISOString();
  const incidentId = `demo-lead-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const demoEvents: CanonicalEvent[] = setupEvents.map((e, i) => ({
    ...e,
    eventId: `${incidentId}:evt-${String(i + 1).padStart(3, '0')}`,
    correlationId: `inc-${incidentId}`,
    entityId: incidentId,
    sourceEventId: `demo-${incidentId}-${i + 1}`,
    occurredAt: nowIso,
    receivedAt: nowIso,
  }));
  const demoScenario: Scenario = { ...found, id: `demo-${incidentId}`, events: demoEvents };

  const run = await runScenario(demoScenario, {
    system: LEAD_RESCUE,
    profile: KESTREL,
    handlers: LEAD_RESCUE_HANDLERS,
    provider: new FixtureDecisionProvider(demoScenario.judgments),
  });

  if (run.finalState.lifecycleState !== expectedState) {
    return NextResponse.json(
      { error: `engine did not reach ${expectedState} (got ${run.finalState.lifecycleState})` },
      { status: 500 },
    );
  }

  const parked =
    kind === 'review'
      ? // Under review, not genuinely waiting on a timer — parked directly rather than
        // through `parkWaitingIncident`, whose own contract is scoped to the genuinely-
        // waiting case. Mechanically identical durability; the distinction is semantic.
        await leadRescueWaitStore.park({
          incidentId,
          systemId: LEAD_RESCUE.id,
          correlationId: `inc-${incidentId}`,
          engineState: { ...run.finalState, missingInformation: [...run.finalState.missingInformation] },
        })
      : await parkWaitingIncident(leadRescueWaitStore, LEAD_RESCUE, {
          incidentId,
          correlationId: `inc-${incidentId}`,
          engineState: run.finalState,
        });

  return NextResponse.json({ parked, kind });
}
