import path from 'node:path';
import { LEAD_RESCUE } from '@/data/systems';
import { KESTREL } from '@/data/profiles/kestrel/profile';
import { LEAD_RESCUE_HANDLERS } from './handlers/lead-rescue';
import { FileWaitIncidentStore } from '@/lib/persistence/wait-incident-store';
import { FileOperationClaimStore } from '@/lib/persistence/operation-claim-store';
import type { SendRequest, VerifyRequest, SideEffectExecutor } from '@/lib/ports/side-effect-executor';
import type { ExecutionMode, SendOutcome, VerifyOutcome } from '@/lib/model/runtime';
import type { WaitResumeDeps } from './wait-resume';

/**
 * The demo's stand-in `SideEffectExecutor` — the observable execution boundary
 * `checkWaitIncident` now guards behind the durable claim (see `wait-resume.ts`'s module
 * docstring). Deterministically reports SUCCEEDED for every attempt: there is no live
 * notification provider anywhere in this portfolio, so "always succeeds" is the honest
 * stand-in every other SIMULATED effect in this codebase already uses, made real here as an
 * actual awaited call instead of a data label, so the claim-then-invoke ordering this pass
 * closed is exercised by the live demo, not only by tests. Swapping in a genuine provider
 * later means implementing this ONE interface differently — nothing in `wait-resume.ts`,
 * `checkWaitIncident`, or the claim store would change.
 */
class AlwaysSucceedsNotificationExecutor implements SideEffectExecutor {
  readonly id = 'lead-rescue-wait-resume-simulated-notification-executor';
  readonly mode: ExecutionMode = 'SIMULATED';
  readonly description =
    'Deterministically simulated notification delivery. No provider is invoked and nothing leaves this process.';

  async attemptSend(request: SendRequest): Promise<SendOutcome> {
    void request;
    return { kind: 'SUCCEEDED' };
  }

  async attemptVerify(request: VerifyRequest): Promise<VerifyOutcome> {
    void request;
    throw new Error(
      'AlwaysSucceedsNotificationExecutor.attemptVerify is not used: this executor never returns OUTCOME_UNKNOWN, so nothing ever needs independent verification.',
    );
  }
}

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
  executor: new AlwaysSucceedsNotificationExecutor(),
};

/**
 * Opaque per-process identity for claim records' `claimedBy` field — inspectability only,
 * never read to make a safety decision (see `OperationClaimStore.claim`'s own contract).
 */
export const LEAD_RESCUE_WAIT_RUNTIME_ID = `route:${process.pid}`;
