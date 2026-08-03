# ADR-0010: Git workflow — branches, pull requests, one ADR per change

- **Status:** Accepted
- **Date:** 2026-08-03
- **Deciders:** Nepomuk Crhonek, Abigail Romero, Eleonora Vynogradova, Inaam Ahmed
- **Approved-by:** Nepomuk Crhonek, 2026-08-03

## Context

The assignment is explicit: *"Feature-Branches und Pull Requests Pflicht. Direct Pushes auf den
main-Branch sind verboten!"* On top of that, this team has decided that architectural decisions must be
written down and approved by Nepomuk before they are built.

A rule that lives only in a document gets forgotten by Wednesday afternoon when something is broken and
the demo is on Friday. Where possible, the rules should be enforced by the tooling instead.

## Decision

**Branches.** `main` is always releasable. Work happens on `feat/…`, `fix/…`, `docs/…`, `chore/…`,
`test/…` or `refactor/…` branches, named after what they do: `feat/room-02-cipher-puzzle`.

**Pull requests.** Every change reaches `main` through a pull request with at least one approving
review. The PR template requires the author to name the ADR the change implements.

**Commits.** Conventional Commits — `feat:`, `fix:`, `docs:`, `chore:`, `test:`, `refactor:`. The
subject line says what changed, not which tool wrote it.

**ADRs.** No commit without an ADR. Only Nepomuk sets an ADR to `Accepted`, and he records his name and
the date in `Approved-by`. `docs/adr/**` is assigned to him in `.github/CODEOWNERS`, so GitHub itself
requests his review on any pull request touching an ADR.

**Claude.** Claude may write files, install dependencies, build and test freely. It **stops before
`git push`** and waits for a person to state explicitly that the ADR is approved. Silence is not
approval, and neither is a merged pull request.

**CI.** GitHub Actions runs lint, typecheck, tests and a build on every pull request. A red pipeline
blocks the merge.

**Branch protection.** A ruleset on `main` enforces pull requests, one approving review, passing
checks, and no force pushes. This requires admin rights on the repository and must be enabled by the
repository owner.

**The one exception:** the very first commit. A branch cannot be protected before it exists, so the
initial scaffold goes to `main` directly. Branch protection is enabled immediately afterwards and the
rule applies to everything from the second commit onward.

## Consequences

- Nobody can quietly rewrite `main` the evening before the demo.
- Every architectural change has a written rationale that someone other than its author agreed to. In
  six months the repository still explains itself.
- CODEOWNERS turns "Nepomuk approves the ADRs" from a convention into a merge requirement.
- The cost is real: pull requests slow things down, and on Thursday, with a bug and an hour left,
  waiting for a review is genuinely annoying. That friction is the assignment's point, and it is also
  what stops one panicked fix from breaking a demo. Fast-track a hotfix with a quick review — do not
  bypass the process.
- If nobody is available to review, the work waits. Agree in the daily stand-up who is on review duty.

## Alternatives considered

**Trunk-based development, everyone pushes to `main`.** Fastest for a small trusted team and no merge
overhead. Not available to us — the assignment forbids it explicitly.

**Squash-merge only, no ADR requirement.** Tidier history and less writing. Rejected: the ADR trail is
a deliverable of this project week, not overhead on top of it.
