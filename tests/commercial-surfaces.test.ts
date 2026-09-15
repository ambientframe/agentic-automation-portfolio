import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { AuthorStrip } from '@/components/commercial/author-strip';
import { ColophonContact, CommercialNav } from '@/components/commercial/colophon-contact';
import { EngagementSurface } from '@/components/commercial/engagement-surface';
import { FrontDoor } from '@/components/commercial/front-door';
import { MaturityLegend } from '@/components/commercial/maturity-legend';
import { OperatorsLogStub } from '@/components/commercial/operators-log-stub';

import {
  COMMERCIAL_ROUTES,
  ENGAGEMENT_ELEMENTS,
  ENGAGEMENT_OFFER_NAME,
  OUTWARD_SENTENCES,
} from '@/lib/commercial/outward-copy';
import {
  COMMERCIAL_DECLARATION,
  declaredField,
  presentDeclaration,
  type CommercialDeclaration,
} from '@/lib/config/commercial-declaration';
import { resolveSourceProvenance, sourceUrl } from '@/lib/config/source-provenance';

/**
 * THE SURFACES A STRANGER ACTUALLY SEES.
 *
 * Rendering the real presentational components — not scanning for function names — is the
 * lesson `tests/source-provenance.test.ts` already paid for. A commercial claim that lives
 * only in a module, or a conversion path that is a mailto to an invented inbox, is the
 * defect CP1 exists to close.
 */

const REPO = process.cwd();
const PROVENANCE = resolveSourceProvenance({});

function html(node: ReturnType<typeof createElement>): string {
  return renderToStaticMarkup(node);
}

function visible(markup: string): string {
  return markup.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
}

function commercialSurfaces(declaration: CommercialDeclaration = COMMERCIAL_DECLARATION): string {
  return [
    html(createElement(FrontDoor, { declaration, provenance: PROVENANCE })),
    html(createElement(EngagementSurface, { declaration, provenance: PROVENANCE })),
    html(createElement(OperatorsLogStub, { provenance: PROVENANCE })),
    html(createElement(AuthorStrip, { declaration, provenance: PROVENANCE })),
    html(createElement(ColophonContact, { declaration, provenance: PROVENANCE })),
    html(createElement(CommercialNav)),
    html(createElement(MaturityLegend, { provenance: PROVENANCE })),
  ].join('\n');
}

describe('every outward sentence reaches markup', () => {
  it('renders each registered sentence, with its artifact link or its label', () => {
    const markup = commercialSurfaces();
    const text = visible(markup);
    for (const sentence of OUTWARD_SENTENCES) {
      expect(text, `missing sentence ${sentence.id}`).toContain(sentence.text);
      if (sentence.backing.kind === 'ARTIFACT') {
        expect(markup, `missing artifact href for ${sentence.id}`).toContain(
          sourceUrl(PROVENANCE, sentence.backing.path),
        );
      } else {
        expect(text, `missing label for ${sentence.id}`).toMatch(new RegExp(sentence.backing.label.replace(/_/g, ' '), 'i'));
      }
    }
  });

  it('renders no draft-approval chrome after operator approval', () => {
    const text = visible(commercialSurfaces());
    expect(text).not.toMatch(/draft copy/i);
    expect(text).not.toMatch(/awaiting operator approval/i);
  });
});

describe('CD1 values stay visibly unset on the surfaces', () => {
  const presented = presentDeclaration(COMMERCIAL_DECLARATION);

  it('shows the unset label for name, fee, email, and domain', () => {
    const text = visible(commercialSurfaces());
    for (const field of presented.fields) {
      expect(text).toContain(field.display);
      expect(text).toMatch(/not yet declared/i);
    }
    expect(text).toMatch(/CD1/);
    expect(text).toMatch(/\bunset\b/i);
  });

  it('does not emit a mailto, a fee-shaped number, or a silent-default inbox', () => {
    const markup = commercialSurfaces();
    expect(markup).not.toContain('mailto:');
    expect(markup.toLowerCase()).not.toContain('cmschafrath@gmail.com');
    expect(markup.toLowerCase()).not.toContain('christopherschafrath@gmail.com');
    expect(visible(markup)).not.toMatch(/\$\s*\d/);
  });

  it('grows a mailto only when contact is explicitly declared — and not on the live singleton', () => {
    const declared: CommercialDeclaration = {
      ...COMMERCIAL_DECLARATION,
      contactEmail: declaredField('contactEmail', 'operator@example.invalid'),
    };
    const markup = html(createElement(ColophonContact, { declaration: declared, provenance: PROVENANCE }));
    expect(markup).toContain('mailto:operator@example.invalid');
    expect(conversionMailtoLive()).toBe(true);
  });
});

function conversionMailtoLive(): boolean {
  return COMMERCIAL_DECLARATION.contactEmail.status === 'UNSET';
}

describe('front door', () => {
  it('states the owner-firm problem, the author strip, the honesty inversion, and both routes', () => {
    const markup = html(createElement(FrontDoor, { declaration: COMMERCIAL_DECLARATION, provenance: PROVENANCE }));
    const text = visible(markup);
    expect(text).toMatch(/owner-run service firms/i);
    expect(text).toMatch(/author/i);
    expect(text).toMatch(/what is real/i);
    expect(text).toMatch(/what is simulated/i);
    expect(text).toMatch(/not claimed/i);
    expect(text).toContain('I run a firm');
    expect(text).toContain('I evaluate systems');
    expect(markup).toContain(`href="${COMMERCIAL_ROUTES.operatorLog}"`);
    expect(markup).toContain(`href="${COMMERCIAL_ROUTES.engagement}"`);
    expect(markup).toContain(`href="${COMMERCIAL_ROUTES.evaluator}"`);
  });
});

describe('engagement page', () => {
  it('renders the Revenue Leak Audit and all eight concreteness elements', () => {
    const markup = html(
      createElement(EngagementSurface, { declaration: COMMERCIAL_DECLARATION, provenance: PROVENANCE }),
    );
    const text = visible(markup);
    expect(text).toContain(ENGAGEMENT_OFFER_NAME);
    expect(ENGAGEMENT_ELEMENTS).toHaveLength(8);
    for (const element of ENGAGEMENT_ELEMENTS) {
      expect(text).toContain(element.text);
    }
    expect(text).toMatch(/two business days/i);
    expect(text).toMatch(/permission/i);
    expect(text).toMatch(/reserved slot/i);
  });
});

describe('operator’s log stub', () => {
  it('announces awaiting-evidence and does not compose a session', () => {
    const markup = html(createElement(OperatorsLogStub, { provenance: PROVENANCE }));
    const text = visible(markup);
    expect(text).toMatch(/awaiting evidence/i);
    expect(text).toMatch(/has not happened yet/i);
    expect(text).not.toMatch(/\bI clicked\b/i);
    expect(text).not.toMatch(/\bjournal record\b/i);
    expect(markup).toContain(sourceUrl(PROVENANCE, 'docs/O1_OPERATOR_RUNBOOK.md'));
    expect(markup).toContain(`href="${COMMERCIAL_ROUTES.engagement}"`);
  });
});

describe('maturity legend', () => {
  it('explains the labels in plain language, including unused levels', () => {
    const text = visible(html(createElement(MaturityLegend, { provenance: PROVENANCE })));
    expect(text).toMatch(/descriptive, not aspirational/i);
    expect(text).toMatch(/unused on this site/i);
    expect(text).toMatch(/simulated/i);
    expect(text).toMatch(/interactive prototype/i);
  });
});

describe('chrome that makes name, offer, and fee reachable from any page', () => {
  it('puts the offer, the log, and the evaluator route on the commercial nav', () => {
    const markup = html(createElement(CommercialNav));
    expect(markup).toContain(`href="${COMMERCIAL_ROUTES.engagement}"`);
    expect(markup).toContain(`href="${COMMERCIAL_ROUTES.operatorLog}"`);
    expect(markup).toContain(`href="${COMMERCIAL_ROUTES.evaluator}"`);
    expect(visible(markup)).toContain(ENGAGEMENT_OFFER_NAME);
  });

  it('is actually used by the layout, not only defined', () => {
    const layout = readFileSync(join(REPO, 'app/layout.tsx'), 'utf8');
    expect(layout, 'app/layout.tsx no longer renders <CommercialNav />.').toContain('<CommercialNav');
    expect(layout, 'app/layout.tsx no longer renders <ColophonContact />.').toContain('<ColophonContact');
    expect(layout, 'app/layout.tsx no longer renders <MaturityLegend />.').toContain('<MaturityLegend');
    expect(layout).toContain('COMMERCIAL_DECLARATION');
  });

  it('keeps the existing homepage evaluator layer under the front door', () => {
    const page = readFileSync(join(REPO, 'app/page.tsx'), 'utf8');
    expect(page).toContain('<FrontDoor');
    expect(page).toContain('id="evaluator-layer"');
    expect(page).toContain('Six small-business operating systems, built to be inspected.');
    expect(page).toContain('<MaturityLegend');
  });

  it('registers the engagement and operator-log routes', () => {
    const engagement = readFileSync(join(REPO, 'app/engagement/page.tsx'), 'utf8');
    const log = readFileSync(join(REPO, 'app/operator-log/page.tsx'), 'utf8');
    expect(engagement).toContain('<EngagementSurface');
    expect(log).toContain('<OperatorsLogStub');
  });
});
