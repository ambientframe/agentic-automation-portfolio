import { NextResponse } from 'next/server';
import { z } from 'zod';
import { KESTREL } from '@/data/profiles/kestrel/profile';
import { OPERATOR_PRINCIPALS, mintOperatorToken } from '@/lib/auth/operator-identity';
import { LEAD_RESCUE_OPERATOR_AUTH } from '@/lib/auth/lead-rescue-operator-runtime';

/**
 * THE PROTOTYPE PRINCIPAL SELECTOR — and the honest limit of this package.
 *
 * This is NOT a login. It asks for no password, verifies no human, and contacts no identity
 * provider. It hands out a signed credential for a named synthetic operator so the local
 * operator page can exercise the authenticated decision boundary. Building a real login would
 * require real accounts and a real credential store, which is a different package.
 *
 * WHAT THAT DOES AND DOES NOT UNDERMINE. It means this portfolio does not prove that a human
 * proved who they were. It does NOT weaken what the decision boundary proves: that a request
 * carries a credential only this runtime could have minted, that the credential resolves to
 * one canonical operator, and that authority is read from the profile rather than from the
 * caller. Those hold regardless of how the credential was obtained.
 *
 * AND IT DISAPPEARS WHERE IT WOULD MATTER. In `CONFIGURED_KEY` mode — a runtime somebody
 * deliberately gave a durable signing key — this route refuses to issue anything at all.
 * A deployment with real, restart-surviving credentials must not also expose a faucet that
 * hands an identity to whoever asks, so the faucet is structurally unavailable exactly where
 * it would be dangerous, rather than being guarded by a warning in a comment.
 */
export const dynamic = 'force-dynamic';

const SESSION_TTL_MINUTES = 30;

const SessionRequestSchema = z.strictObject({
  principalId: z.string().min(1),
});

/** Non-secret roster for the operator page's selector. Never includes a key or a token. */
export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    mode: LEAD_RESCUE_OPERATOR_AUTH.mode,
    sessionIssuerEnabled: LEAD_RESCUE_OPERATOR_AUTH.sessionIssuerEnabled,
    principals: OPERATOR_PRINCIPALS.map((principal) => {
      const role = KESTREL.roles.find((candidate) => candidate.id === principal.roleId);
      return {
        principalId: principal.principalId,
        displayName: principal.displayName,
        roleId: principal.roleId,
        roleName: role?.name ?? null,
        authorityCeiling: role?.authorityCeiling ?? null,
      };
    }),
  });
}

export async function POST(request: Request): Promise<NextResponse> {
  if (!LEAD_RESCUE_OPERATOR_AUTH.sessionIssuerEnabled) {
    return NextResponse.json(
      {
        error: 'the prototype principal selector is not available in this runtime',
        mode: LEAD_RESCUE_OPERATOR_AUTH.mode,
        detail:
          'A runtime configured with a durable operator signing key issues no credentials of its own. Operator tokens must be minted out of band.',
      },
      { status: 403 },
    );
  }

  const rawBody: unknown = await request.json().catch(() => ({}));
  const parsed = SessionRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid request body', issues: parsed.error.issues }, { status: 400 });
  }

  const record = OPERATOR_PRINCIPALS.find((candidate) => candidate.principalId === parsed.data.principalId);
  if (record === undefined) {
    return NextResponse.json({ error: 'unknown principal' }, { status: 404 });
  }
  const role = KESTREL.roles.find((candidate) => candidate.id === record.roleId);
  if (role === undefined) {
    // Fails closed: a principal naming a role the profile does not define never gets a token.
    return NextResponse.json({ error: 'principal names a role this profile does not define' }, { status: 500 });
  }

  const issuedAt = new Date();
  const expiresAt = new Date(issuedAt.getTime() + SESSION_TTL_MINUTES * 60_000);

  return NextResponse.json({
    token: mintOperatorToken(
      record.principalId,
      LEAD_RESCUE_OPERATOR_AUTH.signingKey,
      issuedAt.toISOString(),
      expiresAt.toISOString(),
    ),
    expiresAt: expiresAt.toISOString(),
    // The authority is reported so the page can label the selector honestly. It is read from
    // the profile here for display only — the decision boundary resolves it again itself and
    // never trusts anything the client sends back.
    principal: {
      principalId: record.principalId,
      displayName: record.displayName,
      roleId: record.roleId,
      roleName: role.name,
      authorityCeiling: role.authorityCeiling,
    },
  });
}
