"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { createSlurp, addItem, getReceiptUploadUrl, triggerReceiptProcessing, getSlurp } from "@/lib/slurps";
import { getProfile } from "@/lib/users";
import { CURRENCIES, CURRENCY_MAP } from "@slurp/types";
import { Btn, Card, Field, NumberInput, PageFade, Skeleton, TabBar, TextInput, UISelect, UIToggle } from "@/components/ui";

interface DraftItem {
  key: number;
  name: string;
  price: string;
}

type ItemsMode = "manual" | "receipt";
type ParsePhase = "uploading" | "parsing";

const MAX_FILE_BYTES = 10 * 1024 * 1024;

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
    if (!loading && !user) router.replace("/login?redirect=/slurp/new");
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
      .then((profile) => { setHomeCurrency(profile.preferredCurrency ?? "USD"); })
      .catch(() => {});
  }, [user]);

  if (loading || !user) {
    return (
      <div className="max-w-lg mx-auto px-4 py-8">
        <Skeleton lines={4} />
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
      if (!billedCurrency) { setError("Select a billed currency"); return; }
      if (billedCurrency === homeCurrency) { setError("Billed currency and home currency must be different"); return; }
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
        const contentType = receiptFile.type === "image/png" ? ("image/png" as const) : ("image/jpeg" as const);
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
              setParsePhase(null);
              setSubmitting(false);
              setError("We couldn't read your receipt clearly. Please try again with a clearer photo.");
              return;
            }
          }
          if (!pollCancelledRef.current) {
            parseTimeoutRef.current = setTimeout(() => void poll(), 2000);
          }
        };
        void poll();
      } else {
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

  return (
    <>
      <PageFade>
        <div className="max-w-lg mx-auto px-4 py-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-6">New Slurp</h1>

          <TabBar
            tabs={[
              { key: "receipt", label: "📷 Scan Receipt" },
              { key: "manual", label: "✏️ Manual" },
            ]}
            active={itemsMode}
            onChange={(k) => switchToMode(k as ItemsMode)}
          />

          <form onSubmit={handleSubmit} className="mt-6 space-y-5">
            {itemsMode === "manual" && (
              <Field label="Title" hint="e.g. Dinner at Mario's">
                <TextInput
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Give this split a name"
                  maxLength={64}
                />
              </Field>
            )}

            {itemsMode === "receipt" ? (
              <div
                onClick={() => fileInputRef.current?.click()}
                className={`rounded-2xl border-2 border-dashed transition-all duration-150 cursor-pointer flex flex-col items-center justify-center gap-3 py-12 px-6 text-center
                  ${receiptFile
                    ? "border-purple-400 bg-purple-50 dark:bg-purple-900/20 dark:border-purple-600"
                    : "border-gray-200 dark:border-gray-700 hover:border-purple-300 dark:hover:border-purple-500 hover:bg-purple-50/30 dark:hover:bg-purple-900/10"}`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png"
                  className="hidden"
                  onChange={handleReceiptFileChange}
                />
                {receiptFile ? (
                  <>
                    <div className="text-3xl">✅</div>
                    <p className="font-semibold text-purple-700 dark:text-purple-300">{receiptFile.name}</p>
                    <p className="text-xs text-purple-500 dark:text-purple-400">Items will be extracted automatically</p>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setReceiptFile(null); if (fileInputRef.current) fileInputRef.current.value = ""; }}
                      className="text-xs text-gray-400 hover:text-gray-600 underline"
                    >
                      Remove
                    </button>
                  </>
                ) : (
                  <>
                    <div className="text-4xl">📄</div>
                    <p className="font-semibold text-gray-700 dark:text-gray-300">Upload your receipt</p>
                    <p className="text-sm text-gray-400 dark:text-gray-500">Tap to choose a photo — we'll extract all items with AI</p>
                    <Btn variant="secondary" size="sm" type="button">Choose image</Btn>
                  </>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Items</label>
                {items.map((item) => (
                  <div key={item.key} className="flex gap-2 items-center">
                    <TextInput
                      className="flex-1"
                      placeholder="Item name"
                      value={item.name}
                      maxLength={64}
                      onChange={(e) => updateItem(item.key, "name", e.target.value)}
                    />
                    <NumberInput
                      prefix={billedSymbol}
                      className="w-28"
                      placeholder="0.00"
                      value={item.price}
                      onChange={(e) => updateItem(item.key, "price", e.target.value)}
                    />
                    {items.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeItemRow(item.key)}
                        className="text-gray-300 dark:text-gray-600 hover:text-red-400 transition-colors text-xl leading-none shrink-0"
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  onClick={addItemRow}
                  className="text-sm text-purple-600 dark:text-purple-400 hover:text-purple-800 dark:hover:text-purple-300 font-medium transition-colors"
                >
                  + Add item
                </button>
              </div>
            )}

            {itemsMode === "manual" && (
              <div className="grid grid-cols-2 gap-3">
                <Field label={`Tax (${billedSymbol})`}>
                  <NumberInput prefix={billedSymbol} value={taxValue} onChange={(e) => setTaxValue(e.target.value)} step="0.01" min="0" />
                </Field>
                <Field label={`Tip (${billedSymbol})`}>
                  <NumberInput prefix={billedSymbol} value={tipValue} onChange={(e) => setTipValue(e.target.value)} step="0.01" min="0" />
                </Field>
              </div>
            )}

            {/* Currency conversion */}
            <Card className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">Currency conversion</p>
                  <p className="text-xs text-gray-400">Bill in a foreign currency (e.g. JPY)</p>
                </div>
                <UIToggle
                  checked={conversionEnabled}
                  onChange={(v) => { setConversionEnabled(v); setBilledCurrency(""); setExchangeRateTouched(false); }}
                />
              </div>
              {conversionEnabled && (
                <div className="mt-4 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Billed in">
                      <UISelect value={billedCurrency} onChange={(e) => setBilledCurrency(e.target.value)}>
                        <option value="" disabled>Select…</option>
                        {CURRENCIES.map((c) => (
                          <option key={c.code} value={c.code}>{c.code} — {c.name}</option>
                        ))}
                      </UISelect>
                    </Field>
                    <Field label="Home currency">
                      <UISelect value={homeCurrency} onChange={(e) => setHomeCurrency(e.target.value)}>
                        {CURRENCIES.map((c) => (
                          <option key={c.code} value={c.code}>{c.code} — {c.name}</option>
                        ))}
                      </UISelect>
                    </Field>
                  </div>
                  {billedCurrency && billedCurrency === homeCurrency && (
                    <p className="text-xs text-red-500">Billed and home currency must be different</p>
                  )}
                  <Field
                    label="Exchange rate"
                    hint={
                      exchangeRate && billedCurrency && billedCurrency !== homeCurrency
                        ? `1 ${homeCurrency} = ${exchangeRate} ${billedCurrency}`
                        : undefined
                    }
                    error={
                      exchangeRateTouched && (!exchangeRate || parseFloat(exchangeRate) <= 0)
                        ? "Enter a valid exchange rate"
                        : undefined
                    }
                  >
                    <TextInput
                      type="number"
                      step="any"
                      min="0.000001"
                      placeholder="e.g. 150"
                      value={exchangeRate}
                      onChange={(e) => setExchangeRate(e.target.value)}
                      onBlur={() => setExchangeRateTouched(true)}
                    />
                    <a
                      href="https://usa.visa.com/support/consumer/travel-support/exchange-rate-calculator.html"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-purple-600 dark:text-purple-400 hover:text-purple-800 dark:hover:text-purple-300 hover:underline transition-colors"
                    >
                      Check exchange rate →
                    </a>
                  </Field>
                </div>
              )}
            </Card>

            {error && <p className="text-red-600 text-sm">{error}</p>}

            <Btn
              type="submit"
              variant="primary"
              size="lg"
              className="w-full"
              disabled={submitting || (itemsMode === "receipt" && !receiptFile)}
            >
              {submitting ? "Creating…" : itemsMode === "receipt" ? "Create & Scan Receipt" : "Create Slurp"}
            </Btn>
          </form>
        </div>
      </PageFade>

      {/* Parsing overlay */}
      {parsePhase !== null && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center">
          <Card className="p-8 flex flex-col items-center gap-5 text-center max-w-xs mx-4">
            {parseError ? (
              <>
                <p className="font-semibold text-gray-900 dark:text-gray-100 text-lg">Taking longer than expected</p>
                <p className="text-sm text-gray-400 dark:text-gray-500">Your Slurp was created. Items may still appear once processing finishes.</p>
                <Btn variant="primary" onClick={() => router.push(`/slurp/${parseSlurpIdRef.current}`)}>
                  Go to your Slurp
                </Btn>
              </>
            ) : (
              <>
                <div className="w-14 h-14 rounded-full border-4 border-purple-100 border-t-purple-600 animate-spin" />
                <div>
                  <p className="font-semibold text-gray-900 dark:text-gray-100 text-lg">
                    {parsePhase === "uploading" ? "Uploading receipt…" : "Reading your receipt…"}
                  </p>
                  <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
                    {parsePhase === "uploading" ? "Just a moment" : "This usually takes 10–30 seconds"}
                  </p>
                </div>
                <div className="flex gap-1.5">
                  {(["uploading", "parsing"] as ParsePhase[]).map((p, i) => (
                    <div
                      key={p}
                      className={`h-1.5 rounded-full transition-all duration-500 ${
                        parsePhase === p ? "w-6 bg-purple-600" : i < (["uploading", "parsing"] as ParsePhase[]).indexOf(parsePhase) ? "w-3 bg-purple-300 dark:bg-purple-700" : "w-3 bg-gray-200 dark:bg-gray-700"
                      }`}
                    />
                  ))}
                </div>
              </>
            )}
          </Card>
        </div>
      )}
    </>
  );
}
