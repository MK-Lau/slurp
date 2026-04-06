resource "google_service_account" "cloud_run" {
  project      = var.project_id
  account_id   = "slurp-cloud-run"
  display_name = "Slurp Cloud Run Service Account"
}

# Allow Cloud Run to write to Firestore
resource "google_project_iam_member" "cloud_run_firestore" {
  project = var.project_id
  role    = "roles/datastore.user"
  member  = "serviceAccount:${google_service_account.cloud_run.email}"
}

# Allow Cloud Run to call Gemini API
resource "google_project_iam_member" "cloud_run_aiplatform" {
  project = var.project_id
  role    = "roles/aiplatform.user"
  member  = "serviceAccount:${google_service_account.cloud_run.email}"
}


# ── GitHub Actions SA + Workload Identity Federation ──────────────────────────

resource "google_service_account" "github_actions" {
  project      = var.project_id
  account_id   = "slurp-github-actions"
  display_name = "Slurp GitHub Actions Service Account"
}

resource "google_iam_workload_identity_pool" "github" {
  project                   = var.project_id
  workload_identity_pool_id = "github-actions"
  display_name              = "GitHub Actions"
}

resource "google_iam_workload_identity_pool_provider" "github" {
  project                            = var.project_id
  workload_identity_pool_id          = google_iam_workload_identity_pool.github.workload_identity_pool_id
  workload_identity_pool_provider_id = "github-oidc"
  display_name                       = "GitHub OIDC"

  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }

  attribute_mapping = {
    "google.subject"       = "assertion.sub"
    "attribute.repository" = "assertion.repository"
  }

  attribute_condition = "assertion.repository == '${var.github_repository}'"
}

# Allow GitHub Actions workflows from MK-Lau/slurp to impersonate the SA
resource "google_service_account_iam_member" "github_wif_binding" {
  service_account_id = google_service_account.github_actions.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github.name}/attribute.repository/${var.github_repository}"
}

# Grant GitHub Actions SA the permissions it needs to deploy
resource "google_project_iam_member" "github_actions_run_admin" {
  project = var.project_id
  role    = "roles/run.admin"
  member  = "serviceAccount:${google_service_account.github_actions.email}"
}

resource "google_project_iam_member" "github_actions_ar_writer" {
  project = var.project_id
  role    = "roles/artifactregistry.repoAdmin"
  member  = "serviceAccount:${google_service_account.github_actions.email}"
}

resource "google_project_iam_member" "github_actions_firebase_hosting" {
  project = var.project_id
  role    = "roles/firebasehosting.admin"
  member  = "serviceAccount:${google_service_account.github_actions.email}"
}

# Allow GitHub Actions SA to act as the Cloud Run SA (required for gcloud run deploy)
resource "google_service_account_iam_member" "github_actions_sa_user" {
  service_account_id = google_service_account.cloud_run.name
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${google_service_account.github_actions.email}"
}

# ── Receipt Processor SA ───────────────────────────────────────────────────────

resource "google_service_account" "receipt_processor" {
  project      = var.project_id
  account_id   = "slurp-receipt-processor"
  display_name = "Slurp Receipt Processor Service Account"
}

# Allow receipt processor to write to Firestore
resource "google_project_iam_member" "receipt_processor_firestore" {
  project = var.project_id
  role    = "roles/datastore.user"
  member  = "serviceAccount:${google_service_account.receipt_processor.email}"
}

# Allow receipt processor to call Vertex AI (Gemini)
resource "google_project_iam_member" "receipt_processor_aiplatform" {
  project = var.project_id
  role    = "roles/aiplatform.user"
  member  = "serviceAccount:${google_service_account.receipt_processor.email}"
}

# Allow GitHub Actions SA to deploy as the receipt processor SA
resource "google_service_account_iam_member" "github_actions_processor_sa_user" {
  service_account_id = google_service_account.receipt_processor.name
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${google_service_account.github_actions.email}"
}

# ── Pub/Sub Invoker SA ─────────────────────────────────────────────────────────

resource "google_service_account" "pubsub_invoker" {
  project      = var.project_id
  account_id   = "slurp-pubsub-invoker"
  display_name = "Slurp Pub/Sub Invoker Service Account"
}

# Allow Pub/Sub service agent to create OIDC tokens for the invoker SA
# (required for authenticated push subscriptions)
resource "google_service_account_iam_member" "pubsub_agent_token_creator" {
  service_account_id = google_service_account.pubsub_invoker.name
  role               = "roles/iam.serviceAccountTokenCreator"
  member             = "serviceAccount:service-${var.project_number}@gcp-sa-pubsub.iam.gserviceaccount.com"
}

# ── Claude Web SA (read-only observer) ────────────────────────────────────────

resource "google_service_account" "claude_web" {
  project      = var.project_id
  account_id   = "slurp-claude-web"
  display_name = "Slurp Claude Web Service Account"
}

# Broad read-only access across GCP resources (Cloud Run, Firestore, Storage,
# Pub/Sub, Artifact Registry, IAM, Logging, etc.)
resource "google_project_iam_member" "claude_web_viewer" {
  project = var.project_id
  role    = "roles/viewer"
  member  = "serviceAccount:${google_service_account.claude_web.email}"
}

# ── Self-sign binding for V4 signed URLs ──────────────────────────────────────

# Cloud Run SA needs token creator on itself to generate V4 signed URLs
resource "google_service_account_iam_member" "cloud_run_self_sign" {
  service_account_id = google_service_account.cloud_run.name
  role               = "roles/iam.serviceAccountTokenCreator"
  member             = "serviceAccount:${google_service_account.cloud_run.email}"
}
