// Sending property details on WhatsApp with wa.me links.
//
// A link with a number opens a chat with that client, the message typed in
// and ready to send. A link without a number lets you pick anyone (a client
// not on Keel, a landlord, a group). Nothing is sent until you press send
// in WhatsApp.

import { lhaCheck } from './lha';
import type { PropertyForLha } from './lha';
import { activeSettings } from './settings';
import { money, shortDate, toE164 } from './format';

export interface PropertyForMessage extends PropertyForLha {
  area?: string | null;
  bills?: string | null;
  furnished?: string | null;
  available_from?: string | null;
}

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

/** A property as two or three short lines, the first in bold. */
export function propertyText(p: PropertyForMessage): string {
  const title = [p.property_type, p.address_line].filter(Boolean).join(', ');
  const lha = lhaCheck(p);
  const rent = p.rent_pcm ? `${money(p.rent_pcm)} pcm`
    : lha?.rent && p.rent_text ? `${money(lha.rent)} pcm (${p.rent_text})`
    : p.rent_text;
  const second = [rent, p.bills ? `Bills: ${p.bills}` : null].filter(Boolean).join(' · ');
  const third = [p.furnished, p.available_from ? `Available from ${shortDate(p.available_from)}` : null].filter(Boolean).join(' · ');
  return [`*${title}*`, second, third].filter(Boolean).join('\n');
}

export function propertiesText(ps: PropertyForMessage[]): string {
  if (ps.length === 1) return propertyText(ps[0]);
  return ps.map((p, i) => `${i + 1}. ${propertyText(p)}`).join('\n\n');
}

export const firstName = (full: string) => full.trim().split(/\s+/)[0] ?? '';

/** The message for a client, from the team's wording in Settings. */
export function clientMessage(clientName: string, ps: PropertyForMessage[], myName: string | null, template = activeSettings().whatsappMessage): string {
  return template
    .replace(/\{first name\}/gi, firstName(clientName))
    .replace(/\{a property\}/gi, ps.length === 1 ? 'a property' : `${ps.length} properties`)
    .replace(/\{properties\}/gi, propertiesText(ps))
    .replace(/\{my name\}/gi, myName ?? '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** wa.me link: to a number when there is one, otherwise "choose who to send it to". */
export function waLink(number: string | null, text: string): string {
  return `https://wa.me/${number ?? ''}?text=${encodeURIComponent(text)}`;
}
