import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Avatar, Button, Card, CardHeader, DayBars, Donut, Empty, Help, Icon, Legend, Meter, Sparkline, StatTile, TierBadge, UrgentChip,
} from '../../components/ui';
import type { IconName } from '../../components/ui';
import { useApplicants, useCalls, usePeople, useProperties, useRecentActivity } from '../../lib/hooks';
import { timeAgo } from '../../lib/format';
import { effectiveTier, isActive, isUrgent } from '../../lib/search';
import { matchesForProperty } from '../../lib/propertyMatch';
import { addDays, callQueue, callsPerDay, isoDay, lastCallMap, OUTCOME_LABEL, queueLabel, todayIso } from '../../lib/calls';
import { tierColor, tierCount, tierLabel, tierNumbers } from '../../lib/tiering';
import type { ApplicantStage } from '../../types/extraction';
import type { Activity } from '../../lib/types';

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

  const last = useMemo(() => lastCallMap(calls), [calls]);
  const queue = useMemo(() => callQueue(applicants, last), [applicants, last]);
  const days = useMemo(() => callsPerDay(calls, 14), [calls]);
  const weekCalls = days.slice(-7).reduce((s, d) => s + d.total, 0);

  const available = properties.filter((p) => p.status === 'void' || p.status === 'under_offer');
  const matchCount = useMemo(
    () => available.reduce((s, p) => s + matchesForProperty(p, applicants).length, 0),
    [available, applicants],
  );

  const byStage = (s: ApplicantStage) => applicants.filter((a) => a.stage === s || (s === 'placed' && (a.stage === 'fee_invoiced' || a.stage === 'fee_paid'))).length;
  const funnelMax = Math.max(1, ...FUNNEL.map((f) => byStage(f.stage)));
  const today = todayIso();

  return (
    <div className="mx-auto flex max-w-[1120px] flex-col gap-6 p-6 pb-24">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="m-0 text-[13px] font-medium uppercase tracking-wider text-[var(--ink-muted)]">
            {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
          <div className="mt-1 flex items-center gap-2">
            <h1 className="m-0 text-[30px] font-bold text-[var(--ink)]">
              {greeting()}{people.myName ? `, ${people.myName}` : ''}
            </h1>
            <Help topic="home" />
          </div>
          <p className="m-0 mt-1 text-[15px] text-[var(--ink-muted)]">
            {queue.length ? `${queue.length} ${queue.length === 1 ? 'call' : 'calls'} to make` : 'No calls due'}
            {urgent ? ` · ${urgent} urgent ${urgent === 1 ? 'client' : 'clients'}` : ''}
            {available.length ? ` · ${available.length} properties available` : ''}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => navigate('/bin')}><Icon name="inbox" size={16} />Paste a screenshot</Button>
          <Button variant="primary" onClick={() => navigate('/calls')}><Icon name="phoneOut" size={16} />Start calling</Button>
        </div>
      </header>

      {/* Stat tiles */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Link to="/pipeline"><StatTile icon="users" label="Active clients" value={active.length} hint={`${newThisWeek} new this week`}>
          <Sparkline values={newPerDay} />
        </StatTile></Link>
        <Link to="/calls"><StatTile icon="flag" label="To call now" value={queue.length} accent={queue.length > 0}
          hint={queue.length ? `${queue.filter((q) => 'overdue' in q.state && q.state.overdue).length} overdue${
            people.ready && people.members.length > 1 ? `, ${queue.filter((q) => q.a.assigned_to === people.meId).length} yours` : ''}` : 'All caught up'} /></Link>
        <Link to="/properties"><StatTile icon="building" label="Available properties" value={available.length}
          hint={`${matchCount} client ${matchCount === 1 ? 'match' : 'matches'}`} /></Link>
        <Link to="/calls"><StatTile icon="phoneOut" label="Calls, last 7 days" value={weekCalls} hint={`${days[days.length - 1]?.total ?? 0} today`}>
          <Sparkline values={days.map((d) => d.total)} />
        </StatTile></Link>
      </div>

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

        {/* Calls chart */}
        <Card>
          <CardHeader icon="trend" title="Calls, last 14 days" sub={`${days.reduce((s, d) => s + d.total, 0)} calls`}>
            <Link to="/calls" className="text-[13px] text-[var(--link)] hover:underline">Open</Link>
          </CardHeader>
          <div className="p-5">
            <DayBars height={110} bars={days.map((d) => ({
              label: new Date(`${d.date}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'narrow' }),
              sub: new Date(`${d.date}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }),
              value: d.total, highlight: d.answered, today: d.date === today,
            }))} />
            <div className="mt-2 flex gap-4 text-[13px] text-[var(--ink-muted)]">
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-[var(--accent)]" />Answered</span>
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-[var(--ink-faint)] opacity-60" />Not answered</span>
            </div>
          </div>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        {/* To call */}
        <Card>
          <CardHeader icon="flag" title="To call now" sub={String(queue.length)}>
            <Link to="/calls" className="text-[13px] text-[var(--link)] hover:underline">See all</Link>
          </CardHeader>
          {queue.length === 0 ? (
            <Empty icon="check" title="You are all caught up">New clients and follow-ups you set will appear here.</Empty>
          ) : (
            <ul className="m-0 list-none p-2">
              {queue.slice(0, 6).map(({ a, state, last: lc }) => (
                <li key={a.id}>
                  <Link to={`/applicants/${a.id}`} className="flex items-center gap-3 rounded-md px-3 py-2.5 hover:bg-[var(--surface-2)]">
                    <Avatar name={a.full_name} size={34} accent={effectiveTier(a) === 1} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-[15px] font-medium text-[var(--ink)]">{a.full_name}</span>
                        <TierBadge tier={effectiveTier(a)} />
                        {isUrgent(a) && <UrgentChip />}
                      </div>
                      <div className="text-[13px] text-[var(--ink-muted)]">
                        {queueLabel(state)}
                        {lc ? ` · last: ${OUTCOME_LABEL[lc.outcome].toLowerCase()}` : ''}
                      </div>
                    </div>
                    <Icon name="phoneOut" size={18} className="text-[var(--accent)]" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
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
                <li key={act.id}>
                  {name ? (
                    <Link to={`/applicants/${act.entity_id}`} className="flex items-center gap-3 rounded-md px-3 py-2 hover:bg-[var(--surface-2)]">{inner}</Link>
                  ) : (
                    <div className="flex items-center gap-3 px-3 py-2">{inner}</div>
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
