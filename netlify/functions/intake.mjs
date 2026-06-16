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

// Netlify form webhooks expose fields in several shapes:
//   body.human_fields = { "First Name": "ali", ... }   (pretty labels)
//   body.data         = { "first-name": "ali", ... }   (raw input names)
//   body.payload.{data,human_fields} on some events
// We flatten every candidate map into one normalised lookup, then fuzzy-match.
function resolveFields(body) {
  const sources = [
    body?.human_fields, body?.payload?.human_fields,
    body?.data, body?.payload?.data,
    body?.payload, body,
  ];
  const flat = {};
  for (const src of sources) {
    if (src && typeof src === 'object' && !Array.isArray(src)) {
      for (const [k, v] of Object.entries(src)) {
        if (v == null || typeof v === 'object') continue;
        const nk = String(k).toLowerCase().replace(/[\s_-]+/g, '');
        if (!(nk in flat)) flat[nk] = String(v).trim();
      }
    }
  }

  // exact-key match first, then substring
  const pick = (exacts, subs = []) => {
    for (const e of exacts) if (flat[e]) return flat[e];
    for (const s of subs) {
      const hit = Object.keys(flat).find((k) => k.includes(s));
      if (hit && flat[hit]) return flat[hit];
    }
    return '';
  };

  const firstName = pick(['firstname', 'fname', 'givenname'], ['first']);
  const lastName = pick(['lastname', 'surname', 'lname'], ['last', 'surname']);
  const fullNameDirect = pick(['fullname', 'name']); // exact only — avoids matching first/last
  const full_name = (`${firstName} ${lastName}`.trim()) || fullNameDirect;
  const email = pick(['email', 'emailaddress'], ['email', 'mail']);
  const phone = pick(['phone', 'mobile', 'tel', 'telephone', 'contactnumber'], ['phone', 'mobile', 'tel']);
  const enquiryType = pick(['enquirytype', 'type', 'subject'], ['enquirytype']);
  const message = pick(['message', 'enquiry', 'comments', 'comment', 'details'], ['message', 'enquiry', 'comment']);

  return { keys: Object.keys(flat), full_name, email, phone, enquiryType, message };
}

function buildExtraction(f) {
  const message = f.message;
  const { adults, children } = parseHousehold(message);
  const budget = parseBudget(message);

  return {
    doc_type: 'applicant_referral',
    transcription: [
      f.full_name && `Name: ${f.full_name}`,
      f.email && `Email: ${f.email}`,
      f.phone && `Phone: ${f.phone}`,
      f.enquiryType && `Enquiry Type: ${f.enquiryType}`,
      message && `Message:\n${message}`,
    ].filter(Boolean).join('\n'),
    summary: `Website enquiry from ${f.full_name || f.email || 'an applicant'}${budget ? `, budget up to £${budget}` : ''}.`,
    confidence: 0.95,
    applicant: {
      full_name: f.full_name || undefined,
      email: f.email || undefined,
      phone: f.phone ? toE164(f.phone) : undefined,
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

  const f = resolveFields(body);
  console.log('intake fields:', JSON.stringify({ keys: f.keys, name: f.full_name, email: f.email, phone: f.phone }));

  // Need at least one identifier. If truly nothing, keep the raw body so the
  // submission is never silently lost.
  if (!f.full_name && !f.email && !f.phone) {
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
    await supabase.from('inbox_items').insert({
      image_path: null,
      source_hint: 'Website enquiry (unparsed)',
      status: 'review',
      detected_type: 'unknown',
      raw_text: JSON.stringify(body, null, 2).slice(0, 4000),
      extraction: { doc_type: 'unknown', transcription: JSON.stringify(body).slice(0, 4000), summary: 'Website enquiry — could not read fields, please review the raw text.', confidence: 0.3, suggested_actions: ['log_note_only'] },
      matches: null,
    });
    return new Response(JSON.stringify({ ok: true, parsed: false, keys: f.keys }), { status: 200, headers: { 'content-type': 'application/json' } });
  }

  const extraction = buildExtraction(f);
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
  return new Response(JSON.stringify({ ok: true, parsed: true }), { status: 200, headers: { 'content-type': 'application/json' } });
};
