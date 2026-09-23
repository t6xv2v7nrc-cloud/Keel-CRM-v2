// Call tracking: outcomes, follow-up dates and who is due a call.
// A client's next call lives on the client (applicants.next_call_at); every
// call made or received is a row in calls. Dates are local calendar days
// (YYYY-MM-DD), so "today" means today in the UK, not in UTC.

import type { Applicant, Call, CallOutcome } from './types';
import { activeSettings } from './settings';
import { effectiveTier, isActive, isUrgent } from './search';

export const OUTCOMES: ReadonlyArray<{ key: CallOutcome; label: string }> = [
  { key: 'answered', label: 'Answered' },
  { key: 'no_answer', label: 'No answer' },
  { key: 'voicemail', label: 'Left voicemail' },
  { key: 'busy', label: 'Busy' },
  { key: 'wrong_number', label: 'Wrong number' },
];
export const OUTCOME_LABEL = Object.fromEntries(OUTCOMES.map((o) => [o.key, o.label])) as Record<CallOutcome, string>;

// ── Dates ──────────────────────────────────────────────────────────

export const isoDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const todayIso = () => isoDay(new Date());
export function addDays(n: number, from = new Date()): string {
  const d = new Date(from);
  d.setDate(d.getDate() + n);
  return isoDay(d);
}
const dayNumber = (iso: string) => Math.round(new Date(`${iso}T12:00:00`).getTime() / 86_400_000);

/** "Today", "Tomorrow", "Thursday", "in 12 days", "Yesterday", "3 days ago". */
export function dayLabel(iso: string): string {
  const diff = dayNumber(iso) - dayNumber(todayIso());
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  if (diff > 1 && diff < 7) return new Date(`${iso}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'long' });
  return diff > 0 ? `in ${diff} days` : `${-diff} days ago`;
}

/** Days until the next call suggested after an outcome (Settings), or null for none. */
export function suggestedGap(outcome: CallOutcome): number | null {
  const s = activeSettings();
  if (outcome === 'wrong_number') return null;
  return outcome === 'answered' ? s.callAgainAfterAnswered : s.callAgainAfterNoAnswer;
}

// ── Who is due a call ──────────────────────────────────────────────

/** Latest call per client (calls arrive newest first). */
export function lastCallMap(calls: Call[]): Map<string, Call> {
  const m = new Map<string, Call>();
  for (const c of calls) if (!m.has(c.applicant_id)) m.set(c.applicant_id, c);
  return m;
}

export type CallState =
  | { kind: 'due'; date: string; overdue: boolean }   // a follow-up is set for today or earlier
  | { kind: 'scheduled'; date: string }                // a follow-up is set for later
  | { kind: 'first'; date: string; overdue: boolean }  // never called: first call due by this date
  | { kind: 'none' };                                  // called before, nothing set

export function callState(a: Applicant, last: Call | undefined): CallState {
  if (!isActive(a)) return { kind: 'none' };
  const today = todayIso();
  if (a.next_call_at) {
    return a.next_call_at <= today
      ? { kind: 'due', date: a.next_call_at, overdue: a.next_call_at < today }
      : { kind: 'scheduled', date: a.next_call_at };
  }
  if (!last) {
    const date = addDays(activeSettings().firstCallWithinDays, new Date(a.created_at));
    return { kind: 'first', date, overdue: date < today };
  }
  return { kind: 'none' };
}

/** Plain words for a client's place in the call queue. */
export function queueLabel(state: CallState): string {
  const today = todayIso();
  if (state.kind === 'first') return state.date < today ? `New, not called yet (was due ${dayLabel(state.date).toLowerCase()})` : 'New, not called yet';
  if (state.kind === 'due') return state.date < today ? `Overdue, was due ${dayLabel(state.date).toLowerCase()}` : 'Due today';
  if (state.kind === 'scheduled') return `Next call ${dayLabel(state.date).toLowerCase()}`;
  return 'No call set';
}

/** Clients to call now: follow-ups due and new clients not yet called,
 *  most overdue first, then Tier 1, then urgent. */
export function callQueue(applicants: Applicant[], last: Map<string, Call>) {
  const today = todayIso();
  return applicants
    .map((a) => ({ a, state: callState(a, last.get(a.id)), last: last.get(a.id) }))
    .filter((x) => x.state.kind === 'due' || (x.state.kind === 'first' && x.state.date <= today))
    .sort((x, y) => {
      const dx = 'date' in x.state ? x.state.date : today;
      const dy = 'date' in y.state ? y.state.date : today;
      return dx.localeCompare(dy) || effectiveTier(x.a) - effectiveTier(y.a) || Number(isUrgent(y.a)) - Number(isUrgent(x.a));
    });
}

// ── Numbers for charts ─────────────────────────────────────────────

/** Calls per day for the last `days` days, oldest first. */
export function callsPerDay(calls: Call[], days: number): Array<{ date: string; total: number; answered: number }> {
  const out = Array.from({ length: days }, (_, i) => ({ date: addDays(i - days + 1), total: 0, answered: 0 }));
  const index = new Map(out.map((d, i) => [d.date, i]));
  for (const c of calls) {
    const i = index.get(isoDay(new Date(c.created_at)));
    if (i === undefined) continue;
    out[i].total += 1;
    if (c.outcome === 'answered') out[i].answered += 1;
  }
  return out;
}
