import { expect } from "@playwright/test";
import { test, signInViaEmailLink, uniqueEmail } from "./fixtures/test";
import { resetEmulators } from "./support/reset-emulators";
import path from "node:path";

// Literal contract values — do not import from fixtureParser so fixture and test cannot drift together.
const FIXTURE_TITLE = "E2E Test Bistro";
const FIXTURE_TAX = "2.15";
const FIXTURE_TIP = "4.00";

const RECEIPT_PNG = path.join(__dirname, "assets", "receipt.png");

test("receipt scan: real Scan Receipt flow uploads via actual input, observes upload/reading, polls to done and asserts deterministic fixture", async ({
  page,
}) => {
  await resetEmulators();

  const email = uniqueEmail();
  const displayName = `Receipt${Math.random().toString(36).slice(2, 6)}`;

  await signInViaEmailLink(page, { email, displayName, redirect: "/slurp/new" });
  await expect(page).toHaveURL(/\/slurp\/new/, { timeout: 10000 });

  // Ensure Scan Receipt tab is active (default is receipt, but click explicitly for reliability)
  // Tab text is "📷 Scan Receipt" — use exact match to avoid matching "Create & Scan Receipt" submit button
  const scanTab = page.getByRole("button", { name: "📷 Scan Receipt" });
  await expect(scanTab).toBeVisible({ timeout: 10000 });
  await scanTab.click();

  // Locate the real hidden file input and choose the tiny valid PNG fixture through it
  const fileInput = page.locator('input[type="file"]');
  await expect(fileInput).toBeAttached({ timeout: 5000 });
  await fileInput.setInputFiles(RECEIPT_PNG);

  // Condition-based waits: file name and helper text appear without arbitrary sleep
  await expect(page.getByText("receipt.png")).toBeVisible({ timeout: 5000 });
  await expect(page.getByText("Items will be extracted automatically")).toBeVisible({ timeout: 5000 });

  // Submit must be enabled once a file is selected
  const submit = page.getByRole("button", { name: "Create & Scan Receipt" });
  await expect(submit).toBeEnabled({ timeout: 5000 });

  await submit.click();

  // Observe upload/reading overlay states (creation page parsePhase)
  await expect(page.getByText(/Uploading receipt|Reading your receipt/i)).toBeVisible({ timeout: 10000 });

  // Polling on the creation page waits for receiptStatus=done (processor fixture writes Firestore)
  // and navigates to detail. Assert navigation occurs deterministically.
  await expect(page).toHaveURL(/\/slurp\/(?!new)[^\/]+$/, { timeout: 30000 });
  const slurpId = new URL(page.url()).pathname.split("/").pop() ?? "";
  expect(slurpId.length).toBeGreaterThan(5);

  // Detail page polls every 2s while pending/processing — wait for fixture title after done
  await expect(page.getByRole("heading", { level: 1, name: FIXTURE_TITLE })).toBeVisible({ timeout: 30000 });

  // Deterministic fixture items (Sparkling Water qty 2 expands to 2 items at unit price, total 4)
  await expect(page.getByRole("button", { name: "Edit Margherita Pizza" })).toBeVisible({ timeout: 10000 });
  await expect(page.getByRole("button", { name: "Edit Caesar Salad" })).toBeVisible({ timeout: 10000 });
  // Two Sparkling Water rows share the same label — assert count deterministically
  await expect(page.getByRole("button", { name: "Edit Sparkling Water" })).toHaveCount(2, { timeout: 10000 });

  // Prices rendered via formatAmount (USD)
  await expect(page.getByText("$12.50")).toBeVisible({ timeout: 5000 });
  await expect(page.getByText("$8.00")).toBeVisible({ timeout: 5000 });
  // Both Sparkling Water unit items at $1.50 — at least one visible; count check above covers duplication
  await expect(page.getByText("$1.50").first()).toBeVisible({ timeout: 5000 });

  // Deterministic tax/tip from fixture persisted via processor — literal contract values
  const taxInput = page.locator("label", { hasText: "Tax ($)" }).locator("..").getByRole("spinbutton");
  await expect(taxInput).toHaveValue(FIXTURE_TAX, { timeout: 10000 });
  const tipInput = page.locator("label", { hasText: "Tip ($)" }).locator("..").getByRole("spinbutton");
  await expect(tipInput).toHaveValue(FIXTURE_TIP, { timeout: 10000 });

  // Reload persistence: title/items/tax/tip remain after reload (polling completed)
  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: FIXTURE_TITLE })).toBeVisible({ timeout: 10000 });
  await expect(page.getByRole("button", { name: "Edit Margherita Pizza" })).toBeVisible({ timeout: 10000 });
  await expect(page.locator("label", { hasText: "Tax ($)" }).locator("..").getByRole("spinbutton")).toHaveValue(FIXTURE_TAX, { timeout: 10000 });
  await expect(page.locator("label", { hasText: "Tip ($)" }).locator("..").getByRole("spinbutton")).toHaveValue(FIXTURE_TIP, { timeout: 10000 });
});

test("receipt scan: oversize image is rejected deterministically without upload (safe negative)", async ({
  page,
}) => {
  await resetEmulators();

  const email = uniqueEmail();
  const displayName = `ReceiptNeg${Math.random().toString(36).slice(2, 6)}`;

  await signInViaEmailLink(page, { email, displayName, redirect: "/slurp/new" });
  await expect(page).toHaveURL(/\/slurp\/new/, { timeout: 10000 });

  const scanTab = page.getByRole("button", { name: "📷 Scan Receipt" });
  await expect(scanTab).toBeVisible({ timeout: 10000 });
  await scanTab.click();

  const fileInput = page.locator('input[type="file"]');
  await expect(fileInput).toBeAttached({ timeout: 5000 });

  // Create an oversized buffer (>10 MB) deterministically — no arbitrary sleep, no real upload
  const oversize = Buffer.alloc(10 * 1024 * 1024 + 1, 0);
  await fileInput.setInputFiles({ name: "huge.png", mimeType: "image/png", buffer: oversize });

  // UI validates size before upload and shows deterministic error
  await expect(page.getByText("Receipt image must be under 10 MB")).toBeVisible({ timeout: 5000 });

  // File was rejected, so helper text for successful selection must not appear and submit stays disabled
  await expect(page.getByText("Items will be extracted automatically")).toBeHidden({ timeout: 5000 });
  const submit = page.getByRole("button", { name: "Create & Scan Receipt" });
  await expect(submit).toBeDisabled({ timeout: 5000 });

  // Still on /slurp/new — no navigation or overlay triggered
  await expect(page).toHaveURL(/\/slurp\/new/, { timeout: 5000 });
  await expect(page.getByText(/Uploading receipt|Reading your receipt/i)).toBeHidden({ timeout: 5000 });
});
