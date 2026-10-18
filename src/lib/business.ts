// Keel's credentials (Team settings, Business details): printed at the foot of Mailer emails and under email
// signatures. They stay blank until Keel has joined each scheme, and blank ones are simply left out.

import type { AppSettings, BusinessDetails } from './settings';
import { activeSettings } from './settings';

/** The credentials still blank (the unsubscribe address is not one: the invoice email stands in for it). */
export function missingBusiness(b: BusinessDetails): string[] {
  const out: string[] = [];
  if (!b.redressScheme.trim()) out.push('redress scheme');
  if (!b.clientMoneyProtection.trim()) out.push('client money protection');
  if (!b.llasNumber.trim()) out.push('LLAS number');
  if (!b.icoNumber.trim()) out.push('ICO registration');
  if (!b.fees.trim()) out.push('fee list');
  return out;
}

/** "Redress: The Property Ombudsman, member D12345", one line each, filled-in ones only. */
export function credentialLines(b: BusinessDetails = activeSettings().business): string[] {
  const t = (s: string) => s.trim();
  return [
    t(b.redressScheme) ? `Redress: ${t(b.redressScheme)}${t(b.redressNumber) ? `, member ${t(b.redressNumber)}` : ''}` : null,
    t(b.clientMoneyProtection) ? `Client money protection: ${t(b.clientMoneyProtection)}` : null,
    t(b.llasNumber) ? `LLAS: ${t(b.llasNumber)}` : null,
    t(b.icoNumber) ? `ICO registration: ${t(b.icoNumber)}` : null,
    t(b.fees) ? `Fees: ${t(b.fees)}` : null,
  ].filter((x): x is string => x !== null);
}

/** Where officers write to stop property emails: the one set, else the email on invoices. */
export const unsubscribeAddress = (s: Pick<AppSettings, 'business' | 'invoice'> = activeSettings()) =>
  s.business.unsubscribeEmail.trim() || s.invoice.email.trim() || null;

/** The sign-off: their name, the business, its phone and email, then the credentials. */
export function signature(myName: string | null | undefined, s: Pick<AppSettings, 'business' | 'invoice'> = activeSettings()): string[] {
  const business = s.invoice.businessName.trim() || 'Keel Lettings';
  const contact = [s.invoice.phone.trim(), s.invoice.email.trim()].filter(Boolean).join(' · ');
  const creds = credentialLines(s.business);
  return [myName?.trim() || null, business, contact || null, creds.length ? creds.join(' · ') : null].filter((x): x is string => x !== null);
}
