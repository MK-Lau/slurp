import { fireEvent, render, screen } from "@testing-library/react";
import type { Slurp } from "@slurp/types";
import ItemList from "./ItemList";

jest.mock("@/lib/slurps", () => ({
  deleteItem: jest.fn(),
  updateItem: jest.fn(),
}));

function makeSlurp(): Slurp {
  return {
    id: "slurp-1",
    title: "Test Dinner",
    hostUid: "host-uid",
    hostEmail: "host@example.com",
    taxAmount: 0,
    tipAmount: 0,
    items: [{ id: "item-1", name: "PRIME NY STK", price: 70.51 }],
    participants: [],
    participantEmails: [],
    inviteToken: "token",
    removedUids: [],
    receiptStatus: "done",
    currencyConversion: {
      enabled: false,
      billedCurrency: "USD",
      homeCurrency: "USD",
      exchangeRate: 1,
    },
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };
}

describe("ItemList", () => {
  it("renders host items as an explicit edit control", () => {
    render(<ItemList slurp={makeSlurp()} isHost onUpdate={jest.fn()} />);

    expect(screen.getByRole("button", { name: "Edit PRIME NY STK" })).toBeDefined();
    expect(screen.getByText("$70.51")).toBeDefined();
    expect(screen.queryByRole("button", { name: "Remove item" })).toBeNull();
  });

  it("opens the name and price inputs when the item is tapped", () => {
    render(<ItemList slurp={makeSlurp()} isHost onUpdate={jest.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Edit PRIME NY STK" }));

    expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe("PRIME NY STK");
    expect((screen.getByRole("spinbutton") as HTMLInputElement).value).toBe("70.51");
    expect(screen.getByRole("button", { name: "Remove item" })).toBeDefined();
  });
});
