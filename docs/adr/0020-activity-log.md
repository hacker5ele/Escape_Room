# ADR-0020: Record an activity log against each account

- **Status:** Accepted
- **Date:** 2026-08-03
- **Deciders:** Nepomuk Crhonek
- **Approved-by:** Nepomuk Crhonek, 2026-08-03

## Context

Once a game belongs to an account ([ADR-0019](0019-games-belong-to-accounts.md)), the account can
hold more than a list of solved rooms. Progress alone answers *where* a player got to; it answers
nothing about *how*.

Three things this week need that "how":

**Thursday.** The other team will break something and tell us it broke. Without a record we get "the
room didn't work" and a guess. With one we get the room, the answer they typed, and the second it
happened.

**Friday.** "Four rooms, they all work" is a weaker demo than showing a real play-through: where people
stalled, which room ate the hints, how long the whole thing took.

**The rooms themselves.** A room whose answer nobody ever guesses is a badly written room, and wrong
answers are the only evidence of that.

## Decision

Every game carries an append-only `events` array, stored on the same record as its progress.

Six event types: `game_started`, `room_entered`, `attempt`, `hint_taken`, `room_solved`,
`game_completed`. Each has an ISO timestamp; most carry a `roomId`; `attempt` also carries `correct`
and the answer the player typed.

Three decisions inside that are worth stating, because each is a trap avoided:

**It lives on the game item, not in a second table.** Reading a player's whole history is then the same
single `GetItem` that reads their progress — no query, no second round trip, no consistency question
between two writes.

**The log is capped at 500 events, oldest dropped.** A DynamoDB item cannot exceed 400 KB and the log
shares one with the game. Uncapped, a player hammering the attempt endpoint would eventually push their
own item past the limit and permanently break their own game — a self-inflicted denial of service that
Thursday's testers would find by accident.

**Answers are stringified and truncated to 120 characters.** The answer is untrusted input of arbitrary
shape; storing it raw is the other way to blow the item size.

`room_entered` is recorded only the first time. It sits on a read path, and logging every refresh would
both bury the history in noise and turn a `GET` into a write.

Solving a room writes the attempt, the `room_solved` event and the progress in **one** save, so the log
and the progress can never disagree about what happened.

## Consequences

- A player can see their own history, which makes the account worth having beyond being a door.
- Per-room timings, attempt counts and hint usage are all derivable — so a leaderboard is a rendering
  job later, not a data-model change.
- Debugging on Thursday becomes reading a timeline instead of reproducing a bug.
- **Attempts now always write.** Before, a wrong answer touched nothing; now every attempt is a
  DynamoDB write. At our traffic this is inside the free tier, and the rate limiter already bounds how
  fast anyone can drive it.
- We are storing what people typed. It is their own puzzle answers rather than anything sensitive, and
  it is visible only to them — but it is worth being deliberate that we made that choice.
- The cap means a very long game loses its own beginning. Acceptable: 500 events is far more than a
  play-through, and progress itself is never dropped.
- `events` is defaulted to `[]` in the schema, so a game written before this ADR still parses rather
  than failing the whole read.

## Alternatives considered

**A separate DynamoDB table keyed on `(userId, timestamp)`.** The textbook event store, unbounded, and
properly queryable. Rejected as more machinery than this needs: a second table, a query path, and two
writes per action, to serve a log that is only ever read whole and never exceeds a few hundred rows.

**Application logs in CloudWatch instead.** Free, and it needs no schema. Rejected because it is not
reachable from the app — the player could never see their own history, and a leaderboard could not be
built from it.

**Logging only the interesting events** — solves and completions, not wrong answers. Smaller. Rejected
because the wrong answers are the interesting part; they are where the room design fails.
