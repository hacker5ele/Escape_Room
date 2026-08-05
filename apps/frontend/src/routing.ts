/**
 * Whether a path segment is a token we are willing to put in a request URL.
 *
 * The router matches `/invite/:token` and will hand over whatever was in that
 * segment. `InvitePage` interpolates it into `/api/invites/${token}`, so this
 * is the guard that keeps a crafted path from smuggling anything into the
 * request — percent-encoded traversal in particular, which survives the
 * browser's own URL normalisation.
 *
 * The alphabet is the one the server actually mints: base64url, from
 * `crypto.randomBytes` (ADR-0024). Anything else is not a link we issued.
 */
export function isInviteToken(value: string | undefined): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value)
}
