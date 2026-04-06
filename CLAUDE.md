# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Slurp** is a receipt-splitting web application. Users create "slurps" (expense splits), add items from a receipt (parsed via Gemini AI), invite participants, and calculate individual shares with tax/tip.

## Monorepo Structure

npm workspaces monorepo (Node.js >=20):
- `apps/api` — Express.js backend (`@slurp/api`)
- `apps/web` — Next.js 16 frontend (`@slurp/web`)
- `apps/receipt-processor` — Pub/Sub push subscriber that calls Gemini and writes items to Firestore (`@slurp/receipt-processor`)
- `packages/types` — Shared TypeScript types (`@slurp/types`)
- `infra/` — Terraform for GCP infrastructure

## Commands

```bash
# Install
npm install

# Development (run simultaneously)
ENVIRONMENT=dev GOOGLE_CLOUD_PROJECT=<YOUR_GCP_PROJECT_ID> npm run dev --workspace=@slurp/api  # port 8080
npm run dev --workspace=@slurp/web  # port 3000
# Receipt processor (optional, for local testing)
ENVIRONMENT=dev GOOGLE_CLOUD_PROJECT=<YOUR_GCP_PROJECT_ID> RECEIPT_BUCKET=<YOUR_RECEIPT_BUCKET> npm run dev --workspace=@slurp/receipt-processor  # port 8080

# Build
npm run build                                # all workspaces
npm run build --workspace=@slurp/api

# Test
npm test                                     # all workspaces
npm test --workspace=@slurp/api

# Lint
npm run lint                                 # all workspaces
npm run lint --workspace=@slurp/api
```

## Architecture

**Stack**: Express.js API + Next.js frontend + receipt-processor, all deployed to Cloud Run. Firestore as database, Firebase Auth for authentication, Cloud Storage for receipt images, Pub/Sub for async job dispatch, Gemini AI (Vertex AI) for receipt parsing.

**Security model**: Firestore client reads and writes are blocked entirely for slurps — all access goes through the API using Firebase Admin SDK. Firebase Auth tokens are verified server-side. Receipt bucket is private (no public access); signed URLs are used for client uploads (PUT only).

**Async receipt flow**: Client → `POST /slurps/:id/receipt/upload-url` (get V4 signed PUT URL) → PUT image to GCS → `POST /slurps/:id/receipt/process` (publish Pub/Sub message) → receipt-processor Cloud Run (Pub/Sub push) → Gemini parses via `file_data` GCS URI → Firestore updated with items + `receiptStatus`. Frontend polls `GET /slurps/:id` every 2 seconds until `receiptStatus` is `done` or `failed`.

**API routes**:
- `apps/api/src/routes/slurps.ts`: `GET/POST /slurps`, `GET/PATCH /slurps/:id`, `POST /slurps/:id/items`, `POST /slurps/:id/invite`, `POST /slurps/:id/join`, `PUT /slurps/:id/selections`, `POST /slurps/:id/confirm`, `GET /slurps/:id/summary`
- `apps/api/src/routes/receipt.ts`: `POST /slurps/:id/receipt/upload-url`, `POST /slurps/:id/receipt/process`

**Firestore data model**: `slurps/{slurpId}` documents contain title, taxPercent/taxAmount, tipPercent/tipAmount, participants array (with uid/email/selections), items array (with id/name/price), receiptStatus (`pending`|`processing`|`done`|`failed`), receiptPath, receiptError, and confirmed flag.

**Infra modules**: `infra/modules/iam`, `storage`, `cloud-run`, `firestore`, `artifact-registry`, `billing`, `pubsub`. Three Cloud Run services per env: `slurp-api`, `slurp-web`, `slurp-receipt-processor` (not public).

**Environments**: Dev uses `slurp-dev` Firestore database and `slurp-api-dev`/`slurp-web-dev` Cloud Run services. Prod uses `slurp-prod` database and equivalent services. Local dev connects to the shared `slurp-dev` Firestore via gcloud ADC.

## Local Dev Setup

Requires gcloud authenticated with ADC:
```bash
gcloud auth application-default login
cp apps/web/.env.local.example apps/web/.env.local
# Fill in Firebase client config and set API_URL=http://localhost:8080
```

## CI/CD

### pr-checks.yml (on PR to master)
1. **terraform-validate** — runs `terraform validate` (no GCP auth required)
2. **build-and-test** — `npm ci` → lint → unit tests

### deploy-dev.yml (on push to master or manual dispatch; does NOT run on tag pushes)
Runs in dependency order:
1. **build-and-test** + **terraform-validate** (parallel)
2. **build-and-push-{api,web,receipt-processor}** (parallel, after above) — Docker build tagged `git-<sha>` and `dev-latest`, Trivy image scan, pushed to Artifact Registry
3. **deploy-{api,web,receipt-processor}-dev** (after their respective build jobs) — `gcloud run deploy` with the SHA-tagged image
4. **deploy-firestore-rules-dev** (independent) — deploys `firestore.rules` to the `slurp-dev` database via Firebase CLI

### deploy-prod.yml (manual `workflow_dispatch` or push of `v*.*.*` tag)
1. **build-and-test** + **terraform-validate** (parallel)
2. **deploy-{api,web,receipt-processor}-prod** (gated by `environment: production`) — deploys using the image tag from the dispatch input (defaults to `dev-latest`) or the git tag name on tag pushes
3. **tag-{api,web,receipt-processor}-prod-latest** — retags the deployed image as `prod-latest` in Artifact Registry
4. **deploy-firebase-hosting-prod** — deploys Firebase Hosting
5. **deploy-firestore-rules-prod** — deploys rules to `slurp-prod`

Images are tagged `git-<7-char-sha>` and `{env}-latest`. Env vars (including `FIRESTORE_DATABASE`, Firebase config, `API_URL`) are managed by Terraform and injected into Cloud Run at deploy time — no env vars are baked into Docker images.

To promote a specific dev build to prod: trigger `deploy-prod.yml` via `workflow_dispatch` and supply the `git-<sha>` tag.

**Important**: after adding or updating npm dependencies, always run `npm install` and commit the updated `package-lock.json`. Docker builds use `npm ci` which requires the lock file to be in sync.

## Terraform

Terraform state is stored in GCS. To init locally:
```bash
cd infra
terraform init -backend-config=backends/unified.gcs.tfbackend
terraform apply -var-file=vars/main.tfvars
```

Both `infra/vars/main.tfvars` and `infra/backends/unified.gcs.tfbackend` are gitignored. Copy from their `.example` counterparts and fill in your values.
