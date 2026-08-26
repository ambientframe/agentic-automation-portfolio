import path from 'node:path';
import {
  FileExecutionJournal,
  type ExecutionJournalReader,
  type ExecutionJournalRecorder,
} from '@/lib/persistence/execution-journal-store';
import {
  FileObservationIntentStore,
  type ObservationIntentStore,
} from '@/lib/persistence/observation-intent-store';
import { withObservationIntegrity } from './observation-integrity';

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

/**
 * A SIBLING DIRECTORY, not a subdirectory of the journal — deliberately. The whole purpose of
 * the marker ledger is to remain writable when the journal is not, so a fault that takes out
 * the journal directory (permissions, a full volume, a path that is no longer a directory) has
 * a genuine chance of leaving this one intact and therefore able to record that a write was
 * lost. Nesting it inside the journal would guarantee the accounting failed in lockstep with
 * the thing it accounts for, which is the one arrangement that cannot work.
 */
export const LEAD_RESCUE_OBSERVATION_INTENT_DIR = path.join(
  process.cwd(),
  '.data',
  'lead-rescue-observation-intents',
);

const leadRescueJournal = new FileExecutionJournal(LEAD_RESCUE_JOURNAL_DIR);

/** Durable write-ahead accounting for every observation this runtime attempts. */
export const leadRescueObservationIntents: ObservationIntentStore = new FileObservationIntentStore(
  LEAD_RESCUE_OBSERVATION_INTENT_DIR,
);

/**
 * The write side. Passed to engine boundaries; cannot read anything back.
 *
 * Wrapped so a dropped observation becomes a durable, inspectable fact rather than a silent
 * gap. The wrapper returns the journal's own outcome verbatim and cannot throw, so nothing
 * about the "observability never blocks business work" guarantee changes here — see
 * `withObservationIntegrity`.
 */
export const leadRescueJournalRecorder: ExecutionJournalRecorder = withObservationIntegrity(
  leadRescueJournal,
  leadRescueObservationIntents,
);

/** The query side. Reachable only from the read-only operator surface. */
export const leadRescueJournalReader: ExecutionJournalReader = leadRescueJournal;
