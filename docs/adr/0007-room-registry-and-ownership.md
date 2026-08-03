# ADR-0007: Rooms are plugins in a registry, with one owner each

- **Status:** Accepted
- **Date:** 2026-08-03
- **Deciders:** Abigail Romero, Nepomuk Crhonek, Eleonora Vynogradova, Inaam Ahmed
- **Approved-by:** Nepomuk Crhonek, 2026-08-03

## Context

The assignment splits the team across rooms: *"Ihr teilt das Team auf die 4 Räume auf. Jedes Unterteam
entwickelt einen Raum, die Rätsellogik und das Design."* Three developers building rooms in parallel
in one repository will spend their week resolving merge conflicts unless the file layout prevents them.

The naive structure — a `switch` on the room id in a component, a big `rooms.ts` with all the puzzle
logic — guarantees that every developer edits the same file every day.

## Decision

A room is a plugin, registered on both sides. Adding or removing a room is a one-line change.

**Backend.** Each room is one file, `apps/backend/src/domain/rooms/room-0N.ts`, exporting a
`RoomDefinition`:

```ts
interface RoomDefinition {
  id: RoomId
  order: number
  title: string
  getPublicPayload(session: GameSession): RoomPublicData  // never contains the solution
  check(answer: unknown, session: GameSession): AttemptResult
  hints: string[]
}
```

`domain/rooms/index.ts` collects them into an ordered `ROOMS` array. The routes iterate that array;
no route ever mentions a specific room.

**Frontend.** Each room is one folder, `apps/frontend/src/rooms/room-0N/`, exporting a component that
receives the same props for every room:

```ts
interface RoomProps {
  room: RoomPublicData
  onSubmit: (answer: unknown) => Promise<AttemptResult>
  onHint: () => Promise<string>
}
```

`rooms/registry.ts` maps each room id to a lazily imported component.

**Ownership.** Each room has one owner, who owns exactly that backend file and that frontend folder.
Anything shared — the registry contract, the session service, `packages/shared` — is jointly owned and
needs an ADR to change.

| Room | Owner |
| --- | --- |
| Room 1 | _assign on Monday_ |
| Room 2 | _assign on Monday_ |
| Room 3 | _assign on Monday_ |
| Room 4 | _assign on Monday_ |

Inaam owns the visual design of all four rooms and the shared component look, working from Figma.

## Consequences

- Two developers building different rooms never edit the same file. The only shared line is the
  registry entry, and a conflict there is one line, trivially resolved.
- Every room speaks the same interface, so the shell — progress bar, timer, hint button, transitions —
  is written once and works for all rooms.
- The room count is not baked in anywhere. The assignment allows 2–4; if room 4 does not get finished
  by Thursday, deleting one registry entry on each side removes it cleanly. That is our schedule
  insurance.
- Rooms are lazily loaded, so a room that fails to compile does not take down the rest of the app in
  development.
- The cost: the props interface has to fit every puzzle. `answer` is therefore `unknown` and each room
  narrows it in its own `check()`. Slightly awkward typing in exchange for genuine independence.
- If a room needs something the interface does not offer, that is an interface change — ADR and team
  agreement first, per [ADR-0005](0005-shared-contract-package.md). Do not widen it quietly.

## Alternatives considered

**One file with a `switch` over room ids.** Simplest to read on day one, and a guaranteed merge
conflict every single day for three developers.

**Fully independent rooms with no shared interface.** Maximum freedom per sub-team, but then the shell,
the progress handling and the hint system are written four times and behave four different ways.
