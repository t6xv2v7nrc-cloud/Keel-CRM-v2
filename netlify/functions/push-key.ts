// GET /api/push-key: Keel's public push key, for a device turning notifications on (Settings, My settings).
// Only for people signed in to Keel. The key pair is made the first time and kept where only the server can read it.

import { admin, caller, json, keys, NOT_READY } from './lib/push';

export default async (req: Request): Promise<Response> => {
  if (req.method !== 'GET') return json({ error: 'Method not allowed' }, 405);
  if (!(await caller(req))) return json({ error: 'Sign in first' }, 401);
  const db = admin();
  if (!db) return json({ error: 'Push is not set up on the server (the Supabase service key is missing in Netlify)' }, 501);
  try {
    return json({ publicKey: (await keys(db)).publicKey });
  } catch (e) {
    const message = (e as Error).message;
    return json({ error: message }, message === NOT_READY ? 503 : 500);
  }
};
