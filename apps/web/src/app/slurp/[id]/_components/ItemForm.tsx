"use client";

import { useState } from "react";
import { addItem } from "@/lib/slurps";
import type { Slurp } from "@slurp/types";
import { CURRENCY_MAP } from "@slurp/types";

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
    <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row sm:items-end gap-2 mt-3">
      <div className="flex-1">
        <input
          className="w-full border rounded px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
          placeholder="Item name"
          value={name}
          maxLength={64}
          onChange={(e) => setName(e.target.value)}
          required
        />
      </div>
      <div className="flex items-center border rounded dark:border-gray-600 overflow-hidden w-full sm:w-32">
        <span className="px-2 py-2 text-sm text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-700 border-r dark:border-gray-600 select-none">{billedSymbol}</span>
        <input
          type="number"
          step="0.01"
          min="0"
          className="flex-1 px-2 py-2 text-sm bg-white dark:bg-gray-800 dark:text-gray-100 outline-none min-w-0"
          placeholder="0.00"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          required
        />
      </div>
      <button
        type="submit"
        disabled={submitting}
        className="w-full sm:w-auto rounded bg-green-600 px-4 py-2 text-white text-sm hover:bg-green-700 disabled:opacity-50"
      >
        Add
      </button>
      {error && <p className="text-red-600 text-xs">{error}</p>}
    </form>
  );
}
