// The order of the cards on a client's page. Each person arranges their own (a personal setting, so it follows them
// from phone to computer). Cards added to Keel later appear in their standard place for everyone.

export const CLIENT_CARDS = [
  { key: 'notes', label: 'Notes and contact' },
  { key: 'progress', label: 'Progress' },
  { key: 'finances', label: 'Finances' },
  { key: 'suitable', label: 'Suitable properties' },
  { key: 'details', label: 'Client details' },
  { key: 'nextstep', label: 'Next step' },
  { key: 'timeline', label: 'Timeline' },
] as const;
export type ClientCard = (typeof CLIENT_CARDS)[number]['key'];

const STANDARD: ClientCard[] = CLIENT_CARDS.map((c) => c.key);
const isCard = (k: string): k is ClientCard => (STANDARD as string[]).includes(k);

/** The cards in this person's order: the ones they placed first, then any others in their standard place. */
export function cardOrder(saved: readonly string[]): ClientCard[] {
  const placed = [...new Set(saved.filter(isCard))];
  const out = [...placed];
  for (const k of STANDARD) {
    if (out.includes(k)) continue;
    // a card they never placed goes after the card it follows as standard
    const before = STANDARD.slice(0, STANDARD.indexOf(k)).reverse().find((x) => out.includes(x));
    out.splice(before ? out.indexOf(before) + 1 : 0, 0, k);
  }
  return out;
}

/** One card moved up (-1) or down (+1). */
export function moveCard(order: ClientCard[], key: ClientCard, by: -1 | 1): ClientCard[] {
  const i = order.indexOf(key);
  const j = i + by;
  if (i < 0 || j < 0 || j >= order.length) return order;
  const out = [...order];
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}

export const isStandardOrder = (order: readonly string[]) => cardOrder(order).join() === STANDARD.join();
