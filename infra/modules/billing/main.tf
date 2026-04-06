resource "google_billing_budget" "project" {
  count           = var.billing_account != "" ? 1 : 0
  billing_account = var.billing_account
  display_name    = "Slurp — ${var.project_id} monthly budget"

  budget_filter {
    projects = ["projects/${var.project_id}"]
  }

  amount {
    specified_amount {
      currency_code = "USD"
      units         = "1000"
    }
  }

  # Thresholds at $5, $10, $15, $20, $25, $30, $50, $100, $1000
  # (expressed as fractions of the $1000 budget)
  threshold_rules { threshold_percent = 0.005 } # $5
  threshold_rules { threshold_percent = 0.01  } # $10
  threshold_rules { threshold_percent = 0.015 } # $15
  threshold_rules { threshold_percent = 0.02  } # $20
  threshold_rules { threshold_percent = 0.025 } # $25
  threshold_rules { threshold_percent = 0.03  } # $30
  threshold_rules { threshold_percent = 0.05  } # $50
  threshold_rules { threshold_percent = 0.10  } # $100
  threshold_rules { threshold_percent = 1.0   } # $1000


}
