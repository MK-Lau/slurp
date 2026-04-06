"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { getConfig } from "@/lib/config";

export default function Home(): React.JSX.Element {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("mode") === "signIn" && params.get("oobCode")) {
      const continueUrl = params.get("continueUrl");
      if (!continueUrl) {
        router.replace(`/login${window.location.search}`);
        return;
      }
      // Keep in sync with Firebase Console > Authentication > Authorized domains
      getConfig().then((config) => {
        const trusted = new Set([
          "http://localhost:3000",
          `https://${config.projectId}.firebaseapp.com`,
          `https://${config.projectId}.web.app`,
          ...(config.appUrl ? [config.appUrl] : []),
        ]);
        try {
          const targetOrigin = new URL(continueUrl).origin;
          if (targetOrigin !== window.location.origin && trusted.has(targetOrigin)) {
            window.location.href = `${targetOrigin}/login${window.location.search}`;
            return;
          }
        } catch (_) { /* invalid continueUrl — fall through */ }
        router.replace(`/login${window.location.search}`);
      }).catch(() => {
        router.replace(`/login${window.location.search}`);
      });
    }
  }, [router]);

  return (
    <div className="flex min-h-full flex-col items-center justify-center p-6 bg-gradient-to-b from-white to-slate-50 dark:from-gray-900 dark:to-gray-950">
      <div className="flex flex-col items-center text-center max-w-md">
        <h1 className="text-5xl font-bold tracking-tight text-gray-900 dark:text-gray-100">Slurp 🍜</h1>
        <p className="mt-3 text-lg text-gray-500 dark:text-gray-400">Split bills with friends, effortlessly.</p>

        <div className="mt-8">
          {loading ? null : user ? (
            <Link
              href="/slurp/new"
              className="inline-flex items-center gap-2 rounded-xl bg-purple-600 px-8 py-3 text-white font-medium shadow-sm hover:bg-purple-700 transition-colors duration-150"
            >
              Create a Slurp →
            </Link>
          ) : (
            <Link
              href="/login"
              className="inline-flex items-center gap-2 rounded-xl bg-purple-600 px-8 py-3 text-white font-medium shadow-sm hover:bg-purple-700 transition-colors duration-150"
            >
              Sign in →
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
