import path from 'node:path';
import {
  FileExecutionJournal,
  type ExecutionJournalReader,
  type ExecutionJournalRecorder,
} from '@/lib/persistence/execution-journal-store';

/**
 * THE OBSERVABILITY COMPOSITION ROOT — deliberately outside `lib/engine/`.
 *
 * One `FileExecutionJournal` instance, exported through TWO separately-typed views. That is
 * the whole reason this module exists rather than the journal being constructed inside
 * `lib/engine/lead-rescue-wait-runtime.ts` alongside the other stores:
 *
 *   `leadRescueJournalRecorder` — write only. What the engine boundaries receive.
 *   `leadRescueJournalReader`   — read only. What the operator query route receives.
 *
 * Decision code is handed a value it is TYPE-INCAPABLE of reading history from, so "the
 * journal must never become an input to policy or authority" is enforced by the compiler at
 * every call site rather than by discipline. A structural test additionally scans
 * `lib/engine/**` and `lib/ports/**` and fails if any reader symbol appears there at all.
 *
 * A module-level singleton for the same reason `leadRescueWaitStore` is one: Next.js route
 * handlers are stateless functions invoked fresh per request and per server process, so no
 * durability can live in this module staying warm. It lives entirely in the directory on
 * disk — which is exactly what makes the reconstruction proof meaningful, since a genuinely
 * separate process constructing its own reader sees the same history.
 *
 * Gitignored (`.data/`) — runtime observability, never a fixture.
 */
export const LEAD_RESCUE_JOURNAL_DIR = path.join(process.cwd(), '.data', 'lead-rescue-execution-journal');

const leadRescueJournal = new FileExecutionJournal(LEAD_RESCUE_JOURNAL_DIR);

/** The write side. Passed to engine boundaries; cannot read anything back. */
export const leadRescueJournalRecorder: ExecutionJournalRecorder = leadRescueJournal;

/** The query side. Reachable only from the read-only operator surface. */
export const leadRescueJournalReader: ExecutionJournalReader = leadRescueJournal;
