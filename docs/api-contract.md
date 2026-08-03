# API contract

The HTTP interface between `apps/frontend` and `apps/backend`.

This document describes it in prose. The **authoritative** definition is
`packages/shared/src/api.ts` — the Zod schemas there are what the backend
validates against and what the frontend types are inferred from. If this file
and the code ever disagree, the code is right and this file is a bug.

Changing anything here is an interface change: it needs an ADR and the team's
agreement *before* the code changes. See
[ADR-0005](adr/0005-shared-contract-package.md).

## Conventions

- Base path `/api`. The frontend always calls it relatively — Vite proxies it in
  development, nginx in production, so the browser only ever talks to one origin.
- Bodies are JSON, capped at 10 kB.
- The session id travels in the **`X-Session-Id`** header, not in the body or the
  URL. It is a `crypto.randomUUID()`.
- Every non-2xx response has the same shape:

  ```json
  { "error": { "code": "ROOM_LOCKED", "message": "Solve the previous room first." } }
  ```

  Codes: `VALIDATION_ERROR`, `SESSION_NOT_FOUND`, `ROOM_NOT_FOUND`, `ROOM_LOCKED`,
  `ROOM_ALREADY_SOLVED`, `NO_HINTS_LEFT`, `RATE_LIMITED`, `INTERNAL_ERROR`.
  Branch on `code`, never on the message text — messages change.

## The session

```ts
{
  id: string            // uuid
  playerName: string
  solvedRooms: RoomId[]
  startedAt: string     // ISO 8601
  finishedAt: string | null
  hintsUsed: number
}
```

There is no `currentRoom` field on purpose. Which room the player is in follows
from `solvedRooms`; use `currentRoomId(session)` from the shared package so the
two can never contradict each other.

## Endpoints

### `GET /api/health`

No session needed. Returns `{ status: "ok", uptime: number }`. Used by the
container healthcheck.

### `POST /api/sessions`

Starts a game. Body `{ playerName: string }`, 1–32 characters after trimming.

`201` → `{ session }`. `400` if the name is empty or too long.

### `GET /api/sessions/:sessionId`

Rehydrates a session after a page reload.

`200` → `{ session }`. `404 SESSION_NOT_FOUND` if it does not exist — which also
happens after a backend restart, because sessions are currently in memory
([ADR-0008](adr/0008-session-persistence.md)). The frontend must treat this as
"start a new game", not as an error.

### `GET /api/rooms`

Header: `X-Session-Id`.

`200` → `{ rooms: RoomSummary[] }`, one entry per room:

```ts
{ id: RoomId, order: number, title: string, unlocked: boolean, solved: boolean }
```

Metadata only. No puzzle content, so this is safe to call for the whole map.

### `GET /api/rooms/:roomId`

Header: `X-Session-Id`. **This is the gate.**

`200` → `{ room }`:

```ts
{
  id: RoomId
  order: number
  title: string
  intro: string
  prompt: string
  data: Record<string, unknown>   // whatever the puzzle needs to render
  hintsAvailable: number
}
```

`403 ROOM_LOCKED` if any preceding room is unsolved. The room's payload is not
even constructed in that case.

`data` never contains the solution. A test enforces this for every room.

### `POST /api/rooms/:roomId/attempt`

Header: `X-Session-Id`. Body `{ answer: unknown }`.

The answer is deliberately untyped — a room may want a word, a number or a list,
and each room narrows it in its own `check()`.

`200` → `{ correct: boolean, feedback?: string, session }`

The response always carries the updated session, so the frontend never has to
compute progress itself. `403 ROOM_LOCKED` if the room is not open.

**Rate limited** — 30 attempts per IP per minute by default. Exceeding it gives
`429 RATE_LIMITED`. This is what stops a short numeric answer being brute-forced;
see [ADR-0006](adr/0006-server-authoritative-puzzles.md).

### `POST /api/rooms/:roomId/hint`

Header: `X-Session-Id`.

`200` → `{ hint: string, hintsUsed: number, hintsRemaining: number }`

Hints come one at a time, in order, and are counted on the server so they can be
used for scoring. `409 NO_HINTS_LEFT` when the room runs out, `403 ROOM_LOCKED`
if it is not open.

## A full play-through

```
POST /api/sessions            { playerName: "Abigail" }        -> session, solvedRooms: []
GET  /api/rooms/room-01                                        -> room 1 payload
GET  /api/rooms/room-02                                        -> 403 ROOM_LOCKED
POST /api/rooms/room-01/attempt  { answer: 90 }                -> correct: true, solvedRooms: ["room-01"]
GET  /api/rooms/room-02                                        -> room 2 payload
...
POST /api/rooms/room-04/attempt  { answer: 108 }               -> finishedAt set
```
