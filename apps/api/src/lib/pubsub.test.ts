import { resolveReceiptProcessorUrl } from "./pubsub";

// Helper to build env for resolver tests
const safeE2eEnv = {
  ENVIRONMENT: "e2e" as const,
  RECEIPT_PARSER: "fixture" as const,
  GOOGLE_CLOUD_PROJECT: "slurp-e2e",
  FIRESTORE_EMULATOR_HOST: "127.0.0.1:8085",
};

describe("resolveReceiptProcessorUrl - direct POST guard", () => {
  it("returns undefined when RECEIPT_PROCESSOR_URL is absent (Pub/Sub production default)", () => {
    expect(resolveReceiptProcessorUrl({})).toBeUndefined();
    expect(resolveReceiptProcessorUrl({ ENVIRONMENT: "prod" })).toBeUndefined();
    expect(resolveReceiptProcessorUrl({ ENVIRONMENT: "dev" })).toBeUndefined();
    expect(resolveReceiptProcessorUrl({ ENVIRONMENT: "local" })).toBeUndefined();
    expect(resolveReceiptProcessorUrl({ ENVIRONMENT: "e2e", RECEIPT_PARSER: "fixture", GOOGLE_CLOUD_PROJECT: "slurp-e2e", FIRESTORE_EMULATOR_HOST: "127.0.0.1:8085" })).toBeUndefined();
  });

  it("returns undefined when URL is empty or whitespace (Pub/Sub default)", () => {
    expect(resolveReceiptProcessorUrl({ ENVIRONMENT: "dev", RECEIPT_PROCESSOR_URL: "" })).toBeUndefined();
    expect(resolveReceiptProcessorUrl({ ENVIRONMENT: "dev", RECEIPT_PROCESSOR_URL: "   " })).toBeUndefined();
  });

  it("permits ENVIRONMENT=local with canonical HTTP loopback", () => {
    expect(resolveReceiptProcessorUrl({ ENVIRONMENT: "local", RECEIPT_PROCESSOR_URL: "http://127.0.0.1:8081" })).toBe("http://127.0.0.1:8081");
    expect(resolveReceiptProcessorUrl({ ENVIRONMENT: "local", RECEIPT_PROCESSOR_URL: "http://localhost:8081" })).toBe("http://localhost:8081");
    expect(resolveReceiptProcessorUrl({ ENVIRONMENT: "local", RECEIPT_PROCESSOR_URL: "http://127.0.0.1:8081/" })).toBe("http://127.0.0.1:8081");
  });

  it("permits ENVIRONMENT=dev with canonical HTTP loopback", () => {
    expect(resolveReceiptProcessorUrl({ ENVIRONMENT: "dev", RECEIPT_PROCESSOR_URL: "http://127.0.0.1:8081" })).toBe("http://127.0.0.1:8081");
    expect(resolveReceiptProcessorUrl({ ENVIRONMENT: "dev", RECEIPT_PROCESSOR_URL: "http://localhost:8081" })).toBe("http://localhost:8081");
  });

  it("permits ENVIRONMENT=e2e only when same safe E2E invariants hold", () => {
    expect(
      resolveReceiptProcessorUrl({
        ...safeE2eEnv,
        RECEIPT_PROCESSOR_URL: "http://127.0.0.1:8082",
      })
    ).toBe("http://127.0.0.1:8082");
    expect(
      resolveReceiptProcessorUrl({
        ...safeE2eEnv,
        FIRESTORE_EMULATOR_HOST: "localhost:8085",
        RECEIPT_PROCESSOR_URL: "http://localhost:8082",
      })
    ).toBe("http://localhost:8082");
  });

  it("throws for ENVIRONMENT=e2e with loopback URL but unsafe runtime (verifies no exfiltration to arbitrary endpoint)", () => {
    expect(() =>
      resolveReceiptProcessorUrl({
        ENVIRONMENT: "e2e",
        RECEIPT_PROCESSOR_URL: "http://127.0.0.1:8082",
      })
    ).toThrow();
    expect(() =>
      resolveReceiptProcessorUrl({
        ENVIRONMENT: "e2e",
        RECEIPT_PARSER: "fixture",
        GOOGLE_CLOUD_PROJECT: "slurp-prod",
        FIRESTORE_EMULATOR_HOST: "127.0.0.1:8085",
        RECEIPT_PROCESSOR_URL: "http://127.0.0.1:8082",
      })
    ).toThrow();
    expect(() =>
      resolveReceiptProcessorUrl({
        ENVIRONMENT: "e2e",
        RECEIPT_PARSER: "fixture",
        GOOGLE_CLOUD_PROJECT: "slurp-e2e",
        FIRESTORE_EMULATOR_HOST: "127.0.0.1",
        RECEIPT_PROCESSOR_URL: "http://127.0.0.1:8082",
      })
    ).toThrow();
    expect(() =>
      resolveReceiptProcessorUrl({
        ENVIRONMENT: "e2e",
        RECEIPT_PARSER: "gemini",
        GOOGLE_CLOUD_PROJECT: "slurp-e2e",
        FIRESTORE_EMULATOR_HOST: "127.0.0.1:8085",
        RECEIPT_PROCESSOR_URL: "http://127.0.0.1:8082",
      })
    ).toThrow();
  });

  it("throws for ENVIRONMENT=e2e with ambiguous project config", () => {
    expect(() =>
      resolveReceiptProcessorUrl({
        ENVIRONMENT: "e2e",
        RECEIPT_PARSER: "fixture",
        GOOGLE_CLOUD_PROJECT: "slurp-e2e",
        FIREBASE_PROJECT_ID: "slurp-prod",
        FIRESTORE_EMULATOR_HOST: "127.0.0.1:8085",
        RECEIPT_PROCESSOR_URL: "http://127.0.0.1:8082",
      })
    ).toThrow();
  });

  it("throws when ENVIRONMENT=prod even with loopback URL (prod must use Pub/Sub)", () => {
    expect(() =>
      resolveReceiptProcessorUrl({ ENVIRONMENT: "prod", RECEIPT_PROCESSOR_URL: "http://127.0.0.1:8081" })
    ).toThrow();
  });

  it("throws when ENVIRONMENT is missing (undefined) with loopback URL - no default to dev/local", () => {
    expect(() => resolveReceiptProcessorUrl({ RECEIPT_PROCESSOR_URL: "http://127.0.0.1:8081" })).toThrow();
    expect(() => resolveReceiptProcessorUrl({ ENVIRONMENT: undefined, RECEIPT_PROCESSOR_URL: "http://127.0.0.1:8081" })).toThrow();
  });

  it("throws for unknown ENVIRONMENT values", () => {
    expect(() => resolveReceiptProcessorUrl({ ENVIRONMENT: "staging", RECEIPT_PROCESSOR_URL: "http://127.0.0.1:8081" })).toThrow();
    expect(() => resolveReceiptProcessorUrl({ ENVIRONMENT: "LOCAL", RECEIPT_PROCESSOR_URL: "http://127.0.0.1:8081" })).toThrow();
    expect(() => resolveReceiptProcessorUrl({ ENVIRONMENT: "Dev", RECEIPT_PROCESSOR_URL: "http://127.0.0.1:8081" })).toThrow();
    expect(() => resolveReceiptProcessorUrl({ ENVIRONMENT: "E2E", RECEIPT_PROCESSOR_URL: "http://127.0.0.1:8081" })).toThrow();
    expect(() => resolveReceiptProcessorUrl({ ENVIRONMENT: "", RECEIPT_PROCESSOR_URL: "http://127.0.0.1:8081" })).toThrow();
  });

  it("throws for non-loopback URLs even in dev/local/e2e-safe (verifies no arbitrary endpoint can receive slurpId/gcsPath)", () => {
    expect(() => resolveReceiptProcessorUrl({ ENVIRONMENT: "dev", RECEIPT_PROCESSOR_URL: "http://example.com" })).toThrow();
    expect(() => resolveReceiptProcessorUrl({ ENVIRONMENT: "local", RECEIPT_PROCESSOR_URL: "http://example.com" })).toThrow();
    expect(() => resolveReceiptProcessorUrl({ ENVIRONMENT: "dev", RECEIPT_PROCESSOR_URL: "http://192.168.1.10:8081" })).toThrow();
    expect(() => resolveReceiptProcessorUrl({ ENVIRONMENT: "dev", RECEIPT_PROCESSOR_URL: "http://10.0.0.1:8081" })).toThrow();
    expect(() =>
      resolveReceiptProcessorUrl({ ...safeE2eEnv, RECEIPT_PROCESSOR_URL: "http://example.com" })
    ).toThrow();
  });

  it("throws for HTTPS loopback URLs (must be http:)", () => {
    expect(() => resolveReceiptProcessorUrl({ ENVIRONMENT: "dev", RECEIPT_PROCESSOR_URL: "https://127.0.0.1:8081" })).toThrow();
    expect(() => resolveReceiptProcessorUrl({ ENVIRONMENT: "local", RECEIPT_PROCESSOR_URL: "https://localhost:8081" })).toThrow();
    expect(() =>
      resolveReceiptProcessorUrl({ ...safeE2eEnv, RECEIPT_PROCESSOR_URL: "https://127.0.0.1:8082" })
    ).toThrow();
  });

  it("throws for credentialed URLs (username/password) even when loopback", () => {
    expect(() =>
      resolveReceiptProcessorUrl({ ENVIRONMENT: "dev", RECEIPT_PROCESSOR_URL: "http://user:pass@127.0.0.1:8081" })
    ).toThrow();
    expect(() =>
      resolveReceiptProcessorUrl({ ENVIRONMENT: "local", RECEIPT_PROCESSOR_URL: "http://user@127.0.0.1:8081" })
    ).toThrow();
    expect(() =>
      resolveReceiptProcessorUrl({ ENVIRONMENT: "dev", RECEIPT_PROCESSOR_URL: "http://user:pass@localhost:8081" })
    ).toThrow();
  });

  it("throws for invalid URLs", () => {
    expect(() => resolveReceiptProcessorUrl({ ENVIRONMENT: "dev", RECEIPT_PROCESSOR_URL: "not-a-url" })).toThrow();
    expect(() => resolveReceiptProcessorUrl({ ENVIRONMENT: "dev", RECEIPT_PROCESSOR_URL: "http://[::1]:8081" })).toThrow();
  });

  it("trims whitespace and normalizes trailing slash", () => {
    expect(
      resolveReceiptProcessorUrl({ ENVIRONMENT: "dev", RECEIPT_PROCESSOR_URL: "  http://127.0.0.1:8081/  " })
    ).toBe("http://127.0.0.1:8081");
  });
});
