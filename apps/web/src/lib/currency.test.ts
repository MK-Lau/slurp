/**
 * Unit tests for formatAmount currency formatting utility.
 */

import { formatAmount, getVenmoAmount, isVenmoEligible } from "./currency";
import type { CurrencyConversion } from "@slurp/types";

const usdToJpy: CurrencyConversion = {
  enabled: true,
  billedCurrency: "JPY",
  homeCurrency: "USD",
  exchangeRate: 150,
};

const usdToEur: CurrencyConversion = {
  enabled: true,
  billedCurrency: "EUR",
  homeCurrency: "USD",
  exchangeRate: 0.92,
};

const disabledJpy: CurrencyConversion = {
  enabled: false,
  billedCurrency: "JPY",
  homeCurrency: "USD",
  exchangeRate: 150,
};

describe("formatAmount — conversion disabled", () => {
  it("shows only billed symbol and amount when conversion is undefined", () => {
    expect(formatAmount(10, undefined)).toBe("$10.00");
  });

  it("shows only billed symbol and amount when conversion is disabled", () => {
    expect(formatAmount(1200, disabledJpy)).toBe("¥1200.00");
  });

  it("uses billed currency symbol when disabled", () => {
    const conv: CurrencyConversion = { enabled: false, billedCurrency: "EUR", homeCurrency: "USD", exchangeRate: 1 };
    expect(formatAmount(9.99, conv)).toBe("€9.99");
  });

  it("formats zero correctly when disabled", () => {
    expect(formatAmount(0, disabledJpy)).toBe("¥0.00");
  });
});

describe("formatAmount — conversion enabled", () => {
  it("shows billed amount and home amount in parens", () => {
    expect(formatAmount(1500, usdToJpy)).toBe("¥1500.00 ($10.00)");
  });

  it("rounds home amount to 2 decimal places", () => {
    // 100 JPY / 150 = 0.6666... → $0.67
    expect(formatAmount(100, usdToJpy)).toBe("¥100.00 ($0.67)");
  });

  it("rounds billed amount to 2 decimal places", () => {
    expect(formatAmount(10.005, usdToJpy)).toBe("¥10.01 ($0.07)");
  });

  it("correctly converts EUR billed to USD home", () => {
    // 9.20 EUR / 0.92 = $10.00
    expect(formatAmount(9.20, usdToEur)).toBe("€9.20 ($10.00)");
  });

  it("formats zero amount as dual zero", () => {
    expect(formatAmount(0, usdToJpy)).toBe("¥0.00 ($0.00)");
  });

  it("uses correct symbols for GBP billed, USD home", () => {
    const conv: CurrencyConversion = { enabled: true, billedCurrency: "GBP", homeCurrency: "USD", exchangeRate: 0.79 };
    const result = formatAmount(79, conv);
    expect(result).toBe("£79.00 ($100.00)");
  });

  it("uses correct symbol for INR billed", () => {
    const conv: CurrencyConversion = { enabled: true, billedCurrency: "INR", homeCurrency: "USD", exchangeRate: 83 };
    expect(formatAmount(830, conv)).toBe("₹830.00 ($10.00)");
  });
});

describe("getVenmoAmount — USD amount for Venmo", () => {
  it("converts JPY billed total to USD", () => {
    expect(getVenmoAmount(1500, usdToJpy)).toBeCloseTo(10.0);
  });

  it("converts EUR billed total to USD", () => {
    expect(getVenmoAmount(9.20, usdToEur)).toBeCloseTo(10.0);
  });

  it("returns 0 for zero total", () => {
    expect(getVenmoAmount(0, usdToJpy)).toBe(0);
  });
});

describe("isVenmoEligible", () => {
  it("returns true when conversion is enabled and homeCurrency is USD", () => {
    expect(isVenmoEligible(usdToJpy)).toBe(true);
  });

  it("returns false when conversion is enabled and homeCurrency is not USD", () => {
    const conv: CurrencyConversion = { enabled: true, billedCurrency: "USD", homeCurrency: "JPY", exchangeRate: 0.0067 };
    expect(isVenmoEligible(conv)).toBe(false);
  });

  it("returns true when conversion is disabled and billedCurrency is USD", () => {
    const conv: CurrencyConversion = { enabled: false, billedCurrency: "USD", homeCurrency: "USD", exchangeRate: 1 };
    expect(isVenmoEligible(conv)).toBe(true);
  });

  it("returns false when conversion is disabled and billedCurrency is not USD", () => {
    expect(isVenmoEligible(disabledJpy)).toBe(false);
  });

  it("returns false when conversion is disabled with non-USD billed even if homeCurrency is USD", () => {
    const conv: CurrencyConversion = { enabled: false, billedCurrency: "JPY", homeCurrency: "USD", exchangeRate: 150 };
    expect(isVenmoEligible(conv)).toBe(false);
  });
});

describe("formatAmount — unknown currency codes", () => {
  it("falls back to $ for unknown billed currency when disabled", () => {
    const conv: CurrencyConversion = { enabled: false, billedCurrency: "XYZ", homeCurrency: "USD", exchangeRate: 1 };
    expect(formatAmount(10, conv)).toBe("$10.00");
  });

  it("falls back to empty string for unknown home currency symbol when enabled", () => {
    const conv: CurrencyConversion = { enabled: true, billedCurrency: "USD", homeCurrency: "XYZ", exchangeRate: 2 };
    expect(formatAmount(10, conv)).toBe("$10.00 (5.00)");
  });
});
