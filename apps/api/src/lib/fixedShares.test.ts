import type { Slurp } from "@slurp/types";
import {
  allFixedSharesClaimed,
  isFixedFinanciallyLocked,
  validateFixedShareClaims,
  validateSplitRevision,
} from "./fixedShares";

const slurp: Slurp = {
  id: "s", title: "Dinner", hostUid: "host", splitVersion: 2,
  taxAmount: 0, tipAmount: 0,
  items: [{ id: "pizza", name: "Pizza", price: 30, shareCount: 3 }],
  participants: [
    { uid: "host", role: "host", status: "pending", selectedItemIds: [], selectedItemShares: {} },
    { uid: "a", role: "guest", status: "pending", selectedItemIds: ["pizza"], selectedItemShares: { pizza: 1 } },
    { uid: "b", role: "guest", status: "pending", selectedItemIds: ["pizza"], selectedItemShares: { pizza: 1 } },
  ],
  participantEmails: [], inviteToken: "token", removedUids: [],
  currencyConversion: { enabled: false, billedCurrency: "USD", homeCurrency: "USD", exchangeRate: 1 },
  createdAt: "2026-01-01", updatedAt: "2026-01-01",
};

describe("fixed share API validation", () => {
  it("allows a participant to replace their own claim without double counting it", () => {
    expect(validateFixedShareClaims(slurp, "a", { pizza: 2 })).toEqual({ pizza: 2 });
  });

  it("rejects over-claiming under concurrent participant state", () => {
    expect(() => validateFixedShareClaims(slurp, "host", { pizza: 2 }))
      .toThrow("Not enough shares remaining for Pizza");
  });

  it.each([{ pizza: 0 }, { pizza: -1 }, { pizza: 1.5 }, { pizza: 11 }, { unknown: 1 }])(
    "rejects malformed or unknown claims: %j",
    (claims) => expect(() => validateFixedShareClaims(slurp, "host", claims)).toThrow()
  );

  it("detects completion only when every fixed portion is claimed", () => {
    expect(allFixedSharesClaimed(slurp)).toBe(false);
    const complete = structuredClone(slurp);
    complete.participants[0].selectedItemIds = ["pizza"];
    complete.participants[0].selectedItemShares = { pizza: 1 };
    expect(allFixedSharesClaimed(complete)).toBe(true);
  });

  it("rejects a stale or missing split revision at confirmation", () => {
    const revised = { ...slurp, splitRevision: 4 };
    expect(() => validateSplitRevision(revised, 3)).toThrow("The split changed");
    expect(() => validateSplitRevision(revised, undefined)).toThrow("The split changed");
    expect(() => validateSplitRevision(revised, 4)).not.toThrow();
  });

  it("locks financial configuration when anyone confirms or pays", () => {
    expect(isFixedFinanciallyLocked(slurp)).toBe(false);
    expect(isFixedFinanciallyLocked({
      ...slurp,
      participants: [{ ...slurp.participants[0], status: "confirmed" }],
    })).toBe(true);
    expect(isFixedFinanciallyLocked({
      ...slurp,
      participants: [{ ...slurp.participants[0], paid: true }],
    })).toBe(true);
  });
});
