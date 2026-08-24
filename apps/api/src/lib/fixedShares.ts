import type { Item, Participant, Slurp } from "@slurp/types";
import { computeAllBreakdowns, MAX_PARTICIPANTS } from "@slurp/types";
import { BadRequestError } from "../middleware/errorHandler";

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
    if (typeof rawCount !== "number" || !Number.isInteger(rawCount) || rawCount < 1 || rawCount > MAX_PARTICIPANTS) {
      throw new BadRequestError(`Shares for ${id} must be a whole number between 1 and ${MAX_PARTICIPANTS}`);
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
    if (othersClaimed + (itemShares[item.id] ?? 0) > (item.shareCount ?? 1)) {
      throw new BadRequestError(`Not enough shares remaining for ${item.name}`);
    }
  }
  return itemShares;
}

export function validateFixedShareCountChange(slurp: Slurp, item: Item, rawShareCount: unknown): number {
  if (typeof rawShareCount !== "number" || !Number.isInteger(rawShareCount)
      || rawShareCount < 1 || rawShareCount > MAX_PARTICIPANTS) {
    throw new BadRequestError(`shareCount must be a whole number between 1 and ${MAX_PARTICIPANTS}`);
  }
  const claimed = slurp.participants.reduce(
    (sum, participant) => sum + (participant.selectedItemShares?.[item.id] ?? 0),
    0
  );
  if (rawShareCount < claimed) {
    throw new BadRequestError(`Cannot reduce below ${claimed} already claimed shares`);
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
    ) === (item.shareCount ?? 1)
  );
}

export function isFixedFinanciallyLocked(slurp: Slurp): boolean {
  return slurp.splitVersion === 2 && slurp.participants.some(
    (participant) => participant.status === "confirmed" || participant.paid
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
