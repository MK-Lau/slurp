output "budget_name" {
  description = "Resource name of the billing budget"
  value       = length(google_billing_budget.project) > 0 ? google_billing_budget.project[0].name : null
}
