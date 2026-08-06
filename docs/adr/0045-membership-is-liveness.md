# ADR-0045: Being in a game is a claim you keep alive, not a row somebody deletes

- **Status:** Accepted
- **Date:** 2026-08-06
- **Deciders:** Nepomuk Crhonek
- **Approved-by:** Nepomuk Crhonek, 2026-08-06
- **Amends:** [ADR-0028](0028-co-op-play.md), [ADR-0038](0038-presence-and-the-iris-wipe.md)

## Context

Closing a tab did not take you out of anything.

| | where it lived | how long it lasted |
| --- | --- | --- |
| Where you were standing | in-memory map | `PRESENCE_TTL_MS` = **120 s** |
| Which game you were in | **DynamoDB `party` table** | **for ever** |

So your character stood frozen in the lobby for two minutes, and your seat in a friend's game — one
of four — was held indefinitely. You stayed in their party rail. Coming back days later still put you
in their game. The only thing that ever removed the row was somebody explicitly pressing leave.

Two things confirmed the gap: `leaveStage()` was exported and never called, and `DELETE /api/stage`
existed and was never hit.

**The client already solved the hard half.** `usePresence` beats every 500 ms while visible and every
5 s while hidden, deliberately — *"stopping would let the server time you out, and a friend watching
you would see you disappear because you looked at another tab."* A hidden tab and a closed tab were
already distinguishable. Nothing consumed that as a membership signal.

## Decision

> **There is no membership record. There is one map of who currently has the game open and what they
> are claiming, and everything else is derived from it.**

Being in a party stops being a row somebody has to remember to delete and becomes a claim you have to
keep alive. Stop beating and you leave the lobby **and** the game by the same expiry, because they
are the same fact.

```ts
interface Live {
  userId: string
  hostUserId: string | null   // null is your own game — the common case, stored as nothing
  standing: Standing | null   // null while you are in the app but not on the stage
  hidden: boolean
  lastSeen: number
}
```

**Every read filters on `lastSeen`.** The sweep is memory hygiene, not correctness — an entry nobody
has tidied is still, correctly, not there. There is a test for exactly that, because it is the
property that makes the whole thing safe to reason about.

### Why a reload needs nothing at all

Nothing is torn down when the page goes away. A reload takes about a second, the entry is still warm,
and the next beat refreshes it. **No beacon, no `sessionStorage`, no rejoin endpoint, and nobody
watching sees anything happen.**

A `pagehide` beacon was the obvious alternative and is the wrong one twice over: it never fires on a
crash, a force-quit or dead wifi — so the timeout has to exist anyway — and the same event fires on
reload, which would make everyone watching see you blink out and drop back in. One mechanism that is
always right beats two where the fast one is only sometimes there.

### Patience depends on what the tab last said about itself

A closed tab and a *throttled* tab look identical from the server. Chrome clamps timers in tabs
hidden for more than five minutes to roughly one a minute, so a single short timeout would eject
somebody for looking at another tab for six minutes.

Only the client can tell the difference, so it says which it is — one boolean on the beat:

| last beat said | timeout | why |
| --- | --- | --- |
| visible | **15 s** (three beats) | you were looking at it and now it is silent: you closed it |
| hidden | **5 min** | you tabbed away and the browser is throttling you |

Closing the tab you were *looking at* is the case that matters, and it is the fast one.

### The beat runs from every screen, not just the stage

You can be in a friend's game while reading the leaderboard. `usePresence` only runs in the lobby and
in a room, so a claim renewed only there would end the moment you opened another tab of the app.
`useLiveness` sits in `RequiresGame`, above every gated screen, and beats `POST /api/stage/alive`
every five seconds — **including while hidden**, unlike `/api/sync` ([ADR-0025](0025-notifications-by-polling.md)),
because stopping is indistinguishable from closing and telling those apart is the entire feature.

On the stage it stays quiet: one shared module-level clock, so a player in the lobby sends one
request per interval rather than two.

### Walking out is instant; closing the tab is not

`DELETE /api/stage` finally gets a caller and a narrower job: **clear `standing`, keep the claim.**
Leaving the lobby takes your character off the stage at once but does not take you out of your
friend's game. It is the one departure that is a real click rather than a guess about an unloading
page, so it is the one that can be immediate.

### The host leaving does not dissolve the party

Their game is still in DynamoDB and still playable; guests carry on and the rail shows the host gone.
No cascade, and a host with bad wifi does not eject the room. A host reloading rejoins their own game
and finds everybody still there.

## Consequences

**Good**

- The reported bug and the seat it was holding are the same fix: counting only live members is what
  frees the place, and it falls out of the store rather than being special-cased.
- The dependency graph got *smaller*. `PresenceService` used to ask `PartyService` who was in the
  party; both now read the same map, so "I left the lobby" and "I left the game" cannot disagree.
- A whole DynamoDB table, its GSI, its IAM statements and its env var are gone.
- `hostOf` returning you to your own game when you are no longer here means a stale player's solves
  go to their own progress, which is correct rather than merely safe.

**Bad**

- **A restart now dissolves parties.** CLAUDE.md promised the opposite. Presence was already lost on
  a deploy, so this makes the two consistent — but it is a promise being withdrawn. "Do not deploy
  during the demo" already covers the risk.
- **A tab hidden for more than five minutes still times out.** That is the ceiling the browser
  imposes; the `hidden` flag pushes it as far as it goes rather than pretending otherwise.
- Every open tab now beats every five seconds, forever, hidden or not — 12 requests a minute against
  a limit of 240. Cheap, and paid by every player rather than only by the ones in a party.
- **An interface change**: `hidden` on the heartbeat, the two timeout constants replacing
  `PRESENCE_TTL_MS`, and `POST /api/stage/alive`. Rule 7 asks for prior agreement with the whole
  team — flagged on the PR rather than skipped, as with ADR-0036, 0038 and 0042.

**Notable**

- A test caught a bug in the first version of this: `alive()` carried the old claim forward without
  checking it was still live, so closing a laptop for a minute and opening it again silently put you
  back in a party you had already left — with no join, and no chance for the host to refuse it.
- `MAX_PARTY_SIZE` is unchanged and now means what it says. It used to count seats; it counts people.

## Alternatives considered

**A `pagehide` beacon.** Instant departure, and covered above: unreliable exactly when it matters,
and it makes your own reload ugly for everybody else.

**Keeping the row and giving it a DynamoDB TTL.** Native TTL deletes are best-effort within 48 hours,
so reads would still have to filter — all of the complexity of the expiry with none of the
promptness, plus a write per beat at 2 Hz.

**`sessionStorage` as the source of truth.** Its lifetime is *exactly* "this tab", which is the
semantics being asked for, and it is tempting for that reason alone. But the server cannot read it,
so the client would be asserting its own membership — a thing to forge — and it would need a quiet
rejoin endpoint to re-establish. Held in reserve as a repair path for a reload slower than 15 s or a
tab hidden past the throttle, neither of which is worth a second source of truth until it bites.

**Two timeouts, one for the stage and a longer one for the game.** Would have kept a guest's solves
going to the host through a laptop sleep. It also means "gone from the lobby but still in the game",
which is a state somebody would rightly report as a bug — and the window it protects is the second
between waking and the first beat.
