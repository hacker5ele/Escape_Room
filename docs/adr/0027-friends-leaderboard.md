# ADR-0027: A leaderboard scoped to friends

- **Status:** Accepted
- **Date:** 2026-08-04
- **Deciders:** Nepomuk Crhonek

## Context

The social layer so far sits *beside* the escape room rather than inside it. You can add friends and
talk to them, but none of it touches the game. A leaderboard is the cheapest thing that connects the
two, and it is what makes the social feature belong in this project rather than look bolted on.

## Decision

### It reads what the game already records

Rooms solved, hints used, and the start and finish times are all already stored on the game
([ADR-0019](0019-games-belong-to-accounts.md), [ADR-0020](0020-activity-log.md)). The leaderboard
computes from them on request.

No score table, no counters to increment, nothing to keep in step. A player's row cannot disagree
with their own progress screen, because it is derived from the same item.

### Friends only — there is no global board

The endpoint is `GET /api/leaderboard/friends`, and there is no way to ask for anybody else's list.

This is a deliberate social decision, not a technical one. A whole-class leaderboard is a way to
make the slowest person feel bad in public, and this is a school project where everyone knows each
other. Among people who chose each other, a board is a reason to keep playing.

It also happens to be the safer design: there is no endpoint that enumerates every player.

### Rooms, then time, then hints

Rooms solved comes first because that is what the game is about.

Time only separates people who have solved the same number, and it is only used for someone who has
actually **finished**. Ranking an unfinished game by elapsed time would put whoever started most
recently at the top, which is exactly backwards. On equal rooms, a finished game beats an unfinished
one.

Hints break what is left. Ties beyond that fall back to username, so the order is stable between two
requests rather than dependent on whatever order the queries came back in.

### A friend with no game still appears

Somebody who has a profile but has not opened a game yet shows at the bottom with zero rooms, rather
than being hidden. They are still your friend, and an empty row is an invitation.

## Consequences

**Good**

- Nothing new to store, and no second source of truth.
- The board reflects a solve the moment it happens.
- Nothing here can enumerate players, and no email address is in a profile.

**Bad**

- One game read per friend. At a class-sized friend list that is a handful of key lookups; if it
  ever mattered, the repository gains a batch method and nothing above it changes.
- No history — it is a standing, not a record of past runs.

## Alternatives considered

**A stored score table updated on every solve.** One read instead of N, and a whole class of bugs
where the table and the game disagree after a failed write. Not worth it at this size.

**A global leaderboard.** Rejected on the social grounds above.

**Ranking unfinished games by elapsed time.** Rewards starting late. Rejected.
