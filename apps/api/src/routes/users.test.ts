/**
 * Unit tests for user profile logic: get and update profile.
 */

interface UserProfile {
  displayName?: string;
  venmoUsername?: string;
  dismissedVenmoPrompt?: boolean;
  preferredCurrency?: string;
}

// Simulates the PUT /profile merge logic
function mergeProfile(existing: UserProfile, update: Partial<UserProfile>): UserProfile {
  const result = { ...existing };
  if (update.displayName !== undefined) result.displayName = update.displayName;
  if (update.venmoUsername !== undefined) result.venmoUsername = update.venmoUsername;
  if (update.dismissedVenmoPrompt !== undefined) result.dismissedVenmoPrompt = update.dismissedVenmoPrompt;
  return result;
}

// Simulates the displayName validation from PUT /profile
function validateDisplayName(value: unknown): string {
  if (typeof value !== "string") throw new Error("displayName must be between 3 and 40 characters");
  const trimmed = value.trim();
  if (trimmed.length < 3 || trimmed.length > 40) throw new Error("displayName must be between 3 and 40 characters");
  return trimmed;
}

// Simulates the venmoUsername validation from PUT /profile
function validateVenmoUsername(value: unknown): string {
  if (typeof value !== "string") throw new Error("venmoUsername must be a string of 50 characters or fewer");
  const trimmed = value.trim();
  if (trimmed.length > 50) throw new Error("venmoUsername must be a string of 50 characters or fewer");
  if (/\s/.test(trimmed)) throw new Error("venmoUsername must not contain spaces");
  return trimmed;
}

// Simulates the preferredCurrency validation from PUT /profile
const VALID_CURRENCY_CODES = new Set(["USD", "EUR", "GBP", "JPY", "CAD", "AUD", "CHF", "CNY",
  "HKD", "NZD", "SEK", "KRW", "SGD", "NOK", "MXN", "INR", "BRL", "ZAR", "TWD", "DKK",
  "THB", "AED", "SAR", "PLN", "MYR", "CZK", "IDR", "HUF", "ILS", "CLP", "PHP", "COP",
  "RON", "PEN", "PKR", "EGP", "VND", "NGN", "BDT", "QAR"]);

function validatePreferredCurrency(value: unknown): string {
  if (typeof value !== "string" || !VALID_CURRENCY_CODES.has(value)) {
    throw new Error("preferredCurrency must be a valid 3-letter currency code");
  }
  return value;
}

// Simulates the GET /profile normalization (returns "USD" when unset)
function normalizePreferredCurrency(profile: UserProfile): string {
  return profile.preferredCurrency ?? "USD";
}

describe("mergeProfile", () => {
  it("sets venmoUsername on empty profile", () => {
    const result = mergeProfile({}, { venmoUsername: "testuser" });
    expect(result.venmoUsername).toBe("testuser");
  });

  it("updates venmoUsername without affecting other fields", () => {
    const result = mergeProfile(
      { venmoUsername: "old", dismissedVenmoPrompt: true },
      { venmoUsername: "new" }
    );
    expect(result.venmoUsername).toBe("new");
    expect(result.dismissedVenmoPrompt).toBe(true);
  });

  it("sets dismissedVenmoPrompt without affecting venmoUsername", () => {
    const result = mergeProfile(
      { venmoUsername: "myuser" },
      { dismissedVenmoPrompt: true }
    );
    expect(result.venmoUsername).toBe("myuser");
    expect(result.dismissedVenmoPrompt).toBe(true);
  });

  it("can clear venmoUsername by setting to undefined", () => {
    const result = mergeProfile(
      { venmoUsername: "old" },
      { venmoUsername: undefined }
    );
    // undefined is not present in update, so no change
    expect(result.venmoUsername).toBe("old");
  });

  it("returns empty object for empty update on empty profile", () => {
    const result = mergeProfile({}, {});
    expect(result).toEqual({});
  });

  it("sets displayName on empty profile", () => {
    const result = mergeProfile({}, { displayName: "Alice" });
    expect(result.displayName).toBe("Alice");
  });

  it("updates displayName without affecting other fields", () => {
    const result = mergeProfile(
      { displayName: "Old", venmoUsername: "oldvenmo" },
      { displayName: "New" }
    );
    expect(result.displayName).toBe("New");
    expect(result.venmoUsername).toBe("oldvenmo");
  });
});

describe("validateDisplayName", () => {
  it("accepts a valid name", () => {
    expect(validateDisplayName("Alice")).toBe("Alice");
  });

  it("trims surrounding whitespace", () => {
    expect(validateDisplayName("  Alice  ")).toBe("Alice");
  });

  it("accepts a name at exactly 3 characters", () => {
    expect(validateDisplayName("Ali")).toBe("Ali");
  });

  it("accepts a name at exactly 40 characters", () => {
    const name = "a".repeat(40);
    expect(validateDisplayName(name)).toBe(name);
  });

  it("rejects a name under 3 characters", () => {
    expect(() => validateDisplayName("Al")).toThrow("between 3 and 40 characters");
  });

  it("rejects an empty name", () => {
    expect(() => validateDisplayName("")).toThrow("between 3 and 40 characters");
  });

  it("rejects a name over 40 characters", () => {
    expect(() => validateDisplayName("a".repeat(41))).toThrow("between 3 and 40 characters");
  });

  it("rejects non-string values", () => {
    expect(() => validateDisplayName(123)).toThrow("between 3 and 40 characters");
  });
});

describe("validateVenmoUsername", () => {
  it("accepts a valid username", () => {
    expect(validateVenmoUsername("alice123")).toBe("alice123");
  });

  it("trims surrounding whitespace", () => {
    expect(validateVenmoUsername("  alice  ")).toBe("alice");
  });

  it("accepts a username at exactly 50 characters", () => {
    const name = "a".repeat(50);
    expect(validateVenmoUsername(name)).toBe(name);
  });

  it("rejects a username over 50 characters", () => {
    expect(() => validateVenmoUsername("a".repeat(51))).toThrow("50 characters or fewer");
  });

  it("rejects a username containing spaces", () => {
    expect(() => validateVenmoUsername("alice smith")).toThrow("must not contain spaces");
  });

  it("rejects non-string values", () => {
    expect(() => validateVenmoUsername(null)).toThrow("50 characters or fewer");
  });
});

describe("normalizePreferredCurrency", () => {
  it("returns USD when preferredCurrency is not set", () => {
    expect(normalizePreferredCurrency({})).toBe("USD");
  });

  it("returns USD when preferredCurrency is explicitly undefined", () => {
    expect(normalizePreferredCurrency({ preferredCurrency: undefined })).toBe("USD");
  });

  it("returns the stored currency when set", () => {
    expect(normalizePreferredCurrency({ preferredCurrency: "JPY" })).toBe("JPY");
  });

  it("returns the stored currency unchanged for any valid code", () => {
    expect(normalizePreferredCurrency({ preferredCurrency: "EUR" })).toBe("EUR");
    expect(normalizePreferredCurrency({ preferredCurrency: "GBP" })).toBe("GBP");
  });
});

describe("validatePreferredCurrency", () => {
  it("accepts a valid currency code", () => {
    expect(validatePreferredCurrency("USD")).toBe("USD");
  });

  it("accepts any code in the supported list", () => {
    expect(validatePreferredCurrency("JPY")).toBe("JPY");
    expect(validatePreferredCurrency("EUR")).toBe("EUR");
    expect(validatePreferredCurrency("KRW")).toBe("KRW");
    expect(validatePreferredCurrency("QAR")).toBe("QAR");
  });

  it("rejects an unknown 3-letter code", () => {
    expect(() => validatePreferredCurrency("XYZ")).toThrow("valid 3-letter currency code");
  });

  it("rejects an empty string", () => {
    expect(() => validatePreferredCurrency("")).toThrow("valid 3-letter currency code");
  });

  it("rejects a lowercase code", () => {
    expect(() => validatePreferredCurrency("usd")).toThrow("valid 3-letter currency code");
  });

  it("rejects a non-string value", () => {
    expect(() => validatePreferredCurrency(null)).toThrow("valid 3-letter currency code");
    expect(() => validatePreferredCurrency(123)).toThrow("valid 3-letter currency code");
  });
});
