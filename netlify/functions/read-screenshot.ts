// Reads a Bin screenshot with Claude and returns it as an Extraction
// (src/types/extraction.ts), the same shape the Bin's on-device reader makes.
//
// POST /api/read-screenshot  { image: <base64 JPEG>, hint?: string }
// Authorization: Bearer <the signed-in person's Supabase access token>
//
// Only people signed in to Keel can use it (each read costs a little). It
// does nothing until ANTHROPIC_API_KEY is set in Netlify: it answers 501 and
// the Bin reads the screenshot on the device instead. The key stays here, on
// the server; it never reaches the browser.

import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { cleanExtraction, EXTRACTION_SCHEMA } from '../../src/types/extraction';
import { SYSTEM_PROMPT, userPrompt } from './lib/prompt';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const MAX_IMAGE_CHARS = 5_000_000; // about 3.7 MB of JPEG; the Bin sends about 300 KB

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** London's date, so "Thursday" in a chat reads against the right today. */
const londonToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date());

export default async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  if (!process.env.ANTHROPIC_API_KEY) return json({ error: 'not_configured' }, 501);
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return json({ error: 'Supabase is not configured for functions' }, 500);

  // Signed in to Keel?
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: 'Sign in first' }, 401);
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: who, error: authError } = await supabase.auth.getUser(token);
  if (authError || !who.user) return json({ error: 'Sign in first' }, 401);

  let body: { image?: unknown; hint?: unknown };
  try { body = await req.json(); } catch { return json({ error: 'Bad JSON' }, 400); }
  const image = typeof body.image === 'string' ? body.image.replace(/^data:image\/\w+;base64,/, '') : '';
  if (!image) return json({ error: 'No image' }, 400);
  if (image.length > MAX_IMAGE_CHARS) return json({ error: 'Image too large' }, 413);
  const hint = typeof body.hint === 'string' ? body.hint.slice(0, 200) : undefined;

  // Fail fast: the Bin reads the screenshot on the device if this does not answer in time.
  const client = new Anthropic({ timeout: 25_000, maxRetries: 0 });
  try {
    const response = await client.beta.messages.create({
      model: 'claude-opus-5-5',
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low', format: { type: 'json_schema', schema: EXTRACTION_SCHEMA } },
      system: SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: image } },
          { type: 'text', text: userPrompt(londonToday(), hint) },
        ],
      }],
    });
    if (response.stop_reason === 'refusal') return json({ error: 'declined' }, 422);
    if (response.stop_reason === 'max_tokens') return json({ error: 'too_long' }, 422);
    const answer = response.content.find((b) => b.type === 'text');
    if (!answer || answer.type !== 'text') return json({ error: 'no_answer' }, 502);
    let parsed: unknown;
    try { parsed = JSON.parse(answer.text); } catch { return json({ error: 'bad_answer' }, 502); }
    const extraction = cleanExtraction(parsed);
    if (!extraction) return json({ error: 'bad_answer' }, 502);
    return json({ extraction, model: response.model });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return json({ error: 'busy' }, 429);
    if (e instanceof Anthropic.AuthenticationError) return json({ error: 'The Anthropic key in Netlify is not valid' }, 502);
    if (e instanceof Anthropic.APIConnectionTimeoutError) return json({ error: 'timeout' }, 504);
    if (e instanceof Anthropic.APIError) return json({ error: `Claude: ${e.status ?? ''} ${e.message}`.trim() }, 502);
    throw e;
  }
};
