import { partyStatus } from "./party";
import type { Participant } from "@slurp/types";

function participant(uid: string, status: Participant["status"] = "pending"): Participant {
  return { uid, role: uid === "host" ? "host" : "guest", status, selectedItemIds: [] };
}

describe("partyStatus", () => {
  it("reports no expected total when expectedGuests is unset", () => {
    const s = partyStatus({ participants: [participant("host")] });
    expect(s.expectedTotal).toBeUndefined();
    expect(s.missing).toBe(0);
    expect(s.incomplete).toBe(false);
  });

  it("adds the host to expectedGuests to get the expected total", () => {
    const s = partyStatus({ participants: [participant("host")], expectedGuests: 4 });
    expect(s.expectedTotal).toBe(5);
  });

  it("counts the people still missing", () => {
    const s = partyStatus({
      participants: [participant("host"), participant("a"), participant("b")],
      expectedGuests: 4,
    });
    expect(s.joined).toBe(3);
    expect(s.missing).toBe(2);
    expect(s.incomplete).toBe(true);
  });

  it("is complete when everyone expected has joined", () => {
    const s = partyStatus({
      participants: [participant("host"), participant("a")],
      expectedGuests: 1,
    });
    expect(s.missing).toBe(0);
    expect(s.incomplete).toBe(false);
  });

  it("clamps missing to zero when more people joined than expected", () => {
    const s = partyStatus({
      participants: [participant("host"), participant("a"), participant("b")],
      expectedGuests: 1,
    });
    expect(s.missing).toBe(0);
    expect(s.incomplete).toBe(false);
  });

  it("treats expectedGuests of 0 as a host-only party", () => {
    const s = partyStatus({ participants: [participant("host")], expectedGuests: 0 });
    expect(s.expectedTotal).toBe(1);
    expect(s.incomplete).toBe(false);
  });

  it("counts confirmed participants", () => {
    const s = partyStatus({
      participants: [
        participant("host", "confirmed"),
        participant("a", "confirmed"),
        participant("b"),
      ],
      expectedGuests: 2,
    });
    expect(s.confirmed).toBe(2);
    expect(s.joined).toBe(3);
    expect(s.incomplete).toBe(false);
  });
});
