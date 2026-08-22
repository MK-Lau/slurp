# Testing

## Unit tests

```bash
npm run typecheck   # typecheck all workspaces
npm run lint        # lint all workspaces
npm test            # unit tests in all workspaces + E2E support tests (e2e/support/*.test.ts)
npm run build       # build all workspaces
npm run test --workspace=@slurp/api   # single workspace
```

## End-to-end (E2E) tests

E2E tests use **Playwright** against isolated **Firebase Auth & Firestore emulators** under the fixed fake project `slurp-e2e`. No `gcloud` login, service-account key, real Firebase project, GCS, Pub/Sub, Gemini, or internet-hosted services are required.

### Prerequisites

- **Node.js** 20+, **npm** 11+
- **Java** 21+ (Firestore Emulator requirement — checked by `firebase-tools`)
- **Chromium** via Playwright:
  ```bash
  npm ci
  npx playwright install chromium
  # or with system deps (needed on clean Ubuntu/CI):
  npx playwright install --with-deps chromium
  ```

### First-time setup

```bash
npm ci
npx playwright install chromium
```

### Running E2E

All E2E runs use the hermetic emulator project `slurp-e2e`. Ports are fixed (see below). The orchestrator `scripts/run-e2e-services.mjs` refuses to start if any are occupied.

```bash
# Headless full suite (what CI runs) — emulators are started automatically
npm run test:e2e

# Headed / debug
npm run test:e2e:debug      # headed with inspector
npm run test:e2e:ui         # Playwright UI mode

# Single spec / filtered (must run inside emulators; npm run test:e2e starts them automatically)
npx firebase emulators:exec --project slurp-e2e --only auth,firestore "npx playwright test e2e/receipt.spec.ts"
npx firebase emulators:exec --project slurp-e2e --only auth,firestore "npx playwright test -g \"host-guest\""

# Via the raw Playwright command under the emulators (equivalent to test:e2e)
npx firebase emulators:exec --project slurp-e2e --only auth,firestore "npx playwright test"
```

### Fixed ports

| Service | Port | URL |
|---------|------|-----|
| Web (Next.js) | 3100 | http://127.0.0.1:3100 |
| API (Express) | 8081 | http://127.0.0.1:8081 |
| Receipt processor | 8082 | http://127.0.0.1:8082 |
| Firestore emulator | 8085 | 127.0.0.1:8085 |
| Auth emulator | 9099 | 127.0.0.1:9099 |

All addresses use `127.0.0.1` (not `localhost`) to avoid origin/CORS mismatch. If a port is already in use, the E2E run fails fast with `E2E port <port> is already in use`. Stop any dev server on 3000/8080/8081/8082/8085/9099 or conflicting processes and retry. `lsof -i :3100 -sTCP:LISTEN -n -P` (macOS/Linux) helps locate the holder.

### Emulator / no-cloud guarantees

- The suite runs on `slurp-e2e` with `FIRESTORE_EMULATOR_HOST=127.0.0.1:8085` and `FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099`. The `slurp-dev` / `slurp-prod` Firestore databases are never touched.
- `e2e/support/reset-emulators.ts` refuses to run unless both emulator hosts are loopback and every configured project ID is exactly `slurp-e2e`. It clears Firestore `emulator/v1/.../documents` and Auth `emulator/v1/.../accounts` between tests.
- No `GOOGLE_APPLICATION_CREDENTIALS`, ADC, or GCP/Firebase secrets are required. `npx firebase emulators:exec --project slurp-e2e` supplies the fake project; the API and processor are started with `GOOGLE_CLOUD_PROJECT=slurp-e2e`.

### Email-link auth flow in E2E

Authenticated tests exercise the **real login UI**: they click “Sign in with email”, submit a unique `e2e-<timestamp>-<rand>@example.com` address, assert the “Check your inbox” state, then poll the Auth Emulator OOB endpoint `GET http://127.0.0.1:9099/emulator/v1/projects/slurp-e2e/oobCodes` for the `EMAIL_SIGNIN` entry for that address, navigate the **same page/context** to the returned `oobLink` (which 303s to the app’s `continueUrl` at `http://127.0.0.1:3100`), and complete onboarding if shown. `localStorage.emailForSignIn` is preserved because the link is opened in the same context. Reusing an OOB link is expected to fail with an “expired / already used” error.

### Receipt safety model

Production receipt processing uses GCS signed PUT URLs → Pub/Sub → Gemini via GCS URI → Firestore. In E2E (`ENVIRONMENT=e2e`) a tightly guarded local path is used:

- `E2E_RECEIPT_UPLOAD_BASE_URL` (e.g. `http://127.0.0.1:8082`) replaces the GCS signed URL; the API returns `http://127.0.0.1:8082/e2e-upload/<encoded gcsPath>` and the processor’s `PUT /e2e-upload/:encodedPath` validates MIME (`image/jpeg`/`image/png`), size (≤ 10 MB), and path.
- The processor selects a deterministic `fixture` parser instead of Gemini. The browser still exercises upload → `POST /receipt/process` → processor → Firestore `receiptStatus` (`pending` → `processing` → `done`) → UI polling (2 s) → navigation to detail.
- Guard: E2E upload and fixture parsing are rejected unless **all** of `ENVIRONMENT === "e2e"`, `RECEIPT_PARSER === "fixture"`, every configured project ID is `slurp-e2e`, `FIRESTORE_EMULATOR_HOST` is loopback with an explicit port, and the upload base URL is loopback `http:`. Outside `e2e` the local `PUT /e2e-upload` returns `404`.
- Negative receipt test verifies that an oversize image (> 10 MB) is rejected in the UI without performing an upload.

### Traces, screenshots, video

`playwright.config.ts` records traces, screenshots, and video on failure (`trace: retain-on-failure`, `screenshot: only-on-failure`, `video: retain-on-failure`) to `playwright-report/` and `test-results/`. In CI these are uploaded on failure.

View locally after a failed run:

```bash
npx playwright show-report           # opens playwright-report/
npx playwright show-trace test-results/<spec>/trace.zip
```

To force traces for a single run: `npx playwright test --trace on`.

### Troubleshooting

- **`E2E port <port> is already in use`** — stop the holder (`lsof -i :3100 -sTCP:LISTEN`), then retry.
- **Emulator fails to start / Java missing** — install Java 21 (`actions/setup-java` in CI; locally `brew install openjdk@21` or `apt install openjdk-21-jre`).
- **Chromium missing** — `npx playwright install --with-deps chromium`.
- **`GOOGLE_CLOUD_PROJECT` / `FIREBASE_PROJECT_ID` mismatch** — reset helpers require exactly `slurp-e2e` and loopback hosts; do not point `FIRESTORE_EMULATOR_HOST` / `FIREBASE_AUTH_EMULATOR_HOST` at a real project.
- **Stale `firestore-debug.log`** — ignored via `.gitignore`; delete it if it grows large.

### Test-writing conventions

- **Isolation:** each spec calls `resetEmulators()` (or relies on a fresh `beforeEach`) and uses unique emails/IDs (`uniqueEmail()`, random suffixes) so parallelization can be introduced safely later. Current config uses `workers: 1` because the emulator reset is global.
- **Selectors:** prefer accessible names — `getByRole`, `getByLabel`, `getByPlaceholder`, visible headings/text. Add `data-testid` only when no stable accessible target exists. Use `expect(...).toBeVisible()`, `toHaveURL`, `toHaveValue`, `toHaveCount`, and `expect.poll(...)` rather than arbitrary `waitForTimeout`.
- **Timing:** wait for URL transitions, response status, visible states, or `expect.poll` conditions; never `page.waitForTimeout`. The orchestrator exposes `/health` and `/api/config` for readiness; the `webServer` block waits for `http://127.0.0.1:8081/health`.
- **Auth:** exercise the real email-link UI and `pollOobLinkForEmail` per unique address; do not inject fake tokens or bypass `requireAuth`.
- **Receipts:** use `e2e/assets/receipt.png`; assert deterministic fixture values via literals (not by importing `fixtureParser`).
