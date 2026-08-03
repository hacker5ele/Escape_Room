# ADR-0017: Authentication with Clerk

- **Status:** Accepted
- **Date:** 2026-08-03
- **Deciders:** Nepomuk Crhonek
- **Approved-by:** Nepomuk Crhonek, 2026-08-03

## Context

Players must register before they can reach the rooms, and a game must belong to the account that
started it — log back in tomorrow and your progress is still there.

The obvious instinct is to build it: a users table, bcrypt, a session cookie. That is a bad trade in
this particular week. On Thursday the other project team is explicitly told to break this application,
and hand-rolled authentication is the largest, softest target we could hand them. Password hashing,
session fixation, timing attacks, password reset, rate limiting on login — each is a way to lose, and
none of them is what the assignment is grading.

The constraint that narrows the field is our stack: a **Vite React SPA plus a separate Express API**.
Most authentication advice is written for Next.js, where the selling point is middleware and server
components. We have neither, so that advice does not transfer.

Cost, unusually, does not discriminate at all. Every candidate's free tier runs from 10,000 to 50,000
monthly users. Our class is about thirty people. Anything on the list is free for us, so the decision
comes down to how fast it integrates and how well it fits what we already have.

## Decision

**Clerk**, using `@clerk/react` in the frontend and `@clerk/express` in the backend.

The React SDK targets our exact scaffold — Clerk's own quickstart begins with
`npm create vite@latest -- --template react-ts`, which is the command that created `apps/frontend`.

The backend verifies for itself rather than trusting the browser, which is what
[ADR-0006](0006-server-authoritative-puzzles.md) demands:

```ts
app.use(clerkMiddleware())
const { isAuthenticated, userId } = getAuth(req)
```

Clerk stores the user records. We store only a Clerk `userId` against each game, so we never hold a
password, an email address, or anything else worth stealing.

The prebuilt `<SignUpButton>`, `<SignInButton>` and `<UserButton>` components mean no login screen has
to be designed, which keeps Inaam's time on the rooms.

`CLERK_SECRET_KEY` goes into SSM as a `SecureString` and reaches the container through
`runtime_environment_secrets`, exactly as the CloudFront origin secret does — so it is not readable
through `apprunner:DescribeService` either. The publishable key is not secret and is baked into the
frontend bundle at build time, which is what it is for.

## Consequences

- No password handling in our code at all. The most dangerous thing we could have written this week
  does not exist.
- Sign-up, sign-in, session refresh and account management arrive as components. Realistically hours
  of work rather than days.
- **Login survives a deploy.** Our API is a single instance holding state in memory, so every
  deployment drops in-flight games — but the Clerk session lives outside our container, so nobody is
  logged out by a deploy.
- A hard dependency on a third party during the demo. If Clerk is down on Friday afternoon, nobody can
  sign in and there is no way in. Weighed against writing our own auth in four days, we take that risk.
- Local development and tests need a way to run without contacting Clerk, so the backend takes its
  authenticator as an injected function, defaulting to Clerk. Tests pass a fake. This is the same
  pattern `createApp()` already uses for the rate limiter and the origin secret.
- Clerk's frontend talks to Clerk's own domain, which is cross-origin. That does not affect our
  same-origin design ([ADR-0009](0009-containerization.md)) because it is their origin, not ours — but
  it is worth remembering if we ever add a Content Security Policy.

## Alternatives considered

**Supabase Auth.** Genuinely close, and it bundles Postgres, which would have settled our persistence
question in the same move — see [ADR-0018](0018-dynamodb-persistence.md) for why we went elsewhere.
Rejected here because it has no prebuilt React components, so we would be building login forms during
the week we should be building rooms.

**AWS Cognito.** Tempting, because it is already in the account we deploy to and would add no vendor.
Rejected on developer experience: it is by a distance the most awkward of the options, and on a
four-day deadline the thing most likely to consume a whole day.

**Auth0.** The enterprise standard, and the strongest on SAML and federation — none of which a school
escape room needs. Heaviest configuration for the least relevant benefit.

**Firebase Auth.** The largest free tier, and a second cloud sitting beside AWS for no reason, with the
weakest modern React story of the group.

**Rolling our own, or a self-hosted library.** Full control, no vendor, and we own every security bug
we write. On the week the application is deliberately attacked, that is the wrong week to find out
which ones we wrote.
