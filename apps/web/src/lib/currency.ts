import { CURRENCY_MAP } from "@slurp/types";
import type { CurrencyConversion } from "@slurp/types";

export function getVenmoAmount(billedTotal: number, conversion: CurrencyConversion): number {
  return billedTotal / conversion.exchangeRate;
}

export function isVenmoEligible(conversion: CurrencyConversion): boolean {
  if (conversion.enabled) return conversion.homeCurrency === "USD";
  return conversion.billedCurrency === "USD";
}

export function formatAmount(
  billedAmount: number,
  conversion?: CurrencyConversion
): string {
  const billedSymbol = CURRENCY_MAP[conversion?.billedCurrency ?? "USD"]?.symbol ?? "$";
  const base = `${billedSymbol}${billedAmount.toFixed(2)}`;
  if (!conversion?.enabled) return base;
  const homeSymbol = CURRENCY_MAP[conversion.homeCurrency]?.symbol ?? "";
  const homeAmount = (billedAmount / conversion.exchangeRate).toFixed(2);
  return `${base} (${homeSymbol}${homeAmount})`;
}
