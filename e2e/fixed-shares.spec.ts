import {
  apiFetchWithToken,
  expect,
  installBearerCapture,
  signInViaEmailLink,
  test,
  uniqueEmail,
} from "./fixtures/test";
import { resetEmulators } from "./support/reset-emulators";
import type { Browser, Page } from "@playwright/test";

async function joinSlurp(
  browser: Browser,
  invitePath: string,
  displayName: string
): Promise<{ page: Page; token: string }> {
  const context = await browser.newContext();
  const page = await context.newPage();
  const capture = installBearerCapture(page);
  await signInViaEmailLink(page, {
    email: uniqueEmail(),
    displayName,
    redirect: invitePath,
  });
  const nameInput = page.locator("#displayName");
  await expect(nameInput).toBeVisible({ timeout: 15_000 });
  if ((await nameInput.inputValue()).trim().length < 3) await nameInput.fill(displayName);
  const joinResponsePromise = page.waitForResponse(
    (response) => response.url().endsWith("/join") && response.request().method() === "POST"
  );
  await page.getByRole("button", { name: /^Join$/ }).click();
  const joinResponse = await joinResponsePromise;
  expect(joinResponse.status(), await joinResponse.text()).toBe(200);
  await expect(page.getByRole("heading", { name: "Fixed Share Dinner" })).toBeVisible({ timeout: 15_000 });
  const token = await capture.wait();
  const slurpId = new URL(`http://localhost${invitePath}`).pathname.split("/").pop();
  const membership = await apiFetchWithToken(page.request, `/slurps/${slurpId}`, token);
  expect(membership.status, membership.text).toBe(200);
  return { page, token };
}

test("fixed shares: real UI, stale revision, concurrent claim, and receipt lock", async ({ browser }) => {
  await resetEmulators();

  const hostContext = await browser.newContext();
  const hostPage = await hostContext.newPage();
  const hostCapture = installBearerCapture(hostPage);
  await signInViaEmailLink(hostPage, {
    email: uniqueEmail(),
    displayName: "FixedHost",
    redirect: "/",
  });
  const hostToken = await hostCapture.wait();
  const hostProfile = await apiFetchWithToken(hostPage.request, "/profile", hostToken, {
    method: "PUT",
    body: { venmoUsername: "fixed-host" },
  });
  expect(hostProfile.status, hostProfile.text).toBe(200);

  const created = await apiFetchWithToken(hostPage.request, "/slurps", hostToken, {
    method: "POST",
    body: { title: "Fixed Share Dinner", taxAmount: 3, tipAmount: 6, expectedGuests: 2 },
  });
  expect(created.status).toBe(201);
  expect(created.body.splitVersion).toBe(2);
  expect(created.body.splitRevision).toBe(0);
  expect(created.body.participantEmails).toEqual([]);
  const slurpId = created.body.id as string;
  const inviteToken = created.body.inviteToken as string;

  const withPizza = await apiFetchWithToken(hostPage.request, `/slurps/${slurpId}/items`, hostToken, {
    method: "POST",
    body: { name: "Pizza", price: 30 },
  });
  expect(withPizza.status).toBe(201);
  const pizzaId = withPizza.body.items[0].id as string;
  const withWater = await apiFetchWithToken(hostPage.request, `/slurps/${slurpId}/items`, hostToken, {
    method: "POST",
    body: { name: "Water", price: 0 },
  });
  expect(withWater.status).toBe(201);

  await hostPage.goto(`/slurp/${slurpId}`);
  await expect(hostPage.getByRole("heading", { name: "Fixed Share Dinner" })).toBeVisible({ timeout: 15_000 });
  const splitControls = hostPage.getByLabel("Default split");
  await expect(splitControls).toHaveCount(2, { timeout: 10_000 });

  const invitePath = `/slurp/${slurpId}?token=${inviteToken}`;
  const guestA = await joinSlurp(browser, invitePath, "GuestAlpha");

  const pizzaButton = guestA.page.getByRole("button", { name: /Pizza/ }).first();
  {
    const response = guestA.page.waitForResponse(
      (candidate) => candidate.url().endsWith("/selections") && candidate.request().method() === "PUT"
    );
    await pizzaButton.click();
    expect((await response).status()).toBe(200);
  }
  {
    const response = guestA.page.waitForResponse(
      (candidate) => candidate.url().endsWith("/selections") && candidate.request().method() === "PUT"
    );
    await guestA.page.getByLabel("Claim another share of Pizza").click();
    expect((await response).status()).toBe(200);
  }
  await expect(guestA.page.getByText("2 shares", { exact: true })).toBeVisible();
  await expect(guestA.page.getByText("$39.00", { exact: true })).toBeVisible();

  await guestA.page.getByRole("button", { name: "Summary", exact: true }).click();
  await expect(guestA.page.getByText("Subtotal", { exact: true }).first()).toBeVisible();
  await expect(guestA.page.getByRole("button", { name: "Mark as paid" })).toHaveCount(0);
  await guestA.page.getByRole("button", { name: "My Items", exact: true }).click();

  const beforeRevisionChange = await apiFetchWithToken(
    guestA.page.request,
    `/slurps/${slurpId}`,
    guestA.token
  );
  expect(beforeRevisionChange.body.splitRevision).toBe(4);
  const noOpSelection = await apiFetchWithToken(
    guestA.page.request,
    `/slurps/${slurpId}/selections`,
    guestA.token,
    { method: "PUT", body: { itemShares: { [pizzaId]: 2 } } }
  );
  expect(noOpSelection.status).toBe(200);
  expect(noOpSelection.body.splitRevision).toBe(4);

  // Change a zero-cost item's default so the guest total stays the same while
  // their cached revision becomes stale.
  {
    const response = hostPage.waitForResponse(
      (candidate) => candidate.url().includes("/items/") && candidate.request().method() === "PATCH"
    );
    await splitControls.nth(1).selectOption("2");
    expect((await response).status()).toBe(200);
  }
  const staleConfirmResponse = guestA.page.waitForResponse(
    (candidate) => candidate.url().endsWith("/confirm") && candidate.request().method() === "POST"
  );
  await guestA.page.getByRole("button", { name: "Done — confirm selections" }).click();
  expect((await staleConfirmResponse).status()).toBe(400);
  await expect(guestA.page.getByText(/The split changed/)).toBeVisible();

  await guestA.page.reload();
  await expect(guestA.page.getByText("2 shares", { exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(guestA.page.getByText("$39.00", { exact: true })).toBeVisible();
  await guestA.page.getByRole("button", { name: "Done — confirm selections" }).click();
  await expect(guestA.page.getByText("You've confirmed your selections")).toBeVisible({ timeout: 15_000 });
  await guestA.page.getByRole("button", { name: "Summary", exact: true }).click();
  await expect(guestA.page.getByRole("link", { name: /Pay in Venmo/ })).toBeVisible({ timeout: 15_000 });

  const guestB = await joinSlurp(browser, invitePath, "GuestBeta");

  // Only one caller can claim the final party-sized pizza share. Both requests
  // use real authenticated API routes and the Firestore emulator transaction layer.
  const [hostClaim, guestClaim] = await Promise.all([
    apiFetchWithToken(hostPage.request, `/slurps/${slurpId}/selections`, hostToken, {
      method: "PUT",
      body: { itemShares: { [pizzaId]: 1 } },
    }),
    apiFetchWithToken(guestB.page.request, `/slurps/${slurpId}/selections`, guestB.token, {
      method: "PUT",
      body: { itemShares: { [pizzaId]: 1 } },
    }),
  ]);
  expect(
    [hostClaim.status, guestClaim.status].sort(),
    `host=${hostClaim.status} ${hostClaim.text}; guest=${guestClaim.status} ${guestClaim.text}`
  ).toEqual([200, 400]);
  expect([hostClaim, guestClaim].find((response) => response.status === 400)?.body.error)
    .toMatch(/cannot be split more than 3 ways/);

  const summary = await apiFetchWithToken(
    guestA.page.request,
    `/slurps/${slurpId}/summary`,
    guestA.token
  );
  expect(summary.status).toBe(200);
  const guestState = await apiFetchWithToken(
    guestA.page.request,
    `/slurps/${slurpId}`,
    guestA.token
  );
  const guestBreakdown = summary.body.participants.find(
    (participant: { uid: string }) => participant.uid === guestState.body.viewerUid
  );
  expect(guestBreakdown.total).toBe(26);
  expect(guestBreakdown.subtotal).toBe(20);

  const lockedReceipt = await apiFetchWithToken(
    hostPage.request,
    `/slurps/${slurpId}/receipt/upload-url`,
    hostToken,
    { method: "POST", body: { contentType: "image/jpeg" } }
  );
  expect(lockedReceipt.status).toBe(409);
  expect(lockedReceipt.body.error).toMatch(/locked.*confirmed/i);

  await hostContext.close();
  await guestA.page.context().close();
  await guestB.page.context().close();
});
