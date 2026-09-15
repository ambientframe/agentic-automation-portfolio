import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  COPY_APPROVAL,
  ENGAGEMENT_ELEMENTS,
  ENGAGEMENT_NOT_CLAIMED,
  ENGAGEMENT_OFFER_NAME,
  OUTWARD_SENTENCES,
} from '@/lib/commercial/outward-copy';
import { MATURITY_PLAIN, maturityLegendEntries } from '@/lib/commercial/maturity-legend';
import { MATURITY_LEVELS } from '@/lib/model/system';
import { ALL_SYSTEMS } from '@/data/systems';

/**
 * EVERY OUTWARD SENTENCE IS EITHER A CHECKABLE ARTIFACT OR A LABEL.
 *
 * Commercial surfaces do not get a marketing exemption. A sentence with no backing is a
 * claim that requires a call to understand — the failure COMMERCIAL_COMPLETION_PATCH.md §3
 * exists to prevent. These tests run against the copy register itself, before rendering.
 */

const REPO = process.cwd();

describe('copy grade', () => {
  it('records the operator approval without changing any CD1 declaration', () => {
    expect(COPY_APPROVAL.status).toBe('OPERATOR_APPROVED');
    expect(COPY_APPROVAL.approvedOn).toBe('2026-09-15');
  });
});

describe('the outward-sentence register', () => {
  it('has a unique id for every sentence, so a dropped claim cannot hide behind a duplicate', () => {
    const ids = OUTWARD_SENTENCES.map((sentence) => sentence.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives every sentence non-empty text', () => {
    for (const sentence of OUTWARD_SENTENCES) {
      expect(sentence.text.trim().length, sentence.id).toBeGreaterThan(0);
    }
  });

  it('backs every sentence with a linked artifact or a label', () => {
    for (const sentence of OUTWARD_SENTENCES) {
      if (sentence.backing.kind === 'ARTIFACT') {
        expect(sentence.backing.path.trim().length, sentence.id).toBeGreaterThan(0);
        expect(sentence.backing.why.trim().length, sentence.id).toBeGreaterThan(0);
      } else {
        expect(['UNSET', 'NOT_CLAIMED', 'AWAITING_EVIDENCE', 'PROCESS', 'DIRECTION']).toContain(
          sentence.backing.label,
        );
      }
    }
  });

  it('links only artifacts that exist in this repository', () => {
    const paths = [
      ...new Set(
        OUTWARD_SENTENCES.flatMap((sentence) =>
          sentence.backing.kind === 'ARTIFACT' ? [sentence.backing.path] : [],
        ),
      ),
    ];
    expect(paths.length).toBeGreaterThan(0);
    for (const path of paths) {
      expect(existsSync(join(REPO, path)), `commercial copy links a missing file: ${path}`).toBe(true);
    }
  });

  it('does not invent CD1 values inside the copy register', () => {
    const blob = OUTWARD_SENTENCES.map((sentence) => sentence.text).join('\n').toLowerCase();
    for (const email of ['cmschafrath@gmail.com', 'christopherschafrath@gmail.com', 'christophrrrr@gmail.com']) {
      expect(blob).not.toContain(email);
    }
    expect(blob).not.toMatch(/\$\s*\d/);
    expect(blob).not.toContain('@');
  });

  it('does not speak as a team', () => {
    for (const sentence of OUTWARD_SENTENCES) {
      const withoutQuotedProhibition = sentence.text.replace(/[“”"'‘’]we[“”"'‘’]/gi, '');
      expect(withoutQuotedProhibition, sentence.id).not.toMatch(/\bwe\b/i);
    }
  });
});

describe('the engagement is a product, not some consulting', () => {
  it('names the Revenue Leak Audit', () => {
    expect(ENGAGEMENT_OFFER_NAME).toBe('Revenue Leak Audit');
  });

  it('states all eight concreteness elements', () => {
    expect(ENGAGEMENT_ELEMENTS).toHaveLength(8);
    const blob = ENGAGEMENT_ELEMENTS.map((element) => element.text).join('\n').toLowerCase();
    expect(blob).toMatch(/what goes in/);
    expect(blob).toMatch(/what is inspected/);
    expect(blob).toMatch(/boundaries/);
    expect(blob).toMatch(/what comes out/);
    expect(blob).toMatch(/shape/);
    expect(blob).toMatch(/excluded/);
    expect(blob).toMatch(/implementation included/);
    expect(blob).toMatch(/nothing worth building|does not leak enough/);
  });

  it('states the not-claimed list rather than papering the absences', () => {
    expect(ENGAGEMENT_NOT_CLAIMED.length).toBeGreaterThanOrEqual(8);
    for (const item of ENGAGEMENT_NOT_CLAIMED) {
      expect(item.backing).toEqual({ kind: 'LABEL', label: 'NOT_CLAIMED' });
    }
  });
});

describe('maturity legend', () => {
  it('defines every maturity level the model can emit, so a badge cannot appear without a sentence', () => {
    expect(Object.keys(MATURITY_PLAIN).sort()).toEqual([...MATURITY_LEVELS].sort());
    for (const level of MATURITY_LEVELS) {
      expect(MATURITY_PLAIN[level].trim().length).toBeGreaterThan(0);
    }
  });

  it('marks in-use from the systems register, never from a hardcoded subset', () => {
    const entries = maturityLegendEntries(ALL_SYSTEMS);
    const used = new Set(ALL_SYSTEMS.map((system) => system.maturity));
    for (const entry of entries) {
      expect(entry.inUse).toBe(used.has(entry.level));
    }
    expect(entries.some((entry) => entry.inUse)).toBe(true);
    expect(entries.some((entry) => !entry.inUse)).toBe(true);
  });
});
