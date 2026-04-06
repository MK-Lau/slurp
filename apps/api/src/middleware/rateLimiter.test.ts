/**
 * Unit tests for FirestoreStore logic extracted from rateLimiter.ts.
 * Tests cover: window expiry, hit counting, decrement boundary, key encoding.
 */

// ── Logic extracted from FirestoreStore ───────────────────────────────────────

const WINDOW_MS = 60 * 60 * 1000; // 1 hour

interface StoreDoc {
  hits: number;
  resetTime: number; // ms epoch
}

/** Core increment logic: determines next state given existing doc and current time. */
function computeIncrement(
  data: StoreDoc | undefined,
  now: number,
  windowMs: number
): { hits: number; resetTime: number; isNewWindow: boolean } {
  if (!data || data.resetTime <= now) {
    return { hits: 1, resetTime: now + windowMs, isNewWindow: true };
  }
  return {
    hits: data.hits + 1,
    resetTime: data.resetTime,
    isNewWindow: false,
  };
}

/** Core decrement logic: unconditionally decrements by 1 (mirrors FieldValue.increment(-1)). */
function computeDecrement(data: StoreDoc): number {
  return data.hits - 1;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("computeIncrement", () => {
  const now = Date.now();

  it("starts a new window when no document exists", () => {
    const result = computeIncrement(undefined, now, WINDOW_MS);
    expect(result.hits).toBe(1);
    expect(result.isNewWindow).toBe(true);
    expect(result.resetTime).toBeCloseTo(now + WINDOW_MS, -2);
  });

  it("starts a new window when resetTime has passed", () => {
    const expired: StoreDoc = { hits: 5, resetTime: now - 1000 };
    const result = computeIncrement(expired, now, WINDOW_MS);
    expect(result.hits).toBe(1);
    expect(result.isNewWindow).toBe(true);
  });

  it("starts a new window when resetTime equals now (boundary)", () => {
    const boundary: StoreDoc = { hits: 3, resetTime: now };
    const result = computeIncrement(boundary, now, WINDOW_MS);
    expect(result.hits).toBe(1);
    expect(result.isNewWindow).toBe(true);
  });

  it("increments hits within an active window", () => {
    const active: StoreDoc = { hits: 3, resetTime: now + 30000 };
    const result = computeIncrement(active, now, WINDOW_MS);
    expect(result.hits).toBe(4);
    expect(result.isNewWindow).toBe(false);
    expect(result.resetTime).toBe(now + 30000);
  });

  it("preserves the existing resetTime when incrementing", () => {
    const futureReset = now + 999999;
    const active: StoreDoc = { hits: 1, resetTime: futureReset };
    const result = computeIncrement(active, now, WINDOW_MS);
    expect(result.resetTime).toBe(futureReset);
  });

  it("increments correctly from hits=0", () => {
    const active: StoreDoc = { hits: 0, resetTime: now + 1000 };
    const result = computeIncrement(active, now, WINDOW_MS);
    expect(result.hits).toBe(1);
  });
});

describe("computeDecrement", () => {
  it("decrements hits from a positive value", () => {
    expect(computeDecrement({ hits: 5, resetTime: 0 })).toBe(4);
    expect(computeDecrement({ hits: 1, resetTime: 0 })).toBe(0);
  });

  it("decrements below zero unconditionally — FieldValue.increment(-1) has no floor", () => {
    // The old transaction-based decrement had a floor of 0. The new implementation
    // uses FieldValue.increment(-1) unconditionally. express-rate-limit only calls
    // decrement() after a successful increment, so hits < 0 should not occur in
    // practice, but the operation itself imposes no floor.
    expect(computeDecrement({ hits: 0, resetTime: 0 })).toBe(-1);
  });
});

describe("key encoding", () => {
  it("encodes slashes in UIDs", () => {
    expect(encodeURIComponent("uid/with/slashes")).toBe("uid%2Fwith%2Fslashes");
  });

  it("encodes colons in IP addresses", () => {
    expect(encodeURIComponent("2001:db8::1")).toBe("2001%3Adb8%3A%3A1");
  });

  it("leaves plain alphanumeric keys unchanged", () => {
    expect(encodeURIComponent("abc123")).toBe("abc123");
  });

  it("encodes the anonymous fallback key safely", () => {
    expect(encodeURIComponent("anonymous")).toBe("anonymous");
  });
});
