// Council contacts (Step 3 of the update brief): the housing officer list (the `officers` table HELM made,
// with send status from 0020), the sends made to them, and each council's procurement or landlord scheme.
//
// THE HARD RULE: every export, mailer list and bulk action takes its addresses from `mailingList` and nowhere
// else. It leaves out anyone who has left, is on leave, opted out or bounced, any housing officer who has
// neither opted in nor nominated a client, and anyone with no address; and it uses the officer's shared
// mailbox (send_to_mailbox) instead of their own email whenever one is set.

import { activeSettings } from './settings';
import { boroughsIn, canonicalBorough } from './london';
import { shortDate } from './format';
import { todayIso } from './calls';

export type OfficerStatus = 'active' | 'left' | 'on_leave' | 'opted_out' | 'bounced';
export type RouteType = 'procurement_mailbox' | 'housing_officer' | 'landlord_scheme';
export type SendKind = 'alert' | 'digest' | 'bulk';

export const STATUS_WORDS: Record<OfficerStatus, string> = {
  active: 'Active', left: 'Left', on_leave: 'On leave', opted_out: 'Opted out', bounced: 'Bounced',
};
export const ROUTE_WORDS: Record<RouteType, string> = {
  procurement_mailbox: 'Procurement mailbox', housing_officer: 'Housing officer', landlord_scheme: 'Landlord scheme',
};
export const SEND_WORDS: Record<SendKind, string> = { alert: 'One-property alert', digest: 'Monthly digest', bulk: 'Bulk email' };

/** A row of the officers table: HELM's columns (all optional here), then the 0020 send status (undefined before it runs). */
export interface OfficerRecord {
  id: string | number;
  name: string | null;
  title?: string | null;
  council?: string | null;
  borough?: string | null;
  email?: string | null;
  phone?: string | null;
  notes?: string | null;
  prefers_sms?: boolean | null;
  last_contact_at?: string | null;
  first_referral?: string | null;
  referrals_30d?: number | null;
  route_type?: RouteType | null;
  send_to_mailbox?: string | null;
  status?: OfficerStatus | null;
  status_date?: string | null;
  leave_until?: string | null;
  opted_out_at?: string | null;
  opt_out_note?: string | null;
  bounce_count?: number | null;
  last_bounce_at?: string | null;
  last_nominated_client_at?: string | null;
  opt_in_source?: string | null;
  opted_in_at?: string | null;
  last_sent_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface OfficerSend { id: string; officer_id: string; kind: SendKind; address: string | null; note: string | null; sent_at: string; sent_by: string | null; property_ids?: string[]; subject?: string | null }

export interface CouncilScheme {
  id: string;
  council: string;
  scheme_name: string | null;
  route_mailbox: string | null;
  registered: boolean;
  registered_on: string | null;
  incentive_terms: string | null;
  max_incentive: number | null;
  documents_required: string | null;
  focus_borough: boolean;
  last_contact: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/** Whether the 0020 columns are there to judge by. */
export const hasSendStatus = (o: OfficerRecord) => o.status !== undefined;

/** Their status today: someone on leave whose return date has passed is active again. */
export function statusOf(o: OfficerRecord, today = todayIso()): OfficerStatus {
  const s = o.status ?? 'active';
  if (s === 'on_leave' && o.leave_until && o.leave_until < today) return 'active';
  return s;
}

/** The one address to send to: their team's shared mailbox when set, else their own email. */
export const sendAddress = (o: Pick<OfficerRecord, 'send_to_mailbox' | 'email'>) => o.send_to_mailbox?.trim() || o.email?.trim() || null;

/** When they last sent Keel a client: recorded, from HELM's first referral, or from a client of theirs in Keel. */
export function nominatedAt(o: OfficerRecord, fromClients?: string | null): string | null {
  return [o.last_nominated_client_at, o.first_referral, fromClients].filter((x): x is string => !!x).sort().pop() ?? null;
}

/** A housing officer may only be emailed once they have opted in or nominated a client. Mailboxes and schemes are there to be written to. */
export const needsOptIn = (o: OfficerRecord) => (o.route_type ?? 'housing_officer') === 'housing_officer';
export const optedIn = (o: OfficerRecord, fromClients?: string | null) => !!(o.opted_in_at || o.opt_in_source?.trim() || nominatedAt(o, fromClients));

/** Why they cannot be emailed today, or null if they can. */
export function whyNotSendable(o: OfficerRecord, opts: { today?: string; nominatedFromClients?: string | null } = {}): string | null {
  const today = opts.today ?? todayIso();
  const s = statusOf(o, today);
  if (s === 'left') return 'Left';
  if (s === 'opted_out') return 'Opted out';
  if (s === 'bounced') return 'Email bounced';
  if (s === 'on_leave') return o.leave_until ? `On leave until ${shortDate(o.leave_until)}` : 'On leave';
  if (!sendAddress(o)) return 'No email';
  if (needsOptIn(o) && !optedIn(o, opts.nominatedFromClients)) return 'Not opted in yet';
  return null;
}

export interface MailingList<T extends OfficerRecord = OfficerRecord> {
  /** who gets it, and at which address (officers sharing a mailbox each appear, at that mailbox) */
  to: Array<{ officer: T; address: string }>;
  /** the addresses to send to, each once */
  addresses: string[];
  /** who was left out, and why */
  left: Array<{ officer: T; why: string }>;
}

/** THE HARD RULE: the only way addresses for an export, mailer list or bulk action are worked out. */
export function mailingList<T extends OfficerRecord>(officers: T[], opts: { today?: string; nominatedFromClients?: (o: T) => string | null } = {}): MailingList<T> {
  const out: MailingList<T> = { to: [], addresses: [], left: [] };
  const seen = new Set<string>();
  for (const o of officers) {
    const why = whyNotSendable(o, { today: opts.today, nominatedFromClients: opts.nominatedFromClients?.(o) ?? null });
    if (why) { out.left.push({ officer: o, why }); continue; }
    const address = sendAddress(o)!;
    out.to.push({ officer: o, address });
    // a shared mailbox goes once, however many officers use it
    if (!seen.has(address.toLowerCase())) { seen.add(address.toLowerCase()); out.addresses.push(address); }
  }
  return out;
}

/** "Name <address>" (or just the address), joined with semicolons for the To or Bcc box. */
export function addressBox(list: Pick<MailingList, 'to'>): string {
  const seen = new Set<string>();
  return list.to.filter(({ address }) => !seen.has(address.toLowerCase()) && !!seen.add(address.toLowerCase())).map(({ officer, address }) => {
    const usesMailbox = !!officer.send_to_mailbox?.trim();
    const name = !usesMailbox && officer.name ? officer.name.replace(/"/g, '') : null;
    return name ? (/[,;<>@]/.test(name) ? `"${name}" <${address}>` : `${name} <${address}>`) : address;
  }).join('; ');
}

const daysAgo = (today: string, n: number) => { const d = new Date(`${today}T12:00:00`); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };

/** Bulk sends (bulk emails and digests, not one-property alerts) to an officer in the last 30 days. */
export function bulkSendsIn30(o: Pick<OfficerRecord, 'id'>, sends: OfficerSend[], today = todayIso()): number {
  const from = daysAgo(today, 30);
  return sends.filter((s) => s.officer_id === String(o.id) && s.kind !== 'alert' && s.sent_at.slice(0, 10) > from).length;
}

export interface ListHealth {
  sendable: OfficerRecord[];
  bounced: OfficerRecord[];
  left: OfficerRecord[];
  onLeave: OfficerRecord[];
  optedOut: OfficerRecord[];
  notOptedIn: OfficerRecord[];
  noAddress: OfficerRecord[];
  /** had more than one bulk send in 30 days */
  overSent: OfficerRecord[];
}
export type HealthKey = Exclude<keyof ListHealth, 'sendable'> | 'sendable';

/** The list-health view: who can be emailed, and everyone who cannot, by reason; and who has been sent to too often. */
export function listHealth(officers: OfficerRecord[], sends: OfficerSend[], opts: { today?: string; nominatedFromClients?: (o: OfficerRecord) => string | null } = {}): ListHealth {
  const today = opts.today ?? todayIso();
  const h: ListHealth = { sendable: [], bounced: [], left: [], onLeave: [], optedOut: [], notOptedIn: [], noAddress: [], overSent: [] };
  for (const o of officers) {
    const s = statusOf(o, today);
    if (s === 'bounced' || (s === 'active' && (o.bounce_count ?? 0) > 0)) h.bounced.push(o);
    if (s === 'left') h.left.push(o);
    if (s === 'on_leave') h.onLeave.push(o);
    if (s === 'opted_out') h.optedOut.push(o);
    if (s === 'active' && !sendAddress(o)) h.noAddress.push(o);
    if (s === 'active' && sendAddress(o) && needsOptIn(o) && !optedIn(o, opts.nominatedFromClients?.(o))) h.notOptedIn.push(o);
    if (!whyNotSendable(o, { today, nominatedFromClients: opts.nominatedFromClients?.(o) ?? null })) h.sendable.push(o);
    if (bulkSendsIn30(o, sends, today) > 1) h.overSent.push(o);
  }
  return h;
}

// ── Focus boroughs ──────────────────────────────────────────────────

/** The borough an officer or scheme is in, from its borough or council name ("London Borough of Harrow" is Harrow). */
export function boroughOf(x: { borough?: string | null; council?: string | null }): string | null {
  return canonicalBorough(x.borough ?? null) ?? canonicalBorough(x.council ?? null) ?? boroughsIn(x.council ?? '')[0] ?? boroughsIn(x.borough ?? '')[0] ?? null;
}

/** 0 for a focus borough, 1 for the wish-list, 2 for anywhere else (Team settings). */
export function focusRank(borough: string | null): 0 | 1 | 2 {
  if (!borough) return 2;
  const s = activeSettings();
  if (s.focusBoroughs.includes(borough)) return 0;
  if (s.wishlistBoroughs.includes(borough)) return 1;
  return 2;
}

/** Focus boroughs first, then the wish-list, then the rest; by borough, then name. */
export function byFocus<T extends { borough?: string | null; council?: string | null; name?: string | null }>(xs: T[]): T[] {
  return [...xs].sort((a, b) => {
    const ba = boroughOf(a), bb = boroughOf(b);
    return focusRank(ba) - focusRank(bb) || (ba ?? '~').localeCompare(bb ?? '~') || (a.name ?? '').localeCompare(b.name ?? '');
  });
}

// ── Officers gathered from clients, against the list ────────────────

const phoneKey = (p: string | null | undefined) => {
  const d = (p ?? '').replace(/\D/g, '').replace(/^44/, '0');
  return d.length >= 10 ? d : null;
};

/** The officer record for someone named on a client: by email, then phone. */
export function recordFor<T extends OfficerRecord>(o: { email: string | null; phone: string | null }, records: T[]): T | null {
  const email = o.email?.toLowerCase().trim();
  if (email) {
    const hit = records.find((r) => r.email?.toLowerCase().trim() === email || r.send_to_mailbox?.toLowerCase().trim() === email);
    if (hit) return hit;
  }
  const pk = phoneKey(o.phone);
  return pk ? records.find((r) => phoneKey(r.phone) === pk) ?? null : null;
}
