import type { BusinessProfile } from '@/lib/model/profile';
import type { SystemDefinition } from '@/lib/model/system';
import type {
  CanonicalEvent,
  DecisionRecord,
  SideEffect,
  SideEffectKind,
  StateTransition,
  TimelineEntry,
  VerificationRecord,
} from '@/lib/model/runtime';
import type { AuthorityLevel } from '@/lib/model/system';
import type { ResolvedJudgment } from '@/lib/ports/decision-provider';
import type { EventLedger, ExecutionLedger, SideEffectLedger } from './ledger';

/**
 * Authoritative business state for one incident.
 *
 * `lifecycleState` is the graph position; `facts` is what the system currently
 * believes to be true. Facts are only ever added by handlers from evidence in events —
 * a handler that writes a fact the input did not establish is the bug that
 * "unknown must remain unknown" exists to prevent.
 */
export interface EngineState {
  readonly lifecycleState: string;
  readonly facts: Readonly<Record<string, string>>;
  /** Contact suppressed by opt-out, do-not-contact, or policy. Overrides commercial intent. */
  readonly suppressed: boolean;
  /** Set when the system has handed the incident to a person and is waiting. */
  readonly awaitingHuman: string | null;
  /** Information the system knows it does not have. Rendered, never silently filled in. */
  readonly missingInformation: readonly string[];
}

export function initialState(lifecycleState: string): EngineState {
  return {
    lifecycleState,
    facts: {},
    suppressed: false,
    awaitingHuman: null,
    missingInformation: [],
  };
}

/**
 * What kind of admission the core should apply once policy and authority pass.
 *
 * Absent: the existing always-succeeds path (`SideEffectLedger.claim`), byte-identical
 * to how every effect worked before this file existed. Present with kind `SEND`: routed
 * through the `ExecutionLedger` and the pre-resolved outcome for `attemptId`, which may
 * come back uncertain. Present with kind `VERIFY`: a read-only check that can only narrow
 * a prior `SEND`'s uncertainty, never itself admitted as a customer-facing action.
 */
export type EffectExecution =
  | {
      readonly kind: 'SEND';
      readonly attemptId: string;
      readonly honorsIdempotencyKey: boolean;
      /** The channel/provider actually performing the send. Distinct from `target`, the recipient. */
      readonly provider: string;
    }
  | {
      readonly kind: 'VERIFY';
      readonly attemptId: string;
      readonly targetIdempotencyKey: string;
      readonly provider: string;
    };

/** A side effect a handler WANTS. The core decides whether it actually happens. */
export interface ProposedEffect {
  readonly id: string;
  readonly kind: SideEffectKind;
  readonly description: string;
  readonly target: string;
  readonly idempotencyKey: string;
  readonly authority: AuthorityLevel;
  /** Policy gate. When false the effect is recorded as BLOCKED_BY_POLICY, never executed. */
  readonly policyPermits: boolean;
  readonly policyReason?: string;
  /** Check to run after the effect resolves, producing a VerificationRecord. */
  readonly verification?: { readonly check: string; readonly expect: string };
  /** Opts this effect into execution-outcome tracking. See `EffectExecution`. */
  readonly execution?: EffectExecution;
}

export interface HandlerContext {
  readonly event: CanonicalEvent;
  readonly state: EngineState;
  readonly system: SystemDefinition;
  readonly profile: BusinessProfile;
  readonly judgments: ReadonlyMap<string, ResolvedJudgment>;
  /** Read-only view; only the core may claim keys. */
  readonly ledger: { has(key: string): boolean };
  /** True when this exact source event was already observed. */
  readonly isDuplicateEvent: boolean;
}

/**
 * One processing step within an event.
 *
 * Handlers decompose their work into steps because a single inbound event genuinely
 * involves several distinct decisions — validation, identity, consent, classification,
 * completeness, policy, action — and collapsing them into one timeline row would hide
 * exactly the reasoning the portfolio exists to expose.
 */
export interface HandlerStep {
  readonly id: string;
  /** Short label for the timeline rail. */
  readonly label: string;
  /** Seconds after event receipt. Authored, deterministic, never a clock read. */
  readonly atOffsetSeconds: number;
  readonly decisions: readonly DecisionRecord[];
  readonly effects: readonly ProposedEffect[];
  readonly verifications: readonly VerificationRecord[];
  /** Requested lifecycle target. The core rejects it if no declared rule permits it. */
  readonly transitionTo?: string;
  readonly statePatch?: Partial<Omit<EngineState, 'lifecycleState'>>;
  readonly summary: string;
}

export interface HandlerOutcome {
  readonly steps: readonly HandlerStep[];
}

export type EventHandler = (ctx: HandlerContext) => HandlerOutcome;

/** Per-system operating logic, keyed by business event type. */
export interface SystemHandlers {
  readonly systemId: string;
  readonly initialState: string;
  readonly handlers: Readonly<Record<string, EventHandler>>;
}

export interface EngineRun {
  readonly scenarioId: string;
  readonly systemId: string;
  readonly timeline: readonly TimelineEntry[];
  readonly finalState: EngineState;
  readonly transitions: readonly StateTransition[];
  readonly decisions: readonly DecisionRecord[];
  readonly sideEffects: readonly SideEffect[];
  readonly verifications: readonly VerificationRecord[];
  readonly ledgerEntries: readonly { idempotencyKey: string; sideEffectId: string }[];
}

export interface EngineInternals {
  readonly effects: SideEffectLedger;
  readonly events: EventLedger;
  readonly executions: ExecutionLedger;
}
