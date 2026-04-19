"use client";

import { Btn, Card, CopyButton } from "@/components/ui";

interface Props {
  slurpId: string;
  inviteToken: string;
}

export default function InviteLink({ slurpId, inviteToken }: Props): React.JSX.Element {
  const url = typeof window !== "undefined"
    ? `${window.location.origin}/slurp/${slurpId}?token=${inviteToken}`
    : `/slurp/${slurpId}?token=${inviteToken}`;

  const canShare = typeof navigator !== "undefined" && !!navigator.share;

  function handleShare(): void {
    void navigator.share({ url, title: "Join my Slurp" });
  }

  return (
    <Card className="p-4">
      <p className="text-sm font-semibold text-gray-700 mb-1">Invite link</p>
      <p className="text-xs text-gray-400 mb-3">Share this link so guests can join</p>
      <div className="flex gap-2 items-center">
        <div className="flex-1 rounded-xl bg-gray-50 border border-gray-200 px-3 py-2 text-xs text-gray-500 truncate font-mono">
          {url}
        </div>
        {canShare ? (
          <Btn type="button" variant="secondary" size="sm" onClick={handleShare} className="shrink-0">
            Share
          </Btn>
        ) : (
          <CopyButton text={url} />
        )}
      </div>
    </Card>
  );
}
