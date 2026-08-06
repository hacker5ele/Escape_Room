# ADR-0040: Real paths, no hash, and reload lands you where you were

- **Status:** Accepted
- **Date:** 2026-08-05
- **Deciders:** Nepomuk Crhonek
- **Approved-by:** Nepomuk Crhonek, 2026-08-05

## Context

The app had exactly one route — `/invite/:token`, matched by a hand-written regex — and everything
else was component state. The tabs lived in the **URL hash**. The lobby, the room you were in and the
character you were building lived in nothing at all: reload and you were back at the front page.

That is the wrong shape for a game somebody is going to demo. Reloading inside a room should put you
back inside that room.

## Decision

**Every screen is a path**, and no `#` appears in the URL again.

| path | screen |
| --- | --- |
| `/invite/:token` | invite preview — **public, outside every gate** |
| `/` | the game page, Rooms tab |
| `/friends` · `/leaderboard` · `/activity` | the same page, other tabs |
| `/character` | the picker — `?head=…&body=…&arm=…&leg=…&slot=…` |
| `/lobby` | the waiting room |
| `/room/:roomId` | a room |
| anything else | redirect to `/` |

**`react-router-dom@7`**, which had been a declared dependency since the scaffold and had never once
been imported — so it was being tree-shaken out entirely. Making it real added **27 KB gzipped**
(148 KB, up from 121). That is more than the 15–20 KB estimated when the decision was taken, and
worth recording as an estimate that was wrong rather than quietly absorbing.

### No infrastructure changed, because it was already built for this

Every environment already served `index.html` for unknown paths: a CloudFront function in the
deployed environments, `try_files` in the docker nginx — whose comment already cited `/room/room-02`
by name — and Vite's own fallback in development. The smoke test already checked `/room/room-02`
returned the app shell.

The deploy was ready for routing before there was anything to route. The only change was widening
that smoke check to cover every route rather than one.

### The gates became one layout route

`RequiresGame` replaces the stack of early returns in the old `GamePanel`: loading → signed out →
profile incomplete → no character. Only when all four are clear does `<Outlet/>` render, so every
route below can assume a signed-in player with a game and none of them repeats the checks.

The no-character case **redirects to `/character`** and carries the intended path in location state,
so confirming returns you to whatever you were opening. It must not redirect when the path already
*is* `/character`, or it is a loop — there is a test for exactly that.

`/character` is one route doing two jobs, because they are the same screen: with a character you are
editing (there is a way out, and it opens on yours); without one you are at the gate (there is not,
because there is nothing behind it yet).

### The outfit lives in the query string

`/character?head=head-01&body=body-07&arm=arm-12&leg=leg-03&slot=body`

Every part is **checked against the catalogue** rather than trusted — these are query parameters, so
they can say anything, and an id from a catalogue that has since changed should quietly become a
random one rather than render a broken image.

Written with `replace`, never `push`: browsing twenty heads must not put twenty entries in the back
stack for somebody to press through. And **debounced at 150 ms**, because Safari throttles history
writes at roughly a hundred calls per thirty seconds and throws `SecurityError` past that — clicking
quickly along a row of parts would reach it.

A side effect worth having: the URL is now shareable. Sending somebody `/character?head=…` shows them
that outfit.

### Who decides where the party is

The subtle part, because there are two sources of truth: the URL says where *you* are, and the
server's in-memory phase (ADR-0038) says where the *party* is.

> **The host's location is the party's location. A guest follows it.**

- **Host** — arriving at `/lobby` sets the phase to lobby; arriving in a room sets it to that room.
  This is what makes the back button work: leaving a room by any means puts everybody in the lobby,
  rather than the server yanking you straight back in because it still thinks you are there.
- **Guest** — never sets the phase, and follows whatever the heartbeat reports, including on the
  first beat after a reload. Reloading at `/lobby` while the host is in room-02 takes you to room-02,
  which is more useful than being stranded outside.

### The invite token is still validated

The old `routing.ts` matched `/invite/:token` with a regex that also **rejected `../` and
`<script>`** — and that mattered, because the token is interpolated into `/api/invites/${token}`.
The router matches any segment and would hand over whatever was there, so deleting the file would
have quietly dropped a security check.

It is now `isInviteToken()`, applied in the route, with its tests rewritten rather than removed —
including percent-encoded traversal, which survives the browser's own URL normalisation.

## Consequences

**Good**

- Reload recovers: inside a room, mid-outfit, on a tab. That was the ask.
- The back button works, and every screen is linkable.
- The gates are one place instead of five stacked returns, and the status strip stops remounting on
  every tab change.
- The smoke test now proves seven routes return the app shell rather than one.

**Bad**

- **27 KB gzipped**, and my estimate was 15–20.
- **Back and forward are where routers go wrong**, and they now have real work to do. The tests
  cannot see a history stack; the manual pass is what proves it.
- The host's back button moves everybody. Correct under the rule above, and worth knowing before
  somebody reports it as a bug.
- `App.tsx` changed shape substantially, so any open branch touching it will conflict.

**Notable**

- `/#friends` redirects to `/friends`, once, on mount. Links were shared in the team chat this week.
- Nested `<main>` elements are gone: the lobby and rooms used to render their own inside the page's.

## Alternatives considered

**A hand-rolled router** over `popstate` and `pushState` — about sixty lines, no bundle cost, and the
dependency would have stayed unused. Rejected because back/forward ordering is exactly where these go
wrong, the bug is always *"sometimes, on the third press"*, and this is not the week to be
maintaining a router instead of the game.

**Removing the dependency and hand-rolling.** Tidiest end state, same risk, plus a lockfile change
mid-week that every open branch would then conflict with on install.

**Keeping the hash and just adding the lobby to it.** Less work and explicitly not what was asked
for — and the hash never reaches the server, so it cannot be part of a link anybody can rely on.

**Encoding the outfit as one compact parameter** (`?c=head-01.body-07…`). Shorter and unreadable, and
the request was specifically for `&`-separated parts.
