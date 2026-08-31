/**
 * Tests for the polling loop in SlurpPage.
 * Uses fake timers to control setTimeout and mocked getSlurp to simulate
 * receiptStatus transitions: processing → processing → done (with items).
 */
import { render, screen, act } from "@testing-library/react";
import SlurpPage from "./page";
import type { Slurp } from "@slurp/types";
import { ApiError } from "@/lib/api";

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
const mockGetSlurpRevision = jest.fn();
jest.mock("@/lib/slurps", () => ({
  getSlurp: (...args: unknown[]) => mockGetSlurp(...args),
  getSlurpRevision: (...args: unknown[]) => mockGetSlurpRevision(...args),
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
    mockGetSlurpRevision.mockReset();
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

  it("keeps polling a completed version 2 slurp for split changes", async () => {
    const confirmed = makeSlurp({
      splitVersion: 2,
      splitRevision: 3,
      receiptStatus: "done",
      participants: [{
        uid: "host-uid-1",
        email: "host@example.com",
        role: "host",
        status: "confirmed",
        selectedItemIds: ["item-1"],
        selectedItemShares: { "item-1": 1 },
      }],
      items: [{ id: "item-1", name: "Pizza", price: 10 }],
    });
    const reopened = {
      ...confirmed,
      splitRevision: 4,
      updatedAt: "2026-01-01T00:00:02Z",
      participants: [{ ...confirmed.participants[0], status: "pending" as const }],
    };
    mockGetSlurp.mockResolvedValueOnce(confirmed).mockResolvedValueOnce(reopened);
    mockGetSlurpRevision.mockResolvedValueOnce({
      splitRevision: reopened.splitRevision,
      updatedAt: reopened.updatedAt,
      receiptStatus: reopened.receiptStatus,
    });

    render(<SlurpPage />);
    await flushMicrotasks();
    expect(screen.getByText("All confirmed")).toBeDefined();

    act(() => { jest.advanceTimersByTime(2000); });
    await flushMicrotasks();

    expect(mockGetSlurp).toHaveBeenCalledTimes(2);
    expect(screen.getByText("0/1 confirmed")).toBeDefined();
  });

  it("stops polling after a non-retriable response", async () => {
    const slurp = makeSlurp({ splitVersion: 2, receiptStatus: "done" });
    mockGetSlurp.mockResolvedValueOnce(slurp);
    mockGetSlurpRevision.mockRejectedValueOnce(new ApiError("You are no longer a participant", 403));

    render(<SlurpPage />);
    await flushMicrotasks();
    act(() => { jest.advanceTimersByTime(2000); });
    await flushMicrotasks();
    expect(screen.getByText("You are no longer a participant")).toBeDefined();

    act(() => { jest.advanceTimersByTime(10000); });
    await flushMicrotasks();
    expect(mockGetSlurpRevision).toHaveBeenCalledTimes(1);
    expect(mockGetSlurp).toHaveBeenCalledTimes(1);
  });

  it("uses the lightweight revision check without refetching unchanged slurp data", async () => {
    const slurp = makeSlurp({ splitVersion: 2, splitRevision: 2, receiptStatus: "done" });
    mockGetSlurp.mockResolvedValueOnce(slurp);
    mockGetSlurpRevision.mockResolvedValueOnce({
      splitRevision: 2,
      updatedAt: slurp.updatedAt,
      receiptStatus: "done",
    });

    render(<SlurpPage />);
    await flushMicrotasks();
    act(() => { jest.advanceTimersByTime(2000); });
    await flushMicrotasks();

    expect(mockGetSlurpRevision).toHaveBeenCalledTimes(1);
    expect(mockGetSlurp).toHaveBeenCalledTimes(1);
  });
});

describe("SlurpPage header counts", () => {
  beforeEach(() => {
    mockGetSlurp.mockReset();
  });

  async function renderPage(overrides: Partial<Slurp>): Promise<void> {
    mockGetSlurp.mockResolvedValue(makeSlurp({ receiptStatus: "done", ...overrides }));
    render(<SlurpPage />);
    await flushMicrotasks();
  }

  const guest = (uid: string, status: "pending" | "confirmed") => ({
    uid,
    email: `${uid}@example.com`,
    role: "guest" as const,
    status,
    selectedItemIds: [],
  });

  const host = (status: "pending" | "confirmed") => ({
    uid: "host-uid-1",
    email: "host@example.com",
    role: "host" as const,
    status,
    selectedItemIds: [],
  });

  it("shows the expected total alongside the joined count", async () => {
    await renderPage({
      expectedGuests: 4,
      participants: [host("confirmed"), guest("g1", "pending"), guest("g2", "pending")],
    });
    expect(screen.getByText(/3 of 5 joined/)).toBeDefined();
  });

  it("shows only the joined count when no guest count was specified", async () => {
    await renderPage({ participants: [host("pending"), guest("g1", "pending")] });
    expect(screen.getByText(/2 joined/)).toBeDefined();
    expect(screen.queryByText(/of .* joined/)).toBeNull();
  });

  it("shows the confirmed count even when nobody has confirmed yet", async () => {
    await renderPage({
      expectedGuests: 2,
      participants: [host("pending"), guest("g1", "pending")],
    });
    expect(screen.getByText("0/2 confirmed")).toBeDefined();
  });

  it("shows a partial confirmed count", async () => {
    await renderPage({
      expectedGuests: 2,
      participants: [host("confirmed"), guest("g1", "pending"), guest("g2", "pending")],
    });
    expect(screen.getByText("1/3 confirmed")).toBeDefined();
  });

  it("shows All confirmed once everyone joined has confirmed", async () => {
    await renderPage({
      expectedGuests: 1,
      participants: [host("confirmed"), guest("g1", "confirmed")],
    });
    expect(screen.getByText("All confirmed")).toBeDefined();
  });
});
