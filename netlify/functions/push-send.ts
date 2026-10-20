// Every 10 minutes: what needs someone, sent to every device that turned notifications on (Settings, My settings).
// The same rules as the bell in the app (src/lib/notifications.ts), worked out here on the server: new things in the
// Bin, nominations waiting on a first reply, a viewing within the hour, officers' emails, clients back from ice, and a
// morning summary on working days. Each is sent once (push_log). First names and short addresses only.

process.env.TZ = 'Europe/London'; // working hours, "today" and the morning summary are London's

import { admin } from './lib/push';
import { send } from './lib/push';
import type { Sub } from './lib/push';
import { noticesFor, pushPlan } from '../../src/lib/notifications';
import { callQueue } from '../../src/lib/calls';
import { mergeSettings, setActiveSettings } from '../../src/lib/settings';
import { isOpen, overdueDays, awaitingSignUp } from '../../src/lib/money';
import type { Activity, Applicant, Deal, Receivable } from '../../src/lib/types';

export const config = { schedule: '*/10 * * * *' };

const rows = async <T>(q: PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> => {
  const { data, error } = await q;
  return error ? [] : ((data ?? []) as T[]);
};

export default async (): Promise<Response> => {
  const db = admin();
  if (!db) return new Response('Push is not set up (no Supabase service key)');
  const subs = await rows<Sub>(db.from('push_subscriptions').select('id, user_id, endpoint, p256dh, auth'));
  if (!subs.length) return new Response('No devices to send to');

  const team = await db.from('settings').select('value').eq('key', 'app').maybeSingle();
  setActiveSettings(mergeSettings(team.data?.value, undefined));

  const now = new Date();
  const since = new Date(now.getTime() - 3 * 86_400_000).toISOString();
  const [applicants, deals, inbox, receivables, officerEmails, emails] = await Promise.all([
    rows<Applicant>(db.from('applicants').select('*')),
    rows<Deal>(db.from('deals').select('*')),
    rows<{ id: string; status: string; source_hint: string | null; created_at: string }>(db.from('inbox_items').select('id, status, source_hint, created_at').eq('status', 'review')),
    rows<Receivable>(db.from('receivables').select('*')),
    rows<{ message_id: string; from_name: string | null; from_address: string; subject: string | null; received_at: string }>(
      db.from('outlook_messages').select('message_id, from_name, from_address, subject, received_at').eq('handled', 'pending')),
    rows<Activity>(db.from('activities').select('*').eq('kind', 'email').gte('created_at', since)),
  ]);
  const stepsDue = callQueue(applicants, new Map()).filter((q) => q.state.kind === 'due').length;
  const notices = noticesFor({ applicants, deals, inbox, receivables, officerEmails, emails, stepsDue, now });

  // what went before; the very first run only notes what is already there, so nobody gets a flood of old news
  const log = await db.from('push_log').select('key').order('sent_at', { ascending: false }).limit(2000);
  if (log.error) return new Response('Push needs 0027_push.sql');
  const sent = new Set((log.data ?? []).map((r) => r.key as string));
  if (!sent.size) {
    await db.from('push_log').upsert(notices.map((n) => ({ key: n.id })), { onConflict: 'key', ignoreDuplicates: true });
    await db.from('push_log').upsert({ key: 'started' }, { onConflict: 'key', ignoreDuplicates: true });
    return new Response(`Started: ${notices.length} already there, not sent`);
  }

  const today = now.toDateString();
  const morning = {
    viewingsToday: deals.filter((d) => d.status === 'viewing' && d.viewing_at && new Date(d.viewing_at).toDateString() === today).length,
    stepsDue,
    repliesOwed: notices.filter((n) => n.kind === 'reply').length,
    overdue: receivables.filter((r) => isOpen(r) && !awaitingSignUp(r) && (overdueDays(r) ?? 0) > 0).length,
  };
  let delivered = 0;
  for (const m of pushPlan(notices, sent, now, morning)) {
    // claim first: two runs at once never send the same thing twice
    const claim = await db.from('push_log').upsert(m.keys.map((key) => ({ key })), { onConflict: 'key', ignoreDuplicates: true }).select('key');
    if (claim.error || !(claim.data ?? []).length) continue;
    delivered += await send(db, subs, { title: m.title, body: m.body, url: m.url, tag: m.tag });
  }
  // keep the log to a month
  await db.from('push_log').delete().lt('sent_at', new Date(now.getTime() - 30 * 86_400_000).toISOString()).neq('key', 'started');
  return new Response(`Sent ${delivered}`);
};
