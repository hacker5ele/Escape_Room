# ADR-0034: A global leaderboard beside the friends one

- **Status:** Accepted
- **Date:** 2026-08-05
- **Deciders:** Nepomuk Crhonek
- **Approved-by:** Nepomuk Crhonek, 2026-08-05
- **Amends:** [ADR-0027](0027-friends-leaderboard.md)

## Context

[ADR-0027](0027-friends-leaderboard.md) gave the game a leaderboard scoped to friends, and said so
explicitly: *there is no global board*. The reasoning was written into the service and the route as
well — *"a class leaderboard is a way to make the slowest person feel bad in public; among people who
chose each other it is a reason to keep playing"*.

That reasoning has not stopped being true. But it decided the question on behalf of players who had
not been asked, and it left a real gap: on demo day there is no way to see where the room as a whole
has got to, which is the obvious thing to want when everybody is playing the same four rooms at the
same time.

## Decision

Both boards exist. `GET /api/leaderboard/global` joins `GET /api/leaderboard/friends`, and the
leaderboard panel gains a **Friends / Everyone** switch.

**Friends stays the default view.** That is the whole of ADR-0027's concern, carried forward rather
than discarded: the board somebody sees without choosing is the one scoped to people who chose each
other. Seeing the whole class is now possible, but it is a thing you opt into.

**Only players who have started a game appear on the global board.** Somebody who registered and
never opened a room is not last — they are not playing, and putting them at the bottom of a public
ranking says something untrue about them. The friends board still shows them, because there they are
your friend rather than a stranger's rival.

**The response shape is unchanged.** Both endpoints return `LeaderboardResponse`, so
`packages/shared` is untouched and the client renders one component either way. Both boards are built
from the same `toEntry` and sorted by the same `compare`, so a player cannot be above somebody on one
board and below them on the other — that is asserted in a test rather than left to inspection.

**The endpoint takes no parameters.** No page size, no offset, no sort. A caller cannot make the one
scan in the app more expensive than it already is.

### The cost, stated plainly

There is no index of "all players", so the global board is a **DynamoDB Scan** — the only one in the
codebase. DynamoDB reads and bills for every item it examines. That is acceptable here because the
profiles table holds one small row per player and the result is capped at 200, but it is the single
call whose cost grows with the number of accounts. If the global board ever gets slow, this is why,
and the fix is a secondary index rather than a bigger limit.

The scan is also **paged**, because `Limit` bounds the items DynamoDB *examines* rather than the ones
it returns — a single call can come back short while more rows exist, which is the classic way this
is written wrong.

**`dynamodb:Scan` had to be added to the App Runner instance role.** This is the second time a new
read pattern has needed a permission the role did not have — `Query` was missing when the social
layer landed. Worth remembering that the role grants item-level operations only until somebody adds
the specific action.

## Consequences

**Good**

- The room can see how the room is doing, which is what everybody wants on Friday.
- No interface change: `packages/shared` and the response schema are untouched.
- One ordering rule for both boards, enforced by a test.

**Bad**

- **Every player's username and avatar are now visible to every other player**, not only to friends.
  Nothing new is exposed — the global board returns exactly the same `PublicProfile` fields the
  friends board always did, and a test asserts it — but the audience is now everybody with an
  account. That is a real change in who can see you, and it is the cost of the feature.
- ADR-0027's concern is answered by a default, not removed. Somebody who wants to feel bad about
  their position can now do so in one click.
- A table scan exists in the codebase where there was none.

**Notable**

- The comments in `leaderboard.service.ts` and `leaderboard.routes.ts` that said there would never be
  a global board have been rewritten rather than deleted, so the reasoning survives its own reversal.

## Alternatives considered

**Leaving it friends-only.** ADR-0027's position, and defensible. Rejected because it decides
something for players that they can decide for themselves, and because the room genuinely wants to
see itself on demo day.

**A global board that shows only the top ten.** Cheaper to reason about and kinder — nobody sees
themselves near the bottom because the bottom is not shown. Rejected because it also hides you from
yourself: a player outside the top ten would have no row at all, which is worse than a low one.
Worth revisiting if the class finds the full board discouraging.

**Anonymising the global board** — positions and scores with no names. Answers the privacy and
feelings concerns at once, and makes the board almost pointless: the reason to look is to find your
friends and yourself on it.

**A materialised score table updated on each solve.** Removes the scan and makes the board a single
query. Rejected as a second source of truth for something the game already records — exactly what
ADR-0027 avoided — and not worth it at a class's scale.
