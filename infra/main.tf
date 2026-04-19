terraform {
  required_version = ">= 1.14"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
    google-beta = {
      source  = "hashicorp/google-beta"
      version = "~> 5.0"
    }
    null = {
      source  = "hashicorp/null"
      version = "~> 3.0"
    }
  }

  backend "gcs" {
    # bucket and prefix supplied via -backend-config at init time
    # e.g. terraform init -backend-config=backends/unified.gcs.tfbackend
  }
}

provider "google" {
  project               = var.project_id
  region                = var.region
  user_project_override = true
  billing_project       = var.project_id
}

provider "google-beta" {
  project               = var.project_id
  region                = var.region
  user_project_override = true
  billing_project       = var.project_id
}

provider "null" {}

locals {
  environments = toset(["dev", "prod"])

  # Deterministic Cloud Run URL using project number — stable and avoids a
  # circular dependency on the module's own output.
  processor_urls = {
    for env in local.environments :
    env => "https://slurp-receipt-processor-${env}-${data.google_project.default.number}.${var.region}.run.app"
  }

  # Non-empty lists when a custom domain is configured.
  # Use custom_domain_set (no protocol) for Firebase authorized_domains.
  # Use custom_domain_url_set (with https://) for CORS origins and ALLOWED_ORIGINS.
  custom_domain_set     = var.custom_domain != "" ? [var.custom_domain] : []
  custom_domain_url_set = var.custom_domain != "" ? ["https://${var.custom_domain}"] : []
}

# Enable required GCP APIs
resource "google_project_service" "apis" {
  for_each = toset([
    "run.googleapis.com",
    "firestore.googleapis.com",
    "firebasehosting.googleapis.com",
    "storage.googleapis.com",
    "generativelanguage.googleapis.com",
    "aiplatform.googleapis.com",
    "pubsub.googleapis.com",
    "firebase.googleapis.com",
    "identitytoolkit.googleapis.com",
    "iam.googleapis.com",
    "cloudresourcemanager.googleapis.com",
    "artifactregistry.googleapis.com",
    "iamcredentials.googleapis.com",
    "sts.googleapis.com",
    "billingbudgets.googleapis.com",
    "secretmanager.googleapis.com",
  ])

  project                    = var.project_id
  service                    = each.value
  disable_on_destroy         = false
}

# ── Shared (project-level, one per project) ───────────────────────────────────

module "iam" {
  source                 = "./modules/iam"
  project_id             = var.project_id
  project_number         = data.google_project.default.number
  terraform_state_bucket = var.terraform_state_bucket
  github_repository      = var.github_repository

  depends_on = [google_project_service.apis]
}

module "artifact_registry" {
  source     = "./modules/artifact-registry"
  project_id = var.project_id
  region     = var.region

  depends_on = [google_project_service.apis]
}

module "billing" {
  source          = "./modules/billing"
  billing_account = var.billing_account
  project_id      = var.project_id

  depends_on = [google_project_service.apis]
}

# ── Per-environment ───────────────────────────────────────────────────────────

module "storage" {
  for_each                          = local.environments
  source                            = "./modules/storage"
  project_id                        = var.project_id
  region                            = var.region
  environment                       = each.key
  cloud_run_service_account         = module.iam.cloud_run_service_account_email
  receipt_processor_service_account = module.iam.receipt_processor_service_account_email
bucket_prefix                     = var.receipt_bucket_prefix
  frontend_urls                     = each.key == "prod" ? concat(["https://slurp-web-${each.key}-${data.google_project.default.number}.${var.region}.run.app"], local.custom_domain_url_set) : ["https://slurp-web-${each.key}-${data.google_project.default.number}.${var.region}.run.app"]

  depends_on = [google_project_service.apis]
}

module "firestore" {
  for_each    = local.environments
  source      = "./modules/firestore"
  project_id  = var.project_id
  region      = var.region
  environment = each.key

  depends_on = [google_project_service.apis]
}

module "cloud_run" {
  for_each              = local.environments
  source                = "./modules/cloud-run"
  project_id            = var.project_id
  region                = var.region
  environment           = each.key
  name                  = "slurp-api-${each.key}"
  image                 = "us-docker.pkg.dev/cloudrun/container/hello"
  service_account_email = module.iam.cloud_run_service_account_email
  firestore_database    = module.firestore[each.key].database_name
  receipt_bucket_name   = module.storage[each.key].receipt_bucket_name
  extra_env_vars = {
    PUBSUB_TOPIC    = "slurp-receipts-${each.key}"
    ALLOWED_ORIGINS = each.key == "prod" ? join(",", concat(["https://slurp-web-${each.key}-${data.google_project.default.number}.${var.region}.run.app"], local.custom_domain_url_set)) : "https://slurp-web-${each.key}-${data.google_project.default.number}.${var.region}.run.app"
  }
  secret_env_vars = each.key == "dev" ? {
    DEV_WHITELIST = google_secret_manager_secret.dev_whitelist.id
  } : {}

  depends_on = [google_project_service.apis]
}

module "cloud_run_processor" {
  for_each              = local.environments
  source                = "./modules/cloud-run"
  project_id            = var.project_id
  region                = var.region
  environment           = each.key
  name                  = "slurp-receipt-processor-${each.key}"
  image                 = "us-docker.pkg.dev/cloudrun/container/hello"
  service_account_email = module.iam.receipt_processor_service_account_email
  firestore_database    = module.firestore[each.key].database_name
  receipt_bucket_name   = module.storage[each.key].receipt_bucket_name
  public                = false
  extra_env_vars = {
    GOOGLE_CLOUD_PROJECT         = var.project_id
    PUBSUB_SERVICE_ACCOUNT_EMAIL = module.iam.pubsub_invoker_service_account_email
    PROCESSOR_URL                = local.processor_urls[each.key]
  }

  depends_on = [google_project_service.apis]
}

module "monitoring" {
  source     = "./modules/monitoring"
  project_id = var.project_id

  depends_on = [google_project_service.apis]
}

module "pubsub" {
  for_each                             = local.environments
  source                               = "./modules/pubsub"
  project_id                           = var.project_id
  region                               = var.region
  environment                          = each.key
  processor_url                        = local.processor_urls[each.key]
  processor_service_name               = module.cloud_run_processor[each.key].name
  pubsub_invoker_service_account_email = module.iam.pubsub_invoker_service_account_email
  api_service_account_email            = module.iam.cloud_run_service_account_email

  depends_on = [google_project_service.apis, module.cloud_run_processor]
}

# ── Dev whitelist secret ──────────────────────────────────────────────────────
# Holds a comma-separated list of emails allowed to call the dev API.
# Terraform creates the secret; set the value manually:
#   echo -n "you@example.com,other@example.com" \
#     | gcloud secrets versions add slurp-dev-whitelist --data-file=-

resource "google_secret_manager_secret" "dev_whitelist" {
  project   = var.project_id
  secret_id = "slurp-dev-whitelist"

  replication {
    auto {}
  }

  depends_on = [google_project_service.apis]
}

resource "google_secret_manager_secret_iam_member" "dev_whitelist_cloud_run" {
  project   = var.project_id
  secret_id = google_secret_manager_secret.dev_whitelist.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${module.iam.cloud_run_service_account_email}"
}

# ── Firestore Security Rules ──────────────────────────────────────────────────
# One ruleset (content-addressed); released to each named database.
# After adding this, remove the deploy-firestore-rules-{dev,prod} CI jobs.

resource "google_firebaserules_ruleset" "firestore" {
  provider = google-beta
  project  = var.project_id

  source {
    files {
      name    = "firestore.rules"
      content = file("${path.module}/../firestore.rules")
    }
  }

  depends_on = [google_project_service.apis]
}

resource "google_firebaserules_release" "firestore" {
  provider     = google-beta
  for_each     = local.environments
  name         = "cloud.firestore/databases/slurp-${each.key}"
  ruleset_name = google_firebaserules_ruleset.firestore.name
  project      = var.project_id

  depends_on = [module.firestore]
}

# ── Firebase Web App (shared across environments) ─────────────────────────────

resource "google_firebase_web_app" "default" {
  provider     = google-beta
  project      = var.project_id
  display_name = "Slurp Web"
  depends_on   = [google_project_service.apis]
}

data "google_firebase_web_app_config" "default" {
  provider   = google-beta
  web_app_id = google_firebase_web_app.default.app_id
  project    = var.project_id
}

# ── Firebase Auth authorized domains ──────────────────────────────────────────

data "google_project" "default" {
  project_id = var.project_id
}

resource "google_identity_platform_config" "default" {
  provider = google-beta
  project  = var.project_id

  authorized_domains = concat(
    ["localhost", "${var.project_id}.firebaseapp.com", "${var.project_id}.web.app"],
    local.custom_domain_set,
    [for env, mod in module.cloud_run_web : trimprefix(mod.url, "https://")],
    [for env in local.environments : "slurp-web-${env}-${data.google_project.default.number}.${var.region}.run.app"]
  )

  sign_in {
    # Google OAuth is managed via the Firebase console / OAuth consent screen,
    # not through this resource — its absence here is intentional.
    email {
      enabled           = true
      password_required = false
    }
  }

  depends_on = [google_project_service.apis]
}

module "cloud_run_web" {
  for_each              = local.environments
  source                = "./modules/cloud-run"
  project_id            = var.project_id
  region                = var.region
  environment           = each.key
  name                  = "slurp-web-${each.key}"
  image                 = "us-docker.pkg.dev/cloudrun/container/hello"
  service_account_email = module.iam.cloud_run_service_account_email
  firestore_database    = "slurp-${each.key}"
  extra_env_vars = {
    FIREBASE_API_KEY     = data.google_firebase_web_app_config.default.api_key
    FIREBASE_AUTH_DOMAIN = each.key == "prod" && var.custom_domain != "" ? var.custom_domain : data.google_firebase_web_app_config.default.auth_domain
    FIREBASE_PROJECT_ID  = var.project_id
    FIREBASE_APP_ID      = google_firebase_web_app.default.app_id
    APP_URL              = each.key == "prod" ? "https://slurp.mklau.net" : "https://slurp-${each.key}.firebaseapp.com"
    API_URL              = "https://slurp-api-${each.key}-${data.google_project.default.number}.${var.region}.run.app"
  }

  depends_on = [google_project_service.apis]
}

# ── Firebase Hosting ──────────────────────────────────────────────────────────

resource "google_firebase_hosting_site" "dev" {
  provider = google-beta
  project  = var.project_id
  site_id  = "slurp-dev"

  depends_on = [google_project_service.apis]
}

resource "google_firebase_hosting_site" "prod" {
  provider = google-beta
  project  = var.project_id
  site_id  = "slurp-prod"

  depends_on = [google_project_service.apis]
}

resource "google_firebase_hosting_custom_domain" "prod" {
  count         = var.custom_domain != "" ? 1 : 0
  provider      = google-beta
  project       = var.project_id
  site_id       = google_firebase_hosting_site.prod.site_id
  custom_domain = var.custom_domain

  depends_on = [google_firebase_hosting_site.prod]
}
