import { describe, expect, it } from 'vitest';
import { ALL_SYSTEMS } from '@/data/systems';
import { KESTREL } from '@/data/profiles/kestrel/profile';
import { SOURCES, hasBeenRead, sourceById } from '@/data/research/sources';
import {
  OperatingStandardSchema,
  evidenceDisplay,
  isSettledEvidence,
} from '@/lib/model/provenance';

describe('provenance and verification are independent dimensions', () => {
  it('rejects an EVIDENCE standard with no source, because that is a fabricated benchmark', () => {
    const result = OperatingStandardSchema.safeParse({
      id: 'bad',
      statement: 'Responding within five minutes increases conversion by 391%.',
      provenance: 'EVIDENCE',
      verification: 'VERIFIED',
      sourceIds: [],
      appliesTo: 'nothing',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain('fabricated benchmark');
    }
  });

  it('rejects an EVIDENCE standard whose verification is NOT_APPLICABLE', () => {
    const result = OperatingStandardSchema.safeParse({
      id: 'bad',
      statement: 'Something externally supported.',
      provenance: 'EVIDENCE',
      verification: 'NOT_APPLICABLE',
      sourceIds: ['ftc-can-spam'],
      appliesTo: 'nothing',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a non-EVIDENCE standard that cites sources, which would imply support it does not claim', () => {
    const result = OperatingStandardSchema.safeParse({
      id: 'bad',
      statement: 'We acknowledge within five minutes.',
      provenance: 'CLIENT_POLICY',
      verification: 'NOT_APPLICABLE',
      sourceIds: ['ftc-can-spam'],
      appliesTo: 'nothing',
    });
    expect(result.success).toBe(false);
  });

  it('accepts an EVIDENCE standard that is cited but not yet verified', () => {
    const result = OperatingStandardSchema.safeParse({
      id: 'ok',
      statement: 'Something asserted from a named source family.',
      provenance: 'EVIDENCE',
      verification: 'PENDING_VERIFICATION',
      sourceIds: ['hbr-short-life-2011'],
      appliesTo: 'framing',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      // Cited but unread is a legitimate state — and must never read as settled.
      expect(isSettledEvidence(result.data)).toBe(false);
      expect(evidenceDisplay(result.data).qualifier).toContain('not yet located');
    }
  });
});

describe('display rules', () => {
  it('attaches a qualifier to every claim that is not settled external truth', () => {
    const all = [...ALL_SYSTEMS.flatMap((s) => s.standards), ...KESTREL.policies];

    for (const standard of all) {
      const display = evidenceDisplay(standard);
      if (display.settled) {
        expect(standard.provenance).toBe('EVIDENCE');
        expect(standard.verification).toBe('VERIFIED');
      } else if (standard.verification !== 'NOT_APPLICABLE') {
        expect(display.qualifier, `${standard.id} has no qualifier`).not.toBeNull();
      }
    }
  });

  it('never marks a client policy, lab target, or fixture as settled industry evidence', () => {
    const nonEvidence = [...ALL_SYSTEMS.flatMap((s) => s.standards), ...KESTREL.policies].filter(
      (s) => s.provenance !== 'EVIDENCE',
    );

    expect(nonEvidence.length).toBeGreaterThan(0);
    for (const standard of nonEvidence) {
      expect(isSettledEvidence(standard)).toBe(false);
    }
  });
});

describe('source ledger', () => {
  it('gives every source a substantive limitations note', () => {
    for (const source of SOURCES) {
      expect(source.limitations.length, `${source.id}`).toBeGreaterThan(60);
      expect(source.limitations.toLowerCase()).not.toBe('none');
    }
  });

  it('includes primary or authoritative sources', () => {
    expect(SOURCES.filter((s) => s.primary).length).toBeGreaterThanOrEqual(8);
  });

  it('marks an unread source as unread, and keeps claims citing only unread sources unverified', () => {
    const unread = SOURCES.filter((s) => !hasBeenRead(s));
    expect(unread.length, 'expected at least one honestly-unread source').toBeGreaterThan(0);

    const unreadIds = new Set(unread.map((s) => s.id));

    for (const system of ALL_SYSTEMS) {
      for (const standard of system.standards) {
        if (standard.provenance !== 'EVIDENCE' || standard.sourceIds.length === 0) continue;
        const allUnread = standard.sourceIds.every((id) => unreadIds.has(id));
        if (allUnread) {
          expect(
            standard.verification,
            `${standard.id} cites only unread sources but claims ${standard.verification}`,
          ).not.toBe('VERIFIED');
        }
      }
    }
  });

  it('records the lead-response misattribution rather than repeating it', () => {
    const lrm = sourceById('mit-insidesales-lrm-2007');
    expect(lrm).toBeDefined();
    expect(lrm?.limitations).toContain('misattributed');

    const standard = ALL_SYSTEMS.flatMap((s) => s.standards).find(
      (s) => s.id === 'lr-std-response-latency',
    );
    expect(standard?.verification).toBe('DISPUTED_OR_WEAK');
    expect(standard?.correction).toContain('NOT from the 2011 Harvard Business Review');
  });

  it('scopes the FDCPA claim correctly instead of overclaiming a legal basis', () => {
    const standard = ALL_SYSTEMS.flatMap((s) => s.standards).find(
      (s) => s.id === 'rr-std-fdcpa-scope',
    );
    expect(standard).toBeDefined();
    expect(standard?.statement).toContain('does not govern a business collecting its own commercial invoices');
    expect(standard?.appliesTo).toContain('PREVENT a false claim');
  });

  it('never asserts a number in a standard whose source was not read', () => {
    const pending = ALL_SYSTEMS.flatMap((s) => s.standards).filter(
      (s) => s.verification === 'PENDING_VERIFICATION',
    );
    expect(pending.length).toBeGreaterThan(0);

    for (const standard of pending) {
      // A pending claim that quotes a statistic is exactly the failure mode to avoid.
      expect(standard.statement, `${standard.id} states a figure it has not verified`).not.toMatch(
        /\d+\s*(%|percent|x\b|times|hours|minutes)/i,
      );
    }
  });
});
