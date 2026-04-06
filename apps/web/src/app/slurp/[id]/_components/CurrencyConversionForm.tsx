"use client";

import { useEffect, useState } from "react";
import { updateSlurp } from "@/lib/slurps";
import type { Slurp } from "@slurp/types";
import { CURRENCIES, CURRENCY_MAP } from "@slurp/types";

interface Props {
  slurp: Slurp;
  onUpdate: (d: Slurp) => void;
}

export default function CurrencyConversionForm({ slurp, onUpdate }: Props): React.JSX.Element {
  const cc = slurp.currencyConversion;
  const [enabled, setEnabled] = useState(cc.enabled);
  const [billedCurrency, setBilledCurrency] = useState(cc.billedCurrency);
  const [homeCurrency, setHomeCurrency] = useState(cc.homeCurrency);
  const [exchangeRate, setExchangeRate] = useState(cc.exchangeRate > 0 ? String(cc.exchangeRate) : "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rateTouched, setRateTouched] = useState(false);
  const [currencyTouched, setCurrencyTouched] = useState(false);

  // Sync if slurp prop changes from outside
  useEffect(() => {
    setEnabled(slurp.currencyConversion.enabled);
    setBilledCurrency(slurp.currencyConversion.billedCurrency);
    setHomeCurrency(slurp.currencyConversion.homeCurrency);
    setExchangeRate(slurp.currencyConversion.exchangeRate > 0 ? String(slurp.currencyConversion.exchangeRate) : "");
  }, [slurp.currencyConversion.enabled, slurp.currencyConversion.billedCurrency, slurp.currencyConversion.homeCurrency, slurp.currencyConversion.exchangeRate]);

  async function save(patch: Partial<{ enabled: boolean; billedCurrency: string; homeCurrency: string; exchangeRate: string }>): Promise<void> {
    const nextEnabled = patch.enabled ?? enabled;
    const nextBilled = patch.billedCurrency ?? billedCurrency;
    const nextHome = patch.homeCurrency ?? homeCurrency;
    const nextRateStr = patch.exchangeRate ?? exchangeRate;
    const nextRate = parseFloat(nextRateStr);

    if (nextEnabled) {
      if (!nextBilled) return; // not ready yet
      if (nextBilled === nextHome) {
        return;
      }
      if (!nextRateStr || !isFinite(nextRate) || nextRate <= 0) {
        setError("Enter a valid exchange rate");
        return;
      }
    }

    setError(null);
    setSaving(true);
    try {
      const updated = await updateSlurp(slurp.id, {
        currencyConversion: {
          enabled: nextEnabled,
          billedCurrency: nextBilled || "USD",
          homeCurrency: nextHome,
          exchangeRate: nextRate > 0 ? nextRate : 1,
        },
      });
      onUpdate(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  function handleToggle(): void {
    const next = !enabled;
    setEnabled(next);
    setError(null);
    void save({ enabled: next });
  }

  function handleBilledChange(val: string): void {
    setBilledCurrency(val);
    setCurrencyTouched(true);
    setError(null);
    void save({ billedCurrency: val });
  }

  function handleHomeChange(val: string): void {
    setHomeCurrency(val);
    setCurrencyTouched(true);
    setError(null);
    void save({ homeCurrency: val });
  }

  function handleRateBlur(): void {
    setRateTouched(true);
    void save({});
  }

  const sameCurrency = !!billedCurrency && billedCurrency === homeCurrency;

  return (
    <div className="border rounded-lg p-4 dark:border-gray-700 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">Currency conversion</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">Show amounts in two currencies</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          onClick={handleToggle}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${enabled ? "bg-purple-600" : "bg-gray-300 dark:bg-gray-600"}`}
        >
          <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${enabled ? "translate-x-6" : "translate-x-1"}`} />
        </button>
      </div>

      {enabled && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Billed in</label>
              <select
                className="w-full border rounded px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                value={billedCurrency}
                onChange={(e) => handleBilledChange(e.target.value)}
              >
                <option value="" disabled>Select currency</option>
                {CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>{c.code} — {c.name}</option>
                ))}
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Home currency</label>
              <select
                className="w-full border rounded px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                value={homeCurrency}
                onChange={(e) => handleHomeChange(e.target.value)}
              >
                {CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>{c.code} — {c.name}</option>
                ))}
              </select>
            </div>
          </div>
          {sameCurrency && currencyTouched && (
            <p className="text-xs text-red-600">Billed currency and home currency must be different</p>
          )}
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Exchange rate</label>
            <input
              type="number"
              step="any"
              min="0.000001"
              className="w-full border rounded px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
              placeholder="e.g. 150"
              value={exchangeRate}
              onChange={(e) => setExchangeRate(e.target.value)}
              onBlur={handleRateBlur}
            />
            {rateTouched && exchangeRate && parseFloat(exchangeRate) > 0 && billedCurrency && billedCurrency !== homeCurrency && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                1 {homeCurrency} = {exchangeRate} {billedCurrency}
              </p>
            )}
          </div>
        </div>
      )}

      {saving && <p className="text-xs text-gray-400 dark:text-gray-500">Saving…</p>}
      {error && <p className="text-xs text-red-600">{error}</p>}

      {!enabled && cc.billedCurrency && cc.homeCurrency && (
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {CURRENCY_MAP[cc.billedCurrency]?.name ?? cc.billedCurrency} · {CURRENCY_MAP[cc.homeCurrency]?.name ?? cc.homeCurrency} · Rate: {cc.exchangeRate}
        </p>
      )}
    </div>
  );
}
