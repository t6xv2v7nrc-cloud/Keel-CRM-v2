// Housing officers, gathered from clients' details (officer name, email and phone). Keel keeps no separate
// contacts list; this collects each officer once, from every client they referred, ready to copy into an email.
// The same officer often arrives with an email on one referral and only a name or phone on another, so records
// are joined on email, then phone, then name.

import type { Applicant } from './types';
import { isActive, officerName, officerOrg } from './search';

export interface Officer {
  key: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  /** Where they work, from their email: Brent, Haringey... */
  org: string | null;
  clients: Array<Pick<Applicant, 'id' | 'full_name' | 'stage'>>;
  /** How many of their clients are still active. */
  active: number;
  /** When their newest client arrived. */
  latest: string;
}

const EMAIL = /[^\s<>"',;]+@[^\s<>"',;]+\.[a-z]{2,}/i;
const emailOf = (a: Pick<Applicant, 'officer_email' | 'officer_name'>) => {
  for (const x of [a.officer_email, a.officer_name]) {
    const m = x ? EMAIL.exec(x) : null;
    if (m) return m[0].toLowerCase();
  }
  return null;
};
const phoneKey = (p: string | null | undefined) => {
  const d = (p ?? '').replace(/\D/g, '').replace(/^44/, '0');
  return d.length >= 10 ? d : null;
};
const nameKey = (n: string | null) => (n ? n.toLowerCase().replace(/[^a-z]/g, '') : null);

/** Every housing officer named on a client, once each, by council then name (officers we cannot place last). */
export function officersFrom(applicants: Applicant[]): Officer[] {
  const out: Officer[] = [];
  const byEmail = new Map<string, Officer>();
  const byPhone = new Map<string, Officer>();
  const byName = new Map<string, Officer>();
  // newest referral first, so the freshest details win
  const sorted = [...applicants].sort((a, b) => b.created_at.localeCompare(a.created_at));
  for (const a of sorted) {
    const email = emailOf(a);
    const name = officerName(a);
    const phone = a.officer_phone?.trim() || null;
    if (!email && !name && !phone) continue;
    const pk = phoneKey(phone);
    const nk = nameKey(name);
    const found = (email && byEmail.get(email)) || (pk && byPhone.get(pk)) || (nk && byName.get(nk)) || null;
    const o: Officer = found ?? { key: email ?? pk ?? nk ?? a.id, name: null, email: null, phone: null, org: null, clients: [], active: 0, latest: a.created_at };
    if (!found) out.push(o);
    o.name ??= name;
    o.email ??= email;
    o.phone ??= phone;
    o.org ??= officerOrg(a);
    o.clients.push({ id: a.id, full_name: a.full_name, stage: a.stage });
    if (isActive(a)) o.active += 1;
    if (a.created_at > o.latest) o.latest = a.created_at;
    if (o.email) byEmail.set(o.email, o);
    const opk = phoneKey(o.phone);
    if (opk) byPhone.set(opk, o);
    const onk = nameKey(o.name);
    if (onk) byName.set(onk, o);
  }
  return out.sort((x, y) => {
    if (!x.org !== !y.org) return x.org ? -1 : 1;
    return (x.org ?? '').localeCompare(y.org ?? '') || (x.name ?? x.email ?? '').localeCompare(y.name ?? y.email ?? '');
  });
}

/** "Alexandra Konstantinopoulou <alexandra@brent.gov.uk>": how email apps write someone in the To box. */
export function addressLine(o: Pick<Officer, 'name' | 'email'>): string | null {
  if (!o.email) return null;
  if (!o.name) return o.email;
  const name = o.name.replace(/"/g, '');
  return /[,;<>@]/.test(name) ? `"${name}" <${o.email}>` : `${name} <${o.email}>`;
}

/** Everyone with an email, for the To or Bcc box. Semicolons, which Outlook needs and Gmail and Apple Mail accept. */
export const emailList = (officers: Array<Pick<Officer, 'name' | 'email'>>) =>
  officers.map(addressLine).filter((x): x is string => Boolean(x)).join('; ');

/** Just the addresses, for a mailto link. */
export const bareEmails = (officers: Array<Pick<Officer, 'email'>>) => officers.map((o) => o.email).filter((x): x is string => Boolean(x));

/** One officer as lines of text: name, where they work, email, phone. */
export const officerText = (o: Officer) =>
  [o.name ?? 'Name not given', o.org, o.email, o.phone].filter(Boolean).join('\n');

/** Every officer as a block of text, a blank line between each. */
export const officersText = (officers: Officer[]) => officers.map(officerText).join('\n\n');
