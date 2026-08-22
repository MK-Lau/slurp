/** @jest-environment node */

import { GET } from "./route";

function mockEnv(vars: Record<string, string | undefined>) {
  const prev: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(vars)) {
    prev[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  return () => {
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  };
}

describe("GET /api/config", () => {
  it("omits authEmulatorUrl by default", async () => {
    const restore = mockEnv({ FIREBASE_AUTH_EMULATOR_URL: undefined });
    try {
      const res = await GET();
      const body = (await res.json()) as Record<string, unknown>;
      expect(body.authEmulatorUrl).toBeUndefined();
      expect(body.apiKey).toBeDefined();
    } finally {
      restore();
    }
  });

  it("returns authEmulatorUrl when FIREBASE_AUTH_EMULATOR_URL is set", async () => {
    const restore = mockEnv({ FIREBASE_AUTH_EMULATOR_URL: "http://127.0.0.1:9099" });
    try {
      const res = await GET();
      const body = (await res.json()) as Record<string, unknown>;
      expect(body.authEmulatorUrl).toBe("http://127.0.0.1:9099");
    } finally {
      restore();
    }
  });

  it("treats whitespace-only emulator URL as absent", async () => {
    const restore = mockEnv({ FIREBASE_AUTH_EMULATOR_URL: "   " });
    try {
      const res = await GET();
      const body = (await res.json()) as Record<string, unknown>;
      expect(body.authEmulatorUrl).toBeUndefined();
    } finally {
      restore();
    }
  });
});
