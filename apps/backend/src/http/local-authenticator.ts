import type { Authenticator } from './authenticator.js'

/**
 * Local development identity. **Never reachable in a real deployment.**
 *
 * The team builds rooms all week. Requiring a Clerk round trip to do that would
 * mean every developer needs keys, an internet connection and a real account
 * before they can see a puzzle they just wrote. This replaces all of it: type a
 * username and a name, and you are that person.
 *
 * It is, deliberately and obviously, a way to be anybody. That is fine on a
 * laptop and catastrophic anywhere else, so two independent things must both be
 * wrong for it to be live: `AUTH_MODE` must be set to `local`, which no
 * deployed environment does, and `createApp()` refuses outright to build with
 * it when `NODE_ENV` is production.
 *
 * The user id is derived from the username, so signing in again with the same
 * name resumes the same game — which is exactly what you want when testing that
 * progress survives a restart.
 */
export const DEV_USERNAME_HEADER = 'x-dev-username'
export const DEV_FIRST_NAME_HEADER = 'x-dev-first-name'
export const DEV_LAST_NAME_HEADER = 'x-dev-last-name'

/** Prefix on the derived id, so a local game is never mistaken for a Clerk one. */
export const LOCAL_USER_PREFIX = 'local:'

export function createLocalAuthenticator(): Authenticator {
  return {
    async identify(req) {
      const username = normalize(req.header(DEV_USERNAME_HEADER))
      return username ? `${LOCAL_USER_PREFIX}${username}` : null
    },

    async profile(req, userId) {
      // The username is recoverable from the id, so a resumed game keeps its
      // handle even if the browser stopped sending the header.
      const fromId = userId.startsWith(LOCAL_USER_PREFIX)
        ? userId.slice(LOCAL_USER_PREFIX.length)
        : userId

      return {
        username: normalize(req.header(DEV_USERNAME_HEADER)) ?? fromId,
        firstName: normalize(req.header(DEV_FIRST_NAME_HEADER)),
        lastName: normalize(req.header(DEV_LAST_NAME_HEADER)),
        // No avatars locally. The UI falls back to initials, which is also
        // what a real user without a photo sees — so the fallback gets
        // exercised constantly rather than only in production.
        imageUrl: null,
      }
    },
  }
}

/**
 * Trims, and caps length.
 *
 * The values are trusted otherwise — there is nothing to protect when the whole
 * mode is "be whoever you say you are". The cap exists only so a stray header
 * cannot bloat the stored game.
 */
function normalize(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? ''
  return trimmed.length > 0 ? trimmed.slice(0, 64) : null
}
