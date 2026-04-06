/**
 * Unit tests for summary calculation logic extracted from the slurps route.
 * Tests cover: shared items, unselected items, tax/tip, floating point rounding.
 */

interface Item {
  id: string;
  name: string;
  price: number;
}

interface Participant {
  uid: string | null;
  email: string;
  displayName?: string;
  role: "host" | "guest";
  status: "pending" | "confirmed";
  selectedItemIds: string[];
  paid?: boolean;
}

interface Slurp {
  id: string;
  taxAmount: number;
  tipAmount: number;
  items: Item[];
  participants: Participant[];
  status: string;
}

function computeSummary(slurp: Slurp): Array<{ email: string; items: Array<{ item: Item; sharePrice: number }>; subtotal: number; tax: number; tip: number; total: number }> {
  const itemMap = new Map(slurp.items.map((i) => [i.id, i]));
  const itemSelectCount = new Map<string, number>();
  for (const item of slurp.items) {
    const count = slurp.participants.filter((p) =>
      p.selectedItemIds.includes(item.id)
    ).length;
    itemSelectCount.set(item.id, count);
  }

  const totalSubtotal = slurp.participants.reduce((total, p) => {
    return total + p.selectedItemIds.reduce((sum, id) => {
      const item = itemMap.get(id);
      if (!item) return sum;
      const count = itemSelectCount.get(id) ?? 1;
      return sum + item.price / count;
    }, 0);
  }, 0);

  return slurp.participants.map((p) => {
    const itemBreakdown = p.selectedItemIds
      .map((id) => {
        const item = itemMap.get(id);
        if (!item) return null;
        const count = itemSelectCount.get(id) ?? 1;
        return { item, sharePrice: item.price / count };
      })
      .filter(Boolean) as Array<{ item: Item; sharePrice: number }>;

    const subtotal = itemBreakdown.reduce((s, e) => s + e.sharePrice, 0);
    const tax = totalSubtotal > 0 ? (subtotal / totalSubtotal) * slurp.taxAmount : 0;
    const tip = totalSubtotal > 0 ? (subtotal / totalSubtotal) * slurp.tipAmount : 0;
    return {
      email: p.email,
      ...(p.displayName ? { displayName: p.displayName } : {}),
      items: itemBreakdown,
      subtotal: Math.round(subtotal * 100) / 100,
      tax: Math.round(tax * 100) / 100,
      tip: Math.round(tip * 100) / 100,
      total: Math.round((subtotal + tax + tip) * 100) / 100,
    };
  });
}

const item = (id: string, name: string, price: number): Item => ({ id, name, price });
const participant = (
  email: string,
  selectedItemIds: string[],
  uid: string | null = "uid1",
  role: "host" | "guest" = "guest",
  displayName?: string
): Participant => ({ uid, email, role, status: "pending", selectedItemIds, ...(displayName ? { displayName } : {}) });

describe("computeSummary", () => {
  it("assigns full price to sole selector", () => {
    const slurp: Slurp = {
      id: "d1",
      taxAmount: 0,
      tipAmount: 0,
      status: "open",
      items: [item("i1", "Burger", 10)],
      participants: [participant("a@a.com", ["i1"])],
    };
    const [a] = computeSummary(slurp);
    expect(a.subtotal).toBe(10);
    expect(a.total).toBe(10);
  });

  it("splits price equally between two selectors", () => {
    const slurp: Slurp = {
      id: "d1",
      taxAmount: 0,
      tipAmount: 0,
      status: "open",
      items: [item("i1", "Pizza", 30)],
      participants: [
        participant("a@a.com", ["i1"]),
        participant("b@b.com", ["i1"]),
      ],
    };
    const [a, b] = computeSummary(slurp);
    expect(a.subtotal).toBe(15);
    expect(b.subtotal).toBe(15);
  });

  it("splits among three selectors", () => {
    const slurp: Slurp = {
      id: "d1",
      taxAmount: 0,
      tipAmount: 0,
      status: "open",
      items: [item("i1", "Nachos", 9)],
      participants: [
        participant("a@a.com", ["i1"]),
        participant("b@b.com", ["i1"]),
        participant("c@c.com", ["i1"]),
      ],
    };
    const [a, b, c] = computeSummary(slurp);
    expect(a.subtotal).toBe(3);
    expect(b.subtotal).toBe(3);
    expect(c.subtotal).toBe(3);
  });

  it("charges nothing for unselected item", () => {
    const slurp: Slurp = {
      id: "d1",
      taxAmount: 0,
      tipAmount: 0,
      status: "open",
      items: [item("i1", "Steak", 50), item("i2", "Salad", 10)],
      participants: [
        participant("a@a.com", ["i1"]),
        participant("b@b.com", ["i2"]),
      ],
    };
    const [a, b] = computeSummary(slurp);
    expect(a.subtotal).toBe(50);
    expect(b.subtotal).toBe(10);
  });

  it("applies tax and tip on top of subtotal", () => {
    const slurp: Slurp = {
      id: "d1",
      taxAmount: 10,
      tipAmount: 20,
      status: "open",
      items: [item("i1", "Sushi", 100)],
      participants: [participant("a@a.com", ["i1"])],
    };
    const [a] = computeSummary(slurp);
    expect(a.subtotal).toBe(100);
    expect(a.tax).toBe(10);
    expect(a.tip).toBe(20);
    expect(a.total).toBe(130);
  });

  it("participant with no selections has zero total", () => {
    const slurp: Slurp = {
      id: "d1",
      taxAmount: 8.5,
      tipAmount: 18,
      status: "open",
      items: [item("i1", "Burger", 15)],
      participants: [
        participant("a@a.com", ["i1"]),
        participant("b@b.com", []),
      ],
    };
    const [, b] = computeSummary(slurp);
    expect(b.subtotal).toBe(0);
    expect(b.tax).toBe(0);
    expect(b.tip).toBe(0);
    expect(b.total).toBe(0);
  });

  it("rounds totals to cents", () => {
    // $10 split 3 ways = $3.333... each — rounds to $3.33
    const slurp: Slurp = {
      id: "d1",
      taxAmount: 0,
      tipAmount: 0,
      status: "open",
      items: [item("i1", "Shared", 10)],
      participants: [
        participant("a@a.com", ["i1"]),
        participant("b@b.com", ["i1"]),
        participant("c@c.com", ["i1"]),
      ],
    };
    const [a] = computeSummary(slurp);
    expect(a.subtotal).toBe(3.33);
  });

  it("distributes flat taxAmount proportionally", () => {
    // a has $60, b has $40 — flat $10 tax should split 60/40
    const slurp: Slurp = {
      id: "d1",
      taxAmount: 10,
      tipAmount: 0,
      status: "open",
      items: [item("i1", "Big", 60), item("i2", "Small", 40)],
      participants: [
        participant("a@a.com", ["i1"]),
        participant("b@b.com", ["i2"]),
      ],
    };
    const [a, b] = computeSummary(slurp);
    expect(a.tax).toBe(6);
    expect(b.tax).toBe(4);
    expect(a.total).toBe(66);
    expect(b.total).toBe(44);
  });

  it("gives zero flat tip to participant with no selections", () => {
    const slurp: Slurp = {
      id: "d1",
      taxAmount: 0,
      tipAmount: 20,
      status: "open",
      items: [item("i1", "Burger", 50)],
      participants: [
        participant("a@a.com", ["i1"]),
        participant("b@b.com", []),
      ],
    };
    const [a, b] = computeSummary(slurp);
    expect(a.tip).toBe(20);
    expect(b.tip).toBe(0);
  });

  it("splits flat tax and tip proportionally across multiple participants", () => {
    // a has $75, b has $25 — $10 tax and $8 tip should split 75/25
    const slurp: Slurp = {
      id: "d1",
      taxAmount: 10,
      tipAmount: 8,
      status: "open",
      items: [item("i1", "Big", 75), item("i2", "Small", 25)],
      participants: [
        participant("a@a.com", ["i1"]),
        participant("b@b.com", ["i2"]),
      ],
    };
    const [a, b] = computeSummary(slurp);
    expect(a.tax).toBe(7.5);
    expect(a.tip).toBe(6);
    expect(a.total).toBe(88.5);
    expect(b.tax).toBe(2.5);
    expect(b.tip).toBe(2);
    expect(b.total).toBe(29.5);
  });
});

// ── markAsPaid logic ──────────────────────────────────────────────────────────

function markAsPaid(slurp: Slurp, uid: string): { slurp: Slurp; error?: string } {
  const p = slurp.participants.find((p) => p.uid === uid);
  if (!p) return { slurp, error: "Participant not found" };
  if (p.role === "host") return { slurp, error: "Host cannot mark as paid" };
  p.paid = true;
  return { slurp };
}

describe("markAsPaid", () => {
  it("sets paid=true for a guest participant", () => {
    const slurp: Slurp = {
      id: "d1",
      taxAmount: 0,
      tipAmount: 0,
      status: "open",
      items: [],
      participants: [
        participant("host@a.com", [], "host-uid", "host"),
        participant("guest@b.com", [], "guest-uid"),
      ],
    };
    const { slurp: updated, error } = markAsPaid(slurp, "guest-uid");
    expect(error).toBeUndefined();
    const guest = updated.participants.find((p) => p.uid === "guest-uid");
    expect(guest?.paid).toBe(true);
  });

  it("does not allow host to mark as paid", () => {
    const slurp: Slurp = {
      id: "d1",
      taxAmount: 0,
      tipAmount: 0,
      status: "open",
      items: [],
      participants: [
        participant("host@a.com", [], "host-uid", "host"),
      ],
    };
    const { error } = markAsPaid(slurp, "host-uid");
    expect(error).toBe("Host cannot mark as paid");
  });

  it("returns error for unknown uid", () => {
    const slurp: Slurp = {
      id: "d1",
      taxAmount: 0,
      tipAmount: 0,
      status: "open",
      items: [],
      participants: [participant("guest@b.com", [], "guest-uid")],
    };
    const { error } = markAsPaid(slurp, "unknown-uid");
    expect(error).toBe("Participant not found");
  });

  it("leaves other participants unaffected", () => {
    const slurp: Slurp = {
      id: "d1",
      taxAmount: 0,
      tipAmount: 0,
      status: "open",
      items: [],
      participants: [
        participant("a@a.com", [], "uid-a"),
        participant("b@b.com", [], "uid-b"),
      ],
    };
    markAsPaid(slurp, "uid-a");
    const b = slurp.participants.find((p) => p.uid === "uid-b");
    expect(b?.paid).toBeUndefined();
  });
});

// ── Display name resolution ───────────────────────────────────────────────────

/** Simulates resolveDisplayNames: maps uid → displayName from profile snapshots. */
function resolveDisplayNames(
  participants: Participant[],
  profiles: Record<string, { displayName?: string }>
): Map<string, string> {
  const map = new Map<string, string>();
  for (const p of participants) {
    if (!p.uid) continue;
    const name = profiles[p.uid]?.displayName;
    if (name) map.set(p.uid, name);
  }
  return map;
}

/** Simulates the GET /slurps/:id overlay: mutates participants with resolved displayNames. */
function overlayDisplayNames(participants: Participant[], displayNames: Map<string, string>): void {
  for (const p of participants) {
    if (!p.uid) continue;
    const name = displayNames.get(p.uid);
    if (name) p.displayName = name;
  }
}

/** Simulates resolved displayName for join: body value takes priority over profile. */
function resolveJoinDisplayName(bodyDisplayName: string | undefined, profileDisplayName: string | undefined): string | undefined {
  return bodyDisplayName || profileDisplayName;
}

describe("resolveDisplayNames", () => {
  it("returns display names for participants with profiles", () => {
    const participants = [
      participant("a@a.com", [], "uid-a"),
      participant("b@b.com", [], "uid-b"),
    ];
    const profiles = { "uid-a": { displayName: "Alice" }, "uid-b": { displayName: "Bob" } };
    const result = resolveDisplayNames(participants, profiles);
    expect(result.get("uid-a")).toBe("Alice");
    expect(result.get("uid-b")).toBe("Bob");
  });

  it("omits participants whose profiles have no displayName", () => {
    const participants = [
      participant("a@a.com", [], "uid-a"),
      participant("b@b.com", [], "uid-b"),
    ];
    const profiles = { "uid-a": { displayName: "Alice" }, "uid-b": {} };
    const result = resolveDisplayNames(participants, profiles);
    expect(result.has("uid-a")).toBe(true);
    expect(result.has("uid-b")).toBe(false);
  });

  it("returns empty map when no profiles have displayName", () => {
    const participants = [participant("a@a.com", [], "uid-a")];
    const profiles = { "uid-a": {} };
    const result = resolveDisplayNames(participants, profiles);
    expect(result.size).toBe(0);
  });

  it("returns empty map for empty participant list", () => {
    const result = resolveDisplayNames([], {});
    expect(result.size).toBe(0);
  });
});

describe("overlayDisplayNames (GET /slurps/:id)", () => {
  it("overlays current displayName onto participant", () => {
    const participants = [participant("a@a.com", [], "uid-a")];
    const displayNames = new Map([["uid-a", "Alice"]]);
    overlayDisplayNames(participants, displayNames);
    expect(participants[0].displayName).toBe("Alice");
  });

  it("overwrites stale stored displayName with current profile value", () => {
    const participants = [participant("a@a.com", [], "uid-a", "guest", "OldName")];
    const displayNames = new Map([["uid-a", "NewName"]]);
    overlayDisplayNames(participants, displayNames);
    expect(participants[0].displayName).toBe("NewName");
  });

  it("leaves displayName unchanged when uid has no profile entry", () => {
    const participants = [participant("a@a.com", [], "uid-a", "guest", "StoredName")];
    const displayNames = new Map<string, string>();
    overlayDisplayNames(participants, displayNames);
    expect(participants[0].displayName).toBe("StoredName");
  });

  it("does not set displayName when profile has none and participant had none", () => {
    const participants = [participant("a@a.com", [], "uid-a")];
    const displayNames = new Map<string, string>();
    overlayDisplayNames(participants, displayNames);
    expect(participants[0].displayName).toBeUndefined();
  });
});

describe("join displayName resolution", () => {
  it("uses body displayName when provided", () => {
    expect(resolveJoinDisplayName("BodyName", "ProfileName")).toBe("BodyName");
  });

  it("falls back to profile displayName when body has none", () => {
    expect(resolveJoinDisplayName(undefined, "ProfileName")).toBe("ProfileName");
  });

  it("returns undefined when neither body nor profile has a displayName", () => {
    expect(resolveJoinDisplayName(undefined, undefined)).toBeUndefined();
  });

  it("treats empty string body as absent and falls back to profile", () => {
    expect(resolveJoinDisplayName("", "ProfileName")).toBe("ProfileName");
  });
});

describe("computeSummary displayName passthrough", () => {
  it("includes displayName in breakdown when participant has one", () => {
    const slurp: Slurp = {
      id: "d1",
      taxAmount: 0,
      tipAmount: 0,
      status: "open",
      items: [item("i1", "Burger", 10)],
      participants: [participant("a@a.com", ["i1"], "uid-a", "guest", "Alice")],
    };
    const [a] = computeSummary(slurp);
    expect((a as { displayName?: string }).displayName).toBe("Alice");
  });

  it("omits displayName from breakdown when participant has none", () => {
    const slurp: Slurp = {
      id: "d1",
      taxAmount: 0,
      tipAmount: 0,
      status: "open",
      items: [item("i1", "Burger", 10)],
      participants: [participant("a@a.com", ["i1"])],
    };
    const [a] = computeSummary(slurp);
    expect((a as { displayName?: string }).displayName).toBeUndefined();
  });
});

// ── validateString ────────────────────────────────────────────────────────────

/** Mirrors the validateString helper in slurps.ts */
function validateString(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== "string") throw new Error(`${field} must be a string`);
  const trimmed = value.trim();
  if (trimmed.length > maxLength) throw new Error(`${field} must be ${maxLength} characters or fewer`);
  return trimmed;
}

describe("validateString", () => {
  it("returns value unchanged when within limit", () => {
    expect(validateString("hello", "title", 64)).toBe("hello");
  });

  it("trims leading and trailing whitespace", () => {
    expect(validateString("  hello  ", "title", 64)).toBe("hello");
  });

  it("accepts a value at exactly the max length", () => {
    const s = "a".repeat(64);
    expect(validateString(s, "name", 64)).toBe(s);
  });

  it("rejects a value that exceeds the max length after trimming", () => {
    expect(() => validateString("a".repeat(65), "name", 64)).toThrow("64 characters or fewer");
  });

  it("rejects non-string values", () => {
    expect(() => validateString(42, "title", 64)).toThrow("must be a string");
  });

  it("uses trimmed length for limit check (whitespace-padded string at limit is accepted)", () => {
    // 64 real chars + 10 spaces on each side — trimmed is exactly 64, so valid
    const s = " ".repeat(10) + "a".repeat(64) + " ".repeat(10);
    expect(validateString(s, "title", 64)).toBe("a".repeat(64));
  });

  it("rejects a trimmed value that is one over the limit", () => {
    expect(() => validateString("a".repeat(65), "title", 64)).toThrow("64 characters or fewer");
  });
});

// ── validateCurrencyConversion ────────────────────────────────────────────────

// Minimal currency map mirroring the production list (enough codes to test with)
const CURRENCY_MAP: Record<string, { code: string; name: string; symbol: string }> = {
  USD: { code: "USD", name: "US Dollar", symbol: "$" },
  EUR: { code: "EUR", name: "Euro", symbol: "€" },
  JPY: { code: "JPY", name: "Japanese Yen", symbol: "¥" },
  GBP: { code: "GBP", name: "British Pound", symbol: "£" },
};

function validateCurrencyConversion(body: Record<string, unknown>) {
  const raw = body.currencyConversion;
  if (raw == null) return undefined;
  if (typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("currencyConversion must be an object");
  }
  const cc = raw as Record<string, unknown>;
  const enabled = Boolean(cc.enabled);
  const billedCurrency = cc.billedCurrency;
  const homeCurrency = cc.homeCurrency;
  const exchangeRate = Number(cc.exchangeRate);
  if (typeof billedCurrency !== "string" || !CURRENCY_MAP[billedCurrency]) {
    throw new Error("currencyConversion.billedCurrency must be a valid 3-letter currency code");
  }
  if (typeof homeCurrency !== "string" || !CURRENCY_MAP[homeCurrency]) {
    throw new Error("currencyConversion.homeCurrency must be a valid 3-letter currency code");
  }
  if (!isFinite(exchangeRate) || exchangeRate <= 0) {
    throw new Error("currencyConversion.exchangeRate must be a positive number");
  }
  if (enabled && billedCurrency === homeCurrency) {
    throw new Error("currencyConversion.billedCurrency and homeCurrency must be different when conversion is enabled");
  }
  return { enabled, billedCurrency, homeCurrency, exchangeRate };
}

describe("validateCurrencyConversion", () => {
  it("returns undefined when currencyConversion is absent", () => {
    expect(validateCurrencyConversion({})).toBeUndefined();
  });

  it("returns undefined when currencyConversion is null", () => {
    expect(validateCurrencyConversion({ currencyConversion: null })).toBeUndefined();
  });

  it("accepts a valid enabled conversion", () => {
    const result = validateCurrencyConversion({
      currencyConversion: { enabled: true, billedCurrency: "JPY", homeCurrency: "USD", exchangeRate: 150 },
    });
    expect(result).toEqual({ enabled: true, billedCurrency: "JPY", homeCurrency: "USD", exchangeRate: 150 });
  });

  it("accepts a valid disabled conversion", () => {
    const result = validateCurrencyConversion({
      currencyConversion: { enabled: false, billedCurrency: "USD", homeCurrency: "USD", exchangeRate: 1 },
    });
    expect(result).toEqual({ enabled: false, billedCurrency: "USD", homeCurrency: "USD", exchangeRate: 1 });
  });

  it("coerces enabled to boolean", () => {
    const result = validateCurrencyConversion({
      currencyConversion: { enabled: 0, billedCurrency: "EUR", homeCurrency: "USD", exchangeRate: 0.92 },
    });
    expect(result!.enabled).toBe(false);
  });

  it("throws when currencyConversion is an array", () => {
    expect(() => validateCurrencyConversion({ currencyConversion: [] })).toThrow("must be an object");
  });

  it("throws when currencyConversion is a string", () => {
    expect(() => validateCurrencyConversion({ currencyConversion: "bad" })).toThrow("must be an object");
  });

  it("throws for unknown billedCurrency", () => {
    expect(() => validateCurrencyConversion({
      currencyConversion: { enabled: true, billedCurrency: "XYZ", homeCurrency: "USD", exchangeRate: 1 },
    })).toThrow("billedCurrency must be a valid 3-letter currency code");
  });

  it("throws for missing billedCurrency", () => {
    expect(() => validateCurrencyConversion({
      currencyConversion: { enabled: true, homeCurrency: "USD", exchangeRate: 1 },
    })).toThrow("billedCurrency must be a valid 3-letter currency code");
  });

  it("throws for unknown homeCurrency", () => {
    expect(() => validateCurrencyConversion({
      currencyConversion: { enabled: true, billedCurrency: "USD", homeCurrency: "ABC", exchangeRate: 1 },
    })).toThrow("homeCurrency must be a valid 3-letter currency code");
  });

  it("throws for missing homeCurrency", () => {
    expect(() => validateCurrencyConversion({
      currencyConversion: { enabled: true, billedCurrency: "USD", exchangeRate: 1 },
    })).toThrow("homeCurrency must be a valid 3-letter currency code");
  });

  it("throws for zero exchangeRate", () => {
    expect(() => validateCurrencyConversion({
      currencyConversion: { enabled: true, billedCurrency: "JPY", homeCurrency: "USD", exchangeRate: 0 },
    })).toThrow("exchangeRate must be a positive number");
  });

  it("throws for negative exchangeRate", () => {
    expect(() => validateCurrencyConversion({
      currencyConversion: { enabled: true, billedCurrency: "JPY", homeCurrency: "USD", exchangeRate: -10 },
    })).toThrow("exchangeRate must be a positive number");
  });

  it("throws for NaN exchangeRate", () => {
    expect(() => validateCurrencyConversion({
      currencyConversion: { enabled: true, billedCurrency: "JPY", homeCurrency: "USD", exchangeRate: NaN },
    })).toThrow("exchangeRate must be a positive number");
  });

  it("throws for non-numeric exchangeRate string", () => {
    expect(() => validateCurrencyConversion({
      currencyConversion: { enabled: true, billedCurrency: "JPY", homeCurrency: "USD", exchangeRate: "fast" },
    })).toThrow("exchangeRate must be a positive number");
  });

  it("throws when enabled and billedCurrency equals homeCurrency", () => {
    expect(() => validateCurrencyConversion({
      currencyConversion: { enabled: true, billedCurrency: "USD", homeCurrency: "USD", exchangeRate: 1 },
    })).toThrow("must be different when conversion is enabled");
  });

  it("allows same billedCurrency and homeCurrency when disabled", () => {
    const result = validateCurrencyConversion({
      currencyConversion: { enabled: false, billedCurrency: "USD", homeCurrency: "USD", exchangeRate: 1 },
    });
    expect(result!.billedCurrency).toBe("USD");
    expect(result!.homeCurrency).toBe("USD");
  });
});
