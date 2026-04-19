"use client";

import { useState } from "react";
import type { Slurp, Participant } from "@slurp/types";
import RemoveParticipantModal from "./RemoveParticipantModal";
import { Avatar, Badge, Card } from "@/components/ui";

interface Props {
  slurp: Slurp;
  isHost?: boolean;
  onUpdate?: (d: Slurp) => void;
}

export default function ParticipantList({ slurp, isHost, onUpdate }: Props): React.JSX.Element {
  const [removing, setRemoving] = useState<Participant | null>(null);

  return (
    <>
      <Card className="divide-y divide-gray-50 overflow-hidden">
        {slurp.participants.map((p) => (
          <div key={p.uid} className="flex items-center gap-3 px-4 py-3">
            <Avatar name={p.displayName ?? "?"} size="md" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-800 truncate">{p.displayName ?? "Unknown"}</p>
              <p className="text-xs text-gray-400">{p.role}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {isHost && p.role !== "host" && (
                <button
                  type="button"
                  className="text-xs text-red-500 hover:text-red-700 transition-colors"
                  onClick={() => setRemoving(p)}
                >
                  Remove
                </button>
              )}
              <Badge color={p.status === "confirmed" ? "green" : "gray"}>
                {p.status === "confirmed" ? "✓ Confirmed" : "Pending"}
              </Badge>
            </div>
          </div>
        ))}
      </Card>

      {removing && (
        <RemoveParticipantModal
          slurpId={slurp.id}
          participant={removing}
          onDone={(updated) => { setRemoving(null); onUpdate?.(updated); }}
          onCancel={() => setRemoving(null)}
        />
      )}
    </>
  );
}
