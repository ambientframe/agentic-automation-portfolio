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
import type { CanonicalEvent, Scenario } from '@/lib/model/runtime';

/**
 * The live park/list surface for the wait/resume demo (`app/lead-rescue/wait/page.tsx`).
 *
 * Never statically generated: every request genuinely re-reads the persisted store and, on
 * POST, genuinely re-runs the engine. This is the one page in the portfolio that can
 * honestly claim "executed on this request" without the SSG caveat `docs/STATUS.md`
 * records for `app/simulator/[slug]`.
 *
 * Two waiting categories share this one surface — WAITING_FOR_REPLY (lr-t14) and
 * BOOKING_READY (lr-t22) — exactly as they share `WaitIncidentStore`, `checkWaitIncident`,
 * and `OperationClaimStore` underneath. `WAIT_KINDS` is the one place this route needs to
 * know the two apart: which fixture scenario seeds a demo incident, and which fact/window
 * pair its deadline is computed from. Nothing else here branches on category.
 */
export const dynamic = 'force-dynamic';

const WAIT_KINDS = {
  reply: {
    scenarioSlug: 'reply-window-elapses',
    expectedState: 'WAITING_FOR_REPLY',
    waitStartedFact: 'waitStartedAt',
    windowParam: 'replyWaitWindowHours',
  },
  offer: {
    scenarioSlug: 'offer-window-elapses',
    expectedState: 'BOOKING_READY',
    // NOT bookingReadyAt: that fact only records readiness, never proof an offer reached
    // the prospect. The clock starts at offerSentAt, written once the fixture's own
    // lead.offer.despatched setup event is replayed below — see WAIT_START_FACTS in
    // `check/route.ts` for the same discriminant used on the read side.
    waitStartedFact: 'offerSentAt',
    windowParam: 'bookingOfferWindowHours',
  },
} as const;

type WaitKind = keyof typeof WAIT_KINDS;

const REPLY_WINDOW_HOURS = numberParam(KESTREL, 'replyWaitWindowHours');
const OFFER_WINDOW_HOURS = numberParam(KESTREL, 'bookingOfferWindowHours');

export async function GET(): Promise<NextResponse> {
  const waiting = await leadRescueWaitStore.listWaiting();

  const incidents = waiting
    .map((record) => {
      const waitStartedAt = record.engineState.facts[WAIT_KINDS.reply.waitStartedFact] ?? null;
      const bookingReadyAt = record.engineState.facts[WAIT_KINDS.offer.waitStartedFact] ?? null;
      // Which fact is present tells us which category this incident is — the same
      // authoritative-fact discriminant `handleWaitReevaluation` itself uses, not a second,
      // separately-tracked label this route could drift out of sync with.
      const kind: WaitKind | null = waitStartedAt !== null ? 'reply' : bookingReadyAt !== null ? 'offer' : null;
      const waitStartedFactValue = kind === 'offer' ? bookingReadyAt : waitStartedAt;
      const windowHours = kind === 'offer' ? OFFER_WINDOW_HOURS : kind === 'reply' ? REPLY_WINDOW_HOURS : null;
      const deadlineAt =
        waitStartedFactValue === null || windowHours === null
          ? null
          : new Date(Date.parse(waitStartedFactValue) + windowHours * 3_600_000).toISOString();
      return {
        incidentId: record.incidentId,
        correlationId: record.correlationId,
        lifecycleState: record.engineState.lifecycleState,
        kind,
        waitStartedAt: waitStartedFactValue,
        windowHours,
        deadlineAt,
        revision: record.revision,
      };
    })
    .sort((a, b) => (a.waitStartedAt ?? '').localeCompare(b.waitStartedAt ?? ''));

  return NextResponse.json({
    incidents,
    windows: { reply: REPLY_WINDOW_HOURS, offer: OFFER_WINDOW_HOURS },
  });
}

const ParkRequestSchema = z.object({
  kind: z.enum(['reply', 'offer']).optional(),
});

/**
 * Parks one fresh demo incident, reusing the requested category's fixture scenario —
 * judgment and message content — but a freshly minted identity and the real current time as
 * its wait start. `kind` defaults to `'reply'`, preserving this route's exact prior
 * behaviour for any caller that doesn't specify one.
 *
 * Replays every SETUP event in the fixture — everything up to (not including) its first
 * `lead.wait.reevaluated` check — not just the first. For `reply` that is still one event
 * (the enquiry). For `offer` it is now two: the enquiry (readiness, bookingReadyAt) AND the
 * fixture's own `lead.offer.despatched` event (offer-sent evidence, offerSentAt) — the actual
 * event this park flow's wait clock is computed from. Generic on purpose: a future third
 * waiting category needs no change here, only a longer or shorter run of setup events in its
 * own fixture.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const rawBody: unknown = await request.json().catch(() => ({}));
  const parsedBody = ParkRequestSchema.safeParse(rawBody);
  if (!parsedBody.success) {
    return NextResponse.json({ error: 'invalid request body' }, { status: 400 });
  }
  const kind: WaitKind = parsedBody.data.kind ?? 'reply';
  const { scenarioSlug, expectedState } = WAIT_KINDS[kind];

  const found = leadRescueScenarioBySlug(scenarioSlug);
  if (found === undefined) {
    return NextResponse.json({ error: `fixture scenario "${scenarioSlug}" not found` }, { status: 500 });
  }
  const setupEvents = found.events.filter((_, i) => {
    // Every event before the first lead.wait.reevaluated check.
    const firstCheckIndex = found.events.findIndex((e) => e.type === 'lead.wait.reevaluated');
    return firstCheckIndex === -1 || i < firstCheckIndex;
  });
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

  const parked = await parkWaitingIncident(leadRescueWaitStore, LEAD_RESCUE, {
    incidentId,
    correlationId: `inc-${incidentId}`,
    engineState: run.finalState,
  });

  return NextResponse.json({ parked, kind });
}
