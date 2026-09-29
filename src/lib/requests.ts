// Requests to providers on WhatsApp: check a property is available, book a
// viewing, or send a client's details.
//
// Privacy: a message only ever carries a client's first name, household and
// benefits. Never their phone, surname or anything medical; the templates
// have no placeholder for those. Sending details needs the client's
// agreement (applicants.share_with_landlords); checking availability does not.

import type { Applicant, Provider, ProviderRequest, ProviderRules, RequestType } from './types';
import { activeSettings } from './settings';
import { benefitsOf, householdOf } from './search';
import { canonicalBorough } from './london';
import { clockTime, money, shortDay } from './format';
import { waNumber } from './whatsapp';

export const REQUEST_TYPES: ReadonlyArray<{ key: RequestType; label: string; done: string }> = [
  { key: 'availability', label: 'Check availability', done: 'Availability asked' },
  { key: 'viewing', label: 'Book viewing', done: 'Viewing requested' },
  { key: 'details', label: 'Send client details', done: 'Details sent' },
];
export const REQUEST_LABEL = Object.fromEntries(REQUEST_TYPES.map((t) => [t.key, t])) as Record<RequestType, (typeof REQUEST_TYPES)[number]>;

/** Only sending details needs the client's agreement. */
export const needsConsent = (type: RequestType) => type === 'details';

/** Placeholders the request templates understand. */
export const REQUEST_PLACEHOLDERS: ReadonlyArray<[string, string]> = [
  ['{provider_first_name}', 'the contact at the provider'],
  ['{property_address}', 'the property'],
  ['{property_rent}', 'its rent, e.g. £1,436 pcm'],
  ['{client_first_name}', 'first name only'],
  ['{client_household}', 'single, couple, family with 2 children'],
  ['{client_benefits}', 'UC and PIP, working full time'],
  ['{slots}', 'the viewing times you offer'],
  ['{my_name}', 'whoever sends it'],
  ['{old_time}', 'the viewing time before it moved or was cancelled'],
  ['{new_time}', 'the new viewing time'],
];

// ── Providers ──────────────────────────────────────────────────────

/** Digits only, as wa.me wants: "07700 900123" becomes "447700900123". */
export const providerNumber = (raw: string | null | undefined) => waNumber(raw);

const tagOf = (s: string | null | undefined) => (s ?? '').trim().toUpperCase();

/** A property's provider: the one it is linked to, or the one whose tag is its source tag. */
export function providerFor(p: { provider_id?: string | null; source_tag?: string | null }, providers: Provider[]): Provider | null {
  if (p.provider_id) {
    const byId = providers.find((x) => x.id === p.provider_id);
    if (byId) return byId;
  }
  const tag = tagOf(p.source_tag);
  return tag ? providers.find((x) => tagOf(x.tag) === tag) ?? null : null;
}

// ── A client, in words a provider sees ─────────────────────────────

const list = (xs: string[], joiner = 'and') => (xs.length <= 1 ? xs[0] ?? '' : `${xs.slice(0, -1).join(', ')} ${joiner} ${xs[xs.length - 1]}`);
export const firstNameOf = (a: Pick<Applicant, 'full_name'>) => a.full_name.trim().split(/\s+/)[0] ?? '';

/** "UC and PIP", "UC and working full time", "benefits not given". */
export function benefitWords(a: Applicant): string {
  const parts = benefitsOf(a).map((b) => b.label);
  if (a.work_status === 'full_time') parts.push('working full time');
  if (a.work_status === 'part_time') parts.push('working part time');
  return parts.length ? list(parts) : 'benefits not given';
}

/** "single", "couple", "family with 2 children". */
export function householdWords(a: Applicant): string {
  const h = householdOf(a);
  if (h === 'family') {
    const n = a.children ?? 0;
    return n > 0 ? `family with ${n} ${n === 1 ? 'child' : 'children'}` : 'family';
  }
  return h === 'single' || h === 'couple' ? h : h === 'other' ? 'household of ' + ((a.adults ?? 1) + (a.children ?? 0)) : 'household not given';
}

// ── Rules ──────────────────────────────────────────────────────────

const RULE_BENEFIT: Record<string, (a: Applicant) => boolean> = {
  pip: (a) => benefitsOf(a).some((b) => b.key === 'pip'),
  lcwra: (a) => benefitsOf(a).some((b) => b.key === 'lcwra'),
  uc: (a) => benefitsOf(a).some((b) => b.key === 'uc'),
  hb: (a) => benefitsOf(a).some((b) => b.key === 'hb'),
  'full-time': (a) => a.work_status === 'full_time',
  'part-time': (a) => a.work_status === 'part_time',
};
const ruleKey = (s: string) => s.trim().toLowerCase().replace(/\s+work$/, '').replace(/\s+/g, '-');
const PLURAL: Record<string, string> = { single: 'singles', couple: 'couples', family: 'families' };

/** Why a client does not meet a provider's rules, in plain words (empty if they do). */
export function ruleProblems(provider: Pick<Provider, 'tag' | 'rules'>, a: Applicant): string[] {
  const r: ProviderRules = provider.rules ?? {};
  const who = firstNameOf(a);
  const out: string[] = [];

  const need = (r.benefits_required ?? []).filter((b) => RULE_BENEFIT[ruleKey(b)]);
  if (need.length && !need.some((b) => RULE_BENEFIT[ruleKey(b)](a))) {
    const has = benefitsOf(a).map((b) => b.label);
    out.push(`${provider.tag} needs ${list(need, 'or')}. ${who} has ${has.length ? `${list(has)} only` : 'no benefits recorded'}`);
  }

  const allowed = (r.household_allowed ?? []).map((h) => h.trim().toLowerCase()).filter(Boolean);
  if (allowed.length) {
    const h = householdOf(a);
    if (!h) out.push(`${provider.tag} takes ${list(allowed.map((x) => PLURAL[x] ?? x), 'or')} only. ${who}'s household is not recorded`);
    else if (!allowed.includes(h)) out.push(`${provider.tag} takes ${list(allowed.map((x) => PLURAL[x] ?? x), 'or')} only. ${who} is ${h === 'family' ? 'a family' : h === 'couple' ? 'a couple' : h}`);
  }

  const boroughs = (r.boroughs ?? []).map((b) => canonicalBorough(b) ?? b.trim()).filter(Boolean);
  if (boroughs.length) {
    const council = canonicalBorough(a.council || a.referring_borough);
    if (!council) out.push(`${provider.tag} takes clients from ${list(boroughs, 'or')} only. ${who}'s council is not recorded`);
    else if (!boroughs.includes(council)) out.push(`${provider.tag} takes clients from ${list(boroughs, 'or')} only. ${who} is with ${council}`);
  }
  return out;
}

/** Anything about the property itself that goes against the provider's rules. */
export function propertyProblems(provider: Pick<Provider, 'tag' | 'rules'>, p: { rent_pcm: number | null }): string[] {
  const max = provider.rules?.max_rent;
  return max && p.rent_pcm && p.rent_pcm > max ? [`Rent ${money(p.rent_pcm)} is over ${provider.tag}'s max of ${money(max)}`] : [];
}

/** "PIP or LCWRA · singles · max £1,300 · Brent or Barnet · furnished" */
export function rulesSummary(r: ProviderRules | null | undefined): string {
  if (!r) return 'No rules';
  const parts = [
    r.benefits_required?.length ? list(r.benefits_required, 'or') : null,
    r.household_allowed?.length ? list(r.household_allowed.map((h) => PLURAL[h.toLowerCase()] ?? h.toLowerCase()), 'or') : null,
    r.max_rent ? `max ${money(r.max_rent)}` : null,
    r.boroughs?.length ? list(r.boroughs, 'or') : null,
    r.furnished ?? null,
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : 'Takes anyone';
}

// ── The message ────────────────────────────────────────────────────

/** "Wed 30 Sep, 2pm" */
export const slotWords = (iso: string) => `${shortDay(iso)}, ${clockTime(iso)}`;
export const slotsWords = (slots: string[]) => (slots.length ? list(slots.map(slotWords), 'or') : 'any time that suits you');

const rentWords = (p: { rent_pcm: number | null; rent_text: string | null }) =>
  p.rent_pcm ? `${money(p.rent_pcm)} pcm` : p.rent_text?.trim() || 'rent to confirm';

/** Fill {placeholders}; ones this message does not know are left as they are, so the preview shows them. */
const fill = (s: string, vars: Record<string, string>) => s.replace(/\{([a-z_]+)\}/gi, (m, k: string) => vars[k.toLowerCase()] ?? m);

export interface MessageInput {
  type: RequestType | 'chase' | 'reschedule' | 'cancel';
  provider: Pick<Provider, 'name' | 'contact_first_name'>;
  property: { address_line: string; rent_pcm: number | null; rent_text: string | null };
  clients: Applicant[];
  slots?: string[];
  myName: string | null;
  template?: string;
  /** a viewing that moved or was cancelled: when it was, and when it is now (ISO) */
  oldTime?: string | null;
  newTime?: string | null;
}

/**
 * The message for a provider. A line with a {client_...} placeholder is
 * written once per client, so several clients go in one message, one line
 * each (and the line is dropped when there are none).
 */
export function requestMessage(i: MessageInput): string {
  const template = i.template ?? activeSettings().requestTemplates[i.type];
  const common = {
    provider_first_name: i.provider.contact_first_name?.trim() || i.provider.name,
    property_address: i.property.address_line,
    property_rent: rentWords(i.property),
    slots: slotsWords(i.slots ?? []),
    my_name: i.myName ?? '',
    old_time: i.oldTime ? slotWords(i.oldTime) : 'the time we agreed',
    new_time: i.newTime ? slotWords(i.newTime) : 'a time that suits you',
  };
  const lines: string[] = [];
  for (const line of template.replace(/\r/g, '').split('\n')) {
    if (/\{client_[a-z_]+\}/i.test(line)) {
      for (const c of i.clients) {
        lines.push(fill(line, { ...common, client_first_name: firstNameOf(c), client_household: householdWords(c), client_benefits: benefitWords(c) }));
      }
    } else {
      lines.push(fill(line, common));
    }
  }
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

// ── Following up ───────────────────────────────────────────────────

/** When a request is due a chase: the hours in Team settings (24 as standard) after it was sent. */
export const followUpFrom = (sent: Date) => new Date(sent.getTime() + (activeSettings().requestFollowUpHours || 24) * 3_600_000);

/** Requests still waiting on a provider: chases that are due first (oldest first), then the rest by when they fall due. */
export function awaitingProviders(requests: ProviderRequest[], now = new Date()): Array<{ request: ProviderRequest; overdue: boolean }> {
  return requests
    .filter((r) => r.status === 'sent')
    .map((request) => ({ request, overdue: !!request.follow_up_at && new Date(request.follow_up_at) <= now }))
    .sort((a, b) => Number(b.overdue) - Number(a.overdue) || (a.request.follow_up_at ?? a.request.sent_at).localeCompare(b.request.follow_up_at ?? b.request.sent_at));
}

export const isOpen = (r: Pick<ProviderRequest, 'status'>) => r.status === 'sent';
