import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardHeader, PageHeader, StatTile } from '../../components/ui';
import {
  useApplicants, useDeals, useOfficerSends, useOfficers, usePlacements, useProperties, useProviders, useReceivables,
} from '../../lib/hooks';
import { money } from '../../lib/format';
import { listHealth } from '../../lib/councils';
import type { HealthKey } from '../../lib/councils';
import { nominationsFrom } from '../../lib/mailer';
import { goalLines, kpiPeriod, kpisFor, percent, recentWeeks } from '../../lib/kpis';
import type { Count, KpiData } from '../../lib/kpis';
import { activeSettings } from '../../lib/settings';
import { TargetBar } from './Targets';

const HEALTH: Array<{ key: HealthKey; label: string; warn: boolean }> = [
  { key: 'sendable', label: 'Can be emailed', warn: false },
  { key: 'notOptedIn', label: 'Not opted in', warn: true },
  { key: 'bounced', label: 'Bounced', warn: true },
  { key: 'overSent', label: 'Sent to twice in 30 days', warn: true },
  { key: 'left', label: 'Left', warn: false },
  { key: 'onLeave', label: 'On leave', warn: false },
  { key: 'optedOut', label: 'Opted out', warn: false },
];

/** Weekly numbers (Step 8): placements, viewings, losses, money, LHA, replies and the officer list, a week at a time. */
export function NumbersPage() {
  const { deals } = useDeals();
  const { data: applicants = [] } = useApplicants();
  const { placements } = usePlacements();
  const { receivables } = useReceivables();
  const { providers } = useProviders();
  const { data: properties = [] } = useProperties();
  const sends = useOfficerSends();
  const { officers } = useOfficers();
  const [pick, setPick] = useState('week-0');

  const data: KpiData = useMemo(() => ({ deals, applicants, placements, receivables, providers, properties, sends }),
    [deals, applicants, placements, receivables, providers, properties, sends]);
  const [kind, back] = pick.split('-') as ['week' | 'month', string];
  const period = useMemo(() => kpiPeriod(kind, Number(back)), [kind, back]);
  const k = useMemo(() => kpisFor(period, data), [period, data]);
  const month = useMemo(() => kpiPeriod('month', 0), []);
  const goal = useMemo(() => goalLines(month, data), [month, data]);
  const fromClients = useMemo(() => nominationsFrom(applicants), [applicants]);
  const health = useMemo(() => listHealth(officers, sends, { nominatedFromClients: fromClients }), [officers, sends, fromClients]);
  const rules = activeSettings().responses;

  return (
    <div className="mx-auto flex max-w-[1120px] flex-col gap-5 p-4 pb-24 sm:p-6">
      <PageHeader icon="trend" title="Weekly numbers" help="numbers" sub={period.label}>
        <select value={pick} onChange={(e) => setPick(e.target.value)} aria-label="Which week or month"
          className="h-10 max-w-full rounded-md border border-[var(--line-strong)] bg-[var(--surface)] px-2 text-[15px] text-[var(--ink)]">
          {recentWeeks().map(({ back: b, period: p }) => <option key={`week-${b}`} value={`week-${b}`}>{b === 0 ? 'This week' : b === 1 ? 'Last week' : p.label}</option>)}
          <option value="month-0">This month</option>
          <option value="month-1">Last month</option>
        </select>
      </PageHeader>

      {goal.length > 0 && (
        <Card fold="numbers.month">
          <CardHeader icon="flag" title={`${month.label} goal`} help="numbers" />
          <div className="grid gap-5 px-5 py-4 md:grid-cols-2">
            {goal.map((l) => <TargetBar key={l.key} line={l} period={month} />)}
          </div>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile icon="home" label="Placements" value={k.placements} hint={`${k.incentive.placements} with an incentive`} accent={k.placements > 0} />
        <StatTile icon="calendar" label="Viewings per placement" value={k.viewingsPerPlacement ?? '·'} hint={`${k.viewings} ${k.viewings === 1 ? 'viewing' : 'viewings'} took place`} />
        <StatTile icon="pound" label="Incentive per placement" value={k.incentive.perPlacement !== null ? money(k.incentive.perPlacement) : '·'}
          hint={k.incentive.placements ? `${money(k.incentive.total)} in all` : 'No incentive placements'} />
        <StatTile icon="file" label="Split in writing" value={percent(k.incentive.inWritingShare)}
          hint={k.incentive.placements ? `${k.incentive.inWriting} of ${k.incentive.placements} incentive placements` : 'Of incentive placements'} />
        <StatTile icon="clock" label="Sign up to cash" value={k.signUpToCash.days !== null ? `${k.signUpToCash.days} days` : '·'}
          hint={k.signUpToCash.count ? `Middle of ${k.signUpToCash.count} paid` : 'Nothing paid in this period'} />
        <StatTile icon="building" label="Sent within LHA" value={percent(k.withinLha.share)}
          hint={k.withinLha.sent ? `${k.withinLha.within} of ${k.withinLha.sent} sent${k.withinLha.over ? `, ${k.withinLha.over} over` : ''}${k.withinLha.unknown ? `, ${k.withinLha.unknown} not known` : ''}. Target 100%` : 'Nothing sent. Target 100%'} />
        <StatTile icon="mail" label={`First replies in ${rules.replyHours} hours`} value={percent(k.replies.share)}
          hint={k.replies.onTime + k.replies.late ? `${k.replies.onTime} on time, ${k.replies.late} late` : 'No officer nominations'} />
        <StatTile icon="check" label="Outcomes back same day" value={percent(k.outcomes.share)}
          hint={k.outcomes.onTime + k.outcomes.late ? `${k.outcomes.onTime} on time, ${k.outcomes.late} late` : 'No officer viewings recorded'} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card fold="numbers.borough">
          <CardHeader icon="pin" title="Placements by borough" sub={`${k.placements}`} />
          <div className="px-5 py-4"><BarList items={k.byBorough} empty="No placements in this period." /></div>
        </Card>
        <Card fold="numbers.route">
          <CardHeader icon="users" title="Placements by route" sub={`${k.placements}`} />
          <div className="px-5 py-4"><BarList items={k.byRoute} empty="No placements in this period." /></div>
        </Card>
        <Card fold="numbers.lost">
          <CardHeader icon="x" title="Why properties were lost" sub={`${k.lostTotal}`} />
          <div className="px-5 py-4"><BarList items={k.lost} empty="Nothing lost in this period." /></div>
        </Card>
        <Card fold="numbers.listhealth">
          <CardHeader icon="users" title="Officer list health" sub={`${officers.length} on the list`} help="councils" />
          <div className="grid grid-cols-2 gap-2 px-5 py-4 sm:grid-cols-4">
            {HEALTH.map((h) => {
              const n = health[h.key].length;
              return (
                <Link key={h.key} to="/councils" className="flex min-w-0 flex-col rounded-md border border-[var(--line)] px-3 py-2 hover:border-[var(--accent)]"
                  style={{ background: h.warn && n > 0 ? 'var(--note-bg)' : 'var(--surface)' }}>
                  <span className={`text-[12px] font-medium ${h.warn && n > 0 ? 'text-[var(--note-fg)]' : 'text-[var(--ink-muted)]'}`}>{h.label}</span>
                  <span className="font-mono text-[20px] font-semibold text-[var(--ink)]">{n}</span>
                </Link>
              );
            })}
          </div>
        </Card>
      </div>
    </div>
  );
}

/** One measure across a few groups: a single-colour bar each, the count written beside it (so colour is never needed). */
function BarList({ items, empty }: { items: Count[]; empty: string }) {
  if (!items.length) return <p className="m-0 text-[14px] text-[var(--ink-muted)]">{empty}</p>;
  const max = Math.max(1, ...items.map((x) => x.n));
  const all = items.reduce((s, x) => s + x.n, 0);
  return (
    <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
      {items.map((x) => (
        <li key={x.key} className="flex flex-col gap-1" title={`${x.label}: ${x.n} of ${all} (${Math.round((x.n / all) * 100)}%)`}>
          <div className="flex items-baseline justify-between gap-3 text-[14px]">
            <span className="min-w-0 truncate text-[var(--ink)]">{x.focus === 0 ? '★ ' : ''}{x.label}</span>
            <span className="shrink-0 font-mono font-semibold text-[var(--ink)]">{x.n}</span>
          </div>
          <div className="h-2 w-full rounded-full bg-[var(--paper-2)]" aria-hidden>
            <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `max(${(x.n / max) * 100}%, 6px)` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
