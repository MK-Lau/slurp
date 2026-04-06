"use client";

import { useEffect, useState } from "react";
import { getSummary, markAsPaid } from "@/lib/slurps";
import { useVenmoUrl } from "@/hooks/useVenmoUrl";
import type { Slurp, SummaryResponse } from "@slurp/types";
import { CURRENCY_MAP } from "@slurp/types";
import { formatAmount, getVenmoAmount, isVenmoEligible } from "@/lib/currency";

function VenmoLink({ username, amount, note }: { username: string; amount: number; note: string }) {
  const url = useVenmoUrl(username, amount, note);
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="rounded-lg border border-purple-600 px-3 py-1.5 text-sm text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-950 transition-colors duration-150"
    >
      Pay in Venmo
    </a>
  );
}

interface Props {
  slurp: Slurp;
  isHost: boolean;
  viewerUid: string;
  onUpdate: (d: Slurp) => void;
}

export default function SummaryView({ slurp, isHost, viewerUid, onUpdate }: Props): React.JSX.Element {
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);

  const participantsPaidKey = slurp.participants.map((p) => `${p.uid}:${p.paid ?? false}`).join(",");

  useEffect(() => {
    let cancelled = false;
    getSummary(slurp.id)
      .then((s) => { if (!cancelled) setSummary(s); })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load summary"); });
    return () => { cancelled = true; };
  }, [slurp.id, participantsPaidKey]);

  if (error) return <p className="text-red-600">{error}</p>;
  if (!summary) return <p className="text-gray-400 dark:text-gray-500">Loading summary...</p>;

  const hostVenmoUsername = summary.hostVenmoUsername;

  async function handleMarkAsPaid(): Promise<void> {
    setPaying(true);
    try {
      const updated = await markAsPaid(slurp.id);
      onUpdate(updated);
      const refreshed = await getSummary(slurp.id);
      setSummary(refreshed);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to mark as paid");
    } finally {
      setPaying(false);
    }
  }

  const claimedItemIds = new Set(slurp.participants.flatMap((p) => p.selectedItemIds));
  const unclaimedItems = slurp.items.filter((item) => !claimedItemIds.has(item.id));

  return (
    <div className="mt-4">
      <h2 className="text-xl font-semibold mb-3">Summary</h2>
      {slurp.currencyConversion.enabled && (
        <div className="mb-4 bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800 rounded-xl px-4 py-3">
          <p className="text-xs font-semibold text-purple-700 dark:text-purple-300 uppercase tracking-wide mb-0.5">Currency Conversion</p>
          <p className="text-sm text-purple-800 dark:text-purple-200">
            Billed in {CURRENCY_MAP[slurp.currencyConversion.billedCurrency]?.name ?? slurp.currencyConversion.billedCurrency}
            {" · "}Home currency: {CURRENCY_MAP[slurp.currencyConversion.homeCurrency]?.name ?? slurp.currencyConversion.homeCurrency}
            {" · "}Rate: 1 {slurp.currencyConversion.homeCurrency} = {slurp.currencyConversion.exchangeRate} {slurp.currencyConversion.billedCurrency}
          </p>
        </div>
      )}
      {unclaimedItems.length > 0 && (
        <div className="mb-4 border border-amber-200 dark:border-amber-800 rounded-xl p-4 bg-amber-50 dark:bg-amber-950">
          <p className="text-sm font-semibold text-amber-800 dark:text-amber-300 mb-2">
            Unclaimed Items ({unclaimedItems.length})
          </p>
          <ul className="text-sm divide-y divide-amber-200 dark:divide-amber-800">
            {unclaimedItems.map((item) => (
              <li key={item.id} className="py-1.5 flex justify-between text-amber-900 dark:text-amber-200">
                <span>{item.name}</span>
                <span>{formatAmount(item.price, slurp.currencyConversion)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="space-y-4">
        {summary.participants.map((p) => {
          const isCurrentUser = p.uid === viewerUid;
          const participantPaid = p.paid ?? false;

          return (
            <div key={p.uid} className="border dark:border-gray-700 rounded-xl p-4 bg-white dark:bg-gray-900 shadow-sm hover:shadow transition-shadow duration-150">
              <div className="flex items-center justify-between mb-2">
                <p className="font-medium text-sm">{p.displayName ?? "Unknown"}</p>
                {isHost && !isCurrentUser && (
                  participantPaid ? (
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">Paid</span>
                  ) : (
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400">Unpaid</span>
                  )
                )}
              </div>
              {p.items.length === 0 ? (
                <p className="text-gray-400 dark:text-gray-500 text-sm">No items selected</p>
              ) : (
                <ul className="text-sm divide-y dark:divide-gray-700 mb-2">
                  {p.items.map(({ item, sharePrice }) => {
                    const itemTax = p.subtotal > 0 ? (sharePrice / p.subtotal) * p.tax : 0;
                    const itemTip = p.subtotal > 0 ? (sharePrice / p.subtotal) * p.tip : 0;
                    return (
                      <li key={item.id} className="py-2">
                        <div className="flex justify-between">
                          <span>{item.name}</span>
                          <span>{formatAmount(sharePrice, slurp.currencyConversion)}</span>
                        </div>
                        <div className="flex gap-4 text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                          <span>Tax {formatAmount(itemTax, slurp.currencyConversion)}</span>
                          <span>Tip {formatAmount(itemTip, slurp.currencyConversion)}</span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
              <div className="text-sm text-gray-600 dark:text-gray-400 space-y-1 border-t dark:border-gray-700 pt-2">
                <div className="flex justify-between">
                  <span>Subtotal</span><span>{formatAmount(p.subtotal, slurp.currencyConversion)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Tax</span><span>{formatAmount(p.tax, slurp.currencyConversion)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Tip</span><span>{formatAmount(p.tip, slurp.currencyConversion)}</span>
                </div>
                <div className="flex justify-between font-bold text-purple-700">
                  <span>Total</span><span>{formatAmount(p.total, slurp.currencyConversion)}</span>
                </div>
              </div>
              {isCurrentUser && !isHost && (
                <div className="mt-3 flex gap-2 flex-wrap">
                  {participantPaid ? (
                    <button
                      disabled
                      className="rounded-lg bg-emerald-100 px-3 py-1.5 text-sm text-emerald-600 cursor-default"
                    >
                      Paid
                    </button>
                  ) : (
                    <button
                      onClick={handleMarkAsPaid}
                      disabled={paying}
                      className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm text-white hover:bg-emerald-700 transition-colors duration-150 disabled:opacity-50"
                    >
                      {paying ? "Marking..." : "Mark as Paid"}
                    </button>
                  )}
                  {hostVenmoUsername &&
                    p.total > 0 &&
                    isVenmoEligible(slurp.currencyConversion) && (
                      <VenmoLink
                        username={hostVenmoUsername}
                        amount={
                          slurp.currencyConversion.enabled
                            ? getVenmoAmount(p.total, slurp.currencyConversion)
                            : p.total
                        }
                        note={"Slurp: " + slurp.title}
                      />
                    )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
