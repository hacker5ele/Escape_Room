variable "domain_name" {
  description = "Apex domain. Registered at Hostinger; its nameservers get delegated to the zone this stack creates."
  type        = string
  default     = "cool.tf"
}

variable "oidc_subject_prefixes" {
  description = <<-EOT
    Subject prefixes GitHub may present in the OIDC token.

    Two forms exist and this repository turned out to use the second one, which
    is why the first deploy failed with "Not authorized to perform
    sts:AssumeRoleWithWebIdentity":

      repo:owner/name                        the classic form
      repo:owner@<id>/name@<id>              the immutable form, with numeric ids

    Check which one applies with:
      gh api repos/OWNER/REPO/actions/oidc/customization/sub

    Only the immutable form is accepted. Listing the legacy form alongside it
    would hand back the exact property that makes the immutable one safer: if
    the hacker5ele account were ever deleted or the Escape_Room name released,
    whoever claimed it could present `repo:hacker5ele/Escape_Room:...` and
    assume this role. The repository is public and the role ARN is committed in
    deploy.yml, so that is not a theoretical concern.

    If deploys ever start failing with "Not authorized to perform
    sts:AssumeRoleWithWebIdentity", re-check the command above — someone has
    changed the subject claim setting — and update this value rather than
    widening it.
  EOT
  type        = list(string)
  default     = ["repo:hacker5ele@180300197/Escape_Room@1321465032"]
}

variable "deploy_branches" {
  description = <<-EOT
    Branches allowed to assume the deploy role. Deliberately exact, not a
    wildcard: the repository is public, so anyone can push a branch or open a
    pull request, and `repo:owner/name:*` would hand them the role.
  EOT
  type        = list(string)
  default     = ["main", "dev"]
}

variable "monthly_budget_usd" {
  description = "Cost budget for the project. Two environments should land near $13/month."
  type        = number
  default     = 30
}

variable "budget_alert_email" {
  description = <<-EOT
    Where budget alerts go. Empty creates the budget without notifications.

    No default on purpose — this repository is public, and a personal address
    committed here is a personal address scraped from here. Put it in
    infra/live/shared/terraform.tfvars, which is gitignored:

      budget_alert_email = "you@example.com"

    AWS Budgets rejects non-ASCII addresses, so an internationalised domain has
    to be written in punycode (bütel.ch becomes xn--btel-5qa.ch).
  EOT
  type        = string
  default     = ""
}
