# ADR-0022: Local development runs without Clerk

- **Status:** Accepted
- **Date:** 2026-08-03
- **Deciders:** Nepomuk Crhonek
- **Approved-by:** Nepomuk Crhonek, 2026-08-03

## Context

Requiring an account to play ([ADR-0017](0017-authentication-clerk.md)) made the app correct and made
development worse. Three people are building four rooms this week, and as it stood every one of them
needed Clerk keys in a local `.env`, a working internet connection, and a real registered account
before they could look at a puzzle they had just written.

That is a bad trade at the best of times. During a five-day sprint it is worse than the problem it
solves: it puts a third-party service on the critical path of `npm run dev`, and it means a key has to
be distributed to four laptops — which is how keys end up in group chats.

The test suite already had this problem and already solved it: `createApp()` takes its authenticator as
an injected dependency, and the tests pass a fake. The same seam works for a running server.

## Decision

**A second authenticator, selected by `AUTH_MODE=local`, that trusts the request.**

The browser sends `X-Dev-Username`, `X-Dev-First-Name` and `X-Dev-Last-Name`; the server believes them.
The user id is derived from the username (`local:ada`), so signing in again with the same name resumes
the same game — which is what makes it useful for checking that progress actually persists.

It is on by default everywhere a developer works:

- `npm run dev` — the root script sets `AUTH_MODE=local`, and `apps/frontend/.env.development` (which
  Vite loads only for `vite dev`) sets `VITE_AUTH_MODE=local`.
- `docker compose up` — set in `docker-compose.yml`.

Neither needs a Clerk key, an account, or a network.

**Two independent things must both be wrong for this to be live in a deployment.** No deployed
environment sets `AUTH_MODE` at all; and `createApp()` **throws** rather than starting if
`AUTH_MODE=local` is ever combined with `NODE_ENV=production`. Throwing rather than warning is
deliberate: a service that fails to start fails its health check and never receives traffic, whereas
one that logs a warning serves the whole internet as anybody.

On the frontend the two modes sit behind one interface, `useAppAuth()`. `main.tsx` picks which provider
to render — Clerk's or the local one — and nothing below cares which it got. The choice is made by
selecting a component rather than branching inside one, because branching would mean calling Clerk's
hooks conditionally, which React forbids.

## Consequences

- `git clone && npm install && npm run dev` gets a working game. Nothing else. That is the point.
- The Clerk key never has to be copied to four laptops.
- Room work no longer blocks on an internet connection or on Clerk being up.
- **The local mode is a total authentication bypass by design.** Anyone who can reach a server running
  it can be anybody. Two guards stand between that and a deployment, and both are in code rather than
  in a runbook — but it is worth naming plainly rather than burying.
- The two modes can drift. Local development does not exercise Clerk, so a Clerk-specific problem —
  the missing publishable key that broke the first deploy, for instance — will not show up until
  staging. Staging existing at all ([ADR-0014](0014-two-environments.md)) is what makes that
  acceptable, and the live smoke test is what catches it.
- `GameService` no longer knows how a player was identified: the profile is passed in. That fell out of
  supporting two providers and is better design regardless.
- Local mode still enforces the same rules — a game needs a username *and* a name, exactly as Clerk
  does — so a room built locally behaves the same way once deployed.

## Alternatives considered

**Share one Clerk development instance across the team.** No new code at all. Rejected because it puts
a network dependency on `npm run dev`, needs the key on every laptop, and makes two people testing the
same account at once confusing.

**Seed a fixed test user and skip sign-in entirely.** Simpler than a form. Rejected because a single
hard-coded identity cannot exercise the thing most worth testing locally — that two accounts have
separate progress and cannot see each other's games.

**A Clerk testing token in the frontend.** Uses the real provider, so no drift. Rejected as still
requiring keys and a network, which is the actual problem.
