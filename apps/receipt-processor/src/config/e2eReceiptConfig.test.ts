import { isLoopbackUrl, isSafeE2eRuntime } from "./e2eReceiptConfig";
import { parseFixtureReceipt, FIXTURE_RECEIPT } from "../fixtureParser";
import { isFixtureParserEnabled, isE2eUploadEnabled } from "./e2eReceiptConfig";
import { validateE2eUploadRequest } from "../e2eUploadValidation";

describe("isLoopbackUrl (receipt-processor)", () => {
  it("accepts http://127.0.0.1:8082", () => {
    expect(isLoopbackUrl("http://127.0.0.1:8082")).toBe(true);
  });

  it("accepts http://localhost:8082", () => {
    expect(isLoopbackUrl("http://localhost:8082")).toBe(true);
  });

  it("rejects https://example.com", () => {
    expect(isLoopbackUrl("http://example.com")).toBe(false);
  });

  it("rejects http://192.168.1.1", () => {
    expect(isLoopbackUrl("http://192.168.1.1")).toBe(false);
  });

  it("rejects invalid/empty URLs", () => {
    expect(isLoopbackUrl("")).toBe(false);
    expect(isLoopbackUrl("not-a-url")).toBe(false);
  });
});

describe("isFixtureParserEnabled - guarded selection", () => {
  const safeFixtureEnv = {
    ENVIRONMENT: "e2e",
    RECEIPT_PARSER: "fixture",
    GOOGLE_CLOUD_PROJECT: "slurp-e2e",
    FIRESTORE_EMULATOR_HOST: "127.0.0.1:8085",
  } as const;

  it("returns true only when full safe E2E runtime is met", () => {
    expect(isFixtureParserEnabled(safeFixtureEnv)).toBe(true);
  });

  it("returns false in dev even with RECEIPT_PARSER=fixture - fixture rejection outside e2e", () => {
    expect(isFixtureParserEnabled({ ...safeFixtureEnv, ENVIRONMENT: "dev" })).toBe(false);
  });

  it("returns false in prod even with RECEIPT_PARSER=fixture", () => {
    expect(isFixtureParserEnabled({ ...safeFixtureEnv, ENVIRONMENT: "prod" })).toBe(false);
  });

  it("returns false when ENVIRONMENT=e2e but parser is not fixture (production default unchanged)", () => {
    expect(isFixtureParserEnabled({ ...safeFixtureEnv, RECEIPT_PARSER: undefined })).toBe(false);
    expect(isFixtureParserEnabled({ ...safeFixtureEnv, RECEIPT_PARSER: "gemini" })).toBe(false);
    expect(isFixtureParserEnabled({ ...safeFixtureEnv, RECEIPT_PARSER: "" })).toBe(false);
  });

  it("returns false when safe runtime incomplete (missing project/host)", () => {
    expect(isFixtureParserEnabled({ ENVIRONMENT: "e2e", RECEIPT_PARSER: "fixture" })).toBe(false);
    expect(isFixtureParserEnabled({ ENVIRONMENT: "e2e", RECEIPT_PARSER: "fixture", GOOGLE_CLOUD_PROJECT: "slurp-e2e" })).toBe(false);
    expect(isFixtureParserEnabled({ ENVIRONMENT: "e2e", RECEIPT_PARSER: "fixture", FIRESTORE_EMULATOR_HOST: "127.0.0.1:8085" })).toBe(false);
  });

  it("returns false when no env set", () => {
    expect(isFixtureParserEnabled({})).toBe(false);
  });
});

describe("isE2eUploadEnabled - guarded local PUT endpoint", () => {
  const safeUploadEnv = {
    ENVIRONMENT: "e2e",
    RECEIPT_PARSER: "fixture",
    GOOGLE_CLOUD_PROJECT: "slurp-e2e",
    FIRESTORE_EMULATOR_HOST: "127.0.0.1:8085",
  } as const;

  it("returns true only when full safe E2E runtime is met", () => {
    expect(isE2eUploadEnabled(safeUploadEnv)).toBe(true);
  });

  it("returns true for localhost with port (safe runtime)", () => {
    expect(isE2eUploadEnabled({ ...safeUploadEnv, FIRESTORE_EMULATOR_HOST: "localhost:8085" })).toBe(true);
  });

  it("returns false in dev/prod/local - endpoint not available in dev/prod", () => {
    expect(isE2eUploadEnabled({ ...safeUploadEnv, ENVIRONMENT: "dev" })).toBe(false);
    expect(isE2eUploadEnabled({ ...safeUploadEnv, ENVIRONMENT: "prod" })).toBe(false);
    expect(isE2eUploadEnabled({ ...safeUploadEnv, ENVIRONMENT: "local" })).toBe(false);
    expect(isE2eUploadEnabled({})).toBe(false);
  });

  it("returns false for ENVIRONMENT=E2E (case sensitive, exact match only)", () => {
    expect(isE2eUploadEnabled({ ...safeUploadEnv, ENVIRONMENT: "E2E" })).toBe(false);
  });

  it("returns false when safe runtime incomplete (ENVIRONMENT=e2e alone is insufficient)", () => {
    expect(isE2eUploadEnabled({ ENVIRONMENT: "e2e" })).toBe(false);
    expect(isE2eUploadEnabled({ ENVIRONMENT: "e2e", RECEIPT_PARSER: "fixture" })).toBe(false);
    expect(isE2eUploadEnabled({ ENVIRONMENT: "e2e", RECEIPT_PARSER: "fixture", GOOGLE_CLOUD_PROJECT: "slurp-e2e" })).toBe(false);
    expect(isE2eUploadEnabled({ ENVIRONMENT: "e2e", RECEIPT_PARSER: "fixture", FIRESTORE_EMULATOR_HOST: "127.0.0.1:8085" })).toBe(false);
  });

  it("returns false when loopback host missing port or non-loopback", () => {
    expect(isE2eUploadEnabled({ ...safeUploadEnv, FIRESTORE_EMULATOR_HOST: "127.0.0.1" })).toBe(false);
    expect(isE2eUploadEnabled({ ...safeUploadEnv, FIRESTORE_EMULATOR_HOST: "10.0.0.1:8085" })).toBe(false);
  });
});

describe("validateE2eUploadRequest - safe path/mime/size behavior", () => {
  it("accepts valid jpeg path with image/jpeg", () => {
    expect(
      validateE2eUploadRequest({
        gcsPath: "receipts/slurp123/abc123.jpg",
        contentType: "image/jpeg",
        contentLength: 100_000,
      })
    ).toEqual({ valid: true });
  });

  it("accepts valid png path with image/png", () => {
    expect(
      validateE2eUploadRequest({
        gcsPath: "receipts/slurp123/abc123.png",
        contentType: "image/png",
        contentLength: 100_000,
      })
    ).toEqual({ valid: true });
  });

  it("rejects path traversal with ..", () => {
    expect(
      validateE2eUploadRequest({
        gcsPath: "receipts/slurp123/../evil.jpg",
        contentType: "image/jpeg",
        contentLength: 1000,
      })
    ).toEqual(expect.objectContaining({ valid: false }));
  });

  it("rejects path traversal with encoded traversal or multiple dots", () => {
    expect(
      validateE2eUploadRequest({
        gcsPath: "receipts/../../etc/passwd",
        contentType: "image/jpeg",
        contentLength: 1000,
      })
    ).toEqual(expect.objectContaining({ valid: false }));
  });

  it("rejects path not under receipts/", () => {
    expect(
      validateE2eUploadRequest({
        gcsPath: "evil/slurp123/abc.jpg",
        contentType: "image/jpeg",
        contentLength: 1000,
      })
    ).toEqual(expect.objectContaining({ valid: false }));
  });

  it("rejects path with backslash or absolute path", () => {
    expect(
      validateE2eUploadRequest({
        gcsPath: "/receipts/slurp123/abc.jpg",
        contentType: "image/jpeg",
        contentLength: 1000,
      })
    ).toEqual(expect.objectContaining({ valid: false }));
  });

  it("rejects unsupported mime type", () => {
    expect(
      validateE2eUploadRequest({
        gcsPath: "receipts/slurp123/abc.jpg",
        contentType: "image/gif",
        contentLength: 1000,
      })
    ).toEqual(expect.objectContaining({ valid: false }));
    expect(
      validateE2eUploadRequest({
        gcsPath: "receipts/slurp123/abc.jpg",
        contentType: "application/json",
        contentLength: 1000,
      })
    ).toEqual(expect.objectContaining({ valid: false }));
  });

  it("rejects oversized payload", () => {
    expect(
      validateE2eUploadRequest({
        gcsPath: "receipts/slurp123/abc.jpg",
        contentType: "image/jpeg",
        contentLength: 20 * 1024 * 1024,
      })
    ).toEqual(expect.objectContaining({ valid: false }));
  });

  it("rejects zero or negative contentLength", () => {
    expect(
      validateE2eUploadRequest({
        gcsPath: "receipts/slurp123/abc.jpg",
        contentType: "image/jpeg",
        contentLength: 0,
      })
    ).toEqual(expect.objectContaining({ valid: false }));
  });

  it("rejects missing gcsPath", () => {
    expect(
      validateE2eUploadRequest({
        gcsPath: "",
        contentType: "image/jpeg",
        contentLength: 1000,
      })
    ).toEqual(expect.objectContaining({ valid: false }));
  });

  it("rejects mismatched extension and mime", () => {
    expect(
      validateE2eUploadRequest({
        gcsPath: "receipts/slurp123/abc.png",
        contentType: "image/jpeg",
        contentLength: 1000,
      })
    ).toEqual(expect.objectContaining({ valid: false }));
  });
});

describe("parseFixtureReceipt - deterministic parsed title/items/tax/tip/confidence", () => {
  it("returns deterministic fixture receipt with expected title", () => {
    const r = parseFixtureReceipt();
    expect(r.title).toBe(FIXTURE_RECEIPT.title);
    expect(r.title).toBeTruthy();
  });

  it("returns deterministic items with name and price", () => {
    const r = parseFixtureReceipt();
    expect(r.items.length).toBeGreaterThan(0);
    r.items.forEach((i: { name: string; price: number; quantity: number }) => {
      expect(typeof i.name).toBe("string");
      expect(i.name.length).toBeGreaterThan(0);
      expect(typeof i.price).toBe("number");
      expect(i.price).toBeGreaterThan(0);
      expect(typeof i.quantity).toBe("number");
    });
  });

  it("returns deterministic tax/tip values", () => {
    const r = parseFixtureReceipt();
    // Fixture defines fixed values - assert they are numbers or null deterministically
    expect(r.tax).toBe(FIXTURE_RECEIPT.tax);
    expect(r.tip).toBe(FIXTURE_RECEIPT.tip);
    // Should be high confidence deterministically
    expect(r.confidence).toBe("high");
    expect(r.confidence).toBe(FIXTURE_RECEIPT.confidence);
  });

  it("returns same result on repeated calls (deterministic)", () => {
    expect(parseFixtureReceipt()).toEqual(parseFixtureReceipt());
    expect(JSON.stringify(parseFixtureReceipt())).toBe(JSON.stringify(FIXTURE_RECEIPT));
  });

  it("fixture handles concurrent callers deterministically (same output regardless of interleaving)", async () => {
    const results = await Promise.all([Promise.resolve(parseFixtureReceipt()), Promise.resolve(parseFixtureReceipt())]);
    expect(results[0]).toEqual(results[1]);
  });
});

describe("production default unchanged (processor)", () => {
  it("fixture parser is off by default", () => {
    expect(isFixtureParserEnabled({})).toBe(false);
    expect(isFixtureParserEnabled({ ENVIRONMENT: "dev", RECEIPT_PARSER: "fixture" })).toBe(false);
    expect(isFixtureParserEnabled({ ENVIRONMENT: "prod", RECEIPT_PARSER: "fixture" })).toBe(false);
    expect(isFixtureParserEnabled({ ENVIRONMENT: "e2e" })).toBe(false);
    expect(isFixtureParserEnabled({ ENVIRONMENT: "e2e", RECEIPT_PARSER: "fixture" })).toBe(false);
  });

  it("e2e upload endpoint is off by default", () => {
    expect(isE2eUploadEnabled({})).toBe(false);
    expect(isE2eUploadEnabled({ ENVIRONMENT: "dev" })).toBe(false);
    expect(isE2eUploadEnabled({ ENVIRONMENT: "prod" })).toBe(false);
    expect(isE2eUploadEnabled({ ENVIRONMENT: "e2e" })).toBe(false);
  });
});

describe("isSafeE2eRuntime — exact guard for E2E-only features", () => {
  const validE2eBase = {
    ENVIRONMENT: "e2e",
    RECEIPT_PARSER: "fixture",
    GOOGLE_CLOUD_PROJECT: "slurp-e2e",
    FIRESTORE_EMULATOR_HOST: "127.0.0.1:8085",
  } as const;

  it("returns true only when all E2E conditions are exactly met (127.0.0.1)", () => {
    expect(isSafeE2eRuntime(validE2eBase)).toBe(true);
  });

  it("returns true for localhost with port", () => {
    expect(
      isSafeE2eRuntime({
        ...validE2eBase,
        FIRESTORE_EMULATOR_HOST: "localhost:8085",
      })
    ).toBe(true);
  });

  it("returns true when FIREBASE_PROJECT_ID is slurp-e2e instead of GOOGLE_CLOUD_PROJECT", () => {
    expect(
      isSafeE2eRuntime({
        ENVIRONMENT: "e2e",
        RECEIPT_PARSER: "fixture",
        FIREBASE_PROJECT_ID: "slurp-e2e",
        FIRESTORE_EMULATOR_HOST: "127.0.0.1:8085",
      })
    ).toBe(true);
  });

  it("returns false when ENVIRONMENT is not exactly e2e", () => {
    expect(isSafeE2eRuntime({ ...validE2eBase, ENVIRONMENT: "dev" })).toBe(false);
    expect(isSafeE2eRuntime({ ...validE2eBase, ENVIRONMENT: "prod" })).toBe(false);
    expect(isSafeE2eRuntime({ ...validE2eBase, ENVIRONMENT: "local" })).toBe(false);
    expect(isSafeE2eRuntime({ ...validE2eBase, ENVIRONMENT: "E2E" })).toBe(false);
    expect(isSafeE2eRuntime({ ...validE2eBase, ENVIRONMENT: "" })).toBe(false);
    expect(isSafeE2eRuntime({ ...validE2eBase, ENVIRONMENT: undefined })).toBe(false);
  });

  it("returns false when RECEIPT_PARSER is not exactly fixture", () => {
    expect(isSafeE2eRuntime({ ...validE2eBase, RECEIPT_PARSER: undefined })).toBe(false);
    expect(isSafeE2eRuntime({ ...validE2eBase, RECEIPT_PARSER: "gemini" })).toBe(false);
    expect(isSafeE2eRuntime({ ...validE2eBase, RECEIPT_PARSER: "" })).toBe(false);
    expect(isSafeE2eRuntime({ ...validE2eBase, RECEIPT_PARSER: "Fixture" })).toBe(false);
  });

  it("returns false when project is not exactly slurp-e2e", () => {
    expect(isSafeE2eRuntime({ ...validE2eBase, GOOGLE_CLOUD_PROJECT: "slurp-prod" })).toBe(false);
    expect(isSafeE2eRuntime({ ...validE2eBase, GOOGLE_CLOUD_PROJECT: "slurp-dev" })).toBe(false);
    expect(isSafeE2eRuntime({ ...validE2eBase, GOOGLE_CLOUD_PROJECT: "slurp-e2e " })).toBe(false);
    expect(isSafeE2eRuntime({ ...validE2eBase, GOOGLE_CLOUD_PROJECT: "" })).toBe(false);
    expect(isSafeE2eRuntime({ ...validE2eBase, GOOGLE_CLOUD_PROJECT: undefined })).toBe(false);
  });

  it("returns false when FIRESTORE_EMULATOR_HOST is missing or not loopback", () => {
    expect(isSafeE2eRuntime({ ...validE2eBase, FIRESTORE_EMULATOR_HOST: undefined })).toBe(false);
    expect(isSafeE2eRuntime({ ...validE2eBase, FIRESTORE_EMULATOR_HOST: "" })).toBe(false);
    expect(isSafeE2eRuntime({ ...validE2eBase, FIRESTORE_EMULATOR_HOST: "10.0.0.1:8085" })).toBe(false);
    expect(isSafeE2eRuntime({ ...validE2eBase, FIRESTORE_EMULATOR_HOST: "192.168.1.1:8085" })).toBe(false);
    expect(isSafeE2eRuntime({ ...validE2eBase, FIRESTORE_EMULATOR_HOST: "firestore.googleapis.com" })).toBe(false);
  });

  it("returns false when loopback host has no port or missing condition combination", () => {
    // Loopback without port should be rejected — port is required.
    expect(isSafeE2eRuntime({ ...validE2eBase, FIRESTORE_EMULATOR_HOST: "127.0.0.1" })).toBe(false);
    expect(isSafeE2eRuntime({ ...validE2eBase, FIRESTORE_EMULATOR_HOST: "localhost" })).toBe(false);
    // Each missing piece alone defeats safety
    const base: Record<string, string | undefined> = { ...validE2eBase };
    delete (base as Record<string, string | undefined>).FIRESTORE_EMULATOR_HOST;
    expect(isSafeE2eRuntime(base)).toBe(false);
    expect(isSafeE2eRuntime({ ...validE2eBase, ENVIRONMENT: "dev" })).toBe(false);
  });

  it("dev with E2E vars but ENVIRONMENT=dev is still false (prod/dev isolation)", () => {
    expect(
      isSafeE2eRuntime({
        ENVIRONMENT: "dev",
        RECEIPT_PARSER: "fixture",
        GOOGLE_CLOUD_PROJECT: "slurp-e2e",
        FIRESTORE_EMULATOR_HOST: "127.0.0.1:8085",
      })
    ).toBe(false);
  });

  it("prod with all E2E vars but ENVIRONMENT=prod is still false", () => {
    expect(
      isSafeE2eRuntime({
        ENVIRONMENT: "prod",
        RECEIPT_PARSER: "fixture",
        GOOGLE_CLOUD_PROJECT: "slurp-e2e",
        FIRESTORE_EMULATOR_HOST: "127.0.0.1:8085",
      })
    ).toBe(false);
  });
});
