# ADR-0024: Friend graph and invite links

- **Status:** Accepted
- **Date:** 2026-08-04
- **Deciders:** Nepomuk Crhonek
- **Supersedes:** —

## Context

The escape room is a solitary game. You sign in, you play alone, and nothing connects you to
anybody else. We want players to find each other, see who they are before agreeing to anything,
and eventually chat and play together.

Two ways of finding somebody were on the table, and we chose to build both:

1. **By username** — you know who you are looking for and type their name.
2. **By link** — you send a URL to somebody who may not have an account yet.

The link case is what shapes the design. A link has to work *before* the recipient signs in, or it
is not a link, it is an instruction to go and register first. So one endpoint here is deliberately
public, and that endpoint has to be designed as if strangers will hit it — because they will.

## Decision

### Friendships are stored twice, written once

Every friendship exists as two rows: `(A, B)` and `(B, A)`, in a table keyed on
`userId` + `otherUserId`. Each row carries the status from *its owner's* point of view —
`pending_out`, `pending_in`, `accepted` or `blocked`.

Storing it twice means "list my friends" is a single Query on my own partition. Storing it once
would make it a query plus a scan of the whole table for rows pointing back at me, which is the
kind of thing that works fine with four test accounts and falls over with four hundred.

The two rows are written in a **`TransactWriteItems`**, so they are created, accepted and deleted
atomically. Without that, a crash between two `PutItem` calls leaves a permanently one-sided
friendship: A has B, B does not have A, and no code path ever repairs it. That state is invisible
to the person who caused it and inexplicable to the person who suffers it.

### Blocking writes only one side

This is the one deliberate exception to the double write, and it exists because of a bug found
while building it.

When a blocked person sends a friend request, the natural implementation writes both sides of the
pair — and in doing so overwrites the blocker's `blocked` row with a `pending_in` one. Sending a
request would become the way *out* of being blocked, which is precisely backwards.

So the request path writes **only the requester's own row** when the other side has blocked them.
The requester sees an ordinary unanswered request. The blocker sees nothing at all. The block
survives.

The requester is not told they are blocked, on purpose. Telling them converts a quiet, effective
block into a prompt to make a second account.

### Invite tokens rather than username links

An invite link carries a random token — 16 bytes from `randomBytes`, base64url encoded, 22
characters, 128 bits — not a username.

This started as a control decision (a token can be revoked, a username cannot) and turned out to
matter more for privacy. A URL containing a username is a public oracle: anybody can construct one
and learn whether that person exists here. A random token confirms nothing, so the public preview
endpoint cannot be used to enumerate our players. Given that a rival team gets the app on
Thursday, that is worth more than the convenience of a readable link.

Links expire after seven days by default and can be revoked at any time.

### Unknown, revoked and expired are the same error

All three return `404 INVITE_INVALID` with identical wording. Distinguishing them tells somebody
probing tokens which ones once existed, and tells a blocked person their link was pulled — which,
again, invites a second account.

The same reasoning applies to revoking a link you do not own: it reports exactly what a
non-existent token reports, so it cannot be used to test whether a token is real.

### Expiry is enforced in code, not by the database

The `invites` table has a DynamoDB TTL on `expiresAtEpoch`, but TTL deletion is **best-effort and
can lag by hours**. Relying on it would leave expired links working well past their expiry. The
service checks `expiresAt` on every read; the TTL is housekeeping so the table does not grow
forever.

### Unfriending and blocking exist now, not later

Both ship in the first version rather than being deferred. This is a school project where everyone
knows each other, which makes an escape hatch from unwanted contact more necessary, not less. A
social feature without one is not finished.

## Consequences

**Good**

- Listing friends is one query, and both directions can never disagree.
- Invite links work before the recipient has an account, which is what makes them shareable.
- Nothing in the public surface can be used to discover whether a given player exists.
- The block cannot be walked around, and there is a test proving it.

**Bad**

- Every friendship costs two rows and every change costs a transaction. At this scale the cost is
  irrelevant; the correctness is not.
- Orphaned invite rows linger until DynamoDB's reaper gets to them.
- Someone can mint unlimited links. Rate-limited, and each is harmless on its own, so this is
  accepted rather than solved.

**Notable**

- The App Runner instance role previously had **no `dynamodb:Query` permission at all** — the games
  table only ever needed key lookups. Both new tables need it, and the two GSIs need the
  `/index/*` ARN as well as the table ARN. Granting only the table is the usual way this fails at
  runtime instead of at plan time.

## Alternatives considered

**Single-table design.** The idiomatic DynamoDB answer, and the wrong one here. Three students have
to reason about this under time pressure on Wednesday, and on-demand billing makes extra tables
effectively free. Clarity beats elegance this week.

**Storing each friendship once, canonically ordered.** Half the rows and no transaction needed, but
every read becomes two queries, and per-side state like `blocked` has nowhere natural to live.

**Permanent username links (`/add/nepomuk`).** Nicer to read, impossible to revoke, and a working
enumeration oracle. Rejected — see above.
