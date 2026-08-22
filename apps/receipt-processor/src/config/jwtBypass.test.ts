import { shouldBypassJwtVerification } from "./jwtBypass";

const safeE2eEnv = {
  ENVIRONMENT: "e2e" as const,
  RECEIPT_PARSER: "fixture" as const,
  GOOGLE_CLOUD_PROJECT: "slurp-e2e",
  FIRESTORE_EMULATOR_HOST: "127.0.0.1:8085",
};

describe("shouldBypassJwtVerification - legacy local + safe e2e only", () => {
  it("returns false when ENVIRONMENT is missing (requires JWT verification)", () => {
    expect(shouldBypassJwtVerification({})).toBe(false);
    expect(shouldBypassJwtVerification({ ENVIRONMENT: undefined })).toBe(false);
    expect(shouldBypassJwtVerification({ RECEIPT_PARSER: "fixture", GOOGLE_CLOUD_PROJECT: "slurp-e2e", FIRESTORE_EMULATOR_HOST: "127.0.0.1:8085" })).toBe(false);
  });

  it("returns false for dev and prod (requires JWT verification)", () => {
    expect(shouldBypassJwtVerification({ ENVIRONMENT: "dev" })).toBe(false);
    expect(shouldBypassJwtVerification({ ENVIRONMENT: "prod" })).toBe(false);
    expect(
      shouldBypassJwtVerification({
        ENVIRONMENT: "dev",
        RECEIPT_PARSER: "fixture",
        GOOGLE_CLOUD_PROJECT: "slurp-e2e",
        FIRESTORE_EMULATOR_HOST: "127.0.0.1:8085",
      })
    ).toBe(false);
    expect(
      shouldBypassJwtVerification({
        ENVIRONMENT: "prod",
        RECEIPT_PARSER: "fixture",
        GOOGLE_CLOUD_PROJECT: "slurp-e2e",
        FIRESTORE_EMULATOR_HOST: "127.0.0.1:8085",
      })
    ).toBe(false);
  });

  it("returns false for unknown or non-exact ENVIRONMENT", () => {
    expect(shouldBypassJwtVerification({ ENVIRONMENT: "staging" })).toBe(false);
    expect(shouldBypassJwtVerification({ ENVIRONMENT: "LOCAL" })).toBe(false);
    expect(shouldBypassJwtVerification({ ENVIRONMENT: "Local" })).toBe(false);
    expect(shouldBypassJwtVerification({ ENVIRONMENT: "E2E" })).toBe(false);
    expect(shouldBypassJwtVerification({ ENVIRONMENT: "" })).toBe(false);
  });

  it("returns true only for exact ENVIRONMENT=local (legacy local bypass)", () => {
    expect(shouldBypassJwtVerification({ ENVIRONMENT: "local" })).toBe(true);
    expect(shouldBypassJwtVerification({ ENVIRONMENT: "local", RECEIPT_PARSER: "fixture" })).toBe(true);
  });

  it("returns true for e2e-safe runtime (fixture parser, slurp-e2e project, loopback emulator)", () => {
    expect(shouldBypassJwtVerification(safeE2eEnv)).toBe(true);
    expect(shouldBypassJwtVerification({ ...safeE2eEnv, FIRESTORE_EMULATOR_HOST: "localhost:8085" })).toBe(true);
    expect(
      shouldBypassJwtVerification({
        ENVIRONMENT: "e2e",
        RECEIPT_PARSER: "fixture",
        FIREBASE_PROJECT_ID: "slurp-e2e",
        FIRESTORE_EMULATOR_HOST: "127.0.0.1:8085",
      })
    ).toBe(true);
  });

  it("returns false for e2e-unsafe (ENVIRONMENT=e2e alone or incomplete safe runtime)", () => {
    expect(shouldBypassJwtVerification({ ENVIRONMENT: "e2e" })).toBe(false);
    expect(shouldBypassJwtVerification({ ENVIRONMENT: "e2e", RECEIPT_PARSER: "fixture" })).toBe(false);
    expect(
      shouldBypassJwtVerification({ ENVIRONMENT: "e2e", RECEIPT_PARSER: "fixture", GOOGLE_CLOUD_PROJECT: "slurp-e2e" })
    ).toBe(false);
    expect(
      shouldBypassJwtVerification({
        ENVIRONMENT: "e2e",
        RECEIPT_PARSER: "fixture",
        GOOGLE_CLOUD_PROJECT: "slurp-prod",
        FIRESTORE_EMULATOR_HOST: "127.0.0.1:8085",
      })
    ).toBe(false);
    expect(
      shouldBypassJwtVerification({
        ENVIRONMENT: "e2e",
        RECEIPT_PARSER: "fixture",
        GOOGLE_CLOUD_PROJECT: "slurp-e2e",
        FIRESTORE_EMULATOR_HOST: "127.0.0.1",
      })
    ).toBe(false);
    expect(
      shouldBypassJwtVerification({
        ENVIRONMENT: "e2e",
        RECEIPT_PARSER: "gemini",
        GOOGLE_CLOUD_PROJECT: "slurp-e2e",
        FIRESTORE_EMULATOR_HOST: "127.0.0.1:8085",
      })
    ).toBe(false);
    expect(
      shouldBypassJwtVerification({
        ENVIRONMENT: "e2e",
        RECEIPT_PARSER: "fixture",
        GOOGLE_CLOUD_PROJECT: "slurp-e2e",
        FIREBASE_PROJECT_ID: "slurp-prod",
        FIRESTORE_EMULATOR_HOST: "127.0.0.1:8085",
      })
    ).toBe(false);
  });
});
