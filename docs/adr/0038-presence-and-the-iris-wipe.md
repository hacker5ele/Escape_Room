# ADR-0038: Presence in memory, and the iris wipe

- **Status:** Accepted
- **Date:** 2026-08-05
- **Deciders:** Nepomuk Crhonek
- **Approved-by:** Nepomuk Crhonek, 2026-08-05
- **Amends:** [ADR-0025](0025-notifications-by-polling.md), [ADR-0037](0037-lobby-stage-and-rooms.md)

## Context

[ADR-0037](0037-lobby-stage-and-rooms.md) built the lobby, the stage and playable rooms, and shipped
them **single-player**: you walked around alone. The whole point of the room-01 walkable space is
that two people can be in it, and that needed the half that was missing.

The transition also needed replacing. The first one was expanding ink bubbles — competent, and not
cartoon. It was an effect wearing period colours rather than something the period actually did.

## Decision

### Presence lives in memory

Positions, facings, emotes, ready flags and where a party currently is are held in a `Map` on the
API and are gone when the process restarts.

That is not a shortcut. A position is meaningless a second later, and a lobby does not outlive the
process that is hosting it — so writing 2 Hz of coordinates to DynamoDB would be paying storage
prices for data whose entire value is that it is current. A deploy resets every lobby and **drops
nobody from their party**, because party membership is durable and stays exactly where it was.

**This is only sound because App Runner is pinned to one instance** — `min_size = 1, max_size = 1`
in `infra/modules/environment/main.tf`. Raise that and friends will start vanishing for each other,
because two instances would each hold half the room. It is written into the service, the contract and
here, in three places, because it is the kind of constraint somebody removes while tidying.

It also means: no new table, no IAM change, no migration.

### The heartbeat is its own endpoint

`POST /api/stage/heartbeat` reports where you are and returns where everybody else is, in one call.

ADR-0025 says features should add fields to `/api/sync` rather than take an endpoint of their own,
and its reason was that polling four endpoints costs four times as much as polling one. **That
assumes matching cadences.** Presence wants 500 ms; notifications want ten seconds. Folding them
together would poll notifications twenty times more often than they deserve — so splitting is
*cheaper*, and ADR-0025's own reasoning is what says so.

500 ms is 120 requests a minute against a 240 limit, so no rate-limit change was needed.

### Polling is made to look like movement by interpolating

The single technique that matters. Each peer is drawn moving *toward* their last reported position
rather than snapped to it, which turns a twice-a-second update into a character walking about half a
second behind. Without it the same data is a slideshow.

Two details that are easy to get wrong and were:

- Interpolate from where a peer is **currently being drawn**, not from their last reported position,
  or they visibly jump backwards on every update.
- **Clamp progress at 1.** Extrapolating past the last known position makes somebody who stopped
  sending updates drift off the stage instead of standing still.

### The client sends its own character

The four part ids travel on every heartbeat and are echoed to peers, rather than looked up
server-side.

That was a deliberate reversal of the plan, which called for `character` on `PublicProfile` fed from
Clerk's `unsafeMetadata`. Echoing instead keeps the identity provider out of the API entirely, works
identically in local development where there is no Clerk, and **removes a change to `PublicProfile`
and to the authenticator** — a materially smaller interface change. A character is cosmetic, the
server never interprets the ids, and the receiving client validates them against its own catalogue.

### The host moves the party

`POST /api/stage/phase` is host-only. A guest learns the party has gone into a room on their next
heartbeat and follows. That is how "the host pressed PLAY" reaches everybody with nothing pushed and
no socket — and it is the same rule co-op already enforces about whose game is being played
(ADR-0028).

The room is re-validated at that moment rather than trusted from the lobby, because the selection
could have been made before the game changed. The 403 gate is unchanged; this only stops the party
being walked into a refusal together.

### The party is capped at four

There was no limit at all. Four is a party; thirty is a wall of overlapping characters on a stage,
and on Friday that is the demo failing in public. Refused with `PARTY_FULL` and a reason rather than
a silent no-op.

### The transition is an iris wipe

Replacing the ink flood. **This is *the* 1950s cartoon transition** — the circle that closes on the
end of every short — and it belongs here for the same reason the halftone does: it is what the era
actually did.

Three things make it read as drawn rather than as a mask animating:

- **It overshoots.** The iris shrinks past its mark, pops back, then closes. A linear close is a
  wipe; an overshooting one is animation. That single easing curve is the whole cartoon vocabulary.
- **The rim is inked** — two concentric ink rings and a key outline, so the closing edge looks
  printed rather than like a clipping path.
- **It wobbles.** The circle is a slightly irregular polygon breathing on three overlapping
  frequencies, because a mathematically perfect circle is the giveaway that a machine drew it.

A slide whistle falls as it closes and a pop lands as it opens, which is the sound the gesture has
had since 1940. The scene swaps at full black, so the change is never seen.

## Consequences

**Good**

- Two people can stand in a room together, walk about and dance at each other — which is what the
  empty room 01 was built for.
- No new infrastructure, no new table, no migration. The one AWS change in this PR is unrelated.
- A smaller interface change than planned: one new file in `packages/shared`, and `PublicProfile`
  untouched.
- The transition is period-correct rather than merely period-coloured.

**Bad**

- **In-memory presence pins the API to one instance**, and that constraint is now load-bearing
  rather than incidental.
- **A deploy clears every lobby.** Already true of the old in-memory sessions; now visible, because
  people are standing in them.
- **Half a second of lag is the floor.** If it ever needs to be better the answer is WebSockets,
  which means leaving App Runner for ECS Fargate — about a day and roughly $16/month.
- A client can send a character it did not build. Cosmetic, validated on the way in, and cheaper to
  accept than to prevent.
- Two tabs on one account fight over a position and the character twitches. Accepted rather than
  solved.

**Notable**

- `PARTY_FULL` is a new error code in the shared contract.
- **This is an interface change and rule 7 asks for prior agreement with the whole team, which has
  not happened.** Rule 4 covers Nepomuk's approval of the ADR and the work; it does not stand in for
  the team conversation. Flagged on the pull request rather than skipped.

## Alternatives considered

**Folding presence into `/api/sync`.** What ADR-0025 says to do, and wrong here for the reason
ADR-0025 gives — the cadences differ by twenty times.

**Storing presence in DynamoDB.** Survives a restart and scales past one instance. Rejected: 2 Hz of
writes per player for data that is worthless the moment it is a second old, and it would need a table
and an IAM change to buy durability nobody wants.

**Extrapolating instead of interpolating**, to hide the lag entirely. Makes a peer who stops sending
updates walk confidently into a wall, and the correction when they reappear is worse than the lag.

**Keeping the ink flood and making it faster.** The problem was never the speed. It was that
expanding circles are not a thing cartoons do.
