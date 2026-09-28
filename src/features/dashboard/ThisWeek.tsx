import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardHeader, Empty } from '../../components/ui';
import { useDeals } from '../../lib/hooks';
import { dayLabel, isoDay } from '../../lib/calls';
import { isLive, shortAddress, stuckDays, viewingsBetween } from '../../lib/progress';
import { isActive } from '../../lib/search';
import type { Applicant, Deal } from '../../lib/types';
import { ReminderLink, STAGE_NAME, StuckChip, dealWords } from '../progress/Progress';

const time = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true }).replace(':00', '').replace(' ', '');

/** Home: the week's viewings (with a one-tap reminder) and the clients who have stopped moving. */
export function ThisWeek({ applicants }: { applicants: Applicant[] }) {
  const { deals, ready } = useDeals();
  const byId = useMemo(() => new Map(applicants.map((a) => [a.id, a])), [applicants]);

  const viewings = useMemo(() => {
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const end = new Date(start); end.setDate(end.getDate() + 7);
    const days = new Map<string, Deal[]>();
    for (const d of viewingsBetween(deals, start, end)) {
      const day = isoDay(new Date(d.viewing_at!));
      days.set(day, [...(days.get(day) ?? []), d]);
    }
    return [...days.entries()];
  }, [deals]);
  const viewingCount = viewings.reduce((s, [, ds]) => s + ds.length, 0);

  const stuck = useMemo(() => applicants.filter(isActive)
    .map((a) => ({ a, days: stuckDays(a, deals) }))
    .filter((x): x is { a: Applicant; days: number } => x.days !== null)
    .sort((x, y) => y.days - x.days), [applicants, deals]);

  const month = useMemo(() => {
    const since = Date.now() - 30 * 86_400_000;
    const recent = deals.filter((d) => new Date(d.created_at).getTime() >= since);
    const reached = (keys: Deal['status'][]) => recent.filter((d) => keys.includes(d.status)).length;
    return {
      sent: recent.length,
      viewed: reached(['viewing', 'viewed', 'offered', 'accepted', 'moved_in']),
      offers: reached(['offered', 'accepted', 'moved_in']),
      moved: reached(['moved_in']),
    };
  }, [deals]);

  if (!ready) return null;

  return (
    <Card>
      <CardHeader icon="calendar" title="This week" sub={`${viewingCount} ${viewingCount === 1 ? 'viewing' : 'viewings'} · ${stuck.length} stuck`} help="progress" />
      <div className="grid gap-6 p-5 lg:grid-cols-2">
        <section className="flex flex-col gap-3">
          <h3 className="m-0 text-[13px] font-medium uppercase tracking-wider text-[var(--ink-muted)]">Viewings</h3>
          {viewings.length === 0 ? (
            <p className="m-0 text-[15px] text-[var(--ink-muted)]">None booked for the next 7 days. Book one from a client's Progress.</p>
          ) : viewings.map(([day, ds]) => (
            <div key={day}>
              <div className="mb-1 text-[13px] font-semibold text-[var(--ink)]">{dayLabel(day)}</div>
              <ul className="m-0 flex list-none flex-col gap-1 p-0">
                {ds.map((d) => {
                  const a = byId.get(d.applicant_id);
                  return (
                    <li key={d.id} className="flex items-center gap-3 rounded-md bg-[var(--surface-2)] px-3 py-2">
                      <span className="w-12 shrink-0 font-mono text-[14px] font-semibold text-[var(--accent-ink)]">{time(d.viewing_at!)}</span>
                      <div className="min-w-0 flex-1">
                        <Link to={`/applicants/${d.applicant_id}`} className="block truncate text-[15px] font-medium text-[var(--ink)] hover:underline">{a?.full_name ?? 'A client'}</Link>
                        <div className="truncate text-[13px] text-[var(--ink-muted)]">{d.address}</div>
                      </div>
                      {a && <ReminderLink applicant={a} deal={d} label />}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </section>

        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h3 className="m-0 text-[13px] font-medium uppercase tracking-wider text-[var(--ink-muted)]">Needs a push</h3>
            {stuck.length > 6 && <Link to="/pipeline?progress=stuck" className="text-[13px] text-[var(--link)] hover:underline">See all {stuck.length}</Link>}
          </div>
          {stuck.length === 0 ? (
            <Empty icon="check" title="Everyone is moving">Nobody has been stuck at a stage for longer than Team settings allow.</Empty>
          ) : (
            <ul className="m-0 flex list-none flex-col gap-1 p-0">
              {stuck.slice(0, 6).map(({ a, days }) => {
                const live = deals.filter((d) => d.applicant_id === a.id && isLive(d));
                return (
                  <li key={a.id}>
                    <Link to={`/applicants/${a.id}`} className="flex items-center gap-3 rounded-md px-3 py-2 hover:bg-[var(--surface-2)]">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[15px] font-medium text-[var(--ink)]">{a.full_name}</div>
                        <div className="truncate text-[13px] text-[var(--ink-muted)]">
                          {STAGE_NAME[a.stage]} · {live.length ? `${shortAddress(live[0].address)}: ${dealWords(live[0]).toLowerCase()}` : 'no properties sent yet'}
                        </div>
                      </div>
                      <StuckChip days={days} />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
      {month.sent > 0 && (
        <div className="border-t border-[var(--line)] px-5 py-3 text-[13px] text-[var(--ink-muted)]">
          Last 30 days: <strong className="text-[var(--ink)]">{month.sent}</strong> properties sent · <strong className="text-[var(--ink)]">{month.viewed}</strong> got to a viewing ·{' '}
          <strong className="text-[var(--ink)]">{month.offers}</strong> to an offer · <strong className="text-[var(--ink)]">{month.moved}</strong> moved in
        </div>
      )}
    </Card>
  );
}
