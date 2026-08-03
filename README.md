# Der digitale Escape Room

A web-based escape room: a sequence of rooms, each holding a puzzle. A room only
opens once the one before it has been solved.

Built during project week KW 32 by Abigail Romero, Nepomuk Crhonek, Inaam Ahmed
and Eleonora Vynogradova.

> **Read [`CLAUDE.md`](CLAUDE.md) before your first commit.** It holds the team
> rules — most importantly that no commit happens without an ADR, and that every
> ADR is approved by Nepomuk.

## Requirements

Node 22 or newer (`.nvmrc` pins it), and Docker if you want to run the container
stack.

## Getting started

```bash
npm install
npm run dev
```

That starts three things at once: the shared package in watch mode, the API on
<http://localhost:3000>, and the app on <http://localhost:5173>. Open the app —
it tells you whether it can reach the backend.

## Commands

All of these run from the repository root.

| Command | What it does |
| --- | --- |
| `npm run dev` | Shared package (watch) + backend + frontend together |
| `npm run build` | Builds shared, then backend, then frontend |
| `npm run typecheck` | Strict TypeScript across every workspace |
| `npm run lint` | ESLint across the repo |
| `npm run test` | Vitest across every workspace |
| `npm run format` | Prettier, writes in place |
| `docker compose up --build` | Whole stack on <http://localhost:8080> |

Add `--workspace @escape-room/backend` (or `frontend`, or `shared`) to run a
script for one workspace only.

## Layout

```
packages/shared     @escape-room/shared — the interface contract, imported by both apps
apps/backend        Node + Express + TypeScript. Owns sessions and puzzle solutions.
apps/frontend       React + Vite + TypeScript + Tailwind. Holds no answers.
docs/adr            Architecture Decision Records. Read these to understand why.
```

## How it fits together

Three things are worth knowing before you write code.

**The contract is one file tree.** Types, request and response schemas, and the
`isRoomUnlocked()` rule all live in `packages/shared`. Both apps import them, so
a breaking change fails the typecheck on both sides immediately. Changing
anything there needs an ADR and the team's agreement first — see
[ADR-0005](docs/adr/0005-shared-contract-package.md).

**The server decides everything.** Puzzle answers exist only in
`apps/backend/src/domain/rooms/` and are never sent to the browser. Asking for a
room you have not unlocked returns 403. The frontend can lie to itself; it
cannot lie to the API. See
[ADR-0006](docs/adr/0006-server-authoritative-puzzles.md).

**Rooms are plugins.** One backend file and one frontend folder per room, wired
through a registry, so three people can build rooms in parallel and only ever
conflict on a single registry line. See
[ADR-0007](docs/adr/0007-room-registry-and-ownership.md).

## Adding a room

1. Write `apps/backend/src/domain/rooms/room-0N.ts`, exporting a
   `RoomDefinition`. The solution lives in `check()` and nowhere else.
2. Register it in `apps/backend/src/domain/rooms/index.ts`.
3. Add the expected answer to `solutions.fixture.ts` so the safety tests cover
   your room.
4. Build the frontend folder `apps/frontend/src/rooms/room-0N/`.
5. `npm run test` — the suite checks that your room never leaks its answer.

Copy `room-01.ts` as a starting point; the four existing rooms are placeholders
and are meant to be replaced.

## Current state

The scaffold is complete and the backend implements the full API with four
placeholder puzzles. The frontend is intentionally a single page — it proves
React, Tailwind, the shared package and the backend proxy all work, and nothing
more. The game UI is the team's work.

## Environment

Copy `.env.example` to `.env` if you want to change anything. The defaults work
for local development, and the frontend deliberately has no backend URL in it —
`/api` is proxied by Vite in development and by nginx in production.
