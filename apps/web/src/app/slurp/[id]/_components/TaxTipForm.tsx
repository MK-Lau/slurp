"use client";

import { useEffect, useRef, useState } from "react";
import { updateSlurp } from "@/lib/slurps";
import type { Slurp } from "@slurp/types";
import { CURRENCY_MAP } from "@slurp/types";

interface Props {
  slurp: Slurp;
  onUpdate: (d: Slurp) => void;
}

export default function TaxTipForm({ slurp, onUpdate }: Props): React.JSX.Element {
  const billedSymbol = CURRENCY_MAP[slurp.currencyConversion?.billedCurrency ?? ""]?.symbol ?? "$";
  const [taxValue, setTaxValue] = useState((slurp.taxAmount).toFixed(2));
  const [tipValue, setTipValue] = useState((slurp.tipAmount).toFixed(2));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const focusedFieldRef = useRef<"tax" | "tip" | null>(null);

  // Sync local values when the slurp prop changes (e.g. receipt processor fills in tax),
  // but skip whichever field is currently focused so we don't clobber an in-progress edit.
  useEffect(() => {
    if (focusedFieldRef.current !== "tax") setTaxValue(slurp.taxAmount.toFixed(2));
    if (focusedFieldRef.current !== "tip") setTipValue(slurp.tipAmount.toFixed(2));
  }, [slurp.taxAmount, slurp.tipAmount]);

  async function save(tv: string, tipv: string): Promise<void> {
    setSaving(true);
    setError(null);
    try {
      const updated = await updateSlurp(slurp.id, {
        taxAmount: parseFloat(tv) || 0,
        tipAmount: parseFloat(tipv) || 0,
      });
      onUpdate(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col sm:flex-row sm:items-end gap-3 mt-2">
      <div className="flex-1">
        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Tax ({billedSymbol})</label>
        <input
          type="number"
          step="0.01"
          min="0"
          className="w-full border rounded px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
          value={taxValue}
          onChange={(e) => setTaxValue(e.target.value)}
          onFocus={() => { focusedFieldRef.current = "tax"; }}
          onBlur={() => { focusedFieldRef.current = null; void save(taxValue, tipValue); }}
        />
      </div>
      <div className="flex-1">
        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Tip ({billedSymbol})</label>
        <input
          type="number"
          step="0.01"
          min="0"
          className="w-full border rounded px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
          value={tipValue}
          onChange={(e) => setTipValue(e.target.value)}
          onFocus={() => { focusedFieldRef.current = "tip"; }}
          onBlur={() => { focusedFieldRef.current = null; void save(taxValue, tipValue); }}
        />
      </div>
      {saving && <p className="text-gray-400 dark:text-gray-500 text-xs self-end">Saving…</p>}
      {error && <p className="text-red-600 text-xs self-end">{error}</p>}
    </div>
  );
}
