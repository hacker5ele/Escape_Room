# ADR-0025: Notifications, and why they arrive by polling

- **Status:** Accepted
- **Date:** 2026-08-04
- **Deciders:** Nepomuk Crhonek

## Context

Friends exist, so the app now has things to tell people: somebody asked to be your friend, somebody
accepted. Chat and co-op play will have far more. All of it needs to reach a browser that is already
open, without the player pressing reload.

The obvious answer is a WebSocket. We cannot have one.

**App Runner does not support WebSockets.** Its Envoy proxy also caps a request at roughly thirty
seconds, which rules out server-sent events and long polling too — both would be cut mid-stream on a
timer, repeatedly, forever. Nothing that holds a connection open works on this platform.

That leaves short polling, so the real decision is not *whether* to poll but how to make polling
cheap enough that it does not matter.

## Decision

### One endpoint for the whole app

`GET /api/sync` answers "has anything happened?" for every feature at once. It returns new
notifications, the unread count, and — as chat and co-op land — which conversations have new
messages and the current game version.

The alternative is an endpoint per feature, which at four features is four times the requests for
the same information. One poll, one round trip, one place to add the next thing.

At about thirty players with a ten-second interval that is roughly three requests per second against
one container, each one or two DynamoDB queries. Comfortable.

### Polling stops when the tab is hidden

The single largest saving, and it costs one event listener. A tab left open in a background window
is the common case, and nothing on screen is changing, so nothing needs fetching. Coming back to the
tab polls immediately, so it never *feels* like it was asleep.

The interval is a chained `setTimeout`, not `setInterval`: a slow response delays the next request
instead of stacking another one on top of it. `setInterval` against a struggling server produces a
pile-up exactly when it is least wanted.

### The cursor is the server's clock, and it deliberately overlaps

Each response carries `now`, which the client sends back as `since`. The client's own clock is never
used. A browser running a few minutes fast would ask for notifications from the future and receive
nothing, forever, and that failure looks exactly like "nothing is happening" — the worst kind of bug
to diagnose.

More subtly, the server reaches **five seconds further back** than the cursor it is given. A
notification's `createdAt` is stamped when the request begins, but the row lands a few milliseconds
later. A poll landing in that gap returns a `now` that is *newer* than a row which has not appeared
yet; asking for strictly-newer next time would skip that row permanently.

So the window overlaps, the client sees some notifications twice, and it deduplicates by id. A
duplicate is one line of client code. A lost notification is invisible, permanent, and impossible to
reproduce.

### The unread count comes from storage, never from the page

`unreadCount` is counted from stored `readAt` values, not from the notifications in the response.
The badge is therefore correct even when a poll returns nothing, when the page was truncated, or
when the cursor is wrong. The list can lag; the badge cannot.

### Notifications never break the thing that caused them

`notifyQuietly` logs and swallows. Writing a notification happens *after* the write that matters —
the friendship is already stored. Failing the request at that point, or rolling it back, would trade
a missing badge for a lost friendship. A notification is a courtesy.

### The type union is wider than what is built

`friend_request`, `friend_accepted`, `message`, `party_invite`, `room_solved` — only the first two
are emitted today. Notifications are infrastructure, not a friend-request feature, and the next
thing that needs to tell somebody something should add a member to that union and nothing else.

### The actor is resolved at read time

A notification stores `actorUserId`, not a copy of the profile. Storing a copy would freeze the
avatar and display name at the moment it was written, so a week-old notification would show a
picture the person has since changed. One batched profile lookup per page covers the whole list.

## Consequences

**Good**

- Works on App Runner today, with no infrastructure change.
- One request serves every real-time feature, now and later.
- A hidden tab costs nothing at all.
- The badge is right even when the list is not.

**Bad**

- Up to ten seconds of latency. For a friend request that is unnoticeable; for chat it will want the
  faster interval the plan describes when a conversation is open.
- Clients see occasional duplicates. Deliberate, and cheap to handle.
- Counting unread items uses a filtered Query over the player's partition. Fine while a partition
  holds tens of items — the 30-day TTL keeps it that way — and it becomes an `ADD` counter if
  notification volume ever grows.

**Notable**

- The sort key is `${createdAt}#${id}`. `toISOString()` is fixed-width UTC to the millisecond, so it
  sorts lexicographically in true chronological order, and the id breaks same-millisecond ties. This
  assumes one writer's clock; worth remembering if the service is ever scaled past a single instance.

## Alternatives considered

**WebSockets on ECS Fargate behind an ALB.** The technically correct answer, and about $16/month plus
a day of work to migrate off App Runner. Not worth it in a five-day build. This is the escape
hatch if polling ever stops being enough.

**Server-sent events.** Cheaper than WebSockets and a natural fit for one-way notifications, but the
same thirty-second proxy cap applies. It would reconnect every thirty seconds for the life of the
page — all the complexity of a streaming transport with none of the benefit.

**A poll per feature.** Simpler to write, four times the requests, and every new feature adds another
timer. Rejected before it could start.
