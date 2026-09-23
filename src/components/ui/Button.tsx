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
}

/** Buttons say what they do ("Confirm and update Lubna", not "Submit"). */
export function Button({ variant = 'secondary', className = '', ...rest }: ButtonProps) {
  return (
    <button
      className={`inline-flex min-h-[44px] cursor-pointer items-center justify-center gap-2 px-4 py-2 text-[15px] font-medium transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-40 active:translate-y-px rounded-md ${styles[variant]} ${className}`}
      {...rest}
    />
  );
}
