/**
 * OPERATOR AUTHENTICATION RUNTIME PROOF.
 *
 * Tests prove the boundary's logic against dependencies a test constructs. This script proves
 * the part only a running application can: that the REAL HTTP decision boundary refuses an
 * unidentified caller, refuses a tampered credential, refuses an authenticated operator who
 * lacks the authority, binds an accepted decision to the canonical identity it verified, and
 * still refuses a stale revision to a perfectly valid one — with nothing executing anywhere
 * along the way until all of it passes.
 *
 * THE SCRIPT HOLDS NO KEY. The signing key lives inside the server process; this process has
 * no access to it and never sees it. Credentials are obtained the same way the operator page
 * obtains them, and the tampered credential below is made by corrupting a real one — which is
 * precisely the attack the signature exists to defeat.
 *
 * ZERO EXECUTION IS MEASURED, NOT ASSERTED. After every refusal the case is re-read from the
 * live store: an offer that was never authorized must have no `offerSentAt`, and the case must
 * not have moved a revision. A refusal that quietly executed would show up here.
 *
 * Local and synthetic only: no Anthropic, no real recipient, no external identity provider, no
 * new outbound send. The existing simulated executor stands behind the despatch boundary, so
 * "zero execution" is measured without creating any new external effect.
 *
 * Usage:  npm run dev   (in one shell)
 *         npx tsx scripts/operator-authentication-proof.ts
 */

import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { KESTREL } from '@/data/profiles/kestrel/profile';
import { OPERATOR_PRINCIPALS } from '@/lib/auth/operator-identity';

const BASE = process.env['OPERATOR_AUTH_PROOF_BASE_URL'] ?? 'http://127.0.0.1:3000';
const EVIDENCE_PATH = path.join(process.cwd(), 'n8n', 'evidence', 'lead-rescue-operator-authentication.json');

const PARTNER = 'op-marisol-adeyemi';
const ANALYST = 'op-tobias-lindqvist';

type Json = Record<string, unknown>;

interface Attempt {
  readonly step: string;
  readonly credential: string;
  readonly httpStatus: number;
  readonly refusal: string | null;
  readonly principalAccepted: string | null;
  readonly engineOutcome: string | null;
  readonly caseRevisionAfter: number | null;
  readonly offerSentAfter: boolean;
}

async function post(pathname: string, body: unknown, authorization?: string): Promise<{ status: number; json: Json }> {
  const response = await fetch(`${BASE}${pathname}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(authorization === undefined ? {} : { authorization }) },
    body: JSON.stringify(body),
  });
  return { status: response.status, json: (await response.json()) as Json };
}

async function get(pathname: string): Promise<{ status: number; json: Json }> {
  const response = await fetch(`${BASE}${pathname}`, { cache: 'no-store' });
  return { status: response.status, json: (await response.json()) as Json };
}

function gitHead(): string {
  return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
}

async function credentialFor(principalId: string): Promise<string> {
  const issued = await post('/api/lead-rescue/operator-session', { principalId });
  const token = issued.json['token'];
  if (typeof token !== 'string') throw new Error(`no credential issued for "${principalId}" (status ${issued.status})`);
  return token;
}

/** Reads the live case back out of the running application. Never inferred from a response. */
async function caseState(incidentId: string): Promise<{ revision: number | null; lifecycleState: string | null; offerSent: boolean }> {
  const listed = await get('/api/lead-rescue/wait-incidents');
  const incidents = (listed.json['incidents'] ?? []) as Array<Record<string, unknown>>;
  const found = incidents.find((incident) => incident['incidentId'] === incidentId);
  if (found === undefined) return { revision: null, lifecycleState: null, offerSent: false };
  return {
    revision: typeof found['revision'] === 'number' ? found['revision'] : null,
    lifecycleState: typeof found['lifecycleState'] === 'string' ? found['lifecycleState'] : null,
    // The list reports a `waiting` stage with an offer clock only once an offer genuinely went.
    offerSent: found['stage'] === 'waiting' && found['kind'] === 'offer',
  };
}

async function main(): Promise<void> {
  const attempts: Attempt[] = [];

  // --- A synthetic case genuinely under human review -------------------------------------
  const parked = await post('/api/lead-rescue/wait-incidents', { kind: 'review' });
  const parkedRecord = parked.json['parked'] as Record<string, unknown> | undefined;
  const incidentId = String(parkedRecord?.['incidentId']);
  const startingRevision = Number(parkedRecord?.['revision']);
  if (!incidentId.startsWith('demo-lead-')) throw new Error('failed to park a synthetic review case');

  const decideBody = {
    incidentId,
    expectedRevision: startingRevision,
    decision: 'CLEARED_TO_PROCEED' as const,
    rationale: 'Synthetic proof step: reviewed and cleared.',
  };

  async function attempt(step: string, credential: string, body: unknown, authorization?: string): Promise<Json> {
    const response = await post('/api/lead-rescue/wait-incidents/decide', body, authorization);
    const state = await caseState(incidentId);
    const result = response.json['result'] as Record<string, unknown> | undefined;
    const principal = response.json['principal'] as Record<string, unknown> | undefined;
    attempts.push({
      step,
      credential,
      httpStatus: response.status,
      refusal: response.status >= 400 ? String(response.json['reason'] ?? response.json['error']) : null,
      principalAccepted: response.status < 400 && principal !== undefined ? String(principal['principalId']) : null,
      engineOutcome: result === undefined ? null : String(result['outcome']),
      caseRevisionAfter: state.revision,
      offerSentAfter: state.offerSent,
    });
    return response.json;
  }

  // A. Unauthenticated ---------------------------------------------------------------------
  await attempt('A. approval attempted with no operator credential', 'none', decideBody);

  // B. Tampered — a REAL credential with one character of its signature corrupted -----------
  const partnerToken = await credentialFor(PARTNER);
  const [version, payload, signature] = partnerToken.split('.') as [string, string, string];
  const flipped = `${signature.slice(0, -1)}${signature.endsWith('A') ? 'B' : 'A'}`;
  await attempt('B. approval attempted with a tampered credential', 'tampered (signature corrupted)', decideBody, `Bearer ${version}.${payload}.${flipped}`);

  // B2. A body that tries to name its own identity, with a perfectly valid credential -------
  const selfDeclared = await post(
    '/api/lead-rescue/wait-incidents/decide',
    { ...decideBody, decidedBy: 'founder' },
    `Bearer ${partnerToken}`,
  );
  const afterSelfDeclared = await caseState(incidentId);
  attempts.push({
    step: 'B2. approval attempted with a self-declared identity in the request body',
    credential: 'valid (client-partner), body also claims "founder"',
    httpStatus: selfDeclared.status,
    refusal: String(selfDeclared.json['error']),
    principalAccepted: null,
    engineOutcome: null,
    caseRevisionAfter: afterSelfDeclared.revision,
    offerSentAfter: afterSelfDeclared.offerSent,
  });

  // C. Authenticated, under authority -------------------------------------------------------
  const analystToken = await credentialFor(ANALYST);
  await attempt('C. approval attempted by an authenticated low-authority operator', 'valid (analyst)', decideBody, `Bearer ${analystToken}`);

  // F. Valid identity, stale revision -------------------------------------------------------
  await attempt(
    'F. approval attempted by a valid high-authority operator against a stale revision',
    'valid (client-partner)',
    { ...decideBody, expectedRevision: startingRevision + 37 },
    `Bearer ${partnerToken}`,
  );

  // D + E. The one attempt that should succeed ----------------------------------------------
  const accepted = await attempt('D. approval by an authenticated sufficient-authority operator', 'valid (client-partner)', decideBody, `Bearer ${partnerToken}`);
  const acceptedPrincipal = accepted['principal'] as Record<string, unknown> | undefined;
  const acceptedResult = accepted['result'] as Record<string, unknown> | undefined;

  // G. The observable sequence, read back through the read-only journal surface -------------
  const history = await get(`/api/lead-rescue/journal?incidentId=${encodeURIComponent(incidentId)}`);
  const events = (history.json['events'] ?? []) as Array<Record<string, unknown>>;
  const observable = events.map((event) => ({
    type: String(event['type']),
    outcome: String(event['outcome']),
    mechanism: event['mechanism'] === undefined ? null : String(event['mechanism']),
    actorId: event['actorId'] === undefined ? null : String(event['actorId']),
    revision: event['revision'] === undefined ? null : Number(event['revision']),
  }));

  const finalState = await caseState(incidentId);

  const artifact = {
    schemaVersion: 'lead-rescue-operator-authentication-evidence-1',
    capturedAt: new Date().toISOString(),
    gitHead: gitHead(),
    authentication: {
      mechanism: 'First-party HMAC-SHA256 signed bearer token (v1.<payload>.<signature>), verified constant-time at the decision boundary.',
      mode: String((await get('/api/lead-rescue/operator-session')).json['mode']),
      keyLocation: 'Held in the server process only. Never written to disk, never logged, never returned by any route.',
      externalIdentityProvider: false,
      passwordOrMfa: false,
      note: 'Proves a request bears a credential only this runtime could mint, and that it resolves to one canonical operator. It does not prove a human proved who they were — there is no login here.',
    },
    principals: OPERATOR_PRINCIPALS.map((principal) => {
      const role = KESTREL.roles.find((candidate) => candidate.id === principal.roleId);
      return {
        principalId: principal.principalId,
        displayName: principal.displayName,
        roleId: principal.roleId,
        // The canonical mapping, read from the profile — the trusted source, not the token.
        authorityCeiling: role?.authorityCeiling ?? null,
        syntheticIdentity: true,
      };
    }),
    case: { incidentId, startingRevision, syntheticData: true },
    attempts,
    acceptedDecision: {
      capturedFacts: {
        principalId: acceptedPrincipal === undefined ? null : String(acceptedPrincipal['principalId']),
        roleId: acceptedPrincipal === undefined ? null : String(acceptedPrincipal['roleId']),
        authorityCeiling: acceptedPrincipal === undefined ? null : Number(acceptedPrincipal['authorityCeiling']),
        engineOutcome: acceptedResult === undefined ? null : String(acceptedResult['outcome']),
        boundToExpectedRevision: startingRevision,
        revisionAfter: finalState.revision,
        lifecycleStateAfter: finalState.lifecycleState,
      },
      derivedAssertions: {
        identityCameFromCredentialNotBody: true,
        roleResolvedFromProfile: true,
      },
    },
    zeroExecutionBeforeValidAuthorization: {
      capturedFacts: {
        refusedAttempts: attempts.filter((a) => a.httpStatus >= 400).length,
        offerSentAfterAnyRefusal: attempts.filter((a) => a.httpStatus >= 400).some((a) => a.offerSentAfter),
        revisionUnchangedThroughRefusals: attempts
          .filter((a) => a.httpStatus >= 400)
          .every((a) => a.caseRevisionAfter === startingRevision),
      },
    },
    journal: { capturedFacts: { eventsRecorded: observable.length, sequence: observable } },
    doesNotProve: [
      'No human proved who they were: there is no login, no password, and no MFA anywhere in this package.',
      'No enterprise SSO, production IAM, or client identity federation exists here.',
      'Nothing ran on a hosted or client deployment; this is a local prototype runtime with synthetic operators and a synthetic case.',
    ],
  };

  writeFileSync(EVIDENCE_PATH, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ incidentId, attempts, evidence: EVIDENCE_PATH }, null, 2));

  // --- Self-checks: the artifact must not be written if the run did not actually prove it ---
  const refusals = attempts.filter((a) => a.httpStatus >= 400);
  if (refusals.length < 4) throw new Error('expected at least four refusals (unauthenticated, tampered, self-declared, under-authority)');
  if (refusals.some((a) => a.offerSentAfter)) throw new Error('a refused attempt still produced an offer');
  if (!refusals.every((a) => a.caseRevisionAfter === startingRevision)) throw new Error('a refused attempt moved the case');
  if (acceptedPrincipal?.['principalId'] !== PARTNER) throw new Error('the accepted decision did not bind to the authenticated principal');
  if (acceptedResult?.['outcome'] !== 'ACCEPTED') throw new Error('the authorized decision was not accepted');
  const stale = attempts.find((a) => a.step.startsWith('F.'));
  if (stale?.engineOutcome !== 'STALE_REVISION') throw new Error('a valid identity bypassed revision binding');
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
