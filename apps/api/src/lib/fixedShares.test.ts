import type { Slurp } from "@slurp/types";
import {
  allFixedSharesClaimed,
  isFixedFinanciallyLocked,
  validateFixedShareClaims,
  validateFixedShareCountChange,
  validateFixedConfirmation,
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

  it.each([{ pizza: "1" }, { pizza: true }, { pizza: null }])(
    "rejects non-numeric share values instead of coercing them: %j",
    (claims) => expect(() => validateFixedShareClaims(slurp, "host", claims)).toThrow()
  );

  it("detects completion only when every fixed portion is claimed", () => {
    expect(allFixedSharesClaimed(slurp)).toBe(false);
    const complete = structuredClone(slurp);
    complete.participants[0].selectedItemIds = ["pizza"];
    complete.participants[0].selectedItemShares = { pizza: 1 };
    expect(allFixedSharesClaimed(complete)).toBe(true);
  });

  it("does not treat an empty slurp as fully claimed or assign tax as rounding", () => {
    const empty = { ...slurp, items: [], taxAmount: 3, tipAmount: 2 };
    expect(allFixedSharesClaimed(empty)).toBe(false);
    expect(() => validateFixedConfirmation(empty, empty.participants[0], 0))
      .toThrow("Claim at least one share");
  });

  it("rejects reducing an item below shares claimed in the transaction snapshot", () => {
    expect(() => validateFixedShareCountChange(slurp, slurp.items[0], 1))
      .toThrow("Cannot reduce below 2 already claimed shares");
    expect(validateFixedShareCountChange(slurp, slurp.items[0], 2)).toBe(2);
  });

  it("rejects confirmation with no claims or while receipt processing is active", () => {
    expect(() => validateFixedConfirmation(slurp, slurp.participants[0], 0))
      .toThrow("Claim at least one share");
    expect(() => validateFixedConfirmation(
      { ...slurp, receiptStatus: "processing" },
      slurp.participants[1],
      0
    )).toThrow("Wait for receipt processing");
  });

  it("allows the host to confirm when their only charge is the rounding residual", () => {
    const roundingSlurp: Slurp = {
      ...slurp,
      items: [{ id: "shared", name: "Shared", price: 10, shareCount: 3 }],
      participants: [
        { ...slurp.participants[0], selectedItemIds: [], selectedItemShares: {} },
        { ...slurp.participants[1], selectedItemIds: ["shared"], selectedItemShares: { shared: 1 } },
        { ...slurp.participants[2], selectedItemIds: ["shared"], selectedItemShares: { shared: 2 } },
      ],
    };
    expect(() => validateFixedConfirmation(roundingSlurp, roundingSlurp.participants[0], 0)).not.toThrow();
  });

  it("rejects a stale or missing split revision at confirmation", () => {
    const revised = { ...slurp, splitRevision: 4 };
    expect(() => validateSplitRevision(revised, 3)).toThrow("The split changed");
    expect(() => validateSplitRevision(revised, undefined)).toThrow("splitRevision must be a whole number");
    expect(() => validateSplitRevision(revised, "4")).toThrow("splitRevision must be a whole number");
    expect(() => validateSplitRevision(revised, true)).toThrow("splitRevision must be a whole number");
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
