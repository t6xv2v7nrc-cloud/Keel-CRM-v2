import type { HTMLAttributes, ReactNode } from 'react';
import { Icon } from './Icon';
import type { IconName } from './Icon';
import { Help } from './Help';
import type { HelpTopic } from '../../lib/help';

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
  icon,
  help,
  children,
}: {
  title: string;
  sub?: string;
  icon?: IconName;
  help?: HelpTopic;
  children?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-2.5 border-b border-[var(--line)] px-5 py-3">
      {icon && <Icon name={icon} size={17} className="text-[var(--accent)]" />}
      <h3 className="m-0 text-[15px] font-semibold text-[var(--ink)]">{title}</h3>
      {help && <Help topic={help} />}
      {sub && <span className="font-mono text-[13px] text-[var(--ink-muted)]">{sub}</span>}
      {children && <div className="ml-auto flex items-center gap-2">{children}</div>}
    </div>
  );
}
