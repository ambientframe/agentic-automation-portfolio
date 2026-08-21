'use client';

import { useState } from 'react';
import type { EngineRun } from '@/lib/engine/types';
import type { DecisionRecord, TimelineEntry } from '@/lib/model/runtime';
import { AUTHORITY_LABELS, type AuthorityLevel } from '@/lib/model/system';
import { AuthorityBadge, EffectStatusBadge, MechanismBadge } from '@/components/badges';

/**
 * The flight simulator.
 *
 * The run is computed on the server by the real engine and handed here as data. Stepping
 * does not re-derive anything — it reveals successive prefixes of a run that already
 * happened, which is why "replay" is honest: replaying produces the identical sequence
 * because the engine is deterministic.
 */
export function Simulator({
  run,
  expectedFinalState,
}: {
  run: EngineRun;
  expectedFinalState: string;
}) {
  const total = run.timeline.length;
  const [cursor, setCursor] = useState(total - 1);
  const entry = run.timeline[cursor];

  return (
    <div className="space-y-6">
      {/* --- Transport ------------------------------------------------------ */}
      <div
        className="border rule rounded-sm p-3 flex flex-wrap items-center gap-2"
        style={{ background: 'var(--panel)' }}
      >
        <Control onClick={() => setCursor(0)} disabled={cursor === 0} label="Replay from start" />
        <Control
          onClick={() => setCursor((c) => Math.max(0, c - 1))}
          disabled={cursor === 0}
          label="Step back"
        />
        <Control
          onClick={() => setCursor((c) => Math.min(total - 1, c + 1))}
          disabled={cursor >= total - 1}
          label="Step forward"
        />
        <Control
          onClick={() => setCursor(total - 1)}
          disabled={cursor >= total - 1}
          label="Run to end"
        />
        <span className="instrument tabular-nums ml-auto" style={{ color: 'var(--ink-muted)' }}>
          Step {cursor + 1} / {total}
        </span>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,21rem)_minmax(0,1fr)] items-start">
        {/* --- Timeline rail ------------------------------------------------ */}
        <ol className="border rule rounded-sm max-h-[42rem] overflow-y-auto">
          {run.timeline.map((item, index) => {
            const active = index === cursor;
            const reached = index <= cursor;
            return (
              <li key={item.id} className="border-b rule last:border-b-0">
                <button
                  type="button"
                  onClick={() => setCursor(index)}
                  className="w-full text-left px-3 py-3"
                  style={{
                    background: active ? 'var(--panel)' : 'transparent',
                    opacity: reached ? 1 : 0.4,
                    // Selection marker on a list row, not a decorative card stripe.
                    borderInlineStart: `2px solid ${active ? 'var(--accent)' : 'transparent'}`,
                    transition: 'background-color var(--dur-short) var(--ease-out)',
                  }}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="instrument font-medium">{item.stepLabel}</span>
                    <span className="instrument tabular-nums" style={{ color: 'var(--ink-faint)' }}>
                      +{item.atOffsetSeconds}s
                    </span>
                  </div>
                  <p className="instrument mt-1" style={{ color: 'var(--ink-muted)' }}>
                    {item.stateAfter}
                  </p>
                </button>
              </li>
            );
          })}
        </ol>

        {/* --- Inspector ----------------------------------------------------- */}
        <div className="space-y-4">
          {entry === undefined ? (
            <Panel title="No step selected">
              <p className="instrument">This run produced no timeline entries.</p>
            </Panel>
          ) : (
            <EntryInspector entry={entry} />
          )}

          <Panel title="Run summary">
            <dl className="instrument grid gap-2 sm:grid-cols-2">
              <Row label="Final state" value={run.finalState.lifecycleState} />
              <Row label="Expected" value={expectedFinalState} />
              <Row label="Steps" value={String(total)} />
              <Row
                label="Transitions accepted"
                value={String(run.transitions.filter((t) => t.accepted).length)}
              />
              <Row
                label="Transitions rejected"
                value={String(run.transitions.filter((t) => !t.accepted).length)}
              />
              <Row
                label="Effects executed"
                value={String(run.sideEffects.filter((e) => e.status === 'EXECUTED').length)}
              />
              <Row
                label="Duplicates suppressed"
                value={String(
                  run.sideEffects.filter((e) => e.status === 'SUPPRESSED_DUPLICATE').length,
                )}
              />
              <Row label="Keys claimed" value={String(run.ledgerEntries.length)} />
            </dl>
            {run.finalState.missingInformation.length > 0 && (
              <p className="instrument mt-3" style={{ color: 'var(--warn)' }}>
                <span className="label">Still unknown</span>{' '}
                {run.finalState.missingInformation.join(', ')} — carried as missing rather than
                assumed.
              </p>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}

function EntryInspector({ entry }: { entry: TimelineEntry }) {
  return (
    <>
      <Panel title={entry.stepLabel}>
        <p className="text-sm leading-relaxed">{entry.summary}</p>
        <dl className="instrument grid gap-2 sm:grid-cols-2 mt-3">
          <Row label="Event" value={entry.event.type} />
          <Row label="Source" value={`${entry.event.source} · ${entry.event.sourceEventId}`} />
          <Row label="Occurred" value={entry.event.occurredAt} />
          <Row label="Received" value={entry.event.receivedAt} />
          <Row label="Correlation" value={entry.event.correlationId} />
          <Row label="State after" value={entry.stateAfter} />
        </dl>
      </Panel>

      {entry.transitions.length > 0 && (
        <Panel title="State transition">
          {entry.transitions.map((t) => (
            <div key={t.id} className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="instrument">{t.from}</span>
                <span style={{ color: 'var(--ink-faint)' }}>→</span>
                <span className="instrument font-medium">{t.to}</span>
                <span
                  className="badge"
                  style={
                    t.accepted
                      ? { color: 'var(--ok)', borderColor: 'var(--ok)' }
                      : { color: 'var(--blocked)', borderColor: 'var(--blocked)' }
                  }
                >
                  {t.accepted ? 'Accepted' : 'Rejected'}
                </span>
                {t.ruleId !== undefined && (
                  <span className="instrument" style={{ color: 'var(--ink-faint)' }}>
                    rule {t.ruleId}
                  </span>
                )}
              </div>
              {t.rejectionReason !== undefined && (
                <p className="instrument leading-relaxed" style={{ color: 'var(--blocked)' }}>
                  {t.rejectionReason}
                </p>
              )}
            </div>
          ))}
        </Panel>
      )}

      {entry.decisions.map((d) => (
        <DecisionPanel key={d.id} decision={d} />
      ))}

      {entry.sideEffects.length > 0 && (
        <Panel title="Side effects">
          <ul className="space-y-4">
            {entry.sideEffects.map((effect) => (
              <li key={effect.id} className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <EffectStatusBadge status={effect.status} />
                  <span
                    className="badge"
                    style={{ color: 'var(--ink-muted)', borderColor: 'var(--rule-strong)' }}
                  >
                    {effect.executionMode}
                  </span>
                  <AuthorityBadge
                    level={effect.authority}
                    label={AUTHORITY_LABELS[effect.authority as AuthorityLevel]}
                  />
                </div>
                <p className="text-sm">{effect.description}</p>
                <p className="instrument" style={{ color: 'var(--ink-faint)' }}>
                  → {effect.target} · key <code>{effect.idempotencyKey}</code>
                </p>
                {effect.detail !== undefined && (
                  <p className="instrument leading-relaxed" style={{ color: 'var(--suppressed)' }}>
                    {effect.detail}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {entry.verifications.length > 0 && (
        <Panel title="Verification">
          <ul className="space-y-3">
            {entry.verifications.map((v) => (
              <li key={v.id} className="space-y-1">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span
                    className="badge"
                    style={
                      v.result === 'PASS'
                        ? { color: 'var(--ok)', borderColor: 'var(--ok)' }
                        : v.result === 'FAIL'
                          ? { color: 'var(--blocked)', borderColor: 'var(--blocked)' }
                          : { color: 'var(--ink-faint)', borderColor: 'var(--rule-strong)' }
                    }
                  >
                    {v.result.replace(/_/g, ' ')}
                  </span>
                  <span className="instrument">{v.check}</span>
                </div>
                <p className="instrument" style={{ color: 'var(--ink-muted)' }}>
                  {v.detail}
                </p>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </>
  );
}

function DecisionPanel({ decision }: { decision: DecisionRecord }) {
  return (
    <Panel title="Decision record">
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <MechanismBadge mechanism={decision.mechanism} />
        <AuthorityBadge
          level={decision.authority}
          label={AUTHORITY_LABELS[decision.authority as AuthorityLevel]}
        />
        {decision.confidence !== undefined && (
          <span
            className="badge"
            style={{ color: 'var(--prov-lab)', borderColor: 'var(--prov-lab)' }}
          >
            Confidence {decision.confidence.toFixed(2)}
          </span>
        )}
        {decision.providerId !== undefined && (
          <span className="instrument" style={{ color: 'var(--ink-faint)' }}>
            via {decision.providerId}
          </span>
        )}
      </div>

      <p className="text-sm leading-relaxed">{decision.objective}</p>

      <div className="mt-3 space-y-3">
        {decision.deterministicFacts.length > 0 && (
          <Group label="Facts consulted">
            <ul className="instrument space-y-1">
              {decision.deterministicFacts.map((f) => (
                <li key={f.label}>
                  <span style={{ color: 'var(--ink-faint)' }}>{f.label}:</span> {f.value}
                </li>
              ))}
            </ul>
          </Group>
        )}

        {decision.evidenceRefs.length > 0 && (
          <Group label="Evidence referenced">
            <ul className="instrument space-y-1" style={{ color: 'var(--ink-muted)' }}>
              {decision.evidenceRefs.map((ref) => (
                <li key={ref}>{ref}</li>
              ))}
            </ul>
          </Group>
        )}

        {decision.missingInformation.length > 0 && (
          <Group label="Missing information">
            <p className="instrument" style={{ color: 'var(--warn)' }}>
              {decision.missingInformation.join(', ')}
            </p>
          </Group>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <Group label="Permitted">
            <p className="instrument" style={{ color: 'var(--ink-muted)' }}>
              {decision.permittedActions.join(', ')}
            </p>
          </Group>
          <Group label="Forbidden">
            <p className="instrument" style={{ color: 'var(--blocked)' }}>
              {decision.forbiddenActions.join(', ')}
            </p>
          </Group>
        </div>

        <Group label="Selected action">
          <p className="instrument font-medium">{decision.selectedAction}</p>
        </Group>

        <Group label="Applicable policy">
          <ul className="instrument space-y-1" style={{ color: 'var(--ink-muted)' }}>
            {decision.applicablePolicy.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </Group>

        {decision.evaluatorResult !== undefined && (
          <Group label="Evaluator">
            <p className="instrument leading-relaxed" style={{ color: 'var(--ink-muted)' }}>
              {decision.evaluatorResult}
            </p>
          </Group>
        )}

        {decision.escalationReason !== undefined && (
          <Group label="Escalation reason">
            <p className="instrument" style={{ color: 'var(--warn)' }}>
              {decision.escalationReason}
            </p>
          </Group>
        )}
      </div>
    </Panel>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border rule rounded-sm" style={{ background: 'var(--paper-raised)' }}>
      <h3 className="label px-4 py-3 border-b rule">{title}</h3>
      <div className="p-4">{children}</div>
    </section>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="label">{label}</p>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2 min-w-0">
      <span className="label shrink-0">{label}</span>
      <span className="truncate tabular" title={value}>
        {value}
      </span>
    </div>
  );
}

function Control({
  onClick,
  disabled,
  label,
}: {
  onClick: () => void;
  disabled: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="badge disabled:opacity-35 disabled:cursor-not-allowed hover:opacity-70"
      style={{ borderColor: 'var(--rule-strong)', color: 'var(--ink)' }}
    >
      {label}
    </button>
  );
}
