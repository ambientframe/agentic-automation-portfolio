import { z } from 'zod';

/**
 * THE LEAD RESCUE INGRESS CONTRACT.
 *
 * The seam between an external orchestration runtime (n8n) and the canonical Lead Rescue
 * engine. `lib/model/runtime.ts`'s own docstring on `CanonicalEvent` names this exact seam in
 * advance: "Today a fixture adapter produces these. Later a webhook adapter will produce the
 * same shapes from real traffic." This is that webhook adapter's INPUT contract — deliberately
 * NOT `CanonicalEvent` itself. An external system does not know this portfolio's internal event
 * grammar (`inbound.enquiry.received`, `judgment` requests, `consentState`, canon-declared
 * `requiredFields`) and must not be asked to construct it. Versioned so a future breaking
 * change to what n8n is expected to send is a deliberate, detectable decision rather than a
 * silent drift.
 *
 * Deliberately narrow: one realistic external lead shape, not a speculative schema for every
 * future CRM or form provider. `source` names WHICH external system the lead claims to come
 * from (e.g. a specific intake form) — the same "channel or system that emitted it" concept
 * `CanonicalEvent.source` already documents, just one layer further from the engine.
 * `sourceEventId` is the stable external identity this entire ingress path's idempotency
 * guarantee is built on — see `lib/engine/lead-ingress.ts`.
 */

export const LEAD_RESCUE_INGRESS_SCHEMA_VERSION = 'lead-rescue-ingress-1' as const;

export const LeadRescueIngressLeadSchema = z.strictObject({
  contactName: z.string().min(1).optional(),
  contactEmail: z.string().min(1).optional(),
  company: z.string().min(1).optional(),
  /** The free-text enquiry content. This, and only this, is what the bounded judgment reads. */
  message: z.string().min(1),
  /** The business communication channel the lead arrived through (e.g. "web-form", "email"). */
  channel: z.string().min(1),
});

export type LeadRescueIngressLead = z.infer<typeof LeadRescueIngressLeadSchema>;

export const LeadRescueIngressEnvelopeSchema = z.strictObject({
  schemaVersion: z.literal(LEAD_RESCUE_INGRESS_SCHEMA_VERSION),
  /** Which external system this lead claims to originate from — never "n8n" itself; n8n is transport, not source. */
  source: z.string().min(1),
  /**
   * The id THIS EVENT carries in the source system. The sole idempotency anchor for this
   * ingress path — at-least-once delivery (a retried webhook, a redelivered queue message)
   * must not create a second authoritative case. See `ingressClaimId`/`ingressEntityId`.
   */
  sourceEventId: z.string().min(1),
  /**
   * When the source system says this lead arrived. Optional: if the external system does not
   * supply one, the ingress route's own real clock read (the one permitted boundary — see
   * `app/api/lead-rescue/ingress/route.ts`) is used instead, exactly like every other event's
   * `occurredAt` in this codebase when no more authoritative value exists.
   */
  receivedAt: z.string().min(1).optional(),
  lead: LeadRescueIngressLeadSchema,
});

export type LeadRescueIngressEnvelope = z.infer<typeof LeadRescueIngressEnvelopeSchema>;
