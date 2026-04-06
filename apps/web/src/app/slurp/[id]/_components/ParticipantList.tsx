"use client";

import { useState } from "react";
import type { Slurp, Participant } from "@slurp/types";
import RemoveParticipantModal from "./RemoveParticipantModal";

interface Props {
  slurp: Slurp;
  isHost?: boolean;
  onUpdate?: (d: Slurp) => void;
}

export default function ParticipantList({ slurp, isHost, onUpdate }: Props): React.JSX.Element {
  const [removing, setRemoving] = useState<Participant | null>(null);

  return (
    <>
      <ul className="mt-2 divide-y dark:divide-gray-700 border dark:border-gray-700 rounded">
        {slurp.participants.map((p) => (
          <li key={p.uid} className="flex items-center justify-between px-3 py-2 text-sm min-w-0">
            <span className="truncate min-w-0 mr-2">
              {p.displayName ?? "Unknown"}
              {p.role === "host" && (
                <span className="ml-2 text-xs text-gray-400 dark:text-gray-500">(host)</span>
              )}
            </span>
            <span className="flex items-center gap-2 shrink-0">
              {isHost && p.role !== "host" && (
                <button
                  type="button"
                  className="text-xs text-red-600 underline"
                  onClick={() => setRemoving(p)}
                >
                  Remove
                </button>
              )}
              <span
                className={
                  p.status === "confirmed"
                    ? "text-green-600 text-xs font-medium"
                    : "text-gray-400 dark:text-gray-500 text-xs"
                }
              >
                {p.status}
              </span>
            </span>
          </li>
        ))}
      </ul>

      {removing && (
        <RemoveParticipantModal
          slurpId={slurp.id}
          participant={removing}
          onDone={(updated) => {
            setRemoving(null);
            onUpdate?.(updated);
          }}
          onCancel={() => setRemoving(null)}
        />
      )}
    </>
  );
}
