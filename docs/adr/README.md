# Architecture Decision Records

An ADR captures one architectural decision: what we decided, why, and what it costs us. It is written
*before* the code, and it stays in the repo forever — even after it is superseded — so that later we
can see not just what the architecture is, but why it became that.

## The rules

1. **No commit without an ADR.** If your change is not covered by an existing ADR, write one first.
2. **Only Nepomuk Crhonek may set an ADR to `Accepted`.** The `Approved-by` field must name him and
   carry a date. Nobody approves their own ADR.
3. **Claude does not push until the approval is stated explicitly.** Writing files and running tests is
   fine; pushing is not, until someone says in plain words that the ADR is approved.
4. **Interface changes need an ADR *and* team agreement before implementation** — this follows directly
   from the assignment's *Schnittstellen-Vertrag* rule.

`docs/adr/**` is listed in [`.github/CODEOWNERS`](../../.github/CODEOWNERS), so GitHub requires
Nepomuk's review on any pull request touching this folder. Rule 2 is enforced by the platform.

## Status values

| Status | Meaning |
| --- | --- |
| `Proposed` | Written, under discussion. **Implementation must not be merged yet.** |
| `Accepted` | Approved by Nepomuk. This is now how we build. |
| `Rejected` | Discussed and turned down. Kept so the reasoning is not lost. |
| `Superseded` | Replaced by a later ADR, which must be named in the header. |
| `Open` | A decision we consciously postponed, with the trigger for revisiting it. |

## Writing a new one

1. Copy [`template.md`](template.md) to `NNNN-short-kebab-title.md`, numbering sequentially.
2. Fill it in. Keep it short — one screen is usually enough. Explain the *why*, not the syntax.
3. Add a row to the index below and to the decision log in [`CLAUDE.md`](../../CLAUDE.md).
4. Open a pull request on a `docs/adr-NNNN-…` branch and request Nepomuk's review.

## Index

All of these were approved by Nepomuk Crhonek on 2026-08-03.

| # | Title | Status |
| --- | --- | --- |
| [0001](0001-project-choice.md) | Project choice: Projekt A — the digital escape room | Accepted |
| [0002](0002-monorepo-npm-workspaces.md) | Monorepo with npm workspaces | Accepted |
| [0003](0003-frontend-stack.md) | Frontend stack: React + Vite + TypeScript + Tailwind | Accepted |
| [0004](0004-backend-stack.md) | Backend stack: Node + Express + TypeScript + Zod | Accepted |
| [0005](0005-shared-contract-package.md) | `@escape-room/shared` as the single interface contract | Accepted |
| [0006](0006-server-authoritative-puzzles.md) | Server-authoritative puzzle validation | Accepted |
| [0007](0007-room-registry-and-ownership.md) | Room plugin registry and ownership per sub-team | Accepted |
| [0008](0008-session-persistence.md) | Session persistence — deliberately deferred | Superseded by 0018 |
| [0009](0009-containerization.md) | Containerization with multi-stage Docker and compose | Accepted |
| [0010](0010-git-workflow.md) | Git workflow: branches, pull requests, ADR per change | Accepted |
| [0011](0011-decision-authority.md) | The user decides, the agent does not | Accepted |
| [0012](0012-aws-hosting.md) | Host on AWS: CloudFront + S3 + App Runner per environment | Accepted |
| [0013](0013-terraform.md) | Terraform, with state in S3 and DynamoDB locking | Accepted |
| [0014](0014-two-environments.md) | Two environments: cool.tf from main, dev.cool.tf from dev | Accepted |
| [0015](0015-github-oidc-deploys.md) | GitHub Actions deploys via OIDC, no stored AWS credentials | Accepted |
| [0016](0016-branch-policy.md) | PRs target dev; main accepts them only from dev | Accepted |
| [0017](0017-authentication-clerk.md) | Authentication with Clerk | Accepted |
| [0018](0018-dynamodb-persistence.md) | Store game progress in DynamoDB | Accepted |
| [0019](0019-games-belong-to-accounts.md) | A game belongs to an account; the session header goes away | Accepted |
| [0020](0020-activity-log.md) | Record an activity log against each account | Accepted |
