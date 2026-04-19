"use client";

import { useEffect, useRef, useState } from "react";
import { updateSlurp } from "@/lib/slurps";
import type { Slurp } from "@slurp/types";
import { CURRENCY_MAP } from "@slurp/types";
import { Field, NumberInput } from "@/components/ui";

interface Props {
  slurp: Slurp;
  onUpdate: (d: Slurp) => void;
}

export default function TaxTipForm({ slurp, onUpdate }: Props): React.JSX.Element {
  const billedSymbol = CURRENCY_MAP[slurp.currencyConversion?.billedCurrency ?? ""]?.symbol ?? "$";
  const [taxValue, setTaxValue] = useState(slurp.taxAmount.toFixed(2));
  const [tipValue, setTipValue] = useState(slurp.tipAmount.toFixed(2));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const focusedFieldRef = useRef<"tax" | "tip" | null>(null);

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
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label={`Tax (${billedSymbol})`}>
          <NumberInput
            prefix={billedSymbol}
            step="0.01"
            min="0"
            value={taxValue}
            onChange={(e) => setTaxValue(e.target.value)}
            onFocus={() => { focusedFieldRef.current = "tax"; }}
            onBlur={() => { focusedFieldRef.current = null; void save(taxValue, tipValue); }}
          />
        </Field>
        <Field label={`Tip (${billedSymbol})`}>
          <NumberInput
            prefix={billedSymbol}
            step="0.01"
            min="0"
            value={tipValue}
            onChange={(e) => setTipValue(e.target.value)}
            onFocus={() => { focusedFieldRef.current = "tip"; }}
            onBlur={() => { focusedFieldRef.current = null; void save(taxValue, tipValue); }}
          />
        </Field>
      </div>
      {saving && <p className="text-xs text-gray-400">Saving…</p>}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
