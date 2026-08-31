"use client";

import { useEffect, useState } from "react";
import { getSummary } from "@/lib/slurps";
import { useVenmoUrl } from "@/hooks/useVenmoUrl";
import type { Slurp, SummaryResponse } from "@slurp/types";
import { CURRENCY_MAP, computeFixedItemShareCents } from "@slurp/types";
import { formatAmount, getVenmoAmount, isVenmoEligible } from "@/lib/currency";
import { partyStatus } from "@/lib/party";
import { Avatar, Badge, Btn, Card, Divider, VenmoIcon } from "@/components/ui";
import PartyIncompleteModal from "./PartyIncompleteModal";

/**
 * When `onWarn` is provided the party is incomplete, so the button opens the warning
 * instead of navigating; the modal then owns the actual link.
 */
function VenmoLink({
  username,
  amount,
  note,
  onWarn,
}: {
  username: string;
  amount: number;
  note: string;
  onWarn?: (url: string) => void;
}) {
  const url = useVenmoUrl(username, amount, note);

  if (onWarn) {
    return (
      <Btn variant="outline" size="sm" onClick={() => onWarn(url)}>
        <VenmoIcon />
        Pay in Venmo
      </Btn>
    );
  }

  return (
    <a href={url} target="_blank" rel="noopener noreferrer">
      <Btn variant="outline" size="sm">
        <VenmoIcon />
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

export default function SummaryView({ slurp, isHost, viewerUid }: Props): React.JSX.Element {
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<{ url: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    getSummary(slurp.id)
      .then((s) => { if (!cancelled) setSummary(s); })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load summary"); });
    return () => { cancelled = true; };
  }, [slurp.id, slurp.splitRevision, slurp.updatedAt]);

  if (error) return <p className="text-red-600">{error}</p>;
  if (!summary) return <p className="text-gray-400 text-sm">Loading summary…</p>;

  const hostVenmoUsername = summary.hostVenmoUsername;

  const claimedItemIds = new Set(slurp.participants.flatMap((p) => p.selectedItemIds));
  const unclaimedItems = slurp.items.flatMap((item) => {
    if (slurp.splitVersion !== 2) {
      return claimedItemIds.has(item.id) ? [] : [{ item, remainingShares: 1, remainingAmount: item.price }];
    }
    const claimedShares = slurp.participants.reduce(
      (sum, participant) => sum + (participant.selectedItemShares?.[item.id] ?? 0),
      0
    );
    const remainingShares = Math.max(0, (item.shareCount ?? 1) - claimedShares);
    return remainingShares === 0 ? [] : [{
      item,
      remainingShares,
      remainingAmount: computeFixedItemShareCents(item) * remainingShares / 100,
    }];
  });
  const party = partyStatus(slurp);

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
            {unclaimedItems.map(({ item, remainingShares, remainingAmount }) => (
              <li key={item.id} className="py-1.5 flex justify-between text-amber-900 dark:text-amber-300">
                <span>{item.name}{slurp.splitVersion === 2 ? ` · ${remainingShares} share${remainingShares === 1 ? "" : "s"}` : ""}</span>
                <span>{formatAmount(remainingAmount, slurp.currencyConversion)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Per-participant cards */}
      {summary.participants.map((p) => {
        const isCurrentUser = p.uid === viewerUid;
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
              ) : null}
            </div>

            {p.items.length === 0 && !p.roundingAdjustment ? (
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
                  {!!p.roundingAdjustment && (
                    <div className="flex justify-between text-xs text-gray-400">
                      <span>Rounding adjustment</span><span>{formatAmount(p.roundingAdjustment, slurp.currencyConversion)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-bold text-purple-700 dark:text-purple-400 pt-1 border-t border-gray-100 dark:border-gray-700 mt-1">
                    <span>Total</span><span>{formatAmount(p.total, slurp.currencyConversion)}</span>
                  </div>
                </div>

                {isCurrentUser && !isHost
                  && (slurp.splitVersion !== 2 || participantData?.status === "confirmed") && (
                  <div className="px-4 pb-4 flex flex-wrap gap-2">
                    {hostVenmoUsername && p.total > 0 && isVenmoEligible(slurp.currencyConversion) && (
                      <VenmoLink
                        username={hostVenmoUsername}
                        amount={slurp.currencyConversion.enabled ? getVenmoAmount(p.total, slurp.currencyConversion) : p.total}
                        note={"Slurp: " + slurp.title}
                        {...(party.incomplete && slurp.splitVersion !== 2
                          ? { onWarn: (url: string) => setWarning({ url }) }
                          : {})}
                      />
                    )}
                  </div>
                )}
              </>
            )}
          </Card>
        );
      })}

      {warning && party.expectedTotal != null && slurp.splitVersion !== 2 && (
        <PartyIncompleteModal
          joined={party.joined}
          expectedTotal={party.expectedTotal}
          continueHref={warning.url}
          onContinue={() => setWarning(null)}
          onCancel={() => setWarning(null)}
        />
      )}
    </div>
  );
}
