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
4. **A request from Nepomuk is itself the approval.** When Nepomuk asks for something, that request
   approves the ADRs and the work needed to carry it out — Claude does not stop afterwards to ask for a
   separate sign-off, and does not wait before pushing. This is a standing authorisation and it comes
   from him. It does **not** weaken rule 1: deciding *what* to build is still his, and Claude still
   stops and asks when a request leaves a genuine choice open. What this removes is the second
   confirmation round on work he has already asked for. Requests from anyone else still need his
   approval as normal.
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

**Everything except `/api/health` requires a signed-in user.** Authentication is a Clerk session token
in `Authorization: Bearer …`.

| Method | Path | Body | Returns |
| --- | --- | --- | --- |
| `GET` | `/api/health` | — | service status (the only open endpoint) |
| `POST` | `/api/sessions` | — | `{ session }` — starts or resumes, idempotent |
| `GET` | `/api/sessions/me` | — | `{ session }` including the activity log |
| `DELETE` | `/api/sessions/me` | — | `204` — replay from room one |
| `GET` | `/api/rooms` | — | `{ rooms }` — metadata only |
| `GET` | `/api/rooms/:roomId` | — | `{ room }` or `403` if locked |
| `POST` | `/api/rooms/:roomId/attempt` | `{ answer }` | `{ correct, session, feedback? }` |
| `POST` | `/api/rooms/:roomId/hint` | — | `{ hint, hintsUsed }` |
| `POST` | `/api/rooms/:roomId/reset` | — | `{ session }` — wipes only this room's progress ([ADR-0023](docs/adr/0023-room-03-hearts-system.md)) |
| `POST` | `/api/rooms/:roomId/complete` | — | `{ session }` — marks the room solved with no answer, if `canComplete()` allows it ([ADR-0027](docs/adr/0027-olympus-carpet-race.md)) |

**There is no session id anywhere.** A player has exactly one game and the server finds it from the
verified token, so nothing identifying a game travels on the wire to be forged
([ADR-0019](docs/adr/0019-games-belong-to-accounts.md)). The frontend never hardcodes a backend URL:
Vite proxies `/api` in development and nginx in production, so both are same-origin.

Every action is recorded on the account as an activity log — attempts, hints, rooms entered and solved
([ADR-0020](docs/adr/0020-activity-log.md)).

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

npm run smoke -- https://dev.cool.tf   # play the real game against a live environment
```

---

## 7. Git workflow

Work flows one way, and it is enforced, not just agreed:

```
feature branch  →  dev  →  main
                    │        │
              dev.cool.tf   cool.tf
```

- Open pull requests against **`dev`**. Never against `main`.
- **`main` accepts pull requests only from `dev`.** A CI job blocks anything else — see
  [ADR-0016](docs/adr/0016-branch-policy.md).
- Merging `dev` into `main` is the release, and it deploys production.

Branch names: `feat/room-02-puzzle`, `fix/session-expiry`, `docs/adr-0011-persistence`, `chore/...`.
Commit messages follow Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`, `test:`, `refactor:`).

Every pull request must name the ADR it implements. `docs/adr/**` is protected by `CODEOWNERS`, so
GitHub itself requires Nepomuk's review on any ADR change — the approval rule is enforced by the
platform, not just by convention.

---

## 8. Deployment

Live on AWS. Details in [ADR-0012](docs/adr/0012-aws-hosting.md); the runbook is
[`infra/README.md`](infra/README.md).

| Branch | Environment | URL |
| --- | --- | --- |
| `dev` | staging | <https://dev.cool.tf> |
| `main` | production | <https://cool.tf> |

Each environment is one CloudFront distribution with two origins: a private S3 bucket for the built
frontend, and App Runner for the API under `/api/*`. That keeps the browser talking to a single origin,
so the frontend still has no backend URL in it and there is still no CORS anywhere.

Pushing to a deploy branch builds the image, ships it, and then **plays the actual game against the
live site** (`scripts/smoke-test.mjs`). A failed smoke test fails the deploy. GitHub Actions
authenticates with OIDC — there are no AWS credentials stored in GitHub.

Two constraints worth remembering:

- **The API runs as a single instance.** Sessions are in memory ([ADR-0008](docs/adr/0008-session-persistence.md)),
  so it cannot be scaled up without a shared session store first.
- **A deploy restarts the API**, which drops every game in progress. Do not deploy during the demo.

### Ruleset settings (requires repo admin — currently only Eleonora)

The ruleset "Protect main and dev branch" needs these, or the rules above are advisory only:

- **`main`** — require a pull request, 1 approving review, require Code Owner review, block force
  pushes and deletion. Required status checks: `Lint, typecheck, test, build`,
  `Container images build`, `Only dev may open PRs into main`.
- **`dev`** — require a pull request, 0 approvals. Required status checks: `Lint, typecheck, test, build`,
  `Container images build`.

The dev-only-into-main rule cannot be expressed as a ruleset condition, which is why it is a required
status check instead. Renaming that job silently disables the rule.

## 9. Decision log

Newest first. Every entry links to its ADR. An entry may only move to *Accepted* once Nepomuk has
approved the corresponding ADR.

| Date | ADR | Decision | Status |
| --- | --- | --- | --- |
| 2026-08-05 | [0027](docs/adr/0027-olympus-carpet-race.md) | Olympus becomes a carpet-racing coin challenge, not a riddle sequence; new `POST /api/rooms/:roomId/complete` | Proposed |
| 2026-08-05 | [0026](docs/adr/0026-room-owns-its-own-finale.md) | A room decides when it's done showing its own finale, via a new `onRoomFinished` callback | Proposed |
| 2026-08-05 | [0025](docs/adr/0025-room-completion-vs-attempt-correctness.md) | A correct attempt and a finished room are different things — fixes players being bounced out of room-03 mid-run | Proposed |
| 2026-08-05 | [0024](docs/adr/0024-olympus-second-act.md) | A third beat after Atlantis: Mount Olympus, a second server-checked riddle act | Proposed, superseded by 0027 |
| 2026-08-05 | [0023](docs/adr/0023-room-03-hearts-system.md) | A shared 3-hearts system across the Sphinx and Atlantis, plus a room-scoped reset endpoint | Proposed |
| 2026-08-04 | [0022](docs/adr/0022-room-03-sphinx-riddles.md) | Room 3 is a five-riddle sequence staged from the event log; frontend gets its room shell | Proposed |
| 2026-08-03 | [0021](docs/adr/0021-unique-usernames.md) | Every player has a unique username, enforced by Clerk | Accepted |
| 2026-08-03 | [0020](docs/adr/0020-activity-log.md) | Record an activity log against each account | Accepted |
| 2026-08-03 | [0019](docs/adr/0019-games-belong-to-accounts.md) | A game belongs to an account; the session header goes away | Accepted |
| 2026-08-03 | [0018](docs/adr/0018-dynamodb-persistence.md) | Store game progress in DynamoDB | Accepted |
| 2026-08-03 | [0017](docs/adr/0017-authentication-clerk.md) | Authentication with Clerk | Accepted |
| 2026-08-03 | [0016](docs/adr/0016-branch-policy.md) | PRs target `dev`; `main` accepts them only from `dev` | Accepted |
| 2026-08-03 | [0015](docs/adr/0015-github-oidc-deploys.md) | GitHub Actions deploys via OIDC, no stored AWS credentials | Accepted |
| 2026-08-03 | [0014](docs/adr/0014-two-environments.md) | Two environments: `cool.tf` from `main`, `dev.cool.tf` from `dev` | Accepted |
| 2026-08-03 | [0013](docs/adr/0013-terraform.md) | Terraform, state in S3 with DynamoDB locking | Accepted |
| 2026-08-03 | [0012](docs/adr/0012-aws-hosting.md) | Host on AWS: CloudFront + S3 + App Runner per environment | Accepted |
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
- **`apps/frontend`** — a sign-in gate and one page behind it. It proves the whole chain works: Clerk
  issues a token, the browser sends it, the API verifies it and finds that account's game. The rooms
  themselves are the team's work.
- **Accounts** — players register with Clerk before they can reach anything. Progress and an activity
  log live in DynamoDB, keyed on the Clerk user id, so a game survives logout and deploys.
- **Infrastructure** — Docker, compose, CI, CODEOWNERS and the PR template are in place.

### Open questions

- **Persistence** — sessions currently live in memory and are lost on restart. The decision is
  deliberately deferred; see [ADR-0008](docs/adr/0008-session-persistence.md). Revisit on Tuesday,
  when the assignment's *Datenfluss bis Database* milestone comes due.
- **Room count** — the registry supports four rooms and the assignment allows 2–4. The final count
  follows from how many rooms actually get finished; removing one is a one-line registry change.
