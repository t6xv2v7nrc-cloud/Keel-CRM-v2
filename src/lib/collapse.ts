// Cards folded away on this device ("Progress", "Finances" on a client's page): remembered per card, for every client.

import { useCallback, useState } from 'react';

const KEY = 'keel.folded.v1';

function read(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(KEY) ?? '[]') as string[]); } catch { return new Set(); }
}

/** Whether a card is open, and a toggle that remembers the choice on this device. */
export function useFold(card: string): { open: boolean; toggle: () => void } {
  const [open, setOpen] = useState(() => !read().has(card));
  const toggle = useCallback(() => {
    setOpen((was) => {
      const folded = read();
      if (was) folded.add(card); else folded.delete(card);
      try { localStorage.setItem(KEY, JSON.stringify([...folded])); } catch { /* private window: it simply is not remembered */ }
      return !was;
    });
  }, [card]);
  return { open, toggle };
}
