import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Avatar, Button, Card, CardHeader, Donut, Empty, Help, Icon, Legend, Meter, Sparkline, StatTile, TierBadge, UrgentChip,
} from '../../components/ui';
import type { IconName } from '../../components/ui';
import { useApplicants, useCalls, useDeals, usePeople, useProperties, useProviders, useReceivables, useRecentActivity } from '../../lib/hooks';
import { longDay, money, timeAgo } from '../../lib/format';
import { ghostTotal, potentials, totals as moneyTotals } from '../../lib/money';
import { isPlaced } from '../../lib/progress';
import { effectiveTier, isActive, isHoused, isUrgent } from '../../lib/search';
import { matchesForProperty } from '../../lib/propertyMatch';
import { addDays, callQueue, isoDay, lastCallMap, queueLabel } from '../../lib/calls';
import { tierColor, tierCount, tierLabel, tierNumbers, URGENCY_LABEL } from '../../lib/tiering';
import type { ApplicantStage } from '../../types/extraction';
import type { Activity } from '../../lib/types';
import { ThisWeek } from './ThisWeek';
import { AwaitingProviders } from '../requests/AwaitingProviders';
import { MoneyOwedSummary } from '../money/Money';

const FUNNEL: Array<{ stage: ApplicantStage; label: string }> = [
  { stage: 'lead', label: 'Lead' }, { stage: 'referred', label: 'Referred' }, { stage: 'viewing', label: 'Viewing' },
  { stage: 'offer', label: 'Offer' }, { stage: 'placed', label: 'Placed' },
];

export function DashboardPage() {
  const people = usePeople();
  const navigate = useNavigate();
  const { data: applicants = [] } = useApplicants();
  const { data: properties = [] } = useProperties();
  const { calls } = useCalls();
  const { data: recent = [] } = useRecentActivity(10);

  const nameOf = useMemo(() => {
    const m = new Map(applicants.map((a) => [a.id, a.full_name]));
    return (id: string) => m.get(id) ?? null;
  }, [applicants]);

  const active = useMemo(() => applicants.filter(isActive), [applicants]);
  const tiers = useMemo(() => {
    const counts = new Map<number, number>(tierNumbers().map((t) => [t, 0]));
    for (const a of active) counts.set(effectiveTier(a), (counts.get(effectiveTier(a)) ?? 0) + 1);
    return tierNumbers().map((t) => ({ label: tierLabel(t), value: counts.get(t) ?? 0, color: tierColor(t, tierCount()) }));
  }, [active]);
  const urgent = active.filter(isUrgent).length;

  // New clients per day, last 14 days
  const newPerDay = useMemo(() => {
    const days = Array.from({ length: 14 }, (_, i) => addDays(i - 13));
    const counts = new Map(days.map((d) => [d, 0]));
    for (const a of applicants) {
      const d = isoDay(new Date(a.created_at));
      if (counts.has(d)) counts.set(d, (counts.get(d) ?? 0) + 1);
    }
    return days.map((d) => counts.get(d) ?? 0);
  }, [applicants]);
  const newThisWeek = newPerDay.slice(-7).reduce((s, n) => s + n, 0);

  // Next steps due today or earlier, set on a client's page or by their progress (a viewing to book, an answer to chase)
  const last = useMemo(() => lastCallMap(calls), [calls]);
  const queue = useMemo(() => callQueue(applicants, last), [applicants, last]);
  const stepsDue = queue.filter((q) => q.state.kind === 'due');

  // Finances at a glance
  const { receivables, ready: moneyReady } = useReceivables();
  const { deals } = useDeals();
  const { providers } = useProviders();
  const owedNow = moneyTotals(receivables);
  const ghost = useMemo(() => ghostTotal(receivables, potentials(deals, receivables, properties, providers)), [receivables, deals, properties, providers]);

  const available = properties.filter((p) => p.status === 'void' || p.status === 'under_offer');
  // properties at least one client is a strong match for: the ones worth sending today
  const strongCount = useMemo(
    () => available.filter((p) => matchesForProperty(p, applicants).some((m) => m.strength === 'strong')).length,
    [available, applicants],
  );
  const housed = applicants.filter(isHoused).length;

  const byStage = (s: ApplicantStage) => applicants.filter((a) => (s === 'placed' ? isPlaced(a.stage) : a.stage === s)).length;
  const funnelMax = Math.max(1, ...FUNNEL.map((f) => byStage(f.stage)));

  return (
    <div className="mx-auto flex max-w-[1120px] flex-col gap-6 p-4 pb-24 sm:p-6 sm:pb-24">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="m-0 text-[13px] font-medium uppercase tracking-wider text-[var(--ink-muted)]">
            {longDay(new Date())}
          </p>
          <div className="mt-1 flex items-center gap-2">
            <h1 className="m-0 text-[24px] font-bold leading-tight text-[var(--ink)] sm:text-[30px]">
              {greeting()}{people.myName ? `, ${people.myName}` : ''}
            </h1>
            <Help topic="home" />
          </div>
          <p className="m-0 mt-1 text-[15px] text-[var(--ink-muted)]">
            {[`${active.length} active ${active.length === 1 ? 'client' : 'clients'}`,
              urgent ? `${urgent} urgent` : null,
              stepsDue.length ? `${stepsDue.length} ${stepsDue.length === 1 ? 'next step' : 'next steps'} due` : null,
              available.length ? `${available.length} properties available` : null].filter(Boolean).join(' · ')}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" onClick={() => navigate('/bin')}><Icon name="inbox" size={16} />Paste a screenshot</Button>
        </div>
      </header>

      {/* Stat tiles */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Link to="/pipeline"><StatTile icon="users" label="Active clients" value={active.length} hint={`${newThisWeek} new this week${housed ? `, ${housed} housed` : ''}`}>
          <Sparkline values={newPerDay} />
        </StatTile></Link>
        <Link to="/properties"><StatTile icon="building" label="Available properties" value={available.length}
          hint={`${strongCount} with a strong match`} /></Link>
        <Link to="/finances"><StatTile icon="pound" label="Owed" value={moneyReady ? money(owedNow.owed) : '·'}
          hint={!moneyReady ? 'Finances not set up yet' : owedNow.overdueCount ? `${money(owedNow.overdue)} overdue` : `${owedNow.owedCount} ${owedNow.owedCount === 1 ? 'item' : 'items'}, none overdue`} /></Link>
        <Link to="/finances?view=potential"><StatTile icon="trend" label="Ghost total" value={moneyReady ? money(ghost.total) : '·'} accent={moneyReady && ghost.total > 0}
          hint="The whole pipeline, if it all came in" /></Link>
      </div>

      <ThisWeek applicants={applicants} />

      {/* Next steps due: from a client's page or their progress (a viewing to book, an answer to chase) */}
      {stepsDue.length > 0 && (
        <Card>
          <CardHeader icon="calendar" title="Next steps due" sub={String(stepsDue.length)} help="nextCall" />
          <ul className="m-0 grid list-none gap-x-6 p-2 md:grid-cols-2">
            {stepsDue.slice(0, 8).map(({ a, state }) => (
              <li key={a.id} className="min-w-0">
                <Link to={`/applicants/${a.id}`} className="flex items-center gap-3 rounded-md px-3 py-2.5 hover:bg-[var(--surface-2)]">
                  <Avatar name={a.full_name} size={32} accent={effectiveTier(a) === 1} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-[15px] font-medium text-[var(--ink)]">{a.full_name}</span>
                      <TierBadge tier={effectiveTier(a)} />
                      {isUrgent(a) && <UrgentChip reason={URGENCY_LABEL[a.urgency ?? '']} />}
                    </div>
                    <div className="truncate text-[13px] text-[var(--ink-muted)]">{queueLabel(state, a.next_step)}</div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
          {stepsDue.length > 8 && (
            <div className="border-t border-[var(--line)] px-5 py-2.5 text-[13px]">
              <Link to="/pipeline?calls=due" className="text-[var(--link)] hover:underline">See all {stepsDue.length}</Link>
            </div>
          )}
        </Card>
      )}

      <AwaitingProviders applicants={applicants} />

      <MoneyOwedSummary applicants={applicants} />

      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        {/* Triage */}
        <Card>
          <CardHeader icon="layers" title="Referral triage" sub={`${active.length} active`} help="tiers">
            {urgent > 0 && <Link to="/pipeline?urgency=urgent" className="hover:opacity-80"><UrgentChip /></Link>}
            <Link to="/settings" className="text-[13px] text-[var(--link)] hover:underline">Rules</Link>
          </CardHeader>
          <div className="flex flex-wrap items-center gap-6 p-5">
            <Donut size={150} centre={active.length} centreSub="active clients"
              slices={tiers} />
            <Legend slices={tiers}
              onPick={(label) => navigate(`/pipeline?tier=${tiers.findIndex((t) => t.label === label) + 1}`)} />
          </div>
        </Card>

        {/* Pipeline funnel */}
        <Card>
          <CardHeader icon="list" title="Pipeline" sub={`${applicants.length} clients`}>
            <Link to="/pipeline" className="text-[13px] text-[var(--link)] hover:underline">Open</Link>
          </CardHeader>
          <div className="flex flex-col gap-0.5 p-3">
            {FUNNEL.map((f) => (
              <Meter key={f.stage} label={f.label} value={byStage(f.stage)} max={funnelMax} accent={f.stage === 'placed' || f.stage === 'offer'}
                onClick={() => navigate(`/pipeline?stage=${f.stage}`)} />
            ))}
            <div className="mt-1 px-2 text-[13px] text-[var(--ink-muted)]">
              {applicants.filter((a) => a.stage === 'lost').length} lost
            </div>
          </div>
        </Card>
      </div>

      {/* Recent activity */}
      <Card>
        <CardHeader icon="clock" title="Recent activity" />
        {recent.length === 0 ? (
          <Empty icon="inbox" title="Nothing yet">Paste a screenshot or a website enquiry into the Bin to begin.</Empty>
        ) : (
          <ul className="m-0 grid list-none gap-x-6 p-2 md:grid-cols-2">
            {recent.map((act) => {
              const name = act.entity_type === 'applicant' ? nameOf(act.entity_id) : null;
              const inner = (
                <>
                  <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${act.kind === 'call' || act.kind === 'whatsapp' ? 'bg-[var(--accent-soft)] text-[var(--accent-ink)]' : 'bg-[var(--paper-2)] text-[var(--ink-muted)]'}`}>
                    <Icon name={activityIcon(act)} size={15} />
                  </span>
                  <div className="min-w-0">
                    <div className="truncate text-[15px] text-[var(--ink)]">{name && (act.kind === 'call' || act.kind === 'whatsapp') ? `${name}: ${act.body}` : act.body}</div>
                    <div className="text-[13px] text-[var(--ink-muted)]">{timeAgo(act.created_at)}{people.whoOf(act.actor) ? ` · by ${people.whoOf(act.actor)}` : ''}</div>
                  </div>
                </>
              );
              return (
                <li key={act.id} className="min-w-0">
                  {name ? (
                    <Link to={`/applicants/${act.entity_id}`} className="flex items-center gap-3 rounded-md px-3 py-2 hover:bg-[var(--surface-2)]">{inner}</Link>
                  ) : (
                    act.entity_type === 'inbox'
                      ? <Link to="/bin" className="flex items-center gap-3 rounded-md px-3 py-2 hover:bg-[var(--surface-2)]">{inner}</Link>
                      : <div className="flex items-center gap-3 px-3 py-2">{inner}</div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}

function activityIcon(a: Activity): IconName {
  if (a.kind === 'call') return 'phone';
  if (a.kind === 'whatsapp') return 'chat';
  if (a.kind === 'progress') return 'flag';
  if (a.kind === 'request') return 'send';
  if (a.kind === 'money') return 'pound';
  if (a.kind === 'stage_change') return 'arrowRight';
  if (a.entity_type === 'property') return 'building';
  if (a.kind === 'created') return a.body.includes('screenshot') ? 'inbox' : 'plus';
  return 'pencil';
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}
