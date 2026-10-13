// Targets: how the team is doing this week, month and year against the targets in Team settings.
//   placements  clients who moved in during the period (a deal moved in, or a letting fee signed up with no deal)
//   fees        letting fees and incentives signed up in the period, paid or not (declined ones left out)
// Weeks run Monday to Sunday. "Pace" is where you would be by now at an even rate.

import type { Deal, Receivable } from './types';
import type { Target } from './settings';
import { isoDay } from './calls';
import { money, shortDay } from './format';

export type PeriodKey = 'week' | 'month' | 'year';
export interface Period { key: PeriodKey; label: string; from: string; to: string; gone: number }

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const day = (y: number, m: number, d: number) => new Date(y, m, d, 12);

/** The week (Monday to Sunday), month or year that today falls in, and how much of it has gone (0 to 1). */
export function periodOf(key: PeriodKey, now = new Date()): Period {
  const y = now.getFullYear(), m = now.getMonth(), d = now.getDate();
  let start: Date, end: Date, label: string;
  if (key === 'week') {
    const back = (now.getDay() + 6) % 7; // Monday = 0
    start = day(y, m, d - back);
    end = day(y, m, d - back + 6);
    label = `This week, ${shortDay(start)} to ${shortDay(end)}`;
  } else if (key === 'month') {
    start = day(y, m, 1);
    end = day(y, m + 1, 0);
    label = `${MONTHS[m]} ${y}`;
  } else {
    start = day(y, 0, 1);
    end = day(y, 11, 31);
    label = String(y);
  }
  const days = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
  const done = Math.round((day(y, m, d).getTime() - start.getTime()) / 86_400_000) + 1; // today counts as gone
  return { key, label, from: isoDay(start), to: isoDay(end), gone: Math.min(1, Math.max(0, done / days)) };
}

const within = (iso: string | null | undefined, p: Pick<Period, 'from' | 'to'>) => !!iso && iso.slice(0, 10) >= p.from && iso.slice(0, 10) <= p.to;

/** Placements and fees in a period. */
export function progressIn(p: Pick<Period, 'from' | 'to'>, deals: Deal[], receivables: Receivable[]): { placements: number; fees: number } {
  const placed = new Set<string>();
  for (const d of deals) if (d.status === 'moved_in' && within(d.move_in_on ?? d.updated_at, p)) placed.add(d.applicant_id);
  for (const r of receivables) if (r.kind === 'letting_fee' && r.status !== 'declined' && within(r.sign_up_on, p)) placed.add(r.applicant_id);
  const fees = receivables
    .filter((r) => r.status !== 'declined' && within(r.sign_up_on, p))
    .reduce((s, r) => s + (r.amount ?? 0), 0);
  return { placements: placed.size, fees: Math.round(fees * 100) / 100 };
}

export interface TargetLine {
  key: 'placements' | 'fees';
  label: string;
  done: number;
  target: number;
  /** 0 to 1 of the target reached (capped at 1 for the bar) */
  share: number;
  /** where an even pace would be by now, 0 to 1 */
  pace: number;
  onTrack: boolean;
  /** "1 to go", "£300 to go", "Target reached" */
  words: string;
  /** "1 of 2", "£300 of £600" */
  amount: string;
}

/** The bars to show for a period: only the targets that are set (above 0). */
export function targetLines(target: Target, done: { placements: number; fees: number }, period: Pick<Period, 'gone'>): TargetLine[] {
  const out: TargetLine[] = [];
  const add = (key: TargetLine['key'], label: string, have: number, want: number, show: (n: number) => string) => {
    if (!want || want <= 0) return;
    const share = Math.min(1, have / want);
    const left = Math.max(0, want - have);
    out.push({
      key, label, done: have, target: want, share, pace: period.gone,
      onTrack: have >= want * period.gone - 1e-9,
      words: left === 0 ? 'Target reached' : `${show(left)} to go`,
      amount: `${show(have)} of ${show(want)}`,
    });
  };
  add('placements', 'Placements', done.placements, target.placements, (n) => String(n));
  add('fees', 'Fees secured', done.fees, target.fees, (n) => money(n));
  return out;
}
