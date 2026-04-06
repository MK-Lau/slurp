variable "project_id" {
  type = string
}

variable "region" {
  type = string
}

variable "environment" {
  type = string
}

variable "name" {
  type        = string
  description = "Full Cloud Run service name (e.g. slurp-api-dev)"
}

variable "image" {
  type        = string
  description = "Docker image to deploy"
}

variable "service_account_email" {
  type = string
}

variable "firestore_database" {
  type        = string
  description = "Firestore database name to connect to"
  default     = "(default)"
}

variable "receipt_bucket_name" {
  type        = string
  description = "GCS bucket name for receipt images. Leave empty to omit env var."
  default     = ""
}

variable "extra_env_vars" {
  type        = map(string)
  description = "Additional environment variables to set on the Cloud Run service."
  default     = {}
}

variable "public" {
  type        = bool
  description = "Whether to allow unauthenticated (allUsers) access."
  default     = true
}

variable "secret_env_vars" {
  type        = map(string)
  description = "Env vars sourced from Secret Manager. Map of env var name → secret resource name (projects/PROJECT/secrets/NAME)."
  default     = {}
}

