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
  open,
  onToggle,
}: {
  title: string;
  sub?: string;
  icon?: IconName;
  help?: HelpTopic;
  children?: ReactNode;
  /** With onToggle, the title folds the card away and opens it again; the summary (sub) stays in view. */
  open?: boolean;
  onToggle?: () => void;
}) {
  const heading = (
    <>
      {icon && <Icon name={icon} size={17} className="shrink-0 text-[var(--accent)]" />}
      <h3 className="m-0 text-[15px] font-semibold text-[var(--ink)]">{title}</h3>
    </>
  );
  return (
    <div className={`flex flex-wrap items-center gap-x-2.5 gap-y-2 px-5 py-3 ${onToggle && !open ? '' : 'border-b border-[var(--line)]'}`}>
      {onToggle ? (
        <button type="button" onClick={onToggle} aria-expanded={!!open} title={open ? `Fold ${title} away` : `Open ${title}`}
          className="-my-1 -ml-1.5 flex min-h-[36px] items-center gap-2.5 rounded-md px-1.5 text-left hover:bg-[var(--surface-2)]">
          <Icon name="chevronDown" size={16} className={`shrink-0 text-[var(--ink-muted)] transition-transform ${open ? '' : '-rotate-90'}`} />
          {heading}
        </button>
      ) : heading}
      {help && <Help topic={help} />}
      {sub && <span className="min-w-0 font-mono text-[13px] text-[var(--ink-muted)]">{sub}</span>}
      {/* on a phone the buttons drop under the title rather than push the page wider; folded away, they are hidden */}
      {children && (!onToggle || open) && <div className="ml-auto flex max-w-full flex-wrap items-center justify-end gap-2">{children}</div>}
    </div>
  );
}
