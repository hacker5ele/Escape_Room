variable "name" {
  description = "Environment name, used in every resource name. e.g. prod, staging"
  type        = string
}

variable "domain_name" {
  description = "Fully qualified domain this environment serves. e.g. cool.tf, dev.cool.tf"
  type        = string
}

variable "zone_id" {
  description = "Route 53 hosted zone id for the parent domain"
  type        = string
}

variable "certificate_arn" {
  description = "ACM certificate ARN, must be in us-east-1 because CloudFront requires it"
  type        = string
}

variable "ecr_repository_url" {
  description = "ECR repository the backend image is pulled from"
  type        = string
}

variable "ecr_repository_arn" {
  description = "ECR repository ARN, for the deploy role policy"
  type        = string
}

variable "image_tag" {
  description = <<-EOT
    Tag App Runner pulls. A moving tag per environment (prod/staging) rather than
    a commit sha, so the pipeline can push a new image and call start-deployment
    without Terraform having to run on every deploy.
  EOT
  type        = string
}

variable "deploy_role_name" {
  description = "Name of the shared GitHub Actions OIDC role to attach this environment's permissions to"
  type        = string
}

variable "clerk_publishable_key" {
  description = <<-EOT
    Clerk's publishable key for this environment.

    Needed by the BACKEND as well as the browser: @clerk/express calls
    assertValidPublishableKey() while verifying a token, and without it every
    authenticated request fails with a 500 rather than a 401.

    Not a secret — it identifies the Clerk instance and carries no authority,
    and Vite inlines it into the frontend bundle regardless.
  EOT
  type        = string
}

variable "trust_proxy" {
  description = <<-EOT
    How many proxy hops Express should trust when reading the client IP.
    CloudFront is one hop, App Runner's own ingress is another. Too low and the
    rate limiter treats every visitor as the same client; too high and a client
    can spoof X-Forwarded-For to bypass it. Verified live by the smoke test.
  EOT
  type        = number
  default     = 2
}

variable "attempt_rate_limit" {
  description = "Answer attempts allowed per client IP per minute"
  type        = number
  default     = 30
}

variable "tags" {
  description = "Tags applied to everything, so this project is separable from the rest of the account"
  type        = map(string)
  default     = {}
}

variable "mail_from" {
  description = "Who invitation emails come from. Empty turns email off entirely."
  type        = string
  default     = ""
}

variable "mail_identity_arn" {
  description = "The verified SES identity this environment may send as."
  type        = string
}
