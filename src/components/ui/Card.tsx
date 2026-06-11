import type { HTMLAttributes } from 'react';

export function Card({ className = '', ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`rounded-lg border border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow-card)] ${className}`}
      {...rest}
    />
  );
}

export function CardHeader({
  title,
  sub,
  children,
}: {
  title: string;
  sub?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 border-b border-[var(--line)] px-5 py-3">
      <h3 className="m-0 text-[15px] font-semibold text-[var(--ink)]">{title}</h3>
      {sub && <span className="font-mono text-[13px] text-[var(--ink-muted)]">{sub}</span>}
      {children && <div className="ml-auto flex items-center gap-2">{children}</div>}
    </div>
  );
}
