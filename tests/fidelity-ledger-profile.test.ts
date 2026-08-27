import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { deriveFidelityLedger } from '@/lib/proof/fidelity-ledger';
import { KESTREL } from '@/data/profiles/kestrel/profile';
import { MERIDIAN } from '@/data/profiles/meridian/profile';
import { numberParam, type BusinessProfile } from '@/lib/model/profile';
import type { EvaluationEvidence, RuntimeEvidence } from '@/lib/proof/n8n-evidence';

/**
 * THE LEDGER MUST DESCRIBE THE BUSINESS IT IS RENDERING.
 *
 * `deriveFidelityLedger` read two thresholds — the confidence floor and the review window —
 * off the `KESTREL` import directly, and printed them into the prose a visitor reads. That was
 * invisible while one profile existed. It stops being invisible the moment a second one does:
 * the ledger would have gone on quoting Kestrel's 0.70 floor while depicting a firm whose
 * policy says 0.85, which is a fabricated claim about a stated policy rather than a cosmetic
 * mismatch.
 *
 * The profile is therefore a REQUIRED input. A default would rebuild the same bug with a
 * friendlier signature: every caller must say whose numbers these are.
 */

const ABSENT: RuntimeEvidence = { kind: 'ABSENT', detail: 'no capture in this build' };
const NO_EVAL: EvaluationEvidence = { kind: 'ABSENT', detail: 'no capture in this build' };

function proseOf(profile: BusinessProfile): string {
  const ledger = deriveFidelityLedger({
    evidence: ABSENT,
    evaluation: NO_EVAL,
    env: {},
    profile,
  });
  return ledger.rows.map((r) => `${r.whatIsTrue} ${r.limit}`).join(' \n');
}

describe('the fidelity ledger quotes the profile it was given', () => {
  it('prints the confidence floor of the profile passed in', () => {
    const floor = numberParam(MERIDIAN, 'confidenceFloor');
    expect(
      proseOf(MERIDIAN),
      `the ledger should quote Meridian's ${floor} floor when rendering Meridian`,
    ).toContain(String(floor));
  });

  it('prints the review window of the profile passed in', () => {
    const window = numberParam(MERIDIAN, 'humanReviewTimeoutHours');
    expect(proseOf(MERIDIAN)).toContain(`${window}-hour review timeout`);
  });

  it('does not quote the other profile’s thresholds when rendering one', () => {
    const kestrelFloor = numberParam(KESTREL, 'confidenceFloor');
    const meridianFloor = numberParam(MERIDIAN, 'confidenceFloor');
    expect(kestrelFloor, 'this test is vacuous unless the two disagree').not.toBe(meridianFloor);

    expect(
      proseOf(MERIDIAN),
      'a ledger depicting one firm while quoting another firm’s policy states a threshold nobody set',
    ).not.toContain(`${kestrelFloor} confidence floor`);
  });

  it('still renders Kestrel correctly', () => {
    const prose = proseOf(KESTREL);
    expect(prose).toContain(String(numberParam(KESTREL, 'confidenceFloor')));
    expect(prose).toContain(`${numberParam(KESTREL, 'humanReviewTimeoutHours')}-hour review timeout`);
  });
});

describe('the coupling cannot silently return', () => {
  it('does not import a profile directly', () => {
    const source = readFileSync(join(process.cwd(), 'lib', 'proof', 'fidelity-ledger.ts'), 'utf8');
    expect(
      source.includes('data/profiles'),
      'the ledger imports a profile by name again. Whichever business it then depicts, it will ' +
        'quote that one’s thresholds — take the profile as an input instead.',
    ).toBe(false);
  });
});
