# ADR-0043: Hints are counted per room

- **Status:** Accepted
- **Date:** 2026-08-05
- **Deciders:** Nepomuk Crhonek
- **Approved-by:** Nepomuk Crhonek, 2026-08-05

## Context

A player reported a room showing two contradictory things at once:

> There are no more hints for this room.
>
> **Hints** — Take a hint (3 left)

Both were right about what they were reporting, and both were reporting the wrong thing.

```ts
const { hints } = getRoom(roomId)       // this room's hints
const nextHint = hints[session.hintsUsed]   // the whole game's hint count
```

`session.hintsUsed` counts hints across the entire game. It was being used to index **one room's**
array. So after three hints in room one, room two asked for `hints[3]`, found nothing, and refused —
and every room after it refused too.

The effect: **once you had spent as many hints as the shortest room contains, no room would give you
another one, ever.** In a four-room game with three hints each, that is three hints for the whole
game rather than twelve.

The button disagreed for a second reason. `hintsAvailable` on the wire was `room.hints.length` — how
many the room *has* — while the client subtracted the hints taken since the page loaded. A reload
reset the client's count to zero and the button confidently offered three that the server would
refuse.

## Decision

**Index a room's hints by hints taken in that room.**

```ts
const taken = hintsTakenIn(session, roomId)
const nextHint = hints[taken]
```

Counted from the activity log, which has recorded `hint_taken` with a `roomId` since
[ADR-0020](0020-activity-log.md). **The per-room number was already being stored and simply was not
being read** — which is why this needs no change to the session shape, no contract change, and no
migration for games already in progress.

`session.hintsUsed` stays exactly as it is: a whole-game total. That is what the friends leaderboard
ranks on ([ADR-0027](0027-friends-leaderboard.md)), and *"how many hints did you need"* is a question
about the game, not about a room.

**`hintsAvailable` now means what its name says** — how many *this player* can still take here,
rather than how many the room has. No rename: the implementation was wrong, not the word.

The client stops counting locally and uses what the server reports, seeded from the room payload and
updated from each hint response.

### The log cap

`MAX_GAME_EVENTS` is 500. A game long enough to push its own `hint_taken` events off the end would
start offering a hint the player has already seen — a repeat, not a leak, and 500 events is far more
than four rooms take. Recorded because it is the one way this can be wrong.

## Consequences

**Good**

- A four-room game has four rooms' worth of hints in it.
- No schema change, no migration, and games in progress are fixed by the deploy because the count is
  derived from a log they already carry.
- The two endpoints that report hints now agree, and a test asserts that they do.

**Bad**

- Counting a list on every room entry and every hint. Four rooms and a few hundred events — free at
  this scale, and a `hintsByRoom` map on the session would be the answer if it ever were not.
- The derived count is only as good as the log's retention. Noted above.

**Notable**

- Three tests were added and all three fail against the original code. There were already hint
  tests — they took two hints in one room and asserted the count went up, which is true in both the
  broken and the fixed version. **The bug lived in the space between one room and the next**, and
  nothing crossed it.

## Alternatives considered

**`hintsByRoom: Record<RoomId, number>` on the session.** Explicit, durable, immune to log
retention — and a contract change, a migration for in-progress games, and rule 7's team agreement,
to store a number the log already contains.

**Making hints a game-wide budget** and calling the behaviour intentional. Defensible as a design —
and not what the code claimed: every room defines its own `hints` array, and the payload advertises a
per-room count. It would also have meant a player exhausting the whole game's help on room one.

**Fixing only the button** so it stopped promising hints the server would refuse. That is the
reported symptom and none of the bug: the player would have seen an honest *"no hints left"* on a
room they had never asked for help in.
