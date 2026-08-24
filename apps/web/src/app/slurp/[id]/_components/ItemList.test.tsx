import { act, fireEvent, render, screen } from "@testing-library/react";
import ItemList from "./ItemList";
import type { Slurp } from "@slurp/types";

const mockUpdateItem = jest.fn();
jest.mock("@/lib/slurps", () => ({
  updateItem: (...args: unknown[]) => mockUpdateItem(...args),
  deleteItem: jest.fn(),
}));

const slurp: Slurp = {
  id: "s1", title: "Dinner", hostUid: "host", hostEmail: "host@example.com",
  splitVersion: 2, taxAmount: 0, tipAmount: 0, expectedGuests: 3,
  items: [{ id: "pizza", name: "Pizza", price: 24, shareCount: 1 }],
  participants: [{ uid: "host", role: "host", status: "pending", selectedItemIds: [], selectedItemShares: {} }],
  participantEmails: ["host@example.com"], inviteToken: "token", removedUids: [],
  currencyConversion: { enabled: false, billedCurrency: "USD", homeCurrency: "USD", exchangeRate: 1 },
  createdAt: "2026-01-01", updatedAt: "2026-01-01",
};

describe("ItemList — host fixed-share defaults", () => {
  it("lets the host set an item to everyone", async () => {
    mockUpdateItem.mockResolvedValue({ ...slurp, items: [{ ...slurp.items[0], shareCount: 4 }] });
    const onUpdate = jest.fn();
    render(<ItemList slurp={slurp} isHost onUpdate={onUpdate} />);

    await act(async () => { fireEvent.change(screen.getByLabelText("Default split"), { target: { value: "4" } }); });

    expect(mockUpdateItem).toHaveBeenCalledWith("s1", "pizza", { shareCount: 4 });
    expect(onUpdate).toHaveBeenCalled();
  });

  it("keeps financial controls locked but still permits a name-only correction", async () => {
    const locked = {
      ...slurp,
      participants: [{ ...slurp.participants[0], status: "confirmed" as const }],
    };
    mockUpdateItem.mockResolvedValue({ ...locked, items: [{ ...locked.items[0], name: "Large Pizza" }] });
    render(<ItemList slurp={locked} isHost onUpdate={jest.fn()} />);

    expect((screen.getByLabelText("Default split") as HTMLSelectElement).disabled).toBe(true);
    fireEvent.click(screen.getByText("Pizza"));
    const nameInput = screen.getByDisplayValue("Pizza");
    fireEvent.change(nameInput, { target: { value: "Large Pizza" } });
    await act(async () => { fireEvent.keyDown(nameInput, { key: "Enter" }); });

    expect(mockUpdateItem).toHaveBeenCalledWith("s1", "pizza", { name: "Large Pizza" });
  });
});
