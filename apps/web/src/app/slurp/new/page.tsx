"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { createSlurp, addItem, getReceiptUploadUrl, triggerReceiptProcessing, getSlurp } from "@/lib/slurps";
import { getProfile } from "@/lib/users";
import { CURRENCIES, CURRENCY_MAP } from "@slurp/types";

interface DraftItem {
  key: number;
  name: string;
  price: string;
}

type ItemsMode = "manual" | "receipt";
type ParsePhase = "uploading" | "parsing";

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB

export default function NewSlurpPage(): React.JSX.Element {
  const { user, loading, triggerVenmoPrompt } = useAuth();
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [taxValue, setTaxValue] = useState("0");
  const [tipValue, setTipValue] = useState("0");
  const [itemsMode, setItemsMode] = useState<ItemsMode>("receipt");
  const [items, setItems] = useState<DraftItem[]>([{ key: 0, name: "", price: "" }]);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [parsePhase, setParsePhase] = useState<ParsePhase | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);

  const [conversionEnabled, setConversionEnabled] = useState(false);
  const [billedCurrency, setBilledCurrency] = useState("");
  const [homeCurrency, setHomeCurrency] = useState("USD");
  const [exchangeRate, setExchangeRate] = useState("");
  const [exchangeRateTouched, setExchangeRateTouched] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const parseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const parseSlurpIdRef = useRef<string>("");
  const pollCancelledRef = useRef(false);

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login?redirect=/slurp/new");
    }
  }, [user, loading, router]);

  useEffect(() => {
    return () => {
      pollCancelledRef.current = true;
      if (parseTimeoutRef.current) clearTimeout(parseTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    if (!user) return;
    getProfile()
      .then((profile) => {
        setHomeCurrency(profile.preferredCurrency ?? "USD");
      })
      .catch(() => {});
  }, [user]);

  if (loading || !user) {
    return (
      <div className="max-w-2xl mx-auto mt-4 sm:mt-10 px-4 sm:p-6">
        <div className="h-8 w-40 rounded bg-gray-200 dark:bg-gray-700 animate-pulse mb-6" />
        <div className="flex flex-col gap-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-10 rounded bg-gray-200 dark:bg-gray-700 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  function addItemRow(): void {
    setItems((prev) => [...prev, { key: Date.now(), name: "", price: "" }]);
  }

  function removeItemRow(key: number): void {
    setItems((prev) => prev.filter((i) => i.key !== key));
  }

  function updateItem(key: number, field: "name" | "price", value: string): void {
    setItems((prev) => prev.map((i) => (i.key === key ? { ...i, [field]: value } : i)));
  }

  function handleReceiptFileChange(e: React.ChangeEvent<HTMLInputElement>): void {
    const file = e.target.files?.[0] ?? null;
    if (file && file.size > MAX_FILE_BYTES) {
      setError("Receipt image must be under 10 MB");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    setError(null);
    setReceiptFile(file);
  }

  function switchToMode(mode: ItemsMode): void {
    setItemsMode(mode);
    setError(null);
    if (mode === "manual") {
      setReceiptFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setError(null);

    if (conversionEnabled) {
      if (!billedCurrency) {
        setError("Select a billed currency");
        return;
      }
      if (billedCurrency === homeCurrency) {
        setError("Billed currency and home currency must be different");
        return;
      }
      const rate = parseFloat(exchangeRate);
      if (!exchangeRate || !isFinite(rate) || rate <= 0) {
        setError("Enter a valid exchange rate");
        setExchangeRateTouched(true);
        return;
      }
    }

    setSubmitting(true);

    try {
      const slurp = await createSlurp({
        title,
        taxAmount: parseFloat(taxValue) || 0,
        tipAmount: parseFloat(tipValue) || 0,
        currencyConversion: {
          enabled: conversionEnabled,
          billedCurrency: conversionEnabled ? billedCurrency : homeCurrency,
          homeCurrency,
          exchangeRate: conversionEnabled ? parseFloat(exchangeRate) : 1,
        },
      });

      if (itemsMode === "receipt" && receiptFile) {
        // Receipt flow: upload → parse → redirect when done
        const contentType = receiptFile.type === "image/png"
          ? ("image/png" as const)
          : ("image/jpeg" as const);

        parseSlurpIdRef.current = slurp.id;
        setParsePhase("uploading");

        const { uploadUrl, gcsPath } = await getReceiptUploadUrl(slurp.id, { contentType });

        const uploadRes = await fetch(uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": contentType },
          body: receiptFile,
        });
        if (!uploadRes.ok) throw new Error(`Receipt upload failed: HTTP ${uploadRes.status}`);

        await triggerReceiptProcessing(slurp.id, gcsPath);
        setParsePhase("parsing");

        // Poll the API every 2 s until receiptStatus is done or failed, then redirect.
        // Timeout after 26 s to avoid leaving the user stuck if the processor stalls.
        const slurpId = slurp.id;
        const deadline = Date.now() + 120_000;
        pollCancelledRef.current = false;

        const poll = async (): Promise<void> => {
          if (pollCancelledRef.current) return;
          if (Date.now() >= deadline) {
            setParseError("Receipt processing is taking longer than expected.");
            return;
          }
          try {
            const d = await getSlurp(slurpId);
            if (pollCancelledRef.current) return;
            if (d.receiptStatus === "done" || d.receiptStatus === "failed") {
              triggerVenmoPrompt();
              router.push(`/slurp/${slurpId}`);
              return;
            }
          } catch (err) {
            if (err instanceof Error && err.message === "Slurp not found") {
              // Processor deleted the slurp due to low confidence — bring user back to the form.
              setParsePhase(null);
              setSubmitting(false);
              setError("We couldn't read your receipt clearly. Please try again with a clearer photo.");
              return;
            }
            // Ignore other transient errors and keep polling.
          }
          if (!pollCancelledRef.current) {
            parseTimeoutRef.current = setTimeout(() => void poll(), 2000);
          }
        };

        void poll();
      } else {
        // Manual flow: add items then redirect
        const validItems = items.filter((i) => i.name.trim() && i.price);
        for (const item of validItems) {
          await addItem(slurp.id, { name: item.name.trim(), price: parseFloat(item.price) });
        }
        triggerVenmoPrompt();
        router.push(`/slurp/${slurp.id}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setParsePhase(null);
      setSubmitting(false);
    }
  }

  const billedSymbol = (conversionEnabled && billedCurrency ? CURRENCY_MAP[billedCurrency]?.symbol : undefined) ?? "$";

  const modeTabClass = (m: ItemsMode): string =>
    `flex-1 py-3 text-base font-semibold transition-colors duration-150 ${
      itemsMode === m
        ? "bg-purple-600 text-white"
        : "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
    }`;

  return (
    <>
    <div className="max-w-lg mx-auto mt-4 sm:mt-10 px-4 sm:p-6">
      <h1 className="text-2xl font-bold mb-6">New Slurp</h1>

      {/* Mode selector — top of page, large like HostView tabs */}
      <div className="flex rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 mb-6">
        <button type="button" className={modeTabClass("receipt")} onClick={() => switchToMode("receipt")}>
          Scan Receipt
        </button>
        <button type="button" className={modeTabClass("manual")} onClick={() => switchToMode("manual")}>
          Manual
        </button>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-6">

        {itemsMode === "manual" && (
          <div className="flex flex-col gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Title</label>
              <input
                className="w-full border rounded px-3 py-2 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                value={title}
                maxLength={64}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Dinner at Mario's"
              />
            </div>
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1">
                <label className="block text-sm font-medium mb-1">Tax ({billedSymbol})</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className="w-full border rounded px-3 py-2 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                  value={taxValue}
                  onChange={(e) => setTaxValue(e.target.value)}
                />
              </div>
              <div className="flex-1">
                <label className="block text-sm font-medium mb-1">Tip ({billedSymbol})</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className="w-full border rounded px-3 py-2 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                  value={tipValue}
                  onChange={(e) => setTipValue(e.target.value)}
                />
              </div>
            </div>
          </div>
        )}

        {itemsMode === "manual" ? (
          <div className="flex flex-col gap-2">
            {items.map((item) => (
              <div key={item.key} className="flex gap-2 items-center">
                <input
                  className="flex-1 border rounded px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                  placeholder="Item name"
                  value={item.name}
                  maxLength={64}
                  onChange={(e) => updateItem(item.key, "name", e.target.value)}
                />
                <div className="flex items-center border rounded dark:border-gray-600 overflow-hidden w-full sm:w-32">
                  <span className="px-2 text-sm text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-700 border-r dark:border-gray-600 select-none">{billedSymbol}</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className="flex-1 px-2 py-2 text-sm bg-white dark:bg-gray-800 dark:text-gray-100 outline-none min-w-0"
                    placeholder="0.00"
                    value={item.price}
                    onChange={(e) => updateItem(item.key, "price", e.target.value)}
                  />
                </div>
                {items.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeItemRow(item.key)}
                    className="text-gray-400 dark:text-gray-500 hover:text-red-500 text-lg leading-none"
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              onClick={addItemRow}
              className="mt-2 text-sm text-purple-600 hover:text-purple-800 self-start"
            >
              + Add item
            </button>
          </div>
        ) : (
          <div className="border-2 border-dashed dark:border-gray-600 rounded-lg p-6 flex flex-col items-center gap-3">
            <p className="text-sm text-gray-500 dark:text-gray-400 text-center">
              Upload a photo of your receipt and we'll extract the items automatically.
            </p>
            <label className="cursor-pointer px-4 py-2 border rounded text-sm bg-white dark:bg-gray-900 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800 font-medium">
              {receiptFile ? receiptFile.name : "Choose image"}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png"
                className="hidden"
                onChange={handleReceiptFileChange}
              />
            </label>
            {receiptFile && (
              <p className="text-xs text-gray-400 dark:text-gray-500">
                Items and tax will be populated automatically after you create the slurp.
              </p>
            )}
          </div>
        )}

        {/* Currency conversion */}
        <div className="border rounded-lg p-4 dark:border-gray-700 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Currency conversion</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Show amounts in two currencies</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={conversionEnabled}
              onClick={() => { setConversionEnabled((v) => !v); setBilledCurrency(""); setExchangeRateTouched(false); }}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${conversionEnabled ? "bg-purple-600" : "bg-gray-300 dark:bg-gray-600"}`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${conversionEnabled ? "translate-x-6" : "translate-x-1"}`} />
            </button>
          </div>

          {conversionEnabled && (
            <div className="flex flex-col gap-3">
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="flex-1">
                  <label className="block text-sm font-medium mb-1">Billed in</label>
                  <select
                    className="w-full border rounded px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                    value={billedCurrency}
                    onChange={(e) => setBilledCurrency(e.target.value)}
                  >
                    <option value="" disabled>Select currency</option>
                    {CURRENCIES.map((c) => (
                      <option key={c.code} value={c.code}>{c.code} — {c.name}</option>
                    ))}
                  </select>
                </div>
                <div className="flex-1">
                  <label className="block text-sm font-medium mb-1">Home currency</label>
                  <select
                    className="w-full border rounded px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                    value={homeCurrency}
                    onChange={(e) => setHomeCurrency(e.target.value)}
                  >
                    {CURRENCIES.map((c) => (
                      <option key={c.code} value={c.code}>{c.code} — {c.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              {billedCurrency && billedCurrency === homeCurrency && (
                <p className="text-xs text-red-600">Billed currency and home currency must be different</p>
              )}
              <div>
                <label className="block text-sm font-medium mb-1">Exchange rate</label>
                <input
                  type="number"
                  step="any"
                  min="0.000001"
                  className="w-full border rounded px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                  placeholder="e.g. 150"
                  value={exchangeRate}
                  onChange={(e) => setExchangeRate(e.target.value)}
                  onBlur={() => setExchangeRateTouched(true)}
                />
                {exchangeRateTouched && (!exchangeRate || parseFloat(exchangeRate) <= 0) && (
                  <p className="text-xs text-red-600 mt-1">Enter a valid exchange rate</p>
                )}
                {exchangeRateTouched && exchangeRate && parseFloat(exchangeRate) > 0 && billedCurrency !== homeCurrency && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    1 {homeCurrency} = {exchangeRate} {billedCurrency}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {error && <p className="text-red-600 text-sm">{error}</p>}

        <button
          type="submit"
          disabled={submitting || (itemsMode === "receipt" && !receiptFile)}
          className="rounded bg-purple-600 px-6 py-2 text-white hover:bg-purple-700 disabled:opacity-50"
        >
          {submitting
            ? "Creating…"
            : itemsMode === "receipt"
              ? "Create & Scan Receipt"
              : "Create Slurp"}
        </button>
      </form>
    </div>

    {parsePhase !== null && (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
        <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl p-8 flex flex-col items-center gap-6 text-center max-w-sm mx-4">
          {parseError ? (
            <>
              <p className="text-lg font-medium">Taking longer than expected</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Your slurp was created. Items may still appear once processing finishes.
              </p>
              <button
                onClick={() => router.push(`/slurp/${parseSlurpIdRef.current}`)}
                className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 text-sm"
              >
                Go to your slurp
              </button>
            </>
          ) : (
            <>
              <div className="w-12 h-12 rounded-full border-4 border-purple-200 dark:border-purple-800 border-t-purple-600 dark:border-t-purple-500 animate-spin" />
              {parsePhase === "uploading" ? (
                <>
                  <p className="text-lg font-medium">Uploading your receipt…</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Just a moment</p>
                </>
              ) : (
                <>
                  <p className="text-lg font-medium">Parsing your receipt…</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">This usually takes 10–30 seconds</p>
                </>
              )}
            </>
          )}
        </div>
      </div>
    )}
    </>
  );
}
