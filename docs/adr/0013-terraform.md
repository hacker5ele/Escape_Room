# ADR-0013: Define infrastructure in Terraform, with state in S3

- **Status:** Accepted
- **Date:** 2026-08-03
- **Deciders:** Nepomuk Crhonek
- **Approved-by:** Nepomuk Crhonek, 2026-08-03

## Context

The AWS setup in [ADR-0012](0012-aws-hosting.md) is a dozen resources per environment, times two
environments, in an account that already contains unrelated production workloads. Clicking it together
in the console would leave nobody able to say what belongs to this project, and no way to remove it
cleanly once the project is over.

That last point matters more than usual here: this is a personal account, and the project should be
deletable in one command when the week is over.

## Decision

**Terraform**, with state in S3 and locking in DynamoDB.

```
infra/
├── bootstrap.sh            state bucket + lock table, run once by hand
├── modules/environment/    one environment: S3, CloudFront, App Runner, DNS, deploy grants
└── live/
    ├── shared/             zone, wildcard certificate, ECR, deploy role, budget
    ├── staging/            → dev.cool.tf
    └── prod/               → cool.tf
```

Terraform rather than CDK or CLI scripts because this account already runs it — there is a
`butel-tf-state-staging` bucket and a `nomnom-tfstate-eu-central-2` — so the pattern and the naming
convention are established. It is also the more transferable skill for the team.

State locking goes through **DynamoDB rather than S3-native locking**, because the Terraform installed
here is 1.5.7 and native locking needs 1.10 or newer. CI pins the same version so formatting cannot
disagree between a laptop and a pipeline.

Environment stacks read `shared` through a `terraform_remote_state` data source, so the zone,
certificate and registry exist once and are reused.

## Consequences

- Every resource is tagged `Project=escape-room`, which is what makes the budget filter work and what
  makes `terraform destroy` a complete and trustworthy cleanup at the end of the week.
- Two environments are one module instantiated twice, so they cannot drift apart by accident.
- **Applying requires AWS credentials, so it happens locally, not in CI.** The deploy role's trust
  policy allows only the `main` and `dev` branches, which means a pull request cannot assume it — and
  since the repository is public, that restriction is deliberate and worth the inconvenience. CI runs
  `terraform fmt -check` and `terraform validate -backend=false`, which need no credentials.
- Apply order is not free-form: `shared` first, and the certificate cannot validate until the
  nameservers are delegated at Hostinger. `infra/README.md` spells this out because it is the step
  most likely to confuse someone applying it for the first time.
- The state file contains the CloudFront origin secret, so the deploy role is deliberately **not**
  given read access to the state bucket. Resource ids reach the pipeline through SSM parameters
  instead.

## Alternatives considered

**AWS CDK in TypeScript.** Same language as the rest of the monorepo, and CloudFormation manages state
so there is no state file to lose. Rejected because nothing else in this account uses it, so it would
be a second tool to learn during a five-day week.

**Plain AWS CLI scripts.** Fastest to write and nothing new to learn. Rejected on teardown: without
state there is no reliable way to find and remove exactly what we created, in an account full of things
we did not.
