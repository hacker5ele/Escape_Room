# ADR-0066: A shared 3-hearts system for room-03, and a room-scoped reset endpoint

- **Status:** Proposed
- **Date:** 2026-08-05
- **Deciders:** Inaam Ahmed
- **Approved-by:** _(pending — awaiting Nepomuk Crhonek's review)_

## Context

Room 3 is two back-to-back challenges: the Sphinx's five-riddle corridor (server-authoritative, see
ADR-0065), then — once all five are answered — an Atlantis palace quest where the player finds and
places three of Poseidon's artifacts against a 60-second clock (frontend-only state, no server
counterpart, added directly after ADR-0065 shipped).

Until now the two halves failed independently and harshly:

- **Sphinx:** any wrong answer sent the player back to riddle 1 immediately (ADR-0065's
  `currentStage()` — an unbroken streak of correct attempts, reset to 0 on any miss).
- **Atlantis:** a wrong pedestal placement cost 10 seconds; running out the clock silently restarted
  just the Atlantis quest.

The request was to unify these into one felt mechanic: three hearts, shared across both halves of the
room. A wrong Sphinx answer or a wrong Atlantis placement or an Atlantis timeout each cost a heart (in
Atlantis, on top of the existing time penalty — that stays). A wrong placement also sends the carried
artifact all the way back to hidden, so it must be found again rather than silently disappearing — an
early build left it in a `'found'`-but-not-carried limbo state that nothing could pick back up, which
read as the game eating the item. Losing the third heart, anywhere, resets the *entire* room — corridor
progress and the Atlantis quest both — back to riddle 1 with a fresh three hearts.

This is interface-shaped for two reasons:

1. **Where do Sphinx hearts live?** Same question ADR-0065 already answered for riddle stage: no new
   `GameSession` field. `session.events` already has everything needed — hearts are derived the same
   way stage is, by replaying the player's room-03 attempts.
2. **How does a full reset get triggered from Atlantis?** Atlantis is frontend-only; it has no way to
   change what the server thinks the player's room-03 progress is. The only existing endpoints for
   room-03 are `attempt` and `hint` — neither expresses "throw this room's progress away." A full reset
   triggered by the Sphinx side already happens for free (it's the existing derive-from-events streak
   logic, now tracking hearts instead of resetting to 0 on every miss). A reset triggered by Atlantis
   needs new backend surface.

## Decision

**Sphinx hearts are derived from the event log, same pattern as riddle stage.** `room-03.ts`'s
`currentStage()` is replaced by `currentProgress()`, returning `{ stage, hearts }`: a wrong answer now
costs a heart and re-asks the *same* riddle (no progress lost) rather than resetting to riddle 1
immediately. Only losing the third heart resets `stage` to 0 and refills `hearts` to 3 — "you lost this
run" now means something has actually run out, not just "you were wrong once."

```ts
const MAX_HEARTS = 3

function currentProgress(session): { stage: number; hearts: number } {
  // replays session.events filtered to room-03 attempts; wrong answer: hearts -= 1;
  // hearts <= 0: stage = 0, hearts = MAX_HEARTS (see room-03.ts for the full loop)
}
```

`publicData()` now includes `hearts` and `maxHearts` in its `data` payload. This does **not** touch
`packages/shared` — `RoomPublicData.data` is already `z.record(z.string(), z.unknown())` (a
deliberately opaque per-room bag, confirmed in `packages/shared/src/rooms.ts`), so a room adding a new
key to its own payload is within the existing contract, not a schema change.

**A new endpoint, `POST /api/rooms/:roomId/reset`, resets one room's progress without touching the rest
of the game.** This *is* a new piece of API surface, which is why it needs this ADR. It:

- Removes every event in `session.events` whose `roomId` matches the given room (attempts, hints,
  room-entered, room-solved).
- Removes that room from `solvedRooms` if present.
- Leaves every other room, `hintsUsed`, `startedAt`, and the rest of the session completely alone.

```ts
// GameService
async resetRoom(game: GameSession, roomId: RoomId): Promise<GameSession> {
  const updated: GameSession = {
    ...game,
    solvedRooms: game.solvedRooms.filter((id) => id !== roomId),
    events: game.events.filter((event) => event.roomId !== roomId),
  }
  return this.repository.save(updated)
}
```

Response shape reuses `sessionResponseSchema` (`{ session }`) — the same shape `POST /api/sessions` and
`GET /api/sessions/me` already return, so no new schema is needed in `packages/shared/src/api.ts`
beyond routing this through the existing type.

**Atlantis hearts are tracked client-side and mirror the server's count.** `SphinxGame.tsx` holds one
`hearts` value, seeded from `room.data.hearts` and kept in sync after every Sphinx attempt (the server
recomputes and returns it via the room refetch that already happens on every same-room attempt). A wrong
Atlantis placement or a timeout decrements this local value directly (Atlantis has no server state of
its own to consult). When the shared count reaches 0, the frontend calls the new
`POST /api/rooms/room-03/reset`, then resets the local Atlantis quest state and the corridor's local
`solvedZones`/player position, and returns the player to riddle 1 — a true full reset of both halves,
not just a visual one.

**Why not make Atlantis server-authoritative instead, so hearts have one home?** Rejected as
disproportionate scope for what Atlantis is — a client-side exploration/timing minigame layered after
the real (server-checked) puzzle is already solved. Nothing about "did you find and place three
artifacts in time" needs server verification the way a riddle answer does; there is no secret being
protected. Mirroring the heart count client-side is a small amount of duplication in exchange for not
inventing a second puzzle-checking subsystem for a decorative capstone.

## Consequences

- Wrong Sphinx answers are no longer as harsh — the player gets three tries per riddle, spread across
  the whole five-riddle run, before a full restart, instead of zero.
- The activity log now contains real wrong-answer attempts for retries of the same riddle (previously a
  wrong answer was always the *last* attempt before a restart cleared the streak going forward) — this
  is more log entries per run, still well within ADR-0020's 500-event cap.
- `POST /api/rooms/:roomId/reset` is generic by room id even though only room-03 uses it today. Any
  future multi-stage room gets the same reset capability for free instead of needing its own ADR to add
  it.
- A player who calls the reset endpoint directly (bypassing the UI) can reset room-03's progress at
  will, same as they could already replay a riddle by refreshing before this change existed in spirit —
  this is not a new fairness boundary, since nothing about *solving* the room got easier, only retrying
  it did.
- Atlantis's heart count can drift from the server's if a player reaches Atlantis, then opens the game
  in a second tab that also touches room-03 — an accepted edge case, same class of race already
  tolerated elsewhere (e.g. `startOrResume`'s own idempotency note), not worth solving for a capstone
  minigame.

## Alternatives considered

**Give Atlantis its own independent 3-strikes counter, fully separate from the Sphinx's hearts.**
Simpler, no new endpoint needed. Rejected: this was explicitly not what was asked for — losing three
times "throughout the entire game with the sphinx and poseidon" was the request, meaning one pool, one
felt consequence, not two separate three-strikes systems that happen to look the same.

**Silently submit a wrong answer to the existing `/attempt` endpoint from Atlantis, to reuse the
Sphinx's own already-built reset-on-third-heart logic.** No new backend surface. Rejected: it would log
a fake wrong answer, for a riddle the player never saw, in their real activity log — dishonest data for
the sake of avoiding one small endpoint.
