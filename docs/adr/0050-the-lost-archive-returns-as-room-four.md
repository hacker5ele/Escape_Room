# ADR-0050: The Lost Archive comes back, as room four

- **Status:** Accepted
- **Date:** 2026-08-06
- **Deciders:** Nepomuk Crhonek
- **Approved-by:** Nepomuk Crhonek, 2026-08-06
- **Amends:** [ADR-0048](0048-the-hall-floods.md)

## Context

[ADR-0048](0048-the-hall-floods.md) rebuilt room 1 as a flooding hall and **replaced** the room that
was there — Eleonora's ten-mark trivia room, the Lost Archive of Alexandria, merged the day before in
PR #35. That was done on instruction and the ADR said so plainly, but it left a finished room sitting
in git history and nowhere else.

Room 4 was still the scaffold's placeholder: *The Door*, six stencilled numbers, add them up.

## Decision

**The Lost Archive returns as room four, from Eleonora's own commits rather than rewritten.**

The backend definition, the room component and its inline art are restored from
`feat/room-01-lost-archive` and renamed from 01 to 04. Nothing about the puzzle changed: the ten
levels, their questions, their accepted answers, the marks they award, the hints, the prose and the
code `7931473781` are all exactly as she wrote them.

### The title had to move

Both rooms were called *The Reading Hall* — the flooded one took the name with it. Her own file
already names the theme in its first line (*"Theme: the Lost Archive of Alexandria"*) and her branch
was `feat/room-01-lost-archive`, so **The Lost Archive** is the name her work was already using for
itself. Her prose is untouched; only the `title` field moved.

That is still a change to somebody else's room, so it is the first thing the pull request says and
she is the reviewer on it.

### What did not come back

`.room1-hotspot` — about thirty lines of CSS that **nothing referenced, in her version either.** It
was dead when it was written and restoring it under a new name would only have made it dead with a
new name. Everything her component actually uses is back.

## Consequences

**Good**

- Four rooms, four finished puzzles, and nobody's week is missing from the game.
- The restore is her commits, so the history still shows who wrote it.
- Room 4 stops being *"add up six numbers"* on the night before the demo.

**Bad**

- **Room 4 is the last door**, so it is the room fewest players will reach. Her work moved from the
  first room anybody sees to the last — that is a real demotion and worth being honest about rather
  than presenting the restore as a straight win.
- **It has not been rendered end to end.** It sits behind three rooms and the preview harness in
  `rooms/preview.tsx` is specific to room 3's data shape, so this was verified by the type checker,
  the room contract tests and the build — not by looking at it. The component is unchanged from the
  one that rendered correctly as room 1, but that is an argument, not a screenshot.

**Notable**

- Nothing needed merging. `feat/room-01-lost-archive` has been an ancestor of `dev` since PR #35 —
  what was lost was the file contents, not the commits.

## Alternatives considered

**Renaming the flooded hall instead**, so hers keeps *The Reading Hall*. Fairer to her, and it would
have meant editing two accepted ADRs and several passages of `CLAUDE.md` to chase a name. The Lost
Archive is a better title for her room anyway, which is what settled it.

**Putting it back as room 1 and moving the flooded hall to 4.** The flooded hall is the one built for
the demo, and the demo reaches room 1.

**Leaving it in history.** It is a finished room, and the assignment asks for up to four.
