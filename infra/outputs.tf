output "cloud_run_urls" {
  description = "URLs of the Cloud Run API services by environment"
  value       = { for env, mod in module.cloud_run : env => mod.url }
}

output "cloud_run_web_urls" {
  description = "URLs of the Cloud Run web services by environment"
  value       = { for env, mod in module.cloud_run_web : env => mod.url }
}

output "receipt_bucket_names" {
  description = "GCS bucket names for receipt images by environment"
  value       = { for env, mod in module.storage : env => mod.receipt_bucket_name }
}

output "cloud_run_service_account" {
  description = "Service account email used by Cloud Run"
  value       = module.iam.cloud_run_service_account_email
}

output "artifact_registry_url" {
  description = "Base URL for Docker images in Artifact Registry"
  value       = module.artifact_registry.repository_url
}

output "github_actions_service_account_email" {
  description = "Service account email for GitHub Actions (used in WIF binding)"
  value       = module.iam.github_actions_service_account_email
}

output "workload_identity_provider" {
  description = "Full WIF provider resource name for GitHub Actions workflows"
  value       = module.iam.workload_identity_provider
}
