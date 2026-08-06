# ADR-0051: A room decides when it is done showing its own finale

- **Status:** Proposed
- **Date:** 2026-08-05
- **Deciders:** Inaam Ahmed
- **Approved-by:** _(pending — awaiting Nepomuk Crhonek's review)_

## Context

Room 3's finale is a sequence of scenes: the Sphinx's own ending chamber, Poseidon's throne room, the
Olympus hall, and finally a waiting room where the player is told the game is over. A player reported
finishing Olympus and being bounced straight back to somewhere earlier, with none of that sequence
actually shown.

Root cause: `App.tsx`'s `CurrentRoom` advances to the next room the instant the server marks the current
one solved. `onSubmit`'s handler compared `currentRoomId(result.session)` against the room currently
displayed — the moment they differed (because the last attempt made the room `roomComplete`, ADR-0050),
it called `setState({ kind: 'loading' })`, which unmounts whatever `RoomComponent` was on screen and
starts loading the next one. For room-03 specifically, the Olympus finale's own last correct answer
*is* the moment the room becomes solved — so the entire post-Olympus sequence (the waiting room, the
"Finish" button) could never render at all; the app was already tearing the room down mid-celebration.

This is a second, distinct bug from ADR-0050's — that one was about *when the server* considers a room
solved; this one is about *when the app* acts on that fact. Both had to be fixed for a multi-stage room
to actually finish the way it's built to.

## Decision

**`RoomProps` gains a new callback: `onRoomFinished: () => void`.** A room calls it when it is actually
ready to hand control back to the app — not necessarily the instant its last answer is checked. Rooms
with no finale of their own (rooms 1, 2, 4, once built) can call it immediately after a correct final
answer, which reproduces the old behavior exactly. Room 3 calls it only from the waiting room's
"Finish" button, at the very end of its whole scene sequence.

**`CurrentRoom` in `App.tsx` splits "which room the server thinks is current" from "which room is
displayed."**

```ts
const serverRoomId = currentRoomId(game)
const [displayedRoomId, setDisplayedRoomId] = useState(serverRoomId)
```

`displayedRoomId` — not `serverRoomId` — drives which room's data is fetched and which `RoomComponent`
renders. `onSubmit` no longer advances it; it only refetches the *current* room's data (so a multi-stage
room's own internal progress, e.g. its next riddle, still shows immediately) and calls `onGameChange` to
keep the top-level session current. Only `onRoomFinished` calls `setDisplayedRoomId(currentRoomId(game))`,
catching the displayed room up to whatever the server already thinks is current.

## Consequences

- A room can now show an arbitrarily long finale sequence — multiple scenes, multiple button presses —
  entirely on its own schedule, without racing the app tearing it down underneath it.
- Every room that gets a real frontend component from here on must remember to call `onRoomFinished`.
  A room that never calls it will show its last screen forever even after the server has moved on — the
  mirror-image failure mode of the bug this fixes. This is now the one thing a room author must
  remember, the same way ADR-0050 made `roomComplete` the one thing a multi-stage room's `check()` must
  set correctly. Both are called out in `room-props.ts`'s own doc comment for the next room owner to read
  before they build against it.
- `apps/frontend/src/rooms/preview.tsx`'s mock `RoomProps` gained a no-op `onRoomFinished` to keep
  compiling; the preview never needs it to do anything, since it isn't wired to real session/room
  advancement at all.
- Room 3's actual finale, once this and ADR-0050 were both fixed, is: Sphinx's five riddles → Atlantis
  quest → Poseidon's throne room (a seated greeting, then a walk into the light, on the player's own
  button press) → Olympus's five riddles → a waiting room with three memory-windows onto the pyramid,
  Atlantis, and Olympus, and a closing word from an unnamed luminous figure → "Finish."

## Alternatives considered

**Keep advancing immediately, and have room-03 render its finale as an overlay on top of whatever comes
next.** Rejected: the next room (or the "every room is solved" placeholder) would already be mounted
and doing its own thing underneath, wasting work and risking whatever that room does on mount (e.g. a
fetch) happening while the player is still meant to be inside room-03's own ending.

**Give the room a fixed timer instead of a callback**, e.g. "advance 30 seconds after the room is marked
solved regardless of what's on screen." Rejected: ties the app's advancement logic to guessing how long
a room's finale takes, which breaks the moment any room's finale timing changes — a callback the room
controls directly needs no such guess and can never drift out of sync with what's actually on screen.
