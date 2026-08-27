import nodemailer, { type Transporter } from 'nodemailer';
import type { ExecutionMode, SendOutcome, VerifyOutcome } from '@/lib/model/runtime';
import { AttemptUnavailableError, type SendRequest, type SideEffectExecutor, type VerifyRequest } from './side-effect-executor';

/**
 * THE FIRST GENUINELY OBSERVABLE EXECUTION ADAPTER IN THIS PORTFOLIO.
 *
 * Every `SideEffectExecutor` before this one returned a data label:
 * `AlwaysSucceedsSimulatedExecutor` (`lib/engine/lead-rescue-wait-runtime.ts`) reports
 * `SUCCEEDED` without a socket, a provider, or anything leaving the process, and says so
 * honestly via `mode: 'SIMULATED'`. This class opens a real TCP connection, speaks real SMTP
 * to a separate server process, and reports that server's own message id — so `EXECUTED` on
 * this path means something genuinely left the application.
 *
 * IT IS THE SAME PORT, NOT A SECOND EXECUTION ARCHITECTURE. `checkWaitIncident` and
 * `dispatchAuthorizedOffer` (`lib/engine/wait-resume.ts`) are unchanged: they still authorize
 * (pure `applyEvent`), then claim (durable, exclusive), then invoke, then confirm. This adapter
 * is only ever reached at the "invoke" step, after a claim was already won — which is exactly
 * what makes "at most one real message per protected operation" hold here for free, inherited
 * from machinery that already existed rather than re-implemented for SMTP.
 *
 * **Why SMTP and not a vendor SDK.** The point of this adapter is to prove the execution
 * BOUNDARY is real, not to choose an eventual production email vendor. Plain SMTP is the
 * least vendor-committing way to cross a genuine network boundary, and it lets the proof run
 * entirely against a local capture server with no account, credential, or cost.
 *
 * **The recipient allowlist is a structural guard, not a convention.** `assertProofSafeRecipient`
 * runs in the CONSTRUCTOR, so an instance addressed at a routable mailbox cannot be built at
 * all — the failure happens at configuration time, not at send time when a claim may already
 * be held. See `PROOF_SAFE_RECIPIENT_SUFFIXES`.
 */

/**
 * Reserved, permanently non-routable domains (RFC 2606 / RFC 6761). Mail addressed here
 * cannot reach a real mailbox even if this adapter were pointed at a real relay by mistake —
 * which is the entire reason the guard is expressed as a domain allowlist rather than as a
 * blocklist of known providers. A blocklist is only ever as good as its last update; this
 * list is closed by specification.
 *
 * `.example`/`example.invalid` style hosts are included; bare `localhost` deliberately is
 * NOT — a `@localhost` address is genuinely deliverable to a local mail spool on many
 * systems, which is precisely the accident this guard exists to prevent.
 */
export const PROOF_SAFE_RECIPIENT_SUFFIXES: readonly string[] = ['.invalid', '.test', '.example'];

/** A deliberately strict address shape — this is a guard, not a general-purpose validator. */
const ADDRESS_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isProofSafeRecipient(address: string): boolean {
  const trimmed = address.trim().toLowerCase();
  if (!ADDRESS_PATTERN.test(trimmed)) return false;
  const domain = trimmed.slice(trimmed.lastIndexOf('@') + 1);
  return PROOF_SAFE_RECIPIENT_SUFFIXES.some((suffix) => domain.endsWith(suffix));
}

export class UnroutableRecipientError extends Error {
  constructor(readonly address: string) {
    super(
      `Recipient "${address}" is not a proof-safe address. This executor may only ever address reserved, non-routable domains (${PROOF_SAFE_RECIPIENT_SUFFIXES.join(', ')}), so local SMTP proof mode cannot reach a real mailbox.`,
    );
    this.name = 'UnroutableRecipientError';
  }
}

export function assertProofSafeRecipient(address: string): void {
  if (!isProofSafeRecipient(address)) throw new UnroutableRecipientError(address);
}

export interface SmtpExecutorConfig {
  readonly host: string;
  readonly port: number;
  readonly from: string;
  readonly to: string;
  /**
   * Injected only by tests that need to observe adapter behaviour without a live server.
   * Production/proof construction leaves this undefined and a real nodemailer transport is
   * built — this is a seam for observation, never a second code path for sending.
   */
  readonly transport?: Pick<Transporter, 'sendMail'>;
}

/**
 * `LIVE`, and it must stay that way. `mode` is what the rest of this codebase reads to decide
 * whether an effect may be described as genuinely executed (`executionMode` on the resulting
 * `SideEffect`), so an adapter that holds a real socket while reporting `SIMULATED` would make
 * every downstream truthfulness claim wrong at once.
 */
/**
 * SMTP commands that precede DATA in the protocol. A transport error raised against any of
 * these is provably before the message body was written, so — and only so — retry permission
 * is genuinely earned. `DATA` itself is deliberately absent: once the body is in flight,
 * acceptance can no longer be ruled out from this side of the socket.
 */
const SMTP_COMMANDS_BEFORE_DATA: ReadonlySet<string> = new Set([
  'CONN',
  'EHLO',
  'HELO',
  'STARTTLS',
  'AUTH',
  'MAIL',
  'MAIL FROM',
  'RCPT',
  'RCPT TO',
]);

export class SmtpSideEffectExecutor implements SideEffectExecutor {
  readonly id = 'lead-rescue-local-smtp-executor';
  readonly mode: ExecutionMode = 'LIVE';
  readonly description: string;

  private readonly transport: Pick<Transporter, 'sendMail'>;
  readonly host: string;
  readonly port: number;
  readonly from: string;
  readonly to: string;

  constructor(config: SmtpExecutorConfig) {
    // Fail closed at CONSTRUCTION, before any claim can be held against this instance.
    assertProofSafeRecipient(config.to);
    if (!ADDRESS_PATTERN.test(config.from.trim())) {
      throw new UnroutableRecipientError(config.from);
    }
    if (!Number.isInteger(config.port) || config.port <= 0 || config.port > 65_535) {
      throw new Error(`SMTP port "${config.port}" is not a valid TCP port.`);
    }
    if (config.host.trim().length === 0) {
      throw new Error('SMTP host must not be empty.');
    }

    this.host = config.host;
    this.port = config.port;
    this.from = config.from;
    this.to = config.to;
    this.description = `Real SMTP delivery to a local capture server at ${config.host}:${config.port}, addressed only to the reserved non-routable recipient ${config.to}. A genuine socket; never a public mail relay.`;

    this.transport =
      config.transport ??
      nodemailer.createTransport({
        host: config.host,
        port: config.port,
        // A local capture server speaks plaintext SMTP on loopback and offers no
        // certificate; there is no credential anywhere in this path to protect.
        secure: false,
        ignoreTLS: true,
        auth: undefined,
        connectionTimeout: 5_000,
        greetingTimeout: 5_000,
        socketTimeout: 5_000,
      });
  }

  /**
   * The honest failure taxonomy this port already declares, mapped onto real SMTP reality:
   *
   *   FAILED_BEFORE_EFFECT — the connection was refused, timed out during connect, or the
   *                          server rejected the envelope. Nothing was accepted; retrying is
   *                          genuinely safe.
   *   OUTCOME_UNKNOWN      — the failure happened after data may already have been written.
   *                          Whether the server accepted it is unknowable from here, and this
   *                          adapter refuses to guess — `checkWaitIncident` turns this into
   *                          the existing UNCERTAIN path, which never auto-retries.
   *
   * `SUCCEEDED` is returned ONLY when the server issued a message id, which it does only
   * after accepting the message. There is no branch that fabricates one.
   */
  async attemptSend(request: SendRequest): Promise<SendOutcome> {
    try {
      const info = await this.transport.sendMail({
        from: this.from,
        to: this.to,
        subject: `[Lead Rescue proof] ${request.description}`,
        text: [
          'This is an automated Lead Rescue execution-boundary proof message.',
          '',
          `attemptId: ${request.attemptId}`,
          `idempotencyKey: ${request.idempotencyKey}`,
          `description: ${request.description}`,
          '',
          'Sent to a reserved, non-routable address and captured by a local sandbox mail',
          'server. No real recipient exists and nothing was delivered to a real person.',
        ].join('\n'),
      });

      const messageId = typeof info?.messageId === 'string' ? info.messageId.trim() : '';
      if (messageId.length === 0) {
        // Accepted, but with no id to prove it. Honest ambiguity, never an invented id.
        return {
          kind: 'OUTCOME_UNKNOWN',
          reason: 'The SMTP server accepted the message but returned no message id, so this send cannot be independently identified.',
        };
      }
      return { kind: 'SUCCEEDED', externalId: messageId };
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      const detail = err?.message ?? 'unknown SMTP failure';

      // `FAILED_BEFORE_EFFECT` is a PERMISSION, not a description: it tells every layer above
      // that nothing reached the recipient and a retry is therefore safe. It may only be
      // issued for a code that is STRUCTURALLY INCAPABLE of following DATA.
      //
      // This list previously also contained ESOCKET, ECONNECTION, ECONNRESET, and ETIMEDOUT.
      // None of those carries phase information — nodemailer raises ESOCKET for a transport
      // error anywhere in the conversation, a peer reset arrives as readily after the body as
      // before it, and socketTimeout fires mid-DATA indistinguishably from connectionTimeout.
      // The retained abnormal-delivery capture under `n8n/evidence/` caught exactly that: this
      // adapter reported "confirmed non-execution" for a socket failure after DATA while the
      // receiving process was independently holding the message. Granting
      // retry permission there is how a system that promises exactly one customer-facing send
      // delivers two.
      if (['ECONNREFUSED', 'ENOTFOUND', 'EHOSTUNREACH', 'EDNS', 'EENVELOPE', 'EAUTH'].includes(err?.code ?? '')) {
        return { kind: 'FAILED_BEFORE_EFFECT', reason: `SMTP transport failed before the message was accepted (${err.code}): ${detail}` };
      }
      // Phase, when the transport actually reports it, rather than a guess from the code.
      // nodemailer collapses most connect-phase failures into ESOCKET — a genuine
      // ECONNREFUSED arrives as `{code: 'ESOCKET', syscall: 'connect', command: 'CONN'}` —
      // so refusing every ESOCKET would park a case for a human who has nothing to decide.
      // These two fields carry the discrimination the code alone cannot: a failure whose
      // syscall is `connect` never opened a conversation, and a failure raised against a
      // command that precedes DATA in the protocol cannot have written a body.
      const phase = (err as { command?: unknown })?.command;
      if (
        (err as { syscall?: unknown })?.syscall === 'connect' ||
        (typeof phase === 'string' && SMTP_COMMANDS_BEFORE_DATA.has(phase.toUpperCase()))
      ) {
        return {
          kind: 'FAILED_BEFORE_EFFECT',
          reason: `SMTP transport failed before the message body was sent${typeof phase === 'string' ? ` (at ${phase})` : ''}: ${detail}`,
        };
      }
      // Everything else — including every socket-class code and every code this adapter has
      // never seen — happened at a point where acceptance cannot be ruled out. Refuse to
      // guess. `resolveSend` turns this into the existing UNCERTAIN path, which parks the case
      // for a person and never auto-retries. A false uncertainty costs an operator a decision;
      // a false certainty costs the customer a duplicate.
      return {
        kind: 'OUTCOME_UNKNOWN',
        reason: `SMTP send failed in a phase where acceptance cannot be ruled out${err?.code === undefined ? '' : ` (${err.code})`}: ${detail}`,
      };
    }
  }

  /**
   * A local capture server exposes no per-message delivery-status query that would let this
   * adapter narrow an OUTCOME_UNKNOWN honestly. Rather than invent certainty, this throws —
   * `resolveVerify` turns that into `UNAVAILABLE`, leaving the prior uncertainty exactly as
   * unresolved as it genuinely is. Identical discipline to `AlwaysSucceedsSimulatedExecutor`.
   */
  async attemptVerify(request: VerifyRequest): Promise<VerifyOutcome> {
    throw new AttemptUnavailableError(
      request.attemptId,
      'The local SMTP capture server offers no authoritative per-message delivery-status query, so an uncertain send cannot be independently verified from here.',
    );
  }
}
