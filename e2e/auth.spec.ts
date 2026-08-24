import { test, expect, signInViaEmailLink, uniqueEmail, pollOobLinkForEmail } from "./fixtures/test";
import { resetEmulators } from "./support/reset-emulators";

async function clickSidebarSignOut(page: import("@playwright/test").Page): Promise<void> {
  const btn = page.getByRole("button", { name: /^Sign out$/ }).first();
  await expect(btn).toBeVisible({ timeout: 10000 });
  // Bypass Playwright hit-testing / dev overlay intercept
  await btn.evaluate((el: HTMLElement) => el.click());
}

test.describe("authenticated", () => {
  test("authenticated: real email-link sign-in through UI + Auth Emulator OOB reaches protected route", async ({
    page,
  }) => {
    await resetEmulators();
    const email = uniqueEmail();
    const displayName = `User${Math.random().toString(36).slice(2, 6)}`;

    await signInViaEmailLink(page, { email, displayName, redirect: "/slurp" });

    await expect(page).toHaveURL(/\/slurp/, { timeout: 10000 });
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.getByRole("button", { name: /^Sign out$/ }).first()).toBeVisible({ timeout: 10000 });
    await page.goto("/profile");
    await expect(page).toHaveURL(/\/profile/, { timeout: 10000 });
    await expect(page.getByRole("heading", { name: /Profile/i })).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(email).first()).toBeVisible({ timeout: 10000 });
  });

  test("authenticated: new-user onboarding persists profile via API/UI", async ({ page }) => {
    await resetEmulators();
    const email = uniqueEmail();
    const displayName = `Persist${Math.random().toString(36).slice(2, 6)}`;

    await signInViaEmailLink(page, { email, displayName, redirect: "/" });

    await page.goto("/profile");
    await expect(page).toHaveURL(/\/profile/, { timeout: 10000 });
    await expect(page.getByRole("heading", { name: /Profile/i })).toBeVisible({ timeout: 10000 });

    const nameInput = page.getByPlaceholder("Your name");
    await expect(nameInput).toBeVisible({ timeout: 10000 });
    await expect(nameInput).toHaveValue(displayName, { timeout: 10000 });

    await page.reload();
    await expect(page).toHaveURL(/\/profile/, { timeout: 10000 });
    await expect(page.getByPlaceholder("Your name")).toHaveValue(displayName, { timeout: 10000 });
  });

  test("authenticated: reload preserves Firebase session", async ({ page }) => {
    await resetEmulators();
    const email = uniqueEmail();

    await signInViaEmailLink(page, { email, redirect: "/slurp" });

    await expect(page).toHaveURL(/\/slurp/, { timeout: 10000 });
    await expect(page.getByRole("button", { name: /^Sign out$/ }).first()).toBeVisible({ timeout: 10000 });

    await page.reload();
    await expect(page).toHaveURL(/\/slurp/, { timeout: 10000 });
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.getByRole("button", { name: /^Sign out$/ }).first()).toBeVisible({ timeout: 10000 });

    await page.goto("/profile");
    await expect(page).toHaveURL(/\/profile/, { timeout: 10000 });
    await expect(page.getByRole("heading", { name: /Profile/i })).toBeVisible({ timeout: 10000 });
  });

  test("authenticated: sidebar sign-out clears session and protected routes redirect to login", async ({
    page,
  }) => {
    await resetEmulators();
    const email = uniqueEmail();

    await signInViaEmailLink(page, { email, redirect: "/slurp" });

    await expect(page).toHaveURL(/\/slurp/, { timeout: 10000 });
    await clickSidebarSignOut(page);
    await expect(page.getByText("Sign out?")).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("You'll need to sign back in")).toBeVisible({ timeout: 5000 });

    await page.locator("div.fixed").getByRole("button", { name: /^Sign out$/ }).click();
    await expect(page).toHaveURL(/\/login/, { timeout: 10000 });

    await page.goto("/profile");
    await expect(page).toHaveURL(/\/login\?redirect=/, { timeout: 10000 });
    expect(new URL(page.url()).searchParams.get("redirect")).toBe("/profile");

    await page.goto("/slurp");
    await expect(page).toHaveURL(/\/login\?redirect=/, { timeout: 10000 });
    expect(new URL(page.url()).searchParams.get("redirect")).toBe("/slurp");

    await page.goto("/");
    await expect(page).toHaveURL(/\/login/, { timeout: 10000 });
  });

  test("authenticated: reused link shows explicit error", async ({ page }) => {
    await resetEmulators();
    const email = uniqueEmail();

    await page.goto("/login");
    await page.getByRole("button", { name: /Sign in with email/i }).click();
    await expect(page.getByPlaceholder("you@example.com").first()).toBeVisible({ timeout: 10000 });
    await page.getByPlaceholder("you@example.com").first().fill(email);
    await page.getByRole("button", { name: /Send sign-in link/i }).click();
    await expect(page.getByText(/Check your inbox/i)).toBeVisible({ timeout: 10000 });

    const oobLink = await pollOobLinkForEmail(email, 15000);

    await page.goto(oobLink);
    await page.waitForLoadState("domcontentloaded");
    // Wait for Firebase to process the link: onboarding visible or URL stabilizes (response/visibility condition, no arbitrary sleep)
    try {
      await page.waitForFunction(
        () => {
          const el = document.getElementById("onboardingDisplayName");
          const visible = !!el && !!(el as HTMLElement).offsetParent;
          const hasOob = new URL(window.location.href).searchParams.has("oobCode");
          return visible || !hasOob;
        },
        null,
        { timeout: 6000 }
      );
    } catch {
      // proceed to visibility check even on timeout
    }
    const onboardingInput = page.locator("#onboardingDisplayName");
    if (await onboardingInput.isVisible()) {
      await onboardingInput.fill("ReuseCheck");
      await page.getByRole("button", { name: /Get started/i }).click();
      await expect(page.getByText("Welcome to Slurp")).toBeHidden({ timeout: 10000 });
    }
    await expect(page).not.toHaveURL(/\/login.*oobCode/, { timeout: 10000 });

    await clickSidebarSignOut(page);
    await expect(page.getByText("Sign out?")).toBeVisible({ timeout: 5000 });
    await page.locator("div.fixed").getByRole("button", { name: /^Sign out$/ }).click();
    await expect(page).toHaveURL(/\/login/, { timeout: 10000 });

    await page.goto(oobLink);
    await page.waitForLoadState("domcontentloaded");

    const confirmInput = page.getByPlaceholder("you@example.com").first();
    await expect(confirmInput).toBeVisible({ timeout: 10000 });
    await confirmInput.fill(email);
    await page.getByRole("button", { name: /^Confirm$/ }).click();
    await expect(page.getByText(/expired|already used|may have expired/i)).toBeVisible({ timeout: 10000 });
    await expect(page).toHaveURL(/\/login/, { timeout: 10000 });
  });
});
