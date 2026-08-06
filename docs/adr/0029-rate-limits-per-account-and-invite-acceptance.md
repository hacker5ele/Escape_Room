# ADR-0029: Rate limits belong to accounts, and an invite link is already consent

- **Status:** Accepted
- **Date:** 2026-08-04
- **Deciders:** Nepomuk Crhonek
- **Amends:** [ADR-0024](0024-friend-graph-and-invite-links.md) — what accepting an invite does

## Context

The social layer ([ADR-0023](0023-public-profiles.md) through [ADR-0028](0028-co-op-play.md)) was
reviewed line by line after it merged. Most of what came out were plain defects, fixed under the ADRs
that already cover them. Two were not defects but decisions made badly the first time, and those are
recorded here.

## Decision

### Authenticated rate limits are keyed by account, not by address

Every limiter was keyed by client IP, with this reasoning in the code: *"an attacker who is limited
per account simply makes more accounts."*

That argument is sound for an anonymous endpoint and wrong for this application. **The whole class
sits in one room behind one NAT.** One public address covers every player, so a single shared budget
means one enthusiastic player spends everybody's — and on Thursday, when the other team is explicitly
asked to break the app *from that same network*, the limits fire on people doing nothing wrong. The
attempt limiter is the worst of them: 30 answers per minute, for the entire class, together.

Where a request carries a verified account, that account is the key. The "just make more accounts"
objection does not survive contact with the actual system: an account is a Clerk identity with a
unique username ([ADR-0021](0021-unique-usernames.md)), so making another one is exactly the barrier
Clerk already is, and every other protection in the app rests on the same assumption.

Requests with no account still key by IP, because there is nothing else to key on. That is one
endpoint — the public invite preview — and it is precisely where IP is the right unit.

Resolving the caller now happens once per request and is shared between the limiter and the handler,
so this costs no extra verification.

### Following an invite link makes you friends, with nothing left to approve

Accepting an invite created a *pending* request that the inviter then had to approve.

That is wrong, and it was wrong against our own plan, which said the endpoint "creates the friendship
both ways". The link **is** the consent: the inviter generated it and sent it. Asking them to confirm
the same thing twice is friction, and worse, the person following the link accepts and sees nothing
happen — no friend, no conversation, no explanation.

A block still wins, checked exactly as it is for an ordinary request. A link somebody was sent before
being blocked must not be a way back in, and they are told nothing either way — the same silence
ADR-0024 chose deliberately.

## What else the review found

Fixed under the ADRs that already cover them, and listed because the *shape* of them is worth
remembering.

| Defect | Why it survived the tests |
| --- | --- |
| A game written before `version` existed could never be written again: the condition compared an **absent** attribute to zero, so every write conflicted, retried twice and 409'd. Every existing player's game would have stopped working on deploy. | The in-memory repository always had the field, so no offline test could produce the state. It now models a missing version, and there is a test. |
| `hasUnreadFrom` used `Limit: 1` with a `FilterExpression`. DynamoDB applies the limit **before** the filter, so it read one item, filtered it away and reported nothing unread — meaning chat rang the bell on every single message, which is the exact thing that method exists to prevent. | Only reproducible against real DynamoDB. The in-memory repository has no notion of a read limit, so the offline suite passes either way. Reviewing the query was the only way to see it. |
| Sending a message advanced the conversation cursor to your own message, stepping over a reply written in the seconds before it — that reply was never fetched again. | Needed two writers interleaved within one poll interval. There is now a test. |
| A guest saw themselves listed among the people playing with them. | The query asks "everybody pointing at this host", which includes whoever is asking. |
| Joining a friend's game while people were in yours left them pointing at a game you had walked away from — alone, with no way to tell. | Nobody had tried the third-player case. |
| The signed-in header showed the player's face twice: a decorative avatar and Clerk's account button, which is itself an avatar. | Not something a test asserts. |
| A Clerk instance with usernames disabled produced an unwinnable profile form and Clerk's own wording — "username is not a valid parameter for this request" — which reads like the player mistyped something. | The setting is per instance, and only production had it on. The form now names the real cause. |

## Consequences

**Good**

- A classroom no longer shares one budget, so normal play cannot exhaust it and Thursday's testing
  hits the limits it is supposed to hit.
- Following a link does the thing the person clicking it expects.
- Two production-only failure modes — the version condition and the filtered limit — are gone, and
  the first now has a test that would have caught it.

**Bad**

- Per-account limits do nothing against somebody who has not signed in. That is one endpoint, and it
  is still IP-limited.
- The in-memory repository has grown a `seed` method used only by tests. Small, and the alternative
  was leaving the legacy-row case untested.

**Notable**

- Two of these were invisible to the offline suite by construction, because the in-memory
  repositories cannot express a missing attribute or a read limit. That is the cost of the
  test-without-AWS design in [ADR-0008](0008-session-persistence.md), and it is still worth paying —
  but it means the DynamoDB query code needs reading, not just running.

## Alternatives considered

**Raising the limits instead of re-keying them.** A guess dressed as a fix: it does not say what the
right number is, it still couples every player's budget to everyone else's, and the first person to
hold down a key takes the class down with them.

**Keying by account everywhere, including the invite preview.** There is no account on that request.
It would have degraded to a single shared key for every anonymous caller — worse than IP.

**Leaving invite acceptance as a request.** Defensible if a link could be forwarded to strangers, but
it can already be revoked and it expires; the inviter controls it. The friction is real and the
protection is not.
