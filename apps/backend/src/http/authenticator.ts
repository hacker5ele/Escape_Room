import type { Request } from 'express'
import { clerkClient, getAuth } from '@clerk/express'

/**
 * How the API learns who is calling.
 *
 * An interface rather than a direct Clerk call so the test suite can run
 * without contacting Clerk or holding an API key — the same reason
 * `createApp()` already injects the rate limit and the origin secret.
 *
 * Only `identify` runs per request, and it is a local signature check with no
 * network call. `displayName` reaches Clerk's API, so it is used once when a
 * game is created and never on the hot path.
 */
export interface Authenticator {
  /** The verified Clerk user id, or null if the request carries no valid session. */
  identify(req: Request): Promise<string | null>
  /** A human-readable name for the sign-up. Best effort — never throws. */
  displayName(userId: string): Promise<string>
}

export function createClerkAuthenticator(): Authenticator {
  return {
    async identify(req) {
      // Populated by clerkMiddleware(). Verifies the token signature against
      // Clerk's JWKS locally, so this costs no round trip.
      const { isAuthenticated, userId } = getAuth(req)
      return isAuthenticated && userId ? userId : null
    },

    async displayName(userId) {
      try {
        const user = await clerkClient.users.getUser(userId)
        const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ').trim()
        return fullName || user.username || user.emailAddresses[0]?.emailAddress || 'Player'
      } catch {
        // A missing display name must never stop somebody starting a game.
        return 'Player'
      }
    },
  }
}
