# Escape Room — Project Guide

Project week KW 32 (Mon 2026-08-03 → Fri 2026-08-07). We are building **Projekt A: Der digitale
Escape Room**.

This file is the single entry point for the whole team and for Claude. It holds the binding rules, the
original assignment, the architecture, and the decision log. **It must always reflect the latest
accepted decisions** — if a decision changes, this file changes in the same pull request.

---

## 1. Binding rules

These rules are not suggestions. They apply to every team member and to Claude.

1. **The user makes all decisions. The agent makes none.** Claude does not choose libraries,
   architectures, data models, naming schemes, scope or trade-offs on its own. When a decision is
   needed, Claude **stops and asks** — it presents the options with their consequences and waits for a
   person to choose. Executing an already-approved decision is work; picking between two options is a
   decision. If Claude is unsure which of the two it is facing, it is facing a decision, and it asks.
   "It seemed obvious" and "it was the standard choice" are not exceptions to this rule.
2. **No commit without an ADR.** Every commit must trace back to an Architecture Decision Record in
   [`docs/adr/`](docs/adr/). If your change is not covered by an existing ADR, write a new one first.
3. **Every ADR must be approved by Nepomuk Crhonek.** An ADR is only valid once its status is
   `Accepted` and the `Approved-by` field names Nepomuk Crhonek with a date. Nobody else may set an
   ADR to `Accepted`.
4. **Claude must not push until the user explicitly says the ADR is approved.** Claude may write
   files, install dependencies, run builds and tests — but it stops before `git push` and waits for an
   explicit statement such as "the ADR is approved". No implicit approval, no assumptions.
5. **This file stays current.** Any accepted decision is reflected here (architecture section and
   decision log) as part of the same change.
6. **No direct pushes to `main`.** Feature branches and pull requests only — this is a rule from the
   assignment itself.
7. **Interface changes need agreement first.** Any change to the API surface or the data model
   requires an ADR *and* prior agreement with the whole team, before the code is written.

### The approval flow in practice

```
a decision is needed
      ↓
Claude STOPS and presents the options — it does not pick one
      ↓
a person decides  →  write ADR (Status: Proposed)
      ↓
open PR  →  team discusses  →  Nepomuk approves
      ↓
Status: Accepted + Approved-by filled in
      ↓
now, and only now: commit the implementation and push
```

---

## 2. Team & roles

| Person | Role |
| --- | --- |
| **Nepomuk Crhonek** | Development · **ADR approver** · architecture owner |
| **Abigail Romero** | Development |
| **Eleonora Vynogradova** | Development |
| **Inaam Ahmed** | UX/UI design — she owns the Figma designs |

Room ownership is assigned in [ADR-0007](docs/adr/0007-room-registry-and-ownership.md). Each room is
one backend file and one frontend folder, so two people rarely touch the same file.

---

## 3. The assignment (original, verbatim)

> The block below is the original assignment text as handed to us, reproduced **exactly** and in
> German. **Do not translate, reword, reformat or "fix" it** — it is a quotation and the source of
> truth for what we owe at the end of the week. All other documentation in this repo is English.

```text
Wochenprogramm KW 32
Willkommen 
zu eurer Ferien-Projektwoche! In den nächsten 5 Tagen arbeitet ihr an einem von zwei Grossprojekten. Ihr entscheidet selbst, in welchem Projekt ihr mitwirken wollt. Innerhalb des gewählten Projekts organisiert ihr euch selbstständig in Unterteams (z.B. Frontend, Backend, UX, Testing).
Die zwei Projekte zur Auswahl
Projekt A: 
Der digitale Escape Room
Ihr baut gemeinsam eine interaktive Web-Applikation als Escape Room.
Das Konzept: Das Spiel besteht aus 2-4 aufeinanderfolgenden Räumen. Jeder Raum stellt den Spieler vor ein neues Rätsel oder eine programmiertechnische Aufgabe.
Eure Aufgabe: Ihr teilt das Team auf die 4 Räume auf. Jedes Unterteam entwickelt einen Raum, die Rätsellogik und das Design.
Die Herausforderung: Die Übergabe des Spielzustands (State) von Raum zu Raum muss nahtlos funktionieren. Raum 2 lässt sich nur betreten, wenn Rätsel 1 gelöst wurde. Ihr müsst saubere Schnittstellen definieren und euch eng absprechen.
Projekt B:
 Die Arcade-Plattform mit Highscore-System
Ihr entwickelt eine Spiele-Plattform, die mehrere browserbasierte Mini-Games hostet und zentral verwaltet.
Das Konzept: Eine Plattform, auf der verschiedene Spiele (z.B. Quiz, Memory, Snake, Tic-Tac-Toe, Reaktionsspiel) gespielt werden können.
Eure Aufgabe: Ihr baut die Plattform inklusive Frontend und Backend. Ein Teil des Teams kümmert sich um die Infrastruktur, die Datenbank und das Highscore-System (REST-API). Die anderen entwickeln die einzelnen Mini-Games.
Die Herausforderung: Jedes Mini-Game muss sich an die zentrale Highscore-API anbinden, um Punkte per POST-Request zu speichern und die globale Top 10 via GET-Request anzuzeigen.
Der Wochenfahrplan
Tag    Phase    Eure Meilensteine
Montag    Wahl, Kick-off & Architektur    Projektwahl am Morgen. Rollenverteilung im Team. Kein Code vor dem Mittag!Entwürfe (Figma/Papier), Definition der API-Schnittstellen und des Datenmodells. Aufsetzen des gemeinsamen Git-Repositories.
Dienstag    MVP & Kernlogik    Grundstruktur steht. Erste Prototypen der Räume bzw. Spiele laufen. Der Datenfluss (Frontend bis Backend/Database) funktioniert in den Grundzügen.
Mittwoch    Integration & APIs    Zusammenführung der Komponenten. Escape-Room-Räume verbinden bzw. Mini-Games an die Highscore-API anbinden. Tauscht euch intensiv im Team aus.
Donnerstag    Refinement & Testing    UI/UX aufhübschen, Animationen, Bugfixing. Testing-Phase: Das andere Projekt-Team versucht, eure Applikation "kaputt zu testen".
Freitag    Release & Demonstration    11:00 Uhr: Code-Freeze! Vorbereitung der Präsentation. Am Nachmittag stellt jedes Team sein Projekt live vor und wir testen die Ergebnisse gemeinsam.
 
Technische Rahmenbedingungen & Regeln
Git-Rules: Da ihr in grossen Teams arbeitet, sind Feature-Branches und Pull Requests Pflicht. Direct Pushes auf den main-Branch sind verboten!
Schnittstellen-Vertrag: Änderungen an Schnittstellen oder Datenstrukturen müssen zwingend vorab mit dem gesamten Team abgesprochen werden.
Clean Code: Achtet auf saubere Ordnerstrukturen, verständliche Variablebenennungen und modularen Code.
Tipp für die Woche: Bei einer Teamgrösse von bis zu 6 Personen pro Projekt steht und fällt der Erfolg mit eurer Organisation und Kommunikation. Sprecht euch regelmässig ab (z.B. kurze Daily Stand-ups).
```

---

## 4. Repository layout

An npm-workspaces monorepo. Frontend, backend and the shared contract live in one repo so the
interface cannot drift between them.

```
Escape_Room/
├── CLAUDE.md                   ← you are here
├── docs/
│   ├── adr/                    ← Architecture Decision Records (approval required)
│   └── api-contract.md         ← the HTTP contract, in prose
├── packages/
│   └── shared/                 ← @escape-room/shared — types, schemas, unlock rule
└── apps/
    ├── frontend/               ← React 19 + Vite + TypeScript + Tailwind v4
    └── backend/                ← Node 22 + Express 5 + TypeScript + Zod
```

Where things belong:

| You are working on | Backend file | Frontend location |
| --- | --- | --- |
| A room's puzzle & solution | `apps/backend/src/domain/rooms/room-0N.ts` | — |
| A room's look & interaction | — | `apps/frontend/src/rooms/room-0N/` |
| Shared types / API shapes | `packages/shared/src/` | same file — one source |
| Session handling | `apps/backend/src/services/session.service.ts` | `apps/frontend/src/game/` |

---

## 5. Architecture

Three ideas carry the whole project. All three exist because of a specific line in the assignment.

**One contract, one file tree.** `packages/shared` is the *Schnittstellen-Vertrag*. It exports the
session type, the room ids, every request and response shape as Zod schemas with inferred TypeScript
types, and the single unlock predicate `isRoomUnlocked(session, roomId)`. Backend and frontend both
import it, so a breaking change to the contract breaks the build immediately instead of silently at
runtime. Changing anything in `packages/shared` requires an ADR — see the interface rule above.

**The server is the authority.** Puzzle solutions live only in `apps/backend/src/domain/rooms/` and
are never sent to the browser. `GET /api/rooms/:roomId` answers `403` unless the session has already
solved every preceding room. `POST /api/rooms/:roomId/attempt` does the actual checking server-side.
The frontend route guard exists for user experience only — it is not a security boundary. This is what
has to survive Thursday, when the other team tries to break the app.

**Rooms are plugins.** A room registers itself on both sides, so sub-teams work in parallel without
stepping on each other. Adding or removing a room is a one-line change in each registry.

```ts
// apps/backend/src/domain/rooms/room-0N.ts
interface RoomDefinition {
  id: RoomId
  order: number
  title: string
  getPublicPayload(session): RoomPublicData  // must never contain the solution
  check(answer, session): AttemptResult      // the only place the solution is known
  hints: string[]
}
```

### API surface

Full detail in [`docs/api-contract.md`](docs/api-contract.md).

| Method | Path | Body / header | Returns |
| --- | --- | --- | --- |
| `GET` | `/api/health` | — | service status |
| `POST` | `/api/sessions` | `{ playerName }` | `{ session }` |
| `GET` | `/api/sessions/:id` | — | `{ session }` |
| `GET` | `/api/rooms` | — | `{ rooms }` — metadata only |
| `GET` | `/api/rooms/:roomId` | `X-Session-Id` | `{ room }` or `403` if locked |
| `POST` | `/api/rooms/:roomId/attempt` | `X-Session-Id`, `{ answer }` | `{ correct, session, feedback? }` |
| `POST` | `/api/rooms/:roomId/hint` | `X-Session-Id` | `{ hint, hintsUsed }` |

The session id is a `crypto.randomUUID()`, kept in `localStorage` and sent as the `X-Session-Id`
header. The frontend never hardcodes a backend URL: Vite proxies `/api` in development and nginx
proxies it in production, so both environments are same-origin.

---

## 6. Commands

```bash
npm install            # install all workspaces

npm run dev            # shared (watch) + backend :3000 + frontend :5173
npm run build          # build shared → backend → frontend
npm run typecheck      # strict TypeScript across all workspaces
npm run lint           # ESLint across all workspaces
npm run test           # Vitest across all workspaces

docker compose up --build     # full stack, frontend on http://localhost:8080
```

---

## 7. Git workflow

Branch names: `feat/room-02-puzzle`, `fix/session-expiry`, `docs/adr-0011-persistence`, `chore/...`.
Commit messages follow Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`, `test:`, `refactor:`).

Every pull request must name the ADR it implements. `docs/adr/**` is protected by `CODEOWNERS`, so
GitHub itself requires Nepomuk's review on any ADR change — the approval rule is enforced by the
platform, not just by convention.

---

## 8. Decision log

Newest first. Every entry links to its ADR. An entry may only move to *Accepted* once Nepomuk has
approved the corresponding ADR.

| Date | ADR | Decision | Status |
| --- | --- | --- | --- |
| 2026-08-03 | [0011](docs/adr/0011-decision-authority.md) | The user decides, the agent does not | Accepted |
| 2026-08-03 | [0010](docs/adr/0010-git-workflow.md) | Feature branches, PRs, Conventional Commits, ADR per change | Accepted |
| 2026-08-03 | [0009](docs/adr/0009-containerization.md) | Multi-stage Docker images + docker compose | Accepted |
| 2026-08-03 | [0008](docs/adr/0008-session-persistence.md) | Session persistence — **open**, in-memory for now | Accepted |
| 2026-08-03 | [0007](docs/adr/0007-room-registry-and-ownership.md) | Room plugin registry + one owner per room | Accepted |
| 2026-08-03 | [0006](docs/adr/0006-server-authoritative-puzzles.md) | Puzzle validation happens server-side only | Accepted |
| 2026-08-03 | [0005](docs/adr/0005-shared-contract-package.md) | `@escape-room/shared` is the interface contract | Accepted |
| 2026-08-03 | [0004](docs/adr/0004-backend-stack.md) | Backend: Node 22 + Express 5 + TypeScript + Zod | Accepted |
| 2026-08-03 | [0003](docs/adr/0003-frontend-stack.md) | Frontend: React 19 + Vite + TypeScript + Tailwind v4 | Accepted |
| 2026-08-03 | [0002](docs/adr/0002-monorepo-npm-workspaces.md) | npm workspaces monorepo | Accepted |
| 2026-08-03 | [0001](docs/adr/0001-project-choice.md) | We build Projekt A, the digital escape room | Accepted |

All eleven were approved by Nepomuk Crhonek on 2026-08-03.

### Where the code stands

- **`packages/shared`** — complete. The contract, the room ids, and `isRoomUnlocked()`.
- **`apps/backend`** — complete for the scaffold. All seven endpoints, the 403 room gate, four
  **placeholder** puzzles, rate limiting, and 54 tests. The placeholder puzzles exist to prove the
  architecture and to serve as templates; the room sub-teams replace them.
- **`apps/frontend`** — deliberately a single page. It proves React, Tailwind, the shared package and
  the `/api` proxy all work, and nothing else. The game UI is the team's work, starting Tuesday.
- **Infrastructure** — Docker, compose, CI, CODEOWNERS and the PR template are in place.

### Open questions

- **Persistence** — sessions currently live in memory and are lost on restart. The decision is
  deliberately deferred; see [ADR-0008](docs/adr/0008-session-persistence.md). Revisit on Tuesday,
  when the assignment's *Datenfluss bis Database* milestone comes due.
- **Room count** — the registry supports four rooms and the assignment allows 2–4. The final count
  follows from how many rooms actually get finished; removing one is a one-line registry change.
