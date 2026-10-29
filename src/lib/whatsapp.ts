// Sending property details on WhatsApp with wa.me links.
//
// A link with a number opens a chat with that client, the message typed in
// and ready to send. A link without a number lets you pick anyone (a client
// not on Keel, a landlord, a group). Nothing is sent until you press send
// in WhatsApp.

import { lhaCheck, overLha, sizeWords } from './lha';
import type { LhaSize, PropertyForLha } from './lha';
import { activeSettings } from './settings';
import { money, shortDate, toE164 } from './format';
import { BILLS_LABEL, floorWords } from './propertyChecks';
import type { Property } from './types';

export interface PropertyForMessage extends PropertyForLha, Partial<Pick<Property, 'floor' | 'lift' | 'accommodation_type' | 'bills_status'
  | 'bills_included' | 'media_url' | 'photo_urls'>> {
  id?: string;
  area?: string | null;
  bills?: string | null;
  furnished?: string | null;
  available_from?: string | null;
}

/** The client's LHA against a property's rent, for the message: their rate there, and how far under or over. */
export interface LhaForMessage { rate: number; size: LhaSize; gap: number; topUp: number; withinTopUp: boolean }

/** "Bills included", "Bills not included", "Some bills included: water, council tax"; null when nothing is known. */
export function billsWords(p: Pick<PropertyForMessage, 'bills_status' | 'bills_included' | 'bills'>): string | null {
  const listed = (p.bills_included ?? []).map((b) => BILLS_LABEL[b as keyof typeof BILLS_LABEL] ?? b).join(', ').toLowerCase();
  const note = p.bills?.trim() || listed || null;
  if (p.bills_status === 'included') return note && !/^included$/i.test(note) ? `Bills included (${note})` : 'Bills included';
  if (p.bills_status === 'excluded') return 'Bills not included';
  if (p.bills_status === 'partial') return note ? `Some bills included: ${note}` : 'Some bills included';
  if (listed) return `Bills included: ${listed}`;
  return p.bills?.trim() ? `Bills: ${p.bills.trim()}` : null;
}

/** Own kitchen or shared, only when it is known: set by hand, or a flat or house (which has its own). A guessed kind of
 *  place is never printed. */
function kitchenWords(p: PropertyForMessage): string | null {
  if (p.accommodation_type === 'self_contained') return 'Own kitchen';
  if (p.accommodation_type === 'shared_kitchen' || p.accommodation_type === 'hmo_room') return 'Shared kitchen';
  return (p.bedrooms ?? 0) >= 1 && /\b(flat|house|maisonette|apartment|bed)\b/i.test(p.property_type ?? '') ? 'Own kitchen' : null;
}

/** The rent against the client's own LHA, in a sentence. */
function lhaSentence(lha: LhaForMessage): string {
  const rate = `your ${sizeWords(lha.size)} LHA here, ${money(lha.rate)}`;
  if (lha.withinTopUp) return `That is ${money(lha.gap)} over ${rate}, within the ${money(lha.topUp)} you can top up.`;
  if (overLha(lha.gap)) return `That is ${money(lha.gap)} over ${rate}.`;
  if (Math.abs(lha.gap) < 1) return `That is the same as ${rate}.`;
  return `That is ${money(-lha.gap)} under ${rate}.`;
}

const sentence = (s: string | null | undefined) => (s ? `${s.replace(/[.\s]+$/, '')}.` : null);

/** The number wa.me wants: international, digits only ("447911123456"), or null. */
export function waNumber(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const uk = toE164(phone);
  if (uk) return uk.slice(1);
  const d = phone.replace(/[^\d+]/g, '');
  if (d.startsWith('+') && d.length >= 9) return d.slice(1);
  if (d.startsWith('00') && d.length >= 10) return d.slice(2);
  return null;
}

/** A property in plain short sentences, the first line in bold: the rent (against the client's own LHA when sent to a
 *  client), the kitchen, the floor and lift, the bills, furnished and when it is free, and a photo or video link. */
function propertyText(p: PropertyForMessage, lhaOf?: (p: PropertyForMessage) => LhaForMessage | null): string {
  const title = [p.property_type, p.address_line].filter(Boolean).join(', ');
  const lha = lhaCheck(p);
  const rent = p.rent_pcm ? `${money(p.rent_pcm)} pcm`
    : lha?.rent && p.rent_text ? `${money(lha.rent)} pcm (${p.rent_text})`
    : p.rent_text;
  const theirs = lhaOf?.(p) ?? null;
  const money_ = [rent ? `Rent ${rent}.` : null, theirs ? lhaSentence(theirs) : null].filter(Boolean).join(' ');
  const home = [kitchenWords(p), floorWords(p.floor, p.lift), billsWords(p), p.furnished].map(sentence).filter(Boolean).join(' ');
  const when = p.available_from ? `Free from ${shortDate(p.available_from)}.` : null;
  const media = p.media_url?.trim() || (p.photo_urls ?? []).map((x) => x.trim()).find(Boolean) || null;
  return [`*${title}*`, money_, [home, when].filter(Boolean).join(' '), media ? `Photos: ${media}` : null].filter(Boolean).join('\n');
}

export function propertiesText(ps: PropertyForMessage[], lhaOf?: (p: PropertyForMessage) => LhaForMessage | null): string {
  if (ps.length === 1) return propertyText(ps[0], lhaOf);
  return ps.map((p, i) => `${i + 1}. ${propertyText(p, lhaOf)}`).join('\n\n');
}

export const firstName = (full: string) => full.trim().split(/\s+/)[0] ?? '';

/** The message for a client, from the team's wording in Settings. */
export function clientMessage(clientName: string, ps: PropertyForMessage[], myName: string | null, template = activeSettings().whatsappMessage,
  lhaOf?: (p: PropertyForMessage) => LhaForMessage | null): string {
  return template
    .replace(/\{first name\}/gi, firstName(clientName))
    .replace(/\{a property\}/gi, ps.length === 1 ? 'a property' : `${ps.length} properties`)
    .replace(/\{properties\}/gi, propertiesText(ps, lhaOf))
    .replace(/\{my name\}/gi, myName ?? '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** A message to a client about their viewing, from the team's wording in Settings. */
export function viewingMessage(template: string, v: { clientName: string; address: string; when?: string; oldWhen?: string; myName: string | null }): string {
  return template
    .replace(/\{first name\}/gi, firstName(v.clientName))
    .replace(/\{address\}/gi, v.address)
    .replace(/\{old when\}/gi, v.oldWhen ?? 'the time we agreed')
    .replace(/\{when\}/gi, v.when ?? 'a new time')
    .replace(/\{my name\}/gi, v.myName ?? '')
    .trim();
}

/** A viewing reminder for a client, from the team's wording in Settings. */
export function reminderMessage(clientName: string, address: string, when: string, myName: string | null, template = activeSettings().whatsappReminder): string {
  return viewingMessage(template, { clientName, address, when, myName });
}

/** wa.me link: to a number when there is one, otherwise "choose who to send it to". */
export function waLink(number: string | null, text: string): string {
  return `https://wa.me/${number ?? ''}?text=${encodeURIComponent(text)}`;
}
