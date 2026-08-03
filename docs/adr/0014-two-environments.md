# ADR-0014: Two environments — cool.tf from main, dev.cool.tf from dev

- **Status:** Accepted
- **Date:** 2026-08-03
- **Deciders:** Nepomuk Crhonek
- **Approved-by:** Nepomuk Crhonek, 2026-08-03

## Context

On Thursday the other project team is told to break our application. Pointing them at the same
deployment we intend to demo on Friday means any damage, any exhausted rate limit and any wedged
container lands on the thing being graded. Pointing them at a laptop means they cannot test at all.

We also want merging to `main` to mean something. If `main` and the live site can disagree, nobody can
answer "is this what is deployed?" during the demo.

## Decision

Two environments, each a full stack of its own:

| Branch | Environment | URL |
| --- | --- | --- |
| `dev` | staging | `https://dev.cool.tf` |
| `main` | production | `https://cool.tf` |

Pushing to `dev` deploys staging and smoke-tests it. Merging `dev` into `main` deploys production and
smoke-tests that. Both are the same Terraform module with different inputs, so they cannot drift.

Staging runs a **lower attempt rate limit** (10/minute versus 30) so the smoke test can prove the
limiter fires without waiting through thirty requests on every deploy.

One wildcard certificate and one hosted zone cover both, so the second environment costs a second App
Runner service and almost nothing else.

## Consequences

- Thursday's testing happens against `dev.cool.tf`. If the other team wedges it, production is
  untouched and the fix is a normal push to `dev`.
- `main` is always exactly what is live at `cool.tf`, which is what makes the branch policy in
  [ADR-0016](0016-branch-policy.md) meaningful rather than ceremonial.
- Roughly doubles the running cost, to about $13/month total. Small enough not to matter, and a budget
  alarm covers being wrong about that.
- Two deploys to watch instead of one, and a change now takes two merges to reach production. That is
  the intended friction: it is what stops a Thursday-evening fix going straight to the demo untested.
- Both environments share one ECR repository, so an image is built once and tagged per environment
  rather than built twice.

## Alternatives considered

**Production only.** Cheapest and simplest, and what most teams will do for a week-long project.
Rejected because it puts Thursday's deliberate break-it session and Friday's graded demo on the same
infrastructure.

**A staging environment on a different domain entirely.** Avoids touching the demo domain's DNS.
Rejected as pointless extra work — a subdomain in the same zone is covered by the same wildcard
certificate and costs nothing extra.
