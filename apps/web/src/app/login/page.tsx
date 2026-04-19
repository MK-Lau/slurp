"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { getSlurpPreview } from "@/lib/slurps";
import OnboardingModal from "@/components/OnboardingModal";
import { Btn, Card } from "@/components/ui";
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

  useEffect(() => {
    const slurpMatch = redirect.match(/\/slurp\/([^/?#]+)/);
    if (!slurpMatch) return;
    const slurpId = slurpMatch[1];
    const tokenMatch = redirect.match(/[?&]token=([^&]+)/);
    if (!tokenMatch) return;
    const token = decodeURIComponent(tokenMatch[1]);
    getSlurpPreview(slurpId, token)
      .then((preview) => setSlurpPreview(preview))
      .catch(() => {});
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
      <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-[#faf5ff] dark:bg-gray-950">
        <p className="text-gray-500 text-sm">Signing you in…</p>
      </main>
    );
  }

  if (pendingOnboarding) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#faf5ff] dark:bg-gray-950">
        <OnboardingModal
          googleDisplayName={pendingOnboarding.googleDisplayName}
          onComplete={() => router.replace(redirect)}
        />
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6 bg-[#faf5ff] dark:bg-gray-950">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">🍜</div>
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Slurp</h1>
          {slurpPreview ? (
            <p className="text-gray-500 mt-1.5 text-sm">
              Join <strong>{slurpPreview.title}</strong> by {slurpPreview.hostDisplayName}
            </p>
          ) : (
            <p className="text-gray-500 mt-1.5 text-sm">Split bills.</p>
          )}
        </div>

        <Card className="p-6 shadow-lg border border-purple-100/60">
          {step === "choose" && (
            <div className="space-y-3">
              <Btn variant="primary" className="w-full" size="lg" onClick={handleGoogleSignIn} disabled={busy}>
                {busy ? "Signing in…" : (
                  <>
                    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                      <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
                      <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853"/>
                      <path d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
                      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
                    </svg>
                    Continue with Google
                  </>
                )}
              </Btn>
              <div className="flex items-center gap-3 my-1">
                <div className="flex-1 h-px bg-gray-200" />
                <span className="text-xs text-gray-400">or</span>
                <div className="flex-1 h-px bg-gray-200" />
              </div>
              <Btn variant="secondary" className="w-full" size="lg" onClick={() => { setError(null); setStep("email"); }} disabled={busy}>
                Sign in with email
              </Btn>
              {error && <p className="text-red-600 text-sm">{error}</p>}
            </div>
          )}

          {step === "email" && (
            <div className="space-y-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-gray-700">Email address</label>
                <input
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") void handleSendEmailLink(); }}
                  autoFocus
                  className="w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent transition"
                />
              </div>
              <Btn variant="primary" className="w-full" size="lg" onClick={handleSendEmailLink} disabled={busy || !email.includes("@")}>
                {busy ? "Sending…" : "Send sign-in link"}
              </Btn>
              <button
                onClick={() => { setError(null); setStep("choose"); }}
                className="w-full text-sm text-gray-400 hover:text-gray-600 text-center transition-colors"
              >
                ← Back
              </button>
              {error && <p className="text-red-600 text-sm">{error}</p>}
            </div>
          )}

          {step === "email-sent" && (
            <div className="text-center space-y-3">
              <div className="text-3xl">📬</div>
              <p className="font-semibold text-gray-800">Check your inbox</p>
              <p className="text-sm text-gray-500">
                We sent a sign-in link to <strong>{email}</strong>.
              </p>
              <p className="text-xs text-gray-400">Click the link in the email to sign in. You can close this tab.</p>
              <button
                onClick={() => { setError(null); setStep("email"); }}
                className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
              >
                ← Back
              </button>
            </div>
          )}

          {step === "email-link-confirm" && (
            <div className="space-y-3">
              <p className="text-sm text-gray-500">Enter the email address you used to request the sign-in link.</p>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-gray-700">Email address</label>
                <input
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") void handleCompleteEmailSignIn(); }}
                  className="w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent transition"
                />
              </div>
              <Btn variant="primary" className="w-full" size="lg" onClick={handleCompleteEmailSignIn} disabled={busy || !email.includes("@")}>
                {busy ? "Signing in…" : "Confirm"}
              </Btn>
              <button
                onClick={() => { setError(null); setStep("choose"); }}
                className="w-full text-sm text-gray-400 hover:text-gray-600 text-center transition-colors"
              >
                ← Back
              </button>
              {error && <p className="text-red-600 text-sm">{error}</p>}
            </div>
          )}
        </Card>
      </div>
    </main>
  );
}

function LoginFallback(): React.JSX.Element {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6 bg-[#faf5ff] dark:bg-gray-950">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">🍜</div>
          <div className="h-8 w-24 bg-gray-200 dark:bg-gray-700 animate-pulse rounded-xl mx-auto" />
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-6 space-y-3">
          <div className="h-12 rounded-xl bg-gray-100 dark:bg-gray-700 animate-pulse" />
          <div className="h-12 rounded-xl bg-gray-100 dark:bg-gray-700 animate-pulse" />
        </div>
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
