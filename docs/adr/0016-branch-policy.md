# ADR-0016: Pull requests target dev; main accepts them only from dev

- **Status:** Accepted
- **Date:** 2026-08-03
- **Deciders:** Nepomuk Crhonek
- **Approved-by:** Nepomuk Crhonek, 2026-08-03

## Context

[ADR-0010](0010-git-workflow.md) established feature branches and pull requests, as the assignment
requires. Now that `main` deploys straight to `cool.tf` ([ADR-0014](0014-two-environments.md)), where a
pull request points has consequences: a branch merged into `main` goes live without ever having been
seen on staging.

With four people opening pull requests during a five-day week, "please remember to target dev" is not a
control. Someone will click the default, and GitHub's default base branch is whatever the repository
default is.

## Decision

Work flows one way: **feature branch → `dev` → `main`.**

- Feature branches open pull requests against **`dev`**.
- **`main` accepts pull requests only from `dev`.** Nothing else may merge into it.
- Merging `dev` into `main` is the release action, and deploys production.

GitHub rulesets can require a pull request, an approval and passing checks, but they have **no
condition on the source branch** — there is no ruleset that expresses "only from dev". So the rule is
enforced by a workflow: `branch-policy.yml` runs on every pull request targeting `main`, fails unless
`github.head_ref == 'dev'`, and is configured as a **required status check**.

Because it is enforced by a required check, the job name matters. Renaming the job
`Only dev may open PRs into main` silently disables the rule — the check would never report and the
ruleset would either block everything or be edited away in frustration. The workflow file says so.

## Consequences

- Everything reaching production has been on staging first and passed a live smoke test there.
- A hotfix cannot go straight to `main`. It goes to `dev`, gets deployed and verified on
  `dev.cool.tf`, and then rides a `dev → main` pull request. On Thursday afternoon with a broken demo
  that will feel slow — it is also what stops an untested fix becoming the thing we present.
- The rule lives in two places that must agree: the workflow that reports the check, and the ruleset
  that requires it. Neither works alone. The ruleset settings are written down in `CLAUDE.md` so they
  can be restored if someone edits them.
- Applying the ruleset needs repository **admin**, which currently only Eleonora has. Until she applies
  it, the check runs and reports but does not block, so the rule is advisory rather than enforced.

## Alternatives considered

**Make `dev` the default branch and rely on the default.** Helps — a new pull request would default to
`dev` — but it is a nudge, not a rule, and anyone can still change the base. Worth doing as well as
this, not instead of it.

**Allow any branch into `main` but require review.** Simpler, and no workflow needed. Rejected because
review catches bad code far more reliably than it catches "this was never deployed anywhere".

**Drop `main` and deploy production from `dev`.** One less branch and one less merge. Rejected: there
would then be no branch that reliably describes what is live during the demo.
