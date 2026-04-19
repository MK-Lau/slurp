"use client";

import { useState } from "react";
import { addItem } from "@/lib/slurps";
import type { Slurp } from "@slurp/types";
import { CURRENCY_MAP } from "@slurp/types";
import { Btn, NumberInput, TextInput } from "@/components/ui";

interface Props {
  slurp: Slurp;
  onUpdate: (d: Slurp) => void;
}

export default function ItemForm({ slurp, onUpdate }: Props): React.JSX.Element {
  const billedSymbol = CURRENCY_MAP[slurp.currencyConversion?.billedCurrency ?? ""]?.symbol ?? "$";
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const updated = await addItem(slurp.id, { name, price: parseFloat(price) });
      onUpdate(updated);
      setName("");
      setPrice("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add item");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2 items-center">
      <TextInput
        className="flex-1"
        placeholder="Item name"
        value={name}
        maxLength={64}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") void handleSubmit(e); }}
        required
      />
      <NumberInput
        prefix={billedSymbol}
        className="w-28"
        placeholder="0.00"
        step="0.01"
        min="0"
        value={price}
        onChange={(e) => setPrice(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") void handleSubmit(e); }}
        required
      />
      <Btn type="submit" variant="primary" size="sm" disabled={submitting}>Add</Btn>
      {error && <p className="text-red-600 text-xs">{error}</p>}
    </form>
  );
}
