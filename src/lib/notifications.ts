// What needs you, as notifications: the bell in the top bar (and the pop-ups while Keel is open) reads from here, by
// the same rules as Home. Nothing is stored for them: each is worked out from the clients, deals, the Bin, Finances
// and Outlook, with an id that stays the same while it is the same thing, so it can be marked read on this device and
// come back unread only when something new happens (another item in the Bin, a viewing moved).
//
// Words: first names and short addresses only, as these can show on a locked phone (push.ts sends the same).

import type { Activity, Applicant, Deal, Receivable } from './types';
import { responsesDue, dueWords } from './viewings';
import { clockTime, money } from './format';
import { shortAddress } from './progress';
import { isOpen, overdueDays, awaitingSignUp } from './money';
import { isIced } from './search';

export type NoticeKind = 'bin' | 'reply' | 'record' | 'outcome' | 'viewing' | 'steps' | 'overdue' | 'officer_email' | 'email' | 'ice';

export interface Notice {
  id: string;
  kind: NoticeKind;
  title: string;
  detail: string | null;
  href: string;
  /** when it happened, or when it is due: newest first within the urgent and the rest */
  at: string;
  urgent: boolean;
}

export interface NoticeInput {
  applicants: Applicant[];
  deals: Deal[];
  inbox: Array<{ id: string; status: string; source_hint: string | null; created_at: string }>;
  receivables: Receivable[];
  /** Outlook emails waiting to be filed (0026) */
  officerEmails: Array<{ message_id: string; from_name: string | null; from_address: string; subject: string | null; received_at: string }>;
  /** officers' emails that went on a client's timeline (activities of kind "email") */
  emails: Activity[];
  /** next steps due today or before, by client */
  stepsDue: number;
  now?: Date;
}

const first = (name: string | null | undefined) => (name ?? '').trim().split(/\s+/)[0] || 'A client';
/** The officer by first name; in full when they share it with the client ("Reply to Priya Example about Priya"). */
const officerFirst = (a: Applicant) => {
  const f = first(a.officer_name);
  if (f === 'A client') return 'their officer';
  return f === first(a.full_name) ? (a.officer_name ?? '').trim() : f;
};
const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Everything that needs someone now: urgent first, then newest. */
export function noticesFor(x: NoticeInput): Notice[] {
  const now = x.now ?? new Date();
  const today = isoDay(now);
  const out: Notice[] = [];
  const byId = new Map(x.applicants.map((a) => [a.id, a]));

  // the Bin: one line for all waiting, unread again when another arrives
  const review = x.inbox.filter((i) => i.status === 'review').sort((a, b) => b.created_at.localeCompare(a.created_at));
  if (review.length) {
    out.push({
      id: `bin:${review[0].id}`, kind: 'bin', href: '/bin', at: review[0].created_at, urgent: false,
      title: review.length === 1 ? 'New in the Bin to review' : `${review.length} in the Bin to review`,
      detail: review[0].source_hint ? `Newest: ${review[0].source_hint}` : null,
    });
  }

  // replies and outcomes owed to officers, viewings to record (Home's Waiting on us)
  for (const d of responsesDue(x.applicants, x.deals, now)) {
    const soon = d.overdue || d.due.getTime() - now.getTime() < 60 * 60_000;
    const when = d.overdue ? `Overdue: was due ${dueWords(d.due, now)}` : `Due ${dueWords(d.due, now)}`;
    if (d.kind === 'reply') {
      out.push({ id: `reply:${d.applicant.id}`, kind: 'reply', href: `/applicants/${d.applicant.id}`, at: d.due.toISOString(), urgent: soon,
        title: `Reply to ${officerFirst(d.applicant)} about ${first(d.applicant.full_name)}`, detail: `${when}. A nomination gets a first reply within 4 working hours.` });
    } else if (d.kind === 'outcome') {
      out.push({ id: `outcome:${d.deal.id}`, kind: 'outcome', href: `/applicants/${d.applicant.id}`, at: d.due.toISOString(), urgent: soon,
        title: `Tell ${officerFirst(d.applicant)} how ${first(d.applicant.full_name)}'s viewing went`, detail: `${when}. ${shortAddress(d.deal.address)}` });
    } else {
      out.push({ id: `record:${d.deal.id}`, kind: 'record', href: `/applicants/${d.applicant.id}`, at: d.due.toISOString(), urgent: d.overdue,
        title: `How did ${first(d.applicant.full_name)}'s viewing go?`, detail: `${shortAddress(d.deal.address)}: record it, then tell the officer` });
    }
  }

  // viewings in the next 3 hours (urgent within the hour)
  for (const d of x.deals) {
    if (!d.viewing_at || d.status !== 'viewing') continue;
    const at = new Date(d.viewing_at);
    const mins = (at.getTime() - now.getTime()) / 60_000;
    if (mins < -15 || mins > 180) continue;
    const a = byId.get(d.applicant_id);
    out.push({ id: `viewing:${d.id}:${d.viewing_at}`, kind: 'viewing', href: `/applicants/${d.applicant_id}`, at: d.viewing_at, urgent: mins <= 60,
      title: `Viewing at ${clockTime(at)}: ${first(a?.full_name)}`, detail: shortAddress(d.address) });
  }

  // next steps due: one line, unread again when there are more
  if (x.stepsDue > 0) {
    out.push({ id: `steps:${today}:${x.stepsDue}`, kind: 'steps', href: '/', at: `${today}T08:00:00`, urgent: false,
      title: `${x.stepsDue} ${x.stepsDue === 1 ? 'next step' : 'next steps'} due`, detail: 'On Home, under Next steps due' });
  }

  // money owed and overdue
  for (const r of x.receivables) {
    if (!isOpen(r) || awaitingSignUp(r)) continue;
    const late = overdueDays(r, today);
    if (late === null || late <= 0) continue;
    out.push({ id: `overdue:${r.id}`, kind: 'overdue', href: '/finances', at: r.due_on ?? today, urgent: late >= 14,
      title: `${r.amount != null ? money(r.amount) : 'A payment'} overdue from ${r.payer}`, detail: `${late} ${late === 1 ? 'day' : 'days'} late` });
  }

  // officers' emails from Outlook: waiting to be filed, and ones that went on a client's timeline (last 3 days)
  const waiting = [...x.officerEmails].sort((a, b) => b.received_at.localeCompare(a.received_at));
  if (waiting.length) {
    out.push({ id: `officer_email:${waiting[0].message_id}`, kind: 'officer_email', href: '/bin', at: waiting[0].received_at, urgent: false,
      title: waiting.length === 1 ? `Email from ${waiting[0].from_name ?? waiting[0].from_address} to file` : `${waiting.length} officer emails to file`,
      detail: waiting[0].subject });
  }
  const since = new Date(now.getTime() - 3 * 86_400_000).toISOString();
  for (const e of x.emails) {
    if (e.kind !== 'email' || e.created_at < since) continue;
    const who = /^Email from ([^:(]+)/.exec(e.body)?.[1]?.trim() ?? 'An officer';
    const a = byId.get(e.entity_id);
    out.push({ id: `email:${e.id}`, kind: 'email', href: `/applicants/${e.entity_id}`, at: e.created_at, urgent: false,
      title: `${who} emailed about ${first(a?.full_name)}`, detail: e.body.replace(/^Email from [^:]+:\s*/, '').slice(0, 120) });
  }

  // back from ice today
  for (const a of x.applicants) {
    if (a.iced_until === today && !isIced(a)) {
      out.push({ id: `ice:${a.id}:${a.iced_until}`, kind: 'ice', href: `/applicants/${a.id}`, at: `${today}T08:00:00`, urgent: false,
        title: `${first(a.full_name)} is back from ice`, detail: 'Check in with them' });
    }
  }

  return out.sort((a, b) => Number(b.urgent) - Number(a.urgent) || b.at.localeCompare(a.at));
}

/** Which notices are unread: those not marked read on this device. */
export const unreadOf = (list: Notice[], read: ReadonlySet<string>) => list.filter((n) => !read.has(n.id));

// ── What goes to phones (push, sent by the server every 10 minutes) ─

export interface PushMessage { title: string; body: string; url: string; tag: string; keys: string[] }

/** Worth a phone notification as soon as it appears: something new, or a viewing within the hour. Money overdue and
 *  next steps wait for the morning summary. */
export const pushWorthy = (n: Notice) => (n.kind === 'viewing' ? n.urgent : ['bin', 'reply', 'record', 'officer_email', 'email', 'ice'].includes(n.kind));

export interface MorningCounts { viewingsToday: number; stepsDue: number; repliesOwed: number; overdue: number }

/** "Today: 2 viewings, 3 next steps due, 1 reply owed" */
export function morningWords(c: MorningCounts): string {
  const parts = [
    c.viewingsToday ? `${c.viewingsToday} ${c.viewingsToday === 1 ? 'viewing' : 'viewings'}` : null,
    c.stepsDue ? `${c.stepsDue} next ${c.stepsDue === 1 ? 'step' : 'steps'} due` : null,
    c.repliesOwed ? `${c.repliesOwed} ${c.repliesOwed === 1 ? 'reply' : 'replies'} owed to officers` : null,
    c.overdue ? `${c.overdue} ${c.overdue === 1 ? 'payment' : 'payments'} overdue` : null,
  ].filter(Boolean);
  return parts.length ? `Today: ${parts.join(', ')}.` : 'Nothing pressing yet: a good morning to chase new properties.';
}

/** What to send now: each new notice once (more than three at once go as one), and the morning summary on a working
 *  day between 8:30 and 11 (London time, as the server runs in it). `sent` is what has gone before. */
export function pushPlan(notices: Notice[], sent: ReadonlySet<string>, now: Date, morning: MorningCounts): PushMessage[] {
  const fresh = notices.filter((n) => pushWorthy(n) && !sent.has(n.id));
  const out: PushMessage[] = fresh.length > 3
    ? [{ title: `${fresh.length} things need you in Keel`, body: fresh.slice(0, 4).map((n) => n.title).join(' · '), url: '/', tag: 'keel-batch', keys: fresh.map((n) => n.id) }]
    : fresh.map((n) => ({ title: n.title, body: n.detail ?? 'Open Keel', url: n.href, tag: n.id, keys: [n.id] }));
  const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const mins = now.getHours() * 60 + now.getMinutes();
  const weekday = now.getDay() >= 1 && now.getDay() <= 5;
  if (weekday && mins >= 8 * 60 + 30 && mins < 11 * 60 && !sent.has(`morning:${day}`)) {
    out.push({ title: 'Good morning from Keel', body: morningWords(morning), url: '/', tag: `morning:${day}`, keys: [`morning:${day}`] });
  }
  return out;
}
