import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'brass';

const styles: Record<Variant, string> = {
  primary:
    'bg-[var(--accent)] text-[var(--on-accent)] border border-[var(--accent)] hover:bg-[var(--accent-strong)] hover:border-[var(--accent-strong)]',
  secondary:
    'bg-[var(--surface)] text-[var(--ink)] border border-[var(--line-strong)] hover:border-[var(--accent)]',
  ghost:
    'bg-transparent text-[var(--ink-muted)] border border-transparent hover:text-[var(--ink)] hover:border-[var(--line)]',
  danger:
    'bg-transparent text-[var(--danger)] border border-[var(--danger)] hover:bg-[var(--danger-soft)]',
  // same as primary now there is one accent; kept so existing call sites work
  brass:
    'bg-[var(--accent)] text-[var(--on-accent)] border border-[var(--accent)] hover:bg-[var(--accent-strong)] hover:border-[var(--accent-strong)]',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  /** working on it: a small spinner, and no second press */
  busy?: boolean;
}

/** Buttons say what they do ("Confirm and update Lubna", not "Submit"). They lift a little under the pointer, give
 *  under a press (index.css), and spin while busy. */
export function Button({ variant = 'secondary', className = '', busy = false, disabled, children, ...rest }: ButtonProps) {
  const lifts = variant === 'primary' || variant === 'secondary' || variant === 'brass';
  return (
    <button
      className={`inline-flex min-h-[44px] cursor-pointer items-center justify-center gap-2 px-4 py-2 text-[15px] font-medium transition-all duration-200 ease-[var(--ease-out)] disabled:cursor-not-allowed disabled:opacity-40 rounded-md ${lifts ? 'enabled:hover:-translate-y-px enabled:hover:shadow-[var(--shadow-card)]' : ''} ${styles[variant]} ${className}`}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      {...rest}
    >
      {busy && <Spinner />}
      {children}
    </button>
  );
}

/** A small spinner in the colour of the text around it. */
export function Spinner({ size = 14 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden className="keel-spin shrink-0">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="3" opacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
