import type { InputHTMLAttributes } from 'react';
import { useId } from 'react';

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
  mono?: boolean;
}

/** Labelled input on the token system. `mono` for phone numbers, postcodes, money. */
export function Field({ label, hint, mono = false, className = '', ...rest }: FieldProps) {
  const id = useId();
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <label htmlFor={id} className="text-[13px] font-medium text-[var(--ink-muted)]">
        {label}
      </label>
      <input
        id={id}
        className={`min-h-[44px] rounded-md border border-[var(--line-strong)] bg-[var(--surface)] px-3 py-2 text-[15px] text-[var(--ink)] transition-colors focus:border-[var(--hull)] ${mono ? 'font-mono' : ''}`}
        {...rest}
      />
      {hint && <span className="text-[13px] text-[var(--ink-muted)]">{hint}</span>}
    </div>
  );
}
