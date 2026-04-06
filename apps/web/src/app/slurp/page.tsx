"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { listSlurps } from "@/lib/slurps";
import type { Slurp } from "@slurp/types";

function SlurpsPageContent(): React.JSX.Element {
  const { user, loading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = searchParams.get("tab");

  const [created, setCreated] = useState<Slurp[]>([]);
  const [invited, setInvited] = useState<Slurp[]>([]);
  const [nextCursorCreated, setNextCursorCreated] = useState<string | undefined>();
  const [nextCursorInvited, setNextCursorInvited] = useState<string | undefined>();
  const [fetching, setFetching] = useState(true);
  const [loadingMoreCreated, setLoadingMoreCreated] = useState(false);
  const [loadingMoreInvited, setLoadingMoreInvited] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace("/login?redirect=/slurp");
  }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;
    listSlurps()
      .then((res) => {
        setCreated(res.created);
        setInvited(res.invited);
        setNextCursorCreated(res.nextCursorCreated);
        setNextCursorInvited(res.nextCursorInvited);
      })
      .catch(() => {})
      .finally(() => setFetching(false));
  }, [user]);

  useEffect(() => {
    if (!fetching && tab) {
      document.getElementById(tab)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [fetching, tab]);

  function loadMoreCreated(): void {
    if (!nextCursorCreated) return;
    setLoadingMoreCreated(true);
    listSlurps({ cursorCreated: nextCursorCreated })
      .then((res) => {
        setCreated((prev) => [...prev, ...res.created]);
        setNextCursorCreated(res.nextCursorCreated);
      })
      .catch(() => {})
      .finally(() => setLoadingMoreCreated(false));
  }

  function loadMoreInvited(): void {
    if (!nextCursorInvited) return;
    setLoadingMoreInvited(true);
    listSlurps({ cursorInvited: nextCursorInvited })
      .then((res) => {
        setInvited((prev) => [...prev, ...res.invited]);
        setNextCursorInvited(res.nextCursorInvited);
      })
      .catch(() => {})
      .finally(() => setLoadingMoreInvited(false));
  }

  if (loading || !user) {
    return (
      <div className="max-w-2xl mx-auto mt-4 sm:mt-10 px-4 sm:p-6">
        <div className="h-8 w-32 rounded bg-gray-200 dark:bg-gray-700 animate-pulse mb-6" />
        <div className="flex flex-col gap-2">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-10 rounded bg-gray-200 dark:bg-gray-700 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  const sections = [
    { key: "created", label: "Created", items: created, hasMore: !!nextCursorCreated, loadingMore: loadingMoreCreated, onLoadMore: loadMoreCreated },
    { key: "invited", label: "Invited", items: invited, hasMore: !!nextCursorInvited, loadingMore: loadingMoreInvited, onLoadMore: loadMoreInvited },
  ];

  return (
    <div className="max-w-2xl mx-auto mt-4 sm:mt-10 px-4 sm:p-6">
      <h1 className="text-2xl font-bold mb-6">All Slurps</h1>
      {fetching ? (
        <p className="text-gray-400 dark:text-gray-500 text-sm">Loading...</p>
      ) : (
        <div className="flex flex-col gap-8">
          {sections.map(({ key, label, items, hasMore, loadingMore, onLoadMore }) => (
            <section key={key} id={key}>
              <h2
                className={`text-xs font-semibold uppercase tracking-wide mb-3 ${
                  tab === key ? "text-purple-600 dark:text-purple-400" : "text-gray-400 dark:text-gray-500"
                }`}
              >
                {label}
              </h2>
              {items.length === 0 ? (
                <p className="text-sm text-gray-400 dark:text-gray-500">None yet.</p>
              ) : (
                <>
                  <ul className="flex flex-col gap-1">
                    {items.map((d) => (
                      <li key={d.id}>
                        <Link
                          href={`/slurp/${d.id}`}
                          className="flex items-center justify-between rounded px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 text-sm"
                        >
                          <span className="truncate">{d.title}</span>
                          {d.participants.every((p) => p.status === "confirmed") && (
                            <span className="ml-2 text-xs text-green-600 shrink-0">✓</span>
                          )}
                        </Link>
                      </li>
                    ))}
                  </ul>
                  {hasMore && (
                    <button
                      onClick={onLoadMore}
                      disabled={loadingMore}
                      className="mt-3 text-sm text-purple-600 hover:text-purple-700 disabled:opacity-50"
                    >
                      {loadingMore ? "Loading…" : "Load more"}
                    </button>
                  )}
                </>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function SlurpsPageFallback(): React.JSX.Element {
  return (
    <div className="max-w-2xl mx-auto mt-4 sm:mt-10 px-4 sm:p-6">
      <div className="h-8 w-32 rounded bg-gray-200 dark:bg-gray-700 animate-pulse mb-6" />
      <div className="flex flex-col gap-2">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-10 rounded bg-gray-200 dark:bg-gray-700 animate-pulse" />
        ))}
      </div>
    </div>
  );
}

export default function SlurpsPage(): React.JSX.Element {
  return (
    <Suspense fallback={<SlurpsPageFallback />}>
      <SlurpsPageContent />
    </Suspense>
  );
}
