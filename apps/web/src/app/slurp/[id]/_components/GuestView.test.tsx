import { fireEvent, render, screen } from "@testing-library/react";
import GuestView from "./GuestView";
import type { Participant, Slurp } from "@slurp/types";

jest.mock("./SelectionPanel", () => () => <div>selection panel</div>);
jest.mock("./SummaryView", () => () => <div>summary view</div>);
jest.mock("./ParticipantList", () => () => <div>participant list</div>);

const guest: Participant = {
  uid: "guest", role: "guest", status: "pending",
  selectedItemIds: ["pizza"], selectedItemShares: { pizza: 1 },
};

const slurp: Slurp = {
  id: "s", title: "Dinner", hostUid: "host", splitVersion: 2, splitRevision: 1,
  taxAmount: 3, tipAmount: 6,
  items: [{ id: "pizza", name: "Pizza", price: 30, shareCount: 3 }],
  participants: [
    { uid: "host", role: "host", status: "pending", selectedItemIds: [], selectedItemShares: {} },
    guest,
  ],
  participantEmails: [], inviteToken: "token", removedUids: [],
  currencyConversion: { enabled: false, billedCurrency: "USD", homeCurrency: "USD", exchangeRate: 1 },
  createdAt: "2026-01-01", updatedAt: "2026-01-01",
};

describe("GuestView — fixed-share totals", () => {
  it("uses the complete host template for stable tax and tip", () => {
    render(<GuestView slurp={slurp} participant={guest} onUpdate={jest.fn()} tab="items" />);
    fireEvent.click(screen.getByText("See totals"));
    expect(screen.getByText("$10.00")).toBeDefined();
    expect(screen.getByText("$1.00")).toBeDefined();
    expect(screen.getByText("$2.00")).toBeDefined();
    expect(screen.getByText("$13.00")).toBeDefined();
  });

  it("shows both billed and home currencies when conversion is enabled", () => {
    render(<GuestView
      slurp={{
        ...slurp,
        currencyConversion: { enabled: true, billedCurrency: "JPY", homeCurrency: "USD", exchangeRate: 100 },
      }}
      participant={guest}
      onUpdate={jest.fn()}
      tab="items"
    />);
    fireEvent.click(screen.getByText("See totals"));
    expect(screen.getByText("¥10.00 ($0.10)")).toBeDefined();
    expect(screen.getByText("¥13.00 ($0.13)")).toBeDefined();
  });
});
