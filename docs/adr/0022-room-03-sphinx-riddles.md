# ADR-0022: Room 3 is a five-riddle sequence, staged from the event log; the frontend gets its room shell

- **Status:** Proposed
- **Date:** 2026-08-04
- **Deciders:** Inaam Ahmed
- **Approved-by:** _(pending — awaiting Nepomuk Crhonek's review)_

## Context

Room 3 ("The Laboratory") was still the placeholder from ADR-0007. It is replaced with "The Sphinx's
Reckoning" — a horror-toned trial with five riddles, answered in order. A wrong answer at any point
restarts all five from the first one.

The room went through two builds. The first was a straight port of a standalone CLI prototype
(`Escape-Room-NY/sphinx.js`): its riddles, rendered as a DOM form. The design brief that followed asked
for something closer to an actual game — a chamber the player walks through, five riddles tied to
physical locations, an escalating horror atmosphere, and a Sphinx that visibly "eats" the player on a
wrong answer rather than just printing red text. This ADR describes the second, current build. The
riddle text also changed in the second pass, to the brief's harder, less-familiar set (see Decision).

Two things had to be decided to fit this into the existing architecture, and both are interface-shaped
rather than purely a room's own business, which is why this is an ADR and not just a room file:

**Where does "which riddle is the player on" live?** `GameSession` ([`packages/shared/src/session.ts`])
has no per-room progress field — only whole-room `solvedRooms`. Adding one would be a session-schema
change, which needs an ADR and team agreement before the code is written (the interface rule in
`CLAUDE.md` §1, rule 7). Room 3 needs five internal stages, not just solved/unsolved.

**There was no frontend room shell yet.** ADR-0007 describes `RoomProps`, a `rooms/registry.ts`, and
`App.tsx` rendering whatever room the player is currently in — as shared infrastructure, written once,
that every room owner builds on. None of it existed. Building Room 3's component needed it to exist
first.

## Decision

**Riddle stage is derived, not stored.** `session.events` ([ADR-0020](0020-activity-log.md)) already
logs every `attempt`, with `roomId` and `correct`. `room-03.ts` counts the player's own unbroken streak
of correct `room-03` attempts, most recent first, and that count is the riddle they are now on. A wrong
attempt anywhere breaks the streak, which reproduces "wrong answer sends you back to riddle 1" with no
new session state:

```ts
function currentStage(session: GameSession): number {
  const attempts = session.events.filter((e) => e.type === 'attempt' && e.roomId === 'room-03')
  let streak = 0
  for (const attempt of attempts) {
    if (attempt.correct) streak++
    else streak = 0
  }
  return streak
}
```

This keeps `GameSession` untouched. The cost is that Room 3's progress is a query over the whole event
log rather than an O(1) field read — cheap at the event-log sizes this game ever reaches (ADR-0020
already caps it at 500).

**Multiple-choice rooms are a recognised shape, not a one-off.** Room 3's answers are letters (A-D).
`rooms.test.ts`'s "never ships its solution" check assumed a solution is a *computed* value that never
needs to appear verbatim in `publicData()` — true for rooms 1/2/4, false for multiple choice, where the
correct option's text is necessarily one of the visible choices. The test now has a
`MULTIPLE_CHOICE_ROOMS` list; for rooms on it, the check instead asserts no field reveals *which* option
is correct (nothing matching `/correct/i` in the payload's keys), rather than asserting the option text
is absent.

**The frontend room shell now exists**, built to the shape ADR-0007 already specified:

- `apps/frontend/src/rooms/room-props.ts` — the `RoomProps` interface every room component receives.
- `apps/frontend/src/rooms/registry.ts` — `ROOM_COMPONENTS`, mapping a `RoomId` to a lazily-loaded
  component. Rooms without a component yet are simply absent from the map; `App.tsx` shows a "no
  frontend yet" placeholder rather than crashing.
- `App.tsx` now resolves the player's current room with `currentRoomId()` ([ADR-0007]'s shared
  predicate, already used server-side), fetches its `RoomPublicData`, and renders it through the
  registry, wired to `submitAttempt` / `requestHint`.
- `apps/frontend/src/api/game.ts` gained `fetchRoom`, `submitAttempt`, `requestHint` — thin wrappers
  over the three room endpoints, following the existing `request()` helper's pattern.

`apps/frontend/src/rooms/room-03/` is Room 3's own component, built on top of that shell.

**Room 3 is a small 2D canvas game, not a form.** `apps/frontend/src/rooms/room-03/game/` holds a
self-contained engine: `engine.ts` (player movement, camera-follows-player, world/pillar collision),
`world.ts` (the chamber's fixed layout — five riddle zones in sequence plus a sealed door, and the
five-stage lighting/Sphinx-posture table), `render.ts` (canvas drawing: parallax pillars, torches, the
Sphinx, the player, a vignette that deepens as riddles are solved), and `attack.ts` (the fail sequence:
sand rising from the floor, screen shake, fade to black). `SphinxGame.tsx` owns the `requestAnimationFrame`
loop, keyboard input (arrows/WASD), and a DOM dialogue overlay on top of the canvas for the riddle text,
typewriter reveal, countdown hourglass, and the four answer choices — mixing canvas world and DOM UI, so
the accessible/interactive parts stay ordinary HTML.

**The server is still the only place an answer is checked.** Walking into a zone is purely a frontend
trigger — it decides *when* to show a dialogue, using a local `solvedZones` set that mirrors the
player's progress for camera/atmosphere purposes only. The riddle text and choices always come from
`room.publicData()`, and the choice the player picks is sent to the real `onSubmit()` from `RoomProps`,
which calls the real API, which calls the real `check()`. If the server says wrong, the local
`solvedZones` set is cleared and the player walks back from the entrance — the game's local state is a
rendering convenience, never the authority. If the game state and the server ever disagree (e.g. a stale
tab), the next real attempt against the server is what decides the outcome, exactly as ADR-0006 requires
for every other room.

**The riddles changed to the design brief's set**, replacing the ones from the first build: The
Uninvited Guest (shadow), The Thief Who Gives (echo), The Judge Who Cannot Speak (silence), The Second
That Never Ends (time), The Guest at Every Table (death) — along with the Sphinx's specific post-answer
line for each. Deliberately avoids reused classic riddles per the brief. `SOLUTIONS['room-03']` in the
test fixture stays `'B'`, since riddle 1's correct choice is still index 1 ("Your shadow").

## Consequences

- No session-schema change, so this needed no separate interface negotiation beyond this ADR.
- Any future room needing internal stages can reuse the same derive-from-events approach, or, if that
  stops being enough (e.g. a room needing state that is not "a count of recent correct attempts"), that
  is the point to revisit whether `GameSession` needs a real per-room progress field.
- Room owners for rooms 1, 2, and 4 now have a shell to build their frontend folder against instead of
  inventing their own. They are not obligated to use multiple choice — `RoomProps` and the registry
  don't assume any particular answer shape.
- The `MULTIPLE_CHOICE_ROOMS` list in `rooms.test.ts` is a second place a room's answer shape is
  declared (the first being the room file itself). Small duplication, in exchange for the leak test
  staying meaningful for both puzzle shapes instead of being loosened for everyone.
- The restart-to-riddle-1 mechanic is harsher than any other room's `check()`, which just re-asks on a
  wrong answer. It is deliberate, kept by request, and is bounded by the existing attempt rate limiter —
  nothing new was added to guard it.
- Room 3 is now substantially more code than any other room: a game loop, a renderer, and world/atmosphere
  data, versus a form. That is a deliberate scope choice for this room specifically, not a new baseline —
  ADR-0007's `RoomProps` contract does not require any of it, and rooms 1, 2, and 4 are free to stay
  simple forms.
- The countdown timer and the walking/zone-approach mechanic exist only in the frontend. A player who
  bypasses the UI and calls the API directly is not timed and does not need to "walk" anywhere — this is
  consistent with the rest of the app (the frontend route guard is UX only, per ADR-0006) but is worth
  naming: the horror pacing is cosmetic, not a security or fairness boundary.

## Alternatives considered

**Add `roomProgress: Record<RoomId, unknown>` to `GameSession`.** The direct way to give a room its own
state. Rejected for now: it is a session-schema change needing separate team agreement, and Room 3 does
not need it — the event log already contains everything required to derive stage.

**Multiple-choice as letters checked against a hidden `correctIndex` never sent to the browser, with the
existing leak test unchanged.** This is in fact what `check()` does. The test still needed to change,
because "does the serialized payload contain the string `B`" is not a meaningful leak check to begin
with — the payload legitimately contains the correct option's *text* as one of four choices. Loosening
the assertion to "no field reveals which one" is the more honest test, not a workaround.

**Build only Room 3's component, inline API calls and no registry, leaving `App.tsx` untouched.**
Fastest, but Room 3 would not actually be reachable from the app, and the next room owner would face the
same missing-shell problem. Rejected because ADR-0007 already promised this shell would be shared.
