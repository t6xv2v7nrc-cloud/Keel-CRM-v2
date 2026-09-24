// Visual building blocks: avatars, page headers, stat tiles and small SVG
// charts. Plain SVG on the design tokens, so every chart follows the theme.

import type { ReactNode } from 'react';
import { Icon } from './Icon';
import type { IconName } from './Icon';
import { Help } from './Help';
import type { HelpTopic } from '../../lib/help';

// ── Avatar ─────────────────────────────────────────────────────────

const initialsOf = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || '·';

/** Initials in a warm grey disc; `accent` rings it green (e.g. Tier 1). */
export function Avatar({ name, size = 36, accent = false }: { name: string; size?: number; accent?: boolean }) {
  return (
    <span
      aria-hidden
      className="grid shrink-0 place-items-center rounded-full font-semibold"
      style={{
        width: size, height: size, fontSize: Math.round(size * 0.38),
        background: accent ? 'var(--accent-soft)' : 'var(--paper-2)',
        color: accent ? 'var(--accent-ink)' : 'var(--ink-muted)',
        boxShadow: accent ? 'inset 0 0 0 2px var(--accent)' : 'inset 0 0 0 1px var(--line)',
      }}
    >
      {initialsOf(name)}
    </span>
  );
}

// ── Page header ────────────────────────────────────────────────────

export function PageHeader({ icon, title, sub, help, children }: {
  icon: IconName; title: string; sub?: ReactNode; help?: HelpTopic; children?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-center gap-3.5">
        <span className="grid h-11 w-11 place-items-center rounded-xl bg-[var(--surface)] text-[var(--accent)] shadow-[var(--shadow-card)]">
          <Icon name={icon} size={22} />
        </span>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="m-0 text-[28px] font-bold leading-tight text-[var(--ink)]">{title}</h1>
            {help && <Help topic={help} />}
          </div>
          {sub && <p className="m-0 mt-0.5 text-[15px] text-[var(--ink-muted)]">{sub}</p>}
        </div>
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </header>
  );
}

// ── Stat tile ──────────────────────────────────────────────────────

export function StatTile({ icon, label, value, hint, accent = false, children }: {
  icon: IconName; label: string; value: ReactNode; hint?: ReactNode; accent?: boolean; children?: ReactNode;
}) {
  return (
    <div className="flex h-full flex-col gap-2 rounded-lg border border-[var(--line)] bg-[var(--surface)] p-4 shadow-[var(--shadow-card)] transition-shadow hover:shadow-[var(--shadow-pop)]">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] font-medium text-[var(--ink-muted)]">{label}</span>
        <span className={`grid h-8 w-8 place-items-center rounded-lg ${accent ? 'bg-[var(--accent)] text-[var(--on-accent)]' : 'bg-[var(--paper-2)] text-[var(--ink-muted)]'}`}>
          <Icon name={icon} size={16} />
        </span>
      </div>
      <div className="font-[var(--font-display)] text-[30px] font-bold leading-none text-[var(--ink)]">{value}</div>
      {hint && <div className="text-[13px] text-[var(--ink-muted)]">{hint}</div>}
      {children}
    </div>
  );
}

// ── Charts ─────────────────────────────────────────────────────────

export interface Slice { label: string; value: number; color: string }

/** Ring chart with the total in the middle. */
export function Donut({ slices, size = 140, thickness = 18, centre, centreSub }: {
  slices: Slice[]; size?: number; thickness?: number; centre?: ReactNode; centreSub?: string;
}) {
  const total = slices.reduce((s, x) => s + x.value, 0);
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--paper-2)" strokeWidth={thickness} />
        {total > 0 && slices.map((s) => {
          const len = (s.value / total) * c;
          const el = (
            <circle key={s.label} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={s.color} strokeWidth={thickness}
              strokeDasharray={`${Math.max(0, len - 2)} ${c}`} strokeDashoffset={-offset} strokeLinecap="butt" />
          );
          offset += len;
          return el;
        })}
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <div className="font-[var(--font-display)] text-[26px] font-bold leading-none text-[var(--ink)]">{centre ?? total}</div>
          {centreSub && <div className="mt-1 text-[12px] text-[var(--ink-muted)]">{centreSub}</div>}
        </div>
      </div>
    </div>
  );
}

/** Legend rows for a Donut. */
export function Legend({ slices, onPick }: { slices: Slice[]; onPick?: (label: string) => void }) {
  const total = slices.reduce((s, x) => s + x.value, 0) || 1;
  return (
    <ul className="m-0 flex min-w-0 flex-1 list-none flex-col gap-2 p-0">
      {slices.map((s) => (
        <li key={s.label}>
          <button onClick={() => onPick?.(s.label)} disabled={!onPick}
            className="flex w-full items-center gap-2.5 rounded-md px-1.5 py-1 text-left enabled:hover:bg-[var(--surface-2)]">
            <span aria-hidden className="h-3 w-3 shrink-0 rounded-sm" style={{ background: s.color }} />
            <span className="flex-1 text-[15px] text-[var(--ink)]">{s.label}</span>
            <span className="font-mono text-[15px] text-[var(--ink)]">{s.value}</span>
            <span className="w-10 text-right font-mono text-[13px] text-[var(--ink-muted)]">{Math.round((s.value / total) * 100)}%</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

export interface DayBar { label: string; sub?: string; value: number; highlight?: number; today?: boolean }

/** Vertical bars, one per day. `highlight` is the part drawn in the accent
 *  (e.g. answered calls), the rest in grey. */
export function DayBars({ bars, height = 120 }: { bars: DayBar[]; height?: number }) {
  const max = Math.max(1, ...bars.map((b) => b.value));
  return (
    <div className="flex items-end gap-1.5" style={{ height: height + 34 }}>
      {bars.map((b) => {
        const h = (b.value / max) * height;
        const hh = ((b.highlight ?? 0) / max) * height;
        return (
          <div key={b.label + (b.sub ?? '')} className="flex min-w-0 flex-1 flex-col items-center gap-1" title={`${b.sub ?? b.label}: ${b.value}`}>
            <span className="font-mono text-[11px] text-[var(--ink-muted)]">{b.value || ''}</span>
            <div className="flex w-full max-w-[28px] flex-col justify-end border-b-2 border-[var(--paper-2)]" style={{ height }}>
              <div className="w-full overflow-hidden rounded-t-[5px]">
                <div className="w-full bg-[var(--ink-faint)] opacity-50" style={{ height: Math.max(0, h - hh) }} />
                <div className="w-full bg-[var(--accent)]" style={{ height: hh }} />
              </div>
            </div>
            <span className={`text-[11px] ${b.today ? 'font-semibold text-[var(--accent-ink)]' : 'text-[var(--ink-muted)]'}`}>{b.label}</span>
          </div>
        );
      })}
    </div>
  );
}

/** Horizontal meter: a labelled bar, used for funnels and breakdowns. */
export function Meter({ label, value, max, accent = false, onClick, right }: {
  label: ReactNode; value: number; max: number; accent?: boolean; onClick?: () => void; right?: ReactNode;
}) {
  const pct = max ? Math.max(value ? 3 : 0, (value / max) * 100) : 0;
  const body = (
    <>
      <span className="w-28 shrink-0 text-left text-[15px] text-[var(--ink)]">{label}</span>
      <span className="relative h-2.5 flex-1 overflow-hidden rounded-full bg-[var(--paper-2)]">
        <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${pct}%`, background: accent ? 'var(--accent)' : 'var(--ink-faint)' }} />
      </span>
      <span className="w-10 shrink-0 text-right font-mono text-[15px] text-[var(--ink)]">{right ?? value}</span>
    </>
  );
  return onClick ? (
    <button onClick={onClick} className="flex w-full items-center gap-3 rounded-md px-2 py-1.5 hover:bg-[var(--surface-2)]">{body}</button>
  ) : (
    <div className="flex w-full items-center gap-3 px-2 py-1.5">{body}</div>
  );
}

/** Tiny trend line for a stat tile. */
export function Sparkline({ values, width = 120, height = 32 }: { values: number[]; width?: number; height?: number }) {
  if (values.length < 2) return null;
  const max = Math.max(1, ...values);
  const step = width / (values.length - 1);
  const pts = values.map((v, i) => `${(i * step).toFixed(1)},${(height - 2 - (v / max) * (height - 4)).toFixed(1)}`);
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} preserveAspectRatio="none" aria-hidden>
      <polyline points={`0,${height} ${pts.join(' ')} ${width},${height}`} fill="var(--accent-soft)" stroke="none" />
      <polyline points={pts.join(' ')} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** A friendly empty state with an icon. */
export function Empty({ icon, title, children }: { icon: IconName; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-full bg-[var(--paper-2)] text-[var(--ink-muted)]"><Icon name={icon} size={22} /></span>
      <div className="text-[15px] font-medium text-[var(--ink)]">{title}</div>
      {children && <div className="max-w-[420px] text-[13px] text-[var(--ink-muted)]">{children}</div>}
    </div>
  );
}

/** Urgent flag: inverted ink, so it stands out without another colour. */
export function UrgentChip({ label = 'Urgent' }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[12px] font-semibold uppercase tracking-wide"
      style={{ background: 'var(--urgent-bg)', color: 'var(--urgent-fg)' }} title={label}>
      <Icon name="alert" size={12} strokeWidth={2.2} /> Urgent
    </span>
  );
}
