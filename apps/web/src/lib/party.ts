import type { Slurp } from "@slurp/types";

export interface PartyStatus {
  /** Participants actually on the slurp, host included. */
  joined: number;
  confirmed: number;
  /** expectedGuests + 1 for the host. Undefined when the host hasn't specified a count. */
  expectedTotal?: number;
  /** People the host expects who haven't joined yet. 0 when unspecified or over-subscribed. */
  missing: number;
  incomplete: boolean;
}

export function partyStatus(
  slurp: Pick<Slurp, "participants" | "expectedGuests">
): PartyStatus {
  const joined = slurp.participants.length;
  const confirmed = slurp.participants.filter((p) => p.status === "confirmed").length;
  const expectedTotal =
    slurp.expectedGuests != null ? slurp.expectedGuests + 1 : undefined;
  const missing = expectedTotal != null ? Math.max(0, expectedTotal - joined) : 0;

  return {
    joined,
    confirmed,
    ...(expectedTotal != null ? { expectedTotal } : {}),
    missing,
    incomplete: missing > 0,
  };
}
