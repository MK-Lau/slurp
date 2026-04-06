"use client";

import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { updateProfile } from "@/lib/users";

export default function VenmoPrompt(): React.JSX.Element {
  const { venmoPromptPending, profile, clearVenmoPrompt, markVenmoDismissed } = useAuth();
  const router = useRouter();

  if (!venmoPromptPending || !profile.ready || profile.venmoUsername || profile.dismissedVenmo) return <></>;

  async function handleDismiss(): Promise<void> {
    await updateProfile({ dismissedVenmoPrompt: true }).catch(() => {});
    markVenmoDismissed();
    clearVenmoPrompt();
  }

  function handleSetUp(): void {
    clearVenmoPrompt();
    router.push("/profile");
  }

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-full max-w-sm px-4">
      <div className="bg-white dark:bg-gray-900 border dark:border-gray-700 rounded-lg shadow-lg p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">Set up your Venmo username</p>
          <button
            onClick={clearVenmoPrompt}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Guests can pay you directly through Venmo when a slurp is finalized.
        </p>
        <div className="flex gap-2">
          <button
            onClick={handleSetUp}
            className="flex-1 rounded bg-purple-600 px-3 py-1.5 text-sm text-white hover:bg-purple-700"
          >
            Set up Venmo
          </button>
          <button
            onClick={() => void handleDismiss()}
            className="flex-1 rounded border dark:border-gray-600 px-3 py-1.5 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            Never show again
          </button>
        </div>
      </div>
    </div>
  );
}
