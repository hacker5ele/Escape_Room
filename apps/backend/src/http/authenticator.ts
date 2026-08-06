import type { Request } from 'express'
import { clerkClient, getAuth } from '@clerk/express'

/**
 * What the game needs to know about a signed-in player.
 *
 * Each field is nullable and reported separately rather than collapsed into a
 * single display name. Collapsing them would hide which piece is missing, and
 * the profile form needs to ask for exactly that and nothing else.
 */
export interface PlayerProfile {
  /** Unique across the instance. Null when the account has not set one. */
  username: string | null
  firstName: string | null
  lastName: string | null
  /** Avatar URL, or null. Public CDN URL from the identity provider. */
  imageUrl: string | null
}

/**
 * How the API learns who is calling.
 *
 * An interface rather than a direct Clerk call for three reasons: the test
 * suite runs without a Clerk key or a network, local development runs without
 * Clerk at all (see `local-authenticator.ts`), and it keeps the game services
 * from knowing which identity provider is in use.
 *
 * Only `identify` runs per request, and for Clerk it is a local signature check
 * with no round trip. `profile` may reach the network, so it is called once
 * when a game is created and never on the path for playing.
 */
export interface Authenticator {
  /** The verified user id, or null if the request carries no valid session. */
  identify(req: Request): Promise<string | null>
  /**
   * The player's profile, for stamping onto a new game.
   *
   * Takes the request as well as the id because not every provider stores
   * profiles server-side — the local development one reads them off the
   * request itself.
   */
  profile(req: Request, userId: string): Promise<PlayerProfile>
}

export function createClerkAuthenticator(): Authenticator {
  return {
    async identify(req) {
      // Populated by clerkMiddleware(). Verifies the token signature against
      // Clerk's JWKS locally, so this costs no round trip.
      const { isAuthenticated, userId } = getAuth(req)
      return isAuthenticated && userId ? userId : null
    },

    async profile(_req, userId) {
      try {
        const user = await clerkClient.users.getUser(userId)
        return {
          // Clerk guarantees this is unique across the instance when set, so
          // the game never has to check for collisions itself.
          username: user.username ?? null,
          firstName: user.firstName ?? null,
          lastName: user.lastName ?? null,
          imageUrl: user.imageUrl ?? null,
        }
      } catch {
        // A lookup failing must not read as "no username" — that would send a
        // player who has one back to the form. Fail loudly instead.
        throw new Error(`Could not read the Clerk profile for ${userId}`)
      }
    },
  }
}
