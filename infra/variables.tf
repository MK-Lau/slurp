variable "project_id" {
  description = "GCP project ID"
  type        = string
}

variable "region" {
  description = "GCP region"
  type        = string
  default     = "us-central1"
}

variable "billing_account" {
  description = "GCP billing account ID (used for budget alerts)"
  type        = string
  default     = ""
}

variable "custom_domain" {
  description = "Custom domain for the app (e.g. yourapp.example.com). Leave empty to disable."
  type        = string
  default     = ""
}

variable "receipt_bucket_prefix" {
  description = "Prefix for the GCS receipt storage bucket name. Full name: <prefix>-<env>"
  type        = string
}

variable "terraform_state_bucket" {
  description = "GCS bucket name used to store Terraform state (for IAM grant to GitHub Actions)"
  type        = string
}

variable "github_repository" {
  description = "GitHub repository in owner/repo format, used for Workload Identity Federation"
  type        = string
}
