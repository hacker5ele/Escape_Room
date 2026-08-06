# ADR-0039: Null is the empty cursor, and stand-ins must be as strict as the real thing

- **Status:** Accepted
- **Date:** 2026-08-05
- **Deciders:** Nepomuk Crhonek
- **Approved-by:** Nepomuk Crhonek, 2026-08-05

## Context

`GET /api/sync` was returning 500 on `dev.cool.tf`. The log said:

```
ValidationException: One or more parameter values are not valid.
The AttributeValue for a key attribute cannot contain an empty string value. Key: sk
```

`cursorFor()` used `''` to mean "from the beginning" and passed it straight into a DynamoDB key
condition:

```ts
if (!since) return ''
// …
KeyConditionExpression: 'userId = :u AND sk > :after'
```

**DynamoDB refuses an empty string as a key value.** `sk > ''` is not an unbounded query, it is an
error — so the *first poll of every session* failed, along with every poll whose cursor did not
parse as a date. The frontend polls sync every ten seconds, so this was the most-hit endpoint in the
app.

It had been broken since the social layer shipped, and it was found by a player rather than by us.

### Why nothing caught it

Two failures, and the second is the one worth keeping.

**The smoke test gates every deploy and touches no authenticated endpoint.** All ten of its checks
were anonymous — static assets, health, rooms refusing signed-out callers, rate limits. Ten green
checks said nothing whatever about whether the signed-in half of the app worked. (I also misread a
grep of it during the investigation and told Nepomuk it *did* cover sync; it counted the word
`async`.)

**The in-memory repository was more permissive than DynamoDB.** It compared `record.sk > ''`, which
is perfectly happy JavaScript, so all 227 tests passed against a repository that accepted input the
real database rejects. The tests were not wrong about the code; they were wrong about the database.

## Decision

**`null` is the only way to say "from the beginning".** `cursorFor` returns `string | null`, and the
DynamoDB query *omits* the sort-key condition entirely when there is no cursor rather than widening
it — because there is no key value meaning "before everything", which is the whole point.

**The in-memory repositories enforce DynamoDB's constraints.** `assertUsableKey` throws on an empty
string, exactly as the real database does.

That second decision is the general rule, and it is the reason this ADR exists rather than a one-line
fix:

> **An in-memory stand-in must be at least as strict as the thing it stands in for.** Where it is
> more permissive it does not simulate the database, it hides it — and the difference is only ever
> discovered in production.

Verified rather than assumed: reintroducing the original `return ''` now fails **18 of 22** sync
tests. Before the guard it failed none.

**The smoke test checks every guarded endpoint answers 401.** It cannot hold a Clerk token, so it
cannot prove those endpoints *work* — but it can prove they are mounted and that the handler reaches
its auth check without falling over on the way. A 500 there means something is broken before anybody
has even signed in.

## Consequences

**Good**

- The most-polled endpoint in the app works.
- The class of bug is now caught by the existing suite rather than by a player.
- Deploys check the signed-in surface at all, where before they checked none of it.

**Bad**

- The 401 check is a weak proxy for "the signed-in app works". It would **not** have caught this
  particular bug, which is after the auth check. It catches the neighbouring class — an unmounted
  route, a handler that throws on import — and nothing more. Real coverage needs an authenticated
  smoke run or DynamoDB Local in CI.
- Every in-memory repository is now slightly less convenient to use, on purpose.

**Notable**

- Chat has the identical `sk > :after` query and is **not** affected: `chat.service` branches to
  `listRecent()` when there is no cursor, so it never builds an empty key. That is the shape the
  notification repository now has too.
- This bug was in production for days behind a permanently green pipeline. That is worth remembering
  the next time green is taken as evidence.

## Alternatives considered

**A sentinel like `'0'` that sorts before every timestamp.** One character, no signature change — and
it encodes an assumption about the sort key's format that nothing enforces. The day a key stops
starting with a digit it breaks silently.

**Catching the `ValidationException` and retrying without the condition.** Treats a bug we control as
weather. The query was simply wrong.

**DynamoDB Local in CI.** The real answer to the underlying problem, and it would have caught this
outright. A container, a fixture and a slower suite — worth doing, not worth doing on Wednesday of a
five-day build. Making the stand-in stricter buys most of the protection for none of the cost.
