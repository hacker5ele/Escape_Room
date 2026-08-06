terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.0" }
  }

  backend "s3" {
    bucket         = "escape-room-tfstate-us-east-1"
    key            = "staging/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "escape-room-tfstate-lock"
    encrypt        = true
  }
}

provider "aws" {
  region = "us-east-1"

  default_tags {
    tags = local.tags
  }
}

locals {
  tags = {
    Project     = "escape-room"
    ManagedBy   = "terraform"
    Repository  = "hacker5ele/Escape_Room"
    Environment = "staging"
  }
}

# The zone, certificate, registry and deploy role are created once and shared.
data "terraform_remote_state" "shared" {
  backend = "s3"
  config = {
    bucket = "escape-room-tfstate-us-east-1"
    key    = "shared/terraform.tfstate"
    region = "us-east-1"
  }
}

module "environment" {
  source = "../../modules/environment"

  name        = "staging"
  domain_name = "dev.cool.tf"

  zone_id            = data.terraform_remote_state.shared.outputs.zone_id
  certificate_arn    = data.terraform_remote_state.shared.outputs.certificate_arn
  ecr_repository_url = data.terraform_remote_state.shared.outputs.ecr_repository_url
  ecr_repository_arn = data.terraform_remote_state.shared.outputs.ecr_repository_arn
  deploy_role_name   = data.terraform_remote_state.shared.outputs.deploy_role_name
  mail_identity_arn  = data.terraform_remote_state.shared.outputs.mail_identity_arn

  # Both environments send as the same verified domain. The subject and the body
  # say which game it is; a separate sending address per environment would be a
  # second thing to verify for no benefit anybody receiving one would notice.
  mail_from = "Der digitale Escape Room <noreply@cool.tf>"

  image_tag = "staging"

  # Public by design; the secret key lives in SSM.
  clerk_publishable_key = "pk_test_Z2VudWluZS1zbG90aC02My5jbGVyay5hY2NvdW50cy5kZXYk"

  # Lower than production on purpose: the smoke test asserts a 429, and waiting
  # for 30 attempts on every deploy is slow.
  attempt_rate_limit = 10

  tags = local.tags
}

output "url" {
  value = module.environment.url
}

output "site_bucket" {
  value = module.environment.site_bucket
}

output "distribution_id" {
  value = module.environment.distribution_id
}

output "apprunner_service_arn" {
  value = module.environment.apprunner_service_arn
}

output "apprunner_service_url" {
  value = module.environment.apprunner_service_url
}
