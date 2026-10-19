// Outlook emails, sorted for Keel (the reading and sending is in outlook.ts). Only email from housing officers and
// councils is ever brought in: an address on the officer list, an officer named on a client, or a council address
// (.gov.uk). Everything else in the mailbox is left alone and nothing about it is kept.
//
//   reply        from a client's own officer, or naming a client in its subject: goes on that client's timeline
//   nomination   from an officer or council, about someone Keel does not have yet: goes to the Bin to review
//   other        from an officer or council but neither: waits under the Bin for you to file or ignore
//
// Officer addresses can also be gathered from the mailbox (who you email at councils, who emails you), to add to the
// officer list. Added officers are never sent property emails until they opt in or refer a client (`mailingList`).

import type { Applicant } from './types';
import type { OfficerRecord } from './councils';
import { boroughOf, recordFor } from './councils';
import { orgOfEmail } from './search';

export interface MailAddress { name: string | null; address: string }

/** An email as Microsoft Graph gives it, with only the fields Keel asks for. */
export interface GraphMessage {
  id: string;
  internetMessageId?: string | null;
  subject?: string | null;
  from?: { emailAddress?: { name?: string | null; address?: string | null } | null } | null;
  toRecipients?: Array<{ emailAddress?: { name?: string | null; address?: string | null } | null }> | null;
  ccRecipients?: Array<{ emailAddress?: { name?: string | null; address?: string | null } | null }> | null;
  receivedDateTime?: string | null;
  sentDateTime?: string | null;
  bodyPreview?: string | null;
  body?: { contentType?: string | null; content?: string | null } | null;
}

const clean = (a: string | null | undefined) => (a ?? '').trim().toLowerCase();
export const addressOf = (x: { emailAddress?: { name?: string | null; address?: string | null } | null } | null | undefined): MailAddress | null => {
  const address = clean(x?.emailAddress?.address);
  return address && address.includes('@') ? { name: x?.emailAddress?.name?.trim() || null, address } : null;
};
export const domainOf = (address: string) => address.split('@')[1] ?? '';

/** An address that sends nothing worth filing: no-reply robots and delivery notices. */
const ROBOT = /^(no-?reply|do-?not-?reply|donotreply|mailer-daemon|postmaster|bounce|notifications?|alerts?)\b/i;

/** A council address: on a .gov.uk domain, or a domain an officer on the list already uses. */
export function isCouncilAddress(address: string, officerDomains: ReadonlySet<string> = new Set()): boolean {
  const a = clean(address);
  if (!a.includes('@') || ROBOT.test(a.split('@')[0])) return false;
  const d = domainOf(a);
  return d.endsWith('.gov.uk') || officerDomains.has(d);
}

/** The domains of officers already on the list (personal webmail left out). */
export function officerDomainsOf(records: OfficerRecord[]): Set<string> {
  const out = new Set<string>();
  for (const r of records) for (const e of [r.email, r.send_to_mailbox]) {
    const d = domainOf(clean(e));
    if (d && !/^(gmail|googlemail|hotmail|outlook|live|yahoo|icloud|me|btinternet|aol)\./.test(d)) out.add(d);
  }
  return out;
}

/** An email's text, plain, without the quoted thread underneath, for the Bin to read and for a short preview. */
export function plainText(m: Pick<GraphMessage, 'body' | 'bodyPreview'>, max = 4000): string {
  let t = m.body?.content ?? m.bodyPreview ?? '';
  if (/html/i.test(m.body?.contentType ?? '')) {
    t = t.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|tr|li|h\d)>/gi, '\n')
      .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"');
  }
  // stop at the quoted earlier email
  const cut = t.search(/\n\s*(?:-{2,}\s*original message|from:\s.+\n\s*sent:|on .{6,80} wrote:)/i);
  if (cut > 0) t = t.slice(0, cut);
  return t.replace(/[ \t]+/g, ' ').replace(/^ | $/gm, '').replace(/\n\s*\n\s*\n+/g, '\n\n').trim().slice(0, max);
}

export const snippetOf = (m: Pick<GraphMessage, 'body' | 'bodyPreview'>) => plainText(m, 600).replace(/\s+/g, ' ').slice(0, 280);

/** Words that mean an officer is putting someone forward for a home. */
const NOMINATION = /\b(nominat\w*|referr?al|referring|refer(?:red)?\b|put (?:forward|through)|housing need|homeless\w*|temporary accommodation|\bTA\b|prs offer|private rented|looking for (?:a )?(?:property|home|accommodation)|property request|client (?:details|profile)|applicant|household (?:of|with)|discharge (?:of )?duty)/i;

/** Names that would match too easily in someone else's email: single words, very short names. */
const nameWords = (full: string) => full.toLowerCase().replace(/[^a-z' -]/g, ' ').split(/\s+/).filter((w) => w.length > 1);

/** Whether an email names this client: their full name, or first and last name both. */
export function namesClient(text: string, a: Pick<Applicant, 'full_name'>): boolean {
  const words = nameWords(a.full_name);
  if (words.length < 2) return false;
  const t = ` ${text.toLowerCase().replace(/[^a-z' -]/g, ' ').replace(/\s+/g, ' ')} `;
  if (t.includes(` ${words.join(' ')} `)) return true;
  return t.includes(` ${words[0]} `) && t.includes(` ${words[words.length - 1]} `);
}

export type Sorted =
  | { kind: 'reply'; applicant: Applicant; from: MailAddress; officer: OfficerRecord | null }
  | { kind: 'nomination'; from: MailAddress; officer: OfficerRecord | null; council: string | null }
  | { kind: 'other'; from: MailAddress; officer: OfficerRecord | null; council: string | null }
  | { kind: 'ignore' };

/** Where an email goes in Keel, if anywhere. */
export function sortEmail(m: GraphMessage, ctx: { applicants: Applicant[]; officers: OfficerRecord[]; own?: string[] }): Sorted {
  const from = addressOf(m.from);
  if (!from) return { kind: 'ignore' };
  if ((ctx.own ?? []).map(clean).includes(from.address)) return { kind: 'ignore' };
  const officer = recordFor({ email: from.address, phone: null }, ctx.officers);
  const theirClients = ctx.applicants.filter((a) => clean(a.officer_email) === from.address);
  const fromOfficer = !!officer || theirClients.length > 0 || isCouncilAddress(from.address, officerDomainsOf(ctx.officers));
  if (!fromOfficer) return { kind: 'ignore' };

  const subject = m.subject ?? '';
  const text = `${subject}\n${plainText(m, 3000)}`;
  // their own client, named; or any client named in the subject
  const named = theirClients.filter((a) => namesClient(text, a));
  const inSubject = named.length ? [] : ctx.applicants.filter((a) => namesClient(subject, a));
  const hit = named.length === 1 ? named[0] : inSubject.length === 1 ? inSubject[0] : null;
  if (hit) return { kind: 'reply', applicant: hit, from, officer };

  const council = (officer ? boroughOf(officer) : null) ?? orgOfEmail(from.address);
  if (NOMINATION.test(text)) return { kind: 'nomination', from, officer, council };
  return { kind: 'other', from, officer, council };
}

/** "Email from Jo Brennan (Harrow): Re: Sam's viewing. Thanks, Sam would like ..." for the client's timeline. */
export function timelineWords(m: GraphMessage, from: MailAddress, council: string | null): string {
  const who = `${from.name ?? from.address}${council ? ` (${council})` : ''}`;
  const subject = (m.subject ?? '').trim();
  const snip = snippetOf(m);
  return `Email from ${who}${subject ? `: ${subject}` : ''}${snip ? `. ${snip}` : ''}`.slice(0, 600);
}

/** The text the Bin reads for a nomination: who sent it, the subject and the email. */
export function binText(m: GraphMessage, from: MailAddress): string {
  return [`From: ${from.name ? `${from.name} <${from.address}>` : from.address}`, `Subject: ${m.subject ?? ''}`, '', plainText(m)].join('\n');
}

// ── Officer addresses from the mailbox ─────────────────────────────

export interface FoundAddress {
  address: string;
  name: string | null;
  council: string | null;
  /** emails you sent them, and they sent you */
  sent: number;
  received: number;
  last: string | null;
}

/** "jo.brennan@harrow.gov.uk" with no name: "Jo Brennan" */
export function nameFromAddress(address: string): string | null {
  const local = address.split('@')[0];
  if (!/[._-]/.test(local) || /\d{3,}/.test(local)) return null;
  const parts = local.split(/[._-]+/).filter((p) => /^[a-z]{2,}$/i.test(p));
  return parts.length >= 2 ? parts.map((p) => p[0].toUpperCase() + p.slice(1).toLowerCase()).join(' ') : null;
}

/** Council addresses in the mailbox not on the officer list yet, most written to first. Your own addresses, robots
 *  and anyone already on the list (or using a team mailbox on it) are left out. */
export function officerAddresses(sent: GraphMessage[], received: GraphMessage[], records: OfficerRecord[], own: string[] = []): FoundAddress[] {
  const domains = officerDomainsOf(records);
  const mine = new Set(own.map(clean));
  const onList = new Set(records.flatMap((r) => [clean(r.email), clean(r.send_to_mailbox)]).filter(Boolean));
  const found = new Map<string, FoundAddress>();
  const add = (x: MailAddress | null, how: 'sent' | 'received', when: string | null | undefined) => {
    if (!x || mine.has(x.address) || onList.has(x.address) || !isCouncilAddress(x.address, domains)) return;
    const f = found.get(x.address) ?? { address: x.address, name: null, council: orgOfEmail(x.address), sent: 0, received: 0, last: null };
    // a real name beats one read from the address; an address used as a name is no name
    if (x.name && !x.name.includes('@')) f.name ??= x.name;
    f[how] += 1;
    if (when && (!f.last || when > f.last)) f.last = when;
    found.set(x.address, f);
  };
  for (const m of sent) for (const r of [...(m.toRecipients ?? []), ...(m.ccRecipients ?? [])]) add(addressOf(r), 'sent', m.sentDateTime);
  for (const m of received) add(addressOf(m.from), 'received', m.receivedDateTime);
  return [...found.values()]
    .map((f) => ({ ...f, name: f.name ?? nameFromAddress(f.address) }))
    .sort((a, b) => b.sent - a.sent || b.received - a.received || a.address.localeCompare(b.address));
}

/** The officer list row for an address found in Outlook: a housing officer, not opted in (so never emailed in bulk). */
export function officerRowFor(f: FoundAddress): Partial<OfficerRecord> {
  return {
    name: f.name, email: f.address, council: f.council, status: 'active', route_type: 'housing_officer',
    notes: `Added from Outlook (${f.sent} sent, ${f.received} received)`,
  };
}
