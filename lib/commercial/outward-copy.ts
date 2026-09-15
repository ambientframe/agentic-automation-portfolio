/**
 * OUTWARD COMMERCIAL COPY — OPERATOR APPROVED.
 *
 * Christopher approved this batch as written on 2026-09-15. Approval changes the copy's
 * status only. It does not declare any CD1 value; those remain explicit UNSET fields in
 * `lib/config/commercial-declaration.ts`.
 *
 * Every sentence either resolves to a repository artifact (by path, existence-checked) or
 * carries a label: UNSET, NOT_CLAIMED, AWAITING_EVIDENCE, PROCESS, DIRECTION.
 * Nothing here invents a CD1 value. Nothing here uses team language.
 */

export const COPY_APPROVAL = {
  status: 'OPERATOR_APPROVED',
  approvedOn: '2026-09-15',
} as const;

export const COMMERCIAL_ROUTES = {
  home: '/',
  engagement: '/engagement',
  operatorLog: '/operator-log',
  evaluator: '/#evaluator-layer',
} as const;

export type ArtifactBacking = {
  readonly kind: 'ARTIFACT';
  readonly path: string;
  readonly why: string;
};

export type LabelBacking = {
  readonly kind: 'LABEL';
  readonly label: 'UNSET' | 'NOT_CLAIMED' | 'AWAITING_EVIDENCE' | 'PROCESS' | 'DIRECTION';
};

export type ClaimBacking = ArtifactBacking | LabelBacking;

export type CommercialSurface =
  | 'front-door'
  | 'engagement'
  | 'author'
  | 'colophon'
  | 'operator-log'
  | 'maturity';

export type OutwardSentence = {
  readonly id: string;
  readonly surface: CommercialSurface;
  readonly text: string;
  readonly backing: ClaimBacking;
};

const PATCH: ArtifactBacking = {
  kind: 'ARTIFACT',
  path: 'COMMERCIAL_COMPLETION_PATCH.md',
  why: 'Commercial V1 strategy of record — offer, conversion, not-claimed list.',
};

const THESIS: ArtifactBacking = {
  kind: 'ARTIFACT',
  path: 'COMMERCIAL_THESIS.md',
  why: 'Why the artifact exists; operator is not the artifact; published limits are load-bearing.',
};

const STATUS: ArtifactBacking = {
  kind: 'ARTIFACT',
  path: 'docs/STATUS.md',
  why: 'What is real, simulated, or unverified, graded rather than implied.',
};

const RUNBOOK: ArtifactBacking = {
  kind: 'ARTIFACT',
  path: 'docs/O1_OPERATOR_RUNBOOK.md',
  why: 'Pre-registered protocol the operator log will cite; it predates any run.',
};

function S(
  id: string,
  surface: CommercialSurface,
  text: string,
  backing: ClaimBacking,
): OutwardSentence {
  return { id, surface, text, backing };
}

export const FRONT_DOOR = {
  kicker: S(
    'front-door.kicker',
    'front-door',
    'For owner-run service firms',
    PATCH,
  ),
  headline: S(
    'front-door.headline',
    'front-door',
    'Paid-for demand disappears between the enquiry and the engagement.',
    PATCH,
  ),
  problem: S(
    'front-door.problem',
    'front-door',
    'Owner-run service firms pay to attract enquiries, then lose them in handling: a slow first response, a message nobody owns, a follow-up that never happens, silence treated as closed.',
    PATCH,
  ),
  positioning: S(
    'front-door.positioning',
    'front-door',
    'This site is a running system a stranger can inspect before trusting anyone. The hireable offer is a bounded diagnostic of that leak — not a build, and not a request to believe a pitch.',
    THESIS,
  ),
} as const;

export const HONESTY = {
  real: S(
    'honesty.real',
    'front-door',
    'What is real: the engine, the suite, and the retained evidence are inspectable. Public CI runs the same gates the README gives a reader.',
    STATUS,
  ),
  simulated: S(
    'honesty.simulated',
    'front-door',
    'What is simulated: every business, person, and incident depicted here is fictional. By default no model is called and no message leaves this process. A hosted demo is not production.',
    STATUS,
  ),
  unclaimed: S(
    'honesty.unclaimed',
    'front-door',
    'What is not claimed: clients, deployments, measured outcomes, savings, speed, a team, vertical expertise, or production status for Systems 2–6.',
    { kind: 'LABEL', label: 'NOT_CLAIMED' },
  ),
} as const;

export const ROUTES = {
  firmLabel: S('routes.firm-label', 'front-door', 'I run a firm', PATCH),
  firmHint: S(
    'routes.firm-hint',
    'front-door',
    'The operator’s log, then the Revenue Leak Audit.',
    PATCH,
  ),
  evaluateLabel: S('routes.evaluate-label', 'front-door', 'I evaluate systems', PATCH),
  evaluateHint: S(
    'routes.evaluate-hint',
    'front-door',
    'The six systems, the runnable incidents, and the source.',
    THESIS,
  ),
} as const;

export const AUTHOR = {
  identity: S(
    'author.identity',
    'author',
    'Independent operator — not an agency, a studio-as-team, or a “we”.',
    PATCH,
  ),
  provenance: S(
    'author.provenance',
    'author',
    'Trade background is hospitality and sommelier work: diagnosing an unstated preference from thin signals, recommending from direct experience, and remaining behind the product. That is provenance for how conversion happens here, not a founder story.',
    THESIS,
  ),
  namespace: S(
    'author.namespace',
    'author',
    'ambientframe is the GitHub build namespace, not a brand.',
    PATCH,
  ),
} as const;

export const ENGAGEMENT_OFFER_NAME = 'Revenue Leak Audit';

export const ENGAGEMENT = {
  kicker: S('engagement.kicker', 'engagement', 'The offer', PATCH),
  headline: S('engagement.headline', 'engagement', ENGAGEMENT_OFFER_NAME, PATCH),
  lede: S(
    'engagement.lede',
    'engagement',
    'A bounded, fixed-fee diagnostic of where an owner-run service firm drops paid-for demand. Enquiry handling first, because that is where the inspectable proof is. Diagnosis only. Implementation is out of default scope.',
    PATCH,
  ),
  audience: S(
    'engagement.audience',
    'engagement',
    'For owner-run service firms. The artifact stays the thing a stranger can check; the operator translates it in conversation.',
    PATCH,
  ),
} as const;

export const ENGAGEMENT_ELEMENTS: readonly OutwardSentence[] = [
  S(
    'engagement.in',
    'engagement',
    'What goes in: read-only access to, or exports from, the places enquiries arrive and are worked — inboxes, forms, a phone log if one is kept, the CRM or its absence; one bounded interview (about 60–90 minutes) with whoever works enquiries; whatever historical enquiry data exists. Missing data is itself a finding, not a blocker.',
    PATCH,
  ),
  S(
    'engagement.inspected',
    'engagement',
    'What is inspected: the enquiry-to-engagement lifecycle end to end — capture points, time-to-first-response, duplicate handling, classification and routing, acknowledgment versus tracked ownership, follow-up after first contact, handling after a reply, escalation, and the dormant edge (what happens to enquiries that go quiet).',
    PATCH,
  ),
  S(
    'engagement.boundaries',
    'engagement',
    'Boundaries: diagnosis of that pipeline. Not marketing performance, not pricing, not staffing design, not tool procurement.',
    PATCH,
  ),
  S(
    'engagement.out',
    'engagement',
    'What comes out: a written, evidence-grade report in this portfolio’s register — each observed leak with severity, observed frequency, and an exposure estimate where measurable, with measured and estimated figures labeled as such; a prioritized intervention order; and the subset fixable without hiring anyone, this operator included. Plus a readout conversation.',
    PATCH,
  ),
  S(
    'engagement.shape',
    'engagement',
    'Shape: roughly two weeks elapsed; a handful of hours of the firm’s time. No fabricated precision beyond that.',
    PATCH,
  ),
  S(
    'engagement.excluded',
    'engagement',
    'Excluded: implementation. A first build, if the evidence warrants one, is scoped separately from the audit’s findings.',
    PATCH,
  ),
  S(
    'engagement.implementation',
    'engagement',
    'Implementation included? No, by default — stated here so the fee cannot be read as a build.',
    PATCH,
  ),
  S(
    'engagement.nothing',
    'engagement',
    'If there is nothing worth building: the report says so. A defensible “this operation does not leak enough here to justify systems work” is a successful audit, and the diagnostic stands on its own either way.',
    PATCH,
  ),
];

export const ENGAGEMENT_NOT_CLAIMED: readonly OutwardSentence[] = [
  S('not-claimed.clients', 'engagement', 'No clients.', { kind: 'LABEL', label: 'NOT_CLAIMED' }),
  S('not-claimed.deployments', 'engagement', 'No deployments.', { kind: 'LABEL', label: 'NOT_CLAIMED' }),
  S('not-claimed.outcomes', 'engagement', 'No measured client outcomes.', {
    kind: 'LABEL',
    label: 'NOT_CLAIMED',
  }),
  S('not-claimed.savings', 'engagement', 'No savings figures.', { kind: 'LABEL', label: 'NOT_CLAIMED' }),
  S('not-claimed.speed', 'engagement', 'No speed claims.', { kind: 'LABEL', label: 'NOT_CLAIMED' }),
  S('not-claimed.team', 'engagement', 'No team, studio, or “we”.', {
    kind: 'LABEL',
    label: 'NOT_CLAIMED',
  }),
  S('not-claimed.vertical', 'engagement', 'No vertical expertise claim. Verticals here are demonstrations.', {
    kind: 'LABEL',
    label: 'NOT_CLAIMED',
  }),
  S(
    'not-claimed.production',
    'engagement',
    'No production status for Systems 2–6.',
    { kind: 'LABEL', label: 'NOT_CLAIMED' },
  ),
];

export const CONVERSION = {
  afterEmail: S(
    'conversion.after-email',
    'engagement',
    'After a message: a reply within two business days containing two or three specific questions about the firm’s operation, before any call. No form, no scheduler, no intake machinery.',
    { kind: 'LABEL', label: 'PROCESS' },
  ),
  publication: S(
    'conversion.publication',
    'engagement',
    'With permission, a later engagement may contribute anonymized outcome evidence to this portfolio. Nothing is published without a separate, explicit approval after the fact. Declining that permission reduces nothing about the service received.',
    { kind: 'LABEL', label: 'DIRECTION' },
  ),
  outcomesSlot: S(
    'conversion.outcomes-slot',
    'engagement',
    'Measured client outcomes — empty. This slot is earned by a real engagement plus that later permission. Nothing above it will be retro-softened to look more complete.',
    { kind: 'LABEL', label: 'NOT_CLAIMED' },
  ),
} as const;

export const OPERATOR_LOG = {
  title: S('log.title', 'operator-log', 'Operator’s log', PATCH),
  status: S('log.status', 'operator-log', 'Awaiting evidence', {
    kind: 'LABEL',
    label: 'AWAITING_EVIDENCE',
  }),
  body: S(
    'log.body',
    'operator-log',
    'This route exists so “I run a firm” is not a 404. The log is composed only from a recorded operating session that has not happened yet. No session prose is published here — not even a placeholder scene that could be mistaken for one.',
    { kind: 'LABEL', label: 'AWAITING_EVIDENCE' },
  ),
  protocol: S(
    'log.protocol',
    'operator-log',
    'The pre-registered protocol the future log will cite is already in the repository. It predates any run on purpose.',
    RUNBOOK,
  ),
} as const;

export const COLOPHON_COPY = {
  offer: S('colophon.offer', 'colophon', 'Hireable offer: Revenue Leak Audit', PATCH),
  identity: S('colophon.identity', 'colophon', 'Independent operator', PATCH),
} as const;

export const MATURITY_INTRO = S(
  'maturity.intro',
  'maturity',
  'Maturity is descriptive, not aspirational. A label reports what this system is, not what it is aiming at.',
  STATUS,
);

export const OUTWARD_SENTENCES: readonly OutwardSentence[] = [
  FRONT_DOOR.kicker,
  FRONT_DOOR.headline,
  FRONT_DOOR.problem,
  FRONT_DOOR.positioning,
  HONESTY.real,
  HONESTY.simulated,
  HONESTY.unclaimed,
  ROUTES.firmLabel,
  ROUTES.firmHint,
  ROUTES.evaluateLabel,
  ROUTES.evaluateHint,
  AUTHOR.identity,
  AUTHOR.provenance,
  AUTHOR.namespace,
  ENGAGEMENT.kicker,
  ENGAGEMENT.headline,
  ENGAGEMENT.lede,
  ENGAGEMENT.audience,
  ...ENGAGEMENT_ELEMENTS,
  ...ENGAGEMENT_NOT_CLAIMED,
  CONVERSION.afterEmail,
  CONVERSION.publication,
  CONVERSION.outcomesSlot,
  OPERATOR_LOG.title,
  OPERATOR_LOG.status,
  OPERATOR_LOG.body,
  OPERATOR_LOG.protocol,
  COLOPHON_COPY.offer,
  COLOPHON_COPY.identity,
  MATURITY_INTRO,
];
