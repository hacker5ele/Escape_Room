# ADR-0019: A game belongs to an account, and the session header goes away

- **Status:** Accepted
- **Date:** 2026-08-03
- **Deciders:** Nepomuk Crhonek
- **Approved-by:** Nepomuk Crhonek, 2026-08-03
- **Requires team agreement:** this changes `packages/shared`, so per
  [ADR-0005](0005-shared-contract-package.md) it must be walked through with Abigail and Eleonora
  before the room work builds on top of it.

## Context

Once players register ([ADR-0017](0017-authentication-clerk.md)) and progress persists
([ADR-0018](0018-dynamodb-persistence.md)), the existing session model has a hole in it.

Today a game is identified by an unguessable id that the browser sends as `X-Session-Id`. That id *is*
the credential: anyone holding it can play that game. That was fine while games were anonymous and
throwaway — there was nothing to steal. It stops being fine the moment a game belongs to a person,
because the header becomes a way to act as somebody else.

Simply keeping the header and *also* checking the logged-in user would work, but it means two
identifiers for one thing and a check that someone will eventually forget to write. The room routes are
the files three sub-teams will be editing all week.

## Decision

**A player has exactly one game, and the server derives it from the authenticated user.**

`X-Session-Id` is removed from the contract. Every endpoint that needs a game looks it up by the Clerk
`userId` on the verified request. There is no client-supplied identifier to forge, so there is no
ownership check to forget.

The API surface changes accordingly:

| Before | After |
| --- | --- |
| `POST /api/sessions` with `{ playerName }` | `POST /api/sessions` — starts or resumes the caller's game |
| `GET /api/sessions/:sessionId` | `GET /api/sessions/me` |
| `X-Session-Id` on every call | nothing; identity comes from the Clerk token |

`POST /api/sessions` becomes idempotent: it returns the caller's existing game if there is one, and
creates it otherwise. "Start" and "resume" stop being different operations, which removes a race that
existed between two tabs.

`playerName` comes from the Clerk profile rather than a form field, so there is nothing to validate and
nothing to spoof.

Every route under `/api` except `/api/health` now requires authentication. Health stays open because
App Runner calls it directly, exactly as it bypasses the origin guard.

## Consequences

- **Session hijacking stops being possible**, because there is no session identifier in flight to
  steal. The whole class of attack is designed out rather than defended against — which matters on
  Thursday.
- The frontend gets simpler: no session id to store, no `localStorage`, no rehydration on load, no
  handling of "the stored id no longer exists". `apps/frontend/src/game/storage.ts` disappears.
- **This is a breaking contract change.** `packages/shared` and every room route move together, and any
  room work already written against `X-Session-Id` needs updating. It is Monday, the rooms are not
  built yet, and that is precisely why this lands now rather than Wednesday.
- One game per player, forever. Replaying means resetting, so there is a `DELETE /api/sessions/me`.
  That is a deliberate choice: a leaderboard is meaningless if you can farm attempts by starting fresh.
- Anonymous play is gone. Nobody can look at a single room without registering, which is what was
  asked for, but it does mean there is no way to show the game to somebody quickly.
- `isRoomUnlocked(session, roomId)` in the shared package is untouched. The rule for *what* is unlocked
  does not change; only how the server decides *whose* game it is applied to.

## Alternatives considered

**Keep `X-Session-Id` and additionally verify it belongs to the caller.** Smaller diff, and it would
work. Rejected because it leaves a forgeable identifier on the wire and depends on every future room
route remembering an ownership check. Designing the parameter out is stronger than guarding it.

**Allow several games per account.** More flexible, supports replay and per-attempt scoring. Rejected
as scope: it needs a game-selection UI and a sort key in DynamoDB, and nothing this week needs it.
