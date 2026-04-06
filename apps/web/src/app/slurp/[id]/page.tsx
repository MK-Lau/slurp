"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { getSlurp, getSlurpPreview } from "@/lib/slurps";
import { getProfile } from "@/lib/users";
import type { Slurp, SlurpPreviewResponse, GetSlurpResponse } from "@slurp/types";
import HostView from "./_components/HostView";
import GuestView from "./_components/GuestView";
import JoinModal from "./_components/JoinModal";

const POLL_INTERVAL_MS = 2000;

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
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      const redirectUrl = token
        ? `/slurp/${id}?token=${token}`
        : `/slurp/${id}`;
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
            // Try to load the slurp to check if already a participant
            try {
              current = await getSlurp(id);
              if (cancelled) return;
              onSlurpUpdate(current);
              // Already a participant, fall through to polling below
            } catch {
              // Not a participant — show join modal
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
            // Bad token or no preview, try loading directly
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

        // Poll until receipt processing completes
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
    // Navigate without the token so the effect re-runs and starts receipt polling if needed.
    router.replace(`/slurp/${id}`);
  }

  if (authLoading || (!slurp && !error && !showJoinModal)) {
    return (
      <main className="max-w-2xl mx-auto mt-8 sm:mt-16 px-4 sm:p-6">
        <p className="text-gray-400 dark:text-gray-500">Loading...</p>
      </main>
    );
  }

  if (error) {
    return (
      <main className="max-w-2xl mx-auto mt-8 sm:mt-16 px-4 sm:p-6">
        <p className="text-red-600">{error}</p>
      </main>
    );
  }

  if (showJoinModal && preview) {
    return (
      <main className="max-w-2xl mx-auto mt-8 sm:mt-16 px-4 sm:p-6">
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
  const myParticipant = d.participants.find(
    (p) => user?.uid && p.uid === user.uid
  );
  const isHost = myParticipant?.role === "host";
  return (
    <main className="max-w-2xl mx-auto mt-4 sm:mt-8 px-4 sm:p-6">
      <div className="mb-2">
        <h1 className="text-3xl font-bold tracking-tight">{d.title}</h1>
      </div>
      {isHost ? (
        <HostView slurp={d} viewerUid={user!.uid} onUpdate={onSlurpUpdate} />
      ) : myParticipant ? (
        <GuestView slurp={d} participant={myParticipant} onUpdate={onSlurpUpdate} />
      ) : (
        <p className="text-gray-500 dark:text-gray-400">You are not a participant in this slurp.</p>
      )}
    </main>
  );
}

export default function SlurpPage(): React.JSX.Element {
  return (
    <Suspense>
      <SlurpPageContent />
    </Suspense>
  );
}
