# Escape Room — Project Guide

Monday 2026-08-03 → Friday 2026-08-07. We are building **Projekt A: Der digitale
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
8. **Everything new is fully responsive.** Every screen, panel and room works from a 320px phone up,
   and "works" means usable rather than merely not broken: nothing overflows sideways, nothing is
   clipped, controls are big enough to hit with a thumb, and text stays readable without zooming.
   This is a condition of the work being finished, not a pass somebody makes afterwards — a room
   that only works on a laptop is not done. Details and the specific traps are in
   [ADR-0035](docs/adr/0035-responsive.md).

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
│   ├── building-a-room.md      ← how to build a room, end to end — start here
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
| Colours, type, panels, buttons | — | `apps/frontend/src/index.css` — the design system |
| Shared UI primitives (tabs, …) | — | `apps/frontend/src/ui/` |
| Character parts & the picker | `scripts/characters/` — generation | `apps/frontend/src/character/` |
| Scenery, props, backdrops | `scripts/scenery/` — generation | `apps/frontend/src/stage/scenes.ts` |
| A room's puzzle UI | — | `apps/frontend/src/rooms/room-0N.tsx` |
| The lobby | — | `apps/frontend/src/lobby/` |
| Sound effects | — | `apps/frontend/src/audio/sfx.ts` |
| Invitation email | `apps/backend/src/mail/` | — |
| Shared types / API shapes | `packages/shared/src/` | same file — one source |
| Friends, invites, avatars | `apps/backend/src/{routes,services}/` | `apps/frontend/src/social/` |
| Notifications / polling | `apps/backend/src/routes/sync.routes.ts` | `apps/frontend/src/sync/` |
| Chat | `apps/backend/src/services/chat.service.ts` | `apps/frontend/src/social/ChatWindow.tsx` |
| Co-op parties | `apps/backend/src/services/party.service.ts` | `apps/frontend/src/social/PartyPanel.tsx` |
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

**Two endpoints are open; everything else requires a signed-in user.** Authentication is a Clerk
session token in `Authorization: Bearer …`. The open pair are `/api/health` and the invite preview —
the latter deliberately, because a link that demands an account before it shows you anything is a
registration wall rather than a link ([ADR-0024](docs/adr/0024-friend-graph-and-invite-links.md)).

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
| `POST` | `/api/rooms/:roomId/reset` | — | `{ session }` — wipes only this room's progress ([ADR-0066](docs/adr/0066-room-03-hearts-system.md)) |
| `POST` | `/api/rooms/:roomId/complete` | — | `{ session }` — marks the room solved with no answer, if `canComplete()` allows it ([ADR-0070](docs/adr/0070-olympus-carpet-race.md)) |

The social layer, added by ADRs 0023–0029:

| Method | Path | Body | Returns |
| --- | --- | --- | --- |
| `GET` | `/api/profiles/me` | — | `{ profile }` — your own public profile |
| `GET` | `/api/profiles/by-username/:username` | — | `{ profile }` — public fields only |
| `GET` | `/api/friends` | — | `{ friends, incoming, outgoing }` |
| `POST` | `/api/friends/by-username` | `{ username }` | the updated lists |
| `POST` | `/api/friends/:userId/accept` | — | the updated lists |
| `DELETE` | `/api/friends/:userId` | — | reject and unfriend are one operation |
| `POST` | `/api/friends/:userId/block` · `/unblock` | — | the updated lists |
| `GET` | `/api/invites/:token` | — | `{ inviter }` — **open, no account needed** |
| `POST` | `/api/invites` | `{ forParty? }` | `{ invite }` — mints a link; `forParty` also joins the party |
| `GET` | `/api/invites` | — | `{ invites }` — your own, to share or revoke |
| `DELETE` | `/api/invites/:token` | — | `204` — revoke |
| `POST` | `/api/invites/:token/accept` | — | friends immediately; the link was the consent |
| `GET` | `/api/sync?since=` | — | `{ now, notifications, unreadCount }` |
| `POST` | `/api/sync/read` | — | `204` — marks everything seen |
| `GET` | `/api/chat/:userId/messages?since=` | — | `{ messages }` |
| `POST` | `/api/chat/:userId/messages` | `{ body }` | `{ message }` |
| `GET` | `/api/leaderboard/friends` | — | `{ entries }` — you and your friends |
| `GET` | `/api/leaderboard/global` | — | `{ entries }` — everybody who has started |
| `GET` | `/api/party` | — | `{ party }` — host, members, `isHost` |
| `POST` | `/api/stage/heartbeat` | position, emote, ready, hidden, acted, holding | `{ peers, phase, isHost, room }` — 2 Hz |
| `POST` | `/api/stage/alive` | `{ hidden }` | `204` — "I still have the game open", 5 s, every screen |
| `POST` | `/api/stage/phase` | `{ kind, roomId? }` | `204` — host only; moves the whole party |
| `DELETE` | `/api/stage` | — | `204` — off the stage, still in the party |
| `POST` | `/api/party/invite/:userId` | — | `204` — notifies, moves nobody |
| `POST` | `/api/party/join/:userId` | — | `{ party }` |
| `DELETE` | `/api/party` | — | back to your own game |
| `DELETE` | `/api/party/members/:userId` | — | the host sending somebody home |

**No conversation id and no game id appear in any URL.** Chat is addressed by person and the server
derives the conversation from the two ids ([ADR-0026](docs/adr/0026-chat.md)); a game is found from
the party ([ADR-0028](docs/adr/0028-co-op-play.md)). There is nothing to forge in either case.

**Rate limits key on the account** where a request carries one, and on the IP only where it does not
— a whole class shares one address
([ADR-0029](docs/adr/0029-rate-limits-per-account-and-invite-acceptance.md)).

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
                       # no Clerk keys needed — `npm run dev` signs you in locally

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
| 2026-08-06 | [0049](docs/adr/0049-press-e-and-five-acts.md) | Walk up to a thing and press E; the sea slows to two and a half minutes; five acts and a full-screen vault | Accepted |
| 2026-08-06 | [0048](docs/adr/0048-the-hall-floods.md) | Room 01 is a place you play by walking, it is filling up, and it changes shape when a friend is in it | Accepted |
| 2026-08-05 | [0070](docs/adr/0070-olympus-carpet-race.md) | Olympus becomes a carpet-racing coin challenge, not a riddle sequence; new `POST /api/rooms/:roomId/complete` | Proposed |
| 2026-08-05 | [0069](docs/adr/0069-room-owns-its-own-finale.md) | A room decides when it's done showing its own finale, via a new `onRoomFinished` callback | Proposed |
| 2026-08-05 | [0068](docs/adr/0068-room-completion-vs-attempt-correctness.md) | A correct attempt and a finished room are different things — fixes players being bounced out of room-03 mid-run | Proposed |
| 2026-08-05 | [0067](docs/adr/0067-olympus-second-act.md) | A third beat after Atlantis: Mount Olympus, a second server-checked riddle act | Proposed, superseded by 0070 |
| 2026-08-05 | [0066](docs/adr/0066-room-03-hearts-system.md) | A shared 3-hearts system across the Sphinx and Atlantis, plus a room-scoped reset endpoint | Proposed |
| 2026-08-04 | [0065](docs/adr/0065-room-03-sphinx-riddles.md) | Room 3 is a five-riddle sequence staged from the event log; frontend gets its room shell | Proposed |
| 2026-08-06 | [0047](docs/adr/0047-art-arrives-before-the-animation.md) | Fetch a screen's art before it arrives; hold any piece that still has none | Accepted |
| 2026-08-06 | [0046](docs/adr/0046-email-an-absent-friend.md) | Invite a friend who is not on the app and they get an email, with your character in it | Accepted |
| 2026-08-06 | [0045](docs/adr/0045-membership-is-liveness.md) | Being in a game is a claim you keep alive; close the tab and you leave both | Accepted |
| 2026-08-05 | [0044](docs/adr/0044-unbuild-into-dots.md) | Screens unbuild into their own halftone dots and rebuild out of them | Accepted |
| 2026-08-05 | [0043](docs/adr/0043-hints-are-per-room.md) | Hints are counted per room, derived from the activity log | Accepted |
| 2026-08-05 | [0042](docs/adr/0042-party-invites.md) | Invite a friend into your game, or a link that befriends and joins in one step | Accepted |
| 2026-08-05 | [0041](docs/adr/0041-stable-callbacks-in-effects.md) | An effect may not depend on a callback prop — wrap it in `useEvent()` | Accepted |
| 2026-08-05 | [0040](docs/adr/0040-path-routing.md) | Real paths, no hash; reload recovers the room, the tab and the outfit | Accepted |
| 2026-08-05 | [0039](docs/adr/0039-empty-key-cursor.md) | Null is the empty cursor; in-memory stand-ins must be as strict as DynamoDB | Accepted |
| 2026-08-05 | [0038](docs/adr/0038-presence-and-the-iris-wipe.md) | Presence in memory, polled and interpolated; the transition is an iris wipe — *the transition half is superseded by [0044](docs/adr/0044-unbuild-into-dots.md)* | Accepted |
| 2026-08-05 | [0037](docs/adr/0037-lobby-stage-and-rooms.md) | Start → lobby → room; one walkable stage, generated scenery, synthesised sound | Accepted |
| 2026-08-05 | [0036](docs/adr/0036-global-board-is-a-top-ten.md) | The global board is a top ten plus your own row; games read in one batch | Accepted |
| 2026-08-05 | [0035](docs/adr/0035-responsive.md) | Everything responsive from 320px up; never `overflow-x: hidden` on the root | Accepted |
| 2026-08-05 | [0034](docs/adr/0034-global-leaderboard.md) | A global leaderboard beside the friends one; Friends stays the default | Accepted |
| 2026-08-05 | [0033](docs/adr/0033-modular-characters.md) | Build-your-own character at sign-up; generated parts printed in the two inks | Accepted |
| 2026-08-05 | [0032](docs/adr/0032-overprint-design-system.md) | Overprint: a design system of two spot inks on paper; glass panels are a third ink | Accepted |
| 2026-08-04 | [0031](docs/adr/0031-drop-project-week-branding.md) | Drop the project-week branding; the assignment quotation stays verbatim | Accepted |
| 2026-08-04 | [0030](docs/adr/0030-tests-own-one-server-per-app.md) | Tests start one HTTP server per app instead of one per request | Accepted |
| 2026-08-04 | [0029](docs/adr/0029-rate-limits-per-account-and-invite-acceptance.md) | Rate limits key on the account; following an invite link makes you friends | Accepted |
| 2026-08-04 | [0028](docs/adr/0028-co-op-play.md) | Co-op play: a player points at a host, and every write is versioned | Accepted |
| 2026-08-04 | [0027](docs/adr/0027-friends-leaderboard.md) | A leaderboard scoped to friends, derived from the game | Accepted |
| 2026-08-04 | [0026](docs/adr/0026-chat.md) | One-to-one chat; the conversation id is derived server-side | Accepted |
| 2026-08-04 | [0025](docs/adr/0025-notifications-by-polling.md) | Notifications delivered by one polled `/api/sync`, not WebSockets | Accepted |
| 2026-08-04 | [0024](docs/adr/0024-friend-graph-and-invite-links.md) | Friend graph stored both ways; revocable invite links | Accepted |
| 2026-08-04 | [0023](docs/adr/0023-public-profiles.md) | Cache a public profile per player | Accepted |
| 2026-08-03 | [0022](docs/adr/0022-local-development-auth.md) | Local development runs without Clerk | Accepted |
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

All of the above were approved by Nepomuk Crhonek — 0001–0011 on 2026-08-03, the rest as they were written —
except 0065–0070 (room-03's Sphinx build), which are `Proposed` and still await his review.

### Where the code stands

- **`packages/shared`** — complete. The contract, the room ids, and `isRoomUnlocked()`.
- **Hints are per room** ([ADR-0043](docs/adr/0043-hints-are-per-room.md)) — a room's hints are
  indexed by hints taken *in that room*, counted from the activity log, which has recorded
  `hint_taken` with a `roomId` since ADR-0020. `session.hintsUsed` stays a whole-game total because
  that is what the leaderboard ranks on. `hintsAvailable` on the wire means *how many you can still
  take here*, not how many the room has.
- **`apps/backend`** — complete for the scaffold. All seven endpoints, the 403 room gate, four
  **placeholder** puzzles, rate limiting, and 54 tests. The placeholder puzzles exist to prove the
  architecture and to serve as templates; the room sub-teams replace them.
  **[`docs/building-a-room.md`](docs/building-a-room.md) is the guide** — the two files and two
  registry lines a room actually is, the rules the test suite already enforces for you, how to
  generate scenery with the image model, and why the result does not look AI-generated.
- **`apps/frontend`** — a sign-in gate and one page behind it. It proves the whole chain works: Clerk
  issues a token, the browser sends it, the API verifies it and finds that account's game. The rooms
  themselves are the team's work.
- **Design** — *Overprint* ([ADR-0032](docs/adr/0032-overprint-design-system.md)): two spot inks on
  paper stock, and glass panels are a third ink rather than a floating card — a `.pane` is a paper
  fill with a light ink tint multiplied over it. Syne and Martian Mono are self-hosted in
  `src/assets/fonts/`. Build rooms with the component classes (`.pane`, `.btn`, `.field`, `.label`,
  `.veil`, `.prose`) and the `stock` / `signal` / `solved` tokens; do not hardcode a colour. **A
  locked room is frosted** — that is `.veil`, and it is cosmetic only, since the server never sends a
  locked room's contents at all. Three rules break the design silently if ignored: never put
  `overflow: hidden` above a `.pane`, never give a `.pane` its own stacking context, and never blend a
  panel *fill* with `multiply` — multiply cannot lighten, so the panel stops being a readable surface
  and the text ends up sitting on the background.
- **Characters** — every player builds one at sign-up: head, body, arms and legs, twenty of each
  ([ADR-0033](docs/adr/0033-modular-characters.md)). The parts are generated with `gpt-image-1` and
  then *printed* — posterised to the four Overprint inks with a halftone screen, which is what stops
  eighty separately generated images looking generated. `scripts/characters/generate_all.py` is
  resumable; run it again for anything that failed. The composed still is a **head-and-shoulders
  portrait** uploaded to Clerk, so every avatar surface in the app shows it **without any change to
  `packages/shared` or the backend**. Two rules the catalogue depends on: the far limb is the near
  limb mirrored, so **no part may have a handedness** (a V sign becomes a rude gesture reversed), and
  the head hangs from `chin` rather than `neck` so it overlaps the torso instead of resting on it.
  "Change character" in the game header reopens the picker.
- **Every screen is a real path** ([ADR-0040](docs/adr/0040-path-routing.md)) — `/`, `/friends`,
  `/leaderboard`, `/activity`, `/character`, `/lobby`, `/room/:roomId`, `/invite/:token`. **No hash
  anywhere.** Reloading returns you to where you were, and the character picker keeps the outfit in
  the query string (`?head=…&body=…`), validated against the catalogue rather than trusted.
  - The gates are one layout route, `RequiresGame` — loading, signed out, no profile, no character.
    Everything below can assume a signed-in player with a game.
  - **The host's location is the party's location; a guest follows it.** That is what makes the back
    button out of a room work instead of the server pulling you straight back in.
  - `isInviteToken()` in `src/routing.ts` still guards the invite path: the router hands over whatever
    was in the segment and it goes into a request URL.
  - No infrastructure was needed — CloudFront, nginx and Vite already rewrote unknown paths to
    `index.html`, and the smoke test now checks seven routes rather than one.
- **Accounts** — players register with Clerk before they can reach anything. Progress and an activity
  log live in DynamoDB, keyed on the Clerk user id, so a game survives logout and deploys.
- **An invitation reaches somebody who is not here** ([ADR-0046](docs/adr/0046-email-an-absent-friend.md)).
  Invite a friend with the app closed and they get an **email** instead of a bell nobody will read.
  Three questions decide it, and any one of them false means the bell alone: are they live
  (ADR-0045), do they already have an unread invitation from you (`hasUnreadFrom` — the throttle
  chat already built, so no new state), and do they have a **verified** address. The link is the
  party link from ADR-0042, unchanged. **Almost nothing here is new** — the only new parts are a
  sender and a template.
  - **No secret anywhere.** SES is reached with the instance role, so there is no API key to create,
    store or rotate. `MAIL_FROM` empty turns email off entirely, which is what local development,
    the tests and `docker compose up` run with.
  - **SES starts in a sandbox** — it delivers only to *verified* addresses until AWS grants
    production access, which is a support request. Verifying the team covers a demo completely.
  - The email carries **your character**, composited on the server with `pngjs` from a PNG part set
    that ships with the API. Not `sharp`: the image is alpine, and sharp on musl is a fight for
    alpha-over blending of four flat pictures. The character and the starburst are baked into **one**
    image, because overlapping two with a negative margin works in a browser and nowhere else.
  - The **avatar is soft and it is not Clerk's fault**: the portrait is a 260-unit window blown up to
    512, so it is upscaled ~2× at source. Drawing the whole figure sidesteps the crop, and at email
    size the shipped parts are indistinguishable from the 1024px originals — so no re-export.
  - An email must never break an invitation: the bell is written first, and everything after it is
    best-effort.
- **Invites** ([ADR-0042](docs/adr/0042-party-invites.md)) — from the lobby, the host can invite a
  friend (they get a notification with a **Join their game** button) or mint a **party link**.
  Following a party link makes you friends *and* puts you in the game in one step. The join is
  best-effort and the friendship is not: if the party filled up or the host left, the friendship
  still stands and you land in your own lobby. The preview says how many are in the party, never who.
- **Friends** — add somebody by username, or send a revocable invite link that shows who is inviting
  before the recipient has an account. Accept, reject, unfriend and block all work
  ([ADR-0024](docs/adr/0024-friend-graph-and-invite-links.md)). Following a link makes the two of you
  friends straight away — the link was the consent
  ([ADR-0029](docs/adr/0029-rate-limits-per-account-and-invite-acceptance.md)).
- **Notifications** — a bell with an unread badge, fed by a single polled `/api/sync`. The cursor is
  `null` for "from the beginning", **never an empty string** — DynamoDB rejects an empty string as a
  key value, so `sk > ''` is a 500 rather than an unbounded query. The in-memory repositories now
  refuse it too: a stand-in that is *more permissive* than the real database does not simulate it, it
  hides it, and that is how this shipped ([ADR-0039](docs/adr/0039-empty-key-cursor.md)). App Runner
  supports neither WebSockets nor long-lived streams, so polling is the only option; it stops
  entirely while the tab is hidden ([ADR-0025](docs/adr/0025-notifications-by-polling.md)). Chat and
  co-op will add fields to the same response rather than endpoints of their own.
- **Chat** — one-to-one messages between friends. The conversation id is derived from the two user
  ids server-side and never accepted from a client, so no request can name a conversation the caller
  is not part of; friendship is re-checked on every read and write, so blocking closes an open
  window ([ADR-0026](docs/adr/0026-chat.md)).
- **Leaderboard** — ranked by rooms solved, then finishing time, then hints, and derived from what
  the game already records rather than a separate score table
  ([ADR-0027](docs/adr/0027-friends-leaderboard.md)). Two scopes: **Friends**, which is the default,
  and **Everyone** ([ADR-0034](docs/adr/0034-global-leaderboard.md)). The global board shows only
  players who have actually started, and is the one **table scan** in the app — capped at 200, and
  the reason the instance role needs `dynamodb:Scan`. It returns a **top ten plus your own row** if
  you are outside it, so nobody is missing from their own board
  ([ADR-0036](docs/adr/0036-global-board-is-a-top-ten.md)). Position comes from `rank` on the wire,
  never from the array index — the eleventh row may be the player in twenty-third place.
- **Co-op play** — invite a friend into your game, or join theirs. Both see the same progress and
  either can solve; the log says who did what. A player points at the *host's* user id rather than a
  synthetic game id, so the games table never had to be re-keyed and no progress was thrown away,
  and every write is conditional on a version so two simultaneous solves cannot lose an update
  ([ADR-0028](docs/adr/0028-co-op-play.md)).
- **The game** — **Start** on the Rooms tab runs an ink-flood transition into the **lobby**: a
  printed 1950s room your character stands in the middle of and walks around, with an emote bar, a
  room picker and PLAY ([ADR-0037](docs/adr/0037-lobby-stage-and-rooms.md)). PLAY counts down and
  drops you into the room. **Rooms 01 and 03 are full builds**; rooms 02 and 04 are stubs wired to
  the real `attempt` and `hint` endpoints — a sub-team writes the puzzle in `rooms/room-0N.tsx` and
  touches nothing else (ADR-0007).
- **Room 03 is "The Sphinx's Reckoning"** (ADR-0065–0070, `Proposed`, pending Nepomuk's review): five
  ancient riddles in a walkable corridor, an Atlantis artifact-recovery quest, and a top-down Olympus
  carpet race. It needs a richer, room-owned `RoomProps` contract than the others (hints inline in its
  own dialogue, a hearts system, a room-scoped reset, and a `complete` step for stages with no
  server-checked answer), so it renders full-screen rather than through the shared `Stage`/`RoomView`
  shell — see its own component for how that seam works.
- **Room 01 — the Reading Hall — is a place, not a question**
  ([ADR-0048](docs/adr/0048-the-hall-floods.md)). It is under the harbour and filling up, and
  **everything in it is done by walking somewhere and stopping**: the lamps, the tablets, the two
  sluice wheels. The only thing anybody types is the six figures at the vault. That is why the co-op
  cost nothing — positions have been on the heartbeat twice a second since ADR-0038, so a second
  player is another set of coordinates in the same list.
  - **Walk up to a thing and press E** ([ADR-0049](docs/adr/0049-press-e-and-five-acts.md)). A prompt
    says what E will do before it does it — the earlier version had standing on a station *be* the
    action, which was elegant and completely mute. The prompt is **chrome, not world**: everything
    inside the stage is scaled to about 0.2 on a phone, so a tag over the lamp would be four-pixel
    type. It is also a **button**, because there is no E key on a phone.
  - Two fields carry it: **`acted`** (an event, consumed by the beat carrying it) and **`holding`**
    (state, re-sent every beat). Both verified against the position **in the mechanism**, not just in
    the service — a test caught that with the check only in `HallService`, a hand-made occupant
    claiming a wheel across the hall pumped it happily. Both **defaulted, not required**: this beat
    goes out twice a second from every open tab, so required fields would 400 every player who had
    not reloaded after a deploy.
  - **The water is the clock, the enemy and the gate**, so there is no countdown anywhere in the
    room. **Two and a half minutes** of doing nothing, up from forty-six seconds. One wheel creeps
    the level back, both push it back properly, and a wheel keeps turning 5 s after you let go —
    which is the whole solo game against a 3.3 s crossing.
  - **The hall counts you: I or II.** What one person works alone, two have to work together — the
    lamps stop taking a flame singly, the floor opens down the middle and takes what you carry into
    it, and the plaque saying which way to turn your wheel is at the *other* player's end. The count
    is locked while an act runs and re-forms if a partner leaves.
  - **Five acts, and four different shapes of co-operation.** The lamps want two people at once
    (within two seconds — a keypress cannot be simultaneous the way standing somewhere can); the
    index wants a hand-off across a flooded channel; the great wheel puts the plaque telling you
    which way to turn at your *partner's* end; and the sluice gate only winds while **both** winches
    are held. Shutting it halves the rise for the rest of the run, which is the only act that pays in
    mechanics rather than figures — and the only one that is a decision rather than a puzzle.
  - **The vault is full screen**: six odometer drums on the `.countdown` overlay. A real `<input>`
    sits behind them, invisible and focused, which gives typing and a mobile numeric keypad for free
    — and suspends walking, because `useMovement` already ignores keys while a field has focus.
  - **Nothing is sent before it is earned.** `publicData()` is a floor plan; the code arrives a
    fragment at a time as acts finish, so the network tab tells you what playing tells you and no
    sooner. Stronger than merely omitting the answer — there is nothing to work backwards from.
  - **Drowning is the whole party**, sticky on the wire so everyone sees the splash, then back to the
    lobby with the hall thrown away. A room you can leave halfway through and return to is a room
    whose clock means nothing.
  - The halls are one in-memory map keyed by host, **ticked from whichever heartbeat arrives** — no
    timer, so a hall nobody is in is not rising.
  - **Depth is `z-index`, never DOM order.** Sorting the stage's children by
    position made React reorder keyed nodes as people walked, and **moving a DOM node restarts its
    CSS animations** — the drop-in replayed dozens of times a minute. A test pins the DOM order as
    stable.
  - **An effect may not depend on a callback prop** — wrap it in `useEvent()` first
    ([ADR-0041](docs/adr/0041-stable-callbacks-in-effects.md)). An inline `onDone={() => …}` is a new
    function every render, so the effect is rebuilt every render: the countdown never counted and the
    iris wipe played six times. `react-hooks/exhaustive-deps` does **not** catch this — it checks
    that deps are complete, not that they are stable.
  - **The stage** (`src/stage/`) is one component used by the lobby *and* every room. It is a fixed
    1600×900 space scaled once; everything is placed **by its feet** and sorted by `y`, which is what
    lets you walk behind the sofa. Flat things (a rug) need a `depth` override or they draw over
    people's feet.
  - **Scenery** is 35 generated pieces put through the *character* pipeline unchanged, which is why
    a potted palm and a player's head match. `scripts/scenery/generate_all.py` is resumable.
  - **Sound** is synthesised in `audio/sfx.ts` — no files, nothing to license. The `AudioContext` is
    built on the Start click and nowhere else, because that is the first gesture in the flow and a
    context made any earlier is refused by Safari.
  - **Motion is cartoon**: squash, stretch, overshoot. **Nothing fades in** — a linear fade is the
    tell that reads as machine-made.
  - **Multiplayer** ([ADR-0038](docs/adr/0038-presence-and-the-iris-wipe.md)) — friends stand in
    the same lobby and the same room, walk about and emote at each other. Presence is polled at
    500 ms and **interpolated**, which is the one technique that turns a twice-a-second update into
    somebody walking. The host holds PLAY; guests follow on their next beat.
  - **Presence is in memory, and that pins the API to one instance.** `min_size = max_size = 1` in
    the Terraform is load-bearing now: raise it and friends will vanish for each other, because two
    instances would each hold half the room. **A deploy clears every lobby and now also dissolves
    every party** — everyone lands back in their own game ([ADR-0045](docs/adr/0045-membership-is-liveness.md)).
    The party is capped at **four**, and the cap counts people who are actually there.
  - **Close the tab and you leave the lobby *and* the game; reload and nothing happened at all.**
    There is no membership row any more — being in somebody's party is a claim you keep alive by
    beating, held in one self-emptying map beside your position, so both end by the same expiry.
    Fifteen seconds if your tab was visible when it went quiet; five minutes if it said it was
    hidden, because the browser throttles background timers and a throttled tab cannot be told from
    a closed one. **No `pagehide` beacon**: it never fires on a crash or a force-quit, and it fires
    on reload too, which would make everyone watching see you blink out and come back. `useLiveness`
    beats from *every* screen, not just the stage — you can be in a friend's game while reading the
    leaderboard. Walking out of the lobby takes your character off the stage at once and leaves you
    in the party, which is the one departure that is a real click rather than a guess.
  - **A piece does not fly in until it has something to fly in with**
    ([ADR-0047](docs/adr/0047-art-arrives-before-the-animation.md)). A scene is about a megabyte of
    scenery and nothing used to fetch it until the stage painted, so on a cold cache the wave
    animated **empty boxes** and the furniture popped in afterwards. Now the Rooms tab pulls down the
    lobby (Start is the button on it), the lobby pulls down whichever room is selected, and your own
    character comes with it — `decode()`, not just `load`, because otherwise the hitch just moves to
    the frame that draws it. One promise per URL, so flicking along the room row costs one download
    each. And any piece whose art still has not arrived is **held invisible** rather than animated
    empty, released the moment it can be drawn, with a 2.5s ceiling because an image that 404s never
    fires `load`.
  - **Screens unbuild themselves into dots** ([ADR-0044](docs/adr/0044-unbuild-into-dots.md)). The
    whole app is printed as a halftone, so a panel leaving does not slide or fade: an animated dot
    mask at the page's own 6px pitch takes its ink away until only its dots are left, those fade into
    the ground, and the next screen's pieces fly in from their own directions and land. Panels and
    the controls a player aims at — **not** list rows. `/` gathers, everywhere else is thrown. Opt a
    block in with `data-piece`, out with `data-piece="no"`. This replaced an iris wipe, which was
    period-correct and generic to every cartoon ever made.
- **Infrastructure** — Docker, compose, CI, CODEOWNERS and the PR template are in place.

### Open questions

- **Persistence** — sessions currently live in memory and are lost on restart. The decision is
  deliberately deferred; see [ADR-0008](docs/adr/0008-session-persistence.md). Revisit on Tuesday,
  when the assignment's *Datenfluss bis Database* milestone comes due.
- **Room count** — the registry supports four rooms and the assignment allows 2–4. The final count
  follows from how many rooms actually get finished; removing one is a one-line registry change.
