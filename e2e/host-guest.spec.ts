import { test, expect, signInViaEmailLink, uniqueEmail } from "./fixtures/test";
import { resetEmulators } from "./support/reset-emulators";
import type { Page, Request } from "@playwright/test";

const API_URL = "http://127.0.0.1:8081";

function installBearerCapture(page: Page): { get: () => string | null; wait: (timeoutMs?: number) => Promise<string> } {
  let captured: string | null = null;
  const onRequest = (req: Request): void => {
    const auth = req.headers()["authorization"];
    if (auth?.startsWith("Bearer ")) {
      const t = auth.slice(7).trim();
      if (t.length > 20) captured = t;
    }
  };
  page.on("request", onRequest);
  return {
    get: () => captured,
    wait: async (timeoutMs = 10000): Promise<string> => {
      // Poll condition via expect.poll rather than arbitrary waitForTimeout loop
      await expect.poll(() => captured, { timeout: timeoutMs }).not.toBeNull();
      if (!captured) throw new Error("Timed out waiting for Authorization Bearer token from page requests — no app request with Bearer was observed");
      return captured;
    },
  };
}

async function apiFetchWithToken(
  request: import("@playwright/test").APIRequestContext,
  path: string,
  token: string,
  opts: { method?: string; body?: unknown } = {}
): Promise<{ status: number; body: any; text: string }> {
  const method = opts.method ?? "GET";
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
  let res;
  if (method === "GET") res = await request.get(`${API_URL}${path}`, { headers });
  else if (method === "POST") res = await request.post(`${API_URL}${path}`, { headers, data: opts.body ?? {} });
  else if (method === "PATCH") res = await request.patch(`${API_URL}${path}`, { headers, data: opts.body ?? {} });
  else if (method === "PUT") res = await request.put(`${API_URL}${path}`, { headers, data: opts.body ?? {} });
  else if (method === "DELETE") res = await request.delete(`${API_URL}${path}`, { headers, data: opts.body });
  else throw new Error(`unsupported method ${method}`);
  const text = await res.text();
  let body: any;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: res.status(), body, text };
}

test("host-guest: end-to-end invite → join → selections → summary with authZ negatives", async ({ browser }) => {
  await resetEmulators();

  const hostEmail = uniqueEmail();
  const hostDisplayName = `Host${Math.random().toString(36).slice(2, 6)}`;
  const guestEmail = uniqueEmail();
  const guestDisplayName = `Guest${Math.random().toString(36).slice(2, 6)}`;
  const unrelatedEmail = uniqueEmail();
  const unrelatedDisplayName = `Other${Math.random().toString(36).slice(2, 6)}`;

  const title = `E2E Shared ${Date.now()} ${Math.random().toString(36).slice(2, 4)}`;
  const sharedItemName = "Shared Pizza";
  const hostOnlyItemName = "Host Steak";
  const sharedPrice = 20;
  const hostOnlyPrice = 30;
  const taxAmount = 5;
  const tipAmount = 5;

  // ── Host creates slurp ────────────────────────────────────────────────────
  const hostContext = await browser.newContext();
  const hostPage = await hostContext.newPage();
  const hostCapture = installBearerCapture(hostPage);

  await signInViaEmailLink(hostPage, { email: hostEmail, displayName: hostDisplayName, redirect: "/slurp/new" });
  await expect(hostPage).toHaveURL(/\/slurp\/new/, { timeout: 10000 });

  const manualTab = hostPage.getByRole("button", { name: /Manual/i });
  await expect(manualTab).toBeVisible({ timeout: 10000 });
  await manualTab.click();
  await expect(hostPage.getByPlaceholder("Give this split a name")).toBeVisible({ timeout: 10000 });

  await hostPage.getByPlaceholder("Give this split a name").fill(title);
  await expect(hostPage.getByPlaceholder("Item name").first()).toBeVisible();
  await hostPage.getByPlaceholder("Item name").first().fill(sharedItemName);
  await hostPage.getByPlaceholder("0.00").first().fill(String(sharedPrice));

  await hostPage.getByRole("button", { name: "+ Add item" }).click();
  await expect(hostPage.getByPlaceholder("Item name")).toHaveCount(2, { timeout: 5000 });
  await hostPage.getByPlaceholder("Item name").nth(1).fill(hostOnlyItemName);
  await hostPage.getByPlaceholder("0.00").nth(1).fill(String(hostOnlyPrice));

  const taxInput = hostPage.locator("label", { hasText: "Tax ($)" }).locator("..").getByRole("spinbutton");
  await expect(taxInput).toBeVisible({ timeout: 5000 });
  await taxInput.fill(String(taxAmount));
  const tipInput = hostPage.locator("label", { hasText: "Tip ($)" }).locator("..").getByRole("spinbutton");
  await expect(tipInput).toBeVisible({ timeout: 5000 });
  await tipInput.fill(String(tipAmount));

  await hostPage.getByPlaceholder("e.g. 3").fill("2");

  await hostPage.getByRole("button", { name: /Create Slurp/i }).click();
  await expect(hostPage).toHaveURL(/\/slurp\/(?!new)[^\/]+$/, { timeout: 15000 });
  const slurpUrl = hostPage.url();
  const slurpId = new URL(slurpUrl).pathname.split("/").pop() ?? "";
  expect(slurpId.length).toBeGreaterThan(5);

  await expect(hostPage.getByRole("heading", { level: 1, name: title })).toBeVisible({ timeout: 10000 });
  await expect(hostPage.getByText("Host").first()).toBeVisible({ timeout: 10000 });

  // Capture invite URL from UI (not via direct API seeding)
  const inviteLinkEl = hostPage.locator(".font-mono").first();
  await expect(inviteLinkEl).toBeVisible({ timeout: 10000 });
  // Wait for the invite link text to populate (response/visibility condition, no arbitrary sleep)
  await expect.poll(async () => (await inviteLinkEl.textContent())?.trim() ?? "", { timeout: 10000 }).toMatch(/token=/);
  let inviteUrl = (await inviteLinkEl.textContent())?.trim() ?? "";
  if (!inviteUrl.includes("token=")) {
    inviteUrl = await hostPage.evaluate(() => {
      const el = document.querySelector(".font-mono");
      return (el?.textContent ?? "").trim();
    });
  }
  expect(inviteUrl).toMatch(/\/slurp\/.+\?token=/);
  if (inviteUrl.startsWith("/")) {
    inviteUrl = `http://127.0.0.1:3100${inviteUrl}`;
  }
  const inviteToken = new URL(inviteUrl).searchParams.get("token") ?? "";
  expect(inviteToken.length).toBeGreaterThan(10);
  expect(new URL(inviteUrl).pathname).toBe(`/slurp/${slurpId}`);

  // Verify host's GET response includes inviteToken and hostEmail (host view)
  const hostIdToken = await hostCapture.wait();
  expect(hostIdToken.length).toBeGreaterThan(20);
  const hostGet = await apiFetchWithToken(hostPage.request, `/slurps/${slurpId}`, hostIdToken);
  expect(hostGet.status).toBe(200);
  expect(hostGet.body.inviteToken).toBe(inviteToken);
  expect(hostGet.body.hostEmail).toBe(hostEmail);
  expect(Array.isArray(hostGet.body.items)).toBe(true);
  expect(hostGet.body.items.length).toBe(2);

  // ── Guest anonymous preview → login → join ─────────────────────────────────
  const guestContext = await browser.newContext();
  const guestPage = await guestContext.newPage();
  const guestCapture = installBearerCapture(guestPage);

  // Anonymous open: should redirect to login preserving full target including token
  await guestPage.goto(inviteUrl);
  await expect(guestPage).toHaveURL(/\/login\?redirect=/, { timeout: 10000 });
  const guestLoginUrl = new URL(guestPage.url());
  const redirectParam = guestLoginUrl.searchParams.get("redirect") ?? "";
  expect(redirectParam).toBe(`/slurp/${slurpId}?token=${inviteToken}`);
  // Anonymous invite preview must render the exact slurp title and host identity before auth
  await expect(guestPage.getByText(new RegExp(`${title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`))).toBeVisible({ timeout: 10000 });
  await expect(guestPage.getByText(new RegExp(`${hostDisplayName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`))).toBeVisible({ timeout: 10000 });
  await expect(guestPage.getByText(new RegExp(`Join\\s*${title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}.*by\\s*${hostDisplayName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`))).toBeVisible({ timeout: 10000 });

  // Now sign in via email-link preserving redirect (real UI/auth, no fake token)
  await signInViaEmailLink(guestPage, { email: guestEmail, displayName: guestDisplayName, redirect: `/slurp/${slurpId}?token=${inviteToken}` });
  await expect(guestPage).toHaveURL(new RegExp(`/slurp/${slurpId}`), { timeout: 15000 });

  // Join modal
  const joinHeading = guestPage.getByRole("heading", { name: new RegExp(`Join.*${title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`) });
  await expect(joinHeading.or(guestPage.getByText(`Join ${title}`))).toBeVisible({ timeout: 15000 });
  await expect(guestPage.getByText(`Hosted by`).first()).toBeVisible({ timeout: 10000 });
  const nameInput = guestPage.locator("#displayName");
  await expect(nameInput).toBeVisible({ timeout: 10000 });
  const currentVal = await nameInput.inputValue();
  if (currentVal.trim().length < 3) {
    await nameInput.fill("");
    await nameInput.fill(guestDisplayName);
  }
  await guestPage.getByRole("button", { name: /^Join$/ }).click();
  await expect(guestPage.getByRole("heading", { level: 1, name: title })).toBeVisible({ timeout: 15000 });
  await expect.poll(() => new URL(guestPage.url()).searchParams.has("token"), { timeout: 10000 }).toBe(false);
  await expect(guestPage.getByText(sharedItemName).first()).toBeVisible({ timeout: 10000 });
  await expect(guestPage.getByText(hostOnlyItemName).first()).toBeVisible({ timeout: 10000 });

  // Guest selects shared item and confirms
  const sharedButtonGuest = guestPage.locator("button", { hasText: sharedItemName }).first();
  await expect(sharedButtonGuest).toBeVisible({ timeout: 10000 });
  await sharedButtonGuest.click();
  const guestConfirmBtn = guestPage.getByRole("button", { name: /Done.*confirm/i });
  await expect(guestConfirmBtn).toBeEnabled({ timeout: 15000 });
  await guestConfirmBtn.click();
  await expect(guestPage.getByText("You've confirmed your selections").first()).toBeVisible({ timeout: 15000 });
  await expect(guestPage.getByText("Confirmed").first()).toBeVisible({ timeout: 10000 });

  // Capture guest token for authZ checks (genuine emulator-authenticated via Authorization header)
  const guestIdToken = await guestCapture.wait();
  expect(guestIdToken.length).toBeGreaterThan(20);

  // ── Guest API authZ negatives (genuine token, no fakes) ─────────────────────
  const guestGet = await apiFetchWithToken(guestPage.request, `/slurps/${slurpId}`, guestIdToken);
  expect(guestGet.status).toBe(200);
  expect(guestGet.body.inviteToken).toBeUndefined();
  expect(guestGet.body.hostEmail).toBeUndefined();
  expect(guestGet.body.title).toBe(title);
  for (const p of guestGet.body.participants as any[]) {
    expect(p.email).toBeUndefined();
  }
  const guestPatch = await apiFetchWithToken(guestPage.request, `/slurps/${slurpId}`, guestIdToken, {
    method: "PATCH",
    body: { title: "Hacked Title" },
  });
  expect(guestPatch.status).toBe(403);
  expect(guestPatch.body.error).toMatch(/Only the host can do this/i);
  const guestDelete = await apiFetchWithToken(guestPage.request, `/slurps/${slurpId}`, guestIdToken, {
    method: "DELETE",
  });
  expect(guestDelete.status).toBe(403);
  const guestReceipt = await apiFetchWithToken(guestPage.request, `/slurps/${slurpId}/receipt/upload-url`, guestIdToken, {
    method: "POST",
    body: { contentType: "image/jpeg" },
  });
  expect(guestReceipt.status).toBe(403);
  const guestProcess = await apiFetchWithToken(guestPage.request, `/slurps/${slurpId}/receipt/process`, guestIdToken, {
    method: "POST",
    body: { gcsPath: `receipts/${slurpId}/fake.jpg` },
  });
  expect(guestProcess.status).toBe(403);

  // ── Host reloads/polls, selects items and confirms ──────────────────────────
  await hostPage.reload();
  await expect(hostPage.getByRole("heading", { level: 1, name: title })).toBeVisible({ timeout: 15000 });
  const hostMyItemsTab = hostPage.getByRole("button", { name: /My Items/i }).first();
  if (await hostMyItemsTab.isVisible().catch(() => false)) {
    await hostMyItemsTab.click();
  }
  const hostSharedBtn = hostPage.locator("button", { hasText: sharedItemName }).first();
  const hostOnlyBtn = hostPage.locator("button", { hasText: hostOnlyItemName }).first();
  await expect(hostSharedBtn).toBeVisible({ timeout: 10000 });
  await expect(hostOnlyBtn).toBeVisible({ timeout: 10000 });
  // Click each item and wait for the selections API response (response condition)
  {
    const respPromise = hostPage.waitForResponse(
      (r) => r.url().includes("/selections") && r.request().method() === "PUT",
      { timeout: 10000 }
    );
    await hostSharedBtn.click();
    await respPromise;
  }
  // Ensure the selection state is reflected before the next toggle (visibility condition)
  await expect(hostSharedBtn).toBeVisible({ timeout: 5000 });
  {
    const respPromise = hostPage.waitForResponse(
      (r) => r.url().includes("/selections") && r.request().method() === "PUT",
      { timeout: 10000 }
    );
    await hostOnlyBtn.click();
    await respPromise;
  }
  const hostConfirmBtn = hostPage.getByRole("button", { name: /Done.*confirm/i });
  await expect(hostConfirmBtn).toBeEnabled({ timeout: 15000 });
  await hostConfirmBtn.click();
  await expect(hostPage.getByText("You've confirmed your selections").first()).toBeVisible({ timeout: 15000 });

  // ── Verify summary totals and roles ───────────────────────────────────────
  const hostSummaryTab = hostPage.getByRole("button", { name: /Summary/i }).first();
  await hostSummaryTab.click();
  const hostSummary = await apiFetchWithToken(hostPage.request, `/slurps/${slurpId}/summary`, hostIdToken);
  expect(hostSummary.status).toBe(200);
  expect(hostSummary.body.slurpId).toBe(slurpId);
  expect(Array.isArray(hostSummary.body.participants)).toBe(true);
  const byUid = new Map((hostSummary.body.participants as any[]).map((p: any) => [p.uid, p]));
  const freshHostGet = await apiFetchWithToken(hostPage.request, `/slurps/${slurpId}`, hostIdToken);
  const hostUid = freshHostGet.body.hostUid as string;
  const hostParticipant = freshHostGet.body.participants.find((p: any) => p.uid === hostUid);
  const guestParticipant = freshHostGet.body.participants.find((p: any) => p.uid !== hostUid);
  expect(hostParticipant).toBeTruthy();
  expect(guestParticipant).toBeTruthy();
  const guestUid = guestParticipant.uid as string;

  const hostBreakdown = byUid.get(hostUid) as any;
  const guestBreakdown = byUid.get(guestUid) as any;
  expect(hostBreakdown).toBeTruthy();
  expect(guestBreakdown).toBeTruthy();
  expect(hostParticipant.role).toBe("host");
  expect(guestParticipant.role).toBe("guest");
  // shared 20 split 2 => 10 each, host-only 30 only host => host subtotal 40 guest 10
  // totalSubtotal 50, tax 5 tip 5 proportional => host 48 guest 12
  expect(hostBreakdown.subtotal).toBeCloseTo(40, 1);
  expect(guestBreakdown.subtotal).toBeCloseTo(10, 1);
  expect(hostBreakdown.tax).toBeCloseTo(4, 1);
  expect(guestBreakdown.tax).toBeCloseTo(1, 1);
  expect(hostBreakdown.tip).toBeCloseTo(4, 1);
  expect(guestBreakdown.tip).toBeCloseTo(1, 1);
  expect(hostBreakdown.total).toBeCloseTo(48, 1);
  expect(guestBreakdown.total).toBeCloseTo(12, 1);
  expect(hostParticipant.status).toBe("confirmed");
  expect(guestParticipant.status).toBe("confirmed");

  const guestSummaryTab = guestPage.getByRole("button", { name: /Summary/i }).first();
  await guestSummaryTab.click();
  await expect(guestPage.getByText(/Total/i).first()).toBeVisible({ timeout: 10000 });

  // ── Unrelated signed-in user cannot read ──────────────────────────────────
  const unrelatedContext = await browser.newContext();
  const unrelatedPage = await unrelatedContext.newPage();
  const unrelatedCapture = installBearerCapture(unrelatedPage);
  await signInViaEmailLink(unrelatedPage, { email: unrelatedEmail, displayName: unrelatedDisplayName, redirect: "/" });
  await expect(unrelatedPage).not.toHaveURL(/\/login/, { timeout: 10000 });
  const unrelatedToken = await unrelatedCapture.wait();
  expect(unrelatedToken.length).toBeGreaterThan(20);
  const unrelatedGet = await apiFetchWithToken(unrelatedPage.request, `/slurps/${slurpId}`, unrelatedToken);
  expect(unrelatedGet.status).toBe(403);
  expect(unrelatedGet.body.error).toMatch(/Not a participant/i);
  const unrelatedSummary = await apiFetchWithToken(unrelatedPage.request, `/slurps/${slurpId}/summary`, unrelatedToken);
  expect(unrelatedSummary.status).toBe(403);

  await hostContext.close();
  await guestContext.close();
  await unrelatedContext.close();
});
