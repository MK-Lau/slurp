"use client";

import { useState } from "react";

interface Props {
  slurpId: string;
  inviteToken: string;
}

export default function InviteLink({ slurpId, inviteToken }: Props): React.JSX.Element {
  const [copied, setCopied] = useState(false);
  const url = typeof window !== "undefined"
    ? `${window.location.origin}/slurp/${slurpId}?token=${inviteToken}`
    : `/slurp/${slurpId}?token=${inviteToken}`;

  const canShare = typeof navigator !== "undefined" && !!navigator.share;

  function handleShare(): void {
    void navigator.share({ url, title: "Join my slurp" });
  }

  function handleCopy(): void {
    void navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="flex flex-col sm:flex-row gap-2 mt-3">
      <input
        readOnly
        type="text"
        className="flex-1 border rounded px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 dark:border-gray-600 text-gray-700 dark:text-gray-300 select-all"
        value={url}
      />
      {canShare ? (
        <button
          type="button"
          onClick={handleShare}
          className="w-full sm:w-auto rounded bg-purple-600 px-4 py-2 text-white text-sm hover:bg-purple-700"
        >
          Share
        </button>
      ) : (
        <button
          type="button"
          onClick={handleCopy}
          className="w-full sm:w-auto rounded bg-purple-600 px-4 py-2 text-white text-sm hover:bg-purple-700"
        >
          {copied ? "Copied!" : "Copy link"}
        </button>
      )}
    </div>
  );
}
