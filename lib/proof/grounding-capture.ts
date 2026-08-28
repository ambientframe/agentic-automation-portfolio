import { createHash } from 'node:crypto';

/**
 * RETAINED GROUNDING CAPTURES — the shared vocabulary between the capture script and the test
 * that guards what it wrote.
 *
 * `COMMERCIAL_THESIS.md` §6 requires a demonstration profile to be grounded in how its industry
 * actually operates. The register enforced that by counting citations and measuring a sentence,
 * which checks neither that a URL resolves nor that the page says anything. A capture closes the
 * half that can be closed.
 *
 * THE EPISTEMIC BOUNDARY, STATED ONCE AND HONOURED EVERYWHERE BELOW.
 *
 * A capture proves: this URL resolved, at this time, with this status, and this verbatim string
 * was present in the text retrieved from it.
 *
 * A capture does NOT prove: that our reading of that string is correct. The `establishes` field
 * on a grounding source is interpretation, and no artifact can validate an interpretation. What
 * the capture buys is INSPECTABILITY — the claim, the source, the exact material the claim rests
 * on, and the moment that material was observed are all visible together, so a reader can
 * disagree with the reading without having to doubt the retrieval.
 *
 * `claimSha256` exists for the one failure a capture can otherwise hide: a claim edited AFTER
 * the material was captured. The retained excerpt would still be genuine and would no longer be
 * the excerpt the claim rests on. Fingerprinting the claim makes that drift fail loudly instead
 * of silently.
 */

export const GROUNDING_CAPTURE_PATH = 'docs/evidence/grounding-captures.json';

/** Characters of surrounding text retained either side of the quote, so it can be read in situ. */
export const CONTEXT_RADIUS = 320;

export interface GroundingCaptureEntry {
  readonly profileId: string;
  /** The URL as cited in the register. */
  readonly url: string;
  /**
   * How the text was obtained. `pdf` means the bytes were parsed as a document rather than
   * tag-stripped as markup.
   *
   * This field exists because the HTML path did something worse than fail on a PDF: it ran the
   * raw object stream through the tag stripper and produced tens of thousands of characters of
   * binary, in which a short quote can COINCIDENTALLY match. That is a false positive inside an
   * integrity check — a capture that looks valid and proves nothing. Recording how the text was
   * obtained makes the two paths distinguishable after the fact.
   */
  readonly contentKind: 'html' | 'pdf';
  /** Where the request actually ended up. A redirect is not a discrepancy, but it is a fact. */
  readonly finalUrl: string;
  readonly httpStatus: number;
  readonly capturedAt: string;
  /** SHA-256 of the extracted text, so a later re-capture can tell whether the page moved. */
  readonly contentSha256: string;
  readonly contentLength: number;
  /** The verbatim excerpt the register declares this claim rests on. */
  readonly quote: string;
  /** Offset of the quote within the extracted text. */
  readonly quoteOffset: number;
  /** The quote surrounded by real neighbouring text, so a reader can judge it in context. */
  readonly context: string;
  /** Fingerprint of `establishes` at capture time. Detects a claim edited after capture. */
  readonly claimSha256: string;
}

export interface GroundingCaptureFile {
  readonly schemaVersion: 'grounding-capture-1';
  readonly capturedAt: string;
  readonly gitHead: string;
  readonly scopeStatement: string;
  readonly doesNotProve: readonly string[];
  readonly entries: readonly GroundingCaptureEntry[];
}

/**
 * Stable under incidental whitespace, sensitive to wording. Reflowing a claim across lines is
 * not a change of claim; altering a figure inside it is.
 */
export function claimFingerprint(establishes: string): string {
  return createHash('sha256').update(establishes.replace(/\s+/g, ' ').trim()).digest('hex');
}

/**
 * Named entities worth decoding by hand. Deliberately not exhaustive — the numeric branch in
 * `decodeEntities` covers everything else, and every character here has a numeric form a page
 * may equally well use.
 */
const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  nbsp: ' ',
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  rsquo: '’',
  lsquo: '‘',
  ldquo: '“',
  rdquo: '”',
  mdash: '—',
  ndash: '–',
  hellip: '…',
  sect: '§',
  para: '¶',
  middot: '·',
  bull: '•',
  deg: '°',
  pound: '£',
  euro: '€',
  cent: '¢',
  copy: '©',
  reg: '®',
  trade: '™',
  times: '×',
  minus: '−',
  frac12: '½',
  eacute: 'é',
  uuml: 'ü',
};

/**
 * Decodes character references.
 *
 * The numeric branch exists because of a real miss. This started as a hand-written list of
 * fourteen NAMED entities and nothing else, and two independently authored profiles hit it: four
 * faithfully transcribed quotes failed capture because their pages served `&#8211;`, `&#8217;`,
 * `&#8220;` and `&sect;` rather than the named forms. The quotes were correct and the extractor
 * was wrong, which is the worst way for an integrity gate to fail — it accuses the citation.
 */
function decodeEntities(input: string): string {
  return input
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => safeFromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => safeFromCodePoint(parseInt(dec, 10)))
    .replace(/&([a-z][a-z0-9]*);/gi, (whole, name: string) => NAMED_ENTITIES[name.toLowerCase()] ?? whole);
}

function safeFromCodePoint(code: number): string {
  if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return '';
  try {
    return String.fromCodePoint(code);
  } catch {
    return '';
  }
}

/** Strips markup to the visible text a quote would have been read from. */
export function extractText(html: string): string {
  const withoutScripts = html.replace(/<(script|style|noscript)[^>]*>[\s\S]*?<\/\1>/gi, ' ');
  const withoutTags = withoutScripts.replace(/<[^>]+>/g, ' ');
  return decodeEntities(withoutTags).replace(/\s+/g, ' ').trim();
}
