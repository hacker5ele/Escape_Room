output "site_bucket" {
  description = "S3 bucket the pipeline syncs the Vite build into"
  value       = aws_s3_bucket.site.id
}

output "distribution_id" {
  description = "CloudFront distribution id, needed for cache invalidation"
  value       = aws_cloudfront_distribution.main.id
}

output "distribution_domain" {
  description = "CloudFront domain, useful for debugging DNS"
  value       = aws_cloudfront_distribution.main.domain_name
}

output "apprunner_service_arn" {
  description = "App Runner service ARN, needed to trigger a deployment"
  value       = aws_apprunner_service.api.arn
}

output "apprunner_service_url" {
  description = "Direct App Runner URL. Should reject requests without the origin secret."
  value       = aws_apprunner_service.api.service_url
}

output "url" {
  description = "The public URL of this environment"
  value       = "https://${var.domain_name}"
}
