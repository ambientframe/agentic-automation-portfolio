import { z } from 'zod';
import type { ExecutionMode } from '@/lib/model/runtime';

/**
 * THE PROVISIONING PORT.
 *
 * A third peer to `DecisionProvider` and `SideEffectExecutor` — not a deformation of
 * either. `SideEffectExecutor.attemptSend` answers "did an action happen": its contract
 * defaults to UNSAFE-TO-RETRY on an uncertain outcome, because sending a message twice
 * has a real customer-facing consequence and the engine core actively blocks a second
 * attempt until something proves the first one didn't land (see `ExecutionLedger`).
 *
 * Durable resource provisioning asks a different question: "does a resource matching
 * this desired state already exist at this business identity, and if not, create it."
 * That question is safe to ask repeatedly BY CONSTRUCTION — an `ensure` call is supposed
 * to converge, not to duplicate — so this port's contract is the opposite default: a
 * second `ensure` on the same `resourceKey` is expected and answered honestly, never
 * refused by the core the way a second SEND is. Forcing this through `SideEffectExecutor`
 * would either weaken retry-safety guarantees that genuinely matter for sends, or bolt an
 * identity/state-comparison concept onto a contract that has no field for it. Two
 * different shapes of "did the side effect happen", two ports.
 *
 * Resolved in the same kind of pre-pass phase as the other two ports, before the reducer
 * runs (see `lib/engine/run.ts`), so the reducer itself stays synchronous and replay
 * stays exact.
 */

export interface ProvisionRequest {
  readonly attemptId: string;
  /**
   * The stable business identity a real provider would reconcile against — e.g.
   * `onboarding:eng-bramwell:workspace`. Independent of any id a provider assigns.
   */
  readonly resourceKey: string;
  readonly resourceType: string;
  /**
   * A deterministic fingerprint of what this run intends the resource to look like.
   * Two ensure calls with the same `resourceKey` but different fingerprints are the
   * EXISTS_DIFFERENT case; same fingerprint is the safe-convergence case.
   */
  readonly desiredStateFingerprint: string;
  readonly provider: string;
  readonly description: string;
}

export const ProvisionOutcomeSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('CREATED'), externalId: z.string().min(1).optional() }),
  z.strictObject({ kind: z.literal('ALREADY_EXISTS_MATCHING'), externalId: z.string().min(1).optional() }),
  z.strictObject({
    kind: z.literal('EXISTS_DIFFERENT'),
    existingStateFingerprint: z.string().min(1),
    reason: z.string().min(1),
  }),
  z.strictObject({ kind: z.literal('FAILED_BEFORE_EFFECT'), reason: z.string().min(1) }),
  z.strictObject({ kind: z.literal('OUTCOME_UNKNOWN'), reason: z.string().min(1) }),
]);
export type ProvisionOutcome = z.infer<typeof ProvisionOutcomeSchema>;

export interface ResourceProvisioner {
  readonly id: string;
  readonly mode: ExecutionMode;
  readonly description: string;
  ensure(request: ProvisionRequest): Promise<ProvisionOutcome>;
}

// ---------------------------------------------------------------------------
// Resolution outcomes
// ---------------------------------------------------------------------------

export type ResolvedProvision =
  | { readonly status: 'OK'; readonly result: ProvisionOutcome }
  | { readonly status: 'CONTRACT_VIOLATION'; readonly attemptId: string; readonly reason: string }
  | { readonly status: 'UNAVAILABLE'; readonly attemptId: string; readonly reason: string };

// ---------------------------------------------------------------------------
// Fixture-backed implementation
// ---------------------------------------------------------------------------

/**
 * A SIMULATED provisioner that behaves like a real one, not a script that recites the
 * intended answer. It holds a plain in-memory map standing in for "the provider's actual
 * current state" and does genuine reconcile logic against it: the first `ensure()` on a
 * `resourceKey` creates and records it; a later `ensure()` on the same key compares
 * fingerprints for real and returns MATCHING or DIFFERENT accordingly. Nothing here
 * leaves the process, and no external id is ever invented — `CREATED` returns one only
 * when this fixture was explicitly configured with one for that attempt.
 *
 * `forcedOutcomes` lets a scenario inject a specific failure or an unresolved outcome
 * for one attempt (e.g. to demonstrate partial provisioning) without disturbing the real
 * reconcile logic used for every other attempt.
 */
export class FixtureResourceProvisioner implements ResourceProvisioner {
  readonly id = 'fixture-resource-provisioner';
  readonly mode: ExecutionMode = 'SIMULATED';
  readonly description =
    'Reconciles resource identity against an in-memory store standing in for a real provider. No external system is called.';

  private readonly existing = new Map<string, { fingerprint: string; externalId?: string }>();

  constructor(
    preExisting: Readonly<Record<string, { fingerprint: string; externalId?: string }>> = {},
    private readonly externalIds: Readonly<Record<string, string>> = {},
    private readonly forcedOutcomes: Readonly<
      Record<string, { kind: 'FAILED_BEFORE_EFFECT' | 'OUTCOME_UNKNOWN'; reason: string }>
    > = {},
  ) {
    for (const [key, value] of Object.entries(preExisting)) {
      this.existing.set(key, value);
    }
  }

  async ensure(request: ProvisionRequest): Promise<ProvisionOutcome> {
    const forced = this.forcedOutcomes[request.attemptId];
    if (forced !== undefined) return forced;

    const current = this.existing.get(request.resourceKey);
    if (current === undefined) {
      const externalId = this.externalIds[request.attemptId];
      this.existing.set(request.resourceKey, {
        fingerprint: request.desiredStateFingerprint,
        ...(externalId === undefined ? {} : { externalId }),
      });
      return externalId === undefined ? { kind: 'CREATED' } : { kind: 'CREATED', externalId };
    }

    if (current.fingerprint === request.desiredStateFingerprint) {
      return current.externalId === undefined
        ? { kind: 'ALREADY_EXISTS_MATCHING' }
        : { kind: 'ALREADY_EXISTS_MATCHING', externalId: current.externalId };
    }

    return {
      kind: 'EXISTS_DIFFERENT',
      existingStateFingerprint: current.fingerprint,
      reason: `A resource already exists at "${request.resourceKey}" with a different desired-state fingerprint than this run intends. Existing: ${current.fingerprint}. Intended: ${request.desiredStateFingerprint}.`,
    };
  }
}

export class ProvisionContractError extends Error {
  constructor(
    readonly attemptId: string,
    message: string,
  ) {
    super(message);
    this.name = 'ProvisionContractError';
  }
}

export class ProvisionUnavailableError extends Error {
  constructor(
    readonly attemptId: string,
    message: string,
  ) {
    super(message);
    this.name = 'ProvisionUnavailableError';
  }
}

export async function resolveProvision(
  provisioner: ResourceProvisioner,
  request: ProvisionRequest,
): Promise<ResolvedProvision> {
  try {
    const result = await provisioner.ensure(request);
    const parsed = ProvisionOutcomeSchema.safeParse(result);
    if (!parsed.success) {
      return {
        status: 'CONTRACT_VIOLATION',
        attemptId: request.attemptId,
        reason: `Provisioner outcome failed its schema: ${parsed.error.issues.map((i) => i.message).join('; ')}`,
      };
    }
    return { status: 'OK', result: parsed.data };
  } catch (error) {
    if (error instanceof ProvisionContractError) {
      return { status: 'CONTRACT_VIOLATION', attemptId: request.attemptId, reason: error.message };
    }
    if (error instanceof ProvisionUnavailableError) {
      return { status: 'UNAVAILABLE', attemptId: request.attemptId, reason: error.message };
    }
    return {
      status: 'UNAVAILABLE',
      attemptId: request.attemptId,
      reason: error instanceof Error ? error.message : 'unknown provisioner failure',
    };
  }
}
