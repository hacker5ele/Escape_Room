terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.0" }
  }

  backend "s3" {
    bucket = "escape-room-tfstate-us-east-1"
    key    = "shared/terraform.tfstate"
    region = "us-east-1"
    # Terraform 1.10+ can lock with a plain S3 object; 1.5.7 is installed here,
    # so state locking goes through DynamoDB. Created by infra/bootstrap.sh.
    dynamodb_table = "escape-room-tfstate-lock"
    encrypt        = true
  }
}

provider "aws" {
  # us-east-1 is not a preference. CloudFront only accepts ACM certificates
  # from this region, and the certificate lives in this stack.
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
    Environment = "shared"
  }
}
