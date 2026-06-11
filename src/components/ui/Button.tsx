import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'brass';

const styles: Record<Variant, string> = {
  primary:
    'bg-[var(--hull)] text-white border border-[var(--hull)] hover:opacity-90',
  secondary:
    'bg-[var(--surface)] text-[var(--ink)] border border-[var(--line-strong)] hover:border-[var(--hull)]',
  ghost:
    'bg-transparent text-[var(--ink-muted)] border border-transparent hover:text-[var(--ink)] hover:border-[var(--line)]',
  danger:
    'bg-transparent text-[var(--danger)] border border-[var(--danger)] hover:bg-[var(--danger)] hover:text-white',
  brass:
    'bg-[var(--brass)] text-[var(--brass-text)] border border-[var(--brass)] hover:opacity-90',
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
