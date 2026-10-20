// Shared by the push functions: the server's own Supabase client, Keel's push keys (made once, kept where only the
// server can read them: push_keys, 0027), checking who is calling, and sending to devices.

import webpush from 'web-push';
import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

/** The server's client (service role): sees everything, so it only ever runs here. Null when not set up. */
export function admin(): SupabaseClient | null {
  return SUPABASE_URL && SERVICE_ROLE ? createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } }) : null;
}

/** The signed-in person calling, from their Supabase token, or null. */
export async function caller(req: Request): Promise<{ id: string } | null> {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token || !SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data, error } = await supabase.auth.getUser(token);
  return error || !data.user ? null : { id: data.user.id };
}

export const NOT_READY = 'Push needs a one-off database update: run 0027_push.sql in the Supabase SQL Editor.';
const missing = (e: { code?: string; message?: string } | null) => !!e && (e.code === '42P01' || e.code === 'PGRST205' || /does not exist|schema cache/i.test(e.message ?? ''));

/** Keel's push keys, made the first time they are needed. Throws NOT_READY before 0027 is run. */
export async function keys(db: SupabaseClient): Promise<{ publicKey: string; privateKey: string }> {
  const read = async () => db.from('push_keys').select('public_key, private_key').eq('id', 1).maybeSingle();
  let { data, error } = await read();
  if (missing(error)) throw new Error(NOT_READY);
  if (error) throw error;
  if (!data) {
    const made = webpush.generateVAPIDKeys();
    // two first callers at once: whichever lands first is kept, and both read it back
    await db.from('push_keys').upsert({ id: 1, public_key: made.publicKey, private_key: made.privateKey }, { onConflict: 'id', ignoreDuplicates: true });
    ({ data, error } = await read());
    if (error || !data) throw error ?? new Error('Could not make push keys');
  }
  return { publicKey: data.public_key as string, privateKey: data.private_key as string };
}

export interface Sub { id: string; user_id: string; endpoint: string; p256dh: string; auth: string }
export interface Push { title: string; body: string; url: string; tag: string }

/** Send one notification to some devices. Devices that have gone (unsubscribed, app removed) are forgotten. */
export async function send(db: SupabaseClient, subs: Sub[], push: Push): Promise<number> {
  if (!subs.length) return 0;
  const k = await keys(db);
  webpush.setVapidDetails(process.env.OWNER_EMAIL ? `mailto:${process.env.OWNER_EMAIL}` : 'https://keelcrm.netlify.app', k.publicKey, k.privateKey);
  let sent = 0;
  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(push), { TTL: 6 * 3600, urgency: 'high' });
      sent += 1;
      await db.from('push_subscriptions').update({ last_sent_at: new Date().toISOString() }).eq('id', s.id);
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) await db.from('push_subscriptions').delete().eq('id', s.id);
    }
  }));
  return sent;
}
