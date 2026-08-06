# ADR-0052: Olympus becomes a carpet-racing coin challenge, not a riddle sequence

- **Status:** Proposed
- **Date:** 2026-08-05
- **Deciders:** Inaam Ahmed
- **Approved-by:** _(pending — awaiting Nepomuk Crhonek's review)_

## Context

ADR-0049 built Olympus as a second server-checked riddle act, mirroring the Sphinx's five questions.
The actual request was different: a top-down, Mario-Kart-style challenge — fly a carpet freely in every
direction, collect ten scattered gold coins, and reach a finish line, all inside a 40-second clock. This
fully replaces the Olympus riddles; nothing about "answer a question" survives in this room's third act.

This has real consequences for room-03's backend, which ADR-0049/ADR-0050 had already shaped around a
two-act (`sphinx` | `olympus`) riddle system with its own `roomComplete` logic hanging off the final
Olympus answer. With no Olympus answer left to check, that whole mechanism has nothing to attach to.

## Decision

**`room-03.ts` goes back to a single act — the five Sphinx riddles only.** `OLYMPUS_RIDDLES`, the `Act`
type, and the act-switching logic in `currentProgress()` are removed entirely; `publicData()` no longer
returns an `act` field. The five riddles' `check()` now always returns `roomComplete: false` on a
correct answer — none of them, including the last, finishes the room by itself anymore. Room-03's true
completion now depends entirely on the client-side tail (Atlantis, then the Olympus carpet race).

**A new endpoint, `POST /api/rooms/:roomId/complete`, marks a room solved with no answer involved.**
This is the actual interface change this ADR is about: room-03's last stage is now something the server
never sees an answer for at all, so there is no `check()` call left for `roomComplete` (ADR-0050) to
hang off of. The room itself gets a say in whether this is allowed to succeed:

```ts
// RoomDefinition
canComplete?(session: GameSession): boolean

// room-03.ts
canComplete(session) {
  const { stage } = currentProgress(session)
  return stage === SPHINX_RIDDLES.length - 1  // the five riddles are genuinely done
},
```

`RoomService.complete()` refuses with a new `ROOM_NOT_READY_TO_COMPLETE` error code unless the room's
own `canComplete()` agrees — so calling this before the Sphinx riddles are finished, or on a room with
no `canComplete()` at all (every other room today), does nothing. `GameService.completeRoom()` marks
`solvedRooms` and appends `room_solved`/`game_completed` exactly like `applyAttempt`'s `roomComplete`
branch already did, just without an `attempt` event alongside it (there was no answer).

**`RoomProps` gains `onCompleteRoom`, mirroring `onResetRoom`'s shape.** `Room03` calls it exactly once,
the moment `allCoinsCollected() && reachedFinish()` both become true in the carpet race's game loop —
then transitions to the `'won'` waiting room. It deliberately does *not* call `onRoomFinished()` at that
point; per ADR-0051, that stays reserved for the waiting room's own "Finish" button, so the app doesn't
advance past room-03 until the player has actually seen the closing scene.

**The carpet race itself (`game/olympus.ts`, entirely rewritten) is a new top-down scene**, distinct
from every other view in this room (all side-on): a 2600×1600 hall map, the camera following the
carpet, ten fixed coin positions, and a finish gate at the far edge. Movement is free 2D (arrow keys /
WASD, all four directions) rather than the corridor's left/right walk — a new `CarpetKeysDown` type and
`advanceCarpet()` alongside the existing side-scrolling `KeysDown`/`update()`, since the two movement
models don't share a shape.

**Losing the race (timeout before all ten coins + the gate) costs a heart and restarts just the race** —
the same severity as an Atlantis timeout, using the identical shared-hearts mechanism (ADR-0048). Losing
the third heart here still resets the *whole* room back to the Sphinx's riddle 1, via the same
`resetWholeRoom()` already built for Atlantis.

## Consequences

- ADR-0049's two-act riddle design is superseded for the Olympus stage specifically — its
  event-log-replay technique (deriving progress from the event log, ADR-0047's original idea) remains
  exactly as-is for the Sphinx's five riddles, which are unaffected by this change.
- `POST /api/rooms/:roomId/complete` is generic by room id even though only room-03 uses it today, same
  reasoning as `/reset` (ADR-0048): any future room whose final stage is client-side gets this for free.
- Every room that defines `canComplete()` is explicitly opting in to being finishable outside of
  `check()` — the default (refuse) means a room author must deliberately decide this is safe, not get it
  by accident.
- `apps/frontend/src/rooms/preview.tsx`'s mock gained a no-op `onCompleteRoom`, same treatment as
  `onRoomFinished` got in ADR-0051 — the preview never calls it for real.
- The five Sphinx riddles' hints, wording, and hearts behavior are entirely unchanged by this ADR; only
  what happens *after* Atlantis changed.

## Alternatives considered

**Keep both**: five riddles in Olympus, then the carpet race after. Rejected — explicitly asked against;
the carpet race replaces the riddles rather than following them.

**Have the carpet race submit some placeholder "answer" through the existing `/attempt` endpoint** so
`roomComplete` could still be set from inside `check()`, avoiding a new endpoint. Rejected for the same
reason ADR-0048 rejected a similar trick for Atlantis: it would log a fake answer for a challenge that
was never actually a question, polluting the real activity log for no benefit over an honest, small,
purpose-built endpoint.
