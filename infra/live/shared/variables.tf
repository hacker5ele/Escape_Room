variable "domain_name" {
  description = "Apex domain. Registered at Hostinger; its nameservers get delegated to the zone this stack creates."
  type        = string
  default     = "cool.tf"
}

variable "github_repository" {
  description = "owner/repo allowed to assume the deploy role"
  type        = string
  default     = "hacker5ele/Escape_Room"
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

    Both are listed so a change to that setting does not silently break deploys.
    The immutable form is the safer of the two — it survives a rename and cannot
    be re-pointed by someone who later claims a freed-up repository name.
  EOT
  type        = list(string)
  default = [
    "repo:hacker5ele/Escape_Room",
    "repo:hacker5ele@180300197/Escape_Room@1321465032",
  ]
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
    Where budget alerts go. The domain is written in punycode because AWS
    Budgets rejects non-ASCII addresses — xn--btel-5qa.ch is bütel.ch.
    Set to "" to create the budget without notifications.
  EOT
  type        = string
  default     = "nepomuk@xn--btel-5qa.ch"
}
