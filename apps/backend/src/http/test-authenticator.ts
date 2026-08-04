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
/** Header a test sets to simulate an account with no username yet. */
export const TEST_NO_USERNAME_HEADER = 'x-test-no-username'

export function createTestAuthenticator(): Authenticator {
  return {
    async identify(req) {
      return req.header(TEST_USER_HEADER) ?? null
    },
    async profile(_req, userId) {
      return {
        username: userId === TEST_USER_WITHOUT_USERNAME ? null : `handle_${userId}`,
        firstName: userId === TEST_USER_WITHOUT_NAME ? null : 'Test',
        lastName: userId === TEST_USER_WITHOUT_NAME ? null : 'Player',
        imageUrl: null,
      }
    },
  }
}

/** Identify as this user to exercise the "no username yet" path. */
export const TEST_USER_WITHOUT_USERNAME = 'user_without_username'

/** Identify as this user to exercise the "username but no name" path. */
export const TEST_USER_WITHOUT_NAME = 'user_without_name'
