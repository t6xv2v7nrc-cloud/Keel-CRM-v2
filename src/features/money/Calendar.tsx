import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { Button, Card, CardHeader, Help, Icon } from '../../components/ui';
import { todayIso } from '../../lib/calls';
import { moneyShort, monthName, shortDay } from '../../lib/format';
import { awaitingFirstRent, calendarEntries, eventTitle, icsFile, moneyEvents, monthGrid, nextMonth } from '../../lib/money';
import type { MoneyEvent } from '../../lib/money';
import type { Applicant, Provider, Receivable } from '../../lib/types';
import { MoneyRow } from './Money';

/** Hand the browser a file to save (or, on a phone, to open: a calendar file goes straight into the calendar). */
function saveFile(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

const KIND_WORDS: Record<MoneyEvent['kind'], string> = { due: 'Due', first_rent: 'First month\'s rent expected', paid: 'Paid' };
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const small = 'min-h-0 px-3 py-1.5 text-[13px]';
const day = (iso: string) => shortDay(`${iso}T12:00:00`);

function markStyle(e: MoneyEvent): CSSProperties {
  if (e.late) return { background: 'var(--note-bg)', color: 'var(--note-fg)', boxShadow: 'inset 0 0 0 1px var(--note-fg)' };
  if (e.kind === 'paid') return { background: 'var(--accent-soft)', color: 'var(--accent-ink)' };
  if (e.kind === 'first_rent') return { background: 'transparent', color: 'var(--ink-muted)', boxShadow: 'inset 0 0 0 1px var(--line-strong)' };
  return { background: 'var(--chip-bg)', color: 'var(--chip-fg)' };
}
function dotStyle(e: MoneyEvent): CSSProperties {
  if (e.late) return { background: 'var(--note-fg)' };
  if (e.kind === 'paid') return { background: 'var(--accent)' };
  if (e.kind === 'first_rent') return { boxShadow: 'inset 0 0 0 1.5px var(--ink-muted)' };
  return { background: 'var(--ink-muted)' };
}

/** A month of money dates: fees and incentives due, first rents expected, payments in. Pick a day to act on what is on it. */
export function MoneyCalendar({ receivables, byId, providers }: { receivables: Receivable[]; byId: Map<string, Applicant>; providers: Provider[] }) {
  const today = todayIso();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [picked, setPicked] = useState(today);
  const events = useMemo(() => moneyEvents(receivables, today), [receivables, today]);
  const byDay = useMemo(() => {
    const m = new Map<string, MoneyEvent[]>();
    for (const e of events) m.set(e.day, [...(m.get(e.day) ?? []), e]);
    return m;
  }, [events]);
  const firstName = (id: string) => byId.get(id)?.full_name.trim().split(/\s+/)[0] ?? null;
  const toCome = events.filter((e) => e.kind !== 'paid' && (e.day >= today || e.late));
  const saveAll = () => saveFile('keel-finances.ics', icsFile(calendarEntries(toCome, firstName)), 'text/calendar');
  const saveOne = (e: MoneyEvent) => saveFile(`keel-${e.kind === 'first_rent' ? 'first-rent' : 'due'}-${e.day}.ics`, icsFile(calendarEntries([e], firstName)), 'text/calendar');
  const onDay = byDay.get(picked) ?? [];
  const nextUp = events.filter((e) => e.kind !== 'paid' && e.day > today).slice(0, 6);
  const thisMonth = today.slice(0, 7);
  const go = (n: number) => setMonth((m) => nextMonth(m, n));

  return (
    <div className="flex flex-col gap-4">
      <Card className="p-3 sm:p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => go(-1)} aria-label="Previous month" title="Previous month"
              className="grid h-9 w-9 place-items-center rounded-md border border-[var(--line)] text-[var(--ink-muted)] hover:text-[var(--ink)]"><Icon name="chevronLeft" size={16} /></button>
            <h2 className="m-0 min-w-[140px] text-center text-[17px] font-semibold text-[var(--ink)]">{monthName(month)}</h2>
            <button type="button" onClick={() => go(1)} aria-label="Next month" title="Next month"
              className="grid h-9 w-9 place-items-center rounded-md border border-[var(--line)] text-[var(--ink-muted)] hover:text-[var(--ink)]"><Icon name="chevronRight" size={16} /></button>
          </div>
          {month !== thisMonth && <Button className={small} onClick={() => { setMonth(thisMonth); setPicked(today); }}>Today</Button>}
          <Help topic="moneyCalendar" />
          <Button className={`${small} ml-auto`} disabled={!toCome.length} onClick={saveAll} title="Save every date still to come into your own calendar">
            <Icon name="download" size={14} />Add all to my calendar
          </Button>
        </div>

        <div className="grid grid-cols-7 gap-1">
          {WEEKDAYS.map((w) => (
            <div key={w} className="pb-1 text-center text-[11px] font-medium text-[var(--ink-muted)]">
              <span className="sm:hidden">{w[0]}</span><span className="hidden sm:inline">{w}</span>
            </div>
          ))}
          {monthGrid(month).flat().map((d, i) => {
            if (!d) return <div key={`x${i}`} />;
            const evs = byDay.get(d) ?? [];
            const sum = evs.filter((e) => e.kind === 'due').reduce((s, e) => s + (e.r.amount ?? 0), 0);
            const isPicked = picked === d;
            return (
              <button key={d} type="button" onClick={() => setPicked(d)} aria-pressed={isPicked}
                aria-label={`${day(d)}${evs.length ? `: ${evs.length} ${evs.length === 1 ? 'thing' : 'things'}` : ''}`}
                className={`flex min-h-[54px] min-w-0 flex-col items-stretch gap-0.5 overflow-hidden rounded-md border p-1 text-left sm:min-h-[84px] ${
                  isPicked ? 'border-[var(--accent)] bg-[var(--accent-soft)]' : evs.length ? 'border-[var(--line-strong)] bg-[var(--surface)]' : 'border-[var(--line)] bg-[var(--surface-2)]'}`}>
                <span className={`text-[12px] leading-none ${d === today ? 'font-bold text-[var(--accent-ink)]' : 'text-[var(--ink)]'}`}>{Number(d.slice(8))}</span>
                {/* phone: dots and the day's total */}
                {evs.length > 0 && (
                  <span className="mt-auto flex flex-wrap gap-0.5 sm:hidden">
                    {evs.slice(0, 4).map((e, k) => <span key={k} className="h-1.5 w-1.5 rounded-full" style={dotStyle(e)} />)}
                  </span>
                )}
                {sum > 0 && <span className="truncate font-mono text-[10px] leading-tight text-[var(--ink-muted)] sm:hidden">{moneyShort(sum)}</span>}
                {/* wider screens: a line each */}
                {evs.slice(0, 2).map((e, k) => (
                  <span key={k} className="hidden truncate rounded px-1 text-[11px] leading-[18px] sm:block" style={markStyle(e)}>
                    {e.kind === 'first_rent' ? 'First rent' : e.r.amount != null ? moneyShort(e.r.amount) : '£?'} {e.r.payer}
                  </span>
                ))}
                {evs.length > 2 && <span className="hidden text-[11px] text-[var(--ink-muted)] sm:block">+{evs.length - 2} more</span>}
              </button>
            );
          })}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-[var(--ink-muted)]">
          {([['Due', { background: 'var(--ink-muted)' }], ['Overdue or to check', { background: 'var(--note-fg)' }],
            ['First rent expected', { boxShadow: 'inset 0 0 0 1.5px var(--ink-muted)' }], ['Paid', { background: 'var(--accent)' }]] as Array<[string, CSSProperties]>).map(([label, style]) => (
            <span key={label} className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={style} />{label}</span>
          ))}
        </div>
      </Card>

      <Card>
        <CardHeader icon="calendar" title={picked === today ? `Today, ${day(picked)}` : day(picked)}
          sub={onDay.length ? `${onDay.length} ${onDay.length === 1 ? 'thing' : 'things'}` : undefined} />
        <div className="flex flex-col px-4 py-2 sm:px-5">
          {onDay.length === 0 && <p className="m-0 py-2 text-[14px] text-[var(--ink-muted)]">Nothing on this day.</p>}
          {onDay.map((e) => (
            <div key={`${e.r.id}-${e.kind}`} className="border-b border-[var(--line)] py-2 last:border-b-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded px-1.5 py-0.5 text-[12px] font-semibold" style={markStyle(e)}>
                  {e.kind === 'due' && awaitingFirstRent(e.r) ? 'Due once the first rent is in' : KIND_WORDS[e.kind]}{e.late ? ', late' : ''}
                </span>
                {e.kind !== 'paid' && (
                  <button type="button" onClick={() => saveOne(e)} className="ml-auto inline-flex items-center gap-1 text-[13px] text-[var(--link)] hover:underline">
                    <Icon name="download" size={13} />Add to my calendar
                  </button>
                )}
              </div>
              <ul className="m-0 list-none p-0">
                <MoneyRow r={e.r} client={byId.get(e.r.applicant_id) ?? null} provider={providers.find((p) => p.id === e.r.provider_id) ?? null} />
              </ul>
            </div>
          ))}
        </div>
      </Card>

      {nextUp.length > 0 && (
        <Card>
          <CardHeader icon="clock" title="Coming up" />
          <ul className="m-0 flex list-none flex-col divide-y divide-[var(--line)] px-4 py-0 sm:px-5">
            {nextUp.map((e) => (
              <li key={`${e.r.id}-${e.kind}`}>
                <button type="button" onClick={() => { setMonth(e.day.slice(0, 7)); setPicked(e.day); }}
                  className="flex w-full flex-wrap items-baseline gap-x-3 py-2.5 text-left hover:text-[var(--accent-ink)]">
                  <span className="w-[92px] shrink-0 font-mono text-[13px] text-[var(--ink-muted)]">{day(e.day)}</span>
                  <span className="min-w-0 flex-1 text-[14px] text-[var(--ink)]">{eventTitle(e, firstName(e.r.applicant_id))}</span>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
