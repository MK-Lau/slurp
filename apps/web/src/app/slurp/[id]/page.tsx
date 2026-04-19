"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { getSlurp, getSlurpPreview } from "@/lib/slurps";
import { getProfile } from "@/lib/users";
import { Badge, PageFade, TabBar } from "@/components/ui";
import type { Slurp, SlurpPreviewResponse, GetSlurpResponse } from "@slurp/types";
import HostView from "./_components/HostView";
import GuestView from "./_components/GuestView";
import JoinModal from "./_components/JoinModal";

const POLL_INTERVAL_MS = 2000;

function relativeDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const now = new Date();
  const diff = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  if (diff < 7) return `${diff} days ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function SlurpPageContent(): React.JSX.Element {
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [slurp, setSlurp] = useState<Slurp | null>(null);
  const [, setViewerEmail] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<SlurpPreviewResponse | null>(null);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [joinDefaultName, setJoinDefaultName] = useState<string | undefined>(undefined);
  const [tab, setTab] = useState<string>("manage");
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Compute role from slurp (may be null during loading)
  const myParticipant = slurp?.participants.find((p) => user?.uid && p.uid === user.uid);
  const isHost = myParticipant?.role === "host";

  // Reset tab when slurp id or role changes — must be before any conditional returns
  useEffect(() => {
    setTab(isHost ? "manage" : "items");
  }, [id, isHost]);

  function onSlurpUpdate(d: Slurp): void {
    setSlurp(d);
    const response = d as GetSlurpResponse;
    if (response.viewerEmail) setViewerEmail(response.viewerEmail);
  }

  useEffect(() => {
    if (pollRef.current) clearTimeout(pollRef.current);
    let cancelled = false;

    if (authLoading) return;

    if (!user) {
      const redirectUrl = token ? `/slurp/${id}?token=${token}` : `/slurp/${id}`;
      router.replace(`/login?redirect=${encodeURIComponent(redirectUrl)}`);
      return;
    }

    async function init(): Promise<void> {
      try {
        let current: Slurp;

        if (token) {
          let previewData: SlurpPreviewResponse | null = null;
          try {
            previewData = await getSlurpPreview(id, token);
          } catch {
            // Invalid token — proceed to load normally
          }

          if (previewData && !cancelled) {
            try {
              current = await getSlurp(id);
              if (cancelled) return;
              onSlurpUpdate(current);
            } catch {
              if (!cancelled) {
                const profile = await getProfile().catch(() => ({}));
                setJoinDefaultName(
                  (profile as { displayName?: string }).displayName ?? user!.displayName ?? undefined
                );
                setPreview(previewData);
                setShowJoinModal(true);
                return;
              }
              return;
            }
          } else if (!cancelled) {
            current = await getSlurp(id);
            if (cancelled) return;
            onSlurpUpdate(current);
          } else {
            return;
          }
        } else {
          current = await getSlurp(id);
          if (cancelled) return;
          onSlurpUpdate(current);
        }

        while (current.receiptStatus === "processing" || current.receiptStatus === "pending") {
          await new Promise<void>((resolve) => {
            pollRef.current = setTimeout(resolve, POLL_INTERVAL_MS);
          });
          if (cancelled) return;
          try {
            current = await getSlurp(id);
            if (cancelled) return;
            onSlurpUpdate(current);
          } catch {
            break;
          }
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load slurp");
      }
    }

    void init();

    return () => {
      cancelled = true;
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, [id, token, user, authLoading, router]);

  async function handleJoined(d: Slurp): Promise<void> {
    setShowJoinModal(false);
    setPreview(null);
    onSlurpUpdate(d);
    router.replace(`/slurp/${id}`);
  }

  if (authLoading || (!slurp && !error && !showJoinModal)) {
    return (
      <main className="max-w-2xl mx-auto px-4 py-8">
        <p className="text-gray-400 text-sm">Loading…</p>
      </main>
    );
  }

  if (error) {
    return (
      <main className="max-w-2xl mx-auto px-4 py-8">
        <p className="text-red-600">{error}</p>
      </main>
    );
  }

  if (showJoinModal && preview) {
    return (
      <main className="max-w-2xl mx-auto px-4 py-8">
        <JoinModal
          slurpId={id}
          inviteToken={token!}
          title={preview.title}
          hostDisplayName={preview.hostDisplayName}
          defaultDisplayName={joinDefaultName}
          onJoined={(d) => void handleJoined(d)}
          onDismiss={() => router.replace("/")}
        />
      </main>
    );
  }

  const d = slurp!;

  const confirmed = d.participants.filter((p) => p.status === "confirmed").length;
  const total = d.participants.length;
  const allConfirmed = confirmed === total;
  const someConfirmed = confirmed > 0 && !allConfirmed;

  const hostTabs = [
    { key: "manage", label: "Manage" },
    { key: "items", label: "My Items" },
    { key: "summary", label: "Summary" },
  ];
  const guestTabs = [
    { key: "items", label: "My Items" },
    { key: "summary", label: "Summary" },
  ];
  const tabs = isHost ? hostTabs : guestTabs;
  const validTab = tabs.find((t) => t.key === tab) ? tab : tabs[0].key;

  return (
    <PageFade key={d.id}>
      <main className="max-w-2xl mx-auto px-4 py-6">
        {/* Back */}
        <Link
          href="/slurp"
          className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors mb-5"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M9 2L4 7l5 5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          All Slurps
        </Link>

        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{d.title}</h1>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            {isHost && <Badge color="purple">Host</Badge>}
            {allConfirmed ? (
              <Badge color="green">All confirmed</Badge>
            ) : someConfirmed ? (
              <Badge color="amber">{confirmed}/{total} confirmed</Badge>
            ) : (
              <Badge color="gray">Pending</Badge>
            )}
            <span className="text-xs text-gray-400">{relativeDate(d.createdAt)}</span>
          </div>
        </div>

        {/* Tab bar */}
        <TabBar tabs={tabs} active={validTab} onChange={setTab} />

        <div className="mt-6">
          {isHost ? (
            <HostView slurp={d} viewerUid={user!.uid} onUpdate={onSlurpUpdate} tab={validTab} onTabChange={setTab} />
          ) : myParticipant ? (
            <GuestView slurp={d} participant={myParticipant} onUpdate={onSlurpUpdate} tab={validTab} />
          ) : (
            <p className="text-gray-500">You are not a participant in this Slurp.</p>
          )}
        </div>
      </main>
    </PageFade>
  );
}

export default function SlurpPage(): React.JSX.Element {
  return (
    <Suspense>
      <SlurpPageContent />
    </Suspense>
  );
}
