"use client";

import { useMemo, useState } from "react";
import type { Slurp, Participant } from "@slurp/types";
import { computeParticipantBreakdown, CURRENCY_MAP } from "@slurp/types";
import SelectionPanel from "./SelectionPanel";
import SummaryView from "./SummaryView";
import ParticipantList from "./ParticipantList";
import { Card, Divider } from "@/components/ui";

interface Props {
  slurp: Slurp;
  participant: Participant;
  onUpdate: (d: Slurp) => void;
  tab: string;
}

function fmt(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function TotalsAccordion({ slurp, participant }: { slurp: Slurp; participant: Participant }): React.JSX.Element {
  const [open, setOpen] = useState(false);

  const breakdown = useMemo(() => {
    const itemMap = new Map(slurp.items.map((i) => [i.id, i]));
    const selectorCounts = new Map<string, number>();
    for (const p of slurp.participants) {
      for (const id of p.selectedItemIds) {
        selectorCounts.set(id, (selectorCounts.get(id) ?? 0) + 1);
      }
    }
    const totalSubtotal = slurp.participants.reduce((acc, p) =>
      acc + p.selectedItemIds.reduce((s, id) => {
        const item = itemMap.get(id);
        return item ? s + item.price / Math.max(selectorCounts.get(id) ?? 1, 1) : s;
      }, 0), 0);
    return computeParticipantBreakdown(slurp, participant, totalSubtotal, selectorCounts);
  }, [slurp, participant]);

  const symbol = CURRENCY_MAP[slurp.currencyConversion?.billedCurrency ?? ""]?.symbol ?? "$";

  return (
    <Card className="overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
      >
        <span>{open ? "Hide totals" : "See totals"}</span>
        <svg
          width="16" height="16" viewBox="0 0 16 16" fill="none"
          className={`transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        >
          <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <>
          <Divider />
          <div className="px-4 py-3 space-y-1.5 text-sm">
            <div className="flex justify-between text-gray-600 dark:text-gray-400">
              <span>Subtotal</span>
              <span>{symbol}{fmt(breakdown.subtotal)}</span>
            </div>
            <div className="flex justify-between text-gray-600 dark:text-gray-400">
              <span>Tax</span>
              <span>{symbol}{fmt(breakdown.tax)}</span>
            </div>
            <div className="flex justify-between text-gray-600 dark:text-gray-400">
              <span>Tip</span>
              <span>{symbol}{fmt(breakdown.tip)}</span>
            </div>
            <Divider />
            <div className="flex justify-between font-semibold text-purple-700">
              <span>Your total</span>
              <span>{symbol}{fmt(breakdown.total)}</span>
            </div>
          </div>
        </>
      )}
    </Card>
  );
}

export default function GuestView({ slurp, participant, onUpdate, tab }: Props): React.JSX.Element {
  if (tab === "summary") {
    return <SummaryView slurp={slurp} isHost={false} viewerUid={participant.uid} onUpdate={onUpdate} />;
  }

  return (
    <div className="space-y-6">
      <ParticipantList slurp={slurp} />
      <TotalsAccordion slurp={slurp} participant={participant} />
      <SelectionPanel slurp={slurp} participant={participant} onUpdate={onUpdate} />
    </div>
  );
}
