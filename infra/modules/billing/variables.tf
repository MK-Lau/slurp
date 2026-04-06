variable "billing_account" {
  description = "GCP billing account ID (e.g. XXXXXX-XXXXXX-XXXXXX)"
  type        = string
}

variable "project_id" {
  description = "GCP project ID to scope the budget to"
  type        = string
}
