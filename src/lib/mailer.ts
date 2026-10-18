// The Mailer (Step 7 of the update brief): property alerts and borough digests to housing officers, written and
// checked by Keel, so a bad property or a bad address cannot go out by accident.
//
//   What goes   every available property not held back (over LHA, or marked not ready by hand: `sendBlockers`; the
//               suppliers see to the safety checks), with a known LHA area and rent, and only once the LHA rates are
//               the gov.uk ones: an email to a council never quotes built-in figures.
//   Alerts      one property each, only to the officers of nominated clients it fits (the matching rules).
//   Digests     one borough a month, 5 to 8 sendable properties at most; anyone who had a bulk email or digest in
//               the last 30 days is flagged and left unticked.
//   Who         only through `mailingList` (no left, on leave, opted out, bounced or not opted in; a shared mailbox
//               replaces personal emails). London officers never get out-of-London stock unless it is included by
//               hand, and then it is marked.
//   Wording     plain text; subject "[Borough] | type | £rent pcm | LHA £rate | available date"; the real LHA £ for
//               its BRMA; a compliance line with expiry dates; up to 3 photo links; Keel's credentials; a way to stop.
//               Never a client's name, never anything about incentives.

import type { Applicant, Property } from './types';
import type { MailingList, OfficerRecord, OfficerSend } from './councils';
import { boroughOf, bulkSendsIn30, focusRank, mailingList, recordFor } from './councils';
import { checksFor, floorWords, BILLS_LABEL, sendBlockers } from './propertyChecks';
import type { Checks } from './propertyChecks';
import { lhaVerified, sizeWords } from './lha';
import type { RuledMatch } from './matchRules';
import { fromHousingOfficer } from './money';
import { officersFrom } from './officers';
import { areNeighbours, boroughFromDistrict, canonicalBorough, districtOf, LONDON_BOROUGHS } from './london';
import { money, monthName, shortDate } from './format';
import { todayIso } from './calls';
import { signature, unsubscribeAddress } from './business';

export const DIGEST_MIN = 5;
export const DIGEST_MAX = 8;

export interface Sendable {
  property: Property;
  checks: Checks;
  /** why it cannot go out; empty means it can */
  blockers: string[];
  /** the London borough it is in, if any */
  borough: string | null;
  /** "[Harrow]" in the subject: its borough, else its area or LHA area */
  place: string;
}

/** Whether the Mailer can send at all: only with the gov.uk LHA rates loaded. */
export function mailerReady(): { ok: boolean; why: string | null } {
  return lhaVerified() ? { ok: true, why: null }
    : { ok: false, why: 'The LHA rates in use are the built-in ones, not checked against gov.uk. Load the gov.uk rates in Team settings, under LHA rates, and the Mailer opens.' };
}

const boroughOfProperty = (p: Pick<Property, 'borough' | 'postcode' | 'address_line'>) => {
  const b = canonicalBorough(p.borough) ?? boroughFromDistrict(districtOf(p.postcode ?? '') ?? districtOf(p.address_line));
  return b && LONDON_BOROUGHS.has(b) ? b : null;
};

/** Every available property, with whether it can be sent and why not. */
export function sendables(properties: Property[], today = todayIso()): Sendable[] {
  return properties.filter((p) => p.status === 'void').map((property) => {
    const checks = checksFor(property, today);
    const blockers = sendBlockers(checks);
    if (!checks.lha) blockers.push('LHA area not known: set its LHA area on the property');
    else if (checks.lha.rent === null) blockers.push('Rent not known as a monthly figure');
    const borough = boroughOfProperty(property);
    const place = borough ?? (property.area && !/^london$/i.test(property.area) ? property.area : null) ?? canonicalBorough(property.borough) ?? checks.lha?.area.brma ?? 'Outside London';
    return { property, checks, blockers, borough, place };
  });
}

/** "1 bed flat", "Studio, shared kitchen", "HMO room" */
export function typeWords(p: Pick<Property, 'property_type' | 'bedrooms'>, checks: Pick<Checks, 'accommodation'>): string {
  const base = p.property_type?.trim() || (p.bedrooms ? `${p.bedrooms} bed` : p.bedrooms === 0 ? 'Studio' : 'Property');
  const kind = checks.accommodation?.type;
  if (kind === 'shared_kitchen' && !/shared/i.test(base)) return `${base}, shared kitchen`;
  if (kind === 'hmo_room' && !/hmo/i.test(base)) return `${base}, HMO room`;
  return base;
}

/** "available now" or "available 1 Nov 2026" */
export const availableWords = (p: Pick<Property, 'available_from'>, today = todayIso()) =>
  !p.available_from || p.available_from <= today ? 'available now' : `available ${shortDate(p.available_from)}`;

/** "[Harrow] | 1 bed flat | £1,050 pcm | LHA £1,100 | available now" */
export function alertSubject(s: Sendable, today = todayIso()): string {
  const rent = s.checks.lha?.rent ?? s.property.rent_pcm;
  return [
    `[${s.place}]`, typeWords(s.property, s.checks), rent != null ? `${money(rent)} pcm` : 'rent to confirm',
    s.checks.lha ? `LHA ${money(s.checks.lha.rate)}` : 'LHA to confirm', availableWords(s.property, today),
  ].join(' | ');
}

/** "Gas safety to 1 May 2027 · EICR to 1 Feb 2029 · EPC C (71) · No licence needed · Alarms checked 20 Sep 2026" */
export function complianceLine(p: Property): string {
  const parts = [
    p.no_gas ? 'No gas' : p.gas_expiry ? `Gas safety to ${shortDate(p.gas_expiry)}` : null,
    p.eicr_expiry ? `EICR to ${shortDate(p.eicr_expiry)}` : null,
    p.epc_rating ? `EPC ${p.epc_rating}${p.epc_sap ? ` (${p.epc_sap})` : ''}` : null,
    p.licence_no?.trim() ? `Licence ${p.licence_no.trim()}${p.licence_expiry ? ` to ${shortDate(p.licence_expiry)}` : ''}` : p.licence_needed === false ? 'No licence needed' : null,
    p.alarms_checked ? `Alarms checked ${shortDate(p.alarms_checked)}` : null,
    p.prs_property_id?.trim() ? `PRS property ID ${p.prs_property_id.trim()}` : null,
    p.prs_landlord_id?.trim() ? `PRS landlord ID ${p.prs_landlord_id.trim()}` : null,
  ];
  return parts.filter(Boolean).join(' · ');
}

const gapWords = (gap: number | null) => (gap === null ? '' : Math.abs(gap) < 0.5 ? ', at the LHA' : gap < 0 ? `, ${money(-gap)} under the LHA` : `, ${money(gap)} over the LHA`);
const photosOf = (p: Property) => (p.photo_urls ?? []).map((x) => x.trim()).filter(Boolean).slice(0, 3);

function propertyLines(s: Sendable, today: string): string[] {
  const p = s.property;
  const c = s.checks;
  const rent = c.lha?.rent ?? p.rent_pcm;
  const bills = (p.bills_included ?? []).map((b) => BILLS_LABEL[b as keyof typeof BILLS_LABEL] ?? b);
  return [
    p.address_line,
    `${typeWords(p, c)} · ${rent != null ? `${money(rent)} pcm` : 'rent to confirm'}${bills.length ? `, including ${bills.join(', ').toLowerCase()}` : ''}`,
    c.lha ? `LHA: the ${c.lha.size === 'shared' ? 'shared accommodation' : sizeWords(c.lha.size)} rate in ${c.lha.area.brma} is ${money(c.lha.rate)} pcm${gapWords(c.gap)}` : null,
    c.sar !== null ? `Shared accommodation rate there: ${money(c.sar)} pcm` : null,
    `${availableWords(p, today)[0].toUpperCase()}${availableWords(p, today).slice(1)}${floorWords(p.floor, p.lift) ? ` · ${floorWords(p.floor, p.lift)}` : ''}${p.furnished ? ` · ${p.furnished}` : ''}`,
    complianceLine(p) ? `Safety: ${complianceLine(p)}` : null,
  ].filter((x): x is string => x !== null);
}

function footer(myName: string | null | undefined): string[] {
  const unsub = unsubscribeAddress();
  return [
    '', 'Kind regards,', ...signature(myName), '',
    unsub ? `Not the right person, or rather not have these? Reply STOP, or email ${unsub} with Unsubscribe in the subject, and we will take you off the list.`
      : 'Not the right person, or rather not have these? Reply STOP and we will take you off the list.',
  ];
}

const hello = (name: string | null | undefined) => `Hi ${name?.trim().split(/\s+/)[0] || 'there'},`;

/** One property, plain text. Nothing about the client it fits, as it may go to several officers in Bcc. */
export function alertBody(s: Sendable, opts: { greeting?: string | null; myName?: string | null; today?: string } = {}): string {
  const today = opts.today ?? todayIso();
  const photos = photosOf(s.property);
  return [
    hello(opts.greeting), '',
    'A property that could suit a client you have referred to us:', '',
    ...propertyLines(s, today),
    ...(photos.length ? ['', 'Photos:', ...photos] : []),
    '', 'Reply to this email to book a viewing or to put a client forward.',
    ...footer(opts.myName),
  ].join('\n');
}

/** "[Harrow] | 6 properties within LHA | October 2026" */
export const digestSubject = (borough: string, n: number, today = todayIso()) =>
  `[${borough}] | ${n} ${n === 1 ? 'property' : 'properties'} within LHA | ${monthName(today.slice(0, 7))}`;

/** A month's properties in and around one borough, plain text. */
export function digestBody(borough: string, items: Sendable[], opts: { greeting?: string | null; myName?: string | null; today?: string } = {}): string {
  const today = opts.today ?? todayIso();
  const lines: string[] = [hello(opts.greeting), '', `Our available properties in and around ${borough} this month, each within the LHA for its area:`];
  items.forEach((s, i) => {
    const [address, ...rest] = propertyLines(s, today);
    const photos = photosOf(s.property);
    lines.push('', `${i + 1}. ${address}`, ...rest.map((x) => `   ${x}`), ...(photos.length ? [`   Photos: ${photos.join(' ')}`] : []));
  });
  lines.push('', 'Reply to this email to book a viewing or to put a client forward.', ...footer(opts.myName));
  return lines.join('\n');
}

// ── Who it goes to ─────────────────────────────────────────────────

/** When each officer named on clients last sent one (they count as opted in), for the mailing list. */
export function nominationsFrom(applicants: Applicant[]): (o: OfficerRecord) => string | null {
  const byEmail = new Map<string, string>(), byPhone = new Map<string, string>();
  const phoneKey = (p: string | null | undefined) => (p ?? '').replace(/\D/g, '').replace(/^44/, '0');
  for (const o of officersFrom(applicants)) {
    if (o.email) byEmail.set(o.email.toLowerCase(), o.latest);
    const d = phoneKey(o.phone);
    if (d.length >= 10) byPhone.set(d, o.latest);
  }
  return (o) => byEmail.get(o.email?.toLowerCase().trim() ?? '') ?? byPhone.get(phoneKey(o.phone)) ?? null;
}

const londonOfficer = (o: OfficerRecord) => { const b = boroughOf(o); return b !== null && LONDON_BOROUGHS.has(b); };

export interface AlertRecipients {
  list: MailingList;
  /** officer clients it fits */
  clients: number;
  /** officers named on those clients but not on the officer list (add them on Councils) */
  notListed: string[];
  /** London officers held back because the property is outside Greater London */
  londonHeld: number;
}

/** The officers of nominated clients a property fits, through the mailing list. */
export function alertRecipients(s: Sendable, matches: RuledMatch[], officers: OfficerRecord[], opts: { today?: string; includeLondon?: boolean } = {}): AlertRecipients {
  const fits = matches.filter((m) => fromHousingOfficer(m.applicant));
  const records = new Map<string, OfficerRecord>();
  const nominated = new Map<string, string>();
  const notListed = new Set<string>();
  for (const m of fits) {
    const a = m.applicant;
    const rec = recordFor({ email: a.officer_email, phone: a.officer_phone }, officers);
    if (!rec) { notListed.add(a.officer_name?.trim() || a.officer_email?.trim() || 'An officer'); continue; }
    const id = String(rec.id);
    records.set(id, rec);
    const at = a.nominated_at ?? a.created_at;
    if (!nominated.has(id) || at > nominated.get(id)!) nominated.set(id, at);
  }
  let pool = [...records.values()];
  let londonHeld = 0;
  if (s.checks.london === false && !opts.includeLondon) {
    const keep = pool.filter((o) => !londonOfficer(o));
    londonHeld = pool.length - keep.length;
    pool = keep;
  }
  const list = mailingList(pool, { today: opts.today, nominatedFromClients: (o) => nominated.get(String(o.id)) ?? null });
  return { list, clients: fits.length, notListed: [...notListed], londonHeld };
}

/** Up to 8 sendable properties for a borough's digest: in the borough first, then next door; most under the LHA first.
 *  A London borough's digest leaves out anything outside Greater London unless it is included by hand. */
export function digestPicks(borough: string, list: Sendable[], opts: { includeOutside?: boolean } = {}): Sendable[] {
  const london = LONDON_BOROUGHS.has(borough);
  const ok = list.filter((s) => s.blockers.length === 0 && !(london && !opts.includeOutside && s.checks.london === false));
  const byValue = (x: Sendable, y: Sendable) => (x.checks.gap ?? 0) - (y.checks.gap ?? 0) || x.property.address_line.localeCompare(y.property.address_line);
  const own = ok.filter((s) => s.borough === borough).sort(byValue);
  const near = ok.filter((s) => s.borough && s.borough !== borough && areNeighbours(borough, s.borough)).sort(byValue);
  const rest = opts.includeOutside ? ok.filter((s) => s.checks.london === false).sort(byValue) : [];
  return [...own, ...near, ...rest].slice(0, DIGEST_MAX);
}

export interface DigestRecipients { list: MailingList; /** had a bulk email or digest in the last 30 days: this would be another */ recent: Set<string> }

/** A borough's officers, through the mailing list, and who has had a bulk send in the last 30 days. */
export function digestRecipients(borough: string, officers: OfficerRecord[], sends: OfficerSend[], opts: { today?: string; nominatedFromClients?: (o: OfficerRecord) => string | null } = {}): DigestRecipients {
  const today = opts.today ?? todayIso();
  const list = mailingList(officers.filter((o) => boroughOf(o) === borough), { today, nominatedFromClients: opts.nominatedFromClients });
  const recent = new Set(list.to.filter(({ officer }) => bulkSendsIn30(officer, sends, today) >= 1).map(({ officer }) => String(officer.id)));
  return { list, recent };
}

/** Boroughs to offer a digest for: focus first, then the wish-list, then any with officers on the list. */
export function digestBoroughs(officers: OfficerRecord[]): string[] {
  const seen = new Set<string>();
  for (const o of officers) { const b = boroughOf(o); if (b) seen.add(b); }
  return [...seen].sort((a, b) => focusRank(a) - focusRank(b) || a.localeCompare(b));
}

/** An email link: one address in To, several in Bcc. Null when it would be too long for some mail apps (copy instead). */
export function mailtoFor(addresses: string[], m: { subject: string; body: string }): string | null {
  if (!addresses.length) return null;
  const enc = (x: string) => encodeURIComponent(x).replace(/%40/g, '@');
  const to = addresses.length === 1 ? enc(addresses[0]) : '';
  const bcc = addresses.length > 1 ? `bcc=${addresses.map(enc).join(',')}&` : '';
  const url = `mailto:${to}?${bcc}subject=${encodeURIComponent(m.subject)}&body=${encodeURIComponent(m.body)}`;
  return url.length > 1900 ? null : url;
}

/** For the old Keel Mailer's Restore data box: only sendable properties and officers on the mailing list. */
export function oldMailerBackup(items: Sendable[], list: Pick<MailingList, 'to'>): string {
  const props = items.filter((s) => s.blockers.length === 0).map((s) => ({
    address: s.property.address_line, borough: s.borough ?? s.place, type: typeWords(s.property, s.checks),
    bills: (s.property.bills_included ?? []).length ? (s.property.bills_included ?? []).map((b) => BILLS_LABEL[b as keyof typeof BILLS_LABEL] ?? b).join(', ') : s.property.bills ?? '-',
    rent: s.checks.lha?.rent != null ? money(s.checks.lha.rent) : '-',
  }));
  const seen = new Set<string>();
  const officers = list.to.filter(({ address }) => !seen.has(address.toLowerCase()) && !!seen.add(address.toLowerCase()))
    .map(({ officer, address }) => ({ name: officer.send_to_mailbox?.trim() ? '' : officer.name ?? '', email: address, council: boroughOf(officer) ?? officer.council ?? '', full: false, sent: officer.last_sent_at ?? null }));
  return JSON.stringify({ keelMailer: 1, props, officers });
}
