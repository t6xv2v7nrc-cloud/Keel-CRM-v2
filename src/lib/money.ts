// Finances: money owed to Keel for a placement (receivables), what could come
// in from clients going for a property (potentials), and when it all falls
// due (the calendar). A receivable is the letting fee (from a provider such as
// Watermint or Zuber, or the landlord) or a council incentive. The page is
// called "Finances"; files and the activity kind keep the name "money" they
// were built with.
//
// A fee is typed in, or worked out from the property's rent: a percentage of
// a month's rent, or a number of weeks' rent (a week is pcm × 12 ÷ 52).
//
// The due date is worked out from the sign-up date: a provider's own rule if
// it has one ("1 month after sign up"), otherwise the team's standard in
// Settings. Some providers only pay once the client's first month's rent is
// in: those fees wait for it, with the date it is expected on the calendar,
// and fall due once it is marked paid. Any date can be changed by hand.
// Anything open and past its due date is overdue, so nothing is forgotten.

import type {
  Applicant, Deal, DealStatus, DueFrom, DueRule, FeeBasis, Property, Provider, ProviderRules, Receivable, ReceivableKind, ReceivableStatus,
} from './types';
import { activeSettings } from './settings';
import { isoDay, todayIso } from './calls';
import { money, moneyFee, monthName, shortDay } from './format';
import { lhaCheck } from './lha';
import { providerFor } from './requests';

export const KIND_LABEL: Record<ReceivableKind, string> = { letting_fee: 'Letting fee', incentive: 'Incentive' };
export const STATUS_LABEL: Record<ReceivableStatus, string> = {
  due: 'Due', chased: 'Chased', paid: 'Paid', to_claim: 'To claim', submitted: 'Claim submitted', declined: 'Declined',
};
/** The statuses each kind moves through. */
export const STATUSES: Record<ReceivableKind, ReceivableStatus[]> = {
  letting_fee: ['due', 'chased', 'paid'],
  incentive: ['to_claim', 'submitted', 'chased', 'paid', 'declined'],
};
export const LANDLORD = 'Landlord';

const pence = (n: number) => Math.round(n * 100) / 100;
const dayNumber = (iso: string) => Math.round(new Date(`${iso}T12:00:00`).getTime() / 86_400_000);

// ── Working out a fee from the rent ────────────────────────────────

export const BASIS_LABEL: Record<FeeBasis, string> = { fixed: '£ amount', percent: '% of rent', weeks: 'Weeks of rent' };

/** A week's rent from a monthly one: pcm × 12 ÷ 52. */
export const weeklyRent = (pcm: number) => (pcm * 12) / 52;

/** The fee: a set amount, a percentage of a month's rent, or a number of weeks' rent. Null when the rent it needs is not known. */
export function feeFrom(basis: FeeBasis, rate: number | null | undefined, rentPcm: number | null | undefined): number | null {
  if (rate == null || !Number.isFinite(rate) || rate < 0) return null;
  if (basis === 'fixed') return pence(rate);
  if (rentPcm == null || !Number.isFinite(rentPcm) || rentPcm <= 0) return null;
  return pence(basis === 'percent' ? (rentPcm * rate) / 100 : weeklyRent(rentPcm) * rate);
}

const plain = (n: number) => String(pence(n));

/** "1 week's rent", "2 weeks' rent", "50% of a month's rent", "£300" */
export function basisRule(basis: FeeBasis, rate: number): string {
  if (basis === 'percent') return `${plain(rate)}% of a month's rent`;
  if (basis === 'weeks') return rate === 1 ? '1 week\'s rent' : `${plain(rate)} weeks' rent`;
  return moneyFee(rate);
}

/** "1 week's rent at £1,250 pcm" for a fee worked out from the rent; null for one typed in. */
export function basisWords(r: Pick<Partial<Receivable>, 'fee_basis' | 'fee_rate' | 'rent_pcm'>): string | null {
  if (!r.fee_basis || r.fee_basis === 'fixed' || r.fee_rate == null) return null;
  return `${basisRule(r.fee_basis, r.fee_rate)}${r.rent_pcm ? ` at ${money(r.rent_pcm)} pcm` : ''}`;
}

/** A provider's usual letting fee: worked out from the rent, or a set amount; null when it has none. */
export function usualFee(rules: ProviderRules | null | undefined): { basis: FeeBasis; rate: number } | null {
  if (!rules) return null;
  if ((rules.fee_basis === 'percent' || rules.fee_basis === 'weeks') && rules.fee_rate) return { basis: rules.fee_basis, rate: rules.fee_rate };
  if (rules.fee_amount) return { basis: 'fixed', rate: rules.fee_amount };
  return null;
}

/** "1 week's rent", "£300": a provider's usual fee in words, or null. */
export function usualFeeWords(rules: ProviderRules | null | undefined): string | null {
  const f = usualFee(rules);
  return f ? basisRule(f.basis, f.rate) : null;
}

type RentFields = Pick<Property, 'address_line' | 'postcode' | 'borough' | 'property_type' | 'bedrooms' | 'rent_pcm' | 'rent_text'> & Pick<Partial<Property>, 'lha_area'>;

/** A property's monthly rent: as listed, or worked out from a rent written as "1-Bed LHA". */
export function rentOf(p: RentFields | null | undefined): number | null {
  if (!p) return null;
  if (p.rent_pcm != null) return Number(p.rent_pcm);
  return lhaCheck({ ...p, lha_area: p.lha_area ?? null })?.rent ?? null;
}

// ── Due dates ──────────────────────────────────────────────────────

/** A date plus a rule. Months keep the day where they can: 31 January plus 1 month is the last day of February. */
export function addRule(dayIso: string, rule: Pick<DueRule, 'n' | 'unit'>): string {
  const [y, m, d] = dayIso.split('-').map(Number);
  if (rule.unit === 'months') {
    const target = new Date(y, m - 1 + rule.n, 1);
    const last = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
    return isoDay(new Date(target.getFullYear(), target.getMonth(), Math.min(d, last)));
  }
  return isoDay(new Date(y, m - 1, d + rule.n * (rule.unit === 'weeks' ? 7 : 1)));
}

/** "1 month after sign up", "7 days after the first month's rent is paid", "when the first month's rent is paid" */
export function ruleWords(r: DueRule): string {
  const gap = `${r.n} ${r.n === 1 ? r.unit.slice(0, -1) : r.unit}`;
  if (r.from === 'first_rent') return r.n === 0 ? 'when the first month\'s rent is paid' : `${gap} after the first month's rent is paid`;
  return r.n === 0 ? 'on sign up' : `${gap} after sign up`;
}

/** The rule that applies: the provider's own for a letting fee, else the team's standard. */
export function dueRuleFor(kind: ReceivableKind, provider?: Pick<Provider, 'rules'> | null): DueRule {
  const s = activeSettings();
  if (kind === 'incentive') return s.incentiveDue;
  return provider?.rules?.fee_due ?? s.feeDue;
}

/** When the client's first month's rent is expected: the team's usual gap after sign up. */
export const firstRentExpected = (signUpOn: string | null | undefined) =>
  (signUpOn ? addRule(signUpOn, activeSettings().firstRentExpected) : null);

/** How long after `from` it falls due: the payer's own rule if it counts from the same thing, else a standard. */
export function gapFor(kind: ReceivableKind, from: DueFrom, provider?: Pick<Provider, 'rules'> | null): DueRule {
  const rule = dueRuleFor(kind, provider);
  if ((rule.from ?? 'sign_up') === from) return rule;
  if (from === 'first_rent') return { n: 0, unit: 'days', from };
  const team = kind === 'incentive' ? activeSettings().incentiveDue : activeSettings().feeDue;
  return (team.from ?? 'sign_up') === 'sign_up' ? team : { n: 1, unit: 'months', from: 'sign_up' };
}

type DueFields = Pick<Receivable, 'kind' | 'sign_up_on'> & Pick<Partial<Receivable>, 'due_after' | 'first_rent_due_on' | 'first_rent_paid_on'>;

/** When it falls due: counted from sign up, or for a fee that waits for the first month's rent, from the day that is paid (or expected). */
export function dueOn(r: DueFields, provider?: Pick<Provider, 'rules'> | null): string | null {
  const from = r.due_after ?? 'sign_up';
  const gap = gapFor(r.kind, from, provider);
  if (from === 'first_rent') {
    const base = r.first_rent_paid_on ?? r.first_rent_due_on ?? firstRentExpected(r.sign_up_on);
    return base ? addRule(base, gap) : null;
  }
  return r.sign_up_on ? addRule(r.sign_up_on, gap) : null;
}

/** When it falls due under the payer's rule, from the sign-up date; null without one. */
export function dueDate(kind: ReceivableKind, signUpOn: string | null, provider?: Pick<Provider, 'rules'> | null): string | null {
  return dueOn({ kind, sign_up_on: signUpOn, due_after: dueRuleFor(kind, provider).from ?? 'sign_up' }, provider);
}

// ── What is owed ───────────────────────────────────────────────────

export const isOpen = (r: Pick<Receivable, 'status'>) => r.status !== 'paid' && r.status !== 'declined';

type WaitFields = Pick<Receivable, 'status'> & Pick<Partial<Receivable>, 'due_after' | 'first_rent_paid_on' | 'first_rent_due_on'>;

/** Still owed, and waiting for the client's first month's rent, which is not in yet. Not overdue while it waits. */
export const awaitingFirstRent = (r: WaitFields) => isOpen(r) && r.due_after === 'first_rent' && !r.first_rent_paid_on;

/** Days past the date the first month's rent was expected, while it is still not marked paid; null otherwise. */
export function firstRentLate(r: WaitFields, today = todayIso()): number | null {
  if (!awaitingFirstRent(r) || !r.first_rent_due_on || r.first_rent_due_on >= today) return null;
  return dayNumber(today) - dayNumber(r.first_rent_due_on);
}

/** Days past its due date, for something still owed; null if it is not overdue (or still waits for the first rent). */
export function overdueDays(r: Pick<Receivable, 'status' | 'due_on'> & Pick<Partial<Receivable>, 'due_after' | 'first_rent_paid_on'>, today = todayIso()): number | null {
  if (!isOpen(r) || !r.due_on || r.due_on >= today || awaitingFirstRent(r)) return null;
  return dayNumber(today) - dayNumber(r.due_on);
}

/** Everything still owed, soonest due first (so overdue comes first); undated last. */
export function owed(list: Receivable[]): Receivable[] {
  return list.filter(isOpen).sort((a, b) => {
    if (!a.due_on !== !b.due_on) return a.due_on ? -1 : 1;
    return (a.due_on ?? '').localeCompare(b.due_on ?? '') || a.created_at.localeCompare(b.created_at);
  });
}

export interface MoneyTotals {
  owed: number; owedCount: number; overdue: number; overdueCount: number; soon: number; soonCount: number; paid30: number; unpriced: number;
  /** waiting for a first month's rent; checkRent of them should have had it by now */
  waiting: number; waitingCount: number; checkRent: number;
}

/** Totals for the top of the Finances page. "Soon" is due within 7 days; "unpriced" counts open items with no amount yet. */
export function totals(list: Receivable[], today = todayIso()): MoneyTotals {
  const t: MoneyTotals = { owed: 0, owedCount: 0, overdue: 0, overdueCount: 0, soon: 0, soonCount: 0, paid30: 0, unpriced: 0, waiting: 0, waitingCount: 0, checkRent: 0 };
  const week = isoDay(new Date(new Date(`${today}T12:00:00`).getTime() + 7 * 86_400_000));
  const monthAgo = isoDay(new Date(new Date(`${today}T12:00:00`).getTime() - 30 * 86_400_000));
  for (const r of list) {
    const amount = r.amount ?? 0;
    if (r.status === 'paid') { if ((r.paid_on ?? '') >= monthAgo) t.paid30 += amount; continue; }
    if (!isOpen(r)) continue;
    t.owed += amount; t.owedCount += 1;
    if (r.amount == null) t.unpriced += 1;
    if (awaitingFirstRent(r)) {
      t.waiting += amount; t.waitingCount += 1;
      if (firstRentLate(r, today) !== null) t.checkRent += 1;
    } else if (overdueDays(r, today) !== null) { t.overdue += amount; t.overdueCount += 1; }
    else if (r.due_on && r.due_on <= week) { t.soon += amount; t.soonCount += 1; }
  }
  return t;
}

const day = (iso: string) => shortDay(`${iso}T12:00:00`);

/** "Overdue 5 days", "Due today", "Due Thu 9 Oct", "Waiting for first rent, Fri 6 Nov", "No due date" */
export function dueWords(r: Pick<Receivable, 'status' | 'due_on'> & Pick<Partial<Receivable>, 'due_after' | 'first_rent_paid_on' | 'first_rent_due_on'>, today = todayIso()): string {
  if (awaitingFirstRent(r)) {
    if (!r.first_rent_due_on) return 'Waiting for first rent';
    return firstRentLate(r, today) !== null ? `Check first rent, expected ${day(r.first_rent_due_on)}` : `Waiting for first rent, ${day(r.first_rent_due_on)}`;
  }
  if (!r.due_on) return 'No due date';
  const late = overdueDays(r, today);
  if (late !== null) return `Overdue ${late} ${late === 1 ? 'day' : 'days'}`;
  return r.due_on === today ? 'Due today' : `Due ${day(r.due_on)}`;
}

export const amountWords = (r: Pick<Receivable, 'amount'>) => (r.amount == null ? 'Amount not set' : moneyFee(r.amount));

// ── New entries ────────────────────────────────────────────────────

export type ReceivableDraft = Omit<Receivable, 'id' | 'created_at' | 'updated_at' | 'created_by'> & { id?: string };

/** The letting fee for a placement: paid by the property's provider if it has one (at its usual fee, worked out from the rent
 *  if that is how they pay), else the landlord. A provider who pays once the first month's rent is in gets the date it is expected. */
export function lettingFeeFor(v: { applicantId: string; dealId: string | null; address: string | null; signUpOn: string | null; provider: Provider | null; rentPcm?: number | null }): ReceivableDraft {
  const fee = usualFee(v.provider?.rules);
  const from = dueRuleFor('letting_fee', v.provider).from ?? 'sign_up';
  const draft: ReceivableDraft = {
    kind: 'letting_fee', applicant_id: v.applicantId, deal_id: v.dealId, property_address: v.address,
    payer: v.provider ? v.provider.name : LANDLORD, provider_id: v.provider?.id ?? null,
    amount: fee ? feeFrom(fee.basis, fee.rate, v.rentPcm) : null, sign_up_on: v.signUpOn, due_on: null,
    claim_submitted_on: null, status: 'due', paid_on: null, notes: null,
    rent_pcm: v.rentPcm ?? null, fee_basis: fee?.basis ?? null, fee_rate: fee?.rate ?? null,
    due_after: from, first_rent_due_on: from === 'first_rent' ? firstRentExpected(v.signUpOn) : null, first_rent_paid_on: null,
  };
  return { ...draft, due_on: dueOn(draft, v.provider) };
}

/** Where a client was placed, for a new fee or incentive: the move-in (or the accepted offer), its provider and its rent. */
export function placementOf(applicantId: string, deals: Deal[], properties: Property[], providers: Provider[]) {
  const placed = deals.find((d) => d.applicant_id === applicantId && d.status === 'moved_in') ?? deals.find((d) => d.applicant_id === applicantId && d.status === 'accepted') ?? null;
  const property = placed ? (placed.property_id ? properties.find((p) => p.id === placed.property_id) : undefined) ?? properties.find((p) => p.address_line === placed.address) ?? null : null;
  return {
    placed,
    base: { applicantId, dealId: placed?.id ?? null, address: placed?.address ?? null, signUpOn: placed?.move_in_on ?? todayIso() },
    provider: property ? providerFor(property, providers) : null,
    rentPcm: rentOf(property),
  };
}

/** A council incentive for a placement, still to be claimed. */
export function incentiveFor(v: { applicantId: string; dealId: string | null; address: string | null; signUpOn: string | null; council: string | null }): ReceivableDraft {
  return {
    kind: 'incentive', applicant_id: v.applicantId, deal_id: v.dealId, property_address: v.address,
    payer: v.council ? `${v.council} council` : 'Council', provider_id: null, amount: null, sign_up_on: v.signUpOn,
    due_on: dueDate('incentive', v.signUpOn), claim_submitted_on: null, status: 'to_claim', paid_on: null, notes: null,
    due_after: 'sign_up',
  };
}

/** A line for the client's timeline: "Letting fee of £300 from Watermint, due 6 Nov". */
export function describe(r: Pick<Receivable, 'kind' | 'payer' | 'amount' | 'due_on'> & Pick<Partial<Receivable>, 'due_after' | 'first_rent_paid_on'>): string {
  const waits = r.due_after === 'first_rent' && !r.first_rent_paid_on;
  return `${KIND_LABEL[r.kind]}${r.amount != null ? ` of ${moneyFee(r.amount)}` : ''} from ${r.payer}${
    waits ? ', due once the first month\'s rent is paid' : r.due_on ? `, due ${day(r.due_on)}` : ''}`;
}

/** The WhatsApp message chasing a provider for a letting fee, from the team's wording. */
export function feeChaseText(r: Receivable, provider: Pick<Provider, 'name' | 'contact_first_name'>, client: Pick<Applicant, 'full_name'>, myName: string | null,
  template = activeSettings().feeChaseMessage): string {
  const vars: Record<string, string> = {
    provider_first_name: provider.contact_first_name?.trim() || provider.name,
    amount: r.amount != null ? moneyFee(r.amount) : 'the agreed amount',
    client_first_name: client.full_name.trim().split(/\s+/)[0] ?? '',
    property_address: r.property_address ?? 'the property',
    due_date: r.due_on ? day(r.due_on) : 'the agreed date',
    my_name: myName ?? '',
  };
  return template.replace(/\{([a-z_]+)\}/gi, (m, k: string) => vars[k.toLowerCase()] ?? m).trim();
}

// ── Potential: fees that could come in ─────────────────────────────

/** Every live step of a deal, earliest first: the whole pipeline, as counted in the ghost total. */
export const PIPELINE_STEPS: DealStatus[] = ['sent', 'interested', 'viewing', 'viewed', 'offered', 'accepted'];
/** How far a deal must have got to count as potential income: a viewing booked or further. Sent and interested are early. */
export const POTENTIAL_STEPS: DealStatus[] = ['viewing', 'viewed', 'offered', 'accepted'];
/** Sent or interested: in the ghost total, but not yet counted as potential. */
export const isEarly = (p: Pick<Potential, 'deal'>) => !POTENTIAL_STEPS.includes(p.deal.status);

export interface Potential {
  deal: Deal;
  property: Property | null;
  provider: Provider | null;
  payer: string;
  rent: number | null;
  basis: FeeBasis | null;
  rate: number | null;
  /** null when the fee is not known (no usual fee for the payer, or no rent to work it out from) */
  amount: number | null;
}

/**
 * The letting fees that could come in from clients going for a property, from
 * a property sent to them up to an offer accepted: each client counted once,
 * at their furthest deal (they only move in once), and each property once (it
 * only lets once). Deals that already have a fee on Finances are left out.
 * Furthest along first. Sent and interested ones are early (see isEarly).
 */
export function potentials(deals: Deal[], receivables: Array<Pick<Receivable, 'kind' | 'deal_id' | 'applicant_id' | 'status'>>, properties: Property[], providers: Provider[]): Potential[] {
  const billedDeals = new Set(receivables.filter((r) => r.kind === 'letting_fee' && r.deal_id).map((r) => r.deal_id));
  // a fee added by hand with no deal still means that client is placed
  const billedClients = new Set(receivables.filter((r) => r.kind === 'letting_fee' && !r.deal_id && isOpen(r)).map((r) => r.applicant_id));
  const step = (s: DealStatus) => PIPELINE_STEPS.indexOf(s);
  const live = deals
    .filter((d) => step(d.status) >= 0 && !billedDeals.has(d.id) && !billedClients.has(d.applicant_id))
    .sort((a, b) => step(b.status) - step(a.status) || b.updated_at.localeCompare(a.updated_at));
  const placeOf = (d: Pick<Deal, 'property_id' | 'address'>) => d.property_id ?? d.address.trim().toLowerCase();
  const clients = new Set<string>();
  const places = new Set<string>(deals.filter((d) => d.status === 'moved_in').map(placeOf)); // already let
  const out: Potential[] = [];
  for (const d of live) {
    const place = placeOf(d);
    if (clients.has(d.applicant_id) || places.has(place)) continue;
    clients.add(d.applicant_id);
    places.add(place);
    const property = (d.property_id ? properties.find((p) => p.id === d.property_id) : undefined) ?? properties.find((p) => p.address_line === d.address) ?? null;
    const provider = property ? providerFor(property, providers) : null;
    const rent = rentOf(property);
    const fee = usualFee(provider?.rules);
    out.push({
      deal: d, property, provider, payer: provider?.name ?? LANDLORD, rent,
      basis: fee?.basis ?? null, rate: fee?.rate ?? null, amount: fee ? feeFrom(fee.basis, fee.rate, rent) : null,
    });
  }
  return out;
}

export interface PotentialTotals {
  total: number; count: number; unpriced: number; likely: number; likelyCount: number;
  /** sent or interested: not counted in total, only in the ghost total */
  early: number; earlyCount: number;
}

/** The sum of potential fees (a viewing booked or further); "likely" is an offer made or accepted; early ones are kept apart. */
export function potentialTotals(list: Potential[]): PotentialTotals {
  const t: PotentialTotals = { total: 0, count: 0, unpriced: 0, likely: 0, likelyCount: 0, early: 0, earlyCount: 0 };
  for (const p of list) {
    if (isEarly(p)) { t.early += p.amount ?? 0; t.earlyCount += 1; continue; }
    t.count += 1;
    if (p.amount == null) t.unpriced += 1;
    t.total += p.amount ?? 0;
    if (p.deal.status === 'offered' || p.deal.status === 'accepted') { t.likely += p.amount ?? 0; t.likelyCount += 1; }
  }
  return t;
}

// ── Ghost total: the whole pipeline, as if it all came in ──────────

export interface GhostTotal {
  total: number;
  /** still owed for clients who have moved in (letting fees and incentives) */
  owed: number;
  /** offers made or accepted */
  likely: number;
  /** viewings booked or viewed */
  viewings: number;
  /** properties sent, or the client is interested */
  early: number;
  /** fees in the pipeline that cannot be worked out (no usual fee, or no rent), plus owed items with no amount */
  unknown: number;
}

/**
 * Everything that could come in if the whole pipeline came good: what is
 * owed now, plus a fee for every client going for a property. Not money in
 * the bank, which is why it is a "ghost": a headline for the size of the
 * pipeline. Paid money is not in it.
 */
export function ghostTotal(receivables: Receivable[], pipeline: Potential[], today = todayIso()): GhostTotal {
  const t = totals(receivables, today);
  const g: GhostTotal = { total: 0, owed: t.owed, likely: 0, viewings: 0, early: 0, unknown: t.unpriced };
  for (const p of pipeline) {
    if (p.amount == null) { g.unknown += 1; continue; }
    if (p.deal.status === 'offered' || p.deal.status === 'accepted') g.likely += p.amount;
    else if (p.deal.status === 'viewing' || p.deal.status === 'viewed') g.viewings += p.amount;
    else g.early += p.amount;
  }
  g.total = pence(g.owed + g.likely + g.viewings + g.early);
  return g;
}

// ── By month ───────────────────────────────────────────────────────

export interface MonthTotal { month: string; label: string; paid: number; owed: number; current: boolean }

const monthOf = (iso: string) => iso.slice(0, 7);
function shiftMonth(ym: string, n: number): string {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Paid in each month (by the day it was paid) and still owed (by the month it falls due), from `back` months ago to `ahead` months on. */
export function byMonth(list: Receivable[], today = todayIso(), back = 5, ahead = 2): MonthTotal[] {
  const now = monthOf(today);
  const months = Array.from({ length: back + ahead + 1 }, (_, i) => shiftMonth(now, i - back));
  const rows = new Map<string, MonthTotal>(months.map((m) => [m, { month: m, label: monthName(m, true), paid: 0, owed: 0, current: m === now }]));
  for (const r of list) {
    const amount = r.amount ?? 0;
    if (r.status === 'paid' && r.paid_on) { const row = rows.get(monthOf(r.paid_on)); if (row) row.paid += amount; }
    else if (isOpen(r) && r.due_on) { const row = rows.get(monthOf(r.due_on)); if (row) row.owed += amount; }
  }
  return months.map((m) => rows.get(m)!);
}

// ── Calendar ───────────────────────────────────────────────────────

export type MoneyEventKind = 'due' | 'first_rent' | 'paid';
export interface MoneyEvent { day: string; kind: MoneyEventKind; r: Receivable; late: boolean }

/** The dates that matter, soonest first: when each fee is due, when a first month's rent is expected, and when money came in. */
export function moneyEvents(list: Receivable[], today = todayIso()): MoneyEvent[] {
  const out: MoneyEvent[] = [];
  for (const r of list) {
    if (r.status === 'paid') { if (r.paid_on) out.push({ day: r.paid_on, kind: 'paid', r, late: false }); continue; }
    if (!isOpen(r)) continue;
    if (awaitingFirstRent(r) && r.first_rent_due_on) out.push({ day: r.first_rent_due_on, kind: 'first_rent', r, late: firstRentLate(r, today) !== null });
    if (r.due_on) out.push({ day: r.due_on, kind: 'due', r, late: overdueDays(r, today) !== null });
  }
  const order: Record<MoneyEventKind, number> = { first_rent: 0, due: 1, paid: 2 };
  return out.sort((a, b) => a.day.localeCompare(b.day) || order[a.kind] - order[b.kind]);
}

/** A month as calendar weeks, Monday first: each week is 7 days (YYYY-MM-DD), null outside the month. */
export function monthGrid(ym: string): Array<Array<string | null>> {
  const [y, m] = ym.split('-').map(Number);
  const days = new Date(y, m, 0).getDate();
  const lead = (new Date(y, m - 1, 1).getDay() + 6) % 7; // Monday = 0
  const cells: Array<string | null> = [...Array<null>(lead).fill(null), ...Array.from({ length: days }, (_, i) => `${ym}-${String(i + 1).padStart(2, '0')}`)];
  while (cells.length % 7) cells.push(null);
  return Array.from({ length: cells.length / 7 }, (_, w) => cells.slice(w * 7, w * 7 + 7));
}
export const nextMonth = (ym: string, n = 1) => shiftMonth(ym, n);

/** What a calendar entry says: "Letting fee £288.46 due from Watermint", "First rent due for Anna (Watermint fee follows)". */
export function eventTitle(e: MoneyEvent, clientFirstName: string | null): string {
  const who = clientFirstName ? ` (${clientFirstName})` : '';
  const amount = e.r.amount != null ? ` ${moneyFee(e.r.amount)}` : '';
  if (e.kind === 'first_rent') return `First month's rent due${who}: ${e.r.payer} fee follows`;
  if (e.kind === 'paid') return `${KIND_LABEL[e.r.kind]}${amount} paid by ${e.r.payer}${who}`;
  return `${KIND_LABEL[e.r.kind]}${amount} due from ${e.r.payer}${who}${awaitingFirstRent(e.r) ? ', once the first rent is in' : ''}`;
}

export interface CalendarEntry { uid: string; day: string; title: string; details: string }

/** Lines for a phone's calendar, from the dates still to come (and any late ones). */
export function calendarEntries(events: MoneyEvent[], firstNameOf: (applicantId: string) => string | null): CalendarEntry[] {
  return events.filter((e) => e.kind !== 'paid').map((e) => ({
    uid: `${e.r.id}-${e.kind}@keelcrm`,
    day: e.day,
    title: eventTitle(e, firstNameOf(e.r.applicant_id)),
    details: [e.r.property_address, e.kind === 'first_rent' ? 'Mark the first rent paid in Keel, Finances, and the fee falls due.' : e.r.invoice_number ? `Invoice ${e.r.invoice_number}` : null]
      .filter(Boolean).join('\n'),
  }));
}

const icsEscape = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const icsDay = (iso: string) => iso.replace(/-/g, '');

/** Long lines are folded at 75 bytes, as calendar files require. */
function fold(line: string): string {
  const enc = new TextEncoder();
  const parts: string[] = [];
  let cur = '';
  let bytes = 0;
  for (const ch of line) {
    const b = enc.encode(ch).length;
    if (bytes + b > (parts.length ? 74 : 75)) { parts.push(cur); cur = ''; bytes = 0; }
    cur += ch; bytes += b;
  }
  parts.push(cur);
  return parts.join('\r\n ');
}

/** A calendar file (.ics) of all-day entries, each with a reminder at 9am on the day. Opens in Apple, Google and Outlook calendars. */
export function icsFile(entries: CalendarEntry[], stamp = new Date()): string {
  const now = `${stamp.toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`;
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Keel Lettings//Keel CRM//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
  for (const e of entries) {
    lines.push(
      'BEGIN:VEVENT', `UID:${e.uid}`, `DTSTAMP:${now}`, `DTSTART;VALUE=DATE:${icsDay(e.day)}`, `DTEND;VALUE=DATE:${icsDay(addRule(e.day, { n: 1, unit: 'days' }))}`,
      `SUMMARY:${icsEscape(e.title)}`, ...(e.details ? [`DESCRIPTION:${icsEscape(e.details)}`] : []), 'TRANSP:TRANSPARENT',
      'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsEscape(e.title)}`, 'TRIGGER;RELATED=START:PT9H', 'END:VALARM', 'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return `${lines.map(fold).join('\r\n')}\r\n`;
}
