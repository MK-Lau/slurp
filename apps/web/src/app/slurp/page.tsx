"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { listSlurps } from "@/lib/slurps";
import { Avatar, Badge, Btn, Card, EmptyState, PageFade, SectionHeader, Skeleton } from "@/components/ui";
import type { Slurp } from "@slurp/types";

function relativeDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const now = new Date();
  const diff = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  if (diff < 7) return `${diff} days ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function slurpStatusBadge(slurp: Slurp): React.JSX.Element {
  const confirmed = slurp.participants.filter((p) => p.status === "confirmed").length;
  const total = slurp.participants.length;
  if (confirmed === total) return <Badge color="green">All confirmed</Badge>;
  if (confirmed > 0) return <Badge color="amber">{confirmed}/{total} confirmed</Badge>;
  return <Badge color="gray">Pending</Badge>;
}

function SlurpCard({ slurp, isHost }: { slurp: Slurp; isHost: boolean }) {
  const total = slurp.participants.length;
  return (
    <Link href={`/slurp/${slurp.id}`}>
      <Card hover className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              {isHost && <Badge color="purple">Host</Badge>}
              {slurpStatusBadge(slurp)}
            </div>
            <p className="font-semibold text-gray-900 dark:text-gray-100 truncate">{slurp.title}</p>
            <p className="text-xs text-gray-400 mt-1">
              {relativeDate(slurp.createdAt)} · {total} {total === 1 ? "person" : "people"}
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="flex -space-x-2">
              {slurp.participants.slice(0, 3).map((p) => (
                <div key={p.uid} title={p.displayName ?? "?"} className="ring-2 ring-white dark:ring-gray-800 rounded-full">
                  <Avatar name={p.displayName ?? "?"} size="sm" />
                </div>
              ))}
              {slurp.participants.length > 3 && (
                <div className="w-6 h-6 rounded-full bg-gray-100 dark:bg-gray-700 ring-2 ring-white dark:ring-gray-800 flex items-center justify-center text-[9px] font-bold text-gray-500 dark:text-gray-400">
                  +{slurp.participants.length - 3}
                </div>
              )}
            </div>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-gray-300">
              <path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
        </div>
      </Card>
    </Link>
  );
}

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
      <div className="max-w-2xl mx-auto px-4 py-8">
        <Skeleton lines={4} />
      </div>
    );
  }

  const sections = [
    { key: "created", label: "Created", items: created, isHost: true, hasMore: !!nextCursorCreated, loadingMore: loadingMoreCreated, onLoadMore: loadMoreCreated },
    { key: "invited", label: "Invited", items: invited, isHost: false, hasMore: !!nextCursorInvited, loadingMore: loadingMoreInvited, onLoadMore: loadMoreInvited },
  ].filter((s) => s.items.length > 0 || !fetching);

  return (
    <PageFade>
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-7">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Your Slurps</h1>
          <Link href="/slurp/new">
            <Btn variant="primary" size="sm">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
              New
            </Btn>
          </Link>
        </div>

        {/* Mobile: full-width New Slurp card */}
        <div className="block sm:hidden mb-6">
          <Link href="/slurp/new">
            <Card hover className="p-4 border-dashed border-2 border-purple-200 dark:border-purple-700/50 bg-purple-50/40 dark:bg-purple-900/20 flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-purple-100 dark:bg-purple-900/50 flex items-center justify-center shrink-0">
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                  <path d="M9 2v14M2 9h14" stroke="#9333ea" strokeWidth="2.2" strokeLinecap="round"/>
                </svg>
              </div>
              <div>
                <p className="font-semibold text-purple-700 dark:text-purple-300">New Slurp</p>
                <p className="text-xs text-purple-400 dark:text-purple-500">Split a bill with friends</p>
              </div>
            </Card>
          </Link>
        </div>

        {fetching ? (
          <Skeleton lines={4} />
        ) : created.length === 0 && invited.length === 0 ? (
          <EmptyState
            icon="🍜"
            title="No Slurps yet"
            subtitle="Create one to split a bill with friends."
            action={
              <Link href="/slurp/new">
                <Btn variant="primary">Create your first Slurp</Btn>
              </Link>
            }
          />
        ) : (
          <div className="space-y-8">
            {sections.map(({ key, label, items, isHost, hasMore, loadingMore, onLoadMore }) => (
              items.length > 0 && (
                <div key={key} id={key}>
                  <SectionHeader title={label} />
                  <div className="space-y-2.5">
                    {items.map((s) => <SlurpCard key={s.id} slurp={s} isHost={isHost} />)}
                  </div>
                  {hasMore && (
                    <button
                      onClick={onLoadMore}
                      disabled={loadingMore}
                      className="mt-3 text-sm text-purple-600 hover:text-purple-700 disabled:opacity-50"
                    >
                      {loadingMore ? "Loading…" : "Load more"}
                    </button>
                  )}
                </div>
              )
            ))}
          </div>
        )}
      </div>
    </PageFade>
  );
}

function SlurpsPageFallback(): React.JSX.Element {
  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <Skeleton lines={4} />
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
