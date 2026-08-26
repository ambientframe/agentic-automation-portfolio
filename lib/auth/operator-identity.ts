import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import type { BusinessProfile } from '@/lib/model/profile';
import type { AuthorityLevel } from '@/lib/model/system';

/**
 * THE OPERATOR AUTHENTICATION BOUNDARY.
 *
 * Until this module existed, a caller chose its own authority. `POST .../decide` accepted
 * `decidedBy: 'client-partner'` in the request body, and the engine then enforced that role's
 * ceiling faithfully — against an identity nobody had ever verified. Every authority guarantee
 * in this portfolio rested on the caller being honest about who they were.
 *
 * TWO QUESTIONS, KEPT APART. This module answers exactly one of them:
 *
 *   AUTHENTICATION (here)        who is this?          a signature nobody can forge
 *   AUTHORIZATION  (the engine)  what may they do?     the profile's own role ceilings
 *
 * The split is why this file contains no threshold, no decision rule, and no notion of what
 * any action requires. It resolves a principal to its CANONICAL role id and hands back the
 * ceiling the profile already declares. It never compares that ceiling to anything. A
 * `lib/auth` module that started deciding what a role may approve would have quietly become a
 * second authorization policy competing with the engine's.
 *
 * WHY A SIGNATURE AND NOT A HEADER. Moving `decidedBy` from the body to `X-Operator-Id` would
 * change nothing: it is still the caller asserting who they are. A token here is
 * `v1.<payload>.<HMAC-SHA256(payload)>`, and the HMAC is computed over the encoded payload
 * segment with a key the caller does not hold. Editing the principal inside the payload
 * invalidates the signature; minting a fresh token requires the key. Comparison is
 * constant-time, and the signature is checked BEFORE the payload is ever parsed, so a tampered
 * token is refused as tampered rather than being decoded and reasoned about.
 *
 * WHAT THIS IS NOT. There is no login here, no password, no MFA, no identity provider, and no
 * federation. This proves that a request BEARS a credential only its issuer could have made,
 * and that the credential resolves to one canonical operator. How a human comes to hold that
 * credential in the first place is a login system, which needs real accounts and is outside
 * this package. See `app/api/lead-rescue/operator-session/route.ts` for the prototype
 * affordance that stands in for it, and the conditions under which it refuses to exist.
 *
 * FAIL CLOSED, EVERY BRANCH. Missing, malformed, wrongly-signed, expired, unknown-principal,
 * and unknown-role all return a typed refusal. There is no branch that returns a principal on
 * a doubt.
 */

export const OPERATOR_TOKEN_VERSION = 'v1';

/**
 * The canonical operator registry — IDENTITY only. Each principal names a role id that must
 * exist in the profile; the AUTHORITY attached to that role is read from the profile at
 * authentication time and never duplicated here, so this table can never drift into being a
 * second, quietly-disagreeing source of what an operator may do.
 *
 * Synthetic people for a fictional business, deliberately spanning the authority gate. Names
 * are distinct from every prospect/contact name used elsewhere in the portfolio so an operator
 * and a lead can never be confused for one another when reading evidence.
 */
export interface OperatorPrincipalRecord {
  readonly principalId: string;
  readonly displayName: string;
  /** Must match an id in `profile.roles`. Authority is resolved from there, never stored here. */
  readonly roleId: string;
}

export const OPERATOR_PRINCIPALS: readonly OperatorPrincipalRecord[] = [
  { principalId: 'op-priya-raman', displayName: 'Priya Raman', roleId: 'founder' },
  { principalId: 'op-marisol-adeyemi', displayName: 'Marisol Adeyemi', roleId: 'client-partner' },
  { principalId: 'op-lena-fischer', displayName: 'Lena Fischer', roleId: 'ops-coordinator' },
  { principalId: 'op-tobias-lindqvist', displayName: 'Tobias Lindqvist', roleId: 'analyst' },
];

export const AUTHENTICATION_FAILURE_REASONS = [
  /** No credential was presented at all. */
  'MISSING_CREDENTIAL',
  /** A credential was presented but is not a well-formed operator token. */
  'MALFORMED_CREDENTIAL',
  /** Well-formed, but not signed by this runtime's key — forged, tampered, or foreign. */
  'INVALID_SIGNATURE',
  /** Correctly signed, but past its own expiry. A valid signature is not a valid session. */
  'EXPIRED',
  /** Correctly signed and current, but names nobody this application recognises. */
  'UNKNOWN_PRINCIPAL',
  /** The principal names a role the profile does not define. Fails closed rather than assuming. */
  'UNKNOWN_ROLE',
] as const;
export type AuthenticationFailureReason = (typeof AUTHENTICATION_FAILURE_REASONS)[number];

/**
 * Module-private brand. Not exported, so no code outside this file can produce a value of this
 * type without an `as` cast — and an `as` cast still fails the runtime check below, because
 * the WeakSet only ever receives objects this module actually minted.
 */
const AUTHENTICATED = Symbol('lead-rescue.authenticated-principal');

export interface AuthenticatedPrincipal {
  readonly principalId: string;
  readonly displayName: string;
  /** Canonical role id, resolved from the registry — never from the request. */
  readonly roleId: string;
  /** Read from `profile.roles` at authentication time. This module never compares it to anything. */
  readonly authorityCeiling: AuthorityLevel;
  readonly authenticatedAt: string;
  readonly [AUTHENTICATED]: true;
}

/**
 * The runtime half of the guarantee. A hand-built object can satisfy the TYPE through a cast;
 * it cannot get into this set, because only `mintPrincipal` below ever adds to it.
 */
const issuedPrincipals = new WeakSet<object>();

export function isAuthenticatedPrincipal(value: unknown): value is AuthenticatedPrincipal {
  return typeof value === 'object' && value !== null && issuedPrincipals.has(value);
}

/**
 * The guard consequential code calls before acting on a principal. Throws rather than
 * returning a refusal: reaching here with a forged object is a programming error inside the
 * application, not an untrusted request, and must never be recoverable into a permitted action.
 */
export function requireAuthenticatedPrincipal(value: unknown): AuthenticatedPrincipal {
  if (!isAuthenticatedPrincipal(value)) {
    throw new Error(
      'A value was used as an AuthenticatedPrincipal without having been produced by authenticateOperator(). Refusing to treat it as an identity.',
    );
  }
  return value;
}

function mintPrincipal(
  record: OperatorPrincipalRecord,
  authorityCeiling: AuthorityLevel,
  authenticatedAt: string,
): AuthenticatedPrincipal {
  const principal: AuthenticatedPrincipal = {
    principalId: record.principalId,
    displayName: record.displayName,
    roleId: record.roleId,
    authorityCeiling,
    authenticatedAt,
    [AUTHENTICATED]: true,
  };
  issuedPrincipals.add(principal);
  return principal;
}

export type AuthenticationResult =
  | { readonly kind: 'AUTHENTICATED'; readonly principal: AuthenticatedPrincipal }
  | { readonly kind: 'REFUSED'; readonly reason: AuthenticationFailureReason; readonly detail: string };

const TokenPayloadSchema = z.strictObject({
  principalId: z.string().min(1),
  issuedAt: z.string().min(1),
  expiresAt: z.string().min(1),
});

function sign(payloadSegment: string, signingKey: string): string {
  return createHmac('sha256', signingKey).update(payloadSegment).digest('base64url');
}

/**
 * Mints a token for a principal. Called by the prototype session route and by proofs — never
 * by a request handler on behalf of the requester, which would make the credential worthless.
 */
export function mintOperatorToken(principalId: string, signingKey: string, issuedAt: string, expiresAt: string): string {
  const payloadSegment = Buffer.from(JSON.stringify({ principalId, issuedAt, expiresAt })).toString('base64url');
  return `${OPERATOR_TOKEN_VERSION}.${payloadSegment}.${sign(payloadSegment, signingKey)}`;
}

/** Constant-time, and length-safe: `timingSafeEqual` throws on a length mismatch. */
function signatureMatches(expected: string, presented: string): boolean {
  const a = Buffer.from(expected);
  const b = Buffer.from(presented);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * THE ONE ENTRY POINT. Returns a principal or a typed refusal — never a partially-trusted
 * value, and never `null` meaning "probably fine".
 *
 * `profile` supplies the authority ceiling. Passing it in rather than importing a specific
 * business profile keeps this module retargetable and keeps the authority source explicit at
 * every call site.
 */
export async function authenticateOperator(
  authorizationHeader: string | null | undefined,
  signingKey: string,
  nowIso: string,
  profile: BusinessProfile,
  registry: readonly OperatorPrincipalRecord[] = OPERATOR_PRINCIPALS,
): Promise<AuthenticationResult> {
  const refuse = (reason: AuthenticationFailureReason, detail: string): AuthenticationResult => ({ kind: 'REFUSED', reason, detail });

  if (authorizationHeader === null || authorizationHeader === undefined || authorizationHeader.trim() === '') {
    return refuse('MISSING_CREDENTIAL', 'No operator credential was presented.');
  }

  // A present-but-wrong scheme is a malformed attempt, not an absent one. The distinction
  // matters to an operator reading refusals: "nobody tried" and "somebody tried badly" are
  // different operational facts.
  const match = /^Bearer\s+(\S+)$/.exec(authorizationHeader.trim());
  if (match === null) {
    return refuse('MALFORMED_CREDENTIAL', 'The operator credential was not presented as a bearer token.');
  }

  const parts = (match[1] as string).split('.');
  if (parts.length !== 3 || parts[0] !== OPERATOR_TOKEN_VERSION) {
    return refuse('MALFORMED_CREDENTIAL', 'The operator credential is not a recognised token.');
  }
  const [, payloadSegment, presentedSignature] = parts as [string, string, string];

  // SIGNATURE FIRST, ALWAYS. A tampered token is refused as tampered; its payload is never
  // parsed, so nothing attacker-controlled is ever decoded and reasoned about.
  if (!signatureMatches(sign(payloadSegment, signingKey), presentedSignature)) {
    return refuse('INVALID_SIGNATURE', 'The operator credential is not signed by this runtime.');
  }

  let payload: z.infer<typeof TokenPayloadSchema>;
  try {
    payload = TokenPayloadSchema.parse(JSON.parse(Buffer.from(payloadSegment, 'base64url').toString('utf8')));
  } catch {
    return refuse('MALFORMED_CREDENTIAL', 'The operator credential carries no readable claim set.');
  }

  const expiresAtMs = Date.parse(payload.expiresAt);
  const nowMs = Date.parse(nowIso);
  if (Number.isNaN(expiresAtMs) || Number.isNaN(nowMs)) {
    return refuse('MALFORMED_CREDENTIAL', 'The operator credential carries no readable validity window.');
  }
  if (nowMs >= expiresAtMs) {
    return refuse('EXPIRED', 'The operator credential is past its validity window.');
  }

  const record = registry.find((candidate) => candidate.principalId === payload.principalId);
  if (record === undefined) {
    return refuse('UNKNOWN_PRINCIPAL', 'The operator credential names a principal this application does not recognise.');
  }

  const role = profile.roles.find((candidate) => candidate.id === record.roleId);
  if (role === undefined) {
    return refuse('UNKNOWN_ROLE', 'The principal names a role this profile does not define. Refusing to assume an authority.');
  }

  return { kind: 'AUTHENTICATED', principal: mintPrincipal(record, role.authorityCeiling, nowIso) };
}
