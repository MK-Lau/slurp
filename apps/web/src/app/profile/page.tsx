"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { getProfile, updateProfile } from "@/lib/users";
import { CURRENCIES } from "@slurp/types";
import { Avatar, Card, Field, PageFade, Skeleton, TextInput, UISelect } from "@/components/ui";

function ProfileContent(): React.JSX.Element {
  const { user, loading, refreshProfile } = useAuth();
  const router = useRouter();

  const [displayName, setDisplayName] = useState("");
  const [venmoUsername, setVenmoUsername] = useState("");
  const [preferredCurrency, setPreferredCurrency] = useState("USD");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const serverValues = useRef({ displayName: "", venmoUsername: "", preferredCurrency: "USD" });
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMounted = useRef(true);

  useEffect(() => () => { isMounted.current = false; }, []);

  useEffect(() => {
    if (!loading && !user) router.replace("/login?redirect=/profile");
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
      if (trimmedDisplayName.length > 0 && trimmedDisplayName.length < 3) return;
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
    return () => { if (debounceTimer.current) clearTimeout(debounceTimer.current); };
  }, [displayName, venmoUsername, preferredCurrency, refreshProfile]);

  if (loading || !user) return <ProfilePageFallback />;

  return (
    <PageFade>
      <div className="max-w-md mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Profile</h1>
        <Card className="p-6">
          {/* Avatar header */}
          <div className="flex items-center gap-4 mb-6">
            <Avatar name={displayName || "?"} size="xl" />
            <div>
              <p className="font-semibold text-gray-900">{displayName || "—"}</p>
              <p className="text-sm text-gray-400">{user.email}</p>
            </div>
          </div>

          <div className="space-y-4">
            <Field
              label="Display name"
              required
              hint="Shown to other participants instead of your email"
              error={
                displayName.trim().length > 0 && displayName.trim().length < 3
                  ? "Must be at least 3 characters"
                  : undefined
              }
            >
              <TextInput
                placeholder="Your name"
                value={displayName}
                maxLength={40}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </Field>

            <Field
              label="Venmo username"
              hint="⚠️ Make sure this is correct — guests will use it to send you real payments."
            >
              <div className="flex rounded-xl border border-gray-200 bg-white overflow-hidden focus-within:ring-2 focus-within:ring-purple-400 focus-within:border-transparent transition">
                <span className="px-3 flex items-center text-sm text-gray-400 border-r border-gray-200 bg-gray-50 select-none">@</span>
                <input
                  type="text"
                  className="flex-1 px-3 py-2.5 text-sm bg-white focus:outline-none min-w-0 text-gray-900 placeholder:text-gray-400"
                  placeholder="yourname"
                  value={venmoUsername}
                  maxLength={50}
                  onChange={(e) => setVenmoUsername(e.target.value.replace(/@/g, "").trim())}
                />
              </div>
            </Field>

            <Field label="Preferred currency" hint="Used to pre-fill the home currency when creating a new Slurp with currency conversion.">
              <UISelect value={preferredCurrency} onChange={(e) => setPreferredCurrency(e.target.value)}>
                {CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>{c.code} — {c.name}</option>
                ))}
              </UISelect>
            </Field>

            {error && <p className="text-red-600 text-sm">{error}</p>}

            <p className={`text-sm transition-opacity duration-300 ${saving || saved ? "opacity-100" : "opacity-0"}`}>
              {saving ? <span className="text-gray-400">Saving…</span> : <span className="text-emerald-600">✓ Saved!</span>}
            </p>
          </div>
        </Card>
      </div>
    </PageFade>
  );
}

function ProfilePageFallback(): React.JSX.Element {
  return (
    <div className="max-w-md mx-auto px-4 py-8">
      <Skeleton lines={4} />
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
