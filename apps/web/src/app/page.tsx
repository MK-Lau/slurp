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
    <div className="min-h-full bg-gradient-to-b from-white to-slate-50 dark:from-gray-900 dark:to-gray-950">
      {/* Hero */}
      <section className="flex flex-col items-center text-center px-6 pt-20 pb-16">
        <h1 className="text-5xl font-bold tracking-tight text-gray-900 dark:text-gray-100">Slurp 🍜</h1>
        <p className="mt-4 text-xl text-gray-500 dark:text-gray-400">Split bills effortlessly.</p>
        <div className="mt-8">
          {loading ? (
            <div className="h-12 w-36 rounded-xl bg-gray-200 dark:bg-gray-700 animate-pulse" />
          ) : user ? (
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
              Get started free →
            </Link>
          )}
        </div>
      </section>
    </div>
  );
}
