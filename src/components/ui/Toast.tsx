import { createContext, useCallback, useContext, useState } from 'react';
import type { ReactNode } from 'react';

interface Toast {
  id: number;
  message: string;
  tone: 'info' | 'success' | 'danger';
}

interface ToastContextValue {
  toast: (message: string, tone?: Toast['tone']) => void;
}

const ToastContext = createContext<ToastContextValue>({ toast: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

/** Toasts are announced via aria-live (§7.4 accessibility floor). */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback((message: string, tone: Toast['tone'] = 'info') => {
    const id = Date.now();
    setToasts((t) => [...t, { id, message, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed bottom-4 left-1/2 z-50 flex w-[min(420px,92vw)] -translate-x-1/2 flex-col gap-2"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className="rounded-md border px-4 py-3 text-[15px] shadow-[var(--shadow-pop)]"
            style={{
              background: 'var(--surface)',
              borderColor:
                t.tone === 'success' ? 'var(--success)' : t.tone === 'danger' ? 'var(--danger)' : 'var(--line-strong)',
              color:
                t.tone === 'success' ? 'var(--success)' : t.tone === 'danger' ? 'var(--danger)' : 'var(--ink)',
            }}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
