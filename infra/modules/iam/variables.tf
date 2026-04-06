variable "project_id" {
  description = "GCP project ID"
  type        = string
}

variable "project_number" {
  description = "GCP project number (for Pub/Sub service agent email)"
  type        = string
}

variable "terraform_state_bucket" {
  description = "GCS bucket name used to store Terraform state"
  type        = string
}

variable "github_repository" {
  description = "GitHub repository in owner/repo format (e.g. MyOrg/my-repo)"
  type        = string
}
