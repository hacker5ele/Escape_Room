data "aws_caller_identity" "current" {}

# --------------------------------------------------------------------------
# DNS
# --------------------------------------------------------------------------

# Creating the zone does nothing on its own. cool.tf is registered at Hostinger
# and still points at their parking nameservers, so someone has to paste the
# name_servers output below into Hostinger before any of this resolves.
#
# The reason we delegate at all rather than adding records at Hostinger: an
# apex domain cannot be a CNAME, CloudFront has no static IPs, and Hostinger
# does not support ALIAS records. Route 53 alias records are the way out.
resource "aws_route53_zone" "main" {
  name    = var.domain_name
  comment = "Escape Room — project week KW 32"
}

# --------------------------------------------------------------------------
# Certificate — covers the apex and every subdomain, so staging needs no second
# certificate and a future room-specific subdomain needs no Terraform change.
# --------------------------------------------------------------------------

resource "aws_acm_certificate" "main" {
  domain_name               = var.domain_name
  subject_alternative_names = ["*.${var.domain_name}"]
  validation_method         = "DNS"

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_route53_record" "certificate_validation" {
  for_each = {
    for option in aws_acm_certificate.main.domain_validation_options :
    option.domain_name => option
    # The wildcard validates through the same record as the apex; without this
    # filter Terraform tries to create the identical record twice and fails.
    if option.domain_name != "*.${var.domain_name}"
  }

  zone_id         = aws_route53_zone.main.zone_id
  name            = each.value.resource_record_name
  type            = each.value.resource_record_type
  records         = [each.value.resource_record_value]
  ttl             = 60
  allow_overwrite = true
}

# Blocks until AWS sees the validation records. If it hangs, the nameservers at
# Hostinger have not been switched yet — that is the usual cause.
resource "aws_acm_certificate_validation" "main" {
  certificate_arn         = aws_acm_certificate.main.arn
  validation_record_fqdns = [for record in aws_route53_record.certificate_validation : record.fqdn]

  timeouts {
    create = "30m"
  }
}

# --------------------------------------------------------------------------
# Container registry — one repository, both environments, tagged per environment
# --------------------------------------------------------------------------

resource "aws_ecr_repository" "backend" {
  name                 = "escape-room-backend"
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }
}

# ECR is billed by the gigabyte and a container image per commit adds up fast
# over a week of pushing.
resource "aws_ecr_lifecycle_policy" "backend" {
  repository = aws_ecr_repository.backend.name

  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Keep the 15 most recent images"
      selection = {
        tagStatus   = "any"
        countType   = "imageCountMoreThan"
        countNumber = 15
      }
      action = { type = "expire" }
    }]
  })
}

# --------------------------------------------------------------------------
# GitHub Actions deploy role
# --------------------------------------------------------------------------

# The provider already existed in this account before this project.
data "aws_iam_openid_connect_provider" "github" {
  url = "https://token.actions.githubusercontent.com"
}

data "aws_iam_policy_document" "deploy_assume" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [data.aws_iam_openid_connect_provider.github.arn]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }

    # Exact branch refs only. A pull_request run gets a different subject
    # (`...:pull_request`), so a fork PR cannot assume this role even though
    # the repository is public.
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      values   = [for branch in var.deploy_branches : "repo:${var.github_repository}:ref:refs/heads/${branch}"]
    }
  }
}

resource "aws_iam_role" "deploy" {
  name                 = "escape-room-deploy"
  description          = "GitHub Actions deploys for hacker5ele/Escape_Room"
  assume_role_policy   = data.aws_iam_policy_document.deploy_assume.json
  max_session_duration = 3600
}

# Registry access. Everything else the role can do is granted per environment,
# by the environment module, naming that environment's concrete ARNs.
data "aws_iam_policy_document" "deploy_ecr" {
  statement {
    sid       = "GetAuthToken"
    effect    = "Allow"
    actions   = ["ecr:GetAuthorizationToken"]
    resources = ["*"] # This action does not support resource-level permissions.
  }

  statement {
    sid    = "PushToProjectRepositoryOnly"
    effect = "Allow"
    actions = [
      "ecr:BatchCheckLayerAvailability",
      "ecr:CompleteLayerUpload",
      "ecr:InitiateLayerUpload",
      "ecr:PutImage",
      "ecr:UploadLayerPart",
      "ecr:BatchGetImage",
      "ecr:GetDownloadUrlForLayer",
      "ecr:DescribeImages",
    ]
    resources = [aws_ecr_repository.backend.arn]
  }
}

resource "aws_iam_role_policy" "deploy_ecr" {
  name   = "escape-room-deploy-ecr"
  role   = aws_iam_role.deploy.name
  policy = data.aws_iam_policy_document.deploy_ecr.json
}

# --------------------------------------------------------------------------
# Cost guard — this is a shared personal account, and a runaway is expensive
# --------------------------------------------------------------------------

resource "aws_budgets_budget" "project" {
  name         = "escape-room-monthly"
  budget_type  = "COST"
  limit_amount = tostring(var.monthly_budget_usd)
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  cost_filter {
    name   = "TagKeyValue"
    values = ["user:Project$escape-room"]
  }

  dynamic "notification" {
    for_each = var.budget_alert_email == "" ? [] : [80, 100]
    content {
      comparison_operator        = "GREATER_THAN"
      threshold                  = notification.value
      threshold_type             = "PERCENTAGE"
      notification_type          = "ACTUAL"
      subscriber_email_addresses = [var.budget_alert_email]
    }
  }
}
