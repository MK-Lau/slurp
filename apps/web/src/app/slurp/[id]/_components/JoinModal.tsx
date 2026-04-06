"use client";

import { useState } from "react";
import { joinSlurp } from "@/lib/slurps";
import { updateProfile } from "@/lib/users";
import { useAuth } from "@/contexts/AuthContext";
import type { Slurp } from "@slurp/types";

interface Props {
  slurpId: string;
  inviteToken: string;
  title: string;
  hostDisplayName: string;
  defaultDisplayName?: string;
  onJoined: (d: Slurp) => void;
  onDismiss: () => void;
}

export default function JoinModal({
  slurpId,
  inviteToken,
  title,
  hostDisplayName,
  defaultDisplayName,
  onJoined,
  onDismiss,
}: Props): React.JSX.Element {
  const { refreshProfile } = useAuth();
  const [displayName, setDisplayName] = useState(defaultDisplayName ?? "");
  const [nameError, setNameError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleJoin(): Promise<void> {
    const trimmed = displayName.trim();
    if (trimmed.length < 3) {
      setNameError("Display name must be at least 3 characters");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await joinSlurp(slurpId, { inviteToken, displayName: trimmed });
      // Save display name to profile and refresh context so the sidebar updates.
      updateProfile({ displayName: trimmed })
        .then(() => refreshProfile())
        .catch(() => {});
      onJoined(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to join slurp");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl w-full max-w-sm p-6 space-y-4">
        <div>
          <h2 className="text-xl font-bold">Join {title}</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Hosted by {hostDisplayName}</p>
        </div>

        <div>
          <label htmlFor="displayName" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Your name
          </label>
          <input
            id="displayName"
            type="text"
            className="w-full border rounded px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
            placeholder="Your name"
            value={displayName}
            maxLength={40}
            onChange={(e) => { setDisplayName(e.target.value); setNameError(null); }}
          />
          {nameError && <p className="text-red-600 text-xs mt-1">{nameError}</p>}
        </div>

        {error && <p className="text-red-600 text-sm">{error}</p>}

        <div className="flex flex-col gap-2">
          <button
            onClick={handleJoin}
            disabled={loading}
            className="w-full rounded bg-purple-600 px-4 py-2 text-white text-sm font-medium hover:bg-purple-700 disabled:opacity-50"
          >
            {loading ? "Joining..." : "Join"}
          </button>
          <button
            onClick={onDismiss}
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
