/**
 * Tests for "Pay in Venmo" button visibility in SummaryView.
 * The button should appear whenever homeCurrency is USD, regardless of
 * whether currency conversion is enabled or disabled.
 */
import { render, screen, act, fireEvent } from "@testing-library/react";
import SummaryView from "./SummaryView";
import type { Slurp } from "@slurp/types";

jest.mock("@/hooks/useVenmoUrl", () => ({
  useVenmoUrl: () => "https://venmo.com/pay?txn=pay&recipients=venmo-user&amount=10.00&note=Slurp",
}));

const mockGetSummary = jest.fn();
const mockMarkAsPaid = jest.fn();
jest.mock("@/lib/slurps", () => ({
  getSummary: (...args: unknown[]) => mockGetSummary(...args),
  markAsPaid: (...args: unknown[]) => mockMarkAsPaid(...args),
}));

const VIEWER_UID = "participant-uid-1";
const HOST_UID = "host-uid-1";

function makeSlurp(conversionOverrides: Partial<Slurp["currencyConversion"]> = {}): Slurp {
  return {
    id: "slurp-1",
    title: "Test Dinner",
    hostUid: HOST_UID,
    hostEmail: "host@example.com",
    taxAmount: 0,
    tipAmount: 0,
    items: [{ id: "item-1", name: "Burger", price: 10.00 }],
    participants: [
      { uid: HOST_UID, email: "host@example.com", role: "host", status: "confirmed", selectedItemIds: [] },
      { uid: VIEWER_UID, email: "viewer@example.com", role: "guest", status: "confirmed", selectedItemIds: ["item-1"] },
    ],
    participantEmails: ["host@example.com", "viewer@example.com"],
    inviteToken: "token",
    removedUids: [],
    receiptStatus: "done",
    currencyConversion: {
      enabled: false,
      billedCurrency: "USD",
      homeCurrency: "USD",
      exchangeRate: 1,
      ...conversionOverrides,
    },
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };
}

const baseSummary = {
  slurpId: "slurp-1",
  hostVenmoUsername: "venmo-user",
  participants: [
    {
      uid: VIEWER_UID,
      displayName: "Viewer",
      items: [{ item: { id: "item-1", name: "Burger", price: 10.00 }, sharePrice: 10.00 }],
      subtotal: 10.00,
      tax: 0,
      tip: 0,
      total: 10.00,
      paid: false,
    },
  ],
};

async function flushMicrotasks(): Promise<void> {
  await act(async () => { await Promise.resolve(); });
}

describe("SummaryView — Pay in Venmo button visibility", () => {
  beforeEach(() => {
    mockGetSummary.mockResolvedValue(baseSummary);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it("shows Pay in Venmo when conversion is enabled and homeCurrency is USD", async () => {
    const slurp = makeSlurp({ enabled: true, billedCurrency: "JPY", homeCurrency: "USD", exchangeRate: 150 });
    render(<SummaryView slurp={slurp} isHost={false} viewerUid={VIEWER_UID} onUpdate={jest.fn()} />);
    await flushMicrotasks();
    expect(screen.getByText("Pay in Venmo")).toBeDefined();
  });

  it("shows Pay in Venmo when conversion is disabled and homeCurrency is USD", async () => {
    const slurp = makeSlurp({ enabled: false, billedCurrency: "USD", homeCurrency: "USD", exchangeRate: 1 });
    render(<SummaryView slurp={slurp} isHost={false} viewerUid={VIEWER_UID} onUpdate={jest.fn()} />);
    await flushMicrotasks();
    expect(screen.getByText("Pay in Venmo")).toBeDefined();
  });

  it("hides Pay in Venmo when conversion is enabled but homeCurrency is not USD", async () => {
    const slurp = makeSlurp({ enabled: true, billedCurrency: "JPY", homeCurrency: "EUR", exchangeRate: 160 });
    render(<SummaryView slurp={slurp} isHost={false} viewerUid={VIEWER_UID} onUpdate={jest.fn()} />);
    await flushMicrotasks();
    expect(screen.queryByText("Pay in Venmo")).toBeNull();
  });

  it("hides Pay in Venmo when conversion is disabled and homeCurrency is not USD", async () => {
    const slurp = makeSlurp({ enabled: false, billedCurrency: "JPY", homeCurrency: "JPY", exchangeRate: 1 });
    render(<SummaryView slurp={slurp} isHost={false} viewerUid={VIEWER_UID} onUpdate={jest.fn()} />);
    await flushMicrotasks();
    expect(screen.queryByText("Pay in Venmo")).toBeNull();
  });

  it("hides Pay in Venmo when participant total is zero", async () => {
    mockGetSummary.mockResolvedValue({
      ...baseSummary,
      participants: [{ ...baseSummary.participants[0], subtotal: 0, tax: 0, tip: 0, total: 0 }],
    });
    const slurp = makeSlurp({ enabled: false, billedCurrency: "USD", homeCurrency: "USD", exchangeRate: 1 });
    render(<SummaryView slurp={slurp} isHost={false} viewerUid={VIEWER_UID} onUpdate={jest.fn()} />);
    await flushMicrotasks();
    expect(screen.queryByText("Pay in Venmo")).toBeNull();
  });

  it("hides Pay in Venmo when conversion is disabled but billedCurrency is not USD", async () => {
    const slurp = makeSlurp({ enabled: false, billedCurrency: "JPY", homeCurrency: "USD", exchangeRate: 150 });
    render(<SummaryView slurp={slurp} isHost={false} viewerUid={VIEWER_UID} onUpdate={jest.fn()} />);
    await flushMicrotasks();
    expect(screen.queryByText("Pay in Venmo")).toBeNull();
  });

  it("hides Pay in Venmo for the host even when homeCurrency is USD", async () => {
    const slurp = makeSlurp({ enabled: false, billedCurrency: "USD", homeCurrency: "USD", exchangeRate: 1 });
    render(<SummaryView slurp={slurp} isHost={true} viewerUid={HOST_UID} onUpdate={jest.fn()} />);
    await flushMicrotasks();
    expect(screen.queryByText("Pay in Venmo")).toBeNull();
  });
});

describe("SummaryView — incomplete party warning", () => {
  const VENMO_URL = "https://venmo.com/pay?txn=pay&recipients=venmo-user&amount=10.00&note=Slurp";

  beforeEach(() => {
    mockGetSummary.mockResolvedValue(baseSummary);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  /** 2 joined, 3 guests expected (+ host = 4), so 2 people are still missing. */
  function incompleteSlurp(): Slurp {
    return { ...makeSlurp(), expectedGuests: 3 };
  }

  async function renderSummary(slurp: Slurp): Promise<void> {
    render(<SummaryView slurp={slurp} isHost={false} viewerUid={VIEWER_UID} onUpdate={jest.fn()} />);
    await flushMicrotasks();
  }

  it("links straight to Venmo when everyone expected has joined", async () => {
    await renderSummary({ ...makeSlurp(), expectedGuests: 1 });
    expect(screen.getByText("Pay in Venmo").closest("a")?.getAttribute("href")).toBe(VENMO_URL);
    expect(screen.queryByText("Not everyone has joined yet")).toBeNull();
  });

  it("links straight to Venmo when no guest count was specified", async () => {
    await renderSummary(makeSlurp());
    expect(screen.getByText("Pay in Venmo").closest("a")?.getAttribute("href")).toBe(VENMO_URL);
  });

  it("warns instead of navigating when people are still missing", async () => {
    await renderSummary(incompleteSlurp());
    const payButton = screen.getByText("Pay in Venmo");
    expect(payButton.closest("a")).toBeNull();

    fireEvent.click(payButton);
    expect(screen.getByText("Not everyone has joined yet")).toBeDefined();
    expect(screen.getByText("Only 2 of 4 have joined. Your share may change once the rest claim their items.")).toBeDefined();
  });

  it("exposes the Venmo link behind Continue anyway", async () => {
    await renderSummary(incompleteSlurp());
    fireEvent.click(screen.getByText("Pay in Venmo"));
    expect(screen.getByText("Continue anyway").closest("a")?.getAttribute("href")).toBe(VENMO_URL);
  });

  it("dismisses the warning without navigating when Wait is clicked", async () => {
    await renderSummary(incompleteSlurp());
    fireEvent.click(screen.getByText("Pay in Venmo"));
    fireEvent.click(screen.getByText("Wait"));
    expect(screen.queryByText("Not everyone has joined yet")).toBeNull();
    expect(screen.queryByText("Continue anyway")).toBeNull();
  });

  it("warns before marking as paid and does not call the API yet", async () => {
    await renderSummary(incompleteSlurp());
    fireEvent.click(screen.getByText("Mark as paid"));
    expect(screen.getByText("Not everyone has joined yet")).toBeDefined();
    expect(mockMarkAsPaid).not.toHaveBeenCalled();
  });

  it("marks as paid only after Continue anyway", async () => {
    mockMarkAsPaid.mockResolvedValue(incompleteSlurp());
    await renderSummary(incompleteSlurp());
    fireEvent.click(screen.getByText("Mark as paid"));
    await act(async () => { fireEvent.click(screen.getByText("Continue anyway")); });
    expect(mockMarkAsPaid).toHaveBeenCalledWith("slurp-1");
  });

  it("marks as paid immediately when the party is complete", async () => {
    mockMarkAsPaid.mockResolvedValue(makeSlurp());
    await renderSummary({ ...makeSlurp(), expectedGuests: 1 });
    await act(async () => { fireEvent.click(screen.getByText("Mark as paid")); });
    expect(mockMarkAsPaid).toHaveBeenCalledWith("slurp-1");
    expect(screen.queryByText("Not everyone has joined yet")).toBeNull();
  });
});
