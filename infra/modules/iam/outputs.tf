output "cloud_run_service_account_email" {
  description = "Email of the Cloud Run service account"
  value       = google_service_account.cloud_run.email
}

output "github_actions_service_account_email" {
  description = "Email of the GitHub Actions service account"
  value       = google_service_account.github_actions.email
}

output "workload_identity_provider" {
  description = "Full WIF provider resource name for use in GitHub Actions workflows"
  value       = google_iam_workload_identity_pool_provider.github.name
}

output "receipt_processor_service_account_email" {
  description = "Email of the receipt processor service account"
  value       = google_service_account.receipt_processor.email
}

output "pubsub_invoker_service_account_email" {
  description = "Email of the Pub/Sub invoker service account"
  value       = google_service_account.pubsub_invoker.email
}
