# Infrastructure

Terraform for the AWS deployment. Read [ADR-0012](../docs/adr/0012-aws-hosting.md) for why it looks
like this and [ADR-0013](../docs/adr/0013-terraform.md) for why it is Terraform.

```
bootstrap.sh            state bucket + lock table — run once per account, by hand
modules/environment/    one full environment: S3, CloudFront, App Runner, DNS, deploy grants
live/shared/            hosted zone, wildcard certificate, ECR, deploy role, budget
live/staging/           dev.cool.tf
live/prod/              cool.tf
```

## What is where

`shared` holds the things both environments reuse — the Route 53 zone, one wildcard certificate, one
ECR repository, and the `escape-room-deploy` role GitHub Actions assumes. `staging` and `prod` are the
same module with different inputs, so they cannot drift apart.

Each environment publishes its bucket name, distribution id and service ARN as **SSM parameters** under
`/escape-room/<env>/`. That is how the deploy workflow finds them without hardcoding a generated
CloudFront id, and without the deploy role needing to read Terraform state — state contains the
CloudFront origin secret.

## Credentials

The AWS CLI on this machine authenticates with `aws login`, and the `default` profile's
`credential_process` points at a profile whose session expires. Terraform shells out to that process
and fails with `no valid credential sources`. Export working credentials into the environment first:

```bash
eval "$(aws configure export-credentials --format env)"
```

Run that in any shell before a `terraform` command. If it errors, run `aws login` and try again.

## First-time setup

Order matters. The certificate cannot be issued before DNS is delegated, and App Runner cannot start
before an image exists.

```bash
# 1. State backend. Once per AWS account.
./infra/bootstrap.sh

# 2. Create the hosted zone and read its nameservers.
cd infra/live/shared
eval "$(aws configure export-credentials --format env)"
terraform init
terraform apply -target=aws_route53_zone.main
terraform output name_servers
```

**3. Delegate the domain.** Paste those four nameservers into Hostinger as `cool.tf`'s nameservers,
replacing the `dns-parking.com` ones. This is the step everything else waits on — it can take minutes
or hours. Check with:

```bash
dig +short NS cool.tf @8.8.8.8     # should return the awsdns names
```

```bash
# 4. The rest of shared. The certificate validates automatically once delegation is live;
#    if this hangs, DNS has not propagated yet.
terraform apply

# 5. App Runner needs an image before the service can be created.
#    --platform linux/amd64 is not optional on an Apple Silicon Mac: App Runner
#    runs x86_64, and an arm64 image is accepted by ECR and then fails to start
#    with an unhelpful health-check error. CI runners are already amd64.
ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
REGISTRY=$ACCOUNT.dkr.ecr.us-east-1.amazonaws.com
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin $REGISTRY
docker buildx build --platform linux/amd64 -f apps/backend/Dockerfile \
  -t $REGISTRY/escape-room-backend:staging \
  -t $REGISTRY/escape-room-backend:prod \
  --push .

# 6. The environments.
cd ../staging && terraform init && terraform apply
cd ../prod    && terraform init && terraform apply
```

## Everyday use

Terraform is only needed when infrastructure changes. Shipping code does not touch it — the pipeline
pushes an image and syncs the frontend, and App Runner keeps pulling the same moving tag
(`staging` / `prod`). The service's `image_identifier` is under `ignore_changes` so an apply cannot drag
the running version backwards.

CI runs `terraform fmt -check` and `terraform validate` on pull requests touching `infra/**`. It cannot
run `plan`, because the deploy role only trusts the `main` and `dev` branches and a pull request cannot
assume it — deliberate, since the repository is public. **Run `terraform plan` locally before opening a
pull request.**

## Verifying a deployment

```bash
npm run smoke -- https://dev.cool.tf
```

Plays the actual game against the live site: SPA fallback, POST through the CDN, the `X-Session-Id`
header surviving, the room lock, no answer leaking, and the rate limiter. See `scripts/smoke-test.mjs`.

## Tearing it down

Everything is tagged `Project=escape-room`. When the project week is over:

```bash
cd infra/live/prod    && terraform destroy
cd ../staging         && terraform destroy
cd ../shared          && terraform destroy
```

Then delete the state bucket and lock table by hand, and remove the delegation at Hostinger. Destroy
`shared` last — the environments depend on its outputs.

## Gotchas

**The certificate hangs on apply.** Nameservers are not delegated yet. `dig +short NS cool.tf @8.8.8.8`.

**App Runner will not start.** It needs an image at the tag it is configured to pull. Check the tag
exists in ECR, and check the image is **linux/amd64** — an arm64 image built on a Mac pulls fine and
then fails to run.

**App Runner ends in `CREATE_FAILED` and Terraform errors with `unexpected state 'CREATE_FAILED',
wanted target 'RUNNING'`.** This happened once on first apply while the identical image succeeded in
the other environment, so treat it as transient before hunting for a bug. Confirm the image is fine by
running it yourself with the same environment variables:

```bash
aws apprunner describe-service --service-arn "$ARN" \
  --query 'Service.SourceConfiguration.ImageRepository.ImageConfiguration.RuntimeEnvironmentVariables'
docker run --rm --platform linux/amd64 -e PORT=3000 -e NODE_ENV=production …  <image>
```

If it runs locally, recover like this — a `CREATE_FAILED` service still occupies the name, so it has to
go before Terraform can make a new one:

```bash
ARN=$(aws apprunner list-services --region us-east-1 \
  --query "ServiceSummaryList[?ServiceName=='escape-room-prod'].ServiceArn" --output text)
aws apprunner delete-service --service-arn "$ARN" --region us-east-1
# wait until it disappears from list-services, then:
terraform state rm module.environment.aws_apprunner_service.api
terraform apply
```

If it fails twice with the same image, it is not transient — read
`/aws/apprunner/<service>/<id>/service` in CloudWatch. No *application* log group at all means the
container never got far enough to write to stdout.

**A deploy works but the site does not change.** `index.html` is served with `no-cache` and everything
else is content-hashed, so this is almost always a missing CloudFront invalidation.

**`terraform apply` wants to change the App Runner image back.** It should not — `ignore_changes`
covers it. If it does, someone removed that lifecycle block.

**Adding a resource breaks the deploy.** The deploy role has no permission for anything not explicitly
granted in `modules/environment/main.tf`. Add the ARN there.
