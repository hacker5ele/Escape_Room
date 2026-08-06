import { clerkClient } from '@clerk/express'

/**
 * Where somebody's email address comes from.
 *
 * Separate from `Authenticator`, which answers "who is calling". This answers
 * "how do I reach somebody who is *not* calling", which is a different question
 * and the only reason the API ever needs an address at all (ADR-0046).
 *
 * **Nothing here reaches a client.** An address is looked up, put in an
 * envelope, and forgotten; it is never stored, never cached and never part of a
 * profile. `PublicProfile` stays public.
 */
export interface Directory {
  /** Their verified address, or null if there is no way to reach them. */
  emailFor(userId: string): Promise<string | null>
}

/** Local development and the test suite. Nobody has an address, so nobody is mailed. */
export class NoDirectory implements Directory {
  async emailFor(): Promise<string | null> {
    return null
  }
}

export function createClerkDirectory(): Directory {
  return {
    async emailFor(userId) {
      try {
        const user = await clerkClient.users.getUser(userId)

        // The primary address if it is verified, and otherwise the first one
        // that is. **Verified only**: mailing an address an account never
        // proved it owns is how somebody's typo becomes a stranger's inbox,
        // and an invitation naming a real person is exactly the kind of thing
        // that should not arrive there.
        const verified = user.emailAddresses.filter(
          (address) => address.verification?.status === 'verified',
        )
        const primary = verified.find((address) => address.id === user.primaryEmailAddressId)

        return (primary ?? verified[0])?.emailAddress ?? null
      } catch {
        // Not being reachable is not an error anybody can act on — the
        // invitation itself has already succeeded, and the bell notification is
        // still there. Swallowed rather than surfaced.
        return null
      }
    },
  }
}
