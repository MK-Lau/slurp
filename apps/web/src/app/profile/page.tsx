"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { getProfile, updateProfile } from "@/lib/users";
import { CURRENCIES } from "@slurp/types";

function ProfileContent(): React.JSX.Element {
  const { user, loading, refreshProfile } = useAuth();
  const router = useRouter();

  const [displayName, setDisplayName] = useState("");
  const [venmoUsername, setVenmoUsername] = useState("");
  const [preferredCurrency, setPreferredCurrency] = useState("USD");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Track the last values known to be saved so we don't auto-save on initial load
  const serverValues = useRef({ displayName: "", venmoUsername: "", preferredCurrency: "USD" });
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMounted = useRef(true);

  useEffect(() => () => { isMounted.current = false; }, []);

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login?redirect=/profile");
    }
  }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;
    getProfile()
      .then((profile) => {
        const venmo = profile.venmoUsername ?? "";
        const name = profile.displayName ?? "";
        const currency = profile.preferredCurrency ?? "USD";
        serverValues.current = { displayName: name, venmoUsername: venmo, preferredCurrency: currency };
        setDisplayName(name);
        setVenmoUsername(venmo);
        setPreferredCurrency(currency);
      })
      .catch(() => {});
  }, [user]);

  useEffect(() => {
    // Skip if values match what's already on the server (covers initial load)
    if (
      displayName === serverValues.current.displayName &&
      venmoUsername === serverValues.current.venmoUsername &&
      preferredCurrency === serverValues.current.preferredCurrency
    ) return;

    setSaved(false);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      if (!isMounted.current) return;
      const trimmedDisplayName = displayName.trim();
      if (trimmedDisplayName.length > 0 && trimmedDisplayName.length < 3) {
        return; // Don't save if non-empty but too short — field error handled inline
      }
      setSaving(true);
      setError(null);
      updateProfile({
        displayName: trimmedDisplayName || undefined,
        venmoUsername: venmoUsername.trim() || undefined,
        preferredCurrency,
      })
        .then(() => {
          if (!isMounted.current) return;
          serverValues.current = { displayName: displayName.trim(), venmoUsername: venmoUsername.trim(), preferredCurrency };
          setSaved(true);
          void refreshProfile();
        })
        .catch((err) => { if (isMounted.current) setError(err instanceof Error ? err.message : "Failed to save"); })
        .finally(() => { if (isMounted.current) setSaving(false); });
    }, 800);
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [displayName, venmoUsername, preferredCurrency, refreshProfile]);

  if (loading || !user) return <ProfilePageFallback />;

  return (
    <div className="max-w-md mx-auto mt-4 sm:mt-10 px-4 sm:p-6">
      <h1 className="text-2xl font-bold mb-6">Profile</h1>
      <div className="flex flex-col gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Display name <span className="text-red-500 text-xs font-normal">required</span></label>
          <input
            type="text"
            className="w-full border rounded px-3 py-2 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
            placeholder="Your name"
            value={displayName}
            maxLength={40}
            onChange={(e) => setDisplayName(e.target.value)}
          />
          {displayName.trim().length > 0 && displayName.trim().length < 3 && (
            <p className="text-red-600 text-xs mt-1">Must be at least 3 characters</p>
          )}
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
            Shown to other participants instead of your email address.
          </p>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Venmo username</label>
          <input
            type="text"
            className="w-full border rounded px-3 py-2 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
            placeholder="yourname"
            value={venmoUsername}
            maxLength={50}
            onChange={(e) => setVenmoUsername(e.target.value.replace(/@/g, "").trim())}
          />
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
            Enter your Venmo username without the @. Guests will see a &ldquo;Pay in Venmo&rdquo; button pre-filled with your username and the amount they owe.
          </p>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Preferred currency</label>
          <select
            className="w-full border rounded px-3 py-2 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
            value={preferredCurrency}
            onChange={(e) => setPreferredCurrency(e.target.value)}
          >
            {CURRENCIES.map((c) => (
              <option key={c.code} value={c.code}>{c.code} — {c.name}</option>
            ))}
          </select>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
            Used to pre-fill the home currency when you create a new slurp with currency conversion.
          </p>
        </div>
        {error && <p className="text-red-600 text-sm">{error}</p>}
        <p className={`text-sm transition-opacity duration-300 ${saving || saved ? "opacity-100" : "opacity-0"}`}>
          {saving ? <span className="text-gray-400">Saving…</span> : <span className="text-green-600">Saved!</span>}
        </p>
      </div>
    </div>
  );
}

function ProfilePageFallback(): React.JSX.Element {
  return (
    <div className="max-w-md mx-auto mt-4 sm:mt-10 px-4 sm:p-6">
      <div className="h-8 w-24 rounded bg-gray-200 dark:bg-gray-700 animate-pulse mb-6" />
      <div className="flex flex-col gap-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-10 rounded bg-gray-200 dark:bg-gray-700 animate-pulse" />
        ))}
      </div>
    </div>
  );
}

export default function ProfilePage(): React.JSX.Element {
  return (
    <Suspense fallback={<ProfilePageFallback />}>
      <ProfileContent />
    </Suspense>
  );
}
