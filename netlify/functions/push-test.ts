// POST /api/push-test: a test notification to every device the person calling has turned notifications on for.

import { admin, caller, json, NOT_READY, send } from './lib/push';
import type { Sub } from './lib/push';

export default async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const who = await caller(req);
  if (!who) return json({ error: 'Sign in first' }, 401);
  const db = admin();
  if (!db) return json({ error: 'Push is not set up on the server (the Supabase service key is missing in Netlify)' }, 501);
  const { data, error } = await db.from('push_subscriptions').select('id, user_id, endpoint, p256dh, auth').eq('user_id', who.id);
  if (error) return json({ error: NOT_READY }, 503);
  try {
    const sent = await send(db, (data ?? []) as Sub[], {
      title: 'Notifications are on', body: 'Keel will tell you here when something needs you.', url: '/', tag: 'keel-test',
    });
    return json({ sent });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
};
