# ADR-0004: Backend stack — Node + Express + TypeScript + Zod

- **Status:** Accepted
- **Date:** 2026-08-03
- **Deciders:** Nepomuk Crhonek, Eleonora Vynogradova, Abigail Romero
- **Approved-by:** Nepomuk Crhonek, 2026-08-03

## Context

The backend holds the puzzle solutions, owns the session state and decides which rooms a player may
enter. It is a small REST API — seven endpoints — but it is the security boundary of the whole game,
because on Thursday the other team will try to break it.

It also has to share TypeScript types with the frontend, which rules out a different language.

## Decision

- **Node 22** (LTS) with ES modules.
- **Express 5** as the HTTP framework. Express 5 handles rejected promises from async handlers
  natively, so an async route that throws lands in the error middleware instead of hanging the request
  — the single biggest footgun of Express 4 is gone.
- **TypeScript** in strict mode, compiled with `tsc` to `dist/` for production; `tsx watch` in
  development.
- **Zod** for validating every request body, parameter and header at the HTTP boundary. The schemas
  live in `packages/shared` so the frontend gets its types from the same definitions
  ([ADR-0005](0005-shared-contract-package.md)).
- **helmet** for security headers, **cors** pinned to the frontend origin, a JSON body limit of 10 kB,
  and **express-rate-limit** on the attempt endpoint so puzzle answers cannot be brute-forced.
- **Vitest** with **supertest** for route-level tests.

## Consequences

- Everything arriving over HTTP is parsed by a Zod schema before any handler sees it. A malformed body,
  a missing session header or a nonsense room id becomes a clean `400`, never a crash.
- The rate limit on `POST /api/rooms/:roomId/attempt` matters more than it looks: without it, a room
  whose answer is a four-digit code can be solved by a script in seconds. With it, brute force is not a
  viable attack during Thursday's testing session.
- Express is the framework the team already knows and the one every tutorial and Stack Overflow answer
  targets. Under a five-day deadline, familiarity beats elegance.
- We compile with `tsc` rather than bundling. Slower to start than a bundler, irrelevant at this size,
  and it keeps stack traces readable.

## Alternatives considered

**Fastify.** Faster, better TypeScript ergonomics and schema validation built in. Rejected because
nobody on the team has used it, and its plugin/encapsulation model is a genuine concept to learn — not
what we want to spend Tuesday on.

**Express 4.** Rejected: async errors have to be wrapped by hand in every route, and forgetting one
leaves a request hanging forever. That is precisely the kind of bug Thursday's testers find.

**No validation library, hand-written checks.** Fewer dependencies, but every endpoint grows its own
slightly different validation logic and the frontend types drift from what the server actually
accepts.
