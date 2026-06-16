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

function toBool(v) {
  if (v == null || v === '') return undefined;
  if (/^(yes|y|true|on|1|checked)$/i.test(String(v).trim())) return true;
  if (/^(no|n|false|off|0|unchecked)$/i.test(String(v).trim())) return false;
  return undefined;
}

function normWork(v = '') {
  const s = v.toLowerCase();
  if (s.includes('full')) return 'full_time';
  if (s.includes('part')) return 'part_time';
  if (s.includes('not') || s.includes('unemployed') || s.includes('no')) return 'not_working';
  return undefined;
}

function normHousehold(v = '') {
  const s = v.toLowerCase();
  if (s.includes('family') || s.includes('child')) return 'family';
  if (s.includes('couple')) return 'couple';
  if (s.includes('single')) return 'single';
  return v ? 'other' : undefined;
}

function normUrgency(v = '') {
  const s = v.toLowerCase();
  if (s.includes('tonight') || s.includes('homeless now')) return 'homeless_tonight';
  if (s.includes('56') || s.includes('risk')) return 'at_risk_56';
  if (s.includes('temp')) return 'temp_accommodation';
  if (s.includes('overcrowd') || s.includes('unsafe')) return 'overcrowding';
  if (s) return 'none';
  return undefined;
}

// Agreed tier rules (mirror of src/lib/tiering.ts).
function computeTier({ household_type, on_uc, pip, lcwra, council_registered, work_status }) {
  if (household_type === 'single' && on_uc && pip && lcwra && council_registered) return 1;
  if (council_registered && (on_uc || work_status === 'full_time')) return 2;
  return 3;
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

  // Referral triage fields
  const household_type = normHousehold(pick(['householdtype', 'household'], ['household']));
  const on_uc = toBool(pick(['universalcredit', 'onuc', 'uc', 'receivesuniversalcredit']));
  const pip = toBool(pick(['pip', 'receivespip', 'personalindependencepayment']));
  const lcwra = toBool(pick(['lcwra', 'haslcwra', 'limitedcapability']));
  const council_registered = toBool(pick(['councilregistered', 'registeredwithcouncil', 'councilreg']));
  const work_status = normWork(pick(['workstatus', 'working', 'employment'], ['work', 'employ']));
  // council: exact 'council' first, else a key mentioning council/borough/authority
  // but NOT 'council-registered' or officer fields.
  const councilKey = Object.keys(flat).find((k) => /council|borough|authority/.test(k) && !/registered|officer/.test(k));
  const council = flat['council'] || (councilKey ? flat[councilKey] : '') || '';
  const officer_name = pick(['officername', 'housingofficer', 'housingofficername'], ['officer']);
  const officer_email = pick(['officeremail', 'housingofficeremail']);
  const officer_phone = pick(['officerphone', 'housingofficerphone']);
  const housing_situation = pick(['currenthousingsituation', 'housingsituation', 'currentsituation'], ['situation']);
  const urgency = normUrgency(pick(['urgency', 'housingneed', 'risk'], ['urgen', 'risk']) || housing_situation);
  const consent = toBool(pick(['consent', 'consenttocontact', 'agree', 'datasharing']));

  return {
    keys: Object.keys(flat),
    full_name, email, phone, enquiryType, message,
    household_type, on_uc, pip, lcwra, council_registered, work_status,
    council, officer_name, officer_email, officer_phone, housing_situation, urgency, consent,
  };
}

function buildExtraction(f) {
  const message = f.message;
  const { adults, children } = parseHousehold(message);
  const budget = parseBudget(message);

  const tier = computeTier({
    household_type: f.household_type,
    on_uc: f.on_uc,
    pip: f.pip,
    lcwra: f.lcwra,
    council_registered: f.council_registered,
    work_status: f.work_status,
  });

  const yn = (b) => (b === true ? 'Yes' : b === false ? 'No' : '—');

  return {
    doc_type: 'applicant_referral',
    transcription: [
      f.full_name && `Name: ${f.full_name}`,
      f.email && `Email: ${f.email}`,
      f.phone && `Phone: ${f.phone}`,
      f.household_type && `Household: ${f.household_type}`,
      f.on_uc != null && `On UC: ${yn(f.on_uc)}`,
      f.pip != null && `PIP: ${yn(f.pip)}`,
      f.lcwra != null && `LCWRA: ${yn(f.lcwra)}`,
      f.council_registered != null && `Council-registered: ${yn(f.council_registered)}`,
      f.work_status && `Work: ${f.work_status}`,
      f.council && `Council: ${f.council}`,
      f.officer_name && `Officer: ${f.officer_name}`,
      (f.officer_email || f.officer_phone) && `Officer contact: ${[f.officer_email, f.officer_phone].filter(Boolean).join(' / ')}`,
      f.urgency && `Urgency: ${f.urgency}`,
      f.housing_situation && `Situation: ${f.housing_situation}`,
      message && `Message:\n${message}`,
    ].filter(Boolean).join('\n'),
    summary: `Tier ${tier} referral from ${f.full_name || f.email || 'an applicant'}${f.council ? ` (${f.council})` : ''}.`,
    confidence: 0.95,
    applicant: {
      full_name: f.full_name || undefined,
      email: f.email || undefined,
      phone: f.phone ? toE164(f.phone) : undefined,
      adults,
      children,
      budget_pcm: budget,
      household_type: f.household_type,
      on_uc: f.on_uc,
      pip: f.pip,
      lcwra: f.lcwra,
      council_registered: f.council_registered,
      work_status: f.work_status,
      council: f.council || undefined,
      officer_name: f.officer_name || undefined,
      officer_email: f.officer_email || undefined,
      officer_phone: f.officer_phone || undefined,
      urgency: f.urgency,
      housing_situation: f.housing_situation || undefined,
      consent: f.consent,
      tier,
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
