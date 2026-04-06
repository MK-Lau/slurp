variable "project_id" {
  type = string
}

variable "region" {
  type = string
}

variable "environment" {
  type = string
}

variable "processor_url" {
  type        = string
  description = "URL of the receipt processor Cloud Run service"
}

variable "processor_service_name" {
  type        = string
  description = "Name of the receipt processor Cloud Run service (for IAM binding)"
}

variable "pubsub_invoker_service_account_email" {
  type        = string
  description = "Email of the Pub/Sub invoker service account"
}

variable "api_service_account_email" {
  type        = string
  description = "Email of the Cloud Run API service account (granted publisher on this topic)"
}
