import { NextResponse } from 'next/server';
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
 */
export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  const waiting = await leadRescueWaitStore.listWaiting();
  const windowHours = numberParam(KESTREL, 'replyWaitWindowHours');

  const incidents = waiting
    .map((record) => {
      const waitStartedAt = record.engineState.facts['waitStartedAt'] ?? null;
      const deadlineAt =
        waitStartedAt === null ? null : new Date(Date.parse(waitStartedAt) + windowHours * 3_600_000).toISOString();
      return {
        incidentId: record.incidentId,
        correlationId: record.correlationId,
        lifecycleState: record.engineState.lifecycleState,
        waitStartedAt,
        deadlineAt,
        revision: record.revision,
      };
    })
    .sort((a, b) => (a.waitStartedAt ?? '').localeCompare(b.waitStartedAt ?? ''));

  return NextResponse.json({ incidents, windowHours });
}

/** Parks one fresh demo incident, reusing the "reply-window-elapses" fixture's judgment and message content but a freshly minted identity and the real current time as its wait start. */
export async function POST(): Promise<NextResponse> {
  const found = leadRescueScenarioBySlug('reply-window-elapses');
  if (found === undefined) {
    return NextResponse.json({ error: 'fixture scenario "reply-window-elapses" not found' }, { status: 500 });
  }
  const enquiryEvent = found.events[0];
  if (enquiryEvent === undefined) {
    return NextResponse.json({ error: 'fixture scenario has no events' }, { status: 500 });
  }

  const nowIso = new Date().toISOString();
  const incidentId = `demo-lead-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const demoEvent: CanonicalEvent = {
    ...enquiryEvent,
    eventId: `${incidentId}:evt-001`,
    correlationId: `inc-${incidentId}`,
    entityId: incidentId,
    sourceEventId: `demo-${incidentId}`,
    occurredAt: nowIso,
    receivedAt: nowIso,
  };
  const demoScenario: Scenario = { ...found, id: `demo-${incidentId}`, events: [demoEvent] };

  const run = await runScenario(demoScenario, {
    system: LEAD_RESCUE,
    profile: KESTREL,
    handlers: LEAD_RESCUE_HANDLERS,
    provider: new FixtureDecisionProvider(demoScenario.judgments),
  });

  if (run.finalState.lifecycleState !== 'WAITING_FOR_REPLY') {
    return NextResponse.json(
      { error: `engine did not reach WAITING_FOR_REPLY (got ${run.finalState.lifecycleState})` },
      { status: 500 },
    );
  }

  const parked = await parkWaitingIncident(leadRescueWaitStore, LEAD_RESCUE, {
    incidentId,
    correlationId: demoEvent.correlationId,
    engineState: run.finalState,
  });

  return NextResponse.json({ parked });
}
