output "topic_name" {
  description = "Pub/Sub topic name"
  value       = google_pubsub_topic.receipts.name
}
