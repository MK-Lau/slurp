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
    if (!editName.trim() || isNaN(price) || price < 0) {
      cancelEdit();
      return;
    }
    savingRef.current = true;
    try {
      const updated = await updateItem(slurp.id, itemId, {
        name: editName.trim(),
        price,
      });
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
    return <p className="text-gray-400 dark:text-gray-500 text-sm mt-2">No items yet.</p>;
  }

  return (
    <ul className="mt-2 divide-y dark:divide-gray-700 border dark:border-gray-700 rounded">
      {slurp.items.map((item) =>
        isHost && editingId === item.id ? (
          <li key={item.id} className="flex items-center gap-2 px-3 py-2 text-sm">
            <div
              className="flex-1 flex items-center gap-2"
              onBlur={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                  void handleSave(item.id);
                }
              }}
            >
              <input
                className="flex-1 border rounded px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
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
                className="w-24 border rounded px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                value={editPrice}
                onChange={(e) => setEditPrice(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleSave(item.id);
                  if (e.key === "Escape") cancelEdit();
                }}
              />
              <button
                onClick={() => { cancelEdit(); void handleDelete(item.id); }}
                className="rounded p-1 text-gray-400 dark:text-gray-500 hover:bg-red-50 dark:hover:bg-red-950 hover:text-red-500 transition-colors"
                aria-label="Remove item"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
          </li>
        ) : (
          <li key={item.id} className="flex items-center justify-between px-3 py-2 text-sm">
            {isHost ? (
              <button
                className="flex-1 flex items-center justify-between text-left hover:bg-gray-50 dark:hover:bg-gray-800 -mx-3 px-3 py-0 rounded transition-colors"
                onClick={() => startEdit(item.id, item.name, item.price)}
              >
                <span>{item.name}</span>
                <span className="text-gray-600 dark:text-gray-400 mr-3">{formatAmount(item.price, slurp.currencyConversion)}</span>
              </button>
            ) : (
              <>
                <span>{item.name}</span>
                <span className="text-gray-600 dark:text-gray-400">{formatAmount(item.price, slurp.currencyConversion)}</span>
              </>
            )}
            {isHost && (
              <button
                onClick={() => handleDelete(item.id)}
                className="rounded p-1 text-gray-400 dark:text-gray-500 hover:bg-red-50 dark:hover:bg-red-950 hover:text-red-500 transition-colors"
                aria-label="Remove item"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            )}
          </li>
        )
      )}
    </ul>
  );
}
