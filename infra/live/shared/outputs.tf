output "name_servers" {
  description = "Paste these four into Hostinger as cool.tf's nameservers. Nothing resolves until you do."
  value       = aws_route53_zone.main.name_servers
}

output "zone_id" {
  value = aws_route53_zone.main.zone_id
}

output "clerk_dns_records" {
  description = "The five CNAMEs Clerk's production instance needs. All must resolve before Clerk issues its certificates."
  value       = { for name, target in local.clerk_dns_records : "${name}.${var.domain_name}" => target }
}

output "certificate_arn" {
  value = aws_acm_certificate.main.arn
}

output "ecr_repository_url" {
  value = aws_ecr_repository.backend.repository_url
}

output "ecr_repository_arn" {
  value = aws_ecr_repository.backend.arn
}

output "deploy_role_arn" {
  description = "Referenced by the GitHub Actions workflows. Not a secret — the trust policy is what protects it."
  value       = aws_iam_role.deploy.arn
}

output "deploy_role_name" {
  value = aws_iam_role.deploy.name
}
