// Viewings (Step 5 of the update brief): how each viewing went, why a deal was lost, and how fast Keel answers
// housing officers. Ridwan's targets: the first reply to an officer's nomination within 4 working hours, and the
// viewing's outcome back to the officer the same day (Team settings, `responses`).
//
// An outcome moves the deal: viewed → Viewed, offer made → Offer made, signed up → Moved in (the sign up, as everywhere
// in Keel), not going ahead → Fell through with a reason, did not turn up → back to Interested, to rebook.
// Deals from before 0022 have nothing written down: `outcomeOf` works out how their viewing went from how far they got,
// and `reasonLostOf` puts their written reason in its group. Neither is ever written back.

import type { Applicant, Deal, DealStatus, ReasonLost, ViewingOutcome } from './types';
import type { OfficerRecord } from './councils';
import { recordFor, sendAddress, statusOf } from './councils';
import { activeSettings } from './settings';
import type { ResponseRules } from './settings';
import { fromHousingOfficer } from './money';
import { isActive, isIced } from './search';
import { isoDay } from './calls';
import { clockTime, shortDate, shortDay } from './format';
import { shortAddress } from './progress';
import { signature } from './business';

// ── Outcomes and reasons ───────────────────────────────────────────

/** The outcome buttons, in the order they are offered after a viewing. */
export const OUTCOMES: ReadonlyArray<{ key: ViewingOutcome; label: string }> = [
  { key: 'viewed', label: 'They viewed it' },
  { key: 'offered', label: 'Offer made' },
  { key: 'signed', label: 'Signed up' },
  { key: 'declined', label: 'Not going ahead' },
  { key: 'no_show', label: 'Did not turn up' },
];
export const OUTCOME_WORDS: Record<ViewingOutcome, string> = {
  viewed: 'Viewed', offered: 'Offer made', signed: 'Signed up', declined: 'Not going ahead', no_show: 'Did not turn up',
};

export const REASON_WORDS: Record<ReasonLost, string> = {
  too_far: 'Too far', too_small: 'Too small', failed_affordability: 'Failed affordability or referencing',
  client_dropped_out: 'Client dropped out', property_issue: 'Problem with the property', other: 'Other',
};

/** Why a deal was lost: one list, grouped by the reason that is counted (`reason_lost`), each keeping its own words. */
export const LOST_REASONS: ReadonlyArray<{ code: ReasonLost; reasons: readonly string[] }> = [
  { code: 'too_far', reasons: ['Too far from where they need to be'] },
  { code: 'too_small', reasons: ['Too small for them'] },
  { code: 'failed_affordability', reasons: ['Failed referencing or affordability', 'Landlord would not take UC or benefits', 'Council did not approve'] },
  { code: 'client_dropped_out', reasons: ['Client said no', 'Client did not turn up', 'Client stopped replying', 'Client found somewhere else'] },
  { code: 'property_issue', reasons: ['Problem with the property', 'Landlord pulled out', 'Let to someone else'] },
  { code: 'other', reasons: ['Other'] },
];

/** Written when a client moves in through Keel and their other properties close: not a loss. */
export const MOVED_IN_ELSEWHERE = 'Moved in somewhere else with Keel';

/** The group a written reason belongs to: its place in the list, else a guess from its words, else Other. */
export function reasonCode(text: string | null | undefined): ReasonLost | null {
  const t = (text ?? '').trim().toLowerCase();
  if (!t || t === MOVED_IN_ELSEWHERE.toLowerCase()) return null;
  const listed = LOST_REASONS.find((g) => g.reasons.some((r) => r.toLowerCase() === t));
  if (listed) return listed.code;
  if (/too far|distance|commute|location/.test(t)) return 'too_far';
  if (/too small|not big enough|more space|more bedrooms/.test(t)) return 'too_small';
  if (/afford|referenc|benefit|\buc\b|guarantor|credit|income|council did not|not approved/.test(t)) return 'failed_affordability';
  if (/let to someone|landlord|property|repair|damp|mould|condition|withdrawn/.test(t)) return 'property_issue';
  if (/client|tenant|dropped out|changed (their|her|his) mind|no longer|stopped replying|did not turn up|no show/.test(t)) return 'client_dropped_out';
  return 'other';
}

/** Why a deal that fell through was lost: as recorded (0022), else from its written reason. Null while it is live, and
 *  for deals closed because the client moved in elsewhere with Keel. */
export function reasonLostOf(d: Pick<Deal, 'status' | 'fell_through_reason'> & Partial<Pick<Deal, 'reason_lost'>>): ReasonLost | null {
  if (d.status !== 'fell_through') return null;
  if (d.fell_through_reason === MOVED_IN_ELSEWHERE) return null;
  return d.reason_lost ?? reasonCode(d.fell_through_reason) ?? 'other';
}

/** How the viewing went: as recorded (0022), else from how far the deal got after it. Null if nobody has viewed yet. */
export function outcomeOf(d: Pick<Deal, 'status' | 'viewing_at' | 'fell_through_reason'> & Partial<Pick<Deal, 'viewing_outcome'>>): ViewingOutcome | null {
  if (d.viewing_outcome) return d.viewing_outcome;
  switch (d.status) {
    case 'viewed': return 'viewed';
    case 'offered': case 'accepted': return 'offered';
    case 'moved_in': return 'signed';
    case 'fell_through':
      if (!d.viewing_at || d.fell_through_reason === MOVED_IN_ELSEWHERE) return null;
      return reasonCode(d.fell_through_reason) === 'client_dropped_out' && /turn up/i.test(d.fell_through_reason ?? '') ? 'no_show' : 'declined';
    default: return null;
  }
}

/** The deal step an outcome moves to. */
export function outcomeStep(o: ViewingOutcome): DealStatus {
  switch (o) {
    case 'viewed': return 'viewed';
    case 'offered': return 'offered';
    case 'signed': return 'moved_in';
    case 'declined': return 'fell_through';
    case 'no_show': return 'interested';
  }
}

const AFTER_VIEWING: DealStatus[] = ['viewed', 'offered', 'accepted'];

/**
 * What a deal's outcome fields become when it moves (0022), or null to leave them. An outcome picked by hand wins.
 * Booking a new viewing clears the last one (a no-show rebooked), so the next outcome is recorded and sent afresh.
 * Moving on after a viewing records the outcome that move means; cancelling a viewing before its time records none.
 */
export function outcomeForMove(
  d: Pick<Deal, 'status' | 'viewing_at'> & Partial<Pick<Deal, 'viewing_outcome'>>, to: DealStatus,
  opts: { picked?: ViewingOutcome | null; reason?: string | null; now?: Date } = {},
): { viewing_outcome: ViewingOutcome | null; outcome_at: string | null; outcome_sent_to_officer_at?: null } | null {
  const now = opts.now ?? new Date();
  if (to === 'viewing') return d.viewing_outcome ? { viewing_outcome: null, outcome_at: null, outcome_sent_to_officer_at: null } : null;
  const was = (o: ViewingOutcome | null) => (o && o !== d.viewing_outcome ? { viewing_outcome: o, outcome_at: now.toISOString() } : null);
  if (opts.picked) return was(opts.picked);
  const viewed = d.status === 'viewing' && !!d.viewing_at && new Date(d.viewing_at) <= now;
  if (!viewed && !AFTER_VIEWING.includes(d.status)) return null;
  switch (to) {
    case 'viewed': return was('viewed');
    case 'offered': case 'accepted': return was('offered');
    case 'moved_in': return was('signed');
    case 'fell_through': return was(/turn up/i.test(opts.reason ?? '') ? 'no_show' : 'declined');
    default: return null;
  }
}

// ── Working hours ──────────────────────────────────────────────────

const minutesOf = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
};
const isWorkday = (d: Date) => d.getDay() !== 0 && d.getDay() !== 6;
const at = (d: Date, minutes: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, minutes);
const nextDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);

/** The moment `hours` working hours after `from` (Monday to Friday, between the day's start and end). */
export function addWorkingHours(from: Date, hours: number, rules: ResponseRules = activeSettings().responses): Date {
  const start = minutesOf(rules.dayStart), end = minutesOf(rules.dayEnd);
  if (end <= start) return new Date(from.getTime() + hours * 3_600_000);
  let left = Math.max(0, hours) * 60;
  let cur = new Date(from);
  for (let guard = 0; guard < 1000; guard++) {
    const close = at(cur, end);
    if (!isWorkday(cur) || cur >= close) { cur = at(nextDay(cur), start); continue; }
    if (cur < at(cur, start)) cur = at(cur, start);
    const room = (close.getTime() - cur.getTime()) / 60_000;
    if (left <= room) return new Date(cur.getTime() + left * 60_000);
    left -= room;
    cur = at(nextDay(cur), start);
  }
  return cur;
}

/** Working hours between two moments (for how long a reply took). */
export function workingHoursBetween(from: Date, to: Date, rules: ResponseRules = activeSettings().responses): number {
  if (to <= from) return 0;
  const start = minutesOf(rules.dayStart), end = minutesOf(rules.dayEnd);
  if (end <= start) return (to.getTime() - from.getTime()) / 3_600_000;
  let total = 0;
  for (let day = at(from, 0), guard = 0; day < to && guard < 2000; day = nextDay(day), guard++) {
    if (!isWorkday(day)) continue;
    const s = Math.max(at(day, start).getTime(), from.getTime()), e = Math.min(at(day, end).getTime(), to.getTime());
    if (e > s) total += e - s;
  }
  return total / 3_600_000;
}

/** "1.5 working hours", "20 working minutes" */
export function tookWords(hours: number): string {
  if (hours < 1) { const m = Math.max(1, Math.round(hours * 60)); return `${m} working ${m === 1 ? 'minute' : 'minutes'}`; }
  const h = Math.round(hours * 10) / 10;
  return `${h} working ${h === 1 ? 'hour' : 'hours'}`;
}

// ── Response discipline ────────────────────────────────────────────

type OfficerClient = Pick<Applicant, 'officer_name' | 'officer_email' | 'officer_phone' | 'source' | 'created_at' | 'stage' | 'iced_at' | 'iced_until'>
  & Partial<Pick<Applicant, 'nominated_at' | 'officer_replied_at'>>;

/** When a housing officer's nomination arrived: as set, else when the client got in touch. Null if no officer sent them. */
export function nominationOf(a: OfficerClient): string | null {
  return fromHousingOfficer(a) ? a.nominated_at ?? a.created_at : null;
}

export interface ReplyState {
  nominatedAt: string;
  /** the target for the first reply: replyHours working hours after the nomination */
  due: Date;
  repliedAt: string | null;
  /** still waiting for a first reply, recent enough to chase, and still being housed */
  waiting: boolean;
  overdue: boolean;
  /** replied after the target, or still waiting past it */
  late: boolean;
  /** working hours the first reply took */
  took: number | null;
}

/** Where the first reply to an officer's nomination stands, or null for clients no officer sent. */
export function replyState(a: OfficerClient, now = new Date(), rules: ResponseRules = activeSettings().responses): ReplyState | null {
  const nominatedAt = nominationOf(a);
  if (!nominatedAt) return null;
  const from = new Date(nominatedAt);
  const due = addWorkingHours(from, rules.replyHours, rules);
  const repliedAt = a.officer_replied_at ?? null;
  const recent = now.getTime() - from.getTime() <= rules.watchDays * 86_400_000;
  const waiting = !repliedAt && recent && isActive(a) && !isIced(a, now);
  const overdue = waiting && now > due;
  return {
    nominatedAt, due, repliedAt, waiting, overdue,
    late: repliedAt ? new Date(repliedAt) > due : overdue,
    took: repliedAt ? workingHoursBetween(from, new Date(repliedAt), rules) : null,
  };
}

export interface OutcomeBack {
  outcome: ViewingOutcome;
  /** the viewing's day (YYYY-MM-DD): the outcome is due back by the end of it */
  day: string;
  due: Date;
  sentAt: string | null;
  waiting: boolean;
  overdue: boolean;
  late: boolean;
}

/** The viewing's outcome going back to the officer, due by the end of the viewing's day. Null unless an officer sent the
 *  client and an outcome has been recorded (worked-out outcomes of old deals are never chased). */
export function outcomeBack(
  d: Pick<Deal, 'viewing_at' | 'updated_at'> & Partial<Pick<Deal, 'viewing_outcome' | 'outcome_at' | 'outcome_sent_to_officer_at'>>,
  a: OfficerClient, now = new Date(), rules: ResponseRules = activeSettings().responses,
): OutcomeBack | null {
  if (!d.viewing_outcome || !fromHousingOfficer(a)) return null;
  const when = new Date(d.viewing_at ?? d.outcome_at ?? d.updated_at);
  const day = isoDay(when);
  const due = new Date(when.getFullYear(), when.getMonth(), when.getDate(), 23, 59, 59);
  const sentAt = d.outcome_sent_to_officer_at ?? null;
  const waiting = !sentAt && now.getTime() - when.getTime() <= rules.watchDays * 86_400_000;
  const overdue = waiting && now > due;
  return { outcome: d.viewing_outcome, day, due, sentAt, waiting, overdue, late: sentAt ? new Date(sentAt) > due : overdue };
}

/** Booked viewings whose time has passed with nothing recorded, most recent first (within the watch days). */
export function toRecord(deals: Deal[], now = new Date(), rules: ResponseRules = activeSettings().responses): Deal[] {
  return deals.filter((d) => d.status === 'viewing' && d.viewing_at && new Date(d.viewing_at) <= now
      && now.getTime() - new Date(d.viewing_at).getTime() <= rules.watchDays * 86_400_000)
    .sort((x, y) => y.viewing_at!.localeCompare(x.viewing_at!));
}

export type DueItem =
  | { kind: 'reply'; applicant: Applicant; due: Date; overdue: boolean }
  | { kind: 'record'; applicant: Applicant; deal: Deal; due: Date; overdue: boolean }
  | { kind: 'outcome'; applicant: Applicant; deal: Deal; due: Date; overdue: boolean };

/** What Keel owes people right now: first replies to officers, viewings to record, outcomes to send back. Soonest due first. */
export function responsesDue(applicants: Applicant[], deals: Deal[], now = new Date(), rules: ResponseRules = activeSettings().responses): DueItem[] {
  const byId = new Map(applicants.map((a) => [a.id, a]));
  const items: DueItem[] = [];
  for (const a of applicants) {
    const r = replyState(a, now, rules);
    if (r?.waiting) items.push({ kind: 'reply', applicant: a, due: r.due, overdue: r.overdue });
  }
  for (const d of toRecord(deals, now, rules)) {
    const a = byId.get(d.applicant_id);
    if (!a) continue;
    const v = new Date(d.viewing_at!);
    const due = new Date(v.getFullYear(), v.getMonth(), v.getDate(), 23, 59, 59);
    items.push({ kind: 'record', applicant: a, deal: d, due, overdue: now > due });
  }
  for (const d of deals) {
    const a = byId.get(d.applicant_id);
    const o = a ? outcomeBack(d, a, now, rules) : null;
    if (a && o?.waiting) items.push({ kind: 'outcome', applicant: a, deal: d, due: o.due, overdue: o.overdue });
  }
  return items.sort((x, y) => x.due.getTime() - y.due.getTime());
}

/** "by 2pm today", "by 10:30am tomorrow", "by 9:15am Tue 14 Oct"; end-of-day deadlines read "today" or "by Tue 14 Oct". */
export function dueWords(due: Date, now = new Date()): string {
  const endOfDay = due.getHours() === 23 && due.getMinutes() === 59;
  const day = isoDay(due) === isoDay(now) ? 'today' : isoDay(due) === isoDay(nextDay(now)) ? 'tomorrow' : shortDay(due);
  if (endOfDay) return day === 'today' || day === 'tomorrow' ? day : `by ${day}`;
  return `by ${clockTime(due)} ${day}`;
}

// ── Telling the officer ────────────────────────────────────────────

export interface CaseAddress { address: string | null; note: string | null; officer: OfficerRecord | null }

/**
 * Where an update about the officer's own client goes. This is casework, not a mailing: an officer who opted out of
 * property emails still hears about their client. Someone who has left, or whose email bounced, is never written to:
 * their team mailbox if there is one, else nothing. A shared mailbox replaces a personal email, as everywhere.
 */
export function caseworkAddress(a: Pick<Applicant, 'officer_name' | 'officer_email' | 'officer_phone'>, records: OfficerRecord[], today?: string): CaseAddress {
  const rec = recordFor({ email: a.officer_email, phone: a.officer_phone }, records);
  const name = a.officer_name?.trim() || rec?.name?.trim() || 'The officer';
  const own = a.officer_email?.trim() || null;
  if (!rec) return { address: own, officer: null, note: own ? null : `No email saved for ${name === 'The officer' ? 'the officer' : name}` };
  const status = statusOf(rec, today);
  const box = rec.send_to_mailbox?.trim() || null;
  if (status === 'left' || status === 'bounced') {
    const why = status === 'left' ? `${name} has left` : `${name}'s email bounced`;
    return { address: box, officer: rec, note: box ? `${why}: this goes to the team mailbox` : `${why}: find out who has the case now` };
  }
  const note = status === 'on_leave' ? `${name} is on leave${rec.leave_until ? ` until ${shortDate(rec.leave_until)}` : ''}${box ? ': this goes to the team mailbox' : ''}`
    : status === 'opted_out' ? `${name} opted out of property emails; this is about their own client`
    : box ? 'This goes to the team mailbox' : null;
  return { address: sendAddress(rec) ?? own, officer: rec, note };
}

const firstOf = (name: string | null | undefined) => (name ?? '').trim().split(/\s+/)[0] || '';

/** The email telling the officer how the viewing went. The officer referred the client, so the full name is in the subject. */
export function outcomeEmail(
  a: Pick<Applicant, 'full_name' | 'officer_name'>, d: Pick<Deal, 'address' | 'viewing_at' | 'move_in_on' | 'updated_at' | 'fell_through_reason'> & Partial<Pick<Deal, 'viewing_outcome' | 'reason_lost' | 'outcome_at'>>,
  myName?: string | null,
): { subject: string; body: string } {
  const who = firstOf(a.full_name) || 'Your client';
  const where = shortAddress(d.address);
  const day = shortDay(d.viewing_at ?? d.outcome_at ?? d.updated_at);
  const reason = d.reason_lost ? REASON_WORDS[d.reason_lost] : reasonCode(d.fell_through_reason) ? REASON_WORDS[reasonCode(d.fell_through_reason)!] : null;
  const line = (() => {
    switch (d.viewing_outcome) {
      case 'no_show': return `${who} did not make it to the viewing at ${where} on ${day}. Could you check in with them? We are happy to rebook.`;
      case 'offered': return `${who} viewed ${where} on ${day} and has been offered it. We will confirm the move-in date as soon as we have it.`;
      case 'signed': return `${who} has signed up for ${where}${d.move_in_on ? `, moving in on ${shortDate(d.move_in_on)}` : ''}.`;
      case 'declined': return `${who} viewed ${where} on ${day}, and it is not going ahead${reason ? ` (${reason.toLowerCase()})` : ''}. We will keep looking and send anything that fits.`;
      default: return `${who} viewed ${where} on ${day}. We are waiting to hear back from the landlord and will let you know.`;
    }
  })();
  const hi = firstOf(a.officer_name);
  return {
    subject: `${a.full_name}: viewing at ${where}`,
    body: [`Hi ${hi || 'there'},`, '', line, '', 'Kind regards,', ...signature(myName)].join('\n'),
  };
}

export const mailtoLink = (to: string, m: { subject: string; body: string }) =>
  `mailto:${encodeURIComponent(to).replace(/%40/g, '@')}?subject=${encodeURIComponent(m.subject)}&body=${encodeURIComponent(m.body)}`;
