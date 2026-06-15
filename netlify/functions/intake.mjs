// Receives a website enquiry and files it into the CRM's Bin for review.
//
// Two callers:
//   1. Netlify Forms outgoing webhook (form submission notification) — posts
//      the submission JSON with a `.data` field map.
//   2. A manual POST of { data: { "First Name": ..., ... } }.
//
// Auth: requires ?key=<INTAKE_SECRET> matching the env var, so randoms can't
// inject applicants. Writes with the Supabase service role (server-side only).

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const INTAKE_SECRET = process.env.INTAKE_SECRET;

function toE164(raw) {
  if (!raw) return null;
  const d = String(raw).replace(/[^\d+]/g, '');
  if (d.startsWith('+44') && d.length === 13) return d;
  if (d.startsWith('44') && d.length === 12) return `+${d}`;
  if (d.startsWith('0') && d.length === 11) return `+44${d.slice(1)}`;
  return raw;
}

function parseHousehold(msg = '') {
  let adults = 1, children = 0;
  const kids = msg.match(/(\d+)\s*(child|children|kid|kids|son|sons|daughter|daughters)/i);
  if (kids) children = parseInt(kids[1], 10) || 0;
  if (/\bmy (partner|wife|husband)\b/i.test(msg)) adults = 2;
  return { adults, children };
}

function parseBudget(msg = '') {
  const range = msg.match(/£?\s?(\d{3,4})\s*[-–to]+\s*£?\s?(\d{3,4})/i);
  if (range) return Math.max(Number(range[1]), Number(range[2]));
  const single = msg.match(/budget(?:\s+is)?\s*£?\s?(\d{3,4})/i);
  if (single) return Number(single[1]);
  return undefined;
}

function buildExtraction(data) {
  const get = (k) => data[k] ?? data[k.toLowerCase()] ?? data[k.replace(/\s/g, '_').toLowerCase()] ?? '';
  const first = get('First Name');
  const last = get('Last Name');
  const message = get('Message');
  const full_name = `${first} ${last}`.trim();
  const { adults, children } = parseHousehold(message);
  const budget = parseBudget(message);

  return {
    doc_type: 'applicant_referral',
    transcription: [
      first && `First Name: ${first}`,
      last && `Last Name: ${last}`,
      get('Email') && `Email: ${get('Email')}`,
      get('Phone') && `Phone: ${get('Phone')}`,
      get('Enquiry Type') && `Enquiry Type: ${get('Enquiry Type')}`,
      message && `Message:\n${message}`,
    ].filter(Boolean).join('\n'),
    summary: `Website enquiry from ${full_name || 'an applicant'}${budget ? `, budget up to £${budget}` : ''}.`,
    confidence: 0.95,
    applicant: {
      full_name: full_name || undefined,
      phone: get('Phone') ? toE164(get('Phone')) : undefined,
      adults,
      children,
      budget_pcm: budget,
    },
    suggested_actions: ['create_applicant'],
  };
}

export default async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const url = new URL(req.url);
  if (!INTAKE_SECRET || url.searchParams.get('key') !== INTAKE_SECRET) {
    return new Response('Unauthorized', { status: 401 });
  }
  if (!SUPABASE_URL || !SERVICE_ROLE) {
    return new Response('Server not configured', { status: 500 });
  }

  let body;
  try { body = await req.json(); } catch { return new Response('Bad JSON', { status: 400 }); }

  // Netlify wraps form data under `.data`; accept a bare map too.
  const data = body?.data ?? body?.payload?.data ?? body;
  if (!data || (!data['First Name'] && !data['Email'])) {
    return new Response('No enquiry fields found', { status: 422 });
  }

  const extraction = buildExtraction(data);
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

  const { error } = await supabase.from('inbox_items').insert({
    image_path: null,
    source_hint: 'Website enquiry (auto)',
    status: 'review',
    detected_type: extraction.doc_type,
    raw_text: extraction.transcription,
    extraction,
    matches: null,
  });

  if (error) return new Response(`DB error: ${error.message}`, { status: 500 });
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } });
};
