import { createContext, useCallback, useContext, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Icon } from './Icon';

interface Toast {
  id: number;
  message: string;
  tone: 'info' | 'success' | 'danger';
  leaving?: boolean;
}

interface ToastContextValue {
  toast: (message: string, tone?: Toast['tone']) => void;
}

const ToastContext = createContext<ToastContextValue>({ toast: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

const STAY_MS = 4000;
const LEAVE_MS = 200;
const TONE = {
  success: { icon: 'check', fg: 'var(--accent-ink)', mark: 'var(--accent)', markFg: 'var(--on-accent)' },
  danger: { icon: 'alert', fg: 'var(--danger)', mark: 'var(--danger)', markFg: 'var(--surface)' },
  info: { icon: 'sparkle', fg: 'var(--ink)', mark: 'var(--paper-2)', markFg: 'var(--ink)' },
} as const;

/** Toasts rise in at the foot of the screen, say what happened with an icon, and slip away (a bar shows how long
 *  they stay; pointing at one keeps it). Announced via aria-live (§7.4 accessibility floor). */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((t) => t.map((x) => (x.id === id ? { ...x, leaving: true } : x)));
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), LEAVE_MS);
  }, []);

  const toast = useCallback((message: string, tone: Toast['tone'] = 'info') => {
    const id = ++seq.current;
    // the same words again (a double tap): one toast, not two
    setToasts((t) => [...t.filter((x) => x.message !== message), { id, message, tone }].slice(-4));
    setTimeout(() => dismiss(id), tone === 'danger' ? STAY_MS + 2000 : STAY_MS);
  }, [dismiss]);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed bottom-4 left-1/2 z-[1000] flex w-[min(420px,92vw)] -translate-x-1/2 flex-col gap-2">
        {toasts.map((t) => {
          const k = TONE[t.tone];
          return (
            <div key={t.id} role={t.tone === 'danger' ? 'alert' : 'status'}
              className="group pointer-events-auto relative flex items-start gap-3 overflow-hidden rounded-lg border border-[var(--line-strong)] bg-[var(--surface)] py-3 pl-3 pr-2 text-[15px] shadow-[var(--shadow-pop)]"
              style={{ color: k.fg, animation: t.leaving ? `keel-toast-out ${LEAVE_MS}ms ease-in both` : 'keel-toast-in var(--dur-slow) var(--ease-spring) both' }}>
              <span className="mt-px grid h-6 w-6 shrink-0 place-items-center rounded-full" style={{ background: k.mark, color: k.markFg }}>
                <Icon name={k.icon} size={14} strokeWidth={2.4} />
              </span>
              <span className="min-w-0 flex-1 pt-0.5 [overflow-wrap:anywhere]">{t.message}</span>
              <button type="button" onClick={() => dismiss(t.id)} aria-label="Close this message"
                className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-[var(--ink-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--ink)]">
                <Icon name="x" size={14} />
              </button>
              {/* how long it stays */}
              <span aria-hidden className="absolute bottom-0 left-0 h-[3px] w-full origin-left opacity-60 group-hover:[animation-play-state:paused]"
                style={{ background: k.mark === 'var(--paper-2)' ? 'var(--line-strong)' : k.mark, animation: `keel-countdown ${t.tone === 'danger' ? STAY_MS + 2000 : STAY_MS}ms linear both` }} />
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
