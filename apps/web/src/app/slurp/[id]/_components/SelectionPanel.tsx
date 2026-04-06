"use client";

import { useEffect, useState } from "react";
import { updateSelections, confirmSlurp, getSummary } from "@/lib/slurps";
import { useVenmoUrl } from "@/hooks/useVenmoUrl";
import type { Slurp, Participant } from "@slurp/types";
import { computeParticipantBreakdown } from "@slurp/types";
import { formatAmount, getVenmoAmount, isVenmoEligible } from "@/lib/currency";

interface Props {
  slurp: Slurp;
  participant: Participant;
  onUpdate: (d: Slurp) => void;
}

export default function SelectionPanel({ slurp, participant, onUpdate }: Props): React.JSX.Element {
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hostVenmoUsername, setHostVenmoUsername] = useState<string | undefined>();

  useEffect(() => {
    if (participant.status !== "confirmed" || participant.role === "host") return;
    let cancelled = false;
    getSummary(slurp.id)
      .then((s) => { if (!cancelled) setHostVenmoUsername(s.hostVenmoUsername); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [participant.status, participant.role, slurp.id]);

  async function handleToggle(itemId: string): Promise<void> {
    const current = new Set(participant.selectedItemIds);
    if (current.has(itemId)) {
      current.delete(itemId);
    } else {
      current.add(itemId);
    }
    setSaving(true);
    setError(null);
    try {
      const updated = await updateSelections(slurp.id, {
        selectedItemIds: Array.from(current),
      });
      onUpdate(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save selection");
    } finally {
      setSaving(false);
    }
  }

  async function handleDone(): Promise<void> {
    setConfirming(true);
    setError(null);
    try {
      const updated = await confirmSlurp(slurp.id);
      onUpdate(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to confirm");
    } finally {
      setConfirming(false);
    }
  }

  // Compute live breakdown using shared calc.
  // Use the full receipt total as the denominator so tax/tip aren't inflated
  // when other participants haven't made their selections yet.
  const selectorCounts = new Map(slurp.items.map((i) => [
    i.id,
    slurp.participants.filter((p) => p.selectedItemIds.includes(i.id)).length,
  ]));
  const fullReceiptTotal = slurp.items.reduce((s, i) => s + i.price, 0);
  const breakdown = computeParticipantBreakdown(slurp, participant, fullReceiptTotal, selectorCounts);
  const { items: itemSharePrices, tax, tip, total } = breakdown;
  const venmoAmount = slurp.currencyConversion.enabled
    ? getVenmoAmount(total, slurp.currencyConversion)
    : total;
  const venmoUrl = useVenmoUrl(hostVenmoUsername ?? "", venmoAmount, "Slurp: " + slurp.title);

  if (slurp.items.length === 0) {
    return <p className="text-gray-400 dark:text-gray-500 text-sm">No items to select yet.</p>;
  }

  return (
    <div className="space-y-4">
      <ul className="divide-y dark:divide-gray-700 border dark:border-gray-700 rounded-xl overflow-hidden shadow-sm">
        {slurp.items.map((item) => {
          const selected = participant.selectedItemIds.includes(item.id);
          const selectors = slurp.participants.filter((p) =>
            p.selectedItemIds.includes(item.id)
          );
          const sharePrice = item.price / Math.max(selectors.length, 1);
          const othersWhoSelected = selectors.filter((p) => p.uid !== participant.uid);
          return (
            <li key={item.id} className="px-3 py-2 bg-white dark:bg-gray-900 hover:bg-slate-50 dark:hover:bg-gray-800 transition-colors duration-150">
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id={`item-${item.id}`}
                  checked={selected}
                  onChange={() => handleToggle(item.id)}
                  disabled={saving}
                  className="h-5 w-5 shrink-0"
                />
                <label htmlFor={`item-${item.id}`} className="flex-1 text-sm cursor-pointer font-medium">
                  {item.name}
                </label>
                <div className="text-sm text-right">
                  <span className="text-gray-900 dark:text-gray-100">{formatAmount(sharePrice, slurp.currencyConversion)}</span>
                  {selectors.length > 1 && (
                    <span className="text-gray-400 dark:text-gray-500 ml-1 text-xs">/ {formatAmount(item.price, slurp.currencyConversion)}</span>
                  )}
                  {selectors.length === 1 && (
                    <span className="text-gray-400 dark:text-gray-500 ml-1 text-xs">(full)</span>
                  )}
                </div>
              </div>
              {othersWhoSelected.length > 0 && (
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 ml-7">
                  {othersWhoSelected.map((p) => p.displayName ?? "Unknown").join(", ")}
                </p>
              )}
            </li>
          );
        })}
      </ul>

      {saving && <p className="text-xs text-gray-400 dark:text-gray-500">Saving...</p>}

      {/* Live breakdown */}
      {itemSharePrices.length > 0 && (
        <div className="bg-purple-50/50 dark:bg-purple-950/50 border border-purple-100 dark:border-purple-900 rounded-xl px-4 py-4 text-sm space-y-1 shadow-sm">
          {itemSharePrices.map(({ item, sharePrice }) => (
            <div key={item.id} className="flex justify-between text-gray-600 dark:text-gray-400">
              <span>{item.name}</span>
              <span>{formatAmount(sharePrice, slurp.currencyConversion)}</span>
            </div>
          ))}
          <div className="border-t border-purple-100 dark:border-purple-900 pt-2 mt-2 space-y-1">
            <div className="flex justify-between text-gray-500 dark:text-gray-400">
              <span>Tax</span>
              <span>{formatAmount(tax, slurp.currencyConversion)}</span>
            </div>
            <div className="flex justify-between text-gray-500 dark:text-gray-400">
              <span>Tip</span>
              <span>{formatAmount(tip, slurp.currencyConversion)}</span>
            </div>
            <div className="flex justify-between font-bold text-purple-700 pt-1">
              <span>Your total</span>
              <span>{formatAmount(total, slurp.currencyConversion)}</span>
            </div>
          </div>
        </div>
      )}


      {error && <p className="text-xs text-red-600">{error}</p>}

      {participant.status === "confirmed" ? (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-green-600 text-sm font-medium">Done</p>
          {hostVenmoUsername && total > 0 &&
            isVenmoEligible(slurp.currencyConversion) && (
              <a
                href={venmoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-lg border border-purple-600 px-3 py-1.5 text-sm text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-950 transition-colors duration-150"
              >
                Pay in Venmo
              </a>
            )}
        </div>
      ) : (
        <button
          onClick={handleDone}
          disabled={confirming || saving}
          className="rounded-lg bg-green-600 px-5 py-2 text-white text-sm hover:bg-green-700 transition-colors duration-150 shadow-sm disabled:opacity-50"
        >
          {confirming ? "Saving..." : "Done"}
        </button>
      )}
    </div>
  );
}
