import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import {
  CD1_SLOTS,
  COMMERCIAL_DECLARATION,
  declaredField,
  presentDeclaration,
  conversionMailto,
  unsetField,
  type CommercialDeclaration,
} from '@/lib/config/commercial-declaration';

/**
 * THE OFFER CANNOT BE HIRED IF THE SITE INVENTS THE PERSON, THE FEE, OR THE INBOX.
 *
 * `COMMERCIAL_COMPLETION_PATCH.md` reserves public name, engagement fee, contact address, and
 * public domain to CD1. Until that batch lands, the module carries explicit placeholders and
 * every surface must render a visible unset state. A silent default — especially to
 * `cmschafrath@gmail.com`, which appears in git history and on an unpublished storefront — is
 * the defect this file exists to make un-shippable.
 *
 * Same discipline as `lib/config/source-provenance.ts`: one declaration point, pure
 * presentation, drift-guarded. The live export is the operator-facing singleton; tests that
 * need a declared value construct one here rather than mutating the singleton.
 */

const REPO = process.cwd();
const DECLARATION = join('lib', 'config', 'commercial-declaration.ts');

const SILENT_EMAILS = [
  'cmschafrath@gmail.com',
  'christopherschafrath@gmail.com',
  'christophrrrr@gmail.com',
] as const;

const CODE_DIRECTORIES = ['app', 'components', 'lib', 'data', 'scripts'] as const;

function sourceFiles(directory: string): readonly string[] {
  const entries = readdirSync(join(REPO, directory));
  return entries.flatMap((entry) => {
    const relative = join(directory, entry);
    if (statSync(join(REPO, relative)).isDirectory()) return sourceFiles(relative);
    return /\.tsx?$/.test(entry) ? [relative] : [];
  });
}

function allCodeFiles(): readonly string[] {
  return CODE_DIRECTORIES.flatMap((directory) => sourceFiles(directory));
}

describe('CD1 slots', () => {
  it('names exactly the four operator-reserved values, and no extras that would invite invention', () => {
    expect([...CD1_SLOTS]).toEqual(['publicName', 'engagementFee', 'contactEmail', 'publicDomain']);
  });
});

describe('the live declaration — until CD1', () => {
  it('leaves every reserved slot UNSET, so a ship cannot quietly carry an invented value', () => {
    for (const slot of CD1_SLOTS) {
      expect(COMMERCIAL_DECLARATION[slot].status, `${slot} is not UNSET`).toBe('UNSET');
      expect(COMMERCIAL_DECLARATION[slot].slot).toBe(slot);
    }
  });

  it('gives each unset slot a non-empty visible label that names the slot rather than substituting a value', () => {
    for (const slot of CD1_SLOTS) {
      const field = COMMERCIAL_DECLARATION[slot];
      if (field.status !== 'UNSET') continue;
      expect(field.visibleLabel.trim().length).toBeGreaterThan(0);
      expect(field.visibleLabel).toMatch(/not yet declared/i);
    }
  });

  it('never presents a contact-shaped or fee-shaped string while unset', () => {
    const presented = presentDeclaration(COMMERCIAL_DECLARATION);
    expect(presented.fields.map((field) => field.slot)).toEqual([...CD1_SLOTS]);
    expect(presented.fields).toHaveLength(CD1_SLOTS.length);
    expect(presented.publicName).toEqual(presented.fields[0]);
    expect(presented.engagementFee).toEqual(presented.fields[1]);
    expect(presented.contactEmail).toEqual(presented.fields[2]);
    expect(presented.publicDomain).toEqual(presented.fields[3]);
    for (const field of presented.fields) {
      expect(field.status).toBe('UNSET');
      expect(field.display).toMatch(/not yet declared/i);
      expect(field.href).toBeNull();
      expect(field.unsetReason, `${field.slot} has no visible reason`).toMatch(/CD1/);
      expect(field.display).not.toMatch(/@/);
      expect(field.display).not.toMatch(/\$\s*\d/);
    }
  });

  it('does not emit a mailto while the contact address is unset — a mailto is an invented inbox', () => {
    expect(conversionMailto(COMMERCIAL_DECLARATION)).toBeNull();
  });

  it('does not smuggle a known private inbox into the live declaration object', () => {
    const serialised = JSON.stringify(COMMERCIAL_DECLARATION).toLowerCase();
    for (const email of SILENT_EMAILS) {
      expect(serialised, `live declaration contains ${email}`).not.toContain(email);
    }
  });
});

describe('declaredField — fail closed, because an empty declaration reads as a decision', () => {
  it('refuses a blank or whitespace-only value rather than rendering a hollow DECLARED', () => {
    for (const value of ['', '   ']) {
      expect(() => declaredField('publicName', value)).toThrow(/empty|blank|whitespace/i);
    }
  });

  it('refuses a DECLARED contact that is not an email, rather than publishing a mailto that goes nowhere', () => {
    for (const value of ['not-an-email', 'Christopher Schafrath', 'https://example.com']) {
      expect(() => declaredField('contactEmail', value)).toThrow(/email/i);
    }
  });

  it('accepts an explicit email and presents a mailto — only on this constructed path, not the live singleton', () => {
    const declaration: CommercialDeclaration = {
      ...COMMERCIAL_DECLARATION,
      contactEmail: declaredField('contactEmail', 'operator@example.invalid'),
      publicName: declaredField('publicName', 'Example Operator'),
    };
    const presented = presentDeclaration(declaration);
    expect(presented.contactEmail.status).toBe('DECLARED');
    expect(presented.contactEmail.display).toBe('operator@example.invalid');
    expect(presented.contactEmail.href).toBe('mailto:operator@example.invalid');
    expect(presented.contactEmail.unsetReason).toBeNull();
    expect(conversionMailto(declaration)).toBe('mailto:operator@example.invalid');
    expect(presented.publicName.display).toBe('Example Operator');
    // The live singleton is untouched.
    expect(COMMERCIAL_DECLARATION.contactEmail.status).toBe('UNSET');
  });

  it('presents a declared fee as the authored string, never as a computed price', () => {
    const declaration: CommercialDeclaration = {
      ...COMMERCIAL_DECLARATION,
      engagementFee: declaredField('engagementFee', 'USD 2400, fixed'),
    };
    const presented = presentDeclaration(declaration);
    expect(presented.engagementFee.display).toBe('USD 2400, fixed');
    expect(presented.engagementFee.href).toBeNull();
  });

  it('presents a declared domain as a link, and a declared name as text only', () => {
    const declaration: CommercialDeclaration = {
      ...COMMERCIAL_DECLARATION,
      publicName: declaredField('publicName', 'Example Operator'),
      publicDomain: declaredField('publicDomain', 'example.invalid'),
    };
    const presented = presentDeclaration(declaration);
    expect(presented.publicDomain.href).toBe('https://example.invalid');
    expect(presented.publicName.href).toBeNull();
  });
});

describe('unsetField', () => {
  it('labels the slot it was given, so swapping labels cannot silently rename a field', () => {
    const field = unsetField('engagementFee');
    expect(field.slot).toBe('engagementFee');
    expect(field.status).toBe('UNSET');
    expect(field.visibleLabel.toLowerCase()).toMatch(/fee/);
  });
});

describe('the reserved values are declared once', () => {
  it('hard-codes none of the silent-default inboxes outside the test suite', () => {
    const offenders = allCodeFiles().filter((relative) => {
      const source = readFileSync(join(REPO, relative), 'utf8').toLowerCase();
      return SILENT_EMAILS.some((email) => source.includes(email));
    });
    expect(
      offenders,
      `A CD1 inbox is hard-coded in source (inventing contact): ${offenders.join(', ')}`,
    ).toEqual([]);
  });

  it('does not hard-code a github.com URL — source links go through source-provenance', () => {
    // Reaffirm the existing rule so commercial files cannot grow a second repository constant.
    const offenders = allCodeFiles().filter(
      (relative) =>
        relative !== join('lib', 'config', 'source-provenance.ts') &&
        readFileSync(join(REPO, relative), 'utf8').includes('github.com/'),
    );
    expect(offenders, `A repository URL is hard-coded outside source-provenance: ${offenders.join(', ')}`).toEqual(
      [],
    );
  });

  it('names this checkout when a remote is discoverable, so the commercial module is in the right repository', () => {
    let origin: string;
    try {
      origin = execFileSync('git', ['remote', 'get-url', 'origin'], { cwd: REPO, encoding: 'utf8' }).trim();
    } catch {
      return;
    }
    expect(origin).toMatch(/ambientframe\/agentic-automation-portfolio/);
  });
});

describe('declaration file integrity', () => {
  it('exists at the path the brief named, so a rename cannot hide the singleton', () => {
    const source = readFileSync(join(REPO, DECLARATION), 'utf8');
    expect(source).toContain('COMMERCIAL_DECLARATION');
    expect(source).toContain('CD1');
    expect(createHash('sha256').update(source).digest('hex').length).toBe(64);
  });
});
