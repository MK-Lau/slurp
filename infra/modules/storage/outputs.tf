output "receipt_bucket_name" {
  value = google_storage_bucket.receipts.name
}

output "receipt_bucket_url" {
  value = google_storage_bucket.receipts.url
}
