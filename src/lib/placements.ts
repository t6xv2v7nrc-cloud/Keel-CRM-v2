// Placements (Step 4 of the update brief): a placement is a client's moved-in deal, with what the money depends on.
// Councils pay whoever is on the paperwork, so every placement needs who invoices the council, whether the split is
// agreed in writing, and a link to that agreement. Amounts, invoice and paid dates are read from Finances
// (receivables), never typed twice.
//
// Flags:
//   red    an incentive with no split agreed in writing
//   amber  who invoices the council not set (with an incentive); split agreed but no link to it; no partner or share
//          on a mixed fee
//   grey   the Renters' Rights Act information sheet not recorded as given

import type { Deal, Provider, Receivable } from './types';
import { money, shortDate } from './format';
import { isOpen } from './money';

export type PlacementRoute = 'procurement' | 'officer' | 'self_referral';
export type FeeType = 'week_rent' | 'incentive' | 'mixed';
export type Invoicer = 'keel' | 'partner';

export const ROUTE_WORDS: Record<PlacementRoute, string> = { procurement: 'Procurement or landlord scheme', officer: 'Housing officer', self_referral: 'Self referral' };
export const FEE_TYPE_WORDS: Record<FeeType, string> = { week_rent: "A week's rent", incentive: 'Council incentive', mixed: 'Both' };
export const INVOICER_WORDS: Record<Invoicer, string> = { keel: 'Keel', partner: 'The partner' };

/** A row of placements (0001, with the 0021 columns undefined until it is run). */
export interface Placement {
  id: string;
  applicant_id: string;
  property_id: string | null;
  deal_id?: string | null;
  council: string | null;
  move_in_date: string | null;
  rent_pcm: number | null;
  route?: PlacementRoute | null;
  provider_id?: string | null;
  fee_type?: FeeType | null;
  keel_share_pct?: number | null;
  invoiced_by?: Invoicer | null;
  split_agreed_in_writing?: boolean;
  split_document_url?: string | null;
  renters_rights_sheet_on?: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface PlacementFlag { tone: 'red' | 'amber' | 'grey'; key: string; words: string }

export interface PlacementView {
  deal: Deal;
  placement: Placement | null;
  partner: Pick<Provider, 'id' | 'name'> | null;
  /** the incentive on Finances for this client and deal, if any */
  incentive: Receivable | null;
  /** the letting fee on Finances, if any */
  fee: Receivable | null;
  /** Keel's part of the incentive, from its share */
  keelShare: number | null;
  /** fee plus Keel's part of the incentive (or the whole incentive when Keel invoices and no share is set) */
  keelIncome: number | null;
  flags: PlacementFlag[];
}

const belongs = (r: Receivable, d: Deal) => r.applicant_id === d.applicant_id && (r.deal_id === d.id || !r.deal_id);
const pick = (rs: Receivable[]) => rs.filter((r) => r.status !== 'declined').sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0))[0] ?? null;

/** One moved-in deal as a placement: its record (if any), the money on Finances, Keel's share and the flags. */
export function placementView(d: Deal, placement: Placement | null, receivables: Receivable[], providers: Array<Pick<Provider, 'id' | 'name'>>): PlacementView {
  const mine = receivables.filter((r) => belongs(r, d));
  const incentive = pick(mine.filter((r) => r.kind === 'incentive'));
  const fee = pick(mine.filter((r) => r.kind === 'letting_fee'));
  const partner = placement?.provider_id ? providers.find((p) => p.id === placement.provider_id) ?? null : null;
  const pct = placement?.keel_share_pct ?? null;
  const incentiveAmount = incentive?.amount ?? null;
  const keelShare = incentiveAmount !== null && pct !== null ? Math.round(incentiveAmount * pct) / 100
    : incentiveAmount !== null && placement?.invoiced_by === 'keel' && !partner ? incentiveAmount : null;
  const keelIncome = fee?.amount != null || keelShare !== null ? (fee?.amount ?? 0) + (keelShare ?? 0) : null;

  const flags: PlacementFlag[] = [];
  const hasIncentive = !!incentive || placement?.fee_type === 'incentive' || placement?.fee_type === 'mixed';
  if (hasIncentive && !placement?.split_agreed_in_writing) flags.push({ tone: 'red', key: 'no_written_split', words: 'Incentive with no split agreed in writing' });
  if (hasIncentive && !placement?.invoiced_by) flags.push({ tone: 'amber', key: 'who_invoices', words: 'Who invoices the council is not set' });
  if (placement?.split_agreed_in_writing && !placement.split_document_url?.trim()) flags.push({ tone: 'amber', key: 'no_document', words: 'Split agreed, but no link to the agreement' });
  if (placement?.fee_type === 'mixed' && (!partner || pct === null)) flags.push({ tone: 'amber', key: 'share_not_set', words: 'Both fee and incentive: set the partner and Keel\'s share' });
  if (!placement?.renters_rights_sheet_on) flags.push({ tone: 'grey', key: 'rra_sheet', words: "Renters' Rights information sheet not recorded" });
  return { deal: d, placement, partner, incentive, fee, keelShare, keelIncome, flags };
}

/** Every moved-in deal as a placement, newest move-in first. */
export function placementsFrom(deals: Deal[], placements: Placement[], receivables: Receivable[], providers: Array<Pick<Provider, 'id' | 'name'>>): PlacementView[] {
  return deals.filter((d) => d.status === 'moved_in')
    .map((d) => placementView(d, placements.find((p) => p.deal_id === d.id) ?? null, receivables, providers))
    .sort((a, b) => (b.deal.move_in_on ?? b.deal.updated_at).localeCompare(a.deal.move_in_on ?? a.deal.updated_at));
}

/** "£4,000 incentive, invoiced 3 Oct, paid 20 Oct" from what Finances holds. */
export function moneyLine(r: Receivable | null, what: string): string | null {
  if (!r) return null;
  return [
    `${r.amount != null ? money(r.amount) : 'Amount not set'} ${what}`,
    r.invoiced_on ? `invoiced ${shortDate(r.invoiced_on)}` : null,
    r.paid_on ? `paid ${shortDate(r.paid_on)}` : isOpen(r) ? 'not paid yet' : null,
  ].filter(Boolean).join(', ');
}
