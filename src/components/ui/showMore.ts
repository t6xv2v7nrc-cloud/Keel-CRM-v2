import { useEffect, useRef, useState } from 'react';

/** Long lists draw their first rows at once and the rest as you scroll near the end, so a page opens quickly however
 *  many clients or properties there are. Put `ref` on an element after the last row shown (it is only needed while
 *  there are more); `showAll` draws the lot (before printing, say). */
export function useShowMore(total: number, first = 40, step = 60) {
  const [limit, setLimit] = useState(first);
  const ref = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || limit >= total || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver((seen) => { if (seen.some((s) => s.isIntersecting)) setLimit((l) => l + step); }, { rootMargin: '800px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [limit, total, step]);
  return { limit, more: total > limit, ref: (el: HTMLElement | null) => { ref.current = el; }, showAll: () => setLimit(Number.MAX_SAFE_INTEGER) };
}
