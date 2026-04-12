"use client";

import { useState } from "react";
import { deleteSlurp } from "@/lib/slurps";

interface Props {
  slurpId: string;
  slurpTitle: string;
  onDone: () => void;
  onCancel: () => void;
}

export default function DeleteSlurpModal({ slurpId, slurpTitle, onDone, onCancel }: Props): React.JSX.Element {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete(): Promise<void> {
    setLoading(true);
    setError(null);
    try {
      await deleteSlurp(slurpId);
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete slurp");
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl w-full max-w-sm p-6 space-y-4">
        <h2 className="text-lg font-semibold">Delete &ldquo;{slurpTitle}&rdquo;?</h2>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          This will permanently delete the slurp and all its items. This cannot be undone.
        </p>

        {error && <p className="text-red-600 text-sm">{error}</p>}

        <div className="flex flex-col gap-2">
          <button
            onClick={() => void handleDelete()}
            disabled={loading}
            className="w-full rounded bg-red-600 px-4 py-2 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50"
          >
            {loading ? "Deleting…" : "Delete slurp"}
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
