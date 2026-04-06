/**
 * Tests for "Pay in Venmo" button visibility in SelectionPanel.
 * The button should appear whenever homeCurrency is USD, regardless of
 * whether currency conversion is enabled or disabled.
 */
import { render, screen, act } from "@testing-library/react";
import SelectionPanel from "./SelectionPanel";
import type { Slurp, Participant } from "@slurp/types";

jest.mock("@/hooks/useVenmoUrl", () => ({
  useVenmoUrl: () => "https://venmo.com/pay?txn=pay&recipients=venmo-user&amount=10.00&note=Slurp",
}));

const mockGetSummary = jest.fn();
jest.mock("@/lib/slurps", () => ({
  getSummary: (...args: unknown[]) => mockGetSummary(...args),
  updateSelections: jest.fn(),
  confirmSlurp: jest.fn(),
}));

const PARTICIPANT_UID = "participant-uid-1";
const HOST_UID = "host-uid-1";

const confirmedParticipant: Participant = {
  uid: PARTICIPANT_UID,
  email: "viewer@example.com",
  role: "guest",
  status: "confirmed",
  selectedItemIds: ["item-1"],
};

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
      confirmedParticipant,
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

async function flushMicrotasks(): Promise<void> {
  await act(async () => { await Promise.resolve(); });
}

describe("SelectionPanel — Pay in Venmo button visibility", () => {
  beforeEach(() => {
    mockGetSummary.mockResolvedValue({
      slurpId: "slurp-1",
      hostVenmoUsername: "venmo-user",
      participants: [],
    });
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it("shows Pay in Venmo when conversion is enabled and homeCurrency is USD", async () => {
    const slurp = makeSlurp({ enabled: true, billedCurrency: "JPY", homeCurrency: "USD", exchangeRate: 150 });
    render(<SelectionPanel slurp={slurp} participant={confirmedParticipant} onUpdate={jest.fn()} />);
    await flushMicrotasks();
    expect(screen.getByText("Pay in Venmo")).toBeDefined();
  });

  it("shows Pay in Venmo when conversion is disabled and homeCurrency is USD", async () => {
    const slurp = makeSlurp({ enabled: false, billedCurrency: "USD", homeCurrency: "USD", exchangeRate: 1 });
    render(<SelectionPanel slurp={slurp} participant={confirmedParticipant} onUpdate={jest.fn()} />);
    await flushMicrotasks();
    expect(screen.getByText("Pay in Venmo")).toBeDefined();
  });

  it("hides Pay in Venmo when conversion is enabled but homeCurrency is not USD", async () => {
    const slurp = makeSlurp({ enabled: true, billedCurrency: "JPY", homeCurrency: "EUR", exchangeRate: 160 });
    render(<SelectionPanel slurp={slurp} participant={confirmedParticipant} onUpdate={jest.fn()} />);
    await flushMicrotasks();
    expect(screen.queryByText("Pay in Venmo")).toBeNull();
  });

  it("hides Pay in Venmo when conversion is disabled and homeCurrency is not USD", async () => {
    const slurp = makeSlurp({ enabled: false, billedCurrency: "JPY", homeCurrency: "JPY", exchangeRate: 1 });
    render(<SelectionPanel slurp={slurp} participant={confirmedParticipant} onUpdate={jest.fn()} />);
    await flushMicrotasks();
    expect(screen.queryByText("Pay in Venmo")).toBeNull();
  });

  it("hides Pay in Venmo when conversion is disabled but billedCurrency is not USD", async () => {
    const slurp = makeSlurp({ enabled: false, billedCurrency: "JPY", homeCurrency: "USD", exchangeRate: 150 });
    render(<SelectionPanel slurp={slurp} participant={confirmedParticipant} onUpdate={jest.fn()} />);
    await flushMicrotasks();
    expect(screen.queryByText("Pay in Venmo")).toBeNull();
  });
});
