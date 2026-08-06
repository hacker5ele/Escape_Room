# ADR-0046: Room 1 draws its own scene instead of standing on the shared Stage

- **Status:** Proposed
- **Date:** 2026-08-06
- **Deciders:** Eleonora Vynogradova
- **Approved-by:** _(pending Nepomuk Crhonek)_

## Context

[ADR-0037](0037-lobby-stage-and-rooms.md) put every room on one shared, walkable `Stage`: a fixed
1600×900 coordinate space, generated cut-out scenery, a character you steer with WASD or a drag, and
a `RoomView` shell around it that owns entering, hints, feedback and the solved celebration. A room's
own component gets a small `pointer-events-auto` pane of chrome laid over that scene and nothing more
— `RoomProps` is exactly `{ room, onAnswer, busy }`.

Room 1's puzzle — ten levels (a task, a quiz, or a riddle each, drawn from Greek myth, the Odyssey,
Egypt and Rome) revealing one digit apiece of the code that opens the vault — does not fit that pane.
It is dense enough to want the whole screen, and its intended mood is a dark, collapsed-roof reading
hall with shelving down both walls: a scene of its own, not a puzzle propped in front of the shared
vault backdrop everybody else stands on.

The room owner tried the vault scene first and rejected it outright, then tried the library scene as
in-flow page content beside `RoomView`'s normal chrome, which still left the app's paper-and-halftone
background visible above and below it. Neither read as "a library."

This ADR is written after that code, not before it — which is backwards from how [rule
7](/CLAUDE.md#1-binding-rules) says an interface change is supposed to happen, and it says so plainly
rather than pretending otherwise. It exists to get the already-built change in front of Nepomuk rather
than to justify skipping him.

## Decision

**`RoomDefinition` gets one new, optional field:**

```ts
interface RoomDefinition {
  // ...unchanged...
  /**
   * This room draws its own backdrop instead of standing on the shared
   * walkable Stage — `render` gets the whole scene, not just the chrome on
   * top of it. The trade is real: no co-op walking or emotes in this room.
   */
  customScene?: boolean
}
```

Only Room 1 sets it. `RoomProps` — `{ room, onAnswer, busy }` — is unchanged, so rooms 2–4 and the
lobby are untouched; nothing about this is a contract change for anybody who does not opt in.

**`RoomView`, when `customScene` is set, renders the room's own output as the entire screen** instead
of wrapping it in `<Stage>`: no walkable floor, no character, no `EmoteBar`. It still owns entering,
the answer submission and the solved check exactly as before — those never depended on the Stage.
What moves is *where* the leftover chrome goes: **"Leave the room" and the wrong-answer feedback float
above the scene** (`position: fixed`, high `z-index`) instead of sitting in `RoomView`'s normal page
flow below it, because a `customScene` room has no page flow left for them to sit in — it is `.room1-
scene`, itself `position: fixed; inset: 0`, covering the paper background completely on purpose.

**Hints are dropped for a `customScene` room entirely**, not merely relocated. Room 1's ten levels are
already the help — each one names what it wants outright (a task, a direct quiz question, or a
classic riddle) — and floating a second hints panel on top of a scene already asking the player to
read ten prompts was more chrome than the room needed. This is a property of the branch, not of the
per-room flag: any future `customScene` room inherits "no hints" along with it until someone changes
that.

**`useMovement`'s keyboard listener now checks whether a text input has focus** before treating W/A/S/
D or the arrows as steering. Bundled in the same change because it was found while building this room
— its answer boxes are full of the letter "a" — but it is a bug fix to shared code, not a design
decision, and does not need this ADR's cover. It was broken for every room's answer box, not only
Room 1's.

## Consequences

**Good**

- Room 1 reads as an actual library, not a puzzle bolted onto generic vault scenery.
- Opt-in and additive: one optional field, default behaviour for every other room unchanged, no
  `packages/shared` change, no migration.
- `RoomView` still owns entering, hints (for everyone but a `customScene` room), feedback and the
  solved celebration — the seam ADR-0007 and ADR-0037 promised is intact, just branched once.

**Bad**

- **No co-op presence in Room 1.** No walking, no seeing a friend's character, no emotes. Party phase
  tracking underneath still works — a host still puts the party in the room, a guest still follows —
  but there is nothing to look at while it does. That is a real loss for whichever room takes this
  path, not a cosmetic one.
- **No hints in Room 1**, full stop, as a consequence of the branch rather than a considered per-room
  choice. A future `customScene` room that wants hints back would need `RoomView`'s floating-chrome
  branch extended, not just its own flag flipped.
- `RoomView` now has two rendering paths for the "ready" state instead of one. More surface to keep
  in sync if the shared chrome (feedback wording, the leave button) changes again.
- Precedent: the easier this is to reach for, the more it undoes the point of one shared Stage that
  ADR-0037 argued for — "one place to fix walking, depth or scenery for both the lobby and every
  room." A second or third `customScene` room should be its own conversation, not an assumption that
  this flag is now the default escape hatch.

**Notable**

- Written and approved after the fact. Flagged rather than hidden — see Context.

## Alternatives considered

**Reskin the shared vault scenery itself to look like a library**, keeping every room on one Stage and
co-op presence intact. Rejected for this PR: `scenery/vault-*` art is shared infrastructure the lobby
and rooms 2–4 also draw from, and one room owner is not positioned to redirect it unilaterally. Worth
revisiting as its own decision if a library mood turns out to be what Room 1's puzzle needed all
along, rather than a full opt-out.

**Keep the library scene as in-flow `RoomView` content**, beside the normal header and hints section,
just wider than the `max-w-6xl` column. Tried first. The app's paper-and-halftone background stayed
visible above and below the scene, which was the exact complaint being fixed.

**Do nothing — leave Room 1 on the shared vault Stage.** Simplest, fully consistent with every other
room, and directly rejected by the room owner as the wrong scene for this puzzle.
