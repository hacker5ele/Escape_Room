# ADR-0047: A piece does not fly in until it has something to fly in with

- **Status:** Accepted
- **Date:** 2026-08-06
- **Deciders:** Nepomuk Crhonek
- **Approved-by:** Nepomuk Crhonek, 2026-08-06
- **Amends:** [ADR-0044](0044-unbuild-into-dots.md)

## Context

On a cold cache the lobby arrived wrong. The screen's pieces flew in on time and **empty**, and the
furniture appeared afterwards — one file at a time, popping into place with no animation at all.

Two things were true at once and neither was obviously the problem:

- **Nothing was ever fetched early.** A scene is about a megabyte of scenery across thirty-odd files,
  and the first request for any of it was the browser meeting the `<img>` while painting the stage.
  There were no preload hints, no `decode()`, nothing.
- **The arrival did not care.** `Assemble` marked its pieces and started the wave whether or not
  those pieces had anything in them. A picture cannot fly in before it exists.

## Decision

**Fetch the art before the screen that needs it, and hold any piece that still has none.**

### Fetched while somebody is looking at the screen before

The Rooms tab pulls down the lobby — Start is the button on that tab, so it is the last screen before
the stage. The lobby pulls down whichever room is selected, re-running as the selection changes. Your
own character comes down with the lobby too: it is the one character certain to be standing there.

`preloadImage` keeps **one promise per URL** for the life of the page, so flicking along the row of
rooms costs one download each rather than one per press.

**`decode()`, not just `load`.** A loaded image is bytes; a decoded one is pixels, and the conversion
otherwise happens on the first frame that tries to draw it — which is exactly the frame the animation
is running on. Fetching without decoding moves the hitch rather than removing it.

**It never rejects.** A picture that will not load is a picture the stage already skips; making
callers handle that would put a `catch` at every call site to ignore it there instead.

### And a piece that still has nothing waits

Preloading makes the wait short, not impossible — a slow connection, or somebody deep-linking
straight into a room. So the arrival is honest about it: a piece whose pictures have not arrived is
held **invisible** rather than animated empty, and released into the same arrival everything else got
the moment it can be drawn.

A latecomer is given **no stagger**. It has already waited longer than the whole wave, and its place
in the queue stopped meaning anything.

**There is a ceiling of 2.5 seconds.** An image that 404s never fires `load`, and a piece held for
ever is a hole in the page. An `error` counts as arrived for the same reason: a picture the piece is
never going to get is not worth waiting for.

## Consequences

**Good**

- The transition animates the room rather than an empty rectangle where the room will be.
- The fix is in two independent places, and either alone is an improvement: preloading makes the wait
  rare, holding makes it invisible when it happens.
- Nothing new is downloaded that would not have been downloaded a second later anyway. It is the same
  bytes, asked for earlier.

**Bad**

- The Rooms tab now fetches about a megabyte somebody might never look at, on the assumption that
  anybody on that tab is about to press Start. True of everyone who plays; not free for someone who
  opened the leaderboard.
- The floor-sweep timer grew by the hold limit, so in the worst case a transform lingers 2.5 seconds
  longer than before. Only ever reached by a piece that never animated at all — `animationend` clears
  each piece as it lands.
- A held piece is invisible, so a broken asset now costs 2.5 seconds of nothing rather than an empty
  box immediately. That is the right trade for art that usually arrives, and the wrong one for art
  that never does.

**Notable**

- Two of the new tests fail against the previous behaviour, which is the point: *"waits, rather than
  animating an empty box"* and *"does not make a latecomer wait out the stagger as well"*.

## Alternatives considered

**Blocking the whole screen until every image is ready.** One decision instead of one per piece, and
it turns a slow connection into a blank page for as long as the slowest file takes. Holding
per piece means the panels arrive on time and only the scenery waits.

**Fading each picture in as it loads.** Smooth, and it contradicts a rule this project already has:
nothing fades in, because a linear fade is the tell that reads as machine-made
([ADR-0037](0037-lobby-stage-and-rooms.md)). It also treats the symptom — the piece would still be
arriving without its contents.

**Preloading everything at sign-in.** Two and a half megabytes of scenery and character parts before
anybody has pressed anything, most of it for rooms they may never open.

**`<link rel="preload">` in the document head.** Static, and the app does not know at build time which
scene anybody is about to enter. It would mean preloading every scene for everyone.
