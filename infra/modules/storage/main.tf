locals {
  receipt_retention_days = var.environment == "prod" ? 365 : 3
}

resource "google_storage_bucket" "receipts" {
  name                        = "${var.bucket_prefix}-${var.environment}"
  project                     = var.project_id
  location                    = var.region
  uniform_bucket_level_access = true
  force_destroy               = var.environment == "dev"

  versioning {
    enabled = false
  }

  lifecycle_rule {
    condition {
      age = local.receipt_retention_days
    }
    action {
      type = "Delete"
    }
  }

  cors {
    origin          = var.frontend_urls
    method          = ["PUT"]
    response_header = ["Content-Type"]
    max_age_seconds = 3600
  }
}

# Allow Cloud Run service account to manage objects (signed URL generation)
resource "google_storage_bucket_iam_member" "cloud_run_receipts" {
  bucket = google_storage_bucket.receipts.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${var.cloud_run_service_account}"
}

# Allow receipt processor SA to read objects (Gemini reads via GCS URI)
resource "google_storage_bucket_iam_member" "processor_receipts" {
  bucket = google_storage_bucket.receipts.name
  role   = "roles/storage.objectViewer"
  member = "serviceAccount:${var.receipt_processor_service_account}"
}

# Allow Claude Web SA to read receipt objects
resource "google_storage_bucket_iam_member" "claude_web_receipts" {
  bucket = google_storage_bucket.receipts.name
  role   = "roles/storage.objectViewer"
  member = "serviceAccount:${var.claude_web_service_account}"
}
