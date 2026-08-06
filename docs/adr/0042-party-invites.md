# ADR-0042: Inviting somebody into your game

- **Status:** Accepted
- **Date:** 2026-08-05
- **Deciders:** Nepomuk Crhonek
- **Approved-by:** Nepomuk Crhonek, 2026-08-05
- **Amends:** [ADR-0024](0024-friend-graph-and-invite-links.md), [ADR-0028](0028-co-op-play.md)

## Context

Three pieces of an invite system existed and none of them joined up.

- **Invite links** (ADR-0024) made you *friends*. Following one and then getting into somebody's game
  was two separate steps, and the second one was not obvious.
- **`POST /api/party/invite/:userId`** wrote a `party_invite` notification and nothing else. The
  notification was **dead text** — there was no way to act on it.
- **The lobby's party rail** showed `+ invite a friend` as a plain `<li>`. It was a placeholder that
  did nothing at all.

So the lobby could be shared with nobody.

## Decision

Two ways in, because they answer different questions.

**A friend** is already in your list: one button, and they get a notification they can act on.

**A link** is for somebody who is not — it works before they have an account, shows them who is
inviting them, and following it makes you friends **and** puts them in the party in one step.

### A party link is a flag on the existing invite, not a second kind of token

`InviteRecord` gains `partyHostUserId`. The expiry, the revocation, the 128-bit token and the public
preview all already work and none of that was worth building twice.

It stores **the minter's own id, always** — a link cannot invite somebody into a party that is not
the minter's to share.

Stored rather than derived, because the inviter may have left their own game by the time the link is
followed. The link then quietly becomes an ordinary friend link rather than an error, which is the
right answer: the friendship half of it is still perfectly good.

### Joining is best-effort, and the friendship is not

Accepting a party link befriends first, then tries to join. If the join fails — the party filled up,
the host left — **the friendship still stands** and the visitor lands in their own lobby.

Undoing a friendship somebody just agreed to, because of a race they had no part in, would be a
worse answer than a slightly disappointing landing. There is a test for it.

### The preview says how many, never who

`InvitePreview` gains `party: { size, full } | null`, so the page can say *"wants you to play, 2
already in"* rather than *"wants to be your friend"* — a different question deserving a different
button.

Only a count. Who is in the party is not something a stranger holding a link needs before deciding,
and ADR-0024's rule that the preview leaks nothing beyond the inviter's public profile is enforced by
a test that had to be *extended* rather than relaxed.

### The notification became a door

A `party_invite` row in the bell now carries a **Join their game** button. It was the one
notification worth acting on from there — everything else in that list is news, and this is an
invitation.

If the join fails it still navigates to the lobby, because the lobby can explain what happened
better than a line in a dropdown.

## Consequences

**Good**

- The lobby can actually be shared, by either route.
- No new table, no new token type, no new endpoint — one flag, one nullable field, one button.
- A link that outlives its party degrades to a friend link instead of failing.

**Bad**

- **An interface change**: `Invite.forParty`, `InvitePreview.party`, and a body on `POST
  /api/invites`. Rule 7 asks for prior agreement with the whole team and that has not happened —
  flagged on the PR rather than skipped, as with ADR-0036 and ADR-0038.
- "Asked" state in the invite panel is local. The server has no record of an invitation because an
  invitation *is* a notification, not a relationship — so a reload forgets who you asked. Correct,
  and mildly annoying.
- `InviteService` now depends on `PartyService`, which fixes their construction order in `app.ts`.

**Notable**

- The party cap of four (ADR-0038) is what `full` reports, so a link to a full party says so on the
  preview rather than failing at the end.

## Alternatives considered

**A separate `/party/:hostUserId` link.** No token to mint and nothing to revoke — and it would put
a user id in a URL people paste into group chats, and be unrevocable by construction. The whole point
of ADR-0024's tokens was that a link can be withdrawn.

**Making the join atomic with the friendship** — either both or neither. Tidier, and it means a full
party costs you a friendship you had already agreed to.

**Auto-joining the party when a notification arrives.** Removes a click and moves somebody out of
their own half-finished game without asking, which ADR-0028 refused for exactly that reason.
