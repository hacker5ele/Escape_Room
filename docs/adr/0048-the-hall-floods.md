# ADR-0048: The Reading Hall is a place you play by walking, and it is filling up

- **Status:** Accepted
- **Date:** 2026-08-06
- **Deciders:** Nepomuk Crhonek
- **Approved-by:** Nepomuk Crhonek, 2026-08-06
- **Supersedes:** [ADR-0046](0046-room-01-opts-out-of-the-stage.md) — *Room 01 opts out of the stage*
- **Amends:** [ADR-0007](0007-room-registry-and-ownership.md), [ADR-0038](0038-presence-and-the-iris-wipe.md)

## Context

Room 01 was a list. Ten trivia questions in a panel, and `customScene: true`, which opts a room **out
of the shared walkable stage** — so there was no character in the room, no walking, no co-op, no
animation and nothing that reacted to anybody. It is the room a demo audience actually reaches, and
there was nothing to do in it but read and type.

What was asked for: make it long, interactive, animated and **responsive to the character**; water; a
death that puts you back in the lobby; time pressure; a comic look with none of the tells of a
generated image. And the one that shapes everything else — **when a friend is in the hall, the
mechanisms change so that some of them are only passable together.**

## Decision

> **The room is a place, not a question. Everything in it is done by walking somewhere and stopping,
> and the only thing anybody types is the six figures at the end.**

### Standing is the input, and that is what makes co-op free

A lamp lights because you are standing at it. A tablet is carried because you stopped on it. A wheel
pumps because somebody is there. The mechanism reads positions — and **every player's position has
been on the heartbeat twice a second since the stage was built** (ADR-0038).

So a second player costs *nothing*: no new message, no new endpoint, no new state. They are another
set of coordinates in the same list, and the room can simply ask whether two of them are in two
places at once. Watching a friend wade across and their wheel start turning is their reported
position, rendered.

**Standing, not passing.** Being inside the radius is not enough; the player has to have stopped.
That one condition does three jobs at once: walking the length of the hall no longer trips every
station on the way; a twice-a-second position sample becomes *enough*, because somebody who has
stopped is still there on the next beat while somebody crossing a 95-unit circle at 340 units a
second might never be sampled inside it; and it makes "you can stop the water, but only by standing
still and doing nothing else" literally true rather than a rule the room has to explain.

An earlier draft added `at: string | null` to the heartbeat — the client naming its own station at
60fps, verified server-side against the reported position. Requiring a stop removed the need for it
entirely, which halved the contract change and left nothing new to forge.

### The water is the clock, the enemy and the gate

One number, `depth`, 0 to 100, owned by the server. There is no countdown widget anywhere in the
room, which is what lets the pressure run for minutes without becoming a timer nagging in a corner.

| wheels held | rate | reads as |
| --- | --- | --- |
| none | **+1.9/s** | rising |
| one | **0/s** | holding |
| both | **−1.9/s** | falling |

The pump rate equals the rise rate deliberately: one wheel holding *exactly* level is the line the
whole difficulty curve balances on. A wheel keeps turning for **5 s** after the last person steps off
it, and the hall is 1200 units between them — about 3.5 s at walking speed — so a lone player
sprinting flat out has both turning for a moment each crossing and gains roughly a third of what two
people standing still manage. Enough to survive on, never enough to be comfortable.

The sea also **surges**: +12 when an act falls, +8 on a mistake. That gives the room comic pacing
rather than one long grind, and it is what makes ten thousand combinations at the vault door
unguessable — the rate limiter bounds how fast you may guess, the surge bounds how many guesses you
survive.

### The hall counts you, and changes shape

It counts **I or II** and nothing else; a third player is a second pair of hands. What one person can
work alone, two have to work together:

| | alone | together |
| --- | --- | --- |
| **I — the lamps** | five, each burning 12 s; all five alight at once, so the order is the puzzle | they will not take a flame singly. The hall names two at opposite ends and both must be stood at by **different people at the same moment** |
| **II — the index** | five tablets into five pedestals in the order the depth staff gives | the floor opens down the middle and **what you carry into it, you lose**, stranding two of the five on the wrong side |
| **III — the wheels** | a ratchet: four notches, and only ever at the far wheel | both turned the same way at once — and **the plaque saying which way is at the other player's end** |
| **IV — the vault** | sprint, pump, type in the window it buys | one holds a wheel while the other types, at opposite ends |

The count is **locked while an act runs**, so a mechanism never changes shape under somebody's hands.
If the party shrinks and stays smaller for 5 s the act **re-forms** — otherwise a partner closing
their tab would leave you inside a puzzle that had become impossible for one.

Act III is the best of them and the cheapest: which way a wheel is being turned is which way the
player is **facing**, and `facing` has been on the heartbeat since the stage was built. Nothing new
travels for it at all.

### Nothing is sent before it is earned

`publicData()` carries a floor plan — positions, and nothing else. The code is three fragments and
**the server does not send one until the act that awards it is finished**. Reading the network tab
tells a player exactly what playing tells them, and no sooner.

That is a stronger reading of [ADR-0006](0006-server-authoritative-puzzles.md) than a payload that
merely omits the final answer: there is nothing here to work backwards from. It is also the one
weakness of the room this replaces, whose payload shipped every question, every accepted answer and
every digit at once.

### The contract change

One field, nullable, on the heartbeat **response**: `room: { roomId, depth, trend, act, counted,
drowned, detail } | null`.

It rides the heartbeat rather than taking an endpoint of its own because `presence.routes.ts` already
states the rule — split when the cadences differ, share when they match — and a room that changes
twice a second wants exactly the cadence presence already runs at.

The frame is typed because the shell acts on `drowned`, and because `heartbeatResponseSchema.parse()`
exists precisely so a shape change fails at the seam rather than as a character rendered at NaN.
`detail` is an opaque record for the same reason `RoomPublicData.data` is one: it is the seam that
lets a room own its own shape, so the owners of rooms 02–04 can grow a clock without touching
`packages/shared` again — which is what ADR-0007 promised sub-teams.

Rule 7 wants prior agreement with the whole team. Flagged on the pull request, as ADR-0036, 0038,
0042 and 0045 all were.

### Drowning

`depth` reaches 100 and **the whole party goes under**: one water level, one fate. A full-bleed GLUB,
then everybody is put back in the lobby and the hall is thrown away. Leaving and dying cost the same,
deliberately — a room you can leave halfway through and come back to is a room you can chip away at
until the clock stops meaning anything.

**Drowning is terminal and sticky on the wire**, so every client sees at least one beat carrying it
and can play the splash before anybody moves.

### Nothing outlives the people in it

The halls are one in-memory map keyed by host, ticked **lazily from whichever heartbeat arrives
next**. There is no timer anywhere in the feature: a hall nobody is standing in is not rising, which
is both the cheap answer and the correct one. Same trade as presence, and the same constraint — App
Runner stays pinned to one instance, or two of them would each flood half the room.

## Consequences

**Good**

- The co-op is not a mode; it is the room noticing how many people are in it. It cost no new
  transport, no new endpoint and no membership state.
- The anti-cheat and the game mechanic are the same thing: the only way to learn the code is to
  finish the acts, because that is when the server sends the figures.
- Every room after this one can have a clock without another contract change.
- The room is playable on the shared stage again, so friends, emotes, presence and the party rail all
  work in it — all of which `customScene` had switched off.

**Bad**

- **A merged pull request of somebody else's is being replaced.** Their trivia, their art and their
  `customScene` route go. Their ADR is superseded rather than deleted, and the duplicate `0046`
  number is left for them to renumber.
- **A contract change the day before the freeze**, even at one nullable field.
- **A phone is cramped.** The stage is 320×180 there, and the HUD had to become a chip to fit. The
  room works at 320px; it is not where it is at its best.
- The hall is lost on a deploy, like every lobby already was.

**Notable**

- Four bugs here were found by *rendering and measuring*, not by reading the code: Tailwind's
  preflight `img { max-width: 100% }` collapsing every station to zero width inside a zero-width
  positioning parent; the crest strip clipped away by the very `overflow` added to stop it
  overflowing; a 1700px sideways scroll; and the crop landing on the flat half of the wave drawing.
  None of them were visible in a diff.
- **The drowning bug is an ADR-0041 in a new costume.** Telling the server to leave *as* `drowned`
  arrived made the server drop the hall, so the next beat carried `room: null`, `live?.drowned` went
  `true → undefined`, React ran the effect cleanup and **cancelled the timer that does the leaving**.
  The player stood in a room that had already reset. Latching it locally is the fix; the dependency
  you react to going away is exactly the case an effect will not survive.
- One test was a tautology and passed a deliberately broken ratchet: it asserted the timeout equalled
  the constant it was written from. Pinning the literal, and testing the *property* — that a lone
  sprinter gains ground — caught it.

## Alternatives considered

**Keeping the ten questions and staging them physically.** Preserves a teammate's work and their
`check()` untouched. Rejected on instruction: multiple-choice-by-walking turns genuine trivia into a
one-in-three guess, which their own ADR says it was designed to avoid, and typed answers under a
rising tide is a quiz with a stopwatch rather than a room.

**A `/api/rooms/:roomId/pulse` endpoint.** Doubles the request rate to learn one thing at the same
cadence presence already polls at, and `presence.routes.ts` argues against it in its own words.

**Making the room genuinely two-player only.** The strongest possible answer to "you must do things
at the same time" — and one person playing alone at the demo hits a wall they cannot pass.

**Client-authoritative water, synchronised between players.** Two clients drift, and one can simply
decline to drown.
