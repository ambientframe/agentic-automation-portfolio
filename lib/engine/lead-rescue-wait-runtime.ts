import path from 'node:path';
import { LEAD_RESCUE } from '@/data/systems';
import { KESTREL } from '@/data/profiles/kestrel/profile';
import { LEAD_RESCUE_HANDLERS } from './handlers/lead-rescue';
import { FileWaitIncidentStore } from '@/lib/persistence/wait-incident-store';
import { FileOperationClaimStore } from '@/lib/persistence/operation-claim-store';
import type { WaitResumeDeps } from './wait-resume';

/**
 * The one shared store + dependency bundle for the LIVE Lead Rescue wait/resume demo
 * (`app/api/lead-rescue/wait-incidents/*`, `app/lead-rescue/wait/page.tsx`).
 *
 * A module-level singleton, not a class instantiated per request — Next.js route handlers
 * are stateless functions invoked fresh per request (and per server process, per cold
 * start), so the durability this demo exists to prove cannot live in this module staying
 * warm. It lives entirely in the file on disk: a cold start that re-imports this module
 * constructs a new `FileWaitIncidentStore` pointed at the same path and reads exactly what
 * an earlier, now-gone process last wrote.
 *
 * Gitignored (`.data/`) — this is demo-runtime state, not a fixture.
 */
export const LEAD_RESCUE_WAIT_STORE_PATH = path.join(process.cwd(), '.data', 'lead-rescue-wait-incidents.json');

export const leadRescueWaitStore = new FileWaitIncidentStore(LEAD_RESCUE_WAIT_STORE_PATH);

/**
 * Durable, cross-process-exclusive claims on wait-elapsed side effects (today, only the
 * lr-t14 notification) — see `lib/persistence/operation-claim-store.ts` and
 * `lib/engine/wait-resume.ts` for why the wait store's own revision guard is not sufficient
 * on its own. A sibling directory to the incident store's file, same `.data/` durability
 * scope, same gitignore coverage.
 */
export const LEAD_RESCUE_CLAIM_STORE_DIR = path.join(process.cwd(), '.data', 'lead-rescue-operation-claims');

export const leadRescueClaimStore = new FileOperationClaimStore(LEAD_RESCUE_CLAIM_STORE_DIR);

export const LEAD_RESCUE_WAIT_DEPS: WaitResumeDeps = {
  system: LEAD_RESCUE,
  profile: KESTREL,
  handlers: LEAD_RESCUE_HANDLERS,
  reevaluationEventType: 'lead.wait.reevaluated',
};

/**
 * Opaque per-process identity for claim records' `claimedBy` field — inspectability only,
 * never read to make a safety decision (see `OperationClaimStore.claim`'s own contract).
 */
export const LEAD_RESCUE_WAIT_RUNTIME_ID = `route:${process.pid}`;
