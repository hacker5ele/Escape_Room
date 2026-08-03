# ADR-0006: Puzzle validation happens on the server, never in the browser

- **Status:** Accepted
- **Date:** 2026-08-03
- **Deciders:** Nepomuk Crhonek, Abigail Romero, Eleonora Vynogradova
- **Approved-by:** Nepomuk Crhonek, 2026-08-03

## Context

The obvious way to build an escape room is to put the answer in the room component and compare it to
what the player typed. It works, it is one line of code, and it is completely broken: anything the
browser can compare, the player can read. Open the dev tools, look at the bundle, read every answer.

On Thursday the other project team gets our application and is explicitly told to break it. A
client-side answer check is the first thing they will find, and once they have it there is no game
left to demo on Friday.

The assignment also states that room 2 may only be entered once puzzle 1 is solved. If that rule lives
in the router, it is a redirect — and a redirect is a suggestion, not a lock.

## Decision

The backend is the only authority on puzzle state.

- Solutions exist **only** in `apps/backend/src/domain/rooms/room-0N.ts`, inside each room's `check()`
  function. They are never part of any response body.
- `getPublicPayload()` returns what the room needs to render — prompts, images, scrambled data — and is
  the only thing the browser receives.
- `POST /api/rooms/:roomId/attempt` performs the comparison server-side and returns `{ correct }` plus
  the updated session.
- `GET /api/rooms/:roomId` returns **403** if `isRoomUnlocked(session, roomId)` is false. Guessing the
  URL of room 3 gets you a 403, not room 3.
- The frontend's `RoomGuard` is user experience only. It is documented as such so nobody mistakes it
  for protection.
- Attempts are rate-limited, because a four-digit code is trivially brute-forced otherwise.

A test in the backend suite asserts that no room's public payload contains its solution. If someone
adds a room and leaks the answer through the payload, CI fails before the pull request is merged.

## Consequences

- Every answer check is a network round trip. For a puzzle game this is invisible, and it lets us show
  a proper "checking…" state.
- Rooms cannot be developed purely in the frontend. A new room needs its backend definition first —
  which is the right order anyway, since the puzzle *is* the backend definition.
- Progress lives on the server, so a player cannot skip ahead by editing `localStorage`. The session id
  in `localStorage` is only an identifier; the state it points at is ours.
- Hints are also server-side, which means we can count them and use them for scoring on Friday.
- The cost: no offline play, and a demo requires the backend to be running. Acceptable — the assignment
  asks for a frontend-to-backend data flow, so a backend is required regardless.

## Alternatives considered

**Client-side checking with a hashed answer.** Better than plaintext, but a hash of a four-digit code
falls to a rainbow table in milliseconds, and the room list still leaks the puzzle structure.

**Client-side checking, accepting the risk.** Faster to build and genuinely fine for a game played
honestly. Rejected because Thursday's exercise makes dishonest play a scheduled event.
