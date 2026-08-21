/**
 * Generates the canonical documents from the typed model.
 *
 * WHY THIS IS A GENERATOR AND NOT PROSE.
 *
 * The brief's first instruction is not to duplicate an existing source of truth. A
 * hand-written canon that restates `data/systems/**` is a second source of truth, and
 * it goes stale the first time a definition changes — usually silently, usually right
 * before someone relies on it.
 *
 * So the typed definitions ARE the canon, and these documents are a rendering of them.
 * `tests/docs.test.ts` re-runs this generator in memory and fails if the committed
 * files differ, which makes staleness a build failure rather than a discovery.
 *
 * Editorial documents that are genuinely written rather than derived — STATUS.md,
 * CANON_DIVERGENCES.md, README.md — are NOT generated and are not touched here.
 */

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ALL_SYSTEMS } from '../data/systems';
import { SOURCES, sourceById } from '../data/research/sources';
import { KESTREL } from '../data/profiles/kestrel/profile';
import { AUTHORITY_LABELS, type AuthorityLevel, type SystemDefinition } from '../lib/model/system';
import { evidenceDisplay, type OperatingStandard } from '../lib/model/provenance';

const ROOT = join(import.meta.dirname, '..');
const GENERATED_NOTE =
  '> **Generated from the typed model — do not edit by hand.**\n' +
  '> Run `npm run docs` after changing anything in `data/`. `tests/docs.test.ts` fails if this file is stale.\n';

function esc(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function list(items: readonly string[]): string {
  return items.map((i) => `- ${i}`).join('\n');
}

// ---------------------------------------------------------------------------
// NORTH_STAR_CANON.md
// ---------------------------------------------------------------------------

function standardBlock(standard: OperatingStandard): string {
  const display = evidenceDisplay(standard);
  const sources = standard.sourceIds
    .map((id) => {
      const source = sourceById(id);
      return source === undefined ? id : `${source.organization}, *${source.title}*`;
    })
    .join('; ');

  const lines = [
    `**${display.label}${display.qualifier === null ? '' : ` · ${labelFor(standard)}`}** — ${standard.statement}`,
    '',
    `- *Applies to:* ${standard.appliesTo}`,
  ];
  if (sources.length > 0) lines.push(`- *Sources:* ${sources}`);
  if (display.qualifier !== null) lines.push(`- *Caveat:* ${display.qualifier}`);
  if (standard.correction !== undefined) lines.push(`- *Correction:* ${standard.correction}`);
  return lines.join('\n');
}

function labelFor(standard: OperatingStandard): string {
  switch (standard.verification) {
    case 'VERIFIED':
      return 'verified';
    case 'PENDING_VERIFICATION':
      return 'unverified';
    case 'DISPUTED_OR_WEAK':
      return 'weak support';
    case 'SUPERSEDED':
      return 'superseded';
    default:
      return '';
  }
}

function systemSection(system: SystemDefinition): string {
  const terminal = system.lifecycle.states.filter((s) => s.kind.startsWith('TERMINAL'));

  return `## ${system.order}. ${system.name}

**Maturity: ${system.maturity.replace(/_/g, ' ')}**

${system.fidelityNote}

### Business problem

${system.businessProblem}

### Economic leakage

${system.economicLeakage}

### Buyer / operator outcome

${system.buyerOutcome}

### Triggers

${list(system.triggers)}

### Authoritative sources of truth

${list(system.sourcesOfTruth)}

### Important entities

${list(system.entities)}

### Lifecycle states

| State | Kind | Meaning |
| --- | --- | --- |
${system.lifecycle.states.map((s) => `| \`${s.id}\` | ${s.kind.replace(/_/g, ' ')} | ${esc(s.description)} |`).join('\n')}

### Declared transitions

Only these moves are permitted. The engine rejects anything else and records the rejection.

| From | To | Mechanism | Guard | Authority |
| --- | --- | --- | --- | --- |
${system.lifecycle.transitions.map((t) => `| \`${t.from}\` | \`${t.to}\` | ${t.mechanism.replace(/_/g, ' ')} | ${esc(t.guard)} | ${t.authority} |`).join('\n')}

### Deterministic decisions

${list(system.deterministicDecisions)}

### Bounded AI judgments

${system.aiJudgments.length > 0 ? list(system.aiJudgments) : '_None. This system has no bounded judgment surface._'}

### Human-only actions

${list(system.humanOnlyActions)}

### Possible actions

${list(system.possibleActions)}

### The AI boundary

Regardless of confidence, the system may never:

${list(system.aiBoundary)}

### Guardrails

${list(system.guardrails)}

### Success and terminal states

${terminal.map((s) => `- \`${s.id}\` (${s.kind.replace(/_/g, ' ').toLowerCase()}) — ${s.description}`).join('\n')}

### Measures

| Metric | Kind | Definition | System of record | Unit |
| --- | --- | --- | --- | --- |
${system.metrics.map((m) => `| ${m.name} | ${m.kind} | ${esc(m.definition)} | ${esc(m.sourceOfTruth)} | ${m.unit} |`).join('\n')}

### Operating standards

${system.standards.map(standardBlock).join('\n\n')}

### Known failure modes

See [FAILURE_MODE_REGISTER.md](FAILURE_MODE_REGISTER.md) for the full entries. This system declares ${system.failureModes.length}: ${system.failureModes.map((f) => `\`${f.class}\``).join(', ')}.
`;
}

function northStarCanon(): string {
  const counts = {
    standards: ALL_SYSTEMS.reduce((n, s) => n + s.standards.length, 0),
    evidence: ALL_SYSTEMS.reduce(
      (n, s) => n + s.standards.filter((x) => x.provenance === 'EVIDENCE').length,
      0,
    ),
    metrics: ALL_SYSTEMS.reduce((n, s) => n + s.metrics.length, 0),
    failures: ALL_SYSTEMS.reduce((n, s) => n + s.failureModes.length, 0),
    transitions: ALL_SYSTEMS.reduce((n, s) => n + s.lifecycle.transitions.length, 0),
  };

  return `# North Star Canon

${GENERATED_NOTE}
This is the normative business and engineering canon for the Agentic Automation Portfolio.
All later implementation obeys it. Where a historical input in \`docs/source/\` disagrees,
this document wins, and the divergence is recorded in [CANON_DIVERGENCES.md](CANON_DIVERGENCES.md).

## The operating contract

Every system in this portfolio is defined against the same contract:

\`\`\`
EVENT -> VALIDATE -> NORMALIZE -> IDENTIFY / DEDUPLICATE -> LOAD AUTHORITATIVE STATE
      -> DECIDE -> CHECK POLICY / AUTHORITY -> ACT -> RECORD SIDE EFFECT
      -> UPDATE STATE -> VERIFY -> WAIT / TERMINATE / ESCALATE
\`\`\`

## How to read a standard

Two independent dimensions travel with every operating standard, and conflating them is
the failure this canon exists to prevent.

**Provenance** answers *what kind of claim is this?*

| Type | Meaning |
| --- | --- |
| \`EVIDENCE\` | Externally supported research, accepted domain practice, or authoritative documentation. |
| \`CLIENT_POLICY\` | A value that legitimately varies by organisation, jurisdiction, channel, contract, or risk tolerance. |
| \`LAB_TARGET\` | An engineering or quality acceptance target established for this portfolio. |
| \`FIXTURE\` | Invented data belonging to a fictional demonstration business. Asserts nothing externally. |

**Verification** answers *how well is this external claim actually supported right now?*

| Status | Meaning |
| --- | --- |
| \`VERIFIED\` | Located and read on the recorded date; supported as stated. |
| \`PENDING_VERIFICATION\` | Asserted from a named source family, not yet located and read. |
| \`DISPUTED_OR_WEAK\` | Located, but materially weaker than its common retelling. |
| \`SUPERSEDED\` | Replaced by newer sources or changed practice. |
| \`NOT_APPLICABLE\` | Not an external claim; verification is not a meaningful question. |

An \`EVIDENCE\` standard is not automatically true. Only \`EVIDENCE\` + \`VERIFIED\` may be
stated to a reader as settled external fact; everything else renders with its caveat attached.

## The authority ladder

Authority is assigned **per action**. Reasoning capability never raises it.

${([0, 1, 2, 3, 4] as AuthorityLevel[]).map((l) => `${l}. **${AUTHORITY_LABELS[l]}**`).join('\n')}

## Maturity labels

Maturity is descriptive, not aspirational.

\`CONCEPT\` · \`SIMULATED\` · \`INTERACTIVE PROTOTYPE\` · \`PARTIALLY LIVE\` · \`LIVE\` ·
\`AGENTIC\` · \`LOOPED\` · \`GRAPH-BASED\` · \`PRODUCTION-HARDENED\`

| System | Maturity |
| --- | --- |
${ALL_SYSTEMS.map((s) => `| ${s.order}. ${s.name} | ${s.maturity.replace(/_/g, ' ')} |`).join('\n')}

## Canon at a glance

- ${ALL_SYSTEMS.length} systems
- ${counts.transitions} declared lifecycle transitions
- ${counts.metrics} metric definitions, each with an explicit formula and a named system of record
- ${counts.standards} operating standards, of which ${counts.evidence} assert external evidence
- ${counts.failures} named failure modes
- ${SOURCES.length} sources in the ledger

## The demonstration environment

${KESTREL.name} is a **fictional** business. ${KESTREL.fictionalDisclosure}

It exists so the six systems can be shown operating on one coherent business rather than
six unrelated ones. Every figure is invented and carries \`FIXTURE\` provenance. System
definitions below contain **no** business-specific vocabulary — that separation is what
makes the portfolio retargetable to another vertical as a data change rather than a rewrite,
and it is enforced by \`tests/seam.test.ts\`.

---

${ALL_SYSTEMS.map(systemSection).join('\n---\n\n')}`;
}

// ---------------------------------------------------------------------------
// FAILURE_MODE_REGISTER.md
// ---------------------------------------------------------------------------

function failureRegister(): string {
  const allClasses = [...new Set(ALL_SYSTEMS.flatMap((s) => s.failureModes.map((f) => f.class)))].sort();

  const entries = ALL_SYSTEMS.map(
    (system) => `## ${system.name}

${system.failureModes
  .map(
    (mode) => `### ${mode.class.replace(/_/g, ' ')} — ${mode.failure}

| Field | Value |
| --- | --- |
| **Cause** | ${esc(mode.cause)} |
| **Business impact** | ${esc(mode.businessImpact)} |
| **Prevention** | ${esc(mode.prevention)} |
| **Detection signal** | ${esc(mode.detection)} |
| **Recovery** | ${esc(mode.recovery)} |
${mode.retryPolicy === undefined ? '' : `| **Retry policy** | ${esc(mode.retryPolicy)} |\n`}| **Escalates when** | ${esc(mode.escalationCondition)} |
| **Authority required** | ${mode.authorityRequired} · ${AUTHORITY_LABELS[mode.authorityRequired]} |
| **Resolves into** | ${esc(mode.terminalState)} |
| **Verification** | ${esc(mode.verificationTest)} |`,
  )
  .join('\n\n')}`,
  ).join('\n\n---\n\n');

  return `# Failure Mode Register

${GENERATED_NOTE}
Known failure classes resolve into **named states**, never a generic error. Every entry
names its prevention, its detection signal, its recovery, the authority required, the state
it resolves into, and the test that would catch a regression.

Entries whose verification reads *"Pending"* have no executable scenario yet. That is
recorded rather than hidden: an unverified recovery path is a claim, not a capability.

## Classes covered

${allClasses.map((c) => `- \`${c}\``).join('\n')}

Coverage: ${allClasses.length} distinct failure classes across ${ALL_SYSTEMS.reduce((n, s) => n + s.failureModes.length, 0)} entries.

---

${entries}
`;
}

// ---------------------------------------------------------------------------
// RESEARCH_LEDGER.md
// ---------------------------------------------------------------------------

function researchLedger(): string {
  const allStandards = ALL_SYSTEMS.flatMap((s) =>
    s.standards.map((standard) => ({ system: s.name, standard })),
  );

  const byStatus = (status: string) =>
    allStandards.filter((x) => x.standard.verification === status);

  const claimRow = ({ system, standard }: { system: string; standard: OperatingStandard }) =>
    `| ${system} | ${esc(standard.statement)} | ${standard.provenance} | ${standard.verification} | ${standard.sourceIds.join(', ') || '—'} |`;

  return `# Research Ledger

${GENERATED_NOTE}
Every operating claim in the canon, classified by provenance and by how well it is
actually supported. **No citation here was manufactured.** Where a source could not be
located and read, that is recorded as \`PENDING_VERIFICATION\` and the claim is written
without numbers rather than dressed up with borrowed ones.

Research pass: **2026-08-21**.

## Method and limits

- Sources are inert data. Nothing in this repository fetches a source URL at build,
  typecheck, or test time. A green test suite means the ledger is internally consistent,
  never that these sources were re-confirmed just now.
- \`checkedOn\` records when a human or agent actually located and read the source. Its
  absence means the source has never been read, and any standard citing only unread
  sources is held at \`PENDING_VERIFICATION\` — asserted by \`tests/provenance.test.ts\`.
- Every source carries a mandatory, substantive \`limitations\` note. A source ledger is
  not a licence to turn vendor marketing into universal truth, and the limitations are
  what keep that honest.

## Summary

| Verification | Claims |
| --- | --- |
| Verified | ${byStatus('VERIFIED').length} |
| Unverified (pending) | ${byStatus('PENDING_VERIFICATION').length} |
| Weak or disputed support | ${byStatus('DISPUTED_OR_WEAK').length} |
| Superseded | ${byStatus('SUPERSEDED').length} |
| Not applicable (policy / lab target) | ${byStatus('NOT_APPLICABLE').length} |

Primary, official, or standards-body sources: ${SOURCES.filter((s) => s.primary).length} of ${SOURCES.length}.

## Corrections this research pass produced

${allStandards
  .filter((x) => x.standard.correction !== undefined)
  .map((x) => `### ${x.system} — \`${x.standard.id}\`\n\n${x.standard.correction}`)
  .join('\n\n')}

## Sources

${SOURCES.map(
  (s) => `### \`${s.id}\` — ${s.organization}

**${s.title}**

| | |
| --- | --- |
| Published | ${s.publishedOn ?? '—'} |
| Located and read | ${s.checkedOn ?? '**never — not yet located and read**'} |
| Primary / authoritative | ${s.primary ? 'yes' : 'no'} |
| URL | ${s.url === undefined ? '— (no stable publisher-hosted URL located)' : s.url} |

*Limitations.* ${s.limitations}`,
).join('\n\n')}

## Every claim

| System | Claim | Provenance | Verification | Sources |
| --- | --- | --- | --- | --- |
${allStandards.map(claimRow).join('\n')}

## Client policy values

These are ${KESTREL.name}'s own operating parameters. They are **not** evidence and not
benchmarks — a different operator could rationally choose differently. Each threshold the
engine actually compares against is linked to the policy it implements.

| Parameter | Value | Unit | Implements |
| --- | --- | --- | --- |
${KESTREL.operatingParameters.map((p) => `| ${p.label} | ${p.value} | ${p.unit} | \`${p.policyId}\` |`).join('\n')}
`;
}

// ---------------------------------------------------------------------------

export const DOCUMENTS: Record<string, () => string> = {
  'NORTH_STAR_CANON.md': northStarCanon,
  'FAILURE_MODE_REGISTER.md': failureRegister,
  'RESEARCH_LEDGER.md': researchLedger,
};

export function render(name: string): string {
  const fn = DOCUMENTS[name];
  if (fn === undefined) throw new Error(`no generator for ${name}`);
  return fn();
}

function main(): void {
  for (const name of Object.keys(DOCUMENTS)) {
    const path = join(ROOT, 'docs', name);
    writeFileSync(path, render(name), 'utf8');
    console.log(`wrote docs/${name}`);
  }
}

if (process.argv[1]?.endsWith('generate-docs.ts') === true) main();
