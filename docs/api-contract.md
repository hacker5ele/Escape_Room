# API contract

The HTTP interface between `apps/frontend` and `apps/backend`.

This document describes it in prose. The **authoritative** definition is
`packages/shared/src/api.ts` — the Zod schemas there are what the backend validates against and what
the frontend types are inferred from. If this file and the code ever disagree, the code is right and
this file is a bug.

Changing anything here is an interface change: it needs an ADR and the team's agreement *before* the
code changes. See [ADR-0005](adr/0005-shared-contract-package.md).

## Conventions

- Base path `/api`. The frontend always calls it relatively — Vite proxies it in development, nginx in
  production — so the browser only ever talks to one origin.
- Bodies are JSON, capped at 10 kB.
- **Every endpoint except `/api/health` requires a signed-in user.** Authentication is a Clerk session
  token in the `Authorization: Bearer …` header. See [ADR-0017](adr/0017-authentication-clerk.md).
- **There is no session id anywhere.** A player has exactly one game and the server finds it from the
  verified token, so nothing identifying a game travels on the wire where it could be forged. See
  [ADR-0019](adr/0019-games-belong-to-accounts.md).
- Every non-2xx response has the same shape:

  ```json
  { "error": { "code": "ROOM_LOCKED", "message": "Solve the previous room first." } }
  ```

  Codes: `UNAUTHENTICATED`, `PROFILE_INCOMPLETE`, `VALIDATION_ERROR`, `SESSION_NOT_FOUND`, `ROOM_NOT_FOUND`, `ROOM_LOCKED`,
  `ROOM_ALREADY_SOLVED`, `NO_HINTS_LEFT`, `RATE_LIMITED`, `INTERNAL_ERROR`.
  Branch on `code`, never on the message text — messages change.

## The game

```ts
{
  id: string            // uuid
  userId: string        // Clerk user id — the partition key in DynamoDB
  username: string      // unique across the Clerk instance; the player's public identity
  playerName: string    // from the Clerk profile, not a form field
  solvedRooms: RoomId[]
  startedAt: string     // ISO 8601
  finishedAt: string | null
  hintsUsed: number
  events: GameEvent[]   // the activity log, oldest first
}
```

There is no `currentRoom` field on purpose. Which room the player is in follows from `solvedRooms`; use
`currentRoomId(game)` from the shared package so the two can never contradict each other.

### `GameEvent`

```ts
{
  at: string            // ISO 8601
  type: 'game_started' | 'room_entered' | 'attempt' | 'hint_taken' | 'room_solved' | 'game_completed'
  roomId?: RoomId       // absent on whole-game events
  correct?: boolean     // on 'attempt' only
  answer?: string       // on 'attempt' only, truncated to 120 characters
}
```

Append-only, capped at 500 events with the oldest dropped — the log shares a DynamoDB item with the
game, and an item cannot exceed 400 kB. See [ADR-0020](adr/0020-activity-log.md).

## Endpoints

### `GET /api/health`

The only unauthenticated endpoint. Returns `{ status: "ok", uptime: number }`. Used by the App Runner
health check, which calls the container directly and therefore carries neither a Clerk token nor the
CloudFront origin secret.

### `POST /api/sessions`

Starts the caller's game, or returns the one they already have. **Idempotent** — two browser tabs
cannot race each other into two different games. Takes no body.

`201` → `{ session }`. `401 UNAUTHENTICATED` if not signed in.

`409 PROFILE_INCOMPLETE` if the Clerk profile has no username. Uniqueness is Clerk's to enforce, and
the check lives here rather than in the UI so that skipping the form achieves nothing. See
[ADR-0021](adr/0021-unique-usernames.md).

### `GET /api/sessions/me`

`200` → `{ session }`, including the full activity log.

`404 SESSION_NOT_FOUND` if the caller has never started a game. That is not an error state — the
frontend treats it as "call POST first".

### `DELETE /api/sessions/me`

Wipes the caller's progress so they can replay from room one. `204`, no body.

### `GET /api/rooms`

`200` → `{ rooms: RoomSummary[] }`, one entry per room:

```ts
{ id: RoomId, order: number, title: string, unlocked: boolean, solved: boolean }
```

Metadata only — no puzzle content, so this is safe to call for the whole map.

### `GET /api/rooms/:roomId`

**This is the gate.**

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

`403 ROOM_LOCKED` if any preceding room is unsolved. The room's payload is not even constructed in that
case.

`data` never contains the solution. A test enforces this for every room.

Records a `room_entered` event the first time only — refreshing does not re-log.

### `POST /api/rooms/:roomId/attempt`

Body `{ answer: unknown }`. The answer is deliberately untyped: a room may want a word, a number or a
list, and each room narrows it in its own `check()`.

`200` → `{ correct: boolean, feedback?: string, session }`

The response always carries the updated game, so the frontend never computes progress itself. Every
attempt is logged, right or wrong. `403 ROOM_LOCKED` if the room is not open.

**Rate limited** — 30 attempts per IP per minute in production, 10 in staging. Exceeding it gives
`429 RATE_LIMITED`. This is what stops a short numeric answer being brute-forced. The limiter runs
*before* the authentication check, so it protects the endpoint even against callers who never sign in.

### `POST /api/rooms/:roomId/hint`

`200` → `{ hint: string, hintsUsed: number, hintsRemaining: number }`

Hints come one at a time, in order, and are counted on the server so they can be used for scoring.
`409 NO_HINTS_LEFT` when the room runs out, `403 ROOM_LOCKED` if it is not open.

## A full play-through

```
POST   /api/sessions                              -> 201, solvedRooms: []
GET    /api/rooms/room-01                         -> room 1 payload
GET    /api/rooms/room-02                         -> 403 ROOM_LOCKED
POST   /api/rooms/room-01/attempt  { answer: 90 } -> correct: true, solvedRooms: ["room-01"]
GET    /api/rooms/room-02                         -> room 2 payload
...
POST   /api/rooms/room-04/attempt  { answer: 108 } -> finishedAt set, game_completed logged
```

Every request above carries `Authorization: Bearer <clerk session token>`.
