"use client";

import { useState } from "react";
import type { Slurp, Participant } from "@slurp/types";
import { CURRENCY_MAP } from "@slurp/types";
import ParticipantList from "./ParticipantList";
import SelectionPanel from "./SelectionPanel";
import { formatAmount } from "@/lib/currency";

interface Props {
  slurp: Slurp;
  participant: Participant;
  onUpdate: (d: Slurp) => void;
}

export default function GuestView({ slurp, participant, onUpdate }: Props): React.JSX.Element {
  const [billExpanded, setBillExpanded] = useState(false);

  const billSubtotal = slurp.items.reduce((s, i) => s + i.price, 0);
  const billTotal = billSubtotal + slurp.taxAmount + slurp.tipAmount;

  return (
    <div className="space-y-8">
      {slurp.currencyConversion.enabled && (
        <div className="bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800 rounded-xl px-4 py-3">
          <p className="text-xs font-semibold text-purple-700 dark:text-purple-300 uppercase tracking-wide mb-0.5">Currency Conversion</p>
          <p className="text-sm text-purple-800 dark:text-purple-200">
            Billed in {CURRENCY_MAP[slurp.currencyConversion.billedCurrency]?.name ?? slurp.currencyConversion.billedCurrency}
            {" · "}Home currency: {CURRENCY_MAP[slurp.currencyConversion.homeCurrency]?.name ?? slurp.currencyConversion.homeCurrency}
            {" · "}Rate: 1 {slurp.currencyConversion.homeCurrency} = {slurp.currencyConversion.exchangeRate} {slurp.currencyConversion.billedCurrency}
          </p>
        </div>
      )}
      <section>
        <h2 className="font-semibold text-lg">Participants</h2>
        <ParticipantList slurp={slurp} />
      </section>

      {slurp.items.length > 0 && (
        <div className="bg-gray-50/50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm overflow-hidden">
          <button
            onClick={() => setBillExpanded((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-3 text-sm text-gray-500 dark:text-gray-400 hover:bg-gray-100/60 dark:hover:bg-gray-700/40 transition-colors duration-150"
          >
            <span>{billExpanded ? "Hide totals" : "See totals"}</span>
            <span className="text-xs">{billExpanded ? "▲" : "▼"}</span>
          </button>
          {billExpanded && (
            <div className="px-4 pb-4 text-sm space-y-1 border-t border-gray-200 dark:border-gray-700 pt-3">
              <div className="flex justify-between text-gray-400 dark:text-gray-500">
                <span>Items subtotal</span>
                <span>{formatAmount(billSubtotal, slurp.currencyConversion)}</span>
              </div>
              <div className="flex justify-between text-gray-400 dark:text-gray-500">
                <span>Tax</span>
                <span>{formatAmount(slurp.taxAmount, slurp.currencyConversion)}</span>
              </div>
              <div className="flex justify-between text-gray-400 dark:text-gray-500">
                <span>Tip</span>
                <span>{formatAmount(slurp.tipAmount, slurp.currencyConversion)}</span>
              </div>
              <div className="flex justify-between font-semibold text-gray-500 dark:text-gray-400 border-t border-gray-200 dark:border-gray-700 pt-2 mt-1">
                <span>Bill total</span>
                <span>{formatAmount(billTotal, slurp.currencyConversion)}</span>
              </div>
            </div>
          )}
        </div>
      )}

      <section>
        <h2 className="font-semibold text-lg">Your Selections</h2>
        <SelectionPanel slurp={slurp} participant={participant} onUpdate={onUpdate} />
      </section>
    </div>
  );
}
