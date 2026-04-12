resource "google_artifact_registry_repository" "images" {
  project       = var.project_id
  location      = var.region
  repository_id = "slurp"
  format        = "DOCKER"
  description   = "Docker images for the Slurp application"

  cleanup_policies {
    id     = "keep-latest-tags"
    action = "KEEP"
    condition {
      tag_prefixes = ["dev-latest", "prod-latest"]
    }
  }

  cleanup_policies {
    id     = "keep-last-10"
    action = "KEEP"
    most_recent_versions {
      keep_count = 5
    }
  }

  cleanup_policies {
    id     = "delete-all"
    action = "DELETE"
    condition {
      tag_state = "ANY"
    }
  }

  cleanup_policy_dry_run = false
}
