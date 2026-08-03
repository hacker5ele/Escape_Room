terraform {
  required_version = ">= 1.5.0"
  required_providers {
    aws    = { source = "hashicorp/aws", version = "~> 5.0" }
    random = { source = "hashicorp/random", version = "~> 3.6" }
  }
}

locals {
  prefix = "escape-room-${var.name}"
}

data "aws_caller_identity" "current" {}

# --------------------------------------------------------------------------
# Frontend: private S3 bucket, reachable only through CloudFront
# --------------------------------------------------------------------------

resource "aws_s3_bucket" "site" {
  bucket = "${local.prefix}-site"
  tags   = var.tags
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
resource "aws_apprunner_auto_scaling_configuration_version" "single" {
  auto_scaling_configuration_name = "${local.prefix}-single"
  min_size                        = 1
  max_size                        = 1
  max_concurrency                 = 100
  tags                            = var.tags
}

data "aws_iam_policy_document" "apprunner_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["build.apprunner.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "apprunner_ecr_access" {
  name               = "${local.prefix}-apprunner-ecr"
  assume_role_policy = data.aws_iam_policy_document.apprunner_assume.json
  tags               = var.tags
}

resource "aws_iam_role_policy_attachment" "apprunner_ecr_access" {
  role       = aws_iam_role.apprunner_ecr_access.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSAppRunnerServicePolicyForECRAccess"
}

# Shared secret CloudFront sends on every origin request. The App Runner URL is
# public, so without this the API can be hit directly, skipping the CDN. The
# backend rejects requests that lack it — except /api/health, which App Runner
# itself calls directly and which therefore never carries the header.
resource "random_password" "origin_secret" {
  length  = 48
  special = false
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
          ORIGIN_SECRET      = random_password.origin_secret.result
        }
      }
    }
  }

  instance_configuration {
    cpu    = "0.25 vCPU"
    memory = "0.5 GB"
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

  lifecycle {
    # The pipeline moves the image forward. Without this, every terraform apply
    # would drag the service back to whatever tag was current at plan time.
    ignore_changes = [source_configuration[0].image_repository[0].image_identifier]
  }
}

# --------------------------------------------------------------------------
# CloudFront: one distribution, two origins, so the browser sees one origin
# --------------------------------------------------------------------------

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
    compress                 = true
  }

  # SPA fallback. A deep link like /room/room-02 is not an object in the
  # bucket, and OAC + the S3 REST endpoint answer 403 for anything missing.
  #
  # These rules apply to the default behavior only — CloudFront does not run
  # custom error responses for a 404 produced by the /api/* behavior, so a
  # genuine API 404 still reaches the browser as JSON rather than as HTML.
  custom_error_response {
    error_code            = 403
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 0
  }

  custom_error_response {
    error_code            = 404
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 0
  }

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
