resource "google_cloud_run_v2_service" "api" {
  name     = var.name
  project  = var.project_id
  location = var.region

  # CI/CD deploys images directly via gcloud run deploy; Terraform should not
  # revert those to the placeholder image on subsequent applies.
  lifecycle {
    ignore_changes = [template[0].containers[0].image]
  }

  scaling {
    max_instance_count = 3
  }

  template {
    service_account = var.service_account_email

    scaling {
      min_instance_count = 0
      max_instance_count = 3
    }

    containers {
      image = var.image

      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
        cpu_idle = true
      }

      env {
        name  = "ENVIRONMENT"
        value = var.environment
      }

      env {
        name  = "FIRESTORE_DATABASE"
        value = var.firestore_database
      }

      dynamic "env" {
        for_each = var.receipt_bucket_name != "" ? [var.receipt_bucket_name] : []
        content {
          name  = "RECEIPT_BUCKET"
          value = env.value
        }
      }

      dynamic "env" {
        for_each = var.extra_env_vars
        content {
          name  = env.key
          value = env.value
        }
      }

      dynamic "env" {
        for_each = var.secret_env_vars
        content {
          name = env.key
          value_source {
            secret_key_ref {
              secret  = env.value
              version = "latest"
            }
          }
        }
      }
    }
  }
}

# Allow unauthenticated access (public services only)
resource "google_cloud_run_v2_service_iam_member" "public" {
  count    = var.public ? 1 : 0
  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_service.api.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}
