/** @jest-environment node */

import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";

// We import fresh per test after env mutation; reset module between tests via jest.resetModules.
// Instead directly manipulate and rely on emulatorHosts re-reading env each call.
// The module under test is TS; we import it and mock fetch.

const ORIGINAL_ENV = { ...process.env };

function setEmulatorEnv(overrides: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(overrides)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

function restoreEnv() {
  for (const k of Object.keys(process.env)) {
    if (!(k in ORIGINAL_ENV)) delete process.env[k];
  }
  for (const [k, v] of Object.entries(ORIGINAL_ENV)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v as string;
  }
}

describe("e2e/support/reset-emulators", () => {
  let mod: typeof import("./reset-emulators");
  let fetchSpy: jest.SpiedFunction<typeof fetch>;

  beforeEach(async () => {
    jest.resetModules();
    fetchSpy = jest.spyOn(globalThis, "fetch").mockImplementation(async () => new Response("ok", { status: 200 })) as unknown as jest.SpiedFunction<typeof fetch>;
    mod = await import("./reset-emulators");
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    restoreEnv();
    jest.resetModules();
  });

  describe("emulatorHosts allowed hosts/project", () => {
    it("accepts 127.0.0.1 with ports and exact project slurp-e2e", () => {
      setEmulatorEnv({
        FIRESTORE_EMULATOR_HOST: "127.0.0.1:8085",
        FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
        GOOGLE_CLOUD_PROJECT: "slurp-e2e",
      });
      expect(() => mod.emulatorHosts()).not.toThrow();
      expect(mod.emulatorHosts().projectId).toBe("slurp-e2e");
    });

    it("accepts localhost with ports", () => {
      setEmulatorEnv({
        FIRESTORE_EMULATOR_HOST: "localhost:8085",
        FIREBASE_AUTH_EMULATOR_HOST: "localhost:9099",
        GOOGLE_CLOUD_PROJECT: "slurp-e2e",
      });
      expect(() => mod.emulatorHosts()).not.toThrow();
    });

    it("accepts http:// prefixed loopback", () => {
      setEmulatorEnv({
        FIRESTORE_EMULATOR_HOST: "http://127.0.0.1:8085",
        FIREBASE_AUTH_EMULATOR_HOST: "http://127.0.0.1:9099",
        GOOGLE_CLOUD_PROJECT: "slurp-e2e",
      });
      expect(() => mod.emulatorHosts()).not.toThrow();
    });
  });

  describe("emulatorHosts rejection — real/non-loopback/wrong project", () => {
    it("rejects non-loopback firestore host", () => {
      setEmulatorEnv({
        FIRESTORE_EMULATOR_HOST: "10.0.0.1:8085",
        FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
        GOOGLE_CLOUD_PROJECT: "slurp-e2e",
      });
      expect(() => mod.emulatorHosts()).toThrow(/loopback|refusing/i);
    });

    it("rejects non-loopback auth host", () => {
      setEmulatorEnv({
        FIRESTORE_EMULATOR_HOST: "127.0.0.1:8085",
        FIREBASE_AUTH_EMULATOR_HOST: "192.168.1.1:9099",
        GOOGLE_CLOUD_PROJECT: "slurp-e2e",
      });
      expect(() => mod.emulatorHosts()).toThrow(/loopback|refusing/i);
    });

    it("rejects real project (not slurp-e2e)", () => {
      setEmulatorEnv({
        FIRESTORE_EMULATOR_HOST: "127.0.0.1:8085",
        FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
        GOOGLE_CLOUD_PROJECT: "slurp-prod",
      });
      expect(() => mod.emulatorHosts()).toThrow(/slurp-e2e|project/i);
    });

    it("rejects wrong project via FIREBASE_PROJECT_ID fallback", () => {
      setEmulatorEnv({
        FIRESTORE_EMULATOR_HOST: "127.0.0.1:8085",
        FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
        GOOGLE_CLOUD_PROJECT: undefined,
        FIREBASE_PROJECT_ID: "my-real-project",
      });
      delete process.env.GOOGLE_CLOUD_PROJECT;
      expect(() => mod.emulatorHosts()).toThrow(/slurp-e2e|project/i);
    });

    it("rejects conflicting project variables", () => {
      setEmulatorEnv({
        FIRESTORE_EMULATOR_HOST: "127.0.0.1:8085",
        FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
        GOOGLE_CLOUD_PROJECT: "slurp-e2e",
        FIREBASE_PROJECT_ID: "slurp-prod",
      });
      expect(() => mod.emulatorHosts()).toThrow(/slurp-prod|refusing/i);
    });

    it("rejects when hosts are missing", () => {
      setEmulatorEnv({
        FIRESTORE_EMULATOR_HOST: undefined,
        FIREBASE_AUTH_EMULATOR_HOST: undefined,
        GOOGLE_CLOUD_PROJECT: "slurp-e2e",
      });
      delete process.env.FIRESTORE_EMULATOR_HOST;
      delete process.env.FIREBASE_AUTH_EMULATOR_HOST;
      expect(() => mod.emulatorHosts()).toThrow(/not set|refusing/i);
    });
  });

  describe("clearFirestoreDocs — correct DELETE URL/method", () => {
    it("uses DELETE to /emulator/v1/projects/slurp-e2e/databases/(default)/documents", async () => {
      setEmulatorEnv({
        FIRESTORE_EMULATOR_HOST: "127.0.0.1:8085",
        FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
        GOOGLE_CLOUD_PROJECT: "slurp-e2e",
      });
      // make fetch succeed
      fetchSpy.mockResolvedValueOnce(new Response("", { status: 200 }) as unknown as Response);
      await mod.clearFirestoreDocs();
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [url, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
      expect(url).toBe("http://127.0.0.1:8085/emulator/v1/projects/slurp-e2e/databases/(default)/documents");
      expect(init?.method).toBe("DELETE");
    });
  });

  describe("clearFirestoreDocs — non-2xx failure", () => {
    it("throws with response body on non-2xx and does not silently succeed", async () => {
      setEmulatorEnv({
        FIRESTORE_EMULATOR_HOST: "127.0.0.1:8085",
        FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
        GOOGLE_CLOUD_PROJECT: "slurp-e2e",
      });
      fetchSpy.mockResolvedValueOnce(new Response("permission denied", { status: 403 }) as unknown as Response);
      await expect(mod.clearFirestoreDocs()).rejects.toThrow(/permission denied|403/i);
    });

    it("throws on 500 with body included", async () => {
      setEmulatorEnv({
        FIRESTORE_EMULATOR_HOST: "127.0.0.1:8085",
        FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
        GOOGLE_CLOUD_PROJECT: "slurp-e2e",
      });
      fetchSpy.mockResolvedValueOnce(new Response("internal error xyz", { status: 500 }) as unknown as Response);
      await expect(mod.clearFirestoreDocs()).rejects.toThrow(/internal error xyz|500/i);
    });
  });
});
