"use client";

import { useState } from "react";
import { deleteSlurp } from "@/lib/slurps";
import { Btn, Card } from "@/components/ui";

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
      setError(err instanceof Error ? err.message : "Failed to delete Slurp");
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[60] flex items-center justify-center p-6">
      <Card className="p-6 max-w-xs w-full shadow-xl">
        <p className="font-semibold text-gray-900 mb-1">Delete &ldquo;{slurpTitle}&rdquo;?</p>
        <p className="text-sm text-gray-500 mb-5">
          This will permanently remove this Slurp and all its items. This can&rsquo;t be undone.
        </p>
        {error && <p className="text-red-600 text-sm mb-3">{error}</p>}
        <div className="flex gap-2">
          <Btn variant="danger" className="flex-1" onClick={() => void handleDelete()} disabled={loading}>
            {loading ? "Deleting…" : "Delete"}
          </Btn>
          <Btn variant="secondary" className="flex-1" onClick={onCancel} disabled={loading}>
            Cancel
          </Btn>
        </div>
      </Card>
    </div>
  );
}
