# ADR-0068: A correct attempt and a finished room are not the same thing

- **Status:** Proposed
- **Date:** 2026-08-05
- **Deciders:** Inaam Ahmed
- **Approved-by:** _(pending — awaiting Nepomuk Crhonek's review)_

## Context

A player reported winning room-03 (reaching Olympus's final riddle, or even just Atlantis) and being
sent back to the very start of the game.

Root cause: `GameService.applyAttempt(game, roomId, answer, correct)` has, since the very first version
of this room system, added `roomId` to `solvedRooms` on **any** `correct: true` outcome from that room's
`check()`. That was a safe assumption when every room was one question, one answer — "correct" and
"the room is finished" were the same event by construction. Room 3 broke that assumption the moment it
became multi-stage (five Sphinx riddles, ADR-0065) and nobody updated `applyAttempt` to match; ADR-0067
made it worse by adding five more Olympus riddles on top.

The actual behavior in production: the player's very first correct Sphinx riddle answer marked
`'room-03'` as solved. `currentRoomId()` (`packages/shared/src/access.ts`) picks the first room **not**
in `solvedRooms` — so from that moment on, the server considered the player already past room-03 and
into room-04, even though `Room03`'s own frontend component kept them inside its five-riddle corridor
using the room's still-in-progress `publicData()`. The mismatch stayed invisible only because
`App.tsx`'s `onSubmit` re-fetches room data when `currentRoomId()` stays the same room and only tears
down and remounts when it changes — and it *had* changed, silently, on riddle one. Once the player
actually reached Atlantis or Olympus and the frontend's own state (or a natural remount, e.g. a refresh)
resynced against the server's real `currentRoomId()`, they landed back in whatever room the server
now thought they were in — which, depending on rooms 1/2/4's own state, could look exactly like being
sent back to the start.

## Decision

**`AttemptOutcome` gains a second, independent boolean: `roomComplete`.**

```ts
export interface AttemptOutcome {
  correct: boolean
  feedback?: string
  /** Whether this correct answer finishes the ROOM, not just this attempt. Defaults to `correct`. */
  roomComplete?: boolean
}
```

`correct` answers whether *this one attempt* was right — always logged, right or wrong, same as before.
`roomComplete` answers whether the *room* is now done and the next one should unlock. For every
single-stage room (1, 2, 4) these are the same value, which is why `roomComplete` defaults to `correct`
when a room's `check()` doesn't set it — those three rooms needed no code change at all.

**`GameService.applyAttempt` takes `roomComplete` as an explicit parameter and gates `solvedRooms` on
it, not on `correct`:**

```ts
async applyAttempt(game, roomId, answer, correct: boolean, roomComplete: boolean): Promise<GameSession> {
  // ...logs the attempt event using `correct`, same as before...
  if (roomComplete && !updated.solvedRooms.includes(roomId)) {
    // ...marks solvedRooms, room_solved, game_completed, same as before...
  }
}
```

`RoomService.attempt` computes `roomComplete = outcome.roomComplete ?? outcome.correct` and passes both
through.

**`room-03.ts`'s `check()` now sets `roomComplete: isLastOlympusRiddle` explicitly** — `true` only on
the very last Olympus riddle answered correctly, `false` on every other correct answer (all five Sphinx
riddles, and Olympus riddles 1 through 4). Those are still `correct: true` — they are real progress,
logged as such, and the player advances to the next riddle — they simply no longer trip the
`solvedRooms` mark meant for "the whole room is done."

## Consequences

- Room 3 (and any future multi-stage room) can have as many "correct" moments as it needs without any
  of them unlocking the next room early. A room's owner sets `roomComplete` deliberately instead of it
  being implied by `correct`.
- This is a real interface change to `AttemptOutcome` / `GameService.applyAttempt`'s signature. No
  `packages/shared` change was needed — `AttemptOutcome` lives in `apps/backend/src/domain/room-definition.ts`,
  the backend-internal room contract (ADR-0007), not the wire contract in `packages/shared/src/api.ts`.
  The wire response (`{ correct, feedback?, session }`) is unchanged; `session.solvedRooms` simply now
  updates at the *correct* moment instead of the first one.
- Two backend tests (`app.test.ts`'s "solving every room finishes the game", `game-events.test.ts`'s
  "records the game being completed, once, at the end") had been asserting the old, buggy behavior —
  submitting room-03's first-riddle solution once and expecting the whole room, and therefore the next
  room, to unlock. Both were rewritten to drive room-03 through its actual ten correct answers (five
  Sphinx, five Olympus) before checking that room-04 unlocks and the game completes.
- Every room owner who ever gives their room more than one stage must remember to set `roomComplete`
  correctly on every non-final correct answer. This is now the one thing a multi-stage room must get
  right that a single-stage room gets for free via the default — worth calling out explicitly in
  ADR-0007-adjacent guidance for future room owners, though not urgent enough on its own to justify a
  separate ADR.

## Alternatives considered

**Derive "is this the room's true final answer" inside `RoomService.attempt` itself**, e.g. by having
each room expose a `isFinalStage(session)` predicate instead of returning `roomComplete` per attempt.
Rejected: `check()` already has full access to the session and just determined which riddle was being
answered — asking it to also answer "is the room complete" as part of the same return value is less
surface area than a second method every `RoomDefinition` would need to implement.

**Give room-03 a dedicated "act complete" event type** instead of reusing the general attempt/correct
mechanism. Rejected as more machinery than the bug needed — the actual defect was a wrong default
(`correct` implying `roomComplete`), not a missing event type; fixing the default was the direct fix.
