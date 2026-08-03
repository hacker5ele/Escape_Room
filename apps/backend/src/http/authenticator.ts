import type { Request } from 'express'
import { clerkClient, getAuth } from '@clerk/express'

/** What the game needs to know about a signed-in player. */
export interface PlayerProfile {
  /** Unique across the Clerk instance. Null when the account has not set one. */
  username: string | null
  /** Human-readable name, best effort. */
  playerName: string
}

/**
 * How the API learns who is calling.
 *
 * An interface rather than a direct Clerk call so the test suite can run
 * without contacting Clerk or holding an API key — the same reason
 * `createApp()` already injects the rate limit and the origin secret.
 *
 * Only `identify` runs per request, and it is a local signature check with no
 * network call. `profile` reaches Clerk's API, so it is used once when a game
 * is created and never on the hot path.
 */
export interface Authenticator {
  /** The verified Clerk user id, or null if the request carries no valid session. */
  identify(req: Request): Promise<string | null>
  /** The player's profile, for stamping onto a new game. */
  profile(userId: string): Promise<PlayerProfile>
}

export function createClerkAuthenticator(): Authenticator {
  return {
    async identify(req) {
      // Populated by clerkMiddleware(). Verifies the token signature against
      // Clerk's JWKS locally, so this costs no round trip.
      const { isAuthenticated, userId } = getAuth(req)
      return isAuthenticated && userId ? userId : null
    },

    async profile(userId) {
      try {
        const user = await clerkClient.users.getUser(userId)
        const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ').trim()
        return {
          // Clerk guarantees this is unique across the instance when set, so
          // the game never has to check for collisions itself.
          username: user.username ?? null,
          playerName: fullName || user.username || 'Player',
        }
      } catch {
        // A profile lookup failing must not read as "no username" — that would
        // send a player who has one back to the form. Treat it as unknown and
        // let the caller fail loudly instead.
        throw new Error(`Could not read the Clerk profile for ${userId}`)
      }
    },
  }
}
