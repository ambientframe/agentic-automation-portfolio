import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  loadRuntimeProof,
  deriveRuntimeProof,
  AUTHORITY_EVIDENCE_REPO_PATH,
  N8N_EVIDENCE_REPO_PATH,
  SMTP_EVIDENCE_REPO_PATH,
  type RuntimeProofResolution,
} from '@/lib/evidence/runtime-proof';
import { RuntimeProofSection } from '@/components/runtime-proof';

/**
 * FALSIFYING TESTS for the Lead Rescue Proof Console.
 *
 * The portfolio already surfaces two proof stories (real n8n orchestration, real SMTP
 * execution). The third and commercially strongest one — that a prepared action could NOT
 * execute until a human with sufficient authority authorised it, and that the external sink
 * independently observed ZERO messages through every refusal — landed in the repository after
 * that surface was built and is currently invisible to a viewer.
 *
 * This suite rejects a Proof Console that omits it, that flattens it to "supports human
 * approval", or that renders any of it without deriving from the committed artifact. The
 * zero-message refusal timeline is treated as the core falsifiable claim throughout.
 */

function resolution(): RuntimeProofResolution {
  return loadRuntimeProof();
}

function render(res: RuntimeProofResolution): string {
  return renderToStaticMarkup(createElement(RuntimeProofSection, { resolution: res }));
}

function visibleText(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&rarr;|&#8594;/g, '->')
    .replace(/\s+/g, ' ');
}

describe('proof console model — all three stories derive from committed evidence', () => {
  it('1+2+3. resolves a real-n8n, a real-SMTP, and an authority-before-execution proof record', () => {
    const res = resolution();
    expect(res.status).toBe('AVAILABLE');
    if (res.status !== 'AVAILABLE') return;

    const kinds = new Set(res.proofs.map((p) => p.kind));
    expect(kinds.has('N8N_ORCHESTRATION')).toBe(true);
    expect(kinds.has('SMTP_EXECUTION')).toBe(true);
    expect(kinds.has('AUTHORITY_BEFORE_EXECUTION')).toBe(true);
  });

  it('4. every proof record names a committed evidence artifact as its source', () => {
    const res = resolution();
    if (res.status !== 'AVAILABLE') throw new Error('unavailable');
    const known = [N8N_EVIDENCE_REPO_PATH, SMTP_EVIDENCE_REPO_PATH, AUTHORITY_EVIDENCE_REPO_PATH];
    for (const proof of res.proofs) {
      expect(known).toContain(proof.evidenceSource);
    }
  });

  it('5. the authority proof exposes the full refusal → authorisation → execution → replay timeline', () => {
    const res = resolution();
    if (res.status !== 'AVAILABLE') throw new Error('unavailable');
    const authority = res.proofs.find((p) => p.kind === 'AUTHORITY_BEFORE_EXECUTION');
    expect(authority?.authorityTimeline).toBeDefined();
    const timeline = authority?.authorityTimeline ?? [];

    // The shape of the whole claim: several zero-delivery stages, then exactly one, then no more.
    expect(timeline.length).toBeGreaterThanOrEqual(6);
    expect(timeline.every((s) => typeof s.messageCount === 'number')).toBe(true);
    expect(Math.max(...timeline.map((s) => s.messageCount))).toBe(1);
    expect(timeline[timeline.length - 1]?.messageCount).toBe(1);

    // Everything up to and including authorisation delivered nothing.
    const authIdx = timeline.findIndex((s) => s.phase === 'AUTHORIZED');
    expect(authIdx).toBeGreaterThan(0);
    expect(timeline.slice(0, authIdx + 1).every((s) => s.messageCount === 0)).toBe(true);

    // At least three genuinely distinct refusals precede it.
    expect(timeline.slice(0, authIdx).filter((s) => s.phase === 'REFUSED').length).toBeGreaterThanOrEqual(3);
  });

  it('6. the timeline distinguishes PREPARED, REFUSED, AUTHORIZED, EXECUTED and REPLAY as separate concepts', () => {
    const res = resolution();
    if (res.status !== 'AVAILABLE') throw new Error('unavailable');
    const phases = new Set((res.proofs.find((p) => p.kind === 'AUTHORITY_BEFORE_EXECUTION')?.authorityTimeline ?? []).map((s) => s.phase));
    for (const phase of ['PREPARED', 'REFUSED', 'AUTHORIZED', 'EXECUTED', 'REPLAY']) {
      expect(phases.has(phase as never), `phase ${phase} missing`).toBe(true);
    }
  });

  it('7. sanitized runtime identity is inspectable on every proof record', () => {
    const res = resolution();
    if (res.status !== 'AVAILABLE') throw new Error('unavailable');
    for (const proof of res.proofs) {
      expect(proof.identifiers.length).toBeGreaterThan(0);
    }
    const authority = res.proofs.find((p) => p.kind === 'AUTHORITY_BEFORE_EXECUTION');
    const values = (authority?.identifiers ?? []).map((i) => i.value).join(' ');
    // The real capture-server receipt from the committed authority artifact.
    expect(values).toContain('4wj1NJkTlgX3aQd9yJaQTr');
  });

  it('8+9. every proof record states what it proves and what it does not', () => {
    const res = resolution();
    if (res.status !== 'AVAILABLE') throw new Error('unavailable');
    for (const proof of res.proofs) {
      expect(proof.proves.length).toBeGreaterThan(0);
      expect(proof.doesNotProve.length).toBeGreaterThan(0);
    }
  });

  it('13. missing or malformed evidence never yields a success-shaped result', () => {
    expect(deriveRuntimeProof(undefined, undefined, undefined).status).toBe('UNAVAILABLE');
    expect(deriveRuntimeProof({ junk: 1 }, { junk: 2 }, { junk: 3 }).status).toBe('UNAVAILABLE');
    // A present-but-malformed authority artifact must not silently produce an authority card.
    const partial = deriveRuntimeProof(undefined, undefined, { capturedFacts: { nonsense: true } });
    if (partial.status === 'AVAILABLE') {
      expect(partial.proofs.some((p) => p.kind === 'AUTHORITY_BEFORE_EXECUTION')).toBe(false);
    }
  });
});

describe('proof console surface — what a viewer actually receives', () => {
  it('3+5. the rendered page shows the authority story with its zero-delivery refusals', () => {
    const text = visibleText(render(resolution()));
    expect(text).toMatch(/authoris|authoriz/i);
    expect(text).toMatch(/refused|refusal/i);
    // The core claim must be legible as counts, not just prose.
    expect(text).toMatch(/0\s*(messages|sent|delivered)|no message|nothing was sent|zero/i);
  });

  it('6. PREPARED / AUTHORIZED / EXECUTED / REFUSED read as distinct states on the page', () => {
    const text = visibleText(render(resolution())).toLowerCase();
    for (const word of ['prepared', 'authorised', 'executed', 'refused', 'replay']) {
      expect(text, `"${word}" not visible`).toContain(word);
    }
  });

  it('the commercial grammar appears in order on every card', () => {
    const text = visibleText(render(resolution())).toLowerCase();
    let cursor = -1;
    for (const stage of ['trigger', 'decision', 'action', 'guardrail', 'outcome']) {
      const at = text.indexOf(stage, cursor + 1);
      expect(at, `stage "${stage}" out of order`).toBeGreaterThan(cursor);
      cursor = at;
    }
  });

  it('10. the page states plainly that this is not client deployed', () => {
    const text = visibleText(render(resolution()));
    expect(text).toMatch(/not client|no client is running|not a client deployment/i);
  });

  it('11+12. no real-Anthropic claim, and simulated things never render as real', () => {
    const text = visibleText(render(resolution()));
    expect(text).toMatch(/anthropic|claude|model/i);
    expect(text).not.toMatch(/real (anthropic|claude|model) (classification|evaluation) (was |has been )?(executed|proven|verified)/i);
    expect(text).toMatch(/fixture|simulated/i);
  });

  it('15. no forbidden maturity claim is asserted — these phrases may appear only as explicit negations', () => {
    const text = visibleText(render(resolution())).toLowerCase();
    // Banned outright: there is no honest way to say these on this surface.
    for (const forbidden of ['in production', 'client deployed', 'client-deployed', 'exactly once', 'exactly-once', 'exactly one', 'authenticated user']) {
      expect(text, `forbidden claim: "${forbidden}"`).not.toContain(forbidden);
    }
    // Permitted only when negated ("no real customer was involved"), never as an assertion.
    for (const guarded of ['live customer', 'real customer', 'real prospect']) {
      let from = 0;
      for (;;) {
        const at = text.indexOf(guarded, from);
        if (at === -1) break;
        const window = text.slice(Math.max(0, at - 60), at);
        expect(window, `"${guarded}" appears without a negation`).toMatch(/\bno\b|\bnot\b|never|zero|without/);
        from = at + guarded.length;
      }
    }
  });

  it('14. no secret-shaped field can reach the markup', () => {
    const html = render(resolution());
    expect(html).not.toMatch(/bearer |sk-[A-Za-z0-9-]{10,}/i);
    expect(html).not.toMatch(/"(authorization|api[-_]?key|password|cookie|access[-_]?token)"\s*:/i);
  });

  it('13. an unavailable resolution renders an explicit unavailable state', () => {
    const text = visibleText(render(deriveRuntimeProof(undefined, undefined, undefined)));
    expect(text).toMatch(/unavailable|not available|could not/i);
    expect(text).not.toMatch(/independently observed/i);
  });

  it('all three artifact paths are surfaced for technical inspection', () => {
    const text = visibleText(render(resolution()));
    for (const p of [N8N_EVIDENCE_REPO_PATH, SMTP_EVIDENCE_REPO_PATH, AUTHORITY_EVIDENCE_REPO_PATH]) {
      expect(text).toContain(p);
    }
  });
});
