# ADR-0012: Host on AWS behind a single CloudFront distribution per environment

- **Status:** Accepted
- **Date:** 2026-08-03
- **Deciders:** Nepomuk Crhonek
- **Approved-by:** Nepomuk Crhonek, 2026-08-03

## Context

The project has to be reachable at **cool.tf** for Friday's demo, on a machine that is not one of ours,
and it has to survive Thursday, when the other team is told to break it. Running `npm run dev` on a
laptop during a presentation is not a deployment.

Two properties of the app constrain the design more than anything else. The frontend contains no
backend URL — it calls the relative path `/api`, and that same-origin design is why there is no CORS
configuration anywhere ([ADR-0009](0009-containerization.md)). And sessions live in memory
([ADR-0008](0008-session-persistence.md)), so a second backend instance would answer requests about
sessions it has never heard of, and rooms would randomly re-lock.

A naive split — static site on one domain, API on another — breaks the first property and forces CORS
back into the codebase. Anything that autoscales breaks the second.

## Decision

One CloudFront distribution per environment, with two origins:

```
cool.tf → CloudFront
            ├── /*      → private S3 bucket (OAC)   the Vite build
            └── /api/*  → App Runner (HTTPS origin) the Express API
```

The browser talks to exactly one origin, so `/api` stays a relative path and no CORS is involved. The
API runs on **App Runner pinned to one instance** (`min_size = max_size = 1`), which satisfies the
in-memory session constraint without a load balancer to pay for.

Route 53 holds the zone — an apex domain cannot be a CNAME, CloudFront has no static IPs, and Hostinger
does not support ALIAS records, so delegating the nameservers is the only way to point `cool.tf` at
CloudFront. ACM issues one wildcard certificate in us-east-1, which is the only region CloudFront
accepts.

Four configuration details are load-bearing and are covered by the smoke test rather than trusted:

- the `/api/*` behavior allows **all HTTP methods** — the default GET/HEAD-only would make
  `POST /api/sessions` fail with a 403 before it ever reached the origin;
- it uses **CachingDisabled** and an origin request policy that forwards the custom **`X-Session-Id`**
  header, without which every authenticated call becomes a 400;
- SPA deep links are rewritten by a **CloudFront Function on the default behavior**, and explicitly
  *not* by custom error responses. This one nearly shipped wrong: `CustomErrorResponses` is a
  distribution-level setting with no per-behavior scoping, so a 403/404 → `/index.html` rule would also
  have rewritten the API's own errors. A locked room answers `403 ROOM_LOCKED`, which would have
  reached the browser as HTML with status 200 — the gate would have looked open to every client. A
  function attaches to one behavior, so the site is rewritten and the API is untouched;
- **`TRUST_PROXY`** counts the real hops, or the rate limiter either blocks the whole world at once or
  can be bypassed with a forged `X-Forwarded-For`.

App Runner's own URL is public and would otherwise let anyone skip the CDN, so CloudFront attaches a
**shared secret header** that the backend requires — except on `/api/health`, which App Runner itself
calls directly.

## Consequences

- Roughly $7 per environment per month: App Runner about $5, the hosted zone $0.50, and S3, ECR and
  CloudFront within free tiers at our traffic. A budget alarm guards the rest.
- The same-origin design survives deployment untouched. No code changed to make this work except the
  origin guard.
- **One instance is a real ceiling.** It is fine for a class demo and would not be fine for actual
  traffic. Removing the pin requires a shared session store first — that is exactly the decision
  ADR-0008 deferred, and this ADR is the reason it will eventually have to be made.
- A deploy restarts the container, so every in-flight game is lost. Acceptable for a demo; worth
  knowing before deploying at 13:55 on Friday.
- This runs in a personal AWS account that already hosts unrelated production workloads, so everything
  is tagged `Project=escape-room` and the deploy role is scoped to this project's ARNs only.

## Alternatives considered

**ECS Fargate behind an Application Load Balancer.** The conventional answer and the most transferable
to a real job. Rejected on cost: the load balancer alone is about $16/month before any traffic, which
is more than the rest of the stack put together, and it adds target groups and health checks to debug
under time pressure.

**A single small EC2 running the existing `docker-compose.yml` with Caddy for TLS.** Cheapest to
understand and closest to local development. Rejected because it gives up the CDN, makes deploys an
SSH exercise, and puts certificate renewal on us.

**Lambda behind API Gateway.** Cheapest of all, and immediately fatal: Lambda runs many concurrent
execution environments, so in-memory sessions would break on the second request.
