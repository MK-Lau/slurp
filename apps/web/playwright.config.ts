import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  retries: 0,
  use: {
    baseURL: "http://localhost:3100",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npx next dev --port 3100",
    url: "http://localhost:3100/e2e/fixed-shares",
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      E2E_TEST: "1",
      APP_URL: "http://localhost:3100",
      API_URL: "http://localhost:8080",
      FIREBASE_API_KEY: "test-api-key",
      FIREBASE_AUTH_DOMAIN: "localhost",
      FIREBASE_PROJECT_ID: "slurp-e2e",
      FIREBASE_APP_ID: "1:123:web:e2e",
      FIRESTORE_DATABASE: "(default)",
    },
  },
});
