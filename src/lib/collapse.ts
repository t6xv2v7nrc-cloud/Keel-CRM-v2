// Cards folded away on this device ("Progress", "Finances" on a client's page): remembered per card, for every client.
// Some cards start folded (the monthly and annual targets); opening one is remembered the same way.

import { useCallback, useEffect, useState } from 'react';

const KEY = 'keel.folded.v1';
const OPENED_KEY = 'keel.unfolded.v1'; // cards that start folded but were opened
const EVENT = 'keel:open-card';

function read(key: string): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(key) ?? '[]') as string[]); } catch { return new Set(); }
}
function write(key: string, set: Set<string>) {
  try { localStorage.setItem(key, JSON.stringify([...set])); } catch { /* private window: it simply is not remembered */ }
}
function remember(card: string, open: boolean) {
  const folded = read(KEY);
  const opened = read(OPENED_KEY);
  if (open) { folded.delete(card); opened.add(card); } else { folded.add(card); opened.delete(card); }
  write(KEY, folded);
  write(OPENED_KEY, opened);
}

/** Open a card from elsewhere ("Edit details" opens the folded Client details). */
export function openCard(card: string) {
  remember(card, true);
  window.dispatchEvent(new CustomEvent(EVENT, { detail: card }));
}

/** Whether a card is open, and a toggle that remembers the choice on this device. */
export function useFold(card: string, startsOpen = true): { open: boolean; toggle: () => void } {
  const [open, setOpen] = useState(() => (startsOpen ? !read(KEY).has(card) : read(OPENED_KEY).has(card)));
  useEffect(() => {
    const onOpen = (e: Event) => { if ((e as CustomEvent<string>).detail === card) setOpen(true); };
    window.addEventListener(EVENT, onOpen);
    return () => window.removeEventListener(EVENT, onOpen);
  }, [card]);
  const toggle = useCallback(() => {
    setOpen((was) => { remember(card, !was); return !was; });
  }, [card]);
  return { open, toggle };
}
