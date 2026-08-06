# ADR-0030: The tests own one HTTP server per app

- **Status:** Accepted
- **Date:** 2026-08-04
- **Deciders:** Nepomuk Crhonek

## Context

The backend suite failed **about one run in two**, and had for some time. A different test each run,
always a genuine assertion failure rather than a crash — a `400` where a `201` was expected, a game
id that did not match, a response body with no `message` in it.

That is the worst kind of failing test: it is not reproducible, so it teaches everyone to re-run the
suite until it is green, which is the same as having no suite at all. It was also about to gate merges
on a random number generator in the week of the demo.

Ruled out first, because a plausible-sounding cause is worth less than an eliminated one:

- **File parallelism** — it fails with `--no-file-parallelism` too.
- **Shared module state** — there is none; the app builds every dependency per instance.
- **Shared rate-limiter stores** — 60 apps built in a loop, 120 writes, no failure.
- **Shared app instances between tests** — every test builds its own.
- **Floating promises in the tests** — the un-awaited calls are all inside `Promise.all` or arrow
  bodies that return the promise.

What was left is the harness. **Supertest, handed a bare Express app, starts a fresh HTTP server for
every single request and closes it afterwards.** The suite makes several hundred requests, so it was
opening and closing several hundred servers in about two seconds. Under that churn some connections
are reset, and the failure surfaces as whichever assertion happened to be next — which is exactly why
the failing test moved around and why it never reproduced in isolation.

## Decision

Tests build their app through `createTestApp`, which wraps it in **one** `http.Server`, starts it, and
hands that back. Supertest reuses a server that is already listening, so a whole test file's requests
share one.

`server.address()` is populated synchronously by `listen(0)`, so nothing had to become `async` and no
test changed shape.

The import is aliased — `import { createTestApp as createApp }` — so every call site reads exactly as
it did before. The only thing that changed is what comes back.

Cleanup is one `afterEach` in a setup file rather than a line repeated in eleven test files, so a new
test file cannot forget it and start leaking servers again. It calls `closeAllConnections()` before
`close()`, because `close()` on its own waits for idle keep-alive sockets and would hang the suite
rather than end it.

## Consequences

**Good**

- Measured: **5 failures in 10 runs before, 2 in roughly 75 after.** From coin-flip to rare.
- The suite is fractionally faster, though that was never the point.
- One place to change if the harness ever needs anything else.

**Bad**

- A residue remains — roughly one run in thirty. Not characterised: it did not reproduce under
  instrumentation, and the two captured instances were different tests. It is small enough to be
  worth living with and revisiting if it grows.
- Test files now import `createApp` from somewhere that is not `app.ts`. The alias keeps call sites
  honest but the import line is a small piece of indirection to notice.

**Rejected**

- **`retry: 1` in the vitest config.** One line, and CI stops going red at random — which is precisely
  the problem: it converts a real signal into silence. The failures were genuine assertion failures,
  and a suite that retries until it passes cannot tell a flaky harness from a flaky feature. In the
  week where correctness is the deliverable, that is the wrong trade.
- **Closing the socket after each response** (`Connection: close`). Tried, on the theory that
  keep-alive reuse explained the residue. It made **every** run fail, which is a clean refutation, and
  it is recorded here so nobody spends an afternoon rediscovering it.
