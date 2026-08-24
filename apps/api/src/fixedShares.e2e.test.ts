import { computeAllBreakdowns, computeFixedItemShareCents } from "@slurp/types";
import type { Slurp } from "@slurp/types";

function newFixedSlurp(): Slurp {
  return {
    id: "fixed", title: "Dinner", hostUid: "host", splitVersion: 2,
    taxAmount: 9, tipAmount: 18, expectedGuests: 2,
    items: [
      { id: "pizza", name: "Pizza", price: 30, shareCount: 3 },
      { id: "burger", name: "Burger", price: 20, shareCount: 1 },
      { id: "app", name: "Appetizer", price: 10, shareCount: 3 },
    ],
    participants: [
      { uid: "host", role: "host", status: "pending", selectedItemIds: [], selectedItemShares: {} },
      { uid: "a", role: "guest", status: "confirmed", selectedItemIds: ["pizza", "burger", "app"], selectedItemShares: { pizza: 1, burger: 1, app: 1 } },
    ],
    participantEmails: [], inviteToken: "token", removedUids: [],
    currencyConversion: { enabled: false, billedCurrency: "USD", homeCurrency: "USD", exchangeRate: 1 },
    createdAt: "2026-01-01", updatedAt: "2026-01-01",
  };
}

describe("fixed-share end-to-end calculation flow", () => {
  it("keeps the first guest's final amount stable as later guests claim remaining portions", () => {
    const slurp = newFixedSlurp();
    const before = computeAllBreakdowns(slurp).find((entry) => entry.uid === "a")!;

    slurp.participants.push(
      { uid: "b", role: "guest", status: "confirmed", selectedItemIds: ["pizza", "app"], selectedItemShares: { pizza: 1, app: 1 } },
      { uid: "c", role: "guest", status: "confirmed", selectedItemIds: ["pizza", "app"], selectedItemShares: { pizza: 1, app: 1 } },
    );
    const after = computeAllBreakdowns(slurp).find((entry) => entry.uid === "a")!;

    expect(before).toEqual(after);
    expect(after.subtotal).toBeCloseTo(33.33, 2);
    expect(after.tax).toBe(5);
    expect(after.tip).toBe(10);
    expect(after.total).toBe(48.33);
  });

  it("assigns indivisible residual cents to the host and reconciles exactly", () => {
    const slurp = newFixedSlurp();
    slurp.participants.push(
      { uid: "b", role: "guest", status: "confirmed", selectedItemIds: ["pizza", "app"], selectedItemShares: { pizza: 1, app: 1 } },
      { uid: "c", role: "guest", status: "confirmed", selectedItemIds: ["pizza", "app"], selectedItemShares: { pizza: 1, app: 1 } },
    );
    const breakdowns = computeAllBreakdowns(slurp);
    const host = breakdowns.find((entry) => entry.uid === "host")!;
    expect(host.roundingAdjustment).toBe(0.01);
    expect(breakdowns.reduce((sum, entry) => sum + Math.round(entry.total * 100), 0)).toBe(8700);
  });

  it("uses the same floored cents for billed and displayed fixed shares", () => {
    const item = { id: "shared", name: "Shared", price: 10, shareCount: 6 };
    expect(computeFixedItemShareCents(item)).toBe(166);

    const slurp: Slurp = {
      ...newFixedSlurp(),
      taxAmount: 0,
      tipAmount: 0,
      items: [item],
      participants: [
        { uid: "host", role: "host", status: "pending", selectedItemIds: [], selectedItemShares: {} },
        { uid: "guest", role: "guest", status: "pending", selectedItemIds: ["shared"], selectedItemShares: { shared: 1 } },
      ],
    };
    expect(computeAllBreakdowns(slurp).find((entry) => entry.uid === "guest")?.subtotal).toBe(1.66);
  });

  it("preserves legacy selector-count splitting when splitVersion is absent", () => {
    const slurp = newFixedSlurp();
    delete slurp.splitVersion;
    slurp.items.forEach((item) => delete item.shareCount);
    slurp.participants[1].selectedItemShares = undefined;
    const before = computeAllBreakdowns(slurp).find((entry) => entry.uid === "a")!.subtotal;
    slurp.participants.push({ uid: "b", role: "guest", status: "confirmed", selectedItemIds: ["pizza"], selectedItemShares: undefined });
    const after = computeAllBreakdowns(slurp).find((entry) => entry.uid === "a")!.subtotal;
    expect(after).toBeLessThan(before);
  });
});
