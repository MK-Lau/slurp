"use client";

import { useRef, useState } from "react";
import { deleteItem, updateItem } from "@/lib/slurps";
import type { Slurp } from "@slurp/types";
import { formatAmount } from "@/lib/currency";

interface Props {
  slurp: Slurp;
  isHost: boolean;
  onUpdate: (d: Slurp) => void;
}

export default function ItemList({ slurp, isHost, onUpdate }: Props): React.JSX.Element {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editPrice, setEditPrice] = useState("");
  const savingRef = useRef(false);

  function startEdit(itemId: string, name: string, price: number): void {
    setEditingId(itemId);
    setEditName(name);
    setEditPrice(price.toFixed(2));
  }

  function cancelEdit(): void {
    setEditingId(null);
    setEditName("");
    setEditPrice("");
  }

  async function handleSave(itemId: string): Promise<void> {
    if (savingRef.current) return;
    const price = parseFloat(editPrice);
    if (!editName.trim() || isNaN(price) || price < 0) { cancelEdit(); return; }
    savingRef.current = true;
    try {
      const updated = await updateItem(slurp.id, itemId, { name: editName.trim(), price });
      onUpdate(updated);
      setEditingId(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to update item");
    } finally {
      savingRef.current = false;
    }
  }

  async function handleDelete(itemId: string): Promise<void> {
    try {
      const updated = await deleteItem(slurp.id, itemId);
      onUpdate(updated);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete item");
    }
  }

  if (slurp.items.length === 0) {
    return <p className="text-gray-400 text-sm px-4 py-3">No items yet.</p>;
  }

  return (
    <>
      {slurp.items.map((item) =>
        isHost && editingId === item.id ? (
          <div
            key={item.id}
            className="flex items-center gap-2 px-3 py-2 text-sm"
            onBlur={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) void handleSave(item.id);
            }}
          >
            <input
              className="flex-1 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
              value={editName}
              maxLength={64}
              onChange={(e) => setEditName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleSave(item.id);
                if (e.key === "Escape") cancelEdit();
              }}
              autoFocus
            />
            <input
              type="number"
              step="0.01"
              min="0"
              className="w-24 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
              value={editPrice}
              onChange={(e) => setEditPrice(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleSave(item.id);
                if (e.key === "Escape") cancelEdit();
              }}
            />
            <button
              onClick={() => { cancelEdit(); void handleDelete(item.id); }}
              className="rounded-lg p-1.5 text-gray-300 hover:text-red-400 hover:bg-red-50 transition-colors"
              aria-label="Remove item"
            >
              ×
            </button>
          </div>
        ) : (
          <div key={item.id} className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-colors group">
            {isHost ? (
              <button
                className="flex-1 flex items-center justify-between text-left text-sm"
                onClick={() => startEdit(item.id, item.name, item.price)}
              >
                <span className="text-gray-800 dark:text-gray-200">{item.name}</span>
                <span className="font-semibold text-gray-900 dark:text-gray-100 mr-3">{formatAmount(item.price, slurp.currencyConversion)}</span>
              </button>
            ) : (
              <>
                <span className="text-sm text-gray-800 dark:text-gray-200">{item.name}</span>
                <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">{formatAmount(item.price, slurp.currencyConversion)}</span>
              </>
            )}
            {isHost && (
              <button
                onClick={() => void handleDelete(item.id)}
                className="text-gray-200 dark:text-gray-600 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 text-lg leading-none shrink-0"
                aria-label="Remove item"
              >
                ×
              </button>
            )}
          </div>
        )
      )}
    </>
  );
}
