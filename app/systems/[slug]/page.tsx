import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ALL_SYSTEMS, systemBySlug } from '@/data/systems';
import { sourceById } from '@/data/research/sources';
import { ALL_RUNNABLE_SCENARIOS } from '@/lib/engine/registry';
import { MaturityBadge, MechanismBadge, StandardCard } from '@/components/badges';
import { RuntimeProofSection } from '@/components/runtime-proof';
import { loadRuntimeProof } from '@/lib/evidence/runtime-proof';
import { AUTHORITY_LABELS, type AuthorityLevel } from '@/lib/model/system';

export function generateStaticParams() {
  return ALL_SYSTEMS.map((s) => ({ slug: s.slug }));
}

export default async function SystemDossier({ params }: PageProps<'/systems/[slug]'>) {
  const { slug } = await params;
  const system = systemBySlug(slug);
  if (system === undefined) notFound();

  const scenarios = ALL_RUNNABLE_SCENARIOS.filter((s) => s.systemId === system.id);
  const citedSourceIds = [...new Set(system.standards.flatMap((s) => s.sourceIds))];

  return (
    <div className="mx-auto max-w-6xl px-6 py-12 space-y-16">
      <nav className="instrument">
        <Link href="/" style={{ color: 'var(--ink-muted)' }} className="hover:opacity-70">
          ← All systems
        </Link>
      </nav>

      {/* --- Header ---------------------------------------------------------- */}
      <header className="space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="instrument tabular-nums" style={{ color: 'var(--ink-faint)' }}>
            {String(system.order).padStart(2, '0')}
          </span>
          <MaturityBadge level={system.maturity} />
        </div>
        <h1 className="display text-4xl sm:text-5xl">{system.name}</h1>
        <p className="lede prose-measure">{system.buyerOutcome}</p>
        <div className="prose-measure border-t border-b rule py-3 space-y-1">
          <p className="label">Current fidelity</p>
          <p className="instrument leading-relaxed" style={{ color: 'var(--ink-muted)' }}>
            {system.fidelityNote}
          </p>
        </div>
      </header>

      {system.id === 'lead-rescue' && (
        <section
          className="border rule rounded-sm p-4 flex flex-wrap items-center justify-between gap-3"
          style={{ background: 'var(--panel)' }}
        >
          <div>
            <p className="label" style={{ color: 'var(--waiting)' }}>
              Live, not a replay
            </p>
            <p className="instrument" style={{ color: 'var(--ink-muted)' }}>
              Park a waiting incident against a real persisted store, then check it — too early
              does nothing, past the configured window it escalates for real.
            </p>
          </div>
          <Link href="/lead-rescue/wait" className="badge" style={{ color: 'var(--waiting)', borderColor: 'var(--waiting)' }}>
            Open wait/resume demo →
          </Link>
        </section>
      )}

      {/*
        Runtime proof sits high on the page, directly under the demo callout: it is the
        strongest thing this system can show a buyer, and the retained evidence behind it
        should not require scrolling past the whole dossier to find. Only Lead Rescue has
        retained runtime artifacts today — every other system correctly renders nothing here
        rather than an empty promise.
      */}
      {system.id === 'lead-rescue' && <RuntimeProofSection resolution={loadRuntimeProof()} />}

      {scenarios.length > 0 && (
        <section className="space-y-4">
          <SectionHeading>Runnable incidents</SectionHeading>
          <ol className="border-t rule">
            {scenarios.map((s, index) => (
              <li key={s.id}>
                <Link
                  href={`/simulator/${s.slug}`}
                  className="index-row group flex flex-wrap items-baseline gap-x-5 gap-y-1 py-4 px-2 -mx-2"
                >
                  <h3 className="display text-base group-hover:opacity-70 flex-1 min-w-0">
                    <span className="instrument mr-3" style={{ color: 'var(--ink-faint)' }}>
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    {s.title}
                  </h3>
                  <span
                    className="badge"
                    style={{ color: 'var(--ink-muted)', borderColor: 'var(--rule-strong)' }}
                  >
                    ends {s.expectedFinalState.replace(/_/g, ' ').toLowerCase()}
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* --- Business case --------------------------------------------------- */}
      <section className="space-y-6">
        <SectionHeading>Business case</SectionHeading>
        <div className="grid gap-8 sm:grid-cols-2">
          <Block label="Business problem" body={system.businessProblem} />
          <Block label="Economic leakage" body={system.economicLeakage} />
        </div>
        <div className="grid gap-8 sm:grid-cols-3">
          <ListBlock label="Triggers" items={system.triggers} />
          <ListBlock label="Authoritative sources" items={system.sourcesOfTruth} />
          <ListBlock label="Entities" items={system.entities} />
        </div>
      </section>

      {/* --- Operating standards --------------------------------------------- */}
      <section className="space-y-6">
        <SectionHeading>Operating standards</SectionHeading>
        <p className="text-sm prose-measure" style={{ color: 'var(--ink-muted)' }}>
          Where each standard comes from, and how well it is actually supported, are separate
          questions. Both are shown. A claim marked unverified or weakly supported is not
          industry fact, and is never presented as one.
        </p>
        <div className="grid gap-3 md:grid-cols-2">
          {system.standards.map((standard) => (
            <StandardCard key={standard.id} standard={standard} />
          ))}
        </div>
      </section>

      {/* --- Lifecycle -------------------------------------------------------- */}
      <section className="space-y-6">
        <SectionHeading>Lifecycle</SectionHeading>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {system.lifecycle.states.map((state) => (
            <div
              key={state.id}
              className="border rule rounded-sm p-4 space-y-2"
              style={{ background: 'var(--paper-raised)' }}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="instrument font-medium flex items-center gap-2">
                  {/* A small square carries the state's kind — never a thick left stripe. */}
                  <span
                    className="state-mark"
                    style={{ background: stateColour(state.kind) }}
                    aria-hidden="true"
                  />
                  {state.id}
                </span>
                <span className="label">{state.kind.replace(/_/g, ' ')}</span>
              </div>
              <p className="text-[0.8125rem] leading-relaxed" style={{ color: 'var(--ink-muted)' }}>
                {state.description}
              </p>
            </div>
          ))}
        </div>

        <details className="border rule rounded-sm" style={{ background: 'var(--panel)' }}>
          <summary className="label cursor-pointer p-4 hover:opacity-70">
            {system.lifecycle.transitions.length} declared transitions — the only moves permitted
          </summary>
          <div className="overflow-x-auto border-t rule">
            <table className="instrument w-full">
              <thead>
                <tr className="border-b rule">
                  <Th>From</Th>
                  <Th>To</Th>
                  <Th>Mechanism</Th>
                  <Th>Guard</Th>
                  <Th>Auth</Th>
                </tr>
              </thead>
              <tbody>
                {system.lifecycle.transitions.map((t) => (
                  <tr key={t.id} className="border-b rule align-top">
                    <Td>{t.from}</Td>
                    <Td>{t.to}</Td>
                    <Td>
                      <MechanismBadge mechanism={t.mechanism} />
                    </Td>
                    <Td muted>{t.guard}</Td>
                    <Td>{t.authority}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </section>

      {/* --- Responsibility split --------------------------------------------- */}
      <section className="space-y-6">
        <SectionHeading>Who decides what</SectionHeading>
        <div className="grid gap-8 md:grid-cols-3">
          <ListBlock label="Deterministic decisions" items={system.deterministicDecisions} />
          <ListBlock label="Bounded AI judgment" items={system.aiJudgments} />
          <ListBlock label="Human-only actions" items={system.humanOnlyActions} />
        </div>
        <div className="grid gap-8 md:grid-cols-2">
          <ListBlock label="The AI may never" items={system.aiBoundary} accent="var(--blocked)" />
          <ListBlock label="Guardrails" items={system.guardrails} />
        </div>
        <div className="border rule rounded-sm p-4" style={{ background: 'var(--panel)' }}>
          <p className="label mb-3">Authority ladder</p>
          <dl className="instrument grid gap-2 sm:grid-cols-2">
            {([0, 1, 2, 3, 4] as AuthorityLevel[]).map((level) => (
              <div key={level} className="flex gap-3">
                <dt className="tabular-nums" style={{ color: 'var(--ink-faint)' }}>
                  {level}
                </dt>
                <dd>{AUTHORITY_LABELS[level]}</dd>
              </div>
            ))}
          </dl>
          <p className="instrument mt-3" style={{ color: 'var(--ink-muted)' }}>
            Authority is assigned per action. Reasoning capability never raises it.
          </p>
        </div>
      </section>

      {/* --- Metrics ----------------------------------------------------------- */}
      <section className="space-y-6">
        <SectionHeading>Measures</SectionHeading>
        <p className="text-sm prose-measure" style={{ color: 'var(--ink-muted)' }}>
          Every metric states how it is computed and which system is authoritative for its
          inputs. No metric without provenance.
        </p>
        <div className="overflow-x-auto border rule rounded-sm">
          <table className="w-full instrument">
            <thead>
              <tr className="border-b rule" style={{ background: 'var(--panel)' }}>
                <Th>Metric</Th>
                <Th>Kind</Th>
                <Th>Definition</Th>
                <Th>Source of truth</Th>
              </tr>
            </thead>
            <tbody>
              {system.metrics.map((metric) => (
                <tr key={metric.id} className="border-b rule align-top">
                  <Td>
                    <span className="font-medium">{metric.name}</span>
                    <br />
                    <span style={{ color: 'var(--ink-faint)' }}>{metric.unit}</span>
                  </Td>
                  <Td>{metric.kind}</Td>
                  <Td muted>{metric.definition}</Td>
                  <Td muted>{metric.sourceOfTruth}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* --- Failure modes ------------------------------------------------------ */}
      <section className="space-y-6">
        <SectionHeading>Failure modes</SectionHeading>
        <p className="text-sm prose-measure" style={{ color: 'var(--ink-muted)' }}>
          Known failure classes resolve into named states, never a generic error. Each entry
          names its prevention, its detection signal, its recovery, and the test that would
          catch a regression.
        </p>
        <div className="space-y-3">
          {system.failureModes.map((mode) => (
            <details
              key={mode.id}
              className="border rule rounded-sm"
              style={{ background: 'var(--paper-raised)' }}
            >
              <summary className="cursor-pointer p-4 flex flex-wrap items-center gap-3 hover:opacity-80">
                <span className="badge" style={{ color: 'var(--blocked)', borderColor: 'var(--blocked)' }}>
                  {mode.class.replace(/_/g, ' ')}
                </span>
                <span className="text-sm">{mode.failure}</span>
              </summary>
              <div className="border-t rule p-4 grid gap-4 sm:grid-cols-2">
                <Detail label="Cause" value={mode.cause} />
                <Detail label="Business impact" value={mode.businessImpact} />
                <Detail label="Prevention" value={mode.prevention} />
                <Detail label="Detection" value={mode.detection} />
                <Detail label="Recovery" value={mode.recovery} />
                <Detail label="Escalates when" value={mode.escalationCondition} />
                {mode.retryPolicy !== undefined && (
                  <Detail label="Retry policy" value={mode.retryPolicy} />
                )}
                <Detail label="Resolves into" value={mode.terminalState} />
                <Detail
                  label="Authority required"
                  value={`${mode.authorityRequired} · ${AUTHORITY_LABELS[mode.authorityRequired]}`}
                />
                <Detail label="Verification" value={mode.verificationTest} />
              </div>
            </details>
          ))}
        </div>
      </section>

      {/* --- Sources ------------------------------------------------------------ */}
      {citedSourceIds.length > 0 && (
        <section className="space-y-6">
          <SectionHeading>Sources cited</SectionHeading>
          <ol className="space-y-3">
            {citedSourceIds.map((id) => {
              const source = sourceById(id);
              if (source === undefined) return null;
              return (
                <li
                  key={id}
                  className="border rule rounded-sm p-4 space-y-2"
                  style={{ background: 'var(--paper-raised)' }}
                >
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="text-sm font-medium">{source.organization}</span>
                    <span className="text-sm" style={{ color: 'var(--ink-muted)' }}>
                      {source.title}
                    </span>
                    {source.primary && (
                      <span className="badge" style={{ color: 'var(--prov-evidence)', borderColor: 'var(--prov-evidence)' }}>
                        Primary
                      </span>
                    )}
                  </div>
                  <p className="instrument" style={{ color: 'var(--ink-faint)' }}>
                    {source.publishedOn !== undefined && `Published ${source.publishedOn} · `}
                    {source.checkedOn !== undefined
                      ? `Read ${source.checkedOn}`
                      : 'Not yet located and read'}
                    {source.url !== undefined && (
                      <>
                        {' · '}
                        <a
                          href={source.url}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="underline underline-offset-2 hover:opacity-70"
                        >
                          source
                        </a>
                      </>
                    )}
                  </p>
                  <p className="instrument leading-relaxed" style={{ color: 'var(--ink-muted)' }}>
                    <span className="label">Limitations</span> {source.limitations}
                  </p>
                </li>
              );
            })}
          </ol>
        </section>
      )}
    </div>
  );
}

function stateColour(kind: string): string {
  switch (kind) {
    case 'INITIAL':
      return 'var(--rule-strong)';
    case 'WAITING':
      return 'var(--waiting)';
    case 'HUMAN_REVIEW':
      return 'var(--warn)';
    case 'TERMINAL_SUCCESS':
      return 'var(--ok)';
    case 'TERMINAL_FAILURE':
      return 'var(--blocked)';
    case 'TERMINAL_NEUTRAL':
      return 'var(--ink-faint)';
    default:
      return 'var(--rule)';
  }
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="display text-2xl border-b rule pb-3">{children}</h2>
  );
}

function Block({ label, body }: { label: string; body: string }) {
  return (
    <div className="space-y-2">
      <p className="label">{label}</p>
      <p className="text-[0.9375rem] leading-relaxed">{body}</p>
    </div>
  );
}

function ListBlock({
  label,
  items,
  accent,
}: {
  label: string;
  items: readonly string[];
  accent?: string;
}) {
  return (
    <div className="space-y-2">
      <p className="label" style={accent === undefined ? undefined : { color: accent }}>
        {label}
      </p>
      <ul className="space-y-2">
        {items.map((item) => (
          <li
            key={item}
            className="text-[0.8125rem] leading-relaxed pl-4 relative"
            style={{ color: 'var(--ink-muted)' }}
          >
            <span className="absolute left-0" style={{ color: accent ?? 'var(--ink-faint)' }}>
              ·
            </span>
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <p className="label">{label}</p>
      <p className="instrument leading-relaxed" style={{ color: 'var(--ink-muted)' }}>
        {value}
      </p>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="label text-left px-3 py-2 font-normal">{children}</th>;
}

function Td({ children, muted }: { children: React.ReactNode; muted?: boolean }) {
  return (
    <td className="px-3 py-2" style={muted === true ? { color: 'var(--ink-muted)' } : undefined}>
      {children}
    </td>
  );
}
