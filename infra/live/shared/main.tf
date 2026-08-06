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
  comment = "Escape Room"
}

# --------------------------------------------------------------------------
# Clerk's production instance, which runs on our domain rather than theirs
# --------------------------------------------------------------------------

# The production publishable key encodes `clerk.cool.tf`, so sign-in in
# production goes through our domain and not a *.clerk.accounts.dev host. That
# only works once these five records exist — Clerk will not issue its
# certificates until all of them resolve, and until it does, nobody can sign in
# to production at all.
#
# Values come from the Clerk dashboard (Configure → Domains) and are specific to
# this Clerk instance: the `iyd57rzfdwng` part is an instance identifier, so
# these cannot be copied to another project.
#
# Staging is unaffected. It uses Clerk's own `.clerk.accounts.dev` test
# instance, which needs no DNS of ours.
locals {
  clerk_dns_records = {
    # The Frontend API the browser SDK talks to.
    "clerk" = "frontend-api.clerk.services"
    # Clerk's hosted sign-in and account pages.
    "accounts" = "accounts.clerk.services"
    # Outbound mail — verification and password-reset messages.
    "clkmail" = "mail.iyd57rzfdwng.clerk.services"
    # DKIM signing, so those messages are not treated as spam.
    "clk._domainkey"  = "dkim1.iyd57rzfdwng.clerk.services"
    "clk2._domainkey" = "dkim2.iyd57rzfdwng.clerk.services"
  }
}

resource "aws_route53_record" "clerk" {
  for_each = local.clerk_dns_records

  zone_id = aws_route53_zone.main.zone_id
  name    = "${each.key}.${var.domain_name}"
  type    = "CNAME"
  records = [each.value]
  # Short, because these are the records most likely to need correcting while
  # the instance is being set up.
  ttl = 300
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

  # Without this, `terraform destroy` fails on a repository that still contains
  # images — which it always will. Images are rebuildable from a git sha.
  force_delete = true

  image_scanning_configuration {
    scan_on_push = true
  }
}

# ECR is billed by the gigabyte and an image per commit adds up over a week.
#
# The obvious rule — tagStatus "any", keep the newest 15 — would take
# production down. Both environments push to this one repository, and "any"
# counts tagged images too, so after fifteen staging deploys the image still
# carrying the `prod` tag falls out of the newest fifteen and is expired while
# in use. App Runner re-pulls on every deployment and on instance replacement,
# so the next prod deploy, or an unlucky restart, would fail to pull — and with
# max_size = 1 there is no second instance to survive on.
#
# So: the moving `prod` and `staging` tags are never governed by a count rule,
# and history is pruned through the immutable `sha-` tags instead.
resource "aws_ecr_lifecycle_policy" "backend" {
  repository = aws_ecr_repository.backend.name

  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Expire untagged images after 7 days"
        selection = {
          tagStatus   = "untagged"
          countType   = "sinceImagePushed"
          countUnit   = "days"
          countNumber = 7
        }
        action = { type = "expire" }
      },
      {
        rulePriority = 2
        description  = "Keep the 20 most recent per-commit images"
        selection = {
          tagStatus      = "tagged"
          tagPatternList = ["sha-*"]
          countType      = "imageCountMoreThan"
          countNumber    = 20
        }
        action = { type = "expire" }
      },
    ]
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

    # Exact branch refs only — StringEquals, never StringLike with a wildcard.
    # A pull_request run gets a different subject (`...:pull_request`), so a
    # fork PR cannot assume this role even though the repository is public.
    #
    # Both subject prefix forms are accepted because GitHub issues the
    # immutable one for this repository; see the variable's description.
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      values = flatten([
        for prefix in var.oidc_subject_prefixes : [
          for branch in var.deploy_branches : "${prefix}:ref:refs/heads/${branch}"
        ]
      ])
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

# --------------------------------------------------------------------------
# Sending email
# --------------------------------------------------------------------------

# One verified identity for the whole domain, shared by both environments, so
# there is one thing to verify rather than one per environment (ADR-0046).
#
# There is no API key anywhere in this: the App Runner instance role is granted
# `ses:SendEmail` on this ARN and that is the entire credential. Nothing to
# create out of band, nothing to rotate, nothing to leak.
resource "aws_sesv2_email_identity" "main" {
  email_identity = var.domain_name

  dkim_signing_attributes {
    next_signing_key_length = "RSA_2048_BIT"
  }
}

# Three CNAMEs prove we own the domain and sign what we send. Until they
# resolve, SES will not send at all — and mail that is unsigned is mail that
# lands in a spam folder, which for an invitation is the same as not sending it.
resource "aws_route53_record" "ses_dkim" {
  count = 3

  zone_id = aws_route53_zone.main.zone_id
  name    = "${aws_sesv2_email_identity.main.dkim_signing_attributes[0].tokens[count.index]}._domainkey.${var.domain_name}"
  type    = "CNAME"
  ttl     = 600
  records = ["${aws_sesv2_email_identity.main.dkim_signing_attributes[0].tokens[count.index]}.dkim.amazonses.com"]
}

# Tells a receiver what to do with mail that fails the checks above. `none` is
# the honest setting while this is new: it asks for nothing to be rejected and
# reports nowhere, which is where a domain starts. Tighten once it has a record.
resource "aws_route53_record" "dmarc" {
  zone_id = aws_route53_zone.main.zone_id
  name    = "_dmarc.${var.domain_name}"
  type    = "TXT"
  ttl     = 600
  records = ["v=DMARC1; p=none;"]
}
