# ADR-0028: Playing a room together

- **Status:** Accepted
- **Date:** 2026-08-04
- **Deciders:** Nepomuk Crhonek
- **Amends:** [ADR-0019](0019-games-belong-to-accounts.md) — "a player has exactly one game" is no
  longer quite true

## Context

Friends can find each other, talk, and compare progress. The last step is playing the same escape
room together: both people see the same puzzles, either can solve one, and the log reads as a shared
history.

That breaks an assumption the whole backend is built on — that a game belongs to exactly one
account, keyed on their user id.

## Decision

### A player points at a host, not at a game

The original plan was to re-key the `games` table from `userId` to a synthetic `gameId`, with a
`game_members` table answering "which game am I in". That is the textbook shape, and it has one
serious problem here: **changing a DynamoDB hash key forces Terraform to destroy and recreate the
table.** Every game in `dev` and in production would be deleted, with a window mid-apply where the
API cannot write at all — three days before the demo.

So the indirection points at the **host's user id** instead of a synthetic game id. `party` maps
`userId → hostUserId`; the `games` table is untouched, still keyed on the owner.

- No row in `party` means "playing my own game", which is the overwhelmingly common case and costs
  nothing to store.
- A row means "I am playing in that person's game".
- `hostFor(userId)` is one key lookup, and `find(userId)` becomes
  `games.findByUserId(hostFor(userId))`.

This is strictly better for this project: no destructive migration, no data thrown away, no deploy
window where writes fail, and one fewer table than the original design. The cost is that a game is
identified by its host rather than by an id of its own, which matters only if a host should ever be
able to leave their own game — and they cannot.

Nothing above the repository changed. `GameService.find(userId)` kept its signature and only its
implementation moved, which is exactly the seam [ADR-0008](0008-session-persistence.md) was written
to buy. That is the third time it has paid for itself.

### Every write is conditional on a version

The game gains a `version`, bumped on write and checked on write with a `ConditionExpression`.

Without it, two players solving at the same moment each read the same game, each append their own
event, and the second write silently discards the first. That bug is invisible in testing — you have
to have two people acting inside the same few milliseconds — and it is exactly what will happen in
front of an audience.

On conflict the service **re-reads and re-applies** rather than replaying the stale result. Every
mutation here is either append-only or a set union, so re-applying is safe, and the room's `check()`
is pure so whether the answer was right does not change. Three attempts, then a `409` — a real
conflict loop should surface rather than spin.

Retried rather than reported because a 409 on a correct answer, because a teammate happened to solve
something at the same instant, is a worse experience than one extra read.

### Joining sets your game aside; it never merges

Your own game stays in the table, unreferenced. Leaving the party puts you back into it exactly as
you left it.

Merging two sets of progress has no correct answer — whose solved rooms win, whose hint count, whose
start time? — and losing somebody's solo game to join a friend for five minutes would be worse than
either. Unreferenced games accumulate harmlessly at this scale.

### No chains, and no evicting from a party you do not host

You cannot join somebody who has themselves joined a third person. Allowing it would make "whose
game is this?" a graph walk instead of one lookup, with cycles to detect.

For the same reason you cannot invite people into a game you do not host, and only the host can send
somebody home.

### Resetting leaves the party first

`DELETE /api/sessions/me` removes your membership and then deletes **your own** game. A guest who
resets cannot wipe the progress of everybody playing with them.

### Events carry an actor, but only when it means something

`actorUserId` and `actorName` are stamped on events in a shared game, so the log reads *"Ada solved
room 2"*. In a solo game they are absent — the actor is always the owner, and stamping the only
possible actor on every event is noise. It also means the profile lookup that resolves the name only
happens for somebody playing in a friend's game.

### An invitation is an invitation

`POST /api/party/invite/:userId` creates a notification and nothing else. Joining is the invitee's
decision, because pulling somebody out of their own half-finished game without asking would lose
their place.

## Consequences

**Good**

- No migration, no data loss, no destructive apply.
- Concurrent solves cannot silently lose an update, and there is a test that fails without the
  version check.
- Solo play is unchanged and pays for none of this: no party row, no profile lookup, no extra read.
- The log becomes a shared history rather than an anonymous one.

**Bad**

- A game is identified by its host, so a host cannot hand over or leave their own game. Acceptable —
  nobody asked for it, and it would need the synthetic id after all.
- Abandoned solo games linger, unreferenced.
- The retry adds up to two extra reads under contention. Bounded and rare.

**Notable**

- The `version` field defaults to `0` in the schema, so games written before this ADR still parse.
- `requireGame` became `requirePlayer`, returning the caller's id alongside the game — since the
  game's `userId` is now the *host*, not necessarily whoever is playing.

## Alternatives considered

**Re-keying `games` to a synthetic `gameId`.** The textbook design and the original plan. Rejected on
the destructive-migration grounds above. Worth revisiting after the project week if games ever need
to outlive their host.

**Merging progress on join.** No correct answer, and surprising however it is resolved.

**Locking the game while somebody is acting.** A held lock plus a crashed client equals a game
nobody can play. Optimistic concurrency has no such failure mode.

**Reporting a 409 instead of retrying.** Simpler, and it makes a correct answer randomly fail in
front of an audience.
