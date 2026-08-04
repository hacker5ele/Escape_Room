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


---

# The social layer

Added by ADRs [0023](adr/0023-public-profiles.md)–[0029](adr/0029-rate-limits-per-account-and-invite-acceptance.md).
Every endpoint below needs `Authorization: Bearer <clerk session token>` **except** the invite
preview, which is called out where it appears.

## Friends

### `GET /api/friends`

`200` → `{ friends: Friend[], incoming: Friend[], outgoing: Friend[] }`

Each `Friend` carries the other person's public profile, so a list of faces renders without a second
request. `incoming` are people waiting on you; `outgoing` are people you are waiting on. Blocked
edges appear in none of the three.

### `POST /api/friends/by-username` — `{ username }`

`201` → the updated lists. `404 PROFILE_NOT_FOUND` if nobody has that username — the message says the
index is eventually consistent, because somebody who signed up seconds ago genuinely may not be
findable yet. `409 ALREADY_FRIENDS`, `400 CANNOT_FRIEND_SELF`.

Asking somebody who has already asked you is treated as **accepting**, so two people who request each
other at the same moment end up friends rather than both waiting.

If they have blocked you, this returns `201` and does nothing they can see. That is deliberate:
telling somebody they are blocked is an invitation to make another account.

### `POST /api/friends/:userId/accept`

`200` → the updated lists. `404` if there is no request from them.

### `DELETE /api/friends/:userId`

`200` → the updated lists. Rejecting a request and unfriending are the same operation.

### `POST /api/friends/:userId/block` · `POST /api/friends/:userId/unblock`

`200` → the updated lists. Blocking removes the friendship, keeps an edge on your side so future
requests are refused, and closes any open conversation.

## Invite links

### `GET /api/invites/:token` — **open, no account required**

`200` → `{ inviter: PublicProfile }`

The point of a link is that it works before you have an account. It returns the inviter's public
profile and nothing else — not who else joined, not when it was made, not how many times it has been
used.

`404 INVITE_INVALID` for unknown, revoked **and** expired alike. They are indistinguishable on
purpose, so the endpoint cannot be used to learn which tokens once existed.

This is the only endpoint here rate limited by IP, because an anonymous caller offers nothing else to
key on. It is also the tightest budget in the API.

### `POST /api/invites`

`201` → `{ invite }`. The token is 16 random bytes, base64url. Links expire after seven days.

### `GET /api/invites` · `DELETE /api/invites/:token`

Your own links, to share or to revoke. Revoking a link you do not own reports exactly what a
non-existent token reports, so it cannot be used to test whether one is real.

### `POST /api/invites/:token/accept`

`201` → the updated lists, **already friends** — the link was the inviter's consent, so there is
nothing left for them to approve ([ADR-0029](adr/0029-rate-limits-per-account-and-invite-acceptance.md)).

A block still wins, silently. `400 CANNOT_FRIEND_SELF` for your own link.

## Notifications

### `GET /api/sync?since=`

`200` → `{ now, notifications, unreadCount }`

One poll for the whole app. Send back the `now` from the previous response as `since` — **never the
browser's clock**, which if fast would ask for notifications from the future and receive nothing
for ever.

The server reaches five seconds further back than the cursor it is given, so a row written but not yet
committed when the last poll ran is not skipped. Clients therefore see occasional duplicates and
**must dedupe by `id`**.

`unreadCount` is counted from storage rather than from the notifications in the response, so the badge
stays correct even when the page is empty or truncated.

Never cached: `Cache-Control: no-store, private`.

### `POST /api/sync/read`

`204`. Marks everything read. Opening the bell is the trigger.

## Chat

### `GET /api/chat/:userId/messages?since=`

`200` → `{ messages }`, oldest first. `since` is a message's `${createdAt}#${id}`.

Note the address: a **person**, never a conversation. The server derives the conversation id from the
two user ids, so there is no request shape in which a caller can name a conversation they are not part
of. Friendship is re-checked on every read and write, so being unfriended or blocked closes an
already-open window.

`403 NOT_FRIENDS` for a stranger, a pending request, an unfriending or a block — one error for all
four, so it cannot be used to tell them apart.

### `POST /api/chat/:userId/messages` — `{ body }`

`201` → `{ message }`. Body is trimmed, must be non-empty, and is capped at 2000 characters — a
message is returned on every poll to everybody in the conversation, so an unbounded field makes
somebody else's future requests expensive.

Text is stored exactly as typed and escaped at render, not on the way in.

The recipient gets **one** notification per unread conversation, not one per message.

## Leaderboard

### `GET /api/leaderboard/friends`

`200` → `{ entries }`, ranked by rooms solved, then finishing time, then hints used, then username so
the order is stable between requests.

Derived from what the game already records — there is no score table to drift. Friends only; there is
no global board and no way to ask for anybody else's list.

## Co-op

### `GET /api/party`

`200` → `{ party: { host, members, isHost } }`. Playing alone is a party of one, so there is no
separate solo case. `members` never includes the caller.

### `POST /api/party/invite/:userId`

`204`. Creates a notification and nothing else — joining is the invitee's decision, because pulling
somebody out of their own half-finished game would lose their place. `409 NOT_HOST` if you are
playing in somebody else's game.

### `POST /api/party/join/:userId`

`201` → `{ party }`. Your own game is set aside untouched, not merged; leaving puts you back into it.

`403 NOT_FRIENDS`, `404 SESSION_NOT_FOUND` if they have not started a game, and `409 NOT_HOST` both if
they are themselves a guest and if people are currently in *your* game — leaving would strand them.

### `DELETE /api/party` · `DELETE /api/party/members/:userId`

Leave, and the host sending somebody home. Only the host can do the latter.

## Concurrency

Every write to a game is conditional on its `version`. Two players solving at the same moment would
otherwise each read the same game, each append an event, and the second write would silently discard
the first. On conflict the server re-reads and re-applies rather than replaying a stale result;
after three attempts it reports `409 GAME_CONFLICT`.
