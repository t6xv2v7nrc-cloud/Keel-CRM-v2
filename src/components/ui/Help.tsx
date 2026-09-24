import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { HELP } from '../../lib/help';
import type { HelpTopic } from '../../lib/help';

const WIDTH = 300;

/** A small "?" button that opens a short explanation. Pass a topic from
 *  lib/help.ts, or your own title and text. The panel is drawn on top of the
 *  page, so it is never cut off by a scrolling table or card. */
export function Help({ topic, title, children }: { topic?: HelpTopic; title?: string; children?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const id = useId();
  const entry = topic ? HELP[topic] : null;
  const heading = title ?? entry?.title ?? 'Help';

  useLayoutEffect(() => {
    if (!open || !button.current) return;
    const r = button.current.getBoundingClientRect();
    const left = Math.min(Math.max(8, r.left - 12), window.innerWidth - WIDTH - 8);
    const height = panel.current?.offsetHeight ?? 160;
    const below = r.bottom + 8;
    setPos({ left, top: below + height > window.innerHeight - 8 ? Math.max(8, r.top - height - 8) : below });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!panel.current?.contains(t) && !button.current?.contains(t)) close();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { close(); button.current?.focus(); } };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [open]);

  return (
    <>
      <button
        ref={button}
        type="button"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen((o) => !o); }}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-label={`Help: ${heading}`}
        title="What is this?"
        className={`inline-grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full border align-middle font-[var(--font-body)] text-[11px] font-bold leading-none transition-colors ${
          open ? 'border-[var(--accent)] bg-[var(--accent)] text-[var(--on-accent)]'
            : 'border-[var(--line-strong)] bg-[var(--surface)] text-[var(--ink-muted)] hover:border-[var(--accent)] hover:text-[var(--accent-ink)]'}`}
      >
        ?
      </button>
      {open && createPortal(
        <div
          ref={panel}
          id={id}
          role="dialog"
          aria-label={heading}
          style={{ left: pos?.left ?? -9999, top: pos?.top ?? -9999, width: WIDTH }}
          className="fixed z-[60] max-w-[calc(100vw-16px)] rounded-lg border border-[var(--line-strong)] bg-[var(--surface)] p-4 text-left shadow-[var(--shadow-pop)]"
        >
          <div className="mb-1.5 flex items-start justify-between gap-3">
            <span className="text-[15px] font-semibold text-[var(--ink)]">{heading}</span>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close help"
              className="-mr-1 -mt-1 rounded px-1.5 text-[15px] leading-none text-[var(--ink-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--ink)]">×</button>
          </div>
          <div className="flex flex-col gap-2 text-[13px] leading-relaxed text-[var(--ink)]">
            {children ?? entry?.body.map((p, i) => <p key={i} className="m-0">{p}</p>)}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
