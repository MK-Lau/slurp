# ── Gemini call count ─────────────────────────────────────────────────────────

resource "google_logging_metric" "gemini_call_count" {
  project = var.project_id
  name    = "slurp/gemini_call_count"
  filter  = "resource.type=\"cloud_run_revision\" resource.labels.service_name=~\"slurp-receipt-processor\" jsonPayload.msg=\"gemini_call_complete\""

  metric_descriptor {
    metric_kind  = "DELTA"
    value_type   = "INT64"
    display_name = "Slurp: Gemini Call Count"
  }
}

# ── Gemini call duration ───────────────────────────────────────────────────────

resource "google_logging_metric" "gemini_call_duration" {
  project = var.project_id
  name    = "slurp/gemini_call_duration_ms"
  filter  = "resource.type=\"cloud_run_revision\" resource.labels.service_name=~\"slurp-receipt-processor\" jsonPayload.msg=\"gemini_call_complete\""

  metric_descriptor {
    metric_kind  = "DELTA"
    value_type   = "DISTRIBUTION"
    unit         = "ms"
    display_name = "Slurp: Gemini Call Duration (ms)"
  }

  value_extractor = "EXTRACT(jsonPayload.durationMs)"

  bucket_options {
    explicit_buckets {
      bounds = [500, 1000, 2000, 5000, 10000, 20000, 30000, 60000]
    }
  }
}

# ── Slurp created count ───────────────────────────────────────────────────────

resource "google_logging_metric" "slurp_created_count" {
  project = var.project_id
  name    = "slurp/created_count"
  filter  = "resource.type=\"cloud_run_revision\" resource.labels.service_name=~\"slurp-api\" jsonPayload.message=\"slurp_created\""

  metric_descriptor {
    metric_kind  = "DELTA"
    value_type   = "INT64"
    display_name = "Slurp: Created Count"
  }
}
