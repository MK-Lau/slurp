"use client";

import { useState } from "react";
import { confirmSlurp } from "@/lib/slurps";
import type { Slurp, Participant } from "@slurp/types";

interface Props {
  slurp: Slurp;
  participant: Participant;
  onUpdate: (d: Slurp) => void;
}

export default function ConfirmButton({ slurp, participant, onUpdate }: Props): React.JSX.Element {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (participant.status === "confirmed") {
    return (
      <p className="text-green-600 font-medium text-sm">
        You have confirmed your selections.
      </p>
    );
  }

  async function handleConfirm(): Promise<void> {
    setLoading(true);
    setError(null);
    try {
      const updated = await confirmSlurp(slurp.id);
      onUpdate(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to confirm");
      setLoading(false);
    }
  }

  return (
    <div>
      <button
        onClick={handleConfirm}
        disabled={loading}
        className="rounded bg-green-600 px-6 py-2 text-white hover:bg-green-700 disabled:opacity-50"
      >
        {loading ? "Confirming..." : "Confirm My Selections"}
      </button>
      {error && <p className="text-red-600 text-sm mt-1">{error}</p>}
    </div>
  );
}
