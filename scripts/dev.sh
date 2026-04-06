#!/usr/bin/env bash
# Run all three services locally for end-to-end UI testing.
#
# The receipt processor runs on port 8081 and the API calls it directly
# (RECEIPT_PROCESSOR_URL), bypassing Pub/Sub entirely so the deployed
# dev processor is never involved.
#
# Prerequisites:
#   gcloud auth application-default login
#   cp apps/web/.env.local.example apps/web/.env.local  # fill in Firebase config
#
# Usage: ./dev.sh

set -uo pipefail

cleanup() {
  echo ""
  echo "Stopping all services..."
  kill 0       # SIGTERM to entire process group (all children + grandchildren)
  wait 2>/dev/null
  echo "Done."
}

trap cleanup INT TERM EXIT

GCP_PROJECT="${GOOGLE_CLOUD_PROJECT:-your-gcp-project-id}"
RECEIPT_BUCKET="${RECEIPT_BUCKET:-${GCP_PROJECT}-receipts-dev}"

echo "Starting API on :8080..."
ENVIRONMENT=dev \
  GOOGLE_CLOUD_PROJECT="$GCP_PROJECT" \
  RECEIPT_BUCKET="$RECEIPT_BUCKET" \
  RECEIPT_PROCESSOR_URL="http://localhost:8081" \
  npm run dev --workspace=@slurp/api &

echo "Starting receipt-processor on :8081..."
PORT=8081 \
  ENVIRONMENT=dev \
  GOOGLE_CLOUD_PROJECT="$GCP_PROJECT" \
  RECEIPT_BUCKET="$RECEIPT_BUCKET" \
  npm run dev --workspace=@slurp/receipt-processor &

echo "Starting web on :3000..."
npm run dev --workspace=@slurp/web &

echo ""
echo "All services started:"
echo "  Web:                http://localhost:3000"
echo "  API:                http://localhost:8080"
echo "  Receipt processor:  http://localhost:8081"
echo ""
echo "Press Ctrl+C to stop all services."

wait
