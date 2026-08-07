# ADR-0022: Room 2 — "Genesis Protocol", a self-contained frontend puzzle

- **Status:** Proposed
- **Date:** 2026-08-05
- **Deciders:** Eleonora Vynogradova
- **Approved-by:** _(only Nepomuk Crhonek fills this in, together with a date)_
- **Supersedes / Superseded by:** _(none)_

## Context

Room 2 was assigned a Jurassic-Park-style story ("Kepler Biogenetics, Site 9") per the room plugin
architecture in [ADR-0007](0007-room-registry-and-ownership.md): one backend file
(`apps/backend/src/domain/rooms/room-02.ts`) and one frontend folder
(`apps/frontend/src/rooms/room-02/`).

Unlike the placeholder rooms, Room 2's puzzle is a multi-scene investigation — locations, terminals,
a DNA analysis station, a power router, a code lock, an evacuation timer, ambient audio and a
multi-stage ending sequence (`Room02.tsx`, `state.ts`, `story.ts`, `locations.ts`, `puzzles.ts`,
`audio.ts`, plus supporting modals). None of that intermediate puzzle state needs to be known to the
server: only the final answer — the exit override the player submits to leave the room — has to be
checked authoritatively, per [ADR-0006](0006-server-authoritative-puzzles.md).

This forced a decision the registry contract left open: where does the line between
"server-authoritative" and "frontend-owned" fall when a room's puzzle has many internal steps but only
one graded submission?

## Decision

Room 2's entire in-room experience (locations, story text, sub-puzzles like the DNA station and power
router, the evacuation timer, audio, all UI state) lives client-side in
`apps/frontend/src/rooms/room-02/`, driving its own local state (`state.ts`) rather than exchanging
intermediate progress with the backend.

The backend's `room02` definition (`apps/backend/src/domain/rooms/room-02.ts`) stays deliberately thin:

- `publicData()` returns `{}` — there is nothing dynamic to hand over; the room's content is static and
  ships with the frontend bundle.
- `check(answer)` validates only the exit override string (`'SEVERE'`, the DNA station's aggression
  classification the player has to have read in-story to find), via `asText()` and the shared
  `RoomDefinition` contract from ADR-0007.
- `hints` are three static strings served through the existing `/api/rooms/:roomId/hint` endpoint.

The frontend registers the room in `rooms/registry.ts`, added as part of this change, as a lazily
loaded component keyed by room id — the one line ADR-0007 calls for.

Room assets (audio, images) live under `apps/frontend/public/audio/room-02/` and
`apps/frontend/public/images/room-02/`, served as static files, not through the API.

## Consequences

- The backend for Room 2 stays a few lines and is trivial to review; almost all of the ~3,000 added
  lines are frontend-only and touch no shared contract.
- Because the puzzle logic (which locations unlock what, what the DNA station reveals) lives in the
  frontend bundle, a technically motivated player can read the story and the answer out of the shipped
  JavaScript. This is an explicit trade-off, not an oversight: the *graded* action — submitting the
  final override to clear the room — is still checked server-side and cannot be forged, which is the
  boundary ADR-0006 actually requires. The in-room narrative puzzle is treated as a UX/story
  experience, not a security boundary.
- Adding real hidden server-side sub-puzzles to Room 2 later (if that trade-off turns out to be wrong)
  means giving `publicData()` real per-session content and teaching `check()` about intermediate state —
  that is a bigger change than today's and would need its own ADR if it touches the shared contract.
- The room owns its own audio/image assets under `public/`, so it does not need any new backend
  endpoint for static content, keeping Room 2 fully isolated from every other room's files.

## Alternatives considered

**Model every sub-puzzle (DNA station, power router, code lock) as its own server-checked attempt.**
Closer to ADR-0006's spirit for every step, not just the final one, but it would require the shared
contract to grow room-2-specific request/response shapes — an interface change needing team agreement
— for a puzzle whose real content (the story, the atmosphere) has no integrity requirement except at
the exit.

**Give the backend a real `publicData()` payload (e.g. the story text) instead of shipping it in the
frontend bundle.** Would let the server gate content the same way Room 1's placeholder does, but Room
2's content is static per player (no per-session variation), so there is nothing dynamic to gain from
routing it through the API — only latency and an unused round trip.
