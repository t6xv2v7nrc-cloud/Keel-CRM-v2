// Receivables: money owed to Keel for a placement. The letting fee (from a
// provider such as Watermint or Zuber, or the landlord) and any council
// incentive. The app calls this "Receivables"; files and the activity kind
// keep the name "money" they were built with.
//
// The due date is worked out from the sign-up date: a provider's own rule if
// it has one ("1 month after sign up"), otherwise the team's standard in
// Settings. It can always be changed by hand. Anything open and past its due
// date is overdue, so nothing is forgotten once a client has moved in.

import type { Applicant, DueRule, Provider, Receivable, ReceivableKind, ReceivableStatus } from './types';
import { activeSettings } from './settings';
import { isoDay, todayIso } from './calls';
import { money, shortDay } from './format';

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

// ── Due dates ──────────────────────────────────────────────────────

/** A date plus a rule. Months keep the day where they can: 31 January plus 1 month is the last day of February. */
export function addRule(dayIso: string, rule: DueRule): string {
  const [y, m, d] = dayIso.split('-').map(Number);
  if (rule.unit === 'months') {
    const target = new Date(y, m - 1 + rule.n, 1);
    const last = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
    return isoDay(new Date(target.getFullYear(), target.getMonth(), Math.min(d, last)));
  }
  return isoDay(new Date(y, m - 1, d + rule.n * (rule.unit === 'weeks' ? 7 : 1)));
}

/** "1 month after sign up", "6 weeks after sign up" */
export const ruleWords = (r: DueRule) => `${r.n} ${r.n === 1 ? r.unit.slice(0, -1) : r.unit} after sign up`;

/** The rule that applies: the provider's own for a letting fee, else the team's standard. */
export function dueRuleFor(kind: ReceivableKind, provider?: Pick<Provider, 'rules'> | null): DueRule {
  const s = activeSettings();
  if (kind === 'incentive') return s.incentiveDue;
  return provider?.rules?.fee_due ?? s.feeDue;
}

/** When it falls due, from the sign-up date; null without one. */
export function dueDate(kind: ReceivableKind, signUpOn: string | null, provider?: Pick<Provider, 'rules'> | null): string | null {
  return signUpOn ? addRule(signUpOn, dueRuleFor(kind, provider)) : null;
}

// ── What is owed ───────────────────────────────────────────────────

export const isOpen = (r: Pick<Receivable, 'status'>) => r.status !== 'paid' && r.status !== 'declined';

const dayNumber = (iso: string) => Math.round(new Date(`${iso}T12:00:00`).getTime() / 86_400_000);

/** Days past its due date, for something still owed; null if it is not overdue. */
export function overdueDays(r: Pick<Receivable, 'status' | 'due_on'>, today = todayIso()): number | null {
  if (!isOpen(r) || !r.due_on || r.due_on >= today) return null;
  return dayNumber(today) - dayNumber(r.due_on);
}

/** Everything still owed, soonest due first (so overdue comes first); undated last. */
export function owed(list: Receivable[]): Receivable[] {
  return list.filter(isOpen).sort((a, b) => {
    if (!a.due_on !== !b.due_on) return a.due_on ? -1 : 1;
    return (a.due_on ?? '').localeCompare(b.due_on ?? '') || a.created_at.localeCompare(b.created_at);
  });
}

export interface MoneyTotals { owed: number; owedCount: number; overdue: number; overdueCount: number; soon: number; soonCount: number; paid30: number; unpriced: number }

/** Totals for the top of the Money page. "Soon" is due within 7 days; "unpriced" counts open items with no amount yet. */
export function totals(list: Receivable[], today = todayIso()): MoneyTotals {
  const t: MoneyTotals = { owed: 0, owedCount: 0, overdue: 0, overdueCount: 0, soon: 0, soonCount: 0, paid30: 0, unpriced: 0 };
  const week = isoDay(new Date(new Date(`${today}T12:00:00`).getTime() + 7 * 86_400_000));
  const monthAgo = isoDay(new Date(new Date(`${today}T12:00:00`).getTime() - 30 * 86_400_000));
  for (const r of list) {
    const amount = r.amount ?? 0;
    if (r.status === 'paid') { if ((r.paid_on ?? '') >= monthAgo) t.paid30 += amount; continue; }
    if (!isOpen(r)) continue;
    t.owed += amount; t.owedCount += 1;
    if (r.amount == null) t.unpriced += 1;
    if (overdueDays(r, today) !== null) { t.overdue += amount; t.overdueCount += 1; }
    else if (r.due_on && r.due_on <= week) { t.soon += amount; t.soonCount += 1; }
  }
  return t;
}

/** "Overdue 5 days", "Due today", "Due Thu 9 Oct", "No due date" */
export function dueWords(r: Pick<Receivable, 'status' | 'due_on'>, today = todayIso()): string {
  if (!r.due_on) return 'No due date';
  const late = overdueDays(r, today);
  if (late !== null) return `Overdue ${late} ${late === 1 ? 'day' : 'days'}`;
  return r.due_on === today ? 'Due today' : `Due ${shortDay(`${r.due_on}T12:00:00`)}`;
}

export const amountWords = (r: Pick<Receivable, 'amount'>) => (r.amount == null ? 'Amount not set' : money(r.amount));

// ── New entries ────────────────────────────────────────────────────

export type ReceivableDraft = Omit<Receivable, 'id' | 'created_at' | 'updated_at' | 'created_by'> & { id?: string };

/** The letting fee for a placement: paid by the property's provider if it has one (at its usual fee), else the landlord. */
export function lettingFeeFor(v: { applicantId: string; dealId: string | null; address: string | null; signUpOn: string | null; provider: Provider | null }): ReceivableDraft {
  return {
    kind: 'letting_fee', applicant_id: v.applicantId, deal_id: v.dealId, property_address: v.address,
    payer: v.provider ? v.provider.name : LANDLORD, provider_id: v.provider?.id ?? null,
    amount: v.provider?.rules?.fee_amount ?? null, sign_up_on: v.signUpOn, due_on: dueDate('letting_fee', v.signUpOn, v.provider),
    claim_submitted_on: null, status: 'due', paid_on: null, notes: null,
  };
}

/** A council incentive for a placement, still to be claimed. */
export function incentiveFor(v: { applicantId: string; dealId: string | null; address: string | null; signUpOn: string | null; council: string | null }): ReceivableDraft {
  return {
    kind: 'incentive', applicant_id: v.applicantId, deal_id: v.dealId, property_address: v.address,
    payer: v.council ? `${v.council} council` : 'Council', provider_id: null, amount: null, sign_up_on: v.signUpOn,
    due_on: dueDate('incentive', v.signUpOn), claim_submitted_on: null, status: 'to_claim', paid_on: null, notes: null,
  };
}

/** A line for the client's timeline: "Letting fee of £300 from Watermint, due 6 Nov". */
export function describe(r: Pick<Receivable, 'kind' | 'payer' | 'amount' | 'due_on'>): string {
  return `${KIND_LABEL[r.kind]}${r.amount != null ? ` of ${money(r.amount)}` : ''} from ${r.payer}${r.due_on ? `, due ${shortDay(`${r.due_on}T12:00:00`)}` : ''}`;
}

/** The WhatsApp message chasing a provider for a letting fee, from the team's wording. */
export function feeChaseText(r: Receivable, provider: Pick<Provider, 'name' | 'contact_first_name'>, client: Pick<Applicant, 'full_name'>, myName: string | null,
  template = activeSettings().feeChaseMessage): string {
  const vars: Record<string, string> = {
    provider_first_name: provider.contact_first_name?.trim() || provider.name,
    amount: r.amount != null ? money(r.amount) : 'the agreed amount',
    client_first_name: client.full_name.trim().split(/\s+/)[0] ?? '',
    property_address: r.property_address ?? 'the property',
    due_date: r.due_on ? shortDay(`${r.due_on}T12:00:00`) : 'the agreed date',
    my_name: myName ?? '',
  };
  return template.replace(/\{([a-z_]+)\}/gi, (m, k: string) => vars[k.toLowerCase()] ?? m).trim();
}
