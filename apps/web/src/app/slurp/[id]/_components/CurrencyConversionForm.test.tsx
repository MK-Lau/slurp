/**
 * Tests for CurrencyConversionForm currency validation error behavior.
 * The "Billed currency and home currency must be different" error should only
 * appear after the user has interacted with a currency select, not immediately
 * on render when both currencies are the same API default ("USD").
 */
import { render, screen, fireEvent } from "@testing-library/react";
import CurrencyConversionForm from "./CurrencyConversionForm";
import type { Slurp } from "@slurp/types";

const mockUpdateSlurp = jest.fn();
jest.mock("@/lib/slurps", () => ({
  updateSlurp: (...args: unknown[]) => mockUpdateSlurp(...args),
}));

function makeSlurp(conversionOverrides: Partial<Slurp["currencyConversion"]> = {}): Slurp {
  return {
    id: "slurp-1",
    title: "Test Dinner",
    hostUid: "host-uid",
    hostEmail: "host@example.com",
    taxAmount: 0,
    tipAmount: 0,
    items: [],
    participants: [],
    participantEmails: [],
    inviteToken: "token",
    removedUids: [],
    receiptStatus: "done",
    currencyConversion: {
      enabled: true,
      billedCurrency: "USD",
      homeCurrency: "USD",
      exchangeRate: 1,
      ...conversionOverrides,
    },
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };
}

const SAME_CURRENCY_ERROR = "Billed currency and home currency must be different";

describe("CurrencyConversionForm — same-currency error timing", () => {
  beforeEach(() => {
    mockUpdateSlurp.mockResolvedValue(makeSlurp());
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it("does not show error on initial render when both currencies are the same default", () => {
    render(<CurrencyConversionForm slurp={makeSlurp()} onUpdate={jest.fn()} />);
    expect(screen.queryByText(SAME_CURRENCY_ERROR)).toBeNull();
  });

  it("shows error after user selects billed currency matching home currency", () => {
    render(<CurrencyConversionForm slurp={makeSlurp({ homeCurrency: "JPY", billedCurrency: "EUR" })} onUpdate={jest.fn()} />);

    // comboboxes render in DOM order: [0] = Billed in, [1] = Home currency
    const [billedSelect] = screen.getAllByRole("combobox");
    fireEvent.change(billedSelect, { target: { value: "JPY" } });

    expect(screen.getByText(SAME_CURRENCY_ERROR)).toBeDefined();
  });

  it("shows error after user changes home currency to match billed currency", () => {
    render(<CurrencyConversionForm slurp={makeSlurp({ billedCurrency: "EUR", homeCurrency: "USD" })} onUpdate={jest.fn()} />);

    const [, homeSelect] = screen.getAllByRole("combobox");
    fireEvent.change(homeSelect, { target: { value: "EUR" } });

    expect(screen.getByText(SAME_CURRENCY_ERROR)).toBeDefined();
  });

  it("clears error when user changes billed currency to differ from home currency", () => {
    render(<CurrencyConversionForm slurp={makeSlurp({ billedCurrency: "EUR", homeCurrency: "USD" })} onUpdate={jest.fn()} />);

    const [billedSelect] = screen.getAllByRole("combobox");

    // First make them match
    fireEvent.change(billedSelect, { target: { value: "USD" } });
    expect(screen.getByText(SAME_CURRENCY_ERROR)).toBeDefined();

    // Then fix it
    fireEvent.change(billedSelect, { target: { value: "JPY" } });
    expect(screen.queryByText(SAME_CURRENCY_ERROR)).toBeNull();
  });
});
