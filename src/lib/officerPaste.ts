// Housing officers pasted in (Councils, Paste officers): a spreadsheet copied with its headings, a list of addresses
// from an email's To box ("Jo Brennan <jo.brennan@harrow.gov.uk>; ..."), email signatures one after another, or one
// officer a line. Each is read into a name, email, phone, job title and council, checked against the officer list,
// and added only once you have looked them over.
//
// The hard rule still holds: pasted housing officers are not opted in unless you say they asked, so `mailingList`
// never emails them in bulk until they opt in or refer a client.

import type { OfficerRecord, RouteType } from './councils';
import { recordFor } from './councils';
import { BOROUGHS, boroughsIn, canonicalBorough } from './london';
import { isCouncilAddress, nameFromAddress, officerDomainsOf } from './outlookMail';
import { orgOfEmail } from './search';

export interface PastedOfficer {
  /** stays the same while it is the same person: their email, else name and phone */
  key: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  title: string | null;
  council: string | null;
  route: RouteType;
  /** already on the officer list (by email, then phone) */
  existing: OfficerRecord | null;
  /** what the list does not have yet for someone already on it */
  fills: Partial<Pick<OfficerRecord, 'name' | 'title' | 'phone' | 'council'>>;
  /** things to know, in words */
  notes: string[];
  /** enough to add: a name or an email, and the email (if any) looks like one */
  ok: boolean;
}

export interface PasteResult {
  officers: PastedOfficer[];
  /** bits of the paste with nothing to read (no name, email or phone) */
  skipped: number;
}

const EMAIL_G = /[a-z0-9._%+'-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
const EMAIL_ONE = /[a-z0-9._%+'-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
const EMAIL_FULL = /^[a-z0-9._%+'-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/i;
const PHONE = /(?:\+44\s?\(0\)\s?|\+44\s?|\b0)\d(?:[\s-]?\d){8,9}\b/;
const LABEL = /^(?:name|full name|officer|contact|e-?mail(?: address)?|e|email|t|tel|telephone|phone|m|mob|mobile|direct(?: line| dial)?|dd|job title|title|role|position|council|borough|authority|local authority|organisation|organization|team|dept|department)\s*[:.-]\s*/i;
const ROLE = /\b(officer|manager|co-?ordinator|advis[eo]r|lead|head of|assistant|caseworker|case worker|navigator|specialist|team leader|supervisor|director|practitioner|worker|consultant|negotiator|administrator|analyst|surveyor|support|homeless(?:ness)?|housing options|housing needs|procurement|accommodation|placements?|lettings?|resettlement|tenancy|prevention|private sector|temporary)\b/i;
const COUNCIL = /\b(council|borough|london borough|royal borough|city of|corporation|district|county|authority|lb of|rb of)\b/i;
const ADDRESS = /\b(road|rd|street|st|avenue|ave|lane|way|place|square|sq|close|drive|crescent|hill|centre|center|house|hall|building|floor|po box|civic|town hall|offices?|station|park|gardens|court|terrace|parade|london [a-z]{1,2}\d)\b/i;
const HEADER = /^(?:from|to|cc|bcc)\s*:\s*/i;
const NOISE = /^(?:(?:hi|hello|hey|dear|good morning|good afternoon|kind regards|best regards|many thanks|regards|thanks|thank you|best wishes|cheers|sent from|please consider|this email|confidential|disclaimer)\b|subject:|sent:|date:|www\.|https?:)/i;

// team inboxes rather than a person: a team word in the address and no person's name
const TEAM_WORD = /(housing|options|procure|landlord|letting|prs|private|rental|accommodation|temporary|homeless|team|info|enquir|contact|admin|supply|placement|acquisition|incentive|alerts?|needs|allocations?)/i;
const PROCUREMENT = /(procure|landlord|letting|prs|privatesector|private\.sector|private-sector|rental|supply|acquisition|incentive|placement)/i;

const PARTICLE = /^(de|da|del|della|di|du|van|von|der|den|bin|binti|al|el|la|le|ter|ten)$/i;
const squash = (s: string) => s.replace(/\s+/g, ' ').trim();
const lc = (s: string | null | undefined) => (s ?? '').trim().toLowerCase();

/** "JO BRENNAN" or "jo brennan" read as "Jo Brennan"; mixed case is left alone. */
function tidyName(raw: string): string | null {
  let n = squash(raw.replace(/^["']+|["']+$/g, '').replace(/\s*\([^)]*\)\s*/g, ' '));
  // Outlook's "Brennan, Jo" is Jo Brennan
  const swap = /^([A-Za-z'’-]+),\s*([A-Za-z'’-]+(?:\s[A-Za-z'’-]+)?)$/.exec(n);
  if (swap) n = `${swap[2]} ${swap[1]}`;
  n = n.replace(/\s+-\s+.*$/, '').trim();
  if (!n || n.includes('@')) return null;
  if (n === n.toUpperCase() || n === n.toLowerCase()) n = n.toLowerCase().replace(/(^|[\s'’-])([a-z])/g, (_, a: string, b: string) => a + b.toUpperCase());
  return n;
}

/** Looks like a person's name: two to four words of letters, no job or council words, not an address. */
function nameLike(s: string): boolean {
  const t = squash(s.replace(/^["']+|["']+$/g, ''));
  if (!t || t.length > 50 || /\d|@|[:/!?]|[,.]$/.test(t)) return false;
  if (ROLE.test(t) || COUNCIL.test(t) || ADDRESS.test(t) || NOISE.test(t)) return false;
  const swapped = /^[A-Za-z'’-]+,\s*[A-Za-z'’-]+(?:\s[A-Za-z'’-]+)?$/.test(t);
  const words = t.split(/[\s,]+/).filter(Boolean);
  if (words.length < 2 || words.length > 4) return false;
  if (!words.every((w) => /^[A-Za-z][A-Za-z'’.-]*$/.test(w))) return false;
  // capitalised, as names are written (or all in capitals); "de", "van" and the like may stay small
  if (!words.every((w, i) => /^[A-Z]/.test(w) || (i > 0 && PARTICLE.test(w)))) return false;
  if (!swapped && BOROUGHS.some((b) => b.toLowerCase() === t.toLowerCase())) return false;
  return true;
}

/** "London Borough of Harrow", "Harrow Council", "LB Harrow": Harrow. Elsewhere, the place without "Council". */
function councilFrom(s: string): string | null {
  const t = squash(s);
  if (!t || t.length > 80 || EMAIL_ONE.test(t)) return null;
  const b = canonicalBorough(t) ?? boroughsIn(t)[0] ?? null;
  if (b) return b;
  if (!COUNCIL.test(t) || ROLE.test(t) || ADDRESS.test(t)) return null;
  const place = t.replace(/\b(london borough of|royal borough of|borough of|city of|lb of|rb of|metropolitan|borough|district|county|city|council|corporation)\b/gi, ' ').replace(/[,.]/g, ' ');
  const p = squash(place);
  return p && p.length <= 40 && /^[A-Za-z][A-Za-z '&-]*$/.test(p) ? p : null;
}

const phoneOf = (s: string) => {
  const m = PHONE.exec(s);
  return m ? squash(m[0]) : null;
};
const digits = (p: string | null) => (p ?? '').replace(/\D/g, '').replace(/^44/, '0');

interface Draft { name: string | null; email: string | null; phone: string | null; title: string | null; council: string | null; badEmail?: string | null }
const blank = (): Draft => ({ name: null, email: null, phone: null, title: null, council: null });
const has = (d: Draft) => !!(d.name || d.email || d.phone);

/** One bit of text (a line, a cell): what it tells us, filling only what is still empty. */
function take(d: Draft, piece: string, hint?: keyof Draft) {
  let p = squash(piece).replace(HEADER, '');
  if (!p || NOISE.test(p)) return;
  const labelled = LABEL.exec(p);
  if (labelled) {
    const word = labelled[0].toLowerCase();
    p = p.slice(labelled[0].length).trim();
    if (!hint) {
      if (/name|officer|contact/.test(word)) hint = 'name';
      else if (/mail|^e\b/.test(word)) hint = 'email';
      else if (/tel|phone|^t\b|^m\b|mob|direct|dd/.test(word)) hint = 'phone';
      else if (/title|role|position|team|dept|department/.test(word)) hint = 'title';
      else if (/council|borough|authority|organi/.test(word)) hint = 'council';
    }
  }
  if (!p) return;
  // "Jo Brennan <jo@harrow.gov.uk>"
  const bracket = /^"?([^"<>]*?)"?\s*<\s*([^<>\s]+@[^<>\s]+)\s*>$/.exec(p);
  if (bracket) {
    d.email ??= bracket[2].toLowerCase();
    if (bracket[1].trim()) d.name ??= tidyName(bracket[1]);
    return;
  }
  const email = EMAIL_ONE.exec(p)?.[0];
  if (email) { d.email ??= email.toLowerCase(); const rest = squash(p.replace(email, '').replace(/[<>()[\]]/g, '')); if (rest && rest !== p) take(d, rest); return; }
  if (hint === 'email') { d.badEmail ??= p; return; }
  const phone = phoneOf(p);
  if (phone && (hint === 'phone' || p.replace(/[\d\s()+-]/g, '').length <= 4)) { d.phone ??= phone; return; }
  if (hint === 'phone') return;
  if (hint === 'name') { d.name ??= tidyName(p); return; }
  if (hint === 'title') { d.title ??= p.slice(0, 80); return; }
  if (hint === 'council') { d.council ??= councilFrom(p) ?? p.slice(0, 60); return; }
  if (!d.name && nameLike(p)) { d.name = tidyName(p); return; }
  if (!d.title && ROLE.test(p) && !COUNCIL.test(p) && !ADDRESS.test(p) && p.length <= 80) { d.title = p; return; }
  if (!d.council) { const c = councilFrom(p); if (c) { d.council = c; return; } }
  if (phone) d.phone ??= phone;
}

/** Cells of a line: tabs, " | ", " - ", " · ", and commas or semicolons when the line holds one person. */
function piecesOf(line: string): string[] {
  const bracketed = [...line.matchAll(/"?[^"<>;,\t|]*"?\s*<[^<>\s]+@[^<>\s]+>/g)].map((m) => m[0]);
  let rest = line;
  for (const b of bracketed) rest = rest.replace(b, '\t');
  const cut = rest.split(/\t|\s\|\s|\s[-–—]\s|\s·\s|;|,(?=\s*\S)/).map(squash).filter(Boolean);
  return [...bracketed.map(squash), ...cut];
}

// ── A spreadsheet with headings ─────────────────────────────────────

const HEAD: Array<[keyof Draft | 'first' | 'last' | 'skip', RegExp]> = [
  ['first', /^(first ?name|forename|given name)$/],
  ['last', /^(last ?name|surname|family name)$/],
  ['email', /^(e-?mail|e-?mail address|email addresses|mail|work email)$/],
  ['phone', /^(phone|tel|telephone|mobile|mob|number|phone number|contact number|direct line|tel no|telephone number)$/],
  ['council', /^(council|borough|authority|local authority|la|organisation|organization|org|area|lb)$/],
  ['title', /^(title|job title|role|position|job|team|department)$/],
  ['name', /^(name|full name|officer|officer name|contact|contact name|housing officer)$/],
];

function splitRow(line: string, delim: string): string[] {
  if (delim === '\t') return line.split('\t').map((c) => c.trim());
  const out: string[] = [];
  let cell = '', quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { if (quoted && line[i + 1] === '"') { cell += '"'; i++; } else quoted = !quoted; }
    else if (c === delim && !quoted) { out.push(cell.trim()); cell = ''; }
    else cell += c;
  }
  out.push(cell.trim());
  return out;
}

function fromTable(lines: string[]): Draft[] | null {
  const head = lines[0];
  const delim = head.includes('\t') ? '\t' : head.includes(',') ? ',' : head.includes(';') ? ';' : null;
  if (!delim) return null;
  const cols = splitRow(head, delim).map((c) => HEAD.find(([, re]) => re.test(c.toLowerCase().replace(/[^a-z -]/g, '').trim()))?.[0] ?? 'skip');
  if (!cols.includes('email') && !(cols.includes('name') || cols.includes('first'))) return null;
  if (cols.filter((c) => c !== 'skip').length < 2) return null;
  const out: Draft[] = [];
  for (const line of lines.slice(1)) {
    const cells = splitRow(line, delim);
    const d = blank();
    let first = '', last = '';
    cols.forEach((c, i) => {
      const v = (cells[i] ?? '').trim();
      if (!v) return;
      if (c === 'first') first = v;
      else if (c === 'last') last = v;
      else if (c !== 'skip') take(d, v, c);
    });
    if (!d.name && (first || last)) d.name = tidyName(`${first} ${last}`);
    out.push(d);
  }
  return out;
}

// ── Free text: address lists, signatures, one a line ────────────────

function fromText(text: string): Draft[] {
  const out: Draft[] = [];
  const blocks = text.split(/\n\s*\n/).map((b) => b.split('\n').map((l) => l.trim()).filter(Boolean)).filter((b) => b.length);
  for (const block of blocks) {
    let d = blank();
    const push = () => { out.push(d); d = blank(); };
    const emailLines = block.filter((l) => EMAIL_ONE.test(l)).length;
    for (const line of block) {
      const emails = line.match(EMAIL_G) ?? [];
      if (emails.length >= 2) {
        // an address list on one line
        if (has(d)) push();
        // Outlook separates with semicolons ("Brennan, Jo <jo@...>; ..."); without any, commas between addresses
        for (const part of line.split(line.includes(';') ? /;/ : /,(?=[^,]*@)|\s{2,}|\t/).map(squash).filter(Boolean)) {
          const e = blank();
          take(e, part);
          if (has(e)) out.push(e);
        }
        continue;
      }
      // a line holding a whole officer ("Jo Brennan, Harrow, jo@harrow.gov.uk")
      if (emails.length === 1 && emailLines >= 2 && emailLines === block.length) {
        if (has(d)) push();
        for (const p of piecesOf(line)) take(d, p);
        push();
        continue;
      }
      // signatures and two-line lists: a new name after an email starts the next officer
      if (d.email && ((nameLike(line) && d.name) || (emails.length === 1 && emails[0].toLowerCase() !== d.email))) push();
      if (!nameLike(line) && /\s[-–|·]\s|\t|[,;]/.test(line)) for (const p of piecesOf(line)) take(d, p);
      else take(d, line);
    }
    if (has(d)) push();
  }
  return out;
}

// ── Putting it together ─────────────────────────────────────────────

/** A team inbox rather than a person, and whether it is the kind written to for properties. */
export function mailboxKind(email: string | null, name: string | null): RouteType | 'team' | null {
  if (!email) return null;
  const local = email.split('@')[0];
  if (name && !TEAM_WORD.test(name)) return null;
  if (nameFromAddress(email) && !TEAM_WORD.test(local)) return null;
  if (!TEAM_WORD.test(local)) return null;
  return PROCUREMENT.test(local) ? 'procurement_mailbox' : 'team';
}

/** Read a paste into officers, each once, checked against the officer list. */
export function readOfficerPaste(text: string, records: OfficerRecord[], own: string[] = []): PasteResult {
  const clean = text.replace(/\r\n?/g, '\n').replace(/[\u00a0\u2007\u202f]/g, ' ').replace(/[\u200b\ufeff]/g, '');
  const lines = clean.split('\n').map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return { officers: [], skipped: 0 };
  const drafts = fromTable(lines) ?? fromText(clean);
  const domains = officerDomainsOf(records);
  const mine = new Set(own.map(lc).filter(Boolean));

  const merged: Draft[] = [];
  let skipped = 0;
  for (const d of drafts) {
    if (!has(d) && !d.badEmail) { if (d.title || d.council) skipped += 1; continue; }
    // your own addresses (pasted with an email's headers) are not officers
    if (d.email && mine.has(d.email)) continue;
    const same = merged.find((m) => (d.email && m.email === d.email) || (!d.email && !m.email && d.phone && digits(m.phone) === digits(d.phone))
      || (!d.email && !m.email && !d.phone && d.name && lc(m.name) === lc(d.name)));
    if (same) { same.name ??= d.name; same.phone ??= d.phone; same.title ??= d.title; same.council ??= d.council; continue; }
    merged.push({ ...d });
  }

  const officers = merged.slice(0, 500).map((d): PastedOfficer => {
    const notes: string[] = [];
    const email = d.email && EMAIL_FULL.test(d.email) ? d.email : null;
    if (!email && (d.email || d.badEmail)) notes.push(`"${d.email ?? d.badEmail}" is not an email address`);
    const kind = mailboxKind(email, d.name);
    const name = d.name ?? (email && !kind ? nameFromAddress(email) : null);
    const existing = recordFor({ email, phone: d.phone }, records)
      ?? (name ? records.find((r) => lc(r.name) === lc(name) && (!email || !r.email)) ?? null : null);
    // what was pasted, else what the list already says, else the council of a .gov.uk address
    const council = d.council ?? existing?.council?.trim() ?? existing?.borough?.trim() ?? (email && isCouncilAddress(email, domains) ? orgOfEmail(email) : null);
    const route: RouteType = kind === 'procurement_mailbox' ? 'procurement_mailbox' : 'housing_officer';
    if (kind) notes.push(route === 'procurement_mailbox' ? 'A team mailbox for properties: can be emailed without opting in' : 'Looks like a team mailbox, not a person');
    if (!email) notes.push('No email: kept on the list, never emailed');
    else if (!isCouncilAddress(email, domains)) notes.push('Not a council address');
    if (!council) notes.push('Council not known');
    if (!name && !email) notes.push('Needs a name or an email');
    const fills: PastedOfficer['fills'] = {};
    if (existing) {
      if (!existing.name?.trim() && name) fills.name = name;
      if (!existing.title?.trim() && d.title) fills.title = d.title;
      if (!existing.phone?.trim() && d.phone) fills.phone = d.phone;
      if (!existing.council?.trim() && !existing.borough?.trim() && council) fills.council = council;
    }
    return {
      key: email ?? `${lc(name)}|${digits(d.phone)}`,
      name, email, phone: d.phone, title: d.title, council, route, existing, fills, notes,
      ok: !!(name || email),
    };
  });
  return { officers, skipped };
}

/** The new officer list row: active, and not opted in unless they asked (then how, and when you said so). */
export function pastedRow(p: PastedOfficer, optIn: { source: string; at: string } | null): Partial<OfficerRecord> {
  return {
    name: p.name, email: p.email, phone: p.phone, title: p.title, council: p.council, status: 'active', route_type: p.route,
    notes: 'Added from a pasted list',
    ...(optIn && p.route === 'housing_officer' ? { opt_in_source: optIn.source, opted_in_at: optIn.at } : {}),
  };
}

/** "adds phone and job title" */
export function fillWords(f: PastedOfficer['fills']): string {
  const words = ([['name', 'name'], ['title', 'job title'], ['phone', 'phone'], ['council', 'council']] as const).filter(([k]) => f[k]).map(([, w]) => w);
  return words.length ? `adds ${words.length > 1 ? `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}` : words[0]}` : '';
}

/** Text handed over from the Bin ("This looks like a list of housing officers"), read once on arriving at Councils. */
export const PASTE_HANDOFF = 'keel.officerPaste';

/** Whether pasted text reads as a list of officers rather than a client's enquiry: two or more council addresses. */
export function looksLikeOfficers(text: string): boolean {
  const emails = new Set((text.match(EMAIL_G) ?? []).map((e) => e.toLowerCase()));
  return [...emails].filter((e) => e.endsWith('.gov.uk')).length >= 2;
}
