# ADR-0015: GitHub Actions deploys through OIDC, with no stored AWS credentials

- **Status:** Accepted
- **Date:** 2026-08-03
- **Deciders:** Nepomuk Crhonek
- **Approved-by:** Nepomuk Crhonek, 2026-08-03

## Context

The pipeline has to push container images, write to S3, invalidate CloudFront and trigger App Runner
deployments — in an AWS account that also holds unrelated production workloads. And it has to do that
from a **public** repository, where anyone can fork, open a pull request, and propose a workflow change.

The usual approach, an access key pasted into repository secrets, is a poor fit twice over. Long-lived
keys in a repository are the single most common source of leaked AWS credentials. And practically,
nobody on this team has admin rights on the repository, so we cannot create repository secrets at all.

## Decision

GitHub Actions authenticates to AWS through **OpenID Connect**. No AWS credentials exist in GitHub.

The account already had a `token.actions.githubusercontent.com` OIDC provider, so this adds one role,
`escape-room-deploy`, following the account's existing `<project>-deploy` naming.

The trust policy names **exact branch refs**, in both of the subject forms GitHub can issue:

```
repo:hacker5ele/Escape_Room:ref:refs/heads/main
repo:hacker5ele/Escape_Room:ref:refs/heads/dev
repo:hacker5ele@180300197/Escape_Room@1321465032:ref:refs/heads/main
repo:hacker5ele@180300197/Escape_Room@1321465032:ref:refs/heads/dev
```

The second pair is the *immutable* form, with numeric owner and repository ids. This repository issues
that form, which is why the first deploy failed with `Not authorized to perform
sts:AssumeRoleWithWebIdentity` against a policy that looked correct. Check which form applies with
`gh api repos/OWNER/REPO/actions/oidc/customization/sub`. Listing both means flipping that setting
does not silently break deploys — and the immutable form is the better of the two, since it survives a
rename and cannot be re-pointed by someone who later claims a freed-up repository name.

Never `repo:hacker5ele/Escape_Room:*`. A pull request run receives a different subject
(`…:pull_request`), so a fork PR cannot assume the role no matter what its workflow file says. The
deploy workflow additionally triggers on `push` only, so the opportunity is not even offered.

Permissions are per-resource, not per-service. The registry grant names the one ECR repository; each
environment's Terraform attaches a policy naming that environment's bucket, distribution and service.
Nothing is account-wide except `ecr:GetAuthorizationToken`, which AWS does not support scoping.

The role ARN is written directly in the workflow file. An ARN is not a secret — the trust policy is
what protects it — and this keeps the pipeline working without any repository-level configuration.

The deploy role is deliberately **not** allowed to read the Terraform state bucket, because state holds
the CloudFront origin secret. Resource ids reach the workflow through SSM parameters that Terraform
publishes, which contain nothing sensitive.

## Consequences

- There is no AWS credential in GitHub to leak, rotate, or forget about after the project week.
- Credentials are minted per run and expire in an hour.
- The blast radius of a compromised workflow is this project's own resources. It cannot reach the EKS
  cluster, the other Route 53 zones, or the other 40 buckets in the account.
- **`terraform apply` cannot run in CI**, because pull requests cannot assume the role and we are not
  loosening the trust policy to allow it. Infrastructure changes are applied locally; CI only formats
  and validates. See [ADR-0013](0013-terraform.md).
- Adding a third deploy branch means editing the trust policy in Terraform, not just the workflow. That
  is a feature — it is a deliberate, reviewable act.
- Anyone adding a workspace or a resource must remember the role has no permission for it by default,
  and the failure appears only at deploy time.

## Alternatives considered

**An IAM user with an access key in repository secrets.** The common approach, and impossible here in
any case since nobody has admin to create secrets. Also long-lived, hard to scope tightly, and easy to
leave behind after the project ends.

**A wildcard OIDC subject (`repo:owner/name:*`).** Simpler, and works for pull requests too. Rejected
outright: on a public repository that lets a stranger's fork PR assume a role in an account containing
production workloads.
