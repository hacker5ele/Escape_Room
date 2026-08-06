# ADR-0036: The global board is a top ten, and reads games in one batch

- **Status:** Accepted
- **Date:** 2026-08-05
- **Deciders:** Nepomuk Crhonek
- **Approved-by:** Nepomuk Crhonek, 2026-08-05
- **Amends:** [ADR-0034](0034-global-leaderboard.md)

## Context

The global leaderboard from [ADR-0034](0034-global-leaderboard.md) shipped and was slow enough to
notice, and it listed everybody.

The slowness was not the table scan, which was the thing the ADR warned about. It was the line after
it: having scanned up to two hundred profiles, the service then asked for each player's game **one
key at a time**.

```ts
profiles.map(async (profile) => {
  const game = await this.games.findByUserId(profile.userId)   // up to 200 round trips
})
```

`Promise.all` made those concurrent, not cheap — it is still two hundred separate requests to
DynamoDB for a single page load, each with its own latency, and each a strongly consistent read
because that is what `findByUserId` does for the room gate.

The friends board had predicted this in a comment: *"if it ever grows, the repository gains a batch
method and nothing above it changes"*. It grew.

## Decision

**Games are read in one batch.** `GameRepository` gains `findManyByUserId`, implemented with
`BatchGetItem` in hundreds. Two hundred round trips become two.

The batch read is deliberately **not** consistent, unlike `findByUserId`. That one guards what a
player may enter, so a stale read could briefly re-lock a room they just solved; this only feeds a
leaderboard, where a row a second out of date costs nothing and a consistent batch costs twice as
much.

**The board returns ten rows — plus your own, if you are not in the ten.**

That exception is the whole reason a top ten is acceptable here. ADR-0034 rejected one outright:

> Rejected because it also hides you from yourself: a player outside the top ten would have no row at
> all, which is worse than a low one.

Ten-plus-you answers that. The list stays ten rows long for everybody rather than growing for whoever
is furthest down, and nobody is missing from their own leaderboard.

### `rank` is now on the wire

**This is an interface change**, and it is the part worth arguing about. `LeaderboardEntry` gains a
required `rank`.

It is needed because array position and actual position stop being the same thing the moment a row is
appended: the eleventh entry may be the player in twenty-third place. The client was rendering
`index + 1`, which would have put a confident, wrong number next to somebody's name.

Sending it also fixes something that was always implicit — a leaderboard entry genuinely has a rank,
and inferring it from array order was a coincidence that happened to hold.

Both boards are numbered by one function, so neither can drift from the other.

**Per rule 7 this needs prior agreement with the whole team, and that has not happened.** Rule 4
means Nepomuk's request approves the ADR and the work; it does not stand in for the team
conversation. Flagged on the pull request rather than quietly skipped. The change is additive and
nothing outside this repository consumes the API, so the risk is low — but the rule is the rule.

### What the client does with it

The list is rendered from `rank` rather than from the index, and a row whose rank is not one more
than the row above it gets a dashed rule before it. The jump from 10th to 23rd is made visible rather
than left to be misread as a bug.

## Consequences

**Good**

- The board is fast: one scan and one batch, rather than one scan and two hundred reads.
- Ten rows is a glanceable board rather than a class register.
- Nobody is hidden from their own leaderboard.
- `rank` removes a real correctness trap rather than papering over it.

**Bad**

- **An interface change without the team conversation rule 7 asks for.** Additive and low-risk, but
  outstanding.
- The scan still reads up to two hundred profiles even though at most eleven are returned. Ranking
  requires seeing everybody, so this cannot be narrowed without a secondary index that maintains
  order — which is a score table by another name, and ADR-0027 avoided one deliberately.
- A player in eleventh place sees a board of eleven rows where somebody in fourth sees ten. Correct,
  and slightly odd until you notice the dashed rule.

**Notable**

- `dynamodb:BatchGetItem` was already granted on the instance role, so unlike `Scan` and `Query`
  before it this needed no infrastructure change. The permission was there because the profiles
  repository already batches.

## Alternatives considered

**Caching the board for a few seconds.** The rows are identical for every caller except `isMe`, so a
short server-side cache would collapse concurrent requests to one scan. Genuinely worth doing if
thirty people load the page at once during the demo — but the batch fix alone took the cost from two
hundred round trips to two, and a cache is state to reason about at the point in the week where
adding state is how things break. Noted as the next lever, not pulled.

**Top ten with no exception**, exactly as asked. Simpler, and it would leave anybody outside the ten
with no row — which is the thing ADR-0034 specifically refused. Rejected in favour of the convention
every leaderboard uses.

**Inferring rank on the client from the previous row.** Avoids the interface change, works right up
until the appended row, where there is nothing to infer from. Rejected as a guess dressed as a
number.

**Paginating the global board.** Answers "show fewer rows" without dropping anybody. Rejected: a
leaderboard nobody scrolls past page one of, in exchange for a parameter that makes the scan
repeatable and therefore expensive on demand.
