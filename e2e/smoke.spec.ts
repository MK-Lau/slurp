import { expect, test } from "@playwright/test";
import { resetEmulators } from "./support/reset-emulators";

const API_URL = "http://127.0.0.1:8081";
const AUTH_EMULATOR_URL = "http://127.0.0.1:9099";

test.beforeEach(async () => {
  await resetEmulators();
});

test("smoke: isolated emulators and all Phase 1 services are healthy", async ({ page, request }) => {
  // Verify web /api/config reports e2e config
  const configRes = await request.get("http://127.0.0.1:3100/api/config");
  expect(configRes.ok()).toBe(true);
  const config = (await configRes.json()) as Record<string, unknown>;
  expect(config.projectId).toBe("slurp-e2e");
  expect(config.firestoreDatabase).toBe("(default)");
  expect(config.apiUrl).toBe("http://127.0.0.1:8081");
  expect(config.authEmulatorUrl).toBe("http://127.0.0.1:9099");
  expect(JSON.stringify(config)).not.toMatch(/slurp-(dev|prod)/);

  // Verify API /health
  const healthRes = await request.get("http://127.0.0.1:8081/health");
  expect(healthRes.ok()).toBe(true);
  const health = (await healthRes.json()) as Record<string, unknown>;
  expect(health.status).toBe("ok");

  const processorRes = await request.get("http://127.0.0.1:8082/health");
  expect(processorRes.ok()).toBe(true);
  await expect(processorRes.json()).resolves.toMatchObject({ status: "ok" });

  const pageRes = await page.goto("/");
  expect(pageRes?.ok()).toBe(true);
  await expect(page).toHaveURL("http://127.0.0.1:3100/login");
  await expect(page.getByRole("button", { name: "Sign in with email" })).toBeVisible();
});

test("Auth Emulator tokens are accepted while missing and forged tokens are rejected", async ({ request }) => {
  const missing = await request.get(`${API_URL}/profile`);
  expect(missing.status()).toBe(401);

  const forged = await request.get(`${API_URL}/profile`, {
    headers: { Authorization: "Bearer not-a-valid-firebase-token" },
  });
  expect(forged.status()).toBe(401);

  const signUp = await request.post(
    `${AUTH_EMULATOR_URL}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`,
    {
      data: {
        email: "phase1-auth@example.test",
        password: "phase1-password",
        returnSecureToken: true,
      },
    }
  );
  expect(signUp.ok(), await signUp.text()).toBe(true);
  const { idToken } = (await signUp.json()) as { idToken?: string };
  expect(idToken).toBeTruthy();

  const authenticated = await request.get(`${API_URL}/profile`, {
    headers: { Authorization: `Bearer ${idToken}` },
  });
  expect(authenticated.ok(), await authenticated.text()).toBe(true);
  await expect(authenticated.json()).resolves.toMatchObject({ preferredCurrency: "USD" });
});
