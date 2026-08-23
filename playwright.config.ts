import { defineConfig, devices } from "@playwright/test";

// Ensure Playwright test workers have e2e project env even if outer
// firebase emulators:exec wrapper doesn't propagate GOOGLE_CLOUD_PROJECT
// via shell env (portable: JS assignment, not POSIX `VAR=val cmd` syntax).
process.env.GOOGLE_CLOUD_PROJECT ??= "slurp-e2e";
process.env.FIREBASE_PROJECT_ID ??= "slurp-e2e";
process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8085";
process.env.FIREBASE_AUTH_EMULATOR_HOST ??= "127.0.0.1:9099";

export default defineConfig({
  testDir: "./e2e",
  testIgnore: /.*\.test\.ts/,
  globalTimeout: process.env.CI ? 10 * 60_000 : undefined,
  timeout: 90_000,
  expect: { timeout: 5_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["line"], ["html", { open: "never" }]] : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:3100",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npm run test:e2e:services",
    url: "http://127.0.0.1:8081/health",
    timeout: 120_000,
    reuseExistingServer: false,
  },
});
