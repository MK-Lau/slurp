"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { getSlurpPreview } from "@/lib/slurps";
import OnboardingModal from "@/components/OnboardingModal";
import type { SlurpPreviewResponse } from "@slurp/types";

type Step = "choose" | "email" | "email-sent" | "email-link-confirm";

function LoginContent(): React.JSX.Element {
  const { user, loading, signIn, sendEmailSignInLink, isEmailSignInLink, completeEmailSignIn } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const raw = params.get("redirect") ?? "/";
  function sanitizeRedirect(r: string): string {
    try {
      const url = new URL(r, window.location.origin);
      if (url.origin !== window.location.origin) return "/";
      return url.pathname + url.search + url.hash;
    } catch {
      return "/";
    }
  }
  const redirect = sanitizeRedirect(raw);

  const [step, setStep] = useState<Step>("choose");
  const [email, setEmail] = useState("");
  const emailLinkCheckedRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [slurpPreview, setSlurpPreview] = useState<SlurpPreviewResponse | null>(null);
  const [pendingOnboarding, setPendingOnboarding] = useState<{ googleDisplayName: string | null } | null>(null);
  const [completingEmailLink, setCompletingEmailLink] = useState(false);

  useEffect(() => {
    if (!loading && user && !pendingOnboarding) {
      router.replace(redirect);
    }
  }, [user, loading, redirect, router, pendingOnboarding]);

  // Detect and complete email link sign-in when user returns from magic link
  useEffect(() => {
    if (loading || emailLinkCheckedRef.current) return;
    emailLinkCheckedRef.current = true;
    void (async () => {
      const isLink = await isEmailSignInLink();
      if (!isLink) return;
      const savedEmail = localStorage.getItem("emailForSignIn");
      if (savedEmail) {
        setCompletingEmailLink(true);
        try {
          const { isNewUser } = await completeEmailSignIn(savedEmail);
          if (isNewUser) setPendingOnboarding({ googleDisplayName: null });
          // else: onAuthStateChanged triggers the redirect effect
        } catch {
          setError("Sign-in link expired or already used. Please request a new one.");
          setStep("email");
          setCompletingEmailLink(false);
        }
      } else {
        setStep("email-link-confirm");
      }
    })();
  }, [loading, isEmailSignInLink, completeEmailSignIn]);

  // Fetch slurp preview if redirect points to a slurp with an invite token
  useEffect(() => {
    const slurpMatch = redirect.match(/\/slurp\/([^/?#]+)/);
    if (!slurpMatch) return;
    const slurpId = slurpMatch[1];
    const tokenMatch = redirect.match(/[?&]token=([^&]+)/);
    if (!tokenMatch) return;
    const token = decodeURIComponent(tokenMatch[1]);

    getSlurpPreview(slurpId, token)
      .then((preview) => setSlurpPreview(preview))
      .catch(() => {
        // Ignore — preview unavailable, show generic copy
      });
  }, [redirect]);

  async function handleGoogleSignIn(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const { isNewUser, googleDisplayName } = await signIn();
      if (isNewUser) {
        setPendingOnboarding({ googleDisplayName });
      } else {
        router.replace(redirect);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function handleSendEmailLink(): Promise<void> {
    if (!email) return;
    if (!email.includes("@")) {
      setError("Enter a valid email address");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const continueUrl = `${window.location.origin}/login${redirect !== "/" ? `?redirect=${encodeURIComponent(redirect)}` : ""}`;
      await sendEmailSignInLink(email, continueUrl);
      setStep("email-sent");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to send sign-in link");
    } finally {
      setBusy(false);
    }
  }

  async function handleCompleteEmailSignIn(): Promise<void> {
    if (!email) return;
    setBusy(true);
    setError(null);
    try {
      const { isNewUser } = await completeEmailSignIn(email);
      if (isNewUser) setPendingOnboarding({ googleDisplayName: null });
      // else: onAuthStateChanged triggers the redirect effect
    } catch {
      setError("Sign-in failed. The link may have expired. Please request a new one.");
      setStep("email");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <LoginFallback />;

  if (completingEmailLink) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3">
        <p className="text-gray-500 dark:text-gray-400 text-sm">Signing you in…</p>
      </main>
    );
  }

  if (pendingOnboarding) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <OnboardingModal
          googleDisplayName={pendingOnboarding.googleDisplayName}
          onComplete={() => router.replace(redirect)}
        />
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6">
      <h1 className="text-3xl font-bold mb-2">Slurp 🍜</h1>
      {slurpPreview ? (
        <p className="text-gray-500 dark:text-gray-400 mb-8 text-center">
          Sign in to join <strong>{slurpPreview.title}</strong> by {slurpPreview.hostDisplayName}
        </p>
      ) : (
        <p className="text-gray-500 dark:text-gray-400 mb-8">Sign in to split bills with friends.</p>
      )}

      {step === "choose" && (
        <div className="flex flex-col gap-3 w-full max-w-xs">
          <button
            onClick={handleGoogleSignIn}
            disabled={busy}
            className="rounded bg-purple-600 px-6 py-2 text-white hover:bg-purple-700 flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {busy ? "Signing in..." : "Sign in with Google"}
            {!busy && <span className="text-xs text-purple-200 font-normal">recommended</span>}
          </button>
          <div className="flex items-center gap-2 my-1">
            <hr className="flex-1 border-gray-200 dark:border-gray-700" />
            <span className="text-xs text-gray-400 dark:text-gray-500">or</span>
            <hr className="flex-1 border-gray-200 dark:border-gray-700" />
          </div>
          <button
            onClick={() => { setError(null); setStep("email"); }}
            disabled={busy}
            className="rounded border border-gray-300 dark:border-gray-600 px-6 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
          >
            Sign in with Email
          </button>
          {error && <p className="text-red-600 text-sm">{error}</p>}
        </div>
      )}

      {step === "email" && (
        <div className="flex flex-col gap-3 w-full max-w-xs">
          <input
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void handleSendEmailLink(); }}
            className="rounded border border-gray-300 dark:border-gray-600 px-4 py-2 focus:outline-none bg-white dark:bg-gray-800 dark:text-gray-100"
          />
          <button
            onClick={handleSendEmailLink}
            disabled={busy || !email}
            className="rounded bg-purple-600 px-6 py-2 text-white hover:bg-purple-700 disabled:opacity-50"
          >
            {busy ? "Sending..." : "Send sign-in link"}
          </button>
          <button
            onClick={() => { setError(null); setStep("choose"); }}
            className="text-sm text-gray-500 dark:text-gray-400 hover:underline"
          >
            Back
          </button>
          {error && <p className="text-red-600 text-sm">{error}</p>}
        </div>
      )}

      {step === "email-sent" && (
        <div className="flex flex-col gap-3 w-full max-w-xs text-center">
          <p className="text-gray-700 dark:text-gray-300">
            Check your inbox — we sent a sign-in link to <strong>{email}</strong>.
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">Click the link in the email to sign in. You can close this tab.</p>
          <button
            onClick={() => { setError(null); setStep("email"); }}
            className="text-sm text-gray-500 dark:text-gray-400 hover:underline"
          >
            Back
          </button>
        </div>
      )}

      {step === "email-link-confirm" && (
        <div className="flex flex-col gap-3 w-full max-w-xs">
          <p className="text-sm text-gray-500 dark:text-gray-400">Enter the email address you used to request the sign-in link.</p>
          <input
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void handleCompleteEmailSignIn(); }}
            className="rounded border border-gray-300 dark:border-gray-600 px-4 py-2 focus:outline-none bg-white dark:bg-gray-800 dark:text-gray-100"
          />
          <button
            onClick={handleCompleteEmailSignIn}
            disabled={busy || !email}
            className="rounded bg-purple-600 px-6 py-2 text-white hover:bg-purple-700 disabled:opacity-50"
          >
            {busy ? "Signing in..." : "Confirm"}
          </button>
          <button
            onClick={() => { setError(null); setStep("choose"); }}
            className="text-sm text-gray-500 dark:text-gray-400 hover:underline"
          >
            Back
          </button>
          {error && <p className="text-red-600 text-sm">{error}</p>}
        </div>
      )}

    </main>
  );
}

function LoginFallback(): React.JSX.Element {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6">
      <h1 className="text-3xl font-bold mb-2">Slurp 🍜</h1>
      <p className="text-gray-500 dark:text-gray-400 mb-8">Sign in to split bills with friends.</p>
      <div className="flex flex-col gap-3 w-full max-w-xs">
        <div className="h-10 rounded bg-gray-200 dark:bg-gray-700 animate-pulse" />
        <div className="h-10 rounded bg-gray-200 dark:bg-gray-700 animate-pulse" />
      </div>
    </main>
  );
}

export default function LoginPage(): React.JSX.Element {
  return (
    <Suspense fallback={<LoginFallback />}>
      <LoginContent />
    </Suspense>
  );
}
