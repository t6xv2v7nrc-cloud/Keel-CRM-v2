import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Avatar, Card, CardHeader, DayBars, Empty, Icon, Meter, PageHeader, Sparkline, StatTile, TierBadge, UrgentChip, useToast,
} from '../../components/ui';
import { useApplicants, useAssign, useCalls, usePeople, useSettings } from '../../lib/hooks';
import { addDays, callQueue, callsPerDay, callState, dayLabel, isoDay, lastCallMap, OUTCOME_LABEL, queueLabel, todayIso } from '../../lib/calls';
import { effectiveTier, isUrgent } from '../../lib/search';
import { timeAgo } from '../../lib/format';
import type { Applicant, Call } from '../../lib/types';
import { CallLogger, OUTCOME_ICON, useCallWho } from './CallLogger';

type View = 'everyone' | 'mine' | 'unassigned';

export function CallsNeedUpdate() {
  return (
    <div role="alert" className="flex gap-3 rounded-lg border border-[var(--line-strong)] bg-[var(--note-bg)] p-4 text-[15px] text-[var(--note-fg)]">
      <Icon name="alert" size={20} className="mt-0.5" />
      <div>
        <strong>Call tracking needs a one-off database update.</strong> In Supabase, open the SQL Editor, paste in{' '}
        <code className="font-mono text-[13px]">supabase/migrations/0005_calls_settings.sql</code> and click Run. Then reload this page.
      </div>
    </div>
  );
}

/** Calls: who to ring now, what is coming up, and how calling is going. */
export function CallsPage() {
  const { data: everyone = [] } = useApplicants();
  const { calls: allCalls, ready } = useCalls();
  const people = usePeople();
  const { settings, isLoading: settingsLoading } = useSettings();
  const [view, setView] = useState<View>('everyone');
  useEffect(() => { if (!settingsLoading) setView(settings.callsView); }, [settingsLoading, settings.callsView]);

  // Mine and Unassigned narrow the clients, and the calls to those clients
  const applicants = useMemo(() => everyone.filter((a) =>
    view === 'everyone' || (view === 'mine' ? a.assigned_to === people.meId : !a.assigned_to)), [everyone, view, people.meId]);
  const shownIds = useMemo(() => new Set(applicants.map((a) => a.id)), [applicants]);
  const calls = useMemo(() => (view === 'everyone' ? allCalls : allCalls.filter((c) => shownIds.has(c.applicant_id))), [allCalls, view, shownIds]);

  const last = useMemo(() => lastCallMap(allCalls), [allCalls]);
  const queue = useMemo(() => callQueue(applicants, last), [applicants, last]);
  const byId = useMemo(() => new Map(everyone.map((a) => [a.id, a])), [everyone]);
  const weekStart = addDays(-6);
  const byPerson = people.members.map((m) => ({
    name: people.nameOf(m.id) ?? 'Someone', me: m.id === people.meId,
    calls: allCalls.filter((c) => c.created_by === m.id && isoDay(new Date(c.created_at)) >= weekStart).length,
  }));
  const upcoming = useMemo(() => applicants
    .map((a) => ({ a, state: callState(a, last.get(a.id)) }))
    .filter((x): x is { a: Applicant; state: { kind: 'scheduled'; date: string } } => x.state.kind === 'scheduled')
    .sort((x, y) => x.state.date.localeCompare(y.state.date))
    .slice(0, 12), [applicants, last]);

  const days = useMemo(() => callsPerDay(calls, 14), [calls]);
  const today = todayIso();
  const todayCalls = days[days.length - 1];
  const week = days.slice(-7);
  const weekTotal = week.reduce((s, d) => s + d.total, 0);
  const weekAnswered = week.reduce((s, d) => s + d.answered, 0);
  const overdue = queue.filter((q) => 'overdue' in q.state && q.state.overdue).length;

  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-6 p-6 pb-24">
      <PageHeader icon="phone" title="Calls" help="calls" sub={`${queue.length} to call now · ${weekTotal} logged in the last 7 days`}>
        <div className="inline-flex rounded-lg bg-[var(--paper-2)] p-1" role="group" aria-label="Whose clients">
          {([['everyone', 'Everyone'], ['mine', 'Mine'], ['unassigned', 'Unassigned']] as Array<[View, string]>).map(([v, l]) => (
            <button key={v} onClick={() => setView(v)} aria-pressed={view === v} disabled={v !== 'everyone' && !people.ready}
              className={`rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors disabled:opacity-40 ${
                view === v ? 'bg-[var(--surface)] text-[var(--ink)] shadow-[var(--shadow-card)]' : 'text-[var(--ink-muted)] hover:text-[var(--ink)]'}`}>
              {l}
            </button>
          ))}
        </div>
      </PageHeader>

      {!ready && <CallsNeedUpdate />}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile icon="flag" label="To call now" value={queue.length} accent={queue.length > 0}
          hint={overdue ? `${overdue} overdue` : 'Nothing overdue'} />
        <StatTile icon="phoneOut" label="Calls today" value={todayCalls?.total ?? 0}
          hint={`${todayCalls?.answered ?? 0} answered`} />
        <StatTile icon="trend" label="Last 7 days" value={weekTotal} hint="Calls per day, last 14 days">
          <Sparkline values={days.map((d) => d.total)} />
        </StatTile>
        <StatTile icon="check" label="Answer rate" value={weekTotal ? `${Math.round((weekAnswered / weekTotal) * 100)}%` : '·'}
          hint={`${weekAnswered} of ${weekTotal} this week`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <Card>
          <CardHeader icon="flag" title="To call now" sub={String(queue.length)} help="calls" />
          {queue.length === 0 ? (
            <Empty icon="check" title={view === 'mine' ? 'Nothing to call for your clients' : 'All caught up'}>
              Follow-ups set when logging a call, and new clients nobody has called yet, show here.
              {view === 'mine' && ' Try Unassigned to pick up new clients.'}
            </Empty>
          ) : (
            <ul className="m-0 list-none p-0">
              {queue.map(({ a, state, last: lastCall }) => (
                <QueueRow key={a.id} a={a} lastCall={lastCall} owner={people.nameOf(a.assigned_to)} canClaim={people.ready && !a.assigned_to}
                  label={queueLabel(state)}
                  overdue={'overdue' in state && state.overdue} />
              ))}
            </ul>
          )}
        </Card>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader icon="calendar" title="Coming up" sub={String(upcoming.length)} />
            {upcoming.length === 0 ? (
              <p className="m-0 p-5 text-[15px] text-[var(--ink-muted)]">No calls scheduled.</p>
            ) : (
              <ul className="m-0 list-none p-2">
                {upcoming.map(({ a, state }) => (
                  <li key={a.id}>
                    <Link to={`/applicants/${a.id}`} className="flex items-center gap-3 rounded-md px-3 py-2 hover:bg-[var(--surface-2)]">
                      <Avatar name={a.full_name} size={30} accent={effectiveTier(a) === 1} />
                      <span className="min-w-0 flex-1 truncate text-[15px] text-[var(--ink)]">{a.full_name}</span>
                      <span className="text-[13px] font-medium text-[var(--ink-muted)]">{dayLabel(state.date)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {byPerson.length > 1 && (
            <Card>
              <CardHeader icon="users" title="Calls this week, by person" />
              <div className="flex flex-col gap-0.5 p-3">
                {byPerson.map((p) => (
                  <Meter key={p.name} label={p.me ? `${p.name} (you)` : p.name} value={p.calls} max={Math.max(1, ...byPerson.map((x) => x.calls))} accent={p.me} />
                ))}
              </div>
            </Card>
          )}

          <Card>
            <CardHeader icon="trend" title="Last 14 days" />
            <div className="p-5">
              <DayBars bars={days.map((d) => ({
                label: new Date(`${d.date}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'narrow' }),
                sub: new Date(`${d.date}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }),
                value: d.total, highlight: d.answered, today: d.date === today,
              }))} height={90} />
              <div className="mt-3 flex gap-4 text-[13px] text-[var(--ink-muted)]">
                <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-[var(--accent)]" />Answered</span>
                <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-[var(--ink-faint)] opacity-60" />Not answered</span>
              </div>
            </div>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader icon="clock" title="Recent calls" sub={String(Math.min(calls.length, 25))} />
        {calls.length === 0 ? (
          <Empty icon="phone" title="No calls logged yet">Open a client and use Log call, or log one from the list above.</Empty>
        ) : (
          <ul className="m-0 list-none p-0">
            {calls.slice(0, 25).map((c) => <RecentRow key={c.id} c={c} a={byId.get(c.applicant_id)} />)}
          </ul>
        )}
      </Card>
    </div>
  );
}

function QueueRow({ a, lastCall, label, overdue, owner, canClaim }: {
  a: Applicant; lastCall?: Call; label: string; overdue: boolean; owner: string | null; canClaim: boolean;
}) {
  const [open, setOpen] = useState(false);
  const tier = effectiveTier(a);
  const assign = useAssign();
  const people = usePeople();
  const { toast } = useToast();
  const claim = () => assign.mutate({ applicant: a, userId: people.meId, name: people.myName }, {
    onSuccess: () => toast(`${a.full_name} is now assigned to you`, 'success'),
    onError: (e) => toast((e as Error).message, 'danger'),
  });
  return (
    <li className="border-b border-[var(--line)] last:border-b-0">
      <div className="flex flex-wrap items-center gap-3 px-5 py-3">
        <Avatar name={a.full_name} accent={tier === 1} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link to={`/applicants/${a.id}`} className="text-[15px] font-medium text-[var(--ink)] hover:underline">{a.full_name}</Link>
            <TierBadge tier={tier} />
            {isUrgent(a) && <UrgentChip />}
          </div>
          <div className="mt-0.5 flex flex-wrap gap-x-3 text-[13px]">
            <span className={overdue ? 'font-semibold text-[var(--ink)]' : 'text-[var(--ink-muted)]'}>{label}</span>
            {lastCall && <span className="text-[var(--ink-muted)]">Last: {OUTCOME_LABEL[lastCall.outcome].toLowerCase()}, {timeAgo(lastCall.created_at)}</span>}
            {owner && <span className="inline-flex items-center gap-1 text-[var(--ink-muted)]"><Icon name="user" size={12} />{owner}</span>}
          </div>
        </div>
        {a.phone && (
          <a href={`tel:${a.phone}`} className="hidden items-center gap-1.5 font-mono text-[13px] text-[var(--link)] hover:underline sm:inline-flex">
            <Icon name="phone" size={14} />{a.phone}
          </a>
        )}
        {canClaim && (
          <button onClick={claim} disabled={assign.isPending} title="Assign this client to you"
            className="inline-flex items-center gap-1.5 rounded-md border border-[var(--line-strong)] px-3 py-1.5 text-[13px] font-medium text-[var(--ink)] hover:border-[var(--accent)]">
            <Icon name="user" size={14} />Assign to me
          </button>
        )}
        <button onClick={() => setOpen((o) => !o)} aria-expanded={open}
          className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-[13px] font-medium transition-colors ${
            open ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-ink)]' : 'border-[var(--line-strong)] text-[var(--ink)] hover:border-[var(--accent)]'}`}>
          <Icon name={open ? 'x' : 'phoneOut'} size={14} />{open ? 'Close' : 'Log call'}
        </button>
      </div>
      {open && (
        <div className="border-t border-[var(--line)] bg-[var(--surface-2)] px-5 py-4">
          <CallLogger applicant={a} onDone={() => setOpen(false)} autoFocus />
        </div>
      )}
    </li>
  );
}

function RecentRow({ c, a }: { c: Call; a?: Applicant }) {
  const callWho = useCallWho();
  const reached = c.outcome === 'answered';
  const sameDay = isoDay(new Date(c.created_at)) === todayIso();
  return (
    <li className="flex items-start gap-3 border-b border-[var(--line)] px-5 py-3 last:border-b-0">
      <span className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full ${reached ? 'bg-[var(--accent-soft)] text-[var(--accent-ink)]' : 'bg-[var(--paper-2)] text-[var(--ink-muted)]'}`}>
        <Icon name={OUTCOME_ICON[c.outcome]} size={15} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          {a ? <Link to={`/applicants/${a.id}`} className="text-[15px] font-medium text-[var(--ink)] hover:underline">{a.full_name}</Link>
            : <span className="text-[15px] text-[var(--ink-muted)]">Deleted client</span>}
          <span className="text-[13px] text-[var(--ink-muted)]">{OUTCOME_LABEL[c.outcome]} · {callWho(c)}</span>
        </div>
        {c.notes && <p className="m-0 mt-0.5 truncate text-[13px] text-[var(--ink)]" title={c.notes}>{c.notes}</p>}
      </div>
      <span className="shrink-0 font-mono text-[13px] text-[var(--ink-muted)]">
        {sameDay ? new Date(c.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : timeAgo(c.created_at)}
      </span>
    </li>
  );
}
