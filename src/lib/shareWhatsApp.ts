// WhatsApp shares beyond sending properties to clients (whatsapp.ts). Each is a wa.me link with the message typed
// in; nothing goes until it is sent in WhatsApp, and every send is noted.
//   officerMatchesText  the properties Keel recommends for a client, to the housing officer who referred them
//   alertWhatsApp, digestWhatsApp, fullListWhatsApp  a Mailer alert, digest or full list as a WhatsApp message,
//                       under the same rules as the email
//   recommendText       a message a housed client forwards to friends who need a home
//   landlordShareText   a recommended client, for one property, to its provider or landlord
// Privacy as everywhere: to providers and landlords a first name, household and benefits only (never phone, surname
// or health), and only once the client agreed; to an officer, about their own client, the full name. Never
// incentives, never anything held back or marked not ready.

import type { Applicant, Property, Provider } from './types';
import type { MailingList, OfficerRecord } from './councils';
import { recordFor, statusOf } from './councils';
import type { RuledMatch } from './matchRules';
import { availableWords, propertyLines, typeWords } from './mailer';
import type { AreaGroup, Sendable } from './mailer';
import { checksFor } from './propertyChecks';
import { overLha, sizeWords } from './lha';
import { benefitWords, firstNameOf, householdWords } from './requests';
import { credentialLines } from './business';
import { activeSettings } from './settings';
import type { AppSettings } from './settings';
import { isUrgent, councilOf } from './search';
import { money } from './format';
import { todayIso } from './calls';
import { shortAddress } from './progress';
import { waNumber } from './whatsapp';

const first = (name: string | null | undefined) => (name ?? '').trim().split(/\s+/)[0] || '';
const photos = (p: Pick<Property, 'photo_urls'>) => (p.photo_urls ?? []).map((x) => x.trim()).filter(Boolean).slice(0, 3);
const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const sign = (myName: string | null | undefined) => `${myName?.trim() ? `${myName.trim()}, ` : ''}Keel Lettings`;

// ── To the officer who referred the client ─────────────────────────

/** Where a WhatsApp to the client's officer goes: their mobile on the client, else on the officer list. Never to someone
 *  who has left (find who has the case now). */
export function officerWhatsApp(a: Pick<Applicant, 'officer_name' | 'officer_email' | 'officer_phone'>, records: OfficerRecord[], today?: string): { number: string | null; blocked: string | null; note: string | null; name: string } {
  const rec = recordFor({ email: a.officer_email, phone: a.officer_phone }, records);
  const name = a.officer_name?.trim() || rec?.name?.trim() || 'the officer';
  if (rec && statusOf(rec, today) === 'left') return { number: null, blocked: `${name} has left: find out who has the case now`, note: null, name };
  const number = waNumber(a.officer_phone) ?? waNumber(rec?.phone ?? null);
  return { number, blocked: null, note: number ? null : `No mobile number for ${name}: WhatsApp will ask who to send it to`, name };
}

/** The properties that fit a client, for their officer: the LHA they are paid there, and why each fits. */
export function officerMatchesText(a: Applicant, items: Array<{ property: Property; match: RuledMatch }>, myName: string | null, today = todayIso()): string {
  const n = items.length;
  const lines = [
    `Hi ${first(a.officer_name) || 'there'},`, '',
    `For ${a.full_name} (${householdWords(a)}), we have ${n === 1 ? 'a property that fits' : `${n} properties that fit`}:`,
  ];
  items.forEach(({ property: p, match: m }, i) => {
    const c = checksFor(p, today);
    const rent = c.lha?.rent ?? p.rent_pcm;
    const l = m.lha ?? (c.lha && c.lha.rent !== null ? { brma: c.lha.area.brma, size: c.lha.size, rate: c.lha.rate, rent: c.lha.rent, gap: c.gap ?? 0, theirs: false } : null);
    const gap = l ? (overLha(l.gap) ? `*${money(l.gap)} over the LHA*` : Math.abs(l.gap) < 1 ? 'at the LHA' : `${money(-l.gap)} under the LHA`) : null;
    const pics = photos(p);
    lines.push('',
      `*${n > 1 ? `${i + 1}. ` : ''}${p.address_line}*`,
      `${typeWords(p, c)} · ${rent != null ? `${money(rent)} pcm` : 'rent to confirm'}`,
      l ? `${l.theirs ? 'Their' : 'The'} ${l.size === 'shared' ? 'shared' : sizeWords(l.size)} LHA in ${l.brma} is ${money(l.rate)}: ${gap}` : 'LHA area to confirm',
      `${cap(availableWords(p, today))}${m.line ? ` · ${m.line}` : ''}`,
      ...(pics.length ? [`Photos: ${pics.join(' ')}`] : []));
  });
  lines.push('', n === 1 ? 'Shall I book a viewing? Reply here.' : 'Shall I book viewings? Reply here.', sign(myName));
  return lines.join('\n');
}

// ── The Mailer, on WhatsApp ────────────────────────────────────────

function footer(myName: string | null | undefined): string[] {
  const creds = credentialLines();
  return ['', 'Reply here to book a viewing or to put a client forward.', sign(myName), ...(creds.length ? [creds.join(' · ')] : []),
    'Not the right person? Reply STOP and we will not message you again.'];
}

/** One property, as the alert email has it, for WhatsApp. */
export function alertWhatsApp(s: Sendable, subject: string, opts: { greeting?: string | null; myName?: string | null; today?: string } = {}): string {
  const today = opts.today ?? todayIso();
  const [address, ...rest] = propertyLines(s, today);
  const pics = photos(s.property);
  return [`*${subject}*`, '', ...(opts.greeting ? [`Hi ${first(opts.greeting)},`, ''] : []), `*${address}*`, ...rest,
    ...(pics.length ? ['', 'Photos:', ...pics] : []), ...footer(opts.myName)].join('\n');
}

/** A borough's digest for WhatsApp: each property in a few lines. */
export function digestWhatsApp(borough: string, items: Sendable[], subject: string, opts: { greeting?: string | null; myName?: string | null; today?: string } = {}): string {
  const today = opts.today ?? todayIso();
  const lines = [`*${subject}*`, '', ...(opts.greeting ? [`Hi ${first(opts.greeting)},`, ''] : []), `Our available properties in and around ${borough} this month:`];
  items.forEach((s, i) => {
    const [address, ...rest] = propertyLines(s, today);
    const pics = photos(s.property);
    lines.push('', `*${i + 1}. ${address}*`, ...rest, ...(pics.length ? [`Photos: ${pics.join(' ')}`] : []));
  });
  return [...lines, ...footer(opts.myName)].join('\n');
}

/** The full list for WhatsApp: each area in bold, the properties numbered right through. */
export function fullListWhatsApp(groups: AreaGroup[], subject: string, opts: { borough?: string | null; greeting?: string | null; myName?: string | null; today?: string } = {}): string {
  const today = opts.today ?? todayIso();
  const lines = [`*${subject}*`, '', ...(opts.greeting ? [`Hi ${first(opts.greeting)},`, ''] : []), `All our available properties${opts.borough ? ` in ${opts.borough}` : ''}, by area:`];
  let i = 0;
  for (const g of groups) {
    lines.push('', `*${g.place} (${g.items.length})*`);
    for (const s of g.items) {
      const [address, ...rest] = propertyLines(s, today);
      const pics = photos(s.property);
      lines.push('', `*${++i}. ${address}*`, ...rest, ...(pics.length ? [`Photos: ${pics.join(' ')}`] : []));
    }
  }
  return [...lines, '', 'Reply with the number of any property to book a viewing or to put a client forward.', ...footer(opts.myName).slice(2)].join('\n');
}

/** Who on a Mailer list can have it on WhatsApp: the same officers the email may go to (and anyone left out only for
 *  having no email), with a mobile number. A team mailbox means the team is written to, not a personal phone. */
export function whatsappRecipients(list: Pick<MailingList, 'to' | 'left'>): { to: Array<{ officer: OfficerRecord; number: string }>; left: Array<{ officer: OfficerRecord; why: string }> } {
  const pool = [...list.to.map((t) => t.officer), ...list.left.filter((l) => l.why === 'No email').map((l) => l.officer)];
  const seen = new Set<string>();
  const to: Array<{ officer: OfficerRecord; number: string }> = [], left: Array<{ officer: OfficerRecord; why: string }> = [];
  for (const o of pool) {
    if (seen.has(String(o.id))) continue;
    seen.add(String(o.id));
    const number = waNumber(o.phone ?? null);
    if (o.send_to_mailbox?.trim()) left.push({ officer: o, why: 'Uses the team mailbox' });
    else if (!number) left.push({ officer: o, why: 'No mobile number' });
    else to.push({ officer: o, number });
  }
  return { to, left };
}

// ── Clients recommending Keel ──────────────────────────────────────

/** How friends reach Keel, in words that follow "Message us": on WhatsApp (the phone on invoices), else by email,
 *  else through the website. */
export function keelContact(s: Pick<AppSettings, 'invoice' | 'business'> = activeSettings()): { words: string; website: boolean } {
  const number = waNumber(s.invoice.phone);
  if (number) return { words: `on WhatsApp: https://wa.me/${number}`, website: false };
  if (s.invoice.email.trim()) return { words: `by email: ${s.invoice.email.trim()}`, website: false };
  return { words: s.business.website.trim() ? `through ${s.business.website.trim()}` : 'on this number', website: true };
}

/** The message a housed client forwards to friends, from the team's wording. */
export function recommendText(a: Pick<Applicant, 'full_name'>, myName: string | null, s: Pick<AppSettings, 'whatsappRecommend' | 'invoice' | 'business'> = activeSettings()): string {
  const contact = keelContact(s);
  const name = myName?.trim() ?? '';
  return s.whatsappRecommend
    .replace(/\{first name\}/gi, firstNameOf(a))
    .replace(/\{keel contact\}/gi, contact.words)
    // the website once only: not again when it is already how to reach Keel
    .replace(/\{website\}/gi, contact.website ? '' : s.business.website.trim())
    .replace(/\{my name\}(,[ \t]*)?/gi, (_, comma: string | undefined) => (name ? `${name}${comma ?? ''}` : ''))
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ── A recommended client, to a property's provider ─────────────────

/** Why a client cannot be shared with a landlord, or null: they must have agreed (Client details). */
export const landlordShareBlocked = (a: Pick<Applicant, 'share_with_landlords' | 'full_name'>) =>
  a.share_with_landlords ? null : `${firstNameOf(a)} has not agreed to their details going to landlords yet (Client details)`;

/** "Salam Zubair, for 12 Elm Road (Studio, £1,100 pcm), I have a client who may suit it: ..." First name, household and
 *  benefits only. */
export function landlordShareText(a: Applicant, p: Pick<Property, 'address_line' | 'property_type' | 'rent_pcm' | 'rent_text'>, provider: Pick<Provider, 'name' | 'contact_first_name'> | null, myName: string | null): string {
  const hello = provider ? `Salam ${provider.contact_first_name?.trim() || provider.name},` : 'Salam,';
  const rent = p.rent_pcm ? `${money(p.rent_pcm)} pcm` : p.rent_text;
  const benefits = benefitWords(a);
  const council = councilOf(a);
  return [
    hello, '',
    `For ${shortAddress(p.address_line)}${[p.property_type, rent].filter(Boolean).length ? ` (${[p.property_type, rent].filter(Boolean).join(', ')})` : ''}, I have a client who may suit it:`,
    `• ${firstNameOf(a)}, ${householdWords(a)}`,
    benefits !== 'benefits not given' ? `• On ${benefits}` : null,
    council ? `• Council: ${council}` : null,
    isUrgent(a) ? '• Ready to move quickly' : null,
    '', 'Shall I book a viewing?', sign(myName),
  ].filter((x) => x !== null).join('\n');
}
