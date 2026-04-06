/**
 * Unit tests for receipt processor logic.
 * Tests cover: item merging with cap, tax/tip update field selection.
 */

import { MEDIUM_CONFIDENCE_WARNING } from "./processor";
import { DEFAULT_SLURP_TITLE } from "@slurp/types";

interface Item {
  id: string;
  name: string;
  price: number;
}

interface ParsedItem {
  name: string;
  price: number;
  quantity: number;
}

interface ParsedReceipt {
  title: string | null;
  items: ParsedItem[];
  tax: number | null;
  tip: number | null;
  confidence: "high" | "medium" | "low";
}

const MAX_ITEMS = 20;

// ── Logic extracted from processor.ts ─────────────────────────────────────────

function resolveTitle(slurpTitle: string, parsedTitle: string | null): string | null {
  if ((!slurpTitle || slurpTitle === DEFAULT_SLURP_TITLE) && parsedTitle) return String(parsedTitle).trim().slice(0, 255);
  return null;
}

function mergeItems(existingItems: Item[], parsedItems: ParsedItem[]): Item[] {
  let idx = 0;
  const newItems: Item[] = parsedItems.flatMap((i) => {
    const qty = Math.max(1, Math.round(i.quantity ?? 1));
    const unitPrice = Math.round((i.price / qty) * 100) / 100;
    return Array.from({ length: qty }, () => ({
      id: `new-${idx++}`,
      name: i.name,
      price: unitPrice,
    }));
  });
  return [...existingItems, ...newItems].slice(0, MAX_ITEMS);
}

// Returns true if processing should be skipped before calling Gemini.
// Mirrors the pre-Gemini guard in processReceipt().
function shouldSkipProcessing(receiptStatus: string | undefined, exists: boolean): boolean {
  if (!exists) return true;
  return receiptStatus !== "processing";
}

// Returns true if the slurp should be deleted (low confidence), false otherwise.
function shouldDelete(confidence: "high" | "medium" | "low"): boolean {
  return confidence === "low";
}

// Returns a medium-confidence Firestore warning field, or null if confidence is not medium.
function buildMediumConfidenceWarning(
  confidence: "high" | "medium" | "low"
): Record<string, string> | null {
  if (confidence !== "medium") return null;
  return { receiptWarning: MEDIUM_CONFIDENCE_WARNING };
}

function buildTaxTipFields(
  parsed: Pick<ParsedReceipt, "tax" | "tip">
): Record<string, number> {
  const fields: Record<string, number> = {};
  if (parsed.tax != null) fields.taxAmount = parsed.tax;
  if (parsed.tip != null) fields.tipAmount = parsed.tip;
  return fields;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

const item = (id: string, name: string, price: number): Item => ({ id, name, price });
const parsed = (name: string, price: number): ParsedItem => ({ name, price, quantity: 1 });

describe("shouldSkipProcessing (pre-Gemini status guard)", () => {
  it("proceeds when status is processing", () => {
    expect(shouldSkipProcessing("processing", true)).toBe(false);
  });

  it("skips when slurp does not exist", () => {
    expect(shouldSkipProcessing(undefined, false)).toBe(true);
  });

  it("skips when status is done — handles duplicate Pub/Sub delivery", () => {
    expect(shouldSkipProcessing("done", true)).toBe(true);
  });

  it("skips when status is failed", () => {
    expect(shouldSkipProcessing("failed", true)).toBe(true);
  });

  it("skips when status is pending — process not yet triggered", () => {
    expect(shouldSkipProcessing("pending", true)).toBe(true);
  });

  it("skips when status is undefined", () => {
    expect(shouldSkipProcessing(undefined, true)).toBe(true);
  });
});

describe("mergeItems", () => {
  it("appends parsed items to existing items", () => {
    const existing = [item("a", "Soda", 2.0)];
    const result = mergeItems(existing, [parsed("Pizza", 10.0)]);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("a");
    expect(result[1].name).toBe("Pizza");
    expect(result[1].price).toBe(10.0);
  });

  it("returns only parsed items when no existing items", () => {
    const result = mergeItems([], [parsed("Burger", 8.5), parsed("Fries", 3.0)]);
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe("Burger");
  });

  it("caps combined items at 20", () => {
    const existing = Array.from({ length: 15 }, (_, i) => item(`e${i}`, `Old ${i}`, 1.0));
    const incoming = Array.from({ length: 10 }, (_, i) => parsed(`New ${i}`, 2.0));
    const result = mergeItems(existing, incoming);
    expect(result).toHaveLength(20);
    // Existing items take priority (filled first)
    expect(result[0].id).toBe("e0");
    expect(result[14].id).toBe("e14");
    // Only 5 new items fit
    expect(result[15].name).toBe("New 0");
    expect(result[19].name).toBe("New 4");
  });

  it("returns all existing items when parsed list is empty", () => {
    const existing = [item("a", "Soda", 2.0), item("b", "Water", 1.5)];
    const result = mergeItems(existing, []);
    expect(result).toHaveLength(2);
    expect(result).toEqual(existing);
  });

  it("handles both lists empty", () => {
    expect(mergeItems([], [])).toHaveLength(0);
  });

  it("does not exceed cap even when existing list is already at 20", () => {
    const existing = Array.from({ length: 20 }, (_, i) => item(`e${i}`, `Old ${i}`, 1.0));
    const result = mergeItems(existing, [parsed("Overflow", 5.0)]);
    expect(result).toHaveLength(20);
    expect(result.every((r) => r.id.startsWith("e"))).toBe(true);
  });

  it("expands a quantity-2 item into 2 items at unit price", () => {
    const result = mergeItems([], [{ name: "Acqua Nat", price: 7.0, quantity: 2 }]);
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe("Acqua Nat");
    expect(result[0].price).toBe(3.5);
    expect(result[1].name).toBe("Acqua Nat");
    expect(result[1].price).toBe(3.5);
    expect(result[0].id).not.toBe(result[1].id);
  });

  it("expands a quantity-4 item into 4 items at unit price", () => {
    const result = mergeItems([], [{ name: "Coperto", price: 10.8, quantity: 4 }]);
    expect(result).toHaveLength(4);
    result.forEach((r) => {
      expect(r.name).toBe("Coperto");
      expect(r.price).toBe(2.7);
    });
  });

  it("leaves quantity-1 items unchanged", () => {
    const result = mergeItems([], [{ name: "Bruschetta", price: 9.0, quantity: 1 }]);
    expect(result).toHaveLength(1);
    expect(result[0].price).toBe(9.0);
  });

  it("defaults missing quantity to 1", () => {
    const result = mergeItems([], [{ name: "Risotto", price: 13.0, quantity: undefined as unknown as number }]);
    expect(result).toHaveLength(1);
    expect(result[0].price).toBe(13.0);
  });

  it("expands multiple quantity items correctly", () => {
    const result = mergeItems([], [
      { name: "Spritz", price: 16.0, quantity: 2 },
      { name: "Coperto", price: 10.8, quantity: 4 },
    ]);
    expect(result).toHaveLength(6);
    expect(result.filter((r) => r.name === "Spritz")).toHaveLength(2);
    expect(result.filter((r) => r.name === "Coperto")).toHaveLength(4);
    expect(result.find((r) => r.name === "Spritz")!.price).toBe(8.0);
    expect(result.find((r) => r.name === "Coperto")!.price).toBe(2.7);
  });

  it("caps combined items at 20 when quantity expansion would exceed cap", () => {
    // 15 existing + one item with quantity 10 = 25, should cap at 20
    const existing = Array.from({ length: 15 }, (_, i) => item(`e${i}`, `Old ${i}`, 1.0));
    const result = mergeItems(existing, [{ name: "Water", price: 30.0, quantity: 10 }]);
    expect(result).toHaveLength(20);
    expect(result.filter((r) => r.name === "Water")).toHaveLength(5);
  });
});

describe("resolveTitle", () => {
  it("returns parsed title when slurp has no title", () => {
    expect(resolveTitle("", "Mario's Pizza")).toBe("Mario's Pizza");
  });

  it("returns null when slurp already has a title", () => {
    expect(resolveTitle("Dinner", "Mario's Pizza")).toBeNull();
  });

  it("replaces the default title sentinel with the parsed title", () => {
    expect(resolveTitle(DEFAULT_SLURP_TITLE, "Mario's Pizza")).toBe("Mario's Pizza");
  });

  it("returns null when parsed title is null", () => {
    expect(resolveTitle("", null)).toBeNull();
  });

  it("returns null when both are empty/null", () => {
    expect(resolveTitle("", null)).toBeNull();
  });

  it("trims whitespace and caps at 255 characters", () => {
    const long = "A".repeat(300);
    expect(resolveTitle("", "  Mario's  ")).toBe("Mario's");
    expect(resolveTitle("", long)?.length).toBe(255);
  });
});

describe("buildTaxTipFields", () => {
  it("sets taxAmount when tax is present", () => {
    const fields = buildTaxTipFields({ tax: 3.75, tip: null });
    expect(fields.taxAmount).toBe(3.75);
    expect("tipAmount" in fields).toBe(false);
  });

  it("sets tipAmount when tip is present", () => {
    const fields = buildTaxTipFields({ tax: null, tip: 5.0 });
    expect(fields.tipAmount).toBe(5.0);
    expect("taxAmount" in fields).toBe(false);
  });

  it("sets both when tax and tip are present", () => {
    const fields = buildTaxTipFields({ tax: 2.0, tip: 3.0 });
    expect(fields.taxAmount).toBe(2.0);
    expect(fields.tipAmount).toBe(3.0);
  });

  it("sets nothing when both are null", () => {
    const fields = buildTaxTipFields({ tax: null, tip: null });
    expect(Object.keys(fields)).toHaveLength(0);
  });

  it("treats 0 as a valid tax value (not null)", () => {
    const fields = buildTaxTipFields({ tax: 0, tip: null });
    expect(fields.taxAmount).toBe(0);
    expect("tipAmount" in fields).toBe(false);
  });
});

describe("shouldDelete (low confidence)", () => {
  it("returns true for low confidence — slurp should be deleted", () => {
    expect(shouldDelete("low")).toBe(true);
  });

  it("returns false for high confidence — items are written normally", () => {
    expect(shouldDelete("high")).toBe(false);
  });

  it("returns false for medium confidence — items are written with a warning", () => {
    expect(shouldDelete("medium")).toBe(false);
  });

  it("high-confidence path merges items normally", () => {
    const existing = [item("a", "Soda", 2.0)];
    expect(shouldDelete("high")).toBe(false);
    const result = mergeItems(existing, [parsed("Pizza", 10.0)]);
    expect(result).toHaveLength(2);
  });

  it("medium-confidence path merges items normally", () => {
    const existing = [item("a", "Soda", 2.0)];
    expect(shouldDelete("medium")).toBe(false);
    const result = mergeItems(existing, [parsed("Burger", 9.0)]);
    expect(result).toHaveLength(2);
    expect(result[1].name).toBe("Burger");
  });
});

describe("buildMediumConfidenceWarning", () => {
  it("returns receiptWarning set to MEDIUM_CONFIDENCE_WARNING for medium confidence", () => {
    const warning = buildMediumConfidenceWarning("medium");
    expect(warning).not.toBeNull();
    expect(warning!.receiptWarning).toBe(MEDIUM_CONFIDENCE_WARNING);
    expect(warning!.receiptWarning).toContain("Receipt image was unclear");
  });

  it("returns null for high confidence", () => {
    expect(buildMediumConfidenceWarning("high")).toBeNull();
  });

  it("returns null for low confidence", () => {
    expect(buildMediumConfidenceWarning("low")).toBeNull();
  });
});
