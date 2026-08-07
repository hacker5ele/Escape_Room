# ADR-0073: Every room is multiplayer — one integer, and a rail

- **Status:** Accepted
- **Date:** 2026-08-07
- **Deciders:** Nepomuk Crhonek
- **Approved-by:** Nepomuk Crhonek, 2026-08-07
- **Amends:** [ADR-0028](0028-co-op-play.md), [ADR-0038](0038-presence-and-the-iris-wipe.md)

## Context

The game has been multiplayer since [ADR-0028](0028-co-op-play.md): a guest points at the host's
game, so a solve by either of them is a solve for both. That is real, and it worked. It was also
almost entirely invisible.

Of the five rooms, **only room 1 ever showed you another person.** It stands on the shared walkable
stage, so you watch your partner walk about in it. The other four draw their own screens and had
nothing: no character, no name, no sign anybody else existed. Two people could play the same room at
the same time, from the same game, and each see an empty room.

And progress, though shared, only ever arrived **when you yourself made a request.** Your partner
could finish the room beside you and your screen would sit there unchanged until you typed something.

Room 3 was worse than invisible. It bypasses `RoomView` entirely — it wanted a richer contract than
the registry offers ([ADR-0065](0065-room-03-sphinx-riddles.md)) — so it had no heartbeat at all, and
**no phase**: a host walking into room 3 left their partner standing in the lobby.

## Decision

### One integer on the beat

`heartbeatResponseSchema` gains **`version`** — how many times the party's game has been written.
When it moves, somebody did something, and the client re-reads the game. `POST /api/sessions` is the
re-read: idempotent, returns the session, so no endpoint had to be invented.

That one number is what makes every room multiplayer, because sharing was never the missing part —
*noticing* was.

**A version rather than the game.** This beat runs twice a second per player and the honest answer is
almost always "nothing happened"; shipping the session on it would be a payload per player per half
second to say so.

**Held in memory, not read from the database.** `GameService` records the version on every save and
answers from a `Map`. Reading DynamoDB on the beat would be a database round trip per player per half
second to answer a question that is nearly always no. A fresh process knows nothing and says `0` for
everybody, which reads as *"nothing has changed"* until the first write — at which point every client
sees it move and asks for the real thing. Being wrong here costs a refetch that was going to happen;
it can never invent progress or hide it.

**Defaulted**, like `acted` and `holding` before it ([ADR-0049](0049-press-e-and-five-acts.md)): a
client that loads before the API has redeployed sees `0` and simply never refetches, rather than
failing to parse every beat and losing presence altogether.

### A rail, drawn by the shell

`PartyRail` shows each other person in the room — their own character, their name, and what they last
did — and gives them emotes. **The shell draws it, not the room**, so no room author has to know it
exists and none of the four rooms built by other people were touched to get it.

**It draws nothing when you are alone.** Rooms 2 and 4 fill the screen with their own thing, and a
panel on top of them for a solo player is a cost with no benefit.

What somebody last did is read off the **activity log**, which has recorded every attempt, hint and
solve against the game since [ADR-0020](0020-activity-log.md), complete with who did it. Nothing new
travels for the rail to be able to say it.

A peer's live emote plays on their portrait. On a stage you would see it over their head; in a room
with no stage this is the only place it can land, and it was already on the beat.

### Room 3 joins the party

`useRoomParty` holds the four things both shells need — the beat, the phase, following the host, and
the version watch — so `Room03Route` gets them without either shell writing them twice.

## Consequences

**Good**

- Four rooms went from single-player-looking to multiplayer without a line of their own code
  changing. Three of them are other people's work, which is the only reason that mattered.
- Room 3 stops stranding a guest in the lobby, which was a plain bug nobody had hit yet only because
  nobody had played room 3 in a party.
- The cost is one integer on a beat that was already going out.

**Bad**

- **A third contract change in three days.** Additive and defaulted, and flagged for rule 7 — but the
  team should hear it rather than find it.
- **A refetch per party action.** A room where somebody is guessing quickly means a session read each
  time, for everybody in the party. Bounded by the attempt rate limiter and small next to a room's
  own assets, but it is not nothing.
- The rail is one more thing on screen in rooms that already own their whole screen. It is small,
  cornered and absent when you are alone, which is the most that can be done without asking four
  authors to make room for it.

**Notable**

- **The host is the one person the rail could not describe.** `actorFor` in `rooms.routes.ts`
  deliberately leaves the game's owner off every event — *"stamping every event with the only
  possible actor is noise"* — which was true while the owner was the only one who read the log. A
  guest reads it now. Found by running two browsers, not by reading code: the host had just solved a
  room and the rail said "just arrived". An unattributed event is the owner's, by construction, and
  the rail now says so.
- **`npm run dev` was broken** for anybody without a `.env` — `--env-file` makes Node exit rather
  than shrug. Introduced by the email work in ADR-0046 and found while trying to run two browsers on
  demo morning. `--env-file-if-exists` is the whole fix.
- A CSS guard from [ADR-0044](0044-unbuild-into-dots.md) caught the rail's `overflow: hidden`,
  because it slices the stylesheet from the transition marker **to the end of the file** and so
  polices everything added after it. Over-broad, and it did its job.

## Alternatives considered

**Polling the session in every room.** No contract change at all, and it is thirty requests a minute
per player to learn that nothing happened. The version turns a poll into an invalidation.

**Streaming the party's events on the beat.** Richer, and it duplicates on the wire what the activity
log already holds — and would have needed its own shape, its own truncation rule and its own tests.
The log plus a version is the same information for eight bytes.

**Putting every room on the shared walkable stage.** The most multiplayer answer available, and it
means rewriting a 3D chase runner, a riddle corridor and a facility escape as top-down rooms. Their
authors chose their own screens for reasons; the rail is what fits over the top of that choice
instead of overturning it.
