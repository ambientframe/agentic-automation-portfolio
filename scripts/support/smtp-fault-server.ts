import net from 'node:net';

/**
 * A REAL, DELIBERATELY FAULTY SMTP SERVER — proof infrastructure, never application code.
 *
 * WHY THIS EXISTS. Two of the outcomes the execution boundary declares — `FAILED_BEFORE_EFFECT`
 * and `OUTCOME_UNKNOWN` — had only ever been produced by tests. A retained capture that showed
 * zero of each could not honestly claim the system understands them, and inserting them into an
 * artifact by hand would have been a fixture wearing an evidence label. Producing them for real
 * requires a server that misbehaves on purpose, which no third-party mail server will do to
 * order. So this speaks genuine SMTP over a genuine TCP socket and fails in three specific,
 * scripted ways.
 *
 * WHAT MAKES IT AN INDEPENDENT OBSERVER, and what does not. It is a separate listener with its
 * own state, recording what it actually received and what it actually stored — facts the
 * application cannot see and does not supply. That is what lets "nothing was sent" be checked
 * against something other than the sender's own opinion. It is NOT a third-party product, and
 * an artifact resting on it must say so: `n8n/evidence/lead-rescue-smtp-execution.json` remains
 * the capture where a real Mailpit instance issued the receipt.
 *
 * THE THREE FAULTS, each chosen because it produces a genuinely different epistemic situation:
 *
 *   ACCEPT              the ordinary path. Present so the capture contains a success from the
 *                       same server, and a failure therefore cannot be an artifact of the
 *                       harness being broken.
 *   REFUSE_ENVELOPE     a 550 at RCPT TO. The message is never offered, never received, never
 *                       stored — non-execution the server can independently confirm.
 *   ACCEPT_THEN_VANISH  the body is received in full and stored, then the socket is destroyed
 *                       before the acceptance reply. The server HAS the message; the client
 *                       cannot possibly know that. Genuine at-least-once ambiguity.
 *   HANG_AFTER_DATA     the body is received in full and stored, and the connection is simply
 *                       held open. Nothing is ever answered. Used to hold a caller inside its
 *                       send while its process is killed, so the durable claim it already took
 *                       is left unconfirmed exactly as a crash would leave it.
 *
 * NOTHING LEAVES THIS MACHINE: it binds to 127.0.0.1, has no relay, no upstream, and no
 * delivery mechanism of any kind. A "stored" message is an entry in an in-memory array.
 */

export type FaultMode = 'ACCEPT' | 'REFUSE_ENVELOPE' | 'ACCEPT_THEN_VANISH' | 'HANG_AFTER_DATA';

export interface ConnectionTranscript {
  readonly connection: number;
  readonly mode: FaultMode;
  /** Bytes of message body the server genuinely received. Zero when the envelope was refused. */
  readonly bodyBytesReceived: number;
  /** The server's own id, issued only when it both accepted AND acknowledged. */
  readonly storedMessageId: string | null;
  /** Whether the server ever told the client the outcome. The heart of the ambiguity cases. */
  readonly acknowledgedToClient: boolean;
  readonly note: string;
}

const NOTES: Record<FaultMode, string> = {
  ACCEPT: 'Envelope accepted, body received in full, acceptance acknowledged with a server-issued id.',
  REFUSE_ENVELOPE:
    'Recipient refused with 550 at RCPT TO. No DATA was ever requested, so no message body reached this server and nothing was stored. Non-execution is confirmed by the receiver, not inferred by the sender.',
  ACCEPT_THEN_VANISH:
    'Body received in full and stored, then the socket was destroyed before any acceptance reply. This server holds the message; the client cannot know that.',
  HANG_AFTER_DATA:
    'Body received in full and stored, then the connection was held open indefinitely with no reply, so the caller remains inside its send with its durable claim already taken.',
};

export class SmtpFaultServer {
  private readonly server: net.Server;
  private readonly script: FaultMode[];
  private readonly transcripts: ConnectionTranscript[] = [];
  private readonly held: net.Socket[] = [];
  private connections = 0;
  private port = 0;
  /** Resolvers waiting for "the body of connection N has been received", for precise timing. */
  private readonly bodyWaiters = new Map<number, () => void>();

  constructor(script: readonly FaultMode[]) {
    this.script = [...script];
    this.server = net.createServer((socket) => this.handle(socket));
  }

  async listen(): Promise<number> {
    await new Promise<void>((resolve) => this.server.listen(0, '127.0.0.1', resolve));
    const address = this.server.address();
    if (address === null || typeof address === 'string') throw new Error('the fault server did not bind a TCP port');
    this.port = address.port;
    return this.port;
  }

  async close(): Promise<void> {
    for (const socket of this.held) socket.destroy();
    await new Promise<void>((resolve) => this.server.close(() => resolve()));
  }

  get connectionCount(): number {
    return this.connections;
  }

  get storedMessageCount(): number {
    return this.transcripts.filter((entry) => entry.storedMessageId !== null).length;
  }

  transcript(): readonly ConnectionTranscript[] {
    return [...this.transcripts];
  }

  /** Resolves once connection `n` has received its complete message body. */
  bodyReceived(connection: number): Promise<void> {
    return new Promise<void>((resolve) => {
      if (this.transcripts.some((entry) => entry.connection === connection && entry.bodyBytesReceived > 0)) {
        resolve();
        return;
      }
      this.bodyWaiters.set(connection, resolve);
    });
  }

  private record(entry: ConnectionTranscript): void {
    this.transcripts.push(entry);
    const waiter = this.bodyWaiters.get(entry.connection);
    if (waiter !== undefined) {
      this.bodyWaiters.delete(entry.connection);
      waiter();
    }
  }

  private handle(socket: net.Socket): void {
    this.connections += 1;
    const connection = this.connections;
    const mode: FaultMode = this.script[connection - 1] ?? 'ACCEPT';

    let inData = false;
    let body = '';
    let buffer = '';

    const write = (line: string) => socket.write(`${line}\r\n`);
    write('220 127.0.0.1 ESMTP fault-server');

    socket.on('data', (chunk) => {
      const text = chunk.toString('utf8');

      if (inData) {
        body += text;
        // The SMTP end-of-data sentinel. Only then has the server genuinely received it all.
        if (!body.includes('\r\n.\r\n')) return;
        inData = false;
        const bodyBytesReceived = Buffer.byteLength(body.slice(0, body.indexOf('\r\n.\r\n')), 'utf8');

        if (mode === 'ACCEPT_THEN_VANISH') {
          this.record({
            connection,
            mode,
            bodyBytesReceived,
            storedMessageId: `fault-${connection}@example.invalid`,
            acknowledgedToClient: false,
            note: NOTES[mode],
          });
          socket.destroy();
          return;
        }
        if (mode === 'HANG_AFTER_DATA') {
          this.held.push(socket);
          this.record({
            connection,
            mode,
            bodyBytesReceived,
            storedMessageId: `fault-${connection}@example.invalid`,
            acknowledgedToClient: false,
            note: NOTES[mode],
          });
          return;
        }
        this.record({
          connection,
          mode,
          bodyBytesReceived,
          storedMessageId: `fault-${connection}@example.invalid`,
          acknowledgedToClient: true,
          note: NOTES[mode],
        });
        write(`250 2.0.0 Ok: queued as fault-${connection}`);
        return;
      }

      buffer += text;
      let index = buffer.indexOf('\r\n');
      while (index !== -1) {
        const line = buffer.slice(0, index);
        buffer = buffer.slice(index + 2);
        const verb = line.split(' ')[0]?.toUpperCase() ?? '';

        if (verb === 'EHLO') {
          write('250-127.0.0.1 fault-server');
          write('250 SIZE 10485760');
        } else if (verb === 'HELO') {
          write('250 127.0.0.1 fault-server');
        } else if (verb === 'MAIL') {
          write('250 2.1.0 Ok');
        } else if (verb === 'RCPT') {
          if (mode === 'REFUSE_ENVELOPE') {
            this.record({
              connection,
              mode,
              bodyBytesReceived: 0,
              storedMessageId: null,
              acknowledgedToClient: true,
              note: NOTES[mode],
            });
            write('550 5.1.1 Recipient refused by this server for the purposes of this proof');
          } else {
            write('250 2.1.5 Ok');
          }
        } else if (verb === 'DATA') {
          inData = true;
          write('354 End data with <CR><LF>.<CR><LF>');
          return;
        } else if (verb === 'QUIT') {
          write('221 2.0.0 Bye');
          socket.end();
          return;
        } else if (verb === 'RSET') {
          write('250 2.0.0 Ok');
        } else {
          write('250 2.0.0 Ok');
        }
        index = buffer.indexOf('\r\n');
      }
    });

    socket.on('error', () => {
      /* A client that vanishes mid-conversation is an expected outcome here, not a fault. */
    });
  }
}
