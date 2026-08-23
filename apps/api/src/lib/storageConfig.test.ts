import { isLoopbackUrl, isSafeE2eRuntime, resolveE2eUploadBaseUrl } from "./storageConfig";

describe("isLoopbackUrl", () => {
  it("accepts http://127.0.0.1:8082 as loopback", () => {
    expect(isLoopbackUrl("http://127.0.0.1:8082")).toBe(true);
  });

  it("accepts http://127.0.0.1 with no port as loopback", () => {
    expect(isLoopbackUrl("http://127.0.0.1")).toBe(true);
  });

  it("accepts http://localhost:8082 as loopback", () => {
    expect(isLoopbackUrl("http://localhost:8082")).toBe(true);
  });

  it("accepts http://127.0.0.1:8082 with path as loopback", () => {
    expect(isLoopbackUrl("http://127.0.0.1:8082/some/path")).toBe(true);
  });

  it("rejects https://example.com as non-loopback", () => {
    expect(isLoopbackUrl("http://example.com")).toBe(false);
  });

  it("rejects http://192.168.1.10 as non-loopback", () => {
    expect(isLoopbackUrl("http://192.168.1.10")).toBe(false);
  });

  it("rejects http://10.0.0.1 as non-loopback", () => {
    expect(isLoopbackUrl("http://10.0.0.1")).toBe(false);
  });

  it("rejects empty and invalid URLs", () => {
    expect(isLoopbackUrl("")).toBe(false);
    expect(isLoopbackUrl("not-a-url")).toBe(false);
  });
});

describe("resolveE2eUploadBaseUrl", () => {
  const safeEnv = {
    ENVIRONMENT: "e2e" as const,
    RECEIPT_PARSER: "fixture" as const,
    GOOGLE_CLOUD_PROJECT: "slurp-e2e",
    FIRESTORE_EMULATOR_HOST: "127.0.0.1:8085",
  };

  it("returns base url when safe E2E runtime and loopback URL are set", () => {
    expect(
      resolveE2eUploadBaseUrl({
        ...safeEnv,
        E2E_RECEIPT_UPLOAD_BASE_URL: "http://127.0.0.1:8082",
      })
    ).toBe("http://127.0.0.1:8082");
  });

  it("returns base url for localhost loopback in safe e2e runtime", () => {
    expect(
      resolveE2eUploadBaseUrl({
        ...safeEnv,
        E2E_RECEIPT_UPLOAD_BASE_URL: "http://localhost:8082",
      })
    ).toBe("http://localhost:8082");
  });

  it("returns undefined when E2E var not set (production default unchanged, uses GCS)", () => {
    expect(resolveE2eUploadBaseUrl({ ENVIRONMENT: "e2e" })).toBeUndefined();
    expect(resolveE2eUploadBaseUrl({ ENVIRONMENT: "dev" })).toBeUndefined();
    expect(resolveE2eUploadBaseUrl({ ENVIRONMENT: "prod" })).toBeUndefined();
    expect(resolveE2eUploadBaseUrl({})).toBeUndefined();
  });

  it("returns undefined (or throws) and does not use loopback when ENVIRONMENT=dev even with loopback var - dev rejection", () => {
    // Should not return loopback URL in dev - production GCS must be used
    expect(() =>
      resolveE2eUploadBaseUrl({
        ENVIRONMENT: "dev",
        E2E_RECEIPT_UPLOAD_BASE_URL: "http://127.0.0.1:8082",
      })
    ).toThrow();
  });

  it("rejects when ENVIRONMENT=prod even with loopback var - prod rejection", () => {
    expect(() =>
      resolveE2eUploadBaseUrl({
        ENVIRONMENT: "prod",
        E2E_RECEIPT_UPLOAD_BASE_URL: "http://127.0.0.1:8082",
      })
    ).toThrow();
  });

  it("rejects when ENVIRONMENT=e2e but safe runtime incomplete (missing RECEIPT_PARSER)", () => {
    expect(() =>
      resolveE2eUploadBaseUrl({
        ENVIRONMENT: "e2e",
        E2E_RECEIPT_UPLOAD_BASE_URL: "http://127.0.0.1:8082",
      })
    ).toThrow();
  });

  it("rejects when ENVIRONMENT=e2e + RECEIPT_PARSER=fixture but wrong project", () => {
    expect(() =>
      resolveE2eUploadBaseUrl({
        ENVIRONMENT: "e2e",
        RECEIPT_PARSER: "fixture",
        GOOGLE_CLOUD_PROJECT: "slurp-prod",
        FIRESTORE_EMULATOR_HOST: "127.0.0.1:8085",
        E2E_RECEIPT_UPLOAD_BASE_URL: "http://127.0.0.1:8082",
      })
    ).toThrow();
  });

  it("rejects when ENVIRONMENT=e2e + fixture but FIRESTORE_EMULATOR_HOST not loopback with port", () => {
    expect(() =>
      resolveE2eUploadBaseUrl({
        ENVIRONMENT: "e2e",
        RECEIPT_PARSER: "fixture",
        GOOGLE_CLOUD_PROJECT: "slurp-e2e",
        FIRESTORE_EMULATOR_HOST: "10.0.0.1:8085",
        E2E_RECEIPT_UPLOAD_BASE_URL: "http://127.0.0.1:8082",
      })
    ).toThrow();
    expect(() =>
      resolveE2eUploadBaseUrl({
        ENVIRONMENT: "e2e",
        RECEIPT_PARSER: "fixture",
        GOOGLE_CLOUD_PROJECT: "slurp-e2e",
        FIRESTORE_EMULATOR_HOST: "127.0.0.1",
        E2E_RECEIPT_UPLOAD_BASE_URL: "http://127.0.0.1:8082",
      })
    ).toThrow();
  });

  it("rejects non-loopback URL even in safe e2e runtime - non-loopback rejection", () => {
    expect(() =>
      resolveE2eUploadBaseUrl({
        ...safeEnv,
        E2E_RECEIPT_UPLOAD_BASE_URL: "http://example.com",
      })
    ).toThrow();
    expect(() =>
      resolveE2eUploadBaseUrl({
        ...safeEnv,
        E2E_RECEIPT_UPLOAD_BASE_URL: "http://192.168.1.10:8082",
      })
    ).toThrow();
  });

  it("rejects non-loopback URL in dev/prod as well", () => {
    expect(() =>
      resolveE2eUploadBaseUrl({
        ENVIRONMENT: "dev",
        E2E_RECEIPT_UPLOAD_BASE_URL: "http://example.com",
      })
    ).toThrow();
  });

  it("trims and normalizes trailing slash", () => {
    expect(
      resolveE2eUploadBaseUrl({
        ...safeEnv,
        E2E_RECEIPT_UPLOAD_BASE_URL: "http://127.0.0.1:8082/",
      })
    ).toBe("http://127.0.0.1:8082");
  });
});

describe("isSafeE2eRuntime (api)", () => {
  const valid = {
    ENVIRONMENT: "e2e",
    RECEIPT_PARSER: "fixture",
    GOOGLE_CLOUD_PROJECT: "slurp-e2e",
    FIRESTORE_EMULATOR_HOST: "127.0.0.1:8085",
  };

  it("returns true only for exactly safe runtime", () => {
    expect(isSafeE2eRuntime(valid)).toBe(true);
    expect(isSafeE2eRuntime({ ...valid, FIRESTORE_EMULATOR_HOST: "localhost:8085" })).toBe(true);
  });

  it("returns false for dev/prod isolation", () => {
    expect(isSafeE2eRuntime({ ...valid, ENVIRONMENT: "dev" })).toBe(false);
    expect(isSafeE2eRuntime({ ...valid, ENVIRONMENT: "prod" })).toBe(false);
    expect(isSafeE2eRuntime({ ...valid, ENVIRONMENT: "local" })).toBe(false);
  });

  it("returns false for every missing or wrong piece", () => {
    expect(isSafeE2eRuntime({ ...valid, RECEIPT_PARSER: "gemini" })).toBe(false);
    expect(isSafeE2eRuntime({ ...valid, RECEIPT_PARSER: undefined })).toBe(false);
    expect(isSafeE2eRuntime({ ...valid, GOOGLE_CLOUD_PROJECT: "slurp-prod" })).toBe(false);
    expect(isSafeE2eRuntime({ ...valid, GOOGLE_CLOUD_PROJECT: undefined, FIREBASE_PROJECT_ID: undefined })).toBe(false);
    expect(isSafeE2eRuntime({ ...valid, FIRESTORE_EMULATOR_HOST: "10.0.0.1:8085" })).toBe(false);
    expect(isSafeE2eRuntime({ ...valid, FIRESTORE_EMULATOR_HOST: "" })).toBe(false);
    expect(isSafeE2eRuntime({ ...valid, FIRESTORE_EMULATOR_HOST: "127.0.0.1" })).toBe(false);
  });
});

describe("storage production default unchanged", () => {
  it("without e2e env, no loopback is returned - GCS path preserved", () => {
    expect(resolveE2eUploadBaseUrl({ ENVIRONMENT: "dev" })).toBeUndefined();
    expect(resolveE2eUploadBaseUrl({ ENVIRONMENT: "prod" })).toBeUndefined();
    expect(resolveE2eUploadBaseUrl({})).toBeUndefined();
  });
});
