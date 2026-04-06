/**
 * Unit tests for create slurp page logic.
 * Tests cover: receipt file validation, content type derivation, tax/tip conversion.
 */

// ── Logic extracted from page.tsx ─────────────────────────────────────────────

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB

function isReceiptFileTooLarge(size: number): boolean {
  return size > MAX_FILE_BYTES;
}

function contentTypeFromMime(mimeType: string): "image/jpeg" | "image/png" | null {
  if (mimeType === "image/png") return "image/png";
  if (mimeType === "image/jpeg" || mimeType === "image/jpg") return "image/jpeg";
  return null;
}

function draftSubtotal(items: Array<{ price: string }>): number {
  return items.reduce((s, i) => s + (parseFloat(i.price) || 0), 0);
}

function toPercent(value: string, mode: "%" | "$", subtotal: number): number {
  const val = parseFloat(value) || 0;
  if (mode === "%") return val;
  return subtotal > 0 ? (val / subtotal) * 100 : 0;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("isReceiptFileTooLarge", () => {
  it("accepts a file under 10 MB", () => {
    expect(isReceiptFileTooLarge(5 * 1024 * 1024)).toBe(false);
  });

  it("accepts a file exactly at 10 MB", () => {
    expect(isReceiptFileTooLarge(10 * 1024 * 1024)).toBe(false);
  });

  it("rejects a file over 10 MB", () => {
    expect(isReceiptFileTooLarge(10 * 1024 * 1024 + 1)).toBe(true);
  });

  it("accepts an empty file (0 bytes)", () => {
    expect(isReceiptFileTooLarge(0)).toBe(false);
  });
});

describe("contentTypeFromMime", () => {
  it("returns image/png for image/png", () => {
    expect(contentTypeFromMime("image/png")).toBe("image/png");
  });

  it("returns image/jpeg for image/jpeg", () => {
    expect(contentTypeFromMime("image/jpeg")).toBe("image/jpeg");
  });

  it("returns image/jpeg for image/jpg", () => {
    expect(contentTypeFromMime("image/jpg")).toBe("image/jpeg");
  });

  it("returns null for unsupported types", () => {
    expect(contentTypeFromMime("image/gif")).toBeNull();
    expect(contentTypeFromMime("application/pdf")).toBeNull();
    expect(contentTypeFromMime("")).toBeNull();
  });
});

describe("draftSubtotal", () => {
  it("sums valid prices", () => {
    expect(draftSubtotal([{ price: "10.00" }, { price: "5.50" }])).toBeCloseTo(15.5);
  });

  it("ignores empty price strings", () => {
    expect(draftSubtotal([{ price: "" }, { price: "3.00" }])).toBeCloseTo(3.0);
  });

  it("ignores non-numeric price strings", () => {
    expect(draftSubtotal([{ price: "abc" }, { price: "2.00" }])).toBeCloseTo(2.0);
  });

  it("returns 0 for empty list", () => {
    expect(draftSubtotal([])).toBe(0);
  });
});

describe("toPercent", () => {
  it("returns value as-is in percent mode", () => {
    expect(toPercent("10", "%", 100)).toBe(10);
  });

  it("converts dollar amount to percent of subtotal", () => {
    expect(toPercent("10", "$", 100)).toBeCloseTo(10);
    expect(toPercent("5", "$", 50)).toBeCloseTo(10);
  });

  it("returns 0 when subtotal is 0 in dollar mode", () => {
    expect(toPercent("5", "$", 0)).toBe(0);
  });

  it("returns 0 for empty value string", () => {
    expect(toPercent("", "%", 100)).toBe(0);
    expect(toPercent("", "$", 100)).toBe(0);
  });
});
