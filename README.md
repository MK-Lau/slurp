# Slurp

A receipt-splitting web app. Create a split, upload a receipt, invite participants, let everyone pick their items, and get a breakdown of who owes what including tax and tip.

## Features

- **Receipt parsing** — upload a photo of a receipt and Gemini AI extracts all items and prices
- **Manual item entry** — add items by hand if you don't have a receipt
- **Invite links** — share a link with participants; no account required to join
- **Item selection** — each participant picks the items they ordered
- **Tax & tip splitting** — split proportionally across confirmed selections
- **Settlement summary** — see exactly who owes whom and how much
- **Currency conversion** — support for bills in a foreign currency (e.g., JPY) with automatic conversion to a home currency (e.g., USD)
- **Venmo integration** — optional Venmo username on profiles generates payment links in the summary

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16, React 18, Tailwind CSS 3 |
| Backend | Express.js 4, Node.js 20+ |
| Database | Cloud Firestore |
| Auth | Firebase Authentication |
| Receipt storage | Google Cloud Storage |
| Receipt processing | Vertex AI (Gemini), Cloud Pub/Sub |
| Infra | Google Cloud Run, Terraform |
| Language | TypeScript 5 throughout |

## Repository Structure

```
├── apps/
│   ├── api/                 # Express.js API server (port 8080)
│   ├── web/                 # Next.js frontend (port 3000)
│   └── receipt-processor/   # Pub/Sub push subscriber — calls Gemini, writes items to Firestore
├── packages/
│   └── types/               # Shared TypeScript types
├── infra/                   # Terraform (GCP infrastructure)
├── docs/                    # Setup guides and ADRs
└── .github/workflows/       # CI/CD pipelines
```

## Local Development

### Prerequisites

- **Node.js** 20+, **npm** 11+
- **Google Cloud SDK** (`gcloud`) authenticated with ADC:
  ```bash
  gcloud auth application-default login
  ```
- Access to a GCP project with Firestore, Cloud Storage, Pub/Sub, and Vertex AI enabled (see [GCP Bootstrap](#self-hosting))

### Setup

```bash
git clone <repo>
cd slurp
npm install

# Web env
cp apps/web/.env.local.example apps/web/.env.local
# → Fill in Firebase client config (apiKey, authDomain, projectId, appId)
# → Set API_URL=http://localhost:8080

# API env (only needed for receipt processing)
cp apps/api/.env.example apps/api/.env
# → Fill in GCP_PROJECT_ID, RECEIPT_BUCKET, GEMINI_API_KEY, FIREBASE_CREDENTIALS
```

### Running

Open three terminals:

```bash
# Terminal 1 — API
ENVIRONMENT=dev GCP_PROJECT_ID=<your-project> npm run dev --workspace=@slurp/api

# Terminal 2 — Web
npm run dev --workspace=@slurp/web

# Terminal 3 — Receipt processor (optional, only needed for receipt upload testing)
ENVIRONMENT=dev GCP_PROJECT_ID=<your-project> RECEIPT_BUCKET=<your-bucket> npm run dev --workspace=@slurp/receipt-processor
```

Visit `http://localhost:3000`.

### Other Commands

```bash
npm run build          # Build all workspaces
npm test               # Run all tests
npm run lint           # Lint all workspaces

# Per-workspace
npm run build --workspace=@slurp/api
npm test --workspace=@slurp/api
```

## Architecture

### Request Flow

```
Browser (Next.js)
  │
  ├─ Firebase Auth → ID token on every API request
  │
  └─ Express API (Cloud Run)
       ├─ Firestore (reads/writes via Admin SDK)
       ├─ Cloud Storage (issues signed PUT URLs for receipt uploads)
       └─ Pub/Sub (publishes receipt processing jobs)
            │
            └─ Receipt Processor (Cloud Run, Pub/Sub push)
                 ├─ Vertex AI Gemini (parses receipt image via GCS URI)
                 └─ Firestore (writes parsed items + receiptStatus)

Browser also holds a Firestore onSnapshot listener on the slurp document
→ updates in real time when receipt processing completes
```

### Security Model

- All Firestore writes go through the API using the Firebase Admin SDK — client-side writes are denied by Firestore security rules
- Firebase ID tokens are verified server-side on every request
- Receipt images are stored in a private GCS bucket; clients receive a time-limited signed URL (PUT only) to upload directly
- Invite tokens are compared using `crypto.timingSafeEqual` to prevent timing attacks
- Rate limiting: per-user limits on slurp creation and receipt processing
- CSP with per-request nonces; no `unsafe-eval` or `unsafe-inline` in `script-src`

### Firestore Data Model

**`slurps/{slurpId}`**
```typescript
{
  id, title, hostUid, hostEmail,
  taxAmount, tipAmount,           // in home currency cents
  items: [{ id, name, price }],
  participants: [{
    uid, email, displayName,
    role: "host" | "guest",
    status: "pending" | "confirmed",
    selectedItemIds: string[],
    paid?: boolean
  }],
  inviteToken: string,            // UUID
  receiptStatus: "pending" | "processing" | "done" | "failed",
  receiptPath?: string,           // GCS path
  currencyConversion: {
    enabled, billedCurrency, homeCurrency, exchangeRate
  },
  createdAt, updatedAt
}
```

**`users/{uid}`**
```typescript
{
  displayName?, venmoUsername?, preferredCurrency?
}
```

## Self-Hosting

Slurp runs on GCP. You'll need a GCP project with billing enabled.

### 1. Configure Terraform variables

Copy the example vars file and fill in your values:

```bash
cp infra/vars/main.tfvars.example infra/vars/main.tfvars
```

Edit `infra/vars/main.tfvars`:

```hcl
project_id             = "your-gcp-project-id"
region                 = "us-central1"
billing_account        = "XXXXXX-XXXXXX-XXXXXX"   # optional — only needed for billing budgets
custom_domain          = "your-domain.com"          # leave blank to skip custom domain
receipt_bucket_prefix  = "your-project-receipts"
terraform_state_bucket = "your-project-terraform-state"
github_repository      = "your-github-org/your-repo"
```

`infra/vars/main.tfvars` is gitignored — your real values will never be committed.

### 2. Bootstrap GCP

Before running Terraform you need to manually create two resources (everything else is managed by Terraform):

```bash
# 1. Create the GCP project
gcloud projects create <project_id>
gcloud billing projects link <project_id> --billing-account=<billing_account>

# 2. Create the Terraform state bucket
gcloud storage buckets create gs://<terraform_state_bucket> \
  --project=<project_id> \
  --location=us-central1
gcloud storage buckets update gs://<terraform_state_bucket> --versioning

# 3. Enable the APIs Terraform needs
gcloud services enable cloudresourcemanager.googleapis.com iam.googleapis.com --project=<project_id>
```

### 3. Run Terraform

```bash
cd infra
terraform init -backend-config=backends/unified.gcs.tfbackend
terraform apply -var-file=vars/main.tfvars
```

This provisions Cloud Run, Firestore, Cloud Storage, Pub/Sub, Artifact Registry, IAM service accounts, and Workload Identity Federation for GitHub Actions.

### 4. Set GitHub Actions variables

After `terraform apply`, set these repository variables in GitHub (Settings → Secrets and variables → Actions):

| Variable | Value |
|---|---|
| `GCP_PROJECT_ID` | your GCP project ID |
| `GCP_REGION` | `us-central1` |
| `GCP_SA_EMAIL` | output of `terraform output github_actions_service_account_email` |
| `WIF_PROVIDER` | output of `terraform output workload_identity_provider` |
| `ARTIFACT_REGISTRY_URL` | output of `terraform output artifact_registry_url` |

### 5. Firebase setup

1. Go to [Firebase console](https://console.firebase.google.com/) → Add project → select your GCP project
2. Enable **Authentication** with Email/Password and Google providers
3. Add a Web app to get the Firebase client config → copy values into `apps/web/.env.local`
4. Create a service account key for the API → set as `FIREBASE_CREDENTIALS` secret in Cloud Run (via Secret Manager)

### Infrastructure Overview

Terraform (`infra/`) provisions:

- **Cloud Run** — three services per environment: `slurp-api`, `slurp-web`, `slurp-receipt-processor`
- **Firestore** — two named databases: `slurp-dev`, `slurp-prod`
- **Cloud Storage** — receipt image bucket per environment
- **Pub/Sub** — topic + push subscription wiring API → receipt processor
- **Artifact Registry** — Docker image repository
- **IAM** — service accounts and Workload Identity Federation for GitHub Actions

Environments (`dev`, `prod`) are controlled via a single `infra/vars/main.tfvars` file and deployed via separate GitHub Actions workflows.

## CI/CD

| Workflow | Trigger | What it does |
|---|---|---|
| `pr-checks.yml` | PR to `master` | Lint + test, Terraform plan for dev + prod (posts plan as PR comment) |
| `deploy-dev.yml` | Push to `master` | Terraform apply → build + push Docker images → deploy to Cloud Run dev |
| `deploy-prod.yml` | Manual dispatch or `v*.*.*` tag | Terraform apply → deploy to Cloud Run prod → retag images as `prod-latest` |

Docker images are tagged `git-<7-char-sha>` and `{env}-latest`. No secrets are baked into images — all env vars are injected at Cloud Run deploy time by Terraform.

To promote a dev build to prod, trigger `deploy-prod.yml` via `workflow_dispatch` and supply the `git-<sha>` tag.

## License

Copyright (C) 2026 Michael Lau

This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.

See [LICENSE](./LICENSE) for details.
