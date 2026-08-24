import type { Slurp } from "@slurp/types";
import { MAX_PARTICIPANTS } from "@slurp/types";
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
    const count = Number(rawCount);
    if (!Number.isInteger(count) || count < 1 || count > MAX_PARTICIPANTS) {
      throw new BadRequestError(`Shares for ${id} must be a whole number between 1 and ${MAX_PARTICIPANTS}`);
    }
    itemShares[id] = count;
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

export function allFixedSharesClaimed(slurp: Slurp): boolean {
  return slurp.items.every((item) =>
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
  const requestedRevision = Number(rawRevision);
  if (!Number.isInteger(requestedRevision) || requestedRevision !== (slurp.splitRevision ?? 0)) {
    throw new BadRequestError("The split changed. Review your updated total before confirming");
  }
}
