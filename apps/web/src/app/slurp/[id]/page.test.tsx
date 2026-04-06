/**
 * Tests for the polling loop in SlurpPage.
 * Uses fake timers to control setTimeout and mocked getSlurp to simulate
 * receiptStatus transitions: processing → processing → done (with items).
 */
import { render, screen, act } from "@testing-library/react";
import SlurpPage from "./page";
import type { Slurp } from "@slurp/types";

// ── Mocks ─────────────────────────────────────────────────────────────────────

// Return the same router object on every call so it doesn't destabilize the
// useEffect dependency array (a new object reference each render would cause
// the effect to re-run on every render cycle).
jest.mock("next/navigation", () => {
  const stableRouter = { replace: jest.fn(), push: jest.fn() };
  const stableSearchParams = { get: (): null => null };
  return {
    useParams: (): { id: string } => ({ id: "test-slurp-id" }),
    useRouter: (): typeof stableRouter => stableRouter,
    useSearchParams: (): typeof stableSearchParams => stableSearchParams,
  };
});

jest.mock("@/lib/firebase", () => ({ auth: {} }));

const mockUser = { uid: "host-uid-1", email: "host@example.com" };
jest.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: mockUser,
    loading: false,
    profile: {
      displayName: "Test Host",
      venmoUsername: undefined,
      dismissedVenmo: false,
      loading: false,
      ready: true,
    },
    refreshProfile: jest.fn(),
  }),
}));

const mockGetSlurp = jest.fn();
jest.mock("@/lib/slurps", () => ({
  getSlurp: (...args: unknown[]) => mockGetSlurp(...args),
  getSlurpPreview: jest.fn(),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeSlurp(overrides: Partial<Slurp> = {}): Slurp {
  return {
    id: "test-slurp-id",
    title: "Test Dinner",
    hostUid: "host-uid-1",
    hostEmail: "host@example.com",
    taxAmount: 8,
    tipAmount: 18,
    items: [],
    participants: [
      {
        uid: "host-uid-1",
        email: "host@example.com",
        role: "host",
        status: "pending",
        selectedItemIds: [],
      },
    ],
    participantEmails: ["host@example.com"],
    inviteToken: "test-invite-token",
    removedUids: [],
    receiptStatus: "processing",
    currencyConversion: { enabled: false, billedCurrency: "USD", homeCurrency: "USD", exchangeRate: 1 },
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

// Flush all pending microtasks (promise chains) without advancing fake timers.
// This lets async operations like getSlurp promises resolve without accidentally
// firing the polling setTimeout.
async function flushMicrotasks(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("SlurpPage polling", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockGetSlurp.mockReset();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("polls getSlurp until receiptStatus is done and then renders items", async () => {
    const processingSlurp = makeSlurp({ receiptStatus: "processing", items: [] });
    const doneSlurp = makeSlurp({
      receiptStatus: "done",
      items: [
        { id: "item-1", name: "Burger", price: 12.99 },
        { id: "item-2", name: "Fries", price: 3.99 },
      ],
    });

    mockGetSlurp
      .mockResolvedValueOnce(processingSlurp)
      .mockResolvedValueOnce(doneSlurp);

    render(<SlurpPage />);

    // Let the initial getSlurp call resolve; loop is now waiting on the 2s setTimeout.
    await flushMicrotasks();
    expect(mockGetSlurp).toHaveBeenCalledTimes(1);

    // Fire the 2s polling timer, then let the second getSlurp resolve.
    act(() => { jest.advanceTimersByTime(2000); });
    await flushMicrotasks();

    expect(mockGetSlurp).toHaveBeenCalledTimes(2);
    expect(screen.getByText("Burger")).toBeDefined();
    expect(screen.getByText("Fries")).toBeDefined();
  });

  it("polls multiple times if status remains processing", async () => {
    const processingSlurp = makeSlurp({ receiptStatus: "processing", items: [] });
    const doneSlurp = makeSlurp({ receiptStatus: "done", items: [] });

    mockGetSlurp
      .mockResolvedValueOnce(processingSlurp)
      .mockResolvedValueOnce(processingSlurp)
      .mockResolvedValueOnce(processingSlurp)
      .mockResolvedValueOnce(doneSlurp);

    render(<SlurpPage />);

    // Initial fetch resolves.
    await flushMicrotasks();
    expect(mockGetSlurp).toHaveBeenCalledTimes(1);

    // Each iteration: fire the 2s timer → let the next getSlurp resolve.
    for (let i = 0; i < 3; i++) {
      act(() => { jest.advanceTimersByTime(2000); });
      await flushMicrotasks();
    }

    expect(mockGetSlurp).toHaveBeenCalledTimes(4);
  });

  it("stops polling when receiptStatus is failed", async () => {
    const processingSlurp = makeSlurp({ receiptStatus: "processing" });
    const failedSlurp = makeSlurp({ receiptStatus: "failed" });

    mockGetSlurp
      .mockResolvedValueOnce(processingSlurp)
      .mockResolvedValueOnce(failedSlurp);

    render(<SlurpPage />);

    await flushMicrotasks();
    expect(mockGetSlurp).toHaveBeenCalledTimes(1);

    act(() => { jest.advanceTimersByTime(2000); });
    await flushMicrotasks();
    expect(mockGetSlurp).toHaveBeenCalledTimes(2);

    // Advance more time — loop should have exited, no additional calls.
    act(() => { jest.advanceTimersByTime(10000); });
    await flushMicrotasks();

    expect(mockGetSlurp).toHaveBeenCalledTimes(2);
  });

  it("does not poll if initial receiptStatus is already done", async () => {
    const doneSlurp = makeSlurp({
      receiptStatus: "done",
      items: [{ id: "item-1", name: "Pizza", price: 10.0 }],
    });

    mockGetSlurp.mockResolvedValueOnce(doneSlurp);

    render(<SlurpPage />);

    await flushMicrotasks();
    expect(mockGetSlurp).toHaveBeenCalledTimes(1);

    // Advance time — loop never entered, no further calls expected.
    act(() => { jest.advanceTimersByTime(10000); });
    await flushMicrotasks();

    expect(mockGetSlurp).toHaveBeenCalledTimes(1);
  });
});
