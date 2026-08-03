# ADR-0005: `@escape-room/shared` is the single interface contract

- **Status:** Accepted
- **Date:** 2026-08-03
- **Deciders:** Nepomuk Crhonek, Abigail Romero, Eleonora Vynogradova
- **Approved-by:** Nepomuk Crhonek, 2026-08-03

## Context

The assignment is unusually specific here: *"Änderungen an Schnittstellen oder Datenstrukturen müssen
zwingend vorab mit dem gesamten Team abgesprochen werden."* A rule like that needs something concrete
to point at. If the session type is declared once in the backend and again in the frontend, "the
interface" is not a thing anyone can review — it is two things that happen to agree today.

There is a second, subtler problem. The rule that decides whether a player may enter a room exists on
both sides: the backend enforces it, and the frontend needs it to grey out locked rooms. Two
implementations of the same rule will disagree eventually, and the disagreement will look like a bug
in whichever room is unlucky.

## Decision

`packages/shared` is the contract. It exports, and is the only place that declares:

- the domain types — `GameSession`, `RoomId`, `RoomSummary`, `RoomPublicData`, `AttemptResult`;
- every request and response shape, as Zod schemas with TypeScript types inferred from them via
  `z.infer`, so the runtime validation and the compile-time type can never disagree;
- the unlock rule itself: `isRoomUnlocked(session, roomId)`, imported by the backend route guard and
  by the frontend router guard.

The package compiles to `dist/` as JavaScript plus declaration files, because the backend runs
compiled Node code and cannot import raw TypeScript at runtime.

**Changing anything in `packages/shared` requires a new ADR and prior agreement with the team.** That
is the mechanism behind the assignment's rule.

## Consequences

- A breaking contract change fails the typecheck in both apps immediately, instead of surfacing as a
  runtime error during a demo.
- One function decides who may enter which room, so the UI and the API can never disagree about it.
  The frontend guard remains a convenience only — the backend is still the authority
  ([ADR-0006](0006-server-authoritative-puzzles.md)).
- Deriving types from Zod schemas means the validator and the type are the same declaration. There is
  no way to add a field to the type and forget it in the schema.
- The cost: `packages/shared` has to be built before either app runs. The root `dev` script keeps it in
  watch mode and `build` compiles it first, but this is the one piece of setup a new team member has to
  understand.
- A pull request touching `packages/shared` is a signal to the whole team, not a routine change.

## Alternatives considered

**Types defined in the backend, imported by the frontend.** Fewer moving parts, but it makes the
frontend depend on the backend's internals, and the backend's internal types are not the same thing as
its public API.

**Hand-written TypeScript interfaces plus separate Zod schemas.** More readable at a glance. Rejected
because the two drift: someone adds a field to the interface and the schema silently strips it.

**An OpenAPI specification with generated clients.** The industrially correct answer, and genuinely
better on a long-lived project. Too much tooling for five days, and the generator becomes another
thing that can break on Thursday.
