"use client";

import { useState } from "react";
import { removeParticipant } from "@/lib/slurps";
import type { Slurp, Participant } from "@slurp/types";

interface Props {
  slurpId: string;
  participant: Participant;
  onDone: (updatedSlurp: Slurp) => void;
  onCancel: () => void;
}

export default function RemoveParticipantModal({ slurpId, participant, onDone, onCancel }: Props): React.JSX.Element {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const label = participant.displayName ?? participant.email ?? "this participant";

  async function handleRemove(block: boolean): Promise<void> {
    setLoading(true);
    setError(null);
    try {
      const updated = await removeParticipant(slurpId, participant.uid, block);
      onDone(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove participant");
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl w-full max-w-sm p-6 space-y-4">
        <h2 className="text-lg font-semibold">Remove {label}?</h2>

        {error && <p className="text-red-600 text-sm">{error}</p>}

        <div className="flex flex-col gap-2">
          <button
            onClick={() => void handleRemove(false)}
            disabled={loading}
            className="w-full rounded bg-red-600 px-4 py-2 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50"
          >
            Remove from this slurp
          </button>
          <button
            onClick={() => void handleRemove(true)}
            disabled={loading}
            className="w-full rounded bg-red-800 px-4 py-2 text-white text-sm font-medium hover:bg-red-900 disabled:opacity-50"
          >
            Remove &amp; block from all my slurps
          </button>
          <button
            onClick={onCancel}
            disabled={loading}
            className="w-full rounded border border-gray-300 dark:border-gray-600 px-4 py-2 text-gray-700 dark:text-gray-300 text-sm hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
