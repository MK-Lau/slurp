resource "google_pubsub_topic" "receipts" {
  name    = "slurp-receipts-${var.environment}"
  project = var.project_id
}

resource "google_pubsub_subscription" "receipts_push" {
  name    = "slurp-receipts-${var.environment}-push"
  project = var.project_id
  topic   = google_pubsub_topic.receipts.name

  ack_deadline_seconds = 300

  push_config {
    push_endpoint = var.processor_url

    oidc_token {
      service_account_email = var.pubsub_invoker_service_account_email
    }
  }

  retry_policy {
    minimum_backoff = "10s"
    maximum_backoff = "600s"
  }

  message_retention_duration = "600s"
}

# Allow the API Cloud Run SA to publish to this topic
resource "google_pubsub_topic_iam_member" "api_publisher" {
  project = var.project_id
  topic   = google_pubsub_topic.receipts.name
  role    = "roles/pubsub.publisher"
  member  = "serviceAccount:${var.api_service_account_email}"
}

# Allow Pub/Sub invoker SA to invoke the processor Cloud Run service
resource "google_cloud_run_v2_service_iam_member" "pubsub_invoker" {
  project  = var.project_id
  location = var.region
  name     = var.processor_service_name
  role     = "roles/run.invoker"
  member   = "serviceAccount:${var.pubsub_invoker_service_account_email}"
}
