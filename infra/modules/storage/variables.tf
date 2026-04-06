variable "project_id" {
  type = string
}

variable "region" {
  type = string
}

variable "environment" {
  type = string
}

variable "cloud_run_service_account" {
  type = string
}

variable "receipt_processor_service_account" {
  type        = string
  description = "Email of the receipt processor service account (objectViewer on bucket)"
}

variable "bucket_prefix" {
  type        = string
  description = "Prefix for the receipt bucket name. Full name: <prefix>-<environment>"
}

variable "frontend_urls" {
  type        = list(string)
  description = "Allowed CORS origins for the receipt bucket (PUT only). Must be explicit frontend URL(s); wildcards are not permitted."

  validation {
    condition     = !contains(var.frontend_urls, "*")
    error_message = "frontend_urls must not contain wildcards. Specify explicit origin URLs."
  }
}
