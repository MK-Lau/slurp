import type { Slurp, Participant, Item } from "./slurp";

export interface ItemBreakdown {
  item: Item;
  sharePrice: number;
}

export interface ParticipantBreakdown {
  email?: string;
  uid: string;
  displayName?: string;
  items: ItemBreakdown[];
  subtotal: number;
  tax: number;
  tip: number;
  /** Residual cents from indivisible fixed shares, assigned to the host. */
  roundingAdjustment?: number;
  total: number;
}

/** Whole cents billed for one configured fixed share of an item. */
export function computeFixedItemShareCents(item: Item, shareCount = item.shareCount ?? 1): number {
  return Math.floor(Math.round(item.price * 100) / Math.max(1, shareCount));
}

export function computeParticipantBreakdown(
  slurp: Slurp,
  participant: Participant,
  totalSubtotal: number,
  selectorCounts: Map<string, number>
): ParticipantBreakdown {
  const itemMap = new Map(slurp.items.map((i) => [i.id, i]));

  const selectedIds = slurp.splitVersion === 2
    ? Object.keys(participant.selectedItemShares ?? {})
    : participant.selectedItemIds;
  const items: ItemBreakdown[] = selectedIds
    .map((id) => {
      const item = itemMap.get(id);
      if (!item) return null;
      const fixedShares = slurp.splitVersion === 2
        ? participant.selectedItemShares?.[id] ?? 0
        : 1;
      const divisor = slurp.splitVersion === 2
        ? fixedShareDivisor(slurp, item)
        : Math.max(selectorCounts.get(id) ?? 1, 1);
      if (fixedShares <= 0) return null;
      return { item, sharePrice: item.price * fixedShares / divisor };
    })
    .filter((x): x is ItemBreakdown => x !== null);

  const subtotal = items.reduce((s, e) => s + e.sharePrice, 0);

  const tax = totalSubtotal > 0 ? (subtotal / totalSubtotal) * slurp.taxAmount : 0;
  const tip = totalSubtotal > 0 ? (subtotal / totalSubtotal) * slurp.tipAmount : 0;

  return {
    ...(participant.email ? { email: participant.email } : {}),
    uid: participant.uid,
    ...(participant.displayName ? { displayName: participant.displayName } : {}),
    items,
    subtotal: Math.round(subtotal * 100) / 100,
    tax: Math.round(tax * 100) / 100,
    tip: Math.round(tip * 100) / 100,
    total: Math.round((subtotal + tax + tip) * 100) / 100,
  };
}

export function computeAllBreakdowns(slurp: Slurp): ParticipantBreakdown[] {
  if (slurp.splitVersion === 2) return computeFixedShareBreakdowns(slurp);

  const itemMap = new Map(slurp.items.map((i) => [i.id, i]));

  // Pre-compute selector counts once — O(P×I) instead of O(P²×I)
  const selectorCounts = new Map<string, number>();
  for (const item of slurp.items) {
    const count = slurp.participants.filter((p) => p.selectedItemIds.includes(item.id)).length;
    selectorCounts.set(item.id, count);
  }

  const totalSubtotal = slurp.participants.reduce((total, p) => {
    return total + p.selectedItemIds.reduce((sum, id) => {
      const item = itemMap.get(id);
      if (!item) return sum;
      return sum + item.price / Math.max(selectorCounts.get(id) ?? 1, 1);
    }, 0);
  }, 0);

  return slurp.participants.map((p) => computeParticipantBreakdown(slurp, p, totalSubtotal, selectorCounts));
}

function computeFixedShareBreakdowns(slurp: Slurp): ParticipantBreakdown[] {
  const subtotalCents = slurp.items.reduce((sum, item) => sum + Math.round(item.price * 100), 0);
  const taxCents = Math.round(slurp.taxAmount * 100);
  const tipCents = Math.round(slurp.tipAmount * 100);
  const allocations = new Map<string, { itemCents: number; taxCents: number; tipCents: number }>();
  let allocatedItemCents = 0;
  let allocatedTaxCents = 0;
  let allocatedTipCents = 0;

  for (const item of slurp.items) {
    const shares = fixedShareDivisor(slurp, item);
    const itemCents = Math.round(item.price * 100);
    const perShareItemCents = computeFixedItemShareCents(item, shares);
    const perShareTaxCents = subtotalCents > 0
      ? Math.floor(itemCents * taxCents / (shares * subtotalCents))
      : 0;
    const perShareTipCents = subtotalCents > 0
      ? Math.floor(itemCents * tipCents / (shares * subtotalCents))
      : 0;
    allocations.set(item.id, {
      itemCents: perShareItemCents,
      taxCents: perShareTaxCents,
      tipCents: perShareTipCents,
    });
    allocatedItemCents += perShareItemCents * shares;
    allocatedTaxCents += perShareTaxCents * shares;
    allocatedTipCents += perShareTipCents * shares;
  }

  const hostAdjustmentCents = subtotalCents > 0
    ? subtotalCents - allocatedItemCents
      + taxCents - allocatedTaxCents
      + tipCents - allocatedTipCents
    : 0;

  return slurp.participants.map((participant) => {
    const items: ItemBreakdown[] = [];
    let participantSubtotalCents = 0;
    let participantTaxCents = 0;
    let participantTipCents = 0;
    for (const [itemId, claimedShares] of Object.entries(participant.selectedItemShares ?? {})) {
      if (claimedShares <= 0) continue;
      const item = slurp.items.find((candidate) => candidate.id === itemId);
      const allocation = allocations.get(itemId);
      if (!item || !allocation) continue;
      const itemShareCents = allocation.itemCents * claimedShares;
      items.push({ item, sharePrice: itemShareCents / 100 });
      participantSubtotalCents += itemShareCents;
      participantTaxCents += allocation.taxCents * claimedShares;
      participantTipCents += allocation.tipCents * claimedShares;
    }
    const roundingAdjustmentCents = participant.role === "host" ? hostAdjustmentCents : 0;
    return {
      ...(participant.email ? { email: participant.email } : {}),
      uid: participant.uid,
      ...(participant.displayName ? { displayName: participant.displayName } : {}),
      items,
      subtotal: participantSubtotalCents / 100,
      tax: participantTaxCents / 100,
      tip: participantTipCents / 100,
      ...(roundingAdjustmentCents > 0 ? { roundingAdjustment: roundingAdjustmentCents / 100 } : {}),
      total: (participantSubtotalCents + participantTaxCents + participantTipCents + roundingAdjustmentCents) / 100,
    };
  });
}

/** A host preset is the initial split, but additional guests may opt in. */
function fixedShareDivisor(slurp: Slurp, item: Item): number {
  const claimedShares = slurp.participants.reduce(
    (sum, participant) => sum + (participant.selectedItemShares?.[item.id] ?? 0),
    0
  );
  return Math.max(1, item.shareCount ?? 0, claimedShares);
}
