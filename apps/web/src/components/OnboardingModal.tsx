"use client";

import { useState } from "react";
import { updateProfile } from "@/lib/users";
import { useAuth } from "@/contexts/AuthContext";

interface OnboardingModalProps {
  googleDisplayName: string | null;
  onComplete: () => void;
}

export default function OnboardingModal({ googleDisplayName, onComplete }: OnboardingModalProps): React.JSX.Element {
  const { refreshProfile } = useAuth();
  const [displayName, setDisplayName] = useState(googleDisplayName ?? "");
  const [venmoUsername, setVenmoUsername] = useState("");
  const [displayNameError, setDisplayNameError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(): Promise<void> {
    // Validate display name
    const trimmedName = displayName.trim();
    if (trimmedName.length === 0) {
      setDisplayNameError("Display name is required");
      return;
    }
    if (trimmedName.length < 3) {
      setDisplayNameError("Display name must be at least 3 characters");
      return;
    }

    setBusy(true);
    setSubmitError(null);
    try {
      await updateProfile({
        displayName: trimmedName,
        venmoUsername: venmoUsername.trim() || undefined,
      });
      await refreshProfile();
      onComplete();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Failed to save profile");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <form
        className="bg-white dark:bg-gray-900 rounded-lg shadow-xl w-full max-w-sm p-6 space-y-4"
        onSubmit={(e) => { e.preventDefault(); void handleSubmit(); }}
      >
        <div>
          <h2 className="text-xl font-bold">Welcome to Slurp 🍜!</h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            Set up your profile so other participants can identify you.
          </p>
        </div>

        <div>
          <label htmlFor="onboardingDisplayName" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Display name <span className="text-red-500 text-xs font-normal">required</span>
          </label>
          <input
            id="onboardingDisplayName"
            type="text"
            autoFocus
            className="w-full border rounded px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
            placeholder="Your name"
            value={displayName}
            maxLength={40}
            onChange={(e) => { setDisplayName(e.target.value); setDisplayNameError(null); }}
          />
          {displayNameError && <p className="text-red-600 text-xs mt-1">{displayNameError}</p>}
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
            Shown to other participants instead of your email address.
          </p>
        </div>

        <div>
          <label htmlFor="onboardingVenmo" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Venmo username <span className="text-xs font-normal text-gray-500">(optional)</span>
          </label>
          <input
            id="onboardingVenmo"
            type="text"
            className="w-full border rounded px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
            placeholder="yourname"
            value={venmoUsername}
            maxLength={50}
            onChange={(e) => setVenmoUsername(e.target.value.replace(/@/g, "").trim())}
          />
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
            Enter without the @. Guests will see a &ldquo;Pay in Venmo&rdquo; button pre-filled with your username.
          </p>
        </div>

        {submitError && <p className="text-red-600 text-sm">{submitError}</p>}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded bg-purple-600 px-4 py-2 text-white text-sm font-medium hover:bg-purple-700 disabled:opacity-50"
        >
          {busy ? "Saving..." : "Get started"}
        </button>
      </form>
    </div>
  );
}
