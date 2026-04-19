"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { Slurp } from "@slurp/types";
import { CURRENCY_MAP } from "@slurp/types";
import ItemList from "./ItemList";
import ItemForm from "./ItemForm";
import InviteLink from "./InviteLink";
import ParticipantList from "./ParticipantList";
import TaxTipForm from "./TaxTipForm";
import CurrencyConversionForm from "./CurrencyConversionForm";
import SelectionPanel from "./SelectionPanel";
import SummaryView from "./SummaryView";
import DeleteSlurpModal from "./DeleteSlurpModal";
import { dismissReceiptWarning, updateSlurp } from "@/lib/slurps";
import { Btn, Card, Divider, SectionHeader, TextInput } from "@/components/ui";

interface Props {
  slurp: Slurp;
  viewerUid: string;
  onUpdate: (d: Slurp) => void;
  tab: string;
  onTabChange: (tab: string) => void;
}

export default function HostView({ slurp, viewerUid, onUpdate, tab }: Props): React.JSX.Element {
  const router = useRouter();
  const [titleDraft, setTitleDraft] = useState(slurp.title);
  const [savingTitle, setSavingTitle] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
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

  function renderTabContent(): React.JSX.Element {
    if (tab === "items") {
      return hostParticipant ? (
        <SelectionPanel slurp={slurp} participant={hostParticipant} onUpdate={onUpdate} />
      ) : (
        <p className="text-sm text-gray-400">You are not listed as a participant yet.</p>
      );
    }

    if (tab === "summary") {
      return <SummaryView slurp={slurp} isHost={true} viewerUid={viewerUid} onUpdate={onUpdate} />;
    }

    // Manage tab
    return (
      <div className="space-y-6">
        {/* Receipt warning */}
        {showWarning && (
          <div className="relative rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 px-4 py-3 text-sm text-amber-800 dark:text-amber-300 text-center">
            <p className="font-medium">⚠ Receipt image was unclear</p>
            <p className="text-xs mt-0.5">Please review items before confirming.</p>
            <button
              onClick={() => void handleDismissWarning()}
              className="absolute top-2 right-3 text-amber-600 dark:text-amber-400 hover:text-amber-900 dark:hover:text-amber-200 font-medium"
            >
              ✕
            </button>
          </div>
        )}

        {/* Name */}
        <div>
          <SectionHeader title="Name" />
          <TextInput
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={() => void saveTitleDraft()}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing) e.currentTarget.blur();
              if (e.key === "Escape") { setTitleDraft(slurp.title); e.currentTarget.blur(); }
            }}
            disabled={savingTitle}
            maxLength={64}
            aria-label="Slurp name"
          />
          {savingTitle && <p className="text-xs text-gray-400 mt-1">Saving…</p>}
        </div>

        {/* Tax & Tip */}
        <div>
          <SectionHeader title="Tax & Tip" />
          <TaxTipForm slurp={slurp} onUpdate={onUpdate} />
        </div>

        {/* Currency */}
        <div>
          <SectionHeader title="Currency" />
          {slurp.currencyConversion.enabled && (
            <div className="mb-3 rounded-xl bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-700 px-4 py-3">
              <p className="text-xs font-semibold text-purple-700 dark:text-purple-300 uppercase tracking-wide mb-0.5">Currency Conversion Active</p>
              <p className="text-sm text-purple-800 dark:text-purple-200">
                Billed in {CURRENCY_MAP[slurp.currencyConversion.billedCurrency]?.name ?? slurp.currencyConversion.billedCurrency}
                {" · "}Home: {CURRENCY_MAP[slurp.currencyConversion.homeCurrency]?.name ?? slurp.currencyConversion.homeCurrency}
                {" · "}Rate: 1 {slurp.currencyConversion.homeCurrency} = {slurp.currencyConversion.exchangeRate} {slurp.currencyConversion.billedCurrency}
              </p>
            </div>
          )}
          <CurrencyConversionForm slurp={slurp} onUpdate={onUpdate} />
        </div>

        {/* Items */}
        <div>
          <SectionHeader title="Items" />
          <Card className="divide-y divide-gray-50 overflow-hidden">
            <ItemList slurp={slurp} isHost onUpdate={onUpdate} />
            <div className="p-3">
              <ItemForm slurp={slurp} onUpdate={onUpdate} />
            </div>
          </Card>
        </div>

        {/* Guests */}
        <div>
          <SectionHeader title="Guests" />
          <ParticipantList slurp={slurp} isHost onUpdate={onUpdate} />
        </div>

        <Divider />
        <Btn variant="danger" size="sm" onClick={() => setShowDeleteModal(true)}>Delete Slurp</Btn>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Invite link — always visible on all tabs */}
      <InviteLink slurpId={slurp.id} inviteToken={slurp.inviteToken} />

      {renderTabContent()}

      {showDeleteModal && (
        <DeleteSlurpModal
          slurpId={slurp.id}
          slurpTitle={slurp.title}
          onDone={() => router.push("/slurp")}
          onCancel={() => setShowDeleteModal(false)}
        />
      )}
    </div>
  );
}
