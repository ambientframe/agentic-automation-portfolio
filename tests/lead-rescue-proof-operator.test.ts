import { describe, expect, it } from 'vitest';
import { readOutcome } from '@/components/proof/operator-console';

/**
 * The operator boundary has ONE request contract: identity is proven, never claimed, and an
 * authority refusal comes back as a 403 carrying the principal the runtime resolved. The panel
 * drives that contract and no other.
 *
 * The outcome-token form is still glossed because it is still a member of the engine's own
 * `DecisionOutcome` and `DispatchOutcome` unions — `lib/service/operator-decision.ts` maps it
 * to a distinct result kind at the HTTP edge rather than deleting it, and a token this panel
 * has no reading for degrades into "unrecognised outcome".
 *
 * These fixtures are transcripts of real responses taken from a running server rather than
 * written from the type definitions, which is the only version of this test worth having: the
 * failure being guarded against is precisely a wrong belief about the wire.
 *
 * What must not happen is the refusal reading as a broken route. A buyer being walked through
 * this page is being shown the authority gate working; "the route refused the request" reads as
 * a defect and throws away the most convincing moment the panel has.
 */
describe('an authority refusal reads as the gate working, in either shape', () => {
  it('reports the engine\u2019s own outcome token as a refusal, not an error', () => {
    const { outcome, reading } = readOutcome({ result: { outcome: 'UNAUTHORIZED' } });
    expect(outcome).toBe('UNAUTHORIZED');
    expect(reading.tone).toBe('REFUSED');
    expect(reading.meaning).toContain('not an error');
  });

  it('reports the 403 the canonical contract returns as the same refusal, and keeps the reason it gave', () => {
    const { outcome, reading } = readOutcome({
      error: 'insufficient authority',
      detail: 'Tobias Lindqvist is authenticated, but the role "analyst" does not hold sufficient authority for this decision.',
      principal: { principalId: 'op-tobias-lindqvist', roleId: 'analyst' },
    });

    expect(outcome).toBe('UNAUTHORIZED');
    expect(reading.tone).toBe('REFUSED');
    expect(reading.headline).toContain('not enough authority');
    // The route names the person and the role; dropping that for generic copy loses the proof.
    expect(reading.meaning).toContain('Tobias Lindqvist');
    expect(reading.meaning).toContain('analyst');
    expect(reading.meaning).toContain('left exactly as it was');
  });

  /**
   * The discriminator is `principal`, and it has to be, because the same boundary refuses for a
   * completely different reason when it cannot establish who is asking. Reading a failed
   * authentication as an authority refusal would claim the authority model was exercised by a
   * request that never reached it.
   */
  it('does not mistake a failed authentication for an authority refusal', () => {
    for (const payload of [
      { error: 'unauthenticated', detail: 'No operator credential was presented.' },
      { error: 'unauthenticated', detail: 'The operator credential was not presented as a bearer token.' },
      { error: 'unauthenticated', detail: 'The credential is past its own expiry.' },
    ]) {
      const { outcome, reading } = readOutcome(payload);
      expect(outcome).toBe('ERROR');
      expect(reading.headline).not.toContain('authority');
      expect(reading.meaning).toBe(payload.detail);
    }
  });

  it('prefers the route\u2019s own detail over its error token, so the log explains itself', () => {
    expect(readOutcome({ error: 'invalid request body', detail: 'Operator identity is never caller-supplied.' }).reading.meaning).toBe(
      'Operator identity is never caller-supplied.',
    );
    // Falls back to the token when no detail is offered, rather than rendering nothing.
    expect(readOutcome({ error: 'invalid request body' }).reading.meaning).toBe('invalid request body');
  });
});
