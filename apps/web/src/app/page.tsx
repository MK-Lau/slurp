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
        <p className="mt-4 text-xl text-gray-500 dark:text-gray-400 max-w-sm">
          Split restaurant bills with friends — no math, no awkward Venmo requests.
        </p>
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

      {/* How it works */}
      <section className="max-w-2xl mx-auto px-6 pb-16">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-purple-600 dark:text-purple-400 text-center mb-8">
          How it works
        </h2>
        <ol className="grid sm:grid-cols-3 gap-8 text-center">
          <li className="flex flex-col items-center gap-3">
            <span className="text-3xl">📸</span>
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">Snap the receipt</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Upload a photo and Slurp reads every line item automatically.
            </p>
          </li>
          <li className="flex flex-col items-center gap-3">
            <span className="text-3xl">👥</span>
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">Invite your group</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Share a link. Everyone joins and taps the items they ordered.
            </p>
          </li>
          <li className="flex flex-col items-center gap-3">
            <span className="text-3xl">💸</span>
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">Everyone pays their share</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Tax and tip are split proportionally. Slurp tells each person exactly what they owe.
            </p>
          </li>
        </ol>
      </section>

      {/* Features */}
      <section className="max-w-2xl mx-auto px-6 pb-20">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-purple-600 dark:text-purple-400 text-center mb-8">
          Why Slurp
        </h2>
        <ul className="grid sm:grid-cols-2 gap-4">
          {[
            { icon: "🤖", title: "AI receipt parsing", body: "Snap a photo and every line item is read automatically — no typing required." },
            { icon: "⚖️", title: "Fair tax & tip splits", body: "Each person's share of tax and tip scales with what they ordered." },
            { icon: "🔗", title: "No app to download", body: "Guests join via a link — no account required to claim items." },
            { icon: "✅", title: "Everyone confirms their share", body: "Each person reviews and confirms what they owe before the bill is settled." },
          ].map(({ icon, title, body }) => (
            <li key={title} className="flex gap-3 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
              <span className="text-xl shrink-0">{icon}</span>
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-gray-100 text-sm">{title}</h3>
                <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">{body}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
