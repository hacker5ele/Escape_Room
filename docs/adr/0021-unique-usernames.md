# ADR-0021: Every player has a unique username, enforced by Clerk

- **Status:** Accepted
- **Date:** 2026-08-03
- **Deciders:** Nepomuk Crhonek
- **Approved-by:** Nepomuk Crhonek, 2026-08-03

## Context

A game belongs to an account ([ADR-0019](0019-games-belong-to-accounts.md)) and records what the player
did ([ADR-0020](0020-activity-log.md)). Both of those become far more useful with a public identity to
attach them to — a leaderboard needs a name to put in a row, and "Nepomuk" appearing three times is not
a leaderboard.

A first name is not an identity. Two players called Alex are ordinary in a class of thirty, and the
Clerk user id is unique but unreadable.

The obvious implementation is a `username` column with a uniqueness constraint. We do not have a
database with constraints — DynamoDB ([ADR-0018](0018-dynamodb-persistence.md)) partitions on the Clerk
user id, so enforcing uniqueness on a second attribute would mean either a global secondary index plus
a conditional write, or a second table used purely as a lock. Both are real work, and both have a race
between checking and writing that is easy to get subtly wrong.

## Decision

**Clerk owns usernames, and Clerk enforces uniqueness.**

Usernames are enabled and required in the Clerk dashboard. `user.update({ username })` rejects a handle
that is already taken, and that rejection is surfaced to the player as "that username is taken" rather
than a generic failure.

The game stores the username on its record for display, but Clerk remains the source of truth. We never
check for collisions ourselves — there is no index to maintain and no race to lose.

**The server enforces that a username exists.** `POST /api/sessions` reads the Clerk profile and refuses
with `409 PROFILE_INCOMPLETE` if there is no username. The frontend reacts to that response by showing
a form; it does not decide for itself whether a profile is complete. Skipping the form therefore
achieves nothing, which is the property that matters when the other team is trying to get in sideways
on Thursday.

The form is a fallback, not the main path. With usernames required at sign-up in Clerk it never
appears — it exists so the game does not silently depend on a dashboard setting, and so accounts made
through a social provider, which frequently return no username, still end up with one.

## Consequences

- A leaderboard is now possible without any further data-model work: every game carries a unique,
  human-readable handle.
- No uniqueness logic, no secondary index and no conditional writes in our code. The hardest part of
  the problem is somebody else's.
- The username is what other players see. That is a deliberate choice — it means nobody's real name is
  exposed by a scoreboard.
- A player changing their username in Clerk leaves the copy on their game stale until it is next
  written. Acceptable this week; if it matters, refresh it on `startOrResume`.
- One more failure mode at sign-up: a taken username. The error is handled explicitly, because a
  generic "could not save" would leave someone retyping the same handle indefinitely.
- Reading the profile costs one Clerk API call, made only when a game is created — never on the request
  path for playing.

## Alternatives considered

**A DynamoDB global secondary index on `username`, with a conditional write.** Keeps everything in our
own store and works without Clerk. Rejected as disproportionate: an index, a conditional expression and
a check-then-write race, to reimplement something the identity provider already guarantees.

**Derive a handle from the name — `nepomuk-c`, `nepomuk-c2`.** No form, nothing for the player to
choose. Rejected because collisions still need resolving, so the uniqueness problem is unchanged, and
the results are ugly on a scoreboard.

**Use the email address.** Unique by construction and needs no new field. Rejected outright: a
leaderboard would publish everyone's email.
