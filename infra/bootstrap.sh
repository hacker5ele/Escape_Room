#!/usr/bin/env bash
# Creates the Terraform state backend. Run once per AWS account, by hand.
#
# This cannot live in Terraform itself: the S3 backend has to exist before
# `terraform init` can use it. The script is idempotent, so re-running it is
# safe and it doubles as documentation of what the backend actually is.
#
#   ./infra/bootstrap.sh
set -euo pipefail

REGION="us-east-1"
BUCKET="escape-room-tfstate-${REGION}"
LOCK_TABLE="escape-room-tfstate-lock"

# The whole premise here is a personal AWS account shared with unrelated
# production workloads, so a stale AWS_PROFILE pointing somewhere else is a
# realistic mistake — and one that would silently create state in the wrong
# account. Assert rather than print.
EXPECTED_ACCOUNT="445849136002"
ACTUAL_ACCOUNT="$(aws sts get-caller-identity --query Account --output text)"

if [ "$ACTUAL_ACCOUNT" != "$EXPECTED_ACCOUNT" ]; then
  echo "Refusing to run: expected AWS account $EXPECTED_ACCOUNT, got $ACTUAL_ACCOUNT." >&2
  echo "Check AWS_PROFILE, or update EXPECTED_ACCOUNT if the project genuinely moved." >&2
  exit 1
fi

echo "Account: $ACTUAL_ACCOUNT"

if aws s3api head-bucket --bucket "$BUCKET" 2>/dev/null; then
  echo "State bucket $BUCKET already exists."
else
  echo "Creating state bucket $BUCKET…"
  aws s3api create-bucket --bucket "$BUCKET" --region "$REGION" >/dev/null
fi

# Versioning matters more than it looks: it is the only way back from a
# corrupted or accidentally truncated state file.
aws s3api put-bucket-versioning --bucket "$BUCKET" \
  --versioning-configuration Status=Enabled

aws s3api put-public-access-block --bucket "$BUCKET" \
  --public-access-block-configuration \
  BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true

aws s3api put-bucket-encryption --bucket "$BUCKET" \
  --server-side-encryption-configuration \
  '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'

# State locking. Terraform 1.10+ can lock with a plain S3 object, but the
# version installed here is 1.5.7, which needs a DynamoDB table.
if aws dynamodb describe-table --table-name "$LOCK_TABLE" --region "$REGION" >/dev/null 2>&1; then
  echo "Lock table $LOCK_TABLE already exists."
else
  echo "Creating lock table $LOCK_TABLE…"
  aws dynamodb create-table \
    --table-name "$LOCK_TABLE" \
    --attribute-definitions AttributeName=LockID,AttributeType=S \
    --key-schema AttributeName=LockID,KeyType=HASH \
    --billing-mode PAY_PER_REQUEST \
    --region "$REGION" >/dev/null
  aws dynamodb wait table-exists --table-name "$LOCK_TABLE" --region "$REGION"
fi

echo
echo "Backend ready:"
echo "  bucket = $BUCKET"
echo "  table  = $LOCK_TABLE"
echo
echo "Next: cd infra/live/shared && terraform init"
