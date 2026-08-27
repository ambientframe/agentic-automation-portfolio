/**
 * SHARED PROOF CHROME.
 *
 * The three presentational primitives a buyer-facing proof page is built from. They lived
 * inside `app/lead-rescue/page.tsx` while Lead Rescue was the only system with such a page;
 * `app/proof/[slug]/page.tsx` is the second, so they move here rather than being copied.
 *
 * Deliberately dumb: no data access, no derivation, no system knowledge. Everything these
 * render is passed in already computed, which is what lets one set of primitives serve a
 * system with a live operator console and a system without one.
 */

/** Section heading for one act of the argument. */
export function ActHeading({
  act,
  title,
  body,
}: {
  readonly act: string;
  readonly title: string;
  readonly body: string;
}) {
  return (
    <div className="space-y-3 max-w-3xl">
      <span className="label">Part {act}</span>
      <h2 className="display text-2xl sm:text-3xl lg:text-4xl">{title}</h2>
      <p className="text-base leading-relaxed" style={{ color: 'var(--ink-muted)' }}>
        {body}
      </p>
    </div>
  );
}

/** One column of the problem/cost/replacement triptych. */
export function ProblemCard({
  eyebrow,
  body,
  tint,
}: {
  readonly eyebrow: string;
  readonly body: string;
  readonly tint: string;
}) {
  return (
    <div
      className="p-5 space-y-2.5"
      style={{
        background: 'var(--paper-raised)',
        borderBlockStartWidth: '2px',
        borderBlockStartStyle: 'solid',
        borderBlockStartColor: tint,
      }}
    >
      <p className="label" style={{ color: tint }}>
        {eyebrow}
      </p>
      <p className="text-[0.9375rem] leading-relaxed">{body}</p>
    </div>
  );
}

/** A single figure with its own caveat attached. The note is not optional decoration. */
export function HeaderStat({
  label,
  value,
  note,
  tint,
}: {
  readonly label: string;
  readonly value: string;
  readonly note?: string;
  readonly tint?: string;
}) {
  return (
    <div className="space-y-1 min-w-0">
      <dt className="label">{label}</dt>
      <dd className="display text-2xl" style={tint === undefined ? undefined : { color: tint }}>
        {value}
      </dd>
      {note !== undefined && (
        <p className="instrument leading-relaxed" style={{ color: 'var(--ink-faint)' }}>
          {note}
        </p>
      )}
    </div>
  );
}
