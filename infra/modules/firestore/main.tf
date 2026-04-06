resource "google_firestore_database" "default" {
  project                           = var.project_id
  name                              = "slurp-${var.environment}"
  location_id                       = var.region
  type                              = "FIRESTORE_NATIVE"
  delete_protection_state           = var.environment == "prod" ? "DELETE_PROTECTION_ENABLED" : "DELETE_PROTECTION_DISABLED"
  deletion_policy                   = var.environment == "prod" ? "ABANDON" : "DELETE"
  point_in_time_recovery_enablement = var.environment == "prod" ? "POINT_IN_TIME_RECOVERY_ENABLED" : "POINT_IN_TIME_RECOVERY_DISABLED"
}

resource "google_firestore_backup_schedule" "daily" {
  count    = var.environment == "prod" ? 1 : 0
  project  = var.project_id
  database = google_firestore_database.default.name

  retention = "1209600s" # 14 days

  daily_recurrence {}
}

resource "google_firestore_index" "slurps_host_uid_created_at" {
  project    = var.project_id
  database   = google_firestore_database.default.name
  collection = "slurps"

  fields {
    field_path = "hostUid"
    order      = "ASCENDING"
  }
  fields {
    field_path = "createdAt"
    order      = "DESCENDING"
  }
}

resource "google_firestore_index" "slurps_participant_emails_created_at" {
  project    = var.project_id
  database   = google_firestore_database.default.name
  collection = "slurps"

  fields {
    field_path   = "participantEmails"
    array_config = "CONTAINS"
  }
  fields {
    field_path = "createdAt"
    order      = "DESCENDING"
  }
}
