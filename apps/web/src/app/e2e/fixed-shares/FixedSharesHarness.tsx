"use client";

import { useState } from "react";
import type { Slurp } from "@slurp/types";
import ItemList from "@/app/slurp/[id]/_components/ItemList";
import SelectionPanel from "@/app/slurp/[id]/_components/SelectionPanel";

const initialSlurp: Slurp = {
  id: "e2e-slurp",
  title: "Browser Test Dinner",
  hostUid: "host",
  hostEmail: "host@example.com",
  splitVersion: 2,
  splitRevision: 0,
  taxAmount: 3,
  tipAmount: 6,
  expectedGuests: 2,
  items: [{ id: "pizza", name: "Pizza", price: 30, shareCount: 1 }],
  participants: [
    { uid: "host", role: "host", status: "pending", selectedItemIds: [], selectedItemShares: {} },
    { uid: "guest", role: "guest", status: "pending", selectedItemIds: [], selectedItemShares: {} },
  ],
  participantEmails: ["host@example.com", "guest@example.com"],
  inviteToken: "e2e-token",
  removedUids: [],
  currencyConversion: { enabled: false, billedCurrency: "USD", homeCurrency: "USD", exchangeRate: 1 },
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};

export default function FixedSharesHarness(): React.JSX.Element {
  const [slurp, setSlurp] = useState(initialSlurp);
  const [phase, setPhase] = useState<"host" | "guest">("host");
  const guest = slurp.participants.find((participant) => participant.uid === "guest")!;

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-5">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Fixed-share browser flow</h1>
      <div className="flex gap-2">
        <button className="rounded-lg bg-purple-600 text-white px-3 py-2" onClick={() => setPhase("host")}>Host setup</button>
        <button className="rounded-lg bg-purple-600 text-white px-3 py-2" onClick={() => setPhase("guest")}>Guest flow</button>
      </div>
      {phase === "host" ? (
        <ItemList slurp={slurp} isHost onUpdate={setSlurp} />
      ) : (
        <SelectionPanel slurp={slurp} participant={guest} onUpdate={setSlurp} />
      )}
    </div>
  );
}
