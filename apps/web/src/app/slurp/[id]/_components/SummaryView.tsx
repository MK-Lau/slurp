"use client";

import { useEffect, useState } from "react";
import { getSummary, markAsPaid } from "@/lib/slurps";
import { useVenmoUrl } from "@/hooks/useVenmoUrl";
import type { Slurp, SummaryResponse } from "@slurp/types";
import { CURRENCY_MAP } from "@slurp/types";
import { formatAmount, getVenmoAmount, isVenmoEligible } from "@/lib/currency";
import { Avatar, Badge, Btn, Card, Divider } from "@/components/ui";

function VenmoLink({ username, amount, note }: { username: string; amount: number; note: string }) {
  const url = useVenmoUrl(username, amount, note);
  return (
    <a href={url} target="_blank" rel="noopener noreferrer">
      <Btn variant="outline" size="sm">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <path d="M17.9 1.6c.8 1.3 1.1 2.6 1.1 4.3 0 5.4-4.6 12.4-8.4 17.3H2.4L0 2.5l7.3-.7 1.3 10.5c1.2-2 2.7-5.2 2.7-7.3 0-1.2-.2-2-.5-2.7l7.1-1.7z"/>
        </svg>
        Pay in Venmo
      </Btn>
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
  if (!summary) return <p className="text-gray-400 text-sm">Loading summary…</p>;

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
    <div className="space-y-4 pb-12">
      {/* Currency conversion banner */}
      {slurp.currencyConversion.enabled && (
        <div className="rounded-xl bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-700 px-4 py-3">
          <p className="text-xs font-semibold text-purple-700 dark:text-purple-300 uppercase tracking-wide mb-0.5">Currency Conversion</p>
          <p className="text-sm text-purple-800 dark:text-purple-200">
            Billed in {CURRENCY_MAP[slurp.currencyConversion.billedCurrency]?.name ?? slurp.currencyConversion.billedCurrency}
            {" · "}Home: {CURRENCY_MAP[slurp.currencyConversion.homeCurrency]?.name ?? slurp.currencyConversion.homeCurrency}
            {" · "}Rate: 1 {slurp.currencyConversion.homeCurrency} = {slurp.currencyConversion.exchangeRate} {slurp.currencyConversion.billedCurrency}
          </p>
        </div>
      )}

      {/* Unclaimed items */}
      {unclaimedItems.length > 0 && (
        <div className="rounded-xl border border-amber-200 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 p-4">
          <p className="text-sm font-semibold text-amber-800 dark:text-amber-300 mb-2">Unclaimed Items ({unclaimedItems.length})</p>
          <ul className="text-sm divide-y divide-amber-200 dark:divide-amber-700">
            {unclaimedItems.map((item) => (
              <li key={item.id} className="py-1.5 flex justify-between text-amber-900 dark:text-amber-300">
                <span>{item.name}</span>
                <span>{formatAmount(item.price, slurp.currencyConversion)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Per-participant cards */}
      {summary.participants.map((p) => {
        const isCurrentUser = p.uid === viewerUid;
        const participantPaid = p.paid ?? false;
        const participantData = slurp.participants.find((sp) => sp.uid === p.uid);

        return (
          <Card key={p.uid} className={`overflow-hidden ${isCurrentUser ? "ring-2 ring-purple-200" : ""}`}>
            {/* Card header */}
            <div className="px-4 py-3 flex items-center gap-3 border-b border-gray-50 dark:border-gray-700">
              <Avatar name={p.displayName ?? "?"} size="md" />
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm text-gray-900 dark:text-gray-100">
                  {p.displayName ?? "Unknown"}
                  {isCurrentUser && <span className="text-purple-500 font-normal text-xs ml-1">(you)</span>}
                </p>
                <p className="text-xs text-gray-400">{participantData?.role ?? "guest"}</p>
              </div>
              {participantData?.status !== "confirmed" ? (
                <Badge color="amber">Pending</Badge>
              ) : participantPaid ? (
                <Badge color="green">Paid</Badge>
              ) : isHost && !isCurrentUser ? (
                <Badge color="gray">Unpaid</Badge>
              ) : null}
            </div>

            {p.items.length === 0 ? (
              <p className="px-4 py-3 text-sm text-gray-400">No items selected.</p>
            ) : (
              <>
                <div className="px-4 py-3 space-y-1.5">
                  {p.items.map(({ item, sharePrice }) => (
                    <div key={item.id} className="flex justify-between text-sm">
                      <span className="text-gray-600 dark:text-gray-400 truncate mr-4">{item.name}</span>
                      <span className="text-gray-800 dark:text-gray-200 font-medium shrink-0">{formatAmount(sharePrice, slurp.currencyConversion)}</span>
                    </div>
                  ))}
                </div>
                <Divider />
                <div className="px-4 py-3 space-y-1">
                  <div className="flex justify-between text-xs text-gray-400">
                    <span>Subtotal</span><span>{formatAmount(p.subtotal, slurp.currencyConversion)}</span>
                  </div>
                  <div className="flex justify-between text-xs text-gray-400">
                    <span>Tax</span><span>{formatAmount(p.tax, slurp.currencyConversion)}</span>
                  </div>
                  <div className="flex justify-between text-xs text-gray-400">
                    <span>Tip</span><span>{formatAmount(p.tip, slurp.currencyConversion)}</span>
                  </div>
                  <div className="flex justify-between font-bold text-purple-700 dark:text-purple-400 pt-1 border-t border-gray-100 dark:border-gray-700 mt-1">
                    <span>Total</span><span>{formatAmount(p.total, slurp.currencyConversion)}</span>
                  </div>
                </div>

                {isCurrentUser && !isHost && (
                  <div className="px-4 pb-4 flex flex-wrap gap-2">
                    {participantPaid ? (
                      <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-300 text-sm font-semibold">
                        ✓ Paid
                      </span>
                    ) : (
                      <Btn variant="success" size="sm" onClick={() => void handleMarkAsPaid()} disabled={paying}>
                        {paying ? "Marking…" : "Mark as paid"}
                      </Btn>
                    )}
                    {hostVenmoUsername && p.total > 0 && isVenmoEligible(slurp.currencyConversion) && (
                      <VenmoLink
                        username={hostVenmoUsername}
                        amount={slurp.currencyConversion.enabled ? getVenmoAmount(p.total, slurp.currencyConversion) : p.total}
                        note={"Slurp: " + slurp.title}
                      />
                    )}
                  </div>
                )}
              </>
            )}
          </Card>
        );
      })}
    </div>
  );
}
