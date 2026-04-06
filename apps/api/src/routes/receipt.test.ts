/**
 * Unit tests for the receipt route validation logic.
 * Tests cover: content type validation, receiptStatus guards.
 */

// ── Logic extracted from receipt.ts ──────────────────────────────────────────

function isValidContentType(ct: unknown): ct is "image/jpeg" | "image/png" {
  return ct === "image/jpeg" || ct === "image/png";
}

/** upload-url endpoint rejects if already processing */
function canRequestUploadUrl(receiptStatus?: string): boolean {
  return receiptStatus !== "processing";
}

/** process endpoint requires status to be exactly "pending" */
function canTriggerProcessing(receiptStatus?: string): boolean {
  return receiptStatus === "pending";
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("isValidContentType", () => {
  it("accepts image/jpeg", () => {
    expect(isValidContentType("image/jpeg")).toBe(true);
  });

  it("accepts image/png", () => {
    expect(isValidContentType("image/png")).toBe(true);
  });

  it("rejects image/gif", () => {
    expect(isValidContentType("image/gif")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(isValidContentType("")).toBe(false);
  });

  it("rejects undefined", () => {
    expect(isValidContentType(undefined)).toBe(false);
  });

  it("rejects arbitrary string", () => {
    expect(isValidContentType("application/json")).toBe(false);
  });
});

describe("canRequestUploadUrl", () => {
  it("allows upload when status is undefined", () => {
    expect(canRequestUploadUrl(undefined)).toBe(true);
  });

  it("allows upload when status is pending", () => {
    expect(canRequestUploadUrl("pending")).toBe(true);
  });

  it("allows upload when status is done", () => {
    expect(canRequestUploadUrl("done")).toBe(true);
  });

  it("allows upload when status is failed", () => {
    expect(canRequestUploadUrl("failed")).toBe(true);
  });

  it("blocks upload when status is processing", () => {
    expect(canRequestUploadUrl("processing")).toBe(false);
  });
});

describe("canTriggerProcessing", () => {
  it("allows processing when status is pending", () => {
    expect(canTriggerProcessing("pending")).toBe(true);
  });

  it("blocks processing when status is undefined", () => {
    expect(canTriggerProcessing(undefined)).toBe(false);
  });

  it("blocks processing when status is processing", () => {
    expect(canTriggerProcessing("processing")).toBe(false);
  });

  it("blocks processing when status is done", () => {
    expect(canTriggerProcessing("done")).toBe(false);
  });

  it("blocks processing when status is failed", () => {
    expect(canTriggerProcessing("failed")).toBe(false);
  });
});
