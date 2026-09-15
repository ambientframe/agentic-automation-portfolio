/**
 * THE ONE PLACE PUBLIC NAME, FEE, CONTACT, AND DOMAIN ARE DECLARED.
 *
 * `COMMERCIAL_COMPLETION_PATCH.md` reserves these four values to CD1, a private operator
 * decision batch. Until that batch lands, every field here is an explicit UNSET placeholder
 * and every surface that reads this module must render a visible unset state.
 *
 * Inventing a fee, silently defaulting contact to an address that happens to appear in git
 * history, or displaying a name as if CD1 had happened is a commercial defect, not a
 * convenience. The live export is all-unset. Tests that need a
 * declared path construct one with `declaredField` rather than editing the singleton.
 *
 * Same discipline as `lib/config/source-provenance.ts`: the presentation is PURE — no
 * `process.env` read, no filesystem touch — so it is unit-testable, and it reports WHERE
 * each answer came from (UNSET vs DECLARED) so a surface can state its grade rather than
 * flatten it. An empty DECLARED value fails closed at construction time, because the
 * alternative is a page that reads as though a decision was made while showing nothing.
 */

export const CD1_SLOTS = ['publicName', 'engagementFee', 'contactEmail', 'publicDomain'] as const;
export type Cd1Slot = (typeof CD1_SLOTS)[number];

const UNSET_LABEL: Record<Cd1Slot, string> = {
  publicName: 'Public name not yet declared',
  engagementFee: 'Engagement fee not yet declared',
  contactEmail: 'Contact address not yet declared',
  publicDomain: 'Public domain not yet declared',
};

export const UNSET_REASON =
  'CD1 — operator-reserved. This surface will not invent a value.';

export type UnsetField<S extends Cd1Slot = Cd1Slot> = {
  readonly status: 'UNSET';
  readonly slot: S;
  readonly visibleLabel: string;
};

export type DeclaredField<S extends Cd1Slot = Cd1Slot> = {
  readonly status: 'DECLARED';
  readonly slot: S;
  readonly value: string;
};

export type DeclarationField<S extends Cd1Slot = Cd1Slot> = UnsetField<S> | DeclaredField<S>;

export type CommercialDeclaration = {
  readonly publicName: DeclarationField<'publicName'>;
  readonly engagementFee: DeclarationField<'engagementFee'>;
  readonly contactEmail: DeclarationField<'contactEmail'>;
  readonly publicDomain: DeclarationField<'publicDomain'>;
};

export function unsetField<S extends Cd1Slot>(slot: S): UnsetField<S> {
  return { status: 'UNSET', slot, visibleLabel: UNSET_LABEL[slot] };
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function declaredField<S extends Cd1Slot>(slot: S, value: string): DeclaredField<S> {
  const trimmed = value.trim();
  if (trimmed === '') {
    throw new Error(
      `${slot} was marked DECLARED with an empty value — that would render as if a decision ` +
        'had been made while showing nothing.',
    );
  }
  if (slot === 'contactEmail' && !EMAIL.test(trimmed)) {
    throw new Error(
      `contactEmail was marked DECLARED with "${trimmed}", which is not an email — a mailto ` +
        'pinned to it would go nowhere while reading as a conversion path.',
    );
  }
  return { status: 'DECLARED', slot, value: trimmed };
}

/** The live declaration. All four UNSET until CD1. */
export const COMMERCIAL_DECLARATION: CommercialDeclaration = {
  publicName: unsetField('publicName'),
  engagementFee: unsetField('engagementFee'),
  contactEmail: unsetField('contactEmail'),
  publicDomain: unsetField('publicDomain'),
};

export type PresentedField = {
  readonly slot: Cd1Slot;
  readonly status: 'UNSET' | 'DECLARED';
  readonly display: string;
  /** mailto: or https:// only when the slot is DECLARED and the slot is a link. */
  readonly href: string | null;
  readonly unsetReason: string | null;
};

function hrefFor(field: DeclarationField): string | null {
  if (field.status !== 'DECLARED') return null;
  if (field.slot === 'contactEmail') return `mailto:${field.value}`;
  if (field.slot === 'publicDomain') {
    return field.value.startsWith('https://') || field.value.startsWith('http://')
      ? field.value
      : `https://${field.value}`;
  }
  return null;
}

export function presentField(field: DeclarationField): PresentedField {
  if (field.status === 'UNSET') {
    return {
      slot: field.slot,
      status: 'UNSET',
      display: field.visibleLabel,
      href: null,
      unsetReason: UNSET_REASON,
    };
  }
  return {
    slot: field.slot,
    status: 'DECLARED',
    display: field.value,
    href: hrefFor(field),
    unsetReason: null,
  };
}

export function presentDeclaration(declaration: CommercialDeclaration): {
  readonly publicName: PresentedField;
  readonly engagementFee: PresentedField;
  readonly contactEmail: PresentedField;
  readonly publicDomain: PresentedField;
  readonly fields: readonly PresentedField[];
} {
  const publicName = presentField(declaration.publicName);
  const engagementFee = presentField(declaration.engagementFee);
  const contactEmail = presentField(declaration.contactEmail);
  const publicDomain = presentField(declaration.publicDomain);
  return {
    publicName,
    engagementFee,
    contactEmail,
    publicDomain,
    fields: [publicName, engagementFee, contactEmail, publicDomain],
  };
}

export function conversionMailto(declaration: CommercialDeclaration): string | null {
  return presentField(declaration.contactEmail).href;
}
