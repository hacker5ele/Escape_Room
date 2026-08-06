# ADR-0023: Cache a public profile per player

- **Status:** Accepted
- **Date:** 2026-08-04
- **Deciders:** Nepomuk Crhonek
- **Approved-by:** Nepomuk Crhonek, 2026-08-04

## Context

The social layer — friends, chat, a leaderboard — needs three things the game has never needed:

1. **username → userId.** Adding a friend by username means looking somebody up by a name we do not
   key on. Clerk owns usernames ([ADR-0021](0021-unique-usernames.md)) but Clerk is not a database we
   can index or join against.
2. **Avatars, in bulk.** A friend list, a chat and a leaderboard all show faces. Asking Clerk for each
   one would be a network call per face on screen, on every render.
3. **A display name for somebody else.** The game only ever needed the name of the person signed in.

All three are the same data, and we are already fetching it: `startOrResume` calls Clerk to decide
whether an account is complete enough to play ([ADR-0021](0021-unique-usernames.md)).

## Decision

A `profiles` table caching the public face of each player: `userId`, `username`, `displayName`,
`imageUrl`. A global secondary index on the lower-cased username gives the reverse lookup.

**Written on every sign-in, not just the first.** A changed avatar or name then propagates on the next
visit, and there is no cache to invalidate — the write is idempotent and costs nothing extra because
the Clerk call has already happened.

**It contains only what a player has already made public.** No email address, nothing else Clerk
holds. Anything in this table can end up in front of another player, so the safe rule is that it holds
only things that are already visible.

**A profile is not written for an incomplete account.** Somebody without a username has no public
identity to publish, and a half-formed one would put a nameless row in a friend list.

Avatars are sized at the CDN rather than in CSS. Clerk serves images through a resizing proxy that
accepts `?width=`, so a 32-pixel avatar fetches 64 pixels for retina instead of the original upload —
the difference between a friend list costing kilobytes and megabytes.

## Consequences

- Friends, chat and the leaderboard can all render a person without touching Clerk.
- Username lookup is one indexed query rather than an impossible scan.
- **The cache can be stale.** Somebody who changes their avatar and does not open the game keeps the
  old one everywhere. Refreshing on sign-in makes the window small and the failure harmless.
- **The GSI is eventually consistent**, so a profile written moments ago may not be findable by
  username yet. Callers must treat "not found" as possibly-stale rather than definitely-absent — it
  matters for the case where two people sign up together and immediately try to add each other.
- We now duplicate identity data that Clerk owns. That is the standard trade for not making a network
  call per face, and the copy is derived — it can be rebuilt by everyone signing in once.
- This is the first table needing `dynamodb:Query`, which the App Runner instance role **did not have
  at all**. The game table never needed it: one item per player, fetched by key.

## Alternatives considered

**Ask Clerk on demand, with an in-process cache.** No new table, always fresh. Rejected because the
API runs as a single small container that restarts on every deploy — the cache would be cold
constantly — and because Clerk's rate limits are not something to spend on rendering a list of faces.

**Store a denormalised copy of name and avatar on every friendship, message and leaderboard row.**
Fastest possible reads, no join at all. Rejected because a changed avatar would then have to be
rewritten across every row mentioning that person, which is the classic denormalisation trap.

**Query Clerk's user list by username at lookup time.** Uses the real source of truth, no staleness.
Rejected as a network call on a user-facing path, and it still leaves avatars unsolved.
