import type { ParsedReceipt } from "./gemini";

export const FIXTURE_RECEIPT: ParsedReceipt = {
  title: "E2E Test Bistro",
  items: [
    { name: "Margherita Pizza", price: 12.5, quantity: 1 },
    { name: "Caesar Salad", price: 8.0, quantity: 1 },
    { name: "Sparkling Water", price: 3.0, quantity: 2 },
  ],
  tax: 2.15,
  tip: 4.0,
  subtotal: 26.5,
  total: 32.65,
  confidence: "high",
};

export function parseFixtureReceipt(): ParsedReceipt {
  return {
    title: FIXTURE_RECEIPT.title,
    items: FIXTURE_RECEIPT.items.map((i) => ({ ...i })),
    tax: FIXTURE_RECEIPT.tax,
    tip: FIXTURE_RECEIPT.tip,
    subtotal: FIXTURE_RECEIPT.subtotal,
    total: FIXTURE_RECEIPT.total,
    confidence: FIXTURE_RECEIPT.confidence,
  };
}
