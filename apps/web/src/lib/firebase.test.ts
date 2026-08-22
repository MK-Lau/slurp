/**
 * Tests for Task 4: authEmulatorUrl runtime wiring + connectAuthEmulator once + loopback guard.
 * Uses Jest mocks — no real Firebase calls.
 */

const mockConnectAuthEmulator = jest.fn();
const mockGetAuth = jest.fn(() => ({ _isMockAuth: true }) as unknown as import("firebase/auth").Auth);
const mockGetFirestore = jest.fn(() => ({} as unknown as import("firebase/firestore").Firestore));
const mockInitializeApp = jest.fn(() => ({} as unknown as import("firebase/app").FirebaseApp));
const mockGetApps = jest.fn(() => [] as import("firebase/app").FirebaseApp[]);

jest.mock("firebase/app", () => ({
  initializeApp: (...a: unknown[]) => mockInitializeApp(...(a as [])),
  getApps: (...a: unknown[]) => mockGetApps(...(a as [])),
}));
jest.mock("firebase/auth", () => ({
  getAuth: (...a: unknown[]) => mockGetAuth(...(a as [])),
  connectAuthEmulator: (...a: unknown[]) => mockConnectAuthEmulator(...(a as [])),
}));
jest.mock("firebase/firestore", () => ({
  getFirestore: (...a: unknown[]) => mockGetFirestore(...(a as [])),
}));

import { __resetFirebaseForTests, initFirebase } from "./firebase";

function baseConfig(overrides: Record<string, unknown> = {}) {
  return {
    apiKey: "fake",
    authDomain: "slurp-e2e.firebaseapp.com",
    projectId: "slurp-e2e",
    appId: "1:123:web:e2e",
    firestoreDatabase: "(default)",
    ...overrides,
  };
}

describe("initFirebase auth emulator wiring", () => {
  beforeEach(() => {
    __resetFirebaseForTests();
    mockConnectAuthEmulator.mockClear();
    mockGetAuth.mockClear();
    mockGetFirestore.mockClear();
    mockInitializeApp.mockClear();
    mockGetApps.mockReturnValue([]);
    mockGetAuth.mockReturnValue({ _isMockAuth: true } as unknown as import("firebase/auth").Auth);
  });

  it("does not call connectAuthEmulator when authEmulatorUrl is absent", () => {
    initFirebase(baseConfig());
    expect(mockConnectAuthEmulator).not.toHaveBeenCalled();
  });

  it("calls connectAuthEmulator once with loopback URL", () => {
    initFirebase(baseConfig({ authEmulatorUrl: "http://127.0.0.1:9099" }));
    expect(mockConnectAuthEmulator).toHaveBeenCalledTimes(1);
    expect(mockConnectAuthEmulator).toHaveBeenCalledWith(
      expect.anything(),
      "http://127.0.0.1:9099",
      { disableWarnings: true }
    );
  });

  it("calls connectAuthEmulator for localhost loopback", () => {
    initFirebase(baseConfig({ authEmulatorUrl: "http://localhost:9099" }));
    expect(mockConnectAuthEmulator).toHaveBeenCalledTimes(1);
  });

  it("throws on non-loopback emulator URL", () => {
    expect(() => initFirebase(baseConfig({ authEmulatorUrl: "https://example.com:9099" }))).toThrow(
      /loopback/
    );
    expect(mockInitializeApp).not.toHaveBeenCalled();
    expect(mockGetAuth).not.toHaveBeenCalled();
    expect(mockGetFirestore).not.toHaveBeenCalled();
    expect(mockConnectAuthEmulator).not.toHaveBeenCalled();

    initFirebase(baseConfig());
    expect(mockInitializeApp).toHaveBeenCalledTimes(1);
    expect(mockGetAuth).toHaveBeenCalledTimes(1);
    expect(mockGetFirestore).toHaveBeenCalledTimes(1);
  });

  it("throws on https loopback URL", () => {
    expect(() => initFirebase(baseConfig({ authEmulatorUrl: "https://127.0.0.1:9099" }))).toThrow(
      /loopback/
    );
  });

  it("connects at most once across repeated initFirebase calls", () => {
    initFirebase(baseConfig({ authEmulatorUrl: "http://127.0.0.1:9099" }));
    initFirebase(baseConfig({ authEmulatorUrl: "http://127.0.0.1:9099" }));
    initFirebase(baseConfig({ authEmulatorUrl: "http://127.0.0.1:9099" }));
    expect(mockConnectAuthEmulator).toHaveBeenCalledTimes(1);
  });

  it("connects lazily if first init had no emulator URL and second does", () => {
    initFirebase(baseConfig());
    expect(mockConnectAuthEmulator).not.toHaveBeenCalled();
    initFirebase(baseConfig({ authEmulatorUrl: "http://127.0.0.1:9099" }));
    expect(mockConnectAuthEmulator).toHaveBeenCalledTimes(1);
  });

  it("rejects non-loopback URL even on second init", () => {
    initFirebase(baseConfig());
    expect(() => initFirebase(baseConfig({ authEmulatorUrl: "http://10.0.0.1:9099" }))).toThrow(
      /loopback/
    );
    expect(mockConnectAuthEmulator).not.toHaveBeenCalled();
  });
});
