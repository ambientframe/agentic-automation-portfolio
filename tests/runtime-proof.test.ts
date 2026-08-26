import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  loadRuntimeProof,
  deriveRuntimeProof,
  N8N_EVIDENCE_REPO_PATH,
  SMTP_EVIDENCE_REPO_PATH,
  type RuntimeProofResolution,
} from '@/lib/evidence/runtime-proof';
import { RuntimeProofSection } from '@/components/runtime-proof';

/**
 * FALSIFYING TESTS for the Lead Rescue runtime proof surface.
 *
 * The repository already holds strong retained evidence — real local n8n orchestration driving
 * a deterministic transition to persisted state, and a real SMTP send across a socket to a
 * separate capture server. Until this package, discovering any of that required reading two
 * committed JSON artifacts and a handful of test files. This suite rejects that: it requires the
 * portfolio's own Lead Rescue page to expose the proof, to source it from the committed
 * artifacts rather than from unsupported prose, and — just as importantly — to keep saying what
 * is NOT proven.
 *
 * Rendering is exercised through the real presentational component via `renderToStaticMarkup`,
 * so these assertions run against markup a visitor would actually receive, not against a model
 * object that some future refactor could quietly stop rendering.
 */

function resolution(): RuntimeProofResolution {
  return loadRuntimeProof();
}

function renderSection(res: RuntimeProofResolution): string {
  return renderToStaticMarkup(createElement(RuntimeProofSection, { resolution: res }));
}

/** Text-only view of the markup: strips tags so assertions match visible copy, not attributes. */
function visibleText(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/\s+/g, ' ');
}

describe('runtime proof model — derived from committed evidence, never re-typed prose', () => {
  it('1. resolves a distinguishable real n8n orchestration proof from the committed artifact', () => {
    const res = resolution();
    expect(res.status).toBe('AVAILABLE');
    if (res.status !== 'AVAILABLE') return;

    const n8nProofs = res.proofs.filter((p) => p.kind === 'N8N_ORCHESTRATION');
    expect(n8nProofs.length).toBeGreaterThanOrEqual(1);
    for (const proof of n8nProofs) {
      expect(proof.evidenceSource).toBe(N8N_EVIDENCE_REPO_PATH);
      expect(proof.runtime.name.toLowerCase()).toContain('n8n');
      expect(proof.runtime.version.length).toBeGreaterThan(0);
    }
  });

  it('2. resolves a distinguishable real SMTP execution proof from the committed artifact', () => {
    const res = resolution();
    if (res.status !== 'AVAILABLE') throw new Error('evidence unavailable');

    const smtp = res.proofs.find((p) => p.kind === 'SMTP_EXECUTION');
    expect(smtp).toBeDefined();
    expect(smtp?.evidenceSource).toBe(SMTP_EVIDENCE_REPO_PATH);
    expect(smtp?.runtime.name.toLowerCase()).toContain('mailpit');
  });

  it('3. every proof identifies its evidence source path and carries at least one inspectable runtime identifier', () => {
    const res = resolution();
    if (res.status !== 'AVAILABLE') throw new Error('evidence unavailable');

    for (const proof of res.proofs) {
      expect([N8N_EVIDENCE_REPO_PATH, SMTP_EVIDENCE_REPO_PATH]).toContain(proof.evidenceSource);
      expect(proof.identifiers.length).toBeGreaterThan(0);
      for (const id of proof.identifiers) {
        expect(id.label.length).toBeGreaterThan(0);
        expect(id.value.length).toBeGreaterThan(0);
      }
    }
  });

  it('4+5. every proof states both what it proves and what it does not prove', () => {
    const res = resolution();
    if (res.status !== 'AVAILABLE') throw new Error('evidence unavailable');

    for (const proof of res.proofs) {
      expect(proof.proves.length).toBeGreaterThan(0);
      expect(proof.doesNotProve.length).toBeGreaterThan(0);
    }
  });

  it('7. genuine n8n execution identifiers survive into the model, matching the committed artifact', () => {
    const res = resolution();
    if (res.status !== 'AVAILABLE') throw new Error('evidence unavailable');

    const values = res.proofs
      .filter((p) => p.kind === 'N8N_ORCHESTRATION')
      .flatMap((p) => p.identifiers.map((i) => i.value));
    // Real n8n-issued execution ids retained in n8n/evidence/lead-rescue-runtime-execution.json.
    expect(values.some((v) => v.includes('11'))).toBe(true);
    expect(values.some((v) => v.includes('657f20d9-24a5-4f58-9237-e6027e06d99a'))).toBe(true);
  });

  it('8. SMTP receipt evidence survives in sanitized form — receipt identity yes, message body no', () => {
    const res = resolution();
    if (res.status !== 'AVAILABLE') throw new Error('evidence unavailable');

    const smtp = res.proofs.find((p) => p.kind === 'SMTP_EXECUTION');
    const values = (smtp?.identifiers ?? []).map((i) => i.value).join(' ');
    expect(values).toContain('5UmkyZq2njXxXnt0wnwfGJ');
    expect(smtp?.recipientClass).toMatch(/synthetic|sandbox|non-routable/i);
    // The proof-message body text must never be carried into the presentation model.
    expect(JSON.stringify(smtp)).not.toContain('automated Lead Rescue execution-boundary proof message');
  });

  it('10. an absent or invalid artifact resolves UNAVAILABLE with a reason — never a fabricated success', () => {
    const missing = deriveRuntimeProof(undefined, undefined);
    expect(missing.status).toBe('UNAVAILABLE');
    if (missing.status === 'UNAVAILABLE') expect(missing.reason.length).toBeGreaterThan(0);

    const malformed = deriveRuntimeProof({ nonsense: true }, { alsoNonsense: 1 });
    expect(malformed.status).toBe('UNAVAILABLE');
  });
});

describe('runtime proof surface — what a visitor actually receives', () => {
  it('1+2. the rendered section exposes both the real n8n orchestration proof and the real SMTP proof', () => {
    const text = visibleText(renderSection(resolution()));
    expect(text).toMatch(/n8n/i);
    expect(text).toMatch(/SMTP/i);
    expect(text).toMatch(/Mailpit/i);
  });

  it('the commercial grammar is present in order: trigger, decision, action, guardrail, outcome', () => {
    const text = visibleText(renderSection(resolution())).toLowerCase();
    const order = ['trigger', 'decision', 'action', 'guardrail', 'outcome'];
    let cursor = -1;
    for (const stage of order) {
      const at = text.indexOf(stage, cursor + 1);
      expect(at, `stage "${stage}" not found in order`).toBeGreaterThan(cursor);
      cursor = at;
    }
  });

  it('4+5. the rendered surface states both what ran for real and what remains unproven', () => {
    const text = visibleText(renderSection(resolution()));
    expect(text).toMatch(/what (this |actually )?(ran|proves|executed)/i);
    expect(text).toMatch(/not (yet )?(proven|prove)|remains (unproven|simulated)|deliberately unproven/i);
  });

  it('6. real/local/simulated distinctions stay visible — never collapsed into one "live" claim', () => {
    const text = visibleText(renderSection(resolution()));
    expect(text).toMatch(/local/i);
    expect(text).toMatch(/simulated/i);
  });

  it('11. the surface never claims real Anthropic execution, because no artifact establishes it', () => {
    const text = visibleText(renderSection(resolution()));
    // It must mention the AI boundary honestly...
    expect(text).toMatch(/anthropic|claude|model/i);
    // ...but never assert the evaluation happened.
    expect(text).not.toMatch(/real (anthropic|claude|model) (classification|evaluation) (was |has been )?(executed|proven|verified)/i);
    expect(text).toMatch(/(not|never|unproven|no retained).{0,80}(anthropic|claude|real model)|(anthropic|claude|real model).{0,80}(not|unproven|never)/i);
  });

  it('12. the surface never silently promotes maturity: no production/client-deployed/exactly-once claims', () => {
    const text = visibleText(renderSection(resolution())).toLowerCase();
    // "exactly one" is included deliberately: it reads as an exactly-once delivery guarantee
    // even when it is only describing a retained message count, and the evidence supports
    // duplicate suppression on the evidenced path — never a general delivery guarantee.
    for (const forbidden of ['in production', 'client deployed', 'client-deployed', 'live customer', 'real customer email', 'exactly once', 'exactly-once', 'exactly one']) {
      expect(text, `forbidden maturity claim present: "${forbidden}"`).not.toContain(forbidden);
    }
    // And it must positively state the limitation.
    expect(text).toMatch(/not client|no real (customer|person|recipient)|not a client deployment/i);
  });

  it('9. no secret-bearing or credential-shaped field can reach the markup', () => {
    const html = renderSection(resolution());
    expect(html).not.toMatch(/authorization|bearer |api[-_]?key|password|secret|cookie|access[-_]?token/i);
    expect(html).not.toMatch(/sk-[A-Za-z0-9-]{10,}/);
  });

  it('10. an UNAVAILABLE resolution renders an explicit unavailable state, never a success-looking one', () => {
    const text = visibleText(renderSection(deriveRuntimeProof(undefined, undefined)));
    expect(text).toMatch(/unavailable|not available|could not/i);
    expect(text).not.toMatch(/independently observed/i);
  });

  it('the retained artifact paths are surfaced so a technical viewer can inspect the source of truth', () => {
    const text = visibleText(renderSection(resolution()));
    expect(text).toContain(N8N_EVIDENCE_REPO_PATH);
    expect(text).toContain(SMTP_EVIDENCE_REPO_PATH);
  });
});
