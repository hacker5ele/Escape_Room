import type { Authenticator } from './authenticator.js'

/** Header the fake authenticator reads to decide who is calling. */
export const TEST_USER_HEADER = 'x-test-user'

/**
 * Stands in for Clerk in tests.
 *
 * A request carrying `x-test-user: user_1` is that user; a request without the
 * header is signed out. That keeps the suite fast, offline and free of any
 * Clerk key, and it makes "user A cannot reach user B's game" a one-line test.
 *
 * Only ever injected explicitly through `createApp({ authenticator })`, so
 * there is no path by which it could be reached in a real deployment.
 */
export function createTestAuthenticator(): Authenticator {
  return {
    async identify(req) {
      return req.header(TEST_USER_HEADER) ?? null
    },
    async displayName(userId) {
      return `Player ${userId}`
    },
  }
}
