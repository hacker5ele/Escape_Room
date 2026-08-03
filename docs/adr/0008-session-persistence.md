# ADR-0008: Session persistence is deliberately deferred

- **Status:** Superseded by [ADR-0018](0018-dynamodb-persistence.md)
- **Date:** 2026-08-03
- **Deciders:** Nepomuk Crhonek
- **Approved-by:** Nepomuk Crhonek, 2026-08-03

> **Superseded the same day.** Tying games to accounts ([ADR-0017](0017-authentication-clerk.md)) made
> the deferral untenable — an account whose progress vanishes on restart is worse than no account. The
> repository interface below survived the change intact, which is what it was for.

## Context

Game sessions have to live somewhere. The realistic options are an in-memory map, a SQLite file, or
Postgres in a container. Each pulls the Docker setup, the deployment story and the test setup in a
different direction, and picking wrong on Monday means undoing it on Wednesday.

Tuesday's milestone mentions *"Der Datenfluss (Frontend bis Backend/Database)"*, so a database is
plausibly expected at some point. But nothing on Monday depends on the answer, and an escape-room
session is short-lived by nature — it lasts one play-through, not one semester.

## Decision

**We do not decide yet.** This ADR records the deferral, not a choice.

For the bootstrap, sessions live in memory, behind an interface:

```ts
interface SessionRepository {
  create(session: GameSession): Promise<GameSession>
  findById(id: string): Promise<GameSession | null>
  save(session: GameSession): Promise<GameSession>
}
```

`InMemorySessionRepository` is the only implementation today. Every method is `async` even though
nothing awaits — so that a database-backed implementation drops in without changing a single caller.
Nothing outside `repositories/` knows how sessions are stored.

**Revisit on Tuesday**, when the data-flow milestone comes due, or earlier if either trigger fires:

- we want a leaderboard that survives a restart, or
- restarting the backend during a demo loses a session and that turns out to actually hurt.

When we decide, it becomes a new ADR that supersedes this one.

## Consequences

- Zero setup cost today: no database container, no migrations, no connection string, no extra failure
  mode during Monday's bootstrap.
- **Sessions are lost when the backend restarts.** In development that happens on every file save. The
  frontend must therefore handle "my stored session id no longer exists" gracefully — it starts a new
  game rather than showing an error. That behaviour is required either way, since sessions expire.
- Tests are fast and isolated, because each one constructs a fresh repository.
- The deferral is only safe as long as the interface stays honest. Nobody may reach into the map
  directly or add a synchronous shortcut — that would quietly turn a deferred decision into a
  permanent one.
- If we never revisit it, we ship an in-memory store. That is an acceptable outcome for a demo, and it
  should be a conscious choice rather than something we notice on Friday morning.

## Alternatives considered

**SQLite via `better-sqlite3`.** Real persistence, no extra container, one file on a volume. Rejected
for now only because it is a native module, which forces a Debian-based Docker image instead of Alpine
and adds a build step. A strong candidate on Tuesday.

**Postgres in `docker compose` with an ORM.** The most realistic architecture and the best match for
the Tuesday milestone. Rejected for the bootstrap: migrations, an ORM and a second container are a lot
of new machinery to introduce before the game itself exists.
