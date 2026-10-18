import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardHeader, Icon } from '../../components/ui';
import { useDeals, usePeople, useReceivables, useSettings } from '../../lib/hooks';
import { useFold } from '../../lib/collapse';
import { periodOf, progressIn, targetLines } from '../../lib/targets';
import type { Period, TargetLine } from '../../lib/targets';
import type { Target } from '../../lib/settings';

const isSet = (t: Target) => t.placements > 0 || t.fees > 0;

function usePeriods() {
  const { deals } = useDeals();
  const { receivables } = useReceivables();
  const { settings } = useSettings();
  const t = settings.targets;
  return useMemo(() => (['week', 'month', 'year'] as const).map((key) => {
    const period = periodOf(key);
    return { period, target: t[key], lines: targetLines(t[key], progressIn(period, deals, receivables), period) };
  }), [deals, receivables, t]);
}

/** Home: this week against its target, with a bar for placements and one for fees. */
export function WeeklyTargets() {
  const periods = usePeriods();
  const { isOwner } = usePeople();
  const [week, month, year] = periods;
  if (!isSet(week.target)) {
    // nothing for the week: a quiet prompt, unless monthly or annual targets are already being shown
    if (isSet(month.target) || isSet(year.target)) return null;
    return (
      <Card className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3 text-[14px] text-[var(--ink-muted)]">
        <Icon name="flag" size={16} className="text-[var(--accent)]" />
        <span>No targets yet.</span>
        {isOwner && <Link to="/settings?tab=team#targets" className="text-[var(--link)] hover:underline">Set weekly, monthly and annual targets</Link>}
      </Card>
    );
  }
  return (
    <Card>
      <CardHeader icon="flag" title="Weekly target" sub={week.period.label} help="targets" />
      <PeriodBars period={week.period} lines={week.lines} />
    </Card>
  );
}

/** Home: the month and the year, folded away until opened. */
export function LongerTargets() {
  const periods = usePeriods();
  const fold = useFold('home.targets.longer', false);
  const shown = periods.slice(1).filter((p) => isSet(p.target));
  if (shown.length === 0) return null;
  // folded, the header says where each stands: "October 2026: 3 of 8 · 2026: 41 of 100"
  const summary = shown.map((p) => `${p.period.label}: ${p.lines[0]?.amount ?? ''}`).join(' · ');
  return (
    <Card>
      <CardHeader icon="trend" title="Monthly and annual targets" sub={fold.open ? undefined : summary} help="targets" open={fold.open} onToggle={fold.toggle} />
      {fold.open && shown.map((p) => (
        <div key={p.period.key} className="border-b border-[var(--line)] last:border-b-0">
          <div className="px-5 pt-3 text-[13px] font-semibold uppercase tracking-wide text-[var(--ink-muted)]">{p.period.label}</div>
          <PeriodBars period={p.period} lines={p.lines} />
        </div>
      ))}
    </Card>
  );
}

function PeriodBars({ period, lines }: { period: Period; lines: TargetLine[] }) {
  return (
    <div className="grid gap-5 px-5 py-4 md:grid-cols-2">
      {lines.map((l) => <TargetBar key={l.key} line={l} period={period} />)}
    </div>
  );
}

/** One target: how far, where an even pace would be, and whether that is on track. Colour is never the only sign. */
export function TargetBar({ line, period }: { line: TargetLine; period: Period }) {
  const reached = line.share >= 1;
  const status = reached ? { icon: 'check' as const, text: 'Target reached', color: 'var(--accent-ink)' }
    : line.onTrack ? { icon: 'check' as const, text: 'On track', color: 'var(--accent-ink)' }
    : { icon: 'alert' as const, text: 'Behind pace', color: 'var(--note-fg)' };
  const pct = Math.round(line.share * 100);
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <span className="text-[15px] font-medium text-[var(--ink)]">{line.label}</span>
        <span className="font-mono text-[15px] font-semibold text-[var(--ink)]">{line.amount}</span>
      </div>
      <div className="relative h-3 w-full rounded-full bg-[var(--paper-2)]" role="progressbar" aria-label={`${line.label}, ${period.label}`}
        aria-valuemin={0} aria-valuemax={line.target} aria-valuenow={line.done} aria-valuetext={`${line.amount}, ${status.text}`}
        title={`${line.amount} (${pct}%). An even pace would be ${Math.round(line.pace * 100)}% by now.`}>
        {line.share > 0 && <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `max(${line.share * 100}%, 8px)` }} />}
        {!reached && line.pace > 0 && line.pace < 1 && (
          <span aria-hidden className="absolute -bottom-1 -top-1 w-[2px] rounded bg-[var(--ink-muted)]" style={{ left: `calc(${line.pace * 100}% - 1px)` }} />
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-3 text-[13px]">
        <span className="text-[var(--ink-muted)]">{line.words}</span>
        <span className="inline-flex items-center gap-1 font-medium" style={{ color: status.color }}>
          <Icon name={status.icon} size={13} />{status.text}
        </span>
      </div>
    </div>
  );
}
