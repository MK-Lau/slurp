"use client";

import { useState, useEffect } from "react";
import type { Slurp } from "@slurp/types";
import ItemList from "./ItemList";
import ItemForm from "./ItemForm";
import InviteLink from "./InviteLink";
import ParticipantList from "./ParticipantList";
import TaxTipForm from "./TaxTipForm";
import CurrencyConversionForm from "./CurrencyConversionForm";
import GuestView from "./GuestView";
import SummaryView from "./SummaryView";
import { dismissReceiptWarning, updateSlurp } from "@/lib/slurps";

interface Props {
  slurp: Slurp;
  viewerUid: string;
  onUpdate: (d: Slurp) => void;
}

type Tab = "manage" | "participate" | "summary";

export default function HostView({ slurp, viewerUid, onUpdate }: Props): React.JSX.Element {
  const [tab, setTab] = useState<Tab>("manage");
  const [titleDraft, setTitleDraft] = useState(slurp.title);
  const [savingTitle, setSavingTitle] = useState(false);
  const hostParticipant = slurp.participants.find((p) => p.uid === viewerUid);
  const showWarning = !!slurp.receiptWarning && !slurp.receiptWarningDismissed;

  useEffect(() => {
    setTitleDraft(slurp.title);
  }, [slurp.title]);

  async function saveTitleDraft(): Promise<void> {
    const trimmed = titleDraft.trim();
    if (!trimmed || trimmed === slurp.title) {
      setTitleDraft(slurp.title);
      return;
    }
    setSavingTitle(true);
    try {
      const updated = await updateSlurp(slurp.id, { title: trimmed });
      onUpdate(updated);
    } catch (err) {
      console.error("Failed to update title", err);
      setTitleDraft(slurp.title);
    } finally {
      setSavingTitle(false);
    }
  }

  async function handleDismissWarning(): Promise<void> {
    const updated = await dismissReceiptWarning(slurp.id);
    onUpdate(updated);
  }

  const tabClass = (t: Tab): string =>
    `flex-1 py-3 text-base font-semibold transition-colors duration-150 ${
      tab === t
        ? "bg-purple-600 text-white"
        : "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
    }`;

  return (
    <div className="space-y-6">
      <div className="flex rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700">
        <button className={tabClass("manage")} onClick={() => setTab("manage")}>
          Manage
        </button>
        <button className={tabClass("participate")} onClick={() => setTab("participate")}>
          My Items
        </button>
        <button className={tabClass("summary")} onClick={() => setTab("summary")}>
          Summary
        </button>
      </div>

      <section>
        <h2 className="font-semibold text-lg">Invite Guests</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Share this link to invite guests:</p>
        <InviteLink slurpId={slurp.id} inviteToken={slurp.inviteToken} />
      </section>

      {tab === "manage" && (
        <div className="space-y-8">
          <section>
            <h2 className="font-semibold text-lg">Name</h2>
            <input
              type="text"
              className="mt-1 w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm"
              value={titleDraft}
              maxLength={64}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={() => void saveTitleDraft()}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.nativeEvent.isComposing) { e.currentTarget.blur(); }
                if (e.key === "Escape") { setTitleDraft(slurp.title); e.currentTarget.blur(); }
              }}
              disabled={savingTitle}
              aria-label="Slurp name"
            />
            {savingTitle && <p className="text-xs text-gray-400 mt-1">Saving…</p>}
          </section>
          {showWarning && (
            <div className="relative rounded-lg bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 px-4 py-4 text-sm text-yellow-800 dark:text-yellow-300 text-center">
              <p className="font-medium">⚠ Receipt image was unclear</p>
              <p>Please review items before confirming.</p>
              <button onClick={() => void handleDismissWarning()} className="absolute top-2 right-3 text-yellow-600 dark:text-yellow-400 hover:text-yellow-900 dark:hover:text-yellow-100 font-medium">
                Dismiss
              </button>
            </div>
          )}
          <section>
            <h2 className="font-semibold text-lg">Tax &amp; Tip</h2>
            <TaxTipForm slurp={slurp} onUpdate={onUpdate} />
          </section>

          <section>
            <h2 className="font-semibold text-lg">Currency</h2>
            <div className="mt-2">
              <CurrencyConversionForm slurp={slurp} onUpdate={onUpdate} />
            </div>
          </section>

          <section>
            <h2 className="font-semibold text-lg">Items</h2>
<ItemList slurp={slurp} isHost onUpdate={onUpdate} />
            <ItemForm slurp={slurp} onUpdate={onUpdate} />
          </section>

          <section>
            <h2 className="font-semibold text-lg">Guests</h2>
            <ParticipantList slurp={slurp} isHost onUpdate={onUpdate} />
          </section>
          <div className="pb-16" />
        </div>
      )}

      {tab === "participate" && hostParticipant && (
        <GuestView slurp={slurp} participant={hostParticipant} onUpdate={onUpdate} />
      )}

      {tab === "participate" && !hostParticipant && (
        <p className="text-sm text-gray-400 dark:text-gray-500">You are not listed as a participant yet.</p>
      )}

      {tab === "summary" && (
        <SummaryView slurp={slurp} isHost={true} viewerUid={viewerUid} onUpdate={onUpdate} />
      )}
    </div>
  );
}
