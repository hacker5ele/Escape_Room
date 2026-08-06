terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.0" }
  }

  backend "s3" {
    bucket         = "escape-room-tfstate-us-east-1"
    key            = "prod/terraform.tfstate"
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
    Environment = "prod"
  }
}

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

  name        = "prod"
  domain_name = "cool.tf"

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

  image_tag = "prod"

  # Public by design; the secret key lives in SSM.
  clerk_publishable_key = "pk_live_Y2xlcmsuY29vbC50ZiQ"

  attempt_rate_limit = 30

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
