// Invoices for a letting fee or a council incentive: what goes on the page,
// the running number (handed out by the database, migration 0013, so two
// people never get the same one), VAT when Keel is registered, and the
// WhatsApp message that goes with it.
//
// An invoice to a provider or landlord names the client by first name only,
// like every message to a provider. A council needs the full name to match
// its records, so an incentive claim carries it.

import type { Applicant, Provider, Receivable } from './types';
import type { InvoiceSettings } from './settings';
import { activeSettings } from './settings';
import { fullDate, moneyExact } from './format';
import { basisWords, KIND_LABEL, LANDLORD } from './money';

/** "KEEL-0007" */
export const invoiceNumber = (prefix: string, n: number) => `${prefix.trim()}${String(Math.max(1, Math.floor(n))).padStart(4, '0')}`;

const pence = (n: number) => Math.round(n * 100) / 100;

/** The amount is what the payer pays; when VAT registered it includes VAT at 20%, shown separately. */
export function vatSplit(total: number, registered: boolean): { net: number; vat: number; total: number } {
  if (!registered) return { net: pence(total), vat: 0, total: pence(total) };
  const net = pence(total / 1.2);
  return { net, vat: pence(total - net), total: pence(total) };
}

const firstName = (full: string) => full.trim().split(/\s+/)[0] ?? '';

/** Who the invoice goes to, one line each: the provider's company (or name) and email, the landlord, or the council. */
export function defaultBillTo(r: Pick<Receivable, 'payer' | 'kind'>, provider: Pick<Provider, 'name' | 'company' | 'email' | 'contact_first_name'> | null): string {
  if (provider) return [provider.company?.trim() || provider.name, provider.contact_first_name?.trim() ? `Attn: ${provider.contact_first_name.trim()}` : null, provider.email].filter(Boolean).join('\n');
  if (r.kind === 'incentive') return r.payer.replace(/\bcouncil\b/i, 'Council');
  return r.payer === LANDLORD ? '' : r.payer;
}

/** What is missing from Keel's details before an invoice can be sent. */
export function missingDetails(s: InvoiceSettings): string[] {
  const out: string[] = [];
  if (!s.businessName.trim()) out.push('business name');
  if (!s.address.trim()) out.push('address');
  if (!s.accountNumber.trim() || !s.sortCode.trim()) out.push('bank details');
  if (s.vatRegistered && !s.vatNumber.trim()) out.push('VAT number');
  return out;
}

export interface InvoiceLine { description: string; detail: string[]; amount: number }

export interface InvoiceView {
  number: string | null;
  date: string;          // YYYY-MM-DD
  due: string | null;    // a date in words, or "once ..." for a fee that waits for the first rent
  billTo: string[];
  from: string[];        // Keel's name, address and contact lines
  lines: InvoiceLine[];
  net: number;
  vat: number;
  total: number;
  vatNumber: string | null;
  companyNumber: string | null;
  payment: string[];     // bank details and terms
}

/** Everything printed on the invoice for a fee or incentive. */
export function invoiceFor(r: Receivable, ctx: {
  client: Pick<Applicant, 'full_name'> | null; settings: InvoiceSettings; billTo?: string | null; today: string;
}): InvoiceView {
  const s = ctx.settings;
  const council = r.kind === 'incentive';
  const tenant = ctx.client ? (council ? ctx.client.full_name.trim() : firstName(ctx.client.full_name)) : null;
  const address = r.property_address?.trim() || 'the property';
  const detail = [
    tenant ? `Tenant: ${tenant}` : null,
    r.sign_up_on ? `Tenancy signed ${fullDate(r.sign_up_on)}` : null,
    basisWords(r),
  ].filter((x): x is string => Boolean(x));
  const waits = r.due_after === 'first_rent' && !r.first_rent_paid_on;
  const split = vatSplit(r.amount ?? 0, s.vatRegistered);
  const bill = (ctx.billTo ?? r.bill_to ?? '').split('\n').map((x) => x.trim()).filter(Boolean);
  return {
    number: r.invoice_number ?? null,
    date: r.invoiced_on ?? ctx.today,
    due: waits ? 'Once the first month\'s rent is paid' : r.due_on ? fullDate(r.due_on) : null,
    billTo: bill.length ? bill : [r.payer],
    from: [s.businessName, ...s.address.split('\n'), s.email, s.phone].map((x) => x.trim()).filter(Boolean),
    lines: [{ description: `${council ? 'Council incentive' : KIND_LABEL[r.kind]}: ${address}`, detail, amount: split.net }],
    ...split,
    vatNumber: s.vatRegistered && s.vatNumber.trim() ? s.vatNumber.trim() : null,
    companyNumber: s.companyNumber.trim() || null,
    payment: [
      s.bankName.trim() ? `Bank: ${s.bankName.trim()}` : null,
      s.accountName.trim() ? `Account name: ${s.accountName.trim()}` : null,
      s.sortCode.trim() ? `Sort code: ${s.sortCode.trim()}` : null,
      s.accountNumber.trim() ? `Account number: ${s.accountNumber.trim()}` : null,
      r.invoice_number ? `Reference: ${r.invoice_number}` : null,
      s.terms.trim() || null,
    ].filter((x): x is string => Boolean(x)),
  };
}

/** The WhatsApp message that goes with an invoice, from the team's wording. Greets a provider "Salam {name}"; first name of the client only. */
export function invoiceMessage(r: Receivable, ctx: {
  provider: Pick<Provider, 'name' | 'contact_first_name'> | null; client: Pick<Applicant, 'full_name'> | null; myName: string | null;
  settings?: InvoiceSettings; template?: string;
}): string {
  const s = ctx.settings ?? activeSettings().invoice;
  const template = ctx.template ?? activeSettings().invoiceMessage;
  const waits = r.due_after === 'first_rent' && !r.first_rent_paid_on;
  const vars: Record<string, string> = {
    provider_first_name: ctx.provider?.contact_first_name?.trim() || ctx.provider?.name || r.payer,
    invoice_number: r.invoice_number ?? 'attached',
    amount: r.amount != null ? moneyExact(r.amount) : 'the agreed amount',
    client_first_name: ctx.client ? firstName(ctx.client.full_name) : 'my client',
    property_address: r.property_address ?? 'the property',
    due_date: waits ? 'once the first month\'s rent is paid' : r.due_on ? fullDate(r.due_on) : 'on receipt',
    account_name: s.accountName.trim() || s.businessName.trim(),
    sort_code: s.sortCode.trim() || '(sort code)',
    account_number: s.accountNumber.trim() || '(account number)',
    my_name: ctx.myName ?? '',
  };
  return template.replace(/\{([a-z_]+)\}/gi, (m, k: string) => vars[k.toLowerCase()] ?? m).trim();
}

/** The subject and body of an email sending the invoice (the PDF is attached by hand). */
export function invoiceEmail(r: Receivable, ctx: { client: Pick<Applicant, 'full_name'> | null; myName: string | null; settings?: InvoiceSettings }): { subject: string; body: string } {
  const s = ctx.settings ?? activeSettings().invoice;
  const what = r.kind === 'incentive' ? 'council incentive' : 'letting fee';
  return {
    subject: `Invoice ${r.invoice_number ?? ''} from ${s.businessName}`.replace(/\s+/g, ' ').trim(),
    body: [
      'Hello,',
      '',
      `Please find attached invoice ${r.invoice_number ?? ''} for ${r.amount != null ? moneyExact(r.amount) : 'the agreed amount'}, the ${what} for ${
        ctx.client ? (r.kind === 'incentive' ? ctx.client.full_name.trim() : firstName(ctx.client.full_name)) : 'my client'} at ${r.property_address ?? 'the property'}.`,
      '',
      `Thanks,`,
      ctx.myName ? `${ctx.myName}, ${s.businessName}` : s.businessName,
    ].join('\n').replace(/ {2,}/g, ' '),
  };
}
