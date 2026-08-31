import type { Item, Participant, Slurp } from "@slurp/types";
import { computeAllBreakdowns, MAX_PARTICIPANTS } from "@slurp/types";
import { BadRequestError } from "../middleware/errorHandler";

/** The party size is the hard ceiling for portions of any one item. */
export function maxSharesPerItem(slurp: Slurp): number {
  return slurp.expectedGuests != null ? slurp.expectedGuests + 1 : MAX_PARTICIPANTS;
}

export function validatePartySizeChange(slurp: Slurp, expectedGuests: number | undefined): void {
  const maximum = expectedGuests != null ? expectedGuests + 1 : MAX_PARTICIPANTS;
  for (const item of slurp.items) {
    if ((item.shareCount ?? 0) > maximum) {
      throw new BadRequestError(`Guest count cannot be lower than the ${item.shareCount}-way preset for ${item.name}`);
    }
    const claimed = slurp.participants.reduce(
      (sum, participant) => sum + (participant.selectedItemShares?.[item.id] ?? 0),
      0
    );
    if (claimed > maximum) {
      throw new BadRequestError(`Guest count cannot be lower than the ${claimed} shares already claimed for ${item.name}`);
    }
  }
}

export function validateFixedShareClaims(
  slurp: Slurp,
  participantUid: string,
  rawShares: unknown
): Record<string, number> {
  if (rawShares == null || typeof rawShares !== "object" || Array.isArray(rawShares)) {
    throw new BadRequestError("itemShares object is required");
  }
  const itemById = new Map(slurp.items.map((item) => [item.id, item]));
  const itemShares: Record<string, number> = {};
  for (const [id, rawCount] of Object.entries(rawShares as Record<string, unknown>)) {
    if (!itemById.has(id)) throw new BadRequestError(`Unknown item id: ${id}`);
    const item = itemById.get(id)!;
    if (typeof rawCount !== "number" || !Number.isInteger(rawCount) || rawCount < 1 || rawCount > maxSharesPerItem(slurp)) {
      throw new BadRequestError(`Shares for ${id} must be a whole number between 1 and ${maxSharesPerItem(slurp)}`);
    }
    if (item.shareCount != null && rawCount > 1) {
      throw new BadRequestError(`Only open-split items can have multiple shares claimed by one person`);
    }
    itemShares[id] = rawCount;
  }
  for (const item of slurp.items) {
    const othersClaimed = slurp.participants.reduce(
      (sum, participant) => participant.uid === participantUid
        ? sum
        : sum + (participant.selectedItemShares?.[item.id] ?? 0),
      0
    );
    if (othersClaimed + (itemShares[item.id] ?? 0) > maxSharesPerItem(slurp)) {
      throw new BadRequestError(`An item cannot be split more than ${maxSharesPerItem(slurp)} ways`);
    }
  }
  return itemShares;
}

export function validateFixedShareCountChange(slurp: Slurp, item: Item, rawShareCount: unknown): number {
  if (typeof rawShareCount !== "number" || !Number.isInteger(rawShareCount)
      || rawShareCount < 1 || rawShareCount > maxSharesPerItem(slurp)) {
    throw new BadRequestError(`shareCount must be a whole number between 1 and ${maxSharesPerItem(slurp)}`);
  }
  if (slurp.participants.some((participant) => (participant.selectedItemShares?.[item.id] ?? 0) > 1)) {
    throw new BadRequestError(`Cannot set a preset while someone has multiple shares of ${item.name}`);
  }
  return rawShareCount;
}

export function validateFixedConfirmation(
  slurp: Slurp,
  participant: Participant,
  rawRevision: unknown
): void {
  if (slurp.receiptStatus === "pending" || slurp.receiptStatus === "processing") {
    throw new BadRequestError("Wait for receipt processing to finish before confirming");
  }
  const hostRoundingAdjustment = participant.role === "host"
    ? computeAllBreakdowns(slurp).find((entry) => entry.uid === participant.uid)?.roundingAdjustment ?? 0
    : 0;
  if (Object.keys(participant.selectedItemShares ?? {}).length === 0 && hostRoundingAdjustment === 0) {
    throw new BadRequestError("Claim at least one share before confirming");
  }
  validateSplitRevision(slurp, rawRevision);
}

export function allFixedSharesClaimed(slurp: Slurp): boolean {
  return slurp.items.length > 0 && slurp.items.every((item) =>
    slurp.participants.reduce(
      (sum, participant) => sum + (participant.selectedItemShares?.[item.id] ?? 0),
      0
    ) >= (item.shareCount ?? 1)
  );
}

export function isFixedFinanciallyLocked(slurp: Slurp): boolean {
  return slurp.splitVersion === 2 && slurp.participants.some(
    (participant) => participant.status === "confirmed"
  );
}

export function validateSplitRevision(slurp: Slurp, rawRevision: unknown): void {
  if (typeof rawRevision !== "number" || !Number.isInteger(rawRevision)) {
    throw new BadRequestError("splitRevision must be a whole number");
  }
  if (rawRevision !== (slurp.splitRevision ?? 0)) {
    throw new BadRequestError("The split changed. Review your updated total before confirming");
  }
}
