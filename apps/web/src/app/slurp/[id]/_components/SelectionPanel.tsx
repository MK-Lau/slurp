"use client";

import { useEffect, useState } from "react";
import { updateSelections, confirmSlurp, getSummary } from "@/lib/slurps";
import { useVenmoUrl } from "@/hooks/useVenmoUrl";
import type { Slurp, Participant } from "@slurp/types";
import { computeParticipantBreakdown } from "@slurp/types";
import { formatAmount, getVenmoAmount, isVenmoEligible } from "@/lib/currency";
import { Btn, Card, Divider, EmptyState } from "@/components/ui";

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

  const isConfirmed = participant.status === "confirmed";

  async function handleToggle(itemId: string): Promise<void> {
    if (isConfirmed) return;
    const current = new Set(participant.selectedItemIds);
    if (current.has(itemId)) current.delete(itemId);
    else current.add(itemId);
    setSaving(true);
    setError(null);
    try {
      const updated = await updateSelections(slurp.id, { selectedItemIds: Array.from(current) });
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
    return <EmptyState icon="🛒" title="No items yet" subtitle="The host hasn't added any items." />;
  }

  return (
    <div className="space-y-4 pb-12">
      {isConfirmed && (
        <div className="rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-700 px-4 py-3 flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-300 font-medium">
          <span>✓</span>
          <span>You've confirmed your selections</span>
          <span className="ml-auto text-sm font-semibold px-3 py-1.5 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-300">
            Confirmed ✓
          </span>
        </div>
      )}

      {/* Item list */}
      <Card className="overflow-hidden divide-y divide-gray-50">
        {slurp.items.map((item) => {
          const selected = participant.selectedItemIds.includes(item.id);
          const selectors = slurp.participants.filter((p) => p.selectedItemIds.includes(item.id));
          const sharePrice = item.price / Math.max(selectors.length, 1);
          const othersWhoSelected = selectors
            .filter((p) => p.uid !== participant.uid)
            .map((p) => p.displayName?.split(" ")[0] ?? "?")
            .join(", ");

          return (
            <button
              key={item.id}
              onClick={() => void handleToggle(item.id)}
              disabled={isConfirmed || saving}
              className={`w-full flex items-center gap-3.5 px-4 py-3.5 text-left transition-all duration-150 ${
                selected ? "bg-purple-50 dark:bg-purple-900/20" : "hover:bg-gray-50 dark:hover:bg-gray-700/40"
              } ${isConfirmed ? "cursor-default" : "cursor-pointer"}`}
            >
              {/* Custom checkbox */}
              <div
                className={`shrink-0 w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all duration-150 ${
                  selected ? "bg-purple-600 border-purple-600" : "border-gray-300 dark:border-gray-600"
                }`}
              >
                {selected && (
                  <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                    <path d="M1 4l3 3 5-6" stroke="white" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium ${selected ? "text-gray-900 dark:text-gray-100" : "text-gray-600 dark:text-gray-400"}`}>{item.name}</p>
                {othersWhoSelected && (
                  <p className="text-xs text-gray-400 mt-0.5">also: {othersWhoSelected}</p>
                )}
              </div>
              <div className="text-right shrink-0">
                <p className={`text-sm font-semibold ${selected ? "text-purple-700 dark:text-purple-400" : "text-gray-500 dark:text-gray-400"}`}>
                  {formatAmount(sharePrice, slurp.currencyConversion)}
                </p>
                {selectors.length > 1 && (
                  <p className="text-[10px] text-gray-400">of {formatAmount(item.price, slurp.currencyConversion)}</p>
                )}
              </div>
            </button>
          );
        })}
      </Card>

      {/* Running total */}
      {itemSharePrices.length > 0 && (
        <Card className="overflow-hidden">
          <div className="px-4 pt-4 pb-2 space-y-2">
            {itemSharePrices.map(({ item, sharePrice }) => (
              <div key={item.id} className="flex justify-between text-sm text-gray-600 dark:text-gray-400">
                <span className="truncate mr-4">{item.name}</span>
                <span className="shrink-0 font-medium">{formatAmount(sharePrice, slurp.currencyConversion)}</span>
              </div>
            ))}
          </div>
          <Divider />
          <div className="px-4 py-3 space-y-1.5">
            <div className="flex justify-between text-sm text-gray-400">
              <span>Tax</span><span>{formatAmount(tax, slurp.currencyConversion)}</span>
            </div>
            <div className="flex justify-between text-sm text-gray-400">
              <span>Tip</span><span>{formatAmount(tip, slurp.currencyConversion)}</span>
            </div>
          </div>
          <div className="px-4 py-3 bg-purple-50 dark:bg-purple-900/30 flex justify-between items-center rounded-b-2xl">
            <span className="font-bold text-purple-700">Your total</span>
            <span className="font-bold text-purple-700 text-lg">{formatAmount(total, slurp.currencyConversion)}</span>
          </div>
        </Card>
      )}

      {saving && <p className="text-xs text-gray-400">Saving…</p>}
      {error && <p className="text-xs text-red-600">{error}</p>}

      {isConfirmed ? (
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300 text-sm font-semibold">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M2 7l4 4 6-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Confirmed
          </span>
          {hostVenmoUsername && total > 0 && isVenmoEligible(slurp.currencyConversion) && (
            <a href={venmoUrl} target="_blank" rel="noopener noreferrer">
              <Btn variant="outline" size="md">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.9 1.6c.8 1.3 1.1 2.6 1.1 4.3 0 5.4-4.6 12.4-8.4 17.3H2.4L0 2.5l7.3-.7 1.3 10.5c1.2-2 2.7-5.2 2.7-7.3 0-1.2-.2-2-.5-2.7l7.1-1.7z"/>
                </svg>
                Pay in Venmo
              </Btn>
            </a>
          )}
        </div>
      ) : (
        <Btn
          variant="success"
          size="lg"
          className="w-full"
          onClick={() => void handleDone()}
          disabled={confirming || saving || participant.selectedItemIds.length === 0}
        >
          {confirming ? "Saving…" : "Done — confirm selections"}
        </Btn>
      )}
    </div>
  );
}
