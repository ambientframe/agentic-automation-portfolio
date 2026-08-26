import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  JOURNAL_EVENT_TYPES,
  JOURNAL_MECHANISMS,
  OBSERVABLE_OUTCOMES,
} from '@/lib/persistence/execution-journal-store';

/**
 * FALSIFYING TESTS for the RETAINED execution-journal runtime evidence.
 *
 * `tests/execution-journal.test.ts` proves the journal's logic. This file guards the artifact
 * `scripts/execution-journal-proof.ts` produced from a real run, and it is written to fail if
 * that artifact ever drifts from what actually happened — including by being hand-edited into
 * something more impressive than the run it describes.
 *
 * The single most important assertion here is 6: the count a genuinely separate process read
 * back off disk must equal the count the running server reported. If those two ever disagree,
 * the durability claim is false and this package has not earned its proof.
 */

const EVIDENCE_PATH = 'n8n/evidence/lead-rescue-execution-journal.json';

interface Summarised {
  readonly type: string;
  readonly outcome: string;
  readonly mechanism: string | null;
  readonly executionMode: string | null;
  readonly actorId: string | null;
  readonly operationClaimId: string | null;
  readonly failureClass: string | null;
  readonly revision: number | null;
  readonly recordedAt: string;
}

const ARTIFACT = JSON.parse(readFileSync(path.join(process.cwd(), EVIDENCE_PATH), 'utf8')) as Record<string, never>;

function at<T>(pathExpr: string): T {
  return pathExpr.split('.').reduce<unknown>((acc, key) => (acc as Record<string, unknown>)[key], ARTIFACT) as T;
}

const SEQUENCE = at<Summarised[]>('automaticEmission.capturedFacts.sequence');

/** Every string anywhere in the artifact, with the path that produced it. */
function walkStrings(value: unknown, keyPath = '$'): Array<[string, string]> {
  if (typeof value === 'string') return [[keyPath, value]];
  if (Array.isArray(value)) return value.flatMap((v, i) => walkStrings(v, `${keyPath}[${i}]`));
  if (typeof value === 'object' && value !== null) {
    return Object.entries(value).flatMap(([k, v]) => walkStrings(v, `${keyPath}.${k}`));
  }
  return [];
}

const ALL_STRINGS = walkStrings(ARTIFACT);

describe('retained execution-journal evidence', () => {
  it('1. the artifact is present, well-formed, and declares its own schema version', () => {
    expect(at<string>('schemaVersion')).toBe('lead-rescue-execution-journal-evidence-1');
    expect(Date.parse(at<string>('capturedAt'))).not.toBeNaN();
    expect(SEQUENCE.length).toBeGreaterThan(0);
  });

  it('2. gitHead names a commit that genuinely exists in this repository', () => {
    const head = at<string>('gitHead');
    expect(head).toMatch(/^[0-9a-f]{40}$/);
    // Throws if the object is unknown here — a fabricated sha cannot pass.
    const type = execFileSync('git', ['cat-file', '-t', head], { encoding: 'utf8' }).trim();
    expect(type).toBe('commit');
  });

  it('3. the environment claims no external provider, and the recorded events corroborate it', () => {
    expect(at<boolean>('environment.anthropicCalled')).toBe(false);
    expect(at<boolean>('environment.smtpUsed')).toBe(false);
    expect(at<boolean>('environment.n8nParticipated')).toBe(false);
    expect(at<boolean>('environment.syntheticData')).toBe(true);

    // The claim is checked against the data rather than trusted: a LIVE execution mode
    // anywhere would contradict "no SMTP was used".
    for (const event of SEQUENCE) {
      expect(event.executionMode === null || event.executionMode === 'SIMULATED').toBe(true);
    }
  });

  it('4. the run proves more than a happy path — a duplicate, a refusal AND an execution', () => {
    const outcomes = SEQUENCE.map((e) => e.outcome);
    expect(outcomes, 'no duplicate suppression was observed').toContain('SUPPRESSED_DUPLICATE');
    expect(outcomes, 'no refusal was observed').toContain('REFUSED');
    expect(outcomes, 'no execution was observed').toContain('EXECUTED');
  });

  it('5. every recorded token belongs to the real vocabulary — none can be invented after the fact', () => {
    for (const event of SEQUENCE) {
      expect(JOURNAL_EVENT_TYPES).toContain(event.type);
      expect(OBSERVABLE_OUTCOMES).toContain(event.outcome);
      if (event.mechanism !== null) expect(JOURNAL_MECHANISMS).toContain(event.mechanism);
      expect(Date.parse(event.recordedAt)).not.toBeNaN();
    }
  });

  it('6. a separate process read back exactly what the running server reported — the durability claim', () => {
    const recorded = at<number>('automaticEmission.capturedFacts.eventsRecorded');
    const serverCount = at<number>('query.capturedFacts.countReportedByServer');
    const readBack = at<number>('reconstruction.capturedFacts.countReadBack');
    const byCorrelation = at<number>('reconstruction.capturedFacts.countByCorrelation');

    expect(SEQUENCE).toHaveLength(recorded);
    expect(readBack, 'the reconstructed reader disagreed with the running server').toBe(serverCount);
    expect(byCorrelation, 'querying by correlation found a different history than by incident').toBe(readBack);
    expect(at<boolean>('reconstruction.derivedAssertions.matchesServerQuery')).toBe(true);
    expect(at<boolean>('query.capturedFacts.empty')).toBe(false);
  });

  it('7. the history is chronologically coherent as retained', () => {
    const times = SEQUENCE.map((e) => Date.parse(e.recordedAt));
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });

  it('8. an EXECUTED observation names the operation claim that governed it', () => {
    const executed = SEQUENCE.filter((e) => e.outcome === 'EXECUTED');
    expect(executed.length).toBeGreaterThan(0);
    for (const event of executed) {
      expect(event.operationClaimId, 'an execution was recorded with no governing claim identity').toBeTruthy();
      expect(event.actorId, 'an execution was recorded with no executor identity').toBeTruthy();
      expect(event.executionMode, 'an execution was recorded with no declared mode').toBeTruthy();
    }
  });

  it('9. no secrets, credentials, message bodies, or routable addresses are retained', () => {
    for (const [keyPath, value] of ALL_STRINGS) {
      expect(value, `value at ${keyPath} looks like a credential`).not.toMatch(/^Bearer\s|sk-[A-Za-z0-9-]{10,}|xox[baprs]-/);
      // Requires a dotted domain after the `@`, so a claim identity like
      // `offer:…:2026-08-26T06:42:38.135Z@rev1` is not mistaken for an address.
      const email = value.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
      if (email !== null) {
        expect(email[0], `value at ${keyPath} contains a potentially routable address`).toMatch(/\.(invalid|example)$/);
      }
    }
    for (const [keyPath] of ALL_STRINGS) {
      expect(keyPath, `${keyPath} looks like retained reasoning or a payload`).not.toMatch(
        /\.(reasoning|chainOfThought|thinking|prompt|completion|messageBody|body|payload)(\.|\[|$)/i,
      );
    }
  });

  it('10. the artifact never claims a maturity the run did not establish', () => {
    const FORBIDDEN = [
      'distributed tracing',
      'production telemetry',
      'lossless',
      'exactly-once',
      'client deployment',
      'in production',
      'real customer',
    ];
    /**
     * A forbidden phrase is permitted in exactly one place: the artifact's own `doesNotProve`
     * list, which exists to deny these claims. Testing "is it negated?" by looking for a
     * nearby "no"/"not" is the fragile version of this rule — "Nothing here ran on a hosted or
     * client deployment" is a denial that no such prefix match would recognise. Location is
     * the reliable signal, so the denial list is excised and the remainder must be clean.
     */
    const denials = at<string[]>('doesNotProve');
    const claims = { ...ARTIFACT, doesNotProve: [] };
    const haystack = JSON.stringify(claims).toLowerCase();
    for (const phrase of FORBIDDEN) {
      expect(haystack.includes(phrase), `the artifact claims "${phrase}" outside its denial list`).toBe(false);
    }
    expect(denials.length).toBeGreaterThanOrEqual(3);
  });

  it('11. the artifact states plainly that the script wrote no journal records itself', () => {
    expect(at<string>('environment.journalWrittenBy')).toContain('server process');
    expect(at<string>('environment.journalReadBackBy')).toContain('separate OS process');
    expect(at<string>('environment.note').toLowerCase()).toContain('no manual journal write');
    expect(at<boolean>('environment.httpHopExercised')).toBe(true);
  });
});
