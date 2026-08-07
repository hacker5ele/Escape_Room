# ADR-0050: The Lost Archive comes back, as room five — and the game grows to five rooms

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

Room 4 was the scaffold's placeholder — *The Door*, six stencilled numbers, add them up — so that is
where it was going back. Then Abigail's room four landed: a 3D chase runner with vision puzzles and a
wizard finale, in flight as PR #44. Two finished rooms wanting the same slot.

## Decision

**The Lost Archive returns as room five, from Eleonora's own commits rather than rewritten — and the
game grows to five rooms.**

Abigail's room keeps slot four, which this branch hands back untouched: `room-04.ts` and
`room-04.tsx` are restored to exactly what is on `dev`, so her pull request owns that file alone and
the two do not collide on it.

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

### Five is one more than the assignment asks for

The assignment says *"Das Spiel besteht aus 2-4 aufeinanderfolgenden Räumen"* — two to four
consecutive rooms. This is five. That is a deliberate departure and not an oversight: five rooms got
built, and throwing a finished one away to satisfy a range is a worse outcome than exceeding it.

**It is also trivially reversible**, which is the whole reason ADR-0007 made rooms plugins. Cutting
back to four is deleting one entry from `ROOM_IDS` and one from each registry. If the range turns out
to be a hard requirement rather than a guideline, that is a five-minute change, and it should be made
before Friday's freeze rather than argued about after it.

### The contract change

`ROOM_IDS` gains `'room-05'`. That file says in its own comment that adding to it is a contract
change needing an ADR, which is this one, and rule 7 asks for team agreement — flagged on the pull
request.

The lobby's room picker was `grid-cols-4`. It now takes its column count from `ROOM_IDS.length`, so
the next change to the count does not need to find it. Three tests were counting to four by hand and
now count off the contract too — one of them, *"solving every room finishes the game"*, was walking
rooms one to four and asserting the game had ended, which would have quietly gone on passing while
being wrong about a five-room game.

## Consequences

**Good**

- Four rooms, four finished puzzles, and nobody's week is missing from the game.
- The restore is her commits, so the history still shows who wrote it.
- Room 4 stops being *"add up six numbers"* on the night before the demo.

**Bad**

- **Room 5 is now the last door**, so it is the room fewest players will reach — one further back
  than when this ADR was first written. Her work moved from the first room anybody sees to the last
  of five. That is a real demotion and worth being honest about rather than presenting the restore as
  a straight win.
- **The game is longer than the assignment describes**, and a marker reading the brief with the text
  in front of them will notice.
- **It has not been rendered end to end.** It sits behind three rooms and the preview harness in
  `rooms/preview.tsx` is specific to room 3's data shape, so this was verified by the type checker,
  the room contract tests and the build — not by looking at it. The component is unchanged from the
  one that rendered correctly as room 1, but that is an argument, not a screenshot.

**Notable**

- Nothing needed merging. `feat/room-01-lost-archive` has been an ancestor of `dev` since PR #35 —
  what was lost was the file contents, not the commits.

## Alternatives considered

**Cutting a room to stay inside two-to-four.** Somebody's finished week comes out of the game to
satisfy a range the assignment states as a spread rather than a rule. Reversible in five minutes if
that reading turns out to be wrong.

**Renaming the flooded hall instead**, so hers keeps *The Reading Hall*. Fairer to her, and it would
have meant editing two accepted ADRs and several passages of `CLAUDE.md` to chase a name. The Lost
Archive is a better title for her room anyway, which is what settled it.

**Putting it back as room 1 and moving the flooded hall down.** The flooded hall is the one built for
the demo, and the demo reaches room 1.

**Leaving it in history.** It is a finished room, and the assignment asks for up to four.
