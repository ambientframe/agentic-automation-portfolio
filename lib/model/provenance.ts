import { z } from 'zod';

/**
 * PROVENANCE AND VERIFICATION ARE TWO INDEPENDENT DIMENSIONS.
 *
 * `ProvenanceType` answers: what KIND of claim is this?
 * `VerificationStatus` answers: how well is an external claim SUPPORTED right now?
 *
 * Conflating them is the failure this module exists to prevent. An EVIDENCE claim
 * is not automatically true; it is merely a claim that asserts external support and
 * therefore owes the reader a source and a current verification state.
 *
 * NETWORK RESOLUTION IS NOT PART OF COMPILATION, TYPECHECK, OR TEST.
 * A `SourceRef` is inert data. Nothing in this codebase fetches a source URL at
 * build or test time. Verification is a human/agent research act whose *result* is
 * recorded here by hand. A green test suite therefore means "the ledger is
 * internally consistent", never "these sources were re-confirmed just now".
 */

// ---------------------------------------------------------------------------
// Provenance
// ---------------------------------------------------------------------------

export const PROVENANCE_TYPES = [
  /** Externally supported research, accepted domain practice, or authoritative documentation. */
  'EVIDENCE',
  /** A value that legitimately varies by organization, jurisdiction, channel, contract, or risk tolerance. */
  'CLIENT_POLICY',
  /** An engineering or quality acceptance target established for this portfolio. */
  'LAB_TARGET',
  /**
   * Invented data belonging to a fictional demonstration business.
   * Carries no external support and asserts none. Exists so that fictional company
   * facts can never be mistaken for researched benchmarks.
   */
  'FIXTURE',
] as const;

export const ProvenanceTypeSchema = z.enum(PROVENANCE_TYPES);
export type ProvenanceType = z.infer<typeof ProvenanceTypeSchema>;

/** Provenance types that assert external support and therefore require sources. */
export const EXTERNALLY_ASSERTED: readonly ProvenanceType[] = ['EVIDENCE'];

// ---------------------------------------------------------------------------
// Verification
// ---------------------------------------------------------------------------

export const VERIFICATION_STATUSES = [
  /** Located and read at the recorded `checkedOn` date; the claim is supported as stated. */
  'VERIFIED',
  /** Asserted from a named source family but not yet located and read. */
  'PENDING_VERIFICATION',
  /**
   * Located, but the support is materially weaker than the claim's common retelling:
   * small or non-random sample, vendor-affiliated research, contested, or badly aged.
   */
  'DISPUTED_OR_WEAK',
  /** A newer source or changed practice has replaced this claim. */
  'SUPERSEDED',
  /** Not an external claim; verification is not a meaningful question. */
  'NOT_APPLICABLE',
] as const;

export const VerificationStatusSchema = z.enum(VERIFICATION_STATUSES);
export type VerificationStatus = z.infer<typeof VerificationStatusSchema>;

/**
 * The ONLY status that may be presented to a visitor as settled external truth.
 * Everything else must render with its qualifier attached. See `evidenceDisplay`.
 */
export const SETTLED: VerificationStatus = 'VERIFIED';

// ---------------------------------------------------------------------------
// Sources
// ---------------------------------------------------------------------------

export const SourceRefSchema = z.strictObject({
  id: z.string().min(1),
  organization: z.string().min(1),
  title: z.string().min(1),
  /** Omitted when a claim is asserted from a source family whose exact document is not yet pinned. */
  url: z.url().optional(),
  /** Publication date as published, ISO-8601, whatever precision the source gives. */
  publishedOn: z.string().optional(),
  /** When a human/agent actually located and read this source. Absent means never read. */
  checkedOn: z.string().optional(),
  /**
   * What this source does NOT establish. Required, and required to be non-trivial:
   * the whole point of the ledger is that limitations travel with the claim.
   */
  limitations: z.string().min(1),
  /** True for primary research, official/government, or standards-body sources. */
  primary: z.boolean(),
});

export type SourceRef = z.infer<typeof SourceRefSchema>;

// ---------------------------------------------------------------------------
// Operating standards
// ---------------------------------------------------------------------------

export const OperatingStandardSchema = z
  .strictObject({
    id: z.string().min(1),
    /** The claim itself, stated so it could in principle be falsified. */
    statement: z.string().min(1),
    provenance: ProvenanceTypeSchema,
    verification: VerificationStatusSchema,
    /** Ledger source ids. Required for EVIDENCE, forbidden for everything else. */
    sourceIds: z.array(z.string().min(1)).default([]),
    /** What this standard actually causes the system to do. Prevents decorative claims. */
    appliesTo: z.string().min(1),
    /** Present when verification revealed something the common retelling gets wrong. */
    correction: z.string().optional(),
  })
  .superRefine((standard, ctx) => {
    const asserted = EXTERNALLY_ASSERTED.includes(standard.provenance);

    if (asserted) {
      if (standard.sourceIds.length === 0) {
        ctx.addIssue({
          code: 'custom',
          message: `EVIDENCE standard "${standard.id}" must cite at least one source. An uncited evidence claim is a fabricated benchmark.`,
          path: ['sourceIds'],
        });
      }
      if (standard.verification === 'NOT_APPLICABLE') {
        ctx.addIssue({
          code: 'custom',
          message: `EVIDENCE standard "${standard.id}" must carry a real verification status, not NOT_APPLICABLE.`,
          path: ['verification'],
        });
      }
    } else {
      if (standard.sourceIds.length > 0) {
        ctx.addIssue({
          code: 'custom',
          message: `Standard "${standard.id}" has provenance ${standard.provenance} but cites sources. Citing sources on a non-EVIDENCE standard implies external support it does not claim; promote it to EVIDENCE or drop the sources.`,
          path: ['sourceIds'],
        });
      }
      if (standard.verification !== 'NOT_APPLICABLE') {
        ctx.addIssue({
          code: 'custom',
          message: `Standard "${standard.id}" has provenance ${standard.provenance}, which is not an external claim, so verification must be NOT_APPLICABLE.`,
          path: ['verification'],
        });
      }
    }
  });

export type OperatingStandard = z.infer<typeof OperatingStandardSchema>;

// ---------------------------------------------------------------------------
// Display rules
// ---------------------------------------------------------------------------

/**
 * How a standard is allowed to be shown to a visitor.
 *
 * `qualifier` is non-null for every claim that is NOT settled external truth. Any
 * renderer that shows an EVIDENCE statement MUST also show the qualifier when present.
 * This is asserted in `tests/provenance.test.ts` — it is the mechanism that keeps
 * `PENDING_VERIFICATION` from reading like established industry fact.
 */
export interface EvidenceDisplay {
  readonly label: string;
  readonly qualifier: string | null;
  /** Safe to state as external fact without further hedging. */
  readonly settled: boolean;
}

const QUALIFIERS: Record<VerificationStatus, string | null> = {
  VERIFIED: null,
  PENDING_VERIFICATION: 'Asserted from a named source family; not yet located and read. Not established fact.',
  DISPUTED_OR_WEAK: 'Located, but materially weaker than its common retelling. Treated as directional only.',
  SUPERSEDED: 'Superseded by newer sources or changed practice. Retained for history.',
  NOT_APPLICABLE: null,
};

const LABELS: Record<ProvenanceType, string> = {
  EVIDENCE: 'Evidence',
  CLIENT_POLICY: 'Client policy',
  LAB_TARGET: 'Lab target',
  FIXTURE: 'Fixture (fictional)',
};

export function evidenceDisplay(standard: OperatingStandard): EvidenceDisplay {
  const qualifier = QUALIFIERS[standard.verification];
  return {
    label: LABELS[standard.provenance],
    qualifier,
    settled: standard.provenance === 'EVIDENCE' && standard.verification === SETTLED,
  };
}

/**
 * True only for claims that may be stated to a visitor as external fact.
 * Deliberately false for CLIENT_POLICY, LAB_TARGET, and FIXTURE: those are true
 * *of this portfolio or this fictional business*, never true *of the industry*.
 */
export function isSettledEvidence(standard: OperatingStandard): boolean {
  return evidenceDisplay(standard).settled;
}
