import { expect, type Page } from "@playwright/test";

export function uniqueEmail(): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `e2e-${Date.now()}-${rand}@example.com`;
}

function authEmulatorHost(): string {
  const raw = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? "127.0.0.1:9099";
  return raw.replace(/^https?:\/\//, "");
}

function projectId(): string {
  return process.env.GOOGLE_CLOUD_PROJECT ?? process.env.FIREBASE_PROJECT_ID ?? "slurp-e2e";
}

interface OobCodeEntry {
  oobCode: string;
  oobLink: string;
  email: string;
  requestType: string;
}

export async function pollOobLinkForEmail(email: string, timeoutMs = 15000): Promise<string> {
  const host = authEmulatorHost();
  const pid = projectId();
  const url = `http://${host}/emulator/v1/projects/${pid}/oobCodes`;
  const deadline = Date.now() + timeoutMs;
  const target = email.toLowerCase();
  let lastBody = "";
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      lastBody = await res.text();
      if (res.ok) {
        const data = JSON.parse(lastBody) as { oobCodes?: OobCodeEntry[] };
        const codes = data.oobCodes ?? [];
        const match = codes.find((c) => c.email.toLowerCase() === target && c.requestType === "EMAIL_SIGNIN");
        if (match?.oobLink) return match.oobLink;
        // fallback: exact email match regardless of type (should be EMAIL_SIGNIN)
        const anyMatch = codes.find((c) => c.email.toLowerCase() === target);
        if (anyMatch?.oobLink) return anyMatch.oobLink;
      }
    } catch {
      // ignore and retry
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`Timed out polling OOB code for ${email} at ${url} — last body: ${lastBody}`);
}

export function sanitizeRedirectForTest(raw: string, origin: string): string {
  try {
    const url = new URL(raw, origin);
    if (url.origin !== origin) return "/";
    return url.pathname + url.search + url.hash;
  } catch {
    return "/";
  }
}

async function completeOnboardingIfShown(page: Page, displayName: string): Promise<boolean> {
  let shown = false;
  try {
    await page.getByText("Welcome to Slurp").waitFor({ state: "visible", timeout: 2000 });
    shown = true;
  } catch {
    shown = false;
  }
  if (!shown) return false;
  const nameInput = page.locator("#onboardingDisplayName");
  await expect(nameInput).toBeVisible({ timeout: 5000 });
  await nameInput.fill("");
  await nameInput.fill(displayName);
  const submit = page.getByRole("button", { name: /Get started/i });
  await expect(submit).toBeVisible({ timeout: 5000 });
  await submit.click();
  await expect(page.getByText("Welcome to Slurp")).toBeHidden({ timeout: 10000 });
  return true;
}

/**
 * Reusable auth helper that uses the actual login UI, polls the Auth Emulator
 * OOB endpoint for the exact unique email, navigates the SAME page/context to
 * the action link, and completes onboarding if shown.
 * Fails hard if sign-in does not reach the exact expected redirect/authenticated state.
 */
export async function signInViaEmailLink(
  page: Page,
  opts: { email?: string; redirect?: string; displayName?: string } = {}
): Promise<{ email: string; displayName: string }> {
  const email = opts.email ?? uniqueEmail();
  const redirect = opts.redirect ?? "/";
  const displayName = opts.displayName ?? (email.split("@")[0].slice(0, 12) || "Test User");

  // Navigate to login with redirect (same page/context will be reused)
  const loginUrl = redirect !== "/" ? `/login?redirect=${encodeURIComponent(redirect)}` : "/login";
  await page.goto(loginUrl);
  await expect(page.getByRole("button", { name: /Sign in with email/i })).toBeVisible({ timeout: 10000 });
  await page.getByRole("button", { name: /Sign in with email/i }).click();

  const emailInput = page.getByPlaceholder("you@example.com").first();
  await expect(emailInput).toBeVisible({ timeout: 5000 });
  await emailInput.fill(email);

  const sendBtn = page.getByRole("button", { name: /Send sign-in link/i });
  await expect(sendBtn).toBeEnabled({ timeout: 5000 });
  await sendBtn.click();

  // Wait for email-sent confirmation
  await expect(page.getByText(/Check your inbox/i)).toBeVisible({ timeout: 10000 });
  await expect(page.getByText(email)).toBeVisible({ timeout: 5000 });

  const oobLink = await pollOobLinkForEmail(email);

  // Navigate SAME page/context to the emulator action link (follows 303 to continueUrl)
  await page.goto(oobLink);
  // The emulator redirects to continueUrl (http://127.0.0.1:3100/login?redirect=...&mode=signIn&...).
  // Wait for app to settle. Firebase JS SDK will auto-complete via localStorage emailForSignIn.
  await page.waitForLoadState("domcontentloaded");

  const origin = new URL(page.url()).origin;
  const expectedRedirect = sanitizeRedirectForTest(redirect, origin);

  // Condition-based wait: either onboarding appears or we reach the exact redirect.
  // No swallowed failures — timeout propagates as hard failure. No arbitrary sleeps.
  await page.waitForFunction(
    ({ expected }) => {
      const hasOnboarding = !!document.body.textContent?.includes("Welcome to Slurp");
      const cur = window.location.pathname + window.location.search + window.location.hash;
      return hasOnboarding || cur === expected;
    },
    { expected: expectedRedirect },
    { timeout: 10000 }
  );

  // If onboarding is visible, complete it and propagate any failure — do not swallow.
  if (await page.getByText("Welcome to Slurp").isVisible()) {
    await completeOnboardingIfShown(page, displayName);
  }

  // Must reach the exact expected redirect/authenticated state — fail hard otherwise.
  await page.waitForURL(
    (url) => {
      const u = new URL(url.toString());
      return u.pathname + u.search + u.hash === expectedRedirect;
    },
    { timeout: 15000 }
  );

  // Final hard assertions: at exact redirect and not stuck on login with oobCode.
  await expect(page).not.toHaveURL(/\/login.*oobCode/, { timeout: 5000 });
  {
    const cur = new URL(page.url());
    const pq = cur.pathname + cur.search + cur.hash;
    if (expectedRedirect !== "/") {
      expect(pq).toBe(expectedRedirect);
    } else {
      expect(cur.pathname).not.toBe("/login");
      expect(pq).toBe(expectedRedirect);
    }
  }

  return { email, displayName };
}
