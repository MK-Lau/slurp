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
  total: number;
}

export function computeParticipantBreakdown(
  slurp: Slurp,
  participant: Participant,
  totalSubtotal: number,
  selectorCounts: Map<string, number>
): ParticipantBreakdown {
  const itemMap = new Map(slurp.items.map((i) => [i.id, i]));

  const items: ItemBreakdown[] = participant.selectedItemIds
    .map((id) => {
      const item = itemMap.get(id);
      if (!item) return null;
      const selectors = selectorCounts.get(id) ?? 1;
      return { item, sharePrice: item.price / Math.max(selectors, 1) };
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
