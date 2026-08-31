import { act, fireEvent, render, screen } from "@testing-library/react";
import type { Slurp } from "@slurp/types";
import ItemList from "./ItemList";

const mockUpdateItem = jest.fn();
jest.mock("@/lib/slurps", () => ({
  deleteItem: jest.fn(),
  updateItem: (...args: unknown[]) => mockUpdateItem(...args),
}));

function makeSlurp(overrides: Partial<Slurp> = {}): Slurp {
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
    ...overrides,
  };
}

function makeFixedSlurp(): Slurp {
  return makeSlurp({
    id: "s1",
    splitVersion: 2,
    expectedGuests: 3,
    items: [{ id: "pizza", name: "Pizza", price: 24, shareCount: 1 }],
    participants: [{
      uid: "host-uid",
      role: "host",
      status: "pending",
      selectedItemIds: [],
      selectedItemShares: {},
    }],
  });
}

describe("ItemList", () => {
  beforeEach(() => mockUpdateItem.mockReset());

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

  it("offers an open split and limits host presets to the expected party size", () => {
    render(<ItemList slurp={{ ...makeFixedSlurp(), expectedGuests: 2 }} isHost onUpdate={jest.fn()} />);

    const options = Array.from((screen.getByLabelText("Default split") as HTMLSelectElement).options);
    expect(options).toHaveLength(4);
    expect(options[0].text).toBe("No preset (split among everyone who selects)");
    expect(options[3].text).toBe("Everyone (3 shares)");
  });

  it("lets the host set an item to everyone", async () => {
    const slurp = makeFixedSlurp();
    mockUpdateItem.mockResolvedValue({ ...slurp, items: [{ ...slurp.items[0], shareCount: 4 }] });
    const onUpdate = jest.fn();
    render(<ItemList slurp={slurp} isHost onUpdate={onUpdate} />);

    await act(async () => {
      fireEvent.change(screen.getByLabelText("Default split"), { target: { value: "4" } });
    });

    expect(mockUpdateItem).toHaveBeenCalledWith("s1", "pizza", { shareCount: 4 });
    expect(onUpdate).toHaveBeenCalled();
  });

  it("keeps financial controls locked but still permits a name-only correction", async () => {
    const slurp = makeFixedSlurp();
    const locked = {
      ...slurp,
      participants: [{ ...slurp.participants[0], status: "confirmed" as const }],
    };
    mockUpdateItem.mockResolvedValue({ ...locked, items: [{ ...locked.items[0], name: "Large Pizza" }] });
    render(<ItemList slurp={locked} isHost onUpdate={jest.fn()} />);

    expect((screen.getByLabelText("Default split") as HTMLSelectElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Edit Pizza" }));
    const nameInput = screen.getByDisplayValue("Pizza");
    fireEvent.change(nameInput, { target: { value: "Large Pizza" } });
    await act(async () => { fireEvent.keyDown(nameInput, { key: "Enter" }); });

    expect(mockUpdateItem).toHaveBeenCalledWith("s1", "pizza", { name: "Large Pizza" });
  });
});
