# ADR-0018: Store game progress in DynamoDB

- **Status:** Accepted
- **Date:** 2026-08-03
- **Deciders:** Nepomuk Crhonek
- **Approved-by:** Nepomuk Crhonek, 2026-08-03
- **Supersedes:** [ADR-0008](0008-session-persistence.md)

## Context

[ADR-0008](0008-session-persistence.md) deliberately deferred the persistence decision and named the
trigger for revisiting it: *"we want a leaderboard that survives a restart"* or *"restarting the
backend during a demo loses a session and that turns out to actually hurt"*.

Tying games to accounts ([ADR-0017](0017-authentication-clerk.md)) is a third trigger, and a decisive
one. An account whose progress evaporates when the container restarts is worse than no account at all —
it invites people to trust something that does not hold. The deferral is over.

There is a second reason. Games in memory are why the API is pinned to exactly one instance
([ADR-0012](0012-aws-hosting.md)); a second container would answer requests about games it had never
heard of. Moving state out of the process removes that ceiling.

What the storage actually has to do is narrow. `SessionRepository` is already `create`, `findById`,
`save` — pure key/value access, no joins, no queries, no reporting. One player has exactly one game.

## Decision

**DynamoDB**, one table per environment, partitioned on the Clerk `userId`. One item per player.

Three properties decided it, and none of them is about the database being good at databases:

**No password.** The container authenticates with the IAM instance role we already created for the
origin secret. There is no connection string and no credential to leak — which matters when the
repository is public and four people are pushing to it.

**No VPC.** App Runner reaches DynamoDB over its regional endpoint. Reaching RDS would need a VPC
connector, which is real Terraform, real subnets and a real thing to debug on Wednesday.

**No query rewriting.** The existing repository interface is already key/value, so this is a new
implementation behind an interface that does not change, exactly as ADR-0008 promised.

Billing is on-demand. At our traffic this is inside the free tier.

## Consequences

- Progress survives deploys, restarts and logouts. An account now means something.
- **The single-instance pin is no longer load bearing.** We keep `min = max = 1` for now because
  nothing about a class demo needs more, but it is now a cost choice rather than a correctness one.
- `InMemorySessionRepository` stays, and the tests keep using it. The suite stays fast and needs no AWS
  credentials.
- One item per user means no pagination, no scans and no hot partitions — the access pattern is a
  single `GetItem` by `userId`.
- We are now storing something about people, even if it is only a Clerk user id and puzzle progress. It
  is not personal data in any meaningful sense, and Clerk holds anything that is.
- A local run without AWS credentials cannot reach DynamoDB, so the repository is selected at startup:
  DynamoDB when a table name is configured, in-memory otherwise. `docker compose` stays a one-command
  experience.

## Alternatives considered

**Postgres, via RDS or Supabase.** SQL is more familiar to the team than DynamoDB, and if the data
model were ever going to grow relationships it would be the right answer. Rejected because the access
pattern is a single key lookup, and because RDS drags in a VPC connector while Supabase drags in a
second cloud and a connection string to keep out of a public repository.

**SQLite on a volume.** Cheapest and simplest to reason about. Rejected because App Runner has no
persistent disk — the file would vanish with the container, which is the problem we are solving.

**Keeping it in memory and accepting the loss.** Defensible for anonymous play, which is exactly why
ADR-0008 chose it. Not defensible once we ask people to register.
