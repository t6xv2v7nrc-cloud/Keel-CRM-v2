import { Children, createContext, isValidElement, useContext } from 'react';
import type { HTMLAttributes, ReactNode } from 'react';
import { Icon } from './Icon';
import type { IconName } from './Icon';
import { Help } from './Help';
import type { HelpTopic } from '../../lib/help';
import { useFold } from '../../lib/collapse';

// A card given a `fold` name folds away from its header and stays as left on this device. Folded, only its
// CardHeader (a direct child) shows, with its summary; a card inside it is its own card and does not fold with it.
const FoldContext = createContext<{ open: boolean; toggle: () => void } | null>(null);

type CardProps = HTMLAttributes<HTMLDivElement> & {
  /** a name to remember the fold by on this device ("home.week"), which makes the card fold */
  fold?: string;
  /** folded until opened (then remembered open) */
  startsFolded?: boolean;
};

const cardClass = 'rounded-lg border border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow-card)]';

export function Card({ className = '', fold, startsFolded, ...rest }: CardProps) {
  if (fold) return <FoldingCard fold={fold} startsFolded={startsFolded} className={className} {...rest} />;
  return (
    <FoldContext.Provider value={null}>
      <div className={`${cardClass} ${className}`} {...rest} />
    </FoldContext.Provider>
  );
}

function FoldingCard({ fold, startsFolded = false, className = '', children, ...rest }: Omit<CardProps, 'fold'> & { fold: string }) {
  const f = useFold(fold, !startsFolded);
  const shown = f.open ? children : Children.toArray(children).filter((c) => isValidElement(c) && c.type === CardHeader);
  return (
    <FoldContext.Provider value={f}>
      <div className={`${cardClass} ${className}`} {...rest}>{shown}</div>
    </FoldContext.Provider>
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
  sub?: ReactNode;
  icon?: IconName;
  help?: HelpTopic;
  children?: ReactNode;
  /** With onToggle, the title folds the card away and opens it again; the summary (sub) stays in view. A card
   *  with a `fold` name does this by itself. */
  open?: boolean;
  onToggle?: () => void;
}) {
  const ctx = useContext(FoldContext);
  const toggle = onToggle ?? ctx?.toggle;
  const isOpen = onToggle ? !!open : ctx ? ctx.open : true;
  const heading = (
    <>
      {icon && <Icon name={icon} size={17} className="shrink-0 text-[var(--accent)]" />}
      <h3 className="m-0 text-[15px] font-semibold text-[var(--ink)]">{title}</h3>
    </>
  );
  return (
    <div className={`flex flex-wrap items-center gap-x-2.5 gap-y-2 px-5 py-3 ${toggle && !isOpen ? '' : 'border-b border-[var(--line)]'}`}>
      {toggle ? (
        <button type="button" onClick={toggle} aria-expanded={isOpen} title={isOpen ? `Fold ${title} away` : `Open ${title}`}
          className="-my-1 -ml-1.5 flex min-h-[36px] items-center gap-2.5 rounded-md px-1.5 text-left hover:bg-[var(--surface-2)]">
          <Icon name="chevronDown" size={16} className={`shrink-0 text-[var(--ink-muted)] transition-transform ${isOpen ? '' : '-rotate-90'}`} />
          {heading}
        </button>
      ) : heading}
      {help && <Help topic={help} />}
      {sub && <span className="min-w-0 font-mono text-[13px] text-[var(--ink-muted)]">{sub}</span>}
      {/* on a phone the buttons drop under the title rather than push the page wider; folded away, they are hidden */}
      {children && (!toggle || isOpen) && <div className="ml-auto flex max-w-full flex-wrap items-center justify-end gap-2">{children}</div>}
    </div>
  );
}
