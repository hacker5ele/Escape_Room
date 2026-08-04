terraform {
  required_version = ">= 1.5.0"
  required_providers {
    aws    = { source = "hashicorp/aws", version = "~> 5.0" }
    random = { source = "hashicorp/random", version = "~> 3.6" }
  }
}

locals {
  prefix = "escape-room-${var.name}"

  # See the comment on the instance-role policy: the ARN is constructed rather
  # than looked up so that a live Clerk key never enters Terraform state.
  clerk_secret_key_arn = "arn:aws:ssm:us-east-1:${data.aws_caller_identity.current.account_id}:parameter/escape-room-secrets/${var.name}/clerk-secret-key"
}

data "aws_caller_identity" "current" {}

# --------------------------------------------------------------------------
# Game progress. One item per player, keyed on the Clerk user id.
# --------------------------------------------------------------------------

# Chosen over Postgres because the access pattern is a single key lookup, and
# because the container reaches it with the IAM instance role — no VPC
# connector, and no database password to keep out of a public repository.
# See ADR-0018.
resource "aws_dynamodb_table" "games" {
  name         = "${local.prefix}-games"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "userId"

  attribute {
    name = "userId"
    type = "S"
  }

  point_in_time_recovery {
    # Off deliberately: this is puzzle progress for a class demo, and PITR
    # would be a continuous cost for data that is cheap to lose.
    enabled = false
  }

  tags = var.tags
}

# --------------------------------------------------------------------------
# Player profiles. A cache of what Clerk knows, so the app can look somebody up
# by username and render their avatar without a network call per face.
# --------------------------------------------------------------------------

resource "aws_dynamodb_table" "profiles" {
  name         = "${local.prefix}-profiles"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "userId"

  attribute {
    name = "userId"
    type = "S"
  }

  attribute {
    name = "usernameLower"
    type = "S"
  }

  # Adding a friend by username needs username → userId, and Clerk is not a
  # database we can index. Lower-cased so lookups are case-insensitive.
  #
  # Projects ALL because every read of this index wants the whole profile —
  # the avatar and display name — so KEYS_ONLY would just force a second
  # GetItem on every lookup.
  global_secondary_index {
    name            = "by-username"
    hash_key        = "usernameLower"
    projection_type = "ALL"
  }

  point_in_time_recovery {
    enabled = false
  }

  tags = var.tags
}

# --------------------------------------------------------------------------
# The social graph. See ADR-0024.
# --------------------------------------------------------------------------

# Both directions of every friendship are stored: (A,B) and (B,A), written
# together in a transaction. That makes "list my friends" a single Query
# instead of a query plus a scan of the reverse direction, and it means a
# crash can never leave a one-sided friendship behind.
resource "aws_dynamodb_table" "friendships" {
  name         = "${local.prefix}-friendships"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "userId"
  range_key    = "otherUserId"

  attribute {
    name = "userId"
    type = "S"
  }

  attribute {
    name = "otherUserId"
    type = "S"
  }

  point_in_time_recovery {
    enabled = false
  }

  tags = var.tags
}

# Invite links. The token is the key, so following a link is a single GetItem.
resource "aws_dynamodb_table" "invites" {
  name         = "${local.prefix}-invites"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "token"

  attribute {
    name = "token"
    type = "S"
  }

  attribute {
    name = "inviterUserId"
    type = "S"
  }

  # "Show me my own links, so I can share or revoke them."
  global_secondary_index {
    name            = "by-inviter"
    hash_key        = "inviterUserId"
    projection_type = "ALL"
  }

  # Housekeeping only. TTL deletion is best-effort and can lag by hours, so
  # expiry is enforced in the service on every read; this just stops the table
  # growing forever.
  ttl {
    attribute_name = "expiresAtEpoch"
    enabled        = true
  }

  point_in_time_recovery {
    enabled = false
  }

  tags = var.tags
}

# --------------------------------------------------------------------------
# Frontend: private S3 bucket, reachable only through CloudFront
# --------------------------------------------------------------------------

resource "aws_s3_bucket" "site" {
  bucket = "${local.prefix}-site"
  tags   = var.tags

  # `terraform destroy` refuses to remove a bucket that still has objects in it,
  # and versioning below means even deleted objects leave versions behind. The
  # project is meant to be removable in one command when the week is over, and
  # the contents are a rebuildable static site — nothing here is worth keeping.
  force_destroy = true
}

resource "aws_s3_bucket_public_access_block" "site" {
  bucket                  = aws_s3_bucket.site.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_versioning" "site" {
  bucket = aws_s3_bucket.site.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "site" {
  bucket = aws_s3_bucket.site.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# Versioning plus `s3 sync --delete` on every deploy means each replaced asset
# leaves a noncurrent version behind, and each deleted one leaves a delete
# marker — all billed, forever. Versioning is worth keeping as a rollback path;
# a week of history is plenty for a static site rebuildable from a commit.
resource "aws_s3_bucket_lifecycle_configuration" "site" {
  bucket = aws_s3_bucket.site.id

  rule {
    id     = "expire-old-versions"
    status = "Enabled"

    filter {}

    noncurrent_version_expiration {
      noncurrent_days = 7
    }

    expiration {
      expired_object_delete_marker = true
    }

    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }
}

# Origin Access Control is the current way to let only CloudFront read the
# bucket. It requires the S3 REST endpoint, which is why the SPA fallback below
# is done with CloudFront error responses rather than S3 website hosting.
resource "aws_cloudfront_origin_access_control" "site" {
  name                              = "${local.prefix}-oac"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

data "aws_iam_policy_document" "site_bucket" {
  statement {
    sid       = "AllowCloudFrontRead"
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.site.arn}/*"]
    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.main.arn]
    }
  }
}

resource "aws_s3_bucket_policy" "site" {
  bucket = aws_s3_bucket.site.id
  policy = data.aws_iam_policy_document.site_bucket.json
}

# --------------------------------------------------------------------------
# Backend: App Runner, pinned to exactly one instance
# --------------------------------------------------------------------------

# Sessions live in memory (ADR-0008). More than one instance means a request
# can land on a container that has never heard of the session, so the game
# breaks at random. min = max = 1 until there is a shared session store.
#
# The same constraint has a second edge: with exactly one instance, every
# deployment — and any change to the settings below, which triggers one — drops
# all games in progress. Do not deploy during the demo.
resource "aws_apprunner_auto_scaling_configuration_version" "single" {
  auto_scaling_configuration_name = "${local.prefix}-single"
  min_size                        = 1
  max_size                        = 1
  max_concurrency                 = 100
  tags                            = var.tags

  # Every argument here forces replacement, and App Runner refuses to delete a
  # configuration that a service still references. Without create_before_destroy
  # the first edit to any of the values above fails mid-apply, with the service
  # still bound to the old version. Reusing the name is fine — App Runner
  # creates a new revision, the service moves to it, then the old one goes.
  lifecycle {
    create_before_destroy = true
  }
}

data "aws_iam_policy_document" "apprunner_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["build.apprunner.amazonaws.com"]
    }
    # Without this, any App Runner service in any account that the service
    # principal can act for could assume this role. Scope it to us.
    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [data.aws_caller_identity.current.account_id]
    }
  }
}

resource "aws_iam_role" "apprunner_ecr_access" {
  name               = "${local.prefix}-apprunner-ecr"
  assume_role_policy = data.aws_iam_policy_document.apprunner_assume.json
  tags               = var.tags
}

# Deliberately NOT the AWS managed AWSAppRunnerServicePolicyForECRAccess.
# That policy grants its ECR read actions on `Resource: "*"`, which in this
# account means every image belonging to the unrelated production workloads —
# not just ours. This grants the same actions against one repository.
data "aws_iam_policy_document" "apprunner_ecr_access" {
  statement {
    sid    = "GetAuthToken"
    effect = "Allow"
    # The only ECR action that genuinely does not support resource-level
    # permissions.
    actions   = ["ecr:GetAuthorizationToken"]
    resources = ["*"]
  }

  statement {
    sid    = "PullProjectImageOnly"
    effect = "Allow"
    actions = [
      "ecr:GetDownloadUrlForLayer",
      "ecr:BatchGetImage",
      "ecr:BatchCheckLayerAvailability",
      "ecr:DescribeImages",
    ]
    resources = [var.ecr_repository_arn]
  }
}

resource "aws_iam_role_policy" "apprunner_ecr_access" {
  name   = "${local.prefix}-apprunner-ecr"
  role   = aws_iam_role.apprunner_ecr_access.name
  policy = data.aws_iam_policy_document.apprunner_ecr_access.json
}

# Shared secret CloudFront sends on every origin request. The App Runner URL is
# public, so without this the API can be hit directly, skipping the CDN. The
# backend rejects requests that lack it — except /api/health, which App Runner
# itself calls directly and which therefore never carries the header.
resource "random_password" "origin_secret" {
  length  = 48
  special = false
}

# The secret is handed to the container as a *reference*, not as a plain
# runtime environment variable.
#
# apprunner:DescribeService returns RuntimeEnvironmentVariables in clear text,
# and the deploy role calls DescribeService on every run in its wait loop. A
# plain variable would therefore put this secret one API call away from any
# Actions run — defeating the point of keeping the deploy role out of Terraform
# state in the first place. With a secret reference, DescribeService returns
# this ARN and nothing else.
#
# Note the path: NOT under /escape-room/<env>/, because the deploy role holds
# ssm:GetParameter on that entire prefix for the resource lookups.
resource "aws_ssm_parameter" "origin_secret" {
  name  = "/escape-room-secrets/${var.name}/origin-secret"
  type  = "SecureString"
  value = random_password.origin_secret.result
  tags  = var.tags
}

data "aws_iam_policy_document" "apprunner_instance_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["tasks.apprunner.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [data.aws_caller_identity.current.account_id]
    }
  }
}

# The role the running container itself uses — distinct from the ECR pull role,
# which App Runner only uses at image-fetch time.
resource "aws_iam_role" "apprunner_instance" {
  name               = "${local.prefix}-apprunner-instance"
  assume_role_policy = data.aws_iam_policy_document.apprunner_instance_assume.json
  tags               = var.tags
}

data "aws_iam_policy_document" "apprunner_instance" {
  statement {
    sid     = "ReadOwnSecrets"
    effect  = "Allow"
    actions = ["ssm:GetParameter", "ssm:GetParameters"]
    resources = [
      aws_ssm_parameter.origin_secret.arn,
      # Clerk's secret key. Deliberately not a Terraform-managed resource and
      # not read through a data source — either would put a live API key into
      # the state file. It is created out of band with `aws ssm put-parameter`
      # and referenced by ARN only, so Terraform never sees the value.
      local.clerk_secret_key_arn,
    ]
  }

  statement {
    sid    = "ReadWriteGameData"
    effect = "Allow"
    actions = [
      "dynamodb:GetItem",
      "dynamodb:PutItem",
      "dynamodb:UpdateItem",
      "dynamodb:DeleteItem",
      # Query was missing entirely. The game table never needed it — one item
      # per player, fetched by key — but every social table is queried, and the
      # profile lookup queries a secondary index.
      "dynamodb:Query",
      "dynamodb:BatchGetItem",
    ]
    resources = [
      aws_dynamodb_table.games.arn,
      aws_dynamodb_table.profiles.arn,
      aws_dynamodb_table.friendships.arn,
      aws_dynamodb_table.invites.arn,
      # Querying a GSI requires the index ARN as well as the table's; granting
      # only the table is the usual way this fails at runtime rather than plan
      # time.
      "${aws_dynamodb_table.profiles.arn}/index/*",
      "${aws_dynamodb_table.invites.arn}/index/*",
    ]
  }

  statement {
    sid    = "DecryptThroughSsmOnly"
    effect = "Allow"
    # SecureString uses the account's aws/ssm key, whose ARN is not worth
    # pinning; the ViaService condition is what constrains this — the role can
    # only decrypt as part of an SSM call, not against arbitrary ciphertext.
    actions   = ["kms:Decrypt"]
    resources = ["*"]
    condition {
      test     = "StringEquals"
      variable = "kms:ViaService"
      values   = ["ssm.us-east-1.amazonaws.com"]
    }
  }
}

resource "aws_iam_role_policy" "apprunner_instance" {
  name   = "${local.prefix}-apprunner-instance"
  role   = aws_iam_role.apprunner_instance.name
  policy = data.aws_iam_policy_document.apprunner_instance.json
}

resource "aws_apprunner_service" "api" {
  service_name = local.prefix

  source_configuration {
    # Terraform owns the service definition; the pipeline ships new images by
    # pushing the tag and calling start-deployment. Auto-deploy off keeps the
    # two from fighting over who triggers a rollout.
    auto_deployments_enabled = false

    authentication_configuration {
      access_role_arn = aws_iam_role.apprunner_ecr_access.arn
    }

    image_repository {
      image_identifier      = "${var.ecr_repository_url}:${var.image_tag}"
      image_repository_type = "ECR"

      image_configuration {
        port = "3000"
        runtime_environment_variables = {
          NODE_ENV           = "production"
          PORT               = "3000"
          TRUST_PROXY        = tostring(var.trust_proxy)
          ATTEMPT_RATE_LIMIT = tostring(var.attempt_rate_limit)
          CORS_ORIGIN        = "https://${var.domain_name}"
          # Presence of this selects the DynamoDB repository over the in-memory
          # one, so a local run without AWS credentials still works.
          GAMES_TABLE_NAME       = aws_dynamodb_table.games.name
          PROFILES_TABLE_NAME    = aws_dynamodb_table.profiles.name
          FRIENDSHIPS_TABLE_NAME = aws_dynamodb_table.friendships.name
          INVITES_TABLE_NAME     = aws_dynamodb_table.invites.name
          AWS_REGION             = "us-east-1"
          # The backend needs this too, not just the browser — see the variable.
          CLERK_PUBLISHABLE_KEY = var.clerk_publishable_key
        }
        # Resolved by App Runner at start-up from SSM. DescribeService shows
        # only the ARN, never the value.
        runtime_environment_secrets = {
          ORIGIN_SECRET    = aws_ssm_parameter.origin_secret.arn
          CLERK_SECRET_KEY = local.clerk_secret_key_arn
        }
      }
    }
  }

  instance_configuration {
    cpu               = "0.25 vCPU"
    memory            = "0.5 GB"
    instance_role_arn = aws_iam_role.apprunner_instance.arn
  }

  health_check_configuration {
    protocol            = "HTTP"
    path                = "/api/health"
    interval            = 10
    timeout             = 5
    healthy_threshold   = 1
    unhealthy_threshold = 5
  }

  auto_scaling_configuration_arn = aws_apprunner_auto_scaling_configuration_version.single.arn
  tags                           = var.tags

  # No ignore_changes on image_identifier. It looks prudent but does nothing:
  # the configured value is a moving tag, so it is byte-identical on every plan
  # and there is no drift to suppress. What it would actually do is silently
  # swallow a genuine edit to var.image_tag or var.ecr_repository_url.
}

# --------------------------------------------------------------------------
# CloudFront: one distribution, two origins, so the browser sees one origin
# --------------------------------------------------------------------------

# SPA fallback, done as a viewer-request function rather than with
# custom_error_response.
#
# This matters more than it looks. CustomErrorResponses is a DISTRIBUTION-level
# setting in the CloudFront API — it cannot be scoped to one cache behavior. A
# 403/404 -> /index.html rule would therefore also rewrite the API's own error
# responses, and `GET /api/rooms/room-02` on a locked room would come back as
# HTML with status 200 instead of 403 ROOM_LOCKED. The room gate would look
# open to every client.
#
# A CloudFront Function attaches to a single behavior, so the rewrite applies to
# the site only and API errors pass through untouched.
resource "aws_cloudfront_function" "spa_fallback" {
  name    = "${local.prefix}-spa-fallback"
  runtime = "cloudfront-js-2.0"
  comment = "Rewrite extensionless paths to /index.html so deep links work"
  publish = true

  code = <<-JS
    function handler(event) {
      var request = event.request;
      // Anything with a file extension is a real asset — leave it alone so a
      // missing bundle still 404s instead of silently returning the app shell.
      if (request.uri.indexOf('.') !== -1) {
        return request;
      }
      request.uri = '/index.html';
      return request;
    }
  JS
}

data "aws_cloudfront_cache_policy" "caching_optimized" {
  name = "Managed-CachingOptimized"
}

data "aws_cloudfront_cache_policy" "caching_disabled" {
  name = "Managed-CachingDisabled"
}

# Forwards every viewer header except Host. This is what carries the custom
# X-Session-Id header through to the API — a policy that strips it turns every
# authenticated call into a 400.
data "aws_cloudfront_origin_request_policy" "all_viewer_except_host" {
  name = "Managed-AllViewerExceptHostHeader"
}

resource "aws_cloudfront_distribution" "main" {
  enabled             = true
  is_ipv6_enabled     = true
  comment             = "Escape Room — ${var.name}"
  default_root_object = "index.html"
  aliases             = [var.domain_name]
  price_class         = "PriceClass_100"
  tags                = var.tags

  origin {
    origin_id                = "s3-site"
    domain_name              = aws_s3_bucket.site.bucket_regional_domain_name
    origin_access_control_id = aws_cloudfront_origin_access_control.site.id
  }

  origin {
    origin_id   = "apprunner-api"
    domain_name = aws_apprunner_service.api.service_url

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "https-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }

    custom_header {
      name  = "x-origin-secret"
      value = random_password.origin_secret.result
    }
  }

  default_cache_behavior {
    target_origin_id       = "s3-site"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    cache_policy_id        = data.aws_cloudfront_cache_policy.caching_optimized.id
    compress               = true

    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.spa_fallback.arn
    }
  }

  ordered_cache_behavior {
    path_pattern           = "/api/*"
    target_origin_id       = "apprunner-api"
    viewer_protocol_policy = "redirect-to-https"

    # All methods, not just GET/HEAD. Without DELETE/POST/PUT in this list
    # CloudFront rejects POST /api/sessions with a 403 before it ever reaches
    # the origin, and the game cannot start.
    allowed_methods = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods  = ["GET", "HEAD"]

    cache_policy_id          = data.aws_cloudfront_cache_policy.caching_disabled.id
    origin_request_policy_id = data.aws_cloudfront_origin_request_policy.all_viewer_except_host.id

    # No `compress` here. CloudFront only compresses when the *cache policy*
    # enables gzip/brotli, and Managed-CachingDisabled has both off — setting
    # compress = true on the behavior would look like it did something while
    # changing nothing. API responses are a few hundred bytes anyway.
  }

  # `/api/*` does not match the path `/api` exactly, so without this behavior a
  # request to /api falls through to the SPA and returns index.html with a 200.
  # Sending it to the API instead means it gets the JSON 404 it deserves.
  ordered_cache_behavior {
    path_pattern           = "/api"
    target_origin_id       = "apprunner-api"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods         = ["GET", "HEAD"]

    cache_policy_id          = data.aws_cloudfront_cache_policy.caching_disabled.id
    origin_request_policy_id = data.aws_cloudfront_origin_request_policy.all_viewer_except_host.id
  }

  # Deliberately no custom_error_response blocks — see the comment on
  # aws_cloudfront_function.spa_fallback above. They are distribution-wide and
  # would rewrite the API's error responses too.

  viewer_certificate {
    acm_certificate_arn      = var.certificate_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }
}

# --------------------------------------------------------------------------
# DNS
# --------------------------------------------------------------------------

resource "aws_route53_record" "a" {
  zone_id = var.zone_id
  name    = var.domain_name
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.main.domain_name
    zone_id                = aws_cloudfront_distribution.main.hosted_zone_id
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "aaaa" {
  zone_id = var.zone_id
  name    = var.domain_name
  type    = "AAAA"

  alias {
    name                   = aws_cloudfront_distribution.main.domain_name
    zone_id                = aws_cloudfront_distribution.main.hosted_zone_id
    evaluate_target_health = false
  }
}

# --------------------------------------------------------------------------
# Deploy permissions for this environment, attached to the shared OIDC role
# --------------------------------------------------------------------------

# Written per environment rather than in the shared stack so each grant names
# concrete ARNs. The alternative — wildcards in the shared stack — would give
# the pipeline reach over unrelated resources in this account.
# The pipeline needs to know this environment's bucket, distribution and
# service. Publishing them as SSM parameters avoids two bad alternatives:
# hardcoding a generated CloudFront id in a workflow file, and letting the
# deploy role read the Terraform state — which also holds the origin secret.
resource "aws_ssm_parameter" "outputs" {
  for_each = {
    site_bucket           = aws_s3_bucket.site.id
    distribution_id       = aws_cloudfront_distribution.main.id
    apprunner_service_arn = aws_apprunner_service.api.arn
    apprunner_url         = "https://${aws_apprunner_service.api.service_url}"
    url                   = "https://${var.domain_name}"
    games_table           = aws_dynamodb_table.games.name
  }

  name  = "/escape-room/${var.name}/${each.key}"
  type  = "String"
  value = each.value
  tags  = var.tags
}

data "aws_iam_policy_document" "deploy" {
  statement {
    sid    = "ReadThisEnvironmentsParameters"
    effect = "Allow"
    actions = [
      "ssm:GetParameter",
      "ssm:GetParameters",
      "ssm:GetParametersByPath",
    ]
    resources = [
      "arn:aws:ssm:us-east-1:${data.aws_caller_identity.current.account_id}:parameter/escape-room/${var.name}/*",
    ]
  }

  statement {
    sid    = "SyncSiteBucket"
    effect = "Allow"
    actions = [
      "s3:ListBucket",
      "s3:GetObject",
      "s3:PutObject",
      "s3:DeleteObject",
    ]
    resources = [
      aws_s3_bucket.site.arn,
      "${aws_s3_bucket.site.arn}/*",
    ]
  }

  statement {
    sid       = "InvalidateThisDistributionOnly"
    effect    = "Allow"
    actions   = ["cloudfront:CreateInvalidation", "cloudfront:GetInvalidation"]
    resources = [aws_cloudfront_distribution.main.arn]
  }

  statement {
    sid    = "DeployThisServiceOnly"
    effect = "Allow"
    actions = [
      "apprunner:StartDeployment",
      "apprunner:DescribeService",
      "apprunner:ListOperations",
    ]
    resources = [aws_apprunner_service.api.arn]
  }
}

resource "aws_iam_role_policy" "deploy" {
  name   = "${local.prefix}-deploy"
  role   = var.deploy_role_name
  policy = data.aws_iam_policy_document.deploy.json
}
