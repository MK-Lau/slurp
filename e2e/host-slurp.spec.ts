import { expect } from "@playwright/test";
import { test, signInViaEmailLink, uniqueEmail } from "./fixtures/test";
import { resetEmulators } from "./support/reset-emulators";

test("host manual journey: create slurp, verify detail + list + patch title", async ({ page }) => {
  await resetEmulators();

  const email = uniqueEmail();
  const displayName = `Host${Math.random().toString(36).slice(2, 6)}`;
  const title = `Host Manual ${Date.now()} ${Math.random().toString(36).slice(2, 6)}`;

  // Sign in via real email-link flow and land on /slurp/new
  await signInViaEmailLink(page, { email, displayName, redirect: "/slurp/new" });
  await expect(page).toHaveURL(/\/slurp\/new/, { timeout: 10000 });

  // Choose Manual mode
  const manualTab = page.getByRole("button", { name: /Manual/i });
  await expect(manualTab).toBeVisible({ timeout: 10000 });
  await manualTab.click();
  await expect(page.getByPlaceholder("Give this split a name")).toBeVisible({ timeout: 10000 });
  await expect(page.getByRole("button", { name: /Create Slurp/i })).toBeVisible();

  // Fill title
  await page.getByPlaceholder("Give this split a name").fill(title);

  // Fill first item (initial row)
  await expect(page.getByPlaceholder("Item name").first()).toBeVisible();
  await page.getByPlaceholder("Item name").first().fill("Burger");
  await page.getByPlaceholder("0.00").first().fill("12.50");

  // Add second item
  await page.getByRole("button", { name: "+ Add item" }).click();
  await expect(page.getByPlaceholder("Item name")).toHaveCount(2, { timeout: 5000 });
  await page.getByPlaceholder("Item name").nth(1).fill("Fries");
  await page.getByPlaceholder("0.00").nth(1).fill("4.25");

  // Fill tax / tip via label parent (Field has no htmlFor); avoids outer ancestor matching
  const taxInput = page.locator("label", { hasText: "Tax ($)" }).locator("..").getByRole("spinbutton");
  await expect(taxInput).toBeVisible({ timeout: 5000 });
  await taxInput.fill("2.00");

  const tipInput = page.locator("label", { hasText: "Tip ($)" }).locator("..").getByRole("spinbutton");
  await expect(tipInput).toBeVisible({ timeout: 5000 });
  await tipInput.fill("3.50");

  // Expected guests (create page has no aria-label; use placeholder)
  await page.getByPlaceholder("e.g. 3").fill("2");

  // Submit
  await page.getByRole("button", { name: /Create Slurp/i }).click();

  // Should navigate to detail (not stay on /slurp/new)
  await expect(page).toHaveURL(/\/slurp\/(?!new)[^\/]+$/, { timeout: 15000 });
  const slurpUrl = page.url();
  const slurpId = new URL(slurpUrl).pathname.split("/").pop() ?? "";
  expect(slurpId.length).toBeGreaterThan(5);

  // Verify detail UI
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible({ timeout: 10000 });
  // Host badge (detail header + invite section)
  await expect(page.getByText("Host").first()).toBeVisible({ timeout: 10000 });

  // Items visible (host edit buttons)
  await expect(page.getByRole("button", { name: "Edit Burger" })).toBeVisible({ timeout: 10000 });
  await expect(page.getByRole("button", { name: "Edit Fries" })).toBeVisible();
  await expect(page.getByText("$12.50")).toBeVisible();
  await expect(page.getByText("$4.25")).toBeVisible();

  // Tax/Tip persisted on detail (HostView TaxTipForm)
  const detailTaxInput = page.locator("label", { hasText: "Tax ($)" }).locator("..").getByRole("spinbutton");
  await expect(detailTaxInput).toHaveValue("2.00", { timeout: 10000 });
  const detailTipInput = page.locator("label", { hasText: "Tip ($)" }).locator("..").getByRole("spinbutton");
  await expect(detailTipInput).toHaveValue("3.50");

  // Expected guests persisted (detail has aria-label)
  await expect(page.getByLabel("Expected guests")).toHaveValue("2", { timeout: 10000 });

  // Reload persistence
  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible({ timeout: 10000 });
  await expect(page.getByText("Host").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Edit Burger" })).toBeVisible();

  // Verify card in Your Slurps
  await page.goto("/slurp");
  await expect(page).toHaveURL(/\/slurp(\?|#|$)/, { timeout: 10000 });
  await expect(page.getByRole("heading", { name: "Your Slurps" })).toBeVisible({ timeout: 10000 });
  const cardLink = page.locator('a[href*="/slurp/"]').filter({ hasText: title }).first();
  await expect(cardLink).toBeVisible({ timeout: 10000 });
  // Host badge within list card
  await expect(page.getByText("Host").first()).toBeVisible();

  // Patch title through UI if supported (HostView has aria-label="Slurp name")
  await cardLink.click();
  await expect(page).toHaveURL(new RegExp(`/slurp/${slurpId}`), { timeout: 10000 });

  const titleInput = page.getByLabel("Slurp name");
  await expect(titleInput).toBeVisible({ timeout: 10000 });
  const newTitle = `${title} Updated`;
  await titleInput.fill(newTitle);
  // blur via Enter
  await titleInput.press("Enter");
  // saving indicator may appear briefly
  await expect(page.getByRole("heading", { level: 1, name: newTitle })).toBeVisible({ timeout: 10000 });
  await expect(titleInput).toHaveValue(newTitle, { timeout: 10000 });
  // reload confirms persistence
  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: newTitle })).toBeVisible({ timeout: 10000 });
  // also verify list reflects patched title
  await page.goto("/slurp");
  await expect(page.locator('a[href*="/slurp/"]').filter({ hasText: newTitle }).first()).toBeVisible({ timeout: 10000 });
});
