import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { REGISTERED_PROFILES } from '@/data/profiles';
import {
  CONTEXT_RADIUS,
  GROUNDING_CAPTURE_PATH,
  claimFingerprint,
  extractText,
  type GroundingCaptureEntry,
  type GroundingCaptureFile,
} from '@/lib/proof/grounding-capture';

/**
 * CAPTURES THE MATERIAL EVERY GROUNDING CLAIM RESTS ON.
 *
 * Run deliberately, never by CI:
 *   npx tsx scripts/capture-grounding.ts
 *
 * For each grounding source in the register it fetches the URL, extracts the visible text, and
 * REFUSES TO WRITE A CAPTURE unless the source's declared verbatim quote is present in that
 * text. A fabricated citation therefore dies here — while a person is watching — instead of
 * living in the register looking plausible because it had a URL and a sentence.
 *
 * This is the only place in the repository that touches the live network on purpose. Everything
 * downstream reads the artifact it writes, so the test suite stays deterministic and offline.
 *
 * It proves retrieval, never interpretation. See `lib/proof/grounding-capture.ts`.
 */

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36';

interface Failure {
  readonly profileId: string;
  readonly url: string;
  readonly reason: string;
}

async function capture(
  profileId: string,
  url: string,
  quote: string,
  establishes: string,
): Promise<GroundingCaptureEntry | Failure> {
  let response: Response;
  try {
    response = await fetch(url, { headers: { 'user-agent': USER_AGENT, accept: 'text/html,*/*' }, redirect: 'follow' });
  } catch (error) {
    return { profileId, url, reason: `did not resolve: ${error instanceof Error ? error.message : String(error)}` };
  }

  if (!response.ok) {
    return { profileId, url, reason: `answered HTTP ${response.status}` };
  }

  const text = extractText(await response.text());
  const quoteOffset = text.indexOf(quote);
  if (quoteOffset < 0) {
    return {
      profileId,
      url,
      reason:
        'the declared quote does not appear in the retrieved text. Either the page changed, the ' +
        'extraction missed it, or the quote was never there — check by hand before adjusting it.',
    };
  }

  return {
    profileId,
    url,
    finalUrl: response.url,
    httpStatus: response.status,
    capturedAt: new Date().toISOString(),
    contentSha256: createHash('sha256').update(text).digest('hex'),
    contentLength: text.length,
    quote,
    quoteOffset,
    context: text.slice(Math.max(0, quoteOffset - CONTEXT_RADIUS), quoteOffset + quote.length + CONTEXT_RADIUS),
    claimSha256: claimFingerprint(establishes),
  };
}

function isFailure(value: GroundingCaptureEntry | Failure): value is Failure {
  return 'reason' in value;
}

async function main(): Promise<void> {
  const declared = REGISTERED_PROFILES.flatMap((entry) =>
    entry.groundingSources.map((source) => ({ profileId: entry.profile.id, source })),
  );

  if (declared.length === 0) {
    throw new Error('No grounding sources are registered. Nothing to capture.');
  }

  const results = await Promise.all(
    declared.map((d) => capture(d.profileId, d.source.url, d.source.quote, d.source.establishes)),
  );

  const failures = results.filter(isFailure);
  for (const failure of failures) {
    console.error(`FAILED  ${failure.profileId} → ${failure.url}\n        ${failure.reason}`);
  }
  if (failures.length > 0) {
    throw new Error(
      `${failures.length} of ${declared.length} sources could not be captured. Nothing was written: a ` +
        'partial capture file would report the register as better evidenced than it is.',
    );
  }

  const entries = results.filter((r): r is GroundingCaptureEntry => !isFailure(r));
  const file: GroundingCaptureFile = {
    schemaVersion: 'grounding-capture-1',
    capturedAt: new Date().toISOString(),
    gitHead: execSync('git rev-parse HEAD').toString().trim(),
    scopeStatement:
      'Each entry records that a cited URL resolved at the stated time with the stated status, and that the ' +
      'stated verbatim quote was present in the text retrieved from it. The surrounding context is retained so ' +
      'the quote can be read where it appeared rather than in isolation.',
    doesNotProve: [
      'It does not prove that the claim in `establishes` follows from the quoted material. That is interpretation, no artifact can validate it, and a reader is expected to judge it for themselves — which is what retaining the quote and its context is for.',
      'It does not prove the source is correct, authoritative, or independent. A published benchmark can be wrong, self-interested, or derived from another source; capturing it establishes only that it says what we say it says.',
      'It does not prove any claim about a fictional business in this repository. The sources describe industries. Every profile figure is a synthetic assumption calibrated against them, and no source verifies a figure attributed to a business that does not exist.',
      'It goes STALE and cannot tell you so. Each entry proves what a page said at its `capturedAt` moment. Pages are edited and removed; a capture that is a year old proves something about a year ago. Re-run this script to refresh it, and treat `contentSha256` changing as the page having moved under the claim.',
      'It does not prove the whole page was read, or that surrounding material does not contradict the quote. Only the quote and a bounded window around it are retained.',
    ],
    entries,
  };

  const path = join(process.cwd(), GROUNDING_CAPTURE_PATH);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(file, null, 2)}\n`, 'utf8');

  for (const entry of entries) {
    console.log(`ok  ${entry.profileId} → ${entry.url}  (HTTP ${entry.httpStatus}, quote @${entry.quoteOffset})`);
  }
  console.log(`\nwrote ${GROUNDING_CAPTURE_PATH} — ${entries.length} source(s)`);
}

main().catch((error) => {
  console.error(`\n${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
