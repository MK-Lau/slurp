import { expect, test } from "@playwright/test";
import type { Slurp } from "@slurp/types";

test("host default, guest override, and confirmation complete in one browser visit", async ({ page }) => {
  let slurp: Slurp = {
    id: "e2e-slurp", title: "Browser Test Dinner", hostUid: "host", hostEmail: "host@example.com",
    splitVersion: 2, splitRevision: 0, taxAmount: 3, tipAmount: 6, expectedGuests: 2,
    items: [{ id: "pizza", name: "Pizza", price: 30, shareCount: 1 }],
    participants: [
      { uid: "host", role: "host", status: "pending", selectedItemIds: [], selectedItemShares: {} },
      { uid: "guest", role: "guest", status: "pending", selectedItemIds: [], selectedItemShares: {} },
    ],
    participantEmails: ["host@example.com", "guest@example.com"], inviteToken: "e2e-token", removedUids: [],
    currencyConversion: { enabled: false, billedCurrency: "USD", homeCurrency: "USD", exchangeRate: 1 },
    createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z",
  };

  await page.route("http://localhost:8080/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path.endsWith("/items/pizza") && request.method() === "PATCH") {
      const body = request.postDataJSON() as { shareCount: number };
      slurp = { ...slurp, splitRevision: 1, items: [{ ...slurp.items[0], shareCount: body.shareCount }] };
    } else if (path.endsWith("/selections") && request.method() === "PUT") {
      const body = request.postDataJSON() as { itemShares: Record<string, number> };
      slurp = {
        ...slurp,
        participants: slurp.participants.map((participant) => participant.uid === "guest"
          ? { ...participant, status: "pending", selectedItemIds: Object.keys(body.itemShares), selectedItemShares: body.itemShares }
          : participant),
      };
    } else if (path.endsWith("/confirm") && request.method() === "POST") {
      expect((request.postDataJSON() as { splitRevision: number }).splitRevision).toBe(1);
      slurp = {
        ...slurp,
        participants: slurp.participants.map((participant) => participant.uid === "guest"
          ? { ...participant, status: "confirmed" }
          : participant),
      };
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(slurp) });
  });

  await page.goto("/e2e/fixed-shares");
  await page.getByLabel("Default split").selectOption("3");
  await expect(page.getByLabel("Default split")).toHaveValue("3");

  await page.getByRole("button", { name: "Guest flow" }).click();
  await page.getByRole("button", { name: /Pizza/ }).click();
  await page.getByLabel("Claim another share of Pizza").click();
  await expect(page.getByText("2 shares", { exact: true })).toBeVisible();
  await expect(page.getByText("$26.00")).toBeVisible();

  await page.getByRole("button", { name: "Done — confirm selections" }).click();
  await expect(page.getByText(/Your total is locked/)).toBeVisible();
});
