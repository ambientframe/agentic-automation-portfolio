import type { RuntimeProof, RuntimeProofResolution, ProofSequence, AuthorityPhase, AuthorityStage } from '@/lib/evidence/runtime-proof';

/**
 * THE RUNTIME PROOF SURFACE.
 *
 * Commercial meaning first, identifiers second. Each card leads with a plain-language headline
 * an owner can read, then the operating story in the portfolio's fixed grammar
 * (TRIGGER → DECISION → ACTION → GUARDRAIL → OUTCOME), then what it does and does not prove,
 * and only then — behind a `<details>` — the raw execution identities a technical buyer needs
 * to falsify the claim. Nothing here restates runtime facts: every value comes from
 * `lib/evidence/runtime-proof.ts`, which reads the committed artifacts.
 *
 * Colour follows the existing provenance/runtime semantics rather than inventing a scale:
 * `--prov-evidence` marks a genuinely evidenced fact, `--warn` marks an honest limitation,
 * `--prov-fixture` marks what is still simulated. No new visual system.
 */

const SEQUENCE_STAGES: ReadonlyArray<{ key: keyof ProofSequence; label: string }> = [
  { key: 'trigger', label: 'Trigger' },
  { key: 'decision', label: 'Decision' },
  { key: 'action', label: 'Action' },
  { key: 'guardrail', label: 'Guardrail' },
  { key: 'outcome', label: 'Outcome' },
];

export function RuntimeProofSection({ resolution }: { resolution: RuntimeProofResolution }) {
  if (resolution.status === 'UNAVAILABLE') {
    return (
      <section className="space-y-4">
        <h2 className="display text-2xl border-b rule pb-3">Runtime proof</h2>
        <div className="border rule rounded-sm p-4 space-y-2" style={{ background: 'var(--panel)' }}>
          <p className="label" style={{ color: 'var(--warn)' }}>
            Proof unavailable
          </p>
          <p className="instrument leading-relaxed" style={{ color: 'var(--ink-muted)' }}>
            {resolution.reason}
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <h2 className="display text-2xl border-b rule pb-3">Runtime proof</h2>

      {/* --- What actually ran ------------------------------------------------ */}
      <div className="prose-measure space-y-3">
        <p className="text-[0.9375rem] leading-relaxed">
          Most automation demonstrations are replays. The records below are not. Each one is a
          boundary this system genuinely crossed on real infrastructure, kept as evidence
          afterwards rather than described from memory — and each one is paired with what it
          still does not prove.
        </p>
        <p className="text-sm leading-relaxed" style={{ color: 'var(--ink-muted)' }}>
          Everything here ran locally, against sandboxed services, with synthetic data. No client
          is running this, and no real person was contacted.
        </p>
      </div>

      <ol className="space-y-4">
        {resolution.proofs.map((proof) => (
          <li key={proof.id}>
            <ProofCard proof={proof} />
          </li>
        ))}
      </ol>

      <UnprovenPanel />
    </section>
  );
}

function ProofCard({ proof }: { proof: RuntimeProof }) {
  return (
    <article className="border rule rounded-sm" style={{ background: 'var(--paper-raised)' }}>
      <header className="p-5 space-y-3 border-b rule">
        <div className="flex flex-wrap items-center gap-2">
          <span className="badge" style={{ color: 'var(--prov-evidence)', background: 'var(--prov-evidence-bg)', borderColor: 'var(--prov-evidence)' }}>
            Observed
          </span>
          <span className="badge" style={{ color: 'var(--ink-muted)', borderColor: 'var(--rule-strong)' }}>
            {proof.runtime.name}
          </span>
          <span className="badge" style={{ color: 'var(--ink-muted)', borderColor: 'var(--rule-strong)' }}>
            {proof.runtime.locality}
          </span>
        </div>
        <h3 className="display text-lg leading-snug">{proof.headline}</h3>
        <p className="text-[0.9375rem] leading-relaxed prose-measure" style={{ color: 'var(--ink-muted)' }}>
          {proof.summary}
        </p>
      </header>

      {/* --- The operating story, in the portfolio's fixed grammar ------------- */}
      <ol className="divide-y rule">
        {SEQUENCE_STAGES.map(({ key, label }) => (
          <li key={key} className="px-5 py-3 flex flex-col sm:flex-row sm:gap-5 gap-1">
            <span className="label shrink-0 sm:w-24 sm:pt-0.5">{label}</span>
            <p className="text-[0.8125rem] leading-relaxed flex-1" style={{ color: 'var(--ink-muted)' }}>
              {proof.sequence[key]}
            </p>
          </li>
        ))}
      </ol>

      {proof.authorityTimeline !== undefined && <AuthorityTimeline stages={proof.authorityTimeline} />}

      {/* --- Proves / does not prove, side by side and equally weighted -------- */}
      <div className="grid gap-5 sm:grid-cols-2 p-5 border-t rule">
        <ClaimList
          label="What this proves"
          items={proof.proves}
          accent="var(--prov-evidence)"
        />
        <ClaimList
          label="What it does not prove"
          items={proof.doesNotProve}
          accent="var(--warn)"
        />
      </div>

      {/* --- Inspectable identity, progressive rather than dominant ------------ */}
      <details className="border-t rule" style={{ background: 'var(--panel)' }}>
        <summary className="label cursor-pointer p-4 hover:opacity-70">
          Inspect the retained evidence
        </summary>
        <div className="border-t rule p-4 space-y-4">
          {proof.recipientClass !== undefined && (
            <div className="space-y-1">
              <p className="label">Recipient</p>
              <p className="instrument" style={{ color: 'var(--ink-muted)' }}>
                {proof.recipientClass}
              </p>
            </div>
          )}
          <dl className="grid gap-x-5 gap-y-2 sm:grid-cols-2">
            {proof.identifiers.map((id) => (
              <div key={`${id.label}-${id.value}`} className="min-w-0 space-y-0.5">
                <dt className="label">{id.label}</dt>
                <dd className="instrument break-all" style={{ color: 'var(--ink-muted)' }}>
                  {id.value}
                </dd>
              </div>
            ))}
            <div className="min-w-0 space-y-0.5">
              <dt className="label">Observed at</dt>
              <dd className="instrument break-all" style={{ color: 'var(--ink-muted)' }}>
                {proof.observedAt}
              </dd>
            </div>
          </dl>
          <div className="space-y-0.5 border-t rule pt-3">
            <p className="label">Source of truth</p>
            <p className="instrument break-all" style={{ color: 'var(--ink-faint)' }}>
              {proof.evidenceSource}
            </p>
          </div>
        </div>
      </details>
    </article>
  );
}

const PHASE_LABEL: Record<AuthorityPhase, string> = {
  PREPARED: 'Prepared',
  REFUSED: 'Refused',
  AUTHORIZED: 'Authorised',
  EXECUTED: 'Executed',
  REPLAY: 'Replay',
};

/** Refusals and the approval-with-no-send are the point, so they carry the evidence accent. */
function phaseAccent(phase: AuthorityPhase): string {
  switch (phase) {
    case 'REFUSED':
      return 'var(--blocked)';
    case 'AUTHORIZED':
      return 'var(--prov-policy)';
    case 'EXECUTED':
      return 'var(--prov-evidence)';
    default:
      return 'var(--ink-faint)';
  }
}

/**
 * THE NEGATIVE-SPACE PROOF, given its own treatment.
 *
 * The rightmost column is the entire commercial argument: an independent server's message
 * count, held at zero through every refusal AND through the approval itself, reaching one only
 * at execution and never moving again. Reading down that column is the proof; the prose is
 * support. Kept as a semantic table so the relationship survives a screen reader and a narrow
 * viewport, where it collapses to stacked rows rather than scrolling sideways.
 */
function AuthorityTimeline({ stages }: { stages: readonly AuthorityStage[] }) {
  return (
    <div className="border-t rule">
      <div className="px-5 pt-4 pb-2 flex flex-wrap items-baseline justify-between gap-2">
        <p className="label">Nothing left the building until someone approved it</p>
        <p className="instrument" style={{ color: 'var(--ink-faint)' }}>
          messages observed by the receiving server
        </p>
      </div>
      <ol className="divide-y rule">
        {stages.map((stage, index) => {
          const accent = phaseAccent(stage.phase);
          const delivered = stage.messageCount > 0;
          return (
            <li
              key={`${stage.phase}-${index}`}
              className="px-5 py-3 flex flex-col sm:flex-row sm:items-baseline gap-2 sm:gap-4"
            >
              {/* `self-start` matters: in the stacked mobile layout a flex child would
                  otherwise stretch to full width, turning the badge into a banner. */}
              <span className="badge self-start shrink-0 sm:w-28" style={{ color: accent, borderColor: accent }}>
                {PHASE_LABEL[stage.phase]}
              </span>
              <span className="text-[0.8125rem] leading-relaxed flex-1 min-w-0" style={{ color: 'var(--ink-muted)' }}>
                {stage.what}
                {stage.outcome !== undefined && (
                  <span className="instrument ml-2" style={{ color: accent }}>
                    {stage.outcome}
                  </span>
                )}
              </span>
              <span
                className="instrument tabular-nums shrink-0 sm:w-24 sm:text-right"
                style={{ color: delivered ? 'var(--prov-evidence)' : 'var(--ink-faint)' }}
              >
                {stage.messageCount === 0 ? 'none sent' : `${stage.messageCount} sent`}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function ClaimList({ label, items, accent }: { label: string; items: readonly string[]; accent: string }) {
  return (
    <div className="space-y-2">
      <p className="label" style={{ color: accent }}>
        {label}
      </p>
      <ul className="space-y-2">
        {items.map((item) => (
          <li key={item} className="text-[0.8125rem] leading-relaxed pl-4 relative" style={{ color: 'var(--ink-muted)' }}>
            <span className="absolute left-0" style={{ color: accent }}>
              ·
            </span>
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * The limitations that belong to the system as a whole rather than to any single proof. Kept
 * deliberately prominent — a portfolio that shows only its strongest evidence is not being
 * honest about its maturity, and this section is what keeps the page's overall claim truthful.
 */
function UnprovenPanel() {
  return (
    <div className="border rule rounded-sm p-5 space-y-3" style={{ background: 'var(--panel)' }}>
      <p className="label" style={{ color: 'var(--warn)' }}>
        What remains deliberately unproven
      </p>
      <ul className="grid gap-2 sm:grid-cols-2">
        {[
          'No client is running this. Nothing here is a deployment, and no customer data has ever passed through it.',
          'The reasoning step still uses a built-in fixture by default. A real-model adapter is implemented, but it has never been measured against the evaluation corpus, so its quality is unproven.',
          'The mail proof used a local sandbox server that stores messages and does not forward them. No real mailbox, provider, or person was involved.',
          'The automation platform ran locally. That is a real second runtime, but it is not cloud or customer infrastructure.',
          'Outbound sending is off by default. Real delivery happens only under an explicit, separate opt-in, and is restricted to non-routable addresses.',
          'Duplicate suppression is demonstrated for the paths above. It is not a general delivery guarantee against an arbitrary provider.',
        ].map((item) => (
          <li key={item} className="text-[0.8125rem] leading-relaxed pl-4 relative" style={{ color: 'var(--ink-muted)' }}>
            <span className="absolute left-0" style={{ color: 'var(--warn)' }}>
              ·
            </span>
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
